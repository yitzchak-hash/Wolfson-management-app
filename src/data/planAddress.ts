/**
 * Reading the job's ADDRESS and PHONE NUMBER off the plan itself.
 *
 * Every consultant sheet carries both in its title block, and the secretary
 * was retyping them. This reads the plan's own TEXT LAYER with pdf.js —
 * entirely local, in the browser, no service and nothing to install — finds
 * the line that looks like an address (and the one that looks like a phone
 * number), and renders a CUTOUT image of that part of the sheet big enough to
 * read, so a person confirms against the drawing before anything is written.
 * A scanned plan has no text layer; that is reported honestly rather than
 * guessed at.
 *
 * Hebrew arrives from PDF text layers in every order there is: logical,
 * visual (each run's characters stored right-to-left), and mixtures. Reading
 * it one way — which is what the first version did — is where the "a lot of
 * times it reads the Hebrew very gibberish" report came from. Every Hebrew
 * line is therefore tried in BOTH character orders and both run orders, and
 * the variant that actually matches an address or phone pattern is the one
 * believed; digit and Latin runs are kept forwards when a string is flipped,
 * or "12" becomes "21" in the one field where that matters.
 *
 * pdf.js is imported lazily (the planAspect idiom): suggesting an address
 * must never add a megabyte of PDF engine to the main bundle.
 */
import { fetchPlanBytes } from './driveApi';

export interface PlanAddressResult {
  /** Best-effort text of the address line. The cutout is the ground truth. */
  address?: string;
  /** PNG data URL of the region around it, rendered large enough to read. */
  cutout?: string;
  /** Best-effort phone number found on the sheet. */
  phone?: string;
  /** PNG data URL of the region the phone was read from. */
  phoneCutout?: string;
  problem?: 'no-text' | 'no-address' | 'unreachable';
}

interface Line {
  text: string;
  hebrew: boolean;
  x1: number; y1: number; x2: number; y2: number;
  parts: { x: number; str: string }[];
}

const LABEL = /(כתובת|address)/i;
const STREET = /(רח'|רחוב|שד'|שדרות|דרך|סמט|\bst\.?\b|\bstreet\b|\bave(nue)?\b|\brd\.?\b|\broad\b|\bblvd\b)/i;
const HEB = /[֐-׿]/;
/** An Israeli (or international) phone number as it is printed on a sheet. */
const PHONE = /(?:\+\s?972[-\s.]?\(?0?\)?[-\s.]?|0)(?:[23489]|5\d|7[2-9])[-\s.]?\d{3}[-\s.]?\d{4}\b/;
const PHONE_LABEL = /(טלפון|טל'?|נייד|פלאפון|סלולרי|\bphone\b|\btel\.?\b|\bmobile\b|\bcell\b)/i;
const FAX = /(פקס|\bfax\b)/i;

/**
 * TzviAir's OWN numbers, never a suggestion. The consultant's title block
 * usually carries the company's phone right beside the customer's, and the
 * reader kept offering the office back to itself ("it recognizes our office
 * number — that's a problem"). Compared digit-for-digit after normalising,
 * so 02-628-8282, (02) 6288282 and +972-2-6288282 are all the same number.
 */
const OWN_NUMBERS = new Set(['026288282']);

/** A printed number reduced to bare local digits for comparison. */
export function normalizePhoneDigits(s: string): string {
  let d = s.replace(/[^\d+]/g, '');
  if (d.startsWith('+972')) d = '0' + d.slice(4).replace(/^0/, '');
  else if (d.startsWith('972')) d = '0' + d.slice(3).replace(/^0/, '');
  return d.replace(/[^\d]/g, '');
}

/** Strip the label word itself, so "כתובת: הרצל 12" suggests "הרצל 12". */
function stripLabel(text: string): string {
  return text.replace(/.*?(כתובת|address)\s*[:\-–]?\s*/i, '').trim();
}

/**
 * Flip a visually-stored string back to logical order: reverse the whole
 * thing, then un-reverse every run of digits or Latin — numbers and English
 * words are stored forwards even inside a visual Hebrew line.
 */
export function fixVisual(s: string): string {
  const flipped = [...s].reverse().join('');
  return flipped.replace(/[0-9A-Za-z][0-9A-Za-z ./-]*[0-9A-Za-z]|[0-9A-Za-z]/g,
    run => [...run].reverse().join(''));
}

/**
 * Every plausible reading of a line. A Hebrew line is offered in both run
 * orders and both character orders; whichever variant matches the pattern
 * being hunted is the one used, so a sheet whose text layer is stored
 * visually still reads out as words rather than gibberish.
 */
function variantsOf(l: Line): string[] {
  const rtl = [...l.parts].sort((a, b) => b.x - a.x).map(p => p.str).join(' ').replace(/\s+/g, ' ').trim();
  if (!l.hebrew) return [rtl];
  const ltr = [...l.parts].sort((a, b) => a.x - b.x).map(p => p.str).join(' ').replace(/\s+/g, ' ').trim();
  const out = [rtl, ltr, fixVisual(ltr), fixVisual(rtl)];
  return [...new Set(out.filter(Boolean))];
}

/** The share of a string that is digits — an "address" that is mostly digits is a number, not a street. */
function digitShare(s: string): number {
  const chars = s.replace(/\s/g, '');
  if (!chars.length) return 0;
  return (chars.match(/\d/g)?.length ?? 0) / chars.length;
}

const cache = new Map<string, PlanAddressResult>();
const inFlight = new Map<string, Promise<PlanAddressResult>>();

export function readPlanAddress(fileId: string): Promise<PlanAddressResult> {
  const hit = cache.get(fileId);
  if (hit) return Promise.resolve(hit);
  const going = inFlight.get(fileId);
  if (going) return going;
  const p = readNow(fileId)
    .then(r => { cache.set(fileId, r); return r; })
    .catch(() => ({ problem: 'unreachable' as const }))
    .finally(() => inFlight.delete(fileId));
  inFlight.set(fileId, p);
  return p;
}

async function readNow(fileId: string): Promise<PlanAddressResult> {
  let bytes: ArrayBuffer;
  try {
    bytes = await fetchPlanBytes(fileId);
  } catch {
    return { problem: 'unreachable' };
  }

  await import('../components/plans/pdfCompat');   // shims must land before pdf.js
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const items = (content.items as {
      str: string; transform: number[]; width: number; height: number;
    }[]).filter(it => it.str && it.str.trim());

    // A scan has no text layer — a handful of stray marks is the same thing.
    if (items.length < 5) return { problem: 'no-text' };

    /**
     * Rebuild LINES from positioned glyph runs: group by baseline y (within
     * most of a line height), then keep the runs with their x positions so
     * both joining orders stay available. The cutout is still what the
     * secretary trusts; the text is the convenience.
     */
    const runs = items.map(it => ({
      str: it.str.trim(),
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      h: Math.abs(it.height || Math.hypot(it.transform[2], it.transform[3])) || 8,
    }));
    runs.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: Line[] = [];
    for (const r of runs) {
      const line = lines.find(l => Math.abs(l.y1 - r.y) < Math.max(3, r.h * 0.7));
      if (line) {
        line.x1 = Math.min(line.x1, r.x); line.x2 = Math.max(line.x2, r.x + r.w);
        line.y2 = Math.max(line.y2, r.y + r.h);
        line.parts.push({ x: r.x, str: r.str });
      } else {
        lines.push({
          text: '', hebrew: false, x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y + r.h,
          parts: [{ x: r.x, str: r.str }],
        });
      }
    }
    for (const l of lines) {
      l.hebrew = l.parts.some(p => HEB.test(p.str));
      // The default reading — right-to-left for a Hebrew line, as before.
      l.parts.sort((a, b) => (l.hebrew ? b.x - a.x : a.x - b.x));
      l.text = l.parts.map(p => p.str).join(' ').replace(/\s+/g, ' ').trim();
    }

    const view = page.getViewport({ scale: 1 });
    const pageH = view.viewBox[3] - view.viewBox[1];
    /** Title blocks live low on the sheet; PDF y grows upward. */
    const titleBlockBonus = (l: Line) => (l.y1 < pageH / 3 ? 10 : 0);

    // ── The ADDRESS ─────────────────────────────────────────────────────────
    let bestAddr: { line: Line; extra?: Line; text: string; score: number } | null = null;
    lines.forEach((l, i) => {
      // A phone or fax line is never an address, however address-shaped its
      // digits look — this was "it's pulling it from the phone number".
      if (PHONE_LABEL.test(l.text) || FAX.test(l.text)) return;
      let score = 0;
      let text = '';
      let extra: Line | undefined;
      for (const v of variantsOf(l)) {
        if (LABEL.test(v)) {
          const stripped = stripLabel(v);
          if (100 > score) { score = 100; text = stripped; }
          if (stripped.length < 3) {
            // "כתובת:" alone — the value sits on the neighbouring line.
            const next = lines[i + 1];
            if (next && Math.abs(next.y1 - l.y1) < (l.y2 - l.y1) * 3
                && !PHONE_LABEL.test(next.text) && !PHONE.test(next.text)) {
              const nv = variantsOf(next);
              text = (nv.find(x => STREET.test(x)) ?? nv[0]) ?? '';
              extra = next;
            }
          }
        } else if (STREET.test(v) && /\d/.test(v) && 60 > score) {
          score = 60; text = v;
        }
      }
      if (!score) return;
      const clean = text.replace(/\s+/g, ' ').trim();
      if (clean.length < 3 || clean.length > 90) return;
      // Mostly digits is a number wearing a street word, not an address.
      if (digitShare(clean) > 0.55 || PHONE.test(clean)) return;
      score += titleBlockBonus(l);
      if (!bestAddr || score > bestAddr.score) bestAddr = { line: l, extra, text: clean, score };
    });

    // ── The PHONE ───────────────────────────────────────────────────────────
    let bestPhone: { line: Line; text: string; score: number } | null = null;
    lines.forEach(l => {
      if (FAX.test(l.text)) return;
      for (const v of variantsOf(l)) {
        // EVERY number on the line, not just the first: a title-block line
        // often prints the office number right before the customer's, and
        // stopping at the first match handed back our own number.
        const all = v.match(new RegExp(PHONE.source, 'g')) ?? [];
        let hitAny = false;
        for (const raw of all) {
          if (OWN_NUMBERS.has(normalizePhoneDigits(raw))) continue;   // the office calling itself
          hitAny = true;
          let score = 50;
          if (PHONE_LABEL.test(v)) score += 50;
          // A mobile is almost always the CUSTOMER — the office and the
          // consultant print landlines.
          if (normalizePhoneDigits(raw).startsWith('05')) score += 15;
          score += titleBlockBonus(l);
          if (!bestPhone || score > bestPhone.score) bestPhone = { line: l, text: raw.trim(), score };
        }
        if (hitAny) break;
      }
    });

    /**
     * The cutout: the found line with generous surroundings, rendered at a
     * scale that makes the words genuinely readable — never a thumbnail of
     * the whole sheet.
     */
    const cutoutOf = async (line: Line, extra?: Line): Promise<string | undefined> => {
      const rx1 = Math.min(line.x1, extra?.x1 ?? line.x1);
      const rx2 = Math.max(line.x2, extra?.x2 ?? line.x2);
      const ry1 = Math.min(line.y1, extra?.y1 ?? line.y1);
      const ry2 = Math.max(line.y2, extra?.y2 ?? line.y2);
      const lineH = Math.max(8, ry2 - ry1);
      const [px1, py1, px2, py2] = view.viewBox;
      const cx1 = Math.max(px1, rx1 - Math.max(30, (rx2 - rx1) * 0.25));
      const cx2 = Math.min(px2, rx2 + Math.max(30, (rx2 - rx1) * 0.25));
      const cy1 = Math.max(py1, ry1 - lineH * 2.5);
      const cy2 = Math.min(py2, ry2 + lineH * 2.5);

      let scale = Math.min(8, Math.max(2, 1000 / Math.max(1, cx2 - cx1)));
      // A refused canvas is a blank cutout — cap the AREA, not just the scale.
      const MAX_AREA = 4_000_000;
      if ((cx2 - cx1) * (cy2 - cy1) * scale * scale > MAX_AREA) {
        scale = Math.sqrt(MAX_AREA / ((cx2 - cx1) * (cy2 - cy1)));
      }
      const vp = page.getViewport({ scale });
      const [vx1, vy1a, vx2, vy2a] = vp.convertToViewportRectangle([cx1, cy1, cx2, cy2]);
      const left = Math.min(vx1, vx2), top = Math.min(vy1a, vy2a);
      const w = Math.abs(vx2 - vx1), h = Math.abs(vy2a - vy1a);

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvasContext: ctx,
        viewport: vp,
        // Device-space shift so the crop lands at the canvas origin — the
        // standard pdf.js crop trick; a full-page render at this scale could be
        // a canvas the browser refuses.
        transform: [1, 0, 0, 1, -left, -top],
      } as never).promise;
      return canvas.toDataURL('image/png');
    };

    if (!bestAddr && !bestPhone) return { problem: 'no-address' };
    const out: PlanAddressResult = {};
    const ba = bestAddr as { line: Line; extra?: Line; text: string } | null;
    const bp = bestPhone as { line: Line; text: string } | null;
    if (ba) {
      out.address = ba.text;
      out.cutout = await cutoutOf(ba.line, ba.extra).catch(() => undefined);
    }
    if (bp) {
      out.phone = bp.text;
      out.phoneCutout = await cutoutOf(bp.line).catch(() => undefined);
    }
    return out;
  } finally {
    void doc.destroy().catch(() => {});
  }
}
