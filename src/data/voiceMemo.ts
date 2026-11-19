import {
  isUploadBackendConfigured, extractFolderId,
  findOrCreateFolderViaBackend, uploadFileViaBackend, shareFileToDrive,
} from './driveApi';
import { clock } from './voiceRecorder';

/**
 * Voice memos, shared.
 *
 * The board already had a recorder wired directly into GeneralJobsPage. Notes,
 * tasks and the worker portal need the same thing, and a second copy of
 * MediaRecorder plumbing is how two recorders end up disagreeing about what a
 * memo is. This module is the whole mechanism; the components in
 * components/ui/VoiceMemo.tsx are only its face.
 *
 * The recorder itself (useVoiceRecorder, squash, clock) lives in
 * voiceRecorder.ts, which imports nothing, so the outside shared view can use
 * it too; it is re-exported here so every caller keeps importing from here.
 *
 * On the look: this deliberately implements the FAMILIAR INTERACTION — hold to
 * record, a running timer, a live level trace, cancel or send, then a bubble
 * with play/scrub/speed. The interaction is the part worth copying. None of
 * WhatsApp's artwork, icons or wording is used, and none should be added.
 */
export { useVoiceRecorder, squash, clock } from './voiceRecorder';
export type { RecordedMemo, VoiceRecorder } from './voiceRecorder';

/**
 * Where a memo goes.
 *
 * Drive first, exactly like every other upload in this app, because a base64
 * memo lives in the record and the Firestore document limit is real. Without a
 * Drive folder configured a short memo still works locally, and a long one is
 * refused OUT LOUD rather than being silently cut off — the caller shows the
 * returned reason.
 */
export const LOCAL_MEMO_LIMIT = 700_000;

export async function storeVoiceMemo(
  blob: Blob,
  seconds: number,
  driveFolderLink: string | undefined,
  subfolder = 'Voice Memos',
): Promise<{ url: string } | { error: string }> {
  const parent = driveFolderLink ? extractFolderId(driveFolderLink) : null;
  if (isUploadBackendConfigured() && parent) {
    try {
      const folderId = await findOrCreateFolderViaBackend(parent, subfolder);
      const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('mpeg') ? 'mp3' : 'webm';
      const file = new File([blob], `memo-${Date.now()}.${ext}`, { type: blob.type || 'audio/webm' });
      const res = await uploadFileViaBackend(folderId, file);
      if (res?.fileId) void shareFileToDrive(res.fileId);
      if (res?.webViewLink) return { url: res.webViewLink };
    } catch {
      // fall through to the local path
    }
  }
  if (blob.size > LOCAL_MEMO_LIMIT) {
    return { error: `That memo is too long to keep on this device (${clock(seconds)}). Set the Drive folder in App settings and it will upload instead.` };
  }
  const url = await new Promise<string | null>(resolve => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(blob);
  });
  return url ? { url } : { error: 'That memo could not be saved.' };
}

/** The speeds the player cycles through, in order. */
export const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
