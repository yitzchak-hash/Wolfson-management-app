import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Folder, FileText, Image as ImageIcon, Star, Maximize2, ExternalLink, Loader2, ChevronLeft, X, Play, Music } from 'lucide-react';
import { DriveChild, driveThumbUrl, ensureDriveShared, listFolderChildrenViaBackend } from '../../data/driveApi';
import { useStore } from '../../data/store';
import { mediaKindOf, typeBadgeOf } from '../../data/mediaKind';
import { usePlanDownload } from '../../data/planCache';

/** One step of the breadcrumb: the job folder first, then each folder stepped into. */
export interface Crumb { id: string; name: string }

/** What a file tile needs to know — the browser's DriveChild and the picker's PlanEntry both fit. */
export interface TileFile {
  id: string;
  name: string;
  isImage?: boolean;
  /** A marked-up version — wears the picker's "marked up" chip. */
  annotated?: boolean;
  /** False for a CAD file and the like: a type badge, no star, no preview. */
  viewable: boolean;
  mimeType?: string;
}

/** Lazy: true once the node has scrolled into (or near) view, and stays true. */
function useInView<T extends HTMLElement>(ref: React.RefObject<T | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: '160px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}

/** The file's type, as a short badge — "DWG", "XLSX" — for a file nothing can draw. */
const typeBadge = typeBadgeOf;

/** How far a plan's background download has got — the picker's quiet note, kept on the tile. */
function DownloadNote({ fileId }: { fileId: string }) {
  const pct = usePlanDownload(fileId);
  if (pct == null) return null;
  if (pct >= 100) {
    return <span data-plan-ready className="text-[9.5px] font-bold text-emerald-600 flex-shrink-0">ready</span>;
  }
  return (
    <span data-plan-downloading className="flex items-center gap-1 flex-shrink-0 text-[9.5px] text-slate-400 tabular-nums">
      <span className="w-[32px] h-[3px] rounded-full overflow-hidden bg-slate-200">
        <span className="block h-full rounded-full bg-[#4aa8d8]" style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}

/**
 * A folder, as a tile. Pressing it steps in.
 */
export function FolderTile({ id, name, onOpen }: { id: string; name: string; onOpen: () => void }) {
  return (
    <button type="button" data-folder-tile={id} onClick={onOpen} title={name}
      className="group flex flex-col items-stretch rounded-xl border border-gray-200 bg-white hover:border-[#4aa8d8] hover:shadow-sm text-left overflow-hidden min-h-[112px]">
      <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: '#eef4fa' }}>
        <Folder size={34} className="text-[#4aa8d8]" fill="#cfe6f5" />
      </div>
      <div className="px-2 py-1.5 text-[11.5px] font-semibold text-slate-700 truncate">{name}</div>
    </button>
  );
}

/**
 * A file, as a tile: its first page (Drive's own thumbnail, loaded only once
 * the tile scrolls into view), the STAR top-right (this is the contractor's
 * plan) and the expand arrow top-left (open this sheet here — a look, never a
 * choice). A file that cannot open here wears a type badge and neither
 * control. The two controls are ≥28px and shown outright on a touch screen
 * (the standing `any-hover: none` rule reveals every group-hover control).
 *
 * The thumbnail needs the file link-readable, so a tile shares it the moment
 * it is displayed — the standing where-DISPLAYED rule for plans.
 */
export function FileTile({
  file, starred, starAuto, current, sub, onOpen, onStar, onPreview, onOpenNewTab, rowHook,
}: {
  file: TileFile;
  starred?: boolean;
  /** The sheet the pane is showing — a quiet ring. */
  current?: boolean;
  /** A second line under the name (the folder it was found in). */
  sub?: string;
  /** The tile's own press. */
  onOpen?: () => void;
  onStar?: () => void;
  /** The star is the APP's guess (latest activity), not a person's choice — drawn red. */
  starAuto?: boolean;
  onPreview?: () => void;
  onOpenNewTab?: () => void;
  /** Which data hook the tile wears — the picker keeps `data-plan-row` for its standing probes. */
  rowHook?: 'plan-row' | 'file-tile';
}) {
  const ui = useStore(s => s.mainUiStrings);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [thumbFailed, setThumbFailed] = useState(false);
  /**
   * A film, a memo or a picture is not a PLAN — `viewable` is about what can
   * be marked up — but it is very much something to open. Drive makes a
   * thumbnail for a video too, so the tile shows the first frame with a play
   * mark rather than a dead grey badge (the owner's MP4, 2026-09-17).
   */
  const kind = mediaKindOf(file.name, file.mimeType);
  const canThumb = file.viewable || kind === 'image' || kind === 'video';
  const showThumb = canThumb && inView && !thumbFailed;
  useEffect(() => { if (canThumb && inView) ensureDriveShared(file.id); }, [canThumb, inView, file.id]);
  const hookAttrs = rowHook === 'plan-row' ? { 'data-plan-row': file.id } : { 'data-file-tile': file.id };
  const glyph = file.isImage
    ? <ImageIcon size={30} className="text-emerald-600" />
    : <FileText size={30} className="text-[#1e3a5f]" />;
  return (
    <div
      ref={ref}
      {...hookAttrs}
      data-viewable={file.viewable ? '1' : '0'}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={e => { if (onOpen && e.key === 'Enter') onOpen(); }}
      title={file.name}
      className={`group relative flex flex-col rounded-xl border bg-white overflow-hidden min-h-[112px] text-left ${
        onOpen ? 'cursor-pointer hover:border-[#4aa8d8] hover:shadow-sm' : ''} ${
        current ? 'border-[#4aa8d8] ring-2 ring-[#4aa8d8]/30' : 'border-gray-200'}`}
    >
      <div className="relative flex-1 min-h-[76px] flex items-center justify-center" style={{ backgroundColor: '#f1f5f9' }}>
        {showThumb ? (
          <img
            src={driveThumbUrl(file.id, 300)}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
        ) : kind === 'video' ? <Play size={28} className="text-slate-500" />
          : kind === 'audio' ? <Music size={28} className="text-violet-500" />
          : file.viewable ? glyph : (
          <span data-tile-badge className="px-2 py-1 rounded-md text-[11px] font-extrabold tracking-wide text-slate-500 bg-white border border-gray-200"
            title={ui.planNotViewable}>
            {typeBadge(file.name, file.mimeType)}
          </span>
        )}

        {kind === 'video' && showThumb && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="w-9 h-9 rounded-full bg-black/55 flex items-center justify-center">
              <Play size={16} className="text-white ms-0.5" fill="currentColor" />
            </span>
          </span>
        )}

        {/* The star — top-right. Always drawn once starred; otherwise revealed
            on hover (and outright on a touch screen). */}
        {file.viewable && onStar && (
          <button type="button"
            data-tile-star={file.id}
            data-starred={starred ? '1' : '0'}
            data-star-auto={starred && starAuto ? '1' : undefined}
            onClick={e => { e.stopPropagation(); onStar(); }}
            title={starred ? (starAuto ? ui.planAutoPicked : ui.planIsMain) : ui.planMakeMain}
            className={`absolute top-1 right-1 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border ${
              starred
                ? (starAuto ? 'bg-red-600 border-red-700 text-white opacity-100' : 'bg-amber-400 border-amber-500 text-white opacity-100')
                : 'bg-white/90 border-gray-200 text-slate-500 hover:text-amber-500 opacity-0 group-hover:opacity-100'}`}>
            <Star size={16} fill={starred ? 'currentColor' : 'none'} />
          </button>
        )}
        {/* The expand arrow — top-left. A look at the sheet, never a choice. */}
        {onPreview && (
          <button type="button"
            data-tile-preview={file.id}
            onClick={e => { e.stopPropagation(); onPreview(); }}
            title={ui.planPreviewTitle}
            className="absolute top-1 left-1 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border
                       bg-white/90 border-gray-200 text-[#1e3a5f] hover:text-[#4aa8d8] opacity-0 group-hover:opacity-100">
            <Maximize2 size={15} />
          </button>
        )}
      </div>
      <div className="px-2 py-1.5 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="flex-1 min-w-0 truncate text-[11.5px] font-semibold text-slate-700">{file.name}</span>
          <DownloadNote fileId={file.id} />
        </div>
        {sub && <div className="truncate text-[10px] text-slate-400">{sub}</div>}
        {(file.annotated || onOpenNewTab) && (
          <div className="flex items-center gap-1 mt-1">
            {file.annotated && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">
                marked up
              </span>
            )}
            <span className="flex-1" />
            {onOpenNewTab && (
              <button type="button" data-open-new-tab={file.id}
                onClick={e => { e.stopPropagation(); onOpenNewTab(); }}
                title="Open in a new tab"
                className="flex items-center gap-1 px-1.5 py-1 rounded-lg border border-gray-200 text-[10px]
                           font-bold text-[#1e3a5f] hover:border-[#4aa8d8] flex-shrink-0">
                <ExternalLink size={11} /> new tab
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The wait, drawn as tiles so the grid does not jump when the folder lands. */
export function SkeletonTiles({ hook = 'tile-skeleton', count = 3 }: { hook?: 'tile-skeleton' | 'plan-skeleton'; count?: number }) {
  const attr = hook === 'plan-skeleton' ? { 'data-plan-skeleton': '' } : { 'data-tile-skeleton': '' };
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} {...attr} className="rounded-xl border border-gray-100 overflow-hidden min-h-[112px] animate-pulse">
          <div className="h-[76px] bg-slate-200" />
          <div className="px-2 py-2"><div className="h-3 rounded bg-slate-200" style={{ width: `${70 - i * 14}%` }} /></div>
        </div>
      ))}
    </>
  );
}

/** The grid every tile view shares. */
export function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div data-tile-grid className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))' }}>
      {children}
    </div>
  );
}

/**
 * The job's Drive folder, browsed like Google Drive, drawn in the pane where
 * the sheet goes.
 *
 * The PATH lives with the host (per drawer open, never persisted), so a
 * preview can stand over the browser and Back can return to the very folder.
 * The listings themselves are cached here per folder id for the life of the
 * component, so a crumb pressed twice costs one round trip.
 */
export function PlanBrowser({
  path, onPath, starredId, starAuto, onStar, onPreview, onOpenMedia, onBack, onHide, currentId, hidden = false,
}: {
  /**
   * A preview is standing over the browser. It stays MOUNTED — same folder,
   * same listing, same scroll offset (visibility keeps layout, so the
   * scroller holds its place) — and is merely invisible until Back.
   */
  hidden?: boolean;
  /** The breadcrumb: the job folder first, then each folder stepped into. */
  path: Crumb[];
  onPath: (next: Crumb[]) => void;
  /** The starred file — the apartment's plansPdfLink. */
  starredId: string | null;
  /** `starredId` is the app's latest-activity guess, not a person's star. */
  starAuto?: boolean;
  onStar: (file: TileFile) => void;
  /** Open this sheet in the pane, from THIS folder (named so Back can say where it goes). */
  onPreview: (file: TileFile, folderName: string) => void;
  /**
   * Anything that is NOT a markable plan — a film, a picture, a memo, a
   * spreadsheet — opens in the host's full media viewer instead. Without
   * this a folder of site videos was a wall of dead grey badges.
   */
  onOpenMedia?: (file: TileFile, all: TileFile[]) => void;
  /** Offered when the pane has a sheet to go back to. */
  onBack?: () => void;
  /** The side pane's own "hide the plan" chevron. */
  onHide?: () => void;
  /** The sheet the pane was showing — its tile wears a ring. */
  currentId?: string | null;
}) {
  const ui = useStore(s => s.mainUiStrings);
  const folder = path[path.length - 1];
  const cache = useRef(new Map<string, { folders: DriveChild[]; files: DriveChild[] } | null>());
  const [listing, setListing] = useState<{ folders: DriveChild[]; files: DriveChild[] } | null | undefined>(
    () => cache.current.get(folder?.id ?? ''),
  );
  const [busy, setBusy] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!folder) return;
    let dead = false;
    if (cache.current.has(folder.id)) { setListing(cache.current.get(folder.id)); return; }
    setListing(undefined);
    setBusy(true);
    listFolderChildrenViaBackend(folder.id).then(res => {
      if (dead) return;
      cache.current.set(folder.id, res);
      setListing(res);
      setBusy(false);
    });
    return () => { dead = true; };
  }, [folder?.id]);

  // A fresh folder opens at its top; a folder come back to keeps its place
  // (the scroller is the same node and was never unmounted during a preview).
  const lastFolder = useRef(folder?.id);
  useEffect(() => {
    if (lastFolder.current !== folder?.id) {
      lastFolder.current = folder?.id;
      scrollerRef.current?.scrollTo({ top: 0 });
    }
  }, [folder?.id]);

  if (!folder) return null;
  const isRtl = ui.isRtl;
  const Back = isRtl ? ChevronRight : ChevronLeft;

  return (
    <div data-plan-browser className="h-full flex flex-col min-h-0"
      style={{ backgroundColor: '#f8fafc', visibility: hidden ? 'hidden' : 'visible' }}>
      {/* The breadcrumb, on the pane's navy. */}
      <div className="flex items-center gap-1 min-w-0 px-2 py-1.5 flex-shrink-0" style={{ backgroundColor: '#1e3a5f' }}>
        {onBack && (
          <button type="button" data-browser-back onClick={onBack} title={ui.planBackToPlan}
            className="flex items-center gap-0.5 px-1.5 py-1 min-h-[30px] rounded-lg text-[11px] font-bold text-white/90 hover:bg-white/15 flex-shrink-0">
            <Back size={14} /> {ui.planBackToPlan}
          </button>
        )}
        <div data-plan-crumbs className="flex items-center gap-0.5 min-w-0 flex-1 overflow-x-auto no-bar">
          {path.map((c, i) => {
            const last = i === path.length - 1;
            return (
              <React.Fragment key={c.id + i}>
                {i > 0 && <ChevronRight size={12} className={`text-white/50 flex-shrink-0 ${isRtl ? 'rotate-180' : ''}`} />}
                <button type="button" data-crumb={c.id} disabled={last}
                  onClick={() => onPath(path.slice(0, i + 1))}
                  title={c.name}
                  className={`px-1.5 py-1 min-h-[30px] rounded-lg text-[11.5px] whitespace-nowrap max-w-[180px] truncate ${
                    last ? 'text-white font-extrabold' : 'text-white/75 font-semibold hover:bg-white/15'}`}>
                  {c.name}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        {busy && <Loader2 size={13} className="animate-spin text-white/70 flex-shrink-0" />}
        {onHide && (
          <button type="button" onClick={onHide} title="Hide the plan"
            className="p-1.5 rounded-lg text-white/70 hover:bg-white/15 flex-shrink-0">
            <X size={14} />
          </button>
        )}
      </div>

      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto p-2.5">
        {listing === undefined && (
          <TileGrid><SkeletonTiles count={6} /></TileGrid>
        )}
        {listing === null && (
          <p data-browser-unreachable className="px-2 py-6 text-center text-[12px] text-gray-500">
            {ui.planFolderUnreachable}
          </p>
        )}
        {listing && listing.folders.length + listing.files.length === 0 && (
          <p data-browser-empty className="px-2 py-6 text-center text-[12px] text-gray-400">{ui.planFolderEmpty}</p>
        )}
        {listing && (
          <TileGrid>
            {listing.folders.map(f => (
              <FolderTile key={f.id} id={f.id} name={f.name} onOpen={() => onPath([...path, { id: f.id, name: f.name }])} />
            ))}
            {listing.files.map(f => {
              const tile: TileFile = { id: f.id, name: f.name, isImage: f.isImage, viewable: f.viewable, mimeType: f.mimeType };
              const all: TileFile[] = listing.files.map(x => ({
                id: x.id, name: x.name, isImage: x.isImage, viewable: x.viewable, mimeType: x.mimeType,
              }));
              // A markable sheet goes to the pane; everything else opens in
              // the viewer, so no file in a Drive folder is a dead tile.
              const open = f.viewable
                ? () => onPreview(f, folder.name)
                : onOpenMedia ? () => onOpenMedia(tile, all) : undefined;
              return (
                <FileTile
                  key={f.id}
                  file={tile}
                  starred={starredId === f.id}
                  starAuto={starAuto}
                  current={currentId === f.id}
                  onOpen={open}
                  onStar={f.viewable ? () => onStar(f) : undefined}
                  onPreview={open}
                />
              );
            })}
          </TileGrid>
        )}
      </div>
    </div>
  );
}
