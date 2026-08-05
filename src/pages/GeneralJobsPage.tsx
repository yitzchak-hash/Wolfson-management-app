import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Briefcase, MapPin, ExternalLink, Trash2, ClipboardList, FolderOpen,
  Copy, StickyNote, Square, Palette, Pencil, X, AlertTriangle,
  Ghost, ThumbsUp, ClipboardPaste, LayoutGrid, Columns3, Archive, CheckCircle2, PlayCircle,
  Image as ImageIcon, ImageOff, History,
} from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { Apartment, CanvasElement, BinKind, BIN_KINDS, BIN_META } from '../types';
import { ApartmentDetailDrawer } from '../components/apartment/ApartmentDetailDrawer';
import { QuickAddTaskPanel } from '../components/apartment/QuickAddTaskPanel';
import { Toast } from '../components/ui/Toast';
import { DriveIcon, ZohoIcon, PlanIcon, TvIcon } from '../components/ui/BrandIcons';
import { BoardToolbar, BoardControlsPanel, BoardTool } from '../components/board/BoardToolbar';
import { BOARD_THEMES, getBoardTheme } from '../data/boardThemes';
import { MiniMap } from '../components/board/MiniMap';
import { BinWindow } from '../components/board/BinWindow';
import { StageBoard } from '../components/board/StageBoard';
import { WidgetStore } from '../components/board/WidgetStore';
import { renderWidget, WidgetDef, WidgetCtx } from '../data/widgets';
import { JobTile, GhostTile, BoardNode, BoardHandlers } from '../components/board/BoardItems';
import { useTouchGestures } from '../hooks/useTouchGestures';
import { detectPasteIntent, fieldForIntent, canCreateFromIntent, PasteIntent } from '../data/pasteIntent';
import { exportBoardPng, exportBoardPdf } from '../data/boardExport';
import {
  getFolderNameViaBackend, familyNameFromFolderName, extractFolderId,
  isUploadBackendConfigured, findOrCreateFolderViaBackend, uploadFileViaBackend,
} from '../data/driveApi';
import {
  PinnedTitleLayer, StrokeLayer, CountdownNode, StopwatchNode, ClipArtNode, NODE_DEFAULT_SIZE,
  VoiceMemoNode, ART_KINDS,
} from '../components/board/BoardNodes';

// ─── Layout constants ─────────────────────────────────────────────────────────
/** "3h ago" / "yesterday" / "6 Aug" — short, because tile space is scarce. */
function relativeTime(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const TILE_W = 215;
const TILE_H = 132;
const GAP = 22;
const PER_ROW = 4;

// ─── Color palettes ───────────────────────────────────────────────────────────
const TILE_PALETTE = [
  { label: 'White', bg: '#ffffff', border: '#e5e7eb' },
  { label: 'Sky', bg: '#e0f2fe', border: '#7dd3fc' },
  { label: 'Green', bg: '#dcfce7', border: '#86efac' },
  { label: 'Yellow', bg: '#fef9c3', border: '#fde047' },
  { label: 'Orange', bg: '#ffedd5', border: '#fdba74' },
  { label: 'Rose', bg: '#ffe4e6', border: '#fda4af' },
  { label: 'Purple', bg: '#f3e8ff', border: '#d8b4fe' },
  { label: 'Teal', bg: '#ccfbf1', border: '#5eead4' },
  { label: 'Navy', bg: '#dbeafe', border: '#93c5fd' },
];

const NOTE_PALETTE = ['#fef9c3', '#dcfce7', '#fce7f3', '#dbeafe', '#f3e8ff', '#ffedd5', '#ccfbf1', '#ffe4e6'];

const BOX_PALETTE = [
  'rgba(219,234,254,0.45)',
  'rgba(220,252,231,0.45)',
  'rgba(252,231,243,0.45)',
  'rgba(243,232,255,0.45)',
  'rgba(255,237,213,0.45)',
  'rgba(204,251,241,0.45)',
  'rgba(255,228,230,0.45)',
  'rgba(254,249,195,0.45)',
];

function defaultPos(i: number) {
  const col = i % PER_ROW;
  const row = Math.floor(i / PER_ROW);
  return { x: GAP + col * (TILE_W + GAP), y: GAP + row * (TILE_H + GAP) };
}

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface DragState {
  kind: 'job' | 'element';
  ids: string[];
  starts: Map<string, { x: number; y: number }>;
  grabX: number;
  grabY: number;
  dx: number;
  dy: number;
  moved: boolean;
}

interface ResizeState {
  id: string;
  startW: number;
  startH: number;
  startPX: number;
  startPY: number;
  /** Live delta held locally; committed to the store once on pointerup. */
  dw: number;
  dh: number;
}

interface LassoState { sx: number; sy: number; ex: number; ey: number }

interface CtxMenu {
  x: number;
  y: number;
  kind: 'job' | 'element' | 'ghost' | 'canvas';
  ids: string[];
  /** ghost only: which appearance of the job was clicked */
  ghostIndex?: number;
  /** canvas only: where on the board the click landed, for "create job here" */
  worldX?: number;
  worldY?: number;
}

/** A ghost being dragged: the job it belongs to plus which appearance it is. */
interface GhostDrag {
  jobId: string;
  index: number;
  startX: number;
  startY: number;
  grabX: number;
  grabY: number;
  dx: number;
  dy: number;
  moved: boolean;
}

interface ColorPickerState {
  x: number;
  y: number;
  kind: 'job' | 'element';
  ids: string[];
}

// ─── Component ────────────────────────────────────────────────────────────────
export function GeneralJobsPage() {
  const {
    apartments,
    addApartment,
    deleteApartment,
    updateApartment,
    canvasElements,
    addCanvasElement,
    updateCanvasElement,
    deleteCanvasElement,
    stages: allStages,
    contractorAssignments,
    currentUser,
    mainUiStrings: s,
    currentProjectId,
    addGhost,
    moveGhost,
    removeGhost,
    moveToBin,
    backupDriveFolderLink,
    contractorPhotos,
    contractors,
    activityLogs,
    boardLayouts,
    saveBoardLayout,
    restoreBoardLayout,
    deleteBoardLayout,
  } = useStore();

  // ── All hooks must come before any early return ──────────────────
  const [selectedJob, setSelectedJob] = useState<Apartment | null>(null);
  const [addTaskJob, setAddTaskJob] = useState<Apartment | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [jobName, setJobName] = useState('');
  const [jobAddress, setJobAddress] = useState('');
  const [jobZoho, setJobZoho] = useState('');
  const [jobDrive, setJobDrive] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[]; taskCount: number } | null>(null);

  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [selectedElIds, setSelectedElIds] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [lasso, setLasso] = useState<LassoState | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [colorPicker, setColorPicker] = useState<ColorPickerState | null>(null);
  const [editingEl, setEditingEl] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const [ghostDrag, setGhostDrag] = useState<GhostDrag | null>(null);
  const [openBin, setOpenBin] = useState<BinKind | null>(null);
  /** Which bin the pointer is currently over mid-drag, so it can light up. */
  const [hoverBin, setHoverBin] = useState<string | null>(null);
  /** Clipboard contents, read when the context menu opens. */
  const [clip, setClip] = useState<PasteIntent>({ kind: 'none', value: '', label: 'Paste' });
  const [pasteConfirm, setPasteConfirm] = useState<
    { jobId: string; intent: PasteIntent; existing: string } | null>(null);
  const [createFromLink, setCreateFromLink] = useState<
    { intent: PasteIntent; x: number; y: number } | null>(null);
  const [artPicker, setArtPicker] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [layoutPanel, setLayoutPanel] = useState(false);
  /** A finished job briefly celebrates, at the point on the board it landed. */
  const [celebrate, setCelebrate] = useState<{ x: number; y: number; key: number } | null>(null);
  /**
   * Drives the live-change pulse. A tile whose content changed in the last few
   * seconds glows, so an edit arriving from someone else's machine is visible
   * rather than silently appearing. Ticks every 5s, which is cheap and enough.
   */
  const [pulseNow, setPulseNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setPulseNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  /** Live freehand stroke, world coordinates, committed once on pointerup. */
  const [drawing, setDrawing] = useState<{ pts: { x: number; y: number }[]; marker: boolean } | null>(null);
  const [recordingEl, setRecordingEl] = useState<string | null>(null);
  const [savingAudio, setSavingAudio] = useState(false);
  const recorderRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; started: number } | null>(null);

  const boardSettings = useStore(st => st.boardSettings);
  const setBoardSetting = useStore(st => st.setBoardSetting);
  const projectBoard = boardSettings[currentProjectId] ?? {};
  const theme = getBoardTheme(projectBoard.themeId);
  const showControls = projectBoard.showControls ?? false;
  const viewMode = projectBoard.viewMode ?? 'canvas';

  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  /**
   * Board view transform.
   *
   * The world div is scaled and translated; the viewport is a fixed frame with
   * native scrolling disabled. Mixing native scroll with transform pan is the
   * classic source of jitter and misplaced clicks, so there is exactly one
   * system here.
   */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  /** Live viewport size — the board surface is sized against it. */
  const [vp, setVp] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setVp(prev => (Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1
        ? prev : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [tool, setTool] = useState<BoardTool>('select');
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);

  /**
   * Set below the redirect guard, where `freeSpot` can see the jobs and
   * elements. A ref rather than a dependency so `dropNode` stays stable.
   */
  const freeSpotRef = useRef<(w: number, h: number) => { x: number; y: number }>(() => ({ x: 40, y: 40 }));

  /** Centre of the current view, in world coordinates — where new nodes land. */
  const viewCentre = useCallback(() => {
    const vp = viewportRef.current;
    return {
      x: vp ? (vp.clientWidth / 2 - pan.x) / zoom : 200,
      y: vp ? (vp.clientHeight / 2 - pan.y) / zoom : 200,
    };
  }, [pan.x, pan.y, zoom]);

  /** Drops a node of the given type, centred either on the view or a point. */
  const dropNode = useCallback((
    kind: CanvasElement['type'],
    at?: { x: number; y: number },
    extra?: Partial<CanvasElement>,
  ) => {
    const size = NODE_DEFAULT_SIZE[kind] ?? { w: 180, h: 120 };
    // An explicit point (right-click "add here") is honoured as the centre;
    // otherwise find somewhere free rather than stacking on the last one.
    const c = at
      ? { x: at.x - size.w / 2, y: at.y - size.h / 2 }
      : freeSpotRef.current(size.w, size.h);
    addCanvasElement({
      id: 'CE-' + Math.random().toString(36).slice(2, 9),
      type: kind,
      x: Math.round(c.x),
      y: Math.round(c.y),
      w: size.w, h: size.h,
      text: kind === 'title' ? 'Title' : '',
      color: kind === 'clipart' ? '#dc2626' : 'rgba(250, 204, 21, 0.45)',
      ...(kind === 'title' ? { pinned: true, pinTop: 12, fontSize: 22 } : {}),
      ...(kind === 'countdown' ? { targetAt: new Date(Date.now() + 86_400_000).toISOString() } : {}),
      ...(kind === 'stopwatch' ? { elapsedMs: 0 } : {}),
      ...(kind === 'clipart' ? { art: 'pin' as const } : {}),
      ...extra,
    });
  }, [addCanvasElement]);

  /**
   * Toolbar picks split three ways: some create a node immediately, some arm a
   * gesture (pen, highlighter) and stay selected until you switch away, and a
   * couple open a chooser first.
   */
  /**
   * A free spot near the middle of the view.
   *
   * Dropping everything at the exact centre buried each new node under the last
   * one — place four widgets in a row and you have a pile, not a board. This
   * spirals outward from the centre until it finds a gap nothing occupies.
   */
  function freeSpot(w: number, h: number): { x: number; y: number } {
    const vp = viewportRef.current;
    const cx = (vp ? (vp.clientWidth / 2 - pan.x) / zoom : 200) - w / 2;
    const cy = (vp ? (vp.clientHeight / 2 - pan.y) / zoom : 200) - h / 2;
    const taken = [
      ...canvasElements.filter(e => e.type !== 'stroke').map(e => ({ x: e.x, y: e.y, w: e.w, h: e.h })),
      ...jobs.map((j, i) => ({ ...jobPos(j, i), w: TILE_W, h: TILE_H })),
    ];
    const clear = (x: number, y: number) => !taken.some(t =>
      x < t.x + t.w + 8 && x + w + 8 > t.x && y < t.y + t.h + 8 && y + h + 8 > t.y);

    if (clear(cx, cy)) return { x: Math.max(0, cx), y: Math.max(0, cy) };
    const STEP = 28;
    for (let ring = 1; ring <= 30; ring++) {
      for (const [dx, dy] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
        const x = cx + dx * ring * STEP, y = cy + dy * ring * STEP;
        if (x >= 0 && y >= 0 && clear(x, y)) return { x, y };
      }
    }
    // Everything nearby is occupied — cascade rather than land dead centre.
    return { x: Math.max(0, cx + 26), y: Math.max(0, cy + 26) };
  }

  freeSpotRef.current = freeSpot;

  /** Drops a widget from the store, seeded with its own default state. */
  function placeWidget(def: WidgetDef) {
    const at = freeSpot(def.w, def.h);
    addCanvasElement({
      id: 'CE-' + Math.random().toString(36).slice(2, 9),
      type: 'widget',
      widget: def.id,
      x: Math.round(at.x),
      y: Math.round(at.y),
      w: def.w, h: def.h,
      text: '',
      color: '#ffffff',
      data: def.data ? JSON.parse(JSON.stringify(def.data)) : {},
    });
    setStoreOpen(false);
    setToast(`${def.name} added`);
  }

  function handleToolPick(next: BoardTool) {
    if (next === 'clipart') { setArtPicker(true); setTool('select'); return; }
    if (next === 'job') { setShowAddModal(true); setTool('select'); return; }
    if (next === 'export') { exportBoardImage(); setTool('select'); return; }
    // Pen and highlighter are modes, not one-shot actions.
    if (next === 'pen' || next === 'highlighter' || next === 'pan' || next === 'select') { setTool(next); return; }

    const creators: Record<string, CanvasElement['type']> = {
      note: 'note', box: 'box', title: 'title',
      countdown: 'countdown', stopwatch: 'stopwatch', voice: 'voice',
    };
    const kind = creators[next];
    if (!kind) { setTool(next); return; }
    dropNode(kind);
    setTool('select');
  }
  const panRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  /** Discrete steps: text renders far better and "am I at 100%?" is answerable. */
  const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3];

  /**
   * Screen point -> WORLD point. Every pointer handler must go through this:
   * getBoundingClientRect() returns the SCALED rect once zoom is applied, so
   * using raw deltas makes tiles move at the wrong speed at any zoom but 100%.
   */
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const r = viewportRef.current?.getBoundingClientRect();
    if (!r) return { x: clientX, y: clientY };
    return { x: (clientX - r.left - pan.x) / zoom, y: (clientY - r.top - pan.y) / zoom };
  }, [pan.x, pan.y, zoom]);

  /** Zoom anchored at a screen point, so the board grows toward the cursor. */
  const zoomAt = useCallback((clientX: number, clientY: number, dir: 1 | -1) => {
    const r = viewportRef.current?.getBoundingClientRect();
    if (!r) return;
    setZoom(prevZoom => {
      const i = ZOOM_STEPS.findIndex(z => Math.abs(z - prevZoom) < 0.001);
      const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0,
        (i === -1 ? ZOOM_STEPS.indexOf(1) : i) + dir))];
      if (next === prevZoom) return prevZoom;
      const cx = clientX - r.left, cy = clientY - r.top;
      setPan(prevPan => ({
        x: cx - (cx - prevPan.x) * (next / prevZoom),
        y: cy - (cy - prevPan.y) * (next / prevZoom),
      }));
      return next;
    });
  }, []);
  const deleteRef = useRef<() => void>(() => {});
  /**
   * The bridge that makes memoisation actually work.
   *
   * `live` is rewritten on every render with the current closures; `H` is
   * created once and only ever calls through `live`. The memoised tiles and
   * nodes therefore see a prop that never changes, while still invoking the
   * freshest handler.
   */
  const openJobRef = useRef<(id: string) => void>(() => {});
  const live = useRef<Record<string, (...a: any[]) => any>>({});
  const H = useRef<BoardHandlers>({
    jobDown: (e, j, i) => live.current.jobDown(e, j, i),
    jobMove: e => live.current.jobMove(e),
    jobUp: (e, j) => live.current.jobUp(e, j),
    jobMenu: (e, j) => live.current.jobMenu(e, j),
    jobDelete: ids => live.current.jobDelete(ids),
    jobTv: j => live.current.jobTv(j),
    jobThumbs: (id, d) => live.current.jobThumbs(id, d),
    elDown: (e, el) => live.current.elDown(e, el),
    elMove: e => live.current.elMove(e),
    elUp: el => live.current.elUp(el),
    elMenu: (e, el) => live.current.elMenu(e, el),
    elEdit: el => live.current.elEdit(el),
    elDelete: id => live.current.elDelete(id),
    elColor: (e, id) => live.current.elColor(e, id),
    elPatch: (id, p) => live.current.elPatch(id, p),
    elThumbs: (id, d) => live.current.elThumbs(id, d),
    editChange: v => live.current.editChange(v),
    editCommit: () => live.current.editCommit(),
    editCancel: () => live.current.editCancel(),
    resizeDown: (e, el) => live.current.resizeDown(e, el),
    resizeMove: e => live.current.resizeMove(e),
    resizeUp: () => live.current.resizeUp(),
    openBin: k => live.current.openBin(k),
    binCount: k => live.current.binCount(k),
  }).current;
  /**
   * Keeps the board covering the screen.
   *
   * Without it you can drag the surface away and stare at the grey behind it,
   * which looks like the app has broken rather than like the edge of a board.
   * When the board is smaller than the screen it simply pins to the left/top.
   */
  const clampPanRef = useRef<(p: { x: number; y: number }) => { x: number; y: number }>(p => p);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  /**
   * The four bins exist on every board.
   *
   * They are ordinary CanvasElements carrying a `binKind`, so they move, resize
   * and sync like anything else — but they are never created by the user, so any
   * that are missing get seeded once, down the right-hand edge.
   */
  const seededBins = useRef(false);
  useEffect(() => {
    if (currentProjectId !== 'general' || seededBins.current) return;
    const have = new Set(canvasElements.filter(e => e.binKind).map(e => e.binKind));
    if (have.size === BIN_KINDS.length) { seededBins.current = true; return; }
    // Wait for the first load to settle before deciding something is missing.
    const t = setTimeout(() => {
      if (seededBins.current) return;
      seededBins.current = true;
      const size = NODE_DEFAULT_SIZE.bin;
      BIN_KINDS.forEach((kind, i) => {
        if (have.has(kind)) return;
        addCanvasElement({
          id: `CE-bin-${kind}`,
          type: 'bin',
          binKind: kind,
          // Clear of the default job grid, so a first-run board never overlaps.
          x: GAP + PER_ROW * (TILE_W + GAP) + 40,
          y: GAP + i * (size.h + 12),
          w: size.w, h: size.h,
          text: BIN_META[kind].label,
          color: BIN_META[kind].color,
        });
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [canvasElements, currentProjectId, addCanvasElement]);

  const stages = allStages.filter(st => st.projectId === 'general');
  const stageMap = new Map(stages.map(st => [st.id, st]));
  // Jobs in a bin (Done / Ready / Archive / Trash) live in their own window,
  // not on the main board. Nothing is deleted — they are only moved.
  const jobs = apartments.filter(a => !a.isUnnamed && a.buildingId === 'G' && !a.boardBin);

  // ── Position helpers ──────────────────────────────────────────────
  function jobPos(job: Apartment, index: number): { x: number; y: number } {
    if (drag?.kind === 'job' && drag.ids.includes(job.id)) {
      const s = drag.starts.get(job.id)!;
      return { x: s.x + drag.dx, y: s.y + drag.dy };
    }
    if (typeof job.canvasX === 'number' && typeof job.canvasY === 'number') return { x: job.canvasX, y: job.canvasY };
    return defaultPos(index);
  }

  function elPos(el: CanvasElement): { x: number; y: number; w: number; h: number } {
    if (drag?.kind === 'element' && drag.ids.includes(el.id)) {
      const st = drag.starts.get(el.id)!;
      return { x: st.x + drag.dx, y: st.y + drag.dy, w: el.w, h: el.h };
    }
    if (resize?.id === el.id) {
      return {
        x: el.x, y: el.y,
        w: Math.max(120, resize.startW + resize.dw),
        h: Math.max(80, resize.startH + resize.dh),
      };
    }
    return { x: el.x, y: el.y, w: el.w, h: el.h };
  }

  // ── Bins ──────────────────────────────────────────────────────────
  const binNodes = canvasElements.filter(el => el.type === 'bin' && el.binKind);
  const binCount = (kind: BinKind) =>
    apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed && a.boardBin === kind).length;

  /** Which bin, if any, sits under a world point. Used as a drag drop test. */
  function binAt(wx: number, wy: number): CanvasElement | null {
    for (const b of binNodes) {
      const p = elPos(b);
      if (wx >= p.x && wx <= p.x + p.w && wy >= p.y && wy <= p.y + p.h) return b;
    }
    return null;
  }

  // ── Ghosts ────────────────────────────────────────────────────────
  /**
   * A ghost is the SAME job drawn a second time, not a copy. It is placed near
   * the original so it is obvious where it came from; from there it can be
   * dragged anywhere.
   */
  function handleCreateGhost(ids: string[]) {
    ids.forEach(id => {
      const idx = jobs.findIndex(j => j.id === id);
      if (idx === -1) return;
      const p = jobPos(jobs[idx], idx);
      addGhost(id, Math.round(p.x + TILE_W + 20), Math.round(p.y + 20));
    });
    setCtxMenu(null);
  }

  function ghostPos(jobId: string, index: number, g: { x: number; y: number }) {
    if (ghostDrag && ghostDrag.jobId === jobId && ghostDrag.index === index) {
      return { x: ghostDrag.startX + ghostDrag.dx, y: ghostDrag.startY + ghostDrag.dy };
    }
    return g;
  }

  function onGhostPointerDown(e: React.PointerEvent, job: Apartment, index: number, g: { x: number; y: number }) {
    if (e.button !== 0) return;
    e.stopPropagation();
    setCtxMenu(null); setColorPicker(null);
    const w0 = toWorld(e.clientX, e.clientY);
    setGhostDrag({ jobId: job.id, index, startX: g.x, startY: g.y, grabX: w0.x, grabY: w0.y, dx: 0, dy: 0, moved: false });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onGhostPointerMove(e: React.PointerEvent) {
    if (!ghostDrag) return;
    const w0 = toWorld(e.clientX, e.clientY);
    const dx = w0.x - ghostDrag.grabX;
    const dy = w0.y - ghostDrag.grabY;
    setGhostDrag({ ...ghostDrag, dx, dy, moved: ghostDrag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4 });
    setHoverBin(binAt(w0.x, w0.y)?.id ?? null);
  }

  function onGhostPointerUp(e: React.PointerEvent, job: Apartment) {
    if (!ghostDrag) return;
    if (ghostDrag.moved) {
      const w0 = toWorld(e.clientX, e.clientY);
      const bin = binAt(w0.x, w0.y);
      if (bin?.binKind) {
        // Binning a ghost bins the JOB — there is only one record.
        fileInBin([job.id], bin.binKind, bin);
      } else {
        moveGhost(ghostDrag.jobId, ghostDrag.index,
          Math.max(0, Math.round(ghostDrag.startX + ghostDrag.dx)),
          Math.max(0, Math.round(ghostDrag.startY + ghostDrag.dy)));
      }
    } else {
      setSelectedJob(job);
    }
    setGhostDrag(null);
    setHoverBin(null);
  }

  /**
   * A small, short celebration when work is finished.
   *
   * Fires on the Done bin only, and lasts about a second — long enough to feel
   * like something happened, short enough that nobody has to wait for it.
   */
  function celebrateAt(el: CanvasElement) {
    const p = elPos(el);
    setCelebrate({ x: p.x + p.w / 2, y: p.y + p.h / 2, key: Date.now() });
    setTimeout(() => setCelebrate(null), 1100);
  }

  /** Files a job into a bin, with the Done celebration when that is the bin. */
  function fileInBin(ids: string[], kind: BinKind, at?: CanvasElement) {
    ids.forEach(id => moveToBin(id, kind));
    if (kind === 'done' && at) celebrateAt(at);
    setToast(`Moved to ${BIN_META[kind].label}`);
  }

  // ── Tile photo background ─────────────────────────────────────────
  /** The newest photo the contractor uploaded for this job, if there is one. */
  function latestPhotoUrl(jobId: string): string | null {
    const jobAssignments = new Set(contractorAssignments.filter(a => a.apartmentId === jobId).map(a => a.id));
    const p = contractorPhotos
      .filter(x => jobAssignments.has(x.assignmentId) && (x.storageUrl || x.driveUrl))
      .sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''))[0];
    return p ? (p.storageUrl || p.driveUrl || null) : null;
  }

  function setTilePhoto(ids: string[], url: string | undefined) {
    if (!currentUser) return;
    ids.forEach(id => updateApartment(id, { tilePhotoUrl: url }, currentUser));
    setCtxMenu(null);
  }

  // ── Thumbs up ─────────────────────────────────────────────────────
  function bumpThumbs(kind: 'job' | 'element', ids: string[], delta: number) {
    ids.forEach(id => {
      if (kind === 'job') {
        const j = apartments.find(a => a.id === id);
        if (j && currentUser) updateApartment(id, { thumbsUp: Math.max(0, (j.thumbsUp ?? 0) + delta) }, currentUser);
      } else {
        const el = canvasElements.find(e => e.id === id);
        if (el) updateCanvasElement(id, { thumbsUp: Math.max(0, (el.thumbsUp ?? 0) + delta) });
      }
    });
    setCtxMenu(null);
  }

  // ── Right-click paste ─────────────────────────────────────────────
  /**
   * Reads the clipboard when a context menu opens so the menu can offer one
   * specific action ("Paste as Drive link") instead of a generic Paste. A
   * refusal or an empty clipboard simply leaves the entry disabled.
   */
  function refreshClipboard() {
    if (!navigator.clipboard?.readText) { setClip(detectPasteIntent('')); return; }
    navigator.clipboard.readText()
      .then(t => setClip(detectPasteIntent(t)))
      .catch(() => setClip(detectPasteIntent('')));
  }

  function applyPaste(jobId: string, intent: PasteIntent, force = false) {
    const field = fieldForIntent(intent.kind);
    if (!field || !currentUser) return;
    const job = apartments.find(a => a.id === jobId);
    if (!job) return;
    const existing = (job[field] as string | undefined) ?? '';
    if (existing && !force) {
      setPasteConfirm({ jobId, intent, existing });
      setCtxMenu(null);
      return;
    }
    updateApartment(jobId, { [field]: intent.value }, currentUser);
    setToast(`${intent.label.replace('Paste as ', '')} updated`);
    setCtxMenu(null);
    setPasteConfirm(null);
  }

  /** Empty-board paste of a link creates a job, named from the Drive folder. */
  async function createJobFromLink(intent: PasteIntent, wx: number, wy: number) {
    const now = new Date().toISOString();
    const id = genId('G');
    const isDrive = intent.kind === 'drive';
    let name = '';
    if (isDrive) {
      const folderId = extractFolderId(intent.value);
      if (folderId) {
        const folderName = await getFolderNameViaBackend(folderId).catch(() => null);
        if (folderName) name = familyNameFromFolderName(folderName);
      }
    }
    addApartment({
      id, buildingId: 'G', apartmentNumber: '',
      displayName: name, floor: 0, colPosition: 1, colSpan: 1,
      isDuplexApt: false, currentStageId: null, classification: 'standard',
      shinuiDetails: null, generalNotes: '', isUnnamed: false,
      driveLink: isDrive ? intent.value : undefined,
      zohoLink: isDrive ? undefined : intent.value,
      canvasX: Math.max(0, Math.round(wx)), canvasY: Math.max(0, Math.round(wy)),
      createdAt: now, updatedAt: now, contentUpdatedAt: now,
      updatedBy: currentUser?.id ?? '', updatedByName: currentUser?.name ?? '',
    });
    setCreateFromLink(null);
    setToast(name ? `Job "${name}" created` : 'Job created');
  }

  // ── Voice memo ────────────────────────────────────────────────────
  /**
   * Where a recording actually lives.
   *
   * Drive first, so the clip is shared with everyone and nothing large lands in
   * the board record. Without the upload backend it falls back to an inline data
   * URL, which does persist and does sync — but only up to a size that cannot
   * threaten the Firestore document limit. A longer memo without Drive is
   * refused out loud rather than silently truncated.
   */
  async function storeAudio(blob: Blob, secs: number): Promise<string | null> {
    const parent = backupDriveFolderLink ? extractFolderId(backupDriveFolderLink) : null;
    if (isUploadBackendConfigured() && parent) {
      try {
        const folderId = await findOrCreateFolderViaBackend(parent, 'Voice Memos');
        const file = new File([blob], `memo-${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
        const res = await uploadFileViaBackend(folderId, file);
        if (res?.webViewLink) return res.webViewLink;
      } catch {
        // fall through to the local path
      }
    }
    if (blob.size > 700_000) {
      setToast(`Memo too long to store locally (${secs}s) — set up the Drive folder in App settings`);
      return null;
    }
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    }).catch(() => null);
  }

  async function startRecording(elId: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = ev => { if (ev.data.size > 0) chunks.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const started = recorderRef.current?.started ?? Date.now();
        const secs = Math.round((Date.now() - started) / 1000);
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        setRecordingEl(null);
        setSavingAudio(true);
        try {
          const url = await storeAudio(blob, secs);
          if (url) {
            updateCanvasElement(elId, { audioUrl: url, audioSeconds: secs });
            setToast(`Recorded ${secs}s`);
          }
        } finally {
          setSavingAudio(false);
        }
      };
      recorderRef.current = { rec, chunks, started: Date.now() };
      rec.start();
      setRecordingEl(elId);
    } catch {
      setToast('Microphone not available');
    }
  }

  function stopRecording() {
    recorderRef.current?.rec.stop();
  }

  // ── Export board ──────────────────────────────────────────────────
  function exportInput() {
    return { jobs, elements: canvasElements, stages, title: s.generalJobsTitle, tileW: TILE_W, tileH: TILE_H, defaultPos };
  }

  function exportBoardImage() { setExportMenu(true); }

  // ── Delete / duplicate ────────────────────────────────────────────
  function handleDeleteJobs(ids: string[]) {
    const taskCount = contractorAssignments.filter(a => ids.includes(a.apartmentId)).length;
    setDeleteConfirm({ ids, taskCount });
    setCtxMenu(null);
  }

  function confirmDeleteJobs() {
    if (!deleteConfirm) return;
    deleteConfirm.ids.forEach(id => {
      if (selectedJob?.id === id) setSelectedJob(null);
      deleteApartment(id);
    });
    setSelectedJobIds(new Set());
    setDeleteConfirm(null);
  }

  function handleDeleteEls(ids: string[]) {
    // Bins are fixtures of every board, so they are filtered out here as well as
    // hidden from the menu — otherwise the Delete key could still remove one.
    const removable = ids.filter(id => canvasElements.find(e => e.id === id)?.type !== 'bin');
    if (removable.length === 0) return;
    if (!window.confirm('Delete selected items?')) return;
    removable.forEach(id => deleteCanvasElement(id));
    setSelectedElIds(new Set());
    setCtxMenu(null);
  }

  function handleDuplicateJobs(ids: string[]) {
    const now = new Date().toISOString();
    ids.forEach((id, idx) => {
      const orig = jobs.find(j => j.id === id);
      if (!orig) return;
      const origIdx = jobs.findIndex(j => j.id === id);
      const base = jobPos(orig, origIdx);
      addApartment({
        ...orig,
        id: genId('G'),
        displayName: orig.displayName ? `${orig.displayName} (copy)` : '',
        canvasX: base.x + 25,
        canvasY: base.y + 25,
        createdAt: now,
        updatedAt: now,
        updatedBy: currentUser?.id ?? '',
        updatedByName: currentUser?.name ?? '',
      });
    });
    setSelectedJobIds(new Set());
    setCtxMenu(null);
  }

  function handleDuplicateEls(ids: string[]) {
    ids.forEach(id => {
      const orig = canvasElements.find(e => e.id === id);
      if (!orig) return;
      addCanvasElement({ ...orig, id: genId('CE'), x: orig.x + 25, y: orig.y + 25 });
    });
    setSelectedElIds(new Set());
    setCtxMenu(null);
  }

  // ── Color change ──────────────────────────────────────────────────
  function applyTileColor(ids: string[], color: string | undefined) {
    if (currentUser) ids.forEach(id => updateApartment(id, { tileColor: color }, currentUser));
    setColorPicker(null);
    setCtxMenu(null);
  }

  function applyElColor(ids: string[], color: string) {
    ids.forEach(id => updateCanvasElement(id, { color }));
    setColorPicker(null);
    setCtxMenu(null);
  }

  // ── Delete key ────────────────────────────────────────────────────
  deleteRef.current = () => {
    if (selectedJobIds.size > 0) handleDeleteJobs([...selectedJobIds]);
    else if (selectedElIds.size > 0) handleDeleteEls([...selectedElIds]);
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') deleteRef.current();
      if (e.key === 'Escape') { setSelectedJobIds(new Set()); setSelectedElIds(new Set()); setCtxMenu(null); setColorPicker(null); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── Canvas element creation ───────────────────────────────────────
  function addNote() {
    const el: CanvasElement = {
      id: genId('CE'),
      type: 'note',
      x: GAP + Math.random() * 200,
      y: GAP + Math.random() * 150,
      w: 165,
      h: 150,
      text: 'Note',
      color: NOTE_PALETTE[0],
    };
    addCanvasElement(el);
  }

  function addBox() {
    const el: CanvasElement = {
      id: genId('CE'),
      type: 'box',
      x: GAP + Math.random() * 100,
      y: GAP + Math.random() * 100,
      w: 320,
      h: 220,
      text: 'Section',
      color: BOX_PALETTE[0],
    };
    addCanvasElement(el);
  }

  // ── Job drag ──────────────────────────────────────────────────────
  function onJobPointerDown(e: React.PointerEvent, job: Apartment, index: number) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    // With the pen or highlighter armed, a press starts a stroke wherever it
    // lands — including on top of a tile. Otherwise you could not draw across
    // the board, only in the gaps between jobs.
    if (drawMode) { startStrokeAt(e); return; }
    e.stopPropagation();
    setCtxMenu(null); setColorPicker(null);

    const w0 = toWorld(e.clientX, e.clientY);
    const grabX = w0.x;
    const grabY = w0.y;

    if (e.ctrlKey || e.metaKey) {
      setSelectedJobIds(prev => { const n = new Set(prev); n.has(job.id) ? n.delete(job.id) : n.add(job.id); return n; });
      return;
    }

    const idsToMove = selectedJobIds.has(job.id) && selectedJobIds.size > 1
      ? [...selectedJobIds]
      : [job.id];
    if (!selectedJobIds.has(job.id)) { setSelectedJobIds(new Set([job.id])); setSelectedElIds(new Set()); }

    const starts = new Map<string, { x: number; y: number }>();
    jobs.forEach((j, i) => {
      if (idsToMove.includes(j.id)) {
        starts.set(j.id, typeof j.canvasX === 'number' && typeof j.canvasY === 'number'
          ? { x: j.canvasX, y: j.canvasY }
          : defaultPos(i));
      }
    });

    setDrag({ kind: 'job', ids: idsToMove, starts, grabX, grabY, dx: 0, dy: 0, moved: false });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onJobPointerMove(e: React.PointerEvent) {
    if (!drag || drag.kind !== 'job') return;
    const w0 = toWorld(e.clientX, e.clientY);
    const dx = w0.x - drag.grabX;
    const dy = w0.y - drag.grabY;
    setDrag({ ...drag, dx, dy, moved: drag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4 });
    setHoverBin(binAt(w0.x, w0.y)?.id ?? null);
  }

  function onJobPointerUp(e: React.PointerEvent, job: Apartment) {
    if (!drag || drag.kind !== 'job') return;
    if (drag.moved) {
      // Dropping onto a bin FILES the job rather than positioning it. Nothing is
      // deleted; the job simply moves off the board into that collection.
      const w0 = toWorld(e.clientX, e.clientY);
      const bin = binAt(w0.x, w0.y);
      if (bin?.binKind) {
        fileInBin(drag.ids, bin.binKind, bin);
        setSelectedJobIds(new Set());
      } else if (currentUser) {
        drag.ids.forEach(id => {
          const st = drag.starts.get(id)!;
          updateApartment(id, { canvasX: Math.max(0, Math.round(st.x + drag.dx)), canvasY: Math.max(0, Math.round(st.y + drag.dy)) }, currentUser);
        });
      }
    } else if (drag.ids.length === 1 && drag.ids[0] === job.id) {
      setSelectedJobIds(new Set()); setSelectedJob(job);
    }
    setDrag(null);
    setHoverBin(null);
  }

  function onJobContextMenu(e: React.MouseEvent, job: Apartment) {
    e.preventDefault(); e.stopPropagation();
    const ids = selectedJobIds.has(job.id) && selectedJobIds.size > 1 ? [...selectedJobIds] : [job.id];
    if (!selectedJobIds.has(job.id)) setSelectedJobIds(new Set([job.id]));
    refreshClipboard();
    setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'job', ids });
  }

  // ── Element drag ──────────────────────────────────────────────────
  function onElPointerDown(e: React.PointerEvent, el: CanvasElement) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-el-action]')) return;
    if (drawMode) { startStrokeAt(e); return; }
    e.stopPropagation();
    setCtxMenu(null); setColorPicker(null);

    const w0 = toWorld(e.clientX, e.clientY);
    const grabX = w0.x;
    const grabY = w0.y;

    if (e.ctrlKey || e.metaKey) {
      setSelectedElIds(prev => { const n = new Set(prev); n.has(el.id) ? n.delete(el.id) : n.add(el.id); return n; });
      return;
    }

    const idsToMove = selectedElIds.has(el.id) && selectedElIds.size > 1 ? [...selectedElIds] : [el.id];
    if (!selectedElIds.has(el.id)) { setSelectedElIds(new Set([el.id])); setSelectedJobIds(new Set()); }

    const starts = new Map<string, { x: number; y: number }>();
    canvasElements.forEach(elem => {
      if (idsToMove.includes(elem.id)) starts.set(elem.id, { x: elem.x, y: elem.y });
    });

    setDrag({ kind: 'element', ids: idsToMove, starts, grabX, grabY, dx: 0, dy: 0, moved: false });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onElPointerMove(e: React.PointerEvent) {
    if (!drag || drag.kind !== 'element') return;
    const w0 = toWorld(e.clientX, e.clientY);
    const dx = w0.x - drag.grabX;
    const dy = w0.y - drag.grabY;
    setDrag({ ...drag, dx, dy, moved: drag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4 });
  }

  function onElPointerUp(el: CanvasElement) {
    if (!drag || drag.kind !== 'element') return;
    if (drag.moved) {
      drag.ids.forEach(id => {
        const st = drag.starts.get(id)!;
        updateCanvasElement(id, { x: Math.max(0, Math.round(st.x + drag.dx)), y: Math.max(0, Math.round(st.y + drag.dy)) });
      });
    }
    setDrag(null);
  }

  function onElContextMenu(e: React.MouseEvent, el: CanvasElement) {
    e.preventDefault(); e.stopPropagation();
    const ids = selectedElIds.has(el.id) && selectedElIds.size > 1 ? [...selectedElIds] : [el.id];
    if (!selectedElIds.has(el.id)) setSelectedElIds(new Set([el.id]));
    setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'element', ids });
  }

  // ── Box resize ────────────────────────────────────────────────────
  function onResizePointerDown(e: React.PointerEvent, el: CanvasElement) {
    e.stopPropagation(); e.preventDefault();
    setResize({ id: el.id, startW: el.w, startH: el.h, startPX: e.clientX, startPY: e.clientY, dw: 0, dh: 0 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onResizePointerMove(e: React.PointerEvent) {
    if (!resize) return;
    // Local only. Writing to the store here serialised the entire project to
    // localStorage on every pointer frame; the commit happens on pointerup.
    setResize({ ...resize, dw: e.clientX - resize.startPX, dh: e.clientY - resize.startPY });
  }

  function onResizePointerUp() {
    if (resize && (resize.dw !== 0 || resize.dh !== 0)) {
      updateCanvasElement(resize.id, {
        w: Math.max(120, resize.startW + resize.dw),
        h: Math.max(80, resize.startH + resize.dh),
      });
    }
    setResize(null);
  }

  // ── Lasso + freehand drawing ──────────────────────────────────────
  const drawMode = tool === 'pen' || tool === 'highlighter';

  /** Begins a freehand stroke at a pointer position, whatever it landed on. */
  function startStrokeAt(e: React.PointerEvent) {
    const { x, y } = toWorld(e.clientX, e.clientY);
    setCtxMenu(null); setColorPicker(null);
    setDrawing({ pts: [{ x, y }], marker: tool === 'highlighter' });
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function onCanvasPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as Element) !== canvasRef.current) return;
    setCtxMenu(null); setColorPicker(null);
    const { x, y } = toWorld(e.clientX, e.clientY);

    // Pen and highlighter take over the same gesture the lasso normally uses.
    if (drawMode) { startStrokeAt(e); return; }

    setSelectedJobIds(new Set()); setSelectedElIds(new Set());
    setLasso({ sx: x, sy: y, ex: x, ey: y });
    canvasRef.current!.setPointerCapture(e.pointerId);
  }

  function onCanvasPointerMove(e: React.PointerEvent) {
    if (drawing) {
      const w = toWorld(e.clientX, e.clientY);
      setDrawing(d => {
        if (!d) return d;
        const last = d.pts[d.pts.length - 1];
        // Thin the path: sub-pixel samples add nothing but storage.
        if (Math.hypot(w.x - last.x, w.y - last.y) < 2.5 / zoom) return d;
        return { ...d, pts: [...d.pts, w] };
      });
      return;
    }
    if (!lasso) return;
    const w = toWorld(e.clientX, e.clientY);
    setLasso(l => l ? { ...l, ex: w.x, ey: w.y } : null);
  }

  function onCanvasPointerUp() {
    if (drawing) {
      // One record per stroke — never one per point, which would flood the store.
      if (drawing.pts.length > 1) {
        const xs = drawing.pts.map(p => p.x), ys = drawing.pts.map(p => p.y);
        addCanvasElement({
          id: genId('CE'),
          type: 'stroke',
          x: Math.min(...xs), y: Math.min(...ys),
          w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
          text: '',
          color: drawing.marker ? '#facc15' : '#1e3a5f',
          points: drawing.pts.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' '),
          strokeWidth: drawing.marker ? 16 : 3,
          ...(drawing.marker ? { art: 'marker' as const } : {}),
        });
      }
      setDrawing(null);
      return;
    }
    if (!lasso) return;
    const { sx, sy, ex, ey } = lasso;
    if (Math.abs(ex - sx) > 8 || Math.abs(ey - sy) > 8) {
      const minX = Math.min(sx, ex), maxX = Math.max(sx, ex);
      const minY = Math.min(sy, ey), maxY = Math.max(sy, ey);
      const newJobs = new Set<string>();
      const newEls = new Set<string>();
      jobs.forEach((job, i) => {
        const p = jobPos(job, i);
        if (p.x < maxX && p.x + TILE_W > minX && p.y < maxY && p.y + TILE_H > minY) newJobs.add(job.id);
      });
      canvasElements.forEach(el => {
        if (el.x < maxX && el.x + el.w > minX && el.y < maxY && el.y + el.h > minY) newEls.add(el.id);
      });
      setSelectedJobIds(newJobs);
      setSelectedElIds(newEls);
    }
    setLasso(null);
  }

  /**
   * Ctrl/Cmd + wheel zooms the BOARD, not the browser.
   *
   * Registered manually with { passive: false }: React's onWheel prop is passive
   * in several browsers, where preventDefault() silently does nothing and the
   * page zooms anyway. Plain wheel scrolls the board; shift+wheel scrolls
   * sideways — Figma/Miro muscle memory, and it leaves ctrl+click free for the
   * multi-select that already exists.
   */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1 : -1);
      } else {
        e.preventDefault();
        setPan(p => clampPanRef.current(e.shiftKey
          ? { x: p.x - e.deltaY - e.deltaX, y: p.y }
          : { x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  /**
   * Pinch to zoom and two-finger pan, for tablets and the Samsung interactive
   * display. Without this every scroll attempt on a touchscreen drags a tile,
   * because the pointer handlers fire on touch as well as mouse.
   */
  useTouchGestures(viewportRef.current, {
    onPinch: (delta, cx, cy) => {
      const r = viewportRef.current?.getBoundingClientRect();
      if (!r) return;
      setZoom(prev => {
        const next = Math.min(3, Math.max(0.25, prev * delta));
        const px = cx - r.left, py = cy - r.top;
        setPan(pp => ({
          x: px - (px - pp.x) * (next / prev),
          y: py - (py - pp.y) * (next / prev),
        }));
        return next;
      });
    },
    onPan: (dx, dy) => setPan(p => clampPanRef.current({ x: p.x + dx, y: p.y + dy })),
  });

  /**
   * On a phone, open zoomed to fit.
   *
   * At 100% a 390px screen shows a tile and a half, which is not a board — it
   * is a keyhole. Only fires once, and only when the screen is genuinely small,
   * so it never overrides a zoom someone chose on a desktop.
   */
  const didAutoFit = useRef(false);
  useEffect(() => {
    // Polls rather than depending on render state: on the first pass after mount
    // the viewport often still measures 0 wide, and a dependency array that
    // never changes again would mean it simply never happened.
    let tries = 0;
    const t = setInterval(() => {
      if (didAutoFit.current || ++tries > 20) { clearInterval(t); return; }
      const vp = viewportRef.current;
      if (!vp || vp.clientWidth === 0) return;
      clearInterval(t);
      if (vp.clientWidth > 700) return;   // desktop keeps whatever zoom it had
      didAutoFit.current = true;
      fitRef.current();
    }, 150);
    return () => clearInterval(t);
  }, []);
  const fitRef = useRef<() => void>(() => {});

  /** Space-held drag pans, the shortcut every canvas app has. */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest('input,textarea')) {
        e.preventDefault(); setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceHeld(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  function onViewportPointerDown(e: React.PointerEvent) {
    // Middle mouse, or space held — pan. Left-drag keeps its existing meaning.
    if (e.button === 1 || (spaceHeld && e.button === 0)) {
      e.preventDefault();
      panRef.current = { px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  }
  function onViewportPointerMove(e: React.PointerEvent) {
    const st = panRef.current;
    if (!st) return;
    setPan(clampPanRef.current({ x: st.ox + (e.clientX - st.px), y: st.oy + (e.clientY - st.py) }));
  }
  function onViewportPointerUp() { panRef.current = null; }

  /**
   * Fit what is actually on the board.
   *
   * Deliberately measured from the CONTENT bounds, not the canvas size: the
   * canvas carries a 700×500 minimum so an empty board still has a surface, and
   * fitting to that padded everything down to a third of readable size.
   *
   * The floor stops it going smaller than legible. Past that point a phone is
   * better off showing part of the board properly than all of it as confetti.
   */
  function zoomToFit() {
    const vp = viewportRef.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const b = contentBounds();
    if (!b) return;
    const raw = Math.min(r.width / (b.w + 48), r.height / (b.h + 48), 1);
    const MIN = r.width < 700 ? 0.5 : 0.25;
    const s = Math.max(raw, MIN);
    const step = [...ZOOM_STEPS].reverse().find(z => z <= s) ?? ZOOM_STEPS[0];
    setZoom(step);
    setPan({
      x: Math.min(24, (r.width - b.w * step) / 2) - b.x * step,
      y: 16 - b.y * step,
    });
  }

  /** Bounding box of everything on the board, or null when it is empty. */
  function contentBounds(): { x: number; y: number; w: number; h: number } | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    jobs.forEach((j, i) => {
      const p = jobPos(j, i);
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + TILE_W); y1 = Math.max(y1, p.y + TILE_H);
    });
    canvasElements.forEach(el => {
      if (el.type === 'stroke') return;
      x0 = Math.min(x0, el.x); y0 = Math.min(y0, el.y);
      x1 = Math.max(x1, el.x + el.w); y1 = Math.max(y1, el.y + el.h);
    });
    if (!Number.isFinite(x0)) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  fitRef.current = zoomToFit;
  clampPanRef.current = (p) => {
    const w = maxX * zoom, h = maxY * zoom;
    return {
      x: w <= vp.w ? Math.max(0, Math.min(p.x, vp.w - w)) : Math.min(0, Math.max(p.x, vp.w - w)),
      y: h <= vp.h ? Math.max(0, Math.min(p.y, vp.h - h)) : Math.min(0, Math.max(p.y, vp.h - h)),
    };
  };

  // ── Start text edit for element ───────────────────────────────────
  function startEdit(el: CanvasElement) {
    setEditingEl(el.id);
    setEditText(el.text);
    setTimeout(() => editInputRef.current?.focus(), 30);
  }

  function commitEdit() {
    if (editingEl) updateCanvasElement(editingEl, { text: editText });
    setEditingEl(null);
  }

  /** One pass over the tasks instead of one scan per tile. */
  const pendingByJob = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of contractorAssignments) {
      if (a.completedAt) continue;
      m.set(a.apartmentId, (m.get(a.apartmentId) ?? 0) + 1);
    }
    return m;
  }, [contractorAssignments]);

  const tileLabels = useMemo(
    () => ({ job: s.jobLabel, folder: s.openFolderTooltip, plans: s.engineeringPlans }),
    [s.jobLabel, s.openFolderTooltip, s.engineeringPlans],
  );

  /**
   * Stable between renders unless the underlying data really changed — so a
   * drag, which only moves local state, cannot re-render every live widget.
   */
  const widgetCtx: WidgetCtx = useMemo(() => ({
    jobs: apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed),
    stages: allStages.filter(st => st.projectId === 'general'),
    assignments: contractorAssignments,
    contractors,
    photos: contractorPhotos,
    logs: activityLogs,
    update: () => {},
    openJob: (id: string) => openJobRef.current(id),
  }), [apartments, allStages, contractorAssignments, contractors, contractorPhotos, activityLogs]);

  // ── Canvas size ───────────────────────────────────────────────────
  /**
   * The board is bigger than its contents, always.
   *
   * Two rules, and they matter for different reasons:
   *  - **At least the viewport.** Sizing the surface to the content left a grey
   *    void around a small board, which reads as the end of the world rather
   *    than as empty board.
   *  - **A generous margin past the furthest thing.** There is always somewhere
   *    to drag a tile to; the surface grows to meet it instead of stopping.
   *
   * Rounded to a coarse step so panning does not resize the surface every
   * frame — the sizes change in chunks, not continuously.
   */
  const EDGE_PAD = 900;
  let contentX = 0, contentY = 0;
  jobs.forEach((job, i) => { const p = jobPos(job, i); contentX = Math.max(contentX, p.x + TILE_W); contentY = Math.max(contentY, p.y + TILE_H); });
  canvasElements.forEach(el => { contentX = Math.max(contentX, el.x + el.w); contentY = Math.max(contentY, el.y + el.h); });
  const step = (n: number) => Math.ceil(n / 400) * 400;
  const maxX = Math.max(step(contentX + EDGE_PAD), step((vp.w - pan.x) / zoom + 200), 1200);
  const maxY = Math.max(step(contentY + EDGE_PAD), step((vp.h - pan.y) / zoom + 200), 800);

  openJobRef.current = (id: string) => { const j = jobs.find(x => x.id === id); if (j) setSelectedJob(j); };
  live.current = {
    jobDown: onJobPointerDown, jobMove: onJobPointerMove, jobUp: onJobPointerUp,
    jobMenu: onJobContextMenu, jobDelete: handleDeleteJobs,
    jobTv: (j: Apartment) => { if (currentUser) updateApartment(j.id, { showOnTv: j.showOnTv === false }, currentUser); },
    jobThumbs: (id: string, d: number) => bumpThumbs('job', [id], d),
    elDown: onElPointerDown, elMove: onElPointerMove, elUp: onElPointerUp,
    elMenu: onElContextMenu, elEdit: startEdit,
    elDelete: (id: string) => deleteCanvasElement(id),
    elColor: (e: React.MouseEvent, id: string) => setColorPicker({ x: e.clientX, y: e.clientY, kind: 'element', ids: [id] }),
    elPatch: (id: string, patch: Partial<CanvasElement>) => updateCanvasElement(id, patch),
    elThumbs: (id: string, d: number) => bumpThumbs('element', [id], d),
    editChange: setEditText, editCommit: commitEdit, editCancel: () => setEditingEl(null),
    resizeDown: onResizePointerDown, resizeMove: onResizePointerMove, resizeUp: onResizePointerUp,
    openBin: (k: BinKind) => setOpenBin(k),
    binCount,
  };

  const totalSelected = selectedJobIds.size + selectedElIds.size;

  // ── Redirect guard ──
  // Deliberately AFTER every hook, including the ones inside the wheel, keyboard
  // and touch effects below. Returning earlier changed the hook count between
  // renders whenever the workspace switched while this page was mounted.
  if (currentProjectId !== 'general') return <Navigate to="/project" replace />;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-2 md:px-5 py-2 md:py-3 border-b border-gray-200 bg-white flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <Briefcase size={20} className="text-[#1e3a5f] flex-shrink-0" />
          {/* The title is the least informative thing here on a phone — the
              sidebar already says where you are — so it steps aside first. */}
          <h1 className="hidden sm:block text-xl font-bold text-gray-900 truncate">{s.generalJobsTitle}</h1>
          {jobs.length > 0 && (
            <span className="text-xs font-medium bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">{jobs.length}</span>
          )}
          {totalSelected > 0 && (
            <span className="text-xs font-medium bg-[#4aa8d8]/20 text-[#1e3a5f] rounded-full px-2 py-0.5">
              {totalSelected} selected
            </span>
          )}
        </div>

        {/* Tool buttons */}
        <div className="flex items-center gap-2">
          {/* The same jobs, read two ways. Positions are kept either way, so
              switching back to the board restores the arrangement exactly. */}
          <div className="flex items-center rounded-xl border border-gray-200 overflow-hidden">
            {([
              { id: 'canvas', icon: LayoutGrid, label: 'Board' },
              { id: 'stages', icon: Columns3, label: 'Stages' },
            ] as const).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setBoardSetting('viewMode', id)}
                title={id === 'stages' ? 'Group by stage — drag a card to change its stage' : 'Free board'}
                className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 text-sm font-medium transition-colors"
                style={viewMode === id
                  ? { backgroundColor: '#1e3a5f', color: '#fff' }
                  : { color: '#64748b' }}
              >
                <Icon size={15} /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <div className="w-px h-6 bg-gray-200" />
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 shadow-sm flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}
          >
            <Plus size={16} /> <span className="hidden sm:inline">{s.addJobBtn}</span>
          </button>
        </div>
      </div>

      {/* ── Stage columns ──
          The same records, grouped by stage. Dragging a card between columns
          changes the stage; canvas positions are untouched. */}
      {viewMode === 'stages' && <StageBoard onOpenJob={setSelectedJob} />}

      {/* ── Canvas viewport ──
          Fixed frame, native scrolling OFF. The world inside is translated and
          scaled; pan and zoom are the only movement system, which keeps hit
          testing correct at every zoom level. */}
      <div
        hidden={viewMode === 'stages'}
        ref={viewportRef}
        className="flex-1 min-h-0 relative overflow-hidden"
        style={{ cursor: spaceHeld ? 'grab' : drawMode ? 'crosshair' : undefined, touchAction: 'none' }}
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={onViewportPointerUp}
        onPointerCancel={onViewportPointerUp}
      >
        <BoardToolbar
          active={tool}
          onPick={handleToolPick}
          onFit={zoomToFit}
          onOpenStore={() => setStoreOpen(true)}
          onToggleMap={() => setBoardSetting('showMinimap', !(projectBoard.showMinimap ?? false))}
          mapOn={projectBoard.showMinimap ?? false}
          controlsOpen={showControls}
          onToggleControls={() => setBoardSetting('showControls', !showControls)}
          onToggleSettings={() => setBoardSettingsOpen(v => !v)}
        />
        {showControls && <BoardControlsPanel />}

        {boardSettingsOpen && (
          <div className="absolute right-[86px] z-40 w-[236px] bg-white border border-gray-200 rounded-xl shadow-lg p-3"
            style={{ top: showControls ? 236 : 12 }}>
            <div className="text-[10px] font-extrabold text-gray-700 mb-2 tracking-wide">BOARD SETTINGS</div>

            <div className="text-[9.5px] font-bold text-gray-500 mb-1">Theme</div>
            <div className="grid grid-cols-2 gap-1 mb-3 max-h-[200px] overflow-y-auto">
              {BOARD_THEMES.map(th => (
                <button key={th.id}
                  onClick={() => setBoardSetting('themeId', th.id)}
                  className="text-left rounded-lg border p-1.5 transition-all"
                  style={{
                    borderColor: theme.id === th.id ? '#1e3a5f' : '#e2e8f0',
                    boxShadow: theme.id === th.id ? '0 0 0 2px rgba(30,58,95,.18)' : undefined,
                  }}
                >
                  <span className="block h-6 rounded mb-1" style={th.surface} />
                  <span className="text-[8.5px] font-bold text-gray-600 leading-none">{th.name}</span>
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-[10px] text-gray-600 font-semibold mb-2">
              <input type="checkbox" className="rounded"
                checked={projectBoard.snapToGrid ?? false}
                onChange={e => setBoardSetting('snapToGrid', e.target.checked)} />
              Snap to grid
            </label>
            <button
              onClick={() => { setLayoutPanel(true); setBoardSettingsOpen(false); }}
              className="w-full flex items-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold text-gray-600 border border-gray-200 hover:bg-gray-50 justify-center">
              <History size={12} /> Layout history
            </button>
          </div>
        )}

        {/* Board layout history.
            Positions only, and a preview of every snapshot before anything is
            restored — so pressing Restore can never be a surprise, and can
            never bring back or remove a job. */}
        {layoutPanel && (
          <div className="absolute right-[86px] z-40 w-[252px] bg-white border border-gray-200 rounded-xl shadow-lg p-3"
            style={{ top: showControls ? 236 : 12, maxHeight: '70%', overflowY: 'auto' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-extrabold text-gray-700 tracking-wide">LAYOUT HISTORY</span>
              <button onClick={() => setLayoutPanel(false)} className="ml-auto text-gray-300 hover:text-gray-500">
                <X size={13} />
              </button>
            </div>
            <button
              onClick={() => { saveBoardLayout(new Date().toLocaleString()); setToast('Layout saved'); }}
              className="w-full mb-2 py-1.5 rounded-lg text-[11px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}>
              Save this arrangement
            </button>
            <p className="text-[9.5px] text-gray-400 leading-snug mb-2">
              Snapshots record where things sit — never the jobs themselves. Restoring moves things back
              and cannot undo an edit or bring back a deleted job.
            </p>
            {(boardLayouts[currentProjectId] ?? []).length === 0 && (
              <div className="text-[10.5px] text-gray-400 py-3 text-center">Nothing saved yet.</div>
            )}
            {(boardLayouts[currentProjectId] ?? []).map(L => {
              // Snapshot preview: the saved positions, shrunk to fit.
              const W = 218, H = 74;
              const mx = Math.max(1, ...L.jobs.map(j => j.x + TILE_W), ...L.els.map(e => e.x + e.w));
              const my = Math.max(1, ...L.jobs.map(j => j.y + TILE_H), ...L.els.map(e => e.y + e.h));
              const k = Math.min(W / mx, H / my);
              return (
                <div key={L.id} className="mb-2 rounded-lg border border-gray-200 overflow-hidden">
                  <div className="relative bg-gray-50" style={{ width: '100%', height: H }}>
                    {L.els.map(e => (
                      <span key={e.id} className="absolute rounded-[1px]"
                        style={{ left: e.x * k, top: e.y * k, width: Math.max(2, e.w * k), height: Math.max(2, e.h * k), backgroundColor: 'rgba(148,163,184,.35)' }} />
                    ))}
                    {L.jobs.map(j => {
                      const st = apartments.find(a => a.id === j.id)?.currentStageId;
                      return (
                        <span key={j.id} className="absolute rounded-[1px]"
                          style={{
                            left: j.x * k, top: j.y * k,
                            width: Math.max(3, TILE_W * k), height: Math.max(2, TILE_H * k),
                            backgroundColor: stageMap.get(st ?? '')?.color ?? '#cbd5e1',
                          }} />
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <span className="text-[9.5px] text-gray-500 truncate flex-1" title={L.label}>{L.label}</span>
                    <button
                      onClick={() => { restoreBoardLayout(L.id); setToast('Layout restored'); }}
                      className="text-[10px] font-bold text-[#1e3a5f] hover:underline">Restore</button>
                    <button
                      onClick={() => deleteBoardLayout(L.id)}
                      className="text-gray-300 hover:text-red-500" title="Forget this snapshot">
                      <X size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* View-space overlays: pinned titles hold a fixed screen Y, so they must
            live OUTSIDE the transformed world layer or lasso hit-testing (which
            works in world space) would select a title that is visually elsewhere. */}
        <PinnedTitleLayer elements={canvasElements} zoom={zoom} panX={pan.x} onEdit={startEdit} />

        <MiniMap
          force={projectBoard.showMinimap}
          jobs={jobs}
          elements={canvasElements}
          stages={stages}
          worldW={maxX}
          worldH={maxY}
          zoom={zoom}
          pan={pan}
          viewportW={viewportRef.current?.clientWidth ?? 0}
          viewportH={viewportRef.current?.clientHeight ?? 0}
          onJump={(wx, wy) => {
            const vp = viewportRef.current;
            if (!vp) return;
            setPan({
              x: vp.clientWidth / 2 - wx * zoom,
              y: vp.clientHeight / 2 - wy * zoom,
            });
          }}
        />

        {/* Zoom readout + fit, bottom-left so it never covers the toolbar */}
        <div className="absolute bottom-3 left-3 z-30 flex items-center gap-1 bg-white/95 border border-gray-200 rounded-lg shadow-sm px-1.5 py-1">
          <button onClick={() => zoomAt(
              (viewportRef.current?.getBoundingClientRect().left ?? 0) + (viewportRef.current?.clientWidth ?? 0) / 2,
              (viewportRef.current?.getBoundingClientRect().top ?? 0) + (viewportRef.current?.clientHeight ?? 0) / 2, -1)}
            className="w-6 h-6 rounded text-gray-500 hover:bg-gray-100 text-sm font-bold" title="Zoom out">−</button>
          <span className="text-[11px] font-bold text-gray-600 tabular-nums w-11 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => zoomAt(
              (viewportRef.current?.getBoundingClientRect().left ?? 0) + (viewportRef.current?.clientWidth ?? 0) / 2,
              (viewportRef.current?.getBoundingClientRect().top ?? 0) + (viewportRef.current?.clientHeight ?? 0) / 2, 1)}
            className="w-6 h-6 rounded text-gray-500 hover:bg-gray-100 text-sm font-bold" title="Zoom in">+</button>
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          <button onClick={zoomToFit}
            className="px-2 h-6 rounded text-[11px] font-bold text-gray-500 hover:bg-gray-100" title="Zoom to fit">Fit</button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="px-2 h-6 rounded text-[11px] font-bold text-gray-500 hover:bg-gray-100" title="Reset to 100%">100%</button>
        </div>

        <div
          className="absolute top-0 left-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
        {jobs.length === 0 && canvasElements.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 select-none">
            <Briefcase size={56} className="mb-4 opacity-25" />
            <p className="text-sm">{s.noJobsYet}</p>
            <p className="text-xs mt-1 opacity-70">Use Note and Box buttons to organize your canvas</p>
          </div>
        ) : (
          <div
            ref={canvasRef}
            className="relative"
            style={{
              width: maxX, height: maxY,
              ...theme.surface,
                            userSelect: 'none',
            }}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onContextMenu={e => {
              e.preventDefault();
              if ((e.target as Element) !== canvasRef.current) { setCtxMenu(null); return; }
              const w = toWorld(e.clientX, e.clientY);
              refreshClipboard();
              setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'canvas', ids: [], worldX: w.x, worldY: w.y });
            }}
          >
            {/* Completion burst — drawn in world space so it lands on the bin
                the job was dropped into, and gone in about a second. */}
            {celebrate && (
              <div key={celebrate.key} className="absolute pointer-events-none z-40"
                style={{ left: celebrate.x, top: celebrate.y }}>
                <span className="board-celebrate-ring" />
                <span className="board-celebrate-tick">✓</span>
              </div>
            )}

            {/* Lasso box */}
            {lasso && (Math.abs(lasso.ex - lasso.sx) > 4 || Math.abs(lasso.ey - lasso.sy) > 4) && (
              <div
                className="absolute pointer-events-none z-30 rounded"
                style={{
                  left: Math.min(lasso.sx, lasso.ex), top: Math.min(lasso.sy, lasso.ey),
                  width: Math.abs(lasso.ex - lasso.sx), height: Math.abs(lasso.ey - lasso.sy),
                  border: '2px solid #4aa8d8', backgroundColor: 'rgba(74,168,216,0.08)',
                }}
              />
            )}

            {/* ── Canvas nodes ──
                Strokes and pinned titles are drawn by their own layers, so they
                are skipped here; everything else is a positioned node. */}
            <StrokeLayer elements={canvasElements} />
            {drawing && drawing.pts.length > 1 && (
              <svg className="absolute inset-0 pointer-events-none z-30" style={{ overflow: 'visible' }}>
                <polyline
                  points={drawing.pts.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={drawing.marker ? '#facc15' : '#1e3a5f'}
                  strokeWidth={drawing.marker ? 16 : 3}
                  strokeLinecap="round" strokeLinejoin="round"
                  opacity={drawing.marker ? 0.45 : 1}
                />
              </svg>
            )}
            {canvasElements.map(el => {
              if (el.type === 'stroke') return null;
              if (el.type === 'title' && el.pinned) return null;
              const pos = elPos(el);
              return (
                <BoardNode
                  key={el.id}
                  el={el}
                  x={pos.x} y={pos.y} w={pos.w} h={pos.h}
                  isSelected={selectedElIds.has(el.id)}
                  isDragging={drag?.kind === 'element' && drag.ids.includes(el.id) && drag.moved}
                  isEditing={editingEl === el.id}
                  editText={editingEl === el.id ? editText : ''}
                  binHot={hoverBin === el.id}
                  binCount={el.binKind ? binCount(el.binKind) : 0}
                  recording={recordingEl === el.id}
                  savingAudio={savingAudio}
                  ctx={widgetCtx}
                  editRef={editInputRef}
                  H={H}
                  onRecord={startRecording}
                  onStopRecord={stopRecording}
                />
              );
            })}
            {/* ── Ghost appearances ──
                The SAME job drawn a second time. One record, several places, so
                an edit through a ghost is an edit to the job. */}
            {jobs.flatMap(job => (job.ghosts ?? []).map((g, gi) => {
              const p = ghostPos(job.id, gi, g);
              return (
                <GhostTile
                  key={`${job.id}-ghost-${gi}`}
                  job={job} index={gi}
                  x={p.x} y={p.y} w={TILE_W} h={TILE_H}
                  stage={job.currentStageId ? stageMap.get(job.currentStageId) ?? null : null}
                  dragging={!!ghostDrag && ghostDrag.jobId === job.id && ghostDrag.index === gi && ghostDrag.moved}
                  label={s.jobLabel}
                  onDown={onGhostPointerDown}
                  onMove={onGhostPointerMove}
                  onUp={onGhostPointerUp}
                  onMenu={(e, j, i) => {
                    e.preventDefault(); e.stopPropagation();
                    setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'ghost', ids: [j.id], ghostIndex: i });
                  }}
                />
              );
            }))}
            {jobs.map((job, i) => {
              const pos = jobPos(job, i);
              const changedAt = job.contentUpdatedAt ?? job.updatedAt;
              return (
                <JobTile
                  key={job.id}
                  job={job} index={i}
                  x={pos.x} y={pos.y} w={TILE_W} h={TILE_H}
                  stage={job.currentStageId ? stageMap.get(job.currentStageId) ?? null : null}
                  pendingTasks={pendingByJob.get(job.id) ?? 0}
                  isSelected={selectedJobIds.has(job.id)}
                  isDragging={drag?.kind === 'job' && drag.ids.includes(job.id) && drag.moved}
                  justChanged={!!changedAt && pulseNow - new Date(changedAt).getTime() < 25_000}
                  fallbackBorder={(TILE_PALETTE.find(p => p.bg === job.tileColor) ?? TILE_PALETTE[0]).border}
                  lastEdited={relativeTime(changedAt)}
                  labels={tileLabels}
                  H={H}
                />
              );
            })}
          </div>
        )}
        </div>
      </div>

      {/* ── Right-click context menu ──
          The paste entry is driven by what is actually on the clipboard: a plain
          "Paste" is never offered, only the one action that fits. */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
          <div className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[196px]"
            style={{ left: Math.min(ctxMenu.x, window.innerWidth - 220), top: Math.min(ctxMenu.y, window.innerHeight - 300) }}>
            {ctxMenu.kind === 'job' ? (
              <>
                <button onClick={() => handleDuplicateJobs(ctxMenu.ids)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Copy size={14} className="text-gray-400" />
                  {ctxMenu.ids.length > 1 ? `Duplicate (${ctxMenu.ids.length})` : 'Duplicate'}
                </button>
                <button onClick={() => handleCreateGhost(ctxMenu.ids)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                  title="Show this same job in another place">
                  <Ghost size={14} className="text-gray-400" />
                  {ctxMenu.ids.length > 1 ? `Create ghosts (${ctxMenu.ids.length})` : 'Create ghost'}
                </button>
                <button onClick={() => bumpThumbs('job', ctxMenu.ids, 1)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <ThumbsUp size={14} className="text-gray-400" /> Thumbs up
                </button>
                <button onClick={() => { setColorPicker({ x: ctxMenu.x + 170, y: ctxMenu.y, kind: 'job', ids: ctxMenu.ids }); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Palette size={14} className="text-gray-400" /> Change Color
                </button>

                {/* Photo background — the latest site photo, or none. */}
                {ctxMenu.ids.length === 1 && (
                  apartments.find(a => a.id === ctxMenu.ids[0])?.tilePhotoUrl ? (
                    <button onClick={() => setTilePhoto(ctxMenu.ids, undefined)}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                      <ImageOff size={14} className="text-gray-400" /> Remove photo background
                    </button>
                  ) : latestPhotoUrl(ctxMenu.ids[0]) ? (
                    <button onClick={() => setTilePhoto(ctxMenu.ids, latestPhotoUrl(ctxMenu.ids[0])!)}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                      title="Use the newest photo from the site">
                      <ImageIcon size={14} className="text-gray-400" /> Photo background
                    </button>
                  ) : null
                )}

                <div className="h-px bg-gray-100 my-1" />
                <button
                  disabled={clip.kind === 'none' || ctxMenu.ids.length !== 1}
                  onClick={() => applyPaste(ctxMenu.ids[0], clip)}
                  className="w-full px-4 py-2 text-left text-sm flex items-center gap-2.5 disabled:text-gray-300 text-gray-700 hover:bg-gray-50 disabled:hover:bg-transparent"
                  title={clip.kind === 'none' ? 'Nothing pasteable on the clipboard' : clip.value.slice(0, 80)}>
                  <ClipboardPaste size={14} className={clip.kind === 'none' ? 'text-gray-200' : 'text-gray-400'} />
                  {clip.kind === 'none' ? 'Paste' : clip.label}
                </button>

                <div className="h-px bg-gray-100 my-1" />
                <div className="px-4 pt-1 pb-0.5 text-[10px] font-bold text-gray-400 tracking-wide">MOVE TO</div>
                {BIN_KINDS.map(k => (
                  <button key={k}
                    onClick={() => {
                      fileInBin(ctxMenu.ids, k, binNodes.find(b => b.binKind === k));
                      setSelectedJobIds(new Set());
                      setCtxMenu(null);
                    }}
                    className="w-full px-4 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BIN_META[k].color }} />
                    {BIN_META[k].label}
                  </button>
                ))}

                <div className="h-px bg-gray-100 my-1" />
                <button onClick={() => handleDeleteJobs(ctxMenu.ids)}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5">
                  <Trash2 size={14} />
                  {ctxMenu.ids.length > 1 ? `Delete forever (${ctxMenu.ids.length})` : 'Delete forever'}
                </button>
              </>
            ) : ctxMenu.kind === 'ghost' ? (
              <>
                <div className="px-4 py-1.5 text-[10px] font-bold text-gray-400 tracking-wide">
                  GHOST · same job, another place
                </div>
                <button onClick={() => { const j = jobs.find(x => x.id === ctxMenu.ids[0]); if (j) setSelectedJob(j); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Pencil size={14} className="text-gray-400" /> Open the job
                </button>
                <button onClick={() => { removeGhost(ctxMenu.ids[0], ctxMenu.ghostIndex ?? 0); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <X size={14} className="text-gray-400" /> Remove this ghost
                </button>
                <div className="px-4 pb-2 pt-0.5 text-[10px] text-gray-400 leading-snug">
                  Removing a ghost only removes this appearance. The job itself is untouched.
                </div>
              </>
            ) : ctxMenu.kind === 'canvas' ? (
              <>
                <button onClick={() => { dropNode('note', { x: ctxMenu.worldX ?? 0, y: ctxMenu.worldY ?? 0 }, { color: NOTE_PALETTE[0], text: '' }); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <StickyNote size={14} className="text-gray-400" /> Add note here
                </button>
                <button onClick={() => { dropNode('box', { x: ctxMenu.worldX ?? 0, y: ctxMenu.worldY ?? 0 }, { color: BOX_PALETTE[0], text: 'Section' }); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Square size={14} className="text-gray-400" /> Add box here
                </button>
                <div className="h-px bg-gray-100 my-1" />
                <button
                  disabled={!canCreateFromIntent(clip.kind)}
                  onClick={() => setCreateFromLink({ intent: clip, x: (ctxMenu.worldX ?? 0) - TILE_W / 2, y: (ctxMenu.worldY ?? 0) - TILE_H / 2 })}
                  className="w-full px-4 py-2 text-left text-sm flex items-center gap-2.5 disabled:text-gray-300 text-gray-700 hover:bg-gray-50 disabled:hover:bg-transparent"
                  title={canCreateFromIntent(clip.kind) ? clip.value.slice(0, 80) : 'Copy a Drive or Zoho link first'}>
                  <ClipboardPaste size={14} className={canCreateFromIntent(clip.kind) ? 'text-gray-400' : 'text-gray-200'} />
                  {canCreateFromIntent(clip.kind) ? 'Create job from this link' : 'Paste'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { const el = canvasElements.find(e => e.id === ctxMenu.ids[0]); if (el) startEdit(el); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Pencil size={14} className="text-gray-400" /> Edit Text
                </button>
                <button onClick={() => bumpThumbs('element', ctxMenu.ids, 1)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <ThumbsUp size={14} className="text-gray-400" /> Thumbs up
                </button>
                <button onClick={() => { setColorPicker({ x: ctxMenu.x + 170, y: ctxMenu.y, kind: 'element', ids: ctxMenu.ids }); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Palette size={14} className="text-gray-400" /> Change Color
                </button>
                <button onClick={() => handleDuplicateEls(ctxMenu.ids)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Copy size={14} className="text-gray-400" />
                  {ctxMenu.ids.length > 1 ? `Duplicate (${ctxMenu.ids.length})` : 'Duplicate'}
                </button>
                {/* Bins are permanent fixtures of the board, so they are never
                    offered for deletion — only the other node types are. */}
                {!ctxMenu.ids.some(id => canvasElements.find(e => e.id === id)?.type === 'bin') && (
                  <>
                    <div className="h-px bg-gray-100 my-1" />
                    <button onClick={() => handleDeleteEls(ctxMenu.ids)}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5">
                      <Trash2 size={14} />
                      {ctxMenu.ids.length > 1 ? `Delete (${ctxMenu.ids.length})` : 'Delete'}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Clip-art picker ── */}
      {artPicker && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setArtPicker(false)} />
          <div className="fixed z-50 bg-white rounded-2xl shadow-2xl p-4"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(320px, 92vw)' }}>
            <h3 className="text-sm font-bold text-gray-900 mb-3">Clip art</h3>
            <div className="grid grid-cols-4 gap-2">
              {ART_KINDS.map(art => (
                <button
                  key={art}
                  title={art.replace('-', ' ')}
                  onClick={() => { dropNode('clipart', undefined, { art }); setArtPicker(false); }}
                  className="aspect-square rounded-xl border border-gray-200 p-2 hover:border-[#4aa8d8] hover:bg-sky-50 transition-colors"
                >
                  <ClipArtNode el={{
                    id: 'preview', type: 'clipart', art, x: 0, y: 0, w: 40, h: 40, text: '', color: '#dc2626',
                  }} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Paste over an existing value ──
          Only shown when the field already holds something, so a paste can
          never quietly overwrite a link someone typed. */}
      {pasteConfirm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setPasteConfirm(null)} />
          <div className="fixed z-50 bg-white rounded-2xl shadow-2xl p-5"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px, 92vw)' }}>
            <h3 className="text-base font-bold text-gray-900 mb-1">Replace what is there?</h3>
            <p className="text-xs text-gray-500 mb-3">
              This job already has a value for {pasteConfirm.intent.label.replace('Paste as ', '')}.
            </p>
            <div className="text-[11px] bg-gray-50 rounded-lg p-2 mb-1 break-all text-gray-500">
              <span className="font-bold">Now:</span> {pasteConfirm.existing}
            </div>
            <div className="text-[11px] bg-sky-50 rounded-lg p-2 mb-4 break-all text-sky-800">
              <span className="font-bold">New:</span> {pasteConfirm.intent.value}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPasteConfirm(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Keep it</button>
              <button onClick={() => applyPaste(pasteConfirm.jobId, pasteConfirm.intent, true)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}>Replace</button>
            </div>
          </div>
        </>
      )}

      {/* ── Create a job from a pasted link ── */}
      {createFromLink && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setCreateFromLink(null)} />
          <div className="fixed z-50 bg-white rounded-2xl shadow-2xl p-5"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px, 92vw)' }}>
            <h3 className="text-base font-bold text-gray-900 mb-1">Create a new job with this link?</h3>
            <p className="text-xs text-gray-500 mb-3">
              {createFromLink.intent.kind === 'drive'
                ? 'The family name is taken from the Drive folder automatically.'
                : 'The link is saved as the job’s Zoho link.'}
            </p>
            <div className="text-[11px] bg-gray-50 rounded-lg p-2 mb-4 break-all text-gray-500">
              {createFromLink.intent.value}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCreateFromLink(null)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">{s.cancel}</button>
              <button onClick={() => { createJobFromLink(createFromLink.intent, createFromLink.x, createFromLink.y); setCtxMenu(null); }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}>Create job</button>
            </div>
          </div>
        </>
      )}

      {/* ── Export chooser ── */}
      {exportMenu && (
        <>
          <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setExportMenu(false)} />
          <div className="fixed z-50 bg-white rounded-2xl shadow-2xl p-5"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(360px, 92vw)' }}>
            <h3 className="text-base font-bold text-gray-900 mb-1">Export the board</h3>
            <p className="text-xs text-gray-500 mb-4">
              The whole board is exported, not only the part on screen.
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setExportMenu(false);
                  try {
                    await exportBoardPng(exportInput(), `job-board-${new Date().toISOString().slice(0, 10)}.png`);
                    setToast('Board image saved');
                  } catch { setToast('Could not export the board'); }
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}>
                PNG image
              </button>
              <button
                onClick={() => { setExportMenu(false); exportBoardPdf(exportInput()); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Print / PDF
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Widget store ── */}
      {storeOpen && <WidgetStore onPick={placeWidget} onClose={() => setStoreOpen(false)} />}

      {/* ── Bin window ── */}
      {openBin && <BinWindow bin={openBin} onClose={() => setOpenBin(null)} />}

      {/* ── Color picker popup ── */}
      {colorPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setColorPicker(null)} />
          <div className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-3"
            style={{ left: Math.min(colorPicker.x, window.innerWidth - 200), top: colorPicker.y }}>
            <p className="text-[11px] font-medium text-gray-500 mb-2">Choose color</p>
            <div className="flex flex-wrap gap-2" style={{ width: 168 }}>
              {(colorPicker.kind === 'job' ? TILE_PALETTE : (colorPicker.kind === 'element' ?
                (canvasElements.find(e => e.id === colorPicker.ids[0])?.type === 'note' ? NOTE_PALETTE : BOX_PALETTE).map(c => c)
                : NOTE_PALETTE
              )).map((c, i) => {
                const isObj = typeof c === 'object' && c !== null && 'bg' in (c as object);
                const color = isObj ? (c as typeof TILE_PALETTE[0]).bg : c as string;
                const label = isObj ? (c as typeof TILE_PALETTE[0]).label : '';
                return (
                  <button
                    key={i}
                    title={label}
                    onClick={() => colorPicker.kind === 'job'
                      ? applyTileColor(colorPicker.ids, i === 0 ? undefined : color)
                      : applyElColor(colorPicker.ids, color)}
                    className="w-8 h-8 rounded-lg border-2 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color, borderColor: 'rgba(0,0,0,0.15)' }}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Add Job modal ── */}
      {showAddModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowAddModal(false)} />
          <div className="fixed z-50 bg-white rounded-2xl shadow-2xl p-6"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px, 92vw)' }}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{s.addJobBtn}</h2>
            <form onSubmit={e => {
              e.preventDefault();
              const now = new Date().toISOString();
              const id = genId('G');
              const pos = defaultPos(jobs.length);
              addApartment({
                id, buildingId: 'G', apartmentNumber: '',
                displayName: jobName.trim(), floor: 0, colPosition: 1, colSpan: 1,
                isDuplexApt: false, currentStageId: null, classification: 'standard',
                shinuiDetails: null, generalNotes: '', isUnnamed: false,
                address: jobAddress.trim() || undefined,
                zohoLink: jobZoho.trim() || undefined,
                driveLink: jobDrive.trim() || undefined,
                canvasX: pos.x, canvasY: pos.y,
                createdAt: now, updatedAt: now,
                updatedBy: currentUser?.id ?? '', updatedByName: currentUser?.name ?? '',
              });
              setJobName(''); setJobAddress(''); setJobZoho(''); setJobDrive('');
              setShowAddModal(false);
            }} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{s.jobNameLabel}</label>
                <input autoFocus value={jobName} onChange={e => setJobName(e.target.value)}
                  placeholder={s.jobNameLabel}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{s.addressLabel}</label>
                <input value={jobAddress} onChange={e => setJobAddress(e.target.value)}
                  placeholder={s.addressLabel}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{s.zohoLinkLabel}</label>
                <input value={jobZoho} onChange={e => setJobZoho(e.target.value)}
                  placeholder="https://crm.zoho.com/..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{s.driveFolder}</label>
                <input value={jobDrive} onChange={e => setJobDrive(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-all">
                  {s.cancel}
                </button>
                <button type="submit"
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}>
                  {s.addJobBtn}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── Detail drawer ── */}
      {selectedJob && currentUser && (
        <ApartmentDetailDrawer
          apartment={selectedJob}
          onClose={() => setSelectedJob(null)}
          currentUser={currentUser}
          onToast={msg => setToast(msg)}
          onRequestAddTask={(apt) => { setSelectedJob(null); setAddTaskJob(apt); }}
        />
      )}

      {addTaskJob && currentUser && (
        <QuickAddTaskPanel
          apartment={addTaskJob}
          onClose={() => setAddTaskJob(null)}
          currentUser={currentUser}
          onToast={msg => setToast(msg)}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setDeleteConfirm(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto p-6 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <AlertTriangle size={22} className="text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">
                {deleteConfirm.ids.length === 1 ? s.deleteJobConfirm : `Delete ${deleteConfirm.ids.length} jobs?`}
              </h2>
              {deleteConfirm.taskCount > 0 && (
                <p className="text-sm text-gray-600 mb-1">
                  <span className="font-semibold text-red-600">{deleteConfirm.taskCount} task{deleteConfirm.taskCount !== 1 ? 's' : ''}</span>{' '}
                  and all associated notes will also be permanently deleted.
                </p>
              )}
              <p className="text-xs text-gray-400 mb-6">This cannot be undone.</p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {s.cancel}
                </button>
                <button
                  onClick={confirmDeleteJobs}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
