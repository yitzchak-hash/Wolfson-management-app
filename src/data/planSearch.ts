/**
 * THE PLAN FINDER'S SEARCH — how a typed word finds a file name.
 *
 * The owner's complaint about the old chooser (2026-11-10): one wrong letter
 * found nothing. People type fast, on a phone, in two languages, often with the
 * keyboard still on the other layout. So a name is matched the forgiving way:
 *
 *  - case, extra spaces, dashes and the file's extension do not matter;
 *  - the words may come in any order ("floor ground" finds "ground floor");
 *  - a word may be the START of a word in the name ("gro" finds "ground");
 *  - a letter or two may be wrong, missing, extra or swapped ("grund flor");
 *  - the WRONG KEYBOARD LAYOUT is undone both ways — Hebrew letters typed while
 *    meaning English words (the standard Israeli layout: "ע" sits on G) and
 *    English letters typed while meaning Hebrew words;
 *  - Hebrew final letters count as their ordinary form (ם = מ), and vowel marks
 *    are ignored.
 *
 * EVERY typed word has to be found somewhere in the name — that is what keeps
 * short junk ("xq", "zzz") from lighting up half the folder. A word of three
 * letters or fewer is never "nearly" matched, only exactly or as a start.
 *
 * Pure, no React and no DOM, so `scratchpad/plansearchprobe.mjs` runs it
 * offline with `node --experimental-strip-types`.
 */

/** The standard Israeli keyboard: the Hebrew letter on each English key. */
const EN_TO_HE: Record<string, string> = {
  q: '/', w: "'", e: 'ק', r: 'ר', t: 'א', y: 'ט', u: 'ו', i: 'ן', o: 'ם', p: 'פ',
  a: 'ש', s: 'ד', d: 'ג', f: 'כ', g: 'ע', h: 'י', j: 'ח', k: 'ל', l: 'ך', ';': 'ף',
  z: 'ז', x: 'ס', c: 'ב', v: 'ה', b: 'נ', n: 'מ', m: 'צ', ',': 'ת', '.': 'ץ', '/': '.',
};
const HE_TO_EN: Record<string, string> = Object.fromEntries(
  Object.entries(EN_TO_HE).map(([en, he]) => [he, en]),
);

/** Re-type a string as if the other layout had been on. */
export function swapLayout(s: string, to: 'he' | 'en'): string {
  const map = to === 'he' ? EN_TO_HE : HE_TO_EN;
  let out = '';
  for (const ch of s.toLowerCase()) out += map[ch] ?? ch;
  return out;
}

const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/** One word, made comparable: lower case, no vowel marks, no final letters. */
export function normWord(w: string): string {
  return w
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[ךםןףץ]/g, c => FINALS[c]);
}

/** A file name's words, each with where it sits in the name (for the highlight). */
interface Tok { norm: string; start: number; end: number }

const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu;

/** The name without its extension — ".pdf" is not something anybody searches for. */
function stemLength(name: string): number {
  const m = /\.[A-Za-z0-9]{1,5}\s*$/.exec(name);
  return m ? m.index : name.length;
}

function nameTokens(name: string): Tok[] {
  const stem = name.slice(0, stemLength(name));
  const out: Tok[] = [];
  for (const m of stem.matchAll(WORD)) {
    out.push({ norm: normWord(m[0]), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/** The typed words. Anything that is not a letter or a digit separates. */
function queryWords(q: string): string[] {
  return [...q.matchAll(WORD)].map(m => normWord(m[0])).filter(Boolean);
}

/**
 * Optimal string alignment distance (Levenshtein + one swap of neighbours),
 * stopping early once it cannot come in under `max`.
 */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length, m = b.length;
  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

/** How many wrong letters a typed word of this length may carry. */
function allowance(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  return 2;
}

/**
 * How well one typed word matches one word of the name: 1 exactly, less for a
 * start, a piece or a near miss, 0 for nothing.
 */
function wordScore(q: string, w: string): number {
  if (!q || !w) return 0;
  if (q === w) return 1;
  if (w.startsWith(q)) return 0.9 - Math.min(0.1, (w.length - q.length) * 0.01);
  const digits = /\d/.test(q);
  if (q.length >= 3 && w.includes(q)) return 0.72;
  if (digits) return 0;                       // "rev 3" must never find "rev 8"
  const max = allowance(q.length);
  if (!max) return 0;
  // The whole word, nearly…
  const d = editDistance(q, w, max);
  if (d <= max) return 0.7 - (d - 1) * 0.12;
  // …or the START of a longer word, nearly ("flo" short of a letter in "floor"s start).
  if (w.length > q.length) {
    const head = w.slice(0, q.length);
    const dh = Math.min(editDistance(q, head, max), editDistance(q, w.slice(0, q.length + 1), max));
    if (dh <= max) return 0.6 - (dh - 1) * 0.12;
  }
  return 0;
}

export interface PlanMatch {
  /** Higher is better. 0 = not a hit. */
  score: number;
  /** Where the matched words sit in the ORIGINAL name, for `<mark>`. */
  hits: [number, number][];
  /** The typed text was read through the other keyboard layout. */
  layout?: 'he' | 'en';
}

function scoreWords(words: string[], toks: Tok[]): { score: number; hits: [number, number][] } | null {
  if (!words.length || !toks.length) return null;
  let total = 0;
  const used = new Set<number>();
  for (const q of words) {
    let best = 0, at = -1;
    toks.forEach((t, i) => {
      const s = wordScore(q, t.norm) - (used.has(i) ? 0.05 : 0);
      if (s > best) { best = s; at = i; }
    });
    if (best <= 0) {
      // A word typed without its space ("groundfloor") — try it against the
      // name's neighbouring words run together.
      let joined = 0, jAt: number[] = [];
      for (let i = 0; i + 1 < toks.length; i++) {
        const two = toks[i].norm + toks[i + 1].norm;
        const s = wordScore(q, two);
        if (s > joined) { joined = s; jAt = [i, i + 1]; }
      }
      if (joined <= 0) return null;
      total += joined * 0.95;
      jAt.forEach(i => used.add(i));
      continue;
    }
    total += best;
    used.add(at);
  }
  const avg = total / words.length;
  // A small nudge for names the typed words cover more of, and for a match at
  // the name's start — "ground floor" before "notes on the ground floor".
  const cover = used.size / toks.length;
  const early = used.has(0) ? 0.03 : 0;
  const hits = [...used].sort((a, b) => a - b).map(i => [toks[i].start, toks[i].end] as [number, number]);
  return { score: avg + cover * 0.05 + early, hits };
}

/**
 * Score a file name against what was typed. 0 is not a hit; higher is better.
 * The typed text is also tried through the other keyboard layout, at a small
 * discount, and the better reading wins.
 */
export function matchPlanName(name: string, query: string): PlanMatch {
  const toks = nameTokens(name);
  const tries: { words: string[]; layout?: 'he' | 'en'; discount: number }[] = [
    { words: queryWords(query), discount: 0 },
  ];
  const hasLatin = /[a-z;,./']/i.test(query);
  const hasHebrew = /[א-ת]/.test(query);
  if (hasLatin) tries.push({ words: queryWords(swapLayout(query, 'he')), layout: 'he', discount: 0.04 });
  if (hasHebrew) tries.push({ words: queryWords(swapLayout(query, 'en')), layout: 'en', discount: 0.04 });
  let best: PlanMatch = { score: 0, hits: [] };
  for (const t of tries) {
    const r = scoreWords(t.words, toks);
    if (!r) continue;
    const score = r.score - t.discount;
    if (score > best.score) best = { score, hits: r.hits, layout: t.layout };
  }
  return best;
}

/** Is there anything worth searching for? Spaces and punctuation alone are not. */
export function hasQuery(q: string): boolean {
  return queryWords(q).length > 0 || queryWords(swapLayout(q, 'en')).length > 0;
}

/**
 * Rank files by what was typed: hits only, best first, newest first among
 * equals (a tie is common — "rev B" and "rev C" both match "architect").
 */
export function rankPlans<T extends { name: string; modifiedTime?: string }>(
  files: T[], query: string,
): { file: T; match: PlanMatch }[] {
  const out: { file: T; match: PlanMatch }[] = [];
  for (const file of files) {
    const match = matchPlanName(file.name, query);
    if (match.score > 0) out.push({ file, match });
  }
  const t = (f: T) => (f.modifiedTime ? Date.parse(f.modifiedTime) || 0 : 0);
  out.sort((a, b) => (Math.abs(b.match.score - a.match.score) > 0.001
    ? b.match.score - a.match.score
    : t(b.file) - t(a.file)));
  return out;
}

/** Cut a name into plain and lit runs for drawing — `hits` from `matchPlanName`. */
export function litRuns(name: string, hits: [number, number][]): { text: string; lit: boolean }[] {
  const out: { text: string; lit: boolean }[] = [];
  let at = 0;
  for (const [s, e] of [...hits].sort((a, b) => a[0] - b[0])) {
    if (s < at) continue;
    if (s > at) out.push({ text: name.slice(at, s), lit: false });
    out.push({ text: name.slice(s, e), lit: true });
    at = e;
  }
  if (at < name.length) out.push({ text: name.slice(at), lit: false });
  return out;
}
