// Uploads a file to Google Drive using the service account.
// Accepts base64-encoded file data in the request body.
// This avoids browser CORS restrictions on direct Drive PUT requests.

import { google } from 'googleapis';
import { Readable } from 'stream';

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
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
