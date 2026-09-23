/**
 * The tiles the photo widgets draw, and the viewer they open.
 *
 * A tile is a BUTTON: on the wall a tap opens the picture or the film full
 * size in the app's one viewer (play, sound, full screen, close — the
 * browser's own controls for a film). The owner's ask, 2026-09-23: "from the
 * TV it needs to be touchable and expandable with a normal play, minimize,
 * sound control if it's a video; a photo is a photo".
 *
 * Two traps the tile carries: `data-no-drag data-el-action` + its own
 * stopPropagation, or the board node under it captures the pointer and the
 * click is retargeted away (the standing capture trap); and the viewer is
 * rendered through `Seal`, because a portal's React events bubble through
 * the REACT tree into the node that hosts it.
 */
import React, { useCallback, useState } from 'react';
import { Play } from 'lucide-react';
import { relativeTime } from '../../types';
import { MediaViewer } from '../ui/MediaViewer';
import { SiteShot, isFreshShot, viewerItemsOf } from '../../data/sitePhotos';

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Wraps a portal so nothing it does reaches the board node hosting it. */
export function Seal({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'contents' }}
      onPointerDown={stop} onPointerUp={stop} onPointerMove={stop} onClick={stop} onDoubleClick={stop}
      onMouseDown={stop} onMouseUp={stop} onContextMenu={stop} onKeyDown={stop} onWheel={stop} onTouchStart={stop}>
      {children}
    </div>
  );
}

/** The viewer as a hook: `open(shots, at)` and the node to render. */
export function useShotViewer(): { open: (shots: SiteShot[], at: number) => void; node: React.ReactNode } {
  const [state, setState] = useState<{ shots: SiteShot[]; at: number } | null>(null);
  const open = useCallback((shots: SiteShot[], at: number) => setState({ shots, at }), []);
  const node = state ? (
    <Seal>
      <MediaViewer items={viewerItemsOf(state.shots)} initialIndex={state.at} onClose={() => setState(null)} />
    </Seal>
  ) : null;
  return { open, node };
}

/**
 * One thumbnail. A film with a playable address draws its own first frame;
 * a Drive film draws Drive's thumbnail of it; either wears a play mark.
 */
export function ShotTile({ shot, onOpen, caption = true, size = 1, className = '', style }: {
  shot: SiteShot; onOpen: () => void; caption?: boolean; size?: number; className?: string; style?: React.CSSProperties;
}) {
  const fresh = isFreshShot(shot);
  const video = shot.kind === 'video';
  const useVideoFrame = video && !!shot.playable && !shot.thumb;
  return (
    <button type="button" data-no-drag data-el-action data-site-shot={shot.id} data-shot-kind={shot.kind}
      data-fresh={fresh ? '1' : undefined}
      onPointerDown={stop} onClick={e => { e.stopPropagation(); onOpen(); }}
      title={[shot.jobName, shot.projectLabel, shot.who, relativeTime(shot.at)].filter(Boolean).join(' · ')}
      className={`relative overflow-hidden rounded-md bg-slate-200 text-left cursor-pointer focus:outline-none ${fresh ? 'ring-2 ring-[#4aa8d8]' : ''} ${className}`}
      style={style}>
      {useVideoFrame
        ? <video src={shot.playable} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
        : <img src={shot.thumb || shot.playable} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" loading="lazy" />}
      {video && (
        <span data-shot-play className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="rounded-full bg-black/55 text-white flex items-center justify-center"
            style={{ width: 26 * size, height: 26 * size }}>
            <Play size={13 * size} fill="currentColor" style={{ marginInlineStart: 2 }} />
          </span>
        </span>
      )}
      {fresh && (
        <span data-shot-new className="absolute top-1 start-1 rounded px-1 bg-[#4aa8d8] text-white font-extrabold uppercase tracking-wide"
          style={{ fontSize: 8 * size, lineHeight: `${12 * size}px` }}>new</span>
      )}
      {caption && (
        <span className="absolute inset-x-0 bottom-0 px-1.5 pb-1 pt-3 text-white flex flex-col gap-0 pointer-events-none"
          style={{ background: 'linear-gradient(0deg, rgba(15,23,42,.8), transparent)', fontSize: 9 * size, lineHeight: 1.25 }}>
          <span className="font-bold truncate">{shot.jobName || shot.who || '—'}</span>
          <span className="flex items-center gap-1 opacity-90 truncate">
            {shot.projectLabel && (
              <span data-shot-ws className="inline-flex items-center gap-1 truncate">
                <span className="inline-block rounded-full flex-shrink-0" style={{ width: 6 * size, height: 6 * size, background: shot.projectColor }} />
                <span className="truncate">{shot.projectLabel}</span>
              </span>
            )}
            <span className="ms-auto flex-shrink-0">{relativeTime(shot.at)}</span>
          </span>
        </span>
      )}
    </button>
  );
}
