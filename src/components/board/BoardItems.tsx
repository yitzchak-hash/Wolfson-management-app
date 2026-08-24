import React, { useMemo } from 'react';

/**
 * Re-alpha a colour that may be hex or rgba.
 *
 * Section boxes shipped with `rgba(...,0.45)` fills and the code re-derived
 * shades by string-replacing "0.45", which broke the moment anybody picked a
 * different colour.
 */
export function withAlpha(color: string, alpha = 0.45): string {
  const a = Math.max(0, Math.min(1, alpha));
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
  if (rgba) {
    const [r, g, b] = rgba[1].split(',').map(v => parseFloat(v));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map(c => c + c).join('') : hex[1];
    return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
  }
  return color;
}
import { MapPin, ClipboardList, Trash2, Palette, Pencil, X, ThumbsUp, ThumbsDown, Ghost,
  Archive, CheckCircle2, PlayCircle, FolderOpen, Lock, Unlock, Group } from 'lucide-react';
import { Apartment, CanvasElement, Stage, BinKind, BIN_META, binKeyOf, binLabelOf } from '../../types';
import { Settings2, Mic, Crosshair } from 'lucide-react';
import { DriveIcon, ZohoIcon, PlanIcon, TvIcon } from '../ui/BrandIcons';
import { extractFileId, driveDownloadUrl } from '../../data/driveApi';

/** A Drive file link turned into a direct download, when we can read its id. */
function planDownloadUrl(link: string): string {
  const id = extractFileId(link);
  return id ? driveDownloadUrl(id) : link;
}
import { CountdownNode, StopwatchNode, ClipArtNode, VoiceMemoNode, StrokeNode, NODE_DEFAULT_SIZE } from './BoardNodes';
import { VoiceMemoPlayer } from '../ui/VoiceMemo';
import { renderWidget, WidgetCtx, WIDGET_BY_ID } from '../../data/widgets';

/**
 * The board's two repeated items, each memoised.
 *
 * They were inline in the page, which meant every pointer frame of a drag
 * re-rendered every tile, every node and every live widget on the board — 72ms
 * a move on a board of sixty jobs and thirty widgets, which is about fourteen
 * frames a second. Memoising them means a drag re-renders only what moved.
 *
 * For that to work the props must be comparable by value, so positions arrive
 * as numbers and callbacks arrive through one `handlers` object that is created
 * once and never replaced (it reads live closures through a ref).
 */

export interface BoardHandlers {
  jobDown: (e: React.PointerEvent, job: Apartment, index: number) => void;
  jobMove: (e: React.PointerEvent) => void;
  jobUp: (e: React.PointerEvent, job: Apartment) => void;
  jobMenu: (e: React.MouseEvent, job: Apartment) => void;
  /** Double-click opens it — a single click only selects. */
  jobOpen: (job: Apartment) => void;
  jobDelete: (ids: string[]) => void;
  jobTv: (job: Apartment) => void;
  /** Toggle boardLocked — a locked tile stays where it is. */
  jobLock: (job: Apartment) => void;
  /** Glide the view so this tile sits in the middle of the screen. */
  jobFocus: (job: Apartment) => void;
  /** Glide the view so this node sits in the middle of the screen. */
  elFocus: (el: CanvasElement) => void;
  /** Take THIS tile out of its invisible group, leaving the rest grouped. */
  jobUngroup: (job: Apartment) => void;
  /** Take THIS node out of its invisible group. */
  elUngroup: (el: CanvasElement) => void;
  /** A job tile resizes from its corner, like every other thing on the board. */
  jobResizeDown: (e: React.PointerEvent, job: Apartment, index: number) => void;
  jobResizeMove: (e: React.PointerEvent) => void;
  jobResizeUp: () => void;
  jobThumbs: (id: string, delta: number) => void;
  jobThumbsDown: (id: string, delta: number) => void;
  /** Ghosts use the same tile, so they need their own pointer handlers. */
  ghostDown?: (e: React.PointerEvent, job: Apartment, ghostIndex: number) => void;
  ghostMove?: (e: React.PointerEvent) => void;
  ghostUp?: (e: React.PointerEvent, job: Apartment) => void;
  ghostMenu?: (e: React.MouseEvent, job: Apartment, ghostIndex: number) => void;

  elDown: (e: React.PointerEvent, el: CanvasElement) => void;
  elMove: (e: React.PointerEvent) => void;
  /** The event is passed so a tap can be told apart from a click. */
  elUp: (el: CanvasElement, e?: React.PointerEvent) => void;
  elMenu: (e: React.MouseEvent, el: CanvasElement) => void;
  elEdit: (el: CanvasElement) => void;
  /** Clear the "just added" dot. */
  elSeen: (el: CanvasElement) => void;
  /** Opens the node's real settings panel — what the pencil should always have done. */
  elSettings: (el: CanvasElement) => void;
  elDelete: (id: string) => void;
  elColor: (e: React.MouseEvent, id: string) => void;
  elPatch: (id: string, patch: Partial<CanvasElement>) => void;
  elThumbs: (id: string, delta: number) => void;
  elThumbsDown: (id: string, delta: number) => void;
  /** A piece of clip art that is actually a tool — the pad, the marker. */
  artUse: (el: CanvasElement, art: string) => void;

  editChange: (v: string) => void;
  editCommit: () => void;
  editCancel: () => void;

  resizeDown: (e: React.PointerEvent, el: CanvasElement) => void;
  resizeMove: (e: React.PointerEvent) => void;
  resizeUp: () => void;

  openBin: (key: string) => void;
  binCount: (key: string) => number;
}

// ─── Job tile ────────────────────────────────────────────────────────────────

/**
 * How big a job tile is.
 *
 * Lives HERE, with the tile itself, so every surface that draws one agrees.
 * The group window carried its own 190×116 pair, which is why a job looked
 * like a different kind of thing depending on which window you were in.
 *
 * `tileSize` is the single answer for one job's box, used wherever a job's
 * rectangle is needed: snapping, lasso hit-testing, the world's own size, the
 * overview, the fly-to and the drag ghosts. A resized tile stores its own size;
 * everything else falls back to the shared default, so almost every record
 * stays clean. A layout GRID deliberately does not go through this, or a board
 * of resized tiles would re-flow every time one of them changed.
 */
export const TILE_W = 215;
export const TILE_H = 132;
export const tileSize = (job: { tileW?: number; tileH?: number }) => ({
  w: job.tileW ?? TILE_W,
  h: job.tileH ?? TILE_H,
});

export interface JobTileProps {
  job: Apartment;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  stage: Stage | null;
  pendingTasks: number;
  isSelected: boolean;
  isDragging: boolean;
  /**
   * Held over a drop target — a planner square, a bin — so the tile goes
   * see-through and the eye reads what is UNDER the hand instead.
   */
  translucent?: boolean;
  justChanged: boolean;
  searchLit: boolean;
  fallbackBorder: string;
  lastEdited: string;
  labels: { job: string; folder: string; plans: string };
  H: BoardHandlers;
  /**
   * A ghost is the SAME job drawn a second time, so it is the same tile.
   *
   * The first version was a separate stripped-down component — no stage badge,
   * no links, no task count, and faded to 45% — which is why a ghost looked
   * like a broken tile rather than the job it is. Passing the index here means
   * one component draws both and they cannot drift apart.
   */
  ghostIndex?: number;
  /** CUT and not yet pasted — drawn faded, "in the air". */
  faded?: boolean;
}

export const JobTile = React.memo(function JobTile({
  job, index, x, y, w, h, stage, pendingTasks, isSelected, isDragging,
  justChanged, searchLit, fallbackBorder, lastEdited, labels, H, ghostIndex, translucent, faded,
}: JobTileProps) {
  const isGhost = ghostIndex !== undefined;
  return (
    <div
      onPointerDown={e => (isGhost ? H.ghostDown!(e, job, ghostIndex!) : H.jobDown(e, job, index))}
      onPointerMove={isGhost ? H.ghostMove! : H.jobMove}
      onPointerUp={e => (isGhost ? H.ghostUp!(e, job) : H.jobUp(e, job))}
      onContextMenu={e => (isGhost ? H.ghostMenu!(e, job, ghostIndex!) : H.jobMenu(e, job))}
      onDoubleClick={() => H.jobOpen(job)}
      data-node-id={job.id}
      className={`absolute rounded-xl border px-3 pb-3 pt-[22px] group select-none ${
        job.boardLocked ? 'cursor-pointer shadow-sm hover:shadow-md' :
        isDragging ? 'shadow-2xl cursor-grabbing' :
        isSelected ? 'shadow-md cursor-grab' : 'shadow-sm hover:shadow-md cursor-grab'
      } ${justChanged && !isDragging ? 'live-change-pulse' : ''} ${searchLit ? 'search-hit' : ''}`}
      style={{
        left: x, top: y, width: w, height: h,
        touchAction: 'none',
        // `faded`: cut and waiting for its paste — visibly "in the air".
        opacity: translucent ? 0.45 : faded ? 0.35 : undefined,
        transition: 'opacity 140ms ease',
        // The stage colour is a THICK BORDER, never a fill. Flooding the tile
        // made the name, address and buttons unreadable at some stages; the
        // border carries the same information and leaves the content legible.
        backgroundColor: job.tileColor ?? '#ffffff',
        ...(job.tilePhotoUrl ? {
          backgroundImage: `linear-gradient(rgba(255,255,255,.78), rgba(255,255,255,.88)), url(${JSON.stringify(job.tilePhotoUrl)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : {}),
        border: `4px solid ${isSelected ? '#4aa8d8' : (stage?.color ?? fallbackBorder)}`,
        outline: isSelected && !isDragging ? '2px solid rgba(74,168,216,0.4)' : undefined,
        outlineOffset: '1px',
        zIndex: isDragging ? 20 : isSelected ? 10 : 5,
      }}
    >
      {/* The only thing that marks a ghost out. Everything else on the tile is
          identical, because it IS the job — same colours, same links, same
          counts, full opacity. */}
      {isGhost && (
        <span
          className="absolute -top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
          style={{ backgroundColor: '#eef2f7', color: '#64748b', border: '1px solid #dbe3ec' }}
          title="The same job, shown in a second place. Editing it edits the job."
        >
          <Ghost size={9} /> ghost
        </span>
      )}


      {/* Grouped — the ONLY visible sign of an invisible group. Pressing it
          takes just this tile out and leaves the rest grouped. Shown whenever
          the tile is in a group, because a thing that drags its neighbours
          around with no explanation reads as a fault. */}
      {job.boardGroup && (
        <button
          data-no-drag
          onClick={e => { e.stopPropagation(); H.jobUngroup(job); }}
          title="Grouped with others — click to take this one out"
          className="absolute top-1 right-[86px] p-1 rounded-md transition-all"
          style={{ color: '#4338ca', backgroundColor: '#e0e7ff' }}
        >
          <Group size={13} />
        </button>
      )}

      {/* Focus — glide the view so this tile sits in the middle of the
          screen. Beside the lock, on every tile, per the owner. */}
      <button
        data-no-drag
        onClick={e => { e.stopPropagation(); H.jobFocus(job); }}
        title="Centre this on the screen"
        className="absolute top-1 right-[110px] p-1 rounded-md transition-all text-gray-400
                   hover:text-[#1e3a5f] opacity-0 group-hover:opacity-100"
      >
        <Crosshair size={13} />
      </button>

      {/* Lock — a locked tile stays put: dragging pans the board, a click
          still opens the job. Hover-revealed until it is ON, then always
          visible so a tile that will not move says why. */}
      <button
        data-no-drag
        onClick={e => { e.stopPropagation(); H.jobLock(job); }}
        title={job.boardLocked ? 'Locked in place — click to unlock' : 'Lock in place'}
        className={`absolute top-1 right-[62px] p-1 rounded-md transition-all ${
          job.boardLocked ? '' : 'opacity-0 group-hover:opacity-100'}`}
        style={{
          color: job.boardLocked ? '#b45309' : '#94a3b8',
          backgroundColor: job.boardLocked ? '#fef3c7' : 'transparent',
        }}
      >
        {job.boardLocked ? <Lock size={13} /> : <Unlock size={13} />}
      </button>

      {/* Wallboard visibility. Everything shows by default; this only ever
          switches something OFF. Slash through the TV when hidden, so the state
          reads without hovering. */}
      <button
        data-no-drag
        onClick={e => { e.stopPropagation(); H.jobTv(job); }}
        title={job.showOnTv === false ? 'Hidden from TV' : 'Showing on TV'}
        className="absolute top-1 right-9 p-1 rounded-md transition-all"
        style={{
          color: job.showOnTv === false ? '#dc2626' : '#94a3b8',
          backgroundColor: job.showOnTv === false ? '#fee2e2' : 'transparent',
        }}
      >
        <TvIcon size={13} hidden={job.showOnTv === false} />
      </button>

      <button
        data-no-drag
        onClick={() => H.jobDelete([job.id])}
        className="absolute top-1 right-1.5 p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50/80 transition-all opacity-0 group-hover:opacity-100"
      >
        <Trash2 size={13} />
      </button>

      <div className="flex items-start gap-2 mb-1.5 pr-6">
        {stage && <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full mt-1" style={{ backgroundColor: stage.color }} />}
        <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 flex-1">
          {job.displayName || labels.job}
        </h3>
        {/* The Drive light used to sit here as well as on the row below, so
            every tile carried two Drive icons. The one at the bottom is the
            one you press, so this one goes. */}
      </div>

      {stage && (
        <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-1.5"
          style={{ backgroundColor: `${stage.color}22`, color: stage.color }}>
          {stage.name}
        </span>
      )}

      {job.address && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
          <MapPin size={11} className="flex-shrink-0 text-gray-400" />
          <span className="truncate">{job.address}</span>
        </div>
      )}

      {/* Buttons appear only when the data exists. Tooltips are short by design. */}
      <div className="absolute bottom-2.5 left-3 right-3 flex items-center gap-1.5">
        {job.driveLink && (
          <a data-no-drag title={labels.folder}
            href={job.driveLink.startsWith('http') ? job.driveLink : `https://${job.driveLink}`}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="w-6 h-6 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center hover:border-gray-300 transition-colors"
          >
            <DriveIcon size={13} />
          </a>
        )}
        {job.zohoLink && (
          <a data-no-drag title="Zoho"
            href={job.zohoLink.startsWith('http') ? job.zohoLink : `https://${job.zohoLink}`}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="w-6 h-6 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center hover:border-gray-300 transition-colors"
          >
            <ZohoIcon size={13} />
          </a>
        )}
        {job.plansPdfLink && (
          /* This DOWNLOADS the plan rather than opening Drive's viewer.
             From the board the question is "give me the drawing", not "show me
             where it lives" — and the viewer is one more tap from the job
             window anyway. Drive's export URL is a plain link, so this stays a
             real anchor that a middle-click and a long-press both understand. */
          <a data-no-drag title={`${labels.plans} — download`}
            href={planDownloadUrl(job.plansPdfLink)}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="w-6 h-6 rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center hover:border-gray-300 transition-colors text-gray-600"
          >
            <PlanIcon size={13} />
          </a>
        )}
        {pendingTasks > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-amber-600 font-bold">
            <ClipboardList size={11} /> {pendingTasks}
          </span>
        )}
      </div>

      {((job.thumbsUp ?? 0) > 0 || (job.thumbsDown ?? 0) > 0) && (
        <span className="absolute -top-2 -left-2 flex items-center gap-1">
          {(job.thumbsUp ?? 0) > 0 && (
            <button data-no-drag
              onClick={e => { e.stopPropagation(); H.jobThumbs(job.id, -1); }}
              title="Take one back"
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white border border-gray-200 shadow-sm text-[10px] font-bold text-emerald-600">
              <ThumbsUp size={10} /> {job.thumbsUp}
            </button>
          )}
          {(job.thumbsDown ?? 0) > 0 && (
            <button data-no-drag
              onClick={e => { e.stopPropagation(); H.jobThumbsDown(job.id, -1); }}
              title="Take one back"
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white border border-gray-200 shadow-sm text-[10px] font-bold text-rose-600">
              <ThumbsDown size={10} /> {job.thumbsDown}
            </button>
          )}
        </span>
      )}

      {lastEdited && (
        <span className="absolute top-1.5 left-3 text-[9px] text-gray-400 pointer-events-none">
          {lastEdited}
        </span>
      )}

      {/* The same corner handle every node has. Not on a ghost — a ghost is
          the same job shown twice, and the size belongs to the job — and not
          on a locked tile, where a handle that refuses the drag reads as
          broken. */}
      {!isGhost && !job.boardLocked && (
        <div
          data-no-drag data-resize
          onPointerDown={e => H.jobResizeDown(e, job, index)}
          onPointerMove={H.jobResizeMove}
          onPointerUp={H.jobResizeUp}
          onPointerCancel={H.jobResizeUp}
          title="Drag to resize · press 0 for the default size"
          className={`absolute -bottom-0.5 -right-0.5 cursor-se-resize transition-opacity z-10 ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-80'}`}
          style={{ width: 26, height: 26,
                   borderRight: '2px solid currentColor', borderBottom: '2px solid currentColor',
                   borderRadius: '0 0 5px 0', color: isSelected ? '#4aa8d8' : '#64748b' }}
        >
          <span className="absolute bottom-[1px] right-[1px] block rounded-[2px]"
            style={{ width: 7, height: 7, backgroundColor: isSelected ? '#4aa8d8' : '#94a3b8',
                     boxShadow: '0 0 0 1.5px rgba(255,255,255,.9)' }} />
        </div>
      )}
    </div>
  );
});

// ─── Ghost ───────────────────────────────────────────────────────────────────

// GhostTile is gone: a ghost is a JobTile with `ghostIndex`, so the two can
// never drift apart again.

/**
 * A widget that grows with its node.
 *
 * Making a node bigger used to give you a bigger white card with the same
 * small print marooned in the middle of it — the box resized, the information
 * in it did not. Every widget draws at its registered natural size in absolute
 * pixels, so there is no amount of CSS on the outside that reflows them.
 *
 * So the widget is drawn at its NATURAL width and scaled. Two consequences,
 * both wanted: widen the node and every figure, label and row gets
 * proportionally bigger; make it TALLER without widening and the inner height
 * grows in natural units, so a list shows more rows rather than taller type.
 *
 * `el.fontSize` rides on top as a plain text multiplier.
 */
/**
 * How much bigger this node is than the size it ships at.
 *
 * A widget's whole drawing already scales with its box through
 * `WidgetSurface` — but a sticky note, a heading and a section box carried a
 * FIXED font size, so dragging one to twice the size left 14px type marooned in
 * the corner of it. Their words follow the box now, by the same idiom.
 *
 * The SMALLER of the two ratios, so stretching one side alone can never push
 * the words out of the box.
 */
function nodeGrowth(type: string, w: number, h: number, lo = 0.7, hi = 3): number {
  const d = NODE_DEFAULT_SIZE[type];
  if (!d || d.w <= 0 || d.h <= 0) return 1;
  return Math.max(lo, Math.min(hi, Math.min(w / d.w, h / d.h)));
}

export function WidgetSurface({ el, w, h, children }: {
  el: CanvasElement; w: number; h: number; children: React.ReactNode;
}) {
  const def = el.widget ? WIDGET_BY_ID.get(el.widget) : undefined;
  const naturalW = def?.w ?? w;

  // Guard the extremes: below a third the type is unreadable, above three
  // times it is a poster. Both are past the point of being useful.
  const bump = el.fontSize ? Math.max(0.4, Math.min(3, el.fontSize / 14)) : 1;
  const k = Math.max(0.34, Math.min(3, (w / Math.max(1, naturalW)) * bump));

  /**
   * The drawing width has to follow the CLAMP, not the natural size.
   *
   * Normally `w / k` is exactly the natural width and this changes nothing.
   * But the scale is clamped at both ends, and once it is clamped the two stop
   * agreeing: squeeze a node past a third of its natural width and the scale
   * stops shrinking while the box keeps going, so the widget was still being
   * drawn wider than the space it had and the right-hand edge fell off. Taking
   * whichever is larger means the drawing always covers the box.
   */
  const innerW = Math.max(naturalW, w / k);

  return (
    <div className="w-full h-full overflow-hidden">
      <div
        style={{
          width: innerW,
          height: h / k,
          transform: `scale(${k})`,
          transformOrigin: '0 0',
          fontWeight: el.fontWeight,
          textAlign: el.align,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Canvas node ─────────────────────────────────────────────────────────────

export interface BoardNodeProps {
  el: CanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
  isSelected: boolean;
  isDragging: boolean;
  /**
   * Part of a multi-selection. Its own corner handles are hidden — the whole
   * selection shares ONE handle on the combined box, and dragging an individual
   * corner would resize that node alone and break the arrangement.
   */
  inGroup?: boolean;
  isEditing: boolean;
  editText: string;
  binHot: boolean;
  binCount: number;
  recording: boolean;
  savingAudio: boolean;
  ctx: WidgetCtx;
  editRef: React.RefObject<HTMLTextAreaElement | null>;
  H: BoardHandlers;
  onRecord: (id: string) => void;
  onStopRecord: () => void;
  onUploadAudio: (id: string, file: File) => void;
  /** CUT and not yet pasted — drawn faded, "in the air". */
  faded?: boolean;
}

export const BoardNode = React.memo(function BoardNode({
  el, x, y, w, h, isSelected, isDragging, isEditing, editText, binHot, binCount, inGroup,
  recording, savingAudio, ctx, editRef, H, onRecord, onStopRecord, onUploadAudio, faded,
}: BoardNodeProps) {
  // Any bin node, built-in or one you made.
  const isBin = el.type === 'bin';
  /**
   * No card and no text editor: a piece of clip art, and a drawing that has
   * become a node of its own. Both are the picture itself — a white rounded
   * rectangle behind either of them would be a box nobody asked for.
   */
  const isStroke = el.type === 'stroke';
  const plain = el.type === 'clipart' || isStroke;
  const isWidget = el.type === 'widget';
  /**
   * A blue dot for the first while after something is placed.
   *
   * Adding three things to a busy board and then having to work out which three
   * they were is a small, repeated annoyance. It fades on its own after an hour,
   * and clicking it clears it immediately.
   */
  const isNew = !!el.addedAt && Date.now() - new Date(el.addedAt).getTime() < 3_600_000;

  /**
   * A widget that can actually save what you do to it.
   *
   * `WidgetCtx.update` takes a patch with no element id, so ONE shared context
   * cannot know which node to write to — and it had been stubbed out to `() => {}`
   * to keep the context stable for memoisation. The result was that every
   * interactive widget on the board silently discarded every edit: checklist
   * ticks, tally taps, the progress slider, table cells, the week planner, the
   * contact card, the banner's own text. All of it looked like it worked.
   *
   * Binding it HERE keeps both properties: the shared context stays stable, and
   * each node gets an update that knows its own id. No widget's render function
   * had to change.
   */
  const boundCtx = useMemo<WidgetCtx>(
    () => ({ ...ctx, update: patch => H.elPatch(el.id, patch) }),
    [ctx, el.id, H],
  );

  // Each node type carries its own surface. A bin is a dashed drop zone, clip
  // art has no chrome at all, and the rest keep the card look that notes and
  // boxes established.
  // Longhand only. Mixing `border` with a later `borderColor` override made
  // React warn about shorthand/longhand conflicts and can genuinely mis-style,
  // so the selected colour is folded in here rather than layered on top.
  const borderColor = isSelected ? '#4aa8d8'
    : isBin ? (binHot ? el.color : '#cbd5e1')
    : isWidget ? '#e2e8f0'
    : el.type === 'box' ? withAlpha(el.color, (el.boxOpacity ?? 0.45) + 0.35)
    : 'rgba(0,0,0,0.1)';

  /**
   * A chosen outline wins over the default border.
   *
   * Drawn as the BORDER rather than as an extra ring, so it does not change the
   * node's size or sit under its neighbours — and so it works on the plain
   * types (a title, a piece of clip art) that have no border of their own. The
   * selection blue still beats it, because knowing what you have got hold of
   * matters more than decoration.
   */
  const ring = el.outline?.trim();
  const ringW = Math.max(1, Math.min(12, Number(el.outlineWidth) || 3));

  const surface: React.CSSProperties = (plain || el.type === 'title')
    ? (ring && !isSelected
        ? { backgroundColor: 'transparent', borderStyle: 'solid', borderWidth: ringW, borderColor: ring }
        : { backgroundColor: 'transparent', borderStyle: 'none', borderWidth: 0 })
    : {
        backgroundColor: isBin
          ? (binHot ? `${el.color}22` : 'rgba(255,255,255,.82)')
          // Was hardcoded white, so the colour picker wrote a value no widget
          // ever read — pick a colour, nothing happens, on all 47 of them.
          : isWidget ? (el.color || '#ffffff')
          : el.type === 'box' ? withAlpha(el.color, el.boxOpacity)
          : (el.color || '#ffffff'),
        borderStyle: isBin && !ring ? 'dashed' : 'solid',
        borderWidth: ring && !isSelected ? ringW : isBin ? 2 : 1,
        borderColor: ring && !isSelected ? ring : borderColor,
        boxShadow: isBin && binHot ? `0 0 0 4px ${el.color}22` : undefined,
      };

  return (
    <div
      onPointerDown={e => H.elDown(e, el)}
      onPointerMove={H.elMove}
      onPointerUp={e => H.elUp(el, e)}
      onContextMenu={e => H.elMenu(e, el)}
      /**
       * A group OPENS. Everything else edits its words.
       *
       * `elEdit` for every node meant double-clicking a group put its name into
       * an edit box — so the one gesture people reach for to look inside a
       * group instead offered to rename it, and the group read as having no
       * inside at all. Renaming lives on the pencil (`BinSettings`), which is
       * where every other node's settings live too. The touch path already
       * opened a group on tap; this is the mouse catching up with it.
       */
      onDoubleClick={() => {
        if (plain) return;
        if (isBin) H.openBin(binKeyOf(el));
        else H.elEdit(el);
      }}
      data-node-id={el.id}
      title={isWidget ? 'Drag the strip at the top to move it' : undefined}
      // A drawing's BOX passes the pointer through: only the ink itself (a
      // fat invisible hit-line in StrokeNode) catches it, bubbling back up to
      // this container's handlers. That is what lets EVERY stroke be a node
      // without a stroke drawn across a tile ever blocking the tile — the
      // reason the old rule refused to promote overlapping ink at all.
      className={`group absolute rounded-xl select-none ${plain || isBin ? '' : 'shadow-md'} ${
        el.locked ? 'cursor-default' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
      } ${isStroke ? 'pointer-events-none' : ''}`}
      style={{
        left: x, top: y, width: w, height: h,
        ...surface,
        outline: isSelected && !isDragging ? '2px solid rgba(74,168,216,0.5)' : undefined,
        outlineOffset: '2px',
        touchAction: 'none',
        // Cut and waiting for its paste — visibly "in the air".
        opacity: faded ? 0.35 : undefined,
        /**
         * A SECTION BOX is furniture and stays UNDER the content, whatever
         * its stored z says. A box brought to the front used to paint over
         * every widget inside it — and because the box's body takes the
         * pointer, everything under it became unclickable: the owner's
         * calculator trapped beneath his section, with clicks on it silently
         * selecting the near-invisible box instead. Bring-to-front on a box
         * still orders it against OTHER boxes (the cap keeps their ladder),
         * but never lifts it above tiles, widgets or groups.
         */
        // …and the mirror guard: content sent-to-back floors at the band's
        // bottom (4), so it can sink below other content but never under a
        // box, where the same trap would spring from the other side.
        // The box band is CLAMPED at both ends: a stored NEGATIVE z (a
        // send-to-back from before the z floor existed — the owner's second
        // MANAGMENT section carries z:-1 in production) paints behind the
        // world div and becomes unclickable, so it floors at 0 here rather
        // than needing a data migration.
        zIndex: el.type === 'box'
          ? Math.min(Math.max(el.z ?? 1, 0), 3)
          : Math.max(el.z ?? (isBin ? 4 : 5), 4),
      }}
    >
      {/* Node actions — always on when selected, on hover otherwise. Bins have
          no colour picker and can never be deleted. */}
      {/* ONE button, not three or four.
          Colour, text and everything else already live in the settings panel,
          so three buttons in a 22px strip were three ways to the same place —
          and each was an 18px target, which is why they were so hard to hit.
          28px, with the delete kept separate because it is the one that cannot
          be undone by pressing it again. */}
      {/* ABOVE the node, not inside it.
          These sat in the top-right corner over the widget's own content, and a
          widget with its own controls there lost them the moment you hovered —
          the planner's "next week" was covered by Remove, so reaching for the
          next week deleted the planner. A floating strip above the top edge
          cannot cover anything, and because it is still a child of the node the
          hover that reveals it also survives the pointer moving onto it.
          A drawing gets the strip even though it has no card — it is a thing on
          the board like any other, and removing one had no other route. */}
      {el.type !== 'clipart' && (
        <div className={`absolute right-0 flex gap-1 z-20 transition-opacity ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}
          style={{ bottom: '100%', marginBottom: 4, pointerEvents: 'auto' }}>
          {/* Talk into a NOTE. A section box lost its mic by the owner's ask —
              a box is furniture that groups things, not a note anybody speaks
              into, and the button there read as clutter. A box that already
              carries a memo still plays it below. */}
          {el.type === 'note' && !el.audioUrl && (
            <button data-el-action
              onClick={e => { e.stopPropagation(); recording ? onStopRecord() : onRecord(el.id); }}
              title={recording ? 'Stop recording' : 'Record a voice memo on this note'}
              className="w-7 h-7 rounded-lg bg-white/95 hover:bg-white flex items-center justify-center shadow-sm border border-gray-100"
              style={{ color: recording ? '#dc2626' : '#94a3b8' }}>
              <Mic size={13} />
            </button>
          )}
          {/* Grouped — the invisible group's only visible sign. Takes just
              this node out; the rest stay grouped. */}
          {el.boardGroup && (
            <button data-el-action
              onClick={e => { e.stopPropagation(); H.elUngroup(el); }}
              title="Grouped with others — click to take this one out"
              className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm border border-gray-100"
              style={{ color: '#4338ca', backgroundColor: '#e0e7ff' }}>
              <Group size={13} />
            </button>
          )}
          {/* Focus — glide the view so this node sits in the middle of the
              screen. On every node, beside the lock, per the owner. */}
          <button data-el-action
            onClick={e => { e.stopPropagation(); H.elFocus(el); }}
            title="Centre this on the screen"
            className="w-7 h-7 rounded-lg bg-white/95 hover:bg-white flex items-center justify-center shadow-sm border border-gray-100 text-gray-400 hover:text-[#1e3a5f]">
            <Crosshair size={13} />
          </button>
          {/* Lock in place: no drag, no resize, until unlocked. `undefined`
              rather than false when unlocking, so the field disappears from
              the record instead of riding every node forever. */}
          <button data-el-action
            onClick={e => { e.stopPropagation(); H.elPatch(el.id, { locked: el.locked ? undefined : true }); }}
            title={el.locked ? 'Locked in place — click to unlock' : 'Lock in place'}
            className="w-7 h-7 rounded-lg bg-white/95 hover:bg-white flex items-center justify-center shadow-sm border border-gray-100"
            style={{ color: el.locked ? '#b45309' : '#94a3b8',
                     backgroundColor: el.locked ? '#fef3c7' : undefined }}>
            {el.locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
          <button data-el-action
            onClick={e => { e.stopPropagation(); H.elPatch(el.id, { showOnTv: el.showOnTv === false ? undefined : false }); }}
            title={el.showOnTv === false ? 'Hidden from TV' : 'Showing on TV'}
            className="w-7 h-7 rounded-lg bg-white/95 hover:bg-white flex items-center justify-center shadow-sm border border-gray-100"
            style={{ color: el.showOnTv === false ? '#dc2626' : '#94a3b8' }}>
            <TvIcon size={13} hidden={el.showOnTv === false} />
          </button>
          <button data-el-action
            title="Settings"
            onClick={e => { e.stopPropagation(); H.elSettings(el); }}
            className="w-7 h-7 rounded-lg bg-white/95 hover:bg-white text-gray-500 hover:text-gray-800 transition-all flex items-center justify-center shadow-sm border border-gray-100">
            <Settings2 size={14} />
          </button>
          {!isBin && (
            <button data-el-action
              title="Remove"
              onClick={e => { e.stopPropagation(); H.elDelete(el.id); }}
              className="w-7 h-7 rounded-lg bg-white/95 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all flex items-center justify-center shadow-sm border border-gray-100">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* ── Type-specific content ── */}
      {/* `!isEditing` so a double-clicked group gives way to the rename
          textarea below — isBin winning the ternary outright meant the editor
          state was set and nothing ever drew it (the widget-pencil disease). */}
      {isBin && !isEditing ? (
        <div className="w-full h-full flex flex-col items-start justify-center px-3 text-left pointer-events-none">
          <span className="flex items-center gap-1.5 font-extrabold text-[12.5px] truncate max-w-full"
            style={{ color: el.color }}>
            {el.binKind === 'done' ? <CheckCircle2 size={14} />
              : el.binKind === 'ready' ? <PlayCircle size={14} />
              : el.binKind === 'archive' ? <Archive size={14} />
              : el.binKind === 'trash' ? <Trash2 size={14} />
              : <FolderOpen size={14} />}
            {binLabelOf(el)}
          </span>
          <span className="text-[11px] text-gray-500 mt-0.5">
            {binCount} {binCount === 1 ? 'job' : 'jobs'}
          </span>
          <span className="text-[9px] text-gray-400 mt-0.5">
            {binHot ? 'Release to file it here' : 'Click to open · drag jobs in'}
          </span>
        </div>
      ) : el.type === 'countdown' ? (
        <CountdownNode el={el} />
      ) : el.type === 'stopwatch' ? (
        <StopwatchNode el={el} onToggle={() => H.elPatch(el.id, el.startedAt
          ? { startedAt: undefined, elapsedMs: (el.elapsedMs ?? 0) + (Date.now() - new Date(el.startedAt).getTime()) }
          : { startedAt: new Date().toISOString() })} />
      ) : el.type === 'voice' ? (
        <VoiceMemoNode el={el} recording={recording} busy={savingAudio}
          onRecord={() => onRecord(el.id)} onStop={onStopRecord}
          onUpload={f => onUploadAudio(el.id, f)} />
      ) : isWidget ? (
        <WidgetSurface el={el} w={w} h={h}>{renderWidget(el, boundCtx)}</WidgetSurface>
      ) : el.type === 'clipart' ? (
        <ClipArtNode el={el} onUse={art => H.artUse(el, art)} />
      ) : isStroke ? (
        <StrokeNode el={el} />
      ) : el.type === 'title' ? (
        <div className="w-full h-full flex items-center px-2 leading-tight overflow-hidden"
          style={{
            fontSize: (el.fontSize ?? 30) * nodeGrowth('title', w, h),
            fontWeight: el.fontWeight ?? 800,
            color: el.color || '#0f172a',
            fontStyle: el.italic ? 'italic' : 'normal',
            textDecoration: el.underline ? 'underline' : 'none',
            justifyContent: el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start',
          }}>
          {el.text || <span className="italic opacity-40">Title</span>}
        </div>
      ) : isEditing ? (
        <textarea
          ref={editRef}
          value={editText}
          onChange={e => H.editChange(e.target.value)}
          onBlur={H.editCommit}
          onKeyDown={e => { if (e.key === 'Escape') H.editCancel(); if (e.key === 'Enter' && e.metaKey) H.editCommit(); }}
          className="absolute inset-0 w-full h-full bg-transparent border-none outline-none resize-none p-2.5 text-sm"
          style={{ paddingTop: el.type === 'box' ? '8px' : '32px', zIndex: 20 }}
        />
      ) : (
        el.type === 'box' ? null : (
        <div
          className="pt-8 px-3 text-gray-700 leading-snug whitespace-pre-wrap break-words"
          style={{
            maxHeight: '100%', overflow: 'hidden',
            // A note had no way to change its own type at all. It uses the same
            // controls the heading always had, so one set covers every text node.
            fontSize: (el.fontSize ?? 14) * nodeGrowth('note', w, h),
            fontWeight: el.fontWeight ?? 400,
            textAlign: el.align ?? 'left',
            fontStyle: el.italic ? 'italic' : undefined,
            textDecoration: el.underline ? 'underline' : undefined,
          }}
        >
          {el.text || <span className="italic text-gray-400">Double-click to edit</span>}
        </div>
        )
      )}

      {(el.type === 'note' || el.type === 'box') && el.audioUrl && (
        <div className="absolute left-2 right-2 bottom-2 z-10" data-no-drag data-el-action>
          <VoiceMemoPlayer
            src={el.audioUrl}
            seconds={el.audioSeconds}
            onDelete={() => H.elPatch(el.id, { audioUrl: undefined, audioSeconds: undefined })}
          />
        </div>
      )}

      {/* The box's name lives in its header bar and NOWHERE else. It used to be
          drawn here AND in the body, so every section box showed its own name
          twice — once small inside, once on the bar. */}
      {el.type === 'box' && !isEditing && el.text && (
        <div className="absolute top-0 left-0 right-0 px-3 py-1.5 rounded-t-xl cursor-grab truncate"
          style={{
            backgroundColor: withAlpha(el.color, (el.boxOpacity ?? 0.45) + 0.25),
            // A section box can be enormous, so its name grows more gently
            // than a note's — a heading three times the size is a banner.
            fontSize: (el.fontSize ?? 14) * nodeGrowth('box', w, h, 0.85, 1.8),
            fontWeight: el.fontWeight ?? 600,
            textAlign: el.align ?? 'left',
            color: '#334155',
          }}>
          {el.text}
        </div>
      )}

      {((el.thumbsUp ?? 0) > 0 || (el.thumbsDown ?? 0) > 0) && (
        <span className="absolute -top-2 -left-2 flex items-center gap-1">
          {(el.thumbsUp ?? 0) > 0 && (
            <button data-el-action
              onClick={e => { e.stopPropagation(); H.elThumbs(el.id, -1); }}
              title="Take one back"
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white border border-gray-200 shadow-sm text-[10px] font-bold text-emerald-600">
              <ThumbsUp size={10} /> {el.thumbsUp}
            </button>
          )}
          {(el.thumbsDown ?? 0) > 0 && (
            <button data-el-action
              onClick={e => { e.stopPropagation(); H.elThumbsDown(el.id, -1); }}
              title="Take one back"
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white border border-gray-200 shadow-sm text-[10px] font-bold text-rose-600">
              <ThumbsDown size={10} /> {el.thumbsDown}
            </button>
          )}
        </span>
      )}

      {/* A widget is mostly controls, and every control swallows the press
          before the node sees it — so a widget could have almost no grabbable
          surface. This strip along the top is always draggable, whatever is
          underneath it. */}
      {isWidget && !plain && (
        <div
          className={`absolute top-0 left-0 right-0 h-3 z-[6] rounded-t-xl transition-opacity ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          style={{ cursor: 'grab', background:
            'linear-gradient(180deg, rgba(74,168,216,.18), rgba(74,168,216,0))' }}
          title="Drag to move"
        />
      )}

      {/* No corner badge for a locked node — the owner found it noise. The
          lock reads from the strip button itself turning amber. */}

      {/* Newly placed, and not yet looked at. Clears when you click it. */}
      {isNew && (
        <button
          data-el-action
          // On pointerdown, not click: the node starts a drag on pointerdown,
          // and a click that turns into even a tiny drag never fires.
          onPointerDown={e => { e.stopPropagation(); e.preventDefault(); H.elSeen(el); }}
          title="Added just now — click to clear"
          className="absolute -top-1 -left-1 z-[7] w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: '#4aa8d8', boxShadow: '0 0 0 3px rgba(74,168,216,.25)' }}
        />
      )}

      {/* EVERY node resizes, from the corner OR either edge — and that now
          genuinely means every one, drawings included. It was gated on
          `type !== 'stroke'`, which was right while ink was only ever a layer
          and wrong the moment a drawing became a node.
          The corner was 20px and a mouse-sized target; on a touch panel it is
          most of a fingertip, and a widget that is nearly all controls left
          almost nothing else to aim at. It is 26 now, with a strip down the
          right and along the bottom so the whole edge works.
          Selecting a node SHOWS the corner rather than hinting at it: a handle
          you can only find by hovering the exact pixel reads as "this type
          can't be resized", which is what it read as on half the board. */}
      {/* No handles on a locked node — a handle that refuses the drag reads
          as broken, so a pinned node simply has none until it is unlocked. */}
      {!inGroup && !el.locked && (<>
      <div data-el-action data-resize
        onPointerDown={e => H.resizeDown(e, el)}
        onPointerMove={H.resizeMove}
        onPointerUp={H.resizeUp}
        onPointerCancel={H.resizeUp}
        className={`pointer-events-auto absolute right-0 top-3 bottom-6 w-2 cursor-ew-resize z-10 transition-opacity ${
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        style={{ background: 'linear-gradient(90deg, rgba(74,168,216,0), rgba(74,168,216,.30))' }}
      />
      <div data-el-action data-resize
        onPointerDown={e => H.resizeDown(e, el)}
        onPointerMove={H.resizeMove}
        onPointerUp={H.resizeUp}
        onPointerCancel={H.resizeUp}
        className={`pointer-events-auto absolute bottom-0 left-3 right-6 h-2 cursor-ns-resize z-10 transition-opacity ${
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        style={{ background: 'linear-gradient(180deg, rgba(74,168,216,0), rgba(74,168,216,.30))' }}
      />
      <div data-el-action data-resize
        onPointerDown={e => H.resizeDown(e, el)}
        onPointerMove={H.resizeMove}
        onPointerUp={H.resizeUp}
        onPointerCancel={H.resizeUp}
        title="Drag to resize"
        className={`pointer-events-auto absolute -bottom-0.5 -right-0.5 cursor-se-resize transition-opacity z-10 ${
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-80'}`}
        style={{ width: 26, height: 26,
                 borderRight: '2px solid currentColor', borderBottom: '2px solid currentColor',
                 borderRadius: '0 0 5px 0', color: isSelected ? '#4aa8d8' : '#64748b' }}
      >
        {/* A filled knob under the corner, so the handle reads on a photo tile,
            a dark widget or a bare drawing alike. */}
        <span className="absolute bottom-[1px] right-[1px] block rounded-[2px]"
          style={{ width: 7, height: 7, backgroundColor: isSelected ? '#4aa8d8' : '#94a3b8',
                   boxShadow: '0 0 0 1.5px rgba(255,255,255,.9)' }} />
      </div>
      </>)}
    </div>
  );
});
