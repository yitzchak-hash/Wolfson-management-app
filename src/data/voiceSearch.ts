import { useEffect, useRef, useState } from 'react';

/**
 * Talking into a search box.
 *
 * The browser's own speech recognition (webkitSpeechRecognition on the
 * Samsung panel and every Chrome), not the app's voice-memo recorder: a memo
 * is a FILE somebody plays back, a spoken search is WORDS that have to land
 * in the input as text. Interim results stream in while the person is still
 * talking, so the search narrows as they speak — the same feel as talking to
 * the phone's keyboard.
 *
 * `supported` is honest: a browser without the API simply never shows the
 * microphone, rather than showing a button that silently does nothing.
 */

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
interface SpeechEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
type SpeechCtor = new () => SpeechRec;

function ctor(): SpeechCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechToText(lang: string, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  // Through a ref: the recogniser is created once per press and must call the
  // LIVE handler, not the one from the render it was born in.
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const toggle = () => {
    if (listening) { recRef.current?.stop(); return; }
    const Rec = ctor();
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = e => {
      const txt = Array.from(e.results, r => r[0]?.transcript ?? '').join(' ').replace(/\s+/g, ' ').trim();
      if (txt) onTextRef.current(txt);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  };

  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* gone */ } }, []);

  return { listening, toggle, supported: !!ctor() };
}
