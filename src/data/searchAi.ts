/**
 * "Search with AI" — the fallback the owner approved on 2026-10-13, once his
 * Anthropic key went in.
 *
 * The app's own index is fast and forgiving (spelling, Hebrew against
 * English, the wrong keyboard), but it can only match what it can spell. The
 * AI is asked ONE thing: what else might somebody have typed into the records
 * for this? It answers with a handful of search strings — Hebrew written in
 * English and back, spelling variants, the family name out of a description —
 * and every one of them is run through the SAME local index. Nothing about the
 * office's records leaves the machine: only the words typed into the box are
 * sent, which is exactly what the person asked to search for.
 *
 * Answers are kept per query (this visit, and in `search_ai_cache` on this
 * machine), and the first 501/401 stands the button down for the visit — a
 * missing key must never read as a broken search.
 */
const API_KEY = (import.meta.env.VITE_DRIVE_API_KEY as string | undefined) ?? '';
const CACHE_KEY = 'search_ai_cache';
const CACHE_MAX = 300;

let serverOff = false;
const mem = new Map<string, string[]>();

const norm = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');

function readCache(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') ?? {}; } catch { return {}; }
}
function writeCache(q: string, terms: string[]) {
  try {
    const c = readCache();
    c[q] = terms;
    const keys = Object.keys(c);
    if (keys.length > CACHE_MAX) keys.slice(0, keys.length - CACHE_MAX).forEach(k => delete c[k]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch { /* a full or blocked storage only costs the cache */ }
}

/** Is the button worth drawing at all on this machine, this visit? */
export function aiSearchAvailable(): boolean { return !!API_KEY && !serverOff; }

/** The alternative search strings for a query; null when the AI is not there or did not answer. */
export async function aiSearchTerms(query: string, lang: 'en' | 'he' = 'en'): Promise<string[] | null> {
  const q = norm(query);
  if (!q || !API_KEY || serverOff) return null;
  const hit = mem.get(q) ?? readCache()[q];
  if (hit) { mem.set(q, hit); return hit; }
  // One quiet second try: a cold server or a busy model answers the first
  // press with an error now and then (seen in the 26 Oct recording), and the
  // person should not have to press again to find out it works.
  for (let attempt = 0; attempt < 2; attempt++) {
    const terms = await askOnce(q, query, lang);
    if (terms === 'off') return null;
    if (terms) return terms;
    if (attempt === 0) await new Promise(res => setTimeout(res, 700));
  }
  return null;
}

async function askOnce(q: string, query: string, lang: 'en' | 'he'): Promise<string[] | 'off' | null> {
  try {
    const r = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ searchAi: { q: query.trim(), lang } }),
    });
    if (r.status === 501 || r.status === 401) { serverOff = true; return 'off'; }
    if (!r.ok) return null;
    const data = await r.json() as { terms?: unknown };
    const terms = (Array.isArray(data.terms) ? data.terms : [])
      .map(t => String(t ?? '').trim())
      .filter(t => t && norm(t) !== q)
      .slice(0, 8);
    mem.set(q, terms);
    writeCache(q, terms);
    return terms;
  } catch {
    return null;
  }
}
