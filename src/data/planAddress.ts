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
  parts: { x: number; str: string; w?: number }[];
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
const OWN_NUMBERS = new Set(['026288282', '037208000']);

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
  /**
   * PLAIN full reversal, beside fixVisual — and deliberately AHEAD of it.
   *
   * pdf.js runs its own bidi over every text item: on a visually-stored
   * Hebrew line it hands back the Hebrew still reversed but the DIGIT runs
   * already flipped ("מגיני הגוש 48" arrives as "84 שוגה יניגמ"). Undoing
   * that is a bare character reversal; fixVisual's digit re-reverse — right
   * for a raw visual layer — turns the house number into its mirror ("84").
   * The two recoveries tie on every quality signal, so list order decides,
   * and the pdf.js-shaped one is what the reader actually receives.
   */
  const flip = (s: string) => [...s].reverse().join('');
  const out = [rtl, ltr, flip(ltr), fixVisual(ltr), flip(rtl), fixVisual(rtl)];
  return [...new Set(out.filter(Boolean))];
}

/** The share of a string that is digits — an "address" that is mostly digits is a number, not a street. */
function digitShare(s: string): number {
  const chars = s.replace(/\s/g, '');
  if (!chars.length) return 0;
  return (chars.match(/\d/g)?.length ?? 0) / chars.length;
}

/**
 * Does this read like Hebrew the right way round?
 *
 * Final letters (ך ם ן ף ץ) are the giveaway: real Hebrew carries them at
 * word ENDS; a reversed line carries them at word STARTS or mid-word. A line
 * like "מגיני הגוש 48" has no finals at all, which is why this is a SCORE the
 * variants compete on rather than a yes/no — the reversed junk in the same
 * set usually loses points even when the right answer earns none.
 */
export function hebrewQuality(s: string): number {
  let q = 0;
  for (const w of s.split(/\s+/)) {
    const core = w.replace(/[^֐-׿]/g, '');
    if (!core) continue;
    if (/[םןץףך]$/.test(core)) q += 2;
    if (/^[םןץףך]/.test(core)) q -= 3;
    if (core.length > 2 && /[םןץףך]/.test(core.slice(1, -1))) q -= 2;
  }
  return q;
}

/**
 * The most Hebrew-plausible reading of a line. Street words help; and in a
 * Hebrew address the house NUMBER comes last — "מגיני הגוש 48" — so digits
 * trailing earn a point and digits leading lose one, which is what separates
 * the right reading from its mirror when neither carries a final letter.
 */
function pickReading(vs: string[]): string {
  let best = vs[0] ?? '';
  let bq = -Infinity;
  for (const v of vs) {
    const q = hebrewQuality(v)
      + (STREET.test(v) ? 3 : 0)
      + (HEB.test(v) && /\d\s*$/.test(v) ? 1 : 0)
      - (HEB.test(v) && /^\s*\d/.test(v) ? 1 : 0);
    if (q > bq) { bq = q; best = v; }
  }
  return best;
}

/**
 * Only the parts of a line that sit in the LABEL'S OWN COLUMN.
 *
 * A "line" here is a y-band across the WHOLE sheet, so the band level with a
 * title-block value can pick up dimension text from the middle of the floor
 * plan — which is exactly the Miller gibberish: the address came back with
 * half the drawing's annotations glued on. The value under a label lives in
 * the label's column; everything else in the band is scenery.
 */
function columnLine(label: Line, band: Line): Line {
  const cx = (label.x1 + label.x2) / 2;
  const halfW = Math.max(160, (label.x2 - label.x1) * 3);
  const parts = band.parts.filter(pt => Math.abs(pt.x - cx) < halfW);
  if (!parts.length || parts.length === band.parts.length) return band;
  return { ...band, parts };
}

/**
 * A UNIT label wearing an address's clothes: "בניין 2 דירה 5", "קומה 3" —
 * building/apartment/floor words plus digits and nothing else. That is which
 * unit the sheet describes, not where the building stands, and offering it
 * back as the address was the owner's Shwartz screenshot. A real address that
 * merely ENDS in "דירה 5" survives — the street part is the something-else.
 */
const UNIT_WORDS = /(בניין|בנין|מבנה|דירה|קומה|מגרש|יחידה|כניסה|building|bldg|apt|apartment|floor|unit)/i;
function unitLabelOnly(s: string): boolean {
  if (!UNIT_WORDS.test(s)) return false;
  // A fresh global copy per call — a shared /g regex's lastIndex is state,
  // and a stateful test() answers wrongly every second time.
  const rest = s.replace(new RegExp(UNIT_WORDS.source, 'gi'), ' ')
    .replace(/[\d\s.,:/\-–—']+/g, ' ').trim();
  return rest.length < 2;
}

/** A believable address VALUE: carries a number, a street word, or at least
 *  two real Hebrew words. Anything less is scenery, and silence beats junk. */
function plausibleAddress(s: string): boolean {
  if (unitLabelOnly(s)) return false;
  if (/\d/.test(s) || STREET.test(s)) return true;
  return s.split(/\s+/).filter(w => w.replace(/[^֐-׿]/g, '').length >= 2).length >= 2;
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
        line.parts.push({ x: r.x, str: r.str, w: r.w });
      } else {
        lines.push({
          text: '', hebrew: false, x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y + r.h,
          parts: [{ x: r.x, str: r.str, w: r.w }],
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
          if (score < 100) { score = 100; text = stripped; }
          // Several variants can carry the label; keep the value that reads
          // most like real Hebrew rather than the first one that turned up.
          else if (stripped.length >= 3 && hebrewQuality(stripped) > hebrewQuality(text)) text = stripped;
          if (stripped.length < 3) {
            // "כתובת:" alone — the value sits on the neighbouring line.
            const next = lines[i + 1];
            if (next && Math.abs(next.y1 - l.y1) < (l.y2 - l.y1) * 3
                && !PHONE_LABEL.test(next.text) && !PHONE.test(next.text)) {
              // Only the label's own column of that band, read in the most
              // Hebrew-plausible order — and if what is there does not look
              // like an address at all, say nothing rather than gibberish.
              const sub = columnLine(l, next);
              const read = pickReading(variantsOf(sub));
              text = plausibleAddress(read) ? read : '';
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
      // Mostly digits is a number wearing a street word, not an address —
      // and "בניין 2 דירה 5" is the UNIT, not the street.
      if (digitShare(clean) > 0.55 || PHONE.test(clean) || unitLabelOnly(clean)) return;
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
      let rx1 = Math.min(line.x1, extra?.x1 ?? line.x1);
      let rx2 = Math.max(line.x2, extra?.x2 ?? line.x2);
      const ry1 = Math.min(line.y1, extra?.y1 ?? line.y1);
      const ry2 = Math.max(line.y2, extra?.y2 ?? line.y2);
      const lineH = Math.max(8, ry2 - ry1);
      /**
       * TIGHT, never a strip of the whole sheet. A "line" is a y-band across
       * the page, so its box can span the full width with scenery in it —
       * which rendered as "a strip of the whole screen" (the owner). Crop to
       * the LABEL'S COLUMN when the band carries one (the value lives there),
       * and failing that cap the width around the band's middle.
       */
      const lp = [...line.parts, ...(extra?.parts ?? [])]
        .find(pt => LABEL.test(pt.str) || PHONE_LABEL.test(pt.str));
      if (lp) {
        const cx = lp.x + (lp.w ?? 40) / 2;
        rx1 = Math.max(rx1, cx - 240);
        rx2 = Math.min(rx2, cx + 240);
      }
      if (rx2 - rx1 > 520) {
        const mid = (rx1 + rx2) / 2;
        rx1 = mid - 260; rx2 = mid + 260;
      }
      const [px1, py1, px2, py2] = view.viewBox;
      const cx1 = Math.max(px1, rx1 - 24);
      const cx2 = Math.min(px2, rx2 + 24);
      const cy1 = Math.max(py1, ry1 - lineH * 1.4);
      const cy2 = Math.min(py2, ry2 + lineH * 1.4);

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

