import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Undo2, Redo2, Trash2, HardDrive, AlertTriangle, SquareDashedMousePointer,
  Save, Printer, Download, ChevronLeft, ChevronRight,
  Plus, Minus, Maximize2, Loader2, Pen, Pencil, Highlighter, Eraser, Minus as LineIcon,
  ArrowUpRight, Square, Circle, Type, Hand, Layers, FileDown, Check, ExternalLink,
  MessageSquare, Move, Layers2, ChevronsUpDown, User as UserIcon,
  Monitor, ArrowRight, RotateCcw, RotateCw, MoreHorizontal,
} from 'lucide-react';
import './pdfCompat';   // must come before pdf.js
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useStore } from '../../data/store';
import { useOrientation } from '../../data/useOrientation';
import { AnnStroke, AnnTool, PlanAnnotation } from '../../types';
import { fetchPlanBytes, stampPlanToDrive, extractFolderId, isUploadBackendConfigured } from '../../data/driveApi';
import { PenStroke, PenSample, NibWatch, samplesOf, simplify, nearSegment } from './penInput';
import { TOOLS, toolById, INK_COLORS, HIGHLIGHT_COLORS, rememberColor } from './annotTools';
import { InkPicker } from './InkPicker';
import { notePointer, isPalm, isPen, touchWasPalm } from '../../data/pencil';
import { paintStroke, bubbleTextBox, REF, LINE } from './paintStroke';
import { PlanPicker } from './PlanPicker';
import { usePhone } from '../../data/usePhone';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * The editor wears the company's colours, not a generic dark-grey app chrome.
 * Navy is the same one the header, the sidebar and every print sheet use; the
 * blue is the accent that marks whatever is active.
 */
const NAVY = '#1e3a5f';
const NAVY_DEEP = '#152b47';
/**
 * The coloured part of a slider's track, as a percentage.
 *
 * `.ink-slider` paints its track from `var(--fill)` — and nothing ever set it,
 * so the blue half of every slider sat frozen at the 50% default while the
 * handle moved past it. A native range input gives no way to style the filled
 * side, so the value has to be handed to CSS explicitly.
 */
function fillPct(value: number, min: number, max: number): React.CSSProperties {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return { ['--fill' as string]: `${pct}%` };
}

const ACCENT = '#4aa8d8';

/**
 * A media query, as a boolean that follows the screen.
 *
 * The studio has to answer two questions a width breakpoint cannot. How TALL
 * is the screen — a phone on its side is 844 across and 390 down, a desktop's
 * width and a quarter of its height, so `usePhone()` alone calls it a desktop
 * and lays out for one. And which way up is it, since that decides whether the
 * tool rail costs the plan its width or its height.
 */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const go = () => setOn(mq.matches);
    go();
    mq.addEventListener('change', go);
    return () => mq.removeEventListener('change', go);
  }, [query]);
  return on;
}

/** The tools the pen flip is allowed to swap between. */
const INK_TOOLS = new Set(['pen', 'pencil', 'marker', 'highlighter']);
/** What the fat end of the Samsung pen draws with. */
const FAT_NIB_TOOL = 'highlighter';

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  pen: Pen, pencil: Pencil, marker: Highlighter, highlighter: Highlighter,
  line: LineIcon, arrow: ArrowUpRight, rect: Square, ellipse: Circle,
  text: Type, eraser: Eraser, 'eraser-object': SquareDashedMousePointer, pan: Hand, move: Move,
  bubble: MessageSquare,
};

interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: {
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
    optionalContentConfigPromise?: Promise<unknown>;
  }): { promise: Promise<void>; cancel(): void };
  cleanup?(): void;
}
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage> }

/**
 * A picture, wearing a one-page document's clothes.
 *
 * The studio talks to pdf.js through a very small surface — numPages, getPage,
 * getViewport, render — so a photograph only has to answer the same four
 * questions to be marked up by exactly the same tools. Nothing downstream
 * learns the difference.
 */
function imageAsDoc(bmp: ImageBitmap): PdfDoc {
  const page: PdfPage = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: bmp.width * scale, height: bmp.height * scale, scale,
    }),
    render(o: unknown) {
      const { canvasContext, viewport } = o as {
        canvasContext: CanvasRenderingContext2D;
        viewport: { width: number; height: number };
      };
      let cancelled = false;
      const promise = (async () => {
        if (cancelled) return;
        canvasContext.drawImage(bmp, 0, 0, viewport.width, viewport.height);
      })();
      return { promise, cancel() { cancelled = true; } };
    },
  } as unknown as PdfPage;
  return { numPages: 1, getPage: async () => page };
}

/** Only the bits of pdf.js's optional-content config this needs. */
interface OcConfig {
  getOrder?(): unknown[];
  getGroups?(): Record<string, { name?: string }> | undefined;
  getGroup?(id: string): { name?: string } | undefined;
  setVisibility?(id: string, on: boolean): void;
}

/**
 * Every layer id in a plan's optional-content order.
 *
 * `getOrder()` is a TREE, not a list: a group of layers appears as
 * `{ name, order: [...] }` with the ids nested inside it. Keeping only the
 * top-level strings therefore found nothing at all on any plan whose layers
 * were grouped under a heading — which is most plans out of a CAD package, and
 * exactly the ones somebody wants the layer switches for.
 */
function flattenOrder(order: unknown[]): string[] {
  const out: string[] = [];
  const walk = (rows: unknown[]) => {
    for (const row of rows) {
      if (typeof row === 'string') { out.push(row); continue; }
      const nested = (row as { order?: unknown[] } | null)?.order;
      if (Array.isArray(nested)) walk(nested);
    }
  };
  walk(order);
  return out;
}

/**
 * The plan markup studio.
 *
 * Three things make this work rather than being a drawing toy:
 *
 * 1. It draws on the REAL PDF, rendered by pdf.js from bytes fetched through
 *    our own route. Drive's preview iframe cannot be measured or drawn on, so a
 *    mark placed over it would drift the moment anything resized. Here the ink
 *    canvas is pixel-locked to the page canvas, and every mark is stored as a
 *    fraction of the page — so it lands on the same duct on a phone, a PC and
 *    the 86" screen.
 *
 * 2. Saving produces a real PDF layer, not a flattened picture. The original
 *    page content is untouched and the markup sits in an optional-content group
 *    that any viewer can switch off. Whoever opens the file in Drive still has
 *    the drawing the engineer issued.
 *
 * 3. Versions are kept as vectors here as well as PDFs in Drive, which is what
 *    makes "carry on from version 2" possible. Reading ink back out of a PDF is
 *    not something a browser can do.
 */
export interface PlanChoice {
  /** Drive file id. */
  id: string;
  name: string;
  /** Originals come from the plans folder; markups from its Annotated Plans subfolder. */
  kind: 'original' | 'annotated';
  /** A picture rather than a PDF: no layers, everything else the same. */
  isImage?: boolean;
}

export function PlanAnnotator({
  planFileId, planName, apartmentId, apartmentLabel, driveFolderUrl, plansFolderId,
  authorName, readOnly = false, askWho = false, people = [], plans = [], embedded = false,
  barExtrasRef, barInto, barInto2,
  touchScale = 1,
  onClose, onToast, onPickPlan, onStartMarkup,
}: {
  planFileId: string;
  planName?: string;
  apartmentId: string;
  apartmentLabel: string;
  /** The job's Drive folder — the markup is filed in an "Annotated Plans" subfolder of it. */
  driveFolderUrl?: string;
  /**
   * The Engineered Plans folder itself. The markup belongs INSIDE it, because
   * the markup of a plan is a plan and that is where the office looks.
   */
  plansFolderId?: string;
  authorName: string;
  readOnly?: boolean;
  /**
   * Sit inside the page instead of covering it.
   *
   * The wallboard shows a plan as PART of a job screen rather than as a
   * full-screen studio, and it needs the plan drawn the way this draws it —
   * pdf.js onto a white canvas, fitted to its space — rather than as a Drive
   * preview, which frames every sheet in a black surround and cannot be told
   * not to.
   */
  embedded?: boolean;
  /**
   * Where the HOST can put its own buttons in this bar.
   *
   * The drawer's punch-list pin lives here, beside the file's name — see the
   * note at the slot itself.
   */
  barExtrasRef?: (el: HTMLElement | null) => void;
  /**
   * Draw this bar somewhere else entirely — the host's own bar.
   *
   * The drawer used to stack two bars over one sheet: its navy header carrying
   * the folder picker and the file chips, and this one underneath carrying the
   * file's name, the pin, Plans, Layers, Download and Print. The owner asked
   * for one row, with these controls at its LEFT-hand end, ahead of the folder
   * picker — so when a host offers a slot, the whole row is portalled into it
   * and nothing is drawn in place. Its own background and padding are dropped
   * with it: it is joining a bar, not putting a second one inside the first.
   */
  barInto?: HTMLElement | null;
  /**
   * A SECOND slot, which splits this bar across two rows.
   *
   * With both given, the file's name goes into `barInto` and everything else
   * — the pin, the pager, Plans, Layers, Download, Print — goes into
   * `barInto2`. That is the owner's own arrangement, drawn on the workbench:
   * what the sheet IS on the top row, what you can DO to it underneath.
   *
   * With only `barInto`, the whole row goes there as before.
   */
  barInto2?: HTMLElement | null;
  /**
   * The wallboard is shared — whoever walks up to it is not "the office".
   * When this is on, the editor asks who is drawing before it will let anyone
   * draw, and that name goes on the version and into the PDF.
   */
  askWho?: boolean;
  people?: string[];
  /**
   * How big the controls are, 1 being the desk size.
   *
   * The wall panel is driven with a finger and a fat passive pen, and a rail
   * laid out for a mouse is a miss more often than a hit. Everything in the
   * chrome — rail width, button size, icons, labels, the top bar — is a
   * multiple of this, so one number moves all of it together and nothing can
   * be left behind at the old size.
   */
  touchScale?: number;
  /** Every plan on this job: the originals, and the markups made from them. */
  plans?: PlanChoice[];
  onClose: () => void;
  onToast?: (msg: string, kind?: 'success' | 'error') => void;
  onPickPlan?: (p: PlanChoice) => void;
  /** Turns a read-only viewing into an editing session, in place. */
  onStartMarkup?: () => void;
}) {
  /**
   * The shape of the screen, which on a phone is two different problems.
   *
   * Stood up (390 × 844) width is what is scarce, so a 62px rail down the side
   * is a sixth of the plan; it goes across the bottom instead, where a thumb
   * reaches it. On its side (844 × 390) — the way anybody actually holds a
   * phone to read a construction drawing — height is what is scarce, so the
   * rail belongs down the side and the chrome above the plan has to shrink to
   * one row. `compact` is "either dimension is too small for the desk
   * layout", which is true in BOTH orientations of the same phone; a width
   * breakpoint on its own is false the moment the phone is turned.
   */
  const phone = usePhone();
  /**
   * The width test is deliberately part of this. A desk window dragged half
   * way up the screen is also 500px tall, and it has 1400px of width to lay
   * the header out in — collapsing that into a ⋯ menu would be the phone
   * layout arriving on a machine that never needed it.
   */
  const shortScreen = useMedia('(max-height: 540px) and (max-width: 1024px)');
  const landscape = useMedia('(orientation: landscape)');
  const compact = phone || shortScreen;
  /** The rail runs across the bottom only when the screen is taller than it is wide. */
  const railRow = compact && !landscape;

  const planAnnotations = useStore(s => s.planAnnotations);
  const savePlanAnnotation = useStore(s => s.savePlanAnnotation);
  const updatePlanAnnotation = useStore(s => s.updatePlanAnnotation);
  const deletePlanAnnotation = useStore(s => s.deletePlanAnnotation);

  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [loadErr, setLoadErr] = useState('');
  /** How much of a heavy plan has arrived, so the wait is visible. */
  const [got, setGot] = useState<{ bytes: number; total: number | null }>({ bytes: 0, total: null });
  const [page, setPage] = useState(0);
  const [scale, setScale] = useState(1.25);
  const [fitting, setFitting] = useState(true);
  /**
   * Zooming does NOT redraw the sheet. Not straight away.
   *
   * Every zoom step used to resize all three canvases — which clears them — and
   * kick off a fresh pdf.js render of the whole page. On a real A0 drawing that
   * is a second or more of blank white per step, so holding the zoom made the
   * plan strobe: the owner's "it refreshes all the layers every three seconds".
   *
   * There are two scales now. `scale` is the LAYOUT one and moves instantly:
   * the canvases keep the bitmap they already have and are simply given a new
   * CSS size, so the sheet grows under your hand with no work at all, very
   * slightly soft. `raster` is the DRAWING one and follows a moment after your
   * hand stops, at which point the page is redrawn at full resolution — once,
   * off-screen, and blitted in one go so nothing ever goes blank.
   */
  const [raster, setRaster] = useState(1.25);
  /** The page at 100%, so the CSS size can follow the zoom without a render. */
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  /** What is actually painted on the canvas right now. */
  const drawnAt = useRef<{ page: number; s: number } | null>(null);
  useEffect(() => {
    if (Math.abs(scale - raster) < 0.001) return;
    const t = setTimeout(() => setRaster(scale), 170);
    return () => clearTimeout(t);
  }, [scale, raster]);
  /** Is the SHEET wider than it is tall? Decides the turn-your-phone hint. */
  const [sheetWide, setSheetWide] = useState(false);
  const screen = useOrientation();

  const [strokes, setStrokes] = useState<AnnStroke[]>([]);
  const [redo, setRedo] = useState<AnnStroke[]>([]);
  const [basedOn, setBasedOn] = useState<number | undefined>(undefined);
  const [dirty, setDirty] = useState(false);

  const [tool, setTool] = useState<string>('pen');
  const [color, setColor] = useState('#dc2626');
  const [width, setWidth] = useState(3);
  const [opacity, setOpacity] = useState(1);
  /** Heavier type on the next note or balloon. */
  const [bold, setBold] = useState(false);
  const [sens, setSens] = useState(1);
  const [showPalette, setShowPalette] = useState(false);
  const [paletteAt, setPaletteAt] = useState({ x: 120, y: 120 });
  const [penSource, setPenSource] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [textDraft, setTextDraft] = useState<{ nx: number; ny: number; value: string; forId?: string } | null>(null);
  const [showVersions, setShowVersions] = useState(true);

  /** Where the pointer is, so the nib can be drawn at its real size under it. */
  const [nibAt, setNibAt] = useState<{ x: number; y: number } | null>(null);
  /** The move tool's current selection. */
  const [picked, setPicked] = useState<string | null>(null);
  /** Which of the PDF's own layers are switched on. */
  const [layers, setLayers] = useState<{ id: string; name: string; on: boolean }[]>([]);
  const [showLayers, setShowLayers] = useState(false);
  /**
   * A picture rather than a PDF.
   *
   * Everything else is the same — the same tools, the same versions, the same
   * saving — but an image has no optional-content groups, so the layer
   * switches are switched off rather than offered and found empty.
   */
  const [loadedIsImage, setLoadedIsImage] = useState(false);
  const isImagePlan = loadedIsImage || !!plans.find(p => p.id === planFileId)?.isImage;
  const [showDownload, setShowDownload] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  /**
   * The rest of the header, on a screen that cannot hold it.
   *
   * Eleven buttons wrap onto four rows at 390px and eat half the plan. The
   * five that are pressed while drawing stay out; everything else moves in
   * here, at a size a finger can hit.
   */
  const [showMore, setShowMore] = useState(false);
  /** On the wallboard: who is drawing. Empty means nobody has said yet. */
  const [who, setWho] = useState(askWho ? '' : authorName);

  const stageRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<{ cancel(): void } | null>(null);
  const ocRef = useRef<OcConfig | null>(null);
  const drawing = useRef<{
    pen: PenStroke; pts: PenSample[]; startedAt: number;
    /** The tool this stroke actually started with — see nibFlip(). */
    tool?: string;
  } | null>(null);
  /** Learns this panel's two nib sizes, so flipping the pen can switch tools. */
  const nibs = useRef(new NibWatch());
  /** The ink tool to come back to when the pen is flipped the right way up. */
  const thinNibTool = useRef<string>('pen');
  /** A drag of something already drawn, rather than a new stroke. */
  const moving = useRef<{
    id: string; nx: number; ny: number; pts: number[]; grip?: 'a' | 'z';
    /** Has it actually travelled, or was this a tap that happened to land on it? */
    moved?: boolean;
    /** A finger's second tap on the mark it already picked — see onDown. */
    tapOpens?: boolean;
  } | null>(null);
  const erased = useRef<Set<string>>(new Set());
  const textRef = useRef<HTMLTextAreaElement>(null);
  /**
   * The nib ghost's own element, so it can be moved without a render.
   *
   * `setNibAt` on every pointermove re-renders the whole studio — a component
   * with the version list, the rail and three canvases in it — for a circle
   * that has moved four pixels. On a desk that is waste; on a phone it is the
   * difference between a line that follows your finger and one that trails it.
   * While a stroke is actually being drawn the ghost is written straight to
   * the DOM instead, and state takes over again the moment the pen lifts.
   */
  const nibElRef = useRef<HTMLSpanElement>(null);
  /**
   * What last touched the glass. A long press with a finger must not open the
   * browser's own "open image in new tab" menu over a drawing, but a right
   * click with a mouse is nobody's problem — and a contextmenu event carries
   * no pointer type of its own to tell them apart.
   */
  const lastPointerType = useRef<string>('mouse');
  /** Where a zoom should land, as a fraction of the content. See renderPage. */
  const zoomAnchor = useRef<{ fx: number; fy: number; cx: number; cy: number } | null>(null);
  /** The live scale, for the pinch handler — which is registered once. */
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  /**
   * Abandon a stroke in progress without committing it.
   *
   * The offscreen buffer goes with it. On an A0 sheet that buffer is a hundred
   * megabytes, and a pinch that cancelled a stroke used to leave it allocated
   * until the next one started — which on a phone is exactly the machine that
   * can least afford it.
   */
  const cancelStroke = useCallback(() => {
    drawing.current = null;
    moving.current = null;
    if (liveFrame.current) { cancelAnimationFrame(liveFrame.current); liveFrame.current = 0; }
    releaseLiveBuffer();
    const c = liveRef.current;
    if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  }, []);

  const preset = toolById(tool);
  const backendReady = isUploadBackendConfigured();

  /**
   * Every control size, from the one factor.
   *
   * Written as helpers rather than sprinkled multiplications so that adding a
   * button later means reaching for `ui.btn` and `ui.icon`, and it comes out
   * the right size on the wall without anybody remembering to think about it.
   */
  const ts = Math.max(1, Math.min(2.2, touchScale || 1));
  const ui = useMemo(() => ({
    on: ts > 1.02,
    rail: Math.round(62 * ts),
    btn: Math.round(50 * ts),
    padY: Math.round(6 * ts),
    icon: Math.round(16 * ts),
    smallIcon: Math.round(14 * ts),
    label: +(8.5 * ts).toFixed(1),
    text: +(12 * ts).toFixed(1),
    gap: Math.round(4 * ts),
    /** Padding for the top-bar buttons, which are shaped by class not size. */
    barPad: `${Math.round(6 * ts)}px ${Math.round(9 * ts)}px`,
  }), [ts]);

  /**
   * An icon button a finger can actually hit.
   *
   * `p-1.5` around a 14px icon is a 26px target. The line everybody works to
   * is 32, and a header button is pressed while holding a phone one-handed, so
   * these go to 38 — bought with padding rather than a bigger icon, so the row
   * looks the same and only the box around it grows. The desk keeps its own
   * size to the pixel.
   */
  const iconBtn = compact
    ? 'rounded-lg flex items-center justify-center flex-shrink-0 min-w-[38px] min-h-[38px]'
    : 'p-1.5 rounded-lg';

  /**
   * A slider a finger can catch.
   *
   * `.ink-slider` sets the ELEMENT to 4px tall — the thumb hangs out of it — so
   * the box a tap has to land inside is four pixels, and the width control was
   * a matter of luck with a finger. Padding grows the element to 22 and the
   * coloured track is clipped back to the content box, so the bar looks
   * identical to the pixel and only the hit area changes. Tailwind's preflight
   * already puts everything in border-box, so the height is the outside.
   */
  const touchSlider: React.CSSProperties = compact
    ? { height: 22, paddingTop: 9, paddingBottom: 9, backgroundClip: 'content-box' }
    : {};

  /**
   * Read-only until somebody says who they are.
   *
   * The wallboard is the shared screen in the office, so "the office" is not an
   * answer to who marked a plan up. It stays inert until a name is chosen, and
   * from then on it behaves like any other machine.
   */
  const locked = readOnly || (askWho && !who);

  /** The pen shows the size it will draw at; the eraser shows what it will take. */
  const isEraser = tool === 'eraser' || tool === 'eraser-object';
  const showNib = !locked && (preset.freehand || isEraser);
  const nibPx = Math.max(4, width * ((liveRef.current?.width ?? 1000) / REF)
    / Math.max(0.05, window.devicePixelRatio || 1));
  const parentFolderId = driveFolderUrl ? extractFolderId(driveFolderUrl) : null;

  /** Every saved version of THIS plan, newest first. */
  const versions = useMemo(
    () => planAnnotations
      .filter(a => a.apartmentId === apartmentId && a.planFileId === planFileId)
      .sort((a, b) => b.version - a.version),
    [planAnnotations, apartmentId, planFileId],
  );
  const nextVersion = (versions[0]?.version ?? 0) + 1;

  // ---- load the PDF ------------------------------------------------------
  useEffect(() => {
    let dead = false;
    setDoc(null); setLoadErr('');
    setGot({ bytes: 0, total: null });
    fetchPlanBytes(planFileId, (bytes, total) => { if (!dead) setGot({ bytes, total }); })
      .then(async buf => {
        /**
         * A picture is drawn as a one-page document.
         *
         * pdf.js is given PDFs; an image is decoded and wrapped in the same
         * shape — one page, a viewport, a render onto the canvas — so
         * everything downstream (the ink layers, the zoom, the versions, the
         * saving) works on a photograph without knowing it is one.
         */
        const bytes = new Uint8Array(buf);
        // The FILE says whether it is a picture, not a list it might not be
        // in: a plan chosen out of another folder never appears in `plans`, so
        // asking that list left the layer switches offered on a photograph.
        const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
        if (!dead) setLoadedIsImage(!isPdf);
        if (isPdf) return pdfjs.getDocument({ data: bytes }).promise as unknown as PdfDoc;
        const blob = new Blob([bytes]);
        const bmp = await createImageBitmap(blob);
        return imageAsDoc(bmp);
      })
      .then(d => { if (!dead) { drawnAt.current = null; setDoc(d as unknown as PdfDoc); setPage(0); } })
      .catch(e => { if (!dead) setLoadErr(e instanceof Error ? e.message : String(e)); });
    return () => { dead = true; };
  }, [planFileId]);

  // ---- render the page ---------------------------------------------------
  const renderPage = useCallback(async () => {
    if (!doc || !pdfRef.current) return;
    const p = await doc.getPage(page + 1);

    // The WHOLE page fits on first sight, not just its width. A construction
    // drawing at 100% is unusable on any screen, and fitting the width alone
    // still left an A0 sheet taller than the stage — so it opened with a scroll
    // bar and you could not see what you were about to mark up.
    const natVp = p.getViewport({ scale: 1 });
    setNat({ w: natVp.width, h: natVp.height });

    let s = raster;
    if (fitting && stageRef.current) {
      // The margin the stage keeps round the sheet — 16px a side at the desk,
      // 4px on a phone, where sixteen of them is four per cent of the screen
      // spent on nothing.
      const pad = compact ? 8 : 32;
      const availW = stageRef.current.clientWidth - pad;
      const availH = stageRef.current.clientHeight - pad;
      s = Math.max(0.1, Math.min(4, Math.min(availW / natVp.width, availH / natVp.height)));
      setScale(s); setRaster(s); setFitting(false);
    }

    // Nothing to redraw if the page is already on screen at this resolution.
    // Without this, fitting on open renders the sheet twice — once from the fit
    // and once when `raster` catches up to the number the fit just chose.
    if (drawnAt.current && drawnAt.current.page === page
      && Math.abs(drawnAt.current.s - s) < 0.001) return;

    const vp = p.getViewport({ scale: s });
    setSheetWide(vp.width > vp.height * 1.1);
    /**
     * Always ABOVE the screen's own resolution, never merely equal to it.
     *
     * It used to take the device ratio as it found it, which on an ordinary
     * desktop monitor is 1 — so the sheet was drawn at exactly the pixels it
     * occupied and every look closer, every nudge of the zoom before the redraw
     * catches up, was a soft grey smear. Two is the floor now; the cap is an
     * AREA, because an A0 sheet at 400% times three is a canvas the browser
     * simply refuses to allocate, and a refused canvas is a blank plan.
     */
    const MAX_PIXELS = 32e6;
    const want = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
    const area = vp.width * vp.height;
    const dpr = Math.max(1, Math.min(want, Math.sqrt(MAX_PIXELS / Math.max(1, area))));
    const w = Math.round(vp.width), h = Math.round(vp.height);
    // The CSS size follows the LAYOUT scale, which may already have moved past
    // the one being drawn — that is the whole point of the split.
    const cssW = Math.round(natVp.width * scaleRef.current);
    const cssH = Math.round(natVp.height * scaleRef.current);

    /**
     * The live layer is drawn at a LOWER resolution than the plan.
     *
     * The plan and the committed ink want every pixel the screen can show — a
     * construction drawing is read by zooming into it. The live layer is the
     * stroke under your hand for the half-second before you lift it, and it is
     * thrown away and redrawn properly the moment you do. Carrying it at the
     * full device ratio means blitting a 15-megapixel canvas on every frame of
     * every stroke: measured at 36ms a frame on an A0 sheet, against 7ms at
     * this ratio. The CSS size is identical, so nothing moves and nothing
     * misaligns — the ink is very slightly softer while the pen is down.
     */
    const LIVE_DPR = Math.min(dpr, 1.5);

    /**
     * Drawn OFF-SCREEN, then put up in one go.
     *
     * Setting a canvas's width clears it, so resizing the visible one and then
     * waiting for pdf.js is a white flash the length of the render. The page is
     * drawn into a canvas nobody can see and blitted across when it is finished,
     * which is why the plan never blinks any more.
     */
    renderTask.current?.cancel();
    const off = document.createElement('canvas');
    off.width = Math.round(w * dpr);
    off.height = Math.round(h * dpr);
    const octx = off.getContext('2d')!;
    const task = p.render({
      canvasContext: octx,
      viewport: p.getViewport({ scale: s * dpr }),
      // Draw with whatever layers are switched on.
      ...(ocRef.current ? { optionalContentConfigPromise: Promise.resolve(ocRef.current) } : {}),
    });
    renderTask.current = task;
    try { await task.promise; } catch { return; /* superseded by a newer render */ }

    for (const c of [pdfRef.current, inkRef.current, liveRef.current]) {
      if (!c) continue;
      const k = c === liveRef.current ? LIVE_DPR : dpr;
      c.width = Math.round(w * k);
      c.height = Math.round(h * k);
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
    }
    const ctx = pdfRef.current.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(off, 0, 0);
    drawnAt.current = { page, s };
    redrawInk();
  }, [doc, page, raster, fitting, compact]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The zoom itself: pure layout, no drawing.
   *
   * The canvases keep whatever bitmap they have and are simply given a new CSS
   * size, so a zoom step costs one style write instead of a full re-render.
   * The scroll correction that keeps the point under the pointer still lives
   * with the size change, because it has to read the new scrollWidth.
   */
  useEffect(() => {
    if (!nat) return;
    const cssW = Math.round(nat.w * scale);
    const cssH = Math.round(nat.h * scale);
    for (const c of [pdfRef.current, inkRef.current, liveRef.current]) {
      if (!c) continue;
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
    }
    const anchor = zoomAnchor.current;
    if (anchor && stageRef.current) {
      const el = stageRef.current;
      el.scrollLeft = anchor.fx * el.scrollWidth - anchor.cx;
      el.scrollTop = anchor.fy * el.scrollHeight - anchor.cy;
      zoomAnchor.current = null;
    }
  }, [nat, scale]);

  useEffect(() => { void renderPage(); }, [renderPage]);

  /** The live `compact`, for the listeners below, which are registered once. */
  const compactRef = useRef(compact);
  compactRef.current = compact;

  // Re-fit when the window changes shape — the studio is full screen, so a
  // rotated tablet or a resized window otherwise leaves the plan stranded.
  useEffect(() => {
    let last = { w: window.innerWidth, h: window.innerHeight };
    const on = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const turned = w !== last.w;
      last = { w, h };
      /**
       * On a phone the height changes for reasons that are not a resize: the
       * keyboard sliding up under a note, and the address bar collapsing as
       * the plan is scrolled. Re-fitting on those throws away the zoom
       * somebody chose — mid-sentence, in the keyboard's case. A rotation
       * changes the WIDTH, and that is the one that genuinely needs a new fit.
       */
      if (compactRef.current && !turned) return;
      setFitting(true);
    };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  /**
   * The wheel ALWAYS zooms the plan, and it zooms towards the pointer.
   *
   * It used to need Ctrl held down and otherwise scrolled, which on a drawing
   * is the wrong default twice over: scrolling a plan is rarely what you want,
   * and a wall panel has no Ctrl key at all. To look somewhere else you zoom
   * out and back in over there, which is one gesture instead of two.
   *
   * React's onWheel prop is passive in several browsers, where preventDefault()
   * silently does nothing and the BROWSER zooms the whole page instead — which
   * on a full-screen editor throws the layout apart. Registering by hand with
   * `{ passive: false }` is the only way to claim the gesture, and it is the
   * same lesson the job board learned.
   */
  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = clientX - r.left, cy = clientY - r.top;
    zoomAnchor.current = {
      fx: el.scrollWidth ? (el.scrollLeft + cx) / el.scrollWidth : 0.5,
      fy: el.scrollHeight ? (el.scrollTop + cy) / el.scrollHeight : 0.5,
      cx, cy,
    };
    setFitting(false);
    setScale(z => Math.min(6, Math.max(0.1, Math.round(z * factor * 100) / 100)));
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function wheel(e: WheelEvent) {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  /**
   * Two fingers pinch AND drag, on the touch panel and on a phone.
   *
   * The dragging half is what makes a phone usable at all. With a drawing tool
   * armed one finger draws, so the only way to look at another part of the
   * sheet was to switch to the Pan tool and switch back — twice per mark. Two
   * fingers is the gesture every map and every photo on the machine already
   * uses, and it costs nothing here: the plan lives in a scroller, so a drag
   * is the midpoint's travel subtracted from the scroll.
   *
   * The pan is applied BEFORE the zoom anchor is taken, because the anchor is
   * read out of the scroll position — taking it first would zoom towards where
   * the fingers were a frame ago.
   *
   * The second finger also CANCELS whatever stroke the first one had started —
   * otherwise a pinch leaves a stray mark across the plan from wherever the
   * first finger happened to land.
   */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let base: { dist: number; scale: number } | null = null;
    let lastMid: { x: number; y: number } | null = null;

    const gap = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    });

    function start(e: TouchEvent) {
      if (e.touches.length !== 2) return;
      cancelStroke();
      base = { dist: gap(e.touches), scale: scaleRef.current };
      lastMid = mid(e.touches);
    }
    function move(e: TouchEvent) {
      if (e.touches.length !== 2 || !base) return;
      e.preventDefault();
      const m = mid(e.touches);
      if (lastMid) {
        el!.scrollLeft -= m.x - lastMid.x;
        el!.scrollTop -= m.y - lastMid.y;
      }
      lastMid = m;

      const d = gap(e.touches);
      if (base.dist < 8) return;
      const want = Math.min(6, Math.max(0.1, base.scale * (d / base.dist)));
      const r = el!.getBoundingClientRect();
      const cx = m.x - r.left;
      const cy = m.y - r.top;
      zoomAnchor.current = {
        fx: el!.scrollWidth ? (el!.scrollLeft + cx) / el!.scrollWidth : 0.5,
        fy: el!.scrollHeight ? (el!.scrollTop + cy) / el!.scrollHeight : 0.5,
        cx, cy,
      };
      setFitting(false);
      setScale(Math.round(want * 100) / 100);
    }
    function end(e: TouchEvent) {
      if (e.touches.length < 2) { base = null; lastMid = null; }
    }

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The plan's OWN layers.
   *
   * A services drawing usually arrives with the architect's layers still in it,
   * and being able to switch the electrical off while marking up the ductwork is
   * the difference between a readable plan and a thicket. pdf.js exposes them
   * through the optional-content config — the same mechanism our own markup
   * layer uses.
   */
  useEffect(() => {
    if (!doc) { setLayers([]); return; }
    let dead = false;
    (async () => {
      try {
        const cfg = await (doc as unknown as { getOptionalContentConfig(): Promise<OcConfig> })
          .getOptionalContentConfig();
        // The order first, flattened; then every group the document declares,
        // in case the order is missing or names a subset. A plan that HAS
        // layers must never show none.
        const ids = flattenOrder(cfg.getOrder?.() ?? []);
        const all = cfg.getGroups?.() ?? {};
        for (const id of Object.keys(all)) if (!ids.includes(id)) ids.push(id);
        const rows = ids.map(id => ({
          id,
          name: cfg.getGroup?.(id)?.name ?? all[id]?.name ?? 'Layer',
          on: true,
        }));
        if (!dead) { ocRef.current = cfg; setLayers(rows); }
      } catch { if (!dead) setLayers([]); }
    })();
    return () => { dead = true; };
  }, [doc]);

  /**
   * Your marks, grouped into a layer per colour.
   *
   * Newest first, by when that colour was last used — the pass you are in the
   * middle of belongs at the top, and the numbering counts up from the oldest
   * so "layer 1" is where the markup started.
   */
  const [hiddenInk, setHiddenInk] = useState<Set<string>>(new Set());
  const inkLayers = useMemo(() => {
    const by = new Map<string, { colour: string; count: number; last: number }>();
    strokes.forEach((st, i) => {
      const key = (st.color ?? '#000').toLowerCase();
      const row = by.get(key) ?? { colour: key, count: 0, last: -1 };
      row.count += 1;
      row.last = Math.max(row.last, i);
      by.set(key, row);
    });
    return [...by.values()].sort((a, b) => b.last - a.last);
  }, [strokes]);

  /**
   * Every layer at once.
   *
   * A services drawing arrives with twenty of the architect's layers on it, and
   * the way somebody uses this is "off with the lot, then back on with the one
   * I need" — twenty presses to ask one question. `drawnAt` is cleared for the
   * same reason a single toggle clears it: what is drawn ON the page changed
   * even though the page and its resolution did not.
   */
  function setAllLayers(on: boolean) {
    const cfg = ocRef.current;
    if (!cfg) return;
    setLayers(prev => {
      const next = prev.map(l => ({ ...l, on }));
      for (const l of next) {
        try { cfg.setVisibility?.(l.id, on); } catch { /* older build */ }
      }
      return next;
    });
    drawnAt.current = null;
    setTimeout(() => void renderPage(), 0);
  }

  function toggleLayer(id: string) {
    const cfg = ocRef.current;
    if (!cfg) return;
    setLayers(prev => {
      const next = prev.map(l => (l.id === id ? { ...l, on: !l.on } : l));
      const row = next.find(l => l.id === id);
      try { cfg.setVisibility?.(id, !!row?.on); } catch { /* older build */ }
      return next;
    });
    /**
     * Invalidate what is painted, THEN re-render.
     *
     * `renderPage` skips a redraw when the page and the resolution are already
     * on screen — which is exactly the case here, so switching a layer changed
     * the config and drew nothing at all. The guard is right for zooming and
     * wrong for this: what is drawn ON the page has changed even though the
     * page and its resolution have not.
     */
    drawnAt.current = null;
    setTimeout(() => void renderPage(), 0);
  }

  // ---- painting ---------------------------------------------------------
  // The drawing rule itself lives in paintStroke.ts, next to its twin in
  // api/plan-annotate.js. Change one, change both.

  const redrawInk = useCallback(() => {
    const c = inkRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of strokes) {
      if (s.page !== page) continue;
      // A colour switched off in the layers panel is not drawn. It is still
      // there — hiding a layer is a way of looking, not a way of deleting —
      // so it saves, prints and stamps exactly as before.
      if (hiddenInk.has((s.color ?? '#000').toLowerCase())) continue;
      // The balloon being typed into draws EMPTY: its words are in the text box
      // sitting on top of it, and drawing them here as well shows them twice,
      // half a pixel apart, which reads as a rendering fault.
      paintStroke(ctx, c, s.id === textDraft?.forId ? { ...s, text: '' } : s);
    }
  }, [strokes, page, hiddenInk, textDraft?.forId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { redrawInk(); }, [redrawInk]);

  // autoFocus alone loses this race: the note box mounts while the pointer that
  // opened it is still finishing its press, and the canvas takes focus back.
  useEffect(() => {
    if (!textDraft) return;
    const t = setTimeout(() => textRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [textDraft?.nx, textDraft?.ny]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The picked mark's outline and its two corner grips.
   *
   * Drawn on the live layer, which is cleared and redrawn constantly anyway, so
   * showing a selection costs nothing and never has to be erased by hand.
   */
  function drawPicked() {
    const c = liveRef.current;
    const s = strokes.find(x => x.id === picked);
    if (!c || !s || s.page !== page) return;
    const ctx = c.getContext('2d')!;
    const grips = gripsOf(s);
    if (!grips.length) return;

    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(74,168,216,.9)';
    ctx.lineWidth = Math.max(1, c.width / 900);
    const x0 = Math.min(grips[0].x, grips[1].x) * c.width;
    const x1 = Math.max(grips[0].x, grips[1].x) * c.width;
    const y0 = Math.min(grips[0].y, grips[1].y) * c.height;
    const y1 = Math.max(grips[0].y, grips[1].y) * c.height;
    ctx.strokeRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6);
    ctx.setLineDash([]);

    for (const g of grips) {
      ctx.beginPath();
      ctx.arc(g.x * c.width, g.y * c.height, Math.max(5, c.width / 150), 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = Math.max(1.5, c.width / 700);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Keep the selection drawn as it moves, and take it away when nothing is picked.
  useEffect(() => {
    if (tool !== 'move') return;
    clearLive();
    drawPicked();
  }); // no deps — it must follow every stroke and pick change

  /**
   * How far apart two live samples have to be to be worth keeping, in device
   * pixels. Below this they are indistinguishable on screen.
   */
  const LIVE_MIN_STEP_PX = 1.5;

  /**
   * Drawing a long stroke without the screen locking up.
   *
   * The rule that makes a mark correct — ONE path, filled ONCE, so it cannot
   * darken against itself — is also what made it slow: rebuilding an
   * ever-growing path on every frame is O(points) a frame and O(points²) over
   * a stroke. Measured on an A0 sheet at full resolution, a twenty-second
   * scribble reaches 4,000-odd points, where a single redraw costs 85-120ms.
   * That is the freeze, and it was my doing.
   *
   * The way to keep both: an offscreen buffer holding the stroke SO FAR, drawn
   * at full opacity, and only the NEW points added to it each frame. Overlap
   * inside the buffer is free — the same colour at full opacity painted twice
   * is the same colour — so the tail can safely re-cover its last point and
   * leave no seam. The buffer is then put on screen in one go, at the stroke's
   * real opacity and blend, which is the single composite the rule demands.
   *
   * Per frame that is O(new points), a handful, plus one image blit. The buffer
   * exists only while the pen is down and is released on lift, so a big plan
   * does not carry a fourth full-size canvas around for the rest of the session.
   */
  const liveBuf = useRef<HTMLCanvasElement | null>(null);
  const bufDrawn = useRef(0);
  const liveFrame = useRef(0);

  function startLiveBuffer() {
    const c = liveRef.current;
    if (!c) return;
    const b = liveBuf.current ?? document.createElement('canvas');
    if (b.width !== c.width || b.height !== c.height) { b.width = c.width; b.height = c.height; }
    else b.getContext('2d')!.clearRect(0, 0, b.width, b.height);
    liveBuf.current = b;
    bufDrawn.current = 0;
  }

  function releaseLiveBuffer() {
    const b = liveBuf.current;
    if (!b) return;
    // Zero it out rather than just dropping the reference: a canvas keeps its
    // backing store alive until it is resized, and on an A0 page that is a
    // hundred megabytes.
    b.width = 0; b.height = 0;
    liveBuf.current = null;
    bufDrawn.current = 0;
  }

  /** One redraw per animation frame, however many samples arrived. */
  const scheduleLiveDraw = useCallback(() => {
    if (liveFrame.current) return;
    liveFrame.current = requestAnimationFrame(() => {
      liveFrame.current = 0;
      const d = drawing.current;
      const c = liveRef.current;
      const b = liveBuf.current;
      if (!d || !c || !b || !b.width) return;

      // Add only what is new, starting one point back so the join is covered.
      const from = Math.max(0, bufDrawn.current - 1);
      if (d.pts.length - from >= 2) {
        const tail = d.pts.slice(from);
        const bctx = b.getContext('2d')!;
        paintStroke(bctx, b, {
          ...draftStrokeRef.current(tail, d.tool),
          // Opaque, and never multiply, INSIDE the buffer. The opacity and the
          // blend belong to the one composite that puts it on screen.
          opacity: 1,
          tool: (d.tool === 'highlighter' ? 'marker' : d.tool) as AnnTool,
        });
        bufDrawn.current = d.pts.length;
      }

      const ctx = c.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.save();
      ctx.globalAlpha = opacityRef.current;
      ctx.globalCompositeOperation = d.tool === 'highlighter' ? 'multiply' : 'source-over';
      ctx.drawImage(b, 0, 0);
      ctx.restore();
    });
  }, []);

  /** The frame callback is registered once, so live values come through refs. */
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;

  useEffect(() => () => {
    if (liveFrame.current) cancelAnimationFrame(liveFrame.current);
    releaseLiveBuffer();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function clearLive() {
    if (liveFrame.current) { cancelAnimationFrame(liveFrame.current); liveFrame.current = 0; }
    releaseLiveBuffer();
    const c = liveRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
  }

  // ---- pointer -----------------------------------------------------------

  function norm(e: { clientX: number; clientY: number }) {
    const c = liveRef.current!;
    const r = c.getBoundingClientRect();
    return {
      nx: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      ny: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  /**
   * How near counts as "on it", for the tool that picks things up.
   *
   * The mark radii below are mouse radii: 1.2% of the page, which on a phone
   * showing a whole A3 sheet is four pixels. A fingertip covers forty. So with
   * a finger the move tool could not pick anything up at all and the corner
   * grips could not be grabbed — you were aiming at something you could not
   * see with something you could not aim. A touch therefore gets whichever is
   * larger, the mark's own radius or a finger's worth of the page; a mouse and
   * a pen are left exactly as they were, since they can aim.
   */
  const TAP_SLOP_PX = 20;
  function tapRadius(e: { pointerType?: string }, base: number): number {
    if (e.pointerType !== 'touch') return base;
    const c = liveRef.current;
    const cssW = c ? (parseFloat(c.style.width) || c.width || 1000) : 1000;
    return Math.max(base, TAP_SLOP_PX / Math.max(1, cssW));
  }

  /**
   * Is this point on this mark?
   *
   * The old eraser only compared against the mark's stored POINTS, which for a
   * freehand squiggle is every millimetre of it and for a straight line, an
   * arrow, a box or a circle is just the two corners. So lines could not be
   * rubbed out except by hitting one of their ends exactly, and a box was
   * erasable only at two opposite corners. Each kind is now tested as the shape
   * it actually is.
   */
  function hits(s: AnnStroke, nx: number, ny: number, r: number): boolean {
    const p = s.pts;
    if (p.length < 2) return false;
    const ax = p[0], ay = p[1];
    const zx = p[p.length - 3], zy = p[p.length - 2];

    if (s.tool === 'text') {
      // Its box hangs down-right of the anchor.
      const w = Math.max(0.05, (s.text ?? '').length * (s.fontSize ?? 16) * 0.5 / REF);
      const h = ((s.fontSize ?? 16) * 1.4) / REF;
      return nx > ax - r && nx < ax + w + r && ny > ay - r && ny < ay + h + r;
    }
    if (s.tool === 'rect' || s.tool === 'bubble') {
      const x0 = Math.min(ax, zx) - r, x1 = Math.max(ax, zx) + r;
      const y0 = Math.min(ay, zy) - r, y1 = Math.max(ay, zy) + r;
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) return false;
      if (s.tool === 'bubble') return true;              // filled, so anywhere inside
      const inx = Math.min(ax, zx) + r, inX = Math.max(ax, zx) - r;
      const iny = Math.min(ay, zy) + r, inY = Math.max(ay, zy) - r;
      return !(nx > inx && nx < inX && ny > iny && ny < inY);   // the outline only
    }
    if (s.tool === 'ellipse') {
      const cx = (ax + zx) / 2, cy = (ay + zy) / 2;
      const rx = Math.abs(zx - ax) / 2 || 1e-4, ry = Math.abs(zy - ay) / 2 || 1e-4;
      const d = Math.hypot((nx - cx) / rx, (ny - cy) / ry);
      return Math.abs(d - 1) < r / Math.min(rx, ry) + 0.12;
    }
    if (s.tool === 'line' || s.tool === 'arrow') return nearSegment(nx, ny, ax, ay, zx, zy) < r;

    // Freehand: near any segment of the path, not merely near a stored point —
    // a fast stroke's points can be far apart.
    for (let i = 0; i + 4 < p.length; i += 3) {
      if (nearSegment(nx, ny, p[i], p[i + 1], p[i + 3], p[i + 4]) < r) return true;
    }
    return Math.hypot(ax - nx, ay - ny) < r;
  }

  /**
   * Erase.
   *
   * Two tools, because the two jobs are genuinely different and doing both with
   * one is what made the old one frustrating:
   *
   *  - "Erase whole" takes the entire mark you touch. That is what you want for
   *    a box, an arrow, or a squiggle you have finished with.
   *  - "Eraser" takes only the part you pass over, like a real one. A freehand
   *    stroke is cut where you rub and the two halves stay, so you can clean up
   *    the end of a line without losing the line.
   *
   * A box, a circle, a balloon or a note has no meaningful half, so the normal
   * eraser takes those whole as well rather than pretending otherwise. A plain
   * line does split, since half a line is still a line — but an arrow does not,
   * because the half without the head is no longer an arrow.
   */
  const SPLITTABLE = new Set(['pen', 'pencil', 'marker', 'highlighter', 'line']);

  function eraseAt(nx: number, ny: number, whole: boolean) {
    const radius = (width / REF) * 0.55 + 0.004;

    if (whole) {
      let hit = false;
      for (const s of strokes) {
        if (s.page !== page || erased.current.has(s.id)) continue;
        if (hits(s, nx, ny, radius)) { erased.current.add(s.id); hit = true; }
      }
      if (hit) setStrokes(prev => prev.filter(s => !erased.current.has(s.id)));
      return;
    }

    let changed = false;
    const next: AnnStroke[] = [];
    for (const s of strokes) {
      if (s.page !== page || !hits(s, nx, ny, radius)) { next.push(s); continue; }
      if (!SPLITTABLE.has(s.tool)) { changed = true; continue; }        // taken whole

      // A straight line is only two stored points, so rubbing its middle would
      // do nothing visible. Walk it at the eraser's own resolution instead, and
      // the pieces that survive come back as lines.
      const src = s.tool === 'line' ? densify(s.pts, radius / 2) : s.pts;

      const runs: number[][] = [];
      let run: number[] = [];
      for (let i = 0; i + 2 < src.length; i += 3) {
        if (Math.hypot(src[i] - nx, src[i + 1] - ny) < radius) {
          if (run.length >= 6) runs.push(run);
          run = [];
        } else {
          run.push(src[i], src[i + 1], src[i + 2]);
        }
      }
      if (run.length >= 6) runs.push(run);

      changed = true;
      runs.forEach((pts, i) => next.push({
        ...s,
        // Freehand from here on: what is left of a rubbed line is a polyline,
        // and an arrow head or a snap would be wrong on it.
        tool: s.tool === 'line' ? 'pen' : s.tool,
        id: `${s.id}~${i}`,
        pts,
      }));
    }
    if (changed) setStrokes(next);
  }

  /** Add points along a two-point mark so it can be rubbed anywhere along it. */
  function densify(pts: number[], step: number): number[] {
    if (pts.length < 6) return pts;
    const out: number[] = [];
    for (let i = 0; i + 5 < pts.length; i += 3) {
      const [ax, ay, aw, bx, by] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3], pts[i + 4]];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(1e-4, step)));
      for (let k = 0; k < n; k++) out.push(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, aw);
    }
    out.push(pts[pts.length - 3], pts[pts.length - 2], pts[pts.length - 1]);
    return out;
  }

  /**
   * Where a balloon's words sit, as percentages of the plan.
   *
   * The balloon IS the text box now — you type inside it rather than into a
   * pop-up that appears somewhere else and then teleports its words into the
   * shape. That only works if the box is in EXACTLY the place the renderer will
   * draw the text, so both sides go through bubbleTextBox() and this converts
   * its answer into the percentages the overlay needs.
   *
   * The x and y fractions are measured against different dimensions, so the
   * padding has to be converted twice — using one for both is what would make
   * the box drift on a landscape sheet.
   */
  function bubbleBox(s: AnnStroke) {
    const c = liveRef.current;
    const aspect = c && c.height ? c.width / c.height : 1.414;
    const dpr = c ? c.width / Math.max(1, parseFloat(c.style.width) || c.width) : 1;
    const last = s.pts.length - 3;
    const x0 = Math.min(s.pts[0], s.pts[last]), x1 = Math.max(s.pts[0], s.pts[last]);
    const y0 = Math.min(s.pts[1], s.pts[last + 1]), y1 = Math.max(s.pts[1], s.pts[last + 1]);
    const baseX = Math.max(0.5, s.width) / REF;
    const baseY = baseX * aspect;
    const tail = Math.min(baseY * 8, (y1 - y0) * 0.32);
    const box = bubbleTextBox(x0, y0, x1 - x0, y1 - tail - y0, baseX);
    // bubbleTextBox pads both axes with the x-based figure; correct the y one.
    const padY = baseY * 4, padX = baseX * 4;
    return {
      left: box.x * 100,
      top: (y0 + padY) * 100,
      width: box.w * 100,
      height: Math.max(0.02, (y1 - tail - y0 - padY * 2)) * 100,
      /** CSS pixels, so the typed words are the size the drawn ones will be. */
      fontPx: Math.max(7, (s.fontSize ?? 15) * ((c?.width ?? REF) / REF)) / dpr,
      padX, padY,
    };
  }

  /**
   * The two corners of the picked mark, in normalised coordinates.
   *
   * Only marks stored as two points have corners; a freehand squiggle has
   * hundreds and dragging one of them would deform it rather than resize it.
   */
  const GRIPPABLE = new Set(['bubble', 'rect', 'ellipse', 'line', 'arrow']);
  function gripsOf(s: AnnStroke | undefined): { id: 'a' | 'z'; x: number; y: number }[] {
    if (!s || !GRIPPABLE.has(s.tool) || s.pts.length < 6) return [];
    const last = s.pts.length - 3;
    return [
      { id: 'a', x: s.pts[0], y: s.pts[1] },
      { id: 'z', x: s.pts[last], y: s.pts[last + 1] },
    ];
  }

  function handleAt(nx: number, ny: number, r = 0.014): 'a' | 'z' | null {
    const s = strokes.find(x => x.id === picked);
    for (const g of gripsOf(s)) {
      if (Math.hypot(g.x - nx, g.y - ny) < r) return g.id;
    }
    return null;
  }

  /** The mark under a point, topmost first — what the move tool picks up. */
  function markAt(nx: number, ny: number, r = 0.012): AnnStroke | null {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      if (s.page !== page) continue;
      if (hits(s, nx, ny, r)) return s;
    }
    return null;
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (locked || tool === 'pan') return;

    /**
     * The hand holding the pencil.
     *
     * Resting a palm on the glass is how people write, so it arrives on nearly
     * every stroke — and about half the time it lands FIRST, which is exactly
     * the case the old "ignore the second contact" rule could not cover: the
     * palm claimed the stroke and the nib was then turned away as the second
     * contact. A pen coming down now disowns a touch that began moments ago,
     * and a finger is ignored outright while a pen is in play.
     */
    notePointer(e.nativeEvent);
    lastPointerType.current = e.pointerType || 'mouse';
    if (isPalm(e.nativeEvent)) return;
    if (isPen(e.nativeEvent) && drawing.current && touchWasPalm()) {
      drawing.current = null;
      releaseLiveBuffer();
      clearLive();
    }

    const { nx: dnx, ny: dny } = norm(e);

    // The move tool picks something up rather than laying something down.
    if (tool === 'move') {
      // A corner of whatever is already picked resizes it. Checked before the
      // hit test, or grabbing a handle would simply select what is underneath.
      const grip = handleAt(dnx, dny, tapRadius(e, 0.014));
      if (grip) {
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        const s = strokes.find(x => x.id === picked)!;
        moving.current = { id: s.id, nx: dnx, ny: dny, pts: [...s.pts], grip };
        return;
      }
      const hit = markAt(dnx, dny, tapRadius(e, 0.012));
      /**
       * A finger has no double-click.
       *
       * Retyping a balloon was a double-click, and two quick taps do not
       * reliably reach the page as one — the phone reserves the gesture for
       * zooming — so on a phone your own words could not be got back at. The
       * touch rule is the one the board already uses and the one every phone
       * uses: tap to pick it out, tap the picked one to open it. It has to be
       * read HERE, before the next line picks the mark, or the answer is
       * always yes and the first tap opens it, leaving no gesture that means
       * "I mean this one". A drag still moves it — see onUp.
       */
      const already = !!hit && picked === hit.id;
      setPicked(hit?.id ?? null);
      if (hit) {
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        moving.current = {
          id: hit.id, nx: dnx, ny: dny, pts: [...hit.pts],
          tapOpens: already && e.pointerType === 'touch' && hit.tool === 'bubble',
        };
      }
      return;
    }
    // A pen touching down should draw even if a palm lands too — ignore any
    // second contact once a pen stroke is running.
    if (drawing.current) return;
    const nx = dnx, ny = dny;

    if (tool === 'text') {
      setTextDraft({ nx, ny, value: '' });
      return;
    }
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    e.preventDefault();

    if (isEraser) {
      erased.current = new Set();
      drawing.current = { pen: new PenStroke({ sensitivity: 0 }), pts: [], startedAt: Date.now() };
      eraseAt(nx, ny, tool === 'eraser-object');
      return;
    }

    // Flipping the pen over changes the tool, because that is what the pen is
    // for. See nibFlip().
    const drawWith = nibFlip(e.nativeEvent);
    const pre = toolById(drawWith);

    // A bare finger on a phone: its contact patch is the shape of the hand,
    // not the pressure of a nib. See PenOptions.finger.
    const pen = new PenStroke({
      sensitivity: pre.sensitivity * sens,
      finger: compact && e.pointerType === 'touch',
    });
    const s = pen.push(e.nativeEvent, performance.now());
    drawing.current = {
      pen, pts: [{ x: nx, y: ny, w: s.w }], startedAt: Date.now(), tool: drawWith,
    };
    if (pre.freehand) startLiveBuffer();
    setPenSource(pen.usedSource);
  }

  /**
   * The Samsung pen is double-ended: flip it and the highlighter comes up, flip
   * it back and you are on the pen again.
   *
   * The panel has no button and no pressure — the only thing it can tell us
   * about which end is down is the size of the contact patch, so NibWatch
   * learns the two sizes and reports which one this is.
   *
   * It only ever swaps between the INK tools. If you have deliberately picked
   * the arrow, or the eraser, or text, flipping the pen must not silently take
   * that away from you — and coming back from the fat nib returns you to the ink
   * tool you were actually using, not always to the pen.
   */
  function nibFlip(e: PointerEvent): string {
    if (locked || !INK_TOOLS.has(tool)) return tool;
    // The panel this is for is 75 or 86 inches across, so a phone-sized screen
    // is proof there is no dual-nib pen here — and a hand on its own produces
    // two contact sizes far enough apart to be read as a flip, which would
    // hand you the highlighter in the middle of a sentence.
    const nib = nibs.current.see(Math.max(e.width ?? 0, e.height ?? 0), { finger: compact });
    if (!nib) return tool;

    if (nib === 'fat' && tool !== FAT_NIB_TOOL) {
      thinNibTool.current = tool;
      setTool(FAT_NIB_TOOL);
      setWidth(toolById(FAT_NIB_TOOL).width);
      setOpacity(toolById(FAT_NIB_TOOL).opacity);
      if (!HIGHLIGHT_COLORS.includes(color)) setColor(HIGHLIGHT_COLORS[0]);
      return FAT_NIB_TOOL;
    }
    if (nib === 'thin' && tool === FAT_NIB_TOOL) {
      const back = thinNibTool.current;
      setTool(back);
      setWidth(toolById(back).width);
      setOpacity(toolById(back).opacity);
      if (HIGHLIGHT_COLORS.includes(color)) setColor(INK_COLORS[0]);
      return back;
    }
    return tool;
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    // A palm dragging across the glass must not extend the pen's stroke.
    notePointer(e.nativeEvent);
    lastPointerType.current = e.pointerType || 'mouse';
    if (isPalm(e.nativeEvent)) return;

    // The nib follows the pointer whatever else is happening, so the width is
    // chosen by looking at it rather than by drawing a test line. While ink is
    // actually flowing it is moved straight on the element — see nibElRef.
    if (showNib) {
      const ghost = nibElRef.current;
      if (ghost && drawing.current && !isEraser) {
        ghost.style.left = `${e.clientX}px`;
        ghost.style.top = `${e.clientY}px`;
      } else setNibAt({ x: e.clientX, y: e.clientY });
    }

    // Dragging something already drawn.
    const m = moving.current;
    if (m) {
      e.preventDefault();
      const { nx, ny } = norm(e);
      const dx = nx - m.nx, dy = ny - m.ny;
      m.moved = true;
      // A finger never holds perfectly still, so a tap arrives with a few
      // pixels of travel in it. Past this much it was meant as a drag, and the
      // second-tap-to-open rule stands down.
      if (Math.abs(dx) > 0.012 || Math.abs(dy) > 0.012) m.tapOpens = false;

      if (m.grip) {
        /**
         * Resizing a two-corner mark.
         *
         * A bubble, box, circle, line or arrow is stored as two points, so
         * changing its size is a matter of moving the corner you grabbed and
         * leaving the other one alone. Freehand has no corners to grab and is
         * only ever moved.
         */
        const p = [...m.pts];
        const last = p.length - 3;
        const [ix, iy] = m.grip === 'a' ? [0, 1] : [last, last + 1];
        p[ix] = m.pts[ix] + dx;
        p[iy] = m.pts[iy] + dy;
        setStrokes(prev => prev.map(s => (s.id === m.id ? { ...s, pts: p } : s)));
        return;
      }

      const moved = m.pts.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v));
      setStrokes(prev => prev.map(s => (s.id === m.id ? { ...s, pts: moved } : s)));
      return;
    }

    const d = drawing.current;
    if (!d) return;
    e.preventDefault();

    if (isEraser) {
      const { nx, ny } = norm(e);
      eraseAt(nx, ny, tool === 'eraser-object');
      return;
    }

    if (preset.freehand) {
      // Coalesced samples matter: a pen faster than the refresh rate otherwise
      // draws visibly faceted lines.
      /**
       * Keeping the live stroke both CORRECT and cheap.
       *
       * The whole stroke is redrawn through the same paintStroke() the finished
       * mark uses — drawing only the newest segment is what beaded the line and
       * darkened the highlighter, and it also meant what you saw while drawing
       * was not what you got when you let go.
       *
       * But a redraw is O(points), and doing one per coalesced sample is
       * O(points²). Measured on an A0 sheet: 3,000 points cost 43ms for a
       * SINGLE redraw, and drawing that stroke cost 1.5 seconds of redraw work
       * in total. That is the freeze. Two things bring it back, and neither
       * touches how the mark is drawn:
       *
       *  - **Decimate as we go.** A sample closer than a pixel and a half to the
       *    last one adds nothing you can see, so it is folded into it — keeping
       *    the LARGER width, so a pressure peak is never thrown away. A long
       *    scribble settles at a few hundred points instead of thousands.
       *  - **Redraw once per frame.** Coalesced events arrive in bursts of ten
       *    or more; drawing ten times before the screen updates is nine wasted
       *    redraws. One animation frame, one redraw.
       */
      const c = liveRef.current!;
      const stepX = LIVE_MIN_STEP_PX / Math.max(1, c.width);
      const stepY = LIVE_MIN_STEP_PX / Math.max(1, c.height);
      for (const raw of samplesOf(e.nativeEvent)) {
        const { nx, ny } = norm(raw);
        const s = d.pen.push(raw, performance.now());
        const last = d.pts[d.pts.length - 1];
        if (last && Math.abs(nx - last.x) < stepX && Math.abs(ny - last.y) < stepY) {
          if (s.w > last.w) last.w = s.w;
          continue;
        }
        d.pts.push({ x: nx, y: ny, w: s.w });
      }
      scheduleLiveDraw();
      setPenSource(d.pen.usedSource);
    } else {
      let { nx, ny } = norm(e);
      const a = d.pts[0];
      if (e.shiftKey) {
        if (preset.snappable) {
          const c = liveRef.current!;
          const dx = (nx - a.x) * c.width, dy = (ny - a.y) * c.height;
          const step = Math.PI / 12;
          const ang = Math.round(Math.atan2(dy, dx) / step) * step;
          const len = Math.hypot(dx, dy);
          nx = a.x + (Math.cos(ang) * len) / c.width;
          ny = a.y + (Math.sin(ang) * len) / c.height;
        } else {
          const c = liveRef.current!;
          const side = Math.max(Math.abs(nx - a.x) * c.width, Math.abs(ny - a.y) * c.height);
          nx = a.x + Math.sign(nx - a.x) * (side / c.width);
          ny = a.y + Math.sign(ny - a.y) * (side / c.height);
        }
      }
      d.pts = [a, { x: nx, y: ny, w: 1 }];
      clearLive();
      paintStroke(liveRef.current!.getContext('2d')!, liveRef.current!, draftStroke(d.pts));
    }
  }

  /**
   * The frame callback is registered once, so it reads draftStroke through a
   * ref rather than closing over a stale tool, colour and width.
   */
  const draftStrokeRef = useRef<(pts: PenSample[], asTool?: string) => AnnStroke>(() => ({
    id: 'draft', page: 0, tool: 'pen', color: '#000', width: 1, opacity: 1, pts: [],
  }));

  function draftStroke(pts: PenSample[], asTool: string = tool): AnnStroke {
    return {
      id: 'draft', page, tool: asTool as AnnTool, color, width, opacity,
      pts: pts.flatMap(p => [p.x, p.y, p.w]),
    };
  }

  draftStrokeRef.current = draftStroke;

  /**
   * The browser took the gesture away.
   *
   * A pointercancel is not a lift: it means a second finger arrived, or the
   * system claimed the touch. Committing what had been drawn so far — which is
   * what routing this to onUp did — leaves a stray line across the plan from
   * wherever the first finger happened to land every time somebody pinches.
   */
  function onCancelDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch { /* gone */ }
    // What had already landed in the marks stays — a cancel abandons the
    // stroke in the air, it is not an undo — so a drag or a rub that was
    // under way still counts as a change, or the autosave would not see it.
    if (moving.current?.moved || (drawing.current && isEraser)) { setRedo([]); setDirty(true); }
    erased.current = new Set();
    cancelStroke();
    setNibAt(null);
  }

  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const m = moving.current;
    if (m) {
      moving.current = null;
      try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch { /* gone */ }
      // A finger's second tap on the balloon it already picked opens the words
      // for retyping — the touch stand-in for the double-click.
      if (m.tapOpens) {
        const host = strokes.find(s => s.id === m.id);
        if (host) {
          setTextDraft({ nx: m.nx, ny: m.ny, value: host.text ?? '', forId: host.id });
          return;
        }
      }
      if (m.moved) { setRedo([]); setDirty(true); }
      return;
    }
    const d = drawing.current;
    drawing.current = null;
    try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    if (!d) return;

    if (isEraser) {
      // The partial eraser rewrites strokes rather than collecting ids, so it
      // marks itself dirty as it goes; the whole-mark one is counted here.
      setRedo([]); setDirty(true);
      erased.current = new Set();
      return;
    }

    // The tool the stroke STARTED with. Flipping the pen mid-air changes the
    // tool at pointerdown, and React has not necessarily re-rendered by the time
    // the first sample arrives — so the stroke carries its own answer.
    const drewWith = d.tool ?? tool;
    const pre = toolById(drewWith);

    const pts = pre.freehand ? simplify(d.pts, 0.0006) : d.pts;
    // A tap with a shape tool is a mis-click, not a zero-size box.
    if (!pre.freehand && pts.length > 1 && Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) < 0.004) {
      clearLive(); return;
    }
    if (!pts.length) { clearLive(); return; }

    const s: AnnStroke = {
      id: `S-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      page, tool: drewWith as AnnTool, color, width, opacity,
      pts: pts.flatMap(p => [
        Math.round(p.x * 1e4) / 1e4,
        Math.round(p.y * 1e4) / 1e4,
        Math.round(p.w * 100) / 100,
      ]),
    };
    setStrokes(prev => [...prev, s]);
    setRedo([]);
    setDirty(true);
    clearLive();

    // A balloon with nothing in it is not a balloon, so it goes straight into
    // typing — anchored to the box that was just drawn.
    if (drewWith === 'bubble') {
      const x0 = Math.min(pts[0].x, pts[pts.length - 1].x);
      const y0 = Math.min(pts[0].y, pts[pts.length - 1].y);
      setTextDraft({ nx: x0 + 0.008, ny: y0 + 0.01, value: '', forId: s.id });
    }
  }

  function commitText() {
    if (!textDraft) return;
    const v = textDraft.value.trim();
    const target = textDraft.forId;
    setTextDraft(null);
    if (target) {
      // The words belong to the balloon, not to a separate text mark, so
      // moving or erasing the balloon takes them with it.
      setStrokes(prev => prev.map(s => (s.id === target
        ? { ...s, text: v, bold, fontSize: s.fontSize ?? Math.max(9, width * 4 + 11) } : s)));
      setDirty(true);
      return;
    }
    if (!v) return;
    setStrokes(prev => [...prev, {
      id: `S-${Date.now().toString(36)}`,
      page, tool: 'text', color, width: 0, opacity, bold,
      fontSize: Math.max(8, width * 5 + 10),
      text: v,
      pts: [textDraft.nx, textDraft.ny, 1],
    }]);
    setRedo([]); setDirty(true);
  }

  /**
   * Saving you never have to think about.
   *
   * Three separate clocks, because the two destinations have completely
   * different costs:
   *
   *  - **Here, instantly.** The moment you lift the pen the version is written
   *    into the app's own data. That costs nothing and means the markup exists
   *    the instant it is drawn.
   *  - **Drive, once you stop.** Stamping a PDF and uploading it is a real piece
   *    of work on a real plan, so it waits until nothing has happened for a few
   *    seconds. Drawing forty marks makes one upload, not forty.
   *  - **The tab, if you leave early.** Between the two there is a window where
   *    the markup is safe here but not yet in Drive. Closing the tab in that
   *    window is the one way to lose it, so the browser is asked to stop you.
   */
  const DRIVE_IDLE_MS = 9_000;
  const [saveState, setSaveState] = useState<'clean' | 'local' | 'sending' | 'sent' | 'failed'>('clean');
  const idleTimer = useRef<number | undefined>(undefined);
  const versionIdRef = useRef<string | null>(null);
  const pushingRef = useRef(false);

  /** The strokes as the server wants them, minus our own ids. */
  const strokesForDrive = useCallback(
    () => strokes.map(({ id: _id, ...rest }) => rest),
    [strokes],
  );

  /**
   * The number this sketch will be filed as, claimed ONCE and then held.
   *
   * `nextVersion` is derived from the saved list, so the instant the working
   * sketch is kept, it counts one higher. Reading it inside the autosave meant
   * every save changed the very value the save depended on: keep → the list
   * grows → `nextVersion` moves → the callback is a new function → the effect
   * fires again → keep again, for ever. React gave up with "maximum update
   * depth exceeded" and took the whole app down with it, on the first mark.
   *
   * The number is claimed when the sketch first reaches the store and held
   * until the sketch is finished with, so nothing downstream of a save can
   * feed back into it. `nextVersion` is read through a ref for the same
   * reason — it must not be a dependency of anything that saves.
   */
  const sketchVersion = useRef<number | null>(null);
  const nextVersionRef = useRef(nextVersion);
  nextVersionRef.current = nextVersion;

  const claimVersion = useCallback(() => {
    if (sketchVersion.current == null) sketchVersion.current = nextVersionRef.current;
    return sketchVersion.current;
  }, []);

  /** Begin a fresh working sketch: new record, new number. */
  const startNewSketch = useCallback(() => {
    versionIdRef.current = null;
    sketchVersion.current = null;
  }, []);

  /**
   * One version per sketch, updated in place — not one per mark.
   *
   * A version per mark would give a list of two hundred, of which only the last
   * is any use. This keeps the working sketch as a single record that grows,
   * and "Start a blank sketch" is what begins a new one.
   */
  const keepLocally = useCallback(() => {
    if (locked || !strokes.length) return;
    const id = versionIdRef.current
      ?? `PA-${planFileId.slice(0, 8)}-${claimVersion()}-${Date.now().toString(36)}`;
    versionIdRef.current = id;
    savePlanAnnotation({
      id, apartmentId, planFileId, planName,
      version: claimVersion(),
      strokes,
      pageCount: doc?.numPages ?? 1,
      createdAt: new Date().toISOString(),
      createdBy: who || authorName,
      basedOn,
    });
    setSaveState('local');
  }, [locked, strokes, planFileId, claimVersion, apartmentId, planName, doc, who, authorName, basedOn, savePlanAnnotation]);

  const pushToDrive = useCallback(async () => {
    if (pushingRef.current || locked || !strokes.length) return;
    if (!backendReady || !(plansFolderId || parentFolderId)) return;   // nowhere to put it
    pushingRef.current = true;
    setSaveState('sending');
    try {
      const out = await stampPlanToDrive({
        planFileId,
        parentFolderId: plansFolderId || parentFolderId!,
        strokes: strokesForDrive(),
        version: claimVersion(),
        jobName: apartmentLabel,
        author: who || authorName,
      });
      if (versionIdRef.current) {
        updatePlanAnnotation(versionIdRef.current, {
          driveFileId: out.fileId, driveUrl: out.webViewLink,
        });
      }
      setSaveState('sent');
    } catch {
      setSaveState('failed');
    } finally {
      pushingRef.current = false;
    }
  }, [locked, strokes.length, backendReady, plansFolderId, parentFolderId, planFileId,
      strokesForDrive, claimVersion, apartmentLabel, who, authorName, updatePlanAnnotation]);

  // Every change: keep it here now, and set the clock running for Drive.
  useEffect(() => {
    if (!dirty || locked || !strokes.length) return;
    keepLocally();
    clearTimeout(idleTimer.current);
    setDriveIn(Math.round(DRIVE_IDLE_MS / 1000));
    idleTimer.current = window.setTimeout(() => { void pushToDrive(); }, DRIVE_IDLE_MS);
    return () => clearTimeout(idleTimer.current);
  }, [strokes, dirty, locked, keepLocally, pushToDrive]);

  /**
   * The seconds still to go before Drive gets it.
   *
   * Shown as a number inside the arrow rather than described in words: the
   * question somebody actually has, standing over a plan they have just marked
   * up, is "how long until this is safe", and a count answers it without
   * anybody reading a sentence.
   */
  const [driveIn, setDriveIn] = useState(0);
  /** Reset asks first; closing before Drive has it asks too. */
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => {
    if (saveState !== 'local' || driveIn <= 0) return;
    const t = window.setInterval(() => setDriveIn(n => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [saveState, driveIn]);

  /**
   * Leaving before Drive has it.
   *
   * The browser only lets a page ASK, and only when the user has interacted
   * with it — which after drawing on a plan they certainly have. It shows its
   * own wording, so the message here is for the browsers that still honour a
   * custom one.
   */
  useEffect(() => {
    if (saveState !== 'local' && saveState !== 'sending') return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = 'Your markup is saved here but has not reached Drive yet. '
        + 'Give it a few seconds.';
      return e.returnValue;
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  // ---- history -----------------------------------------------------------
  function undo() {
    setStrokes(prev => {
      if (!prev.length) return prev;
      setRedo(r => [...r, prev[prev.length - 1]]);
      return prev.slice(0, -1);
    });
    setDirty(true);
  }
  function redoOne() {
    setRedo(prev => {
      if (!prev.length) return prev;
      setStrokes(s => [...s, prev[prev.length - 1]]);
      return prev.slice(0, -1);
    });
    setDirty(true);
  }

  useEffect(() => {
    function key(e: KeyboardEvent) {
      const inField = (e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA|SELECT/);
      // Guard on the draft as well as the target: while a note is open every
      // letter belongs to it, and focus can be a frame behind the state.
      if (inField || textDraft) {
        if (e.key === 'Escape') setTextDraft(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault(); e.shiftKey ? redoOne() : undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redoOne(); }
      // Escape backs out one step at a time. Closing the whole studio because a
      // panel happened to be open loses the sketch's context for no reason.
      //
      // Neither Escape nor the X asks "save or discard?" — being interrogated
      // every time you glance at a plan is the kind of prompt people learn to
      // dismiss without reading, and the markup is still here when you return.
      if (e.key === 'Escape') {
        // A question on top owns the key. Without this, one Escape dismissed
        // the question AND closed the studio behind it — so backing out of
        // "rub every mark off?" threw you out of the plan as well.
        if (confirmReset || confirmClose) return;
        if (textDraft) setTextDraft(null);
        else if (showPalette) setShowPalette(false);
        else if (showMore) setShowMore(false);
        else if (showLayers) setShowLayers(false);
        else if (showDownload) setShowDownload(false);
        else if (showPlans) setShowPlans(false);
        else if (picked) setPicked(null);
        else onClose();
      }
      if (!readOnly && !e.ctrlKey && !e.metaKey) {
        const map: Record<string, string> = {
          p: 'pen', n: 'pencil', m: 'marker', h: 'highlighter', e: 'eraser',
          l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', t: 'text', v: 'pan',
          s: 'move', b: 'bubble', d: 'eraser-object',
        };
        if (map[e.key.toLowerCase()]) pick(map[e.key.toLowerCase()]);
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }); // no dep array — the handler closes over live state and is cheap to reattach

  function pick(id: string) {
    setTool(id);
    const p = toolById(id);
    if (p.width) setWidth(p.width);
    setOpacity(p.opacity);
    if (id === 'highlighter' && !HIGHLIGHT_COLORS.includes(color)) setColor(HIGHLIGHT_COLORS[0]);
    if (id !== 'highlighter' && HIGHLIGHT_COLORS.includes(color)) setColor(INK_COLORS[0]);
  }

  // ---- versions ----------------------------------------------------------

  function loadVersion(v: PlanAnnotation, continueIt: boolean) {
    // Whatever happens next is a NEW sketch — carrying on from version 3 makes
    // version 4, it does not write back over 3.
    startNewSketch();
    setStrokes(v.strokes ?? []);
    setRedo([]);
    setBasedOn(continueIt ? v.version : undefined);
    setDirty(continueIt);
    setPage(0);
    onToast?.(continueIt
      ? `Carrying on from version ${v.version} — saving makes version ${nextVersion}`
      : `Showing version ${v.version}`);
  }

  function newSketch() {
    // Nothing is actually at risk: drawing keeps a version here as you go, so
    // the marks are already in the list on the left. The question is only
    // whether you meant to start again.
    if (strokes.length && !window.confirm('Start a fresh sketch? What is on the plan now stays in the version list.')) return;
    startNewSketch();
    setStrokes([]); setRedo([]); setBasedOn(undefined); setDirty(false);
  }

  /** Wipe just the sheet you are looking at, on a multi-page set. */
  function clearPage() {
    if (!strokes.some(s => s.page === page)) return;
    setStrokes(prev => prev.filter(s => s.page !== page));
    setRedo([]); setDirty(true);
  }

  async function save() {
    if (!strokes.length) { onToast?.('Nothing to save yet.', 'error'); return; }
    if (!backendReady || !parentFolderId) {
      // Still worth keeping: the markup lives in the app and can be printed,
      // it just cannot be filed in Drive without the folder and the upload key.
      storeVersion();
      onToast?.(parentFolderId
        ? 'Saved here. Drive filing is off until the upload key is set.'
        : 'Saved here. Set the job\'s Drive folder to file a PDF copy too.', 'error');
      return;
    }
    setSaving(true);
    try {
      const out = await stampPlanToDrive({
        planFileId,
        // Inside the Engineered Plans folder when we know it — the markup of a
        // plan is a plan, and that is where the office goes looking. The job's
        // main folder is only the fallback.
        parentFolderId: plansFolderId || parentFolderId,
        strokes: strokes.map(({ id: _id, ...rest }) => rest), // ids are ours, not the PDF's
        version: claimVersion(),
        jobName: apartmentLabel,
        author: who || authorName,
      });
      storeVersion(out.fileId, out.webViewLink);
      onToast?.(`Version ${claimVersion()} filed in Drive under “Annotated Plans”.`);
    } catch (err) {
      storeVersion();
      onToast?.(`Saved here, but Drive refused it: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  function storeVersion(driveFileId?: string, driveUrl?: string) {
    // The SAME record the autosave has been keeping, not a second copy of it.
    // Pressing Save used to mint a fresh id and a fresh number, so a sketch
    // that had already been kept once appeared twice in the version list.
    const id = versionIdRef.current
      ?? `PA-${planFileId.slice(0, 8)}-${claimVersion()}-${Date.now().toString(36)}`;
    versionIdRef.current = id;
    savePlanAnnotation({
      id,
      apartmentId, planFileId, planName,
      version: claimVersion(),
      strokes,
      pageCount: doc?.numPages ?? 1,
      createdAt: new Date().toISOString(),
      createdBy: who || authorName,
      basedOn,
      driveFileId, driveUrl,
    });
    setDirty(false);
    setBasedOn(undefined);
  }

  // ---- print -------------------------------------------------------------

  /**
   * Print what is on screen, markup included.
   *
   * Every page is re-rendered offscreen with its ink composited on, so this is
   * exactly what you are looking at — and it works with no network and no
   * saving, which is what you want when someone is walking out to site.
   */
  /**
   * Which pages an export should cover.
   *
   * Rendering every page was fine on a two-page detail and catastrophic on a
   * real set: a 480-sheet A0 drawing rendered at scale 2 and inlined as JPEG is
   * tens of gigabytes of canvas and a hung tab. Above a handful of pages it
   * asks, and the page you are looking at is the default answer — which is what
   * somebody printing a plan almost always wants anyway.
   */
  const BULK_LIMIT = 12;
  function pagesToExport(what: string): number[] | null {
    if (!doc) return null;
    if (doc.numPages <= BULK_LIMIT) return Array.from({ length: doc.numPages }, (_, i) => i);
    const all = window.confirm(
      `This plan has ${doc.numPages} pages.\n\n`
      + `OK — ${what} all ${doc.numPages} of them. On a set this size that takes a long `
      + `time and a lot of memory.\n`
      + `Cancel — just page ${page + 1}, the one you are looking at.`,
    );
    return all ? Array.from({ length: doc.numPages }, (_, i) => i) : [page];
  }

  async function print() {
    if (!doc) return;
    const wanted = pagesToExport('print');
    if (!wanted) return;
    onToast?.('Building the print sheet…');
    const imgs: string[] = [];
    for (const i of wanted) {
      const p = await doc.getPage(i + 1);
      const vp = p.getViewport({ scale: 2 });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await p.render({ canvasContext: ctx, viewport: vp }).promise;
      for (const s of strokes) if (s.page === i) paintStroke(ctx, c, s);
      imgs.push(c.toDataURL('image/jpeg', 0.92));
    }
    const w = window.open('', '_blank');
    if (!w) { onToast?.('Your browser blocked the print window.', 'error'); return; }
    w.document.write(`<!doctype html><title>${planName || 'Plan'} — ${apartmentLabel}</title>
      <style>
        @page { margin: 8mm; }
        body { margin:0; font:12px Segoe UI,Helvetica,Arial,sans-serif; }
        .hd { padding:6px 2px 10px; color:#374151; display:flex; justify-content:space-between; }
        img { width:100%; display:block; page-break-after:always; }
        img:last-child { page-break-after:auto; }
      </style>
      <div class="hd"><b>${apartmentLabel} — ${planName || 'Plan'}</b>
        <span>${strokes.length} mark${strokes.length === 1 ? '' : 's'} · `
      + `${wanted.length} of ${doc.numPages} page${doc.numPages === 1 ? '' : 's'} · `
      + `${new Date().toLocaleString()}</span></div>
      ${imgs.map(src => `<img src="${src}">`).join('')}`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  }

  // ---- download ----------------------------------------------------------

  /** The newest saved version of THIS plan, when there is one. */
  const latest = versions[0];

  /**
   * The PDF is the saved one, because that is the file with the layer in it.
   *
   * We cannot build a PDF in the browser — the point of the whole server route
   * is that the original's bytes are not ours to touch here. So this hands over
   * the version that was filed, and says so plainly when there is not one yet.
   */
  async function downloadPdf() {
    if (latest?.driveFileId) {
      window.open(`https://drive.google.com/uc?export=download&id=${latest.driveFileId}`, '_blank');
      return;
    }
    onToast?.('Save it first — the PDF is stamped on the server from the original plan.', 'error');
  }

  /**
   * Pictures, straight from what is on screen.
   *
   * Works with no network and without saving, which is the case this is for:
   * somebody about to walk out of the office wanting the marked-up sheet on
   * their phone.
   */
  async function downloadImages() {
    if (!doc) return;
    const wanted = pagesToExport('save');
    if (!wanted) return;
    onToast?.('Making the pictures…');
    for (const i of wanted) {
      const p = await doc.getPage(i + 1);
      const vp = p.getViewport({ scale: 2 });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await p.render({
        canvasContext: ctx, viewport: vp,
        ...(ocRef.current ? { optionalContentConfigPromise: Promise.resolve(ocRef.current) } : {}),
      }).promise;
      for (const s of strokes) if (s.page === i) paintStroke(ctx, c, s);

      const a = document.createElement('a');
      a.download = `${apartmentLabel} — ${planName || 'plan'}${doc.numPages > 1 ? ` — page ${i + 1}` : ''}.png`;
      a.href = c.toDataURL('image/png');
      a.click();
    }
    onToast?.(wanted.length === 1 ? 'Picture saved' : `${wanted.length} pictures saved`);
  }

  // ---- UI ----------------------------------------------------------------

  /**
   * With a mark picked up, the toolbar edits IT.
   *
   * Otherwise the width, colour and see-through sliders only ever describe the
   * next thing you are about to draw, and changing your mind about something
   * already on the plan means rubbing it out and doing it again. This is what
   * makes "resize it and type in there in different sizes" true of a balloon
   * that already exists.
   */
  const pickedMark = tool === 'move' ? strokes.find(s => s.id === picked) : undefined;

  function editPicked(patch: Partial<AnnStroke>) {
    if (!pickedMark) return;
    setStrokes(prev => prev.map(s => (s.id === pickedMark.id ? { ...s, ...patch } : s)));
    setDirty(true);
  }

  const palette = tool === 'highlighter' ? HIGHLIGHT_COLORS : INK_COLORS;
  const marksOnPage = strokes.filter(s => s.page === page).length;

  /**
   * The rail's buttons, written once and hung either down a side or across the
   * bottom.
   *
   * Which way round is decided by which dimension the screen has to spare, so
   * the same twenty buttons cannot drift apart between the two layouts — a
   * second copy of this list is how a tool ends up existing in portrait and
   * not in landscape.
   */
  const railBtn: React.CSSProperties = {
    width: ui.btn, paddingTop: ui.padY, paddingBottom: ui.padY, gap: 2, flexShrink: 0,
  };
  const railDivider = railRow
    ? <div className="w-px h-8 mx-1 flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,.16)' }} />
    : <div className="h-px w-8 my-1" style={{ backgroundColor: 'rgba(255,255,255,.16)' }} />;

  const railBody = (
    <>
      {TOOLS.map(t => {
        const Icon = ICONS[t.id] ?? Pen;
        const on = tool === t.id;
        return (
          <button key={t.id} onClick={() => pick(t.id)} title={`${t.label} — ${t.hint}`}
            className="rounded-xl flex flex-col items-center transition-colors"
            style={{
              ...railBtn,
              backgroundColor: on ? ACCENT : 'transparent',
              color: on ? '#fff' : 'rgba(255,255,255,.62)',
            }}>
            <Icon size={ui.icon} />
            <span className="font-semibold leading-none" style={{ fontSize: ui.label }}>{t.label}</span>
          </button>
        );
      })}
      {railDivider}
      {/* "Pan", not "Move" — Move is the tool that picks marks up, and two
          buttons with the same word is a coin toss. */}
      <button onClick={() => pick('pan')} title="Pan — scroll around the plan without drawing"
        className="rounded-xl flex flex-col items-center"
        style={{ ...railBtn,
                 backgroundColor: tool === 'pan' ? ACCENT : 'transparent',
                 color: tool === 'pan' ? '#fff' : 'rgba(255,255,255,.62)' }}>
        <Hand size={ui.icon} />
        <span className="font-semibold leading-none" style={{ fontSize: ui.label }}>Pan</span>
      </button>
      <button onClick={undo} disabled={!strokes.length} title="Undo (Ctrl+Z)"
        className="rounded-xl flex flex-col items-center text-white/60 disabled:opacity-25 hover:bg-white/10"
        style={railBtn}>
        <Undo2 size={ui.smallIcon} />
        <span className="font-semibold leading-none" style={{ fontSize: ui.label }}>Undo</span>
      </button>
      <button onClick={redoOne} disabled={!redo.length} title="Redo (Ctrl+Shift+Z)"
        className="rounded-xl flex flex-col items-center text-white/60 disabled:opacity-25 hover:bg-white/10"
        style={railBtn}>
        <Redo2 size={ui.smallIcon} />
        <span className="font-semibold leading-none" style={{ fontSize: ui.label }}>Redo</span>
      </button>
      {/* Clear takes THIS PAGE. New starts a fresh sketch. They both used
          to call newSketch, so on a multi-page set there was no way to
          wipe one sheet, and two buttons did the same thing. */}
      <button onClick={clearPage} disabled={!strokes.some(s => s.page === page)}
        title="Rub out every mark on this page"
        className="rounded-xl flex flex-col items-center text-white/60 disabled:opacity-25 hover:bg-white/10"
        style={railBtn}>
        <Trash2 size={ui.smallIcon} />
        <span className="font-semibold leading-none" style={{ fontSize: ui.label }}>Clear</span>
      </button>

      {/* ── Saved versions, on the rail ──
          They were a 248px panel down the right-hand side, which is a
          quarter of the screen given to a list you look at twice a day.
          Newest nearest the top, because that is the one you want. */}
      {railDivider}

      <button onClick={newSketch} title="Start a fresh sketch on this plan"
        className="rounded-xl flex flex-col items-center text-white/70 hover:bg-white/10"
        style={railBtn}>
        <Plus size={ui.smallIcon} />
        <span className="font-semibold leading-none" style={{ fontSize: ui.label }}>New</span>
      </button>

      {versions.map(v => {
        const showing = v.strokes?.length === strokes.length && v.version === nextVersion - 1;
        return (
          <button
            key={v.id}
            onClick={() => loadVersion(v, !readOnly)}
            title={`Version ${v.version} — ${v.createdBy || 'the office'}, `
              + `${new Date(v.createdAt).toLocaleString()}`
              + `${v.driveUrl ? ' · in Drive' : ' · not in Drive yet'}`}
            className="rounded-xl flex flex-col items-center gap-0.5 transition-colors relative"
            style={{
              width: ui.btn, paddingTop: ui.padY, paddingBottom: ui.padY, flexShrink: 0,
              backgroundColor: showing ? 'rgba(255,255,255,.12)' : 'transparent',
              color: 'rgba(255,255,255,.72)',
            }}
          >
            <span className="font-black leading-none" style={{ fontSize: ui.text }}>v{v.version}</span>
            <span className="text-[7.5px] leading-none opacity-70">
              {new Date(v.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </span>
            {/* A dot for "this one reached Drive". */}
            <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: v.driveUrl ? '#4ade80' : 'rgba(255,255,255,.28)' }} />
          </button>
        );
      })}
    </>
  );

  return (
    <div
      className={embedded ? 'absolute inset-0 flex flex-col' : 'fixed inset-0 z-[150] flex flex-col'}
      style={{ backgroundColor: embedded ? '#ffffff' : NAVY_DEEP }}
    >
      {/* Header.
          The row is scaled as a whole with `zoom` rather than by re-sizing a
          dozen buttons one at a time: `zoom` grows the LAYOUT, so the hit boxes
          grow with the pixels — unlike a transform, which would leave every
          button catching taps where it used to be. It wraps rather than
          overflows, and at the desk size it is not applied at all, so nothing
          about the existing screen moves by a pixel. The tool rail is sized
          explicitly instead, because it also has to scroll.

          On a phone it must NOT wrap: eleven buttons at 390px make four rows,
          which is half the plan spent on chrome, and in landscape it is more
          than the plan. Everything that is not pressed while drawing moves
          into the ⋯ sheet instead, and what is left is one row. */}
      {/* The row scrolls sideways on a phone, and Close does not scroll with
          it. A multi-page plan adds a pager, and an unsaved one adds the Drive
          count: at 390px the arithmetic runs out and the last button in the
          row — Close — is pushed off the screen with no way to reach it. The
          two that must always be there are pinned to the right-hand edge and
          everything else runs under them. */}
      {/*
        One bar, wherever the host wants it.

        The drawer used to stack TWO bars over one sheet — its navy header with
        the folder picker and the file chips, and this one underneath with the
        file's name, the pin, Plans, Layers, Download and Print. Given a slot,
        the whole row is portalled into it and nothing is drawn here, so the
        controls sit at the LEFT-hand end of the host's own bar, ahead of the
        picker. Its background and padding go with it: it is joining a bar, not
        putting a second one inside the first.
      */}
      {(() => {
        /** Two slots given: the name goes up top, everything else underneath. */
        const twoRow = !!barInto && !!barInto2;
        const head = (<>
          {!compact && <Layers size={16} className="text-[#4aa8d8] flex-shrink-0" />}
          <div className={compact ? 'min-w-0 flex-1' : 'min-w-0'}>
            <div className="text-[13px] font-bold text-white truncate">{planName || 'Plan'}</div>
            <div className="text-[10.5px] text-gray-400 truncate">
              {apartmentLabel}
              {basedOn ? ` · carrying on from v${basedOn}` : ''}
              {dirty ? ' · unsaved' : ''}
            </div>
          </div>
        </>);
        const rest = (<>

        {/*
          The host's own controls, IN the bar rather than floating over it.

          The punch-list Pin button used to sit at the pane's top-left corner,
          which is exactly where this bar draws the file's name — so the name
          was covered by a button, on every plan. It belongs beside the name,
          in the row, where it hides nothing.
        */}
        <span ref={barExtrasRef} className="flex items-center gap-1.5 flex-shrink-0" />

        {!compact && !twoRow && <div className="flex-1" />}

        {/* The pager and the zoom live in the floating bar over the sheet
            when there is nothing to mark up — one set of controls, where Drive
            keeps them. Two pagers and two zooms in one window is a choice
            nobody should have to make. */}
        {doc && doc.numPages > 1 && !locked && (
          <div className="flex items-center gap-1 text-white/85 text-[12px] mr-1 flex-shrink-0">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className={`${iconBtn} hover:bg-white/10 disabled:opacity-30`}><ChevronLeft size={15} /></button>
            <span className="tabular-nums">{page + 1} / {doc.numPages}</span>
            <button onClick={() => setPage(p => Math.min(doc.numPages - 1, p + 1))} disabled={page >= doc.numPages - 1}
              className={`${iconBtn} hover:bg-white/10 disabled:opacity-30`}><ChevronRight size={15} /></button>
          </div>
        )}

        {/* Zoom, the plan chooser, the layers, downloading and printing all
            move into the ⋯ sheet on a phone — none of them is touched while a
            mark is being drawn, and a pinch does the zooming there anyway. */}
        {!compact && (<>
          {/* Only while marking up. Reading a plan, the zoom is in the floating
              bar over the sheet — one set of controls, where Drive keeps them. */}
          {!locked && (
            <div className="flex items-center gap-0.5 text-white/85 mr-1">
              <button onClick={() => setScale(s => Math.max(0.2, s - 0.2))} title="Zoom out"
                className="p-1.5 rounded-lg hover:bg-white/10"><Minus size={14} /></button>
              <span className="text-[11px] tabular-nums w-11 text-center">{Math.round(scale * 100)}%</span>
              <button onClick={() => setScale(s => Math.min(5, s + 0.2))} title="Zoom in"
                className="p-1.5 rounded-lg hover:bg-white/10"><Plus size={14} /></button>
              <button onClick={() => setFitting(true)} title="Fit the page"
                className="p-1.5 rounded-lg hover:bg-white/10"><Maximize2 size={13} /></button>
            </div>
          )}

          {/* Always offered, not only when there are two.
              The chooser is how you reach ANOTHER FOLDER, so hiding it when the
              plans folder happened to hold one file hid the way out of it. */}
          <button data-open-plans onClick={() => setShowPlans(true)}
            title="Choose a plan — or another folder in this job's Drive"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-white/85 hover:bg-white/10">
            <ChevronsUpDown size={13} /> Plans
          </button>

          {/* The gap the owner drew: Plans belongs with the sheet you are
              choosing, the rest belongs at the far end. */}
          {twoRow && <div className="flex-1" />}

          <button onClick={() => setShowLayers(v => !v)}
            disabled={isImagePlan}
            title={isImagePlan
              ? 'A picture has no layers of its own'
              : "Show or hide the plan's own layers"}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold ${
              showLayers ? 'bg-white/15 text-white' : 'text-white/85 hover:bg-white/10'}`}>
            <Layers2 size={13} /> Layers
            {layers.length > 0 && (
              <span className="text-[9.5px] font-bold px-1 rounded-full bg-white/20">{layers.length}</span>
            )}
          </button>

          <button onClick={() => setShowDownload(true)} title="Download as a PDF or as pictures"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-white/85 hover:bg-white/10">
            <Download size={14} /> Download
          </button>

          <button onClick={print} title="Print this plan with the markup on it"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-white/90 hover:bg-white/10">
            <Printer size={14} /> Print
          </button>
        </>)}

        {/* Where the work has got to.
            The saving is automatic now, which is only reassuring if you can see
            it happening — otherwise you are trusting something invisible with a
            drawing you just spent ten minutes on. Three honest states: kept on
            this machine, on its way to Drive, and safely in Drive. */}
        {/* Undo, redo and reset, up here where they are looked for.
            They were only on the tool rail, which is where you go to change
            what you are drawing with — not where you go to take something
            back. Reset asks first, because it is the one that cannot be
            undone by pressing it again. */}
        {!locked && (
          <span className="flex items-center gap-0.5 mr-1 flex-shrink-0">
            <button data-top-undo onClick={undo} disabled={!strokes.length} title="Undo (Ctrl+Z)"
              className={`${iconBtn} text-white/80 hover:bg-white/10 disabled:opacity-30`}>
              <Undo2 size={ui.smallIcon} />
            </button>
            <button data-top-redo onClick={redoOne} disabled={!redo.length} title="Redo (Ctrl+Shift+Z)"
              className={`${iconBtn} text-white/80 hover:bg-white/10 disabled:opacity-30`}>
              <Redo2 size={ui.smallIcon} />
            </button>
            {/* Reset is in the ⋯ sheet on a phone: it is the one button here
                that cannot be taken back by pressing it again, and it does not
                belong a thumb's width from Undo on a 390px row. */}
            {!compact && (
              <button data-top-reset onClick={() => setConfirmReset(true)} disabled={!strokes.length}
                title="Take every mark off this plan"
                className="p-1.5 rounded-lg text-white/80 hover:bg-red-500/25 disabled:opacity-30">
                <RotateCcw size={ui.smallIcon} />
              </button>
            )}
          </span>
        )}

        {!locked && saveState !== 'clean' && (
          <SaveTrip
            state={saveState}
            secondsLeft={driveIn}
            compact={compact}
            onSendNow={() => { clearTimeout(idleTimer.current); void pushToDrive(); }}
          />
        )}

        {!locked && (
          <button onClick={save} disabled={saving || !strokes.length}
            title="Save this markup as a new version and file a PDF in Drive"
            className={`flex items-center gap-1.5 rounded-lg text-[12px] font-bold text-white disabled:opacity-40 flex-shrink-0 ${
              compact ? 'px-2.5 min-h-[38px]' : 'px-3 py-1.5'}`}
            style={{ backgroundColor: ACCENT }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {/* The word costs a fifth of a 390px row and says nothing the icon
                does not. The version number is the part you check. */}
            {saving ? (compact ? '' : 'Filing…') : compact ? `v${nextVersion}` : `Save v${nextVersion}`}
          </button>
        )}

        {!compact && !twoRow && (
          <button onClick={() => setShowVersions(v => !v)} title="Saved versions"
            className={`p-1.5 rounded-lg ${showVersions ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10'}`}>
            <FileDown size={15} />
          </button>
        )}
        {/* Looking at it should be one step away from marking it up — closing
            and reopening through a different button is friction for nothing. */}
        {readOnly && !askWho && onStartMarkup && !twoRow && (
          <button onClick={onStartMarkup}
            className={`flex items-center gap-1.5 rounded-lg text-[12px] font-bold text-white flex-shrink-0 ${
              compact ? 'px-2.5 min-h-[38px]' : 'px-3 py-1.5'}`}
            style={{ backgroundColor: ACCENT }}>
            <Pen size={13} /> {compact ? '' : 'Mark up'}
          </button>
        )}
        {askWho && who && (
          <button onClick={() => setWho('')} title="Not you? Hand over to somebody else"
            className={`flex items-center gap-1.5 rounded-lg text-[12px] font-semibold text-white/85 hover:bg-white/10 flex-shrink-0 ${
              compact ? `${iconBtn}` : 'px-2.5 py-1.5'}`}>
            <UserIcon size={13} /> {compact ? '' : who}
          </button>
        )}

        {/* The two that can never scroll away: everything else in this row is
            reachable from the ⋯ sheet, and Close is the way out. */}
        <span className={`flex items-center gap-1 flex-shrink-0 ${compact ? 'sticky right-0 pl-1' : ''}`}
          style={compact ? { backgroundColor: NAVY } : undefined}>
          {/* Everything that came out of this row, one press away. */}
          {compact && (
            <button data-plan-more onClick={() => setShowMore(true)} title="More"
              className={`${iconBtn} text-white/85 hover:bg-white/10`}>
              <MoreHorizontal size={18} />
            </button>
          )}

          {/* Closing before Drive has it asks. There is a window of a few seconds
              where the markup is safe on this machine but not yet filed, and
              walking away inside it is the one way to lose the drawing. */}
          {/*
            No X on an embedded pane.
            It is a pane inside the drawer, not a window — there is nothing for
            it to close, which is why pressing it appeared to do nothing. The
            drawer's own X closes the drawer, and the pane has a Hide button.
          */}
          {!embedded && (
            <button data-close-studio
              onClick={() => {
                const risky = !locked && strokes.length > 0
                  && (saveState === 'local' || saveState === 'failed');
                if (risky) setConfirmClose(true); else onClose();
              }}
              title="Close" className={`${iconBtn} text-white/70 hover:bg-white/10`}>
              <X size={17} />
            </button>
          )}
        </span>
        </>);

        if (twoRow) {
          return (<>
            {createPortal(head, barInto!)}
            {createPortal(rest, barInto2!)}
          </>);
        }
        const row = (
          <div className={barInto
            ? 'flex items-center gap-1.5 min-w-0 flex-wrap'
            : `flex items-center gap-2 py-2 flex-shrink-0 ${
              compact ? 'px-2 flex-nowrap overflow-x-auto' : 'px-3 flex-wrap'}`}
            style={barInto ? undefined : { backgroundColor: NAVY, ...(ui.on ? { zoom: ts } : {}) }}>
            {head}
            {rest}
          </div>
        );
        return barInto ? createPortal(row, barInto) : row;
      })()}

      <div className="flex-1 min-h-0 flex">
        {/* Tool rail, down the side — the desk, and a phone held sideways,
            where height is the scarce dimension and width is not. */}
        {!locked && !railRow && (
          <div className="flex-shrink-0 flex flex-col items-center gap-1 py-2 overflow-y-auto board-rail"
            style={{ backgroundColor: NAVY, width: ui.rail }}>
            {railBody}
          </div>
        )}

        {/* Stage */}
        <div className="relative flex-1 min-w-0 flex flex-col">
          {!locked && (
            // The TOOL row scrolls sideways on a phone; this one wraps.
            // Scrolling is right for eleven buttons whose order you learn, and
            // wrong for three controls of which the last is a SLIDER: See-through
            // was cut in half at the screen edge, and you cannot drag a handle
            // you cannot see. Two lines cost 34px of a screen that had 800
            // spare below the sheet.
            <div className={`flex items-center gap-2 px-3 py-1.5 flex-shrink-0 gap-y-1.5 ${
              compact ? 'flex-wrap' : 'flex-wrap'}`}
              style={{ backgroundColor: 'rgba(255,255,255,.04)', ...(ui.on ? { zoom: ts } : {}) }}>
              {/* An eraser has no colour and no see-through: it is not ink.
                  Showing the controls implied it was, and setting one did
                  nothing. Width it does have — that is how much it takes. */}
              {!isEraser && (<>
                {/* Colour — one well, not a strip of swatches and the OS dialog. */}
                <button
                  onClick={e => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setShowPalette(v => !v);
                    // A phone gets the picker hung from the top-left instead of
                    // from the well: the panel is 292 wide and nearly as tall as
                    // a landscape screen, so anywhere else it is clipped.
                    setPaletteAt(compact ? { x: 8, y: 8 } : { x: r.left, y: r.bottom + 8 });
                  }}
                  title="Ink colour"
                  className={`flex items-center gap-1.5 pl-1 pr-2 rounded-full transition-colors flex-shrink-0 ${
                    compact ? 'min-h-[34px]' : 'py-1'}`}
                  style={{ backgroundColor: 'rgba(255,255,255,.08)' }}
                >
                  <span className={`rounded-full flex-shrink-0 ${compact ? 'w-[26px] h-[26px]' : 'w-[20px] h-[20px]'}`}
                    style={{ backgroundColor: color, border: '2px solid rgba(255,255,255,.55)' }} />
                  <span className="text-[10.5px] font-mono text-white/70">{color}</span>
                </button>

                {/* The tool's own shortlist, so the common ones stay one click
                    away. Not on a phone: a 17px swatch is half the smallest
                    target a finger can be asked to hit, and seven of them are
                    a third of the row. The same seven are the first shelf
                    inside the picker, at 28px, one press away. */}
                {!compact && (
                  <div className="flex items-center gap-1">
                    {palette.slice(0, 7).map(c => (
                      <button key={c} onClick={() => setColor(c)} title={c}
                        className="w-[17px] h-[17px] rounded-full transition-transform"
                        style={{
                          backgroundColor: c,
                          border: color === c ? '2px solid #fff' : '1px solid rgba(255,255,255,.28)',
                          transform: color === c ? 'scale(1.2)' : undefined,
                        }} />
                    ))}
                  </div>
                )}

                <span className="w-px h-5 bg-white/10 flex-shrink-0" />
              </>)}

              <label className="flex items-center gap-1.5 text-[10.5px] text-white/70 flex-shrink-0">
                {pickedMark?.tool === 'bubble' ? 'Text size' : 'Width'}
                <input type="range" min={0.5} max={60} step={0.5}
                  value={pickedMark ? (pickedMark.tool === 'bubble'
                    ? (pickedMark.fontSize ?? 15) : pickedMark.width) : width}
                  onChange={e => {
                    const v = Number(e.target.value);
                    if (pickedMark) {
                      // On a balloon the slider is its TEXT size, which is the
                      // thing anyone wants to change about a balloon.
                      editPicked(pickedMark.tool === 'bubble' ? { fontSize: v } : { width: v });
                    } else setWidth(v);
                  }}
                  className="ink-slider w-[92px]"
                  style={{
                    ...fillPct(
                      pickedMark ? (pickedMark.tool === 'bubble'
                        ? (pickedMark.fontSize ?? 15) : pickedMark.width) : width, 0.5, 60),
                    ...touchSlider,
                  }} />
                <span className="tabular-nums w-6">
                  {pickedMark ? (pickedMark.tool === 'bubble'
                    ? (pickedMark.fontSize ?? 15) : pickedMark.width) : width}
                </span>
              </label>

              {/* Bold, for the note that has to be read from across the room.
                  Shown for the balloon and the plain note, which are the only
                  marks made of words. */}
              {(pickedMark?.tool === 'bubble' || pickedMark?.tool === 'text'
                || (!pickedMark && (tool === 'bubble' || tool === 'text'))) && (
                <button
                  onClick={() => (pickedMark ? editPicked({ bold: !pickedMark.bold }) : setBold(b => !b))}
                  title="Bold"
                  className={`rounded-lg text-[13px] font-black transition-colors flex-shrink-0 ${
                    compact ? 'w-[34px] h-[34px]' : 'w-[26px] h-[26px]'}`}
                  style={{
                    backgroundColor: (pickedMark ? pickedMark.bold : bold)
                      ? ACCENT : 'rgba(255,255,255,.08)',
                    color: '#fff',
                  }}
                >B</button>
              )}

              {!isEraser && (
                <label className="flex items-center gap-1.5 text-[10.5px] text-white/70 flex-shrink-0">
                  See-through
                  <input type="range" min={0.05} max={1} step={0.05}
                    value={pickedMark ? pickedMark.opacity : opacity}
                    onChange={e => {
                      const v = Number(e.target.value);
                      if (pickedMark) editPicked({ opacity: v }); else setOpacity(v);
                    }}
                    className="ink-slider w-[80px]"
                    style={{
                      ...fillPct(pickedMark ? pickedMark.opacity : opacity, 0.05, 1),
                      ...touchSlider,
                    }} />
                  <span className="tabular-nums w-7">
                    {Math.round((pickedMark ? pickedMark.opacity : opacity) * 100)}%
                  </span>
                </label>
              )}

              {/* The pressure control is gone. The Samsung panel's pen has no
                  pressure sensor at all — it is infrared and passive — so the
                  slider was a control over a number that never moved. Width
                  still varies with the nib you are using, which is the signal
                  that screen actually gives. */}

              {/* The running commentary is the first thing to go on a phone:
                  it is the widest item in the row and the only one that is
                  not a control. */}
              {!compact && (<>
                <div className="flex-1" />
                <span className="text-[10px] text-white/40">
                  {pickedMark
                    ? 'editing the mark you picked · click empty space to let go'
                    : `${marksOnPage} mark${marksOnPage === 1 ? '' : 's'} on this page`}
                  {/* The old "· speed" meant nothing to anybody reading it. */}
                </span>
              </>)}
            </div>
          )}

          {/**
            * The viewer's controls, where Drive puts them.
            *
            * The office reads plans in Drive all day, so the muscle memory is
            * already bought and paid for: a floating bar at the bottom centre
            * carrying the page count and the zoom, over the sheet rather than
            * in a strip above it. Only when there is nothing to mark up —
            * the studio has its own rail and two toolbars of its own.
            */}
          {locked && doc && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5
                            rounded-full px-1.5 py-1 shadow-lg backdrop-blur"
              style={{ backgroundColor: 'rgba(32,33,36,.92)', color: '#e8eaed' }}>
              {doc.numPages > 1 && (<>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  title="Previous page"
                  className="px-2 py-1 rounded-full hover:bg-white/10 disabled:opacity-30">‹</button>
                <span className="px-1.5 text-[12px] font-semibold tabular-nums select-none">
                  {page + 1} / {doc.numPages}
                </span>
                <button onClick={() => setPage(p => Math.min(doc.numPages - 1, p + 1))}
                  disabled={page >= doc.numPages - 1} title="Next page"
                  className="px-2 py-1 rounded-full hover:bg-white/10 disabled:opacity-30">›</button>
                <span className="mx-1 w-px self-stretch bg-white/20" />
              </>)}
              <button onClick={() => setScale(s => Math.max(0.1, Math.round((s - 0.15) * 100) / 100))}
                title="Zoom out" className="px-2.5 py-1 rounded-full hover:bg-white/10">
                <Minus size={14} />
              </button>
              <button onClick={() => setFitting(true)} title="Fit the sheet to the window"
                className="px-2 py-1 rounded-full text-[12px] font-semibold tabular-nums hover:bg-white/10">
                {Math.round(scale * 100)}%
              </button>
              <button onClick={() => setScale(s => Math.min(6, Math.round((s + 0.15) * 100) / 100))}
                title="Zoom in" className="px-2.5 py-1 rounded-full hover:bg-white/10">
                <Plus size={14} />
              </button>
              <button onClick={() => setFitting(true)} title="Fit to window"
                className="px-2.5 py-1 rounded-full hover:bg-white/10">
                <Maximize2 size={13} />
              </button>
            </div>
          )}

          {/* `pan-x pan-y`, never `auto` — see the live canvas below. A pinch
              that starts on the margin rather than on the sheet has to reach
              the same handler, or it zooms the page instead. */}
          <div ref={stageRef}
            /*
              `items-center`, not `items-start`.

              A landscape sheet on an upright phone fits to WIDTH — 382px across
              and about 270 tall — inside a stage some 1400 tall, so it sat
              pinned to the top with two thirds of the screen empty navy below
              it. Centred, the drawing lands under the thumb and the space reads
              as margin rather than as something failing to load.
            */
            className={`flex-1 min-h-0 overflow-auto flex items-center justify-center ${
              compact ? 'p-1' : 'p-4'}`}
            style={{ touchAction: 'pan-x pan-y' }}>
            {loadErr ? (
              <div className="text-center text-gray-300 text-[13px] mt-16 max-w-md">
                <p className="font-semibold mb-1">This plan would not open.</p>
                <p className="text-gray-500 text-[12px]">{loadErr}</p>
                <p className="text-gray-500 text-[12px] mt-2">
                  The markup studio needs the upload backend configured, and the service account
                  has to be able to see the file in Drive.
                </p>
              </div>
            ) : !doc ? (
              <div className="flex flex-col items-center gap-2 text-gray-400 text-[13px] mt-16">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> Opening the plan…
                </div>
                {got.bytes > 0 && (
                  <>
                    <div className="w-[220px] h-1 rounded-full overflow-hidden"
                      style={{ backgroundColor: 'rgba(255,255,255,.14)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: got.total ? `${Math.min(100, (got.bytes / got.total) * 100)}%` : '35%',
                          backgroundColor: ACCENT,
                        }} />
                    </div>
                    <span className="text-[11px] text-gray-500 tabular-nums">
                      {(got.bytes / 1048576).toFixed(1)} MB
                      {got.total ? ` of ${(got.total / 1048576).toFixed(1)} MB` : ' so far'}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div className="relative shadow-2xl" style={{ backgroundColor: '#fff' }}>
                {/*
                  A wide sheet on an upright phone fits to width and comes out
                  about a third of the screen tall — big enough to see, too
                  small to mark up. Turning the phone genuinely fixes it: the
                  same sheet then fills the screen. So the empty space says so
                  once, quietly, instead of being empty.
                */}
                {compact && sheetWide && screen.orientation === 'portrait' && (
                  <div className="absolute left-0 right-0 top-full mt-3 flex justify-center pointer-events-none">
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold"
                      style={{ backgroundColor: 'rgba(255,255,255,.08)', color: '#93a3b5' }}>
                      <RotateCw size={12} /> Turn the phone for a bigger drawing
                    </span>
                  </div>
                )}
                <canvas ref={pdfRef} className="block" />
                <canvas ref={inkRef} className="absolute inset-0 pointer-events-none" />
                <canvas
                  ref={liveRef}
                  className="absolute inset-0"
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onCancelDraw}
                  onPointerLeave={() => setNibAt(null)}
                  onContextMenu={e => {
                    // A long press with a finger is how the eraser is used; the
                    // browser reads it as "open this image in a new tab". A
                    // right click with a mouse is left alone.
                    if (lastPointerType.current === 'touch') e.preventDefault();
                  }}
                  onDoubleClick={e => {
                    // Double-click a balloon to retype it. It does NOT have to
                    // be picked first — needing two separate clicks to get at
                    // your own words is a rule nobody would guess.
                    if (locked || tool === 'pan') return;
                    const { nx, ny } = norm(e);
                    const hit = markAt(nx, ny);
                    if (hit?.tool !== 'bubble') return;
                    setPicked(hit.id);
                    setTextDraft({ nx, ny, value: hit.text ?? '', forId: hit.id });
                  }}
                  style={{
                    // The pen must not scroll the page while it draws, and the
                    // palm must not either — without this the Samsung screen
                    // pans instead of drawing.
                    //
                    // `pan-x pan-y` rather than `auto` when there is nothing to
                    // draw: one finger still scrolls the plan, but the BROWSER
                    // is told it may not pinch, which is what leaves the
                    // gesture free for the handler that zooms the plan. On
                    // `auto` a real touch panel starts its own page zoom the
                    // moment the second finger lands and sends a touchcancel,
                    // so on the wallboard — read-only, every gesture a finger —
                    // pinching zoomed the whole page instead of the drawing.
                    touchAction: locked || tool === 'pan' ? 'pan-x pan-y' : 'none',
                    // With a nib ghost on screen the cursor itself gets out of
                    // the way — two crosshairs is one too many.
                    cursor: locked || tool === 'pan' ? 'grab'
                      : tool === 'text' ? 'text'
                      : tool === 'move' ? (picked ? 'move' : 'default')
                      : showNib ? 'none' : 'crosshair',
                    pointerEvents: locked || tool === 'pan' ? 'none' : 'auto',
                  }}
                />
                {textDraft && (() => {
                  /* Typing happens INSIDE the balloon. The box below is placed
                     over the balloon's own text area at the balloon's own type
                     size, with no border and no background, so what you type is
                     what is drawn — there is no pop-up any more. A plain note,
                     which has no shape around it, still gets a small framed box
                     so you can see where you are typing. */
                  const host = textDraft.forId
                    ? strokes.find(x => x.id === textDraft.forId) : undefined;
                  const inBubble = host?.tool === 'bubble';
                  const b = inBubble ? bubbleBox(host!) : null;
                  return (
                    <div
                      className="absolute z-10"
                      style={b ? {
                        left: `${b.left}%`, top: `${b.top}%`,
                        width: `${b.width}%`, height: `${b.height}%`,
                      } : { left: `${textDraft.nx * 100}%`, top: `${textDraft.ny * 100}%` }}
                    >
                      <textarea
                        ref={textRef} rows={b ? undefined : 2}
                        value={textDraft.value}
                        onChange={e => setTextDraft({ ...textDraft, value: e.target.value })}
                        onBlur={commitText}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
                          if (e.key === 'Escape') setTextDraft(null);
                        }}
                        placeholder={b ? '' : 'Note on the plan…'}
                        className={b
                          ? 'w-full h-full bg-transparent border-0 outline-none resize-none p-0 overflow-hidden'
                          : 'px-2 py-1 rounded-lg border-2 shadow-lg text-[13px] outline-none resize'}
                        style={b ? {
                          color: host!.color,
                          fontFamily: 'Segoe UI, Helvetica, Arial, sans-serif',
                          fontSize: `${b.fontPx}px`,
                          fontWeight: host!.bold ? 800 : 600,
                          lineHeight: LINE,
                        } : { borderColor: color, color, minWidth: 180 }}
                      />
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* The right-hand Versions panel is gone. It was a quarter of the
            screen given to a list; the versions live on the left rail now. */}
      </div>

      {/* The same rail, laid across the bottom, on a phone stood up.
          Down the side it would be a sixth of a 390px sheet, and it is the one
          piece of chrome a thumb reaches for constantly — so it goes where the
          thumb already is. It scrolls sideways rather than wrapping; the
          `board-rail` fade is deliberately not used, since its mask runs top to
          bottom and would fade a row's whole height away. */}
      {!locked && railRow && (
        <div className="flex-shrink-0 flex flex-row items-center gap-1 px-2 pt-1.5 overflow-x-auto"
          style={{
            backgroundColor: NAVY,
            paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
          }}>
          {railBody}
        </div>
      )}

      {/* The colour picker, drawn in the app rather than the operating system. */}
      {showPalette && !locked && (
        <InkPicker
          value={color}
          palette={palette}
          anchor={paletteAt}
          onChange={c => { setColor(c); rememberColor(c); }}
          onClose={() => setShowPalette(false)}
        />
      )}

      {/* The plan's own layers, so a services drawing can be read. */}
      {showLayers && (
        <>
          <div className="fixed inset-0 z-[158]" onClick={() => setShowLayers(false)} />
          {/* On a phone this hung 128px off the left-hand edge of the screen:
              `right: 268` was measured against a desk window and a panel that
              no longer exists. It is pinned to the right-hand edge instead, and
              given the height that is actually there rather than 60% of a
              landscape screen. */}
          <div className="fixed z-[159] rounded-2xl overflow-hidden"
            style={{
              ...(compact
                ? { right: 8, top: 54, width: 'min(280px, calc(100vw - 16px))',
                    maxHeight: 'calc(100vh - 68px)' }
                : { right: 268, top: 58, width: 250, maxHeight: '60vh' }),
              background: '#fff', boxShadow: '0 20px 48px -10px rgba(15,23,42,.4)',
            }}>
            <div className="px-3 py-2 text-[12px] font-bold text-white" style={{ backgroundColor: NAVY }}>
              Layers
            </div>
            <div className="p-2 overflow-y-auto"
              style={{ maxHeight: compact ? 'calc(100vh - 112px)' : '48vh' }}>
              {/* YOUR marks, one layer per colour, newest first.
                  Somebody marking a plan up works in passes — the red ones are
                  the problems, the green ones are the answers — so a colour is
                  already a layer in every way except being switchable. Ordered
                  by when each colour was last touched, so the pass you are in
                  the middle of is at the top. */}
              {inkLayers.length > 0 && (
                <>
                  <div className="px-2 pt-1 pb-1.5 text-[9.5px] font-extrabold tracking-wide text-gray-400">
                    YOUR MARKS
                  </div>
                  {inkLayers.map((l, i) => (
                    <button key={l.colour} data-ink-layer={l.colour}
                      onClick={() => setHiddenInk(h => {
                        const next = new Set(h);
                        if (next.has(l.colour)) next.delete(l.colour); else next.add(l.colour);
                        return next;
                      })}
                      className={`w-full flex items-center gap-2 px-2 rounded-lg hover:bg-gray-50 text-left ${
                        compact ? 'py-2.5' : 'py-1.5'}`}>
                      <span className="w-[15px] h-[15px] rounded flex items-center justify-center flex-shrink-0"
                        style={!hiddenInk.has(l.colour)
                          ? { backgroundColor: NAVY, color: '#fff' }
                          : { border: '1.5px solid #cbd5e1' }}>
                        {!hiddenInk.has(l.colour) && <Check size={10} />}
                      </span>
                      <span className="w-3.5 h-3.5 rounded-sm flex-shrink-0 border border-black/10"
                        style={{ backgroundColor: l.colour }} />
                      <span className="text-[12px] text-gray-700 truncate flex-1">
                        Layer {inkLayers.length - i}
                      </span>
                      <span className="text-[10.5px] text-gray-400 tabular-nums">{l.count}</span>
                    </button>
                  ))}
                  {layers.length > 0 && (
                    <div className="px-2 pt-2.5 pb-1.5 text-[9.5px] font-extrabold tracking-wide text-gray-400">
                      ON THE PLAN
                    </div>
                  )}
                </>
              )}
              {layers.length === 0 && inkLayers.length === 0 && (
                <p className="px-2 py-3 text-[11.5px] text-gray-500 leading-snug">
                  This plan has no layers of its own — it was flattened when it was issued.
                  Your markup still saves as its own layer.
                </p>
              )}
              {layers.length > 1 && (() => {
                const allOn = layers.every(l => l.on);
                const noneOn = layers.every(l => !l.on);
                return (
                  <button
                    onClick={() => setAllLayers(!allOn)}
                    className={`w-full flex items-center gap-2 px-2 rounded-lg hover:bg-gray-50 text-left ${
                      compact ? 'py-2.5' : 'py-1.5'}`}
                    title={allOn ? 'Turn every layer off' : 'Turn every layer on'}
                  >
                    <span className="w-[15px] h-[15px] rounded flex items-center justify-center flex-shrink-0"
                      style={allOn
                        ? { backgroundColor: NAVY, color: '#fff' }
                        : noneOn
                          ? { border: '1.5px solid #cbd5e1' }
                          // Some on, some off — a dash, so it does not claim to
                          // be either.
                          : { border: `1.5px solid ${NAVY}`, color: NAVY }}>
                      {allOn ? <Check size={10} />
                        : noneOn ? null
                        : <span style={{ width: 7, height: 2, backgroundColor: NAVY, borderRadius: 1 }} />}
                    </span>
                    <span className="text-[12px] font-bold text-gray-700">
                      {allOn ? 'All layers' : noneOn ? 'No layers' : `${layers.filter(l => l.on).length} of ${layers.length}`}
                    </span>
                  </button>
                );
              })()}
              {layers.map(l => (
                <button key={l.id} onClick={() => toggleLayer(l.id)}
                  className={`w-full flex items-center gap-2 px-2 rounded-lg hover:bg-gray-50 text-left ${
                    compact ? 'py-2.5' : 'py-1.5'}`}>
                  <span className="w-[15px] h-[15px] rounded flex items-center justify-center flex-shrink-0"
                    style={l.on
                      ? { backgroundColor: NAVY, color: '#fff' }
                      : { border: '1.5px solid #cbd5e1' }}>
                    {l.on && <Check size={10} />}
                  </span>
                  <span className="text-[12px] text-gray-700 truncate">{l.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Everything the phone's header could not hold.
          Hung from the top-right corner rather than slid up from the bottom,
          because the same panel has to work on a screen 390px tall — a bottom
          sheet there is the whole screen, and it would cover the plan it is
          being used on. */}
      {showMore && (
        <>
          <div className="fixed inset-0 z-[158] bg-black/30" onClick={() => setShowMore(false)} />
          <div data-plan-more-sheet className="fixed z-[159] rounded-2xl overflow-hidden bg-white p-1.5"
            style={{
              top: 54, right: 8, width: 'min(300px, calc(100vw - 16px))',
              maxHeight: 'calc(100vh - 66px)', overflowY: 'auto',
              boxShadow: '0 24px 60px -12px rgba(15,23,42,.45)',
            }}>
            {/* Zoom, as one row. A pinch does this too, but a number you can
                read is how you get back to a known size. */}
            <div className="flex items-center gap-1 px-1 py-1">
              <button onClick={() => setScale(s => Math.max(0.2, s - 0.2))} title="Zoom out"
                className="rounded-lg flex items-center justify-center min-w-[42px] min-h-[42px]"
                style={{ backgroundColor: '#f1f5f9', color: '#334155' }}><Minus size={16} /></button>
              <span className="flex-1 text-center text-[13px] font-bold tabular-nums text-slate-700">
                {Math.round(scale * 100)}%
              </span>
              <button onClick={() => setScale(s => Math.min(5, s + 0.2))} title="Zoom in"
                className="rounded-lg flex items-center justify-center min-w-[42px] min-h-[42px]"
                style={{ backgroundColor: '#f1f5f9', color: '#334155' }}><Plus size={16} /></button>
              <button onClick={() => { setFitting(true); setShowMore(false); }} title="Fit the page"
                className="rounded-lg flex items-center justify-center min-w-[42px] min-h-[42px]"
                style={{ backgroundColor: '#f1f5f9', color: '#334155' }}><Maximize2 size={15} /></button>
            </div>

            <SheetRow icon={ChevronsUpDown} label="Plans"
              hint="This job's drawings, and the rest of its Drive"
              onClick={() => { setShowMore(false); setShowPlans(true); }} />
            <SheetRow icon={Layers2} label="Layers"
              disabled={isImagePlan}
              hint={isImagePlan ? 'A picture has no layers of its own'
                : layers.length ? `${layers.length} on this plan` : "The plan's own layers, and yours"}
              onClick={() => { setShowMore(false); setShowLayers(true); }} />
            <SheetRow icon={Download} label="Download"
              hint="As a PDF, or as pictures"
              onClick={() => { setShowMore(false); setShowDownload(true); }} />
            <SheetRow icon={Printer} label="Print"
              hint="This plan with the markup on it"
              onClick={() => { setShowMore(false); void print(); }} />
            {askWho && who && (
              <SheetRow icon={UserIcon} label={who}
                hint="Not you? Hand over to somebody else"
                onClick={() => { setShowMore(false); setWho(''); }} />
            )}
            {!locked && (
              <SheetRow icon={RotateCcw} label="Take every mark off" danger
                disabled={!strokes.length}
                hint="Versions already filed are not touched"
                onClick={() => { setShowMore(false); setConfirmReset(true); }} />
            )}
          </div>
        </>
      )}

      {/* Download: as a PDF, or as pictures. */}
      {showDownload && (
        <>
          <div className="fixed inset-0 z-[158] bg-black/35" onClick={() => setShowDownload(false)} />
          <div className="fixed z-[159] rounded-2xl overflow-hidden bg-white"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(400px,92vw)',
                     boxShadow: '0 24px 60px -12px rgba(15,23,42,.45)' }}>
            <div className="px-4 py-2.5 text-[13px] font-bold text-white" style={{ backgroundColor: NAVY }}>
              Download this plan
            </div>
            <div className="p-4 space-y-2">
              <button
                onClick={() => { setShowDownload(false); void downloadPdf(); }}
                className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 hover:border-[#4aa8d8] transition-colors">
                <div className="text-[13px] font-bold text-gray-900">PDF</div>
                <div className="text-[11px] text-gray-500">
                  {latest?.driveFileId
                    ? 'The saved version, markup on its own layer you can switch off.'
                    : 'Save it first — the PDF is made on the server from the original.'}
                </div>
              </button>
              <button
                onClick={() => { setShowDownload(false); void downloadImages(); }}
                className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 hover:border-[#4aa8d8] transition-colors">
                <div className="text-[13px] font-bold text-gray-900">Pictures</div>
                <div className="text-[11px] text-gray-500">
                  One PNG per page, exactly as it looks now. Nothing can be switched off.
                </div>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Which plan — the originals, then the markups made from them. */}
      {/* Which plan, out of which folder. The chooser opens on Engineered
          Plans and can walk the rest of the job's Drive from there. */}
      {showPlans && (
        <PlanPicker
          driveLink={driveFolderUrl}
          plansFolderId={plansFolderId}
          plans={plans}
          current={planFileId}
          onPick={(p, _folder, stayOpen) => {
            onPickPlan?.(p);
            if (!stayOpen) setShowPlans(false);
          }}
          onClose={() => setShowPlans(false)}
        />
      )}

      {/* The wallboard asks who is drawing before it lets anyone draw. */}
      {askWho && !who && (
        <>
          <div className="fixed inset-0 z-[158] bg-black/55" />
          {/* A long list of names on a 390px-tall screen has to scroll rather
              than run off both ends of it. */}
          <div className="fixed z-[159] rounded-2xl bg-white"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(460px,92vw)',
                     maxHeight: '92vh', overflowY: 'auto',
                     boxShadow: '0 24px 60px -12px rgba(15,23,42,.5)' }}>
            <div className="px-4 py-3 text-white rounded-t-2xl" style={{ backgroundColor: NAVY }}>
              <div className="text-[14px] font-bold">Who is marking this up?</div>
              <div className="text-[11.5px] text-white/70 mt-0.5">
                This screen is shared, so the version is saved under your name.
              </div>
            </div>
            <div className="p-4 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))' }}>
              {people.map(n => (
                <button key={n} onClick={() => setWho(n)}
                  className="px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 hover:border-[#4aa8d8] hover:text-[#1e3a5f] transition-colors">
                  {n}
                </button>
              ))}
              {people.length === 0 && (
                <p className="text-[12px] text-gray-500">
                  No users set up yet — add them in app settings.
                </p>
              )}
            </div>
            <div className="px-4 pb-4 flex items-center gap-2">
              <input
                placeholder="Or type a name"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const v = (e.target as HTMLInputElement).value.trim();
                    if (v) setWho(v);
                  }
                }}
                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-[13px] outline-none focus:ring-2 focus:ring-[#1e3a5f]/25"
              />
              <button onClick={onClose}
                className="px-3 py-2 rounded-xl text-[12.5px] font-semibold text-gray-500 hover:text-gray-700">
                Just looking
              </button>
            </div>
          </div>
        </>
      )}

      {/* Reset: the one action pressing again cannot undo. */}
      {confirmReset && (
        <AskFirst
          title="Take every mark off this plan?"
          body={`${strokes.length} mark${strokes.length === 1 ? '' : 's'} will be rubbed out. `
            + 'Versions already filed are not touched — this is only what is on the plan now.'}
          confirm="Rub them all out"
          danger
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            setConfirmReset(false);
            setStrokes([]);
            setRedo([]);
            setDirty(true);
          }}
        />
      )}

      {/* Leaving before Drive has it. */}
      {confirmClose && (
        <AskFirst
          title="Drive does not have this yet"
          body={driveIn > 0
            ? `It goes automatically in ${driveIn} second${driveIn === 1 ? '' : 's'}. It is already kept on this computer.`
            : 'It is kept on this computer, but the Drive copy has not gone yet.'}
          confirm="Send it now, then close"
          second="Close anyway"
          onCancel={() => setConfirmClose(false)}
          onSecond={() => { setConfirmClose(false); onClose(); }}
          onConfirm={async () => {
            setConfirmClose(false);
            clearTimeout(idleTimer.current);
            await pushToDrive();
            onClose();
          }}
        />
      )}

      {/* The nib, at the size it will actually draw. A crosshair tells you where
          but never how big, which is the thing you are choosing. */}
      {showNib && nibAt && !showPalette && (
        <span
          ref={nibElRef}
          className="nib-ghost"
          style={{
            left: nibAt.x, top: nibAt.y,
            width: nibPx, height: nibPx,
            border: isEraser ? '2px dashed rgba(255,255,255,.9)' : `2px solid ${color}`,
            backgroundColor: isEraser ? 'transparent' : `${color}22`,
          }}
        />
      )}
    </div>
  );
}

/**
 * One line in the phone's ⋯ sheet.
 *
 * A 44px row with the name in full and what it does underneath. The header
 * these came out of could say "Plans" and rely on a tooltip for the rest;
 * a phone has no hover, so the sentence has to be on the row.
 */
function SheetRow({ icon: Icon, label, hint, danger, disabled, onClick }: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left disabled:opacity-40 hover:bg-slate-50"
      style={{ color: danger ? '#b4342a' : NAVY, minHeight: 46 }}>
      <Icon size={17} />
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-bold">{label}</span>
        {hint && <span className="block text-[11px] font-medium text-slate-500 truncate">{hint}</span>}
      </span>
    </button>
  );
}

/**
 * Where the markup has got to, as a journey rather than a sentence.
 *
 * A computer, an arrow with the seconds left inside it, and a Drive. When the
 * count runs out the arrow travels and only the Drive and a tick remain. It is
 * three symbols because the thing being reported is a position — here, on the
 * way, arrived — and a position reads faster as a picture than as the words
 * "Saved here" followed some seconds later by "Safe in Drive".
 *
 * The Drive is a BUTTON: pressing it sends the markup now rather than waiting
 * out the count, which is what somebody about to walk away from the panel
 * wants.
 */
function SaveTrip({ state, secondsLeft, compact, onSendNow }: {
  state: 'clean' | 'local' | 'sending' | 'sent' | 'failed';
  secondsLeft: number;
  /** A phone has no room for the journey — only for where it has got to. */
  compact?: boolean;
  onSendNow: () => void;
}) {
  const failed = state === 'failed';
  const flying = state === 'sending';

  /**
   * On a phone the computer and the arrow go and the Drive stays.
   *
   * Ninety pixels of picture is a quarter of a 390px row, and the row has a
   * pager and a Save button to fit in as well. What is left says the same
   * three things — kept here (grey), on its way (spinning), arrived (green
   * tick) — with the count on the corner, and it is still the button that
   * sends it now.
   */
  if (compact) {
    return (
      <span data-save-state={state} className="flex items-center flex-shrink-0 rounded-lg"
        style={{
          backgroundColor: state === 'sent' ? 'rgba(74,222,128,.14)'
            : failed ? 'rgba(239,68,68,.16)' : 'rgba(255,255,255,.08)',
          color: state === 'sent' ? '#86efac' : failed ? '#fca5a5' : 'rgba(255,255,255,.78)',
        }}
        title={failed
          ? 'Drive would not take it. Your marks are kept here — press to try again.'
          : state === 'sent' ? 'Filed in Drive'
          : 'Kept on this machine. Press to send it to Drive now.'}
      >
        <button data-save-now onClick={onSendNow}
          className="relative rounded-lg flex items-center justify-center min-w-[38px] min-h-[38px]">
          {failed ? <AlertTriangle size={16} /> : <HardDrive size={16} />}
          {state === 'sent' && (
            <Check size={11} className="absolute bottom-1 right-1" />
          )}
          {flying && (
            <Loader2 size={11} className="absolute bottom-1 right-1 animate-spin" />
          )}
          {!flying && !failed && state !== 'sent' && secondsLeft > 0 && (
            <span data-save-count
              className="absolute bottom-0.5 right-1 text-[9px] font-bold tabular-nums">
              {secondsLeft}
            </span>
          )}
        </button>
      </span>
    );
  }

  if (state === 'sent') {
    return (
      <span data-save-state="sent" title="Filed in Drive"
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg flex-shrink-0"
        style={{ backgroundColor: 'rgba(74,222,128,.14)', color: '#86efac' }}>
        <HardDrive size={15} />
        <Check size={12} />
      </span>
    );
  }

  return (
    <span
      data-save-state={state}
      className="flex items-center gap-1 px-2 py-1.5 rounded-lg flex-shrink-0"
      style={{
        backgroundColor: failed ? 'rgba(239,68,68,.16)' : 'rgba(255,255,255,.08)',
        color: failed ? '#fca5a5' : 'rgba(255,255,255,.78)',
      }}
      title={failed
        ? 'Drive would not take it. Your marks are kept here — press the Drive to try again.'
        : 'Kept on this computer. Press the Drive to send it now.'}
    >
      <Monitor size={13} />
      <span className="relative flex items-center justify-center" style={{ width: 34, height: 16 }}>
        <span className={flying ? 'save-fly' : ''} style={{ display: 'flex' }}>
          <ArrowRight size={13} />
        </span>
        {!flying && !failed && secondsLeft > 0 && (
          <span data-save-count
            className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums">
            {secondsLeft}
          </span>
        )}
      </span>
      <button
        data-save-now
        onClick={onSendNow}
        title="Send it to Drive now"
        className="rounded p-0.5 hover:bg-white/15 transition-colors"
      >
        {failed ? <AlertTriangle size={14} /> : <HardDrive size={14} />}
      </button>
    </span>
  );
}


/**
 * A question with a way out, in the studio's own colours.
 *
 * Used for the two things that cannot be taken back by doing them again:
 * rubbing every mark off, and walking away before Drive has the drawing.
 * `second` is the "do it without me" option — offered, never default.
 */
function AskFirst({ title, body, confirm, second, danger, onCancel, onConfirm, onSecond }: {
  title: string; body: string; confirm: string; second?: string; danger?: boolean;
  onCancel: () => void; onConfirm: () => void; onSecond?: () => void;
}) {
  /**
   * The question owns Escape, and nothing behind it hears the key.
   *
   * Capture phase and `stopImmediatePropagation`, because the studio AND the
   * job window behind it both close on Escape — so one press on the question
   * used to dismiss it, close the plan, and close the job, leaving you back on
   * the board wondering what you had pressed.
   */
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onCancel();
    }
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onCancel]);

  return (
    <>
      <div className="fixed inset-0 z-[160]" style={{ backgroundColor: 'rgba(9,14,22,.6)' }}
        onClick={onCancel} />
      <div data-ask-first
        className="fixed z-[161] rounded-2xl shadow-2xl overflow-hidden"
        style={{
          left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: 'min(420px, 92vw)', backgroundColor: '#fff',
        }}>
        <div className="px-5 py-3 font-bold text-[14px] text-white"
          style={{ backgroundColor: danger ? '#b4342a' : NAVY }}>
          {title}
        </div>
        <p className="px-5 py-4 text-[13px] text-slate-600 m-0 leading-snug">{body}</p>
        <div className="flex justify-end gap-2 px-5 pb-4">
          <button onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12.5px] font-semibold text-gray-600">
            Cancel
          </button>
          {second && onSecond && (
            <button data-ask-second onClick={onSecond}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12.5px] font-semibold text-gray-600">
              {second}
            </button>
          )}
          <button data-ask-confirm onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-[12.5px] font-bold text-white"
            style={{ backgroundColor: danger ? '#b4342a' : ACCENT }}>
            {confirm}
          </button>
        </div>
      </div>
    </>
  );
}
