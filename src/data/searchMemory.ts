/**
 * What this machine remembers about searching — recent queries and the
 * results people chose. Per machine, never synced: what you searched for is
 * about the hunt you were on at THIS desk, not the office's data, so it stays
 * out of the store, the export and Firestore (and therefore the backup audit).
 */

const RECENT_KEY = 'search_recent';
const RECENT_MAX = 8;
const PICKS_KEY = 'search_picks';
const PICKS_MAX = 150;
/** A pick's weight halves every 30 days — learning that never fades sticks. */
const HALF_LIFE_DAYS = 30;

export interface PickMemory { n: number; last: number; qs: string[] }

export function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(x => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch { return []; }
}
export function writeRecent(list: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch { /* private window */ }
}
/** Remember a query, newest first and never twice. Returns the new list. */
export function rememberQuery(q: string): string[] {
  const t = q.trim();
  if (t.length < 2) return readRecent();
  const next = [t, ...readRecent().filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
  writeRecent(next);
  return next;
}

/** Picks are keyed per WORKSPACE and per result (`<pid>|<kind>:<id>`). */
export function pickKey(projectId: string, docId: string): string {
  return `${projectId}|${docId}`;
}

export function readPicks(): Record<string, PickMemory> {
  try {
    const raw = localStorage.getItem(PICKS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch { return {}; }
}

export function notePick(key: string, query: string) {
  try {
    const picks = readPicks();
    const q = query.trim().toLowerCase();
    const p = picks[key] ?? { n: 0, last: 0, qs: [] };
    p.n += 1;
    p.last = Date.now();
    if (q.length >= 2) p.qs = [q, ...p.qs.filter(x => x !== q)].slice(0, 6);
    picks[key] = p;
    const ids = Object.keys(picks);
    if (ids.length > PICKS_MAX) {
      ids.sort((a, b) => picks[a].last - picks[b].last)
        .slice(0, ids.length - PICKS_MAX)
        .forEach(k => delete picks[k]);
    }
    localStorage.setItem(PICKS_KEY, JSON.stringify(picks));
  } catch { /* private window */ }
}

export function clearPicks() {
  try { localStorage.removeItem(PICKS_KEY); } catch { /* private window */ }
}

/** How much a pick still counts, 0..n — halved every 30 days. */
export function pickWeight(p: PickMemory, now = Date.now()): number {
  const days = Math.max(0, (now - p.last) / 86400000);
  return p.n * Math.pow(0.5, days / HALF_LIFE_DAYS);
}

/**
 * Was this result picked for THIS query before?
 *
 * The old rule matched any remembered query that was a prefix of the typed
 * one, so having once picked "Cohen, David" for "cohen", typing "cohen ramat"
 * — a different Cohen — still put David first. Now: the same query, or more
 * letters of the SAME single word ("coh" → "cohen"). Two words are a new
 * question.
 */
export function pickedForQuery(p: PickMemory, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return false;
  const oneWord = !/\s/.test(q);
  return p.qs.some(x => x === q || (oneWord && !/\s/.test(x) && (x.startsWith(q) || q.startsWith(x))));
}
