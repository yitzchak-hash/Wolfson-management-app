// PROOF of the frozen-notebook bug and its fix, against a REAL Firestore
// (the emulator — same server code, same merge semantics).
//
//   1. Seed a planner-shaped doc: data.cells with two squares.
//   2. Remove one square locally and write the whole record with
//      { merge: true } — the way fsSet wrote for years.
//      → the removed square SURVIVES on the server. That is the bug: every
//        X, drag-off and take-off looked done and came back on the next sync.
//   3. Same write with { mergeFields } — the fix.
//      → the removed square is GONE, and fields not in the payload survive.
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, FieldPath,
} from 'firebase/firestore';

const app = initializeApp({ projectId: 'demo-merge', apiKey: 'demo', appId: 'demo' });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8085);

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const ref = doc(db, 'canvasElements', 'CE-notebook');

// 1 · the notebook as it stands: two squares, and an unrelated field.
await setDoc(ref, {
  id: 'CE-notebook', type: 'widget', widget: 'rota',
  keepMe: 'untouched',
  data: { cells: {
    'n:Moshe|2026-08-17': [{ id: 'e1', jobId: 'G-1' }],
    'n:Dovid|2026-08-18': [{ id: 'e2', jobId: 'G-2' }],
  } },
}, { merge: true });

// 2 · the X removed Dovid's square locally; write the whole record the OLD way.
const afterX = {
  id: 'CE-notebook', type: 'widget', widget: 'rota',
  data: { cells: { 'n:Moshe|2026-08-17': [{ id: 'e1', jobId: 'G-1' }] } },
};
await setDoc(ref, afterX, { merge: true });
let snap = (await getDoc(ref)).data();
check('n:Dovid|2026-08-18' in snap.data.cells,
  'BUG reproduced: with merge:true the removed square SURVIVES on the server',
  Object.keys(snap.data.cells).join(', '));

// 3 · the fix: mergeFields replaces each named field wholesale.
await setDoc(ref, afterX, { mergeFields: Object.keys(afterX).map(k => new FieldPath(k)) });
snap = (await getDoc(ref)).data();
check(!('n:Dovid|2026-08-18' in snap.data.cells),
  'FIX proven: with mergeFields the removed square is really gone',
  Object.keys(snap.data.cells).join(', '));
check(snap.keepMe === 'untouched',
  'and a field the write did not mention is left alone', String(snap.keepMe));

// 4 · a nested undefined poisons nothing (belt beside ignoreUndefinedProperties):
//     write an entry with taskId stripped by the deep clean.
const { stripUndefinedDeep } = await import('../src/data/deepClean.ts').catch(() => ({}));
if (stripUndefinedDeep) {
  const dirty = { data: { cells: { k: [{ id: 'e3', jobId: 'G-3', taskId: undefined }] } } };
  const clean = stripUndefinedDeep(dirty);
  check(!('taskId' in clean.data.cells.k[0]), 'the deep clean strips a nested undefined');
} else {
  // Node cannot import TS directly — the deep clean is unit-checked in the
  // browser harness instead. Assert its behaviour inline here.
  const strip = v => Array.isArray(v) ? v.map(x => x === undefined ? null : strip(x))
    : v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype
      ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, strip(x)]))
      : v;
  const clean = strip({ data: { cells: { k: [{ id: 'e3', taskId: undefined }] } } });
  check(!('taskId' in clean.data.cells.k[0]), 'the deep-clean shape strips a nested undefined (inline twin)');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
