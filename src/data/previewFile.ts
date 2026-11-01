/**
 * A backup FILE from this computer, opened in the preview WITHOUT uploading it
 * anywhere (owner, 2026-11-01: "I don't want it to upload the file as a backup
 * in Drive"). The Backups page puts the file's text here, in this browser's
 * own storage, and opens `/?previewBackup=local`; the preview tab reads it
 * back. It goes up to Drive only if Restore is pressed (the server restores
 * from Drive). Device-only on purpose: a file a person opened on this
 * computer, kept until the next one replaces it.
 */
const DB = 'tzviair-preview';
const STORE = 'files';
export const LOCAL_PREVIEW_ID = 'local';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export interface LocalPreviewFile { name: string; text: string; folderId: string | null }

export async function putLocalPreview(f: LocalPreviewFile): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(f, 'current');
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
  db.close();
}

export async function getLocalPreview(): Promise<LocalPreviewFile | null> {
  const db = await open();
  const v = await new Promise<LocalPreviewFile | null>((res, rej) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get('current');
    r.onsuccess = () => res((r.result as LocalPreviewFile) ?? null); r.onerror = () => rej(r.error);
  });
  db.close();
  return v;
}
