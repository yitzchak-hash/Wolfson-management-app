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

// A header off a googleapis response, whichever shape its client hands back
// (a plain object of lowercased names, or a fetch-style Headers).
function headerOf(r, name) {
  const h = r && r.headers;
  if (!h) return null;
  if (typeof h.get === 'function') return h.get(name);
  return h[name] ?? h[name.toLowerCase()] ?? null;
}

/**
 * GET ?id=<fileId>&k=<key> — the same bytes as a STREAM a <video> can play
 * while it downloads. The browser's Range header is passed straight to Drive
 * (alt=media honours it), and Drive's 206 / Content-Range come back, so a
 * film starts after its first chunk and a seek asks for just the part it
 * needs. A 51-second site film used to download whole into a blob before a
 * frame showed (owner, 2026-10-05: "it takes forever"). The key rides in the
 * query because a <video> cannot send a header — it is the same key the
 * public bundle carries.
 */
async function streamGet(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const fileId = q.id;
  if (!process.env.API_KEY || q.k !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!fileId) return res.status(400).json({ error: 'Missing id' });
  try {
    const drive = getDrive();
    const meta = await drive.files.get({ fileId, fields: 'id,name,mimeType,size', supportsAllDrives: true });
    const range = req.headers.range;
    const r = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream', ...(range ? { headers: { Range: range } } : {}) },
    );
    const partial = r.status === 206;
    res.statusCode = partial ? 206 : 200;
    res.setHeader('Content-Type', meta.data.mimeType || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const contentRange = headerOf(r, 'content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    const len = headerOf(r, 'content-length') || (!partial && meta.data.size ? String(meta.data.size) : null);
    if (len) res.setHeader('Content-Length', len);
    await new Promise((resolve, reject) => {
      r.data.on('end', resolve);
      r.data.on('error', reject);
      // A viewer that closes mid-film stops reading; stop pulling from Drive too.
      res.on('close', () => { try { r.data.destroy(); } catch { /* already done */ } resolve(); });
      r.data.pipe(res);
    });
  } catch (err) {
    console.error('drive-fetch stream error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Range');
  res.setHeader('Access-Control-Expose-Headers', 'X-File-Name, Content-Range, Accept-Ranges');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return streamGet(req, res);
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
