import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Briefcase, MapPin, ExternalLink, Trash2, ClipboardList, FolderOpen,
  Copy, StickyNote, Square, Palette, Pencil, X, AlertTriangle,
  Ghost, ThumbsUp, ThumbsDown, ClipboardPaste, LayoutGrid, Columns3, Archive, CheckCircle2, PlayCircle,
  Image as ImageIcon, ImageOff, History, MoveUpRight, Unlink, FileText, Search, FolderPlus, Printer,
  Settings2 as Settings, BringToFront, SendToBack, ChevronUp, ChevronDown, Eye,
  Eraser, GripVertical,
} from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { rotaCellAt, setRotaHover, anyRota, RotaHit } from '../data/rotaDrop';
import { PlannerEntry, personOf } from '../components/board/PlannerWidget';
import { PlannerTaskDialog, PlannerRemoveDialog } from '../components/board/PlannerDialogs';
import { ScheduleWindow } from '../components/board/ScheduleWindow';
import { boardAccess } from '../types';
import { Apartment, CanvasElement, BinKind, BIN_KINDS, BIN_META, binKeyOf, binLabelOf, isBuiltInBin, getStageName } from '../types';
import { printTable, printDot } from '../data/printing';
import { ApartmentDetailDrawer } from '../components/apartment/ApartmentDetailDrawer';
import { QuickAddTaskPanel } from '../components/apartment/QuickAddTaskPanel';
import { Toast } from '../components/ui/Toast';
import { DriveIcon, ZohoIcon, PlanIcon, TvIcon } from '../components/ui/BrandIcons';
import { BoardToolbar, BoardControlsPanel, BoardTool } from '../components/board/BoardToolbar';
import { BOARD_THEMES, getBoardTheme, surfaceAtZoom } from '../data/boardThemes';
import { allowed as sideAllowed, edgePushed, roomFor, shiftFor, shiftJobs, shiftNodes, Side } from '../data/boardExpand';
import { snapBox, snapResize, Box, Guide } from '../data/snapping';
import { MiniMap } from '../components/board/MiniMap';
import { DriveDesktopPath } from '../components/apartment/DriveDesktopPath';
import { DeleteImpact } from '../components/ui/DeleteImpact';
import { BinBoard } from '../components/board/BinBoard';
import { BoardSearch, BoardHit } from '../components/board/BoardSearch';
import { NodeSettings } from '../components/board/NodeSettings';
import { BoardViewPicker } from '../components/board/BoardViewPicker';
import { StageBoard } from '../components/board/StageBoard';
import { WidgetStore } from '../components/board/WidgetStore';
import { WidgetListPopup } from '../components/board/WidgetListPopup';
import { WIDGETS } from '../data/widgets';
import { TitleEditor } from '../components/board/TitleEditor';
import {
  AttachedArtLayer, ArrowLayer, ArrowDraft, AnchorHints, HostBox, Anchor,
  nearestAnchor, anchorOf, attachBox, DEFAULT_ATTACH_SCALE,
} from '../components/board/AttachLayer';
import { renderWidget, WidgetDef, WidgetCtx } from '../data/widgets';
import { JobTile, BoardNode, BoardHandlers } from '../components/board/BoardItems';
import { useTouchGestures, isFingerTouch } from '../hooks/useTouchGestures';
import { detectPasteIntent, fieldForIntent, canCreateFromIntent, PasteIntent } from '../data/pasteIntent';
import { StrokeNib, nibDash } from '../components/board/BoardNodes';
import { exportBoardPng, exportBoardPdf } from '../data/boardExport';
import {
  getFolderNameViaBackend, familyNameFromFolderName, extractFolderId,
  isUploadBackendConfigured, findOrCreateFolderViaBackend, uploadFileViaBackend,
} from '../data/driveApi';
import {
  PinnedTitleLayer, StrokeLayer, CountdownNode, StopwatchNode, ClipArtNode, NODE_DEFAULT_SIZE,
  VoiceMemoNode, ART_KINDS, ArtKind, isDrawingNode, strokePoints,
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

/** Solid, saturated colours — a group is a label, not a translucent box. */
/** Plain words for the five anchors, for the toast after a drop. */
const ANCHOR_WORDS: Record<Anchor, string> = {
  tl: 'top left', tm: 'top middle', tr: 'top right', bl: 'bottom left', br: 'bottom right',
};

const BIN_PALETTE = ['#16a34a', '#0ea5e9', '#7c3aed', '#ea6b13', '#dc2626', '#0d9488', '#64748b', '#b8860b'];

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

// ─── Movable panels ───────────────────────────────────────────────────────────
/**
 * Where each floating panel was last left, for THIS session only.
 *
 * Module-level rather than stored, and deliberately: where a panel sits depends
 * on the size of the screen it was moved on, so syncing it would push one
 * person's arrangement onto everybody else's monitor — the same rule the
 * board's own default zoom follows. Closing and reopening a panel finds it
 * where you put it; a reload starts it back at its dock.
 */
const PANEL_POS = new Map<string, { x: number; y: number }>();

/**
 * A floating panel with a move handle in its corner.
 *
 * Until it is dragged it keeps whatever anchor it was written with (`right`,
 * `top`, …) so nothing about the default layout changes; the first drag reads
 * the panel's own rectangle and switches to explicit left/top from there.
 * Positions are relative to the panel's offset parent, which is the board
 * viewport for the docked panels and the window for the `fixed` popovers.
 */
function MovablePanel({
  id, className, style, onClose, title, children,
}: {
  id: string;
  className: string;
  /** The dock — used until somebody moves it. */
  style: React.CSSProperties;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => PANEL_POS.get(id) ?? null);
  const ref = useRef<HTMLDivElement>(null);
  const grab = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // Escape closes it. A panel you have not noticed lays a full-screen backdrop
  // over the board and swallows every other click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function down(e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const host = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    const start = pos ?? { x: r.left - (host?.left ?? 0), y: r.top - (host?.top ?? 0) };
    grab.current = { px: e.clientX, py: e.clientY, ox: start.x, oy: start.y };
    setPos(start);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    const g = grab.current;
    if (!g) return;
    const next = { x: g.ox + (e.clientX - g.px), y: g.oy + (e.clientY - g.py) };
    setPos(next);
    PANEL_POS.set(id, next);
  }
  function up() { grab.current = null; }

  return (
    <div
      ref={ref}
      className={className}
      // `right` is cleared explicitly: the docked panels are anchored to the
      // right edge, and leaving that in place while setting `left` stretches
      // the panel across the board instead of moving it.
      style={pos ? { ...style, left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : style}
    >
      {/* In the corner, INSIDE the panel — a handle floating outside it is
          clipped away the moment a panel scrolls its own contents. Each panel
          keeps its first line clear of it with a little left padding. */}
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        title={`Move ${title}`}
        className="absolute top-1 left-0.5 p-0.5 rounded text-gray-300 hover:text-gray-600
                   cursor-grab active:cursor-grabbing z-10"
        style={{ touchAction: 'none' }}
      >
        <GripVertical size={13} />
      </div>
      {children}
    </div>
  );
}

// ─── Eraser geometry ──────────────────────────────────────────────────────────
/**
 * How far a point is from a segment.
 *
 * Testing the stored POINTS alone is what made the plan editor's first eraser
 * only work at a stroke's corners: a fast drag leaves a long straight segment
 * with nothing in the middle of it to hit.
 */
function distToSegment(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number,
): number {
  const vx = bx - ax, vy = by - ay;
  const len = vx * vx + vy * vy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/** The box a polyline occupies, which is also the box its node gets. */
function pointsBounds(pts: { x: number; y: number }[]) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  // A perfectly straight line has no extent on one axis, and a node with no
  // height cannot be drawn into or grabbed.
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
}

const fmtPoints = (pts: { x: number; y: number }[]) =>
  pts.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');

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
  /**
   * When the drag FIRST pressed against a locked edge, or null while clear.
   *
   * The make-room question only fires after the tile has dwelt there — a slow,
   * deliberate push. An aggressive fling that happens to end at the edge (like
   * yanking a job out of a group window) must never raise it.
   */
  edgeSince?: number | null;
  /** The pointer is over a planner square or a group — the tile fades. */
  overDrop?: boolean;
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
    canvasElements, activeBoardView, boardViews,
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
    users,
    deleteContractorAssignment,
    activityLogs,
    boardLayouts,
    saveBoardLayout,
    restoreBoardLayout,
    deleteBoardLayout,
    pendingFocus,
    setPendingFocus,
  } = useStore();

  /**
   * A board somebody has shared with you to LOOK at.
   *
   * Sharing has three answers and this is the middle one: everything that
   * reads still works — opening a job, searching, the minimap, every live
   * widget — and everything that changes the board is off. It is enforced at
   * the few places a change can START (a drag, the keyboard, a right-click,
   * the toolbar) rather than at each of the sixty actions, because a lever
   * somebody forgets to pull on the sixty-first is not a lever at all.
   *
   * The main board is never view-only: it belongs to the workspace.
   */
  const viewOnlyBoard = useMemo(() => {
    if (!activeBoardView) return false;
    const v = boardViews.find(b => b.id === activeBoardView);
    if (!v) return false;
    const admin = (currentUser?.role ?? '').toLowerCase().includes('admin');
    return boardAccess(v, currentUser?.id ?? '', admin) === 'view';
  }, [activeBoardView, boardViews, currentUser]);

  // The keyboard handler is attached once and closes over stale state, so it
  // reads the flag through a ref like the other refs on this page.
  const viewOnlyRef = useRef(viewOnlyBoard);
  viewOnlyRef.current = viewOnlyBoard;

  // ── All hooks must come before any early return ──────────────────
  const [selectedJob, setSelectedJob] = useState<Apartment | null>(null);
  const [addTaskJob, setAddTaskJob] = useState<Apartment | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  /** Where a job added from the right-click menu should land. */
  const [newJobAt, setNewJobAt] = useState<{ x: number; y: number } | null>(null);
  const [jobName, setJobName] = useState('');
  const [jobAddress, setJobAddress] = useState('');
  const [jobZoho, setJobZoho] = useState('');
  const [jobDrive, setJobDrive] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  /** A drop waiting on the "make it a task?" answer. */
  const [plannerDrop, setPlannerDrop] = useState<{ cell: RotaHit; job: Apartment } | null>(null);
  /** A slot being emptied that has a task behind it. */
  const [plannerRemove, setPlannerRemove] =
    useState<{ entry: PlannerEntry; done: (alsoDelete: boolean) => void } | null>(null);
  /** The whole schedule, opened from a planner. */
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[]; taskCount: number } | null>(null);

  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  /** Whether the pressed job was already the picked one — see onJobPointerDown. */
  const wasPicked = useRef(false);
  const [selectedElIds, setSelectedElIds] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  /** The floating header bar — its bottom edge is the drop ceiling. */
  const headerBarRef = useRef<HTMLDivElement>(null);
  /** A widget number clicked open: the list behind it. */
  const [widgetList, setWidgetList] = useState<{ title: string; jobIds: string[] } | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [lasso, setLasso] = useState<LassoState | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [colorPicker, setColorPicker] = useState<ColorPickerState | null>(null);
  /** Which node's settings panel is open — what the pencil opens now. */
  const [settingsEl, setSettingsEl] = useState<string | null>(null);
  /** While a piece of clip art is being dragged: what it is over, and where it would land. */
  const [attachHint, setAttachHint] = useState<{ hostId: string; anchor: Anchor } | null>(null);
  /** Which arrow's style panel is open, and where. */
  const [arrowStyle, setArrowStyle] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editingEl, setEditingEl] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const [ghostDrag, setGhostDrag] = useState<GhostDrag | null>(null);
  const [openBin, setOpenBin] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  /** Shade the slice of the board the wall is showing. */
  const [showTvRegion, setShowTvRegion] = useState(false);
  /**
   * Somebody has pushed a node against a locked edge and we are asking.
   *
   * Held rather than acted on, because making room moves everything already
   * placed — it is not a thing to do behind somebody's back.
   */
  const [askRoom, setAskRoom] = useState<Side | null>(null);


  // Subscribed, not read once: `getState()` at render time would show the
  // region as it was when the page mounted and never notice it changing.
  const tvRegion = useStore(st => (st.boardSettings.__tv ?? {}).tvView);
  /** A job the search sent us to: pulsed once the view lands on it. */
  const [searchHit, setSearchHit] = useState<string | null>(null);
  /** Which bin the pointer is currently over mid-drag, so it can light up. */
  const [hoverBin, setHoverBin] = useState<string | null>(null);
  /** Clipboard contents, read when the context menu opens. */
  const [clip, setClip] = useState<PasteIntent>({ kind: 'none', value: '', label: 'Paste' });
  const [pasteConfirm, setPasteConfirm] = useState<
    { jobId: string; intent: PasteIntent; existing: string } | null>(null);
  const [createFromLink, setCreateFromLink] = useState<
    { intent: PasteIntent; x: number; y: number } | null>(null);
  const [artPicker, setArtPicker] = useState(false);
  const [docTarget, setDocTarget] = useState<string | null>(null);
  const [docUrlField, setDocUrlField] = useState('');
  const docFileRef = useRef<HTMLInputElement>(null);
  /** Right-clicking the pen or the marker opens its colours and widths. */
  const [penOpts, setPenOpts] = useState<{ tool: 'pen' | 'highlighter'; x: number; y: number } | null>(null);
  /** Nib as well as colour and width — a dashed line means something different. */
  const [penStyle, setPenStyle] = useState({ color: '#1e3a5f', width: 3, nib: 'round' as StrokeNib });
  const [markStyle, setMarkStyle] = useState({ color: '#facc15', width: 16, nib: 'chisel' as StrokeNib });
  const [exportMenu, setExportMenu] = useState(false);
  const [titleEdit, setTitleEdit] = useState<string | null>(null);
  const [zoomField, setZoomField] = useState('100');
  /** True while a left-button-held wheel zoom is happening, so nothing drags. */
  const zoomingWithButton = useRef(false);
  /** Left button currently held, tracked here because a wheel event's
   *  `buttons` is not dependable across browsers or synthetic input. */
  const leftDown = useRef(false);
  const panFromJob = useRef<Apartment | null>(null);
  const [panning, setPanning] = useState(false);
  /** True while the view is gliding to a search result. */
  const [flying, setFlying] = useState(false);
  const zoomHold = useRef<number | undefined>(undefined);
  /** The wheel listener is registered once, so it reads the tool through a ref. */
  const toolRef = useRef<BoardTool>('select');
  const copyRef = useRef<() => void>(() => {});
  const pasteRef = useRef<() => boolean>(() => false);
  /** What Ctrl+C put down: whole node records, not text. */
  const boardClip = useRef<{ els: CanvasElement[]; jobs: string[] }>({ els: [], jobs: [] });
  /** Armed arrow: the first end is chosen, waiting for the second. */
  const [arrowFrom, setArrowFrom] = useState<string | null>(null);
  const [arrowTip, setArrowTip] = useState<{ x: number; y: number } | null>(null);
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
  /**
   * The eraser, which is a mode like the pen and lives in the same options
   * popover. Two of them, as in the plan editor: `part` rubs a hole in a
   * drawing and keeps whatever is left either side of it, `whole` lifts the
   * entire mark. Neither has a colour — an eraser that paints is a pen.
   */
  const [eraser, setEraser] = useState<{ on: boolean; width: number; whole: boolean }>(
    { on: false, width: 26, whole: false });
  /** True between pointerdown and pointerup while rubbing out. */
  const erasing = useRef(false);
  const [recordingEl, setRecordingEl] = useState<string | null>(null);
  const [savingAudio, setSavingAudio] = useState(false);
  const recorderRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; started: number } | null>(null);

  const boardSettings = useStore(st => st.boardSettings);
  const setBoardSetting = useStore(st => st.setBoardSetting);
  const projectBoard = boardSettings[currentProjectId] ?? {};
  /**
   * Lining things up, and the lines that say why.
   *
   * Two different things, and they were tangled together. Lining up with what is
   * ALREADY THERE — a neighbour's left edge, its middle, its bottom — is what
   * "line these up" means and is now always on, for every kind of thing on the
   * board and for a resize as well as a move; it only ever moves something by a
   * few pixels and it draws the line it moved to, so it can never be a surprise.
   * The GRID is the separate, opt-in part: a 22px lattice to land on when there
   * is nothing nearby to line up with, which is what the settings switch means.
   *
   * `guides` is cleared on every pointer-up, so a line can never be left on
   * screen describing a gesture that has finished.
   */
  const snapOn = projectBoard.snapToGrid ?? false;
  const [guides, setGuides] = useState<Guide[]>([]);
  /**
   * Everything a moving or resizing box may line itself up with.
   *
   * Two exclusions worth naming, because either one alone is a magnet at the
   * board's origin: an arrow has no box of its own (it is two ends and is
   * stored at 0,0,0,0) and attached clip art has no position of its own — its
   * box is derived from whatever it is stuck to.
   */
  const snapTargetsRef = useRef((_exclude: Set<string>, _noInk?: boolean) => [] as Box[]);
  snapTargetsRef.current = (exclude: Set<string>, noInk?: boolean) => {
    const out: Box[] = [];
    jobs.forEach((j, i) => {
      if (exclude.has(j.id)) return;
      out.push({ ...jobPos(j, i), w: TILE_W, h: TILE_H });
    });
    canvasElements.forEach(el => {
      if (exclude.has(el.id)) return;
      if ((el.board ?? '') !== (boardRef.current ?? '') && el.type !== 'bin') return;
      if (el.type === 'arrow' || el.attachedTo) return;
      // Loose ink is not a thing to line up with — it has a bounding box only
      // because it has to be stored somewhere. A drawing that became a node is.
      if (el.type === 'stroke' && (noInk || !isDrawingNode(el))) return;
      if (el.w <= 0 || el.h <= 0) return;
      out.push({ x: el.x, y: el.y, w: el.w, h: el.h });
    });
    return out;
  };

  /** In SCREEN pixels, divided by the zoom — or the pull is a huge magnet at 25% and nothing at 300%. */
  const SNAP_REACH = 7;
  /**
   * Snap a moving box, and say which lines to draw.
   *
   * The grid gets a guide of its own when it is the thing that moved the box:
   * a grid snap has no partner to draw a line TO, so without this it happens
   * invisibly — which is exactly the "I don't see rulers show up" complaint.
   */
  function snapMoving(box: Box, exclude: Set<string>) {
    const tol = SNAP_REACH / Math.max(0.2, zoom);
    const grid = snapOn ? GAP : 0;
    const r = snapBox(box, snapTargetsRef.current(exclude), tol, grid);
    const lines = [...r.guides];
    const REACH = 70;
    if (grid > 0 && !lines.some(g => g.axis === 'x') && Math.abs(r.x - box.x) > 0.01) {
      lines.push({ axis: 'x', at: r.x, from: r.y - REACH, to: r.y + box.h + REACH });
    }
    if (grid > 0 && !lines.some(g => g.axis === 'y') && Math.abs(r.y - box.y) > 0.01) {
      lines.push({ axis: 'y', at: r.y, from: r.x - REACH, to: r.x + box.w + REACH });
    }
    return { x: r.x, y: r.y, guides: lines };
  }

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
  /**
   * The zoom the board OPENS at is a personal preference, kept per machine
   * (localStorage) and per workspace. Synced through the store it would push
   * one person's screen size onto everybody else's monitor, where it is wrong
   * — the same rule as the Drive desktop root.
   */
  const defaultZoomKey = `board_default_zoom_${currentProjectId}`;
  const [zoom, setZoom] = useState(() => {
    const stored = Number(localStorage.getItem(defaultZoomKey));
    return stored >= 0.25 && stored <= 3 ? stored : 1;
  });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  /**
   * The live zoom and pan, for handlers that must compute both together.
   *
   * Zooming to a point sets the zoom AND the pan from the same pair of old
   * values. Doing that by nesting setPan inside a setZoom updater looks tidy
   * and is wrong: React is free to run an updater more than once, and in
   * development it deliberately does — so the pan correction was applied twice
   * and the point under the cursor slid away by exactly the amount it was meant
   * to stay still. Reading the current values from refs keeps the calculation
   * pure and the updaters side-effect free.
   */
  const zoomRef = useRef(1);
  const panRef2 = useRef({ x: 0, y: 0 });
  zoomRef.current = zoom;
  panRef2.current = pan;
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
  /**
   * The neutral state. Pan and Select as separate modes are gone — a drag on
   * empty board pans, a drag on a thing moves it, Ctrl-drag lassoes — so this
   * only ever holds a drawing tool or 'select', which means "nothing armed".
   */
  const [tool, setTool] = useState<BoardTool>('select');
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);

  /**
   * Set below the redirect guard, where `freeSpot` can see the jobs and
   * elements. A ref rather than a dependency so `dropNode` stays stable.
   * The active board id rides along the same way, for the same reason.
   */
  const freeSpotRef = useRef<(w: number, h: number) => { x: number; y: number }>(() => ({ x: 40, y: 40 }));
  const boardRef = useRef<string>('');

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
      addedAt: new Date().toISOString(),
      id: 'CE-' + Math.random().toString(36).slice(2, 9),
      type: kind,
      // Whichever board is open is the board it lands on.
      ...(boardRef.current ? { board: boardRef.current } : {}),
      x: Math.round(c.x),
      y: Math.round(c.y),
      w: size.w, h: size.h,
      text: kind === 'title' ? 'Title' : '',
      color: kind === 'clipart' ? '#dc2626' : 'rgba(250, 204, 21, 0.45)',
      // NOT pinned by default: a title you cannot drag is the wrong first
      // experience of one. Pinning is a deliberate choice in its editor.
      ...(kind === 'title' ? { fontSize: 30, fontWeight: 800, color: '#0f172a', align: 'left' as const } : {}),
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
  boardRef.current = activeBoardView;
  toolRef.current = tool;

  copyRef.current = () => {
    const els = canvasElements.filter(el => selectedElIds.has(el.id) && el.type !== 'bin');
    const jobIds = [...selectedJobIds];
    if (!els.length && !jobIds.length) return;
    boardClip.current = { els: els.map(e => ({ ...e })), jobs: jobIds };
    setToast(`Copied ${els.length + jobIds.length} item${els.length + jobIds.length === 1 ? '' : 's'}`);
  };

  pasteRef.current = () => {
    const { els, jobs: jobIds } = boardClip.current;
    if (!els.length && !jobIds.length) return false;

    // Offset so the copy is visibly a copy rather than sitting exactly on top.
    const OFF = 26;
    const newElIds = new Set<string>();
    els.forEach(el => {
      const id = 'CE-' + Math.random().toString(36).slice(2, 9);
      newElIds.add(id);
      addCanvasElement({
        addedAt: new Date().toISOString(),
        ...el,
        id,
        // A pasted piece of clip art lands on the board rather than still
        // attached to whatever the original was stuck to.
        attachedTo: undefined, attachAnchor: undefined, attachAt: undefined,
        ...(boardRef.current ? { board: boardRef.current } : { board: undefined }),
        x: Math.round(el.x + OFF), y: Math.round(el.y + OFF),
      });
    });

    const newJobIds = new Set<string>();
    if (jobIds.length && currentUser) {
      jobIds.forEach(jid => {
        const src = apartments.find(a => a.id === jid);
        if (!src) return;
        const idx = jobs.findIndex(j => j.id === jid);
        const base = idx >= 0 ? jobPos(src, idx) : { x: src.canvasX ?? 40, y: src.canvasY ?? 40 };
        const id = genId('G');
        const now = new Date().toISOString();
        addApartment({
          ...src, id,
          displayName: src.displayName ? `${src.displayName} (copy)` : '',
          canvasX: base.x + OFF, canvasY: base.y + OFF,
          ghosts: undefined,
          createdAt: now, updatedAt: now,
          updatedBy: currentUser.id, updatedByName: currentUser.name,
        });
        newJobIds.add(id);
      });
    }

    // The new items are what you are now working on — otherwise a paste is
    // followed by hunting for what you just made.
    setSelectedElIds(newElIds);
    setSelectedJobIds(newJobIds);
    setToast(`Pasted ${newElIds.size + newJobIds.size} item${newElIds.size + newJobIds.size === 1 ? '' : 's'}`);
    return true;
  };

  /** Drops a widget from the store, seeded with its own default state. */
  /**
   * Where a widget lands.
   *
   * `freeSpot` looks for a gap from the top-left of the WORLD, which on a board
   * you have panned across is somewhere you cannot see — so a widget appeared to
   * do nothing. It goes in the middle of what you are looking at, nudged if
   * something is already there.
   */
  function viewCentreSpot(w: number, h: number) {
    const vp = viewportRef.current;
    if (!vp) return freeSpot(w, h);
    const c = toWorld(
      vp.getBoundingClientRect().left + vp.clientWidth / 2,
      vp.getBoundingClientRect().top + vp.clientHeight / 2,
    );
    let x = Math.max(0, Math.round(c.x - w / 2));
    let y = Math.max(0, Math.round(c.y - h / 2));
    const taken = [
      ...canvasElements.filter(e => (e.board ?? '') === activeBoardView).map(e => ({ x: e.x, y: e.y, w: e.w, h: e.h })),
      ...jobs.map((j, i) => ({ ...jobPos(j, i), w: TILE_W, h: TILE_H })),
    ];
    for (let n = 0; n < 24; n++) {
      const clash = taken.some(t => x < t.x + t.w && x + w > t.x && y < t.y + t.h && y + h > t.y);
      if (!clash) break;
      x += 28; y += 24;
    }
    return { x, y };
  }

  function placeWidget(def: WidgetDef) {
    const at = viewCentreSpot(def.w, def.h);
    // Clip art is a first-class node type, not a widget wrapper — that is what
    // lets it stick to a job and travel with it.
    const isArt = def.id.startsWith('art-');
    // A group is a real bin node, not a widget wrapper — a wrapper would get the
    // widget chrome and none of the drop-target behaviour.
    if (def.id === 'add-bin') {
      const id = 'CE-bin-' + Math.random().toString(36).slice(2, 8);
      addCanvasElement({
        addedAt: new Date().toISOString(),
        id, type: 'bin',
        x: Math.round(at.x), y: Math.round(at.y), w: def.w, h: def.h,
        text: 'New group', color: '#7c3aed',
      });
      setTimeout(() => setSettingsEl(id), 0);   // straight into naming it
      return;
    }
    if (def.id === 'w-title') {
      const id = 'CE-' + Math.random().toString(36).slice(2, 9);
      addCanvasElement({
        addedAt: new Date().toISOString(),
        id, type: 'title', x: Math.round(at.x), y: Math.round(at.y),
        w: def.w, h: def.h, text: '', color: '#0f172a',
        fontSize: 30, fontWeight: 800, align: 'left',
      });
      // Opened on the next tick, not in this click. Mounting the editor's
      // backdrop under a pointer that is still finishing its click closes it
      // again immediately.
      setTimeout(() => setTitleEdit(id), 0);
      return;
    }
    addCanvasElement({
      addedAt: new Date().toISOString(),
      id: 'CE-' + Math.random().toString(36).slice(2, 9),
      ...(isArt
        ? { type: 'clipart' as const, art: def.id.slice(4) as ArtKind }
        : { type: 'widget' as const, widget: def.id }),
      // Whatever board is open is the board it lands on.
      ...(activeBoardView ? { board: activeBoardView } : {}),
      x: Math.round(at.x),
      y: Math.round(at.y),
      w: def.w, h: def.h,
      text: '',
      color: isArt ? '#dc2626' : '#ffffff',
      data: isArt ? {} : (def.data ? JSON.parse(JSON.stringify(def.data)) : {}),
    });
    // The store STAYS OPEN. Furnishing a board meant reopening it for every
    // single piece.
    setToast(`${def.name} added`);
  }

  function handleToolPick(next: BoardTool) {
    // Picking up any tool puts the eraser down. Two things armed at once is a
    // board where the same press does two different things.
    setEraser(v => (v.on ? { ...v, on: false } : v));
    /**
     * Pressing the tool you are already holding puts it DOWN.
     *
     * Every mode tool used to be a one-way trip: once the pen was armed the
     * only way back was to hunt for Select, so "I'm done drawing" took two
     * decisions instead of one. A second press on the lit button is the
     * obvious gesture and it now means what it looks like. Select itself is
     * the floor — pressing it again is a no-op rather than leaving the board
     * with no tool at all.
     */
    if (next === toolRef.current && next !== 'select') { setTool('select'); return; }

    if (next === 'clipart') { setArtPicker(true); setTool('select'); return; }
    if (next === 'title') {
      const at = freeSpotRef.current(NODE_DEFAULT_SIZE.title.w, NODE_DEFAULT_SIZE.title.h);
      const id = 'CE-' + Math.random().toString(36).slice(2, 9);
      addCanvasElement({
        addedAt: new Date().toISOString(),
        id, type: 'title', x: Math.round(at.x), y: Math.round(at.y),
        w: NODE_DEFAULT_SIZE.title.w, h: NODE_DEFAULT_SIZE.title.h,
        text: '', color: '#0f172a', fontSize: 30, fontWeight: 800, align: 'left',
      });
      setTimeout(() => setTitleEdit(id), 0);
      setTool('select');
      return;
    }
    if (next === 'job') { setShowAddModal(true); setTool('select'); return; }
    if (next === 'export') { exportBoardImage(); setTool('select'); return; }
    // Pen and highlighter are modes, not one-shot actions.
    if (next === 'pen' || next === 'highlighter' || next === 'pan' || next === 'select') { setTool(next); return; }

    /**
     * Note now makes the sticky PAD.
     *
     * A pad rather than a single coloured square: many notes on a cork board
     * behind it, a corner that folds up into a fresh page, bold, bullets and
     * tick-boxes. Elements already on boards keep `type: 'note'` and draw
     * exactly as they did, so nothing anybody has written moves.
     */
    if (next === 'note') {
      dropNode('widget', undefined, {
        widget: 'sticky-pad', w: 260, h: 300,
        color: 'transparent', text: '',
        data: { notes: [], openId: undefined },
      });
      setTool('select');
      return;
    }

    const creators: Record<string, CanvasElement['type']> = {
      box: 'box', title: 'title',
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
    const prevZoom = zoomRef.current;
    const prevPan = panRef2.current;

    const i = ZOOM_STEPS.findIndex(z => Math.abs(z - prevZoom) < 0.001);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0,
      (i === -1 ? ZOOM_STEPS.indexOf(1) : i) + dir))];
    if (next === prevZoom) return;

    // The world point under the cursor stays under the cursor: solve the
    // transform for the pan that keeps it fixed at the new scale.
    const cx = clientX - r.left, cy = clientY - r.top;
    const nextPan = clampPanRef.current({
      x: cx - (cx - prevPan.x) * (next / prevZoom),
      y: cy - (cy - prevPan.y) * (next / prevZoom),
    }, next);

    zoomRef.current = next;
    panRef2.current = nextPan;
    setZoom(next);
    setPan(nextPan);
  }, []);
  // The field follows the zoom unless it is being typed in.
  useEffect(() => { setZoomField(String(Math.round(zoom * 100))); }, [zoom]);

  /** Zoom from the middle of the view — what the header buttons use. */
  /**
   * The zoom buttons hold the TOP-LEFT still, not the centre.
   *
   * Zooming from the middle pulls everything inwards from all four sides, so
   * the corner you organise from drifts every time you change scale. Anchoring
   * the origin means your top-left stays exactly where it was and new room
   * appears down and to the right, which is the direction the board grows in
   * anyway. The wheel is left alone: it is an aimed gesture and keeping the
   * point under the pointer still is what makes it feel right.
   */
  const zoomCentre = useCallback((dir: 1 | -1) => {
    const r = viewportRef.current?.getBoundingClientRect();
    if (!r) return;
    zoomAt(r.left, r.top, dir);
  }, [zoomAt]);

  const deleteRef = useRef<() => void>(() => {});
  const openSearchRef = useRef<() => void>(() => {});
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
    jobOpen: j => live.current.jobOpen(j),
    elSeen: el => live.current.elSeen(el),
    jobDelete: ids => live.current.jobDelete(ids),
    jobTv: j => live.current.jobTv(j),
    jobThumbs: (id, d) => live.current.jobThumbs(id, d),
    jobThumbsDown: (id, d) => live.current.jobThumbsDown(id, d),
    ghostDown: (e, j, gi) => live.current.ghostDown(e, j, gi),
    ghostMove: e => live.current.ghostMove(e),
    ghostUp: (e, j) => live.current.ghostUp(e, j),
    ghostMenu: (e, j, gi) => live.current.ghostMenu(e, j, gi),
    elDown: (e, el) => live.current.elDown(e, el),
    elMove: e => live.current.elMove(e),
    elUp: (el, e) => live.current.elUp(el, e),
    elMenu: (e, el) => live.current.elMenu(e, el),
    elEdit: el => live.current.elEdit(el),
    elSettings: el => live.current.elSettings(el),
    elDelete: id => live.current.elDelete(id),
    elColor: (e, id) => live.current.elColor(e, id),
    elPatch: (id, p) => live.current.elPatch(id, p),
    elThumbs: (id, d) => live.current.elThumbs(id, d),
    elThumbsDown: (id, d) => live.current.elThumbsDown(id, d),
    artUse: (el, art) => live.current.artUse(el, art),
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
  const clampPanRef = useRef<
    (p: { x: number; y: number }, atZoom?: number) => { x: number; y: number }
  >(p => p);
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
          // No "just added" dot on these: they are seeded fixtures that appear
          // on a first-run board on their own, not things anybody put there.
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
  /**
   * What the board draws.
   *
   * A job that has been moved into a weekly notebook is not on the board any
   * more — it is in the notebook, which is where you go to look at it. It is
   * still a job in every total, unlike a binned one; it has just moved house.
   */
  const jobs = apartments.filter(a =>
    !a.isUnnamed && a.buildingId === 'G' && !a.boardBin && !a.inNotebook);

  /**
   * A node belongs to exactly one surface.
   *
   * `board` is empty for the workspace's main board, a bin key for something
   * filed inside a group, and a view id for a named board. Everything that
   * draws, searches, exports or measures the board reads through this, so a
   * second board cannot leak its notes onto the first.
   */
  const onThisBoard = useMemo(
    () => canvasElements.filter(el => (el.board ?? '') === activeBoardView || el.type === 'bin'),
    [canvasElements, activeBoardView],
  );

  // ── Position helpers ──────────────────────────────────────────────
  function jobPos(job: Apartment, index: number): { x: number; y: number } {
    if (drag?.kind === 'job' && drag.ids.includes(job.id)) {
      const s = drag.starts.get(job.id)!;
      return { x: s.x + drag.dx, y: s.y + drag.dy };
    }
    // A job sits in a different place on each board. The main board keeps using
    // canvasX/canvasY, so nothing that already exists moves.
    if (activeBoardView) {
      const p = job.viewPos?.[activeBoardView];
      if (p) return p;
      return defaultPos(index);
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
      const m = minSize(el);
      return {
        x: el.x, y: el.y,
        w: Math.max(m.w, resize.startW + resize.dw),
        h: Math.max(m.h, resize.startH + resize.dh),
      };
    }
    return { x: el.x, y: el.y, w: el.w, h: el.h };
  }

  // ── Bins ──────────────────────────────────────────────────────────
  // Bins are just nodes, so a custom one is as real as a built-in one.
  const binNodes = canvasElements.filter(el => el.type === 'bin' && !el.board);
  const binCount = (key: string) =>
    apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed && a.boardBin === key).length;

  /** Which bin, if any, sits under a world point. Used as a drag drop test. */
  function binAt(wx: number, wy: number): CanvasElement | null {
    for (const b of binNodes) {
      const p = elPos(b);
      if (wx >= p.x && wx <= p.x + p.w && wy >= p.y && wy <= p.y + p.h) return b;
    }
    return null;
  }

  /**
   * Takes you to whatever the search found.
   *
   * On the board it centres the view on the job, pulses it, and opens it once
   * the view has arrived — travelling there rather than teleporting, so you can
   * see WHERE it was. In a group it opens the group first, and the same pulse
   * happens inside. Either way the job ends up open, which is what you were
   * after when you searched.
   */
  function goToHit(hit: BoardHit) {
    setSearchOpen(false);

    // A group itself: open it. That IS the destination.
    if (hit.kind === 'bin' && hit.bin) {
      setOpenBin(binKeyOf(hit.bin));
      return;
    }

    // A note, heading or widget: fly to it on the board, or open the group it
    // was filed on and let the group scroll to it.
    if (hit.kind === 'node' && hit.node) {
      if (hit.bin) { setOpenBin(binKeyOf(hit.bin)); return; }
      const vp = viewportRef.current;
      if (vp) {
        setFlying(true);
        setPan(clampPanRef.current({
          x: vp.clientWidth / 2 - (hit.node.x + hit.node.w / 2) * zoom,
          y: vp.clientHeight / 2 - (hit.node.y + hit.node.h / 2) * zoom,
        }));
        setTimeout(() => setFlying(false), 620);
      }
      setSelectedElIds(new Set([hit.node.id]));
      return;
    }

    const job = hit.job;
    if (!job) return;
    setSearchHit(job.id);

    if (hit.bin) {
      setOpenBin(binKeyOf(hit.bin));
      // The group's own board scrolls to it and pulses; opening the job on top
      // of that would hide the group you were just shown, so it waits.
      setTimeout(() => {
        const j = apartments.find(a => a.id === job.id);
        if (j) setSelectedJob(j);
      }, 900);
      setTimeout(() => setSearchHit(null), 2600);
      return;
    }

    const vp = viewportRef.current;
    const idx = jobs.findIndex(j => j.id === job.id);
    if (vp && idx !== -1) {
      const p = jobPos(jobs[idx], idx);
      setFlying(true);
      setPan(clampPanRef.current({
        x: vp.clientWidth / 2 - (p.x + TILE_W / 2) * zoom,
        y: vp.clientHeight / 2 - (p.y + TILE_H / 2) * zoom,
      }));
      setTimeout(() => setFlying(false), 620);
    }
    setSelectedJobIds(new Set([job.id]));
    setTimeout(() => {
      const j = apartments.find(a => a.id === job.id);
      if (j) setSelectedJob(j);
    }, 780);
    setTimeout(() => setSearchHit(null), 2600);
  }

  /**
   * "Show me this", arriving from the app-wide search.
   *
   * Translated into the board's own hit and handed to `goToHit`, rather than
   * given a second way of travelling — one flight path, so the board can never
   * behave differently depending on which search box you used. A stage has no
   * single place on a free canvas, so it switches to the stage view, where a
   * stage IS a column.
   */
  useEffect(() => {
    const f = pendingFocus;
    if (!f) return;
    // Only what this board can show — see the note in ProjectDiagramPage. An
    // intent for somewhere else is left for the page that can act on it.
    if (f.kind === 'contractor') return;
    setPendingFocus(null);

    if (f.kind === 'stage') {
      setBoardSetting('viewMode', 'stages');
      return;
    }
    if (f.kind === 'group') {
      const bin = binNodes.find(b => b.id === f.id);
      if (bin) setOpenBin(binKeyOf(bin));
      return;
    }
    if (f.kind === 'node') {
      const node = canvasElements.find(el => el.id === f.id);
      if (!node) return;
      const bin = node.board ? binNodes.find(b => binKeyOf(b) === node.board) ?? null : null;
      goToHit({ kind: 'node', node, bin, title: node.text ?? '', why: 'search' });
      return;
    }
    const jobId = f.kind === 'apartment' ? f.id
      : f.kind === 'task' || f.kind === 'markup' ? f.apartmentId
      : null;
    if (!jobId) return;
    const job = apartments.find(a => a.id === jobId);
    if (!job) return;
    const bin = job.boardBin ? binNodes.find(b => binKeyOf(b) === job.boardBin) ?? null : null;
    goToHit({ kind: 'job', job, bin, title: job.displayName ?? '', why: 'search' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFocus]);

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

  /**
   * The tile passes the ghost's INDEX, not its position — the position is read
   * back off the job here. Taking it as a fourth argument meant it arrived
   * undefined, because `BoardHandlers.ghostDown` only ever carried three.
   */
  function onGhostPointerDown(e: React.PointerEvent, job: Apartment, index: number) {
    if (e.button !== 0) return;
    const g = job.ghosts?.[index];
    if (!g) return;
    e.stopPropagation();
    setCtxMenu(null); setColorPicker(null);
    const w0 = toWorld(e.clientX, e.clientY);
    setGhostDrag({ jobId: job.id, index, startX: g.x, startY: g.y, grabX: w0.x, grabY: w0.y, dx: 0, dy: 0, moved: false });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onGhostPointerMove(e: React.PointerEvent) {
    if (!ghostDrag) return;
    const w0 = toWorld(e.clientX, e.clientY);
    let dx = w0.x - ghostDrag.grabX;
    let dy = w0.y - ghostDrag.grabY;

    // A ghost is a tile like any other while it is being carried, so it lines
    // itself up the same way — against the job it belongs to included.
    const box = { x: ghostDrag.startX + dx, y: ghostDrag.startY + dy, w: TILE_W, h: TILE_H };
    const snapped = snapMoving(box, new Set<string>());
    dx += snapped.x - box.x;
    dy += snapped.y - box.y;
    setGuides(snapped.guides);

    const moved = ghostDrag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4;
    if (moved) edgePush(e.clientX, e.clientY); else stopEdgePush();
    setGhostDrag({ ...ghostDrag, dx, dy, moved });
    setHoverBin(binAt(w0.x, w0.y)?.id ?? null);
    setRotaHover(anyRota() ? rotaCellAt(e.clientX, e.clientY) : null);
  }

  function onGhostPointerUp(e: React.PointerEvent, job: Apartment) {
    setGuides([]);
    stopEdgePush();
    if (!ghostDrag) return;
    if (ghostDrag.moved) {
      const w0 = toWorld(e.clientX, e.clientY);
      const cell = anyRota() ? rotaCellAt(e.clientX, e.clientY) : null;
      if (cell) {
        // A ghost is the same record, so rota-ing it rotas the job.
        dropOnRota(cell, [job.id]);
        setGhostDrag(null);
        setRotaHover(null);
        return;
      }
      const bin = binAt(w0.x, w0.y);
      if (bin) {
        // Binning a ghost bins the JOB — there is only one record.
        // Keyed by binKeyOf, not binKind: a group you made yourself has no
        // binKind, and requiring one meant custom groups refused every drop.
        fileInBin([job.id], binKeyOf(bin), bin);
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
    setRotaHover(null);
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

  /**
   * Dropping a job onto a rota cell.
   *
   * The job STAYS ON THE BOARD — it snaps into the cell rather than moving into
   * it. A rota entry is a reference, not a relocation: the same job can be on
   * two people's rows on two days without being duplicated or taken off the
   * board, and taking it back out of a cell (the × on the chip) leaves the job
   * exactly where it was.
   */
  /**
   * Dropping a job onto a planner slot.
   *
   * The job STAYS ON THE BOARD — it snaps into the slot rather than moving into
   * it. A planner entry is a reference, not a relocation: the same job can be on
   * two people's rows on two days without being duplicated or taken off the
   * board, and taking it back out leaves the job exactly where it was.
   *
   * A slot holds as many as the day really holds. Nothing is ever squeezed to
   * fit; the row grows instead.
   */
  function placeOnPlanner(cell: RotaHit, ids: string[], taskId?: string) {
    setRotaHover(null);
    const el = canvasElements.find(c => c.id === cell.elId);
    if (!el) return;
    // Which of these were already living in a notebook — so the message can say
    // "another day" rather than "moved in" for a job that never left.
    const inNotebookAlready = new Set(
      ids.filter(id => apartments.find(a => a.id === id)?.inNotebook));
    const data = (el.data ?? {}) as Record<string, unknown>;
    const cells = { ...((data.cells ?? {}) as Record<string, PlannerEntry[]>) };
    const key = `${cell.person}|${cell.day}`;
    const already = cells[key] ?? [];

    /**
     * A repeat is a GHOST, not a refusal.
     *
     * Dropping a job that is already somewhere in the notebook used to be
     * silently ignored, which made it impossible to put one job on two
     * people's rows. It is the same record appearing twice — exactly like a
     * ghost on the board — so it stays one job in every total.
     *
     * Only a repeat in the SAME square is pointless, and that is all that is
     * filtered out here.
     */
    const fresh = ids
      .filter(id => !already.some(e => e.jobId === id))
      .map(id => ({ id: `R-${Math.random().toString(36).slice(2, 8)}`, jobId: id, taskId }));
    if (!fresh.length) return;
    cells[key] = [...already, ...fresh];
    updateCanvasElement(el.id, { data: { ...data, cells } });

    /**
     * The job MOVES IN: the board stops drawing it and the square holds it.
     *
     * It is not binned. A binned job drops out of every total in the app;
     * a scheduled one must not, or the unit and task counts would fall every
     * time the office planned some work. Its board position is left alone, so
     * taking it out of the last square puts it back where it was.
     */
    if (currentUser) {
      for (const { jobId } of fresh) {
        const j = apartments.find(a => a.id === jobId);
        if (j && j.inNotebook !== el.id) updateApartment(jobId!, { inNotebook: el.id }, currentUser);
      }
    }

    const ghosting = fresh.filter(f => inNotebookAlready.has(f.jobId!)).length;
    setToast(ghosting
      ? (fresh.length === 1 ? 'Another day for the same job' : `${fresh.length} more days`)
      : (fresh.length === 1 ? 'Moved into the notebook' : `${fresh.length} jobs moved into the notebook`));
  }

  /**
   * Either place it, or ask first.
   *
   * The question is worth asking because most of a task is already known at
   * this moment — the job, the day, the date and the person — so the form is
   * three-quarters filled in before it opens. It is a setting because a planner
   * used purely as a whiteboard should not interrogate every drop.
   */
  function dropOnRota(cell: RotaHit, ids: string[]) {
    const el = canvasElements.find(c => c.id === cell.elId);
    const ask = !!(el?.data as Record<string, unknown> | undefined)?.askOnDrop;
    const job = ids.length === 1 ? apartments.find(a => a.id === ids[0]) : undefined;
    if (ask && job) { setRotaHover(null); setPlannerDrop({ cell, job }); return; }
    placeOnPlanner(cell, ids);
  }

  /** Files a job into a group, with the Done celebration when that is the one. */
  /**
   * Filing a job into a group.
   *
   * A group may OPTIONALLY stand for a stage. When it does, filing a job also
   * moves it to that stage — which is what "Ready to start" actually means to
   * the office. When it does not, filing is filing and the job keeps whatever
   * stage it was at. The two systems stay independent; this is a link somebody
   * chose in the group's settings, not a coupling.
   */
  function fileInBin(ids: string[], key: string, at?: CanvasElement) {
    ids.forEach(id => moveToBin(id, key));

    const stageId = at?.stageId;
    if (stageId && currentUser) {
      ids.forEach(id => updateApartment(id, { currentStageId: stageId }, currentUser));
    }

    if (at?.binKind === 'done') celebrateAt(at);
    const label = at ? binLabelOf(at) : key;
    const stageName = stageId ? stages.find(st => st.id === stageId)?.name : undefined;
    setToast(stageName ? `Moved to ${label} · stage set to ${stageName}` : `Moved to ${label}`);
  }

  /**
   * A new group of your own.
   *
   * The four that ship with the board are only the ones that exist on day one;
   * this makes another exactly like them, with its own name, colour and board.
   */
  function addBin() {
    const size = NODE_DEFAULT_SIZE.bin;
    const at = freeSpot(size.w, size.h);
    const id = 'CE-bin-' + Math.random().toString(36).slice(2, 8);
    addCanvasElement({
      addedAt: new Date().toISOString(),
      id, type: 'bin',
      x: Math.round(at.x), y: Math.round(at.y), w: size.w, h: size.h,
      text: 'New group',
      color: '#7c3aed',
    });
    setToast('Group added — double-click it to rename');
  }

  /**
   * Removing a group.
   *
   * Whatever is inside comes back OUT to the board first. Nothing that took
   * work to create disappears because a container was tidied away.
   */
  function removeBin(el: CanvasElement) {
    const key = binKeyOf(el);
    const inside = apartments.filter(a => a.boardBin === key);
    inside.forEach(a => moveToBin(a.id, null));
    canvasElements.filter(n => n.board === key).forEach(n => deleteCanvasElement(n.id));
    deleteCanvasElement(el.id);
    setToast(inside.length
      ? `Group removed — ${inside.length} ${inside.length === 1 ? 'job' : 'jobs'} back on the board`
      : 'Group removed');
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

  /**
   * Arrows are drawn end to end, like the joins in the builder: pick the thing
   * it comes from, then the thing it goes to. Nothing is created until the
   * second end is chosen, so an abandoned arrow leaves nothing behind.
   */
  function startArrow(fromId: string) {
    setArrowFrom(fromId);
    setArrowTip(null);
    setCtxMenu(null);
    setToast('Now click what it points to');
  }

  function finishArrow(toId: string) {
    if (!arrowFrom || arrowFrom === toId) { setArrowFrom(null); return; }
    addCanvasElement({
      addedAt: new Date().toISOString(),
      id: genId('CE'),
      type: 'arrow',
      fromId: arrowFrom,
      toId,
      x: 0, y: 0, w: 0, h: 0,
      text: '',
      color: '#1e3a5f',
      strokeWidth: 2.5,
    });
    setArrowFrom(null);
    setArrowTip(null);
    setToast('Connected');
  }

  // ── Thumbs up ─────────────────────────────────────────────────────
  /** Up and down are counted separately, so both numbers stay visible. */
  function bumpThumbs(kind: 'job' | 'element', ids: string[], delta: number, dir: 'up' | 'down' = 'up') {
    const field = dir === 'up' ? 'thumbsUp' : 'thumbsDown';
    ids.forEach(id => {
      if (kind === 'job') {
        const j = apartments.find(a => a.id === id);
        if (j && currentUser) {
          updateApartment(id, { [field]: Math.max(0, ((j as unknown as Record<string, unknown>)[field] as number ?? 0) + delta) }, currentUser);
        }
      } else {
        const el = canvasElements.find(e => e.id === id);
        if (el) {
          updateCanvasElement(id, { [field]: Math.max(0, ((el as unknown as Record<string, unknown>)[field] as number ?? 0) + delta) });
        }
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

  /** Same route as a voice memo: Drive when it is set up, and only the URL. */
  async function storeDocument(file: File): Promise<string | null> {
    const parent = backupDriveFolderLink ? extractFolderId(backupDriveFolderLink) : null;
    if (!isUploadBackendConfigured() || !parent) return null;
    try {
      const folderId = await findOrCreateFolderViaBackend(parent, 'Board Files');
      const res = await uploadFileViaBackend(folderId, file);
      return res?.webViewLink ?? null;
    } catch {
      return null;
    }
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

  /** An audio file dropped in goes to exactly the same place a recording does. */
  async function uploadAudio(elId: string, file: File) {
    setSavingAudio(true);
    try {
      const url = await storeAudio(file, 0);
      if (url) {
        updateCanvasElement(elId, { audioUrl: url, text: file.name.replace(/\.[^.]+$/, '') });
        setToast('Voice memo added');
      }
    } catch {
      setToast('Could not add that file');
    } finally {
      setSavingAudio(false);
    }
  }

  // ── Export board ──────────────────────────────────────────────────
  function exportInput() {
    return { jobs, elements: canvasElements, stages, title: s.generalJobsTitle, tileW: TILE_W, tileH: TILE_H, defaultPos };
  }

  function exportBoardImage() { setExportMenu(true); }

  /**
   * The board as a list you can carry.
   *
   * Groups are shown as a column rather than filtered out — "which jobs are in
   * Done" is exactly the question somebody asks of a printed board, and a list
   * that quietly omitted them would answer it wrongly.
   */
  function printJobList() {
    const binName = (key?: string) => {
      if (!key) return 'On the board';
      const bin = canvasElements.find(el => (el.binKind ?? el.id) === key);
      return bin ? binLabelOf(bin) : key;
    };
    const rows: Apartment[] = apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed)
      .sort((a, b) => (a.boardBin ? 1 : 0) - (b.boardBin ? 1 : 0)
        || (a.displayName ?? '').localeCompare(b.displayName ?? ''));

    printTable(
      'Job board',
      rows,
      [
        { header: 'Job', value: j => j.displayName || 'Job' },
        { header: 'Address', value: j => j.address ?? '' },
        { header: 'Stage', html: true, width: '140px', value: j => {
          const st = stages.find(x => x.id === j.currentStageId);
          return st ? printDot(st.color, getStageName(st, !!s.isRtl)) : '—';
        } },
        { header: 'Tasks open', width: '68px', value: j =>
          String(contractorAssignments.filter(a => a.apartmentId === j.id && !a.completedAt).length || '') },
        { header: 'Where', width: '96px', value: j => binName(j.boardBin) },
        { header: 'Last edited', width: '86px', value: j =>
          j.contentUpdatedAt ? new Date(j.contentUpdatedAt).toLocaleDateString() : '' },
      ],
      { landscape: true, rtl: !!s.isRtl, subtitle: `${rows.length} job${rows.length === 1 ? '' : 's'}` },
    );
  }

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

  /**
   * Layering, the way Google Docs calls it: Arrange.
   *
   * Board nodes stacked purely by type — boxes behind, everything else in front
   * — which is a good default and no help at all when two notes overlap and the
   * wrong one is on top. `z` is only written when somebody makes a choice, so
   * nothing that exists moves.
   */
  function arrange(ids: string[], how: 'front' | 'back' | 'up' | 'down') {
    const zs = canvasElements
      .filter(e => !e.board || e.board === activeBoardView)
      .map(e => e.z ?? (e.type === 'box' ? 1 : e.type === 'bin' ? 4 : 5));
    const top = Math.max(5, ...zs), bottom = Math.min(1, ...zs);
    ids.forEach(id => {
      const el = canvasElements.find(e => e.id === id);
      if (!el) return;
      const cur = el.z ?? (el.type === 'box' ? 1 : el.type === 'bin' ? 4 : 5);
      const next = how === 'front' ? top + 1
        : how === 'back' ? bottom - 1
        : how === 'up' ? cur + 1
        : cur - 1;
      updateCanvasElement(id, { z: next });
    });
    setToast(how === 'front' ? 'Brought to the front'
      : how === 'back' ? 'Sent to the back'
      : how === 'up' ? 'Moved forward' : 'Moved back');
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
      addCanvasElement({
        ...orig, id: genId('CE'), x: orig.x + 25, y: orig.y + 25,
        addedAt: new Date().toISOString(),
      });
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
  openSearchRef.current = () => setSearchOpen(true);
  deleteRef.current = () => {
    if (selectedJobIds.size > 0) handleDeleteJobs([...selectedJobIds]);
    else if (selectedElIds.size > 0) handleDeleteEls([...selectedElIds]);
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.key === 'f' || e.key === 'F') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openSearchRef.current();
        return;
      }
      if (viewOnlyRef.current) return;          // read-only board: no shortcuts that change it
      if (e.key === 'Delete' || e.key === 'Backspace') deleteRef.current();

      /**
       * Copy and paste on the board.
       *
       * The clipboard already had a paste-INTENT reader — it looks at what is on
       * the system clipboard and offers to turn a Drive link into a job. That is
       * a different thing from copying the tiles you have selected, which simply
       * did not exist: Ctrl+C did nothing and Ctrl+V fell through to the intent
       * reader, so duplicating three notes meant duplicating them one at a time.
       *
       * Kept in our own clipboard rather than the system one, because a board
       * node is a structure and flattening it to text to read it back would lose
       * everything that makes it worth copying.
       */
      if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
        copyRef.current();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) {
        if (pasteRef.current()) e.preventDefault();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        copyRef.current();
        pasteRef.current();
        return;
      }
      if (e.key === 'Escape') {
        setSelectedJobIds(new Set()); setSelectedElIds(new Set());
        setCtxMenu(null); setColorPicker(null);
        setArrowFrom(null); setArrowTip(null);
        // An armed eraser is a mode, and a mode you cannot put down with
        // Escape is a trap — the same reason the pen answers to it.
        setEraser(v => (v.on ? { ...v, on: false } : v));
        setGuides([]);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── Canvas element creation ───────────────────────────────────────
  /**
   * The Note button now makes the sticky PAD.
   *
   * A pad rather than a single square of colour: it holds many notes on a cork
   * board behind it, the corner folds up into a fresh page, and it has bold,
   * bullets and tick-boxes. Elements already on boards keep `type: 'note'` and
   * still draw exactly as they did — nothing anybody has written moves.
   */
  function addNote() {
    const el: CanvasElement = {
      id: genId('CE'),
      type: 'widget',
      widget: 'sticky-pad',
      x: GAP + Math.random() * 200,
      y: GAP + Math.random() * 150,
      w: 260,
      h: 300,
      text: '',
      color: 'transparent',
      addedAt: new Date().toISOString(),
      data: { notes: [], openId: undefined },
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
    if (arrowFrom) { e.stopPropagation(); finishArrow(job.id); return; }
    // Pan mode: dragging FROM a tile moves the board, not the tile. A plain
    // click still opens the job, which is why the cursor flips to an arrow
    // whenever the pointer is over one.
    /**
     * A drag from a tile ALWAYS moves the tile.
     *
     * Pan mode used to take a press on a tile as a press on the board, so
     * dragging a job moved the whole board underneath it — which meant the one
     * gesture everybody tries first did the one thing they did not mean, and it
     * made dropping a job onto the rota impossible without first finding the
     * Select button. The board still pans from anywhere it is not covered by a
     * tile, and from space-drag and middle-drag.
     *
     * A board you can only LOOK at is the exception: there, a press behaves as
     * it did, because there is nothing to move.
     */
    if (viewOnlyBoard && !e.ctrlKey && !e.metaKey) {
      panRef.current = { px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y };
      setPanning(true);
      panFromJob.current = job;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    // With the pen or highlighter armed, a press starts a stroke wherever it
    // lands — including on top of a tile. Otherwise you could not draw across
    // the board, only in the gaps between jobs. The eraser follows the same
    // rule, or ink drawn over a tile could never be rubbed off it.
    if (drawMode) { startStrokeAt(e); return; }
    if (eraseMode) { startEraseAt(e); return; }
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
    /**
     * Was it ALREADY the picked one before this press?
     *
     * Recorded here because the very next line picks it, so asking the same
     * question on pointerup always answers yes — which made the touch rule
     * below open a job on the first tap and left no gesture for "I mean this
     * one" at all.
     */
    wasPicked.current = selectedJobIds.has(job.id) && selectedJobIds.size === 1;
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
    if (zoomingWithButton.current) return;   // the wheel has taken over
    if (panRef.current && panFromJob.current) {
      const st = panRef.current;
      setPan(clampPanRef.current({ x: st.ox + (e.clientX - st.px), y: st.oy + (e.clientY - st.py) }));
      return;
    }
    if (!drag || drag.kind !== 'job') return;
    const w0 = toWorld(e.clientX, e.clientY);
    let dx = w0.x - drag.grabX;
    let dy = w0.y - drag.grabY;

    /**
     * Line it up with what is already there.
     *
     * Only while a single tile is being moved: with several selected there is
     * no one box to line up, and pulling the group by whichever member happened
     * to be nearest something would rearrange the rest behind your back.
     */
    if (drag.ids.length === 1 && drag.starts.get(drag.ids[0])) {
      const me = drag.starts.get(drag.ids[0]);
      const box = { x: (me?.x ?? 0) + dx, y: (me?.y ?? 0) + dy, w: TILE_W, h: TILE_H };
      const snapped = snapMoving(box, new Set(drag.ids));
      dx += snapped.x - box.x;
      dy += snapped.y - box.y;
      setGuides(snapped.guides);
    }

    const moved = drag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4;
    // Held against an edge of the SCREEN, the board comes to meet you — but
    // only once this is genuinely a drag. A press that has not moved is a click
    // waiting to happen, and near an edge it would otherwise set the board off.
    if (moved) edgePush(e.clientX, e.clientY); else stopEdgePush();

    // Is any dragged tile pressed against a locked edge right now?
    let atEdge = false;
    drag.ids.forEach(id => {
      const st = drag.starts.get(id);
      if (!st) return;
      if (edgePushed(st.x + dx, st.y + dy)) atEdge = true;
    });
    const overBin = binAt(w0.x, w0.y);
    const overCell = anyRota() ? rotaCellAt(e.clientX, e.clientY) : null;
    setDrag({
      ...drag, dx, dy, moved,
      edgeSince: atEdge ? (drag.edgeSince ?? Date.now()) : null,
      overDrop: !!overBin || !!overCell,
    });
    setHoverBin(overBin?.id ?? null);
    setRotaHover(overCell);
  }

  // ── The board grows while you hold something at its edge ───────────
  /**
   * Drag a job, a note, a widget or a drawing against the side of the screen
   * and the board comes to meet you, for as long as you hold it there.
   *
   * Down and to the right this is free and silent: the surface is measured from
   * the live drag position, so the world genuinely extends under the thing you
   * are carrying. Up and to the left it is NOT free — there is no negative
   * space to grow into, so gaining room there moves everything already placed,
   * and that keeps the consent it has always had: the edge push does nothing
   * until the side has been unlocked, and a dwell at the edge still raises the
   * question on drop.
   */
  const EDGE_BAND = 46;
  const EDGE_SPEED = 16;
  const edgeVel = useRef({ vx: 0, vy: 0 });
  const edgeTimer = useRef<number | undefined>(undefined);
  /** Through a ref, so the running interval always calls this render's closure. */
  const edgeTickRef = useRef(() => {});
  edgeTickRef.current = () => {
    const { vx, vy } = edgeVel.current;
    if (!vx && !vy) return;
    const before = panRef2.current;
    const next = clampPanRef.current({ x: before.x - vx, y: before.y - vy });
    // World units the VIEW travelled. Zero means the board has no more room
    // this way yet — the surface grows as the dragged thing extends it, so the
    // next tick usually can move.
    const movedX = (before.x - next.x) / zoomRef.current;
    const movedY = (before.y - next.y) / zoomRef.current;
    if (!movedX && !movedY) return;
    panRef2.current = next;
    setPan(next);
    // The dragged thing stays under the pointer: the pointer has not moved, but
    // the world beneath it has, so the drag delta takes up exactly that much.
    setDrag(d => (d ? { ...d, dx: d.dx + movedX, dy: d.dy + movedY, moved: true } : d));
    setGhostDrag(g => (g ? { ...g, dx: g.dx + movedX, dy: g.dy + movedY, moved: true } : g));
  };

  function edgePush(clientX: number, clientY: number) {
    const vp = viewportRef.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    const ramp = (over: number) => Math.min(1, over / EDGE_BAND) * EDGE_SPEED;
    let vx = 0, vy = 0;
    if (clientX > r.right - EDGE_BAND) vx = ramp(clientX - (r.right - EDGE_BAND));
    else if (clientX < r.left + EDGE_BAND) vx = -ramp(r.left + EDGE_BAND - clientX);
    if (clientY > r.bottom - EDGE_BAND) vy = ramp(clientY - (r.bottom - EDGE_BAND));
    else if (clientY < r.top + EDGE_BAND) vy = -ramp(r.top + EDGE_BAND - clientY);
    if (vx < 0 && !sideAllowed(projectBoard.expand, 'left')) vx = 0;
    if (vy < 0 && !sideAllowed(projectBoard.expand, 'top')) vy = 0;
    edgeVel.current = { vx, vy };
    if (!vx && !vy) { stopEdgePush(); return; }
    if (edgeTimer.current === undefined) {
      edgeTimer.current = window.setInterval(() => edgeTickRef.current(), 16);
    }
  }

  function stopEdgePush() {
    if (edgeTimer.current !== undefined) {
      clearInterval(edgeTimer.current);
      edgeTimer.current = undefined;
    }
    edgeVel.current = { vx: 0, vy: 0 };
  }

  // A pointer lost mid-drag (a switched tab, a workspace change) must not leave
  // the board sliding on its own.
  useEffect(() => () => {
    if (edgeTimer.current !== undefined) clearInterval(edgeTimer.current);
  }, []);

  /**
   * Where a dropped node is allowed to SETTLE.
   *
   * Two rules, both about the top-left corner of the board:
   *  · nothing lands under the floating header bar — an invisible line at its
   *    bottom edge is the highest a node may sit in the current view;
   *  · a locked edge is a wall with a LIP: instead of flush against 0, the
   *    node stops a few pixels in, so it still reads as ON the board rather
   *    than sliced by its rim.
   */
  const EDGE_LIP = 10;
  function settleDrop(x: number, y: number): { x: number; y: number } {
    let minY = EDGE_LIP;
    const bar = headerBarRef.current;
    const vp = viewportRef.current;
    if (bar && vp && viewMode !== 'stages') {
      const barBottom = bar.getBoundingClientRect().bottom - vp.getBoundingClientRect().top;
      // The header's line, translated into world coordinates for THIS view.
      minY = Math.max(minY, (barBottom + 6 - panRef2.current.y) / zoomRef.current);
    }
    return { x: Math.max(EDGE_LIP, Math.round(x)), y: Math.max(minY, Math.round(y)) };
  }

  function onJobPointerUp(e: React.PointerEvent, job: Apartment) {
    setGuides([]);
    stopEdgePush();
    // A rub-out that began on this tile ends here if the canvas never took the
    // capture; leaving the flag up would erase on the next pointer move.
    erasing.current = false;
    if (panRef.current && panFromJob.current) {
      // A press that never moved is a click, so the job still opens.
      const moved = Math.abs(e.clientX - panRef.current.px) > 4
        || Math.abs(e.clientY - panRef.current.py) > 4;
      panRef.current = null;
      panFromJob.current = null;
      setPanning(false);
      if (!moved) setSelectedJob(job);
      return;
    }
    if (!drag || drag.kind !== 'job') return;
    if (drag.moved) {
      // Dropping onto a bin FILES the job rather than positioning it. Nothing is
      // deleted; the job simply moves off the board into that collection.
      const w0 = toWorld(e.clientX, e.clientY);
      // A rota cell takes precedence: it sits inside a widget, so a bin test
      // would never fire for it anyway, and it is the more specific target.
      const cell = anyRota() ? rotaCellAt(e.clientX, e.clientY) : null;
      const bin = binAt(w0.x, w0.y);
      if (cell) {
        dropOnRota(cell, drag.ids);
        setSelectedJobIds(new Set());
      } else if (bin) {
        fileInBin(drag.ids, binKeyOf(bin), bin);
        setSelectedJobIds(new Set());
      } else if (currentUser) {
        /**
         * Pushed against the top or left edge?
         *
         * The position is still clamped at the origin — nothing is ever stored
         * as negative — but the intent is noticed, and the offer to make room
         * is put up once the drop has landed.
         */
        let pushed: Side | null = null;
        drag.ids.forEach(id => {
          const st = drag.starts.get(id)!;
          const rawX = Math.round(st.x + drag.dx);
          const rawY = Math.round(st.y + drag.dy);
          const side = edgePushed(rawX, rawY);
          if (side && !sideAllowed(projectBoard.expand, side)) pushed = pushed ?? side;
        });
        /**
         * Ask only after a DWELL at the edge — 350ms of standing there.
         *
         * A fling that ends at the edge is somebody moving fast, not somebody
         * asking for room; the question popping up mid-flow read as the board
         * expanding on its own.
         */
        const dwelt = drag.edgeSince != null && Date.now() - drag.edgeSince >= 350;
        if (pushed && dwelt) setAskRoom(pushed);

        drag.ids.forEach(id => {
          const st = drag.starts.get(id)!;
          const { x, y } = settleDrop(st.x + drag.dx, st.y + drag.dy);
          if (activeBoardView) {
            const job = apartments.find(a => a.id === id);
            updateApartment(id, {
              viewPos: { ...(job?.viewPos ?? {}), [activeBoardView]: { x, y } },
            }, currentUser);
          } else {
            updateApartment(id, { canvasX: x, canvasY: y }, currentUser);
          }
        });
      }
    } else if (drag.ids.length === 1 && drag.ids[0] === job.id) {
      /**
       * A click that never moved SELECTS. It used to open the job.
       *
       * Opening on a single click means every mis-aimed press throws a window
       * over the board, and it leaves no gesture at all for "I mean this one" —
       * which is what you need before moving several, colouring one, or
       * right-clicking. Double-click opens, which is what a double-click means
       * everywhere else.
       *
       * A FINGER has no double-click. Two quick taps do not reliably reach the
       * page as one — iOS reserves the gesture for zooming and only sometimes
       * synthesises `dblclick` from it — so on a tablet the board's only way of
       * opening a job did not exist and a job could not be opened at all.
       *
       * The touch equivalent is the iOS one: tap to pick it out, tap the
       * already-picked one to open it. Nothing about the mouse changes, and the
       * "I mean this one" gesture the rule above exists to protect survives —
       * it is simply the FIRST tap rather than the only click.
       */
      if (isFingerTouch(e) && wasPicked.current) {
        setSelectedJob(job);
      } else {
        setSelectedJobIds(new Set([job.id]));
        setSelectedElIds(new Set());
      }
    }
    setDrag(null);
    setHoverBin(null);
    setRotaHover(null);
  }

  function onJobContextMenu(e: React.MouseEvent, job: Apartment) {
    e.preventDefault(); e.stopPropagation();
    if (viewOnlyBoard) return;
    const ids = selectedJobIds.has(job.id) && selectedJobIds.size > 1 ? [...selectedJobIds] : [job.id];
    if (!selectedJobIds.has(job.id)) setSelectedJobIds(new Set([job.id]));
    refreshClipboard();
    setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'job', ids });
  }

  // ── Element drag ──────────────────────────────────────────────────
  function onElPointerDown(e: React.PointerEvent, el: CanvasElement) {
    if (e.button !== 0) return;
    if (viewOnlyBoard) return;
    if (arrowFrom) { e.stopPropagation(); finishArrow(el.id); return; }
    if ((e.target as HTMLElement).closest('[data-el-action]')) return;
    if (drawMode) { startStrokeAt(e); return; }
    if (eraseMode) { startEraseAt(e); return; }
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
    let dx = w0.x - drag.grabX;
    let dy = w0.y - drag.grabY;
    const moved = drag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4;

    // Show where a piece of clip art would land, so the drop is decided before
    // you let go rather than found out afterwards.
    const only = drag.ids.length === 1
      ? canvasElements.find(x => x.id === drag.ids[0])
      : undefined;
    let host: HostBox | null = null;
    if (moved && only?.type === 'clipart') {
      host = hostAt(w0.x, w0.y, only.id);
      setAttachHint(host ? { hostId: host.id, anchor: nearestAnchor(host, w0.x, w0.y) } : null);
    } else if (attachHint) {
      setAttachHint(null);
    }

    /**
     * The same lining-up the tiles get, for every other kind of thing on the
     * board — a note, a heading, a widget, a group, a drawing.
     *
     * Skipped while a piece of clip art is over something it would stick to:
     * there the answer is the anchor it is about to land on, and a magnet
     * pulling it a few pixels sideways would only fight that.
     */
    if (only && !host) {
      const st = drag.starts.get(only.id);
      const box = { x: (st?.x ?? only.x) + dx, y: (st?.y ?? only.y) + dy, w: only.w, h: only.h };
      const snapped = snapMoving(box, new Set(drag.ids));
      dx += snapped.x - box.x;
      dy += snapped.y - box.y;
      setGuides(snapped.guides);
    }

    if (moved) edgePush(e.clientX, e.clientY); else stopEdgePush();

    // Pressed against a locked edge, exactly as a tile is — a note pushed into
    // the corner asks for room on the same terms.
    let atEdge = false;
    drag.ids.forEach(id => {
      const st = drag.starts.get(id);
      if (st && edgePushed(st.x + dx, st.y + dy)) atEdge = true;
    });

    setDrag({
      ...drag, dx, dy, moved,
      edgeSince: atEdge ? (drag.edgeSince ?? Date.now()) : null,
    });
  }

  /** The host under a world point, if any — used to decide an attach or arrow. */
  function hostAt(wx: number, wy: number, exceptId?: string): HostBox | null {
    let best: HostBox | null = null;
    hostBoxes.forEach(h => {
      if (h.id === exceptId) return;
      if (wx >= h.x && wx <= h.x + h.w && wy >= h.y && wy <= h.y + h.h) {
        // Smallest wins, so a pin dropped on a note inside a box sticks to the note.
        if (!best || h.w * h.h < best.w * best.h) best = h;
      }
    });
    return best;
  }

  function onElPointerUp(el: CanvasElement, e?: React.PointerEvent) {
    setGuides([]);
    stopEdgePush();
    erasing.current = false;
    if (!drag || drag.kind !== 'element') return;

    // Clip art dropped on top of something STICKS to it, and from then on has
    // no position of its own — it has that thing's, plus an offset.
    if (drag.moved && el.type === 'clipart' && drag.ids.length === 1) {
      const st = drag.starts.get(el.id)!;
      const cx = st.x + drag.dx + el.w / 2;
      const cy = st.y + drag.dy + el.h / 2;
      const host = hostAt(cx, cy, el.id);
      setAttachHint(null);
      if (host) {
        const anchor = nearestAnchor(host, cx, cy);
        updateCanvasElement(el.id, {
          attachedTo: host.id,
          attachAnchor: anchor,
          // Its size becomes a share of the host's width, so resizing the tile
          // resizes the piece with it — which is what being stuck on means.
          attachScale: el.attachScale ?? Math.min(0.5, Math.max(0.08, el.w / Math.max(1, host.w))),
          attachAt: undefined,
        });
        setDrag(null); setHoverBin(null);
        setToast(`Stuck on the ${ANCHOR_WORDS[anchor]}`);
        return;
      }
      if (el.attachedTo) {
        // Dragged off. It keeps the size it had while attached, so it does not
        // jump when it lands back on the board.
        updateCanvasElement(el.id, {
          attachedTo: undefined, attachAnchor: undefined, attachAt: undefined,
          x: Math.max(0, Math.round(cx - el.w / 2)), y: Math.max(0, Math.round(cy - el.h / 2)),
        });
        setDrag(null); setHoverBin(null);
        setToast('Unstuck');
        return;
      }
    }

    if (drag.moved) {
      // The same question a tile raises: pushed into a locked corner and held
      // there, the board offers to make room rather than doing it silently.
      let pushed: Side | null = null;
      drag.ids.forEach(id => {
        const st = drag.starts.get(id);
        if (!st) return;
        const side = edgePushed(Math.round(st.x + drag.dx), Math.round(st.y + drag.dy));
        if (side && !sideAllowed(projectBoard.expand, side)) pushed = pushed ?? side;
      });
      if (pushed && drag.edgeSince != null && Date.now() - drag.edgeSince >= 350) setAskRoom(pushed);

      drag.ids.forEach(id => {
        const st = drag.starts.get(id)!;
        const settled = settleDrop(st.x + drag.dx, st.y + drag.dy);
        const node = canvasElements.find(n => n.id === id);
        // A drawing carries its polyline with it — the points ARE the ink, so
        // moving the node without them would leave the drawing behind. Still
        // one record holding one path; only its coordinates change.
        updateCanvasElement(id, node && isDrawingNode(node)
          ? { ...settled, points: relaidPoints(node, { ...settled, w: node.w, h: node.h }) }
          : settled);
      });
    } else if (el.type === 'bin' && el.binKind && drag.ids.length === 1 && drag.ids[0] === el.id) {
      // A press that never became a drag is a click, so the bin opens. Deciding
      // it here rather than with an onClick is what lets a bin be dragged at all.
      setOpenBin(el.binKind);
    } else if (
      // The same rule the job tiles use: a finger has no double-click, so
      // tapping an already-picked node is what opens it for editing.
      e && isFingerTouch(e) && !drag.moved
      && drag.ids.length === 1 && drag.ids[0] === el.id
      && selectedElIds.has(el.id) && selectedElIds.size === 1
    ) {
      startEdit(el);
    }
    setDrag(null);
    setAttachHint(null);
  }

  function onElContextMenu(e: React.MouseEvent, el: CanvasElement) {
    if (viewOnlyBoard) { e.preventDefault(); return; }
    e.preventDefault(); e.stopPropagation();
    const ids = selectedElIds.has(el.id) && selectedElIds.size > 1 ? [...selectedElIds] : [el.id];
    if (!selectedElIds.has(el.id)) setSelectedElIds(new Set([el.id]));
    setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'element', ids });
  }

  // ── Box resize ────────────────────────────────────────────────────
  /** Smallest a node may be — a pin is not a section box. */
  function minSize(el: CanvasElement): { w: number; h: number } {
    if (el.type === 'clipart') return { w: 24, h: 24 };
    if (el.type === 'title') return { w: 80, h: 28 };
    // A drawing can honestly be a short flick or a straight line, so its floor
    // is the smallest box that can still be grabbed rather than a card's.
    if (el.type === 'stroke') return { w: 12, h: 12 };
    if (el.type === 'voice' || el.type === 'note') return { w: 110, h: 56 };
    if (el.type === 'widget') return { w: 120, h: 64 };
    return { w: 120, h: 80 };
  }

  /**
   * A drawing's polyline, re-laid into a new box.
   *
   * Called once when a move or a resize lands — never per frame, and never one
   * record per point. While the gesture is live the node scales the SAME path
   * with its viewBox, so this only makes the stored coordinates agree with
   * where the drawing now is, which is what the overview, the export and the
   * wallboard all read.
   */
  function relaidPoints(el: CanvasElement, box: { x: number; y: number; w: number; h: number }): string | undefined {
    const pts = strokePoints(el);
    if (pts.length < 2) return el.points;
    const b = pointsBounds(pts);
    const kx = box.w / b.w, ky = box.h / b.h;
    return fmtPoints(pts.map(p => ({
      x: box.x + (p.x - b.x) * kx,
      y: box.y + (p.y - b.y) * ky,
    })));
  }

  function onResizePointerDown(e: React.PointerEvent, el: CanvasElement) {
    e.stopPropagation(); e.preventDefault();
    setResize({ id: el.id, startW: el.w, startH: el.h, startPX: e.clientX, startPY: e.clientY, dw: 0, dh: 0 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onResizePointerMove(e: React.PointerEvent) {
    if (!resize) return;
    const el = canvasElements.find(x => x.id === resize.id);
    const m = el ? minSize(el) : { w: 120, h: 80 };
    // Local only. Writing to the store here serialised the entire project to
    // localStorage on every pointer frame; the commit happens on pointerup.
    // Divided by zoom, or the corner would run away from the cursor at any
    // zoom but 100% — the same trap the tile drag fell into.
    let w = Math.max(m.w, resize.startW + (e.clientX - resize.startPX) / zoom);
    let h = Math.max(m.h, resize.startH + (e.clientY - resize.startPY) / zoom);

    /**
     * A resize lines up with its neighbours too, which is the half of this that
     * was missing: dragging a note's corner out to the width of the one beside
     * it was eyework. The corner being placed is the FAR one, so the near one
     * has to stay exactly where it is — `snapResize` is written that way.
     */
    if (el) {
      const rawW = w, rawH = h;
      const snapped = snapResize(
        { x: el.x, y: el.y, w, h },
        snapTargetsRef.current(new Set([el.id])),
        SNAP_REACH / Math.max(0.2, zoom),
        snapOn ? GAP : 0,
      );
      w = Math.max(m.w, snapped.w);
      h = Math.max(m.h, snapped.h);
      // The grid has no partner to draw a line to, so it draws one against the
      // edge it just moved — the same rule a move follows.
      const lines = [...snapped.guides];
      const REACH = 70;
      if (snapOn && !lines.some(g => g.axis === 'x') && Math.abs(w - rawW) > 0.01) {
        lines.push({ axis: 'x', at: el.x + w, from: el.y - REACH, to: el.y + h + REACH });
      }
      if (snapOn && !lines.some(g => g.axis === 'y') && Math.abs(h - rawH) > 0.01) {
        lines.push({ axis: 'y', at: el.y + h, from: el.x - REACH, to: el.x + w + REACH });
      }
      setGuides(lines);
    }

    setResize({ ...resize, dw: w - resize.startW, dh: h - resize.startH });
  }

  function onResizePointerUp() {
    setGuides([]);
    if (resize && (resize.dw !== 0 || resize.dh !== 0)) {
      const el = canvasElements.find(e => e.id === resize.id);
      const m = el ? minSize(el) : { w: 120, h: 80 };
      const box = {
        x: el?.x ?? 0, y: el?.y ?? 0,
        w: Math.max(m.w, resize.startW + resize.dw),
        h: Math.max(m.h, resize.startH + resize.dh),
      };
      updateCanvasElement(resize.id, el && isDrawingNode(el)
        ? { w: box.w, h: box.h, points: relaidPoints(el, box) }
        : { w: box.w, h: box.h });
    }
    setResize(null);
  }

  // ── Lasso + freehand drawing ──────────────────────────────────────
  const drawMode = tool === 'pen' || tool === 'highlighter';
  const eraseMode = eraser.on;

  /** Begins a freehand stroke at a pointer position, whatever it landed on. */
  function startStrokeAt(e: React.PointerEvent) {
    const { x, y } = toWorld(e.clientX, e.clientY);
    setCtxMenu(null); setColorPicker(null);
    setDrawing({ pts: [{ x, y }], marker: tool === 'highlighter' });
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  /**
   * Rubbing out, from wherever the press landed — over a tile included, exactly
   * as the pen draws over one.
   */
  function startEraseAt(e: React.PointerEvent) {
    setCtxMenu(null); setColorPicker(null);
    erasing.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    eraseAt(e.clientX, e.clientY);
  }

  /**
   * One pass of the eraser at a screen point.
   *
   * `whole` lifts any mark it touches. Otherwise the stroke is CUT: the points
   * inside the eraser go, and each run that survives either side becomes a
   * stroke of its own — still one record per stroke, never one per point.
   * A run of a single point is dropped, because a polyline of one draws
   * nothing and would only be an invisible thing to trip over later.
   */
  function eraseAt(clientX: number, clientY: number) {
    const p = toWorld(clientX, clientY);
    const r = eraser.width / 2;
    canvasElements.forEach(el => {
      if (el.type !== 'stroke' || !el.points) return;
      if ((el.board ?? '') !== (boardRef.current ?? '')) return;
      const reach = r + (el.strokeWidth ?? 3) / 2;
      // Cheap rejection first: most of the board is nowhere near the pointer.
      if (p.x < el.x - reach || p.x > el.x + el.w + reach
        || p.y < el.y - reach || p.y > el.y + el.h + reach) return;

      const pts = strokePoints(el);
      if (pts.length < 2) return;
      const hitsSegment = pts.some((pt, i) =>
        i > 0 && distToSegment(p.x, p.y, pts[i - 1].x, pts[i - 1].y, pt.x, pt.y) <= reach);
      if (!hitsSegment) return;

      if (eraser.whole) { deleteCanvasElement(el.id); return; }

      const runs: { x: number; y: number }[][] = [];
      let run: { x: number; y: number }[] = [];
      pts.forEach(pt => {
        if (Math.hypot(pt.x - p.x, pt.y - p.y) <= reach) {
          if (run.length) { runs.push(run); run = []; }
        } else {
          run.push(pt);
        }
      });
      if (run.length) runs.push(run);

      deleteCanvasElement(el.id);
      runs.filter(rn => rn.length > 1).forEach(rn => {
        const box = pointsBounds(rn);
        addCanvasElement({ ...el, id: genId('CE'), ...box, points: fmtPoints(rn) });
      });
    });
  }

  /**
   * What a press on empty board means.
   *
   * Plain left-drag PANS. That is the gesture people arrive with from every map
   * and every canvas, and it was previously spent on the lasso — which is the
   * rarer action of the two by a wide margin. Ctrl/⌘ + drag draws the selection
   * box instead, which also matches Ctrl/⌘ + click already meaning "add to
   * selection". Space-drag and middle-drag still pan, so nothing that worked
   * before stopped working.
   */
  function onCanvasPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as Element) !== canvasRef.current) return;
    setCtxMenu(null); setColorPicker(null);
    const { x, y } = toWorld(e.clientX, e.clientY);

    // Pen, highlighter and eraser take the gesture outright while armed.
    if (drawMode) { startStrokeAt(e); return; }
    if (eraseMode) { startEraseAt(e); return; }

    setSelectedJobIds(new Set()); setSelectedElIds(new Set());

    /**
     * Which gesture a plain left-drag on empty board is.
     *
     * The two toolbar buttons were doing nothing at all. Now they swap the
     * default: SELECT drags a selection box, PAN moves the board. Ctrl/Cmd
     * flips whichever is current, so the other one is always one modifier away
     * and neither tool ever traps you.
     */
    // Ctrl/Cmd draws a selection box; a plain drag on empty board pans.
    const wantsLasso = e.ctrlKey || e.metaKey;
    if (wantsLasso) {
      setLasso({ sx: x, sy: y, ex: x, ey: y });
    } else {
      panRef.current = { px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y };
      setPanning(true);
    }
    canvasRef.current!.setPointerCapture(e.pointerId);
  }

  function onCanvasPointerMove(e: React.PointerEvent) {
    if (zoomingWithButton.current) return;
    if (erasing.current) { eraseAt(e.clientX, e.clientY); return; }
    if (panRef.current) {
      const st = panRef.current;
      setPan(clampPanRef.current({ x: st.ox + (e.clientX - st.px), y: st.oy + (e.clientY - st.py) }));
      return;
    }
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
    if (arrowFrom) { const w = toWorld(e.clientX, e.clientY); setArrowTip(w); }
    if (!lasso) return;
    const w = toWorld(e.clientX, e.clientY);
    setLasso(l => l ? { ...l, ex: w.x, ey: w.y } : null);
  }

  function onCanvasPointerUp() {
    setGuides([]);
    stopEdgePush();
    if (erasing.current) { erasing.current = false; return; }
    if (panRef.current) { panRef.current = null; setPanning(false); return; }
    if (drawing) {
      // One record per stroke — never one per point, which would flood the store.
      if (drawing.pts.length > 1) {
        const box = pointsBounds(drawing.pts);
        /**
         * A drawing that overlaps nothing becomes a thing in its own right.
         *
         * Ink laid ACROSS a tile or a note is annotation — it belongs to what it
         * is drawn on and must not turn into a box sitting on top of it. Ink in
         * clear space is a drawing somebody made: an arrow between two columns,
         * a ring round a group. That one gets to be moved, resized and removed
         * like everything else on the board.
         *
         * Other DRAWINGS are not counted as something to overlap: two strokes
         * that cross are how anybody draws an X, and refusing the second one
         * would make the pair behave differently from either alone.
         */
        const clear = !snapTargetsRef.current(new Set<string>(), true).some(t =>
          box.x < t.x + t.w && box.x + box.w > t.x && box.y < t.y + t.h && box.y + box.h > t.y);
        addCanvasElement({
          id: genId('CE'),
          type: 'stroke',
          ...(boardRef.current ? { board: boardRef.current } : {}),
          ...box,
          text: '',
          color: drawing.marker ? markStyle.color : penStyle.color,
          points: fmtPoints(drawing.pts),
          strokeWidth: drawing.marker ? markStyle.width : penStyle.width,
          nib: drawing.marker ? markStyle.nib : penStyle.nib,
          ...(drawing.marker ? { art: 'marker' as const } : {}),
          ...(clear ? { data: { own: true } } : {}),
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
    const down = (e: PointerEvent) => { if (e.button === 0) leftDown.current = true; };
    const up = () => { leftDown.current = false; };
    vp.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    const onWheel = (e: WheelEvent) => {
      /**
       * A widget that OWNS the wheel outright, scrollable or not.
       *
       * `data-wheel` says "I am a scroller, give me the wheel while I still
       * have somewhere to go". That is the right rule for a list and the wrong
       * one for the map, which is not a scroller at all — it has no overflow,
       * so the scroller test never matched and the board zoomed itself instead
       * of the map. This says "hands off entirely", and is the only thing that
       * suits a widget whose whole job is to interpret a wheel its own way.
       */
      if ((e.target as Element | null)?.closest?.('[data-wheel-own]')) return;

      // Anything with its own scroll — the toolbar rail, a list inside a widget —
      // keeps its wheel. Swallowing it board-wide meant a rail taller than the
      // screen could not be scrolled at all.
      const inner = (e.target as HTMLElement | null)?.closest?.('.board-rail, [data-wheel]');
      if (inner && inner.scrollHeight > inner.clientHeight + 1) return;

      /**
       * The wheel ALWAYS zooms, and always towards the pointer.
       *
       * It used to depend on which of two modes you were in, which meant the
       * same gesture did two different things depending on a button you might
       * not have noticed you had pressed. One rule is easier to hold in your
       * head than two, and shift+wheel still slides sideways for anyone who
       * wants to move without changing scale.
       */
      const held = leftDown.current || (e.buttons & 1) === 1;

      /**
       * A widget that scrolls keeps its own wheel.
       *
       * This listener is on the viewport and native, so it runs BEFORE any
       * handler inside a widget and its preventDefault stops the browser
       * scrolling anything at all — which is why the weekly notebook could not
       * be wheeled through even though it was plainly a scrollable list.
       * Anything marked as its own scroller is left alone, and only when it
       * actually has somewhere to go in that direction: at the top or bottom
       * of the list the wheel goes back to being the board's.
       */
      const scroller = (e.target as Element | null)?.closest?.('[data-wheel]') as HTMLElement | null;
      if (scroller) {
        const room = scroller.scrollHeight - scroller.clientHeight;
        const atTop = scroller.scrollTop <= 0;
        const atEnd = scroller.scrollTop >= room - 1;
        if (room > 0 && !((atTop && e.deltaY < 0) || (atEnd && e.deltaY > 0))) return;
      }

      e.preventDefault();

      if (e.shiftKey) {
        setPan(p => clampPanRef.current({ x: p.x - e.deltaY - e.deltaX, y: p.y }));
        return;
      }

      if (held) {
        zoomingWithButton.current = true;
        clearTimeout(zoomHold.current);
        zoomHold.current = window.setTimeout(() => { zoomingWithButton.current = false; }, 260);
      }
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1 : -1);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
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
        setPan(pp => clampPanRef.current({
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
      setPanning(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  }
  function onViewportPointerMove(e: React.PointerEvent) {
    const st = panRef.current;
    if (!st) return;
    setPan(clampPanRef.current({ x: st.ox + (e.clientX - st.px), y: st.oy + (e.clientY - st.py) }));
  }
  function onViewportPointerUp() {
    panRef.current = null;
    setPanning(false);
    stopEdgePush();
  }

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
    setPan(clampPanRef.current({
      x: Math.min(24, (r.width - b.w * step) / 2) - b.x * step,
      y: 16 - b.y * step,
    }));
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
      // Loose ink has no box worth fitting to; a drawing that became a node
      // does, and leaving it out meant Fit could scroll one off the screen.
      if (el.type === 'stroke' && !isDrawingNode(el)) return;
      x0 = Math.min(x0, el.x); y0 = Math.min(y0, el.y);
      x1 = Math.max(x1, el.x + el.w); y1 = Math.max(y1, el.y + el.h);
    });
    if (!Number.isFinite(x0)) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  fitRef.current = zoomToFit;

  /** Typing a percentage snaps to the nearest step the board actually uses. */
  function commitZoomField() {
    const want = Number(zoomField) / 100;
    if (!Number.isFinite(want) || want <= 0) { setZoomField(String(Math.round(zoom * 100))); return; }
    const step = ZOOM_STEPS.reduce((best, z) =>
      Math.abs(z - want) < Math.abs(best - want) ? z : best, ZOOM_STEPS[0]);
    setZoom(step);
    setPan(p => clampPanRef.current(p));
  }
  /**
   * Keep the view over the board — at a GIVEN zoom.
   *
   * The zoom has to be passed in, because zooming sets the pan and the zoom
   * together: this closure captures the zoom from the last render, so clamping
   * a freshly-computed pan against it measured the world at the OLD size and
   * pulled the anchor point off the cursor. That is why zoom drifted instead of
   * landing where you pointed.
   */
  clampPanRef.current = (p, atZoom) => {
    const z = atZoom ?? zoom;
    const w = maxX * z, h = maxY * z;
    /**
     * Zooming out must never reveal room nobody asked for.
     *
     * Once the scaled world is SMALLER than the viewport, the old clamp let the
     * pan range over 0..(viewport − world) on each axis — a positive offset,
     * which is blank space above and to the left of the board's own origin.
     * So zooming out drifted everything down-right off the corner and opened
     * emptiness over the planner, whatever the expand toggles said.
     *
     * Pinned to the corner instead, unless that side has actually been unlocked
     * — which is the same rule `sideAllowed` applies to dragging, so the toggle
     * finally means one thing in both places.
     */
    const pinX = !sideAllowed(projectBoard.expand, 'left');
    const pinY = !sideAllowed(projectBoard.expand, 'top');
    return {
      x: w <= vp.w
        ? (pinX ? 0 : Math.max(0, Math.min(p.x, vp.w - w)))
        : Math.min(0, Math.max(p.x, vp.w - w)),
      y: h <= vp.h
        ? (pinY ? 0 : Math.max(0, Math.min(p.y, vp.h - h)))
        : Math.min(0, Math.max(p.y, vp.h - h)),
    };
  };

  // ── Start text edit for element ───────────────────────────────────
  function startEdit(el: CanvasElement) {
    // A title's whole purpose is how it reads, so it gets the type editor.
    if (el.type === 'title') { setTitleEdit(el.id); return; }
    setEditingEl(el.id);
    setEditText(el.text);
    setTimeout(() => editInputRef.current?.focus(), 30);
  }

  function commitEdit() {
    if (editingEl) updateCanvasElement(editingEl, { text: editText });
    setEditingEl(null);
  }

  /**
   * Every box something can be attached to.
   *
   * Built from live positions — including a tile mid-drag — so a pin stuck to a
   * job travels with it and an arrow re-draws itself as either end moves,
   * without either of them storing a coordinate that could go stale.
   */
  const hostBoxes = useMemo(() => {
    const m = new Map<string, HostBox>();
    jobs.forEach((j, i) => {
      const p = jobPos(j, i);
      m.set(j.id, { id: j.id, x: p.x, y: p.y, w: TILE_W, h: TILE_H });
    });
    canvasElements.forEach(el => {
      if (el.type === 'stroke' || el.type === 'arrow' || el.attachedTo || el.board) return;
      const p = elPos(el);
      m.set(el.id, { id: el.id, x: p.x, y: p.y, w: p.w, h: p.h });
    });
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, canvasElements, drag, resize]);

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
  /**
   * Through a ref, so the widget context stays stable.
   *
   * The context is memoised and handed to every widget on the board; putting a
   * closure over `currentUser` straight into it would rebuild the context — and
   * therefore re-render every widget — on changes that have nothing to do with
   * any of them.
   */
  const leaveNotebookRef = useRef((_id: string) => {});
  leaveNotebookRef.current = (id: string) => {
    if (!currentUser) return;
    updateApartment(id, { inNotebook: undefined }, currentUser);
    setToast('Back on the board');
  };

  const widgetCtx: WidgetCtx = useMemo(() => ({
    jobs: apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed),
    stages: allStages.filter(st => st.projectId === 'general'),
    assignments: contractorAssignments,
    contractors,
    users,
    photos: contractorPhotos,
    logs: activityLogs,
    update: () => {},
    openJob: (id: string) => openJobRef.current(id),
    boardElements: canvasElements,
    isRtl: !!s.isRtl,
    // A job whose last square in the notebook was emptied comes back to the
    // board, at the position it never lost.
    leaveNotebook: (id: string) => leaveNotebookRef.current(id),
    // Every widget figure opens the records it counted.
    showList: (title: string, jobIds: string[]) => setWidgetList({ title, jobIds }),
  }), [apartments, allStages, contractorAssignments, contractors, contractorPhotos, activityLogs,
       users, canvasElements]);

  // ── Canvas size ───────────────────────────────────────────────────
  /**
   * The board is bigger than its contents, always.
   *
   * Two rules, and they matter for different reasons:
   *  - **At least the viewport.** Sizing the surface to the content left a grey
   *    void around a small board, which reads as the end of the world rather
   *    than as empty board.
   *  - **A small margin past the furthest thing.** The board grows to MEET what
   *    you drag out — `jobPos` reports the live drag position, so the surface
   *    extends under the tile as it goes — rather than always carrying a slab of
   *    empty space you can scroll into for no reason.
   *
   * Rounded to a coarse step so panning does not resize the surface every
   * frame — the sizes change in chunks, not continuously.
   */
  const EDGE_PAD = 140;
  let contentX = 0, contentY = 0;
  jobs.forEach((job, i) => { const p = jobPos(job, i); contentX = Math.max(contentX, p.x + TILE_W); contentY = Math.max(contentY, p.y + TILE_H); });
  canvasElements.forEach(el => {
    // Nodes filed inside a group, and art stuck to something, have no position
    // on THIS board — counting them stretched the surface to fit coordinates
    // that are never drawn here.
    if (el.board || el.attachedTo || (el.type === 'stroke' && !isDrawingNode(el))) return;
    contentX = Math.max(contentX, el.x + el.w);
    contentY = Math.max(contentY, el.y + el.h);
  });
  /**
   * The board is exactly as big as what is on it, plus room to put the next
   * thing down.
   *
   * It used to include a term derived from the current pan, so panning right
   * grew the world, which allowed more panning, which grew it again — an empty
   * board scrolled for miles and the minimap drew a mostly-empty field. The
   * size now comes from the content alone, with one screen as the floor, so an
   * empty board is one screen and it grows as you push a tile into a corner.
   */
  const step = (n: number) => Math.ceil(n / 400) * 400;
  const maxX = Math.max(step(contentX + EDGE_PAD), 1200);
  const maxY = Math.max(step(contentY + EDGE_PAD), 800);

  /**
   * Open a job by id — from ANY list, including ones the board is not drawing.
   *
   * `jobs` is what the board draws, and a job living in a weekly notebook is
   * deliberately not in it. Looking the id up there meant a card in the
   * notebook could not be opened at all: the job it named was, by definition,
   * excluded from the list being searched.
   */
  openJobRef.current = (id: string) => {
    const j = apartments.find(x => x.id === id);
    if (j) setSelectedJob(j);
  };
  live.current = {
    jobDown: onJobPointerDown, jobMove: onJobPointerMove, jobUp: onJobPointerUp,
    jobMenu: onJobContextMenu, jobOpen: (j: Apartment) => setSelectedJob(j), jobDelete: handleDeleteJobs,
    elSeen: (el: CanvasElement) => updateCanvasElement(el.id, { addedAt: undefined }),
    jobTv: (j: Apartment) => { if (currentUser) updateApartment(j.id, { showOnTv: j.showOnTv === false }, currentUser); },
    jobThumbs: (id: string, d: number) => bumpThumbs('job', [id], d),
    ghostDown: onGhostPointerDown,
    ghostMove: onGhostPointerMove,
    ghostUp: onGhostPointerUp,
    ghostMenu: (e: React.MouseEvent, j: Apartment, gi: number) => {
      e.preventDefault(); e.stopPropagation();
      setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'ghost', ids: [j.id], ghostIndex: gi });
    },
    jobThumbsDown: (id: string, d: number) => bumpThumbs('job', [id], d, 'down'),
    elDown: onElPointerDown, elMove: onElPointerMove, elUp: onElPointerUp,
    elMenu: onElContextMenu, elEdit: startEdit,
    elSettings: (el: CanvasElement) => setSettingsEl(el.id),
    /**
     * The pad hands you a note; the marker hands you the pen in its colour.
     * Both were pictures of stationery until now.
     */
    artUse: (el: CanvasElement, art: string) => {
      if (art === 'sticky-stack') {
        dropNode('note', { x: el.x + el.w + 26, y: el.y }, { color: NOTE_PALETTE[0], text: '' });
        setToast('Note taken from the pad');
        return;
      }
      if (art === 'marker') {
        setPenStyle(p => ({ ...p, color: el.color || '#dc2626' }));
        setTool('pen');
        setToast('Pen picked up');
      }
    },
    elDelete: (id: string) => deleteCanvasElement(id),
    elColor: (e: React.MouseEvent, id: string) => setColorPicker({ x: e.clientX, y: e.clientY, kind: 'element', ids: [id] }),
    elPatch: (id: string, patch: Partial<CanvasElement>) => updateCanvasElement(id, patch),
    elThumbs: (id: string, d: number) => bumpThumbs('element', [id], d),
    elThumbsDown: (id: string, d: number) => bumpThumbs('element', [id], d, 'down'),
    editChange: setEditText, editCommit: commitEdit, editCancel: () => setEditingEl(null),
    resizeDown: onResizePointerDown, resizeMove: onResizePointerMove, resizeUp: onResizePointerUp,
    openBin: (k: BinKind) => setOpenBin(k),
    binCount,
  };

  /**
   * Make room on one side by moving everything else away from it.
   *
   * The origin stays at 0,0 — see `boardExpand.ts` for why that matters — so
   * "room above" is every job and node moving DOWN by a screenful. The view
   * follows by the same amount, so the work stays under your eyes rather than
   * appearing to jump.
   */
  function makeRoom(side: Side, remember: boolean) {
    if (!currentUser) { setAskRoom(null); return; }
    const vp = viewportRef.current;
    const amount = roomFor(
      side === 'top' ? (vp?.clientHeight ?? 800) : (vp?.clientWidth ?? 1200), zoom);
    const shift = shiftFor(side, amount);

    shiftJobs(jobs, shift, activeBoardView).forEach(({ id, x, y }) => {
      const job = apartments.find(a => a.id === id);
      if (activeBoardView) {
        updateApartment(id, {
          viewPos: { ...(job?.viewPos ?? {}), [activeBoardView]: { x, y } },
        }, currentUser);
      } else {
        updateApartment(id, { canvasX: x, canvasY: y }, currentUser);
      }
    });
    shiftNodes(onThisBoard, shift).forEach(({ id, x, y }) => updateCanvasElement(id, { x, y }));

    setPan(p => clampPanRef.current({
      x: p.x - shift.dx * zoom,
      y: p.y - shift.dy * zoom,
    }));
    if (remember) {
      setBoardSetting('expand', { ...(projectBoard.expand ?? {}), [side]: true });
    }
    setAskRoom(null);
    setToast(side === 'top' ? 'Room made above' : 'Room made on the left');
  }

  const totalSelected = selectedJobIds.size + selectedElIds.size;

  // ── Redirect guard ──
  // Deliberately AFTER every hook, including the ones inside the wheel, keyboard
  // and touch effects below. Returning earlier changed the hook count between
  // renders whenever the workspace switched while this page was mounted.
  if (currentProjectId !== 'general') return <Navigate to="/project" replace />;

  /**
   * On the canvas the header FLOATS on the board; in stage view it does not.
   *
   * A solid white strip across the top cut the board off below it, so the
   * controls read as a separate chrome bar rather than as tools sitting on the
   * work. Floating it lets the paper run to the top of the window and puts the
   * buttons on the board, the way a drawing program does.
   *
   * Stage view is an ordinary scrolling list of columns, and a floating bar
   * over a list covers its first row — so there it stays in the flow.
   */
  const floatingHeader = viewMode !== 'stages';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50 relative">
      {/* ── Header ── */}
      <div ref={headerBarRef} className={`flex items-center justify-between px-2 md:px-5 py-2 md:py-3 flex-shrink-0 gap-2 ${
        floatingHeader
          // pointer-events-none on the strip, auto on the groups: the gaps
          // between the buttons stay board, so a drag started in the middle of
          // the bar pans rather than hitting an invisible wall.
          ? 'absolute top-0 inset-x-0 z-30 pointer-events-none'
          : 'border-b border-gray-200 bg-white'
      }`}>
        <div className={`flex items-center gap-2 md:gap-3 min-w-0 ${
          floatingHeader ? 'pointer-events-auto rounded-2xl bg-white/75 backdrop-blur-sm px-2.5 py-1.5 shadow-sm' : ''
        }`}>
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
        <div className={`flex items-center gap-2 ${
          floatingHeader ? 'pointer-events-auto rounded-2xl bg-white/75 backdrop-blur-sm px-2 py-1 shadow-sm' : ''
        }`}>
          <button
            onClick={() => setSearchOpen(true)}
            title="Find a job — including anything filed into a group (⌘F)"
            className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:border-gray-300"
          >
            <Search size={15} /> <span className="hidden md:inline">Find</span>
          </button>

          {/* What the TV is showing, shaded onto the board.
              The region is chosen on a small map in settings, which tells you
              the numbers but not what they mean out on the real board — this
              lays the answer over the actual work. */}
          <button
            data-show-tv
            onClick={() => setShowTvRegion(v => !v)}
            title="Shade the part of the board the TV is showing"
            className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-xl text-sm font-medium border transition-colors"
            style={showTvRegion
              ? { backgroundColor: 'rgba(22,163,74,.12)', borderColor: '#16a34a', color: '#15803d' }
              : { borderColor: '#e5e7eb', color: '#4b5563' }}
          >
            <TvIcon size={15} /> <span className="hidden md:inline">TV</span>
          </button>

          {/* Zoom, where it can be reached without hunting the corner. The
              percentage is typeable — "150" is faster than five clicks. */}
          <div className="hidden sm:flex items-center rounded-xl border border-gray-200 overflow-hidden">
            <button onClick={() => zoomCentre(-1)} title="Zoom out"
              className="w-8 h-9 text-gray-500 hover:bg-gray-50 text-base font-bold">−</button>
            <input
              value={zoomField}
              onChange={e => setZoomField(e.target.value.replace(/[^\d]/g, ''))}
              onBlur={commitZoomField}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-11 h-9 text-center text-[12px] font-bold text-gray-700 tabular-nums outline-none"
              title="Type a zoom level"
            />
            <span className="text-[11px] text-gray-400 pr-1.5 -ml-1">%</span>
            <button onClick={() => zoomCentre(1)} title="Zoom in"
              className="w-8 h-9 text-gray-500 hover:bg-gray-50 text-base font-bold">+</button>
            <span className="w-px h-5 bg-gray-200" />
            <button onClick={() => { setZoom(1); setPan(clampPanRef.current({ x: 0, y: 0 })); }}
              title="Back to 100%"
              className="px-2.5 h-9 text-[11px] font-bold text-gray-500 hover:bg-gray-50">100%</button>
            <button onClick={zoomToFit} title="Fit the whole board"
              className="px-2.5 h-9 text-[11px] font-bold text-gray-500 hover:bg-gray-50">Fit</button>
          </div>

          {/* Which board — between the zoom and the Board/Stages toggle. */}
          <BoardViewPicker />
          <div className="w-px h-6 bg-gray-200" />

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
                className={`pick flex items-center gap-1.5 px-2.5 md:px-3 py-2 text-sm font-medium ${viewMode === id ? 'pick-on' : ''}`}
                style={{ ['--pick-fill' as string]: '#1e3a5f', color: viewMode === id ? '#fff' : '#64748b' }}
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
        className="flex-1 min-h-0 relative overflow-hidden board-pan"
        style={{
          // A hand over empty board, because a drag there pans. Over a tile the
          // node's own class flips it to a grab, since a drag there moves the
          // tile — the cursor says which of the two you are about to get.
          cursor: panning ? 'grabbing'
            : drawMode || eraseMode || arrowFrom ? 'crosshair'
            : 'grab',
          touchAction: 'none',
        }}
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={onViewportPointerUp}
        onPointerCancel={onViewportPointerUp}
      >
        {/* The rail makes things. On a board you can only look at, it would
            offer a dozen actions that all silently fail. */}
        {viewOnlyBoard ? (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5
                          px-3 py-1.5 rounded-full text-[12px] font-semibold shadow-sm"
            style={{ backgroundColor: 'rgba(245,158,11,.14)', color: '#b45309',
                     border: '1px solid rgba(245,158,11,.35)' }}>
            <Eye size={13} /> View only — this board is shared with you to look at
          </div>
        ) : (
        <BoardToolbar
          setup={projectBoard.toolbar}
          onPickWidget={id => { const d = WIDGETS.find(w => w.id === id); if (d) placeWidget(d); }}
          active={tool}
          onPick={handleToolPick}
          onFit={zoomToFit}
          onOpenStore={() => setStoreOpen(true)}
          onToggleMap={() => setBoardSetting('showMinimap', !(projectBoard.showMinimap ?? false))}
          onPenOptions={(tool, x, y) => { setTool(tool); setPenOpts({ tool, x, y }); }}
          mapOn={projectBoard.showMinimap ?? false}
          controlsOpen={showControls}
          onToggleControls={() => setBoardSetting('showControls', !showControls)}
          onToggleSettings={() => setBoardSettingsOpen(v => !v)}
        />
        )}
        {showControls && <BoardControlsPanel />}

        {arrowFrom && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-full text-[11.5px] font-bold shadow-lg"
            style={{ backgroundColor: '#1e3a5f', color: '#fff' }}>
            Click what the arrow points to · Esc to cancel
          </div>
        )}

        {/* An armed mode says so. The pen and the highlighter light up on the
            rail; the eraser has no button of its own, so this is where it
            shows — and it is the way back out of the mode as well as Escape. */}
        {eraseMode && (
          <button
            onClick={() => setEraser(v => ({ ...v, on: false }))}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5
                       px-3 py-1.5 rounded-full text-[11.5px] font-bold shadow-lg"
            style={{ backgroundColor: '#1e3a5f', color: '#fff' }}>
            <Eraser size={13} />
            {eraser.whole ? 'Eraser — whole marks' : 'Eraser — rub out'} · click here or Esc to stop
          </button>
        )}

        {boardSettingsOpen && (
          <MovablePanel
            id="board-settings"
            title="board settings"
            onClose={() => setBoardSettingsOpen(false)}
            className="absolute right-[86px] z-40 w-[236px] bg-white border border-gray-200 rounded-xl shadow-lg p-3"
            style={{ top: showControls ? 236 : 12 }}>
            <div className="flex items-center gap-2 mb-2 pl-4">
              <span className="text-[10px] font-extrabold text-gray-700 tracking-wide">BOARD SETTINGS</span>
              <button onClick={() => setBoardSettingsOpen(false)}
                className="ml-auto text-gray-300 hover:text-gray-500"><X size={13} /></button>
            </div>

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

            {/* Lining up with what is already there is always on and draws its
                own lines. This is the extra: a 22px lattice to land on when
                there is nothing nearby to line up with. */}
            <label className="flex items-center gap-2 text-[10px] text-gray-600 font-semibold mb-0.5">
              <input type="checkbox" className="rounded"
                checked={projectBoard.snapToGrid ?? false}
                onChange={e => setBoardSetting('snapToGrid', e.target.checked)} />
              Snap to grid as well
            </label>
            <p className="text-[9px] text-gray-400 leading-snug mb-2">
              Things always line up with their neighbours, and the lines show why. This adds the
              22px grid for when there is nothing beside them.
            </p>

            {/* Per machine on purpose — a synced default would push one
                person's screen onto everybody else's monitor. */}
            <div className="mb-2">
              <span className="block text-[10px] font-bold text-gray-500 mb-1">
                Opens at (this computer)
              </span>
              <div className="flex items-center gap-1.5">
                <select
                  value={String(Number(localStorage.getItem(defaultZoomKey)) || '')}
                  onChange={e => {
                    const v = e.target.value;
                    if (v) localStorage.setItem(defaultZoomKey, v);
                    else localStorage.removeItem(defaultZoomKey);
                    if (v) { setZoom(Number(v)); setPan(pp => clampPanRef.current(pp, Number(v))); }
                  }}
                  className="flex-1 text-[10.5px] border border-gray-200 rounded-lg px-1.5 py-1 bg-white">
                  <option value="">100% (the usual)</option>
                  {[0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2].map(z => (
                    <option key={z} value={z}>{Math.round(z * 100)}%</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    localStorage.setItem(defaultZoomKey, String(zoom));
                    setToast(`The board will open at ${Math.round(zoom * 100)}%`);
                  }}
                  title="Save the current zoom as this computer's starting zoom"
                  className="text-[9.5px] font-bold px-1.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:text-[#1e3a5f]">
                  use now
                </button>
              </div>
            </div>

            {/*
              Which sides may grow.

              Down and right are on because that is how the board has always
              worked. Up and left move everything already placed, so they start
              off and dragging a node against that edge asks — turning one on
              here is the same as answering "and stop asking".
            */}
            <div className="mb-2">
              <span className="block text-[10px] font-bold text-gray-500 mb-1">Let the board grow</span>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {([
                  ['top', 'Upwards'],
                  ['bottom', 'Downwards'],
                  ['left', 'To the left'],
                  ['right', 'To the right'],
                ] as const).map(([side, label]) => (
                  <label key={side} className="flex items-center gap-1.5 text-[10px] text-gray-600">
                    <input type="checkbox" className="rounded"
                      checked={sideAllowed(projectBoard.expand, side)}
                      onChange={e => setBoardSetting('expand', {
                        ...(projectBoard.expand ?? {}), [side]: e.target.checked,
                      })} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <button
              onClick={() => { setLayoutPanel(true); setBoardSettingsOpen(false); }}
              className="w-full flex items-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold text-gray-600 border border-gray-200 hover:bg-gray-50 justify-center">
              <History size={12} /> Layout history
            </button>
          </MovablePanel>
        )}

        {/* Board layout history.
            Positions only, and a preview of every snapshot before anything is
            restored — so pressing Restore can never be a surprise, and can
            never bring back or remove a job. */}
        {layoutPanel && (
          <MovablePanel
            id="layout-history"
            title="layout history"
            onClose={() => setLayoutPanel(false)}
            className="absolute right-[86px] z-40 w-[252px] bg-white border border-gray-200 rounded-xl shadow-lg p-3"
            style={{ top: showControls ? 236 : 12, maxHeight: '70%', overflowY: 'auto' }}>
            <div className="flex items-center gap-2 mb-2 pl-4">
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
          </MovablePanel>
        )}

        {/* View-space overlays: pinned titles hold a fixed screen Y, so they must
            live OUTSIDE the transformed world layer or lasso hit-testing (which
            works in world space) would select a title that is visually elsewhere. */}
        <PinnedTitleLayer elements={canvasElements} zoom={zoom} panX={pan.x} onEdit={startEdit} />

        <MiniMap
          force={projectBoard.showMinimap}
          jobs={jobs}
          /*
            The nodes on THIS board, not every node in the workspace.
            It was handed the whole `canvasElements` list, so the overview drew
            every widget from every named board and everything filed inside
            every group — a crowd that was never on the board you were looking
            at. Deleting one of yours left all of those still sitting there,
            which reads exactly as "the map does not update".
          */
          elements={onThisBoard}
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
            // Through the clamp, like every other pan. This was the one caller
            // that set the pan raw, which is why dragging the minimap's square
            // to an edge slid the view off the board surface and showed the
            // page behind it.
            setPan(clampPanRef.current({
              x: vp.clientWidth / 2 - wx * zoom,
              y: vp.clientHeight / 2 - wy * zoom,
            }));
          }}
        />

        {/* What the TV is showing, laid over the real board.
            Inside the world layer, so it pans and zooms with the work — a
            rectangle drawn in screen space would drift off the jobs it is
            supposed to be describing the moment anybody moved. */}
        {showTvRegion && tvRegion && (
          <div
            data-tv-overlay
            className="absolute pointer-events-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              left: 0, top: 0, width: 1, height: 1,
              zIndex: 40,
            }}
          >
            <div className="absolute"
              style={{
                left: tvRegion.x, top: tvRegion.y, width: tvRegion.w, height: tvRegion.h,
                backgroundColor: 'rgba(22,163,74,.14)',
                border: '2px solid rgba(22,163,74,.85)',
                borderRadius: 4,
              }}>
              <span className="absolute -top-6 left-0 px-2 py-0.5 rounded-md text-[11px] font-bold text-white whitespace-nowrap"
                style={{ backgroundColor: '#16a34a' }}>
                On the TV
              </span>
            </div>
          </div>
        )}

        {/* The lines that explain a snap, while it is happening.
            Held at a constant SCREEN thickness — a world-space width would be a
            hairline at 25% and a bar at 300%, and this is a ruler, not part of
            the drawing. The pale halo is what keeps it readable over a white
            tile and a dark widget alike. */}
        {guides.length > 0 && (
          <div className="absolute pointer-events-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0', left: 0, top: 0, width: 1, height: 1, zIndex: 45,
            }}>
            {guides.map((g, i) => (
              <div key={i} data-snap-guide className="absolute"
                style={{
                  backgroundColor: '#e11d48',
                  boxShadow: `0 0 0 ${1 / zoom}px rgba(255,255,255,.75)`,
                  ...(g.axis === 'x'
                    ? { left: g.at, top: g.from, width: 1.5 / zoom, height: g.to - g.from }
                    : { left: g.from, top: g.at, height: 1.5 / zoom, width: g.to - g.from }),
                }} />
            ))}
          </div>
        )}

        {/* The paper, drawn in SCREEN space under everything.
            It used to live inside the world, so it was scaled with it: at 25%
            a 22px dot grid landed 5px apart and turned to fog, and further out
            there was nothing at all — the board stopped feeling like a board
            exactly when being lost was easiest. Here the spacing is stepped by
            powers of two to stay legible at any zoom, and offset by the pan so
            it still travels with the work. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: (theme.surface as { backgroundColor?: string }).backgroundColor,
            ...surfaceAtZoom(theme.surface, zoom, pan),
          }}
        />

        <div
          className="absolute top-0 left-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            // Only while travelling to a search result. A permanent transition
            // would put a lag on every pan and drag.
            transition: flying ? 'transform 600ms cubic-bezier(.22,.9,.28,1)' : undefined,
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
              // The paper is painted by the screen-space layer above; painting
              // it here as well would show a second, zoomed copy through it.
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
            {/* The ink on THIS board, minus the drawings that are nodes — those
                draw inside their own node so they can be carried and resized.
                The filter used to be `!e.board`, which drew the main board's
                strokes on every named board and would have lost a named board's
                own the moment strokes started carrying one. */}
            <StrokeLayer elements={onThisBoard.filter(e => !isDrawingNode(e))} />
            {drawing && drawing.pts.length > 1 && (
              <svg className="absolute inset-0 pointer-events-none z-30" style={{ overflow: 'visible' }}>
                <polyline
                  points={drawing.pts.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={drawing.marker ? markStyle.color : penStyle.color}
                  strokeWidth={drawing.marker ? markStyle.width : penStyle.width}
                  strokeDasharray={nibDash(drawing.marker ? markStyle.nib : penStyle.nib,
                    drawing.marker ? markStyle.width : penStyle.width)}
                  strokeLinecap="round" strokeLinejoin="round"
                  opacity={drawing.marker ? 0.45 : 1}
                />
              </svg>
            )}
            <ArrowLayer
              elements={canvasElements}
              hosts={hostBoxes}
              selectedIds={selectedElIds}
              onSelect={el => setSelectedElIds(new Set([el.id]))}
              onDelete={id => { deleteCanvasElement(id); setToast('Arrow removed'); }}
              onSettings={(el, at) => setArrowStyle({ id: el.id, x: at.x, y: at.y })}
            />
            <AttachedArtLayer
              elements={canvasElements}
              hosts={hostBoxes}
              selectedIds={selectedElIds}
              onSelect={el => setSelectedElIds(new Set([el.id]))}
              onGrab={(e, el) => onElPointerDown(e, el)}
              onMenu={(e, el) => onElContextMenu(e, el)}
              onDetach={id => {
                const el = canvasElements.find(x => x.id === id);
                const host = el?.attachedTo ? hostBoxes.get(el.attachedTo) : null;
                const b = el && host ? attachBox(host, el) : null;
                updateCanvasElement(id, {
                  attachedTo: undefined, attachAnchor: undefined, attachAt: undefined,
                  ...(b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) } : {}),
                });
                setToast('Unstuck');
              }}
              onDelete={id => deleteCanvasElement(id)}
            />
            {/* Where it would land, while it is on its way there. */}
            {attachHint && (
              <AnchorHints host={hostBoxes.get(attachHint.hostId) ?? null} active={attachHint.anchor} />
            )}
            {arrowFrom && (
              <ArrowDraft from={hostBoxes.get(arrowFrom) ?? null} to={arrowTip} />
            )}

            {onThisBoard.map(el => {
              if (el.board && el.board !== activeBoardView) return null;   // filed in a group
              // Ink laid over something stays ink and is drawn by the layer; a
              // drawing that stands on its own is a node like any other.
              if (el.type === 'stroke' && !isDrawingNode(el)) return null;
              if (el.type === 'arrow') return null;          // its own layer
              if (el.attachedTo) return null;                // drawn on its host
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
                  onUploadAudio={uploadAudio}
                />
              );
            })}
            {/* ── Ghost appearances ──
                The SAME job drawn a second time. One record, several places, so
                an edit through a ghost is an edit to the job. */}
            {jobs.flatMap(job => (job.ghosts ?? []).map((g, gi) => {
              const p = ghostPos(job.id, gi, g);
              return (
                <JobTile
                  key={`${job.id}-ghost-${gi}`}
                  job={job} index={gi} ghostIndex={gi}
                  x={p.x} y={p.y} w={TILE_W} h={TILE_H}
                  stage={job.currentStageId ? stageMap.get(job.currentStageId) ?? null : null}
                  pendingTasks={pendingByJob.get(job.id) ?? 0}
                  isSelected={false}
                  isDragging={!!ghostDrag && ghostDrag.jobId === job.id && ghostDrag.index === gi && ghostDrag.moved}
                  justChanged={false}
                  searchLit={false}
                  fallbackBorder={(TILE_PALETTE.find(pp => pp.bg === job.tileColor) ?? TILE_PALETTE[0]).border}
                  lastEdited={relativeTime(job.contentUpdatedAt ?? job.updatedAt)}
                  labels={tileLabels}
                  H={H}
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
                  translucent={drag?.kind === 'job' && drag.ids.includes(job.id) && drag.moved
                    && !!drag.overDrop}
                  justChanged={!!changedAt && pulseNow - new Date(changedAt).getTime() < 25_000}
                  searchLit={searchHit === job.id}
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
                <button onClick={() => startArrow(ctxMenu.ids[0])}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                  title="Then click what it points to">
                  <MoveUpRight size={14} className="text-gray-400" /> Draw an arrow from here
                </button>
                <button onClick={() => handleCreateGhost(ctxMenu.ids)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                  title="Show this same job in another place">
                  <Ghost size={14} className="text-gray-400" />
                  {ctxMenu.ids.length > 1 ? `Create ghosts (${ctxMenu.ids.length})` : 'Create ghost'}
                </button>
                <button onClick={() => bumpThumbs('job', ctxMenu.ids, 1)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <ThumbsUp size={14} className="text-emerald-500" /> Thumbs up
                </button>
                <button onClick={() => bumpThumbs('job', ctxMenu.ids, 1, 'down')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <ThumbsDown size={14} className="text-rose-500" /> Thumbs down
                </button>
                {(() => {
                  const anyHidden = ctxMenu.ids.some(id => apartments.find(a => a.id === id)?.showOnTv === false);
                  return (
                    <button onClick={() => {
                      if (currentUser) ctxMenu.ids.forEach(id =>
                        updateApartment(id, { showOnTv: anyHidden ? undefined : false }, currentUser));
                      setCtxMenu(null);
                    }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                      <TvIcon size={14} hidden={!anyHidden} />
                      {anyHidden ? 'Show on the TV' : 'Hide from the TV'}
                    </button>
                  );
                })()}
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

                {/* Straight to the drawing, without opening the job first —
                    the architects do this far more often than anything else
                    in this menu. Only offered when there is a folder to open. */}
                {ctxMenu.ids.length === 1
                  && apartments.find(a => a.id === ctxMenu.ids[0])?.driveLink && (
                  <DriveDesktopPath
                    variant="row"
                    driveLink={apartments.find(a => a.id === ctxMenu.ids[0])!.driveLink!}
                    onToast={msg => setToast(msg)}
                    onDone={() => setCtxMenu(null)}
                  />
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
                {binNodes.map(b => {
                  const k = binKeyOf(b);
                  return (
                    <button key={b.id}
                      onClick={() => {
                        fileInBin(ctxMenu.ids, k, b);
                        setSelectedJobIds(new Set());
                        setCtxMenu(null);
                      }}
                      className="w-full px-4 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                      {binLabelOf(b)}
                    </button>
                  );
                })}

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
                <button onClick={() => { setNewJobAt({ x: ctxMenu.worldX ?? 0, y: ctxMenu.worldY ?? 0 }); setShowAddModal(true); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Plus size={14} className="text-gray-400" /> Add a job here
                </button>
                <div className="h-px bg-gray-100 my-1" />
                <button onClick={() => { dropNode('note', { x: ctxMenu.worldX ?? 0, y: ctxMenu.worldY ?? 0 }, { color: NOTE_PALETTE[0], text: '' }); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <StickyNote size={14} className="text-gray-400" /> Add note here
                </button>
                <button onClick={() => { dropNode('box', { x: ctxMenu.worldX ?? 0, y: ctxMenu.worldY ?? 0 }, { color: BOX_PALETTE[0], text: 'Section' }); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Square size={14} className="text-gray-400" /> Add box here
                </button>
                <button onClick={() => { addBin(); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                  title="A named group with a board of its own">
                  <FolderPlus size={14} className="text-gray-400" /> Add a group
                </button>
                {/* The eraser's second door. Its thickness and its two kinds
                    live with the pen, which is where you are when you are
                    drawing — but right-clicking the board is where you look
                    when you are not. */}
                <button
                  onClick={() => {
                    setEraser(v => ({ ...v, on: !v.on }));
                    setTool('select');
                    setCtxMenu(null);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                  title="Right-click the Pen or Mark button for its thickness">
                  <Eraser size={14} className="text-gray-400" />
                  {eraser.on ? 'Put the eraser down' : 'Pick up the eraser'}
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
                {/* Arrange, the way Google Docs names it. Two overlapping notes
                    and no way to say which is on top was the gap. */}
                <div className="px-4 pt-1.5 pb-1 text-[10px] font-extrabold tracking-wide text-gray-400">
                  ARRANGE
                </div>
                <div className="grid grid-cols-2 gap-0.5 px-2 pb-1">
                  {([
                    ['front', 'Bring to front', BringToFront],
                    ['back', 'Send to back', SendToBack],
                    ['up', 'Forward', ChevronUp],
                    ['down', 'Backward', ChevronDown],
                  ] as const).map(([how, label, Icon]) => (
                    <button key={how}
                      onClick={() => { arrange(ctxMenu.ids, how); setCtxMenu(null); }}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[12px] text-gray-700 hover:bg-gray-50">
                      <Icon size={13} className="text-gray-400" /> {label}
                    </button>
                  ))}
                </div>
                <div className="h-px bg-gray-100 my-1" />

                {/* Settings first — for a widget or a group there is no text to
                    edit, and this menu item used to call the same dead editor
                    the pencil did. */}
                <button onClick={() => { setSettingsEl(ctxMenu.ids[0]); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Settings size={14} className="text-gray-400" /> Settings…
                </button>
                <button onClick={() => {
                    const el = canvasElements.find(e => e.id === ctxMenu.ids[0]);
                    // Only the node types that actually render an editor.
                    if (el && (el.type === 'note' || el.type === 'box' || el.type === 'title')) startEdit(el);
                    else setSettingsEl(ctxMenu.ids[0]);
                    setCtxMenu(null);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Pencil size={14} className="text-gray-400" /> Edit Text
                </button>
                <button onClick={() => startArrow(ctxMenu.ids[0])}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <MoveUpRight size={14} className="text-gray-400" /> Draw an arrow from here
                </button>
                {ctxMenu.ids.length === 1
                  && canvasElements.find(e => e.id === ctxMenu.ids[0])?.art === 'document' && (
                  <button onClick={() => {
                    const el = canvasElements.find(e => e.id === ctxMenu.ids[0]);
                    setDocUrlField(el?.docUrl ?? '');
                    setDocTarget(ctxMenu.ids[0]);
                    setCtxMenu(null);
                  }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                    <FileText size={14} className="text-gray-400" />
                    {canvasElements.find(e => e.id === ctxMenu.ids[0])?.docUrl ? 'Change the file' : 'Attach a file'}
                  </button>
                )}
                {ctxMenu.ids.length === 1 && canvasElements.find(e => e.id === ctxMenu.ids[0])?.attachedTo && (
                  <button onClick={() => {
                    updateCanvasElement(ctxMenu.ids[0], { attachedTo: undefined, attachAt: undefined });
                    setCtxMenu(null); setToast('Unstuck');
                  }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                    <Unlink size={14} className="text-gray-400" /> Take it off
                  </button>
                )}
                <button onClick={() => bumpThumbs('element', ctxMenu.ids, 1)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <ThumbsUp size={14} className="text-emerald-500" /> Thumbs up
                </button>
                <button onClick={() => bumpThumbs('element', ctxMenu.ids, 1, 'down')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <ThumbsDown size={14} className="text-rose-500" /> Thumbs down
                </button>
                {/* Clip art and pins are too small to carry the icon, so every
                    node gets the switch here whether it shows one or not. */}
                {(() => {
                  const anyHidden = ctxMenu.ids.some(id =>
                    canvasElements.find(e => e.id === id)?.showOnTv === false);
                  return (
                    <button onClick={() => {
                      ctxMenu.ids.forEach(id => updateCanvasElement(id, { showOnTv: anyHidden ? undefined : false }));
                      setCtxMenu(null);
                    }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                      <TvIcon size={14} hidden={!anyHidden} />
                      {anyHidden ? 'Show on the TV' : 'Hide from the TV'}
                    </button>
                  );
                })()}
                <button onClick={() => { setColorPicker({ x: ctxMenu.x + 170, y: ctxMenu.y, kind: 'element', ids: ctxMenu.ids }); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Palette size={14} className="text-gray-400" /> Change Color
                </button>
                <button onClick={() => handleDuplicateEls(ctxMenu.ids)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Copy size={14} className="text-gray-400" />
                  {ctxMenu.ids.length > 1 ? `Duplicate (${ctxMenu.ids.length})` : 'Duplicate'}
                </button>
                {(() => {
                  const binEl = ctxMenu.ids.length === 1
                    ? canvasElements.find(e => e.id === ctxMenu.ids[0] && e.type === 'bin')
                    : undefined;
                  if (binEl) {
                    // A group you made can be removed; the four the board ships
                    // with stay, because everything files into them by default.
                    return (
                      <>
                        <div className="h-px bg-gray-100 my-1" />
                        <button onClick={() => { setOpenBin(binKeyOf(binEl)); setCtxMenu(null); }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                          <FolderOpen size={14} className="text-gray-400" /> Open this group
                        </button>
                        {isBuiltInBin(binEl) ? (
                          <div className="px-4 py-2 text-[10.5px] text-gray-400 leading-snug">
                            One of the four the board comes with, so it stays. Rename or recolour it
                            freely.
                          </div>
                        ) : (
                          <button onClick={() => { removeBin(binEl); setCtxMenu(null); }}
                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5">
                            <Trash2 size={14} /> Remove this group
                          </button>
                        )}
                      </>
                    );
                  }
                  return (
                    <>
                      <div className="h-px bg-gray-100 my-1" />
                      <button onClick={() => handleDeleteEls(ctxMenu.ids)}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5">
                        <Trash2 size={14} />
                        {ctxMenu.ids.length > 1 ? `Delete (${ctxMenu.ids.length})` : 'Delete'}
                      </button>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Pen & marker settings ── */}
      {penOpts && (() => {
        const isMark = penOpts.tool === 'highlighter';
        const cur = isMark ? markStyle : penStyle;
        const setCur = (p: Partial<typeof cur>) =>
          (isMark ? setMarkStyle : setPenStyle)(v => ({ ...v, ...p }));
        const COLORS = isMark
          ? ['#facc15', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74', '#c4b5fd']
          : ['#1e3a5f', '#dc2626', '#16a34a', '#2563eb', '#d97706', '#0f172a'];
        const WIDTHS = isMark ? [10, 16, 26, 38] : [1.5, 3, 6, 10];
        const NIBS: { id: StrokeNib; label: string }[] = isMark
          ? [{ id: 'chisel', label: 'Chisel' }, { id: 'round', label: 'Round' }, { id: 'soft', label: 'Soft' }]
          : [{ id: 'round', label: 'Round' }, { id: 'chisel', label: 'Chisel' },
             { id: 'dashed', label: 'Dashed' }, { id: 'dotted', label: 'Dotted' }];
        const ERASER_WIDTHS = [14, 26, 44, 70];
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPenOpts(null)} />
            <MovablePanel
              id="pen-options"
              title="the pen options"
              onClose={() => setPenOpts(null)}
              className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-3 w-[210px]"
              style={{ left: Math.min(penOpts.x, window.innerWidth - 226), top: Math.min(penOpts.y, window.innerHeight - 340) }}>
              <div className="text-[10px] font-extrabold text-gray-700 mb-2 tracking-wide pl-4">
                {isMark ? 'HIGHLIGHTER' : 'PEN'}
              </div>
              <div className="flex gap-1.5 mb-3">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setCur({ color: c })}
                    className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: c, borderColor: cur.color === c ? '#1e3a5f' : 'rgba(0,0,0,.12)' }} />
                ))}
              </div>
              <div className="text-[9.5px] font-bold text-gray-500 mb-1">Thickness</div>
              <div className="flex items-center gap-2">
                {WIDTHS.map(w => (
                  <button key={w} onClick={() => setCur({ width: w })}
                    className="flex-1 h-8 rounded-lg flex items-center justify-center transition-colors"
                    style={{ backgroundColor: cur.width === w ? 'rgba(30,58,95,.08)' : '#f8fafc' }}>
                    <span className="rounded-full block"
                      style={{ width: Math.min(w, 22), height: Math.min(w, 22), backgroundColor: cur.color,
                               opacity: isMark ? 0.55 : 1 }} />
                  </button>
                ))}
              </div>
              <div className="text-[9.5px] font-bold text-gray-500 mt-3 mb-1">Nib</div>
              <div className="grid grid-cols-2 gap-1">
                {NIBS.map(n => (
                  <button key={n.id} onClick={() => setCur({ nib: n.id })}
                    className="px-2 py-1.5 rounded-lg text-[10.5px] font-bold transition-colors"
                    style={cur.nib === n.id
                      ? { backgroundColor: '#1e3a5f', color: '#fff' }
                      : { backgroundColor: '#f8fafc', color: '#64748b' }}>
                    {n.label}
                  </button>
                ))}
              </div>
              <p className="text-[9.5px] text-gray-400 mt-2 leading-snug">
                Draw anywhere, tiles included. A drawing that lands in clear space becomes a thing of
                its own you can move and resize.
              </p>

              {/*
                The eraser lives with the pen, because that is where you are
                when you want it. Two of them, as in the plan editor: rubbing
                out takes a piece out of a drawing and keeps what is left either
                side, the whole mark takes the lot. Neither has a colour — an
                eraser that paints is a pen.
              */}
              <div className="h-px bg-gray-100 my-2.5" />
              <button
                onClick={() => { setEraser(v => ({ ...v, on: !v.on })); setTool('select'); }}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors"
                style={eraser.on
                  ? { backgroundColor: '#1e3a5f', color: '#fff' }
                  : { backgroundColor: '#f8fafc', color: '#64748b' }}>
                <Eraser size={13} /> {eraser.on ? 'Eraser is up — click to put it down' : 'Pick up the eraser'}
              </button>

              <div className="text-[9.5px] font-bold text-gray-500 mt-2.5 mb-1">Eraser thickness</div>
              <div className="flex items-center gap-2">
                {ERASER_WIDTHS.map(w => (
                  <button key={w} onClick={() => setEraser(v => ({ ...v, width: w, on: true }))}
                    title={`${w}px across`}
                    className="flex-1 h-8 rounded-lg flex items-center justify-center transition-colors"
                    style={{ backgroundColor: eraser.width === w ? 'rgba(30,58,95,.08)' : '#f8fafc' }}>
                    <span className="rounded-full block border border-gray-300"
                      style={{ width: Math.min(w / 2.6, 22), height: Math.min(w / 2.6, 22),
                               backgroundColor: '#fff' }} />
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-1 mt-2">
                {([[false, 'Rub out'], [true, 'Whole mark']] as const).map(([whole, label]) => (
                  <button key={label} onClick={() => setEraser(v => ({ ...v, whole, on: true }))}
                    title={whole
                      ? 'Touch a drawing and the whole of it goes'
                      : 'Takes a piece out and keeps what is left either side'}
                    className="px-2 py-1.5 rounded-lg text-[10.5px] font-bold transition-colors"
                    style={eraser.whole === whole
                      ? { backgroundColor: '#1e3a5f', color: '#fff' }
                      : { backgroundColor: '#f8fafc', color: '#64748b' }}>
                    {label}
                  </button>
                ))}
              </div>
            </MovablePanel>
          </>
        );
      })()}

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
                Picture of the board
              </button>
            </div>
            {/* A picture of the board is for the wall. This is for the clipboard:
                the same jobs as rows you can read, tick and hand to somebody. */}
            <button
              onClick={() => { setExportMenu(false); printJobList(); }}
              className="w-full mt-2 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1.5">
              <Printer size={14} /> Job list to print
            </button>
          </div>
        </>
      )}

      {/* ── Attach a file to a document piece ── */}
      {docTarget && (() => {
        const el = canvasElements.find(e => e.id === docTarget);
        if (!el) return null;
        const save = (url: string, name: string) => {
          // Keep whatever extension we can find, because the icon shows the file
          // TYPE across its face — a Drive link with no name would otherwise be
          // another anonymous grey page.
          const fromUrl = url.split(/[?#]/)[0].split('/').pop() ?? '';
          const final = /\.[a-z0-9]{1,5}$/i.test(name) ? name
            : /\.[a-z0-9]{1,5}$/i.test(fromUrl) ? decodeURIComponent(fromUrl)
            : name;
          updateCanvasElement(docTarget, { docUrl: url, docName: final });
          setDocTarget(null);
          setToast('File attached');
        };
        return (
          <>
            <div className="fixed inset-0 bg-black/40 z-[70]" onClick={() => setDocTarget(null)} />
            <div className="fixed z-[80] bg-white rounded-2xl shadow-2xl p-5"
              style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(440px, 94vw)' }}>
              <h3 className="text-base font-bold text-gray-900 mb-1">Attach a file</h3>
              <p className="text-xs text-gray-500 mb-4">
                Clicking the document on the board opens it. A Drive link is best — it stays where the
                rest of the job's files live and everyone can reach it.
              </p>

              <label className="block text-xs font-semibold text-gray-600 mb-1">Link</label>
              <div className="flex gap-2 mb-3">
                <input
                  autoFocus
                  value={docUrlField}
                  onChange={e => setDocUrlField(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && docUrlField.trim()) save(docUrlField.trim(), el.docName || 'Document'); }}
                  placeholder="https://drive.google.com/…"
                  className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                />
                <button
                  onClick={() => docUrlField.trim() && save(docUrlField.trim(), el.docName || 'Document')}
                  disabled={!docUrlField.trim()}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}>
                  Save
                </button>
              </div>

              <label className="block text-xs font-semibold text-gray-600 mb-1">Name on the board</label>
              <input
                value={el.docName ?? ''}
                onChange={e => updateCanvasElement(docTarget, { docName: e.target.value })}
                placeholder="Riser diagram"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
              />

              <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                <input ref={docFileRef} type="file" className="hidden"
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = '';
                    if (!f) return;
                    setToast('Uploading…');
                    const url = await storeDocument(f);
                    if (url) save(url, f.name);
                    else setToast('Set up the Drive folder in App settings to upload files');
                  }} />
                <button onClick={() => docFileRef.current?.click()}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  Upload a file instead
                </button>
                <span className="flex-1" />
                {el.docUrl && (
                  <button onClick={() => { updateCanvasElement(docTarget, { docUrl: undefined, docName: undefined }); setDocTarget(null); }}
                    className="text-sm font-semibold text-red-600">Take it off</button>
                )}
                <button onClick={() => setDocTarget(null)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600">Close</button>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Title editor ── */}
      {titleEdit && (() => {
        const el = canvasElements.find(e => e.id === titleEdit);
        if (!el) return null;
        return (
          <TitleEditor
            el={el}
            onChange={patch => updateCanvasElement(el.id, patch)}
            onClose={() => setTitleEdit(null)}
            onDelete={() => { deleteCanvasElement(el.id); setTitleEdit(null); }}
          />
        );
      })()}

      {/* ── Widget store ── */}
      {storeOpen && <WidgetStore onPick={placeWidget} onClose={() => setStoreOpen(false)} />}

      {/* ── A group, opened as its own board ── */}
      {widgetList && (
        <WidgetListPopup
          title={widgetList.title}
          jobIds={widgetList.jobIds}
          onOpenJob={id => openJobRef.current(id)}
          onClose={() => setWidgetList(null)}
        />
      )}

      {openBin && (() => {
        const el = binNodes.find(b => binKeyOf(b) === openBin);
        if (!el) return null;
        return (
          <BinBoard
            bin={el}
            highlightJobId={searchHit}
            onClose={() => setOpenBin(null)}
            onOpenJob={j => setSelectedJob(j)}
            onRestored={ids => {
              // The landing is SEEN: close the window, pulse the returned job
              // where it now stands on the board.
              setOpenBin(null);
              setSearchHit(ids[0]);
              setTimeout(() => setSearchHit(null), 2600);
            }}
          />
        );
      })()}

      {/* ── Search ── */}
      {searchOpen && (
        <BoardSearch
          jobs={apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed)}
          bins={binNodes}
          nodes={canvasElements.filter(e => e.type !== 'bin' && e.type !== 'stroke' && e.type !== 'arrow')}
          stages={stages}
          assignments={contractorAssignments}
          onGo={goToHit}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* ── Color picker popup ── */}
      {/* The panel the pencil opens. Every node type has one. */}
      {settingsEl && (() => {
        const el = canvasElements.find(e => e.id === settingsEl);
        if (!el) return null;
        return (
          <NodeSettings
            el={el}
            onClose={() => setSettingsEl(null)}
            onDelete={id => deleteCanvasElement(id)}
          />
        );
      })()}

      {/* An arrow's own look — thickness, style, colour — reached from the arrow
          rather than from a menu three levels away. */}
      {arrowStyle && (() => {
        const el = canvasElements.find(e => e.id === arrowStyle.id);
        if (!el) return null;
        const set = (patch: Partial<CanvasElement>) => updateCanvasElement(el.id, patch);
        return (
          <>
            <div className="fixed inset-0 z-[88]" onClick={() => setArrowStyle(null)} />
            <MovablePanel
              id="arrow-style"
              title="the arrow panel"
              onClose={() => setArrowStyle(null)}
              className="fixed z-[89] bg-white rounded-xl shadow-2xl border border-gray-100 p-3"
              style={{
                left: Math.min(arrowStyle.x, window.innerWidth - 250),
                top: Math.min(arrowStyle.y + 12, window.innerHeight - 230),
                width: 234,
              }}>
              <div className="text-[10px] font-extrabold tracking-wide text-gray-400 mb-2 pl-4">ARROW</div>

              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Thickness</label>
              <div className="flex items-center gap-2 mb-3">
                <input type="range" min={1} max={10} step={0.5} value={el.strokeWidth ?? 2.5}
                  onChange={e => set({ strokeWidth: Number(e.target.value) })}
                  className="flex-1 accent-[#1e3a5f]" />
                <span className="text-[11px] font-bold tabular-nums w-6">{el.strokeWidth ?? 2.5}</span>
              </div>

              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Style</label>
              <div className="grid grid-cols-3 gap-1 mb-3">
                {([['round', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']] as const).map(([nib, label]) => (
                  <button key={nib} onClick={() => set({ nib })}
                    className="py-1.5 rounded-lg text-[11px] font-semibold border transition-colors"
                    style={(el.nib ?? 'round') === nib
                      ? { backgroundColor: '#1e3a5f', color: '#fff', borderColor: '#1e3a5f' }
                      : { backgroundColor: '#fff', color: '#64748b', borderColor: '#e2e8f0' }}>
                    {label}
                  </button>
                ))}
              </div>

              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Colour</label>
              <div className="flex flex-wrap gap-1.5">
                {['#1e3a5f', '#dc2626', '#ea6b13', '#16a34a', '#0d9488', '#7c3aed', '#db2777', '#64748b'].map(col => (
                  <button key={col} onClick={() => set({ color: col })} title={col}
                    className="w-[22px] h-[22px] rounded-lg transition-transform"
                    style={{
                      backgroundColor: col,
                      border: (el.color || '#1e3a5f') === col ? '2px solid #0f172a' : '1px solid rgba(15,23,42,.14)',
                      transform: (el.color || '#1e3a5f') === col ? 'scale(1.12)' : undefined,
                    }} />
                ))}
              </div>
            </MovablePanel>
          </>
        );
      })()}

      {colorPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setColorPicker(null)} />
          <MovablePanel
            id="colour-picker"
            title="the colour picker"
            onClose={() => setColorPicker(null)}
            className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-3"
            style={{ left: Math.min(colorPicker.x, window.innerWidth - 200), top: colorPicker.y }}>
            <p className="text-[11px] font-medium text-gray-500 mb-2 pl-4">Choose color</p>
            <div className="flex flex-wrap gap-2" style={{ width: 168 }}>
              {(colorPicker.kind === 'job' ? TILE_PALETTE : (colorPicker.kind === 'element' ? (() => {
                const t = canvasElements.find(e => e.id === colorPicker.ids[0])?.type;
                if (t === 'bin') return BIN_PALETTE;
                return t === 'note' ? NOTE_PALETTE : BOX_PALETTE;
              })() : NOTE_PALETTE
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
          </MovablePanel>
        </>
      )}

      {/* Making room moves work somebody placed, so it asks. */}
      {askRoom && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(15,23,42,.45)' }}
          onClick={() => setAskRoom(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-1">
              {askRoom === 'top' ? 'Make room above?' : 'Make room on the left?'}
            </h3>
            <p className="text-xs text-gray-500 mb-4 leading-snug">
              The board grows down and to the right. To gain space {askRoom === 'top' ? 'above' : 'to the left'},
              everything already on it moves {askRoom === 'top' ? 'down' : 'right'} by a screenful — nothing is
              lost and nothing changes size.
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={() => makeRoom(askRoom, false)}
                className="w-full py-2 rounded-lg text-sm font-bold text-white"
                style={{ backgroundColor: '#1e3a5f' }}>
                Make room, just this once
              </button>
              <button onClick={() => makeRoom(askRoom, true)}
                className="w-full py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-700">
                Make room and stop asking for this side
              </button>
              <button onClick={() => setAskRoom(null)}
                className="w-full py-2 rounded-lg text-sm font-semibold text-gray-500">
                Leave it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Job modal ── */}
      {showAddModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => { setShowAddModal(false); setNewJobAt(null); }} />
          <div className="fixed z-50 bg-white rounded-2xl shadow-2xl p-6"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px, 92vw)' }}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{s.addJobBtn}</h2>
            <form onSubmit={e => {
              e.preventDefault();
              const now = new Date().toISOString();
              const id = genId('G');
              // Right-click gives an exact spot; the button falls back to a
              // free one, so two new jobs never land on top of each other.
              const pos = newJobAt
                ? { x: Math.max(0, newJobAt.x - TILE_W / 2), y: Math.max(0, newJobAt.y - TILE_H / 2) }
                : freeSpot(TILE_W, TILE_H);
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
              setShowAddModal(false); setNewJobAt(null);
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

      {/* ── The planner's three windows ─────────────────────────────────── */}
      {plannerDrop && (() => {
        const el = canvasElements.find(c => c.id === plannerDrop.cell.elId);
        const who = personOf(plannerDrop.cell.person, contractors, users);
        return (
          <PlannerTaskDialog
            job={plannerDrop.job}
            person={who}
            dayIso={plannerDrop.cell.day}
            stages={allStages.filter(st => st.projectId === 'general')}
            contractors={contractors}
            onCancel={() => setPlannerDrop(null)}
            onDone={taskId => {
              placeOnPlanner(plannerDrop.cell, [plannerDrop.job.id], taskId);
              setPlannerDrop(null);
              if (taskId) setToast('On the planner, and a task added');
            }}
          />
        );
      })()}

      {plannerRemove && (
        <PlannerRemoveDialog
          jobName={apartments.find(a => a.id === plannerRemove.entry.jobId)?.displayName || 'this job'}
          taskName={contractorAssignments.find(a => a.id === plannerRemove.entry.taskId)?.taskDescription
            || 'the task on it'}
          onCancel={() => setPlannerRemove(null)}
          onDone={alsoDelete => {
            if (alsoDelete && plannerRemove.entry.taskId) {
              deleteContractorAssignment(plannerRemove.entry.taskId);
            }
            plannerRemove.done(alsoDelete);
            setPlannerRemove(null);
          }}
        />
      )}

      {scheduleFor && (() => {
        const el = canvasElements.find(c => c.id === scheduleFor);
        if (!el) return null;
        return (
          <ScheduleWindow
            el={el}
            jobs={jobs}
            contractors={contractors}
            users={users}
            stages={allStages.filter(st => st.projectId === 'general')}
            onClose={() => setScheduleFor(null)}
            onOpenJob={id => {
              const j = apartments.find(a => a.id === id);
              if (j) { setScheduleFor(null); setSelectedJob(j); }
            }}
            onRemove={(cellKey, entryId) => {
              const data = (el.data ?? {}) as Record<string, unknown>;
              const cells = { ...((data.cells ?? {}) as Record<string, PlannerEntry[]>) };
              const left = (cells[cellKey] ?? []).filter(e => e.id !== entryId);
              if (left.length) cells[cellKey] = left; else delete cells[cellKey];
              updateCanvasElement(el.id, { data: { ...data, cells } });
            }}
          />
        );
      })()}

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
              <DeleteImpact aptIds={deleteConfirm.ids} />
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
