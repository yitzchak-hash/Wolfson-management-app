// Uploads a file to Google Drive using the service account.
// Accepts base64-encoded file data in the request body.
// This avoids browser CORS restrictions on direct Drive PUT requests.

import { google } from 'googleapis';
import { Readable } from 'stream';
import { runFullBackup, listFullBackups } from '../lib/fullBackup.js';

function getDrive() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(json),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  /**
   * THE FULL BACKUP (lib/fullBackup.js) rides on this function — the plan
   * allows 12 files in /api and all 12 are taken. Two ways in:
   *  - GET ?fullBackup=1 — the nightly schedule (vercel.json "crons"). When
   *    CRON_SECRET is set, Vercel sends it and nothing else may call; either
   *    way a run within 20 minutes of the last one does nothing.
   *  - POST { mode: 'full-backup' } with the app's key — the open app, after
   *    activity, like the per-workspace backups.
   */
  // The Settings list of full backups (newest first) — the app's key required.
  if (req.method === 'GET' && req.query?.listFullBackups) {
    if (!process.env.API_KEY || req.headers['x-api-key'] !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const env = {
        ...process.env,
        ...(!process.env.VITE_FIREBASE_PROJECT_ID && /^[a-z0-9-]{4,40}$/.test(String(req.query.projectId ?? '')) ? { VITE_FIREBASE_PROJECT_ID: String(req.query.projectId) } : {}),
        ...(!process.env.VITE_FIREBASE_API_KEY && /^[A-Za-z0-9_-]{20,60}$/.test(String(req.query.apiKey ?? '')) ? { VITE_FIREBASE_API_KEY: String(req.query.apiKey) } : {}),
      };
      return res.json({ files: await listFullBackups({ drive: getDrive(), env }) });
    } catch (err) {
      console.error('list full backups error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  const wantsFull = (req.method === 'GET' && req.query?.fullBackup) || (req.method === 'POST' && req.body?.mode === 'full-backup');
  if (wantsFull) {
    if (req.method === 'GET') {
      if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    } else if (!process.env.API_KEY || req.headers['x-api-key'] !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      // The app sends its own (public, already in the page) Firebase project
      // and web key as a fallback for a server that has none set.
      const b = req.method === 'POST' ? req.body : {};
      const env = {
        ...process.env,
        ...(!process.env.VITE_FIREBASE_PROJECT_ID && /^[a-z0-9-]{4,40}$/.test(b.projectId ?? '') ? { VITE_FIREBASE_PROJECT_ID: b.projectId } : {}),
        ...(!process.env.VITE_FIREBASE_API_KEY && /^[A-Za-z0-9_-]{20,60}$/.test(b.apiKey ?? '') ? { VITE_FIREBASE_API_KEY: b.apiKey } : {}),
      };
      const out = await runFullBackup({ drive: getDrive(), env, forceFull: req.method === 'GET' });
      return res.json(out);
    } catch (err) {
      console.error('full backup error:', err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.API_KEY || req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { folderId, filename, mimeType, data } = req.body;
  if (!folderId || !filename || !mimeType || !data) {
    return res.status(400).json({ error: 'Missing folderId, filename, mimeType, or data' });
  }

  try {
    const drive = getDrive();
    const buffer = Buffer.from(data, 'base64');
    const stream = Readable.from(buffer);

    const result = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: 'id,webViewLink',
      supportsAllDrives: true,
    });

    res.json({
      fileId: result.data.id,
      webViewLink: result.data.webViewLink ?? `https://drive.google.com/file/d/${result.data.id}/view`,
    });
  } catch (err) {
    console.error('drive-upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
