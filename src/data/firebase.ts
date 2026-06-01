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
  deleteDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import {
  getStorage,
  FirebaseStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

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
let storage: FirebaseStorage | null = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
  } catch (e) {
    console.warn('Firebase init failed, using localStorage only:', e);
  }
}

export { db };
export const isStorageConfigured = Boolean(storage);

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

// Upload a file to Firebase Storage; returns the public download URL
export async function fsUploadFile(
  path: string,
  file: File | Blob,
  onProgress?: (pct: number) => void,
): Promise<string> {
  if (!storage) throw new Error('Firebase Storage not configured');
  const fileRef = storageRef(storage, path);
  const meta = file instanceof File ? { contentType: file.type } : undefined;
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, file, meta);
    task.on(
      'state_changed',
      snap => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref)),
    );
  });
}

// Delete a file from Firebase Storage
export async function fsDeleteFile(path: string): Promise<void> {
  if (!storage) return;
  try {
    await deleteObject(storageRef(storage, path));
  } catch (e) {
    console.warn(`Storage delete failed for ${path}:`, e);
  }
}

// Delete a single document
export async function fsDelete(collectionName: string, docId: string) {
  if (!db) return;
  try {
    await deleteDoc(doc(db, collectionName, docId));
  } catch (e) {
    console.warn(`Firestore delete failed for ${collectionName}/${docId}:`, e);
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
