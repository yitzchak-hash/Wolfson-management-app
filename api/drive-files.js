// Lists files inside a Drive folder using the service account.
// Used for PDF auto-detection and folder health checks — no user OAuth needed.

import { google } from 'googleapis';

/** Folder → its parents, kept across warm invocations (a folder's parent never changes underneath us in practice). */
const PARENT_CACHE = new Map();

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
      const files = [];
      let pageToken;
      for (let page = 0; page < 5; page++) {
        const resp = await drive.files.list({
          q: `modifiedTime > '${since}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
          fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,parents)',
          orderBy: 'modifiedTime desc',
          pageSize: 200,
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          corpora: 'allDrives',
        });
        for (const f of resp.data.files ?? []) files.push(f);
        pageToken = resp.data.nextPageToken;
        if (!pageToken) break;
      }
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
      let lookups = 0;
      const out = [];
      for (const f of files) {
        const ancestors = [];
        let level = f.parents ?? [];
        for (let depth = 0; depth < 3 && level.length; depth++) {
          ancestors.push(...level);
          const next = [];
          for (const pid of level) {
            if (!PARENT_CACHE.has(pid)) { if (lookups >= 400) break; lookups++; }
            next.push(...await parentOf(pid));
          }
          level = next;
        }
        out.push({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, ancestors: [...new Set(ancestors)] });
      }
      return res.json({ files: out, since });
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
