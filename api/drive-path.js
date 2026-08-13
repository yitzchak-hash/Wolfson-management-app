// Where a Drive folder sits, as a path from the top of its drive.
//
// The app stores a folder ID; Google Drive for desktop presents a folder as a
// PATH on the machine. Turning one into the other means walking the chain of
// parents up to the drive, which only the API can do — a folder ID carries no
// hint of where it lives.
//
// Only the part inside the drive is worked out here. The part in front of it —
// the drive letter on Windows, or the CloudStorage folder carrying the signed-in
// user's own email on a Mac — is different on every machine and is a setting on
// each of them, never a server's business.

import { google } from 'googleapis';

function getDrive() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(json),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Folder id → its path, cached.
 *
 * A folder four deep costs four round trips, every job opened asks for one,
 * and the answer only changes if somebody renames a folder — so caching it is
 * the difference between a button that answers instantly and one that takes a
 * second every time. In memory, so a deploy clears it, which is a reasonable
 * upper bound on how stale a rename can leave it.
 */
const CACHE = new Map();
const CACHE_MAX = 400;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.API_KEY || req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const folderId = String(body.folderId || '').trim();
  if (!folderId) return res.status(400).json({ error: 'Missing folderId' });

  if (CACHE.has(folderId)) {
    return res.status(200).json({ ...CACHE.get(folderId), cached: true });
  }

  try {
    const drive = getDrive();
    const segments = [];
    let driveId = null;
    let id = folderId;

    // Up the chain, one folder at a time. Bounded: a Drive folder cannot
    // legitimately be twenty deep, and an unbounded loop against somebody
    // else's data is a hang waiting to happen.
    for (let depth = 0; depth < 20 && id; depth++) {
      const { data } = await drive.files.get({
        fileId: id,
        fields: 'id,name,parents,driveId',
        supportsAllDrives: true,
      });
      driveId = driveId ?? data.driveId ?? null;

      // The shared drive's own root reports itself with the drive's id. It is
      // not a folder inside the drive, so it must not become a path segment —
      // that would give "Shared drives/TzviAir/TzviAir/Wolfson".
      if (data.id === driveId) break;

      segments.unshift(data.name);
      const parent = data.parents?.[0];
      if (!parent) break;
      id = parent;
    }

    let driveName = null;
    if (driveId) {
      try {
        const d = await drive.drives.get({ driveId, fields: 'name' });
        driveName = d.data.name ?? null;
      } catch {
        // A drive we cannot name is still a drive we can walk. The caller can
        // fall back to asking for the whole root rather than composing one.
      }
    }

    const out = { segments, driveName, inSharedDrive: !!driveId };
    if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(folderId, out);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
