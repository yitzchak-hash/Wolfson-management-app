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

export interface PreviewInfo { fileId: string; exportedAt: string; totalDocuments: number; workspaces: string[] }
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
  const backup = JSON.parse(text) as FullBackup;
  if (backup.kind !== 'tzviair-full-backup') throw new Error('That file is not a full backup.');

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
  for (const [k, v] of Object.entries(snapshotsFromBackup(backup, currentUser))) seed[k] = JSON.stringify(v);
  for (const ws of backup.workspaces) seed[`${ws}_app_version`] = real.getItem(`${ws}_app_version`) ?? '3';
  seed.wolfson_app_version = real.getItem('wolfson_app_version') ?? '3';
  seed.active_project = real.getItem('active_project') ?? 'general';
  seed.whats_new_seen = '9999';
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

  info = { fileId: PREVIEW_ID, exportedAt: backup.exportedAt, totalDocuments: backup.totalDocuments, workspaces: backup.workspaces };
  document.title = `PREVIEW ${backup.exportedAt.slice(0, 16).replace('T', ' ')} — TzviAir`;
}
