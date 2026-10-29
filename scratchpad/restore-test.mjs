// PROOF of the restore (lib/fullRestore.js) against a REAL Firestore (the
// emulator, project demo-restore) with an in-memory stand-in for Drive.
//   1. a full backup is taken; then the office changes things (a job added,
//      one edited, one deleted, a pin added, a setting changed, a whole
//      workspace's widget removed);
//   2. restoring that backup makes the cloud EXACTLY as the backup was —
//      added things gone, edited put back, deleted back — in every workspace;
//   3. a safety backup of the changed state was saved first, and restoring
//      THAT brings the changes back (a restore can be taken back);
//   4. the job the restore removed is on the deletion list, so no computer
//      re-uploads it;
//   5. an OLD one-workspace file restores only its workspace, and does not
//      trim the activity log to the file's short list.
// Needs the emulator on 8085. Run: node scratchpad/restore-test.mjs
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, writeBatch, updateDoc, setDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';
import { runFullBackup, gunzipJson, FILE_PREFIX } from '../lib/fullBackup.js';
import { runRestore } from '../lib/fullRestore.js';

const PROJECT = 'demo-restore';
const app = initializeApp({ projectId: PROJECT, apiKey: 'demo', appId: 'demo' });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8085);
const env = { FIRESTORE_REST_BASE: `http://127.0.0.1:8085/v1/projects/${PROJECT}/databases/(default)/documents` };
let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };
const J = v => JSON.stringify(v);

// ── stand-in Drive ──
const files = [{ id: 'B', name: 'Backups', folder: true }];
let n = 1; let clock = new Date('2026-10-29T08:00:00Z');
const drive = { files: {
  list: async ({ q }) => {
    if (q.includes("name = 'Backups'")) return { data: { files: [{ id: 'B' }] } };
    const own = files.filter(f => !f.folder && f.name.includes(FILE_PREFIX)).sort((a, b) => (a.name < b.name ? 1 : -1));
    return { data: { files: own.slice(0, 1).map(f => ({ id: f.id, name: f.name, createdTime: f.createdTime })) } };
  },
  create: async ({ requestBody, media }) => {
    const id = `F${n++}`; const chunks = []; for await (const c of media.body) chunks.push(c);
    files.push({ id, name: requestBody.name, body: Buffer.concat(chunks), createdTime: clock.toISOString() }); return { data: { id } };
  },
  get: async ({ fileId }) => ({ data: files.find(f => f.id === fileId).body }),
} };

// ── what the cloud holds, comparable (no server stamps) ──
const COLLS = ['settings', 'stages', 'users', 'apartments', 'canvasElements', 'general_apartments', 'general_canvasElements', 'general_tombstones', 'netiv_apartments', 'activityLogs', 'contractorAssignments'];
async function state() {
  const out = {};
  for (const c of COLLS) {
    const snap = await getDocs(collection(db, c));
    for (const d of snap.docs) { const x = { ...d.data() }; delete x._updatedAt; out[`${c}/${d.id}`] = x; }
  }
  return out;
}
const S = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));   // key order does not matter
const diff = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => S(a[k]) !== S(b[k]));

await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
const b = writeBatch(db);
b.set(doc(db, 'settings', 'app'), { backupDriveFolderLink: 'https://drive.google.com/drive/folders/P1', boardSettings: { wolfson: { customButtons: [{ id: 'cb1' }] }, general: { viewMode: 'board' }, netiv: { sticky: true } } });
b.set(doc(db, 'stages', 'w1'), { id: 'w1', name: 'Piping', order: 1, active: true });
b.set(doc(db, 'users', 'U'), { id: 'U', name: 'Office' });
for (let i = 1; i <= 10; i++) b.set(doc(db, 'apartments', `A1-${i}`), { id: `A1-${i}`, buildingId: 'A1', stageMarks: { w1: 'done' }, currentStageId: 'w1' });
for (let i = 1; i <= 10; i++) b.set(doc(db, 'general_apartments', `G-${i}`), { id: `G-${i}`, buildingId: 'G', canvasX: i * 10 });
b.set(doc(db, 'general_canvasElements', 'CE-pins'), { id: 'CE-pins', widget: 'pin-board', data: { pins: [{ id: 'PN-1', jobId: 'G-1' }] } });
b.set(doc(db, 'general_canvasElements', 'CE-note'), { id: 'CE-note', type: 'note', text: 'hi' });
b.set(doc(db, 'netiv_apartments', 'B1-1'), { id: 'B1-1', buildingId: 'B1' });
for (let i = 1; i <= 5; i++) b.set(doc(db, 'activityLogs', `L${i}`), { id: `L${i}`, createdAt: `2026-10-2${i}` });
b.set(doc(db, 'contractorAssignments', 'T1'), { id: 'T1', apartmentId: 'A1-1' });
await b.commit();

// 1 · the backup, then the office changes things
const first = await runFullBackup({ drive, env, now: clock, forceFull: true });
const atBackup = await state();
clock = new Date('2026-10-29T09:00:00Z');
await setDoc(doc(db, 'general_apartments', 'G-99'), { id: 'G-99', buildingId: 'G', canvasX: 1 });           // added
await updateDoc(doc(db, 'apartments', 'A1-3'), { 'stageMarks.w1': 'todo', currentStageId: null });           // edited
await deleteDoc(doc(db, 'apartments', 'A1-4'));                                                              // deleted
await updateDoc(doc(db, 'general_canvasElements', 'CE-pins'), { 'data.pins': [{ id: 'PN-1', jobId: 'G-1' }, { id: 'PN-2', jobId: 'G-2' }] });
await updateDoc(doc(db, 'settings', 'app'), { 'boardSettings.netiv.sticky': false, 'boardSettings.wolfson.customButtons': [] });
await deleteDoc(doc(db, 'general_canvasElements', 'CE-note'));
await setDoc(doc(db, 'activityLogs', 'L6'), { id: 'L6', createdAt: '2026-10-29' });
const changed = await state();
check(diff(atBackup, changed).length >= 7, 'the office changed things after the backup', String(diff(atBackup, changed).length));

// 2 · restore
clock = new Date('2026-10-29T10:00:00Z');
const out = await runRestore({ drive, fileId: first.fileId, env, now: clock });
const after = await state();
const d2 = diff(atBackup, after).filter(k => !k.startsWith('general_tombstones/'));
check(out.ok && d2.length === 0, 'after the restore the cloud is EXACTLY as the backup was', d2.slice(0, 6).join(', '));
check(!after['general_apartments/G-99'] && after['apartments/A1-4'] && after['apartments/A1-3'].stageMarks.w1 === 'done' && !after['activityLogs/L6'],
  'the added job is gone, the deleted one is back, the edit is undone, the newer log line is gone');
check(J(after['general_canvasElements/CE-pins'].data.pins.map(p => p.id)) === J(['PN-1']) && after['general_canvasElements/CE-note']?.text === 'hi', 'the pin board and the removed widget are as they were');
check(after['settings/app'].boardSettings.netiv.sticky === true && after['settings/app'].boardSettings.wolfson.customButtons.length === 1, 'every workspace\'s board settings are as they were');

// 4 · the removed job stays removed on every computer
check(!!after['general_tombstones/deleted']?.ids?.['G-99'], 'the job the restore removed is on the Job Board\'s deletion list');

// 3 · the safety backup holds the changed state, and restoring it brings the changes back
const safety = files.find(f => f.name === out.safetyBackup);
check(!!safety, 'a safety backup was saved before restoring', out.safetyBackup);
const sb = gunzipJson(safety.body);
check(sb.collections.general_apartments.some(d => d.id === 'G-99'), 'the safety backup holds the changes made after the first backup');
clock = new Date('2026-10-29T11:00:00Z');
await runRestore({ drive, fileId: safety.id, env, now: clock });
const back = await state();
const d3 = diff(changed, back).filter(k => !k.startsWith('general_tombstones/'));
check(d3.length === 0, 'restoring the safety backup brings everything back to before the restore', d3.slice(0, 6).map(k => k + ' ' + J(changed[k]) + ' VS ' + J(back[k])).join(' | '));

// 5 · an old one-workspace file (the Job Board) — only that workspace, logs never trimmed
const oldFile = {
  exportedAt: '2026-10-20T08:00:00.000Z', version: 3,
  apartments: [{ id: 'G-1', buildingId: 'G', canvasX: 5 }, { id: 'G-2', buildingId: 'G', canvasX: 6 }],
  canvasElements: [{ id: 'CE-pins', widget: 'pin-board', data: { pins: [] } }],
  activityLogs: [],
  boardSettings: { general: { viewMode: 'list' }, wolfson: { customButtons: [] } },
};
files.push({ id: 'OLD1', name: 'wolfson-backup-2026-10-20T08-00-00.json', body: Buffer.from(J(oldFile)), createdTime: clock.toISOString() });
await setDoc(doc(db, 'general_activityLogs', 'GL1'), { id: 'GL1', createdAt: '2026-10-28' });
const beforeOld = await state();
clock = new Date('2026-10-29T12:00:00Z');
const o = await runRestore({ drive, fileId: 'OLD1', env, now: clock });
const afterOld = await state();
check(o.kind === 'old' && J(o.workspaces) === J(['general']), 'the old file is recognised as the Job Board', J(o.workspaces));
check(Object.keys(afterOld).filter(k => k.startsWith('general_apartments/')).length === 2 && afterOld['general_apartments/G-1'].canvasX === 5, 'the Job Board\'s jobs are exactly the file\'s');
const otherWs = diff(beforeOld, afterOld).filter(k => !k.startsWith('general_') && k !== 'settings/app');
check(otherWs.length === 0, 'Wolfson, Netiv and the shared lists were not touched', otherWs.join(', '));
check(afterOld['settings/app'].boardSettings.general.viewMode === 'list' && J(afterOld['settings/app'].boardSettings.wolfson) === J(beforeOld['settings/app'].boardSettings.wolfson),
  'only the Job Board\'s board settings came from the file');
const logs = (await getDocs(collection(db, 'general_activityLogs'))).docs.map(d => d.id);
check(logs.includes('GL1'), 'the activity log was not trimmed to the old file\'s short list');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
