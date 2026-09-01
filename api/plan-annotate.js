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
/** Line spacing, matching LINE in src/components/plans/paintStroke.ts. */
const LINE_H = 1.22;

/** Embed a face once per document. */
async function fontFor(pdf, cache, bold) {
  const key = bold ? 'bold' : 'plain';
  if (!cache[key]) {
    cache[key] = await pdf.embedFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
  }
  return cache[key];
}

/**
 * The largest size at which this text fits this box, and the lines it makes.
 *
 * The twin of fitText() in paintStroke.ts, and it has to stay the twin — the
 * balloon you see on screen and the balloon in the filed PDF are supposed to be
 * the same balloon.
 */
function fitLines(font, text, boxW, boxH, want) {
  let size = want;
  let lines = [];
  for (let i = 0; i < 26; i++) {
    lines = wrapAt(font, text, boxW, size);
    if (lines.length * size * LINE_H <= boxH || size <= 4) break;
    size = Math.max(4, size * 0.92);
  }
  return { size, lines };
}

function wrapAt(font, text, maxW, size) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      let w;
      try { w = font.widthOfTextAtSize(next, size); } catch { w = next.length * size * 0.5; }
      if (w > maxW && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

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

  if (kind === 'bubble') {
    // A speech balloon: rounded box plus a tail down to the bottom-left, so it
    // reads as somebody saying something about the thing it points at.
    const a = pts[0], z = pts[pts.length - 1];
    if (!a || !z) { ops.push(op(Ops.PopGraphicsState)); return ops; }
    const x0 = Math.min(a.x, z.x), x1 = Math.max(a.x, z.x);
    const yTop = Math.max(a.y, z.y), yBot = Math.min(a.y, z.y);
    const w = x1 - x0, h = yTop - yBot;
    // The same figures paintStroke.ts uses, so the balloon on screen and the
    // balloon in the PDF are the same shape.
    const tail = Math.min(base * 8, h * 0.32);
    const bodyBot = yBot + tail;
    const r = Math.min(base * 5, w / 4, (yTop - bodyBot) / 3);

    ops.push(op(Ops.SetLineWidth, n(base)));
    ops.push(op(Ops.NonStrokingColorRgb, '1', '1', '1'));
    ops.push(op(Ops.MoveTo, n(x0 + r), n(bodyBot)));
    ops.push(op(Ops.LineTo, n(x0 + w * 0.26), n(bodyBot)));
    ops.push(op(Ops.LineTo, n(x0 + w * 0.16), n(yBot)));                 // the tail
    ops.push(op(Ops.LineTo, n(x0 + w * 0.36), n(bodyBot)));
    ops.push(op(Ops.LineTo, n(x1 - r), n(bodyBot)));
    ops.push(op(Ops.AppendBezierCurve, n(x1), n(bodyBot), n(x1), n(bodyBot), n(x1), n(bodyBot + r)));
    ops.push(op(Ops.LineTo, n(x1), n(yTop - r)));
    ops.push(op(Ops.AppendBezierCurve, n(x1), n(yTop), n(x1), n(yTop), n(x1 - r), n(yTop)));
    ops.push(op(Ops.LineTo, n(x0 + r), n(yTop)));
    ops.push(op(Ops.AppendBezierCurve, n(x0), n(yTop), n(x0), n(yTop), n(x0), n(yTop - r)));
    ops.push(op(Ops.LineTo, n(x0), n(bodyBot + r)));
    ops.push(op(Ops.AppendBezierCurve, n(x0), n(bodyBot), n(x0), n(bodyBot), n(x0 + r), n(bodyBot)));
    ops.push(op(Ops.ClosePath));
    ops.push(op(Ops.FillNonZeroAndStroke));
    ops.push(op(Ops.PopGraphicsState));
    return ops;
  }

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
      if (kind === 'arrow') {
        // Same geometry as the on-screen arrow: the shaft stops at the base of
        // the head, or a round cap pokes out past the point.
        const ang0 = Math.atan2(z.y - a.y, z.x - a.x);
        const len = Math.hypot(z.x - a.x, z.y - a.y);
        const h0 = Math.min(Math.max(base * 4.2, 6), len * 0.42);
        ops.push(op(Ops.MoveTo, n(a.x), n(a.y)));
        ops.push(op(Ops.LineTo, n(z.x - Math.cos(ang0) * h0 * 0.86), n(z.y - Math.sin(ang0) * h0 * 0.86)));
      } else {
        ops.push(op(Ops.MoveTo, n(a.x), n(a.y)));
        ops.push(op(Ops.LineTo, n(z.x), n(z.y)));
      }
      ops.push(op(Ops.StrokePath));
      if (kind === 'arrow') {
        const ang = Math.atan2(z.y - a.y, z.x - a.x);
        const lenA = Math.hypot(z.x - a.x, z.y - a.y);
        const head = Math.min(Math.max(base * 4.2, 6), lenA * 0.42);
        const spread = 0.38;
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

  // Freehand — pen, pencil, marker, highlighter.
  //
  // ONE path, ONE fill: a quad per segment plus a disc per point, every subpath
  // wound the same way and filled once with the nonzero rule. This is the exact
  // geometry ribbon() draws on screen in src/components/plans/paintStroke.ts;
  // change one, change both.
  //
  // Emitting a StrokePath per segment (or per run) is what this replaced. Each
  // StrokePath composites separately against the ExtGState alpha, so anything
  // under full opacity went darker wherever the strokes overlapped — which is
  // wherever the hand slowed down — and a segment shorter than its own round cap
  // came out as a bead. One fill cannot darken against itself however much it
  // overlaps, and the discs supply the round joins and caps.
  const flat = kind === 'highlighter';        // a felt chisel has no pressure
  const half = (w) => Math.max(0.12, (base * (flat ? 1 : w)) / 2);

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) continue;                 // a pause: the discs cover it
    const nx = -dy / len, ny = dx / len;
    const ha = half(a.w), hb = half(b.w);
    ops.push(op(Ops.MoveTo, n(a.x + nx * ha), n(a.y + ny * ha)));
    ops.push(op(Ops.LineTo, n(b.x + nx * hb), n(b.y + ny * hb)));
    ops.push(op(Ops.LineTo, n(b.x - nx * hb), n(b.y - ny * hb)));
    ops.push(op(Ops.LineTo, n(a.x - nx * ha), n(a.y - ny * ha)));
    ops.push(op(Ops.ClosePath));
  }

  const K = 0.5523;                           // circle-from-beziers constant
  for (const p of pts) {
    // Clockwise, to match the quads above. A disc turning the other way cancels
    // under the nonzero rule and punches a hole in the line.
    const r = half(p.w);
    const k = r * K;
    ops.push(op(Ops.MoveTo, n(p.x + r), n(p.y)));
    ops.push(op(Ops.AppendBezierCurve, n(p.x + r), n(p.y - k), n(p.x + k), n(p.y - r), n(p.x), n(p.y - r)));
    ops.push(op(Ops.AppendBezierCurve, n(p.x - k), n(p.y - r), n(p.x - r), n(p.y - k), n(p.x - r), n(p.y)));
    ops.push(op(Ops.AppendBezierCurve, n(p.x - r), n(p.y + k), n(p.x - k), n(p.y + r), n(p.x), n(p.y + r)));
    ops.push(op(Ops.AppendBezierCurve, n(p.x + k), n(p.y + r), n(p.x + r), n(p.y + k), n(p.x + r), n(p.y)));
    ops.push(op(Ops.ClosePath));
  }

  ops.push(op(Ops.FillNonZero));
  ops.push(op(Ops.PopGraphicsState));
  return ops;
}

/** yyyy-mm-dd HH.MM — safe in a filename on every platform. */
function stampTime() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
}

export async function stamp(bytes, strokes, label, author) {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  // Who marked it up travels IN the file, so a copy that leaves Drive still
  // says whose markup it is. The layer name carries it too, because that is
  // what a viewer's layers panel shows.
  const ocgRef = makeLayer(pdf, author ? `${label} — ${author}` : label);
  if (author) {
    try {
      pdf.setAuthor(author);
      pdf.setSubject(`Plan markup ${label} by ${author}`);
      pdf.setProducer('TzviAir job management');
    } catch { /* some plans refuse metadata writes; the markup still lands */ }
  }
  const pages = pdf.getPages();
  const fonts = {};

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

      if (s.tool === 'bubble' && s.text) {
        // Its words, laid inside the balloon rather than at a point — and SIZED
        // TO FIT it, exactly as fitText() does on screen. A small balloon used
        // to keep its type size and spill its words out through its own outline.
        const f = await fontFor(pdf, fonts, s.bold);
        const p = readPoints(s, W, H);
        const a = p[0], z = p[p.length - 1];
        if (a && z) {
          const [r, g, b] = hexToRgb(s.color);
          const base = Math.max(0.25, (s.width || 2) * scale);
          const pad = base * 4;
          const x0 = Math.min(a.x, z.x), x1 = Math.max(a.x, z.x);
          const yBot = Math.min(a.y, z.y), yTop = Math.max(a.y, z.y);
          const tail = Math.min(base * 8, (yTop - yBot) * 0.32);
          const boxW = Math.max(10, x1 - x0 - pad * 2);
          const boxH = Math.max(6, (yTop - (yBot + tail)) - pad * 2);
          const fit = fitLines(f, String(s.text), boxW, boxH, Math.max(5, (s.fontSize || 15) * scale));
          fit.lines.forEach((line, i) => {
            page.drawText(line, {
              x: x0 + pad,
              y: yTop - pad - fit.size * (i + 1) * LINE_H + fit.size * 0.22,
              size: fit.size, font: f, color: rgb(r, g, b),
            });
          });
        }
        continue;
      }

      if (s.tool === 'text') {
        const f = await fontFor(pdf, fonts, s.bold);
        const p = readPoints(s, W, H)[0];
        if (p && s.text) {
          const size = Math.max(4, (s.fontSize || 16) * scale);
          const [r, g, b] = hexToRgb(s.color);
          page.drawText(String(s.text), {
            x: p.x, y: p.y - size, size, font: f, color: rgb(r, g, b), opacity: alpha,
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

/**
 * Find or create the folder the annotated plans are filed into.
 *
 * `name` may be a PATH ("Annotated Plans/Pins") — each segment is found or
 * created inside the one before, so the punch-list PDFs live in their own
 * Pins folder INSIDE Annotated Plans, per the owner.
 */
async function folderFor(drive, parentId, name) {
  let at = parentId;
  for (const seg of String(name).split('/').map(s => s.trim()).filter(Boolean)) {
    const q = `'${at}' in parents and name = '${seg.replace(/'/g, "\\'")}' ` +
      `and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const found = await drive.files.list({
      q, fields: 'files(id,name)', pageSize: 1,
      supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    if (found.data.files?.length) { at = found.data.files[0].id; continue; }
    const made = await drive.files.create({
      requestBody: { name: seg, mimeType: 'application/vnd.google-apps.folder', parents: [at] },
      fields: 'id', supportsAllDrives: true,
    });
    at = made.data.id;
  }
  return at;
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

  const {
    planFileId, parentFolderId, strokes, version, jobName, folderName, author,
    updateFileId, subVersion, nameTag,
  } = req.body || {};
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
    /**
     * The sub-count of in-place updates: "annotated version 1.3" says at a
     * glance how many times v1's one file has been brought up to date —
     * the owner's ask. Absent, the name stays the plain integer.
     */
    const sub = Number.isFinite(Number(subVersion)) && subVersion != null ? Number(subVersion) : null;
    const vLabel = sub == null ? `${v}` : `${v}.${sub}`;
    /** "punch list" for the background pins file; the sketches keep "Markup". */
    const tag = typeof nameTag === 'string' && nameTag.trim() ? nameTag.trim() : null;
    const who = String(author || '').trim();
    const out = await stamp(Buffer.from(original.data), strokes,
      tag ? `${tag[0].toUpperCase()}${tag.slice(1)}` : `Markup — v${vLabel}`, who);

    /**
     * The name says which version, when, and by whom.
     *
     * A folder of "Plan — markup v1.pdf, v2.pdf, v3.pdf" tells you the order
     * and nothing else; the office needs to know which of this morning's three
     * is the one the engineer marked up, without opening all three.
     */
    const base = (meta.data.name || 'Plan').replace(/\.pdf$/i, '');
    const when = stampTime();
    const parts = [
      jobName ? `${jobName} — ${base}` : base,
      tag ?? `annotated version ${vLabel}`,
      when,
    ];
    if (who) parts.push(who);
    const filename = `${parts.join(' — ')}.pdf`;

    // "Annotated Plans" belongs INSIDE the plans folder it came from, not
    // beside it — the markup of a plan is a plan, and the office looks for it
    // where the plans are.
    const folderId = await folderFor(drive, parentFolderId, folderName || 'Annotated Plans');

    /**
     * ONE file per sketch version, brought up to date — never a new file per
     * push. The autosave stamps a few seconds after every pause, so creating
     * each time filled Annotated Plans with near-identical copies of the same
     * sketch ("annotated version 2" five times over, a minute apart), which is
     * exactly the folder spam the owner asked to avoid. When the caller names
     * the file its sketch already made (`updateFileId`), the bytes and the
     * timestamped name are UPDATED in place — Drive keeps its own revision
     * history of the file, so nothing is lost — and only a sketch with no
     * file yet creates one. A vanished file (someone tidied the folder) falls
     * back to create rather than failing the save.
     */
    let created = null;
    if (updateFileId) {
      try {
        created = await drive.files.update({
          fileId: updateFileId,
          requestBody: { name: filename },
          media: { mimeType: 'application/pdf', body: Readable.from(Buffer.from(out)) },
          fields: 'id,name,webViewLink,size',
          supportsAllDrives: true,
        });
      } catch { /* deleted or unreachable — file it as new below */ }
    }
    if (!created) {
      created = await drive.files.create({
        requestBody: { name: filename, parents: [folderId], mimeType: 'application/pdf' },
        media: { mimeType: 'application/pdf', body: Readable.from(Buffer.from(out)) },
        fields: 'id,name,webViewLink,size',
        supportsAllDrives: true,
      });
    }

    // The portal hands workers a PLAIN Drive link to this file, and Drive
    // demands a Google login for a private one — so every stamped plan is
    // link-shared the moment it exists (the owner's decision, 2026-08-17).
    // Never fatal: the file is already filed, and the portal re-shares
    // lazily if this one call misses.
    try {
      await drive.permissions.create({
        fileId: created.data.id,
        requestBody: { role: 'reader', type: 'anyone' },
        supportsAllDrives: true,
      });
    } catch (shareErr) {
      console.warn('stamped-plan share failed:', shareErr.message);
    }

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
