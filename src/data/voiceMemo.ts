import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isUploadBackendConfigured, extractFolderId,
  findOrCreateFolderViaBackend, uploadFileViaBackend,
} from './driveApi';

/**
 * Voice memos, shared.
 *
 * The board already had a recorder wired directly into GeneralJobsPage. Notes,
 * tasks and the worker portal need the same thing, and a second copy of
 * MediaRecorder plumbing is how two recorders end up disagreeing about what a
 * memo is. This module is the whole mechanism; the components in
 * components/ui/VoiceMemo.tsx are only its face.
 *
 * On the look: this deliberately implements the FAMILIAR INTERACTION — hold to
 * record, a running timer, a live level trace, cancel or send, then a bubble
 * with play/scrub/speed. The interaction is the part worth copying. None of
 * WhatsApp's artwork, icons or wording is used, and none should be added.
 */

/** Bars kept for the live trace while recording. */
const LIVE_BARS = 34;

export interface RecordedMemo {
  blob: Blob;
  seconds: number;
  /** Normalised 0..1 levels, cheap enough to store beside the memo. */
  peaks: number[];
}

export interface VoiceRecorder {
  state: 'idle' | 'recording' | 'stopping';
  seconds: number;
  /** Live level bars, newest last, for the trace while recording. */
  levels: number[];
  error: string | null;
  start: () => Promise<void>;
  /** Finish and hand back the memo. */
  stop: () => Promise<RecordedMemo | null>;
  /** Throw it away — nothing is handed back and nothing is stored. */
  cancel: () => void;
}

/**
 * Pick a container the browser will actually give us.
 *
 * Safari on iOS records mp4/aac and does not accept the webm/opus that Chrome
 * prefers; asking for an unsupported type makes the constructor throw, which on
 * a phone reads as "the microphone is broken". An empty string means "you
 * choose", which every implementation honours.
 */
function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
  ];
  const supported = (window as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!supported?.isTypeSupported) return '';
  return candidates.find(t => supported.isTypeSupported(t)) ?? '';
}

export function useVoiceRecorder(): VoiceRecorder {
  const [state, setState] = useState<VoiceRecorder['state']>('idle');
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedRef = useRef(0);
  const rafRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const peaksRef = useRef<number[]>([]);
  const cancelledRef = useRef(false);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    recRef.current = null;
  }, []);

  // A recorder left running because the view unmounted keeps the phone's
  // microphone light on, which is alarming and looks like spying.
  useEffect(() => () => {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    teardown();
  }, [teardown]);

  const start = useCallback(async () => {
    setError(null);
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      peaksRef.current = [];
      rec.ondataavailable = ev => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      recRef.current = rec;
      startedRef.current = Date.now();
      rec.start();
      setState('recording');
      setSeconds(0);
      setLevels([]);

      // Live level trace. An analyser is the cheap way to get "is this person
      // actually talking" without decoding anything.
      const Ctx = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128);
          const level = Math.min(1, peak * 1.6);
          peaksRef.current.push(level);
          setLevels(prev => [...prev, level].slice(-LIVE_BARS));
          setSeconds(Math.floor((Date.now() - startedRef.current) / 1000));
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } else {
        const t = window.setInterval(
          () => setSeconds(Math.floor((Date.now() - startedRef.current) / 1000)), 250);
        rafRef.current = t as unknown as number;
      }
    } catch {
      setState('idle');
      setError('Microphone not available');
      teardown();
    }
  }, [teardown]);

  const stop = useCallback(async (): Promise<RecordedMemo | null> => {
    const rec = recRef.current;
    if (!rec || rec.state === 'inactive') { setState('idle'); return null; }
    setState('stopping');
    const seconds = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
    const raw = peaksRef.current;

    const memo = await new Promise<RecordedMemo | null>(resolve => {
      rec.onstop = () => {
        if (cancelledRef.current) { resolve(null); return; }
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        resolve({ blob, seconds, peaks: squash(raw, 40) });
      };
      try { rec.stop(); } catch { resolve(null); }
    });

    teardown();
    setState('idle');
    setLevels([]);
    setSeconds(0);
    return memo;
  }, [teardown]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    teardown();
    setState('idle');
    setLevels([]);
    setSeconds(0);
  }, [teardown]);

  return { state, seconds, levels, error, start, stop, cancel };
}

/**
 * Reduce a long level trace to a fixed number of bars.
 *
 * Sampling every Nth value instead would make a memo's shape depend on the
 * frame rate of the machine that recorded it, so the same words would draw a
 * different picture on a phone and a desktop.
 */
export function squash(values: number[], n: number): number[] {
  if (!values.length) return new Array(n).fill(0.12);
  const out: number[] = [];
  const per = values.length / n;
  for (let i = 0; i < n; i++) {
    const from = Math.floor(i * per);
    const to = Math.max(from + 1, Math.floor((i + 1) * per));
    let peak = 0;
    for (let j = from; j < to && j < values.length; j++) peak = Math.max(peak, values[j]);
    // A floor so silence still draws a line rather than a gap.
    out.push(Math.max(0.08, Math.min(1, peak)));
  }
  return out;
}

/** mm:ss — a memo is never long enough to need hours. */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Where a memo goes.
 *
 * Drive first, exactly like every other upload in this app, because a base64
 * memo lives in the record and the Firestore document limit is real. Without a
 * Drive folder configured a short memo still works locally, and a long one is
 * refused OUT LOUD rather than being silently cut off — the caller shows the
 * returned reason.
 */
export const LOCAL_MEMO_LIMIT = 700_000;

export async function storeVoiceMemo(
  blob: Blob,
  seconds: number,
  driveFolderLink: string | undefined,
  subfolder = 'Voice Memos',
): Promise<{ url: string } | { error: string }> {
  const parent = driveFolderLink ? extractFolderId(driveFolderLink) : null;
  if (isUploadBackendConfigured() && parent) {
    try {
      const folderId = await findOrCreateFolderViaBackend(parent, subfolder);
      const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('mpeg') ? 'mp3' : 'webm';
      const file = new File([blob], `memo-${Date.now()}.${ext}`, { type: blob.type || 'audio/webm' });
      const res = await uploadFileViaBackend(folderId, file);
      if (res?.webViewLink) return { url: res.webViewLink };
    } catch {
      // fall through to the local path
    }
  }
  if (blob.size > LOCAL_MEMO_LIMIT) {
    return { error: `That memo is too long to keep on this device (${clock(seconds)}). Set the Drive folder in App settings and it will upload instead.` };
  }
  const url = await new Promise<string | null>(resolve => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(blob);
  });
  return url ? { url } : { error: 'That memo could not be saved.' };
}

/** The speeds the player cycles through, in order. */
export const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
