// THE FULL BACKUP (owner, 2026-10-29: "every little tiny thing … all
// workspaces … including everything in the job board placement and widget
// data — all all all ALL").
//
// One file holds the WHOLE cloud as it stands: every workspace (Wolfson, the
// Job Board, Netiv and any added one) and every collection in each — jobs and
// flats with their ticks, notes and board positions, every widget and its data
// (pin boards, notebooks, maps…), tasks, worker notes and photos' records,
// plan pins and markups, stage notes and their versions, the activity log,
// deletions on record — plus everything shared: stages, users, workers,
// employees and time punches, levels, suggestions, and settings/app (board
// settings of every workspace, buttons, layouts, TV settings…).
//
// Each document is kept EXACTLY as Firestore holds it (typed fields and its
// last-changed time), so a restore can put it back byte for byte.
//
// Cost-aware (the read bill broke the free tier once, 2026-09-22): a complete
// read happens at most once a day; in between, the newest backup file is taken
// from Drive and only documents changed since it (`_updatedAt`) are read, so a
// backup after a few ticks costs a few reads, not 6,500. Small shared
// collections and the deletion lists are re-read whole each time. Something
// deleted without a deletion record (a task, a note) leaves the file at the
// next complete read — the file says when that was (`fullReadAt`).
//
// Files: Backups/<name>-<UTC>.json.gz next to the per-workspace backups.
// Nothing is ever deleted from Drive here.
import zlib from 'zlib';

export const FILE_PREFIX = 'tzviair-full-backup-';
const FULL_EVERY_MS = 24 * 3600_000;
const MIN_GAP_MS = 20 * 60_000;           // never two backups within 20 minutes

/** Per-workspace collections (Wolfson bare, others `<id>_<name>`). */
export const WORKSPACE_COLLECTIONS = [
  'apartments', 'canvasElements', 'contractorAssignments', 'contractorNotes', 'contractorPhotos',
  'stageNotes', 'stageNoteVersions', 'generalNoteVersions', 'activityLogs', 'officeNoteFiles',
  'planPins', 'planAnnotations', 'tombstones',
];
/** Shared by every workspace — small, re-read whole every time. */
export const GLOBAL_COLLECTIONS = [
  'settings', 'stages', 'users', 'contractors', 'employees', 'timePunches', 'workerLevels',
  'stageSuggestions', 'tvScreens', 'pushSubs',
];
const BUILT_IN_WORKSPACES = ['wolfson', 'general', 'netiv'];
const collName = (ws, base) => (ws === 'wolfson' ? base : `${ws}_${base}`);

export function firestoreBase(env = process.env) {
  if (env.FIRESTORE_REST_BASE) return env.FIRESTORE_REST_BASE;           // tests: the emulator
  const project = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID;
  if (!project) throw new Error('Firebase project id is not set');
  return `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
}
const withKey = (url, env = process.env) => {
  const key = env.FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY;
  return key ? `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}` : url;
};

/** Every document of a collection. A refused collection is reported, not fatal. */
async function readAll(base, name, fetchImpl) {
  const docs = [];
  let pageToken = '';
  for (let i = 0; i < 1000; i++) {
    const url = withKey(`${base}/${encodeURIComponent(name)}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    const r = await fetchImpl(url);
    if (r.status === 403 || r.status === 401) return { docs: [], refused: true };
    if (!r.ok) throw new Error(`read ${name}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    for (const d of j.documents ?? []) docs.push(slim(d));
    pageToken = j.nextPageToken ?? '';
    if (!pageToken) break;
  }
  return { docs, refused: false };
}

/** Only the documents changed at or after `sinceIso` (by `_updatedAt`). */
async function readChanged(base, name, sinceIso, fetchImpl) {
  const r = await fetchImpl(withKey(`${base}:runQuery`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: name }],
      where: { fieldFilter: { field: { fieldPath: '_updatedAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: sinceIso } } },
    } }),
  });
  if (r.status === 403 || r.status === 401) return { docs: [], refused: true };
  if (!r.ok) throw new Error(`query ${name}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const rows = await r.json();
  return { docs: rows.filter(x => x.document).map(x => slim(x.document)), refused: false };
}

const slim = d => ({ id: d.name.split('/').pop(), updateTime: d.updateTime, fields: d.fields ?? {} });

/** The workspaces: the built-in three and every added one (settings/app → customProjects). */
export function workspacesOf(settingsDocs) {
  const app = settingsDocs.find(d => d.id === 'app');
  const custom = app?.fields?.customProjects?.arrayValue?.values ?? [];
  const ids = custom.map(v => v.mapValue?.fields?.id?.stringValue).filter(Boolean);
  return [...new Set([...BUILT_IN_WORKSPACES, ...ids])];
}

/** Ids a workspace deleted on purpose (its tombstones/deleted doc). */
function tombstonedIds(tombDocs) {
  const d = tombDocs.find(x => x.id === 'deleted');
  return new Set(Object.keys(d?.fields?.ids?.mapValue?.fields ?? {}));
}

/**
 * Build the backup. `previous` is the newest backup file's content (or null).
 * Returns { backup, mode, changed } — changed=false means nothing moved since
 * `previous`, and no new file is needed.
 */
export async function buildFullBackup({ previous, now = new Date(), fetchImpl = fetch, env = process.env, forceFull = false }) {
  const base = firestoreBase(env);
  const nowIso = now.toISOString();
  const incremental = !forceFull && previous?.kind === 'tzviair-full-backup' && previous.version === 1
    && now.getTime() - new Date(previous.fullReadAt).getTime() < FULL_EVERY_MS;
  // A little overlap: a write stamped just before the last file was cut is read again (harmless).
  const since = incremental ? new Date(new Date(previous.exportedAt).getTime() - 5 * 60_000).toISOString() : null;

  const collections = {};
  const refused = [];
  let changes = 0;

  // Shared collections — whole, every time.
  await Promise.all(GLOBAL_COLLECTIONS.map(async name => {
    const { docs, refused: no } = await readAll(base, name, fetchImpl);
    if (no) { refused.push(name); if (previous?.collections?.[name]) collections[name] = previous.collections[name]; return; }
    collections[name] = docs;
  }));
  const workspaces = workspacesOf(collections.settings ?? []);

  // Workspace collections — whole on a complete read, changed-only otherwise.
  await Promise.all(workspaces.flatMap(ws => WORKSPACE_COLLECTIONS.map(async b => {
    const name = collName(ws, b);
    if (!incremental || b === 'tombstones' || !previous.collections?.[name]) {
      const { docs, refused: no } = await readAll(base, name, fetchImpl);
      if (no) { refused.push(name); if (previous?.collections?.[name]) collections[name] = previous.collections[name]; return; }
      collections[name] = docs;
      return;
    }
    const { docs, refused: no } = await readChanged(base, name, since, fetchImpl);
    if (no) { refused.push(name); collections[name] = previous.collections[name]; return; }
    const byId = new Map(previous.collections[name].map(d => [d.id, d]));
    for (const d of docs) {
      const old = byId.get(d.id);
      if (!old || old.updateTime !== d.updateTime) { byId.set(d.id, d); changes++; }
    }
    collections[name] = [...byId.values()];
  })));

  // What each workspace deleted on purpose is not kept (jobs, widgets).
  for (const ws of workspaces) {
    const gone = tombstonedIds(collections[collName(ws, 'tombstones')] ?? []);
    if (!gone.size) continue;
    for (const b of ['apartments', 'canvasElements']) {
      const name = collName(ws, b);
      if (!collections[name]) continue;
      const before = collections[name].length;
      collections[name] = collections[name].filter(d => !gone.has(d.id));
      if (collections[name].length !== before) changes++;
    }
  }

  // Did anything at all move since the previous file? (the whole-read ones too)
  if (incremental) {
    const sig = c => (c ?? []).map(d => `${d.id}@${d.updateTime}`).sort().join('|');
    for (const name of Object.keys(collections)) {
      if (sig(collections[name]) !== sig(previous.collections?.[name])) { changes++; break; }
    }
  }

  const counts = Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, v.length]).sort());
  const backup = {
    kind: 'tzviair-full-backup',
    version: 1,
    exportedAt: nowIso,
    fullReadAt: incremental ? previous.fullReadAt : nowIso,
    mode: incremental ? 'changes-since-previous' : 'complete-read',
    basedOn: incremental ? previous.exportedAt : null,
    workspaces,
    refused,                       // collections the cloud would not let us read (kept from the previous file)
    counts,
    totalDocuments: Object.values(counts).reduce((a, b) => a + b, 0),
    collections,                   // name → [{ id, updateTime, fields (Firestore-typed) }]
  };
  return { backup, mode: backup.mode, changed: !incremental || changes > 0 };
}

export const gzipJson = obj => zlib.gzipSync(Buffer.from(JSON.stringify(obj)));
export const gunzipJson = buf => JSON.parse(zlib.gunzipSync(buf).toString('utf8'));

/** Backups folder: the one the app's per-workspace backups use (settings/app → backupDriveFolderLink → "Backups"). */
export async function backupsFolderId(drive, settingsDocs) {
  const link = settingsDocs.find(d => d.id === 'app')?.fields?.backupDriveFolderLink?.stringValue ?? '';
  const parent = link.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!parent) throw new Error('No backup Drive folder is set in Settings');
  const r = await drive.files.list({
    q: `name = 'Backups' and '${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  if (r.data.files?.length) return r.data.files[0].id;
  const made = await drive.files.create({
    requestBody: { name: 'Backups', mimeType: 'application/vnd.google-apps.folder', parents: [parent] },
    fields: 'id', supportsAllDrives: true,
  });
  return made.data.id;
}

/** The newest full-backup file in the folder (name sorts by time). */
export async function newestFullBackup(drive, folderId) {
  const r = await drive.files.list({
    q: `'${folderId}' in parents and name contains '${FILE_PREFIX}' and trashed = false`,
    orderBy: 'name desc', pageSize: 1, fields: 'files(id,name,createdTime)',
    supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  return r.data.files?.[0] ?? null;
}

/**
 * The whole run: find the folder and the newest file, build, upload.
 * Returns what happened, in a form the app can log.
 */
export async function runFullBackup({ drive, fetchImpl = fetch, env = process.env, now = new Date(), forceFull = false }) {
  // settings/app is read twice (here for the folder, and in the build) — one document.
  const { docs: settingsDocs } = await readAll(firestoreBase(env), 'settings', fetchImpl);
  const folderId = await backupsFolderId(drive, settingsDocs);
  const newest = await newestFullBackup(drive, folderId);
  if (newest && now.getTime() - new Date(newest.createdTime).getTime() < MIN_GAP_MS && !forceFull) {
    return { ok: true, skipped: 'a full backup was made less than 20 minutes ago', file: newest.name };
  }
  let previous = null;
  if (newest) {
    try {
      const got = await drive.files.get({ fileId: newest.id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
      previous = gunzipJson(Buffer.from(got.data));
    } catch (e) {
      console.warn('full backup: previous file unreadable, doing a complete read:', e.message);
    }
  }
  const { backup, mode, changed } = await buildFullBackup({ previous, now, fetchImpl, env, forceFull });
  if (!changed) return { ok: true, skipped: 'nothing changed since the last full backup', file: newest?.name };
  const name = `${FILE_PREFIX}${backup.exportedAt.replace(/[:.]/g, '-').slice(0, 19)}Z.json.gz`;
  const body = gzipJson(backup);
  const { Readable } = await import('stream');
  const made = await drive.files.create({
    requestBody: { name, parents: [folderId], description: `TzviAir full backup — ${backup.totalDocuments} records, ${backup.workspaces.length} workspaces (${mode})` },
    media: { mimeType: 'application/gzip', body: Readable.from(body) },
    fields: 'id', supportsAllDrives: true,
  });
  return { ok: true, file: name, fileId: made.data.id, mode, totalDocuments: backup.totalDocuments, sizeKB: Math.round(body.length / 1024), refused: backup.refused };
}
