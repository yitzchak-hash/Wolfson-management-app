// Reads a contractor status spreadsheet with the service account.
//
// The sheet is owned by the contractor. Sharing it with the customer's Google
// Workspace organisation does NOT grant this app access — the service account is
// its own identity and is not a member of that org. The sheet must be shared
// directly with the service account's client_email as Viewer.
//
// Read-only by design: the app can never modify the contractor's sheet.

import { google } from 'googleapis';

function getSheets() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(json),
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  });
  return google.sheets({ version: 'v4', auth });
}

/** Pull the spreadsheet id out of any Google Sheets URL. */
function extractSheetId(url) {
  if (!url) return null;
  const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
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

  const { sheetUrl, sheetId: rawId, tab } = req.body || {};
  const sheetId = rawId || extractSheetId(sheetUrl);
  if (!sheetId) return res.status(400).json({ error: 'Missing or unrecognised sheet URL' });

  try {
    const sheets = getSheets();

    // Discover the tabs so the caller does not have to know the tab name.
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: 'properties.title,sheets.properties.title',
    });
    const tabs = (meta.data.sheets ?? []).map(s => s.properties.title);
    const target = tab && tabs.includes(tab) ? tab : tabs[0];
    if (!target) return res.status(404).json({ error: 'Spreadsheet has no tabs' });

    // UNFORMATTED_VALUE so "60%" arrives as 0.6 rather than a localised string;
    // the client normalises either shape.
    const values = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: target,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });

    res.json({
      title: meta.data.properties?.title ?? '',
      tabs,
      tab: target,
      rows: values.data.values ?? [],
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const status = err?.code === 403 || err?.code === 404 ? 403 : 500;
    console.error('sheet error:', err.message);
    res.status(status).json({
      error: status === 403
        ? 'The service account cannot open this sheet. Share it with the service account email as Viewer.'
        : err.message,
    });
  }
}
