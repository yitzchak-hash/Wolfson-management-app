import type { ContractorPhoto } from '../types';
import { driveThumbUrl } from './driveApi';

/**
 * The ONE answer to "what address draws this photo".
 *
 * A photo has up to three homes: Firebase Storage (`storageUrl`, a real
 * image address), Google Drive (`driveFileId` — the image is Drive's
 * THUMBNAIL for that id; `driveUrl` is a web VIEW link, a page, and an
 * <img> given it draws nothing), and a local base64 `dataUrl`. The photo
 * widgets used `driveUrl` straight as an image source, which is why every
 * picture a worker sent through the Drive path — closing a task, closing a
 * problem — came out as a broken square on the wall while the thread
 * showed it fine (owner, 2026-09-06).
 */
export function photoSrcOf(p: Pick<ContractorPhoto, 'storageUrl' | 'driveFileId' | 'dataUrl'>, px = 800): string {
  return p.storageUrl || (p.driveFileId ? driveThumbUrl(p.driveFileId, px) : '') || p.dataUrl || '';
}

/** A picture, not a video or a document — the photo widgets draw only these. */
export function isPicture(p: Pick<ContractorPhoto, 'fileType' | 'mimeType'>): boolean {
  if (p.fileType) return p.fileType === 'image';
  return !p.mimeType || p.mimeType.startsWith('image/');
}
