/**
 * The sheet's way out (B9): the studio's canvases composited into the plan
 * picture, the SVG sheet rasterised to a PNG, PNGs bound into a PDF, and the
 * files filed in Drive — the job's folder › Engineered Plans › Sketcher (pick
 * 69), so the job app's plan chips and the worker portal see a sketched plan
 * beside the architects' with nothing new to wire.
 */
import { findOrCreateFolderViaBackend, uploadFileViaBackend } from './driveApi';
import { canvasBlob, imagesToPdf } from './planExport';
import { SHEET_H, SHEET_W } from './sheetExport';

/** The plan as drawn — the page's pixels with the ink on top — as a JPEG data URL (a PNG of a whole A1 sheet is tens of megabytes). */
export function planImageOf(pdfCanvas: HTMLCanvasElement, inkCanvas?: HTMLCanvasElement | null, maxW = 2400): string {
  const k = Math.min(1, maxW / pdfCanvas.width);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(pdfCanvas.width * k)); c.height = Math.max(1, Math.round(pdfCanvas.height * k));
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(pdfCanvas, 0, 0, c.width, c.height);
  if (inkCanvas && inkCanvas.width) g.drawImage(inkCanvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}

/** An SVG document string drawn onto a canvas of `widthPx`, as a PNG blob. */
export async function svgToPng(svg: string, widthPx = SHEET_W * 2): Promise<Blob> {
  const img = new Image();
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('sheet would not draw')); img.src = url; });
  const c = document.createElement('canvas');
  c.width = widthPx; c.height = Math.round((widthPx * SHEET_H) / SHEET_W);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return canvasBlob(c);
}

/** Sheets bound into one PDF, a page per sheet. */
export const sheetsToPdf = (pngs: Blob[]) => imagesToPdf(pngs);

/** The folder the sheets go to: the job folder › Engineered Plans › Sketcher (found or made once per export). */
export async function sketcherFolderOf(jobFolderId: string): Promise<string> {
  const plans = await findOrCreateFolderViaBackend(jobFolderId, 'Engineered Plans');
  return findOrCreateFolderViaBackend(plans, 'Sketcher');
}

/** File one made file there. */
export async function uploadToFolder(folderId: string, file: File): Promise<{ fileId: string; webViewLink?: string }> {
  const out = await uploadFileViaBackend(folderId, file);
  return { fileId: out.fileId, webViewLink: out.webViewLink };
}
