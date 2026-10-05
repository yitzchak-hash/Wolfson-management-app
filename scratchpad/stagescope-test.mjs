// The set model counts only the apartment's OWN workspace's stages (owner's
// recording, 2026-10-05: the Wolfson squares read "4/13" beside "4/9" in the
// apartment window — the squares were adding the Job Board's four stages).
// Offline; the callers hand in the whole store's list on purpose.
import { createServer } from 'vite';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const { stageSetOf, progressOf, headlineStageId, ownStage } = await server.ssrLoadModule('/src/data/stageMarks.ts');

const st = (id, order, extra = {}) => ({ id, name: id, color: '#999', order, active: true, kind: 'work', createdAt: '', updatedAt: '', ...extra });
// Wolfson's nine (global) + the retired three + the Job Board's own six.
const ALL = [
  st('skhtatb', 1), st('s1-piping', 2), st('s1-concealed', 3), st('s1-fans', 4), st('s4-wall', 5),
  st('s4-outdoor', 6), st('s7-registers', 7), st('s7-panels', 8), st('s7-thermostats', 9),
  st('s1', 2, { active: false }), st('s4', 6, { active: false }), st('s7', 8, { active: false }),
  st('sr8tam7', 1, { projectId: 'general' }), st('spkr8jp', 2, { projectId: 'general' }),
  st('sbs21gv', 3, { projectId: 'general', kind: 'marker' }), st('syh7s4g', 4, { projectId: 'general' }),
  st('sp0und7', 5, { projectId: 'general' }), st('sifg5d0', 6, { projectId: 'general', kind: 'marker' }),
].sort((a, b) => a.order - b.order);

const flat = {
  id: 'A1-10', buildingId: 'A1', currentStageId: 's4-wall', bubbles: true,
  stageMarks: { skhtatb: 'done', 's1-piping': 'done', 's1-concealed': 'done', 's1-fans': 'done', 's4-wall': 'todo' },
};
const job = { id: 'G-1', buildingId: 'G', currentStageId: 'sr8tam7', bubbles: true, stageMarks: { sr8tam7: 'done' } };

const fs = stageSetOf(flat, ALL);
check(fs.length === 9 && fs.every(s => !s.projectId), 'a Wolfson flat\'s set is the nine global work stages', fs.map(s => s.id).join(','));
const p = progressOf(flat, ALL);
check(p.done === 4 && p.total === 9, 'its square reads 4/9 — the same as its window', `${p.done}/${p.total}`);
check(headlineStageId(flat, ALL) === 's4-wall', 'and its headline is still Wall Units', headlineStageId(flat, ALL));

const js = stageSetOf(job, ALL);
check(js.length === 4 && js.every(s => s.projectId === 'general'), 'a Job Board job\'s set is its own four work stages', js.map(s => s.id).join(','));
const jp = progressOf(job, ALL);
check(jp.total === 4, 'and it reads x/4, never counting Wolfson\'s', `${jp.done}/${jp.total}`);

check(ownStage({}, ALL[0]) && ownStage({}, ALL.find(s => s.projectId === 'general')),
  'a record with no building (a shelf sample) keeps every stage');

await server.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
