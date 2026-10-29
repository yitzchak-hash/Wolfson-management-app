/**
 * BACKUP PREVIEW (owner, 2026-10-29: "when restoring I want to see a preview
 * of exactly what the whole program will look like after the backup … it
 * should open up like a window and be able to click the whole thing").
 *
 * A tab opened at `/?previewBackup=<Drive file id>` runs the WHOLE app on
 * one full backup (lib/fullBackup.js): every workspace, board, widget,
 * notebook, task and setting as it was at that moment, all clickable.
 *
 * It is sealed off, so nothing done in it can land anywhere:
 *  - the cloud is never connected (firebase.ts reads PREVIEW_ID and stays
 *    off: no listener, no write);
 *  - the browser's real storage is swapped for one in memory, so the office's
 *    own copy on this computer is not touched and the preview vanishes with
 *    the tab;
 *  - every request to the app's own server that would change something
 *    (Drive uploads, folders, sharing, sheets…) is refused.
 * Restoring is a separate, deliberate step from the preview's own bar.
 *
 * This file must not import the store or firebase.ts: it runs BEFORE them.
 */

export const PREVIEW_ID: string | null = (() => {
  // The address loses `?previewBackup` as the app moves between pages, so the
  // tab remembers it (this tab only): a reload stays a PREVIEW, never quietly
  // becoming the real app.
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('previewBackup');
    if (fromUrl) window.sessionStorage.setItem('preview_backup_id', fromUrl);
    return fromUrl ?? window.sessionStorage.getItem('preview_backup_id');
  } catch { return null; }
})();

export interface PreviewInfo {
  fileId: string; exportedAt: string; totalDocuments: number; workspaces: string[];
  /** 'full' = every workspace; 'old' = a one-workspace file from before 2026-10-29. */
  kind: 'full' | 'old';
  /** For the question before a restore: what the backup holds, per workspace. */
  counts: Array<{ ws: string; jobs: number; widgets: number; tasks: number }>;
}
let info: PreviewInfo | null = null;
export const previewInfo = () => info;

// ── Firestore's typed values → plain values, as the app holds them ──────────
type Typed = Record<string, unknown>;
export function decodeValue(v: Typed): unknown {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('stringValue' in v) return v.stringValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('arrayValue' in v) return (((v.arrayValue as Typed).values as Typed[]) ?? []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(((v.mapValue as Typed).fields as Record<string, Typed>) ?? {});
  return null;
}
export function decodeFields(fields: Record<string, Typed>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

interface FullBackup {
  kind: string; exportedAt: string; totalDocuments: number; workspaces: string[];
  collections: Record<string, Array<{ id: string; fields: Record<string, Typed> }>>;
}

/** The app's own per-workspace copy, built from the backup — the shape persistNow writes. */
export function snapshotsFromBackup(b: FullBackup, currentUser: unknown): Record<string, unknown> {
  const coll = (name: string) => (b.collections[name] ?? []).map(d => ({ id: d.id, ...decodeFields(d.fields) }));
  const app = (coll('settings').find(d => d.id === 'app') ?? {}) as Record<string, unknown>;
  const boardSettings = (app.boardSettings ?? {}) as Record<string, Record<string, unknown>>;
  const global = {
    currentUser,
    users: coll('users'), stages: coll('stages'), contractors: coll('contractors'), employees: coll('employees'),
    timePunches: coll('timePunches'), workerLevels: coll('workerLevels'), stageSuggestions: coll('stageSuggestions'),
    boardSettings, timeClock: app.timeClock, contractorUiStrings: app.contractorUiStrings, mainUiStrings: app.mainUiStrings,
    boardViews: app.boardViews ?? [], savedReports: app.savedReports ?? {}, projectOrder: app.projectOrder ?? [],
    projectColors: app.projectColors ?? {}, customProjects: app.customProjects ?? [],
    contractorSheetLinks: app.contractorSheetLinks ?? {}, backupLogs: app.backupLogs ?? [],
    autoBackup: false, driveExportFrequency: 'off', backupDriveFolderLink: app.backupDriveFolderLink ?? '',
  };
  const out: Record<string, unknown> = {};
  const layouts: Record<string, unknown[]> = {};
  for (const ws of b.workspaces) layouts[ws] = coll(ws === 'wolfson' ? 'boardLayouts' : `${ws}_boardLayouts`);
  for (const ws of b.workspaces) {
    const c = (base: string) => coll(ws === 'wolfson' ? base : `${ws}_${base}`);
    const key = ws === 'wolfson' ? 'wolfson_app_data' : `${ws}_app_data`;
    const bs = boardSettings[ws] ?? {};
    out[key] = {
      ...global,
      ...(Array.isArray(bs.buildings) ? { buildings: bs.buildings } : {}),
      apartments: c('apartments'), canvasElements: c('canvasElements'),
      contractorAssignments: c('contractorAssignments'), contractorNotes: c('contractorNotes'), contractorPhotos: c('contractorPhotos'),
      stageNotes: c('stageNotes'), stageNoteVersions: c('stageNoteVersions'), generalNoteVersions: c('generalNoteVersions'),
      activityLogs: c('activityLogs').sort((x, y) => String((y as { createdAt?: string }).createdAt ?? '').localeCompare(String((x as { createdAt?: string }).createdAt ?? ''))).slice(0, 500),
      officeNoteFiles: c('officeNoteFiles'), planPins: c('planPins'), planAnnotations: c('planAnnotations'),
      boardLayouts: layouts,
      ...(Array.isArray(bs.dashboardWidgetOrder) ? { dashboardWidgetOrder: bs.dashboardWidgetOrder } : {}),
      ...(Array.isArray(bs.dashboardHiddenWidgets) ? { dashboardHiddenWidgets: bs.dashboardHiddenWidgets } : {}),
    };
  }
  // Personal choices as they were (userPrefs) — the board's zoom, the theme …
  const prefs: Record<string, unknown> = {};
  for (const d of coll('userPrefs')) prefs[d.id] = (d as { prefs?: unknown }).prefs ?? {};
  out.prefs_mirror = prefs;
  return out;
}

/** Browser storage that lives only in this tab's memory. */
function memoryStorage(seed: Record<string, string>): Storage {
  const m = new Map(Object.entries(seed));
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  } as Storage;
}

/**
 * Get the preview tab ready: fetch the backup, build every workspace's copy,
 * swap in the memory-only storage, refuse changing requests. Resolves when
 * the app may start. Throws with a plain message if the backup can't be read.
 */
export async function bootPreview(driveKey: string): Promise<void> {
  if (!PREVIEW_ID) return;
  const r = await fetch(`/api/drive-fetch?id=${encodeURIComponent(PREVIEW_ID)}&k=${encodeURIComponent(driveKey)}`);
  if (!r.ok) throw new Error(`The backup file could not be read from Drive (${r.status}).`);
  let text: string;
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(bytes);
  }
  const parsed = JSON.parse(text) as FullBackup & Record<string, unknown>;
  const isFull = parsed.kind === 'tzviair-full-backup';
  const isOld = !isFull && Array.isArray(parsed.apartments);
  if (!isFull && !isOld) throw new Error('That file is not a TzviAir backup.');

  // Who is looking, and which workspace this computer was on — taken from
  // the real storage BEFORE it is swapped out.
  const real = window.localStorage;
  let currentUser: unknown = null;
  try { currentUser = (JSON.parse(real.getItem('wolfson_app_data') || 'null') as { currentUser?: unknown } | null)?.currentUser ?? null; } catch { /* none */ }
  if (!currentUser) {
    for (let i = 0; i < real.length; i++) {
      const k = real.key(i) ?? '';
      if (!k.endsWith('_app_data')) continue;
      try { currentUser = (JSON.parse(real.getItem(k) || 'null') as { currentUser?: unknown } | null)?.currentUser ?? null; } catch { /* skip */ }
      if (currentUser) break;
    }
  }
  const seed: Record<string, string> = {};
  let workspaces: string[]; let exportedAt: string; let total: number;
  const counts: PreviewInfo['counts'] = [];
  if (isFull) {
    const backup = parsed;
    for (const [k, v] of Object.entries(snapshotsFromBackup(backup, currentUser))) seed[k] = JSON.stringify(v);
    workspaces = backup.workspaces; exportedAt = backup.exportedAt; total = backup.totalDocuments;
    for (const ws of workspaces) {
      const n = (base: string) => (backup.collections[ws === 'wolfson' ? base : `${ws}_${base}`] ?? []).length;
      counts.push({ ws, jobs: n('apartments'), widgets: n('canvasElements'), tasks: n('contractorAssignments') });
    }
    seed.active_project = real.getItem('active_project') ?? 'general';
  } else {
    // An old one-workspace file IS that workspace's copy, in the app's own shape.
    const apts = parsed.apartments as Array<{ buildingId?: string }>;
    const b = new Set(apts.map(a => a.buildingId));
    const ws = b.has('G') ? 'general' : (b.has('B1') || b.has('B2')) ? 'netiv' : 'wolfson';
    seed[ws === 'wolfson' ? 'wolfson_app_data' : `${ws}_app_data`] = JSON.stringify({ ...parsed, currentUser, autoBackup: false, driveExportFrequency: 'off' });
    workspaces = [ws]; exportedAt = String(parsed.exportedAt ?? ''); 
    total = Object.values(parsed).reduce((t: number, v) => t + (Array.isArray(v) ? v.length : 0), 0);
    counts.push({ ws, jobs: apts.length, widgets: (parsed.canvasElements as unknown[] | undefined)?.length ?? 0, tasks: (parsed.contractorAssignments as unknown[] | undefined)?.length ?? 0 });
    seed.active_project = ws;
    // The front page is always the Job Board; a Wolfson or Netiv file opens on its own buildings.
    if (ws !== 'general' && (window.location.pathname === '/' || window.location.pathname === '/jobs')) {
      window.history.replaceState(null, '', '/project');
    }
  }
  for (const ws of workspaces) seed[`${ws}_app_version`] = real.getItem(`${ws}_app_version`) ?? '3';
  seed.wolfson_app_version = real.getItem('wolfson_app_version') ?? '3';
  seed.whats_new_seen = '9999';
  realSession = window.sessionStorage;
  const mem = memoryStorage(seed);
  Object.defineProperty(window, 'localStorage', { value: mem, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: memoryStorage({}), configurable: true });

  // Nothing that changes anything leaves this tab.
  const realFetch = window.fetch.bind(window);
  const READ_ONLY_API = ['/api/drive-fetch', '/api/drive-files', '/api/drive-path', '/api/photos-cover', '/api/geocode'];
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.startsWith('/') ? url : (() => { try { return new URL(url).pathname; } catch { return url; } })();
    if (path.startsWith('/api/') && !READ_ONLY_API.some(p => path.startsWith(p))) {
      return Promise.resolve(new Response(JSON.stringify({ error: 'Preview: nothing is saved' }), { status: 403 }));
    }
    return realFetch(input, init);
  };

  restoreFetch = realFetch;
  info = { fileId: PREVIEW_ID, exportedAt, totalDocuments: total, workspaces, kind: isFull ? 'full' : 'old', counts };
  document.title = `Preview · ${israelTime(exportedAt)} · TzviAir`;
}

/** "29 Oct 2026, 14:28", in Israel time. */
export function israelTime(iso: string): string {
  try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem', dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; }
}

let restoreFetch: typeof fetch | null = null;
let realSession: Storage | null = null;

/**
 * RESTORE this backup into the cloud (lib/fullRestore.js) — the one request a
 * preview tab is allowed to make that changes something, and only from the
 * Restore press after its question. The server saves a backup of how things
 * are right now first.
 */
export async function restoreThisBackup(): Promise<{ ok: boolean; put?: number; removed?: number; safetyBackup?: string | null; error?: string }> {
  if (!info || !restoreFetch) return { ok: false, error: 'Not a preview.' };
  const r = await restoreFetch('/api/drive-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': (import.meta.env.VITE_DRIVE_API_KEY as string | undefined) ?? '' },
    body: JSON.stringify({
      mode: 'full-restore', fileId: info.fileId,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    }),
  });
  const j = await r.json().catch(() => ({ ok: false, error: `The server answered ${r.status}.` }));
  return r.ok ? j : { ok: false, error: j.error ?? `The server answered ${r.status}.` };
}

/** Leave the preview for the real app (this tab stops being a preview). */
export function leavePreview() {
  try { (realSession ?? window.sessionStorage).removeItem('preview_backup_id'); } catch { /* blocked */ }
  // The tab's own storage is the preview's; the real one comes back on a fresh load.
  window.location.replace('/jobs');
}
