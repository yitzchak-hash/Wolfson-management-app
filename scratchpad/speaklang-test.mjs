// The speaking-language arithmetic (src/data/speakLang.ts), offline.
// Run: node scratchpad/speaklang-test.mjs
import { createServer } from 'vite';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

// A tiny localStorage, so the remembered half runs too.
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const m = await server.ssrLoadModule('/src/data/speakLang.ts');
const { typedTail, spokenLangOf, nextSpeakLang, letterCount, setActiveSpeaker, activeSpeakLang, setSpeakLang, noteTyped, __resetSpeakLang } = m;

// ── typedTail: only what the hand added ─────────────────────────────────────
check(typedTail('', 'при') === 'при', 'empty → typed');
check(typedTail('Hello ', 'Hello привет') === 'привет', 'appended at the end');
check(typedTail('ab cd', 'ab XY cd') === 'XY ', 'inserted in the middle', JSON.stringify(typedTail('ab cd', 'ab XY cd')));
check(typedTail('hello', 'hell') === '', 'a deletion adds nothing');
check(typedTail('same', 'same') === '', 'no change adds nothing');

// ── spokenLangOf: three letters before it says anything ─────────────────────
check(spokenLangOf('пр') === null, 'two Cyrillic letters say nothing yet');
check(spokenLangOf('при') === 'ru', 'three Cyrillic letters → ru');
check(spokenLangOf('שלום') === 'he', 'Hebrew → he');
check(spokenLangOf('ok then') === 'en', 'Latin → en');
check(spokenLangOf('12 34 !!') === null, 'digits and marks → nothing');
check(letterCount('a1б2ש') === 3, 'letters of every script counted');

// ── the chip's cycle ─────────────────────────────────────────────────────────
check(nextSpeakLang('en') === 'he' && nextSpeakLang('he') === 'ru' && nextSpeakLang('ru') === 'en', 'EN → עב → RU → EN');

// ── remembered per person ───────────────────────────────────────────────────
__resetSpeakLang();
setActiveSpeaker('c:w1');
check(activeSpeakLang() === null, 'a new person has nothing learned');
noteTyped('пр');
check(activeSpeakLang() === null, 'two letters teach nothing');
noteTyped('привет');
check(activeSpeakLang() === 'ru' && store.get('speak_lang_c:w1') === 'ru', 'typing Russian teaches ru, kept under the person');
setActiveSpeaker('u:office');
check(activeSpeakLang() === null, 'another person on the same device starts clean');
setSpeakLang('he');
check(activeSpeakLang() === 'he', 'the chip sets it outright');
setActiveSpeaker('c:w1');
check(activeSpeakLang() === 'ru', 'the worker keeps his own');
noteTyped('thanks');
check(activeSpeakLang() === 'en', 'typing English afterwards moves it back');

await server.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
