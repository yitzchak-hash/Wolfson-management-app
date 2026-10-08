// Moving a task to another apartment — the arithmetic (src/data/taskMove.ts),
// offline, every case worked by hand. The rules under test:
//   - a task's ticks are read back through the SAME rules that wrote them
//     (closed: done / half done per stagesUnfinished; open stage report:
//     happening now; a problem and a headline-only task: nothing);
//   - a tick comes off the old apartment only if no other task there stands
//     behind it AND it still reads what this task wrote;
//   - on the new apartment a move never undoes "done" or overrides "off".
// Plus the shipped-answer fallback for worker levels (src/data/workerLevels.ts).
import { createServer } from 'vite';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const { planTaskMove, marksTaskWrote, taskBaggage, placeLabel, isMoveTarget } = await server.ssrLoadModule('/src/data/taskMove.ts');
const { permsOf, levelAnswer, DEFAULT_WORKER_LEVELS } = await server.ssrLoadModule('/src/data/workerLevels.ts');

const ST = [
  { id: 'st-ready', name: 'Ready to start', order: 0, active: true, kind: 'marker', color: '#999' },
  { id: 's-pipe', name: 'Piping', order: 1, active: true, kind: 'work', color: '#111' },
  { id: 's-wall', name: 'Wall units', order: 2, active: true, kind: 'work', color: '#222' },
  { id: 's-reg', name: 'Registers', order: 3, active: true, kind: 'work', color: '#333' },
  { id: 'st-done', name: 'Job completed', order: 9, active: true, kind: 'marker', color: '#444' },
];
const apt = (id, marks, extra = {}) => ({
  id, buildingId: id.slice(0, 2), apartmentNumber: id.split('-')[1], displayName: '', floor: 3,
  currentStageId: null, stageMarks: marks, bubbles: true, isUnnamed: false, ...extra,
});
const task = (id, aptId, extra = {}) => ({
  id, contractorId: 'C1', apartmentId: aptId, buildingId: aptId.slice(0, 2), taskDescription: 'Registers — working here today',
  dueDate: '2026-10-01', stageId: null, completedAt: null, createdAt: '2026-10-01', createdBy: 'C1', createdByName: 'Igor', ...extra,
});

// ── what a task wrote ───────────────────────────────────────────────────────
const report = task('T1', 'A1-10', { stageReport: true, stageId: 's-reg', stageIds: ['s-reg'], stagesWorked: ['s-reg'], stagesUnfinished: [], completedAt: '2026-10-01T15:00:00Z' });
check(eq(marksTaskWrote(report, ST), [{ stageId: 's-reg', mark: 'done' }]), 'a closed stage report ticked its stage DONE');
const halfway = task('T3', 'A1-10', { stageReport: true, stageIds: ['s-wall', 's-reg'], stagesWorked: ['s-wall', 's-reg'], stagesUnfinished: ['s-wall'], completedAt: '2026-10-01T15:00:00Z' });
check(eq(marksTaskWrote(halfway, ST), [{ stageId: 's-wall', mark: 'pending' }, { stageId: 's-reg', mark: 'done' }]),
  'the stages he did not finish read HALF DONE, the rest done');
const legacyNo = task('T3b', 'A1-10', { stageReport: true, stagesWorked: ['s-reg'], stagesFinished: false, completedAt: 'x' });
check(eq(marksTaskWrote(legacyNo, ST), [{ stageId: 's-reg', mark: 'pending' }]), 'an older close with stagesFinished=false reads half done');
const open = task('T4', 'A1-10', { stageReport: true, stageId: 's-reg', stageIds: ['s-reg'], stagesWorked: ['s-reg'] });
check(eq(marksTaskWrote(open, ST), [{ stageId: 's-reg', mark: 'doing' }]), 'an OPEN stage report put its stage to happening now');
check(eq(marksTaskWrote(task('T5', 'A1-10', { stageReport: true, stageId: 's-reg' }), ST), []),
  'an open report with no picked stages wrote nothing (the start wrote no mark)');
check(eq(marksTaskWrote(task('T6', 'A1-10', { stageId: 's-reg', completedAt: 'x', problem: { status: 'solved', photosRequired: true, stageBefore: null } }), ST), []),
  'a PROBLEM ticks nothing');
check(eq(marksTaskWrote(task('T7', 'A1-10', { stageWhenDone: 's-reg', completedAt: 'x' }), ST), []),
  'an ordinary task that only carried stageWhenDone wrote no mark (the headline is left alone)');
check(eq(marksTaskWrote(task('T8', 'A1-10', { stageId: 's-pipe', completedAt: 'x' }), ST), [{ stageId: 's-pipe', mark: 'done' }]),
  'an ordinary closed task with a stage ticked it done (the set model\'s completion rule)');
check(eq(marksTaskWrote(task('T9', 'A1-10', { stageIds: ['st-done'], completedAt: 'x' }), ST), []),
  'a MARKER is never a tick');

// ── the plan ────────────────────────────────────────────────────────────────
const A1 = apt('A1-10', { 's-pipe': 'done', 's-wall': 'done', 's-reg': 'done' });
const A3 = apt('A3-10', { 's-pipe': 'done', 's-wall': 'doing' });
let p = planTaskMove(report, A1, A3, [report], ST);
check(eq(p.off, [{ stageId: 's-reg', mark: 'done' }]) && eq(p.on, [{ stageId: 's-reg', mark: 'done' }]) && !p.kept.length,
  'Registers done comes off A1 10 and goes onto A3 10', JSON.stringify(p));
check(eq(p.fromMarks, { 's-pipe': 'done', 's-wall': 'done' }), 'A1 10 is left with what the OTHER work did (in the base set, so no mark at all)');
check(eq(p.toMarks, { 's-pipe': 'done', 's-wall': 'doing', 's-reg': 'done' }), 'A3 10 gains Registers done, nothing else touched');
check(p.fromChanged && p.toChanged, 'both apartments are written');

const other = task('T2', 'A1-10', { stageId: 's-reg', completedAt: '2026-09-20T10:00:00Z' });
p = planTaskMove(report, A1, A3, [report, other], ST);
check(!p.off.length && eq(p.kept, [{ stageId: 's-reg', mark: 'done' }]) && !p.fromChanged,
  'another task on A1 10 that also did Registers keeps the tick there', JSON.stringify(p.kept));
check(eq(p.on, [{ stageId: 's-reg', mark: 'done' }]), '…and A3 10 still gets it');
p = planTaskMove(report, A1, A3, [report, { ...other, apartmentId: 'A2-10' }], ST);
check(p.off.length === 1, 'a task on a DIFFERENT apartment stands behind nothing on A1 10');

p = planTaskMove(report, apt('A1-10', { 's-reg': 'pending' }), A3, [report], ST);
check(!p.off.length && !p.fromChanged, 'a tick the office changed by hand since (pending, not done) is the office\'s — left alone');

p = planTaskMove(halfway, apt('A1-10', { 's-wall': 'pending', 's-reg': 'done' }), apt('A3-10', {}), [halfway], ST);
check(p.off.length === 2 && eq(p.toMarks, { 's-wall': 'pending', 's-reg': 'done' }),
  'half done travels as half done, done as done', JSON.stringify(p.toMarks));

p = planTaskMove(report, A1, apt('A3-10', { 's-reg': 'done' }), [report], ST);
check(!p.on.length && !p.toChanged && p.off.length === 1, 'already done on A3 10: nothing to add there, still comes off A1 10');
p = planTaskMove(halfway, apt('A1-10', { 's-wall': 'pending', 's-reg': 'done' }), apt('A3-10', { 's-wall': 'done' }), [halfway], ST);
check(eq(p.toMarks['s-wall'], 'done'), 'a move never undoes a FINISHED stage on the apartment it lands on');
p = planTaskMove(report, A1, apt('A3-10', { 's-reg': 'off' }), [report], ST);
check(eq(p.toMarks['s-reg'], 'off') && !p.on.length, 'nor a stage the office switched OFF there');

p = planTaskMove(open, apt('A1-10', { 's-reg': 'doing' }), apt('A3-10', { 's-reg': 'pending' }), [open], ST);
check(eq(p.fromMarks, undefined) && eq(p.toMarks, { 's-reg': 'doing' }),
  'an open report\'s happening-now moves with it (the empty map collapses to undefined)', JSON.stringify(p));

// A stage that is on A1 10 only because somebody ADDED it (not in its tipus set)
// goes back to an explicit to-do, or taking the tick off would take the stage away.
const ctx = { tipusStages: { T2: ['s-pipe', 's-wall'] } };
p = planTaskMove(report, apt('A1-10', { 's-reg': 'done' }, { tipus: 'T2' }), A3, [report], ST, ctx);
check(eq(p.fromMarks, { 's-reg': 'todo' }), 'an added stage outside the tipus set stays on the apartment as to do', JSON.stringify(p.fromMarks));

// A record not yet migrated reads through the migration (stages before its
// headline are done) — it is never compared against raw, half-empty marks.
p = planTaskMove(task('TP', 'A1-10', { stageId: 's-pipe', completedAt: 'x' }),
  apt('A1-10', undefined, { bubbles: false, currentStageId: 's-reg' }), A3, [], ST);
check(eq(p.off, [{ stageId: 's-pipe', mark: 'done' }]) && eq(p.fromMarks, { 's-wall': 'done', 's-reg': 'todo' }),
  'an unmigrated apartment is read through the migration', JSON.stringify(p.fromMarks));

// ── what travels with it ────────────────────────────────────────────────────
const photos = [
  { id: 'p1', assignmentId: 'T1', filename: 'a.jpg', mimeType: 'image/jpeg' },
  { id: 'p2', assignmentId: 'T1', filename: 'b.JPG' },
  { id: 'p3', assignmentId: 'T1', filename: 'walk.mp4', mimeType: 'video/mp4', driveFileId: 'D1' },
  { id: 'p4', assignmentId: 'T1', filename: 'spec.pdf', mimeType: 'application/pdf' },
  { id: 'p5', assignmentId: 'T1', filename: 'IMG' },                         // an old typeless record — a picture
  { id: 'p6', assignmentId: 'T1', filename: 'clip', fileType: 'video' },    // no extension, labelled a film
  { id: 'p7', assignmentId: 'OTHER', filename: 'x.jpg' },
];
const notes = [
  { id: 'n1', assignmentId: 'T1' }, { id: 'n2', assignmentId: 'T1' }, { id: 'n3', assignmentId: 'OTHER' },
];
const b = taskBaggage('T1', photos, notes);
check(eq(b, { photos: 3, films: 2, files: 1, messages: 2, onDrive: true }), 'counted the way a person counts: 3 photos, 2 films, 1 file, 2 messages', JSON.stringify(b));
check(!taskBaggage('T1', photos.filter(x => !x.driveFileId), notes).onDrive, 'nothing on Drive says so');

check(placeLabel({ buildingId: 'A1', apartmentNumber: '10', displayName: 'Aharonov' }) === 'A1 10', '"A1 10" — building and number');
check(placeLabel({ buildingId: 'G', apartmentNumber: '', displayName: 'Cohen, David' }) === 'Cohen, David', 'a Job Board job is its name');
check(isMoveTarget({ apartmentNumber: '10' }) && !isMoveTarget({ apartmentNumber: '57', isUnnamed: true })
  && isMoveTarget({ displayName: 'Cohen', boardBin: 'done' }) && !isMoveTarget({ displayName: 'Cohen', boardBin: 'trash' }),
  'a real unit is a target; a blank slot and Trash are not; a job filed in Done still is');

// ── the shipped answer for a switch a stored level never had ────────────────
const storedManager = { ...DEFAULT_WORKER_LEVELS.find(l => l.id === 'lvl-manager'), perms: { ownTasks: true } };
const storedContractor = { ...DEFAULT_WORKER_LEVELS.find(l => l.id === 'lvl-contractor'), perms: { ownTasks: true } };
check(levelAnswer(storedManager, 'moveOwnWork') === true, 'a Manager level stored before the switch existed reads it ON (the shipped answer)');
check(levelAnswer(storedContractor, 'moveOwnWork') === false, 'a Contractor level reads it OFF');
check(levelAnswer({ ...storedManager, perms: { moveOwnWork: false } }, 'moveOwnWork') === false, 'an answer somebody GAVE always wins');
check(levelAnswer({ id: 'lvl-mine', name: 'Mine', perms: {} }, 'moveOwnWork') === false, 'a level the office made itself has no shipped answer: off');
const levels = [storedManager, storedContractor];
check(permsOf({ levelId: 'lvl-manager' }, levels).moveOwnWork && !permsOf({ levelId: 'lvl-contractor' }, levels).moveOwnWork,
  'permsOf follows it: managers can move their own work, contractors cannot');
check(permsOf({ levelId: 'lvl-contractor', perms: { moveOwnWork: true } }, levels).moveOwnWork, 'a personal override turns it on for one worker');


// ── the same-day revert (owner, 2026-10-08): a task that remembers how the
//    apartment stood when the worker STARTED puts it back exactly so.
{
  const SS = [
    { id: 'skhtatb', name: 'Sold/Start', order: 1, active: true, kind: 'work', color: '#1' },
    { id: 's-drill', name: 'Drilling', order: 2, active: true, kind: 'work', color: '#2' },
    { id: 's-pipe', name: 'Piping', order: 3, active: true, kind: 'work', color: '#3' },
    { id: 's-wall', name: 'Wall units', order: 4, active: true, kind: 'work', color: '#4' },
  ];
  // Morning: Wall units was HALF DONE, nothing else. He started on the wrong
  // flat, picked Wall units + Piping, finished both (Sold/Start ticked itself).
  const before = { 's-wall': 'pending' };
  const t = task('TR', 'A1-12', { stageReport: true, stageIds: ['s-wall', 's-pipe'], stagesWorked: ['s-wall', 's-pipe'], stagesUnfinished: [],
    completedAt: '2026-10-08T15:00:00Z', marksBefore: before, marksBeforeAt: '2026-10-08T08:00:00Z' });
  const wrong = apt('A1-12', { skhtatb: 'done', 's-pipe': 'done', 's-wall': 'done' });
  let q = planTaskMove(t, wrong, apt('A3-12', {}), [t], SS);
  check(q.restored === true, 'a task with a before-snapshot restores the old apartment');
  check(eq(q.fromMarks, { 's-wall': 'pending' }), 'the old apartment is EXACTLY as it was that morning — half-done Wall units, Sold/Start un-ticked', JSON.stringify(q.fromMarks));
  check(eq(q.toMarks, { 's-wall': 'done', 's-pipe': 'done' }), 'and the right apartment gets the work', JSON.stringify(q.toMarks));
  // An office hand changed Piping to "not needed" since: that stays.
  q = planTaskMove(t, apt('A1-12', { skhtatb: 'done', 's-pipe': 'off', 's-wall': 'done' }), apt('A3-12', {}), [t], SS);
  check(q.fromMarks['s-pipe'] === 'off', 'a stage somebody changed by hand since is left alone', JSON.stringify(q.fromMarks));
  // Another task on the old flat stands behind Piping: Piping AND Sold/Start stay.
  const other2 = task('TO', 'A1-12', { stageIds: ['s-pipe'], stageId: 's-pipe', completedAt: '2026-09-30T10:00:00Z' });
  q = planTaskMove(t, wrong, apt('A3-12', {}), [t, other2], SS);
  check(q.fromMarks['s-pipe'] === 'done' && q.fromMarks.skhtatb === 'done', 'a stage another task stands behind stays, and so does the Sold/Start it implies', JSON.stringify(q.fromMarks));
  check(q.fromMarks['s-wall'] === 'pending', 'while his own Wall units still goes back to half done');
  // Still open (he only started): the "happening now" marks come off, morning state back.
  const tOpen = task('TQ', 'A1-12', { stageReport: true, stageIds: ['s-drill'], stagesWorked: ['s-drill'], marksBefore: {}, marksBeforeAt: '2026-10-08T08:00:00Z' });
  q = planTaskMove(tOpen, apt('A1-12', { skhtatb: 'done', 's-drill': 'doing' }), apt('A3-12', {}), [tOpen], SS);
  check(q.fromMarks === undefined, 'an open start on the wrong flat leaves it untouched, Sold/Start included', JSON.stringify(q.fromMarks));
  // No snapshot (an older task): the old rule — ticks come off to "to do".
  const tOld = { ...t, marksBefore: undefined };
  q = planTaskMove(tOld, wrong, apt('A3-12', {}), [tOld], SS);
  check(!q.restored && q.fromMarks?.['s-wall'] === undefined, 'an older task without a snapshot keeps the old rule', JSON.stringify(q.fromMarks));
}

await server.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
