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
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly';

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

/** Silent token refresh — skips consent prompt if user already approved. Falls back to visible prompt on failure. */
export async function refreshGoogleToken(clientId: string): Promise<{ token: string; expiry: number }> {
  await loadGIS();
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (window.google!.accounts.oauth2.initTokenClient as any)({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      prompt: '',
      callback: (resp: { access_token?: string; error?: string; expires_in?: number }) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error ?? 'Silent refresh failed'));
        } else {
          resolve({ token: resp.access_token, expiry: Date.now() + (resp.expires_in ?? 3600) * 1000 });
        }
      },
    });
    client.requestAccessToken();
  });
}

/** Returns a valid token, auto-refreshing silently if expired. Returns null if no clientId configured. */
export async function ensureValidToken(
  clientId: string,
  currentToken: string | null,
  currentExpiry: number | null,
  setToken: (token: string | null, expiry: number | null) => void,
): Promise<string | null> {
  if (currentToken && currentExpiry && Date.now() < currentExpiry - 60_000) return currentToken;
  if (!clientId) return null;
  try {
    const { token, expiry } = await refreshGoogleToken(clientId);
    setToken(token, expiry);
    return token;
  } catch {
    return null;
  }
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

/** Find or create a subfolder by name inside a parent folder */
export async function findOrCreateFolder(parentId: string, name: string, token: string): Promise<string> {
  const q = `name = '${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchResp = await fetch(
    `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, fields: 'files(id)' })}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (searchResp.ok) {
    const data = await searchResp.json();
    if (data.files?.length) return data.files[0].id as string;
  }
  const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  if (!createResp.ok) throw new Error(`Failed to create Drive folder "${name}": ${createResp.status}`);
  const created = await createResp.json();
  return created.id as string;
}

/** Upload a base64 dataUrl to a Drive folder. Returns the created file. */
export async function uploadFileToDrive(
  folderId: string,
  filename: string,
  dataUrl: string,
  mimeType: string,
  token: string,
): Promise<{ id: string; webViewLink: string }> {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const byteChars = atob(base64);
  const byteArr = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArr], { type: mimeType });

  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const form = new FormData();
  form.append('metadata', new Blob([metadata], { type: 'application/json' }));
  form.append('file', blob, filename);

  const resp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  if (!resp.ok) throw new Error(`Drive upload failed: ${resp.status}`);
  return await resp.json();
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

// ─── Backend helpers (service account, no user OAuth needed) ──────────────────

const DRIVE_API_KEY = (import.meta.env.VITE_DRIVE_API_KEY as string | undefined) ?? '';

export function isUploadBackendConfigured(): boolean {
  return !!DRIVE_API_KEY;
}

async function listFolderViaBackend(folderId: string): Promise<DriveFile[]> {
  const resp = await fetch('/api/drive-files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': DRIVE_API_KEY },
    body: JSON.stringify({ folderId }),
  });
  if (!resp.ok) throw new Error(`drive-files ${resp.status}`);
  const data = await resp.json();
  return (data.files ?? []) as DriveFile[];
}

export async function findPlansPdfViaBackend(driveLink: string): Promise<DriveFile | null> {
  const folderId = extractFolderId(driveLink);
  if (!folderId) return null;
  try {
    const files = await listFolderViaBackend(folderId);
    const plansFolder = files.find(
      f => f.mimeType === 'application/vnd.google-apps.folder' && /(plan|engineer)/i.test(f.name),
    );
    if (!plansFolder) return null;
    const planFiles = await listFolderViaBackend(plansFolder.id);
    return planFiles.find(f => f.mimeType === 'application/pdf') ?? null;
  } catch {
    return null;
  }
}

export async function checkFolderHealthViaBackend(
  driveLink: string | undefined,
  plansPdfLink: string | undefined,
): Promise<FolderHealth> {
  const folderId = driveLink ? extractFolderId(driveLink) : null;
  const health: FolderHealth = { mainFolderLinked: !!driveLink, plansPdfLinked: !!plansPdfLink };
  if (!folderId) return health;
  try {
    const files = await listFolderViaBackend(folderId);
    health.mainFolderAccessible = true;
    health.photosFolderFound = files.some(
      f => f.mimeType === 'application/vnd.google-apps.folder' && /photo/i.test(f.name),
    );
    const plansFolder = files.find(
      f => f.mimeType === 'application/vnd.google-apps.folder' && /(plan|engineer)/i.test(f.name),
    );
    health.plansFolderFound = !!plansFolder;
    if (plansFolder) {
      const planFiles = await listFolderViaBackend(plansFolder.id);
      health.plansPdfFound = planFiles.find(f => f.mimeType === 'application/pdf') ?? null;
    }
  } catch {
    health.mainFolderAccessible = false;
  }
  return health;
}

// ─── Backend (Vercel serverless) upload helpers ────────────────────────────────
// These route through /api/* so contractors on any device can upload to Drive
// via the service account — no per-user OAuth token required.

/** Find or create a subfolder by name under a parent, via the backend service account. */
export async function findOrCreateFolderViaBackend(parentId: string, name: string): Promise<string> {
  const resp = await fetch('/api/folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': DRIVE_API_KEY },
    body: JSON.stringify({ parentId, name }),
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => '');
    throw new Error(`Folder API ${resp.status}: ${msg}`);
  }
  const data = await resp.json();
  return data.folderId as string;
}

/**
 * Upload a file directly to Drive using a backend-issued resumable session.
 * The file streams browser → Google Drive; it never passes through Vercel.
 * Works for any size (500MB+ videos). Optional progress callback (0-100).
 */
export async function uploadFileViaBackend(
  folderId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ fileId: string; webViewLink: string }> {
  // 1. Ask backend for a one-time resumable upload URL
  const sessResp = await fetch('/api/drive-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': DRIVE_API_KEY },
    body: JSON.stringify({
      folderId,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
    }),
  });
  if (!sessResp.ok) {
    const msg = await sessResp.text().catch(() => '');
    throw new Error(`Session API ${sessResp.status}: ${msg}`);
  }
  const { uploadUrl } = await sessResp.json();
  if (!uploadUrl) throw new Error('No upload URL returned');

  // 2. Upload the raw file straight to Google Drive (XHR for progress events)
  const result = await new Promise<{ id: string; webViewLink?: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { resolve({ id: '' }); }
      } else {
        reject(new Error(`Drive upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during Drive upload'));
    xhr.send(file);
  });

  const fileId = result.id;
  const webViewLink = result.webViewLink ?? (fileId ? `https://drive.google.com/file/d/${fileId}/view` : '');
  return { fileId, webViewLink };
}
