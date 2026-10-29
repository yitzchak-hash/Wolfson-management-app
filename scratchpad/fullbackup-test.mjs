// PROOF of the full backup (lib/fullBackup.js) against a REAL Firestore (the
// emulator, project demo-full) with an in-memory stand-in for Drive.
//   1. a complete read holds every workspace and every collection, exactly;
//   2. the next run reads only what changed, and still holds everything;
//   3. nothing changed → no new file;
//   4. a deleted (tombstoned) job and widget leave the backup;
//   5. an added workspace (settings/app → customProjects) is included.
// Needs the emulator on 8085. Run: node scratchpad/fullbackup-test.mjs
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, writeBatch, updateDoc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { runFullBackup, gunzipJson, FILE_PREFIX } from '../lib/fullBackup.js';

const PROJECT = 'demo-full';
const app = initializeApp({ projectId: PROJECT, apiKey: 'demo', appId: 'demo' });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8085);
const env = { FIRESTORE_REST_BASE: `http://127.0.0.1:8085/v1/projects/${PROJECT}/databases/(default)/documents` };

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

// ── a stand-in Drive: one parent folder, files kept in memory ──
const files = [];
let nextId = 1;
const drive = {
  files: {
    list: async ({ q }) => {
      if (q.includes("name = 'Backups'")) return { data: { files: files.filter(f => f.folder && f.name === 'Backups').map(f => ({ id: f.id })) } };
      const own = files.filter(f => !f.folder && f.name.includes(FILE_PREFIX)).sort((a, b) => (a.name < b.name ? 1 : -1));
      return { data: { files: own.slice(0, 1).map(f => ({ id: f.id, name: f.name, createdTime: f.createdTime })) } };
    },
    create: async ({ requestBody, media }) => {
      const id = `F${nextId++}`;
      if (!media) { files.push({ id, name: requestBody.name, folder: true }); return { data: { id } }; }
      const chunks = []; for await (const c of media.body) chunks.push(c);
      files.push({ id, name: requestBody.name, body: Buffer.concat(chunks), createdTime: clock.toISOString() });
      return { data: { id } };
    },
    get: async ({ fileId }) => ({ data: files.find(f => f.id === fileId).body }),
  },
};
let clock = new Date('2026-10-29T08:00:00Z');
const newest = () => gunzipJson(files.filter(f => !f.folder).at(-1).body);

// Count Firestore reads the backup makes (documents returned).
let reads = 0;
const fetchImpl = async (url, init) => {
  const r = await fetch(url, init);
  const clone = r.clone();
  try { const j = await clone.json(); reads += Array.isArray(j) ? j.filter(x => x.document).length : (j.documents?.length ?? 0); } catch {}
  return r;
};

// ── the cloud ──
await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
const b = writeBatch(db);
const stamp = { _updatedAt: serverTimestamp() };
b.set(doc(db, 'settings', 'app'), { backupDriveFolderLink: 'https://drive.google.com/drive/folders/PARENT1', boardSettings: { wolfson: { customButtons: [{ id: 'cb1' }] }, general: { viewMode: 'board' } }, customProjects: [{ id: 'lev', name: 'Lev' }], ...stamp });
b.set(doc(db, 'stages', 'w1'), { id: 'w1', name: 'Piping', order: 1, ...stamp });
b.set(doc(db, 'users', 'U'), { id: 'U', name: 'Office', ...stamp });
for (let i = 1; i <= 40; i++) b.set(doc(db, 'apartments', `A1-${i}`), { id: `A1-${i}`, stageMarks: { w1: 'done' }, ...stamp });
for (let i = 1; i <= 60; i++) b.set(doc(db, 'general_apartments', `G-${i}`), { id: `G-${i}`, canvasX: i * 10, canvasY: 5, ...stamp });
b.set(doc(db, 'general_canvasElements', 'CE-pins'), { id: 'CE-pins', widget: 'pin-board', data: { pins: [{ id: 'PN-1', jobId: 'G-1' }] }, ...stamp });
b.set(doc(db, 'general_canvasElements', 'CE-note'), { id: 'CE-note', type: 'note', text: 'hi', ...stamp });
b.set(doc(db, 'netiv_apartments', 'B1-1'), { id: 'B1-1', ...stamp });
b.set(doc(db, 'lev_apartments', 'L-1'), { id: 'L-1', ...stamp });
for (let i = 1; i <= 30; i++) b.set(doc(db, 'activityLogs', `L${i}`), { id: `L${i}`, createdAt: '2026-10-28', ...stamp });
b.set(doc(db, 'contractorAssignments', 'T1'), { id: 'T1', ...stamp });
await b.commit();
const totalSeeded = 1 + 1 + 1 + 40 + 60 + 2 + 1 + 1 + 30 + 1;
files.push({ id: 'PARENT1-backups', name: 'Backups', folder: true });

// 1 · complete read
let out = await runFullBackup({ drive, fetchImpl, env, now: clock });
let bk = newest();
check(out.ok && out.mode === 'complete-read', 'first run is a complete read', JSON.stringify(out).slice(0, 160));
check(bk.totalDocuments === totalSeeded, `every record is in the file (${bk.totalDocuments}/${totalSeeded})`);
check(bk.collections.general_apartments.length === 60 && bk.collections.general_apartments.find(d => d.id === 'G-7').fields.canvasX.integerValue === '70',
  'Job Board placement is in it, exactly (G-7 x = 70)');
check(bk.collections.general_canvasElements.find(d => d.id === 'CE-pins').fields.data.mapValue.fields.pins.arrayValue.values.length === 1, 'widget data (the pin board\'s pins) is in it');
check(!!bk.collections.settings.find(d => d.id === 'app').fields.boardSettings, 'board settings of every workspace are in it');
check(bk.workspaces.join() === 'wolfson,general,netiv,lev' && bk.collections.lev_apartments?.length === 1, 'an added workspace (Lev) is included');
const fullReads = reads;

// 2 · a few changes, an hour later → only those are read
clock = new Date('2026-10-29T09:00:00Z');
await new Promise(r => setTimeout(r, 1500));
const tChange = Date.now();   // the file is made to look cut at this moment (the 5-minute overlap is added back below)
await updateDoc(doc(db, 'apartments', 'A1-3'), { 'stageMarks.w2': 'doing', _updatedAt: serverTimestamp() });
await updateDoc(doc(db, 'general_apartments', 'G-9'), { canvasX: 999, _updatedAt: serverTimestamp() });
await updateDoc(doc(db, 'general_canvasElements', 'CE-pins'), { 'data.pins': [{ id: 'PN-1', jobId: 'G-1' }, { id: 'PN-2', jobId: 'G-2' }], _updatedAt: serverTimestamp() });
await setDoc(doc(db, 'general_apartments', 'G-61'), { id: 'G-61', canvasX: 1, ...stamp });
reads = 0;
// the stand-in clock is not the emulator's: set the file's cut time by hand
const f1 = files.filter(f => !f.folder).at(-1); const j1 = gunzipJson(f1.body);
j1.exportedAt = new Date(tChange + 5 * 60_000 - 500).toISOString(); f1.body = (await import('../lib/fullBackup.js')).gzipJson(j1);
out = await runFullBackup({ drive, fetchImpl, env, now: clock });
bk = newest();
check(out.mode === 'changes-since-previous', 'the next run reads only what changed', out.mode);
check(reads < fullReads / 3, `…and costs far fewer reads (${reads} vs ${fullReads} for a complete read)`);
check(bk.collections.apartments.find(d => d.id === 'A1-3').fields.stageMarks.mapValue.fields.w2?.stringValue === 'doing', 'the new tick is in it');
check(bk.collections.general_apartments.find(d => d.id === 'G-9').fields.canvasX.integerValue === '999', 'the moved job\'s new place is in it');
check(bk.collections.general_canvasElements.find(d => d.id === 'CE-pins').fields.data.mapValue.fields.pins.arrayValue.values.length === 2, 'the new pin is in it');
check(bk.collections.general_apartments.length === 61, 'the new job is in it');
check(bk.totalDocuments === totalSeeded + 1, `and still every other record (${bk.totalDocuments})`);

// 3 · nothing changed → no file
clock = new Date('2026-10-29T10:00:00Z');
const nFiles = files.length;
const f2 = files.filter(f => !f.folder).at(-1); const j2 = gunzipJson(f2.body);
j2.exportedAt = new Date(Date.now() + 5 * 60_000).toISOString(); f2.body = (await import('../lib/fullBackup.js')).gzipJson(j2);
out = await runFullBackup({ drive, fetchImpl, env, now: clock });
check(out.skipped && files.length === nFiles, 'nothing changed → no new file', out.skipped);

// 4 · a deleted job and widget leave the backup
clock = new Date('2026-10-29T11:00:00Z');
await setDoc(doc(db, 'general_tombstones', 'deleted'), { ids: { 'G-5': Date.now(), 'CE-note': Date.now() }, ...stamp });
await deleteDoc(doc(db, 'general_apartments', 'G-5'));
await deleteDoc(doc(db, 'general_canvasElements', 'CE-note'));
out = await runFullBackup({ drive, fetchImpl, env, now: clock });
bk = newest();
check(!bk.collections.general_apartments.some(d => d.id === 'G-5') && !bk.collections.general_canvasElements.some(d => d.id === 'CE-note'),
  'a deleted job and widget are not in the new file');

// 5 · the night run is a complete read again
clock = new Date('2026-10-30T01:00:00Z');
out = await runFullBackup({ drive, fetchImpl, env, now: clock, forceFull: true });
check(out.mode === 'complete-read', 'the nightly run is a complete read');
check(newest().totalDocuments === totalSeeded + 1 - 2 + 1, `…holding everything as it is now (${newest().totalDocuments})`);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
