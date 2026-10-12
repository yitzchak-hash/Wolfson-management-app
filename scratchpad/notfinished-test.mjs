// "Not finished today" arithmetic (src/data/notFinished.ts), offline.
// October 2026: Thu 15 · FRI 16 · SAT 17 · Sun 18 · Mon 19.
import { createServer } from 'vite';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const N = await server.ssrLoadModule('/src/data/notFinished.ts');

const one = { id: 't1', apartmentId: 'A3-12', contractorId: 'c1', taskDescription: 'x', dueDate: '2026-10-15', stageId: 's2', stageIds: ['s2', 's3'], createdAt: '2026-10-14T08:00:00Z' };
check(N.comeBackDay('2026-10-15') === '2026-10-18', 'Thursday → coming back Sunday (Fri/Sat skipped)');
check(N.comeBackDay('2026-10-18') === '2026-10-19', 'Sunday → Monday');

let p = N.notFinishedPlan(one, { today: '2026-10-15', next: '2026-10-18', finishedIds: ['s2'], by: 'Igor', at: '2026-10-15T15:00:00Z' });
check(eq(p.days, ['2026-10-15', '2026-10-18']) && p.dueDate === '2026-10-18', 'one-day Thursday task + Sunday = two days, due Sunday', JSON.stringify(p.days));
check(eq(p.marks, { s2: 'done', s3: 'pending' }), 'finished stage done, the other half done', JSON.stringify(p.marks));
check(p.unfinished.length === 1 && p.unfinished[0].next === '2026-10-18' && eq(p.unfinished[0].finished, ['s2']), 'report recorded');

const after = { ...one, days: p.days, dueDate: p.dueDate, unfinished: p.unfinished };
check(!N.needsNewDay(after), 'a come-back day means no "needs a new day"');
check(N.unfinishedOn(after, '2026-10-15') && !N.unfinishedOn(after, '2026-10-18'), 'amber tag on Thursday only');
check(N.morningAskDay(after, '2026-10-18') === null, 'Sunday morning: the job is today, no question');
check(N.morningAskDay(after, '2026-10-19') === '2026-10-18', 'Monday morning: asks about Sunday');

p = N.notFinishedPlan(one, { today: '2026-10-15', next: null, finishedIds: [], by: 'Igor', at: '2026-10-15T15:00:00Z' });
check(p.days === undefined && p.dueDate === '2026-10-15', '"I don\'t know yet" adds no day');
check(eq(p.marks, { s2: 'pending', s3: 'pending' }), 'nothing finished → all half done');
const unknown = { ...one, unfinished: p.unfinished };
check(N.needsNewDay(unknown), '"I don\'t know yet" → needs a new day');
check(N.morningAskDay(unknown, '2026-10-18') === null, 'no morning question after he already answered');
const dragged = { ...unknown, days: ['2026-10-15', '2026-10-20'], dueDate: '2026-10-20' };
check(!N.needsNewDay(dragged), 'dragging to a later day meets the need');

check(N.morningAskDay(one, '2026-10-18') === '2026-10-15', 'untouched Thursday task asks on Sunday');
check(N.morningAskDay(one, '2026-10-15') === null, 'not on the day itself');
check(N.morningAskDay({ ...one, completedAt: '2026-10-15T16:00:00Z' }, '2026-10-18') === null, 'a closed task never asks');
check(N.morningAskDay({ ...one, problem: { status: 'open' } }, '2026-10-18') === null, 'a problem never asks');
check(N.morningAskDay({ ...one, general: { projectId: 'wolfson' } }, '2026-10-18') === null, 'a general job never asks');
check(N.daysBetween('2026-10-15', '2026-10-18') === 3, 'daysBetween');

const line = N.notFinishedLine({ next: '2026-10-18', finished: ['s2'] }, id => ({ s2: 'Piping' }[id] ?? id));
check(/^Not finished today\. Coming back Sun/.test(line) && /Finished today: Piping\./.test(line), 'the English line', line);
check(N.notFinishedLine({ next: null }, x => x) === 'Not finished today. New day not decided yet.', 'unknown line');

const many = N.notFinishedPlan(after, { today: '2026-10-18', next: '2026-10-19', finishedIds: [], by: 'Igor', at: '2026-10-18T15:00:00Z' });
check(eq(many.days, ['2026-10-15', '2026-10-18', '2026-10-19']) && many.unfinished.length === 2, 'a second report keeps the first');
check(N.notFinishedPlan(one, { today: '2026-10-15', next: '2026-10-14', finishedIds: [], by: 'x', at: '' }).unfinished[0].next === null, 'a past come-back day is refused');

await server.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
