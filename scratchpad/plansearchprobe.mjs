// The Plan Finder's forgiving search, offline (2026-11-10).
// node --experimental-strip-types scratchpad/plansearchprobe.mjs
import { matchPlanName, rankPlans, swapLayout, litRuns, hasQuery } from '../src/data/planSearch.ts';

let fails = 0, n = 0;
const check = (ok, l, extra = '') => { n++; console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const hit = (name, q) => matchPlanName(name, q).score > 0;

// FAKE names, the shape the office's Drive has.
const FILES = [
  { name: 'Levi - ground floor AC plan.pdf', modifiedTime: '2026-11-08T10:00:00Z' },
  { name: 'Levi - first floor AC plan.pdf', modifiedTime: '2026-11-08T09:00:00Z' },
  { name: 'Levi - roof units.pdf', modifiedTime: '2026-11-01T09:00:00Z' },
  { name: 'Levi - ground floor AC plan — annotated version 3.0.pdf', modifiedTime: '2026-11-09T09:00:00Z' },
  { name: 'architect plans rev C.pdf', modifiedTime: '2026-10-21T09:00:00Z' },
  { name: 'architect plans rev B.pdf', modifiedTime: '2026-10-01T09:00:00Z' },
  { name: 'kitchen elevation.jpg', modifiedTime: '2026-10-01T09:00:00Z' },
  { name: 'תכנית קומת קרקע.pdf', modifiedTime: '2026-11-05T09:00:00Z' },
  { name: 'תוכנית גג - מעבים.pdf', modifiedTime: '2026-11-04T09:00:00Z' },
  { name: 'proposal v2.pdf', modifiedTime: '2026-10-11T09:00:00Z' },
];
const names = q => rankPlans(FILES, q).map(r => r.file.name);

// Exact and case
check(hit('Levi - ground floor AC plan.pdf', 'ground floor'), 'exact words');
check(hit('Levi - ground floor AC plan.pdf', 'GROUND   Floor'), 'case and extra spaces');
check(hit('Levi - ground floor AC plan.pdf', 'levi-ground'), 'a dash is a space');
check(!hit('Levi - ground floor AC plan.pdf', 'pdf'), 'the extension is not searched');
check(names('ground floor')[0].startsWith('Levi - ground floor AC plan'), 'best first', names('ground floor')[0]);

// Word order
check(hit('Levi - ground floor AC plan.pdf', 'floor ground'), 'word order does not matter');
check(hit('Levi - ground floor AC plan.pdf', 'plan levi'), 'word order — first and last');

// Starts of words
check(hit('Levi - ground floor AC plan.pdf', 'gro fl'), 'starts of words');

// Typos
check(hit('Levi - ground floor AC plan.pdf', 'grund flor'), '"grund flor" finds ground floor');
check(hit('Levi - ground floor AC plan.pdf', 'groudn'), 'two letters swapped');
check(hit('Levi - ground floor AC plan.pdf', 'grrround'), 'two extra letters');
check(hit('architect plans rev C.pdf', 'archtect'), 'a missing letter');
check(hit('architect plans rev C.pdf', 'arkhitekt'), 'two wrong letters in a long word');
const gf = names('grund flor');
check(gf.length === 2 && gf.every(x => /ground floor/.test(x)), 'grund flor finds only the ground-floor plans', JSON.stringify(gf));
check(hit('Levi - ground floor AC plan.pdf', 'groundfloor'), 'words run together');

// Wrong layout, both ways
const heTyped = swapLayout('ground floor', 'he');
check(heTyped === 'ערםומג כךםםר', 'English words typed on the Hebrew layout read as', heTyped);
check(hit('Levi - ground floor AC plan.pdf', heTyped), 'Hebrew letters for English words find the plan');
check(names(heTyped).length === 2, 'and only the ground-floor plans', JSON.stringify(names(heTyped)));
check(matchPlanName('Levi - ground floor AC plan.pdf', heTyped).layout === 'en', 'read through the English layout');
const enTyped = swapLayout('קומת קרקע', 'en');
check(enTyped === 'eun, ereg', 'Hebrew words typed on the English layout read as', enTyped);
check(names(enTyped)[0] === 'תכנית קומת קרקע.pdf', 'English letters for Hebrew words find the Hebrew plan', JSON.stringify(names(enTyped)));
check(hit('תוכנית גג - מעבים.pdf', swapLayout('מעבים', 'en')), 'wrong layout, a word with a final letter');
check(hit('Levi - roof units.pdf', swapLayout('unitz', 'he')), 'wrong layout plus a typo');

// Hebrew names
check(hit('תכנית קומת קרקע.pdf', 'קרקע'), 'a Hebrew word');
check(hit('תכנית קומת קרקע.pdf', 'קרקע קומת'), 'Hebrew, any order');
check(hit('תוכנית גג - מעבים.pdf', 'תכנית גג'), 'Hebrew spelled without the vav (a letter missing)');
check(hit('תוכנית גג - מעבים.pdf', 'מעבימ'), 'a final letter typed as an ordinary one');
check(hit('תכנית קומת קרקע.pdf', 'קַרְקַע'), 'vowel marks are ignored');

// No false hits on short junk
for (const junk of ['xq', 'zzz', 'qwx', 'ף', 'jj', '9', 'rev 8', 'plnz xx', 'kk ll']) {
  const r = names(junk);
  check(r.length === 0, `no hits for junk "${junk}"`, JSON.stringify(r));
}
check(names('rev C')[0] === 'architect plans rev C.pdf', 'a short exact word still counts ("rev C")');
check(names('v2').length === 1, 'a version number is exact', JSON.stringify(names('v2')));
check(!hasQuery('  - . '), 'spaces and dashes alone are not a search');

// Ties go newest first
const arch = names('architect');
check(arch[0] === 'architect plans rev C.pdf' && arch[1] === 'architect plans rev B.pdf', 'equal matches — newest first', JSON.stringify(arch));

// The highlight
const m = matchPlanName('Levi - ground floor AC plan.pdf', 'grund flor');
const lit = litRuns('Levi - ground floor AC plan.pdf', m.hits).filter(r => r.lit).map(r => r.text);
check(JSON.stringify(lit) === '["ground","floor"]', 'the matched words are lit', JSON.stringify(lit));

console.log(fails ? `\n${fails} of ${n} FAILED` : `\nALL ${n} PASS`);
process.exit(fails ? 1 : 0);
