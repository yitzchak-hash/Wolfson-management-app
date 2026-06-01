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
  if (req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { folderId, filename, mimeType } = req.body;
  if (!folderId || !filename || !mimeType) {
    return res.status(400).json({ error: 'Missing folderId, filename, or mimeType' });
  }

  try {
    const auth = getAuth();
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    // Initiate a resumable upload session — browser will upload the file directly to this URL
    const initResp = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': mimeType,
        },
        body: JSON.stringify({ name: filename, parents: [folderId] }),
      }
    );

    if (!initResp.ok) {
      const err = await initResp.text();
      return res.status(500).json({ error: `Drive session init failed: ${err}` });
    }

    const uploadUrl = initResp.headers.get('location');
    if (!uploadUrl) return res.status(500).json({ error: 'No upload URL returned from Drive' });

    res.json({ uploadUrl });
  } catch (err) {
    console.error('drive-session error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
