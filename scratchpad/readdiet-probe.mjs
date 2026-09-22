// THE READ DIET, measured against a real Firestore (the emulator, port 8085,
// the mergeproof precedent) through the app's own read meter (window.__fsReads,
// DEV only — every document a listener or a query hands the tab, which is what
// Firestore bills).
//
// The bill on 2026-09-22 was 146,000 reads by lunchtime. Three causes, each
// with a check here: every collection was read TWICE per load (getDocs, then
// a listener's first answer); every OTHER workspace's whole unit list was read
// on every load (the foreign sync); and a workspace switch racing an in-flight
// sync had copied thousands of records into the wrong collections, so every
// load read four workspaces' worth. Also: the phone's lean load, the offline
// no-seed rule, and the delta listener really delivering a change.
//
// Needs: the emulator (scratchpad dir emu/, `firebase emulators:start --only
// firestore --project demo-diet`) and a dev server on 5176 started with the
// six VITE_FIREBASE_* fakes + VITE_FIRESTORE_EMULATOR=127.0.0.1:8085.
import { chromium } from 'playwright';
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDocs, collection, writeBatch, deleteDoc } from 'firebase/firestore';

const app = initializeApp({ projectId: 'demo-diet', apiKey: 'demo', appId: 'demo' });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8085);

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hoursAgo = h => new Date(Date.now() - h * 3600e3).toISOString();

// ── wipe + seed ─────────────────────────────────────────────────────────────
async function wipe(coll) {
  const snap = await getDocs(collection(db, coll));
  let b = writeBatch(db), n = 0;
  for (const d of snap.docs) { b.delete(d.ref); if (++n % 400 === 0) { await b.commit(); b = writeBatch(db); } }
  await b.commit();
}
async function seed(coll, items) {
  let b = writeBatch(db), n = 0;
  for (const it of items) { b.set(doc(db, coll, it.id), it); if (++n % 400 === 0) { await b.commit(); b = writeBatch(db); } }
  await b.commit();
}
const N_WOLF = 250, N_GEN = 3500, N_NETIV = 100, N_ASSIGN = 50, N_LOGS = 800;
const unit = (id, b, n, i) => ({
  id, buildingId: b, floor: 2, apartmentNumber: String(n), displayName: `Fam ${n}`, isUnnamed: false, isDuplexApt: false,
  classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, bubbles: true, stageMarks: {},
  createdAt: '2026-01-01', updatedAt: hoursAgo(3 + i), updatedBy: 'U', updatedByName: 'U',
});
const job = (i) => ({
  id: `G-${i}`, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: `Job ${i}`, isUnnamed: false, isDuplexApt: false,
  classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, bubbles: true, stageMarks: {},
  canvasX: (i % 40) * 230, canvasY: Math.floor(i / 40) * 150,
  createdAt: '2026-01-01', updatedAt: hoursAgo(3 + (i % 400) * 6), updatedBy: 'U', updatedByName: 'U',
});
// the emulator's own clear-all, so nothing from an earlier run (a tombstone doc, a race's seeds) leaks in
await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-diet/databases/(default)/documents', { method: 'DELETE' });
await seed('apartments', Array.from({ length: N_WOLF }, (_, i) => unit(`A${1 + (i % 3)}-${i}`, `A${1 + (i % 3)}`, i, i)));
await seed('general_apartments', Array.from({ length: N_GEN }, (_, i) => job(i)));
await seed('netiv_apartments', Array.from({ length: N_NETIV }, (_, i) => unit(`B${1 + (i % 2)}-${i}`, `B${1 + (i % 2)}`, i, i)));
await seed('contractorAssignments', Array.from({ length: N_ASSIGN }, (_, i) => ({
  id: `T-${i}`, apartmentId: `A1-${(i * 3) % N_WOLF}`, buildingId: 'A1', contractorId: 'C-jo', taskDescription: `Task ${i}`,
  stageId: null, dueDate: '2026-09-22', priority: 'normal', createdAt: '2026-08-01', createdBy: 'U', createdByName: 'Office', completedAt: null,
})));
await seed('activityLogs', Array.from({ length: N_LOGS }, (_, i) => ({
  id: `L-${i}`, apartmentId: 'A1-0', userId: 'U', userName: 'Office', actionType: 'update', fieldChanged: 'x',
  createdAt: hoursAgo(i), oldValue: '', newValue: '',
})));
await seed('stages', [{ id: 'S-1', name: 'Piping', color: '#6366f1', order: 1, active: true, kind: 'work' }]);
await seed('users', [{ id: 'U', name: 'Office', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' }]);
await seed('contractors', [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01',
  perms: { seeDiagrams: true, seeAllApartments: true } }]);
await setDoc(doc(db, 'settings', 'app'), { autoBackup: false });
console.log(`seeded: wolfson ${N_WOLF} · general ${N_GEN} · netiv ${N_NETIV} · tasks ${N_ASSIGN} · logs ${N_LOGS}`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const boot = (ctx, project) => ctx.addInitScript(p => {
  for (const k of ['wolfson', 'general', 'netiv']) localStorage.setItem(`${k}_app_version`, '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', p);
  if (!localStorage.getItem(`${p}_app_data`)) localStorage.setItem(`${p}_app_data`, JSON.stringify({
    currentUser: { id: 'U', name: 'Office', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [], stages: [], contractors: [], contractorAssignments: [], canvasElements: [],
  }));
}, project);
const settled = async (page, quietMs = 1800, cap = 20000) => {
  // wait until the read meter stops moving
  let last = -1; const t0 = Date.now();
  while (Date.now() - t0 < cap) {
    const n = await page.evaluate(() => window.__fsReads);
    if (n === last) { await sleep(quietMs); const m = await page.evaluate(() => window.__fsReads); if (m === last) return m; last = m; }
    else { last = n; await sleep(400); }
  }
  return last;
};
const errs = [];

// ── 1 · one load of the office app, standing in Wolfson ─────────────────────
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await boot(ctx, 'wolfson');
const page = await ctx.newPage();
page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
await page.goto('http://localhost:5176/project');
const r1 = await settled(page);
const st1 = await page.evaluate(() => {
  const s = window.__store.getState();
  const gen = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  return { apts: s.apartments.length, logs: s.activityLogs.length, tasks: s.contractorAssignments.length, genSnap: (gen.apartments || []).length };
});
console.log(`first load: ${r1} reads`, JSON.stringify(st1));
console.log('  by collection:', JSON.stringify(await page.evaluate(() => window.__fsReadsBy)));
check(st1.apts >= N_WOLF, 'the workspace landed whole (plus the fresh workspace’s own default slots)', String(st1.apts));
check(st1.logs === 200, 'the activity log is capped at the 200 the app keeps (800 in the cloud)', String(st1.logs));
check(st1.genSnap === N_GEN, 'the Job Board snapshot was pulled once (this machine had none)', String(st1.genSnap));
// own collections read ONCE (250+50+200+1+1+1+settings+tombstone…) plus the foreign pull ≈ 3,500+100. The old code read
// the own collections twice and the foreign ones twice: ≈ 8,300.
const budget1 = N_WOLF + N_ASSIGN + 200 + N_GEN + N_NETIV + 60; // + the deltas within the margin + settings/users/stages/tombstones
check(r1 <= budget1, `first load reads within one read per document (${r1} ≤ ${budget1}; the old path was ~${2 * budget1})`);

// ── 2 · reload: the foreign board is NOT re-read ────────────────────────────
await page.reload();
const r2 = (await settled(page)) ;
const r2n = await page.evaluate(() => window.__fsReads);
console.log(`reload: ${r2n} reads`, JSON.stringify(await page.evaluate(() => window.__fsReadsBy)));
const budget2 = N_WOLF + N_ASSIGN + 200 + 80; // own workspace once + the foreign delta (a handful within the 2h margin)
check(r2n <= budget2, `a reload reads only the open workspace (${r2n} ≤ ${budget2}; the foreign 3,600 stay home)`);

// ── 3 · the delta listener delivers a change to the other workspace ─────────
await setDoc(doc(db, 'general_apartments', 'G-7'), { ...job(7), displayName: 'Renamed Live', updatedAt: new Date().toISOString() });
await sleep(1500);
const live = await page.evaluate(() => (JSON.parse(localStorage.getItem('general_app_data') || '{}').apartments || []).find(a => a.id === 'G-7')?.displayName);
check(live === 'Renamed Live', 'a change on the Job Board reaches the Wolfson machine’s snapshot live', String(live));
await setDoc(doc(db, 'general_tombstones', 'deleted'), { ids: { 'G-8': Date.now() } });
await deleteDoc(doc(db, 'general_apartments', 'G-8'));
await sleep(1500);
const gone = await page.evaluate(() => (JSON.parse(localStorage.getItem('general_app_data') || '{}').apartments || []).some(a => a.id === 'G-8'));
check(!gone, 'a job deleted (tombstoned) on the Job Board leaves the snapshot');
const r3 = await page.evaluate(() => window.__fsReads);
check(r3 - r2n <= 12, `those two changes cost a handful of reads, not a re-read (${r3 - r2n})`);

// ── 4 · the switch race: a stale run must not carry records across ──────────
// Slow the Listen channel, arrive on the Job Board, switch to Wolfson before
// the board's answers land. Nothing of the board may reach Wolfson's state
// or Wolfson's cloud collection.
const ctx4 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await boot(ctx4, 'general');
const p4 = await ctx4.newPage();
p4.on('pageerror', e => errs.push(e.message.slice(0, 160)));
await p4.route('**/Firestore/Listen/**', async r => { await sleep(1200); await r.continue(); });
await p4.goto('http://localhost:5176/jobs');
await sleep(600);
await p4.evaluate(() => window.__store.getState().setCurrentProject('wolfson'));
await sleep(9000);
await p4.unroute('**/Firestore/Listen/**');
const st4 = await p4.evaluate(() => {
  const s = window.__store.getState();
  return { pid: s.currentProjectId, g: s.apartments.filter(a => a.buildingId === 'G').length, n: s.apartments.length,
    stored: (JSON.parse(localStorage.getItem('wolfson_app_data') || '{}').apartments || []).filter(a => a.buildingId === 'G').length };
});
check(st4.pid === 'wolfson' && st4.g === 0 && st4.stored === 0, 'no Job Board record crossed into Wolfson’s state or storage', JSON.stringify(st4));
await sleep(1500);
const wolfCloud = await getDocs(collection(db, 'apartments'));
const crossed = wolfCloud.docs.filter(d => d.data().buildingId === 'G').length;
// (the count grows by Wolfson's OWN default slots the fresh workspace seeds — that is the designed missing-seed, not a leak)
check(crossed === 0, `Wolfson’s cloud collection holds no Job Board job (${wolfCloud.size} docs, ${crossed} jobs)`);
await ctx4.close();

// ── 5 · the phone's lean load ───────────────────────────────────────────────
const ctx5 = await browser.newContext({ viewport: { width: 390, height: 844 } });
await boot(ctx5, 'wolfson');
const p5 = await ctx5.newPage();
p5.on('pageerror', e => errs.push(e.message.slice(0, 160)));
await p5.goto('http://localhost:5176/c/tok-jo');
const r5 = await settled(p5);
const st5 = await p5.evaluate(() => ({ logs: window.__store.getState().activityLogs.length, tasks: window.__store.getState().contractorAssignments.length }));
console.log(`portal load: ${r5} reads`, JSON.stringify(st5));
console.log('  by collection:', JSON.stringify(await p5.evaluate(() => window.__fsReadsBy)));
check(st5.tasks === N_ASSIGN, 'the worker’s tasks landed', String(st5.tasks));
check(st5.logs === 0, 'the phone did not read the activity log at all', String(st5.logs));
const wolfNow = (await getDocs(collection(db, 'apartments'))).size; // section 4's fresh workspace seeded its default slots
check(r5 <= wolfNow + N_ASSIGN + N_GEN + N_NETIV + 40, `the phone’s first load stays inside one read per document it needs (${r5} ≤ ${wolfNow + N_ASSIGN + N_GEN + N_NETIV + 40})`);
await ctx5.close();

// ── 6 · offline: no answer from the server seeds nothing ────────────────────
const ctx6 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await boot(ctx6, 'netiv');
await ctx6.addInitScript(() => {
  const d = JSON.parse(localStorage.getItem('netiv_app_data') || '{}');
  d.apartments = [{ id: 'B1-999', buildingId: 'B1', floor: 2, apartmentNumber: '999', displayName: 'LocalOnly', isUnnamed: false,
    classification: 'standard', currentStageId: null, stageDates: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01' }];
  d.buildings = [{ id: 'B1', name: 'B1' }, { id: 'B2', name: 'B2' }];
  localStorage.setItem('netiv_app_data', JSON.stringify(d));
});
const p6 = await ctx6.newPage();
await ctx6.setOffline(true);
await p6.goto('http://localhost:5176/project').catch(() => {});
await sleep(9000);
await ctx6.setOffline(false);
await sleep(3000);
const netivCloud = await getDocs(collection(db, 'netiv_apartments'));
check(!netivCloud.docs.some(d => d.id === 'B1-999'), 'an offline load did not seed its local record over the cloud', String(netivCloud.size));
await ctx6.close();

await ctx.close();
check(errs.length === 0, 'no page errors', errs[0] || '');
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
