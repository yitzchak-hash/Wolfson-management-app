import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Undo2, Redo2, Trash2, Save, Printer, Download, ChevronLeft, ChevronRight,
  Plus, Minus, Maximize2, Loader2, Pen, Pencil, Highlighter, Eraser, Minus as LineIcon,
  ArrowUpRight, Square, Circle, Type, Hand, Layers, FileDown, Check, Palette, ExternalLink,
} from 'lucide-react';
import './pdfCompat';   // must come before pdf.js
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useStore } from '../../data/store';
import { AnnStroke, AnnTool, PlanAnnotation } from '../../types';
import { fetchPlanBytes, stampPlanToDrive, extractFolderId, isUploadBackendConfigured } from '../../data/driveApi';
import { PenStroke, PenSample, samplesOf, simplify } from './penInput';
import { TOOLS, toolById, INK_COLORS, HIGHLIGHT_COLORS, recentColors, rememberColor } from './annotTools';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** The reference page width every stored width is measured against. */
const REF = 1000;

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  pen: Pen, pencil: Pencil, marker: Highlighter, highlighter: Highlighter,
  line: LineIcon, arrow: ArrowUpRight, rect: Square, ellipse: Circle,
  text: Type, eraser: Eraser, pan: Hand,
};

interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void>; cancel(): void };
  cleanup?(): void;
}
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage> }

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
export function PlanAnnotator({
  planFileId, planName, apartmentId, apartmentLabel, driveFolderUrl,
  authorName, readOnly = false, onClose, onToast,
}: {
  planFileId: string;
  planName?: string;
  apartmentId: string;
  apartmentLabel: string;
  /** The job's Drive folder — the markup is filed in an "Annotated Plans" subfolder of it. */
  driveFolderUrl?: string;
  authorName: string;
  readOnly?: boolean;
  onClose: () => void;
  onToast?: (msg: string, kind?: 'success' | 'error') => void;
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
  const [penSource, setPenSource] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [textDraft, setTextDraft] = useState<{ nx: number; ny: number; value: string } | null>(null);
  const [showVersions, setShowVersions] = useState(true);

  const stageRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<{ cancel(): void } | null>(null);
  const drawing = useRef<{ pen: PenStroke; pts: PenSample[]; startedAt: number } | null>(null);
  const erased = useRef<Set<string>>(new Set());
  const textRef = useRef<HTMLTextAreaElement>(null);

  const preset = toolById(tool);
  const backendReady = isUploadBackendConfigured();
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
    const task = p.render({ canvasContext: ctx, viewport: p.getViewport({ scale: s * dpr }) });
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
    } else if (s.tool === 'line' || s.tool === 'arrow') {
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(z.x, z.y); ctx.stroke();
      if (s.tool === 'arrow') {
        const ang = Math.atan2(z.y - a.y, z.x - a.x);
        const head = Math.max(base * 3.2, 6), sp = 0.42;
        ctx.beginPath();
        ctx.moveTo(z.x, z.y);
        ctx.lineTo(z.x - head * Math.cos(ang - sp), z.y - head * Math.sin(ang - sp));
        ctx.lineTo(z.x - head * Math.cos(ang + sp), z.y - head * Math.sin(ang + sp));
        ctx.closePath(); ctx.fill();
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

  function eraseAt(nx: number, ny: number) {
    const radius = (preset.width / REF) * 1.4;
    let hit = false;
    for (const s of strokes) {
      if (s.page !== page || erased.current.has(s.id)) continue;
      for (let i = 0; i + 1 < s.pts.length; i += 3) {
        if (Math.hypot(s.pts[i] - nx, s.pts[i + 1] - ny) < radius) {
          erased.current.add(s.id); hit = true; break;
        }
      }
    }
    if (hit) setStrokes(prev => prev.filter(s => !erased.current.has(s.id)));
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (readOnly || tool === 'pan') return;
    // A pen touching down should draw even if a palm lands too — ignore any
    // second contact once a pen stroke is running.
    if (drawing.current) return;
    const { nx, ny } = norm(e);

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
  }

  function commitText() {
    if (!textDraft) return;
    const v = textDraft.value.trim();
    setTextDraft(null);
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
      if (e.key === 'Escape') { if (textDraft) setTextDraft(null); else onClose(); }
      if (!readOnly && !e.ctrlKey && !e.metaKey) {
        const map: Record<string, string> = {
          p: 'pen', n: 'pencil', m: 'marker', h: 'highlighter', e: 'eraser',
          l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', t: 'text', v: 'pan',
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
        parentFolderId,
        strokes: strokes.map(({ id: _id, ...rest }) => rest), // ids are ours, not the PDF's
        version: nextVersion,
        jobName: apartmentLabel,
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
      createdBy: authorName,
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

  // ---- UI ----------------------------------------------------------------

  const palette = tool === 'highlighter' ? HIGHLIGHT_COLORS : INK_COLORS;
  const recents = recentColors();
  const marksOnPage = strokes.filter(s => s.page === page).length;

  return (
    <div className="fixed inset-0 z-[150] flex flex-col" style={{ backgroundColor: '#111827' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0" style={{ backgroundColor: '#0b1220' }}>
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

        <button onClick={print} title="Print this plan with the markup on it"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-white/90 hover:bg-white/10">
          <Printer size={14} /> Print
        </button>

        {!readOnly && (
          <button onClick={save} disabled={saving || !strokes.length}
            title="Save this markup as a new version and file a PDF in Drive"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: '#4aa8d8' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Filing…' : `Save v${nextVersion}`}
          </button>
        )}

        <button onClick={() => setShowVersions(v => !v)} title="Saved versions"
          className={`p-1.5 rounded-lg ${showVersions ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10'}`}>
          <FileDown size={15} />
        </button>
        <button onClick={onClose} title="Close" className="p-1.5 rounded-lg text-white/70 hover:bg-white/10">
          <X size={17} />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Tool rail */}
        {!readOnly && (
          <div className="w-[62px] flex-shrink-0 flex flex-col items-center gap-1 py-2 overflow-y-auto board-rail"
            style={{ backgroundColor: '#0b1220' }}>
            {TOOLS.map(t => {
              const Icon = ICONS[t.id] ?? Pen;
              const on = tool === t.id;
              return (
                <button key={t.id} onClick={() => pick(t.id)} title={`${t.label} — ${t.hint}`}
                  className="w-[50px] py-1.5 rounded-xl flex flex-col items-center gap-0.5 transition-colors"
                  style={{
                    backgroundColor: on ? '#4aa8d8' : 'transparent',
                    color: on ? '#fff' : 'rgba(255,255,255,.62)',
                  }}>
                  <Icon size={16} />
                  <span className="text-[8.5px] font-semibold leading-none">{t.label}</span>
                </button>
              );
            })}
            <div className="h-px w-8 my-1" style={{ backgroundColor: 'rgba(255,255,255,.12)' }} />
            <button onClick={() => pick('pan')} title="Move around the plan without drawing"
              className="w-[50px] py-1.5 rounded-xl flex flex-col items-center gap-0.5"
              style={{ backgroundColor: tool === 'pan' ? '#4aa8d8' : 'transparent', color: tool === 'pan' ? '#fff' : 'rgba(255,255,255,.62)' }}>
              <Hand size={16} /><span className="text-[8.5px] font-semibold leading-none">Move</span>
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
          {!readOnly && (
            <div className="flex items-center gap-2 px-3 py-1.5 flex-wrap flex-shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,.04)' }}>
              {/* Colour */}
              <div className="flex items-center gap-1">
                {palette.map(c => (
                  <button key={c} onClick={() => setColor(c)} title={c}
                    className="w-[18px] h-[18px] rounded-full border-2 transition-transform"
                    style={{
                      backgroundColor: c,
                      borderColor: color === c ? '#fff' : 'rgba(255,255,255,.22)',
                      transform: color === c ? 'scale(1.22)' : undefined,
                    }} />
                ))}
                <button onClick={() => setShowPalette(v => !v)} title="Any colour you like"
                  className="w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-white/25 text-white/70"
                  style={{ background: 'conic-gradient(#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7,#ef4444)' }}>
                  <Palette size={9} />
                </button>
              </div>

              {showPalette && (
                <div className="flex items-center gap-1.5">
                  <input type="color" value={color}
                    onChange={e => setColor(e.target.value)}
                    onBlur={() => rememberColor(color)}
                    className="w-7 h-7 rounded cursor-pointer bg-transparent border border-white/20" />
                  <input value={color} onChange={e => setColor(e.target.value)}
                    className="w-[76px] px-1.5 py-1 rounded-md text-[11px] bg-white/10 text-white border border-white/15 outline-none" />
                  {recents.map(c => (
                    <button key={c} onClick={() => setColor(c)} title={`Used before — ${c}`}
                      className="w-[15px] h-[15px] rounded border border-white/25" style={{ backgroundColor: c }} />
                  ))}
                </div>
              )}

              <span className="w-px h-5 bg-white/10" />

              <label className="flex items-center gap-1.5 text-[10.5px] text-white/70">
                Width
                <input type="range" min={0.5} max={60} step={0.5} value={width}
                  onChange={e => setWidth(Number(e.target.value))} className="w-[86px] accent-[#4aa8d8]" />
                <span className="tabular-nums w-6">{width}</span>
              </label>

              <label className="flex items-center gap-1.5 text-[10.5px] text-white/70">
                See-through
                <input type="range" min={0.05} max={1} step={0.05} value={opacity}
                  onChange={e => setOpacity(Number(e.target.value))} className="w-[76px] accent-[#4aa8d8]" />
                <span className="tabular-nums w-7">{Math.round(opacity * 100)}%</span>
              </label>

              {preset.freehand && preset.sensitivity > 0 && (
                <label className="flex items-center gap-1.5 text-[10.5px] text-white/70"
                  title="How much pen pressure — or nib size on the Samsung screen — changes the thickness">
                  Pressure
                  <input type="range" min={0} max={2} step={0.1} value={sens}
                    onChange={e => setSens(Number(e.target.value))} className="w-[70px] accent-[#4aa8d8]" />
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
                  style={{
                    // The pen must not scroll the page while it draws, and the
                    // palm must not either — without this the Samsung screen
                    // pans instead of drawing.
                    touchAction: readOnly || tool === 'pan' ? 'auto' : 'none',
                    cursor: readOnly || tool === 'pan' ? 'grab' : tool === 'text' ? 'text' : 'crosshair',
                    pointerEvents: readOnly || tool === 'pan' ? 'none' : 'auto',
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
          <div className="w-[248px] flex-shrink-0 flex flex-col overflow-hidden" style={{ backgroundColor: '#0b1220' }}>
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
    </div>
  );
}
