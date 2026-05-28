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
  getFirestore,
  Firestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  writeBatch,
  serverTimestamp,
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
  firebaseConfig.apiKey && firebaseConfig.projectId
);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  } catch (e) {
    console.warn('Firebase init failed, using localStorage only:', e);
  }
}

export { db };

// Generic document write
export async function fsSet(collectionName: string, docId: string, data: object) {
  if (!db) return;
  try {
    await setDoc(doc(db, collectionName, docId), { ...data, _updatedAt: serverTimestamp() }, { merge: true });
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

// Batch write multiple docs
export async function fsBatchSet(collectionName: string, items: Array<{ id: string; data: object }>) {
  if (!db) return;
  try {
    const batch = writeBatch(db);
    items.forEach(({ id, data }) => {
      batch.set(doc(db!, collectionName, id), { ...data, _updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  } catch (e) {
    console.warn(`Firestore batch write failed for ${collectionName}:`, e);
  }
}
