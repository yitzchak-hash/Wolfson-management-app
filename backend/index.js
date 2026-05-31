const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const cors = require('cors');
const fs = require('fs');

const app = express();

// ─── Auth ─────────────────────────────────────────────────────────────────────

const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error('GOOGLE_SERVICE_ACCOUNT_JSON env var is missing');
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(serviceAccountJson),
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

// ─── Middleware ────────────────────────────────────────────────────────────────

const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

// All routes below require a valid API key
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Multer: save to /tmp so large videos don't sit in RAM
const upload = multer({
  dest: '/tmp/wolfson-uploads/',
  limits: { fileSize: 1024 * 1024 * 700 }, // 700 MB hard limit
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true }));

/**
 * POST /folder
 * Body: { parentId: string, name: string }
 * Returns: { folderId: string }
 * Finds an existing subfolder by name or creates it.
 */
app.post('/folder', async (req, res) => {
  const { parentId, name } = req.body;
  if (!parentId || !name) {
    return res.status(400).json({ error: 'Missing parentId or name' });
  }
  try {
    // Search for an existing folder with this name under the parent
    const q = `name = '${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const search = await drive.files.list({
      q,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (search.data.files?.length) {
      return res.json({ folderId: search.data.files[0].id });
    }

    // Create it
    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
      supportsAllDrives: true,
    });

    res.json({ folderId: created.data.id });
  } catch (err) {
    console.error('Folder error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /upload
 * Multipart form: file (binary), folderId, filename (optional override)
 * Returns: { fileId, webViewLink, name }
 * Streams the file directly to Drive — no base64, works for any size.
 */
app.post('/upload', upload.single('file'), async (req, res) => {
  const { folderId, filename } = req.body;

  if (!req.file) return res.status(400).json({ error: 'No file received' });
  if (!folderId) return res.status(400).json({ error: 'Missing folderId' });

  const tmpPath = req.file.path;

  try {
    const response = await drive.files.create({
      requestBody: {
        name: filename || req.file.originalname || req.file.filename,
        parents: [folderId],
      },
      media: {
        mimeType: req.file.mimetype || 'application/octet-stream',
        body: fs.createReadStream(tmpPath),
      },
      fields: 'id,webViewLink,name',
      supportsAllDrives: true,
    });

    res.json({
      fileId: response.data.id,
      webViewLink: response.data.webViewLink,
      name: response.data.name,
    });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    // Always clean up the temp file
    fs.unlink(tmpPath, () => {});
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Wolfson Drive backend running on port ${PORT}`);
  console.log(`CORS origin: ${allowedOrigin}`);
});
