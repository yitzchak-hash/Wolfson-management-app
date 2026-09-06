import React, { useEffect, useRef, useState } from 'react';
import { Mic, Trash2, Send, Play, Pause, Loader2 } from 'lucide-react';
import {
  useVoiceRecorder, clock, squash, PLAYBACK_SPEEDS, PlaybackSpeed, RecordedMemo,
} from '../../data/voiceMemo';
import { extractFileId, fetchPlanBytes, isUploadBackendConfigured } from '../../data/driveApi';
import { useTranscript } from '../../data/transcribe';
import { Translated } from './Translated';
import type { Lang } from '../../data/translate';

/**
 * The face of a voice memo — recorder and player.
 *
 * The mechanism lives in data/voiceMemo.ts. This file is only what it looks
 * like, and it implements the familiar interaction on purpose: a microphone
 * that becomes a running timer with a live trace, a bin and a send, then a
 * card you can play, scrub and speed up, with the WORDS under the bars.
 * No third-party artwork or wording.
 *
 * Every target here is at least 32px, because these are used from a worker's
 * phone on a site, one-handed, and CLAUDE.md counts anything smaller as a
 * coin flip.
 */

// ── Recorder ────────────────────────────────────────────────────────────────

export function VoiceRecorderButton({
  onRecorded, disabled, busy, title = 'Record a voice memo', compact, label, big,
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
  /**
   * The BIG navy microphone at the end of a message box (the worker's phone,
   * owner 2026-09-03) — the familiar one: press to record, the strip with
   * the timer, the bin and Send takes the box's place while it runs.
   */
  big?: boolean;
}) {
  const rec = useVoiceRecorder();
  const recording = rec.state !== 'idle';

  async function finish() {
    const memo = await rec.stop();
    if (memo) await onRecorded(memo);
  }

  if (!recording && big) {
    return (
      <button
        type="button"
        data-big-mic
        onClick={() => { void rec.start(); }}
        disabled={disabled || busy}
        title={rec.error ?? title}
        className="flex items-center justify-center w-11 h-11 rounded-full text-white flex-shrink-0
                   disabled:opacity-40 active:scale-95 transition-transform"
        style={{ backgroundColor: rec.error ? '#dc2626' : '#1e3a5f', boxShadow: '0 6px 14px -6px rgba(30,58,95,.7)' }}
      >
        {busy ? <Loader2 size={20} className="animate-spin" /> : <Mic size={20} />}
      </button>
    );
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
    <div data-recording-strip className="flex items-center gap-2 rounded-full bg-gray-100 border border-gray-200 px-2 py-1 flex-1 min-w-0">
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
        className="flex items-center justify-center w-9 h-9 rounded-full bg-[#1e3a5f] text-white
                   hover:bg-[#162d4a] disabled:opacity-50 flex-shrink-0"
      >
        {rec.state === 'stopping' ? <Loader2 size={14} className="animate-spin" /> : <Send size={15} />}
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

// ── The waveform ────────────────────────────────────────────────────────────

/**
 * The LINES of a recording, read off the audio itself.
 *
 * A memo stored as a file carries no peaks — the recorder's live trace dies
 * with the recorder — so a player drawn from stored data showed forty flat
 * 3px stubs, which the owner rightly could not see. The bytes are decoded
 * once (a phone decodes a two-minute memo in well under a second), squashed
 * to forty RMS bars, and remembered per source so scrolling a thread never
 * decodes twice. Decoding also answers the DURATION honestly: a WebM from
 * the recorder reports Infinity until it has been played through.
 */
const WAVE_CACHE = new Map<string, { peaks: number[]; seconds: number }>();
const BARS = 40;

function waveKey(src: string): string {
  return src.length > 200 ? `${src.slice(0, 120)}|${src.length}|${src.slice(-40)}` : src;
}

async function decodePeaks(src: string): Promise<{ peaks: number[]; seconds: number } | null> {
  const key = waveKey(src);
  const hit = WAVE_CACHE.get(key);
  if (hit) return hit;
  try {
    const bytes = await (await fetch(src)).arrayBuffer();
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctx) return null;
    const ac = new Ctx();
    const buf = await ac.decodeAudioData(bytes.slice(0));
    void ac.close?.();
    const data = buf.getChannelData(0);
    const per = Math.max(1, Math.floor(data.length / BARS));
    const raw: number[] = [];
    for (let i = 0; i < BARS; i++) {
      let sum = 0;
      const start = i * per;
      const end = Math.min(data.length, start + per);
      for (let j = start; j < end; j += 4) sum += data[j] * data[j];
      raw.push(Math.sqrt(sum / Math.max(1, (end - start) / 4)));
    }
    const max = Math.max(0.02, ...raw);
    const peaks = raw.map(v => Math.min(1, Math.pow(v / max, 0.7)));
    const out = { peaks, seconds: buf.duration };
    WAVE_CACHE.set(key, out);
    return out;
  } catch {
    return null;
  }
}

function useWaveform(src: string | null, given?: number[]): { peaks: number[]; seconds: number | null } {
  const [decoded, setDecoded] = useState<{ peaks: number[]; seconds: number } | null>(() => (src ? WAVE_CACHE.get(waveKey(src)) ?? null : null));
  useEffect(() => {
    if (!src || given?.length) return;
    const hit = WAVE_CACHE.get(waveKey(src));
    if (hit) { setDecoded(hit); return; }
    let live = true;
    void decodePeaks(src).then(r => { if (live && r) setDecoded(r); });
    return () => { live = false; };
  }, [src, given?.length]);
  if (given?.length) return { peaks: given.length === BARS ? given : squash(given, BARS), seconds: decoded?.seconds ?? null };
  return { peaks: decoded?.peaks ?? squash([], BARS), seconds: decoded?.seconds ?? null };
}

// ── Player ──────────────────────────────────────────────────────────────────

export function VoiceMemoPlayer({
  src, seconds, peaks, onDelete, className = '',
  transcript, onTranscript, lang, saidLabel = 'Said', who, at, tone = 'light',
}: {
  src: string;
  /** Known length, so the bubble reads right before the audio has loaded. */
  seconds?: number;
  peaks?: number[];
  onDelete?: () => void;
  className?: string;
  /**
   * The memo's WORDS (owner, 2026-09-03: every recording comes with its
   * transcription under it). Pass what the record already holds; when it
   * holds nothing the player asks the server once and hands the answer to
   * `onTranscript` so the host can keep it for every other device.
   */
  transcript?: string | null;
  onTranscript?: (text: string) => void;
  /** The READER's language — the words are translated into it, with Show original. */
  lang?: Lang | null;
  saidLabel?: string;
  /** A sign-off line under the card — the author and the time, small and grey. */
  who?: string;
  at?: string;
  /** `navy` draws the card for a dark surface (the worker's own bubble). */
  tone?: 'light' | 'navy';
}) {
  const words = useTranscript(src, transcript, onTranscript);
  const audioRef = useRef<HTMLAudioElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at_, setAt] = useState(0);
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
  const wave = useWaveform(playableSrc, peaks);
  const length = total > 0 && Number.isFinite(total) ? total : (wave.seconds ?? seconds ?? 0);

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

  const pct = length > 0 ? Math.min(1, at_ / length) : 0;
  const navy = tone === 'navy';
  const ink = navy ? '#ffffff' : '#1e3a5f';
  const rest = navy ? 'rgba(255,255,255,.35)' : '#c3ccd8';

  function toggle() {
    if (driveFileId && !fetched) { void fetchDriveAudio(); return; }
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) { void el.play(); setPlaying(true); }
    else { el.pause(); setPlaying(false); }
  }

  /** The bars are the scrubber — press or DRAG anywhere along them. */
  function seekFromPointer(e: React.PointerEvent<HTMLDivElement>) {
    const el = audioRef.current;
    const box = barsRef.current;
    if (!el || !box || !length) return;
    const r = box.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const rtl = getComputedStyle(box).direction === 'rtl';
    const t = (rtl ? 1 - f : f) * length;
    el.currentTime = t;
    setAt(t);
  }

  return (
    <div
      data-memo
      className={`flex flex-col gap-1.5 max-w-full rounded-2xl px-2.5 py-2 ${className}`}
      style={{ backgroundColor: navy ? 'rgba(255,255,255,.12)' : '#f3f6fa', border: navy ? '1px solid rgba(255,255,255,.18)' : '1px solid #e2e8f0' }}
    >
      <audio
        ref={audioRef}
        src={playableSrc ?? undefined}
        preload="metadata"
        onLoadedMetadata={e => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setTotal(d);
        }}
        onDurationChange={e => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setTotal(d);
        }}
        onTimeUpdate={e => setAt(e.currentTarget.currentTime)}
        onEnded={() => { setPlaying(false); setAt(0); }}
      />
      <div className="flex items-center gap-2.5">
        <button
          type="button" onClick={toggle}
          title={playing ? 'Pause' : 'Play'}
          data-memo-play
          className="flex items-center justify-center w-9 h-9 rounded-full text-white flex-shrink-0 active:scale-95"
          style={{ backgroundColor: navy ? '#ffffff' : '#1e3a5f', color: navy ? '#1e3a5f' : '#ffffff' }}
        >
          {fetching ? <Loader2 size={15} className="animate-spin" />
            : playing ? <Pause size={15} /> : <Play size={15} className="ms-0.5" />}
        </button>

        <div className="flex-1 min-w-[90px] flex flex-col gap-0.5">
          <div
            ref={barsRef}
            data-memo-bars
            className="relative flex items-center gap-[2px] h-7 cursor-pointer select-none touch-none"
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); seekFromPointer(e); }}
            onPointerMove={e => { if (e.buttons & 1) seekFromPointer(e); }}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(length)}
            aria-valuenow={Math.round(at_)}
            tabIndex={0}
          >
            {wave.peaks.map((v, i) => (
              <span
                key={i}
                className="flex-1 rounded-full"
                style={{
                  height: `${Math.max(3, v * 26)}px`,
                  backgroundColor: (i + 0.5) / wave.peaks.length <= pct ? ink : rest,
                  transition: 'background-color 80ms linear',
                }}
              />
            ))}
            {/* The knob — where you are, and what you drag. */}
            <span
              data-memo-knob
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full pointer-events-none"
              style={{ insetInlineStart: `${pct * 100}%`, backgroundColor: ink, boxShadow: '0 0 0 2px #fff, 0 1px 3px rgba(0,0,0,.35)' }}
            />
          </div>
          <div className="flex items-center gap-2 text-[10.5px] tabular-nums" style={{ color: navy ? 'rgba(255,255,255,.8)' : '#64748b' }}>
            <span data-memo-time>{clock(playing || at_ > 0 ? at_ : length)}</span>
            {(playing || at_ > 0) && length > 0 && <span className="opacity-60">/ {clock(length)}</span>}
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setSpeed(PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(speed) + 1) % PLAYBACK_SPEEDS.length])}
              title="Playback speed"
              className="min-w-[30px] h-6 px-1.5 rounded-full text-[10.5px] font-bold hover:bg-black/5"
              style={{ color: navy ? '#fff' : '#475569' }}
            >
              {speed}×
            </button>
            {onDelete && (
              <button
                type="button" onClick={onDelete} title="Delete memo"
                className="flex items-center justify-center w-7 h-7 rounded-full hover:text-red-500"
                style={{ color: navy ? 'rgba(255,255,255,.7)' : '#94a3b8' }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {words && (
        <div data-memo-transcript className="text-[13px] leading-snug px-0.5" style={{ color: navy ? '#fff' : '#1f2c3d' }}>
          <span className="block text-[9.5px] font-extrabold tracking-wider uppercase" style={{ color: navy ? 'rgba(255,255,255,.65)' : '#93a2b1' }}>{saidLabel}</span>
          <Translated text={words} to={lang} />
        </div>
      )}
      {(who || at) && (
        <div className="text-[10px] px-0.5" style={{ color: navy ? 'rgba(255,255,255,.65)' : '#94a3b8' }}>
          {[who, at].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );
}
