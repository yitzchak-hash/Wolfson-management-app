/**
 * Hebrew↔English matching for search, without an AI call.
 *
 * The office types both ways: an English query for a job saved in Hebrew, a
 * Hebrew query for a worker saved in English, and — the classic — a query
 * typed while the keyboard was still on the other layout. All three must find
 * the record, and none of them can afford a network round trip per keystroke.
 *
 * The trick is a CONSONANT SKELETON. Hebrew writes no vowels, so "שפירא" and
 * "shapira" can never agree letter-for-letter — but strip the vowels from the
 * transliterated forms and both collapse to the same spine: š-p-r. Matching
 * skeletons instead of spellings is what makes the two alphabets comparable
 * at all.
 *
 * Everything here is pure and table-driven, so it is tested against worked
 * examples rather than trusted.
 */

import { soundKey } from './hebrewNormalize';

/**
 * The canonical skeleton of any name, from either alphabet — now the ONE
 * rule in `hebrewNormalize.ts` (vav read both ways, h dropped, geresh
 * digraphs), so the header search, the job list, the tile and the widgets
 * can never again disagree about how a Hebrew name sounds.
 */
export function skeleton(raw: string): string {
  return soundKey(raw);
}

/**
 * The same physical keys on the other layout.
 *
 * Typing "artzi" while the keyboard is on Hebrew produces "שרטזא"-like
 * nonsense; swapping it back recovers what the fingers meant. The map is the
 * standard Israeli layout, both directions.
 */
const EN_TO_HE: Record<string, string> = {
  q: '/', w: "'", e: 'ק', r: 'ר', t: 'א', y: 'ט', u: 'ו', i: 'ן', o: 'ם', p: 'פ',
  a: 'ש', s: 'ד', d: 'ג', f: 'כ', g: 'ע', h: 'י', j: 'ח', k: 'ל', l: 'ך',
  z: 'ז', x: 'ס', c: 'ב', v: 'ה', b: 'נ', n: 'מ', m: 'צ',
  ',': 'ת', '.': 'ץ', ';': 'ף', "'": ',', '/': '.',
};
const HE_TO_EN: Record<string, string> = {};
for (const [en, he] of Object.entries(EN_TO_HE)) {
  if (!(he in HE_TO_EN)) HE_TO_EN[he] = en;
}

export function layoutSwap(raw: string): string {
  const s = raw.toLowerCase();
  const hebrew = /[֐-׿]/.test(s);
  const map = hebrew ? HE_TO_EN : EN_TO_HE;
  return [...s].map(ch => map[ch] ?? ch).join('');
}

/**
 * Every string worth trying for one query, deduplicated: the query itself,
 * the other keyboard layout's reading of the same keys, and the skeletons of
 * both. The caller runs its fuzzy match once per variant and merges.
 */
export function queryVariants(q: string): { plain: string[]; skeletons: string[] } {
  const swapped = layoutSwap(q);
  const plain = [...new Set([q, swapped])].filter(v => v.trim().length >= 2);
  const skeletons = [...new Set([skeleton(q), skeleton(swapped)])]
    .filter(v => v.length >= 2);
  return { plain, skeletons };
}
