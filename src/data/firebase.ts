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
    unsub = onSnapshot(q, snap => {
      _countReads(_billed(snap), collectionName);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      settle(docs, snap.metadata.fromCache);
      if (released) callback(docs); else latest = docs;
    }, e => {
      _notifyReadError(collectionName, e);
      settle([], true);
    });
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

/** Record ids as deleted. Merges, so two devices deleting at once cannot clobber each other. */
export async function fsTombstone(projectId: string, ids: string[]) {
  if (!db || ids.length === 0) return;
  const now = Date.now();
  await fsSet(tombstoneCollection(projectId), TOMB_DOC, {
    ids: Object.fromEntries(ids.map(id => [id, now])),
  });
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
