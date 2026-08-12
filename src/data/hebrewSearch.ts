/**
 * Finding a family whose name you cannot spell, in a language you did not type.
 *
 * Two problems, and they compound. The office types Hebrew, the plans are in
 * English, and half the family names exist in both — so searching "Artzi" must
 * find "ארצי" and searching "ארצי" must find "Artzi". And nobody spells
 * "Goodhardt" the same way twice.
 *
 * Rather than a translation table nobody will maintain, both sides are reduced
 * to the SOUNDS they share and compared there. It is not linguistics — it is
 * enough to put the right family at the top of a list of two hundred.
 */

/**
 * Hebrew letters to the roman letters they usually stand for.
 *
 * The vowel-ish letters (א ה י ע) map to nothing on purpose: Hebrew usually
 * omits vowels and English never does, so keeping them guarantees the two
 * spellings of the same name never match. Dropping them is what makes
 * "ארצי" and "Artzi" both reduce to `rz`. Vav is handled separately below —
 * it is a consonant as often as a vowel.
 */
const HE_TO_LATIN: Record<string, string> = {
  א: '', ב: 'b', ג: 'g', ד: 'd', ה: '', ז: 'z', ח: 'h', ט: 't', י: '',
  כ: 'k', ך: 'k', ל: 'l', מ: 'm', ם: 'm', נ: 'n', ן: 'n', ס: 's', ע: '',
  פ: 'p', ף: 'p', צ: 'ts', ץ: 'ts', ק: 'k', ר: 'r', ש: 's', ת: 't',
  // Common digraphs written with a geresh.
  'ג׳': 'g', 'ז׳': 'z', 'צ׳': 'ts',
};

/**
 * Vav is two letters wearing one coat.
 *
 * In לוי it is the v of Levi; in יוסף it is the o of Yosef. There is no way to
 * know which from the spelling alone, so the name is reduced BOTH ways and the
 * better of the two scores wins. Guessing one reading loses half the names.
 */
const VAV = 'ו';

/** Roman spellings that sound the same, collapsed onto one letter. */
const LATIN_FOLD: [RegExp, string][] = [
  [/ph/g, 'p'], [/ck/g, 'k'], [/sh/g, 's'], [/ch|kh/g, 'h'],
  // ts, tz and z land together: צ is written "tz" by one person and "z" by the
  // next, which is why "Arzi" has to find "Artzi".
  [/tz|ts|zz/g, 'z'],
  [/qu/g, 'k'], [/[cq]/g, 'k'], [/x/g, 'ks'], [/w/g, 'v'], [/j/g, 'g'],
  [/y/g, ''],
  // H goes too. Hebrew writes ה and ח where English writes an h it may not
  // even pronounce — Cohen against כהן is exactly this, and keeping the h
  // meant the commonest name in the country never matched itself.
  [/h/g, ''],
  [/[aeiou]/g, ''],          // vowels last: Hebrew rarely writes them
  [/(.)\1+/g, '$1'],         // and no letter twice in a row
];

/**
 * The sound-shape of a name, in either language.
 *
 * Hebrew is transliterated first, then both go through the same folding, so
 * "Artzi", "Arzi", "ארצי" and "ארזי" all end up as `rz` — which is why any of
 * them finds the others.
 */
function reduce(s: string, vav: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const pair = s.slice(i, i + 2);
    if (HE_TO_LATIN[pair] !== undefined) { out += HE_TO_LATIN[pair]; i += 1; continue; }
    if (s[i] === VAV) { out += vav; continue; }
    const one = HE_TO_LATIN[s[i]];
    out += one !== undefined ? one : s[i];
  }
  out = out.replace(/[^a-z]/g, '');
  for (const [re, to] of LATIN_FOLD) out = out.replace(re, to);
  return out;
}

/** Every reading of a name — one for roman text, two when a vav is involved. */
export function soundKeys(raw: string): string[] {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return [];
  if (!s.includes(VAV)) return [reduce(s, '')];
  return [...new Set([reduce(s, 'v'), reduce(s, '')])].filter(Boolean);
}

export function soundKey(raw: string): string {
  return soundKeys(raw)[0] ?? '';
}

/** How close two names sound, 0 to 1. */
export function soundScore(query: string, candidate: string): number {
  let best = 0;
  for (const a of soundKeys(query)) {
    for (const b of soundKeys(candidate)) best = Math.max(best, scoreOne(a, b));
  }
  return best;
}

function scoreOne(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  /**
   * A very short key only counts at the START of a name.
   *
   * Reduced spelling throws away vowels, so "zzzzz" comes down to a single
   * `z` — and a bare "contains" then matched every name with a z anywhere in
   * it. One or two letters is a beginning, not a match.
   */
  if (a.length <= 2) return b.startsWith(a) ? 0.75 : 0;
  if (b.startsWith(a)) return 0.92;
  // Found inside, but a fragment of a long name is a weaker claim than most
  // of a short one, so the score follows how much of the name it accounts for.
  if (b.includes(a)) return 0.6 + 0.3 * (a.length / b.length);
  // A near miss: one letter out of place in a short name still matters.
  const d = editDistance(a, b);
  const worst = Math.max(a.length, b.length);
  const close = 1 - d / worst;
  return close > 0.6 ? close * 0.7 : 0;
}

/** Levenshtein, iterative, two rows — names are short so this is nothing. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}
