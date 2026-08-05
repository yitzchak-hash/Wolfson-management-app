// Streams a Drive file's bytes back to the browser.
//
// This exists because of one hard browser rule: a page cannot read the pixels
// of a cross-origin PDF. Google Drive's preview iframe will happily *show* a
// plan, but nothing in our code can measure it, scale to it, or draw on it in
// register. To annotate a plan we have to hold the actual bytes, and the only
// thing here that is allowed to read a private Drive file is the service
// account. So the file comes through this route.
//
// The response is PIPED, not buffered. A serverless function that builds the
// whole file in memory before replying runs into the platform's response-size
// cap on any real construction drawing; a stream does not.

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

  const { fileId } = req.body || {};
  if (!fileId) return res.status(400).json({ error: 'Missing fileId' });

  try {
    const drive = getDrive();

    const meta = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,size',
      supportsAllDrives: true,
    });

    res.setHeader('Content-Type', meta.data.mimeType || 'application/pdf');
    res.setHeader('X-File-Name', encodeURIComponent(meta.data.name || 'plan.pdf'));
    res.setHeader('Access-Control-Expose-Headers', 'X-File-Name');

    const stream = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' },
    );

    await new Promise((resolve, reject) => {
      stream.data.on('end', resolve);
      stream.data.on('error', reject);
      stream.data.pipe(res);
    });
  } catch (err) {
    console.error('drive-fetch error:', err.message);
    // Headers may already be out the door once piping starts.
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
}
