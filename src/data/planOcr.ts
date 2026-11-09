/**
 * READING A SCAN — OCR of a plan's title block, for a sheet with no text layer.
 *
 * A scanned or photographed plan carries its address, floor and scale in the
 * title block like any other sheet, but there is no text for pdf.js to hand
 * over. This renders ONLY the title-block region(s) of the first page large
 * enough to read (about 300 dpi, area-capped so the browser never refuses the
 * canvas), runs Tesseract (Hebrew + English) over them in its own worker, and
 * turns every word it is sure of into the SAME item shape pdf.js gives — so
 * planAddress's line, address and phone machinery, and its honesty rule (every
 * value carries a box on the sheet and a cutout), run on a scan unchanged.
 *
 * Coordinates. The items are in DISPLAY space, not PDF user space: x right,
 * y UP, in units of the page at scale 1 (points for a PDF), measured on the
 * page AS SHOWN — so a scan whose PDF says "rotate 90°" still reads its lines
 * across, the way the eye does. planAddress converts these with the page's
 * width and height alone (`space: 'display'`), never through pdf.js's own
 * rotation matrix.
 *
 * Tesseract is imported LAZILY (`await import('tesseract.js')`) — a separate
 * chunk, fetched only the first time a scan is read. Its worker, engine and
 * language files come from its default CDN (cdn.jsdelivr.net); the app sets
 * no Content-Security-Policy that would stop them. A failed load is silent and
 * is tried again next time: a scan that cannot be read shows nothing, as before.
 *
 * Floor and scale are read here too (`floorIn`, `scaleIn`) — pure, no OCR —
 * so the text-layer read and the scan read name them the same way.
 */
import type { Frac } from './planAi';

/** The pdf.js text-item shape the address reader takes (display space here — see above). */
export interface OcrItem { str: string; transform: number[]; width: number; height: number }

/** The little of a viewport this needs — a pdf.js PageViewport answers it, and so does a picture. */
export interface SheetViewport {
  width: number;
  height: number;
  convertToPdfPoint(x: number, y: number): number[];
  convertToViewportRectangle(r: number[]): number[];
}

/** The little of a page this needs. `nativeScale`: a picture's own pixels per unit, when known. */
export interface SheetPage {
  getViewport(o: { scale: number }): SheetViewport;
  render(o: never): { promise: Promise<unknown> };
  nativeScale?: number;
}

// ── A picture as a page ─────────────────────────────────────────────────────

/** Is this file a PDF? (the file says so, not its name — the PlanAnnotator rule). */
export function isPdfBytes(b: ArrayBuffer | Uint8Array): boolean {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b, 0, Math.min(4, b.byteLength));
  return u.length >= 4 && u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46;
}

/**
 * A long side of 1190 units: a photograph is measured as if it were an A3
 * sheet at 72 units an inch, so every padding and gap in planAddress (tuned in
 * PDF points) means the same on a picture as on a plotted plan.
 */
const IMAGE_LONG_SIDE = 1190;

/**
 * A photographed / scanned picture (JPG, PNG…) wearing a one-page plan's
 * clothes — the PlanAnnotator idea (`imageAsDoc`), plus the two viewport
 * conversions and the crop `transform` planAddress's cutouts use. Its "PDF
 * space" IS display space (y up), so either reading of a coordinate agrees.
 */
export function imageAsPage(bmp: ImageBitmap | HTMLCanvasElement): SheetPage {
  const k = IMAGE_LONG_SIDE / Math.max(1, bmp.width, bmp.height);
  const W = bmp.width * k, H = bmp.height * k;
  return {
    nativeScale: 1 / k,
    getViewport: ({ scale }) => ({
      width: W * scale,
      height: H * scale,
      convertToPdfPoint: (x, y) => [x / scale, H - y / scale],
      convertToViewportRectangle: r => [r[0] * scale, (H - r[1]) * scale, r[2] * scale, (H - r[3]) * scale],
    }),
    render(o: never) {
      const { canvasContext: g, viewport: vp, transform: t } = o as {
        canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; transform?: number[];
      };
      const promise = (async () => {
        g.save();
        if (t) g.transform(t[0], t[1], t[2], t[3], t[4], t[5]);
        g.imageSmoothingQuality = 'high';
        g.drawImage(bmp, 0, 0, vp.width, vp.height);
        g.restore();
      })();
      return { promise };
    },
  };
}

// ── The title block ─────────────────────────────────────────────────────────

/**
 * The title-block regions, as page fractions — the same block planAddress's
 * `inTitleFrac` believes in: a landscape sheet's right-hand column and bottom
 * strip, a portrait sheet's bottom and right strip. The second region overlaps
 * the first a little so a word on the seam is whole in one of them; `owns`
 * says which region a word belongs to, so it is never read twice.
 */
export function titleRegions(landscape: boolean): { read: Frac; owns: (cx: number, cy: number) => boolean }[] {
  return landscape
    ? [
        { read: { x0: 0.62, y0: 0, x1: 1, y1: 1 }, owns: cx => cx >= 0.62 },
        { read: { x0: 0, y0: 0.82, x1: 0.64, y1: 1 }, owns: cx => cx < 0.62 },
      ]
    : [
        { read: { x0: 0, y0: 0.68, x1: 1, y1: 1 }, owns: (_cx, cy) => cy >= 0.68 },
        { read: { x0: 0.66, y0: 0, x1: 1, y1: 0.7 }, owns: (_cx, cy) => cy < 0.68 },
      ];
}

/** About 300 dpi on a sheet measured in points. */
const TARGET_SCALE = 300 / 72;
/** The biggest canvas a region is rendered to — a refused canvas reads nothing. */
const MAX_OCR_AREA = 16_000_000;

/** The render scale for a region of `wUnits × hUnits` (page units at scale 1). */
export function ocrScale(wUnits: number, hUnits: number, nativeScale?: number): number {
  let s = TARGET_SCALE;
  // A picture holds no more detail than its own pixels; twice them is plenty.
  if (nativeScale) s = Math.min(s, Math.max(1, nativeScale * 2));
  const area = Math.max(1, wUnits * hUnits);
  if (area * s * s > MAX_OCR_AREA) s = Math.sqrt(MAX_OCR_AREA / area);
  return s;
}

/** One recognised word, as Tesseract gives it: canvas pixels, y DOWN. */
export interface OcrWord { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }

/** Below this a "word" on a plan is a hatch pattern read as letters. */
export const MIN_CONFIDENCE = 50;

/**
 * One word → one item. The canvas showed page units [ox, ox + w/s] × [oy, oy + h/s]
 * (y DOWN, from the page's top); the item is in display space, y UP, its
 * baseline at the bottom of the word's box. Pure — the unit test checks it.
 */
export function wordToItem(word: OcrWord, ox: number, oy: number, s: number, pageH: number): OcrItem {
  const x = ox + word.bbox.x0 / s;
  const top = oy + word.bbox.y0 / s;
  const bottom = oy + word.bbox.y1 / s;
  const w = Math.max(0.5, (word.bbox.x1 - word.bbox.x0) / s);
  const h = Math.max(0.5, bottom - top);
  return { str: word.text.trim(), transform: [h, 0, 0, h, x, pageH - bottom], width: w, height: h };
}

/** A word worth keeping: sure enough, and more than a stray mark. */
export function keepWord(w: OcrWord): boolean {
  const t = w.text.trim();
  if (!t || w.confidence < MIN_CONFIDENCE) return false;
  // Lone punctuation / rule lines read as "|", "—", "_" are not words.
  return /[0-9A-Za-z֐-׿]/.test(t);
}

// ── The engine ──────────────────────────────────────────────────────────────

type TWorker = {
  setParameters(p: Record<string, string>): Promise<unknown>;
  recognize(img: HTMLCanvasElement, opts?: object, out?: object): Promise<{ data: { blocks?: unknown[] | null } }>;
  terminate(): Promise<unknown>;
};
let workerP: Promise<TWorker> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
/** One read at a time — the worker's parameters are per-read. */
let queue: Promise<unknown> = Promise.resolve();
/** A worker holds ~100 MB of language model; let it go after a quiet minute. */
const IDLE_MS = 60_000;

async function worker(): Promise<TWorker> {
  if (!workerP) {
    workerP = (async () => {
      const T = await import('tesseract.js');
      const w = await T.createWorker(['heb', 'eng'], T.OEM.LSTM_ONLY, {
        // A failed load REJECTS (caught by the caller); without a handler
        // tesseract also throws it at the window. A failed OCR is silent.
        errorHandler: () => {},
      });
      return w as unknown as TWorker;
    })();
    workerP.catch(() => { workerP = null; });   // tried again next time, never remembered
  }
  return workerP;
}

function scheduleIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const p = workerP;
    workerP = null;
    void p?.then(w => w.terminate()).catch(() => {});
  }, IDLE_MS);
}

/** Every word in a Tesseract page result (v6+ hands back the block tree only). */
function wordsOf(blocks: unknown[] | null | undefined): OcrWord[] {
  const out: OcrWord[] = [];
  for (const b of (blocks ?? []) as { paragraphs?: { lines?: { words?: OcrWord[] }[] }[] }[]) {
    for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) for (const w of l.words ?? []) out.push(w);
  }
  return out;
}

/** Recognise one canvas; words in its own pixels. Serialised through `queue`. */
function recognize(canvas: HTMLCanvasElement, psm: '3' | '6' | '11'): Promise<OcrWord[]> {
  const run = async () => {
    if (idleTimer) clearTimeout(idleTimer);
    try {
      const w = await worker();
      await w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1', user_defined_dpi: '300' });
      const { data } = await w.recognize(canvas, {}, { text: false, blocks: true });
      return wordsOf(data.blocks);
    } finally {
      scheduleIdle();
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

/** Render a page-fraction region of the page onto a canvas at scale `s`, white behind. */
async function renderRegion(page: SheetPage, f: Frac, s: number): Promise<HTMLCanvasElement | null> {
  const base = page.getViewport({ scale: 1 });
  const x0 = f.x0 * base.width, y0 = f.y0 * base.height;
  const w = (f.x1 - f.x0) * base.width, h = (f.y1 - f.y0) * base.height;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * s));
  canvas.height = Math.max(1, Math.round(h * s));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvasContext: ctx,
    viewport: page.getViewport({ scale: s }),
    // Device-space shift so the region lands at the canvas origin — the
    // pdf.js crop trick planAddress's cutouts use.
    transform: [1, 0, 0, 1, -x0 * s, -y0 * s],
  } as never).promise;
  return canvas;
}

/** OCR one region of the page into items (display space). */
async function ocrRegion(page: SheetPage, f: Frac, psm: '3' | '6' | '11', owns?: (cx: number, cy: number) => boolean): Promise<OcrItem[]> {
  const base = page.getViewport({ scale: 1 });
  const W = base.width, H = base.height;
  const s = ocrScale((f.x1 - f.x0) * W, (f.y1 - f.y0) * H, page.nativeScale);
  const canvas = await renderRegion(page, f, s);
  if (!canvas) return [];
  try {
    const words = await recognize(canvas, psm);
    const out: OcrItem[] = [];
    for (const word of words) {
      if (!keepWord(word)) continue;
      const it = wordToItem(word, f.x0 * W, f.y0 * H, s, H);
      if (owns) {
        const cx = (it.transform[4] + it.width / 2) / W;
        const cy = 1 - (it.transform[5] + it.height / 2) / H;
        if (!owns(cx, cy)) continue;
      }
      out.push(it);
    }
    return out;
  } finally {
    canvas.width = 0; canvas.height = 0;
  }
}

/**
 * OCR the title block of a page: every sure word, as display-space items.
 * Null when the engine could not be loaded (offline, a blocked CDN) — the
 * caller treats that exactly like "no text", as before this existed.
 */
export async function ocrTitleBlock(page: SheetPage): Promise<OcrItem[] | null> {
  const base = page.getViewport({ scale: 1 });
  try {
    const out: OcrItem[] = [];
    for (const r of titleRegions(base.width >= base.height)) out.push(...await ocrRegion(page, r.read, '3', r.owns));
    return out;
  } catch {
    return null;
  }
}

/**
 * OCR ONE box a person drew (page fractions) — the pick-it-yourself reader on
 * a scan. Read as a single block of text, which a tight box is.
 */
export async function ocrBox(page: SheetPage, f: Frac): Promise<OcrItem[] | null> {
  const box = {
    x0: Math.max(0, Math.min(f.x0, f.x1)), y0: Math.max(0, Math.min(f.y0, f.y1)),
    x1: Math.min(1, Math.max(f.x0, f.x1)), y1: Math.min(1, Math.max(f.y0, f.y1)),
  };
  if (box.x1 - box.x0 < 0.002 || box.y1 - box.y0 < 0.002) return [];
  try {
    return await ocrRegion(page, box, '6');
  } catch {
    return null;
  }
}

// ── Floor and scale ─────────────────────────────────────────────────────────

/** Ratios a plan is actually drawn at — anything else shaped 1:N is a time or a part number. */
export const PLAN_RATIOS = [10, 20, 25, 40, 50, 75, 100, 125, 150, 200, 250, 500, 1000];
const RATIO_RE = /(?:^|[^\d])1\s*[:：/]\s*(\d{2,4})(?!\d)/g;
/** "קנ"מ", "קנה מידה", "Scale" — the label that makes a ratio the sheet's scale. */
export const SCALE_LABEL = /(קנ\s*["'׳״]?\s*מ|קנה\s*מידה|\bscale\b)/i;
/** "קומה", "קומת", "Floor", "Level" — the label that makes a value a floor. */
export const FLOOR_LABEL = /(קומ[הת](?![א-ת])|\bfloor\b|\blevel\b)/i;

/** The drawing scale printed in a piece of text, as "1:50" — or null. */
export function scaleIn(s: string): string | null {
  for (const m of s.matchAll(RATIO_RE)) {
    const n = Number(m[1]);
    if (PLAN_RATIOS.includes(n)) return `1:${n}`;
  }
  return null;
}

const HEB_FLOOR_WORD = '(?:קרקע|מרתף|גג|מסד|עמודים|טיפוסית|עליונה|תחתונה|ראשונה|שניה|שנייה|שלישית|רביעית|חמישית|שישית|שביעית|שמינית|תשיעית|עשירית)';
const FLOOR_PATTERNS: RegExp[] = [
  // "קומה 3", "קומה -1", "קומה: 2", "קומה א'", "קומת קרקע", "קומה ראשונה"
  new RegExp(`קומ[הת]\\s*[:\\-–]?\\s*(?:${HEB_FLOOR_WORD}(?![א-ת])|[+-]?\\d{1,2}(?![\\d.:/])|[א-י](?:['׳](?![א-ת])|(?![א-ת'׳])))`),
  // "Ground floor", "Basement floor", "Typical floor"
  /\b(?:ground|basement|roof|first|second|third|fourth|fifth|sixth|typical|lower|upper|top)\s+(?:floor|level)\b/i,
  // "3rd floor", "2nd level"
  /\b\d{1,2}(?:st|nd|rd|th)\s+(?:floor|level)\b/i,
  // "Floor 3", "Floor: -1", "Level 2", "Floor G"
  /\b(?:floor|level)\s*[:#\-–]?\s*(?:[+-]?\d{1,2}(?![\d.:/])|ground\b|basement\b|roof\b|G\b|B\d?\b)/i,
];

/** The floor printed in a piece of text, as printed ("קומה 3", "Ground floor") — or null. */
export function floorIn(s: string): string | null {
  for (const re of FLOOR_PATTERNS) {
    const m = s.match(re);
    if (m) {
      // The label's colon goes; a minus sign stays — "קומה -1" is the basement.
      const v = m[0].replace(/\s*[:#]\s*/, ' ').replace(/\s+/g, ' ').trim();
      return /[֐-׿]/.test(v) ? v : v.charAt(0).toUpperCase() + v.slice(1);
    }
  }
  return null;
}
