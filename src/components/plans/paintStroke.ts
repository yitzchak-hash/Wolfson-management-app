import type { AnnStroke } from '../../types';

/** The reference page width every stored width is measured against. */
export const REF = 1000;

/** Normalised (0..1) point -> ink-canvas pixels. */
export const toPx = (c: { width: number; height: number }, nx: number, ny: number) =>
  ({ x: nx * c.width, y: ny * c.height });

/** Line spacing, as a multiple of the type size. One number, used everywhere. */
export const LINE = 1.22;

/**
 * Where a balloon's words go, given its outline.
 *
 * Exported because the on-screen text box has to sit EXACTLY here — you type
 * inside the balloon now, so if the editor and the renderer disagreed by a few
 * pixels the words would appear to jump the moment you finished typing.
 */
export function bubbleTextBox(x0: number, y0: number, w: number, bodyH: number, base: number) {
  const pad = base * 4;
  return { x: x0 + pad, y: y0 + pad, w: Math.max(4, w - pad * 2), h: Math.max(4, bodyH - pad * 2) };
}

/**
 * The largest size at which this text fits this box, and the lines it makes.
 *
 * Steps down rather than solving directly, because wrapping is not a smooth
 * function of size — a word crossing the wrap boundary changes the line count
 * all at once.
 */
export function fitText(
  ctx: CanvasRenderingContext2D, text: string, boxW: number, boxH: number,
  want: number, bold?: boolean,
): { size: number; lines: string[] } {
  const weight = bold ? 800 : 600;
  let size = want;
  let lines: string[] = [];
  for (let i = 0; i < 26; i++) {
    ctx.font = `${weight} ${size}px Segoe UI, Helvetica, Arial, sans-serif`;
    lines = wrapped(ctx, text, boxW);
    if (lines.length * size * LINE <= boxH || size <= 6) break;
    size = Math.max(6, size * 0.92);
  }
  ctx.font = `${weight} ${size}px Segoe UI, Helvetica, Arial, sans-serif`;
  return { size, lines };
}

/** Break a line of text to a width, for the speech balloon. */
export function wrapped(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxW && line) { out.push(line); line = word; }
      else line = next;
    }
    out.push(line);
  }
  return out;
}

/**
 * Build a variable-width freehand stroke as ONE path: a quad per segment plus a
 * disc per point, all as subpaths of the same path, filled once with nonzero.
 *
 * This is the whole fix for both drawing faults, and they were the same fault.
 * The old renderer stroked each segment on its own, which meant:
 *
 *  - a segment shorter than its own round cap draws as a dot — so pausing
 *    mid-drag, which lands several samples on top of each other, beaded the line
 *    into a string of blobs;
 *  - every stroke() is a separate composite, so at anything under full opacity
 *    the overlaps stacked and the mark went darker exactly where the hand slowed.
 *
 * Grouping segments into runs is not enough: a pen whose width really does vary
 * still ends up as many separate fills. One path filled once cannot darken
 * against itself no matter how much it overlaps, and the discs give the round
 * joins and caps that stroking used to provide. Width still varies point to
 * point, so the nib's contact size survives.
 *
 * api/plan-annotate.js emits the identical geometry into the PDF.
 * Change one, change both.
 */
function ribbon(ctx: CanvasRenderingContext2D, pts: { x: number; y: number; w: number }[], base: number) {
  const half = (w: number) => Math.max(0.25, (base * w) / 2);
  ctx.beginPath();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) continue;                 // a pause: the discs cover it
    const nx = -dy / len, ny = dx / len;
    const ha = half(a.w), hb = half(b.w);
    ctx.moveTo(a.x + nx * ha, a.y + ny * ha);
    ctx.lineTo(b.x + nx * hb, b.y + ny * hb);
    ctx.lineTo(b.x - nx * hb, b.y - ny * hb);
    ctx.lineTo(a.x - nx * ha, a.y - ny * ha);
    ctx.closePath();
  }
  for (const p of pts) {
    // WOUND THE SAME WAY AS THE QUADS. A nonzero fill cancels where windings
    // oppose, so a disc turning the other way punches a hole in the segment it
    // is meant to be rounding off — the line comes out dashed.
    const h = half(p.w);
    ctx.moveTo(p.x + h, p.y);
    ctx.arc(p.x, p.y, h, 0, Math.PI * 2, true);
  }
  ctx.fill('nonzero');
}

/** Draw one mark. */
export function paintStroke(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, s: AnnStroke) {
  const unit = c.width / REF;
  ctx.save();
  ctx.globalAlpha = s.opacity;
  // Both highlighters multiply — the soft one is a wider, paler wash, not a
  // different kind of thing.
  ctx.globalCompositeOperation = s.tool.startsWith('highlighter') ? 'multiply' : 'source-over';
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const pts: { x: number; y: number; w: number }[] = [];
  for (let i = 0; i + 2 < s.pts.length + 1; i += 3) {
    const P = toPx(c, s.pts[i], s.pts[i + 1]);
    pts.push({ ...P, w: s.pts[i + 2] ?? 1 });
  }
  if (!pts.length) { ctx.restore(); return; }
  const a = pts[0], z = pts[pts.length - 1];
  const base = Math.max(0.5, s.width * unit);

  if (s.tool === 'text') {
    const size = Math.max(6, (s.fontSize ?? 16) * unit);
    ctx.font = `${s.bold ? 800 : 600} ${size}px Segoe UI, Helvetica, Arial, sans-serif`;
    ctx.textBaseline = 'top';
    String(s.text ?? '').split('\n').forEach((line, i) => ctx.fillText(line, a.x, a.y + i * size * 1.25));
    ctx.restore();
    return;
  }

  ctx.lineWidth = base;
  if (s.tool === 'rect') {
    ctx.beginPath();
    ctx.rect(Math.min(a.x, z.x), Math.min(a.y, z.y), Math.abs(z.x - a.x), Math.abs(z.y - a.y));
    if (s.fill) ctx.fill();
    ctx.stroke();
  } else if (s.tool === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse((a.x + z.x) / 2, (a.y + z.y) / 2, Math.abs(z.x - a.x) / 2, Math.abs(z.y - a.y) / 2, 0, 0, Math.PI * 2);
    if (s.fill) ctx.fill();
    ctx.stroke();
  } else if (s.tool === 'bubble') {
    // A speech balloon: rounded box, tail to the lower left, white inside so
    // the words sit on something rather than on the drawing.
    const x0 = Math.min(a.x, z.x), x1 = Math.max(a.x, z.x);
    const y0 = Math.min(a.y, z.y), y1 = Math.max(a.y, z.y);
    const w = x1 - x0, h = y1 - y0;
    const tail = Math.min(base * 8, h * 0.32);
    const bot = y1 - tail;
    const r = Math.min(base * 5, w / 4, (bot - y0) / 3);
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.lineTo(x1 - r, y0);
    ctx.quadraticCurveTo(x1, y0, x1, y0 + r);
    ctx.lineTo(x1, bot - r);
    ctx.quadraticCurveTo(x1, bot, x1 - r, bot);
    ctx.lineTo(x0 + w * 0.36, bot);
    ctx.lineTo(x0 + w * 0.16, y1);                       // the tail
    ctx.lineTo(x0 + w * 0.26, bot);
    ctx.lineTo(x0 + r, bot);
    ctx.quadraticCurveTo(x0, bot, x0, bot - r);
    ctx.lineTo(x0, y0 + r);
    ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
    ctx.closePath();
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.94;
    ctx.fill();
    ctx.restore();
    ctx.stroke();

    if (s.text) {
      // The words FIT THE BALLOON. A small balloon used to keep the type size
      // it was given and simply spill out of the bottom, past its own outline,
      // over the drawing — which looks like a bug and hides the plan. The size
      // steps down until the wrapped text fits, and only then gives up.
      const box = bubbleTextBox(x0, y0, w, bot - y0, base);
      const { size, lines } = fitText(ctx, s.text, box.w, box.h,
        Math.max(7, (s.fontSize ?? 15) * unit), s.bold);
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => {
        ctx.fillText(line, box.x, box.y + i * size * LINE);
      });
    }
  } else if (s.tool === 'line' || s.tool === 'arrow') {
    if (s.tool === 'arrow') {
      // The head is proportional and the SHAFT STOPS AT ITS BASE. Drawing the
      // full line and then a triangle on top of it pokes a blunt round cap out
      // past the point, which is what made the arrow look wrong.
      const ang = Math.atan2(z.y - a.y, z.x - a.x);
      const len = Math.hypot(z.x - a.x, z.y - a.y);
      const head = Math.min(Math.max(base * 4.2, 9), len * 0.42);
      const sp = 0.38;
      const bx = z.x - Math.cos(ang) * head * 0.86;
      const by = z.y - Math.sin(ang) * head * 0.86;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bx, by); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(z.x, z.y);
      ctx.lineTo(z.x - head * Math.cos(ang - sp), z.y - head * Math.sin(ang - sp));
      ctx.lineTo(z.x - head * Math.cos(ang + sp), z.y - head * Math.sin(ang + sp));
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(z.x, z.y); ctx.stroke();
    }
  } else if (s.tool.startsWith('highlighter')) {
    // A highlighter is a flat band of one colour at one width — the nib is a
    // felt chisel, it has no pressure response — so it is one path, one fill.
    ribbon(ctx, pts.map(p => ({ ...p, w: 1 })), base);
  } else {
    // Every writing tool — pen, pencil, marker, fountain, calligraphy,
    // crayon, brush: one fill, the width varying point to point. The
    // CHARACTER lives entirely in those per-point widths, written at capture,
    // which is what keeps this file free of per-pen code paths.
    ribbon(ctx, pts, base);
  }
  ctx.restore();
}
