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

/**
 * What Drive for desktop calls "Shared drives" on THIS computer.
 *
 * Drive for desktop LOCALISES the two top folders: on a Hebrew Windows the
 * folder is not "Shared drives" at all, so a path composed with the English
 * name does not exist on disk — pasting it into Explorer opens nothing, which
 * was the office's report. Per machine, never synced, like the root.
 */
const SHARED_KEY = 'drive_shared_name';
/**
 * The name a Hebrew Windows gives the folder — CONFIRMED from the office's
 * own Explorer path (2026-09-08): `G:\תיקיות אחסון שיתופי\TA Zoho Docs\…`.
 * Used as the default on a Hebrew-language browser when nobody has pasted a
 * path on this machine yet, so the copied path opens in Explorer on the
 * office's PCs without a setup step. A pasted path always wins.
 */
export const HEBREW_SHARED_DRIVES = 'תיקיות אחסון שיתופי';
export function defaultSharedName(lang: string = typeof navigator !== 'undefined' ? navigator.language : ''): string {
  return /^he\b/i.test(lang) ? HEBREW_SHARED_DRIVES : 'Shared drives';
}
export const getSharedName = (): string => (localStorage.getItem(SHARED_KEY) ?? '').trim();

/**
 * The shared drive's OWN name — the segment Drive for desktop puts right
 * after "Shared drives" (`G:\תיקיות אחסון שיתופי\TA Zoho Docs\Potentials\…`).
 *
 * The server names it through `drives.get`, which Google only answers for a
 * MEMBER of the drive; a service account that was merely given the folders
 * gets refused, the name comes back empty, and the composed path skipped the
 * segment entirely — "G:\Shared drives\Potentials\…", which no fallback
 * could ever find (the office's 2026-09-08 screenshot). So: the office's one
 * shared drive is the default, and a pasted path teaches this machine the
 * real name (per machine like the root — the office might one day paste a
 * path from a second drive).
 */
export const DEFAULT_SHARED_DRIVE = 'TA Zoho Docs';
const DRIVE_NAME_KEY = 'drive_drive_name';
export const getDriveName = (): string => (localStorage.getItem(DRIVE_NAME_KEY) ?? '').trim();
export const setDriveName = (v: string): void => {
  const clean = v.trim().replace(/[\\/]+$/, '');
  if (clean) localStorage.setItem(DRIVE_NAME_KEY, clean);
  else localStorage.removeItem(DRIVE_NAME_KEY);
};
export const setSharedName = (v: string): void => {
  const clean = v.trim().replace(/[\\/]+$/, '');
  if (clean) localStorage.setItem(SHARED_KEY, clean);
  else localStorage.removeItem(SHARED_KEY);
};

/**
 * Read the root AND the shared-drives folder name off a path somebody pasted
 * from File Explorer or Finder — the one thing nobody can get wrong, because
 * it is copied, not typed. "G:\אחסון שיתופי\TzviAir\Cohen…" gives root "G:"
 * and shared-drives folder "אחסון שיתופי"; a Mac path gives the CloudStorage
 * folder and the localised name after it.
 */
export function parsePastedPath(text: string): { root: string; sharedName: string; driveName: string; sep: '\\' | '/' } | null {
  const t = text.trim().replace(/^["']|["']$/g, '').replace(/^file:\/\/\/?/i, '');
  // The drive's own name is the segment AFTER the shared-drives folder — but
  // only when there is a folder beyond it too (a path ending on the drive's
  // root, or a My Drive path, names no drive).
  const driveOf = (rest: string, sep: string): string => {
    const parts = rest.split(sep === '\\' ? /[\\/]+/ : /\/+/).filter(Boolean);
    return parts.length >= 2 ? parts[0] : '';
  };
  const win = t.match(/^([A-Za-z]:)[\\/]+([^\\/]+)[\\/]*(.*)$/);
  if (win) return { root: win[1], sharedName: win[2], driveName: driveOf(win[3], '\\'), sep: '\\' };
  const mac = t.match(/^(\/Users\/[^/]+\/Library\/CloudStorage\/[^/]+)\/([^/]+)\/?(.*)$/);
  if (mac) return { root: mac[1], sharedName: mac[2], driveName: driveOf(mac[3], '/'), sep: '/' };
  const generic = t.match(/^(\/[^/]+(?:\/[^/]+)*?)\/(Shared drives|My Drive|[^/]+)\/([^/]+.*)$/);
  if (generic && /CloudStorage|GoogleDrive|Google Drive/i.test(generic[1])) return { root: generic[1], sharedName: generic[2], driveName: driveOf(generic[3], '/'), sep: '/' };
  return null;
}

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
export function composeLocalPath(root: string, path: FolderPath, sharedName = getSharedName(), driveName = getDriveName()): string {
  const sep = separatorFor(root);
  // The drive's name: what the server said, else what a pasted path taught
  // this machine, else the office's one shared drive. Never skipped — a path
  // missing this segment exists nowhere.
  const drive = path.driveName || driveName || DEFAULT_SHARED_DRIVE;
  const top = path.inSharedDrive
    ? [sharedName || defaultSharedName(), drive]
    : ['My Drive'];
  return [root.replace(/[\\/]+$/, ''), ...top, ...path.segments].join(sep);
}
