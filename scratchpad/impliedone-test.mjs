// "Take Drilling done whenever Piping is done" (owner, 2026-10-06) — the rule
// in applyMarks (src/data/stageMarks.ts), offline, every case by hand.
import { createServer } from 'vite';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const { applyMarks } = await server.ssrLoadModule('/src/data/stageMarks.ts');
const ST = [
  { id: 'skhtatb', name: 'Sold/Start', order: 1, active: true, kind: 'work' },
  { id: 's-drilling', name: 'Drilling', order: 2, active: true, kind: 'work' },
  { id: 's1-piping', name: 'Piping', order: 3, active: true, kind: 'work' },
  { id: 's4-wall', name: 'Wall Units', order: 6, active: true, kind: 'work' },
  { id: 'g-pipe', name: 'Piping', order: 1, active: true, kind: 'work', projectId: 'general' },
];
const apt = (marks, extra = {}) => ({ id: 'A1-5', buildingId: 'A1', currentStageId: null, stageMarks: marks, bubbles: true, ...extra });

let r = applyMarks(apt({ skhtatb: 'done' }), { skhtatb: 'done', 's1-piping': 'done' }, ST);
check(r.stageMarks['s-drilling'] === 'done', 'ticking Piping done ticks Drilling done');
// Owner, 2026-10-08: a building unit headlines the LAST stage done.
check(r.currentStageId === 's1-piping', 'and the headline is the last stage done (Piping), never Drilling', r.currentStageId);

r = applyMarks(apt({ skhtatb: 'done', 's1-piping': 'done', 's-drilling': 'done' }), { skhtatb: 'done', 's1-piping': 'done' }, ST);
check(!r.stageMarks['s-drilling'], 'unticking Drilling by hand afterwards stands (Piping was already done)');

r = applyMarks(apt({ 's-drilling': 'off' }), { 's-drilling': 'off', 's1-piping': 'done' }, ST);
check(r.stageMarks['s-drilling'] === 'off', '"not needed" on Drilling is never overridden');

r = applyMarks(apt({ 's-drilling': 'pending' }), { 's-drilling': 'pending', 's1-piping': 'done' }, ST);
check(r.stageMarks['s-drilling'] === 'done', 'a half-done Drilling is finished by Piping being done');

r = applyMarks(apt({}), { 's1-piping': 'doing' }, ST);
check(!r.stageMarks['s-drilling'], 'Piping happening now ticks nothing');

r = applyMarks(apt({}, { id: 'G-1', buildingId: 'G' }), { 's1-piping': 'done' }, ST);
check(!r.stageMarks['s-drilling'], 'a Job Board job (its own list) never meets the rule');

r = applyMarks(apt({}), { 's1-piping': 'done' }, ST.filter(s => s.id !== 's-drilling'));
check(!r.stageMarks?.['s-drilling'], 'a list without Drilling never meets the rule');

await server.close();

// Owner, 2026-10-08: anything done (or started) after Sold/Start ticks Sold/Start.
r = applyMarks(apt({}), { 's-drilling': 'done' }, ST);
check(r.stageMarks.skhtatb === 'done', 'Drilling done ticks Sold/Start done');
check(r.currentStageId === 's-drilling', 'and the unit shows Drilling — the last stage done', r.currentStageId);
r = applyMarks(apt({}), { 's1-piping': 'doing' }, ST);
check(r.stageMarks.skhtatb === 'done', 'starting work on a later stage ticks Sold/Start too');
r = applyMarks(apt({ 's-drilling': 'done' }), { 's-drilling': 'done', skhtatb: 'todo' }, ST);
check(r.stageMarks.skhtatb === 'todo', 'un-ticking Sold/Start by hand afterwards stands (nothing later changed)');
r = applyMarks(apt({}, { buildingId: 'G' }), { 'g-pipe': 'done' }, ST);
check(!r.stageMarks.skhtatb, 'a Job Board job never meets the start rule');
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
