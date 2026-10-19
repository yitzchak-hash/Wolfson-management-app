// The Job Board's markers by MEANING, not order (owner's recording 2026-10-19:
// a job 2/2 done read "Ready to start", and Job Completed wiped the ticks).
// The list below is production's own Job Board list, orders included.
import { createServer } from 'vite';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const { applyMarks, marksForCurrent, headlineStageId, markerRole } = await server.ssrLoadModule('/src/data/stageMarks.ts');
const ST = [
  { id: 'sbs21gv', name: 'Job Completed', order: 3, active: true, kind: 'marker', projectId: 'general' },
  { id: 'syh7s4g', name: 'AC installation', order: 4, active: true, kind: 'work', projectId: 'general' },
  { id: 'sp0und7', name: 'Installation of Geves', order: 5, active: true, kind: 'work', projectId: 'general' },
  { id: 'sifg5d0', name: 'Ready to start', order: 6, active: true, kind: 'marker', projectId: 'general' },
];
const job = (marks, cur) => ({ id: 'G-x', buildingId: 'G', currentStageId: cur, stageMarks: marks, bubbles: true });
check(markerRole(ST[0], ST) === 'closing', 'Job Completed closes the line though it sits at order 3');
check(markerRole(ST[3], ST) === 'opening', 'Ready to start opens it though it sits last');
const both = { syh7s4g: 'done', sp0und7: 'done' };
check(headlineStageId(job(both, 'sifg5d0'), ST) === 'sbs21gv', 'every stage done → Job Completed, never Ready to start');
let r = applyMarks(job({ syh7s4g: 'done' }, 'sifg5d0'), both, ST);
check(r.currentStageId === 'sbs21gv', 'ticking the last stage done makes the headline Job Completed', r.currentStageId);
const m = marksForCurrent(job(both, 'sifg5d0'), 'sbs21gv', ST);
check(m?.syh7s4g === 'done' && m?.sp0und7 === 'done', 'pressing Job Completed keeps every stage ticked (it wiped them)', JSON.stringify(m));
const m2 = marksForCurrent(job({ syh7s4g: 'done' }, 'sifg5d0'), 'sbs21gv', ST);
check(m2?.sp0und7 === 'done', 'and ticks the stages not yet done');
const m3 = marksForCurrent(job(both, 'sbs21gv'), 'sifg5d0', ST);
check(!m3 || (!m3.syh7s4g && !m3.sp0und7), 'pressing Ready to start means nothing has begun — it takes the ticks off', JSON.stringify(m3));
check(headlineStageId(job({ syh7s4g: 'done' }, 'sifg5d0'), ST) === 'sp0und7', 'half way → the next stage to do, not Ready to start');
// A list whose markers say neither keeps the old rule: the last one closes.
const ST2 = [
  { id: 'm1', name: 'Alpha', order: 1, active: true, kind: 'marker', projectId: 'general' },
  { id: 'w1', name: 'Work', order: 2, active: true, kind: 'work', projectId: 'general' },
  { id: 'm2', name: 'Omega', order: 3, active: true, kind: 'marker', projectId: 'general' },
];
check(markerRole(ST2[2], ST2) === 'closing' && markerRole(ST2[0], ST2) === 'opening', 'unnamed markers fall back to the order');
// Hebrew names
check(markerRole({ id: 'h', name: 'x', nameHe: 'הושלם', kind: 'marker', active: true, projectId: 'general' }, []) === 'closing', 'a Hebrew "הושלם" closes');
await server.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
