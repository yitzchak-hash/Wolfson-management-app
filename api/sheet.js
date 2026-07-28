// Reads a contractor status spreadsheet with the service account.
//
// Sharing the sheet with the customer's Google Workspace organisation does NOT
// grant this app access — the service account is its own identity and is not a
// member of that org. The sheet must be shared directly with the service
// account's client_email as Viewer. Read-only by design.
//
// TWO SOURCE SHAPES ARE SUPPORTED, because the two projects' contractors keep
// very different files:
//
//   1. A native Google Sheet (Netiv) — values carry the meaning (percentages),
//      read through the Sheets API.
//   2. An .xlsx uploaded to Drive (Wolfson) — meaning is carried by CELL FILL
//      COLOUR (green = done). The Sheets API cannot read .xlsx files at all, so
//      the bytes are downloaded and parsed with exceljs, which exposes fills.
//
// Both paths return the same shape: rows of { v, bg }.

import { google } from 'googleapis';
import ExcelJS from 'exceljs';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

function getAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  return new google.auth.GoogleAuth({ credentials: JSON.parse(json), scopes: SCOPES });
}

/** Pulls the file id out of a Sheets or Drive URL. */
function extractId(url) {
  if (!url) return null;
  const m = String(url).match(/\/(?:spreadsheets|file)\/d\/([a-zA-Z0-9_-]+)/)
    || String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/** ARGB / theme fill → #rrggbb, or null when the cell has no explicit fill. */
function fillToHex(fill) {
  if (!fill || fill.type !== 'pattern' || fill.pattern === 'none') return null;
  const argb = fill.fgColor?.argb ?? fill.bgColor?.argb;
  if (!argb || typeof argb !== 'string') return null;
  const hex = argb.length === 8 ? argb.slice(2) : argb;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  // Treat plain white as "no fill" — it carries no meaning in these trackers
  if (hex.toLowerCase() === 'ffffff') return null;
  return `#${hex.toLowerCase()}`;
}

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    if (value.richText) return value.richText.map(r => r.text).join('');
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return String(value.result);
    if (value.error) return '';
    return '';
  }
  return String(value);
}

async function readXlsx(auth, fileId, wantedTab) {
  const drive = google.drive({ version: 'v3', auth });
  const resp = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(resp.data));

  const tabs = wb.worksheets.map(ws => ws.name);
  const ws = (wantedTab && wb.getWorksheet(wantedTab)) || wb.worksheets[0];
  if (!ws) throw new Error('Workbook has no sheets');

  const rows = [];
  const lastCol = ws.actualColumnCount || ws.columnCount || 0;
  ws.eachRow({ includeEmpty: true }, row => {
    const out = [];
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      out.push({ v: cellText(cell.value), bg: fillToHex(cell.fill) });
    }
    rows.push(out);
  });

  return { tabs, tab: ws.name, rows, hasColors: true };
}

async function readNativeSheet(auth, fileId, wantedTab) {
  const sheets = google.sheets({ version: 'v4', auth });
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: fileId,
    fields: 'properties.title,sheets.properties.title',
  });
  const tabs = (meta.data.sheets ?? []).map(s => s.properties.title);
  const tab = wantedTab && tabs.includes(wantedTab) ? wantedTab : tabs[0];
  if (!tab) throw new Error('Spreadsheet has no tabs');

  // One call returns both the values and each cell's effective background,
  // so a native sheet that also uses colour coding still works.
  const grid = await sheets.spreadsheets.get({
    spreadsheetId: fileId,
    ranges: [tab],
    includeGridData: true,
    fields: 'sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor)',
  });

  const rowData = grid.data.sheets?.[0]?.data?.[0]?.rowData ?? [];
  const rows = rowData.map(r => (r.values ?? []).map(c => {
    const bgc = c.effectiveFormat?.backgroundColor;
    let bg = null;
    if (bgc) {
      const to255 = n => Math.round((n ?? 0) * 255);
      const [r8, g8, b8] = [to255(bgc.red), to255(bgc.green), to255(bgc.blue)];
      if (!(r8 === 255 && g8 === 255 && b8 === 255)) {
        bg = `#${[r8, g8, b8].map(n => n.toString(16).padStart(2, '0')).join('')}`;
      }
    }
    return { v: c.formattedValue ?? '', bg };
  }));

  return { tabs, tab, rows, hasColors: true, title: meta.data.properties?.title ?? '' };
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
  const fileId = rawId || extractId(sheetUrl);
  if (!fileId) return res.status(400).json({ error: 'Missing or unrecognised sheet URL' });

  try {
    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });
    const meta = await drive.files.get({
      fileId,
      fields: 'name,mimeType',
      supportsAllDrives: true,
    });

    const isNative = meta.data.mimeType === 'application/vnd.google-apps.spreadsheet';
    const result = isNative
      ? await readNativeSheet(auth, fileId, tab)
      : await readXlsx(auth, fileId, tab);

    res.json({
      title: result.title || meta.data.name || '',
      kind: isNative ? 'google-sheet' : 'xlsx',
      tabs: result.tabs,
      tab: result.tab,
      rows: result.rows,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const code = err?.code ?? err?.response?.status;
    const denied = code === 403 || code === 404;
    console.error('sheet error:', err.message);
    res.status(denied ? 403 : 500).json({
      error: denied
        ? 'The service account cannot open this file. Share it with the service account email as Viewer.'
        : err.message,
    });
  }
}
