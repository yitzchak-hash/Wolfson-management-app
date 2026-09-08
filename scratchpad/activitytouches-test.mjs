// The touches arithmetic, offline: every source becomes a touch, the fold
// keeps the newest with the count and kinds, the two orders, the chips, and
// the booked-this-week chip. Numbers worked by hand.
import { createServer } from 'vite';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const { touchesOf, foldByJob, rankJobs, bookedThisWeek, copiedIn } = await server.ssrLoadModule('/src/data/activityTouches.ts');

const NOW = Date.parse('2026-09-07T12:00:00.000Z');
const ago = (h) => new Date(NOW - h * 3600000).toISOString();
const job = (id, extra = {}) => ({ id, buildingId: 'G', displayName: id, isUnnamed: false, createdAt: ago(1000), contentUpdatedAt: ago(1000), ...extra });
const jobs = [
  job('A', { driveLink: 'https://drive.google.com/drive/folders/FA', contentUpdatedAt: ago(30), updatedByName: 'Esther' }),
  job('B'), job('C'),
  job('G-auto-x', { createdAt: ago(2), contentUpdatedAt: ago(2), driveLink: 'https://drive.google.com/drive/folders/FX' }),
  job('OLD', { contentUpdatedAt: ago(24 * 40), updatedByName: 'Esther' }),
];
const src = {
  jobs,
  logs: [
    { id: 'l1', apartmentId: 'B', userName: 'Esther', actionType: 'opened', fieldChanged: 'viewed', createdAt: ago(1) },
    { id: 'l2', apartmentId: 'C', userName: 'Tzvi', actionType: 'updated', fieldChanged: 'currentStageId', newValue: 'Piping', createdAt: ago(5) },
  ],
  assignments: [
    { id: 't1', apartmentId: 'A', contractorId: 'W1', createdAt: ago(10), createdByName: 'Esther', completedAt: ago(3), dueDate: '2026-09-09' },
    { id: 't2', apartmentId: 'C', contractorId: 'W1', createdAt: ago(50), createdByName: 'Esther', completedAt: null, days: ['2026-09-08', '2026-09-09'], dueDate: '2026-09-09' },
  ],
  notes: [{ id: 'n1', apartmentId: 'A', authorType: 'contractor', authorName: 'Yossi', createdAt: ago(4), text: 'hi' }],
  photos: [{ id: 'p1', apartmentId: 'B', contractorId: 'W1', uploadedAt: ago(6), fileType: 'image' }],
  annotations: [{ id: 'm1', apartmentId: 'C', createdBy: 'Tzvi', createdAt: ago(7), version: 2 }],
  pins: [{ id: 'pin1', apartmentId: 'B', createdBy: 'Tzvi', createdAt: ago(8), resolvedAt: ago(2), resolvedBy: 'Yossi' }],
  elements: [{ id: 'CE-r', type: 'widget', widget: 'rota', data: { cells: { 'c:W1|2026-09-08': [{ id: 'e1', jobId: 'C' }], 'c:W1|2026-08-01': [{ id: 'e2', jobId: 'OLD' }] } } }],
  contractors: [{ id: 'W1', name: 'Yossi' }],
  drive: {
    FA: { at: ago(0.1), name: 'proposal-v2.docx', who: 'Moshe', touches: [{ at: ago(0.1), name: 'proposal-v2.docx', who: 'Moshe' }, { at: ago(20), name: 'old-quote.pdf', who: 'Moshe', removed: true }] },
    FX: { at: ago(0.5), name: 'plan.pdf', who: 'Dina', touches: [{ at: ago(0.5), name: 'plan.pdf', who: 'Dina' }] },
  },
};

const touches = touchesOf(src, NOW, 30);
const byJob = id => touches.filter(t => t.jobId === id);
check(copiedIn(jobs[3]) && !copiedIn(jobs[0]), 'a swept job nobody touched is "copied in"; an edited one is not');
check(byJob('G-auto-x').length === 1 && byJob('G-auto-x')[0].kind === 'drive', 'a copied-in job has no edit touch, only its Drive change', byJob('G-auto-x').map(t => t.kind).join());
check(byJob('OLD').length === 0, 'a job edited 40 days ago (and planned on 1 Aug) has nothing inside a 30-day window');
const a = byJob('A');
check(a.some(t => t.kind === 'edited' && t.who === 'Esther'), 'A: the edit, by Esther');
check(a.some(t => t.kind === 'task' && t.what === 'made a task') && a.some(t => t.kind === 'task' && t.what === 'closed the task' && t.who === 'Yossi' && t.side === 'site'), 'A: the task made (office) and closed by the worker (site)');
check(a.some(t => t.kind === 'message' && t.what === 'message from site' && t.side === 'site'), 'A: the message from site');
check(a.filter(t => t.kind === 'drive').length === 2 && a.some(t => t.what === 'Drive · removed old-quote.pdf' && t.who === 'Moshe'), 'A: two Drive touches, the removal named as such');
const b = byJob('B');
check(b.some(t => t.kind === 'opened' && t.who === 'Esther' && t.what === 'opened the job'), 'B: opening counts, with who');
check(b.some(t => t.kind === 'photo' && t.who === 'Yossi'), 'B: the photo is credited to the worker by his contractor id');
check(b.filter(t => t.kind === 'plan').length === 2 && b.some(t => t.what === 'resolved a pin' && t.who === 'Yossi'), 'B: the pin placed and resolved');
const c = byJob('C');
check(c.some(t => t.kind === 'edited' && /stage → Piping/.test(t.what)), 'C: the stage move says where it went');
check(c.some(t => t.kind === 'plan' && /v2/.test(t.what)), 'C: the markup with its version');
check(c.some(t => t.kind === 'notebook' && t.at === new Date(NOW - 86400000).toISOString() && t.who === 'Yossi'), 'C: an unstamped square still ahead is dated a day back, credited to the row\'s worker');
// A stamped entry says when it was planned.
const stamped = touchesOf({ ...src, elements: [{ id: 'CE-s', type: 'widget', widget: 'rota', data: { cells: { 'c:W1|2026-09-20': [{ id: 'e9', jobId: 'B', at: ago(0.25) }] } } }] }, NOW, 30);
check(stamped.some(t => t.jobId === 'B' && t.kind === 'notebook' && t.at === ago(0.25)), 'a stamped square is dated by its own stamp (15 min ago)');

// The fold: newest, count, kinds
const fold = foldByJob(touches, NOW, 30);
check(fold.get('A').last.what === 'Drive · changed proposal-v2.docx' && fold.get('A').count === 6, 'A folds to its newest touch (the Drive file) with the count of six', `${fold.get('A').count}`);
check([...fold.get('A').kinds].sort().join() === 'drive,edited,message,task', 'A\'s kinds, deduplicated', fold.get('A').kinds.join());
const order = rankJobs(fold, 'newest');
check(order[0] === 'A' && order[1] === 'G-auto-x' && order[2] === 'B', 'newest first: A (6 min), the swept job (30 min), B (1 h)', order.join(','));
// Busiest: A has 5 touches, B 4, C 4 — A leads; between B and C the score decides.
const busy = rankJobs(fold, 'busiest');
check(busy[0] === 'A' && busy[busy.length - 1] === 'G-auto-x', 'busiest first: A on top, the one-touch swept job last', busy.join(','));
// Chips
check(!foldByJob(touches, NOW, 30, 'drive').has('B') && foldByJob(touches, NOW, 30, 'drive').has('A'), 'the Drive chip keeps A and drops B');
check(foldByJob(touches, NOW, 30, 'site').get('A').last.what === 'closed the task', 'the Site chip: A\'s newest site touch is the worker closing the task');
check(foldByJob(touches, NOW, 30, 'notebook').size === 1, 'the Notebook chip keeps only C');
// Booked this week (Sun 6 Sep – Sat 12 Sep around the 7th)
const bk = bookedThisWeek(src.assignments, src.contractors, NOW);
check(bk.get('C')?.who === 'Yossi' && bk.get('C')?.day === '2026-09-08' && !bk.has('A'), 'C is booked this week (Yossi, Monday); A\'s task is closed so it is not', JSON.stringify([...bk]));

await server.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
