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

/** Each Hebrew letter's primary Latin sound. Finals fold into their base. */
const HEB: Record<string, string> = {
  'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z',
  'ח': 'x', 'ט': 't', 'י': 'i', 'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm',
  'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p', 'ף': 'p',
  'צ': 'ĉ', 'ץ': 'ĉ', 'ק': 'k', 'ר': 'r', 'ש': 'š', 'ת': 't',
};

/**
 * The canonical skeleton of any name, from either alphabet.
 *
 * Order matters and each rule exists for a worked pair:
 *  · digraphs first ("sh" must become š before "h" is read alone);
 *  · tz/ts → c so "Artzi" meets צ;
 *  · ch → x so "Chaim" meets ח;
 *  · b/v fold together (ב is both), p/f fold together (פ is both);
 *  · vowels drop entirely — Hebrew never wrote them;
 *  · doubles collapse so "Cohenn" still meets "כהן".
 */
export function skeleton(raw: string): string {
  let s = raw.toLowerCase().trim();
  // Hebrew letters to their sounds.
  s = [...s].map(ch => HEB[ch] ?? ch).join('');
  // Latin digraphs to the same single symbols the Hebrew side produced.
  s = s
    .replace(/sh/g, 'š')
    .replace(/t[zs]/g, 'ĉ')
    .replace(/ch|kh/g, 'x')
    .replace(/ph/g, 'p')
    .replace(/th/g, 't')
    .replace(/q/g, 'k')
    .replace(/w/g, 'v')
    .replace(/j/g, 'g')
    // English c on its own is a hard k more often than not (Cohen, Marcus);
    // the soft-c names still land through the fuzzy skeleton match.
    .replace(/c/g, 'k');
  // Sounds Hebrew writes with one letter but English spells two ways.
  s = s.replace(/f/g, 'p').replace(/b/g, 'v').replace(/y/g, 'i');
  // Drop everything that is not a consonant sound. Vowels go; so do spaces
  // and punctuation — "Ben-Gurion" and "בן גוריון" must not differ by a dash.
  s = s.replace(/[aeiou]/g, '').replace(/[^a-zšĉx]/g, '');
  // Fold digraphs AGAIN now the vowels are gone: "cohen" only becomes k-h
  // adjacent after the o drops, while כהן arrived adjacent from the start.
  s = s.replace(/kh/g, 'x').replace(/t[zs]/g, 'ĉ');
  // Collapse doubles.
  s = s.replace(/(.)\1+/g, '$1');
  return s;
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
