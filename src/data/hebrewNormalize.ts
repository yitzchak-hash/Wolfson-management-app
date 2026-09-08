/**
 * ONE Hebrew normaliser, and ONE consonant skeleton — for every search box.
 *
 * Two copies used to exist and disagree: `translit.ts` kept the h and read vav
 * as v only, `hebrewSearch.ts` dropped the h and read vav both ways. "יוסף"
 * skeletoned to `vsp` on one side and "Yosef" to `sp` on the other, so the
 * header search and the Find-a-job widget answered the same name differently.
 * This file is the merged rule — the `hebrewSearch` set, which was tuned
 * against the office's real names — and both old modules now delegate here.
 *
 * Everything is pure and table-driven, tested against worked pairs
 * (`scratchpad/hebnorm-test.mjs`), never trusted.
 */

/** Final letters fold to their base — ך and כ are one letter to a search box. */
const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/**
 * Normalise text for indexing AND for querying — the same function on both
 * sides, or a stored "לוי-כהן" never meets a typed "לוי כהן".
 *
 *  · NFKD, then every combining mark goes (niqqud, cantillation, meteg);
 *  · final letters fold to their base;
 *  · Hebrew punctuation becomes its ASCII cousin (geresh → ', gershayim → ",
 *    maqaf → -) so the tokenizer has one alphabet of separators;
 *  · lower-cased.
 */
export function normalizeText(raw: string): string {
  if (!raw) return '';
  let s = raw.normalize('NFKD');
  // Punctuation FIRST: the maqaf sits inside the mark range below and would
  // otherwise be stripped before it could become a hyphen.
  s = s.replace(/׳/g, "'").replace(/״/g, '"').replace(/־/g, '-');
  s = s.replace(/[֑-ׇ]/g, '').replace(/\p{Mn}/gu, '');
  s = s.replace(/[ךםןףץ]/g, ch => FINALS[ch] ?? ch);
  return s.toLowerCase();
}

/** Every separator a name, an address or a folder title can carry. */
export const SPLIT_RE = /[\s,.;:·•—–\-\/\\()[\]{}'"`_!?+*&|<>~^@#$%=]+/u;

/** Normalised words. "Cohen, David - 5555 - Ramat Gan" → cohen david 5555 ramat gan. */
export function tokenize(raw: string): string[] {
  return normalizeText(raw).split(SPLIT_RE).filter(Boolean);
}

/**
 * Hebrew letters to the roman letters they usually stand for. The vowel-ish
 * letters (א ה י ע) map to nothing on purpose: Hebrew usually omits vowels and
 * English never does, so keeping them guarantees the two spellings of the
 * same name never meet. Vav is handled separately — it is a consonant as
 * often as a vowel, so a name is reduced BOTH ways.
 */
const HE_TO_LATIN: Record<string, string> = {
  א: '', ב: 'b', ג: 'g', ד: 'd', ה: '', ז: 'z', ח: 'h', ט: 't', י: '',
  כ: 'k', ל: 'l', מ: 'm', נ: 'n', ס: 's', ע: '',
  פ: 'p', צ: 'ts', ק: 'k', ר: 'r', ש: 's', ת: 't',
  // The geresh digraphs — after normalisation the geresh is an ASCII '.
  "ג'": 'g', "ז'": 'z', "צ'": 'ts',
};
const VAV = 'ו';

/** Roman spellings that sound the same, collapsed onto one letter. */
const LATIN_FOLD: [RegExp, string][] = [
  [/ph/g, 'p'], [/ck/g, 'k'], [/sh/g, 's'], [/ch|kh/g, 'h'],
  // ts, tz and z land together: צ is "tz" to one person and "z" to the next.
  [/tz|ts|zz/g, 'z'],
  [/qu/g, 'k'], [/[cq]/g, 'k'], [/x/g, 'ks'], [/w/g, 'v'], [/j/g, 'g'],
  // Soft פ is written f ("Yosef" / יוסף) and ב is v as often as b
  // ("Tzvika" / צביקה) — both alphabets fold the same way, so nothing is lost.
  [/f/g, 'p'], [/b/g, 'v'],
  [/y/g, ''],
  // H goes too: Hebrew writes ה and ח where English writes an h it may not
  // even pronounce — Cohen against כהן is exactly this.
  [/h/g, ''],
  [/[aeiou]/g, ''],          // vowels last: Hebrew rarely writes them
  [/(.)\1+/g, '$1'],         // and no letter twice in a row
];

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

/**
 * Every reading of a name's sound-shape — one for roman text, two when a vav
 * is involved. "Artzi", "Arzi", "ארצי" and "ארזי" all come out as `rz`.
 */
export function soundKeys(raw: string): string[] {
  const s = normalizeText(raw ?? '').trim();
  if (!s) return [];
  if (!s.includes(VAV)) return [reduce(s, '')].filter(Boolean);
  return [...new Set([reduce(s, 'v'), reduce(s, '')])].filter(Boolean);
}

/** The first reading — for callers that want ONE string. */
export function soundKey(raw: string): string {
  return soundKeys(raw)[0] ?? '';
}

/**
 * The skeleton of every WORD in a text, both vav readings, deduplicated —
 * what the index stores in its `sk` field so a cross-alphabet match is an
 * ordinary prefix lookup instead of a fuzzy scan.
 */
export function skeletonTokens(raw: string): string[] {
  const out = new Set<string>();
  for (const t of tokenize(raw)) {
    if (/^\d+$/.test(t)) continue;
    for (const k of soundKeys(t)) if (k.length >= 1) out.add(k);
  }
  return [...out];
}

/** Every digit in the text, run together — "050-123 4567" → 0501234567. */
export function digitsOf(raw: string): string {
  return (raw ?? '').replace(/\D+/g, '');
}

/** Does the text carry any Hebrew letter? */
export function hasHebrew(raw: string): boolean {
  return /[֐-׿]/.test(raw ?? '');
}
