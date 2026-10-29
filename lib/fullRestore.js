// THE RESTORE (owner, 2026-10-29: "exactly like the backup").
//
// Puts a backup back into the cloud, from the backup preview's "Restore"
// press. Two kinds of file:
//
//  - A FULL backup (lib/fullBackup.js): the whole app becomes exactly as it
//    was: every record the file holds is written back exactly, and every
//    record the cloud has that the file does not is removed — in every
//    workspace and every shared list.
//  - An OLD one-workspace file (wolfson-backup-*.json, before 2026-10-29):
//    only THAT workspace is put back (the file holds nothing else); its
//    activity log and note histories were cut short in those files, so they
//    are only added back, never trimmed to the file.
//
// Before anything is written, a fresh FULL backup of how things are right
// now is saved to Drive — so a restore can itself be taken back.
//
// Left as they are (not app data a person would want rewound): which screens
// are online (tvScreens), phones' push subscriptions (pushSubs), and each
// person's undo list (userUndo — it stays valid: an undo patches fields onto
// whatever the records are now).
//
// Records removed by a restore (jobs, board widgets) are written into that
// workspace's deletion list, so a computer that still holds them in its
// local copy drops them instead of uploading them again.
import { firestoreBase, runFullBackup, gunzipJson, WORKSPACE_COLLECTIONS, GLOBAL_COLLECTIONS } from './fullBackup.js';

const NEVER_RESTORED = new Set(['tvScreens', 'pushSubs', 'userUndo']);
const OLD_CAPPED = new Set(['activityLogs', 'generalNoteVersions', 'stageNoteVersions']);
const TOMBSTONED = ['apartments', 'canvasElements'];
const collName = (ws, base) => (ws === 'wolfson' ? base : `${ws}_${base}`);
const withKey = (url, env) => {
  const key = env.FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY;
  return key ? `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}` : url;
};

// ── plain values → Firestore's typed values (for the old files) ────────────
export function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.filter(x => x !== undefined).map(encodeValue) } };
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v) } };
  return { nullValue: null };
}
export function encodeFields(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = encodeValue(v);
  return out;
}

/** Which workspace an old one-workspace file is: by its buildings. */
export function workspaceOfOldFile(d) {
  const b = new Set((d.apartments ?? []).map(a => a.buildingId));
  if (b.has('G')) return 'general';
  if (b.has('B1') || b.has('B2')) return 'netiv';
  return 'wolfson';
}

/**
 * Read a backup file into one shape: { kind, workspaces, collections (typed),
 * exportedAt, scope }. `scope` lists the collections a restore may touch.
 */
export function normalizeBackup(raw) {
  if (raw?.kind === 'tzviair-full-backup') {
    const scope = Object.keys(raw.collections).filter(c => !NEVER_RESTORED.has(c));
    return { kind: 'full', workspaces: raw.workspaces, exportedAt: raw.exportedAt, collections: raw.collections, scope, trimmed: new Set() };
  }
  if (Array.isArray(raw?.apartments)) {
    const ws = workspaceOfOldFile(raw);
    const collections = {};
    for (const base of WORKSPACE_COLLECTIONS) {
      if (base === 'tombstones' || base === 'boardLayouts') continue;
      const list = Array.isArray(raw[base]) ? raw[base] : null;
      if (!list) continue;
      collections[collName(ws, base)] = list.filter(r => r && typeof r.id === 'string' && r.id)
        .map(r => ({ id: r.id, fields: encodeFields(stripLocal(base, r)) }));
    }
    const scope = Object.keys(collections);
    const trimmed = new Set(scope.filter(c => OLD_CAPPED.has(c.replace(/^[a-z0-9]+_/, ''))));
    return {
      kind: 'old', workspaces: [ws], exportedAt: raw.exportedAt ?? null, collections, scope, trimmed,
      boardSetting: raw.boardSettings?.[ws] ?? null,
    };
  }
  throw new Error('That file is not a TzviAir backup.');
}

/** File bytes are never kept in the cloud (they live in Drive). */
function stripLocal(base, r) {
  const x = { ...r };
  if (base === 'contractorPhotos' || base === 'officeNoteFiles') x.dataUrl = '';
  if (base === 'contractorNotes' || base === 'stageNotes') delete x.attachmentDataUrl;
  return x;
}

async function listIds(base, name, env, fetchImpl) {
  const ids = [];
  let pageToken = '';
  for (let i = 0; i < 1000; i++) {
    const url = withKey(`${base}/${encodeURIComponent(name)}?pageSize=300&mask.fieldPaths=id${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, env);
    const r = await fetchImpl(url);
    if (!r.ok) throw new Error(`read ${name}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    for (const d of j.documents ?? []) ids.push(d.name.split('/').pop());
    pageToken = j.nextPageToken ?? '';
    if (!pageToken) break;
  }
  return ids;
}

/**
 * Send the writes as ordinary commits (what the app's own key may do; the
 * bulk "batchWrite" needs admin rights): at most 400 changes and ~3 MB each.
 */
async function commitWrites(base, writes, env, fetchImpl) {
  const MAX_N = 400, MAX_BYTES = 3_000_000;
  let chunk = [], bytes = 0;
  const send = async () => {
    if (!chunk.length) return;
    const r = await fetchImpl(withKey(`${base}:commit`, env), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: chunk }),
    });
    if (!r.ok) throw new Error(`write: ${r.status} ${(await r.text()).slice(0, 300)}`);
    chunk = []; bytes = 0;
  };
  for (const w of writes) {
    const size = JSON.stringify(w).length;
    if (chunk.length >= MAX_N || (bytes + size > MAX_BYTES && chunk.length)) await send();
    chunk.push(w); bytes += size;
  }
  await send();
}

/** What a restore would do, in numbers — for the question before it. */
export async function planRestore({ backup, env = process.env, fetchImpl = fetch }) {
  const base = firestoreBase(env);
  const docPath = base.replace(/^.*?\/v1\//, '');
  const plan = { put: 0, remove: 0, byCollection: {} , writes: [], removedByWs: {} };
  // What the cloud holds now, every collection at once.
  const haveBy = Object.fromEntries(await Promise.all(backup.scope.map(async name => [name, await listIds(base, name, env, fetchImpl)])));
  for (const name of backup.scope) {
    const want = backup.collections[name] ?? [];
    const wantIds = new Set(want.map(d => d.id));
    const have = haveBy[name];
    const gone = backup.trimmed.has(name) ? [] : have.filter(id => !wantIds.has(id));
    for (const d of want) plan.writes.push({ update: { name: `${docPath}/${name}/${d.id}`, fields: d.fields } });
    for (const id of gone) plan.writes.push({ delete: `${docPath}/${name}/${id}` });
    plan.put += want.length; plan.remove += gone.length;
    plan.byCollection[name] = { put: want.length, remove: gone.length };
    const m = name.match(/^(?:([a-z0-9]+)_)?(apartments|canvasElements)$/);
    if (m && gone.length) (plan.removedByWs[m[1] ?? 'wolfson'] ??= []).push(...gone);
  }
  return plan;
}

/**
 * Restore. Returns what happened, in words the app can show.
 */
export async function runRestore({ drive, fileId, env = process.env, fetchImpl = fetch, now = new Date() }) {
  // 1 · the file
  const got = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
  const buf = Buffer.from(got.data);
  const raw = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipJson(buf) : JSON.parse(buf.toString('utf8'));
  const backup = normalizeBackup(raw);

  // 2 · a backup of how things are right now, before anything changes
  const safety = await runFullBackup({ drive, fetchImpl, env, now, forceFull: true });
  if (!safety.ok || (!safety.file && !safety.skipped)) throw new Error('The safety backup could not be made, so nothing was restored.');

  // 3 · write it back
  const base = firestoreBase(env);
  const docPath = base.replace(/^.*?\/v1\//, '');
  const plan = await planRestore({ backup, env, fetchImpl });
  await commitWrites(base, plan.writes, env, fetchImpl);

  // 4 · what the restore removed stays removed on every computer
  for (const [ws, ids] of Object.entries(plan.removedByWs)) {
    const tombName = collName(ws, 'tombstones');
    const r = await fetchImpl(withKey(`${base}/${tombName}/deleted`, env));
    const cur = r.ok ? ((await r.json()).fields?.ids?.mapValue?.fields ?? {}) : {};
    const stamp = { integerValue: String(now.getTime()) };
    const fields = { ...cur };
    for (const id of ids) fields[id] = stamp;
    await commitWrites(base, [{ update: { name: `${docPath}/${tombName}/deleted`, fields: { ids: { mapValue: { fields } } } }, updateMask: { fieldPaths: ['ids'] } }], env, fetchImpl);
  }

  // 5 · an old file: that workspace's board settings too (one entry of the shared map)
  if (backup.kind === 'old' && backup.boardSetting) {
    const ws = backup.workspaces[0];
    await commitWrites(base, [{
      update: { name: `${docPath}/settings/app`, fields: { boardSettings: { mapValue: { fields: { [ws]: encodeValue(backup.boardSetting) } } } } },
      updateMask: { fieldPaths: [`boardSettings.\`${ws}\``] },
    }], env, fetchImpl);
  }

  return {
    ok: true, kind: backup.kind, workspaces: backup.workspaces, exportedAt: backup.exportedAt,
    put: plan.put, removed: plan.remove, safetyBackup: safety.file ?? null,
  };
}

export { NEVER_RESTORED, GLOBAL_COLLECTIONS };
