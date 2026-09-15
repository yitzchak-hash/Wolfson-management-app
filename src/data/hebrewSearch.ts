/**
 * Finding a family whose name you cannot spell, in a language you did not type.
 *
 * The sound-shape arithmetic itself lives in `hebrewNormalize.ts` now — ONE
 * skeleton for every search box in the app — and this file keeps only the
 * scorer the duplicates detector and Find-a-job use.
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

import { soundKeys, soundKey } from './hebrewNormalize';
export { soundKeys, soundKey };

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
