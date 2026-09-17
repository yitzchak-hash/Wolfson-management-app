import React from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ChevronLeft, ChevronRight, FileText, Maximize2, Minimize2, Info, ExternalLink } from 'lucide-react';
import { VoiceMemoPlayer } from './VoiceMemo';
import { mediaKindOf } from '../../data/mediaKind';
import { driveThumbUrl, driveDownloadUrl, drivePreviewUrl } from '../../data/driveApi';

/**
 * One thing to look at. `src` is what the app can DRAW (a Storage url, a data
 * url, a Drive thumbnail); `downloadHref` is what it hands over.
 */
export interface ViewerItem {
  fileId?: string;
  filename: string;
  mimeType?: string;
  /** What to draw. Absent for a Drive file — the viewer works one out. */
  src?: string;
  downloadHref?: string;
  transcript?: string;
  /** Shown in the info panel when the host knows them. */
  sizeBytes?: number;
  who?: string;
  when?: string;
  note?: string;
}

function niceSize(n?: number): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** The address that draws this item, worked out once per kind. */
function drawSrc(it: ViewerItem, kind: string): string {
  if (it.src) return it.src;
  if (!it.fileId) return '';
  // A Drive VIDEO has no playable address — its bytes come through the app's
  // own route; a picture draws from the thumbnail service; a sheet from the
  // preview frame. (The standing rule: a Drive web VIEW link is a PAGE.)
  if (kind === 'image') return driveThumbUrl(it.fileId, 1600);
  return '';
}

/**
 * The one full-screen viewer — pictures, films, memos, sheets and plain files
 * — with the things a person expects on a viewer: the name, a page count when
 * there are several, an INFO panel, FULL SCREEN, and Download.
 *
 * Portalled to the body: every host that opens it (the drawer, a thread
 * bubble, the Drive browser) sits inside a transformed or clipped subtree,
 * where no z-index can lift a child out.
 */
export function MediaViewer({
  items, initialIndex = 0, onClose, lang = 'en',
  imageUnavailable = 'This picture would not load', openDownload = 'Open / download', downloadLabel = 'Download',
}: {
  items: ViewerItem[];
  initialIndex?: number;
  onClose: () => void;
  lang?: 'en' | 'he' | 'ru';
  imageUnavailable?: string;
  openDownload?: string;
  downloadLabel?: string;
}) {
  const [idx, setIdx] = React.useState(initialIndex);
  const [touchStart, setTouchStart] = React.useState<number | null>(null);
  const [showInfo, setShowInfo] = React.useState(false);
  const [isFull, setIsFull] = React.useState(false);
  const [bytesSrc, setBytesSrc] = React.useState<string | null>(null);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const item = items[Math.min(idx, items.length - 1)];
  const kind = mediaKindOf(item?.filename, item?.mimeType);
  const shown = drawSrc(item ?? { filename: '' }, kind);
  /**
   * A Drive THUMBNAIL is a picture of the first frame — never something a
   * <video> can play. Hosts hand the same `src` to every kind, so the rule
   * lives here once: a thumbnail address is not a video source, and the
   * bytes are fetched instead.
   */
  const playable = item?.src && !/drive\.google\.com\/thumbnail/.test(item.src) ? item.src : null;
  const prev = React.useCallback(() => setIdx(i => Math.max(0, i - 1)), []);
  const next = React.useCallback(() => setIdx(i => Math.min(items.length - 1, i + 1)), [items.length]);

  // A new item is a fresh load: nothing carried over from the last one.
  React.useEffect(() => { setBytesSrc(null); setLoadFailed(false); }, [idx]);

  /**
   * A Drive VIDEO (or sheet we mean to draw) has no address a <video> can
   * play, so its bytes come down through the app's own route on OPEN — never
   * on mount of a tile, which would fetch every film in the folder.
   */
  React.useEffect(() => {
    if (!item?.fileId || playable || kind !== 'video') return;
    let dead = false; let url = '';
    (async () => {
      try {
        const { fetchPlanBytes } = await import('../../data/driveApi');
        const bytes = await fetchPlanBytes(item.fileId!);
        if (dead || !bytes) { if (!dead) setLoadFailed(true); return; }
        url = URL.createObjectURL(new Blob([bytes as ArrayBuffer], { type: item.mimeType || 'video/mp4' }));
        setBytesSrc(url);
      } catch { if (!dead) setLoadFailed(true); }
    })();
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [item?.fileId, playable, kind, item?.mimeType]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    // Capture, so a host that also listens for Escape (the drawer) does not
    // close itself behind the viewer.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [prev, next, onClose]);

  React.useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  if (!item) return null;
  const href = item.downloadHref || (item.fileId ? driveDownloadUrl(item.fileId) : item.src);

  const body = (
    <div
      ref={rootRef}
      data-media-viewer
      className="fixed inset-0 z-[300] bg-black flex flex-col select-none"
      onTouchStart={e => setTouchStart(e.touches[0].clientX)}
      onTouchEnd={e => {
        if (touchStart === null) return;
        const d = touchStart - e.changedTouches[0].clientX;
        if (d > 60) next(); else if (d < -60) prev();
        setTouchStart(null);
      }}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-black/80 flex-shrink-0">
        <span className="text-white text-sm font-medium truncate min-w-0">{item.filename}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {items.length > 1 && <span className="text-gray-400 text-xs tabular-nums me-1">{idx + 1} / {items.length}</span>}
          <button data-viewer-info onClick={() => setShowInfo(v => !v)}
            title="About this file"
            className={`p-2 rounded-lg ${showInfo ? 'text-white bg-white/15' : 'text-gray-300 hover:text-white'}`}>
            <Info size={18} />
          </button>
          <button data-viewer-full onClick={toggleFull} title={isFull ? 'Exit full screen' : 'Full screen'}
            className="p-2 rounded-lg text-gray-300 hover:text-white">
            {isFull ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          {item.fileId && (
            <a data-viewer-drive href={`https://drive.google.com/file/d/${item.fileId}/view`} target="_blank" rel="noopener noreferrer"
              title="Open in Google Drive" className="p-2 rounded-lg text-gray-300 hover:text-white">
              <ExternalLink size={18} />
            </a>
          )}
          {href && (
            <a data-viewer-download href={href} target="_blank" rel="noopener noreferrer"
              download={!item.fileId ? item.filename : undefined}
              className="p-2 rounded-lg text-gray-300 hover:text-white" title={downloadLabel}>
              <Download size={18} />
            </a>
          )}
          <button data-viewer-close onClick={onClose} className="p-2 rounded-lg text-gray-300 hover:text-white"><X size={20} /></button>
        </div>
      </div>

      {showInfo && (
        <div data-viewer-info-panel className="px-4 py-2.5 bg-[#101820] text-[12px] text-gray-300 flex-shrink-0 border-b border-white/10">
          <div className="grid gap-x-6 gap-y-1" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div><span className="text-gray-500">Name </span>{item.filename}</div>
            <div><span className="text-gray-500">Type </span>{item.mimeType || kind}</div>
            {item.sizeBytes ? <div><span className="text-gray-500">Size </span>{niceSize(item.sizeBytes)}</div> : null}
            {item.who ? <div><span className="text-gray-500">From </span>{item.who}</div> : null}
            {item.when ? <div><span className="text-gray-500">When </span>{item.when}</div> : null}
            {item.note ? <div className="col-span-full">{item.note}</div> : null}
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center relative overflow-hidden px-12">
        {kind === 'audio' ? (
          <div className="flex items-center justify-center w-full h-full p-6">
            <VoiceMemoPlayer src={playable || href || ''} className="max-w-[420px] w-full"
              transcript={item.transcript} lang={lang} saidLabel={lang === 'he' ? 'נאמר' : lang === 'ru' ? 'Сказано' : 'Said'} />
          </div>
        ) : kind === 'image' ? (
          shown && !loadFailed
            ? <img data-viewer-image src={shown} alt={item.filename} className="max-w-full max-h-full object-contain"
                draggable={false} onError={() => setLoadFailed(true)} />
            : <div className="text-gray-500 text-sm">{imageUnavailable}</div>
        ) : kind === 'video' ? (
          (playable || bytesSrc) && !loadFailed
            ? <video data-viewer-video src={playable || bytesSrc!} controls autoPlay playsInline className="max-w-full max-h-full" />
            : loadFailed
              ? <div className="flex flex-col items-center gap-3">
                  <span className="text-gray-400 text-sm">{imageUnavailable}</span>
                  {href && <a href={href} target="_blank" rel="noopener noreferrer"
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium">{openDownload}</a>}
                </div>
              : <div data-viewer-loading className="text-gray-400 text-sm animate-pulse">…</div>
        ) : kind === 'pdf' && item.fileId ? (
          <iframe data-viewer-pdf src={drivePreviewUrl(item.fileId)} title={item.filename}
            className="w-full h-full bg-white rounded" />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <FileText size={56} className="text-blue-400" />
            <span className="text-white text-sm">{item.filename}</span>
            {href && (
              <a href={href} target="_blank" rel="noopener noreferrer"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium">
                {openDownload}
              </a>
            )}
          </div>
        )}
      </div>

      {idx > 0 && (
        <button data-viewer-prev onClick={prev}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white z-10">
          <ChevronLeft size={22} />
        </button>
      )}
      {idx < items.length - 1 && (
        <button data-viewer-next onClick={next}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white z-10">
          <ChevronRight size={22} />
        </button>
      )}

      {items.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-4 pt-2 flex-shrink-0">
          {items.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className={`rounded-full transition-all ${i === idx ? 'w-4 h-2 bg-white' : 'w-2 h-2 bg-gray-600 hover:bg-gray-400'}`} />
          ))}
        </div>
      )}
    </div>
  );

  return typeof document === 'undefined' ? body : createPortal(body, document.body);
}
