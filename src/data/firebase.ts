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
import {
  initializeFirestore,
  Firestore,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  deleteField,
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

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    // ignoreUndefinedProperties: Firestore rejects docs with undefined fields and throws
    // silently — this fixes writes for all collections that have optional fields.
    // No persistentLocalCache — removed to fix cross-device sync on mobile.
    db = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
    });
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
type SyncStatus = 'idle' | 'saving' | 'saved';
type SyncListener = (s: SyncStatus) => void;
const _syncListeners: SyncListener[] = [];
let _pendingWrites = 0;
let _savedTimer: ReturnType<typeof setTimeout> | null = null;

export function subscribeCloudSync(fn: SyncListener): () => void {
  _syncListeners.push(fn);
  return () => { const i = _syncListeners.indexOf(fn); if (i >= 0) _syncListeners.splice(i, 1); };
}

function _notifySyncListeners(s: SyncStatus) { _syncListeners.forEach(fn => fn(s)); }

function _trackWrite<T>(promise: Promise<T>): Promise<T> {
  _pendingWrites++;
  if (_savedTimer) { clearTimeout(_savedTimer); _savedTimer = null; }
  _notifySyncListeners('saving');
  return promise.finally(() => {
    _pendingWrites = Math.max(0, _pendingWrites - 1);
    if (_pendingWrites === 0) {
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
    // Replace undefined values with deleteField() so merge:true actually removes them from Firestore
    const sanitized = Object.fromEntries(
      Object.entries({ ...data, _updatedAt: serverTimestamp() }).map(([k, v]) => [k, v === undefined ? deleteField() : v])
    );
    await _trackWrite(setDoc(doc(db, collectionName, docId), sanitized, { merge: true }));
  } catch (e) {
    console.warn(`Firestore write failed for ${collectionName}/${docId}:`, e);
  }
}

// Generic collection read (returns all docs)
export async function fsGetAll(collectionName: string): Promise<Record<string, unknown>[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, collectionName));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn(`Firestore read failed for ${collectionName}:`, e);
    return [];
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
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  } catch (e) {
    console.warn(`Firestore listener failed for ${collectionName}:`, e);
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
        const sanitized = Object.fromEntries(
          Object.entries({ ...data, _updatedAt: serverTimestamp() }).map(([k, v]) => [k, v === undefined ? deleteField() : v])
        );
        batch.set(doc(db!, collectionName, id), sanitized, { merge: true });
      });
      await _trackWrite(batch.commit());
    }
  } catch (e) {
    console.warn(`Firestore batch write failed for ${collectionName}:`, e);
  }
}
