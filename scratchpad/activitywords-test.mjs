// The activity log in plain words, offline: every record shape the app has
// ever written gets a sentence with no field names, type codes, timestamps or
// camera file names in it; neighbouring runs fold; the set model's stage
// records read as what was ticked. Numbers worked by hand.
import { createServer } from 'vite';
let fails = 0, passes = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (ok) passes++; else fails++; };
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const W = await server.ssrLoadModule('/src/data/activityWords.ts');
const M = await server.ssrLoadModule('/src/data/stageMarks.ts');
const { describeLog, describeGroup, foldActivity, kindOf, familyOf, placeName } = W;

const T0 = Date.parse('2026-10-05T09:00:00.000Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
let seq = 0;
const log = (over) => ({
  id: `L${++seq}`, userId: 'C-igor', userName: 'Igor', buildingId: 'A1', apartmentId: 'A1-9',
  apartmentNumber: '9', actionType: 'update', fieldChanged: '', previousValue: '', newValue: '',
  stageId: '', createdAt: at(0), ...over,
});
const stages = [
  { id: 's1', name: 'Piping', nameHe: 'צנרת', color: '#000', order: 1, active: true },
  { id: 's2', name: 'Wall Units', nameHe: 'יחידות קיר', color: '#000', order: 2, active: true },
  { id: 's3', name: 'Registers', nameHe: 'רשתות', color: '#000', order: 3, active: true },
  { id: 's4', name: 'Access Panels', nameHe: 'פתחי שירות', color: '#000', order: 4, active: true },
  { id: 's5', name: 'Fans', color: '#000', order: 5, active: true },
  { id: 's6', name: 'Thermostats', color: '#000', order: 6, active: true },
  { id: 'mk', name: 'Job completed', color: '#000', order: 9, active: true, kind: 'marker' },
];
const en = { lang: 'en', stages };
const he = { lang: 'he', stages };
const say = (l, c = en) => { const s = describeLog(l, c); return `${s.who} ${s.text}${s.detail ? ` [${s.detail}]` : ''}`; };

// ── Every shape the app writes, in words ──
const corpus = [
  [log({ actionType: 'opened', fieldChanged: 'viewed', userName: 'Yitzchak' }), 'Yitzchak opened the apartment'],
  [log({ actionType: 'opened', fieldChanged: 'viewed', buildingId: 'G', apartmentId: 'G-1' }), 'Igor opened the job'],
  [log({ actionType: 'contractor_upload', fieldChanged: 'photo_uploaded', newValue: '1791204142497409322422886791595.jpg' }), 'Igor uploaded a photo'],
  [log({ actionType: 'contractor_upload', fieldChanged: 'photo_uploaded', newValue: 'clip.mp4' }), 'Igor uploaded a video'],
  [log({ actionType: 'contractor_upload', fieldChanged: 'photo_uploaded', newValue: 'quote.pdf' }), 'Igor uploaded a file [quote.pdf]'],
  [log({ actionType: 'contractor_note', fieldChanged: 'note_added', newValue: 'The pipe is leaking' }), 'Igor sent a message [The pipe is leaking]'],
  [log({ actionType: 'contractor_note', fieldChanged: 'note_added', newValue: '2 file(s)' }), 'Igor sent 2 files'],
  [log({ actionType: 'contractor_note', fieldChanged: 'note_files', newValue: 'memo-1759655000000.webm' }), 'Igor sent a voice memo'],
  [log({ actionType: 'contractor_note', fieldChanged: 'note_files', newValue: 'a.jpg, b.jpg' }), 'Igor sent 2 photos'],
  [log({ actionType: 'contractor_note', fieldChanged: 'problem_closed', newValue: at(3) }), 'Igor fixed the problem — waiting for approval'],
  [log({ actionType: 'contractor_complete', fieldChanged: 'completedAt', newValue: '2026-10-05T09:41:12.000Z' }), 'Igor closed the task'],
  [log({ actionType: 'contractor_complete', fieldChanged: 'completedAt', newValue: 'Registers — working here today' }), 'Igor closed the task [Registers]'],
  [log({ actionType: 'contractor_complete', fieldChanged: 'problem_approved', userName: 'Esther', newValue: 'Leak under the sink' }), 'Esther approved the fix [Leak under the sink]'],
  [log({ actionType: 'contractor_assigned', fieldChanged: 'problem', userName: 'Esther', newValue: 'Leak under the sink' }), 'Esther reported a problem [Leak under the sink]'],
  [log({ actionType: 'task_created', fieldChanged: 'task', newValue: 'Registers — working here today' }), 'Igor started work here — Registers'],
  [log({ actionType: 'task_created', fieldChanged: 'task', newValue: 'Registers + Access Panels — working here today' }), 'Igor started work here — Registers and Access Panels'],
  [log({ actionType: 'task_created', fieldChanged: 'task', newValue: 'Wall Units — работаю здесь сегодня' }), 'Igor started work here — Wall Units'],
  [log({ actionType: 'task_created', fieldChanged: 'work_started', newValue: 'working here today', stageId: 's3' }), 'Igor started work here — Registers'],
  [log({ actionType: 'task_created', fieldChanged: 'task', userName: 'Esther', newValue: 'Fit registers in both bedrooms' }), 'Esther created a task [Fit registers in both bedrooms]'],
  [log({ actionType: 'task_completed', fieldChanged: 'task', userName: 'Esther', newValue: 'Fit registers' }), 'Esther closed the task [Fit registers]'],
  [log({ actionType: 'task_uncompleted', fieldChanged: 'task', userName: 'Esther', previousValue: 'Fit registers' }), 'Esther reopened the task [Fit registers]'],
  [log({ actionType: 'task_deleted', fieldChanged: 'task', userName: 'Esther', previousValue: 'Fit registers' }), 'Esther deleted a task [Fit registers]'],
  // A task moved to the right apartment writes one line on each (2026-10-05).
  [log({ actionType: 'task_moved_out', fieldChanged: 'task', userName: 'Yitzchak', previousValue: 'A1 10', newValue: 'A3 10', taskText: 'Wall Units — working here today', workerName: 'Igor' }), "Yitzchak moved Igor's task to A3 10 [Wall Units]"],
  [log({ actionType: 'task_moved_in', fieldChanged: 'task', userName: 'Yitzchak', apartmentId: 'A3-10', previousValue: 'A1 10', newValue: 'A3 10', taskText: 'Fit registers' }), 'Yitzchak moved a task here from A1 10 [Fit registers]'],
  [log({ actionType: 'note', fieldChanged: 'stageNote', userName: 'Esther', stageId: 's3', newValue: 'Bring the long ladder' }), 'Esther added a note — Registers [Bring the long ladder]'],
  [log({ actionType: 'note', fieldChanged: 'stageNote', userName: 'Esther', stageId: 's3', previousValue: 'Old line', newValue: 'Old line\nNew line' }), 'Esther added a note — Registers [New line]'],
  [log({ actionType: 'note', fieldChanged: 'stageNoteFile', userName: 'Esther', stageId: 's3', newValue: 'voice-memo-1759655000000.webm' }), 'Esther added a voice memo — Registers'],
  [log({ actionType: 'note', fieldChanged: 'stageNote', userName: 'Esther', stageId: 's3', newValue: 'IMG_2231.jpg' }), 'Esther added a photo — Registers'],
  [log({ fieldChanged: 'generalNotes', userName: 'Esther', previousValue: 'Gate code 1234', newValue: 'Client away until Sunday' }), 'Esther added a note [Client away until Sunday]'],
  [log({ fieldChanged: 'generalNotes', userName: 'Esther', previousValue: 'Gate code 1234\nClient away', newValue: 'Gate code 1234' }), 'Esther removed a note [Client away]'],
  [log({ fieldChanged: 'generalNotes', userName: 'Esther', previousValue: 'Client away', newValue: '' }), 'Esther removed a note [Client away]'],
  [log({ fieldChanged: 'generalNotes', userName: 'Esther', previousValue: '', newValue: 'First note' }), 'Esther added a note [First note]'],
  [log({ fieldChanged: 'currentStageId', previousValue: 'Registers', newValue: 'Access Panels', stageId: 's4' }), 'Igor — next up: Access Panels (was Registers)'],
  [log({ fieldChanged: 'currentStageId', previousValue: 'Not started', newValue: 'Piping', stageId: 's1' }), 'Igor — next up: Piping'],
  [log({ fieldChanged: 'currentStageId', previousValue: 'Registers', newValue: 'Not started', stageId: '' }), 'Igor — back to not started (was Registers)'],
  [log({ fieldChanged: 'displayName', userName: 'Esther', previousValue: '', newValue: 'Levi, Dana' }), 'Esther renamed it to “Levi, Dana”'],
  [log({ fieldChanged: 'classification', userName: 'Esther', previousValue: 'standard', newValue: 'shinui' }), 'Esther marked it as Changes'],
  [log({ fieldChanged: 'address', userName: 'Esther', newValue: 'Herzl 5' }), 'Esther edited the address'],
  [log({ fieldChanged: 'somethingNew', userName: 'Esther', newValue: 'x' }), 'Esther edited the apartment'],
  [log({ actionType: 'create', fieldChanged: '', buildingId: 'G', apartmentId: 'G-2' }), 'Igor added the job'],
  [log({ actionType: 'delete', fieldChanged: '', buildingId: 'G', apartmentId: 'G-2' }), 'Igor deleted the job'],
  // The set model's own records.
  [log({ actionType: 'stage_marks', fieldChanged: 'stageMarks', marks: [{ id: 's3', name: 'Registers', from: 'doing', to: 'done' }] }), 'Igor marked Registers done'],
  [log({ actionType: 'stage_marks', fieldChanged: 'stageMarks', marks: [{ id: 's2', name: 'Wall Units', from: 'todo', to: 'doing' }] }), 'Igor started Wall Units'],
  [log({ actionType: 'stage_marks', fieldChanged: 'stageMarks', marks: [{ id: 's5', name: 'Fans', from: 'doing', to: 'pending' }] }), 'Igor set Fans half done'],
  [log({ actionType: 'stage_marks', fieldChanged: 'stageMarks', userName: 'Yitzchak', marks: [{ id: 's3', name: 'Registers', from: 'done', to: 'todo' }] }), 'Yitzchak un-ticked Registers'],
  [log({ actionType: 'stage_marks', fieldChanged: 'stageMarks', userName: 'Yitzchak', marks: [{ id: 's5', name: 'Fans', from: 'todo', to: 'off' }] }), 'Yitzchak marked Fans not needed'],
  [log({ actionType: 'stage_marks', fieldChanged: 'stageMarks', userName: 'Yitzchak', marks: [{ id: 'cx', name: 'Duct cleaning', from: 'none', to: 'todo' }] }), 'Yitzchak added Duct cleaning'],
  [log({ actionType: 'stage_marks', fieldChanged: 'stageMarks', marks: [
    { id: 's4', name: 'Access Panels', from: 'todo', to: 'doing' }, { id: 's3', name: 'Registers', from: 'doing', to: 'done' }] }),
    'Igor marked Registers done, started Access Panels'],
  [log({ actionType: 'stage_marks', fieldChanged: 'stageMarks', userName: 'Yitzchak', marker: 'Job completed', marks: ['s1', 's2', 's3', 's4', 's5'].map(id => ({ id, name: stages.find(s => s.id === id).name, from: 'todo', to: 'done' })) }),
    'Yitzchak set the whole flat to Job completed [marked 5 stages done · Piping, Wall Units, Registers, Access Panels, Fans]'],
  [log({ actionType: 'stage_marks', fieldChanged: 'stageMarks', userName: '', marks: [{ id: 's3', name: 'Registers', from: 'todo', to: 'done' }] }), 'Someone marked Registers done'],
];
for (const [l, want] of corpus) {
  const got = say(l);
  check(got === want, `${l.actionType}/${l.fieldChanged || '—'} → "${want}"`, got === want ? '' : `got "${got}"`);
}

// ── Nothing a person cannot read ──
const BANNED = /\b(viewed|completedAt|photo_uploaded|stage note task|Stage\/field change|contractor_upload|contractor_note|contractor_complete|task_created|task_completed|stageMarks|currentStageId|generalNotes|note_added|note_files|changed stage)\b|\d{4}-\d{2}-\d{2}T\d{2}:|\d{9,}\.(jpe?g|png|mp4|webm)/i;
const allText = corpus.flatMap(([l]) => [describeLog(l, en), describeLog(l, he)]).map(s => `${s.who} ${s.text} ${s.detail ?? ''}`);
const dirty = allText.filter(t => BANNED.test(t));
check(dirty.length === 0, 'no field names, type codes, ISO times or camera file names in any sentence, English or Hebrew', dirty.slice(0, 3).join(' | '));
check(corpus.every(([l]) => familyOf(kindOf(l))), 'every record has a family for the page\'s filter');

// ── Hebrew ──
const heUp = describeGroup([1, 2, 3, 4, 5].map(i => log({ actionType: 'contractor_upload', fieldChanged: 'photo_uploaded', newValue: `${i}.jpg`, createdAt: at(-i) })), he);
check(heUp.text === 'העלה 5 תמונות', 'Hebrew: five photos', heUp.text);
const heMk = describeLog(log({ actionType: 'stage_marks', marks: [{ id: 's3', name: 'Registers', from: 'doing', to: 'done' }] }), he);
check(heMk.text === 'סימן כגמור: רשתות', 'Hebrew: a stage named in Hebrew', heMk.text);
const heNext = describeLog(log({ fieldChanged: 'currentStageId', previousValue: 'Registers', newValue: 'Access Panels', stageId: 's4' }), he);
check(heNext.text === '— הבא בתור: פתחי שירות (היה רשתות)', 'Hebrew: an old headline record, stage names translated', heNext.text);
check(describeLog(log({ actionType: 'opened', userName: '' }), he).who === 'מישהו', 'Hebrew: a nameless record is "someone"');
const heMv = describeLog(log({ actionType: 'task_moved_in', fieldChanged: 'task', userName: 'Yitzchak', previousValue: 'A1 10', newValue: 'A3 10', taskText: 'Fit registers', workerName: 'Igor' }), he);
check(heMv.text === 'העביר את המשימה של Igor לכאן מ־A1 10', 'Hebrew: a task moved here', heMv.text);
const mvRun = foldActivity([
  log({ id: 'mv2', actionType: 'task_moved_out', fieldChanged: 'task', userName: 'Yitzchak', newValue: 'A3 10', taskText: 'Wall Units', createdAt: at(2) }),
  log({ id: 'mv1', actionType: 'task_moved_out', fieldChanged: 'task', userName: 'Yitzchak', newValue: 'A3 10', taskText: 'Fans', createdAt: at(1) }),
]);
check(mvRun.length === 1 && describeGroup(mvRun[0].logs, en).text === 'moved 2 tasks to A3 10', 'two tasks moved off together read as one line', mvRun.length ? describeGroup(mvRun[0].logs, en).text : '');
check(familyOf(kindOf(log({ actionType: 'task_moved_in' }))) === 'tasks', 'a moved task sits under Tasks');

// ── Consolidation ──
const run = [
  log({ id: 'u5', actionType: 'contractor_upload', newValue: '5.jpg', createdAt: at(40) }),
  log({ id: 'u4', actionType: 'contractor_upload', newValue: '4.jpg', createdAt: at(38) }),
  log({ id: 'u3', actionType: 'contractor_upload', newValue: '3.jpg', createdAt: at(30) }),
  log({ id: 'u2', actionType: 'contractor_upload', newValue: '2.jpg', createdAt: at(15) }),
  log({ id: 'u1', actionType: 'contractor_upload', newValue: '1.jpg', createdAt: at(12) }),
];
const g1 = foldActivity(run);
check(g1.length === 1 && g1[0].logs.length === 5 && g1[0].id === 'u5', 'five uploads by one person on one apartment within the hour are ONE row', JSON.stringify(g1.map(g => g.logs.length)));
check(describeGroup(g1[0].logs, en).text === 'uploaded 5 photos', 'and it reads "uploaded 5 photos"', describeGroup(g1[0].logs, en).text);
check(g1[0].newest === at(40) && g1[0].oldest === at(12), 'the row knows its first and last moment');
const mixed = describeGroup([
  log({ actionType: 'contractor_upload', newValue: 'a.jpg' }), log({ actionType: 'contractor_upload', newValue: 'b.jpg' }),
  log({ actionType: 'contractor_upload', newValue: 'c.mov' }), log({ actionType: 'contractor_upload', newValue: 'specs.pdf' }),
], en);
check(mixed.text === 'uploaded 2 photos, a video and a file' && mixed.detail === 'specs.pdf', 'a mixed run counts each kind, the document named small', `${mixed.text} [${mixed.detail}]`);

const split = foldActivity([
  log({ id: 'a', actionType: 'contractor_upload', newValue: 'a.jpg', createdAt: at(30) }),
  log({ id: 'm', actionType: 'contractor_note', fieldChanged: 'note_added', newValue: 'hi', createdAt: at(25) }),
  log({ id: 'b', actionType: 'contractor_upload', newValue: 'b.jpg', createdAt: at(20) }),
]);
check(split.length === 3, 'his own message between two uploads keeps them apart — his story stays in order');
const crossed = foldActivity([
  log({ id: 'x3', actionType: 'contractor_upload', newValue: 'a.jpg', createdAt: at(30) }),
  { ...log({ id: 'xe', userId: 'U-e', userName: 'Esther', apartmentId: 'B1-4', actionType: 'note', newValue: 'ladder', createdAt: at(26) }), ws: 'netiv' },
  log({ id: 'x2', actionType: 'contractor_upload', newValue: 'b.jpg', createdAt: at(22) }),
  log({ id: 'x1', actionType: 'contractor_upload', newValue: 'c.jpg', createdAt: at(20) }),
]);
check(crossed.length === 2 && crossed[0].logs.length === 3 && crossed[1].id === 'xe',
  'somebody ELSE\'s line in the middle does not split his run (the centre interleaves every workspace)', JSON.stringify(crossed.map(g => [g.id, g.logs.length])));
check(foldActivity([log({ actionType: 'opened', createdAt: at(10) }), log({ actionType: 'opened', userId: 'U-y', userName: 'Yitzchak', createdAt: at(9) })]).length === 2, 'two people never fold together');
check(foldActivity([log({ actionType: 'opened', createdAt: at(10) }), log({ actionType: 'opened', apartmentId: 'A1-10', createdAt: at(9) })]).length === 2, 'two apartments never fold together');
check(foldActivity([log({ actionType: 'opened', createdAt: at(50) }), log({ actionType: 'opened', createdAt: at(19) })]).length === 2, 'thirty-one minutes apart is two visits');
check(foldActivity([log({ actionType: 'opened', createdAt: at(30) }), log({ actionType: 'opened', createdAt: at(0) })]).length === 1, 'thirty minutes apart still folds');
check(foldActivity([{ ...log({ actionType: 'opened', createdAt: at(10) }), ws: 'wolfson' }, { ...log({ actionType: 'opened', createdAt: at(9) }), ws: 'netiv' }]).length === 2, 'two workspaces never fold together');
const chain = foldActivity([0, 1, 2, 3].map(i => log({ actionType: 'contractor_upload', newValue: `${i}.jpg`, createdAt: at(80 - i * 25) })));
check(chain.length === 1 && chain[0].logs.length === 4, 'a steady run (every 25 minutes for 75 minutes) stays one row — the gap is between neighbours');
const opens = foldActivity([0, 1, 2].map(i => log({ actionType: 'opened', userName: 'Yitzchak', userId: 'U-y', createdAt: at(10 - i) })));
check(opens.length === 1 && describeGroup(opens[0].logs, en).text === 'opened it 3 times', '"opened it 3 times"', describeGroup(opens[0].logs, en).text);
const marksRun = foldActivity([
  log({ actionType: 'stage_marks', marks: [{ id: 's3', name: 'Registers', from: 'doing', to: 'done' }], createdAt: at(20) }),
  log({ actionType: 'stage_marks', marks: [{ id: 's3', name: 'Registers', from: 'todo', to: 'doing' }, { id: 's4', name: 'Access Panels', from: 'todo', to: 'doing' }], createdAt: at(5) }),
]);
check(marksRun.length === 1 && describeGroup(marksRun[0].logs, en).text === 'marked Registers done, started Access Panels', 'a run of stage records nets out — started then done is "marked done"', describeGroup(marksRun[0].logs, en).text);
const msgs = describeGroup([log({ actionType: 'contractor_note', fieldChanged: 'note_added', newValue: 'second' }), log({ actionType: 'contractor_note', fieldChanged: 'note_files', newValue: 'memo-1.webm' }), log({ actionType: 'contractor_note', fieldChanged: 'note_added', newValue: 'first' })], en);
check(msgs.text === 'sent 2 messages and a voice memo' && msgs.detail === 'second', 'a run of messages counts them and shows the newest words', `${msgs.text} [${msgs.detail}]`);

// ── Where it happened ──
check(placeName(log({}), { apartmentNumber: '9', displayName: 'Levi' }) === '9 — Levi', 'a live apartment is named by its own label');
check(placeName(log({ apartmentNumber: 'G-mf91xka', buildingId: 'G' }), undefined) === 'a job', 'an internal id is never printed as a name');
check(placeName(log({ apartmentNumber: 'Cohen' }), undefined) === 'Cohen', 'a deleted record keeps the name it stored');
check(placeName(log({ apartmentNumber: '' }), undefined, 'he') === 'דירה', 'Hebrew fallback');

// ── The stage diff the store writes ──
const sorted = stages;
const apt0 = { id: 'A1-9', bubbles: true, currentStageId: 's2', stageMarks: { s1: 'done', s2: 'doing' } };
const apt1 = { ...apt0, stageMarks: { s1: 'done', s2: 'done', s3: 'doing' } };
const d1 = M.stageChangesOf(apt0, apt1, sorted, {});
check(JSON.stringify(d1) === JSON.stringify([{ id: 's2', name: 'Wall Units', from: 'doing', to: 'done' }, { id: 's3', name: 'Registers', from: 'todo', to: 'doing' }]),
  'stageChangesOf names exactly the stages that moved, in order', JSON.stringify(d1));
const d2 = M.stageChangesOf(apt0, { ...apt0, stageMarks: { ...apt0.stageMarks, s5: 'off' } }, sorted, {});
check(d2.length === 1 && d2[0].from === 'todo' && d2[0].to === 'off', 'switching a stage off reads todo → off');
const custom = [...sorted, { id: 'cx', name: 'Duct cleaning', color: '#000', order: 7, active: true, custom: true, onApartments: [] }];
const d3 = M.stageChangesOf(apt0, { ...apt0, stageMarks: { ...apt0.stageMarks, cx: 'todo' } }, custom, {});
check(d3.length === 1 && d3[0].from === 'none' && d3[0].to === 'todo', 'adding a custom stage to the flat reads none → todo');
check(M.stageChangesOf(apt0, { ...apt0, currentStageId: 's4' }, sorted, {}).length === 0, 'the HEADLINE moving on its own is not a stage change');

// ── The read diet: the other workspaces' logs are fetched by the Activity page, never at app load ──
const fs = await import('fs');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
const callers = walk('src').filter(f => /\.(ts|tsx)$/.test(f) && /fetchActivityFor\(/.test(fs.readFileSync(f, 'utf8')));
check(callers.sort().join(',') === 'src/data/activityCenter.ts,src/pages/ActivityLogPage.tsx',
  'only the Activity page asks the cloud for the other workspaces\' activity', callers.join(','));

await server.close();
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
