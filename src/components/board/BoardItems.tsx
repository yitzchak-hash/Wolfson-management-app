import React, { useMemo } from 'react';

/**
 * Re-alpha a colour that may be hex or rgba.
 *
 * Section boxes shipped with `rgba(...,0.45)` fills and the code re-derived
 * shades by string-replacing "0.45", which broke the moment anybody picked a
 * different colour.
 */
function withAlpha(color: string, alpha = 0.45): string {
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
  Archive, CheckCircle2, PlayCircle, FolderOpen } from 'lucide-react';
import { Apartment, CanvasElement, Stage, BinKind, BIN_META, binKeyOf, binLabelOf } from '../../types';
import { Settings2 } from 'lucide-react';
import { DriveIcon, ZohoIcon, PlanIcon, TvIcon } from '../ui/BrandIcons';
import { DriveStatus } from '../ui/DriveStatus';
import { CountdownNode, StopwatchNode, ClipArtNode, VoiceMemoNode } from './BoardNodes';
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
  jobDelete: (ids: string[]) => void;
  jobTv: (job: Apartment) => void;
  jobThumbs: (id: string, delta: number) => void;
  jobThumbsDown: (id: string, delta: number) => void;
  /** Ghosts use the same tile, so they need their own pointer handlers. */
  ghostDown?: (e: React.PointerEvent, job: Apartment, ghostIndex: number) => void;
  ghostMove?: (e: React.PointerEvent) => void;
  ghostUp?: (e: React.PointerEvent, job: Apartment) => void;
  ghostMenu?: (e: React.MouseEvent, job: Apartment, ghostIndex: number) => void;

  elDown: (e: React.PointerEvent, el: CanvasElement) => void;
  elMove: (e: React.PointerEvent) => void;
  elUp: (el: CanvasElement) => void;
  elMenu: (e: React.MouseEvent, el: CanvasElement) => void;
  elEdit: (el: CanvasElement) => void;
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
}

export const JobTile = React.memo(function JobTile({
  job, index, x, y, w, h, stage, pendingTasks, isSelected, isDragging,
  justChanged, searchLit, fallbackBorder, lastEdited, labels, H, ghostIndex,
}: JobTileProps) {
  const isGhost = ghostIndex !== undefined;
  return (
    <div
      onPointerDown={e => (isGhost ? H.ghostDown!(e, job, ghostIndex!) : H.jobDown(e, job, index))}
      onPointerMove={isGhost ? H.ghostMove! : H.jobMove}
      onPointerUp={e => (isGhost ? H.ghostUp!(e, job) : H.jobUp(e, job))}
      onContextMenu={e => (isGhost ? H.ghostMenu!(e, job, ghostIndex!) : H.jobMenu(e, job))}
      data-node-id={job.id}
      className={`absolute rounded-xl border px-3 pb-3 pt-[22px] group select-none ${
        isDragging ? 'shadow-2xl cursor-grabbing' :
        isSelected ? 'shadow-md cursor-grab' : 'shadow-sm hover:shadow-md cursor-grab'
      } ${justChanged && !isDragging ? 'live-change-pulse' : ''} ${searchLit ? 'search-hit' : ''}`}
      style={{
        left: x, top: y, width: w, height: h,
        touchAction: 'none',
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
        {/* Whether this job's Drive folder is set up, without opening it. */}
        <DriveStatus job={job} />
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
          <a data-no-drag title={labels.plans}
            href={job.plansPdfLink}
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
function WidgetSurface({ el, w, h, children }: {
  el: CanvasElement; w: number; h: number; children: React.ReactNode;
}) {
  const def = el.widget ? WIDGET_BY_ID.get(el.widget) : undefined;
  const naturalW = def?.w ?? w;

  // Guard the extremes: below a third the type is unreadable, above three
  // times it is a poster. Both are past the point of being useful.
  const bump = el.fontSize ? Math.max(0.4, Math.min(3, el.fontSize / 14)) : 1;
  const k = Math.max(0.34, Math.min(3, (w / Math.max(1, naturalW)) * bump));

  return (
    <div className="w-full h-full overflow-hidden">
      <div
        style={{
          width: naturalW,
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
}

export const BoardNode = React.memo(function BoardNode({
  el, x, y, w, h, isSelected, isDragging, isEditing, editText, binHot, binCount,
  recording, savingAudio, ctx, editRef, H, onRecord, onStopRecord, onUploadAudio,
}: BoardNodeProps) {
  // Any bin node, built-in or one you made.
  const isBin = el.type === 'bin';
  const plain = el.type === 'clipart';
  const isWidget = el.type === 'widget';

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
      onPointerUp={() => H.elUp(el)}
      onContextMenu={e => H.elMenu(e, el)}
      onDoubleClick={() => { if (!plain) H.elEdit(el); }}
      data-node-id={el.id}
      className={`group absolute rounded-xl select-none ${plain || isBin ? '' : 'shadow-md'} ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      style={{
        left: x, top: y, width: w, height: h,
        ...surface,
        outline: isSelected && !isDragging ? '2px solid rgba(74,168,216,0.5)' : undefined,
        outlineOffset: '2px',
        touchAction: 'none',
        // An explicit layer wins; otherwise the type decides, as it always has.
        zIndex: el.z ?? (el.type === 'box' ? 1 : isBin ? 4 : 5),
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
      {!plain && (
        <div className={`absolute top-1.5 right-1.5 flex gap-1 z-10 transition-opacity ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}
          style={{ pointerEvents: 'auto' }}>
          <button data-el-action
            title="Settings"
            onClick={e => { e.stopPropagation(); H.elSettings(el); }}
            className="w-7 h-7 rounded-lg bg-white/85 hover:bg-white text-gray-500 hover:text-gray-800 transition-all flex items-center justify-center shadow-sm">
            <Settings2 size={14} />
          </button>
          {!isBin && (
            <button data-el-action
              title="Remove"
              onClick={e => { e.stopPropagation(); H.elDelete(el.id); }}
              className="w-7 h-7 rounded-lg bg-white/85 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all flex items-center justify-center shadow-sm">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Wallboard visibility — every node carries the same switch. */}
      {!plain && (
        <button data-el-action
          onClick={e => { e.stopPropagation(); H.elPatch(el.id, { showOnTv: el.showOnTv === false ? undefined : false }); }}
          title={el.showOnTv === false ? 'Hidden from TV' : 'Showing on TV'}
          className={`absolute bottom-1.5 right-1.5 w-7 h-7 rounded-lg flex items-center justify-center bg-white/70 transition-all z-10 ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}
          style={{ color: el.showOnTv === false ? '#dc2626' : '#94a3b8' }}>
          <TvIcon size={13} hidden={el.showOnTv === false} />
        </button>
      )}

      {/* ── Type-specific content ── */}
      {isBin ? (
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
      ) : el.type === 'title' ? (
        <div className="w-full h-full flex items-center px-2 leading-tight overflow-hidden"
          style={{
            fontSize: el.fontSize ?? 30,
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
            fontSize: el.fontSize ?? 14,
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

      {/* The box's name lives in its header bar and NOWHERE else. It used to be
          drawn here AND in the body, so every section box showed its own name
          twice — once small inside, once on the bar. */}
      {el.type === 'box' && !isEditing && el.text && (
        <div className="absolute top-0 left-0 right-0 px-3 py-1.5 rounded-t-xl cursor-grab truncate"
          style={{
            backgroundColor: withAlpha(el.color, (el.boxOpacity ?? 0.45) + 0.25),
            fontSize: el.fontSize ?? 14,
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

      {/* EVERY node resizes. A note you cannot make bigger for a longer note,
          or a pin you cannot make smaller, is the odd one out for no reason. */}
      {el.type !== 'stroke' && (
        <div data-el-action
          onPointerDown={e => H.resizeDown(e, el)}
          onPointerMove={H.resizeMove}
          onPointerUp={H.resizeUp}
          className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 cursor-se-resize transition-opacity z-10 ${
            isSelected ? 'opacity-60' : 'opacity-0 group-hover:opacity-60'}`}
          style={{ borderRight: '2px solid currentColor', borderBottom: '2px solid currentColor',
                   borderRadius: '0 0 4px 0', color: '#64748b' }}
        />
      )}
    </div>
  );
});
