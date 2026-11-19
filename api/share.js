import { google } from 'googleapis';
import { isSharedRequest, handleShared } from '../lib/sharedView.js';

function getAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(json),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

export default async function handler(req, res) {
  // The outside SHARED VIEW (/s/<token>) lives in lib/sharedView.js and is reached through this file with
  // ?sv=data|media|photos|file|pin|pinfile — /api may hold only 12 files and already does. It answers before anything below:
  // no CORS, no office API key, its own token check (owner, 2026-11-18).
  if (isSharedRequest(req)) return handleShared(req, res);

  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.API_KEY || req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { fileId } = req.body ?? {};
  if (!fileId) return res.status(400).json({ error: 'fileId required' });

  try {
    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });
    // supportsAllDrives is load-bearing: the company's plans live on a SHARED
    // drive, and without it the permissions call answers "file not found" for
    // every file there — the share silently never happens.
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('share error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
