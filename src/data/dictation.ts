import { useEffect, useRef, useState } from 'react';

/**
 * DICTATION THAT KEEPS LISTENING (owner, 2026-11-08, the problem form: "it's not live … I don't see a line going
 * there … and it doesn't actually work. It should have a send button to send it or a stop to stop it, just like
 * ChatGPT has").
 *
 * The old mic (useSpeechToText) stopped at the first pause and REPLACED whatever was in the box with the new words.
 * This one:
 *  - keeps listening until Stop or Send (`continuous`, and restarted when a phone's recogniser ends by itself on
 *    a pause — Chrome on Android does that even when asked to continue);
 *  - ADDS to what was already typed: the text at the press is the base, every result is base + what was heard;
 *  - gives a live LEVEL (0..1) for the line that moves with the voice — from the microphone itself where the
 *    browser lets a page listen beside the recogniser, else from the recogniser's own results, so the line never
 *    sits dead while words are landing;
 *  - `stop()` keeps the words, `cancel()` puts the box back as it was, `finish(cb)` stops and calls cb once the
 *    last words are in (Send).
 */

interface SpeechRec {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
}
interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
type SpeechCtor = new () => SpeechRec;
function ctor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
const join = (a: string, b: string) => (a && b ? `${a.replace(/\s+$/, '')} ${b.replace(/^\s+/, '')}` : a || b);

export interface Dictation {
  listening: boolean;
  supported: boolean;
  start: () => void;
  stop: () => void;
  cancel: () => void;
  finish: (then: () => void) => void;
  /** The live voice level, 0..1, read by the line every frame (a ref, never state — it changes 60 times a second). */
  level: React.MutableRefObject<number>;
}

export function useDictation(lang: string, getBase: () => string, onText: (text: string) => void): Dictation {
  const [listening, setListening] = useState(false);
  const level = useRef(0);
  const live = useRef({ getBase, onText });
  live.current = { getBase, onText };
  const s = useRef<{
    rec: SpeechRec | null; want: boolean; base: string; finals: string; interim: string;
    stream: MediaStream | null; ctx: AudioContext | null; raf: number; then: (() => void) | null;
    restarts: number; triedMic: boolean; heard: number;
  }>({ rec: null, want: false, base: '', finals: '', interim: '', stream: null, ctx: null, raf: 0, then: null, restarts: 0, triedMic: false, heard: 0 });

  const stopMeter = () => {
    const st = s.current;
    cancelAnimationFrame(st.raf); st.raf = 0;
    st.stream?.getTracks().forEach(t => t.stop()); st.stream = null;
    void st.ctx?.close().catch(() => {}); st.ctx = null;
    level.current = 0;
  };

  /** The level from the microphone itself, best effort; the recogniser's own beat stands in when it is refused. */
  const startMeter = async () => {
    const st = s.current;
    const tick = () => {
      if (!st.want) return;
      // With no microphone meter, the level is the recogniser's last result, fading.
      if (!st.ctx) level.current = Math.max(0, Math.min(1, (st.heard - performance.now() + 700) / 700)) * 0.8;
      st.raf = requestAnimationFrame(tick);
    };
    st.raf = requestAnimationFrame(tick);
    if (st.triedMic || !navigator.mediaDevices?.getUserMedia) return;
    st.triedMic = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!st.want) { stream.getTracks().forEach(t => t.stop()); return; }
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      st.stream = stream; st.ctx = ctx;
      const meter = () => {
        if (!st.want || st.ctx !== ctx) return;
        an.getByteTimeDomainData(buf);
        let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        level.current = level.current * 0.6 + Math.min(1, rms * 5) * 0.4;
        requestAnimationFrame(meter);
      };
      requestAnimationFrame(meter);
    } catch { /* refused or busy: the recogniser's beat drives the line */ }
  };

  const push = () => {
    const st = s.current;
    live.current.onText(join(st.base, join(st.finals, st.interim)).replace(/\s+/g, ' ').replace(/^ /, ''));
  };

  const begin = () => {
    const Rec = ctor(); if (!Rec) return;
    const st = s.current;
    const rec = new Rec();
    rec.lang = lang; rec.interimResults = true; rec.continuous = true;
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0]?.transcript ?? '';
        if (e.results[i].isFinal) st.finals = join(st.finals, t.trim());
        else interim = join(interim, t.trim());
      }
      st.interim = interim; st.heard = performance.now();
      push();
    };
    rec.onerror = e => {
      // The page's own microphone meter can take the microphone from the recogniser on some phones: let it go and
      // carry on listening without it.
      if ((e?.error === 'audio-capture' || e?.error === 'not-allowed') && st.stream) { stopMeter(); return; }
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') st.want = false;
    };
    rec.onend = () => {
      // A phone ends a "continuous" recogniser on a pause: start it again while the person has not pressed Stop.
      if (st.want && st.restarts < 40) {
        st.finals = join(st.finals, st.interim); st.interim = ''; st.restarts++;
        try { begin(); if (!st.ctx && !st.raf) void startMeter(); return; } catch { /* fall through */ }
      }
      st.want = false; st.rec = null; stopMeter(); setListening(false);
      if (st.interim) { st.finals = join(st.finals, st.interim); st.interim = ''; push(); }
      // The host's Send reads its OWN state, which takes a render to catch the last words — so a beat later.
      const then = st.then; st.then = null; if (then) window.setTimeout(then, 90);
    };
    st.rec = rec;
    rec.start();
  };

  const start = () => {
    const st = s.current;
    if (st.want) return;
    st.want = true; st.base = live.current.getBase(); st.finals = ''; st.interim = ''; st.restarts = 0; st.triedMic = false; st.then = null;
    try { begin(); setListening(true); void startMeter(); } catch { st.want = false; setListening(false); }
  };
  const stop = () => { const st = s.current; st.want = false; try { st.rec?.stop(); } catch { /* gone */ } };
  const finish = (then: () => void) => {
    const st = s.current;
    if (!st.rec) { then(); return; }
    st.then = then; stop();
  };
  const cancel = () => {
    const st = s.current; st.want = false; st.then = null;
    try { st.rec?.abort(); } catch { /* gone */ }
    live.current.onText(st.base);
  };

  useEffect(() => () => { s.current.want = false; try { s.current.rec?.abort(); } catch { /* gone */ } stopMeter(); }, []);

  return { listening, supported: !!ctor(), start, stop, cancel, finish, level };
}
