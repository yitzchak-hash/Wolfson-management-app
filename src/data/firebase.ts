// Firebase configuration
// Set these environment variables in your .env.local file (dev) or Vercel/hosting env vars (production):
//
// VITE_FIREBASE_API_KEY=...
// VITE_FIREBASE_AUTH_DOMAIN=...
// VITE_FIREBASE_PROJECT_ID=...
// VITE_FIREBASE_STORAGE_BUCKET=...
// VITE_FIREBASE_MESSAGING_SENDER_ID=...
// VITE_FIREBASE_APP_ID=...
//
// If these are not set, the app falls back to localStorage only.

import { initializeApp, FirebaseApp } from 'firebase/app';
import { stripUndefinedDeep } from './deepClean';
import { diffRecord, mergeIdList, getAtPath } from './fieldDiff';
import type { DiffOp } from './fieldDiff';
import {
  initializeFirestore,
  Firestore,
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  connectFirestoreEmulator,
  writeBatch,
  serverTimestamp,
  deleteField,
  updateDoc,
  FieldPath,
  runTransaction,
  Unsubscribe,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.storageBucket &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId
);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

/** The initialized app, for the presence channel (Realtime Database). */
export function firebaseApp(): FirebaseApp | null { return app; }

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    // ignoreUndefinedProperties: Firestore rejects docs with undefined fields and throws
    // silently — this fixes writes for all collections that have optional fields.
    // No persistentLocalCache — removed to fix cross-device sync on mobile.
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
    });
    // A harness points the app at the local emulator (host:port). Never set
    // in production; the read-diet probe is what it exists for.
    const emu = import.meta.env.VITE_FIRESTORE_EMULATOR as string | undefined;
    if (emu) {
      const [host, port] = emu.split(':');
      connectFirestoreEmulator(db, host, Number(port));
    }
  } catch (e) {
    console.warn('Firebase init failed, using localStorage only:', e);
  }
}

// Diagnostic log — visible in browser DevTools console on every page load
console.log('[Firebase] Config fields:', {
  apiKey:            firebaseConfig.apiKey            ? '✓' : '✗ MISSING',
  authDomain:        firebaseConfig.authDomain        ? '✓' : '✗ MISSING',
  projectId:         firebaseConfig.projectId         ? '✓' : '✗ MISSING',
  storageBucket:     firebaseConfig.storageBucket     ? '✓' : '✗ MISSING',
  messagingSenderId: firebaseConfig.messagingSenderId ? '✓' : '✗ MISSING',
  appId:             firebaseConfig.appId             ? '✓' : '✗ MISSING',
});
console.log('[Firebase] isFirebaseConfigured:', isFirebaseConfigured);
console.log('[Firebase] db:', db !== null ? 'initialized ✓' : 'NULL — all Firestore sync disabled');

export { db };

// ── Cloud-sync status tracker ─────────────────────────────────────────────
// Lets the UI show "Saving…" / "Saved ✓" without threading state through the store.
export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error' | 'unreachable';
type SyncListener = (s: SyncStatus) => void;
const _syncListeners: SyncListener[] = [];
let _pendingWrites = 0;
let _savedTimer: ReturnType<typeof setTimeout> | null = null;
/** A write failed in this batch — the badge must say so, not "Saved ✓". */
let _writeFailed = false;

export function subscribeCloudSync(fn: SyncListener): () => void {
  _syncListeners.push(fn);
  return () => { const i = _syncListeners.indexOf(fn); if (i >= 0) _syncListeners.splice(i, 1); };
}

function _notifySyncListeners(s: SyncStatus) { _syncListeners.forEach(fn => fn(s)); }

/**
 * A cloud write FAILED. Silence here is what let a rejected notebook write
 * masquerade as saved for weeks — the badge went green because the promise
 * settled, and only the DevTools console knew the truth. The badge now shows
 * a red "not saved" for a while instead of "Saved ✓".
 */
/**
 * A cloud READ failed — a listener was refused (2026-09-22: production
 * answered "Quota exceeded" to every read for a day, and the only witness
 * was the DevTools console: the office saw yesterday's notebook and called
 * the app broken). The badge says the cloud is not answering, for half a
 * minute past the last refusal, so a stale screen is a known stale screen.
 */
let _unreachableTimer: ReturnType<typeof setTimeout> | null = null;
function _notifyReadError(collectionName: string, e: unknown) {
  console.warn(`Firestore listener refused for ${collectionName}:`, e);
  if (_unreachableTimer) clearTimeout(_unreachableTimer);
  _notifySyncListeners('unreachable');
  _unreachableTimer = setTimeout(() => { _unreachableTimer = null; _notifySyncListeners('idle'); }, 30_000);
}

function _notifySyncError() {
  _writeFailed = true;
  if (_savedTimer) { clearTimeout(_savedTimer); _savedTimer = null; }
  _notifySyncListeners('error');
  _savedTimer = setTimeout(() => {
    _writeFailed = false;
    _notifySyncListeners('idle');
    _savedTimer = null;
  }, 10_000);
}

function _trackWrite<T>(promise: Promise<T>): Promise<T> {
  _pendingWrites++;
  if (_savedTimer) { clearTimeout(_savedTimer); _savedTimer = null; }
  if (!_writeFailed) _notifySyncListeners('saving');
  return promise.finally(() => {
    _pendingWrites = Math.max(0, _pendingWrites - 1);
    if (_pendingWrites === 0 && !_writeFailed) {
      _notifySyncListeners('saved');
      _savedTimer = setTimeout(() => { _notifySyncListeners('idle'); _savedTimer = null; }, 3000);
    }
  });
}

// Returns the Firestore collection name for a given project and base collection.
// Wolfson uses the original bare names for full backward compatibility.
// All other projects use a prefixed namespace.
export function projectCollection(projectId: string, base: string): string {
  return projectId === 'wolfson' ? base : `${projectId}_${base}`;
}

// Generic document write
export async function fsSet(collectionName: string, docId: string, data: object) {
  if (!db) return;
  try {
    // Top-level undefined becomes deleteField() so clearing an optional field
    // actually removes it; nested undefined is stripped outright (defence in
    // depth beside ignoreUndefinedProperties).
    const sanitized = Object.fromEntries(
      Object.entries({ ...data, _updatedAt: serverTimestamp() })
        .map(([k, v]) => [k, v === undefined ? deleteField() : stripUndefinedDeep(v)])
    );
    /**
     * `mergeFields`, NOT `merge: true` — this is the frozen-notebook fix.
     *
     * `merge: true` DEEP-MERGES nested maps: a map key deleted locally is
     * simply absent from the payload, so the server KEEPS it, and the next
     * sync resurrects it on every device. The weekly notebook's squares are
     * map keys under `data.cells`, so taking the last card off a day — the X,
     * a drag off the notebook, taking a person off — looked done and came
     * back, for weeks. The tombstone code already knew this rule ("a merge
     * cannot remove keys"); now every generic write follows it: each
     * top-level field in the payload REPLACES the server's field wholesale,
     * and fields not in the payload stay untouched — which is what every
     * caller actually means, since they all send whole records or whole maps.
     * FieldPath per key, so a key with a dot in it can never be read as a
     * nested path.
     */
    await _trackWrite(setDoc(doc(db, collectionName, docId), sanitized,
      { mergeFields: Object.keys(sanitized).map(k => new FieldPath(k)) }));
  } catch (e) {
    console.warn(`Firestore write failed for ${collectionName}/${docId}:`, e);
    _notifySyncError();
  }
}

// Generic collection read (returns all docs)
export async function fsGetAll(collectionName: string): Promise<Record<string, unknown>[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, collectionName));
    _countReads(snap.size, collectionName);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn(`Firestore read failed for ${collectionName}:`, e);
    return [];
  }
}

/**
 * The NEWEST `n` docs of a collection, by `field` descending — for a
 * collection that only ever grows (the activity log: one doc per change,
 * one per hourly "opened", for ever). The app keeps 500 of them and threw
 * the rest away AFTER reading every one, on every load, on every machine —
 * tens of thousands of billed reads a day for nothing, which is how the
 * free tier's daily read quota ran out (2026-09-22: production answered
 * "Quota exceeded" to reads). A single-field orderBy needs no index.
 */
export async function fsGetAllRecent(collectionName: string, field: string, n: number): Promise<Record<string, unknown>[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(query(collection(db, collectionName), orderBy(field, 'desc'), limit(n)));
    _countReads(snap.size, collectionName);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn(`Firestore read failed for ${collectionName}:`, e);
    return [];
  }
}

/** Live twin of fsGetAllRecent — the listener only ever holds the newest `n`. */
export function fsListenRecent(
  collectionName: string, field: string, n: number,
  callback: (items: Record<string, unknown>[]) => void
): Unsubscribe {
  if (!db) return () => {};
  try {
    return onSnapshot(query(collection(db, collectionName), orderBy(field, 'desc'), limit(n)), snap => {
      _countReads(_billed(snap), collectionName);
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, e => _notifyReadError(collectionName, e));
  } catch (e) {
    console.warn(`Firestore listener failed for ${collectionName}:`, e);
    return () => {};
  }
}

// Real-time listener for a collection
export function fsListen(
  collectionName: string,
  callback: (items: Record<string, unknown>[]) => void
): Unsubscribe {
  if (!db) return () => {};
  try {
    return onSnapshot(collection(db, collectionName), snap => {
      _countReads(_billed(snap), collectionName);
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, e => _notifyReadError(collectionName, e));
  } catch (e) {
    console.warn(`Firestore listener failed for ${collectionName}:`, e);
    return () => {};
  }
}

// ── The read meter ──────────────────────────────────────────────────────────
/**
 * Documents the server has handed this tab, counted where they arrive. A
 * listener's first answer is every document in it and every later answer is
 * only what changed — which is exactly what Firestore bills — so this number
 * tracks the bill closely enough to catch a load that reads a collection
 * twice. The read-diet harness reads it through window.__fsReads (DEV only).
 */
let _reads = 0;
/** Changes the SERVER sent — this tab's own pending writes echo through a listener and are not billed. */
function _billed(snap: { docChanges: () => Array<{ doc: { metadata: { hasPendingWrites: boolean } } }> }): number {
  return snap.docChanges().filter(c => !c.doc.metadata.hasPendingWrites).length;
}
const _readsBy: Record<string, number> = {};
function _countReads(n: number, name = '?') { _reads += n; _readsBy[name] = (_readsBy[name] ?? 0) + n; }
export function fsReadCount(): number { return _reads; }
/** Per collection — the answer to "which collection is eating the bill". */
export function fsReadsByCollection(): Record<string, number> { return { ..._readsBy }; }
if (import.meta.env.DEV && typeof window !== 'undefined') {
  Object.defineProperty(window, '__fsReads', { get: () => _reads, configurable: true });
  Object.defineProperty(window, '__fsReadsBy', { get: () => ({ ..._readsBy }), configurable: true });
}

/**
 * ONE listener that is also the load.
 *
 * `startFirebaseSync` used to read every collection with getDocs and then
 * attach a listener to each — and a listener's first answer is the whole
 * collection again, billed again. Every open of the app read the entire
 * workspace TWICE (2026-09-22: 146,000 reads by lunchtime on a free tier of
 * 50,000). The first answer is the load now; the callback is held back
 * until `release()` so the merge-or-seed decision runs on the answer before
 * the live path takes over, then the latest answer is replayed once, which
 * is exactly what the listener used to deliver first.
 *
 * `offline()` is true when the first answer came from this tab's own cache
 * with no word from the server — the store must not treat that as "the cloud
 * is empty" and seed local data over it.
 */
export interface Attached {
  first: Promise<Record<string, unknown>[]>;
  offline: () => boolean;
  release: () => void;
  unsub: Unsubscribe;
}
export function fsAttach(
  collectionName: string,
  callback: (items: Record<string, unknown>[]) => void,
  recent?: { field: string; n: number },
): Attached {
  if (!db) return { first: Promise.resolve([]), offline: () => false, release: () => {}, unsub: () => {} };
  let resolve!: (d: Record<string, unknown>[]) => void;
  const first = new Promise<Record<string, unknown>[]>(r => { resolve = r; });
  let resolved = false, released = false, wasOffline = false;
  let latest: Record<string, unknown>[] | null = null;
  let unsub: Unsubscribe = () => {};
  const settle = (docs: Record<string, unknown>[], offline: boolean) => {
    if (resolved) return;
    resolved = true; wasOffline = offline; resolve(docs);
  };
  try {
    const q = recent
      ? query(collection(db, collectionName), orderBy(recent.field, 'desc'), limit(recent.n))
      : collection(db, collectionName);
    /**
     * The first answer must be the SERVER's. A tab that already holds these
     * documents in memory (the Job Board, listened to from Wolfson for its
     * snapshot) answers first from that memory — `fromCache` — and the server
     * only confirms it a moment later, as a metadata change. Taking the memory
     * answer as "no word from the server" left a switched-to workspace never
     * marked as loaded (2026-10-29).
     *
     * So a short-lived WAITER (with metadata changes) only waits for the
     * server's word — or 10 s, after which the memory answer is used, marked
     * offline. Then the ordinary LIVE listener takes over, as it always was
     * (metadata changes would re-deliver the whole list on every save). Both
     * share one query in the client, so the hand-over reads nothing twice.
     */
    let waiter: Unsubscribe | null = null;
    let liveUnsub: Unsubscribe | null = null;
    let cacheTimer: ReturnType<typeof setTimeout> | null = null;
    let firstLive = true;
    const onError = (e: unknown) => { _notifyReadError(collectionName, e); settle([], true); };
    const goLive = () => {
      if (liveUnsub) return;
      liveUnsub = onSnapshot(q, snap => {
        // Its first answer is the waiter's documents again (already counted).
        if (!firstLive) _countReads(_billed(snap), collectionName);
        firstLive = false;
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (released) callback(docs); else latest = docs;
      }, onError);
      if (waiter) { const w = waiter; waiter = null; w(); }
    };
    waiter = onSnapshot(q, { includeMetadataChanges: true }, snap => {
      if (liveUnsub) return;
      if (snap.docChanges().length) _countReads(_billed(snap), collectionName);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      latest = docs;
      if (!snap.metadata.fromCache) {
        if (cacheTimer) { clearTimeout(cacheTimer); cacheTimer = null; }
        settle(docs, false);
        goLive();
      } else if (!resolved && !cacheTimer) {
        cacheTimer = setTimeout(() => {
          cacheTimer = null;
          settle(latest ?? docs, true);
          goLive();
        }, 10_000);
      }
    }, onError);
    unsub = () => {
      if (cacheTimer) clearTimeout(cacheTimer);
      waiter?.(); liveUnsub?.();
      waiter = null; liveUnsub = null;
    };
  } catch (e) {
    console.warn(`Firestore attach failed for ${collectionName}:`, e);
    settle([], true);
  }
  return {
    first,
    offline: () => wasOffline,
    release: () => {
      released = true;
      if (latest) { const d = latest; latest = null; callback(d); }
    },
    unsub: () => unsub(),
  };
}

/**
 * Only the documents whose `field` is at or past `since` — the delta
 * listener for another workspace's units. A single-field range query needs
 * no index. A document without the field never matches, by Firestore's rule.
 */
export function fsListenSince(
  collectionName: string, field: string, since: string,
  callback: (items: Record<string, unknown>[]) => void
): Unsubscribe {
  if (!db) return () => {};
  try {
    return onSnapshot(query(collection(db, collectionName), where(field, '>=', since)), snap => {
      _countReads(_billed(snap), collectionName);
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, e => _notifyReadError(collectionName, e));
  } catch (e) {
    console.warn(`Firestore delta listener failed for ${collectionName}:`, e);
    return () => {};
  }
}

/**
 * SAVE ONLY WHAT CHANGED (2026-10-29) — the writer every edit goes through.
 *
 * `before` is this computer's copy of the record before the action, `after`
 * its copy after it. Only the difference is written (see fieldDiff.ts): one
 * tick, one setting of one workspace, one moved widget's x and y. A field the
 * person did not touch is never sent, so an old or half-loaded copy on this
 * computer can no longer overwrite newer work in the cloud.
 *
 * Nothing changed → nothing is written (no cost, no risk).
 * No `before` (a brand-new record) → the whole record, as fsSet.
 * A list of records changed (pins, cards) → read the cloud's list inside a
 * transaction and apply only my adds/removes/edits to it. If the cloud cannot
 * be reached, it waits and tries again — it never sends this computer's list.
 * The cloud has no such record → the whole record (never a half-empty stub).
 *
 * Returns how many field writes were sent (0 = nothing changed), for tests.
 */
export async function fsPatch(
  collectionName: string,
  docId: string,
  before: object | null | undefined,
  after: object,
  opts?: PatchOpts,
): Promise<number> {
  if (!db) return 0;
  if (!before) {
    if (opts?.noCreate) return 0;
    await fsSet(collectionName, docId, after); return -1;
  }
  const ops = patchOps(before, after, opts);
  if (!ops.length) return 0;
  const ref = doc(db, collectionName, docId);
  const build = (cloud: Record<string, unknown> | null) => patchPairs(ops, cloud);
  /** The cloud has no such record (never uploaded, or removed): write it whole. */
  const whole = async () => { if (!opts?.noCreate) await fsSet(collectionName, docId, after); };
  const isNotFound = (e: unknown) => (e as { code?: string })?.code === 'not-found';
  const send = (pairs: unknown[]) => updateDoc(ref, pairs[0] as FieldPath, pairs[1], ...pairs.slice(2));
  try {
    if (ops.some(o => o.kind === 'idList')) {
      // A list of records (pins, cards) is merged onto the CLOUD's list, which
      // needs the cloud. Unreachable (asleep, offline) → wait and try again;
      // never fall back to sending this computer's list, which is exactly the
      // old copy that emptied a pin board (2026-10-28).
      const merge = async () => {
        let missing = false;
        await runTransaction(db!, async tx => {
          missing = false;
          const snap = await tx.get(ref);
          if (!snap.exists()) { missing = true; return; }
          const pairs = build(snap.data() as Record<string, unknown>);
          tx.update(ref, pairs[0] as FieldPath, pairs[1], ...pairs.slice(2));
        }, { maxAttempts: 5 });
        if (missing) await whole();
      };
      await _trackWrite(retryUntilReachable(merge, `${collectionName}/${docId}`));
      return ops.length;
    }
    // updateDoc, not setDoc: it refuses a record the cloud does not have, so
    // a patch can never leave a half-empty stub behind (the listener would
    // hand every device a record with only the patched fields).
    try {
      await _trackWrite(send(build(null)));
    } catch (e) {
      if (!isNotFound(e)) throw e;
      await whole();
    }
    return ops.length;
  } catch (e) {
    console.warn(`Firestore write failed for ${collectionName}/${docId}:`, e);
    _notifySyncError();
    return 0;
  }
}

/**
 * Run a cloud step, and if the cloud cannot be reached, try again: when the
 * browser says it is back online, and on a widening timer (5 s … 2 min) for
 * up to a day. A refusal that is not about reachability (permissions, a bad
 * value) is not retried — it is reported like any failed write.
 */
const RETRYABLE = new Set(['unavailable', 'deadline-exceeded', 'aborted', 'failed-precondition', 'resource-exhausted', 'internal', 'unknown']);
async function retryUntilReachable(step: () => Promise<void>, what: string): Promise<void> {
  let wait = 5_000;
  const until = Date.now() + 24 * 3600_000;
  for (;;) {
    try { await step(); return; } catch (e) {
      const code = (e as { code?: string })?.code ?? '';
      const offlineMsg = /offline/i.test(String((e as Error)?.message ?? ''));
      if (!(RETRYABLE.has(code) || offlineMsg) || Date.now() > until) throw e;
      console.warn(`Firestore unreachable for ${what} — trying again in ${Math.round(wait / 1000)}s`, e);
      await new Promise<void>(res => {
        const t = setTimeout(done, wait);
        function done() { clearTimeout(t); window.removeEventListener('online', done); res(); }
        window.addEventListener('online', done);
      });
      wait = Math.min(wait * 2, 120_000);
    }
  }
}

function patchOps(before: object, after: object, opts?: PatchOpts): DiffOp[] {
  const ops = diffRecord(before as Record<string, unknown>, after as Record<string, unknown>);
  // An automatic repair never removes anything from the cloud.
  return opts?.noDeletes ? ops.filter(o => o.kind !== 'delete') : ops;
}

/** The field paths and values to send, as updateDoc takes them. Lists of records merge onto `cloud`'s. */
function patchPairs(ops: DiffOp[], cloud: Record<string, unknown> | null): unknown[] {
  const pairs: unknown[] = [new FieldPath('_updatedAt'), serverTimestamp()];
  for (const op of ops) {
    if (!op.path.length) continue;
    const value = op.kind === 'delete' ? deleteField()
      : op.kind === 'idList' ? stripUndefinedDeep(cloud ? mergeIdList(op.before, op.after, getAtPath(cloud, op.path)) : op.after)
      : stripUndefinedDeep(op.value);
    pairs.push(new FieldPath(...op.path), value);
  }
  return pairs;
}

/**
 * fsPatch for many records at once. Records with no change are skipped; the
 * plain patches go up as ONE batch (one save, one echo on every screen — a
 * save per record made every screen redraw dozens of times in a second). A
 * batch is all-or-nothing, so if one record is missing from the cloud the
 * batch is refused and those records go one by one (fsPatch writes a missing
 * one whole). Lists of records (pins, cards) always go one by one: each needs
 * the cloud's list.
 */
export async function fsBatchPatch(
  collectionName: string,
  items: Array<{ id: string; before: object | null | undefined; after: object }>,
  opts?: PatchOpts,
): Promise<void> {
  if (!db) return;
  const single: typeof items = [];
  const plain: Array<{ id: string; ops: DiffOp[]; item: typeof items[number] }> = [];
  for (const it of items) {
    if (!it.before) { single.push(it); continue; }
    const ops = patchOps(it.before, it.after, opts);
    if (!ops.length) continue;
    if (ops.some(o => o.kind === 'idList')) single.push(it); else plain.push({ id: it.id, ops, item: it });
  }
  const one = (it: typeof items[number]) => fsPatch(collectionName, it.id, it.before, it.after, opts);
  await Promise.all(single.map(one));
  for (let i = 0; i < plain.length; i += 450) {
    const chunk = plain.slice(i, i + 450);
    const batch = writeBatch(db);
    for (const c of chunk) {
      const pairs = patchPairs(c.ops, null);
      batch.update(doc(db, collectionName, c.id), pairs[0] as FieldPath, pairs[1], ...pairs.slice(2));
    }
    try {
      await _trackWrite(batch.commit());
    } catch (e) {
      if ((e as { code?: string })?.code !== 'not-found') {
        console.warn(`Firestore batch patch failed for ${collectionName}:`, e);
        _notifySyncError();
        continue;
      }
      await Promise.all(chunk.map(c => one(c.item)));
    }
  }
}

/**
 * CREATE-ONLY upload: each record is written only if the cloud does not have
 * it. Every "push up what the cloud is missing" and every first-run seed goes
 * through here, so a computer's local or built-in copy can add records but can
 * never overwrite one that already exists — whatever this computer believes
 * about the cloud. Checked inside a transaction per chunk; if the cloud cannot
 * be reached the upload is skipped (nothing is lost: the records stay local
 * and the next open tries again). Returns how many were created.
 */
export async function fsBatchCreate(collectionName: string, items: Array<{ id: string; data: object }>): Promise<number> {
  if (!db || !items.length) return 0;
  let created = 0;
  try {
    for (let i = 0; i < items.length; i += 200) {
      const chunk = items.slice(i, i + 200);
      created += await _trackWrite(runTransaction(db, async tx => {
        const refs = chunk.map(it => doc(db!, collectionName, it.id));
        const snaps = await Promise.all(refs.map(r => tx.get(r)));
        let n = 0;
        snaps.forEach((snap, k) => {
          if (snap.exists()) return;
          const sanitized = Object.fromEntries(
            Object.entries({ ...chunk[k].data, _updatedAt: serverTimestamp() })
              .filter(([, v]) => v !== undefined)
              .map(([key, v]) => [key, stripUndefinedDeep(v)]),
          );
          tx.set(refs[k], sanitized);
          n++;
        });
        return n;
      }));
    }
  } catch (e) {
    console.warn(`Firestore create-only upload skipped for ${collectionName}:`, e);
  }
  return created;
}

export interface PatchOpts {
  /** Automatic repairs: never send a deletion (a missing value on this computer is not a decision). */
  noDeletes?: boolean;
  /** Without a `before`, write nothing rather than the whole record. */
  noCreate?: boolean;
}

// Delete a single document
export async function fsDelete(collectionName: string, docId: string) {
  if (!db) return;
  try {
    await _trackWrite(deleteDoc(doc(db, collectionName, docId)));
  } catch (e) {
    console.warn(`Firestore delete failed for ${collectionName}/${docId}:`, e);
    _notifySyncError();
  }
}

/**
 * Tombstones — "this was deleted on purpose".
 *
 * A Firestore snapshot cannot tell "never uploaded yet" from "deleted on
 * another device": both look like a missing doc. So the apartments listener
 * KEEPS any local record the snapshot does not carry, and the startup sync then
 * pushes those local-only records back up as "missing". Between them, a job
 * deleted on the office PC came straight back the next time the TV or a phone
 * synced — which is exactly what the owner saw when a removed import kept
 * reappearing.
 *
 * A tombstone is the missing third state. One document per project holds every
 * deleted id with the moment it went, so every device can tell the two apart
 * without keeping the record itself.
 *
 * Ids are used as MAP KEYS, so they must not contain '.' or '/' or start with
 * '__'. Every id this app mints (A1-12, G-imp-…, CE-…) is safe.
 */
const TOMB_DOC = 'deleted';
const TOMB_KEEP = 4000;   // prune to this many when the map grows past…
const TOMB_MAX  = 6000;   // …this. A doc is capped at 1 MiB; an id costs ~40 B.

export function tombstoneCollection(projectId: string): string {
  return projectCollection(projectId, 'tombstones');
}

/**
 * Record ids as deleted. ADDS keys to the map — never replaces it — so two
 * devices deleting at once cannot clobber each other, and a delete today
 * never forgets the deletes before it.
 *
 * Deliberately NOT `fsSet`: since the frozen-notebook fix, fsSet writes with
 * `mergeFields`, which REPLACES each top-level field wholesale — right for a
 * record, and exactly wrong here, where the payload is one new key of a map
 * that must keep all the others. Routed through fsSet, every delete wiped the
 * list down to itself (found 2026-10-06: each workspace's tombstone doc held
 * one id, the most recent), and anything deleted before it could come back
 * from any device still holding a copy. `merge: true` deep-merges a nested
 * map, which is precisely "add these keys".
 */
export async function fsTombstone(projectId: string, ids: string[]) {
  if (!db || ids.length === 0) return;
  const now = Date.now();
  try {
    await _trackWrite(setDoc(doc(db, tombstoneCollection(projectId), TOMB_DOC), {
      ids: Object.fromEntries(ids.map(id => [id, now])),
      _updatedAt: serverTimestamp(),
    }, { merge: true }));
  } catch (e) {
    console.warn(`Firestore tombstone write failed for ${projectId}:`, e);
    _notifySyncError();
  }
}

/**
 * Lift a tombstone — the record is NOT deleted after all.
 *
 * This exists for undo, and undo is the only caller. Without it, undoing a
 * delete would put the record back locally and the next sync would take it
 * straight out again, on every device including this one: the record would
 * blink back into existence and vanish, which is far worse than the delete
 * having stood.
 *
 * A dotted field path is required. `deleteField()` can only remove a key
 * addressed directly — sending `{ ids: { [id]: deleteField() } }` through a
 * merge writes a nested map and removes nothing.
 */
export async function fsUntombstone(projectId: string, ids: string[]) {
  if (!db || ids.length === 0) return;
  try {
    await _trackWrite(updateDoc(doc(db, tombstoneCollection(projectId), TOMB_DOC),
      Object.fromEntries(ids.map(id => [`ids.${id}`, deleteField()]))));
  } catch (e) {
    // The doc may not exist yet — which means there is no tombstone to lift.
    console.warn(`Firestore untombstone failed for ${projectId}:`, e);
    _notifySyncError();
  }
}

function tombIds(raw: unknown): Record<string, number> {
  const ids = (raw as { ids?: Record<string, number> } | undefined)?.ids;
  return ids && typeof ids === 'object' ? ids : {};
}

/** Every id deleted in this project. Prunes the oldest when the doc gets fat. */
export async function fsGetTombstones(projectId: string): Promise<Set<string>> {
  if (!db) return new Set();
  try {
    const snap = await getDoc(doc(db, tombstoneCollection(projectId), TOMB_DOC));
    _countReads(1, 'tombstones');
    const ids = tombIds(snap.data());
    const keys = Object.keys(ids);
    if (keys.length > TOMB_MAX) {
      const kept = keys.sort((a, b) => (ids[b] ?? 0) - (ids[a] ?? 0)).slice(0, TOMB_KEEP);
      // Whole-doc write, not a merge — a merge cannot remove keys.
      await _trackWrite(setDoc(doc(db, tombstoneCollection(projectId), TOMB_DOC), {
        ids: Object.fromEntries(kept.map(k => [k, ids[k]])), _updatedAt: serverTimestamp(),
      }));
      return new Set(kept);
    }
    return new Set(keys);
  } catch (e) {
    console.warn(`Firestore tombstone read failed for ${projectId}:`, e);
    return new Set();
  }
}

/** Live tombstones, so a delete on one device lands on the others straight away. */
export function fsListenTombstones(projectId: string, callback: (ids: Set<string>) => void): Unsubscribe {
  if (!db) return () => {};
  try {
    return onSnapshot(doc(db, tombstoneCollection(projectId), TOMB_DOC), snap => {
      _countReads(1, 'tombstones');
      callback(new Set(Object.keys(tombIds(snap.data()))));
    });
  } catch (e) {
    console.warn(`Firestore tombstone listener failed for ${projectId}:`, e);
    return () => {};
  }
}

// Batch write multiple docs.
// Firestore hard-caps a batch at 500 writes and REJECTS the whole thing past
// that — and since this catch only warns, a 600-row set would look saved and
// silently never reach the cloud. Chunked, so the CSV import (or a Force Push
// of a big board) cannot fall off that cliff.
export async function fsBatchSet(collectionName: string, items: Array<{ id: string; data: object }>) {
  if (!db) return;
  try {
    for (let i = 0; i < items.length; i += 450) {
      const batch = writeBatch(db);
      items.slice(i, i + 450).forEach(({ id, data }) => {
        // Same rules as fsSet: deleteField for cleared top-level fields,
        // nested undefined stripped, and mergeFields so a nested map is
        // REPLACED rather than deep-merged — a merge cannot remove keys.
        const sanitized = Object.fromEntries(
          Object.entries({ ...data, _updatedAt: serverTimestamp() })
            .map(([k, v]) => [k, v === undefined ? deleteField() : stripUndefinedDeep(v)])
        );
        batch.set(doc(db!, collectionName, id), sanitized,
          { mergeFields: Object.keys(sanitized).map(k => new FieldPath(k)) });
      });
      await _trackWrite(batch.commit());
    }
  } catch (e) {
    console.warn(`Firestore batch write failed for ${collectionName}:`, e);
    _notifySyncError();
  }
}

/** Listen to ONE document (null when it does not exist). */
export function fsListenDoc(collectionName: string, docId: string, callback: (data: Record<string, unknown> | null) => void): Unsubscribe {
  if (!db) return () => {};
  return onSnapshot(doc(db, collectionName, docId), snap => {
    if (!snap.metadata.hasPendingWrites) _countReads(1, collectionName);
    callback(snap.exists() ? snap.data() as Record<string, unknown> : null);
  }, e => _notifyReadError(collectionName, e));
}
