// Lists files inside a Drive folder using the service account.
// Used for PDF auto-detection and folder health checks — no user OAuth needed.

import { google } from 'googleapis';

/** Folder → its parents, kept across warm invocations (a folder's parent never changes underneath us in practice). */
const PARENT_CACHE = new Map();

/**
 * Which JOB folder each changed file lives under.
 *
 * The first version walked every file's parents one lookup at a time, three
 * levels deep, up to 400 lookups a call — on a busy Drive that is half a
 * minute of sequential round trips, well past a Hobby function's limit, so
 * the call timed out and the app never got an answer (silently: a 504 is
 * "not ok" and the client just tries again next tick). Now:
 *  - the caller sends the job folder ids it KNOWS (`known`), so a chain stops
 *    the moment it meets one — most files sit directly in the job folder or
 *    one level under it (Photos, Engineered Plans);
 *  - resolution is breadth-first across ALL files, so a folder is looked up
 *    once however many files it holds, and lookups run in parallel chunks;
 *  - a time budget ends the walk early and says so (`partial`), rather than
 *    letting the platform kill the function with nothing returned.
 * Pure — the Drive client is handed in as `parentOf` — so it is tested
 * offline (scratchpad/driverecent-test.mjs).
 */
export async function resolveJobFolders(files, known, parentOf, opts = {}) {
  const depth = opts.depth ?? 5;
  const budgetMs = opts.budgetMs ?? 6500;
  const chunk = opts.chunk ?? 12;
  const cache = opts.cache ?? new Map();
  const t0 = Date.now();
  // Per file: the frontier of folder ids still to climb from, and every
  // ancestor seen so far.
  const rows = files.map(f => ({
    id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, createdTime: f.createdTime,
    who: f.lastModifyingUser?.displayName ?? f.who ?? undefined, removed: !!f.removed,
    frontier: [...(f.parents ?? [])], ancestors: [...(f.parents ?? [])], jobFolder: null,
  }));
  const settle = r => { if (!r.jobFolder) { const hit = r.ancestors.find(a => known.has(a)); if (hit) r.jobFolder = hit; } };
  rows.forEach(settle);
  let partial = false;
  for (let level = 0; level < depth; level++) {
    const open = rows.filter(r => !r.jobFolder && r.frontier.length);
    if (!open.length) break;
    // Every folder any open file still needs, once.
    const need = [...new Set(open.flatMap(r => r.frontier))].filter(id => !cache.has(id));
    for (let i = 0; i < need.length; i += chunk) {
      if (Date.now() - t0 > budgetMs) { partial = true; break; }
      await Promise.all(need.slice(i, i + chunk).map(id => parentOf(id)));
    }
    if (partial) break;
    for (const r of open) {
      const next = [];
      for (const id of r.frontier) for (const p of (cache.get(id) ?? [])) if (!r.ancestors.includes(p)) { r.ancestors.push(p); next.push(p); }
      r.frontier = next;
      settle(r);
    }
  }
  return {
    partial,
    files: rows.map(r => ({ id: r.id, name: r.name, mimeType: r.mimeType, modifiedTime: r.modifiedTime, createdTime: r.createdTime, who: r.who, removed: r.removed, ancestors: r.ancestors, jobFolder: r.jobFolder })),
  };
}

function getDrive() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(json),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.API_KEY || req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { folderId, metaOnly, recent } = req.body;
  if (!folderId && !recent) return res.status(400).json({ error: 'Missing folderId' });

  try {
    const drive = getDrive();
    const SHORTCUT = 'application/vnd.google-apps.shortcut';

    /**
     * RECENT ACTIVITY (owner, 2026-09-07: the Active-jobs widget "should check
     * every hour the latest activity in the drive folders"): every file
     * changed since `since`, anywhere the service account can see, each with
     * its ANCESTOR folders (three levels) so the app can tell which job's
     * folder it lives in — a photo lands in Job/Photos, a plan in
     * Job/Engineered Plans/Annotated Plans. One list call plus parent lookups
     * cached across warm invocations; never a walk of every job folder.
     */
    if (recent) {
      const since = new Date(recent.since || Date.now() - 30 * 86400000).toISOString();
      const known = new Set(Array.isArray(recent.folders) ? recent.folders.filter(x => typeof x === 'string') : []);
      const files = [];
      /**
       * Two lists: what changed, and what was REMOVED (a proposal taken out
       * of a job folder is work on that job — the approved plan). Each file
       * also says who last touched it, which is the name the widget shows.
       */
      const listRecent = async (trashed, pages) => {
        let pageToken;
        for (let page = 0; page < pages; page++) {
          const resp = await drive.files.list({
            q: `modifiedTime > '${since}' and trashed = ${trashed} and mimeType != 'application/vnd.google-apps.folder'`,
            fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,parents,lastModifyingUser(displayName))',
            orderBy: 'modifiedTime desc',
            pageSize: 200,
            pageToken,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            corpora: 'allDrives',
          });
          for (const f of resp.data.files ?? []) files.push({ ...f, removed: trashed });
          pageToken = resp.data.nextPageToken;
          if (!pageToken) break;
        }
      };
      await listRecent(false, 8);
      try { await listRecent(true, 2); } catch (e) { console.warn('drive-files recent (trashed):', e.message); }
      const parentOf = async id => {
        if (PARENT_CACHE.has(id)) return PARENT_CACHE.get(id);
        if (PARENT_CACHE.size > 5000) PARENT_CACHE.clear();
        let parents = [];
        try {
          const meta = await drive.files.get({ fileId: id, fields: 'parents', supportsAllDrives: true });
          parents = meta.data.parents ?? [];
        } catch { parents = []; }
        PARENT_CACHE.set(id, parents);
        return parents;
      };
      const { files: out, partial } = await resolveJobFolders(files, known, parentOf, { cache: PARENT_CACHE });
      return res.json({ files: out, since, partial });
    }

    // metaOnly: return just the folder's own metadata (used to derive the family
    // name from the folder title) without listing its children.
    if (metaOnly) {
      const meta = await drive.files.get({
        fileId: folderId,
        fields: 'id,name,mimeType,shortcutDetails',
        supportsAllDrives: true,
      });
      return res.json({ folder: meta.data, files: [] });
    }

    /**
     * SHORTCUTS are resolved, here on the server, so the whole client stays
     * shortcut-blind. Folders organised through a second tree (the office's
     * "Leads" beside "Potentials") often hold shortcuts rather than the real
     * folders, and a shortcut has NO children — listing one answers an empty
     * folder while the Drive UI cheerfully shows the target's contents. The
     * asked-for folder is resolved to its target before listing, and every
     * shortcut CHILD is presented as its target (target id and type, the
     * shortcut's own name), so "Engineered Plans" matches whether it is the
     * folder or a pointer to it.
     */
    let listId = folderId;
    const self = await drive.files.get({
      fileId: folderId,
      fields: 'id,mimeType,shortcutDetails',
      supportsAllDrives: true,
    });
    if (self.data.mimeType === SHORTCUT && self.data.shortcutDetails?.targetId) {
      listId = self.data.shortcutDetails.targetId;
    }

    // Paginated: 50 with no follow-up silently truncated a Photos folder on
    // its 51st picture — the kind of half-failure nobody reports as broken.
    // Up to 5,000 entries: the Potentials folder the Drive sweep watches
    // holds well over a thousand client folders, and the old 1,000 ceiling
    // silently left the rest out of the sweep.
    const files = [];
    let pageToken;
    for (let page = 0; page < 25; page++) {
      const resp = await drive.files.list({
        q: `'${listId}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,mimeType,shortcutDetails)',
        pageSize: 200,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of resp.data.files ?? []) {
        files.push(f.mimeType === SHORTCUT && f.shortcutDetails?.targetId
          ? { id: f.shortcutDetails.targetId, name: f.name, mimeType: f.shortcutDetails.targetMimeType || f.mimeType }
          : { id: f.id, name: f.name, mimeType: f.mimeType });
      }
      pageToken = resp.data.nextPageToken;
      if (!pageToken) break;
    }
    res.json({ files });
  } catch (err) {
    console.error('drive-files error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
