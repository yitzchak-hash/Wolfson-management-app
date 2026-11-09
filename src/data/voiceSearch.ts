import { useDictation } from './dictation';

/**
 * Talking into a search box.
 *
 * The browser's own speech recognition, not the app's voice-memo recorder: a memo is a FILE somebody plays back, a
 * spoken search is WORDS that have to land in the input as text. Interim results stream in while the person is still
 * talking, so the search narrows as they speak.
 *
 * Since 2026-11-08 it rides the one dictation (dictation.ts): it keeps listening until the mic is pressed again, and
 * `level` drives the live line beside the box (owner: "in all places in the line intake"). A search is the words
 * SPOKEN, so the box starts empty each time rather than adding to what was there.
 *
 * `supported` is honest: a browser without the API simply never shows the microphone.
 */
export function useSpeechToText(lang: string, onText: (text: string) => void) {
  const d = useDictation(lang, () => '', onText);
  return { listening: d.listening, toggle: () => (d.listening ? d.stop() : d.start()), supported: d.supported, level: d.level };
}
