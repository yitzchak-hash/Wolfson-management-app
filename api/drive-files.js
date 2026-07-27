// Lists files inside a Drive folder using the service account.
// Used for PDF auto-detection and folder health checks — no user OAuth needed.

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.API_KEY || req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { folderId, metaOnly } = req.body;
  if (!folderId) return res.status(400).json({ error: 'Missing folderId' });

  try {
    const drive = getDrive();

    // metaOnly: return just the folder's own metadata (used to derive the family
    // name from the folder title) without listing its children.
    if (metaOnly) {
      const meta = await drive.files.get({
        fileId: folderId,
        fields: 'id,name,mimeType',
        supportsAllDrives: true,
      });
      return res.json({ folder: meta.data, files: [] });
    }

    const resp = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType)',
      pageSize: '50',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    res.json({ files: resp.data.files ?? [] });
  } catch (err) {
    console.error('drive-files error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
