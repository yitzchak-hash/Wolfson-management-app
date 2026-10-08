// Who did what (src/data/workDone.ts), offline: closed tasks in, sentences out.
// Every expectation worked by hand. Times are local, built from a fixed "now".
import { createServer } from 'vite';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent', cacheDir: 'node_modules/.vite-wdw-test' });
const { workDone, byDay, placesByBuilding, localDay, sampleWork } = await server.ssrLoadModule('/src/data/workDone.ts');

const NOW = new Date(2026, 9, 8, 18, 0, 0).getTime(); // Thu 8 Oct 2026, 18:00 local
const at = (dayBack, h, m = 0) => { const x = new Date(NOW - dayBack * 86400000); x.setHours(h, m, 0, 0); return x.toISOString(); };
const stages = [
  { id: 'drill', name: 'Drilling', order: 2, active: true },
  { id: 'pipe', name: 'Piping', order: 3, active: true },
  { id: 'wall', name: 'Wall Units', order: 6, active: true },
  { id: 'out', name: 'Outdoor Units', order: 7, active: true },
];
const contractors = [{ id: 'k1', name: 'Worker One' }, { id: 'k2', name: 'Worker Two' }];
const apt = (id, b, n, name = '') => ({ id, buildingId: b, apartmentNumber: n, displayName: name, floor: 3, isUnnamed: false });
let tn = 0;
const task = (aptId, who, closed, f = {}) => ({ id: `t${++tn}`, apartmentId: aptId, contractorId: who, taskDescription: 'Drilling — working here today', stageId: null, completedAt: closed, createdAt: closed, ...f });
const rep = (aptId, who, closed, ids, unfinished) => task(aptId, who, closed, { stageReport: true, stageId: ids[0], stageIds: ids, stagesWorked: ids, stagesUnfinished: unfinished });

const W = {
  projectId: 'wolfson',
  apartments: [apt('A2-25', 'A2', '25'), apt('A2-26', 'A2', '26'), apt('A2-27', 'A2', '27'), apt('A2-28', 'A2', '28'),
    apt('A3-9', 'A3', '9'), apt('A3-10', 'A3', '10'), apt('A3-11', 'A3', '11')],
  assignments: [
    rep('A2-27', 'k1', at(0, 8), ['drill']),
    rep('A2-26', 'k1', at(0, 10), ['drill']),
    rep('A2-25', 'k1', at(0, 11), ['drill']),
    rep('A3-9', 'k1', at(0, 12), ['drill']),
    rep('A2-28', 'k1', at(0, 13), ['drill']),
    // Two stages in the same flats → ONE sentence.
    rep('A3-9', 'k2', at(1, 9), ['wall', 'out']),
    rep('A3-10', 'k2', at(1, 12), ['wall', 'out']),
    // Outdoor unfinished in 11 → Wall done in 11 joins nothing; Outdoor half.
    rep('A3-11', 'k2', at(1, 15), ['wall', 'out'], ['out']),
    // Legacy "not finished" with no list → every worked stage half done.
    task('A2-25', 'k2', at(2, 10), { stageReport: true, stageId: 'pipe', stagesWorked: ['pipe'], stagesFinished: false }),
    // An open task never counts.
    task('A2-26', 'k1', null),
    // Outside a 7-day window.
    rep('A2-27', 'k1', at(9, 10), ['pipe']),
    // A problem the worker closed (approval later).
    task('A2-28', 'k2', at(0, 16), { taskDescription: 'Leak under the indoor unit', problem: { status: 'solved', closedAt: at(0, 16), photosRequired: true, stageBefore: null }, completedAt: at(0, 17) }),
    // A report with no stages at all — "worked in".
    task('A2-27', 'k2', at(0, 7)),
  ],
  photos: [
    { id: 'p1', assignmentId: 't1', apartmentId: 'A2-27', filename: 'a.jpg', fileType: 'image', uploadedAt: at(0, 7, 55), dataUrl: 'x' },
    { id: 'p2', assignmentId: 't1', apartmentId: 'A2-27', filename: 'b.mp4', fileType: 'video', uploadedAt: at(0, 7, 58), dataUrl: 'x' },
    { id: 'p3', assignmentId: 't1', apartmentId: 'A2-27', filename: 'plan.pdf', fileType: 'file', uploadedAt: at(0, 7, 59), dataUrl: 'x' },
    // Stage-tagged pictures on the two-stage report in A3-11.
    { id: 'pw', assignmentId: 't8', apartmentId: 'A3-11', filename: 'w.jpg', stageId: 'wall', uploadedAt: at(1, 14), dataUrl: 'x' },
    { id: 'po', assignmentId: 't8', apartmentId: 'A3-11', filename: 'o.jpg', stageId: 'out', uploadedAt: at(1, 14, 5), dataUrl: 'x' },
  ],
};
const G = {
  projectId: 'general',
  apartments: [{ id: 'G-1', buildingId: 'G', apartmentNumber: '', displayName: 'Rooftop job', isUnnamed: false, floor: 0 }],
  assignments: [
    task('G-1', 'k1', at(0, 14), { taskDescription: 'Gas top-up' }),
    task('G-1', 'k1', at(0, 14, 30), { taskDescription: 'gas top-up ' }),
    // A general job whose visits are reports of their own — skipped.
    task('', 'k1', at(0, 15), { taskDescription: 'Work at Wolfson', general: { projectId: 'general' }, visits: [{ apartmentId: 'A2-25', at: at(0, 11), stageId: 'drill', reportTaskId: 't3' }] }),
  ],
  photos: [],
};

const lines = workDone([W, G], { now: NOW, days: 7, stages, contractors, unknown: 'Someone' });
const find = pred => lines.filter(pred);

// ── grouping ────────────────────────────────────────────────────────────────
const drill = find(l => l.kind === 'done' && eq(l.stageIds, ['drill']) && l.contractorId === 'k1');
check(drill.length === 1, 'one worker, one day, one stage → ONE sentence', `${drill.length}`);
check(eq(drill[0]?.places.map(p => p.label), ['27', '26', '25', '9', '28']), 'places in the order the work was closed', JSON.stringify(drill[0]?.places.map(p => p.label)));
check(eq(placesByBuilding(drill[0].places).map(g => [g.buildingId, g.places.map(p => p.label)]), [['A2', ['27', '26', '25', '28']], ['A3', ['9']]]),
  'grouped by building in the order each was first met', JSON.stringify(placesByBuilding(drill[0].places).map(g => [g.buildingId, g.places.map(p => p.label)])));
check(drill[0].who === 'Worker One' && drill[0].projectId === 'wolfson', 'says who and which workspace');
check(drill[0].first === at(0, 8) && drill[0].last === at(0, 13), 'first and last close');

// Wall finished in 9, 10, 11; Outdoor finished in 9, 10 and half done in 11:
// each stage names exactly the flats where it was done.
const wallAll = find(l => l.contractorId === 'k2' && l.kind === 'done' && eq(l.stageIds, ['wall']));
check(wallAll.length === 1 && eq(wallAll[0].places.map(p => p.label), ['9', '10', '11']), 'Wall Units: every flat it was finished in', JSON.stringify(wallAll.map(l => l.places.map(p => p.label))));
const outDone = find(l => l.contractorId === 'k2' && l.kind === 'done' && eq(l.stageIds, ['out']));
check(outDone.length === 1 && eq(outDone[0].places.map(p => p.label), ['9', '10']), 'Outdoor Units: only where it was finished');
// The same two stages in the SAME flats → one sentence.
const merged = workDone([{ ...W, assignments: [rep('A3-9', 'k2', at(1, 9), ['wall', 'out']), rep('A3-10', 'k2', at(1, 12), ['wall', 'out'])] }], { now: NOW, days: 7, stages, contractors });
check(merged.length === 1 && eq(merged[0].stageIds, ['wall', 'out']) && eq(merged[0].places.map(p => p.label), ['9', '10']),
  'two stages in the same flats merge into one sentence, in the stage list\'s order', JSON.stringify(merged.map(l => [l.stageIds, l.places.map(p => p.label)])));
const wall11 = wallAll;
const half = find(l => l.contractorId === 'k2' && l.kind === 'half' && eq(l.stageIds, ['out']));
check(half.length === 1 && eq(half[0].places.map(p => p.label), ['11']), 'the unfinished stage reads as half done');
check(wall11[0].photos.some(p => p.id === 'pw') && !wall11[0].photos.some(p => p.id === 'po') && eq(half[0].photos.map(p => p.id), ['po']), 'a stage-tagged picture sits only under its own stage');
const legacy = find(l => l.kind === 'half' && eq(l.stageIds, ['pipe']));
check(legacy.length === 1, 'an old "not finished" report reads as half done');

// ── words, problems, photos ─────────────────────────────────────────────────
const gas = find(l => l.projectId === 'general' && l.kind === 'task');
check(gas.length === 1 && eq(gas[0].words, ['Gas top-up']) && eq(gas[0].places.map(p => p.label), ['Rooftop job']),
  'a task with no stages reads its own words, the same words fold together (case, spaces)', JSON.stringify(gas.map(l => [l.words, l.places.map(p => p.label)])));
check(!find(l => l.projectId === 'general' && l.taskIds.some(id => G.assignments.find(a => a.id === id)?.general)).length, 'a general job whose visits are reports is not said twice');
const prob = find(l => l.kind === 'problem');
check(prob.length === 1 && prob[0].last === at(0, 16) && eq(prob[0].words, ['Leak under the indoor unit']), 'a problem: when the worker closed it, and its words');
const worked = find(l => l.kind === 'task' && l.projectId === 'wolfson');
check(worked.length === 1 && eq(worked[0].words, []), 'a start-of-work report with no stages says only "worked in"');
check(eq(drill[0].photos.map(p => p.id), ['p1', 'p2']), 'pictures and films under the line, documents left out, oldest first');

// ── order, window, filter ───────────────────────────────────────────────────
check(lines.every((l, i) => i === 0 || lines[i - 1].last >= l.last), 'newest first');
check(!lines.some(l => l.taskIds.includes('t11')), 'outside the window is left out');
check(!lines.some(l => l.taskIds.includes('t10')), 'an open task is never finished work');
const days = byDay(lines);
check(eq(days.map(d => d.day), [localDay(NOW), localDay(NOW - 86400000), localDay(NOW - 2 * 86400000)]), 'days newest first', JSON.stringify(days.map(d => d.day)));
const one = workDone([W, G], { now: NOW, days: 7, stages, contractors, contractorId: 'k2' });
check(one.length > 0 && one.every(l => l.contractorId === 'k2'), 'the worker filter keeps one worker');
const short = workDone([W, G], { now: NOW, days: 1, stages, contractors });
check(short.every(l => Date.parse(l.last) >= NOW - 86400000), 'a one-day window');
// Same stage, two days → two sentences.
const twoDays = workDone([{ ...W, assignments: [rep('A2-25', 'k1', at(0, 9), ['drill']), rep('A2-26', 'k1', at(1, 9), ['drill'])] }], { now: NOW, days: 7, stages, contractors });
check(twoDays.length === 2, 'the same stage on two days is two sentences');

// ── the shelf's sample ──────────────────────────────────────────────────────
const sw = sampleWork([], NOW);
const sl = workDone(sw.sources, { now: NOW, days: 7, stages: [], contractors: sw.contractors });
check(sl.length >= 5 && sl.some(l => l.photos.length) && sl.some(l => l.kind === 'half') && new Set(sl.map(l => l.projectId)).size === 3,
  `the canned week is busy: ${sl.length} sentences, three workspaces, pictures, a half-done one`);
check(sw.sources.every(s => s.apartments.every(a => a.buildingId === 'G' || !a.displayName)), 'the sample names building units by number only');

await server.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
