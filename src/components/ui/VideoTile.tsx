import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Maximize2, Play } from 'lucide-react';
import { driveThumbUrl, fetchPlanBytes } from '../../data/driveApi';

/**
 * A VIDEO as a picture you press (owner, 2026-09-06: "when uploading a video
 * there isn't a thumbnail with a play button and a full screen option").
 *
 * Before play it is a still — the video's own first frame when the file is
 * playable in place (Firebase Storage, a local data URL), Drive's generated
 * thumbnail otherwise — with a big play button over it and a full-screen
 * button in the corner. Press play and it plays right there with the
 * browser's controls; press the corner and the video itself goes full
 * screen (iPhone Safari has its own door, `webkitEnterFullscreen`).
 *
 * A Drive-only video has no playable address (a web VIEW link is a page,
 * not a stream), so the bytes come down through the app's own
 * /api/drive-fetch on the FIRST press — never before, or opening a thread
 * with six videos in it would download six videos.
 */
export function VideoTile({ src, driveFileId, filename, mimeType, className = '', maxWidth = 230, onError }: {
  /** A playable address — storageUrl, a data URL, a blob URL. */
  src?: string | null;
  driveFileId?: string;
  filename?: string;
  mimeType?: string;
  className?: string;
  maxWidth?: number;
  onError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const playable = src || blobUrl || null;
  const poster = !playable && driveFileId ? driveThumbUrl(driveFileId, 800) : null;

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  async function ensureBytes(): Promise<string | null> {
    if (playable) return playable;
    if (!driveFileId) return null;
    setLoading(true);
    try {
      const buf = await fetchPlanBytes(driveFileId);
      const url = URL.createObjectURL(new Blob([buf], { type: mimeType || 'video/mp4' }));
      setBlobUrl(url);
      return url;
    } catch {
      onError?.();
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function play(e: React.MouseEvent) {
    e.stopPropagation();
    const url = await ensureBytes();
    if (!url) return;
    setPlaying(true);
    // The element mounts with its source on the next paint.
    requestAnimationFrame(() => { void videoRef.current?.play().catch(() => undefined); });
  }

  async function fullScreen(e: React.MouseEvent) {
    e.stopPropagation();
    const url = await ensureBytes();
    if (!url) return;
    setPlaying(true);
    requestAnimationFrame(() => {
      const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
      if (!v) return;
      void v.play().catch(() => undefined);
      if (v.requestFullscreen) void v.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
      else v.webkitEnterFullscreen?.();
    });
  }

  return (
    <div
      data-video-tile
      className={`relative rounded-[9px] overflow-hidden bg-black ${className}`}
      // A definite width: the bubble around it is shrink-to-fit, and a
      // percentage width inside one collapses to nothing.
      style={{ width: maxWidth, maxWidth: '100%', aspectRatio: '16 / 9' }}
      onClick={e => e.stopPropagation()}
    >
      {playable ? (
        <video
          ref={videoRef}
          src={playable}
          preload="metadata"
          playsInline
          controls={playing}
          muted={!playing}
          className="absolute inset-0 w-full h-full object-contain"
          onEnded={() => setPlaying(false)}
        />
      ) : poster ? (
        <img src={poster} alt={filename ?? 'video'} className="absolute inset-0 w-full h-full object-cover opacity-90" />
      ) : (
        <div className="absolute inset-0 flex items-end p-2">
          <span className="text-white/60 text-[10px] truncate">{filename}</span>
        </div>
      )}
      {!playing && (
        <button
          type="button"
          data-video-play
          onClick={play}
          className="absolute inset-0 flex items-center justify-center"
          title="Play"
        >
          <span className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg"
            style={{ backgroundColor: 'rgba(30,58,95,.85)', border: '2px solid rgba(255,255,255,.85)' }}>
            {loading ? <Loader2 size={20} className="animate-spin" /> : <Play size={22} className="ms-0.5" fill="currentColor" />}
          </span>
        </button>
      )}
      <button
        type="button"
        data-video-full
        onClick={fullScreen}
        className="absolute top-1.5 end-1.5 w-7 h-7 rounded-full flex items-center justify-center text-white"
        style={{ backgroundColor: 'rgba(0,0,0,.55)' }}
        title="Full screen"
      >
        <Maximize2 size={13} />
      </button>
    </div>
  );
}
