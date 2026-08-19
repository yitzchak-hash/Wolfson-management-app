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
      f => f.mimeType === 'application/vnd.google-apps.folder' && isEngineeredPlansFolder(f.name),
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

/**
 * Derives the family name from a Drive folder title.
 * Folders are named like "Artzi, Avital - 1234 - notes", so the family name is
 * everything before the first " -". Falls back to the whole title when there is
 * no " -" separator.
 */
export function familyNameFromFolderName(folderName: string): string {
  const idx = folderName.indexOf(' -');
  return (idx === -1 ? folderName : folderName.slice(0, idx)).trim();
}

/** Reads a Drive folder's own title. Returns null if it can't be fetched. */
export async function getFolderNameViaBackend(folderId: string): Promise<string | null> {
  try {
    const resp = await fetch('/api/drive-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': DRIVE_API_KEY },
      body: JSON.stringify({ folderId, metaOnly: true }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data.folder?.name as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function findPlansPdfViaBackend(driveLink: string): Promise<DriveFile | null> {
  const pdfs = await findAllPlansPdfsViaBackend(driveLink);
  return pdfs[0] ?? null;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Matches ONLY the dedicated engineered-plans folder.
 *
 * This deliberately requires the full phrase. Matching loose fragments like
 * "plan" / "drawing" / "dwg" pulled PDFs out of unrelated subfolders, so the
 * contractor could be shown the wrong document.
 */
export function isEngineeredPlansFolder(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/[_\-–—]+/g, ' ').replace(/\s+/g, ' ');
  // "Engineered Plans", "Engineering Plan", "01 Engineered Plans Final", …
  if (/\bengineer(ed|ing)?\s+plans?\b/.test(n)) return true;
  // Hebrew equivalent — full phrase only, never a fragment
  if (n.includes('תוכניות הנדסיות') || n.includes('תכניות הנדסיות')) return true;
  return false;
}

export async function findAllPlansPdfsViaBackend(driveLink: string): Promise<DriveFile[]> {
  const folderId = extractFolderId(driveLink);
  if (!folderId) return [];
  try {
    const files = await listFolderViaBackend(folderId);
    const plansFolder = files.find(f => f.mimeType === FOLDER_MIME && isEngineeredPlansFolder(f.name));
    // No Engineered Plans folder → report nothing. Never guess from loose PDFs
    // lying in the main folder, and never scan other subfolders.
    if (!plansFolder) return [];
    const planFiles = await listFolderViaBackend(plansFolder.id);
    return planFiles.filter(f => f.mimeType === 'application/pdf');
  } catch {
    return [];
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
    const plansFolder = files.find(f => f.mimeType === FOLDER_MIME && isEngineeredPlansFolder(f.name));
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

/** Returns a thumbnail URL for a Drive file (file must be shared publicly) */
export function driveThumbUrl(fileId: string, maxPx = 1200): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${maxPx}`;
}

/** Make a Drive file readable by anyone with the link, via backend service account */
export async function shareFileToDrive(fileId: string): Promise<boolean> {
  if (!DRIVE_API_KEY) return false;
  try {
    const r = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': DRIVE_API_KEY },
      body: JSON.stringify({ fileId }),
    });
    return r.ok;
  } catch (e) {
    console.warn('Failed to share Drive file:', e);
    return false;
  }
}

/**
 * Make sure a Drive FILE OR FOLDER is link-shared, once.
 *
 * Plan viewers, photo thumbnails and plain Drive links are all served by
 * drive.google.com, which knows nothing about the app's login and turns away
 * anyone not signed into an account with access — and the office itself is a
 * mix of personal Google accounts. The owner's chosen fix: everything the app
 * SHOWS from Drive becomes anyone-with-the-link readable. New uploads and
 * picks share as they are made; this helper also runs wherever something is
 * DISPLAYED, so the backlog heals itself the first time it is opened. Sharing
 * a FOLDER (each job's Photos subfolder) makes everything inside inherit,
 * future uploads included.
 *
 * The done-list lives in localStorage (per machine) plus an in-flight set, so
 * a portal that re-renders its task sheet does not hammer the share route.
 * Sharing twice is harmless on Google's side — this is only about not
 * repeating a network call on every render.
 */
const sharingNow = new Set<string>();
export function ensureDriveShared(fileId: string | null | undefined): void {
  if (!fileId || !DRIVE_API_KEY) return;
  let done: string[] = [];
  try { done = JSON.parse(localStorage.getItem('shared_plan_ids') ?? '[]'); } catch { /* fresh */ }
  if (done.includes(fileId) || sharingNow.has(fileId)) return;
  sharingNow.add(fileId);
  void fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': DRIVE_API_KEY },
    body: JSON.stringify({ fileId }),
  }).then(r => {
    if (!r.ok) return;    // failed = not recorded, so the next open retries
    try {
      const now: string[] = JSON.parse(localStorage.getItem('shared_plan_ids') ?? '[]');
      if (!now.includes(fileId)) {
        now.push(fileId);
        // A bounded list: this machine only needs to remember recent plans.
        localStorage.setItem('shared_plan_ids', JSON.stringify(now.slice(-400)));
      }
    } catch { /* private mode */ }
  }).catch(() => { /* offline — the next open retries */ })
    .finally(() => sharingNow.delete(fileId));
}

/**
 * A Drive link was just saved on a job — make its plan and photo surfaces
 * link-readable NOW, not on first open. The owner's rule: pasting the link is
 * the moment everything should be made to work. Shares exactly two
 * subfolders when they exist — Engineered Plans (its files and the Annotated
 * Plans child inherit) and Photos — and nothing else in the job folder.
 * Fire-and-forget with a per-machine done-list, so re-saving the same link
 * costs nothing.
 */
export function shareJobFolderSurfaces(driveLink: string | null | undefined): void {
  void shareJobFolderSurfacesNow(driveLink);
}

/**
 * The same work, but awaitable.
 *
 * The IMPORT needs this: it lands hundreds of jobs at once and the office has
 * to be told when their plans and photos are actually open, not left guessing
 * while several hundred fire-and-forget requests trickle out behind a screen
 * that has already said "done". Resolves true when something was shared.
 */
export async function shareJobFolderSurfacesNow(driveLink: string | null | undefined): Promise<boolean> {
  if (!driveLink || !DRIVE_API_KEY) return false;
  const folderId = extractFolderId(driveLink);
  if (!folderId) return false;
  let done: string[] = [];
  try { done = JSON.parse(localStorage.getItem('shared_job_folders') ?? '[]'); } catch { /* fresh */ }
  if (done.includes(folderId)) return false;
  try {
    const files = await listFolderViaBackend(folderId);
    const plans = files.find(f => f.mimeType === FOLDER_MIME && isEngineeredPlansFolder(f.name));
    const photos = files.find(f => f.mimeType === FOLDER_MIME && /^photos?$/i.test(f.name));
    // Some job folders are flat — no subfolders, the sheets sit in the root.
    // Sharing the job folder itself is then the only thing that opens them.
    if (!plans && !photos) await shareFileToDrive(folderId);
    if (plans) await shareFileToDrive(plans.id);
    if (photos) await shareFileToDrive(photos.id);
    try {
      const now: string[] = JSON.parse(localStorage.getItem('shared_job_folders') ?? '[]');
      if (!now.includes(folderId)) localStorage.setItem('shared_job_folders', JSON.stringify([...now, folderId].slice(-400)));
    } catch { /* private mode */ }
    return true;
  } catch {
    // Offline or refused — NOT recorded, so the next save or open tries again.
    return false;
  }
}

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
 * Upload ANY size file directly to Drive via a resumable session.
 * Browser → /api/drive-session (tiny JSON) → browser PUT directly to Drive.
 * No Vercel body limit applies; shows real upload progress.
 */
export async function uploadFileViaResumableSession(
  folderId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ fileId: string; webViewLink: string }> {
  const sessionResp = await fetch('/api/drive-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': DRIVE_API_KEY },
    body: JSON.stringify({ folderId, filename: file.name, mimeType: file.type || 'application/octet-stream' }),
  });
  if (!sessionResp.ok) {
    const msg = await sessionResp.text().catch(() => '');
    throw new Error(`Drive session failed (${sessionResp.status}): ${msg}`);
  }
  const { uploadUrl } = await sessionResp.json();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          const fileId = data.id as string;
          resolve({
            fileId,
            webViewLink: data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
          });
        } catch {
          reject(new Error('Could not parse Drive upload response'));
        }
      } else {
        reject(new Error(`Drive upload failed: ${xhr.status}`));
      }
    };
    // Google's resumable upload URL may not include CORS headers in its response,
    // causing onerror even when the file reached Drive successfully.
    // Recover by listing the target folder and matching by filename.
    xhr.onerror = () => {
      setTimeout(() => {
        listFolderViaBackend(folderId)
          .then(files => {
            const match = files.find(f => f.name === file.name);
            if (match) {
              resolve({
                fileId: match.id,
                webViewLink: `https://drive.google.com/file/d/${match.id}/view`,
              });
            } else {
              reject(new Error('Network error during Drive upload'));
            }
          })
          .catch(() => reject(new Error('Network error during Drive upload')));
      }, 1000);
    };
    xhr.send(file);
  });
}

/**
 * Upload a file to Drive via the backend service account.
 * Files are base64-encoded and POSTed to /api/drive-upload (max ~14 MB raw).
 * For larger files the function throws with a clear message.
 */
export async function uploadFileViaBackend(
  folderId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ fileId: string; webViewLink: string }> {
  const MAX_BYTES = 14 * 1024 * 1024; // 14 MB raw → ~19 MB base64 → within 20 MB body limit
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large for Drive upload (${Math.round(file.size / 1024 / 1024)} MB). Max is 14 MB.`);
  }

  // Read file as base64
  onProgress?.(5);
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const result = e.target?.result as string;
      // strip data URL prefix
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  onProgress?.(30);

  const resp = await fetch('/api/drive-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': DRIVE_API_KEY },
    body: JSON.stringify({
      folderId,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      data: base64,
    }),
  });
  onProgress?.(90);

  if (!resp.ok) {
    const msg = await resp.text().catch(() => '');
    throw new Error(`Drive upload failed (${resp.status}): ${msg}`);
  }

  const result = await resp.json();
  onProgress?.(100);
  return { fileId: result.fileId, webViewLink: result.webViewLink };
}

export interface DrivePhotoItem {
  fileId: string;
  filename: string;
  mimeType: string;
  folderName: string;  // which subfolder inside Photos/ it came from
}

/** List all files inside the apartment's Drive folder Photos/ subtree (one level deep into subfolders). */
export async function listAllPhotosViaBackend(driveLink: string): Promise<DrivePhotoItem[]> {
  const mainFolderId = extractFolderId(driveLink);
  if (!mainFolderId) return [];
  try {
    const mainFiles = await listFolderViaBackend(mainFolderId);
    const photosFolder = mainFiles.find(
      f => f.mimeType === 'application/vnd.google-apps.folder' && /^photos?$/i.test(f.name),
    );
    if (!photosFolder) return [];
    // Opening a job's photos is the moment they are needed by somebody — make
    // the whole Photos folder link-readable so every picture inside (and every
    // future upload into it) opens without a Google login.
    ensureDriveShared(photosFolder.id);

    const photosContents = await listFolderViaBackend(photosFolder.id);
    const results: DrivePhotoItem[] = [];

    // Files directly under Photos/
    for (const f of photosContents) {
      if (f.mimeType !== 'application/vnd.google-apps.folder') {
        results.push({ fileId: f.id, filename: f.name, mimeType: f.mimeType, folderName: 'Photos' });
      }
    }

    // One level of subfolders (stage names, Task Notes, Job Notes, Contractor Notes, etc.)
    const subFolders = photosContents.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    await Promise.all(subFolders.map(async sf => {
      try {
        const sfFiles = await listFolderViaBackend(sf.id);
        for (const f of sfFiles) {
          if (f.mimeType !== 'application/vnd.google-apps.folder') {
            results.push({ fileId: f.id, filename: f.name, mimeType: f.mimeType, folderName: sf.name });
          }
        }
      } catch { /* skip failing subfolders */ }
    }));

    return results;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Plan markup
// ---------------------------------------------------------------------------

/**
 * Pull a Drive file's actual bytes.
 *
 * The Drive preview iframe can SHOW a plan but nothing in our code can measure
 * or draw on it — a page may not read a cross-origin PDF. To annotate in
 * register with the drawing we need the bytes themselves, and only the service
 * account may read a private file, so the request goes through our own route.
 */
export async function fetchPlanBytes(
  fileId: string,
  onProgress?: (bytes: number, total: number | null) => void,
): Promise<ArrayBuffer> {
  const resp = await fetch('/api/drive-fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': DRIVE_API_KEY },
    body: JSON.stringify({ fileId }),
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => '');
    throw new Error(`Could not open the plan (${resp.status}). ${msg.slice(0, 180)}`);
  }

  /**
   * Read it in chunks so the wait can be shown.
   *
   * A real set is tens of megabytes and takes several seconds on an office
   * connection. Six seconds of an unchanging "Opening the plan…" is
   * indistinguishable from a hang, and people reload — which starts the
   * download again. Counting the bytes costs nothing and turns the wait into
   * something visibly happening.
   */
  if (!resp.body || !onProgress) return resp.arrayBuffer();

  const total = Number(resp.headers.get('Content-Length')) || null;
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.byteLength;
    onProgress(got, total);
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out.buffer;
}

export interface StampedPlan {
  fileId: string;
  name: string;
  webViewLink: string;
  folderId: string;
  version: number;
  sizeBytes: number;
}

/**
 * Stamp a markup onto the plan and file the result in Drive.
 *
 * Only the vector sketch travels — a few kilobytes — and the server does the
 * rest, so this works the same on a 40 MB site plan as on a one-page detail.
 */
export async function stampPlanToDrive(input: {
  planFileId: string;
  parentFolderId: string;
  strokes: unknown[];
  version: number;
  jobName?: string;
  folderName?: string;
  /** Who marked it up — goes in the file name, the layer name and the PDF. */
  author?: string;
}): Promise<StampedPlan> {
  const resp = await fetch('/api/plan-annotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': DRIVE_API_KEY },
    body: JSON.stringify({ folderName: 'Annotated Plans', ...input }),
  });
  const body = await resp.json().catch(() => ({} as Record<string, unknown>));
  if (!resp.ok) throw new Error((body as { error?: string }).error ?? `Save failed (${resp.status})`);
  return body as StampedPlan;
}

/**
 * The plans on a job: the originals, and the markups made from them.
 *
 * Deliberately only ONE level. The Engineered Plans folder often has other
 * subfolders — superseded issues, a contractor's own set, photographs — and
 * pulling PDFs out of all of them would fill the chip row with sheets nobody
 * asked for. Only the folder itself and its "Annotated Plans" child count.
 */
export interface PlanEntry {
  id: string;
  name: string;
  kind: 'original' | 'annotated';
  modifiedTime?: string;
  /**
   * A photograph is a plan too.
   *
   * Plenty of what the office marks up is a phone picture of a riser or a
   * scanned sketch, not a PDF out of a CAD package. Everything downstream is
   * the same — the same tools, the same versions — except that an image has no
   * layers of its own, so the layer switches are simply not offered.
   */
  isImage?: boolean;
}

/** A folder in the job's Drive, for the plan chooser's own browser. */
export interface DriveFolder { id: string; name: string }

/** Every folder under the job's Drive link, one level down, for the picker. */
export async function listFoldersViaBackend(driveLink: string): Promise<DriveFolder[]> {
  const folderId = extractFolderId(driveLink);
  if (!folderId) return [];
  try {
    const files = await listFolderViaBackend(folderId);
    return files
      .filter(f => f.mimeType === FOLDER_MIME)
      .map(f => ({ id: f.id, name: f.name }));
  } catch {
    return [];
  }
}

/** Everything markable in one folder: PDFs and pictures alike. */
export async function listMarkableViaBackend(folderId: string): Promise<PlanEntry[]> {
  try {
    const files = await listFolderViaBackend(folderId);
    return files
      .filter(f => markable(f))
      .map(f => ({
        id: f.id, name: f.name, kind: 'original' as const,
        isImage: isImageFile(f),
      }));
  } catch {
    return [];
  }
}

const isImageFile = (f: { name: string; mimeType: string }) =>
  /^image\//i.test(f.mimeType) || /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(f.name);
const isPdfFile = (f: { name: string; mimeType: string }) =>
  /pdf/i.test(f.mimeType) || /\.pdf$/i.test(f.name);
const markable = (f: { name: string; mimeType: string }) => isPdfFile(f) || isImageFile(f);

/**
 * Everything the chip row needs, from the job's own Drive link.
 *
 * Returns the Engineered Plans folder id as well, because that is where a new
 * markup has to be filed — inside the plans folder, not beside it.
 */
export async function findPlanSetViaBackend(driveLink: string): Promise<{
  plansFolderId: string | null;
  plans: PlanEntry[];
}> {
  const folderId = extractFolderId(driveLink);
  if (!folderId) return { plansFolderId: null, plans: [] };
  try {
    const files = await listFolderViaBackend(folderId);
    const plansFolder = files.find(f => f.mimeType === FOLDER_MIME && isEngineeredPlansFolder(f.name));
    if (plansFolder) {
      // The moment the plans are looked at, the whole Engineered Plans folder
      // becomes link-readable — its files and the Annotated Plans child
      // inherit, so stamped versions never need their own share.
      ensureDriveShared(plansFolder.id);
      const { plans } = await listPlansViaBackend(plansFolder.id);
      return { plansFolderId: plansFolder.id, plans };
    }
    /**
     * No Engineered Plans subfolder: fall back to the job folder itself.
     *
     * Job Board folders are often FLAT — the PDFs sit straight in the job's
     * folder — and requiring the subfolder meant no chips, no folder to file a
     * markup into, and 'why can't I select the plans' from anybody whose
     * folders were organised that way. PDFs in the root become the plan set
     * and markups file into an Annotated Plans child of the same folder.
     */
    const rootPdfs = files.filter(f => f.mimeType === 'application/pdf');
    if (rootPdfs.length) {
      const { plans } = await listPlansViaBackend(folderId);
      return { plansFolderId: folderId, plans };
    }
    return { plansFolderId: null, plans: [] };
  } catch {
    return { plansFolderId: null, plans: [] };
  }
}

/** The subfolders of the plans folder — the picker's tree, one level deep. */
export async function listPlanSubfoldersViaBackend(plansFolderId: string): Promise<DriveFile[]> {
  try {
    const files = await listFolderViaBackend(plansFolderId);
    return files.filter(f => f.mimeType === FOLDER_MIME);
  } catch {
    return [];
  }
}

/** The markable files of ONE folder, as plan entries — what a picked folder
 *  shows as chips. */
export async function listFolderPlansViaBackend(folderId: string): Promise<PlanEntry[]> {
  try {
    const files = await listFolderViaBackend(folderId);
    return files
      .filter(f => markable(f))
      .map(f => ({ id: f.id, name: f.name, kind: 'original' as const, isImage: isImageFile(f) }));
  } catch {
    return [];
  }
}

export async function listPlansViaBackend(plansFolderId: string): Promise<{
  plans: PlanEntry[];
  annotatedFolderId: string | null;
}> {
  const out: PlanEntry[] = [];
  let annotatedFolderId: string | null = null;

  try {
    const top = await listFolderViaBackend(plansFolderId);
    for (const f of top) {
      // Pictures as well as PDFs: a phone photo of a riser is a plan somebody
      // wants to draw on just as much as a drawing out of AutoCAD.
      if (markable(f)) out.push({ id: f.id, name: f.name, kind: 'original', isImage: isImageFile(f) });
    }
    const sub = top.find(f =>
      f.mimeType === 'application/vnd.google-apps.folder'
      && /annotated\s*plans/i.test(f.name));
    if (sub) {
      annotatedFolderId = sub.id;
      const inner = await listFolderViaBackend(sub.id);
      for (const f of inner) {
        if (markable(f)) out.push({ id: f.id, name: f.name, kind: 'annotated', isImage: isImageFile(f) });
      }
    }
  } catch { /* the chips just stay as they were */ }

  // Newest markup first — "annotated version 3" is the one people want.
  out.sort((a, b) => (a.kind === b.kind ? b.name.localeCompare(a.name, undefined, { numeric: true }) : 0));
  return { plans: out, annotatedFolderId };
}
