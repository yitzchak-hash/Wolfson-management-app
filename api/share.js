import { google } from 'googleapis';

function getAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(json),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
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

  const { fileId } = req.body ?? {};
  if (!fileId) return res.status(400).json({ error: 'fileId required' });

  try {
    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('share error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
