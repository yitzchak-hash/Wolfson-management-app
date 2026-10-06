// PROOF that tombstones ADD — a delete today never forgets the deletes before
// it — against a REAL Firestore (the emulator). Found 2026-10-06: fsTombstone
// went through fsSet, whose mergeFields REPLACES the `ids` map wholesale, so
// every workspace's tombstone doc held only its most recent delete.
//   1. the OLD write (mergeFields on `ids`) twice → only the second id survives;
//   2. the NEW write (merge: true) twice → both survive, and a record field
//      beside them is untouched.
// Needs the emulator on 8085 (firebase emulators:start --only firestore).
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, deleteDoc, FieldPath } from 'firebase/firestore';

const app = initializeApp({ projectId: 'demo-tomb', apiKey: 'demo', appId: 'demo' });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8085);
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const oldRef = doc(db, 'tombstones', 'old');
await deleteDoc(oldRef);
for (const id of ['A1-1', 'A1-2']) {
  const payload = { ids: { [id]: Date.now() } };
  await setDoc(oldRef, payload, { mergeFields: Object.keys(payload).map(k => new FieldPath(k)) });
}
const oldIds = Object.keys((await getDoc(oldRef)).data().ids);
check(oldIds.length === 1 && oldIds[0] === 'A1-2', 'the OLD write forgets the first delete (the bug, reproduced)', oldIds.join(','));

const newRef = doc(db, 'tombstones', 'new');
await deleteDoc(newRef);
await setDoc(newRef, { note: 'keep me' });
for (const id of ['A1-1', 'A1-2', 'G-imp-9-1']) {
  await setDoc(newRef, { ids: { [id]: Date.now() } }, { merge: true });
}
const d = (await getDoc(newRef)).data();
check(Object.keys(d.ids).sort().join(',') === 'A1-1,A1-2,G-imp-9-1', 'the NEW write keeps every delete', Object.keys(d.ids).join(','));
check(d.note === 'keep me', 'a field beside the map is untouched');
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
