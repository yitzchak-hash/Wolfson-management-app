/**
 * WHERE A JOB'S FILES GO (owner, 2026-11-09: "Jobs with no drive link, it doesn't even upload and it doesn't show any
 * error message … We need to save it to the general place where we would save that type of stuff").
 *
 * The job's own Drive folder when it has one. Otherwise the office's general Drive folder (Settings → Backups, the one
 * the File Tray saves into), in "Jobs without a Drive folder" › <workspace> · <the job>, so nothing is dropped and the
 * office can move it into the job's folder once it has one. Null only when neither is set — the caller then says so.
 */
import { extractFolderId, findOrCreateFolderOnce } from './driveApi';
import { useStore } from './store';
import { aptLabel, type Apartment } from '../types';

export const NO_FOLDER_ROOT = 'Jobs without a Drive folder';

/** True when the job has no folder of its own and its files go to the general folder. */
export function usesGeneralFolder(apt: Pick<Apartment, 'driveLink'> | null | undefined): boolean {
  return !(apt?.driveLink && extractFolderId(apt.driveLink));
}

export async function jobFolderId(apt: Apartment | null | undefined): Promise<string | null> {
  if (!apt) return null;
  const own = apt.driveLink ? extractFolderId(apt.driveLink) : null;
  if (own) return own;
  const st = useStore.getState();
  const general = st.backupDriveFolderLink ? extractFolderId(st.backupDriveFolderLink) : null;
  if (!general) return null;
  const root = await findOrCreateFolderOnce(general, NO_FOLDER_ROOT);
  const ws = st.projects?.find?.((p: { id: string; name?: string }) => p.id === st.currentProjectId)?.name || st.currentProjectId;
  const name = `${ws} · ${apt.buildingId} · ${aptLabel(apt)}`.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120);
  return findOrCreateFolderOnce(root, name);
}
