/**
 * Reading the job's ADDRESS off the plan itself.
 *
 * Every consultant sheet carries the address in its title block, and the
 * secretary was retyping it. This reads the plan's own TEXT LAYER with pdf.js
 * — entirely local, in the browser, no service and nothing to install — finds
 * the line that looks like an address, and renders a CUTOUT image of that
 * part of the sheet big enough to read, so a person confirms against the
 * drawing before anything is written. A scanned plan has no text layer; that
 * is reported honestly rather than guessed at.
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
  problem?: 'no-text' | 'no-address' | 'unreachable';
}

interface Line {
  text: string;
  hebrew: boolean;
  x1: number; y1: number; x2: number; y2: number;
}

const LABEL = /(כתובת|address)/i;
const STREET = /(רח'|רחוב|שד'|שדרות|דרך|סמט|\bst\.?\b|\bstreet\b|\bave(nue)?\b|\brd\.?\b|\broad\b|\bblvd\b)/i;
const HEB = /[֐-׿]/;

/** Strip the label word itself, so "כתובת: הרצל 12" suggests "הרצל 12". */
function stripLabel(text: string): string {
  return text.replace(/.*?(כתובת|address)\s*[:\-–]?\s*/i, '').trim();
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
     * most of a line height), then order runs by x. A line holding Hebrew is
     * joined RIGHT-TO-LEFT — the runs sit visually and joining them
     * left-to-right reads the words backwards. The cutout is still what the
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
        (line as Line & { parts: { x: number; str: string }[] }).parts.push({ x: r.x, str: r.str });
      } else {
        lines.push(Object.assign(
          { text: '', hebrew: false, x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y + r.h },
          { parts: [{ x: r.x, str: r.str }] },
        ) as Line);
      }
    }
    for (const l of lines as (Line & { parts: { x: number; str: string }[] })[]) {
      l.hebrew = l.parts.some(p => HEB.test(p.str));
      l.parts.sort((a, b) => (l.hebrew ? b.x - a.x : a.x - b.x));
      l.text = l.parts.map(p => p.str).join(' ').replace(/\s+/g, ' ').trim();
    }

    const view = page.getViewport({ scale: 1 });
    const pageH = view.viewBox[3] - view.viewBox[1];

    /** Score every line; the label form wins, a street pattern stands in. */
    let best: { line: Line; extra?: Line; text: string; score: number } | null = null;
    lines.forEach((l, i) => {
      let score = 0;
      let text = '';
      let extra: Line | undefined;
      if (LABEL.test(l.text)) {
        text = stripLabel(l.text);
        score = 100;
        if (text.length < 3) {
          // "כתובת:" alone — the value sits on the neighbouring line.
          const next = lines[i + 1];
          if (next && Math.abs(next.y1 - l.y1) < (l.y2 - l.y1) * 3) {
            text = next.text; extra = next;
          }
        }
      } else if (STREET.test(l.text) && /\d/.test(l.text)) {
        text = l.text;
        score = 60;
      }
      if (!score) return;
      // Title blocks live low on the sheet; PDF y grows upward.
      if (l.y1 < pageH / 3) score += 10;
      const clean = text.replace(/\s+/g, ' ').trim();
      if (clean.length < 3 || clean.length > 90) return;
      if (!best || score > best.score) best = { line: l, extra, text: clean, score };
    });

    if (!best) return { problem: 'no-address' };
    const b = best as { line: Line; extra?: Line; text: string };

    /**
     * The cutout: the found line with generous surroundings, rendered at a
     * scale that makes the words genuinely readable — never a thumbnail of
     * the whole sheet.
     */
    const rx1 = Math.min(b.line.x1, b.extra?.x1 ?? b.line.x1);
    const rx2 = Math.max(b.line.x2, b.extra?.x2 ?? b.line.x2);
    const ry1 = Math.min(b.line.y1, b.extra?.y1 ?? b.line.y1);
    const ry2 = Math.max(b.line.y2, b.extra?.y2 ?? b.line.y2);
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
    if (!ctx) return { address: b.text };
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

    return { address: b.text, cutout: canvas.toDataURL('image/png') };
  } finally {
    void doc.destroy().catch(() => {});
  }
}
