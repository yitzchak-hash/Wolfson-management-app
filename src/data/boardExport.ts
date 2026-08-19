import { Apartment, CanvasElement, Stage, BIN_META, binLabelOf } from '../types';

/**
 * Board export.
 *
 * The board is redrawn as an SVG rather than screenshotted. That decision buys
 * three things a DOM rasteriser could not:
 *
 *  - no dependency, and nothing that can break when a Tailwind class changes
 *  - the WHOLE board, not just the part currently on screen
 *  - text stays text, so a PDF printed from it is sharp at any size
 *
 * It is deliberately a faithful summary rather than a pixel copy: stage colour,
 * name, address, stage badge, notes, boxes, titles, bins and drawings. Photo
 * backgrounds and clip art are omitted, because embedding remote images would
 * make the export depend on the network and fail silently when it is slow.
 */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Crude but predictable single-line truncation at a given pixel width. */
function fit(text: string, px: number, fontPx: number): string {
  const maxChars = Math.max(1, Math.floor(px / (fontPx * 0.55)));
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

export interface BoardExportInput {
  jobs: Apartment[];
  elements: CanvasElement[];
  stages: Stage[];
  title: string;
  tileW?: number;
  tileH?: number;
  /** Fallback position for a job that has never been dragged. */
  defaultPos: (index: number) => { x: number; y: number };
}

export function buildBoardSvg(input: BoardExportInput): { svg: string; width: number; height: number } {
  const { jobs, elements, stages, title, defaultPos } = input;
  const TW = input.tileW ?? 215;
  const TH = input.tileH ?? 132;
  const PAD = 32;
  const HEADER = 54;

  const stageOf = (id?: string | null) => stages.find(s => s.id === id) ?? null;
  const pos = (j: Apartment, i: number) =>
    typeof j.canvasX === 'number' && typeof j.canvasY === 'number'
      ? { x: j.canvasX, y: j.canvasY }
      : defaultPos(i);

  let maxX = 640, maxY = 400;
  jobs.forEach((j, i) => {
    const p = pos(j, i);
    maxX = Math.max(maxX, p.x + TW);
    maxY = Math.max(maxY, p.y + TH);
  });
  elements.forEach(el => {
    maxX = Math.max(maxX, el.x + el.w);
    maxY = Math.max(maxY, el.y + el.h);
  });

  const width = Math.ceil(maxX + PAD * 2);
  const height = Math.ceil(maxY + PAD * 2 + HEADER);
  const parts: string[] = [];

  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);
  parts.push(
    `<text x="${PAD}" y="34" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="20" font-weight="800" fill="#1e3a5f">${esc(title)}</text>`,
    `<text x="${width - PAD}" y="34" text-anchor="end" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="11" fill="#94a3b8">${esc(new Date().toLocaleString())}</text>`,
    `<line x1="${PAD}" y1="${HEADER - 8}" x2="${width - PAD}" y2="${HEADER - 8}" stroke="#e5e7eb"/>`,
  );

  const g = (x: number, y: number) => `translate(${x + PAD},${y + PAD + HEADER})`;

  // Boxes first, so they sit behind everything they contain.
  elements.filter(e => e.type === 'box').forEach(el => {
    parts.push(
      `<g transform="${g(el.x, el.y)}">`,
      `<rect width="${el.w}" height="${el.h}" rx="12" fill="${esc(el.color)}" stroke="rgba(100,116,139,.45)"/>`,
      `<text x="12" y="20" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="13" font-weight="700" fill="#334155">${esc(fit(el.text, el.w - 24, 13))}</text>`,
      `</g>`,
    );
  });

  // Freehand strokes sit above boxes but below the cards.
  elements.filter(e => e.type === 'stroke' && e.points).forEach(el => {
    parts.push(
      `<g transform="translate(${PAD},${PAD + HEADER})">`,
      `<polyline points="${esc(el.points!)}" fill="none" stroke="${esc(el.color || '#1e3a5f')}" stroke-width="${el.strokeWidth ?? 3}" stroke-linecap="round" stroke-linejoin="round" opacity="${el.art === 'marker' ? 0.45 : 1}"/>`,
      `</g>`,
    );
  });

  elements.filter(e => e.type === 'note').forEach(el => {
    const lines = el.text.split('\n').slice(0, 6);
    parts.push(
      `<g transform="${g(el.x, el.y)}">`,
      `<rect width="${el.w}" height="${el.h}" rx="10" fill="${esc(el.color)}" stroke="rgba(0,0,0,.10)"/>`,
      ...lines.map((ln, i) =>
        `<text x="12" y="${26 + i * 17}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="12.5" fill="#374151">${esc(fit(ln, el.w - 24, 12.5))}</text>`),
      `</g>`,
    );
  });

  elements.filter(e => e.type === 'title').forEach(el => {
    parts.push(
      `<g transform="${g(el.x, el.y)}">`,
      `<text x="0" y="${(el.fontSize ?? 22) * 0.9}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="${el.fontSize ?? 22}" font-weight="900" fill="${esc(el.color || '#0f172a')}">${esc(el.text)}</text>`,
      `</g>`,
    );
  });

  // Every group, not only the four built-in ones: filtering on `binKind` left
  // groups made by hand or by the import out of the picture entirely — the
  // documented trap, which here silently drew an incomplete board.
  elements.filter(e => e.type === 'bin').forEach(el => {
    parts.push(
      `<g transform="${g(el.x, el.y)}">`,
      `<rect width="${el.w}" height="${el.h}" rx="12" fill="#ffffff" stroke="${esc(el.color)}" stroke-width="2" stroke-dasharray="6 4"/>`,
      `<text x="12" y="30" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="12.5" font-weight="800" fill="${esc(el.color)}">${esc(binLabelOf(el))}</text>`,
      `</g>`,
    );
  });

  jobs.forEach((job, i) => {
    const p = pos(job, i);
    const st = stageOf(job.currentStageId);
    const border = st?.color ?? '#cbd5e1';
    parts.push(
      `<g transform="${g(p.x, p.y)}">`,
      `<rect width="${TW}" height="${TH}" rx="12" fill="${esc(job.tileColor ?? '#ffffff')}" stroke="${esc(border)}" stroke-width="4"/>`,
      `<text x="14" y="30" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="13.5" font-weight="700" fill="#111827">${esc(fit(job.displayName || 'Job', TW - 28, 13.5))}</text>`,
    );
    if (st) {
      parts.push(
        `<rect x="14" y="40" width="${Math.min(TW - 28, st.name.length * 6.4 + 16)}" height="17" rx="8.5" fill="${esc(st.color)}" opacity="0.14"/>`,
        `<text x="22" y="52.5" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="10" font-weight="700" fill="${esc(st.color)}">${esc(fit(st.name, TW - 44, 10))}</text>`,
      );
    }
    if (job.address) {
      parts.push(`<text x="14" y="${st ? 76 : 52}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="11" fill="#6b7280">${esc(fit(job.address, TW - 28, 11))}</text>`);
    }
    parts.push(`</g>`);
  });

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    parts.join('') +
    `</svg>`;
  return { svg, width, height };
}

/** Rasterises the SVG and downloads it. 2× scale, so it stays crisp when printed. */
export async function exportBoardPng(input: BoardExportInput, filename: string): Promise<void> {
  const { svg, width, height } = buildBoardSvg(input);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('render failed'));
      img.src = url;
    });
    const SCALE = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.scale(SCALE, SCALE);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('encode failed');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Opens the same drawing in a print window, which is how a PDF is produced —
 * the browser's own "Save as PDF" is more reliable than any library, and it
 * keeps the text selectable.
 */
export function exportBoardPdf(input: BoardExportInput): void {
  const { svg } = buildBoardSvg(input);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(
    `<!doctype html><title>${esc(input.title)}</title>` +
    `<style>@page{size:landscape;margin:8mm}body{margin:0}svg{width:100%;height:auto}</style>` +
    svg,
  );
  w.document.close();
  w.focus();
  // Give the SVG a frame to lay out before the print dialog blocks the thread.
  setTimeout(() => w.print(), 250);
}
