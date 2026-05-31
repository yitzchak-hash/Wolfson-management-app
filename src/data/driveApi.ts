// Google Drive API helpers — client-side only, no backend required

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string; expires_in?: number }) => void;
          }): { requestAccessToken(): void };
        };
      };
    };
  }
}

const GIS_URL = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

let gisLoading: Promise<void> | null = null;

function loadGIS(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
  return gisLoading;
}

export async function requestGoogleToken(clientId: string): Promise<{ token: string; expiry: number }> {
  await loadGIS();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error ?? 'No access token returned'));
        } else {
          resolve({ token: resp.access_token, expiry: Date.now() + (resp.expires_in ?? 3600) * 1000 });
        }
      },
    });
    client.requestAccessToken();
  });
}

/** Extract folder ID from a Google Drive folder URL */
export function extractFolderId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m?.[1] ?? null;
}

/** Extract file ID from any Google Drive file/doc URL */
export function extractFileId(url: string): string | null {
  if (!url) return null;
  const m1 = url.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m2?.[1] ?? null;
}

export function drivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

export function driveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export interface FolderHealth {
  mainFolderLinked: boolean;
  plansPdfLinked: boolean;
  // only set when Drive API token is available:
  mainFolderAccessible?: boolean;
  photosFolderFound?: boolean;
  plansFolderFound?: boolean;
  plansPdfFound?: DriveFile | null;
}

async function listFolder(folderId: string, token: string): Promise<DriveFile[]> {
  const qs = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType)',
    pageSize: '50',
  });
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Drive API ${resp.status}`);
  const data = await resp.json();
  return (data.files ?? []) as DriveFile[];
}

export async function checkFolderHealth(
  driveLink: string | undefined,
  plansPdfLink: string | undefined,
  token: string,
): Promise<FolderHealth> {
  const folderId = driveLink ? extractFolderId(driveLink) : null;
  const health: FolderHealth = {
    mainFolderLinked: !!driveLink,
    plansPdfLinked: !!plansPdfLink,
  };
  if (!folderId) return health;
  try {
    const files = await listFolder(folderId, token);
    health.mainFolderAccessible = true;
    health.photosFolderFound = files.some(
      f => f.mimeType === 'application/vnd.google-apps.folder' &&
           /photo/i.test(f.name),
    );
    const plansFolder = files.find(
      f => f.mimeType === 'application/vnd.google-apps.folder' &&
           /(plan|engineer)/i.test(f.name),
    );
    health.plansFolderFound = !!plansFolder;
    if (plansFolder) {
      const planFiles = await listFolder(plansFolder.id, token);
      health.plansPdfFound = planFiles.find(f => f.mimeType === 'application/pdf') ?? null;
    }
  } catch {
    health.mainFolderAccessible = false;
  }
  return health;
}

export async function findPlansPdf(driveLink: string, token: string): Promise<DriveFile | null> {
  const folderId = extractFolderId(driveLink);
  if (!folderId) return null;
  try {
    const files = await listFolder(folderId, token);
    const plansFolder = files.find(
      f => f.mimeType === 'application/vnd.google-apps.folder' &&
           /(plan|engineer)/i.test(f.name),
    );
    if (!plansFolder) return null;
    const planFiles = await listFolder(plansFolder.id, token);
    return planFiles.find(f => f.mimeType === 'application/pdf') ?? null;
  } catch {
    return null;
  }
}
