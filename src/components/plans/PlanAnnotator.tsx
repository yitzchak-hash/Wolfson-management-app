import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Undo2, Redo2, Trash2, Save, Printer, Download, ChevronLeft, ChevronRight,
  Plus, Minus, Maximize2, Loader2, Pen, Pencil, Highlighter, Eraser, Minus as LineIcon,
  ArrowUpRight, Square, Circle, Type, Hand, Layers, FileDown, Check, ExternalLink,
  MessageSquare, Move, Layers2, ChevronsUpDown, User as UserIcon,
} from 'lucide-react';
import './pdfCompat';   // must come before pdf.js
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useStore } from '../../data/store';
import { AnnStroke, AnnTool, PlanAnnotation } from '../../types';
import { fetchPlanBytes, stampPlanToDrive, extractFolderId, isUploadBackendConfigured } from '../../data/driveApi';
import { PenStroke, PenSample, samplesOf, simplify, nearSegment } from './penInput';
import { TOOLS, toolById, INK_COLORS, HIGHLIGHT_COLORS, rememberColor } from './annotTools';
import { InkPicker } from './InkPicker';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Break a line of text to a width, for the speech balloon. */
function wrapped(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
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

/** The reference page width every stored width is measured against. */
const REF = 1000;

/**
 * The editor wears the company's colours, not a generic dark-grey app chrome.
 * Navy is the same one the header, the sidebar and every print sheet use; the
 * blue is the accent that marks whatever is active.
 */
const NAVY = '#1e3a5f';
const NAVY_DEEP = '#152b47';
const ACCENT = '#4aa8d8';

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  pen: Pen, pencil: Pencil, marker: Highlighter, highlighter: Highlighter,
  line: LineIcon, arrow: ArrowUpRight, rect: Square, ellipse: Circle,
  text: Type, eraser: Eraser, pan: Hand, move: Move, bubble: MessageSquare,
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

/** Only the bits of pdf.js's optional-content config this needs. */
interface OcConfig {
  getOrder?(): unknown[];
  getGroup?(id: string): { name?: string } | undefined;
  setVisibility?(id: string, on: boolean): void;
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
}

export function PlanAnnotator({
  planFileId, planName, apartmentId, apartmentLabel, driveFolderUrl, plansFolderId,
  authorName, readOnly = false, askWho = false, people = [], plans = [],
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
   * The wallboard is shared — whoever walks up to it is not "the office".
   * When this is on, the editor asks who is drawing before it will let anyone
   * draw, and that name goes on the version and into the PDF.
   */
  askWho?: boolean;
  people?: string[];
  /** Every plan on this job: the originals, and the markups made from them. */
  plans?: PlanChoice[];
  onClose: () => void;
  onToast?: (msg: string, kind?: 'success' | 'error') => void;
  onPickPlan?: (p: PlanChoice) => void;
  /** Turns a read-only viewing into an editing session, in place. */
  onStartMarkup?: () => void;
}) {
  const planAnnotations = useStore(s => s.planAnnotations);
  const savePlanAnnotation = useStore(s => s.savePlanAnnotation);
  const deletePlanAnnotation = useStore(s => s.deletePlanAnnotation);

  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [page, setPage] = useState(0);
  const [scale, setScale] = useState(1.25);
  const [fitting, setFitting] = useState(true);

  const [strokes, setStrokes] = useState<AnnStroke[]>([]);
  const [redo, setRedo] = useState<AnnStroke[]>([]);
  const [basedOn, setBasedOn] = useState<number | undefined>(undefined);
  const [dirty, setDirty] = useState(false);

  const [tool, setTool] = useState<string>('pen');
  const [color, setColor] = useState('#dc2626');
  const [width, setWidth] = useState(3);
  const [opacity, setOpacity] = useState(1);
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
  const [showDownload, setShowDownload] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  /** On the wallboard: who is drawing. Empty means nobody has said yet. */
  const [who, setWho] = useState(askWho ? '' : authorName);

  const stageRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<{ cancel(): void } | null>(null);
  const ocRef = useRef<OcConfig | null>(null);
  const drawing = useRef<{ pen: PenStroke; pts: PenSample[]; startedAt: number } | null>(null);
  /** A drag of something already drawn, rather than a new stroke. */
  const moving = useRef<{ id: string; nx: number; ny: number; pts: number[] } | null>(null);
  const erased = useRef<Set<string>>(new Set());
  const textRef = useRef<HTMLTextAreaElement>(null);

  const preset = toolById(tool);
  const backendReady = isUploadBackendConfigured();

  /**
   * Read-only until somebody says who they are.
   *
   * The wallboard is the shared screen in the office, so "the office" is not an
   * answer to who marked a plan up. It stays inert until a name is chosen, and
   * from then on it behaves like any other machine.
   */
  const locked = readOnly || (askWho && !who);

  /** The pen shows the size it will draw at; the eraser shows what it will take. */
  const showNib = !locked && (preset.freehand || tool === 'eraser');
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
    fetchPlanBytes(planFileId)
      .then(buf => pdfjs.getDocument({ data: new Uint8Array(buf) }).promise)
      .then(d => { if (!dead) { setDoc(d as unknown as PdfDoc); setPage(0); } })
      .catch(e => { if (!dead) setLoadErr(e instanceof Error ? e.message : String(e)); });
    return () => { dead = true; };
  }, [planFileId]);

  // ---- render the page ---------------------------------------------------
  const renderPage = useCallback(async () => {
    if (!doc || !pdfRef.current) return;
    const p = await doc.getPage(page + 1);

    // Fit-to-width on first sight of a page, because a construction drawing at
    // 100% is unusable on any screen and hunting for the zoom first is friction.
    let s = scale;
    if (fitting && stageRef.current) {
      const avail = stageRef.current.clientWidth - 32;
      const nat = p.getViewport({ scale: 1 }).width;
      s = Math.max(0.2, Math.min(4, avail / nat));
      setScale(s); setFitting(false);
    }

    const vp = p.getViewport({ scale: s });
    // Render above CSS resolution so the linework stays sharp on a 4K panel,
    // capped so an A0 sheet does not allocate a canvas the browser refuses.
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.round(vp.width), h = Math.round(vp.height);

    for (const c of [pdfRef.current, inkRef.current, liveRef.current]) {
      if (!c) continue;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }

    renderTask.current?.cancel();
    const ctx = pdfRef.current.getContext('2d')!;
    // The canvas is already sized at dpr, so the DPR goes into the viewport
    // scale and the context transform stays identity — doing both would render
    // the page at dpr squared and clip it to a corner.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pdfRef.current.width, pdfRef.current.height);
    const task = p.render({
      canvasContext: ctx,
      viewport: p.getViewport({ scale: s * dpr }),
      // Draw with whatever layers are switched on.
      ...(ocRef.current ? { optionalContentConfigPromise: Promise.resolve(ocRef.current) } : {}),
    });
    renderTask.current = task;
    try { await task.promise; } catch { /* superseded by a newer render */ }
    redrawInk();
  }, [doc, page, scale, fitting]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void renderPage(); }, [renderPage]);

  // Re-fit when the window changes shape — the studio is full screen, so a
  // rotated tablet or a resized window otherwise leaves the plan stranded.
  useEffect(() => {
    const on = () => setFitting(true);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  /**
   * Ctrl/⌘ + wheel zooms the PLAN, not the browser.
   *
   * React's onWheel prop is passive in several browsers, where preventDefault()
   * silently does nothing and the browser zooms the whole page instead — which
   * on a full-screen editor throws the layout apart. Registering by hand with
   * `{ passive: false }` is the only way to claim the gesture, and it is the
   * same lesson the job board learned.
   */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function wheel(e: WheelEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;      // plain wheel still scrolls
      e.preventDefault();
      setFitting(false);
      setScale(z => {
        const next = z * (e.deltaY < 0 ? 1.12 : 1 / 1.12);
        return Math.min(6, Math.max(0.15, Math.round(next * 100) / 100));
      });
    }
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

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
        const order = (cfg.getOrder?.() ?? []).filter((x): x is string => typeof x === 'string');
        const rows = order.map(id => ({ id, name: cfg.getGroup?.(id)?.name ?? 'Layer', on: true }));
        if (!dead) { ocRef.current = cfg; setLayers(rows); }
      } catch { if (!dead) setLayers([]); }
    })();
    return () => { dead = true; };
  }, [doc]);

  function toggleLayer(id: string) {
    const cfg = ocRef.current;
    if (!cfg) return;
    setLayers(prev => {
      const next = prev.map(l => (l.id === id ? { ...l, on: !l.on } : l));
      const row = next.find(l => l.id === id);
      try { cfg.setVisibility?.(id, !!row?.on); } catch { /* older build */ }
      return next;
    });
    // Re-render so the change shows.
    setTimeout(() => void renderPage(), 0);
  }

  // ---- painting ----------------------------------------------------------

  /** Normalised (0..1) point → ink-canvas pixels. */
  const toPx = (c: HTMLCanvasElement, nx: number, ny: number) => ({ x: nx * c.width, y: ny * c.height });

  function paint(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, s: AnnStroke) {
    const unit = c.width / REF;
    ctx.save();
    ctx.globalAlpha = s.opacity;
    ctx.globalCompositeOperation = s.tool === 'highlighter' ? 'multiply' : 'source-over';
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
      ctx.font = `600 ${size}px Segoe UI, Helvetica, Arial, sans-serif`;
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
        const size = Math.max(7, (s.fontSize ?? 15) * unit);
        ctx.font = `600 ${size}px Segoe UI, Helvetica, Arial, sans-serif`;
        ctx.textBaseline = 'top';
        wrapped(ctx, s.text, w - base * 8).forEach((line, i) => {
          ctx.fillText(line, x0 + base * 4, y0 + base * 4 + i * size * 1.22);
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
    } else {
      // Freehand. Per-segment width is how pen pressure survives — one width
      // for the whole polyline would throw it away.
      for (let i = 1; i < pts.length; i++) {
        ctx.beginPath();
        ctx.lineWidth = base * ((pts[i - 1].w + pts[i].w) / 2);
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(a.x, a.y, (base * a.w) / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  const redrawInk = useCallback(() => {
    const c = inkRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of strokes) if (s.page === page) paint(ctx, c, s);
  }, [strokes, page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { redrawInk(); }, [redrawInk]);

  // autoFocus alone loses this race: the note box mounts while the pointer that
  // opened it is still finishing its press, and the canvas takes focus back.
  useEffect(() => {
    if (!textDraft) return;
    const t = setTimeout(() => textRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [textDraft?.nx, textDraft?.ny]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearLive() {
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

  function eraseAt(nx: number, ny: number) {
    const radius = (width / REF) * 0.55 + 0.004;
    let hit = false;
    for (const s of strokes) {
      if (s.page !== page || erased.current.has(s.id)) continue;
      if (hits(s, nx, ny, radius)) { erased.current.add(s.id); hit = true; }
    }
    if (hit) setStrokes(prev => prev.filter(s => !erased.current.has(s.id)));
  }

  /** The mark under a point, topmost first — what the move tool picks up. */
  function markAt(nx: number, ny: number): AnnStroke | null {
    const r = 0.012;
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      if (s.page !== page) continue;
      if (hits(s, nx, ny, r)) return s;
    }
    return null;
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (locked || tool === 'pan') return;
    const { nx: dnx, ny: dny } = norm(e);

    // The move tool picks something up rather than laying something down.
    if (tool === 'move') {
      const hit = markAt(dnx, dny);
      setPicked(hit?.id ?? null);
      if (hit) {
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        moving.current = { id: hit.id, nx: dnx, ny: dny, pts: [...hit.pts] };
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

    if (tool === 'eraser') {
      erased.current = new Set();
      drawing.current = { pen: new PenStroke({ sensitivity: 0 }), pts: [], startedAt: Date.now() };
      eraseAt(nx, ny);
      return;
    }

    const pen = new PenStroke({ sensitivity: preset.sensitivity * sens });
    const s = pen.push(e.nativeEvent, performance.now());
    drawing.current = { pen, pts: [{ x: nx, y: ny, w: s.w }], startedAt: Date.now() };
    setPenSource(pen.usedSource);
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    // The nib follows the pointer whatever else is happening, so the width is
    // chosen by looking at it rather than by drawing a test line.
    if (showNib) setNibAt({ x: e.clientX, y: e.clientY });

    // Dragging something already drawn.
    const m = moving.current;
    if (m) {
      e.preventDefault();
      const { nx, ny } = norm(e);
      const dx = nx - m.nx, dy = ny - m.ny;
      const moved = m.pts.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v));
      setStrokes(prev => prev.map(s => (s.id === m.id ? { ...s, pts: moved } : s)));
      return;
    }

    const d = drawing.current;
    if (!d) return;
    e.preventDefault();

    if (tool === 'eraser') {
      const { nx, ny } = norm(e);
      eraseAt(nx, ny);
      return;
    }

    if (preset.freehand) {
      // Coalesced samples matter: a pen faster than the refresh rate otherwise
      // draws visibly faceted lines.
      for (const raw of samplesOf(e.nativeEvent)) {
        const { nx, ny } = norm(raw);
        const s = d.pen.push(raw, performance.now());
        const prev = d.pts[d.pts.length - 1];
        d.pts.push({ x: nx, y: ny, w: s.w });
        // Incremental: draw only the new segment, so a long stroke stays
        // as cheap on frame 5000 as on frame 5.
        const c = liveRef.current!;
        const ctx = c.getContext('2d')!;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.globalCompositeOperation = tool === 'highlighter' ? 'multiply' : 'source-over';
        ctx.strokeStyle = color;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(0.5, width * (c.width / REF)) * ((prev.w + s.w) / 2);
        ctx.beginPath();
        ctx.moveTo(prev.x * c.width, prev.y * c.height);
        ctx.lineTo(nx * c.width, ny * c.height);
        ctx.stroke();
        ctx.restore();
      }
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
      paint(liveRef.current!.getContext('2d')!, liveRef.current!, draftStroke(d.pts));
    }
  }

  function draftStroke(pts: PenSample[]): AnnStroke {
    return {
      id: 'draft', page, tool: tool as AnnTool, color, width, opacity,
      pts: pts.flatMap(p => [p.x, p.y, p.w]),
    };
  }

  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (moving.current) {
      moving.current = null;
      try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch { /* gone */ }
      setRedo([]); setDirty(true);
      return;
    }
    const d = drawing.current;
    drawing.current = null;
    try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    if (!d) return;

    if (tool === 'eraser') {
      if (erased.current.size) { setRedo([]); setDirty(true); }
      erased.current = new Set();
      return;
    }

    const pts = preset.freehand ? simplify(d.pts, 0.0006) : d.pts;
    // A tap with a shape tool is a mis-click, not a zero-size box.
    if (!preset.freehand && pts.length > 1 && Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) < 0.004) {
      clearLive(); return;
    }
    if (!pts.length) { clearLive(); return; }

    const s: AnnStroke = {
      id: `S-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      page, tool: tool as AnnTool, color, width, opacity,
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
    if (tool === 'bubble') {
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
        ? { ...s, text: v, fontSize: Math.max(9, width * 4 + 11) } : s)));
      setDirty(true);
      return;
    }
    if (!v) return;
    setStrokes(prev => [...prev, {
      id: `S-${Date.now().toString(36)}`,
      page, tool: 'text', color, width: 0, opacity,
      fontSize: Math.max(8, width * 5 + 10),
      text: v,
      pts: [textDraft.nx, textDraft.ny, 1],
    }]);
    setRedo([]); setDirty(true);
  }

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
        if (textDraft) setTextDraft(null);
        else if (showPalette) setShowPalette(false);
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
          s: 'move', b: 'bubble',
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
    if (dirty && !window.confirm('Start a blank sketch? The marks you have not saved will go.')) return;
    setStrokes([]); setRedo([]); setBasedOn(undefined); setDirty(false);
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
        version: nextVersion,
        jobName: apartmentLabel,
        author: who || authorName,
      });
      storeVersion(out.fileId, out.webViewLink);
      onToast?.(`Version ${nextVersion} filed in Drive under “Annotated Plans”.`);
    } catch (err) {
      storeVersion();
      onToast?.(`Saved here, but Drive refused it: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  function storeVersion(driveFileId?: string, driveUrl?: string) {
    savePlanAnnotation({
      id: `PA-${planFileId.slice(0, 8)}-${nextVersion}-${Date.now().toString(36)}`,
      apartmentId, planFileId, planName,
      version: nextVersion,
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
  async function print() {
    if (!doc) return;
    onToast?.('Building the print sheet…');
    const imgs: string[] = [];
    for (let i = 0; i < doc.numPages; i++) {
      const p = await doc.getPage(i + 1);
      const vp = p.getViewport({ scale: 2 });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await p.render({ canvasContext: ctx, viewport: vp }).promise;
      for (const s of strokes) if (s.page === i) paint(ctx, c, s);
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
        <span>${strokes.length} mark${strokes.length === 1 ? '' : 's'} · ${new Date().toLocaleString()}</span></div>
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
    onToast?.('Making the pictures…');
    for (let i = 0; i < doc.numPages; i++) {
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
      for (const s of strokes) if (s.page === i) paint(ctx, c, s);

      const a = document.createElement('a');
      a.download = `${apartmentLabel} — ${planName || 'plan'}${doc.numPages > 1 ? ` — page ${i + 1}` : ''}.png`;
      a.href = c.toDataURL('image/png');
      a.click();
    }
    onToast?.(doc.numPages === 1 ? 'Picture saved' : `${doc.numPages} pictures saved`);
  }

  // ---- UI ----------------------------------------------------------------

  const palette = tool === 'highlighter' ? HIGHLIGHT_COLORS : INK_COLORS;
  const marksOnPage = strokes.filter(s => s.page === page).length;

  return (
    <div className="fixed inset-0 z-[150] flex flex-col" style={{ backgroundColor: NAVY_DEEP }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{ backgroundColor: NAVY }}>
        <Layers size={16} className="text-[#4aa8d8] flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-white truncate">{planName || 'Plan'}</div>
          <div className="text-[10.5px] text-gray-400 truncate">
            {apartmentLabel}
            {basedOn ? ` · carrying on from v${basedOn}` : ''}
            {dirty ? ' · unsaved' : ''}
          </div>
        </div>

        <div className="flex-1" />

        {doc && doc.numPages > 1 && (
          <div className="flex items-center gap-1 text-white/85 text-[12px] mr-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30"><ChevronLeft size={15} /></button>
            <span className="tabular-nums">{page + 1} / {doc.numPages}</span>
            <button onClick={() => setPage(p => Math.min(doc.numPages - 1, p + 1))} disabled={page >= doc.numPages - 1}
              className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30"><ChevronRight size={15} /></button>
          </div>
        )}

        <div className="flex items-center gap-0.5 text-white/85 mr-1">
          <button onClick={() => setScale(s => Math.max(0.2, s - 0.2))} title="Zoom out"
            className="p-1.5 rounded-lg hover:bg-white/10"><Minus size={14} /></button>
          <span className="text-[11px] tabular-nums w-11 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(5, s + 0.2))} title="Zoom in"
            className="p-1.5 rounded-lg hover:bg-white/10"><Plus size={14} /></button>
          <button onClick={() => setFitting(true)} title="Fit the page"
            className="p-1.5 rounded-lg hover:bg-white/10"><Maximize2 size={13} /></button>
        </div>

        {plans.length > 1 && (
          <button onClick={() => setShowPlans(true)}
            title="Switch between the original plans and the marked-up ones"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-white/85 hover:bg-white/10">
            <ChevronsUpDown size={13} /> Plans
          </button>
        )}

        <button onClick={() => setShowLayers(v => !v)}
          title="Show or hide the plan's own layers"
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

        {!locked && (
          <button onClick={save} disabled={saving || !strokes.length}
            title="Save this markup as a new version and file a PDF in Drive"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: ACCENT }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Filing…' : `Save v${nextVersion}`}
          </button>
        )}

        <button onClick={() => setShowVersions(v => !v)} title="Saved versions"
          className={`p-1.5 rounded-lg ${showVersions ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10'}`}>
          <FileDown size={15} />
        </button>
        {/* Looking at it should be one step away from marking it up — closing
            and reopening through a different button is friction for nothing. */}
        {readOnly && !askWho && onStartMarkup && (
          <button onClick={onStartMarkup}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold text-white"
            style={{ backgroundColor: ACCENT }}>
            <Pen size={13} /> Mark up
          </button>
        )}
        {askWho && who && (
          <button onClick={() => setWho('')} title="Not you? Hand over to somebody else"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-white/85 hover:bg-white/10">
            <UserIcon size={13} /> {who}
          </button>
        )}
        <button onClick={onClose} title="Close" className="p-1.5 rounded-lg text-white/70 hover:bg-white/10">
          <X size={17} />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Tool rail */}
        {!locked && (
          <div className="w-[62px] flex-shrink-0 flex flex-col items-center gap-1 py-2 overflow-y-auto board-rail"
            style={{ backgroundColor: NAVY }}>
            {TOOLS.map(t => {
              const Icon = ICONS[t.id] ?? Pen;
              const on = tool === t.id;
              return (
                <button key={t.id} onClick={() => pick(t.id)} title={`${t.label} — ${t.hint}`}
                  className="w-[50px] py-1.5 rounded-xl flex flex-col items-center gap-0.5 transition-colors"
                  style={{
                    backgroundColor: on ? ACCENT : 'transparent',
                    color: on ? '#fff' : 'rgba(255,255,255,.62)',
                  }}>
                  <Icon size={16} />
                  <span className="text-[8.5px] font-semibold leading-none">{t.label}</span>
                </button>
              );
            })}
            <div className="h-px w-8 my-1" style={{ backgroundColor: 'rgba(255,255,255,.12)' }} />
            {/* "Pan", not "Move" — Move is the tool that picks marks up, and two
                buttons with the same word is a coin toss. */}
            <button onClick={() => pick('pan')} title="Pan — scroll around the plan without drawing"
              className="w-[50px] py-1.5 rounded-xl flex flex-col items-center gap-0.5"
              style={{ backgroundColor: tool === 'pan' ? ACCENT : 'transparent', color: tool === 'pan' ? '#fff' : 'rgba(255,255,255,.62)' }}>
              <Hand size={16} /><span className="text-[8.5px] font-semibold leading-none">Pan</span>
            </button>
            <button onClick={undo} disabled={!strokes.length} title="Undo (Ctrl+Z)"
              className="w-[50px] py-1.5 rounded-xl flex flex-col items-center gap-0.5 text-white/60 disabled:opacity-25 hover:bg-white/10">
              <Undo2 size={15} /><span className="text-[8.5px] font-semibold leading-none">Undo</span>
            </button>
            <button onClick={redoOne} disabled={!redo.length} title="Redo (Ctrl+Shift+Z)"
              className="w-[50px] py-1.5 rounded-xl flex flex-col items-center gap-0.5 text-white/60 disabled:opacity-25 hover:bg-white/10">
              <Redo2 size={15} /><span className="text-[8.5px] font-semibold leading-none">Redo</span>
            </button>
            <button onClick={newSketch} title="Start a blank sketch"
              className="w-[50px] py-1.5 rounded-xl flex flex-col items-center gap-0.5 text-white/60 hover:bg-white/10">
              <Trash2 size={15} /><span className="text-[8.5px] font-semibold leading-none">Clear</span>
            </button>
          </div>
        )}

        {/* Stage */}
        <div className="flex-1 min-w-0 flex flex-col">
          {!locked && (
            <div className="flex items-center gap-2 px-3 py-1.5 flex-wrap flex-shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,.04)' }}>
              {/* Colour — one well, not a strip of swatches and the OS dialog. */}
              <button
                onClick={e => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setShowPalette(v => !v);
                  setPaletteAt({ x: r.left, y: r.bottom + 8 });
                }}
                title="Ink colour"
                className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,.08)' }}
              >
                <span className="w-[20px] h-[20px] rounded-full flex-shrink-0"
                  style={{ backgroundColor: color, border: '2px solid rgba(255,255,255,.55)' }} />
                <span className="text-[10.5px] font-mono text-white/70">{color}</span>
              </button>

              {/* The tool's own shortlist, so the common ones stay one click away. */}
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

              <span className="w-px h-5 bg-white/10" />

              <label className="flex items-center gap-1.5 text-[10.5px] text-white/70">
                Width
                <input type="range" min={0.5} max={60} step={0.5} value={width}
                  onChange={e => setWidth(Number(e.target.value))} className="ink-slider w-[92px]" />
                <span className="tabular-nums w-6">{width}</span>
              </label>

              <label className="flex items-center gap-1.5 text-[10.5px] text-white/70">
                See-through
                <input type="range" min={0.05} max={1} step={0.05} value={opacity}
                  onChange={e => setOpacity(Number(e.target.value))} className="ink-slider w-[80px]" />
                <span className="tabular-nums w-7">{Math.round(opacity * 100)}%</span>
              </label>

              {preset.freehand && preset.sensitivity > 0 && (
                <label className="flex items-center gap-1.5 text-[10.5px] text-white/70"
                  title="How much pen pressure — or nib size on the Samsung screen — changes the thickness">
                  Pressure
                  <input type="range" min={0} max={2} step={0.1} value={sens}
                    onChange={e => setSens(Number(e.target.value))} className="ink-slider w-[74px]" />
                  {/* Which signal it is riding. A stylus with no pressure sensor
                      reports a plausible constant rather than nothing, so without
                      this the slider looks broken when it is simply being handed
                      a flat number. */}
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(255,255,255,.10)', color: 'rgba(255,255,255,.62)' }}>
                    {penSource === 'pressure' ? 'real pressure'
                      : penSource === 'contact' ? 'nib size'
                      : penSource ? 'speed — no pressure from this pen'
                      : 'draw to detect'}
                  </span>
                </label>
              )}

              <div className="flex-1" />
              <span className="text-[10px] text-white/40">
                {marksOnPage} mark{marksOnPage === 1 ? '' : 's'} on this page
                {preset.freehand && preset.sensitivity > 0 && penSource &&
                  ` · ${penSource === 'pressure' ? 'pen pressure' : penSource === 'contact' ? 'nib size' : 'speed'}`}
              </span>
            </div>
          )}

          <div ref={stageRef} className="flex-1 min-h-0 overflow-auto p-4 flex items-start justify-center">
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
              <div className="flex items-center gap-2 text-gray-400 text-[13px] mt-16">
                <Loader2 size={16} className="animate-spin" /> Opening the plan…
              </div>
            ) : (
              <div className="relative shadow-2xl" style={{ backgroundColor: '#fff' }}>
                <canvas ref={pdfRef} className="block" />
                <canvas ref={inkRef} className="absolute inset-0 pointer-events-none" />
                <canvas
                  ref={liveRef}
                  className="absolute inset-0"
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  onPointerLeave={() => setNibAt(null)}
                  style={{
                    // The pen must not scroll the page while it draws, and the
                    // palm must not either — without this the Samsung screen
                    // pans instead of drawing.
                    touchAction: locked || tool === 'pan' ? 'auto' : 'none',
                    // With a nib ghost on screen the cursor itself gets out of
                    // the way — two crosshairs is one too many.
                    cursor: locked || tool === 'pan' ? 'grab'
                      : tool === 'text' ? 'text'
                      : tool === 'move' ? 'move'
                      : showNib ? 'none' : 'crosshair',
                    pointerEvents: locked || tool === 'pan' ? 'none' : 'auto',
                  }}
                />
                {textDraft && (
                  <div className="absolute z-10" style={{ left: `${textDraft.nx * 100}%`, top: `${textDraft.ny * 100}%` }}>
                    <textarea
                      ref={textRef} rows={2}
                      value={textDraft.value}
                      onChange={e => setTextDraft({ ...textDraft, value: e.target.value })}
                      onBlur={commitText}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
                        if (e.key === 'Escape') setTextDraft(null);
                      }}
                      placeholder="Note on the plan…"
                      className="px-2 py-1 rounded-lg border-2 shadow-lg text-[13px] outline-none resize"
                      style={{ borderColor: color, color, minWidth: 180 }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Versions */}
        {showVersions && (
          <div className="w-[248px] flex-shrink-0 flex flex-col overflow-hidden" style={{ backgroundColor: NAVY }}>
            <div className="px-3 py-2.5 flex-shrink-0">
              <div className="text-[12px] font-bold text-white">Saved versions</div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Each one is a PDF in Drive with the markup on its own layer.
              </div>
            </div>

            {!readOnly && (
              <button onClick={newSketch}
                className="mx-3 mb-2 px-2.5 py-2 rounded-lg text-[11.5px] font-semibold text-white/85 flex items-center gap-1.5 flex-shrink-0"
                style={{ backgroundColor: 'rgba(255,255,255,.07)' }}>
                <Plus size={13} /> Start a blank sketch
              </button>
            )}

            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
              {versions.length === 0 && (
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Nothing saved yet. Draw something and press Save — it becomes version 1.
                </p>
              )}
              {versions.map(v => (
                <div key={v.id} className="rounded-xl p-2.5" style={{ backgroundColor: 'rgba(255,255,255,.06)' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11.5px] font-bold text-white">Version {v.version}</span>
                    {v.basedOn && <span className="text-[9px] text-gray-500">from v{v.basedOn}</span>}
                    <span className="flex-1" />
                    {v.driveUrl && <Check size={11} className="text-emerald-400" />}
                  </div>
                  <div className="text-[9.5px] text-gray-500 mt-0.5">
                    {v.createdBy || 'Office'} · {new Date(v.createdAt).toLocaleDateString()} ·
                    {' '}{v.strokes?.length ?? 0} marks
                  </div>
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    <button onClick={() => loadVersion(v, false)}
                      className="px-1.5 py-1 rounded-md text-[10px] font-semibold text-white/80 hover:bg-white/10"
                      title="Show this version on the plan">View</button>
                    {!readOnly && (
                      <button onClick={() => loadVersion(v, true)}
                        className="px-1.5 py-1 rounded-md text-[10px] font-semibold text-[#4aa8d8] hover:bg-white/10"
                        title="Open this version and keep drawing on it">Add to it</button>
                    )}
                    {v.driveUrl && (
                      <>
                        <a href={v.driveUrl} target="_blank" rel="noopener noreferrer"
                          className="p-1 rounded-md text-white/60 hover:bg-white/10" title="Open in Drive">
                          <ExternalLink size={11} />
                        </a>
                        <a href={`https://drive.google.com/uc?export=download&id=${v.driveFileId}`}
                          className="p-1 rounded-md text-white/60 hover:bg-white/10" title="Download this version">
                          <Download size={11} />
                        </a>
                      </>
                    )}
                    {!readOnly && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove version ${v.version} from the app? The PDF stays in Drive.`)) {
                            deletePlanAnnotation(v.id);
                          }
                        }}
                        className="p-1 rounded-md text-white/35 hover:text-red-400 hover:bg-white/10"
                        title="Remove from the list — the Drive file is left alone">
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
          <div className="fixed z-[159] rounded-2xl overflow-hidden"
            style={{
              right: 268, top: 58, width: 250, maxHeight: '60vh',
              background: '#fff', boxShadow: '0 20px 48px -10px rgba(15,23,42,.4)',
            }}>
            <div className="px-3 py-2 text-[12px] font-bold text-white" style={{ backgroundColor: NAVY }}>
              Layers on this plan
            </div>
            <div className="p-2 overflow-y-auto" style={{ maxHeight: '48vh' }}>
              {layers.length === 0 && (
                <p className="px-2 py-3 text-[11.5px] text-gray-500 leading-snug">
                  This plan has no layers of its own — it was flattened when it was issued.
                  Your markup still saves as its own layer.
                </p>
              )}
              {layers.map(l => (
                <button key={l.id} onClick={() => toggleLayer(l.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-left">
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
      {showPlans && plans.length > 0 && (
        <>
          <div className="fixed inset-0 z-[158]" onClick={() => setShowPlans(false)} />
          <div className="fixed z-[159] rounded-2xl overflow-hidden bg-white"
            style={{ left: '50%', top: 56, transform: 'translateX(-50%)', width: 'min(460px,92vw)',
                     maxHeight: '70vh', boxShadow: '0 20px 48px -10px rgba(15,23,42,.4)' }}>
            <div className="px-3 py-2 text-[12px] font-bold text-white" style={{ backgroundColor: NAVY }}>
              Plans on this job
            </div>
            <div className="p-2 overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {(['original', 'annotated'] as const).map(kind => {
                const rows = plans.filter(p => p.kind === kind);
                if (!rows.length) return null;
                return (
                  <div key={kind} className="mb-2">
                    <div className="px-2 py-1 text-[9.5px] font-extrabold tracking-wide text-gray-400">
                      {kind === 'original' ? 'ORIGINALS' : 'MARKED UP'}
                    </div>
                    {rows.map(p => (
                      <button key={p.id}
                        onClick={() => { onPickPlan?.(p); setShowPlans(false); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-left">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: p.id === planFileId ? ACCENT : '#cbd5e1' }} />
                        <span className="text-[12px] text-gray-700 truncate flex-1">{p.name}</span>
                        {p.id === planFileId && <Check size={12} style={{ color: ACCENT }} />}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* The wallboard asks who is drawing before it lets anyone draw. */}
      {askWho && !who && (
        <>
          <div className="fixed inset-0 z-[158] bg-black/55" />
          <div className="fixed z-[159] rounded-2xl overflow-hidden bg-white"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(460px,92vw)',
                     boxShadow: '0 24px 60px -12px rgba(15,23,42,.5)' }}>
            <div className="px-4 py-3 text-white" style={{ backgroundColor: NAVY }}>
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

      {/* The nib, at the size it will actually draw. A crosshair tells you where
          but never how big, which is the thing you are choosing. */}
      {showNib && nibAt && !showPalette && (
        <span
          className="nib-ghost"
          style={{
            left: nibAt.x, top: nibAt.y,
            width: nibPx, height: nibPx,
            border: tool === 'eraser' ? '2px dashed rgba(255,255,255,.9)' : `2px solid ${color}`,
            backgroundColor: tool === 'eraser' ? 'transparent' : `${color}22`,
          }}
        />
      )}
    </div>
  );
}
