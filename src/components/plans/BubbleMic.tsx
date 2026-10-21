/**
 * The speech bubble's microphone (owner, 2026-10-21): a tiny button in the
 * open balloon's bottom-right corner. Press it and talk; the words fill the
 * balloon as you go — the recording so far is sent to the transcriber every
 * few seconds (no language is named, the model hears it), and a last pass
 * when you press it again gives the finished words.
 *
 * The press never takes focus from the balloon's text box (mousedown is
 * prevented), because leaving that box is what commits the balloon.
 */
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { transcribeBlob, transcriptionAvailable } from '../../data/transcribe';

const LIVE_EVERY_MS = 2500;
const MAX_SECONDS = 120;

function pickType(): string {
  const MR = (window as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!MR?.isTypeSupported) return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MR.isTypeSupported(t)) ?? '';
}

export function BubbleMic({ onWords, color = '#1e3a5f' }: {
  /** The words heard so far (`final` once the last pass is in). */
  onWords: (text: string, final: boolean) => void;
  color?: string;
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'finishing'>('idle');
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const typeRef = useRef('');
  const busy = useRef(false);
  const sentLen = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const onWordsRef = useRef(onWords);
  onWordsRef.current = onWords;
  const alive = useRef(true);

  const stopAll = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };
  useEffect(() => {
    alive.current = true;   // StrictMode mounts twice; the second mount is alive again
    return () => {
      alive.current = false;
      try { recRef.current?.stop(); } catch { /* already stopped */ }
      stopAll();
    };
  }, []);

  const blobNow = () => new Blob(chunks.current, { type: typeRef.current || 'audio/webm' });

  async function liveTick() {
    setSeconds(Math.round((Date.now() - startedAt.current) / 1000));
    if (Date.now() - startedAt.current > MAX_SECONDS * 1000) { void finish(); return; }
    if (busy.current || chunks.current.length === sentLen.current) return;
    busy.current = true;
    sentLen.current = chunks.current.length;
    const text = await transcribeBlob(blobNow());
    busy.current = false;
    if (alive.current && text && recRef.current) onWordsRef.current(text, false);
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      typeRef.current = pickType();
      const rec = typeRef.current ? new MediaRecorder(stream, { mimeType: typeRef.current }) : new MediaRecorder(stream);
      typeRef.current = rec.mimeType || typeRef.current;
      chunks.current = [];
      sentLen.current = 0;
      rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      rec.start(1000);
      recRef.current = rec;
      startedAt.current = Date.now();
      setSeconds(0);
      setState('recording');
      timer.current = setInterval(() => { void liveTick(); }, LIVE_EVERY_MS);
    } catch {
      setState('idle');
    }
  }

  async function finish() {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    setState('finishing');
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    await new Promise<void>(res => { rec.onstop = () => res(); try { rec.stop(); } catch { res(); } });
    stopAll();
    // Wait for an interim pass still in flight, so it cannot land after the last one.
    for (let i = 0; i < 60 && busy.current; i++) await new Promise(r => setTimeout(r, 100));
    const text = await transcribeBlob(blobNow());
    if (!alive.current) return;
    if (text) onWordsRef.current(text, true);
    setState('idle');
  }

  if (!transcriptionAvailable()) return null;
  const rec = state === 'recording';
  return (
    <button type="button" data-bubble-mic data-state={state}
      title={rec ? 'Stop — the words go into the bubble' : 'Talk — the words go into the bubble'}
      onMouseDown={e => e.preventDefault()}
      onPointerDown={e => { e.stopPropagation(); }}
      onClick={e => { e.stopPropagation(); if (state === 'idle') void start(); else if (rec) void finish(); }}
      className="absolute flex items-center gap-1 rounded-full shadow-md text-white"
      style={{
        right: -6, bottom: -6, height: 22, padding: rec ? '0 7px 0 5px' : 0, width: rec ? undefined : 22,
        justifyContent: 'center', backgroundColor: rec ? '#dc2626' : color, zIndex: 2, pointerEvents: 'auto',
      }}>
      {state === 'finishing' ? <Loader2 size={12} className="animate-spin" />
        : rec ? <><Square size={9} fill="#fff" /><span className="text-[10px] font-bold tabular-nums">{seconds}s</span></>
        : <Mic size={12} />}
    </button>
  );
}
