// The SHARED VIEW's security checks (lib/sharedView.js), run against a fake database and a fake Drive — nothing
// here touches the live cloud. Run: node scripts/test-shared-view.mjs
//
// It plays the outside person trying to get further than the link allows: wrong / turned-off tokens, a link for
// one project asking for another's records or files, made-up and tampered file refs, path tricks, oversized and
// malformed pins, deleting another link's pin, and writing anywhere but `sharedPins`.
import { Writable, Readable } from 'stream';
import crypto from 'crypto';
import { handleShared, sealRef, openRef, sha256Hex, _resetForTests } from '../lib/sharedView.js';

const BASE = 'http://fs.test/v1/projects/demo/databases/(default)/documents';
const env = { FIRESTORE_REST_BASE: BASE, SHARE_LINK_SECRET: 'x'.repeat(48) };
const secret = crypto.createHash('sha256').update(env.SHARE_LINK_SECRET).digest();

let failed = 0, passed = 0;
const ok = (cond, what) => { if (cond) passed++; else { failed++; console.error('  ✗', what); } };

// ── a fake Firestore ─────────────────────────────────────────────────────────
const db = new Map();      // coll → Map(id → { fields, updateTime })
const writes = [];         // every commit write, for the audit
const put = (coll, id, fields) => {
  if (!db.has(coll)) db.set(coll, new Map());
  db.get(coll).set(id, { fields: { id, ...fields }, updateTime: new Date(Date.now() + Math.random()).toISOString() });
};
const enc = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
};
const dec = v => {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, dec(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(dec);
  return undefined;
};
const asDoc = (coll, id, d) => ({ name: `projects/demo/databases/(default)/documents/${coll}/${id}`, updateTime: d.updateTime,
  fields: Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, enc(v)])) });
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function fakeFetch(url, init = {}) {
  const u = new URL(url);
  if (u.hostname === 'firebasestorage.googleapis.com') {
    return new Response(Buffer.from('JPEGDATA'), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  }
  if (!url.startsWith(BASE)) throw new Error(`unexpected fetch ${url}`);
  const rest = decodeURIComponent(u.pathname.slice(new URL(BASE).pathname.length));
  if (rest === ':runQuery') {
    const q = JSON.parse(init.body).structuredQuery;
    const coll = q.from[0].collectionId, f = q.where.fieldFilter;
    const rows = [...(db.get(coll) ?? new Map())].filter(([, d]) => d.fields[f.field.fieldPath] === f.value.stringValue)
      .slice(0, q.limit ?? 1e9).map(([id, d]) => ({ document: asDoc(coll, id, d) }));
    return json(200, rows.length ? rows : [{ readTime: 'x' }]);
  }
  if (rest === ':commit') {
    const { writes: ws } = JSON.parse(init.body);
    for (const w of ws) {
      writes.push(w);
      const name = w.update?.name ?? w.delete;
      const [coll, id] = name.split('/documents/')[1].split('/');
      const cur = db.get(coll)?.get(id);
      if (w.currentDocument?.exists === false && cur) return json(409, { error: 'exists' });
      if (w.currentDocument?.exists === true && !cur) return json(404, { error: 'missing' });
      if (w.currentDocument?.updateTime && cur?.updateTime !== w.currentDocument.updateTime) return json(409, { error: 'stale' });
      if (w.delete) { db.get(coll).delete(id); continue; }
      const fields = Object.fromEntries(Object.entries(w.update.fields).map(([k, v]) => [k, dec(v)]));
      const base = w.updateMask ? { ...(cur?.fields ?? {}) } : {};
      for (const k of w.updateMask?.fieldPaths ?? Object.keys(fields)) base[k] = fields[k];
      for (const t of w.updateTransforms ?? []) {
        if (t.increment) base[t.fieldPath] = (base[t.fieldPath] ?? 0) + Number(t.increment.integerValue);
        if (t.setToServerValue) base[t.fieldPath] = 'SERVER_TIME';
      }
      put(coll, id, base);
    }
    return json(200, { writeResults: [] });
  }
  const parts = rest.replace(/^\//, '').split('/');
  if (parts.length === 2) {
    const d = db.get(parts[0])?.get(parts[1]);
    return d ? json(200, asDoc(parts[0], parts[1], d)) : json(404, {});
  }
  const coll = parts[0];
  const mask = u.searchParams.getAll('mask.fieldPaths');
  const docs = [...(db.get(coll) ?? new Map())].map(([id, d]) => {
    const doc = asDoc(coll, id, d);
    if (mask.length) doc.fields = Object.fromEntries(Object.entries(doc.fields).filter(([k]) => mask.includes(k)));
    return doc;
  });
  return json(200, { documents: docs });
}

// ── a fake Drive ─────────────────────────────────────────────────────────────
const FOLDER = 'application/vnd.google-apps.folder';
const driveTree = {
  FOLDER_A1_1: [{ id: 'PHOTOSFOLDER_1', name: 'Photos', mimeType: FOLDER }, { id: 'PLANSFOLDER_1', name: 'Engineered Plans', mimeType: FOLDER }],
  PHOTOSFOLDER_1: [
    { id: 'DRIVEPHOTO_TOP_1', name: 'a.jpg', mimeType: 'image/jpeg' },
    { id: 'PIPINGFOLDER_1', name: 'Piping', mimeType: FOLDER },
    { id: 'TASKNOTES_1', name: 'Task Notes', mimeType: FOLDER },
    { id: 'DOC_IN_PHOTOS_1', name: 'contract.pdf', mimeType: 'application/pdf' },
  ],
  PIPINGFOLDER_1: [{ id: 'DRIVEPHOTO_PIPING_1', name: 'p.jpg', mimeType: 'image/jpeg' }, { id: 'DRIVEVIDEO_PIPING_1', name: 'v.mp4', mimeType: 'video/mp4' }],
  TASKNOTES_1: [{ id: 'SECRET_NOTE_PHOTO_1', name: 'n.jpg', mimeType: 'image/jpeg' }],
};
const driveMeta = {
  PLAN_A1_1_PDF: { mimeType: 'application/pdf', size: 9 },
  PLAN_B1_7_PDF: { mimeType: 'application/pdf', size: 9 },
  DRIVEPHOTO_TOP_1: { mimeType: 'image/jpeg', size: 4 },
  STAGEPHOTO_DRIVE_1: { mimeType: 'image/jpeg', size: 4 },
  SPREADSHEET_1: { mimeType: 'application/vnd.google-apps.spreadsheet' },
};
const driveCalls = [];
const drive = {
  async children(id) { driveCalls.push(['children', id]); return driveTree[id] ?? []; },
  async meta(id) { driveCalls.push(['meta', id]); const m = driveMeta[id]; if (!m) throw new Error('404'); return { id, ...m }; },
  async media(id) { driveCalls.push(['media', id]); return { status: 200, stream: Readable.from([Buffer.from(`BYTES:${id}`)]) }; },
  async thumb() { return new Response(Buffer.from('THUMB'), { status: 200, headers: { 'content-type': 'image/jpeg' } }); },
};

// ── fake request / response ──────────────────────────────────────────────────
class Res extends Writable {
  constructor() { super(); this.statusCode = 200; this.headers = {}; this.chunks = []; this.headersSent = false; }
  setHeader(k, v) { this.headers[k.toLowerCase()] = v; }
  _write(c, _e, cb) { this.headersSent = true; this.chunks.push(Buffer.from(c)); cb(); }
  end(c, ...a) { if (c && typeof c !== 'function') this.chunks.push(Buffer.from(c)); this.headersSent = true; return super.end(...a); }
  get text() { return Buffer.concat(this.chunks).toString('utf8'); }
  get json() { try { return JSON.parse(this.text); } catch { return null; } }
}
let ipSeq = 0;
async function call({ method = 'GET', query = {}, token, headers = {}, body, ip } = {}) {
  const req = { method, query, headers: { ...headers, 'x-forwarded-for': ip ?? `10.0.0.${(ipSeq++ % 200) + 1}` }, body };
  if (token !== undefined) req.headers['x-share-token'] = token;
  const res = new Res();
  await handleShared(req, res, { env, fetchImpl: fakeFetch, drive });
  await new Promise(r => setTimeout(r, 5));
  return res;
}

// ── the data ─────────────────────────────────────────────────────────────────
const tok = () => crypto.randomBytes(32).toString('base64url');
const TOKEN_A = tok(), TOKEN_B = tok(), TOKEN_OFF = tok(), TOKEN_GENERAL = tok();
put('sharedLinks', 'L_A', { name: 'Developer', projectId: 'wolfson', tokenHash: sha256Hex(TOKEN_A), revokedAt: null, openCount: 0 });
put('sharedLinks', 'L_B', { name: 'Netiv manager', projectId: 'netiv', tokenHash: sha256Hex(TOKEN_B), revokedAt: null, openCount: 0 });
put('sharedLinks', 'L_OFF', { name: 'Old', projectId: 'wolfson', tokenHash: sha256Hex(TOKEN_OFF), revokedAt: '2026-11-01T00:00:00Z' });
put('sharedLinks', 'L_GEN', { name: 'Board', projectId: 'general', tokenHash: sha256Hex(TOKEN_GENERAL), revokedAt: null });
put('settings', 'app', {
  boardSettings: {
    wolfson: { tipusim: ['A2'], customButtons: [{ id: 'cb1', name: 'Wall', editors: ['u1'] }], secretToolbar: { x: 1 }, standardPlans: { A1: { fileId: 'STANDARD_PLAN_SECRET' } } },
    __tv: { portalDomain: 'x' },
  },
  customProjects: [], backupDriveFolderLink: 'https://drive.google.com/drive/folders/BACKUP_FOLDER_SECRET',
});
put('stages', 's1', { name: 'Piping', color: '#111111', order: 1, active: true, includes: ['Soldering'] });
put('stages', 'sg', { name: 'General only', color: '#222222', order: 1, active: true, projectId: 'general' });
put('apartments', 'A1-1', {
  buildingId: 'A1', apartmentNumber: '1', displayName: 'Cohen', floor: 2, colPosition: 1, colSpan: 1, isDuplexApt: false,
  currentStageId: 's1', classification: 'shinui', isUnnamed: false, tipus: 'A2', crew: 'Igor',
  stageMarks: { s1: 'done', bogus: 'evil' }, customAnswers: { cb1: 'yes', nope: 'yes' },
  address: 'SECRET_ADDRESS 5', phone: '050-SECRET', generalNotes: 'SECRET_NOTE', noteEntries: [{ text: 'SECRET_NOTE2' }],
  zohoLink: 'https://crm.zoho.com/SECRET_ZOHO', driveLink: 'https://drive.google.com/drive/folders/FOLDER_A1_1',
  driveFolderName: 'Cohen SECRET_FOLDERNAME', plansPdfLink: 'https://drive.google.com/file/d/PLAN_A1_1_PDF/view',
  pinsDriveFileId: 'PINS_SECRET_FILE', updatedByName: 'SECRET_STAFF',
  inspections: [{ id: 'x', at: '2026-11-01', byName: 'Tzvi Levi', byId: 'u3', afterStageId: 's1', note: 'SECRET_INSPECTION_NOTE',
    files: [{ filename: 'insp.mp4', mimeType: 'video/mp4', driveFileId: 'INSPECTION_VIDEO_1', driveUrl: 'https://drive.google.com/x' }] }],
  siteVisits: [{ id: 'v', byId: 'c1', byName: 'SECRET_WORKER', startedAt: '2026-11-18T08:00:00Z', status: 'working' },
    { id: 'q', byId: 'c1', byName: 'SECRET_WORKER2', startedAt: 'x', status: 'question' }],
  stageDone: { s1: { by: 'SECRET_DONE_BY', at: '2026-11-02T10:00:00Z' } },
});
put('apartments', 'A1-2', { buildingId: 'A1', apartmentNumber: '2', displayName: '2', floor: 2, colPosition: 2, colSpan: 1,
  plansPdfLink: 'https://drive.google.com/file/d/PLAN_A1_2_PDF/view' });
put('apartments', 'A1-GONE', { buildingId: 'A1', apartmentNumber: '9', displayName: 'TOMBSTONED_APT', floor: 3 });
put('apartments', 'G-1', { buildingId: 'G', apartmentNumber: '', displayName: 'JOBBOARD_JOB', floor: 0 });
put('tombstones', 'deleted', { ids: { 'A1-GONE': '2026-01-01' } });
put('netiv_apartments', 'B1-7', { buildingId: 'B1', apartmentNumber: '7', displayName: 'NETIV_FAMILY', floor: 1,
  plansPdfLink: 'https://drive.google.com/file/d/PLAN_B1_7_PDF/view', driveLink: 'https://drive.google.com/drive/folders/FOLDER_B1_7' });
put('contractorAssignments', 't1', { apartmentId: 'A1-1', contractorId: 'c1', notes: 'SECRET_TASK' });
put('contractorAssignments', 't2', { apartmentId: 'A1-2' });
put('contractorPhotos', 'ph1', { apartmentId: 'A1-1', assignmentId: 't1', stageId: 's1', driveFileId: 'STAGEPHOTO_DRIVE_1', filename: 'SECRET_FILENAME.jpg', contractorId: 'c1' });
put('contractorPhotos', 'ph2', { apartmentId: 'A1-1', assignmentId: 't2', stageId: 's1', driveFileId: 'MOVED_TASK_PHOTO' });
put('contractorPhotos', 'ph3', { apartmentId: 'A1-1', assignmentId: 't1', stageId: 's1', storageUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/x.jpg?alt=media&token=SECRET_STORAGE_TOKEN' });
put('sharedPins', 'sp_' + 'b'.repeat(32), { linkId: 'L_B', projectId: 'netiv', apartmentId: 'B1-7', planFileId: 'PLAN_B1_7_PDF', text: 'OTHER_LINK_PIN', page: 0, xPct: 1, yPct: 1 });

// ── the checks ───────────────────────────────────────────────────────────────
console.log('Shared view — security checks');

_resetForTests();
{
  const r = await call({ query: { sv: 'data' }, token: 'short' });
  ok(r.statusCode === 404 && r.json?.error === 'not_found', 'badly shaped token → plain 404');
  const r2 = await call({ query: { sv: 'data' }, token: tok() });
  ok(r2.statusCode === 404 && r2.text === r.text, 'unknown token → the same plain 404');
  const r3 = await call({ query: { sv: 'data' }, token: TOKEN_OFF });
  ok(r3.statusCode === 404 && r3.text === r.text, 'turned-off link → the same plain 404');
  const r4 = await call({ query: { sv: 'data' }, token: TOKEN_GENERAL });
  ok(r4.statusCode === 404, 'a link to the Job Board (not a building project) → 404');
  const r5 = await call({ query: { sv: 'data' } });
  ok(r5.statusCode === 404, 'no token → 404');
  const r6 = await call({ query: { sv: 'data', t: TOKEN_A } });
  ok(r6.statusCode === 200, 'token in ?t= also works (for <video>/<img>)');
  ok(r.headers['cache-control']?.includes('no-store') && r.headers['x-content-type-options'] === 'nosniff' && r.headers['referrer-policy'] === 'no-referrer',
    'no-store / nosniff / no-referrer on every answer');
  ok(!('access-control-allow-origin' in r.headers), 'no CORS header: another website cannot read the answers');
}

let view;
{
  const before = db.get('sharedLinks').get('L_A').fields.openCount ?? 0;
  const r = await call({ query: { sv: 'data' }, token: TOKEN_A });
  ok(r.statusCode === 200, 'valid link → 200');
  view = r.json;
  const text = r.text;
  for (const secretWord of ['SECRET_', 'FOLDER_A1_1', 'PHOTOSFOLDER', 'PLAN_A1_1_PDF', 'STAGEPHOTO_DRIVE_1', 'INSPECTION_VIDEO_1',
    'drive.google.com', 'zoho', 'NETIV_FAMILY', 'TOMBSTONED_APT', 'JOBBOARD_JOB', 'OTHER_LINK_PIN', 'firebasestorage', 'tokenHash',
    'editors', 'secretToolbar', 'standardPlans', 'General only', 'MOVED_TASK_PHOTO', 'contractorId":"c', 'byId":"u']) {
    ok(!text.includes(secretWord), `projection never carries "${secretWord}"`);
  }
  const a1 = view.apartments.find(a => a.id === 'A1-1');
  ok(view.apartments.length === 2 && a1, 'only this project\'s live apartments (no tombstoned, no other project)');
  ok(a1 && !('address' in a1) && !('phone' in a1) && !('driveLink' in a1) && !('plansPdfLink' in a1), 'no address / phone / Drive links on an apartment');
  ok(a1?.stageMarks?.s1 === 'done' && !('bogus' in (a1?.stageMarks ?? {})), 'stage marks allowlisted by real stage ids');
  ok(a1?.customAnswers?.cb1 === 'yes' && !('nope' in (a1?.customAnswers ?? {})), 'custom answers allowlisted by the project\'s buttons');
  ok(a1?.siteVisits?.length === 1 && a1.siteVisits[0].byName === '', 'only "someone working" — never who, never questions');
  ok(a1?.inspections?.[0]?.byName === 'Tzvi' && !('note' in a1.inspections[0]), 'inspections: first name, no notes');
  ok(typeof a1?.planRef === 'string' && a1.planRef.length > 40, 'the plan is a sealed ref');
  ok(!('photos' in view), 'no photos in the opening read (they come per apartment)');
  ok(view.stages.length === 1, 'stages: this workspace\'s only');
  const m = await call({ query: { sv: 'media', apt: 'A1-1' }, token: TOKEN_A });
  view.photos = m.json?.photos ?? [];
  ok(m.statusCode === 200 && view.photos.length === 2, 'stage photos: only those of this apartment\'s own tasks (2), not a moved task\'s');
  ok(!/STAGEPHOTO_DRIVE_1|SECRET_|firebasestorage|MOVED_TASK|contractorId":"c/.test(m.text), 'stage photos: refs only, no names, no Storage address');
  ok((await call({ query: { sv: 'media', apt: 'B1-7' }, token: TOKEN_A })).statusCode === 404, 'media of another project\'s apartment → 404');
  ok((await call({ query: { sv: 'media', apt: 'A1-GONE' }, token: TOKEN_A })).statusCode === 404, 'media of a deleted apartment → 404');
  ok(db.get('sharedLinks').get('L_A').fields.openCount === before + 1, 'opened → openCount + 1');
}

{
  // Files
  const a1 = view.apartments.find(a => a.id === 'A1-1');
  const r = await call({ query: { sv: 'file', f: a1.planRef }, token: TOKEN_A });
  ok(r.statusCode === 200 && r.text === 'BYTES:PLAN_A1_1_PDF' && r.headers['content-type'] === 'application/pdf', 'its own plan streams');
  const viaB = await call({ query: { sv: 'file', f: a1.planRef }, token: TOKEN_B });
  ok(viaB.statusCode === 404, 'project A\'s file ref under project B\'s token → 404');
  const viaOff = await call({ query: { sv: 'file', f: a1.planRef }, token: TOKEN_OFF });
  ok(viaOff.statusCode === 404, 'a ref under a turned-off link → 404');
  const forgedB = sealRef(crypto.randomBytes(32), 'L_A', 'd', 'PLAN_B1_7_PDF');
  ok((await call({ query: { sv: 'file', f: forgedB }, token: TOKEN_A })).statusCode === 404, 'a ref sealed with another key → 404');
  const otherProject = sealRef(secret, 'L_B', 'd', 'PLAN_B1_7_PDF');
  ok((await call({ query: { sv: 'file', f: otherProject }, token: TOKEN_A })).statusCode === 404, 'B\'s genuine ref used with A\'s token → 404');
  const flip = a1.planRef.slice(0, 20) + (a1.planRef[20] === 'A' ? 'B' : 'A') + a1.planRef.slice(21);
  ok((await call({ query: { sv: 'file', f: flip }, token: TOKEN_A })).statusCode === 404, 'a tampered ref → 404');
  for (const evil of ['PLAN_B1_7_PDF', '../../etc/passwd', '..%2F..%2Fapi', 'https://evil.example/x', '', 'A'.repeat(5000)]) {
    ok((await call({ query: { sv: 'file', f: evil }, token: TOKEN_A })).statusCode === 404, `raw / traversal / junk ref "${evil.slice(0, 20)}" → 404`);
  }
  const sheet = sealRef(secret, 'L_A', 'd', 'SPREADSHEET_1');
  ok((await call({ query: { sv: 'file', f: sheet }, token: TOKEN_A })).statusCode === 404, 'only pictures, films and PDFs are ever streamed');
  ok(openRef(secret, 'L_A', sealRef(secret, 'L_A', 's', 'https://evil.example/x.jpg')) === null, 'a Storage ref can only name Firebase Storage (no SSRF)');
  ok(openRef(secret, 'L_A', sealRef(secret, 'L_A', 'd', '../../x')) === null, 'a Drive ref can only hold a Drive id');
  const storagePhoto = view.photos.find(p => p.stageId === 's1' && p.fileType === 'image' && p.id === 'p1') ?? view.photos[1];
  const rs = await call({ query: { sv: 'file', f: storagePhoto.driveFileId }, token: TOKEN_A });
  ok(rs.statusCode === 200 && rs.text.length > 0, 'a stage photo (Storage) streams through the server');
}

{
  // Photos tab
  const r = await call({ query: { sv: 'photos', apt: 'A1-1' }, token: TOKEN_A });
  ok(r.statusCode === 200 && r.json.photos.length === 3, 'photos: the Photos folder and its stage subfolders (3 files)');
  ok(!r.text.includes('SECRET_NOTE_PHOTO') && !r.text.includes('FOLDER') && !r.text.includes('DRIVEPHOTO') && !r.text.includes('contract'),
    'photos: no notes folders, no documents, no Drive ids');
  ok(!driveCalls.some(c => c[1] === 'TASKNOTES_1'), 'the notes subfolder is never even listed');
  ok((await call({ query: { sv: 'photos', apt: 'B1-7' }, token: TOKEN_A })).statusCode === 404, 'photos of another project\'s apartment → 404');
  ok((await call({ query: { sv: 'photos', apt: '../../x' }, token: TOKEN_A })).statusCode === 400, 'traversal in apt → 400');
}

const PIN_HEADERS = { 'content-type': 'application/json' };
let myPin;
{
  const a1 = view.apartments.find(a => a.id === 'A1-1');
  const a2 = view.apartments.find(a => a.id === 'A1-2');
  const good = { apartmentId: 'A1-1', planRef: a1.planRef, page: 0, xPct: 12.5, yPct: 40, text: 'Check this duct' };
  const r = await call({ method: 'POST', query: { sv: 'pin' }, token: TOKEN_A, headers: PIN_HEADERS, body: { ...good, linkId: 'L_B', projectId: 'netiv', collection: 'apartments' } });
  ok(r.statusCode === 200 && r.json?.pin?.text === 'Check this duct', 'a good pin is saved');
  myPin = r.json?.pin;
  const stored = db.get('sharedPins').get(myPin.id)?.fields;
  ok(stored?.linkId === 'L_A' && stored?.projectId === 'wolfson' && stored?.planFileId === 'PLAN_A1_1_PDF', 'the pin is filed under the TOKEN\'s link and project, whatever the body says');
  const tries = [
    [{ ...good, text: 'x'.repeat(501) }, 'text over 500'],
    [{ ...good, text: '   ' }, 'empty text'],
    [{ ...good, xPct: 101 }, 'x out of range'],
    [{ ...good, yPct: -1 }, 'y out of range'],
    [{ ...good, xPct: '5' }, 'x not a number'],
    [{ ...good, page: 1.5 }, 'page not an integer'],
    [{ ...good, apartmentId: 'B1-7' }, 'another project\'s apartment'],
    [{ ...good, apartmentId: 'A1-GONE' }, 'a deleted apartment'],
    [{ ...good, planRef: a2.planRef }, 'another apartment\'s plan'],
    [{ ...good, planRef: sealRef(secret, 'L_B', 'd', 'PLAN_B1_7_PDF') }, 'another link\'s plan ref'],
    [{ ...good, apartmentId: { $gt: '' } }, 'an object for the apartment id'],
  ];
  for (const [body, what] of tries) {
    const x = await call({ method: 'POST', query: { sv: 'pin' }, token: TOKEN_A, headers: PIN_HEADERS, body });
    ok(x.statusCode === 400, `pin refused: ${what}`);
  }
  ok((await call({ method: 'POST', query: { sv: 'pin' }, token: TOKEN_A, headers: { ...PIN_HEADERS, 'content-length': '5000' }, body: good })).statusCode === 400, 'pin refused: body over 4 KB');
  ok((await call({ method: 'POST', query: { sv: 'pin' }, token: TOKEN_A, headers: PIN_HEADERS, body: { ...good, junk: 'y'.repeat(5000) } })).statusCode === 400, 'pin refused: parsed body over 4 KB');
  ok((await call({ method: 'POST', query: { sv: 'pin' }, token: TOKEN_A, headers: { 'content-type': 'text/plain' }, body: good })).statusCode === 400, 'pin refused: not JSON');
  ok((await call({ method: 'POST', query: { sv: 'pin' }, token: TOKEN_A, headers: PIN_HEADERS, body: [good] })).statusCode === 400, 'pin refused: an array');
  ok((await call({ method: 'POST', query: { sv: 'pin' }, token: TOKEN_OFF, headers: PIN_HEADERS, body: good })).statusCode === 404, 'pin refused: turned-off link');
  const again = await call({ query: { sv: 'data' }, token: TOKEN_A });
  ok(again.json.pins.length === 1 && again.json.pins[0].planRef === a1.planRef, 'the viewer gets its pin back, matched to its plan');
  const asB = await call({ query: { sv: 'data' }, token: TOKEN_B });
  ok(asB.json.pins.every(p => p.text !== 'Check this duct'), 'another link never sees this link\'s pins');
}

{
  const otherId = 'sp_' + 'b'.repeat(32);
  const r = await call({ method: 'DELETE', query: { sv: 'pin', id: otherId }, token: TOKEN_A });
  ok(r.statusCode === 404 && db.get('sharedPins').has(otherId), 'deleting another link\'s pin → 404, pin untouched');
  ok((await call({ method: 'DELETE', query: { sv: 'pin', id: '../apartments/A1-1' }, token: TOKEN_A })).statusCode === 400, 'delete with a path in the id → 400');
  const mine = await call({ method: 'DELETE', query: { sv: 'pin', id: myPin.id }, token: TOKEN_A });
  ok(mine.statusCode === 200 && !db.get('sharedPins').has(myPin.id), 'deleting its own pin works');
}

{
  ok((await call({ method: 'PUT', query: { sv: 'data' }, token: TOKEN_A })).statusCode === 405, 'PUT → 405');
  ok((await call({ query: { sv: 'apartments' }, token: TOKEN_A })).statusCode === 405, 'unknown action → 405');
  ok((await call({ method: 'POST', query: { sv: 'data' }, token: TOKEN_A, headers: PIN_HEADERS, body: {} })).statusCode === 405, 'POST to data → 405');
}

{
  // The write audit: everything this route ever wrote.
  const touched = writes.map(w => (w.update?.name ?? w.delete).split('/documents/')[1].split('/')[0]);
  ok(touched.every(c => c === 'sharedPins' || c === 'sharedLinks'), `writes only to sharedPins / sharedLinks (saw: ${[...new Set(touched)].join(', ')})`);
  const linkWrites = writes.filter(w => w.update?.name?.includes('/sharedLinks/'));
  ok(linkWrites.every(w => JSON.stringify(w.updateMask.fieldPaths) === '["lastOpenedAt"]'
    && w.updateTransforms.every(t => ['openCount', '_updatedAt'].includes(t.fieldPath))), 'a link is only ever touched in lastOpenedAt / openCount');
}

{
  _resetForTests();
  let last;
  for (let i = 0; i < 32; i++) last = await call({ query: { sv: 'data' }, token: TOKEN_A, ip: '10.9.9.9' });
  ok(last.statusCode === 429, 'more than 30 opens a minute from one place → 429');
  _resetForTests();
  for (let i = 0; i < 40; i++) last = await call({ query: { sv: 'data' }, token: tok(), ip: '10.8.8.8' });
  const good = await call({ query: { sv: 'data' }, token: TOKEN_A, ip: '10.8.8.8' });
  ok(good.statusCode === 429, 'a place guessing tokens is slowed down, even with a good one');
}

{
  // Errors say nothing about the inside.
  const broken = async () => { throw new Error('INTERNAL_DETAIL_SHOULD_NOT_LEAK'); };
  const res = new Res();
  _resetForTests();
  await handleShared({ method: 'GET', query: { sv: 'data' }, headers: { 'x-share-token': TOKEN_A } }, res, { env, fetchImpl: broken, drive });
  ok(res.statusCode === 500 && !res.text.includes('INTERNAL'), 'an internal error is a plain 500 with no detail');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
