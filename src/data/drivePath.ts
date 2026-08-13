import { extractFolderId } from './driveApi';

/**
 * A job's folder, as a path the architect's own computer understands.
 *
 * The architects draw in AutoCAD against files that live in the shared drive,
 * mirrored onto their machines by Google Drive for desktop. Getting from the
 * app to that folder means retyping or hunting through Explorer, which is the
 * slow part of opening a drawing.
 *
 * A web page CANNOT open File Explorer — every route to it is blocked by the
 * browser, and blocked silently: a `file://` link throws nothing and simply
 * does not navigate, so a button that tried would look broken rather than
 * restricted. Verified in Chromium against a link, a scripted navigation and
 * window.open; all three refused. So the path is put on the clipboard instead,
 * and pasted into Explorer's address bar or Finder's Go to Folder.
 *
 * Two halves make the path:
 *   · the part inside the drive — the same on every machine, worked out from
 *     the folder id by `api/drive-path.js`;
 *   · the part in front of it — the drive letter on Windows, or a folder
 *     carrying the signed-in user's own email on a Mac. Different on every
 *     computer, so it is a per-machine setting and is deliberately kept OUT of
 *     the synced store. Syncing it would push one architect's path onto
 *     everybody else's machine, where it is wrong.
 */

/** Per machine, never synced — see the note above. */
const ROOT_KEY = 'drive_desktop_root';

export const getDriveRoot = (): string =>
  (localStorage.getItem(ROOT_KEY) ?? '').trim();

export const setDriveRoot = (v: string): void => {
  const clean = v.trim().replace(/[\\/]+$/, '');
  if (clean) localStorage.setItem(ROOT_KEY, clean);
  else localStorage.removeItem(ROOT_KEY);
};

/** Backslashes for a Windows root, forward slashes for anything else. */
export function separatorFor(root: string): '\\' | '/' {
  return /^[A-Za-z]:/.test(root) || root.includes('\\') ? '\\' : '/';
}

/**
 * What this machine's root probably is.
 *
 * A guess worth offering, never one worth using silently: the Windows drive
 * letter is customisable and the Mac path contains an email address only the
 * person sitting there knows. Offered as a starting point in the box.
 */
export function guessRoot(): { value: string; note: string } {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) {
    return {
      value: 'G:',
      note: 'Drive for desktop usually mounts as G: — check "This PC" in File Explorer '
        + 'if yours is a different letter.',
    };
  }
  if (/Mac/i.test(ua)) {
    return {
      value: '/Users/YOU/Library/CloudStorage/GoogleDrive-you@company.com',
      note: 'On a Mac the folder carries your own Google address. Open Finder, press '
        + 'Cmd+Shift+G and start typing ~/Library/CloudStorage/ to see yours.',
    };
  }
  return { value: '', note: 'The folder that contains "Shared drives" and "My Drive".' };
}

export interface FolderPath {
  /** From the drive's root down to the folder itself. */
  segments: string[];
  driveName: string | null;
  inSharedDrive: boolean;
}

/**
 * Asked once per folder per session.
 *
 * The server caches too, but a job re-opened five times in a minute should not
 * cost five round trips before the button can answer.
 */
const seen = new Map<string, FolderPath>();

export async function folderPath(driveLinkOrId: string): Promise<FolderPath | null> {
  const id = extractFolderId(driveLinkOrId) ?? driveLinkOrId.trim();
  if (!id) return null;
  if (seen.has(id)) return seen.get(id)!;

  try {
    const r = await fetch('/api/drive-path', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': import.meta.env.VITE_DRIVE_API_KEY ?? '',
      },
      body: JSON.stringify({ folderId: id }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!Array.isArray(j.segments)) return null;
    const out: FolderPath = {
      segments: j.segments,
      driveName: j.driveName ?? null,
      inSharedDrive: !!j.inSharedDrive,
    };
    seen.set(id, out);
    return out;
  } catch {
    return null;
  }
}

/**
 * The two halves, joined.
 *
 * "Shared drives" and "My Drive" are the folder names Drive for desktop puts
 * at the top, so they go in between rather than being expected in the root the
 * office typed — asking somebody to include them is asking them to get one of
 * two spellings right for no reason.
 */
export function composeLocalPath(root: string, path: FolderPath): string {
  const sep = separatorFor(root);
  const top = path.inSharedDrive
    ? ['Shared drives', ...(path.driveName ? [path.driveName] : [])]
    : ['My Drive'];
  return [root.replace(/[\\/]+$/, ''), ...top, ...path.segments].join(sep);
}
