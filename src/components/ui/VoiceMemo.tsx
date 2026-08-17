import React, { useEffect, useRef, useState } from 'react';
import { Mic, Trash2, Send, Play, Pause, Loader2 } from 'lucide-react';
import {
  useVoiceRecorder, clock, squash, PLAYBACK_SPEEDS, PlaybackSpeed, RecordedMemo,
} from '../../data/voiceMemo';
import { extractFileId, fetchPlanBytes, isUploadBackendConfigured } from '../../data/driveApi';

/**
 * The face of a voice memo — recorder and player.
 *
 * The mechanism lives in data/voiceMemo.ts. This file is only what it looks
 * like, and it implements the familiar interaction on purpose: a microphone
 * that becomes a running timer with a live trace, a bin and a send, then a
 * bubble you can play, scrub and speed up. No third-party artwork or wording.
 *
 * Every target here is at least 32px, because these are used from a worker's
 * phone on a site, one-handed, and CLAUDE.md counts anything smaller as a
 * coin flip.
 */

// ── Recorder ────────────────────────────────────────────────────────────────

export function VoiceRecorderButton({
  onRecorded, disabled, busy, title = 'Record a voice memo', compact, label,
}: {
  onRecorded: (memo: RecordedMemo) => void | Promise<void>;
  disabled?: boolean;
  /** The caller is uploading — keep the control locked and say so. */
  busy?: boolean;
  title?: string;
  compact?: boolean;
  /**
   * Words beside the microphone.
   *
   * A bare grey icon sitting next to a button that SAYS "Attach" reads as
   * decoration — it was reported as "there is no voice option" on a screen
   * where the control was present the whole time. Where the row has room, say
   * what it is.
   */
  label?: string;
}) {
  const rec = useVoiceRecorder();
  const recording = rec.state !== 'idle';

  async function finish() {
    const memo = await rec.stop();
    if (memo) await onRecorded(memo);
  }

  if (!recording) {
    return (
      <button
        type="button"
        onClick={() => { void rec.start(); }}
        disabled={disabled || busy}
        title={rec.error ?? title}
        className={`flex items-center justify-center rounded-full transition-colors flex-shrink-0
                    ${compact ? 'w-8 h-8' : 'min-w-[36px] min-h-[36px] px-2'}
                    ${label ? 'border border-gray-200 rounded-lg px-2.5' : ''}
                    ${rec.error
                      ? 'text-red-400 hover:bg-red-50'
                      : 'text-gray-500 hover:text-[#1e3a5f] hover:bg-gray-100'}
                    disabled:opacity-40`}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
        {label && <span className="ml-1 text-xs font-medium">{label}</span>}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full bg-gray-100 border border-gray-200 px-2 py-1 flex-1 min-w-0">
      {/* Throw it away. Deliberately the LEFT-most control and never the one
          nearest the thumb's resting place, so "send" is not the easy miss. */}
      <button
        type="button"
        onClick={rec.cancel}
        title="Discard"
        className="flex items-center justify-center w-8 h-8 rounded-full text-red-500 hover:bg-red-50 flex-shrink-0"
      >
        <Trash2 size={15} />
      </button>

      <span className="flex items-center gap-1 flex-shrink-0">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[12px] font-semibold text-gray-700 tabular-nums">{clock(rec.seconds)}</span>
      </span>

      <LiveTrace levels={rec.levels} />

      <button
        type="button"
        onClick={() => { void finish(); }}
        disabled={rec.state === 'stopping'}
        title="Send"
        className="flex items-center justify-center w-8 h-8 rounded-full bg-[#1e3a5f] text-white
                   hover:bg-[#162d4a] disabled:opacity-50 flex-shrink-0"
      >
        {rec.state === 'stopping' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
      </button>
    </div>
  );
}

/** The live level trace while recording — newest bar on the right. */
function LiveTrace({ levels }: { levels: number[] }) {
  return (
    <div className="flex items-center gap-[2px] flex-1 min-w-0 h-6 overflow-hidden justify-end">
      {levels.map((v, i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-[#4aa8d8] flex-shrink-0"
          style={{ height: `${Math.max(3, v * 22)}px`, opacity: 0.35 + v * 0.65 }}
        />
      ))}
    </div>
  );
}

// ── Player ──────────────────────────────────────────────────────────────────

export function VoiceMemoPlayer({
  src, seconds, peaks, onDelete, className = '',
}: {
  src: string;
  /** Known length, so the bubble reads right before the audio has loaded. */
  seconds?: number;
  peaks?: number[];
  onDelete?: () => void;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [total, setTotal] = useState(seconds ?? 0);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);

  /**
   * A memo stored on Drive is a web VIEW link — an <audio> element cannot play
   * it. But the app already has a route that pipes a private Drive file's
   * BYTES (api/drive-fetch, built for plans), so the player fetches them into
   * a blob URL and plays inline like any local memo. Fetched lazily on the
   * first press of Play, never on render: a note thread can hold a dozen
   * memos, and downloading all of them to draw the list is the wrong trade.
   * Only when the backend is not configured — or the fetch fails — does it
   * fall back to the honest link-out.
   */
  const driveFileId = /drive\.google\.com|docs\.google\.com/.test(src) ? extractFileId(src) : null;
  const [fetched, setFetched] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const playableSrc = driveFileId ? fetched : src;

  // A blob URL holds the whole file in memory until revoked.
  useEffect(() => () => { if (fetched) URL.revokeObjectURL(fetched); }, [fetched]);

  async function fetchDriveAudio() {
    if (fetching || fetched || !driveFileId) return;
    setFetching(true);
    try {
      const bytes = await fetchPlanBytes(driveFileId);
      const url = URL.createObjectURL(new Blob([bytes]));
      setFetched(url);
      // Play as soon as the element has the source — the user already pressed.
      setTimeout(() => { void audioRef.current?.play(); setPlaying(true); }, 30);
    } catch {
      setFetchFailed(true);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = speed;
  }, [speed]);

  if (driveFileId && (fetchFailed || !isUploadBackendConfigured())) {
    return (
      <a
        href={src} target="_blank" rel="noopener noreferrer"
        className={`inline-flex items-center gap-2 rounded-full bg-gray-100 border border-gray-200
                    px-3 py-1.5 text-[12px] font-medium text-[#1e3a5f] hover:bg-gray-200 ${className}`}
      >
        <Play size={13} /> Voice memo{seconds ? ` · ${clock(seconds)}` : ''}
      </a>
    );
  }

  const bars = peaks?.length ? peaks : squash([], 40);
  const pct = total > 0 ? Math.min(1, at / total) : 0;

  function toggle() {
    if (driveFileId && !fetched) { void fetchDriveAudio(); return; }
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) { void el.play(); setPlaying(true); }
    else { el.pause(); setPlaying(false); }
  }

  function scrubTo(e: React.MouseEvent<HTMLDivElement>) {
    const el = audioRef.current;
    if (!el || !total) return;
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    el.currentTime = f * total;
    setAt(el.currentTime);
  }

  return (
    <div className={`flex items-center gap-2 rounded-full bg-gray-100 border border-gray-200 px-2 py-1 max-w-full ${className}`}>
      <audio
        ref={audioRef}
        src={playableSrc ?? undefined}
        preload="metadata"
        onLoadedMetadata={e => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setTotal(d);
        }}
        onTimeUpdate={e => setAt(e.currentTarget.currentTime)}
        onEnded={() => { setPlaying(false); setAt(0); }}
      />

      <button
        type="button" onClick={toggle}
        title={playing ? 'Pause' : 'Play'}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-[#1e3a5f] text-white flex-shrink-0"
      >
        {fetching ? <Loader2 size={14} className="animate-spin" />
          : playing ? <Pause size={14} /> : <Play size={14} />}
      </button>

      {/* The bars ARE the scrubber — a separate slider underneath would be a
          second target for the same job in a control this small. */}
      <div
        className="flex items-center gap-[2px] h-6 flex-1 min-w-[70px] cursor-pointer"
        onClick={scrubTo}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(at)}
        tabIndex={0}
      >
        {bars.map((v, i) => (
          <span
            key={i}
            className="flex-1 rounded-full"
            style={{
              height: `${Math.max(3, v * 22)}px`,
              backgroundColor: i / bars.length <= pct ? '#1e3a5f' : '#cbd5e1',
            }}
          />
        ))}
      </div>

      <span className="text-[11px] text-gray-500 tabular-nums flex-shrink-0">
        {clock(playing || at > 0 ? at : total)}
      </span>

      <button
        type="button"
        onClick={() => setSpeed(PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(speed) + 1) % PLAYBACK_SPEEDS.length])}
        title="Playback speed"
        className="min-w-[32px] h-8 px-1 rounded-full text-[11px] font-bold text-gray-600
                   hover:bg-gray-200 flex-shrink-0"
      >
        {speed}×
      </button>

      {onDelete && (
        <button
          type="button" onClick={onDelete} title="Delete memo"
          className="flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-red-500 flex-shrink-0"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
