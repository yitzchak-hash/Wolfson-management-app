import type { Stage, PortalLang } from '../types';

/**
 * A stage's "includes" words in the three languages (owner, 2026-10-28:
 * "split that up into languages … includes should also show the language
 * selected on the contractor phone"). Each word keeps its place in
 * `Stage.includes` (the text first typed — English when there is one), and
 * `Stage.includesTr[word]` holds the office's own wording per language.
 * A language left empty falls back to the automatic translation the phone
 * already used, so nothing goes blank while a word is half filled in.
 */
export const INCLUDE_LANGS: PortalLang[] = ['en', 'he', 'ru'];

/** The office's own wording of `word` in `lang`, or '' when none was typed. */
export function includeIn(st: Pick<Stage, 'includesTr'>, word: string, lang: PortalLang): string {
  return st.includesTr?.[word]?.[lang]?.trim() ?? '';
}

/** All three, the base word standing in for the language it was typed in. */
export function includeRow(st: Pick<Stage, 'includesTr'>, word: string): Record<PortalLang, string> {
  const t = st.includesTr?.[word] ?? {};
  return { en: t.en ?? '', he: t.he ?? '', ru: t.ru ?? '' };
}

/** Which language a bare word is written in — Hebrew and Cyrillic by their letters, else English. */
export function langOfWord(word: string): PortalLang {
  if (/[֐-׿]/.test(word)) return 'he';
  if (/[Ѐ-ӿ]/.test(word)) return 'ru';
  return 'en';
}
