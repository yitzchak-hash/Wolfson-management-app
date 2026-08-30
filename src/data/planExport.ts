/**
 * Getting a plan OUT of the app — as a file, on any machine, with no server.
 *
 * The old Download did two things and neither of them worked for most plans:
 * the PDF button opened a Drive download link that only existed once somebody
 * had SAVED a marked-up version (so on a plan nobody had marked up it just
 * showed an error), and the picture button always burnt the drawings in with
 * no way to say otherwise — and left the snag pins out entirely.
 *
 * Everything here works from bytes the browser already has (planCache) plus
 * what is on screen, so a download never depends on Drive, on the upload
 * backend, or on having saved first. The office can be on a train.
 *
 * The one thing this deliberately does NOT do is build the LAYERED vector
 * markup PDF — the one with a switchable "Markup" layer a viewer can turn
 * off. That is `api/plan-annotate.js`, it needs the original's bytes handled
 * by pdf-lib on the server, and it is what Save files into Annotated Plans.
 * A download asks for a file to send someone now; the marked-up PDF here is
 * therefore FLATTENED — the markings are part of the picture — which is what
 * "with the markings" means to the person asking for it.
 */
import { PDFDocument } from 'pdf-lib';
import { PlanPin } from '../types';

/**
 * How big to render a page for export.
 *
 * Sharp enough to zoom into on a phone, small enough that the browser will
 * actually give us the canvas: an A0 sheet at a naive scale asks for a
 * hundred million pixels and the allocation is simply refused, which shows up
 * as a blank page rather than an error. So: aim for a long edge around
 * `LONG_EDGE`, then clamp the total area.
 */
const LONG_EDGE = 2400;
const MAX_PIXELS = 24_000_000;

export function exportScale(pageW: number, pageH: number): number {
  if (!(pageW > 0) || !(pageH > 0)) return 2;
  const byEdge = LONG_EDGE / Math.max(pageW, pageH);
  const byArea = Math.sqrt(MAX_PIXELS / (pageW * pageH));
  return Math.max(1, Math.min(byEdge, byArea));
}

/**
 * The snag pins, drawn the way the overlay draws them.
 *
 * `xPct`/`yPct` are the POINT of the pin — the overlay puts the circle above
 * it with a short tail down to it (`-translate-y-full` plus an 8px stem), so
 * the number never covers the thing it is pointing at. Same geometry here, in
 * canvas pixels, or an exported plan would mark a different spot from the one
 * on screen.
 */
export function drawPins(ctx: CanvasRenderingContext2D, w: number, h: number, pins: PlanPin[]): void {
  if (!pins.length) return;
  // The overlay's pin is 24px over a ~900px-wide viewer. Keep that proportion
  // so a pin on an A0 export is not a speck, with a floor for small sheets.
  const k = Math.max(1, w / 900);
  const r = 12 * k;
  const tail = 8 * k;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  pins.forEach((p, i) => {
    const x = (p.xPct / 100) * w;
    const y = (p.yPct / 100) * h;
    const colour = p.resolvedAt ? '#94a3b8' : '#dc2626';
    const cy = y - tail - r;
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(1, k);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - tail);
    ctx.stroke();
    // A white ring, so a red pin over red linework is still a pin.
    ctx.beginPath();
    ctx.arc(x, cy, r + Math.max(1, k), 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(r * 1.15)}px system-ui, sans-serif`;
    ctx.fillText(String(i + 1), x, cy + r * 0.06);
  });
  ctx.restore();
}

/** A canvas as a PNG blob — never a data URL: a big sheet's is tens of MB. */
export function canvasBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(b => (b ? resolve(b) : reject(new Error('the page could not be turned into a picture'))), 'image/png');
  });
}

/**
 * Rendered pages → one PDF.
 *
 * Each page is embedded at its own size, so a mixed set (a big site plan and
 * an A4 detail) keeps each sheet's proportions instead of being squeezed onto
 * one paper size. 72 units per inch is PDF's own unit; dividing the pixels by
 * 2 puts a 2400px edge on a sensibly-sized page at ~144dpi.
 */
export async function imagesToPdf(blobs: Blob[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const b of blobs) {
    const png = await pdf.embedPng(await b.arrayBuffer());
    const w = png.width / 2;
    const h = png.height / 2;
    const page = pdf.addPage([w, h]);
    page.drawImage(png, { x: 0, y: 0, width: w, height: h });
  }
  return pdf.save();
}

/** An image file wrapped as a one-page PDF, for a plan that is a photograph. */
export async function imageBytesToPdf(bytes: Uint8Array, isPng: boolean): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const w = img.width / 2;
  const h = img.height / 2;
  const page = pdf.addPage([w, h]);
  page.drawImage(img, { x: 0, y: 0, width: w, height: h });
  return pdf.save();
}

/** Windows and Drive both refuse these; a plan name is full of them. */
export function safeFileName(s: string): string {
  return (s || 'plan').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * Hand the browser a file, with the NAME we chose.
 *
 * Written out rather than reached for through file-saver: that library
 * dispatches its own synthetic MouseEvent, and in this app the name never
 * survived the trip — every plan arrived called "download", which is exactly
 * the sort of thing nobody notices until there are four of them in the
 * Downloads folder. An anchor with a `download` attribute is the whole
 * mechanism, and this way the filename is ours.
 */
export function saveBytes(bytes: Uint8Array | Blob, filename: string, mime: string): void {
  const blob = bytes instanceof Blob
    ? bytes
    // A fresh copy: pdf-lib hands back a view onto a buffer the caller may
    // still be using, and Blob keeps a reference rather than a snapshot.
    : new Blob([new Uint8Array(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Let the download start before the URL is torn down; revoking immediately
  // cancels it in some browsers.
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}

/**
 * Several files from one press.
 *
 * A browser blocks a burst of automatic downloads — the second and third
 * simply never arrive — so they are spaced out. Chrome asks once whether this
 * site may save several files; after that the rest land.
 */
export async function saveMany(files: Array<{ blob: Blob; name: string }>): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    saveBytes(files[i].blob, files[i].name, 'image/png');
    if (i < files.length - 1) await new Promise(r => setTimeout(r, 350));
  }
}
