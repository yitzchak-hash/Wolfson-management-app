/**
 * Every voice memo comes with its words (owner, 2026-09-03).
 *
 * The recording is transcribed ONCE on the server (`POST /api/geocode` with a
 * `transcribe` body — OpenAI's gpt-4o-transcribe, any language) and the words
 * are kept: on the record that owns the memo where one exists (a note, a
 * pin), and always in this device's cache, so a memo is never transcribed
 * twice from the same phone. The words then go through the same translation
 * as any message, so a Russian memo reads in English at the office.
 *
 * Two ways in, matching the two ways a memo is stored: a Drive file id (the
 * server reads the bytes with the service account) or the data URL itself
 * for a memo kept locally. A 501 (no key on the server) or 401 stands the
 * whole thing down for the visit — a missing key is "no words", never a
 * broken player.
 */
import { useEffect, useState } from 'react';
import { extractFileId } from './driveApi';

const API_KEY = (import.meta.env.VITE_DRIVE_API_KEY as string | undefined) ?? '';
const STORE_KEY = 'transcript_cache';
const STORE_MAX = 400;

const mem = new Map<string, string>();
let loaded = false;
let serverOff = false;
const inflight = new Map<string, Promise<string | null>>();
const refused = new Set<string>();

function loadStore() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) if (typeof v === 'string') mem.set(k, v);
  } catch { /* a bad cache is an empty cache */ }
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveStore() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const entries = [...mem.entries()];
      localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(entries.slice(Math.max(0, entries.length - STORE_MAX)))));
    } catch { /* quota */ }
  }, 400);
}

/** A short stable key for a data URL — its length plus a sample, never the whole thing. */
function dataKey(dataUrl: string): string {
  let h = 0;
  const step = Math.max(1, Math.floor(dataUrl.length / 512));
  for (let i = 0; i < dataUrl.length; i += step) h = (h * 31 + dataUrl.charCodeAt(i)) | 0;
  return `l:${dataUrl.length}:${(h >>> 0).toString(36)}`;
}

/** What a memo source resolves to — a Drive id or the local bytes. */
export function memoSource(src: string): { key: string; driveFileId?: string; dataUrl?: string } | null {
  if (!src) return null;
  if (/drive\.google\.com|docs\.google\.com/.test(src)) {
    const id = extractFileId(src);
    return id ? { key: `d:${id}`, driveFileId: id } : null;
  }
  if (src.startsWith('data:audio') || src.startsWith('data:video')) return { key: dataKey(src), dataUrl: src };
  return null;
}

export function transcriptionAvailable(): boolean { return !!API_KEY && !serverOff; }

export function cachedTranscript(src: string): string | undefined {
  loadStore();
  const m = memoSource(src);
  return m ? mem.get(m.key) : undefined;
}

/** The words of a memo, or null when there are none to be had. */
export function transcribeMemo(src: string): Promise<string | null> {
  const m = memoSource(src);
  if (!m || !API_KEY || serverOff) return Promise.resolve(null);
  loadStore();
  const hit = mem.get(m.key);
  if (hit !== undefined) return Promise.resolve(hit || null);
  if (refused.has(m.key)) return Promise.resolve(null);
  const running = inflight.get(m.key);
  if (running) return running;
  const p = (async () => {
    try {
      const body = m.driveFileId
        ? { transcribe: { driveFileId: m.driveFileId } }
        : { transcribe: { audio: m.dataUrl!.slice(m.dataUrl!.indexOf(',') + 1), mime: m.dataUrl!.slice(5, m.dataUrl!.indexOf(';')), filename: 'memo' } };
      const resp = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify(body),
      });
      if (resp.status === 501 || resp.status === 401) { serverOff = true; return null; }
      if (!resp.ok) { refused.add(m.key); return null; }
      const data = await resp.json() as { text?: string };
      const text = (data.text ?? '').trim();
      mem.set(m.key, text);
      saveStore();
      return text || null;
    } catch {
      return null;
    } finally {
      inflight.delete(m.key);
    }
  })();
  inflight.set(m.key, p);
  return p;
}

/**
 * The hook: the memo's words — the stored ones when the record already
 * carries them, else fetched once and handed to `onKnown` so the host can
 * write them onto its record for every other device.
 */
export function useTranscript(src: string, stored?: string | null, onKnown?: (text: string) => void): string | null {
  const [text, setText] = useState<string | null>(stored || cachedTranscript(src) || null);
  useEffect(() => {
    if (stored) { setText(stored); return; }
    let live = true;
    const hit = cachedTranscript(src);
    if (hit !== undefined) { setText(hit || null); if (hit && onKnown) onKnown(hit); return; }
    void transcribeMemo(src).then(t => {
      if (!live) return;
      setText(t);
      if (t && onKnown) onKnown(t);
    });
    return () => { live = false; };
    // onKnown is a host callback — re-running on its identity would re-fetch per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, stored]);
  return text;
}

/** Test seam. */
export function __resetTranscription() { serverOff = false; refused.clear(); mem.clear(); loaded = false; }
