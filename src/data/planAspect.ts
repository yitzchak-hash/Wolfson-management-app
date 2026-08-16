/**
 * The real shape of a plan sheet, measured once per file.
 *
 * The Drive preview letterboxes the PDF inside whatever box it is given, in a
 * black surround that cannot be turned off — the only way not to see it is a
 * pane whose shape matches the page. Sheets are usually A-series landscape,
 * but portrait and long title-block shapes exist, and asking the office to
 * pick an orientation per plan was a chip row nobody understood. So the sheet
 * is measured.
 *
 * Two ways, cheap first:
 *  1. The Drive THUMBNAIL of page 1 — a few KB, loaded as a plain <img>, whose
 *     natural size has the page's own proportions. Thumbnails already carry
 *     the photo tabs and task attachments in production, so they are known to
 *     load for this deployment's files.
 *  2. Only if the thumbnail refuses: the actual bytes through /api/drive-fetch
 *     and pdf.js — tens of megabytes for a real set, so strictly a fallback,
 *     and pdf.js is imported lazily so measuring never adds it to the main
 *     bundle.
 *
 * Either answer is cached per file id on this machine, so the cost is paid
 * once per plan, not once per open.
 */
import { fetchPlanBytes, driveThumbUrl } from './driveApi';

const CACHE_KEY = 'plan_aspect_cache';
const inFlight = new Map<string, Promise<number | null>>();

/** A mis-measured or genuinely extreme sheet must not blow the modal apart. */
function clampRatio(r: number): number {
  return Math.min(2.4, Math.max(0.45, r));
}

function readCache(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, number>; }
  catch { return {}; }
}

/** The stored width-over-height for this plan, or null if never measured. */
export function cachedPlanAspect(fileId: string): number | null {
  const r = readCache()[fileId];
  return typeof r === 'number' && r > 0 ? clampRatio(r) : null;
}

function remember(fileId: string, ratio: number) {
  try {
    const cache = readCache();
    cache[fileId] = ratio;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* the cache is a luxury, not a requirement */ }
}

function measureViaThumbnail(fileId: string): Promise<number | null> {
  return new Promise(resolve => {
    const img = new Image();
    const done = (r: number | null) => { img.onload = null; img.onerror = null; resolve(r); };
    img.onload = () => done(img.naturalWidth > 0 && img.naturalHeight > 0
      ? img.naturalWidth / img.naturalHeight
      : null);
    img.onerror = () => done(null);
    img.src = driveThumbUrl(fileId, 320);
    setTimeout(() => done(null), 8000);
  });
}

async function measureViaBytes(fileId: string): Promise<number | null> {
  try {
    const bytes = await fetchPlanBytes(fileId);
    await import('../components/plans/pdfCompat');   // shims must land before pdf.js
    const pdfjs = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await doc.getPage(1);
    // The default viewport folds the page's own rotation in, so this is the
    // sheet as it is SHOWN, not as it happens to be stored.
    const vp = page.getViewport({ scale: 1 });
    void doc.destroy();
    return vp.width > 0 && vp.height > 0 ? vp.width / vp.height : null;
  } catch {
    return null;
  }
}

/**
 * Width over height of the plan's first page, or null when it cannot be
 * known (no thumbnail, no backend) — the caller keeps its landscape fallback.
 */
export function measurePlanAspect(fileId: string): Promise<number | null> {
  const hit = cachedPlanAspect(fileId);
  if (hit !== null) return Promise.resolve(hit);
  const running = inFlight.get(fileId);
  if (running) return running;
  const job = (async () => {
    try {
      const raw = (await measureViaThumbnail(fileId)) ?? (await measureViaBytes(fileId));
      if (raw === null) return null;    // never cache a failure — try again next open
      const ratio = clampRatio(raw);
      remember(fileId, ratio);
      return ratio;
    } finally {
      inFlight.delete(fileId);
    }
  })();
  inFlight.set(fileId, job);
  return job;
}
