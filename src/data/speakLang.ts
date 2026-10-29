/**
 * The language a PERSON writes and speaks in — never the language the screen
 * is set to (owner, 2026-10-18: "a lot of times he's gonna use it in English,
 * but he's gonna type in Russian").
 *
 * Two things read it:
 *  - DICTATION needs a language up front (the browser's speech recognition
 *    cannot guess), so the mic in every message box recognises in this
 *    person's speaking language, with a small chip beside it to change it.
 *  - TRANSLATION skips text written in it: what a person can write, they can
 *    read, so their own Russian is never "translated" into English for them on
 *    their own screen, however the screen is set.
 *
 * It is remembered per person per device (`speak_lang_<personKey>`,
 * localStorage — it is about this hand at this keyboard, not the office's
 * data, so it stays out of the store, the export and Firestore). It is
 * LEARNED from what the person types: the letters of the last run they typed
 * decide it (judged by script, the translator's own rule). Pressing the chip
 * sets it outright, until they type in another language.
 *
 * The person is whoever this page is FOR: the worker on his portal
 * (`c:<contractorId>`), the signed-in user in the office (`u:<userId>`). The
 * host page registers them with `setActiveSpeaker`.
 */
import { useSyncExternalStore } from 'react';
import { detectLang, type Lang } from './translate';

import { prefGet, prefSet } from './prefs';
export type SpeakLang = Lang;

const PREFIX = 'speak_lang_';
const LANGS: SpeakLang[] = ['en', 'he', 'ru'];

// ── pure helpers (tested offline in scratchpad/speaklang-test.mjs) ──────────

/** The text a change ADDED — what lies between the common prefix and suffix. */
export function typedTail(prev: string, next: string): string {
  if (next.length <= prev.length) return '';
  let a = 0;
  while (a < prev.length && prev[a] === next[a]) a++;
  let b = 0;
  while (b < prev.length - a && prev[prev.length - 1 - b] === next[next.length - 1 - b]) b++;
  return next.slice(a, next.length - b);
}

/** How many letters (any script the detector reads) a text holds. */
export function letterCount(text: string): number {
  let n = 0;
  for (const ch of text) if (/\p{L}/u.test(ch)) n++;
  return n;
}

/** The language a run of typing is in — null until it holds three letters. */
export function spokenLangOf(text: string): SpeakLang | null {
  if (letterCount(text) < 3) return null;
  return detectLang(text);
}

/** The next language on the chip: EN → עב → RU → EN. */
export function nextSpeakLang(lang: SpeakLang): SpeakLang {
  return LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
}

export const SPEAK_CHIP: Record<SpeakLang, string> = { en: 'EN', he: 'עב', ru: 'RU' };

// ── the remembered value ────────────────────────────────────────────────────

let active = 'anon';
let version = 0;
const listeners = new Set<() => void>();
const memo = new Map<string, SpeakLang | null>();
function emit() { version++; for (const l of listeners) l(); }

function read(key: string): SpeakLang | null {
  if (memo.has(key)) return memo.get(key)!;
  let v: SpeakLang | null = null;
  try {
    const raw = prefGet(PREFIX + key);
    if (raw === 'en' || raw === 'he' || raw === 'ru') v = raw;
  } catch { /* private window — nothing remembered */ }
  memo.set(key, v);
  return v;
}

/** Who this page is for. The portal and the office layout each set it. */
export function setActiveSpeaker(personKey: string | null | undefined) {
  const k = personKey || 'anon';
  if (k === active) return;
  active = k;
  emit();
}

/** The active person's remembered speaking language — null when never learned. */
export function activeSpeakLang(): SpeakLang | null { return read(active); }

/** Set the active person's speaking language outright (the chip). */
export function setSpeakLang(lang: SpeakLang) {
  if (read(active) === lang) return;
  memo.set(active, lang);
  try { prefSet(PREFIX + active, lang); } catch { /* quota */ }
  emit();
}

/** Learn from a run of typing; a no-op until it says something clear. */
export function noteTyped(text: string) {
  const l = spokenLangOf(text);
  if (l) setSpeakLang(l);
}

function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
const snap = () => version;

/**
 * The active person's speaking language, re-rendering when it changes —
 * `fallback` (the screen's language) until anything has been learned.
 */
export function useSpeakLang(fallback: SpeakLang | null | undefined): SpeakLang {
  useSyncExternalStore(subscribe, snap, snap);
  return read(active) ?? fallback ?? 'en';
}

/** Only the LEARNED value (no fallback) — what the translator checks. */
export function useLearnedSpeakLang(): SpeakLang | null {
  useSyncExternalStore(subscribe, snap, snap);
  return read(active);
}

/** Test seam. */
export function __resetSpeakLang() { memo.clear(); active = 'anon'; emit(); }
