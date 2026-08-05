// Stamps a sketch onto an engineering plan and files the result in Drive.
//
// WHY THIS RUNS ON THE SERVER
// The browser is not allowed to read a cross-origin PDF's bytes, and it is not
// allowed to write to a private Drive folder. The service account can do both.
// So the browser sends only the *vector* sketch — a few kilobytes of points —
// and this route fetches the original plan, draws the sketch onto it and
// uploads the new file. No PDF ever travels through the browser, which is what
// makes this work on a 40 MB site plan over an office connection.
//
// WHY IT IS A REAL LAYER, NOT BURNT-IN INK
// Everything drawn goes inside a PDF optional-content group (an OCG). That is
// the same mechanism a CAD layer uses: Acrobat, Chrome and Drive's own viewer
// all show a layers panel with "Markup — v3" in it, and it can be switched off
// to reveal the untouched drawing underneath. The original page content is
// never modified — the markup is appended after it, so turning the layer off
// leaves exactly the plan the engineer issued.
//
// Coordinates arrive normalised: x and y run 0..1 across and DOWN the page, so
// a sketch made on a phone lands in the same place as one made on the 86"
// screen. Widths are given against a 1000-unit-wide reference page and scaled
// to the real page, so a pen stroke is the same relative weight on A4 and A0.

import { google } from 'googleapis';
import {
  PDFDocument, PDFName, PDFOperator, PDFOperatorNames as Ops,
  PDFHexString, StandardFonts, rgb,
} from 'pdf-lib';
import { Readable } from 'stream';

const REF_WIDTH = 1000;

function getDrive() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(json),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

const op = (name, ...args) => PDFOperator.of(name, args.map(a => String(a)));
const n = v => (Math.round(v * 1000) / 1000).toString();

function hexToRgb(hex) {
  const h = String(hex || '#000000').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0');
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

/** Register the markup layer on the document and return its ref. */
function makeLayer(pdf, label) {
  const ctx = pdf.context;
  // Hex string, not literal: a literal PDF string is PDFDocEncoded, which
  // mangles the em dash in "Markup — v1" (and would mangle a Hebrew job name
  // outright). PDFHexString.fromText writes UTF-16, which viewers read back
  // correctly.
  const ocgRef = ctx.register(ctx.obj({ Type: 'OCG', Name: PDFHexString.fromText(label) }));

  const catalog = pdf.catalog;
  let ocProps = catalog.lookup(PDFName.of('OCProperties'));

  if (!ocProps) {
    catalog.set(PDFName.of('OCProperties'), ctx.obj({
      OCGs: [ocgRef],
      D: { Order: [ocgRef], ON: [ocgRef] },
    }));
  } else {
    // Some plans already carry CAD layers. Join them rather than replace them —
    // wiping an existing /OCProperties would hide the drawing's own layers.
    const push = (dict, key) => {
      const arr = dict.lookup(PDFName.of(key));
      if (arr && typeof arr.push === 'function') arr.push(ocgRef);
      else dict.set(PDFName.of(key), ctx.obj([ocgRef]));
    };
    push(ocProps, 'OCGs');
    let d = ocProps.lookup(PDFName.of('D'));
    if (!d) { d = ctx.obj({ Order: [ocgRef], ON: [ocgRef] }); ocProps.set(PDFName.of('D'), d); }
    else { push(d, 'Order'); push(d, 'ON'); }
  }
  return ocgRef;
}

/** Put a name into one of the page's resource sub-dictionaries. */
function addResource(pdf, page, category, name, value) {
  page.node.normalize();
  const res = page.node.Resources();
  let sub = res.lookup(PDFName.of(category));
  if (!sub || typeof sub.set !== 'function') {
    sub = pdf.context.obj({});
    res.set(PDFName.of(category), sub);
  }
  sub.set(PDFName.of(name), value);
}

/**
 * Highlighter needs MULTIPLY, not plain transparency.
 *
 * Over a white sheet the two look identical, but over the black linework you
 * are actually highlighting, plain alpha washes the lines out to grey while
 * multiply leaves them crisp underneath. On a construction drawing that is the
 * difference between a usable markup and an unreadable one.
 */
function gsFor(pdf, page, alpha, blend) {
  const key = `GSa${Math.round(alpha * 100)}${blend === 'Multiply' ? 'm' : 'n'}`;
  const ref = pdf.context.register(pdf.context.obj({
    Type: 'ExtGState', ca: alpha, CA: alpha, BM: PDFName.of(blend || 'Normal'),
  }));
  addResource(pdf, page, 'ExtGState', key, ref);
  return key;
}

/** Points arrive flat as [x, y, w, x, y, w, …]. */
function readPoints(stroke, W, H) {
  const out = [];
  const p = stroke.pts || [];
  for (let i = 0; i + 1 < p.length; i += 3) {
    out.push({ x: p[i] * W, y: (1 - p[i + 1]) * H, w: p[i + 2] ?? 1 });
  }
  return out;
}

function strokeOps(stroke, pts, scale) {
  const ops = [];
  const [r, g, b] = hexToRgb(stroke.color);
  const base = Math.max(0.25, (stroke.width || 3) * scale);

  ops.push(op(Ops.PushGraphicsState));
  ops.push(op('gs', `/${stroke.gsKey}`));
  ops.push(op(Ops.StrokingColorRgb, n(r), n(g), n(b)));
  ops.push(op(Ops.NonStrokingColorRgb, n(r), n(g), n(b)));
  ops.push(op(Ops.SetLineCapStyle, 1));   // round — a pen has no square ends
  ops.push(op(Ops.SetLineJoinStyle, 1));

  const kind = stroke.tool;

  if (kind === 'rect' || kind === 'ellipse' || kind === 'line' || kind === 'arrow') {
    const a = pts[0];
    const z = pts[pts.length - 1];
    if (!a || !z) { ops.push(op(Ops.PopGraphicsState)); return ops; }
    ops.push(op(Ops.SetLineWidth, n(base)));

    if (kind === 'rect') {
      ops.push(op(Ops.AppendRectangle, n(Math.min(a.x, z.x)), n(Math.min(a.y, z.y)),
        n(Math.abs(z.x - a.x)), n(Math.abs(z.y - a.y))));
      ops.push(op(stroke.fill ? Ops.FillNonZeroAndStroke : Ops.StrokePath));
    } else if (kind === 'ellipse') {
      const cx = (a.x + z.x) / 2, cy = (a.y + z.y) / 2;
      const rx = Math.abs(z.x - a.x) / 2, ry = Math.abs(z.y - a.y) / 2;
      const k = 0.5523;                       // circle-from-beziers constant
      ops.push(op(Ops.MoveTo, n(cx - rx), n(cy)));
      ops.push(op(Ops.AppendBezierCurve, n(cx - rx), n(cy + ry * k), n(cx - rx * k), n(cy + ry), n(cx), n(cy + ry)));
      ops.push(op(Ops.AppendBezierCurve, n(cx + rx * k), n(cy + ry), n(cx + rx), n(cy + ry * k), n(cx + rx), n(cy)));
      ops.push(op(Ops.AppendBezierCurve, n(cx + rx), n(cy - ry * k), n(cx + rx * k), n(cy - ry), n(cx), n(cy - ry)));
      ops.push(op(Ops.AppendBezierCurve, n(cx - rx * k), n(cy - ry), n(cx - rx), n(cy - ry * k), n(cx - rx), n(cy)));
      ops.push(op(stroke.fill ? Ops.FillNonZeroAndStroke : Ops.StrokePath));
    } else {
      ops.push(op(Ops.MoveTo, n(a.x), n(a.y)));
      ops.push(op(Ops.LineTo, n(z.x), n(z.y)));
      ops.push(op(Ops.StrokePath));
      if (kind === 'arrow') {
        const ang = Math.atan2(z.y - a.y, z.x - a.x);
        const head = Math.max(base * 3.2, 5);
        const spread = 0.42;
        ops.push(op(Ops.MoveTo, n(z.x), n(z.y)));
        ops.push(op(Ops.LineTo, n(z.x - head * Math.cos(ang - spread)), n(z.y - head * Math.sin(ang - spread))));
        ops.push(op(Ops.LineTo, n(z.x - head * Math.cos(ang + spread)), n(z.y - head * Math.sin(ang + spread))));
        ops.push(op(Ops.ClosePath));
        ops.push(op(Ops.FillNonZero));
      }
    }
    ops.push(op(Ops.PopGraphicsState));
    return ops;
  }

  // Freehand. Each segment carries its own width so pen pressure survives into
  // the PDF — a single polyline with one width would throw that away.
  if (pts.length === 1) {
    const p = pts[0];
    ops.push(op(Ops.SetLineWidth, n(base * p.w)));
    ops.push(op(Ops.MoveTo, n(p.x), n(p.y)));
    ops.push(op(Ops.LineTo, n(p.x + 0.01), n(p.y)));
    ops.push(op(Ops.StrokePath));
  } else {
    let runWidth = null;
    for (let i = 1; i < pts.length; i++) {
      const w = base * ((pts[i - 1].w + pts[i].w) / 2);
      // Only re-issue the width when it actually moves — a constant-width pen
      // then emits one path instead of one per segment.
      if (runWidth === null || Math.abs(w - runWidth) > base * 0.06) {
        if (runWidth !== null) ops.push(op(Ops.StrokePath));
        ops.push(op(Ops.SetLineWidth, n(w)));
        ops.push(op(Ops.MoveTo, n(pts[i - 1].x), n(pts[i - 1].y)));
        runWidth = w;
      }
      ops.push(op(Ops.LineTo, n(pts[i].x), n(pts[i].y)));
    }
    ops.push(op(Ops.StrokePath));
  }

  ops.push(op(Ops.PopGraphicsState));
  return ops;
}

export async function stamp(bytes, strokes, label) {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const ocgRef = makeLayer(pdf, label);
  const pages = pdf.getPages();
  let font = null;

  const byPage = new Map();
  for (const s of strokes) {
    const i = Math.max(0, Math.min(pages.length - 1, s.page | 0));
    if (!byPage.has(i)) byPage.set(i, []);
    byPage.get(i).push(s);
  }

  for (const [idx, list] of byPage) {
    const page = pages[idx];
    const { width: W, height: H } = page.getSize();
    const scale = W / REF_WIDTH;

    // Multiply needs somewhere to composite against.
    //
    // A page with no transparency group has no defined backdrop, and viewers
    // fall back to Normal — the highlighter then paints over the linework
    // instead of through it, which was exactly the symptom. Declaring the page
    // group is the fix, and it changes nothing about how the original content
    // is drawn.
    if (!page.node.lookup(PDFName.of('Group'))) {
      page.node.set(PDFName.of('Group'), pdf.context.obj({
        S: 'Transparency', CS: 'DeviceRGB', I: false, K: false,
      }));
    }

    addResource(pdf, page, 'Properties', 'ocMarkup', ocgRef);
    page.pushOperators(PDFOperator.of(Ops.BeginMarkedContentSequence, ['/OC', '/ocMarkup']));

    for (const s of list) {
      const alpha = typeof s.opacity === 'number' ? s.opacity : 1;
      const blend = s.tool === 'highlighter' ? 'Multiply' : 'Normal';
      s.gsKey = gsFor(pdf, page, alpha, blend);

      if (s.tool === 'text') {
        if (!font) font = await pdf.embedFont(StandardFonts.Helvetica);
        const p = readPoints(s, W, H)[0];
        if (p && s.text) {
          const size = Math.max(4, (s.fontSize || 16) * scale);
          const [r, g, b] = hexToRgb(s.color);
          page.drawText(String(s.text), {
            x: p.x, y: p.y - size, size, font, color: rgb(r, g, b), opacity: alpha,
            lineHeight: size * 1.25,
          });
        }
        continue;
      }

      const pts = readPoints(s, W, H);
      if (!pts.length) continue;
      page.pushOperators(...strokeOps(s, pts, scale));
    }

    page.pushOperators(PDFOperator.of(Ops.EndMarkedContent, []));
  }

  return pdf.save({ useObjectStreams: false });
}

/** Find or create the folder the annotated plans are filed into. */
async function folderFor(drive, parentId, name) {
  const q = `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' ` +
    `and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const found = await drive.files.list({
    q, fields: 'files(id,name)', pageSize: 1,
    supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  if (found.data.files?.length) return found.data.files[0].id;
  const made = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id', supportsAllDrives: true,
  });
  return made.data.id;
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

  const { planFileId, parentFolderId, strokes, version, jobName, folderName } = req.body || {};
  if (!planFileId || !parentFolderId) {
    return res.status(400).json({ error: 'Missing planFileId or parentFolderId' });
  }
  if (!Array.isArray(strokes)) return res.status(400).json({ error: 'strokes must be an array' });

  try {
    const drive = getDrive();

    const meta = await drive.files.get({
      fileId: planFileId, fields: 'id,name', supportsAllDrives: true,
    });
    const original = await drive.files.get(
      { fileId: planFileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    );

    const v = Number(version) > 0 ? Number(version) : 1;
    const out = await stamp(Buffer.from(original.data), strokes, `Markup — v${v}`);

    const base = (meta.data.name || 'Plan').replace(/\.pdf$/i, '');
    const stem = jobName ? `${jobName} — ${base}` : base;
    const filename = `${stem} — markup v${v}.pdf`;

    const folderId = await folderFor(drive, parentFolderId, folderName || 'Annotated Plans');

    const created = await drive.files.create({
      requestBody: { name: filename, parents: [folderId], mimeType: 'application/pdf' },
      media: { mimeType: 'application/pdf', body: Readable.from(Buffer.from(out)) },
      fields: 'id,name,webViewLink,size',
      supportsAllDrives: true,
    });

    res.json({
      fileId: created.data.id,
      name: created.data.name,
      webViewLink: created.data.webViewLink
        || `https://drive.google.com/file/d/${created.data.id}/view`,
      folderId,
      version: v,
      sizeBytes: Number(created.data.size) || out.length,
    });
  } catch (err) {
    console.error('plan-annotate error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
