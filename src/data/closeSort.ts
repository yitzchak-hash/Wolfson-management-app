/**
 * After a close with ONE picture step (the default since 2026-11-01), the
 * pictures went up untagged. This hands them to the server (api/drive-upload.js,
 * mode 'sort-photos'), which looks at each with the app's AI, picks which of
 * the close's stages it shows, tags the photo and moves its Drive file into
 * that stage's folder. Fire and forget: the worker never waits for it, and a
 * failure leaves the photos where they are, still on the job.
 */
import type { ContractorPhoto, Stage } from '../types';
import { projectCollection } from './firebase';

const DRIVE_API_KEY = (import.meta.env.VITE_DRIVE_API_KEY as string | undefined) ?? '';

export function sortClosePhotos(projectId: string, photos: ContractorPhoto[], stages: Stage[]): void {
  const list = photos.filter(p => !p.stageId && p.driveFileId).map(p => ({ id: p.id, driveFileId: p.driveFileId!, video: p.fileType === 'video' }));
  if (!list.length || !stages.length || !DRIVE_API_KEY) return;
  const body = {
    mode: 'sort-photos',
    col: projectCollection(projectId, 'contractorPhotos'),
    photos: list.slice(0, 40),
    stages: stages.map(st => ({ id: st.id, name: st.name, order: st.order, includes: st.includes ?? [] })),
    projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? '',
    apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ?? '',
  };
  try {
    void fetch('/api/drive-upload', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'x-api-key': DRIVE_API_KEY },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch { /* the photos stay on the job as they are */ }
}
