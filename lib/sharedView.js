// THE SHARED VIEW (owner, 2026-11-18: "this link has to be super secure to make sure people can't hack back into the
// system"). An office user creates a link in Project settings → Shared; an OUTSIDE person (a developer, a site
// manager) opens /s/<token> and sees that ONE project's board and building views, and a read-only apartment window
// (details without address or phone, photos, stages with their pictures, the plan). The only thing they can write is
// their own plan pins.
//
// Everything the outside page knows comes from HERE, never from the browser talking to the database:
//
//   GET  /api/share?sv=data           the project, as an explicit ALLOWLIST projection (never copy-then-delete)
//   GET  /api/share?sv=media&apt=…    one apartment's site pictures (its stages' photos), read only when looked at
//   GET  /api/share?sv=photos&apt=…   one apartment's Drive photos (folder ids never leave the server)
//   GET  /api/share?sv=file&f=<ref>   the bytes of one file the projection named (plan / photo / video)
//   POST /api/share?sv=pin            add a pin                  — the ONLY write, to `sharedPins`
//   DELETE /api/share?sv=pin&id=…     remove one of THIS link's pins
//   POST /api/share?sv=pinfile&pin=…  one attachment (photo / PDF / recording, ≤ 4 MB, checked by its bytes) for one
//                                     of THIS link's pins → the apartment's Drive "Punch List/Outside" folder; the pin
//                                     keeps the file's id, the outside only ever gets a sealed ref to it
//   DELETE /api/share?sv=pinfile&pin=…&id=…   take one attachment off one of THIS link's pins
//
// The token rides in the `x-share-token` header (or `t=` for a <video>/<img> that cannot send one). Only its
// SHA-256 is stored (`sharedLinks.tokenHash`); a link is found by that hash, refused when turned off (`revokedAt`),
// and every refusal is the same plain 404 so nothing is learnt by guessing.
//
// Files are never named by their Drive id on the outside. The projection hands out REFS: the link's id and the file
// id sealed with AES-256-GCM under a server-only key (deterministic IV = HMAC of the plaintext, so a file keeps one
// ref and pins can be matched to their plan). A ref made for one link opens nothing under another, a ref nobody was
// given cannot be forged, and the file route needs no database read beyond the link itself.
//
// Lives in /lib, reached through api/share.js — Vercel's plan allows 12 files in /api and there are already 12.
import crypto from 'crypto';
import { firestoreBase } from './fullBackup.js';

// ── small helpers ────────────────────────────────────────────────────────────

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;               // 32 random bytes, base64url, no padding
const REF_RE = /^[A-Za-z0-9_-]{40,1400}$/;
const APT_ID_RE = /^[A-Za-z0-9_.\- ]{1,120}$/;
const PIN_ID_RE = /^sp_[a-f0-9]{32}$/;
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;
const MAX_PIN_TEXT = 500;
const MAX_PINS_PER_LINK = 1000;
const MAX_BODY_BYTES = 4096;
const BUILT_IN_BUILDINGS = {
  wolfson: [{ id: 'A1', name: 'Building A1' }, { id: 'A2', name: 'Building A2' }, { id: 'A3', name: 'Building A3' }],
  netiv: [{ id: 'B1', name: 'Building B1' }, { id: 'B2', name: 'Building B2' }],
};
const BUILT_IN_NAMES = { wolfson: 'Wolfson Residence', netiv: 'Netiv Neve Shamir' };
const MARKS = new Set(['todo', 'doing', 'pending', 'done', 'off']);
const ANSWERS = new Set(['yes', 'no', 'unknown']);
const MEDIA_TYPES = /^(image\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/pdf)$/i;
/** What the file route will stream: the media above, plus a pin's voice recordings. */
const STREAM_TYPES = /^(image\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|application\/pdf)$/i;

// A pin's ATTACHMENTS from outside (owner, 2026-11-19: "when they pin … allow me to also add a recording, and
// attachments"). One file per request, sent as raw bytes. Vercel refuses any request body over 4.5 MB, so the cap is
// 4 MB (the page shrinks big photos before sending). Only these types, and the bytes must look like what they claim.
const PIN_FILE_MAX_BYTES = 4 * 1024 * 1024;
const MAX_FILES_PER_PIN = 10;
const PIN_FILE_ID_RE = /^pf_[a-f0-9]{16}$/;
const PIN_FILE_TYPES = {
  'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'ftyp', 'image/heif': 'ftyp',
  'application/pdf': 'pdf',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'ftyp', 'audio/x-m4a': 'ftyp', 'audio/aac': 'aac', 'audio/mpeg': 'mp3',
  'audio/wav': 'wav', 'audio/x-wav': 'wav',
};
/** Where an outside pin's files land, inside the apartment's own Drive folder (never listed to the outside). */
const PIN_FOLDER = 'Punch List';
const PIN_SUBFOLDER = 'Outside';

/** Do these bytes really start the way a file of this kind does? */
export function looksLike(kind, b) {
  if (!b || b.length < 12) return false;
  const at = (off, s) => b.subarray(off, off + s.length).toString('latin1') === s;
  switch (kind) {
    case 'jpeg': return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'png': return b[0] === 0x89 && at(1, 'PNG\r\n\x1a\n');
    case 'gif': return at(0, 'GIF87a') || at(0, 'GIF89a');
    case 'webp': return at(0, 'RIFF') && at(8, 'WEBP');
    case 'wav': return at(0, 'RIFF') && at(8, 'WAVE');
    case 'ftyp': return at(4, 'ftyp');
    case 'pdf': return at(0, '%PDF-');
    case 'webm': return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    case 'ogg': return at(0, 'OggS');
    case 'aac': return b[0] === 0xff && (b[1] & 0xf6) === 0xf0;
    case 'mp3': return at(0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    default: return false;
  }
}
/** A file name safe for Drive and for showing back: no paths, no control characters, not too long. */
function safeName(v) {
  // eslint-disable-next-line no-control-regex
  const s = String(v ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.replace(/^\.+/, '').slice(0, 100) || 'file';
}

/** Tzvi's own name, as the office's approvals record it (the same rule as src/data/stageHow.ts isTzviName). */
const isTzvi = name => {
  const n = String(name ?? '').trim();
  return /^(tzvi|zvi)\b/i.test(n) || /^צבי(\s|$)/.test(n);
};
export const sha256Hex = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const collName = (pid, base) => (pid === 'wolfson' ? base : `${pid}_${base}`);

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const bool = v => (typeof v === 'boolean' ? v : undefined);
/** Drop undefined keys, so the projection carries only what was actually allowed in. */
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// ── Firestore over REST (the same door lib/fullBackup.js uses) ──────────────

/** Firestore's typed value → plain JS. */
export function fromFs(v) {
  if (!v || typeof v !== 'object') return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromFs);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromFs(x)]));
  return undefined;
}
/** Plain JS → Firestore's typed value (strings, numbers, null, flat maps — all a pin needs). */
export function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
}
const docFields = d => Object.fromEntries(Object.entries(d?.fields ?? {}).map(([k, x]) => [k, fromFs(x)]));
const docId = d => String(d?.name ?? '').split('/').pop();

function withKey(url, env) {
  const key = env.FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY;
  return key ? `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}` : url;
}

function makeDb(fetchImpl, env) {
  const base = firestoreBase(env);
  const ok = async (r, what) => {
    if (!r.ok) throw new Error(`${what}: ${r.status}`);
    return r.json();
  };
  return {
    /** One document, or null. */
    async get(coll, id) {
      const r = await fetchImpl(withKey(`${base}/${encodeURIComponent(coll)}/${encodeURIComponent(id)}`, env));
      if (r.status === 404) return null;
      const d = await ok(r, `get ${coll}`);
      return { id: docId(d), updateTime: d.updateTime, ...docFields(d) };
    },
    /** Every document of a collection (optionally only some fields). */
    async list(coll, mask) {
      const out = [];
      let page = '';
      for (let i = 0; i < 200; i++) {
        const q = [`pageSize=300`, ...(mask ?? []).map(f => `mask.fieldPaths=${encodeURIComponent(f)}`),
          ...(page ? [`pageToken=${encodeURIComponent(page)}`] : [])].join('&');
        const r = await fetchImpl(withKey(`${base}/${encodeURIComponent(coll)}?${q}`, env));
        if (r.status === 404) break;
        const j = await ok(r, `list ${coll}`);
        for (const d of j.documents ?? []) out.push({ id: docId(d), ...docFields(d) });
        page = j.nextPageToken ?? '';
        if (!page) break;
      }
      return out;
    },
    /** Documents where one field equals one string (optionally only some fields). */
    async where(coll, field, value, limit, select) {
      const r = await fetchImpl(withKey(`${base}:runQuery`, env), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: coll }],
          where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
          ...(select ? { select: { fields: select.map(f => ({ fieldPath: f })) } } : {}),
          ...(limit ? { limit } : {}),
        } }),
      });
      const rows = await ok(r, `query ${coll}`);
      return (Array.isArray(rows) ? rows : []).filter(x => x.document)
        .map(x => ({ id: docId(x.document), updateTime: x.document.updateTime, ...docFields(x.document) }));
    },
    /** Atomic writes (Firestore's commit). */
    async commit(writes) {
      const r = await fetchImpl(withKey(`${base}:commit`, env), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }),
      });
      return ok(r, 'commit');
    },
    docName(coll, id) {
      // The commit API wants the full resource name: projects/…/documents/<coll>/<id>.
      const path = base.replace(/^https?:\/\/[^/]+\/v1\//, '');
      return `${path}/${coll}/${id}`;
    },
  };
}

// ── the sealed file refs ─────────────────────────────────────────────────────

/** The server-only key: SHARE_LINK_SECRET, else derived from the service account's private key (never sent out). */
export function shareSecret(env = process.env) {
  if (env.SHARE_LINK_SECRET && env.SHARE_LINK_SECRET.length >= 32) return crypto.createHash('sha256').update(env.SHARE_LINK_SECRET).digest();
  try {
    const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON || '');
    if (sa.private_key) return crypto.createHash('sha256').update(`tzviair-shared-view-v1|${sa.private_key}`).digest();
  } catch { /* fall through */ }
  throw new Error('no shared-view secret');
}
const subKey = (secret, label) => crypto.createHmac('sha256', secret).update(label).digest();

/** Seal (linkId, kind, value) into an opaque ref. kind: 'd' = Drive file id, 's' = Firebase Storage URL. */
export function sealRef(secret, linkId, kind, value) {
  const plain = Buffer.from(`${linkId}\n${kind}\n${value}`, 'utf8');
  const iv = crypto.createHmac('sha256', subKey(secret, 'iv')).update(plain).digest().subarray(0, 12);
  const c = crypto.createCipheriv('aes-256-gcm', subKey(secret, 'enc'), iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return b64u(Buffer.concat([iv, ct, c.getAuthTag()]));
}
/** Open a ref — only one sealed by this server, for THIS link. Anything else: null. */
export function openRef(secret, linkId, ref) {
  if (typeof ref !== 'string' || !REF_RE.test(ref)) return null;
  try {
    const raw = unb64u(ref);
    if (raw.length < 12 + 16 + 5) return null;
    const iv = raw.subarray(0, 12), tag = raw.subarray(raw.length - 16), ct = raw.subarray(12, raw.length - 16);
    const d = crypto.createDecipheriv('aes-256-gcm', subKey(secret, 'enc'), iv);
    d.setAuthTag(tag);
    const plain = Buffer.concat([d.update(ct), d.final()]).toString('utf8');
    const [lid, kind, ...rest] = plain.split('\n');
    const value = rest.join('\n');
    if (lid !== linkId || (kind !== 'd' && kind !== 's') || !value) return null;
    if (kind === 'd' && !DRIVE_ID_RE.test(value)) return null;
    if (kind === 's' && !isStorageUrl(value)) return null;
    return { kind, value };
  } catch { return null; }
}
function isStorageUrl(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'firebasestorage.googleapis.com'; } catch { return false; }
}
function driveIdOf(link) {
  if (typeof link !== 'string') return null;
  const m = link.match(/\/(?:file|document|presentation)\/d\/([a-zA-Z0-9_-]+)/) ?? link.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m && DRIVE_ID_RE.test(m[1]) ? m[1] : null;
}
function folderIdOf(link) {
  if (typeof link !== 'string') return null;
  const m = link.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m && DRIVE_ID_RE.test(m[1]) ? m[1] : null;
}

// ── the link ─────────────────────────────────────────────────────────────────

/** The live link a token opens, or null (bad shape, unknown, turned off). */
export async function findLink(db, token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  const hash = sha256Hex(token);
  const rows = await db.where('sharedLinks', 'tokenHash', hash, 1);
  const l = rows[0];
  if (!l || typeof l.tokenHash !== 'string') return null;
  // Belt and braces: the stored hash really is this token's.
  const a = Buffer.from(l.tokenHash), b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (l.revokedAt) return null;
  if (typeof l.projectId !== 'string' || !/^[a-z0-9_-]{1,60}$/i.test(l.projectId) || l.projectId === 'general') return null;
  return { id: l.id, name: str(l.name, 80) ?? '', projectId: l.projectId };
}

// ── the projection (an ALLOWLIST — nothing reaches the outside unless named here) ──

function stageOut(s) {
  const includes = Array.isArray(s.includes) ? s.includes.filter(w => typeof w === 'string').slice(0, 40).map(w => w.slice(0, 80)) : undefined;
  let includesTr;
  if (includes && s.includesTr && typeof s.includesTr === 'object') {
    includesTr = {};
    for (const w of includes) {
      const t = s.includesTr[w];
      if (t && typeof t === 'object') includesTr[w] = clean({ en: str(t.en, 80), he: str(t.he, 80) });
    }
  }
  const ids = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 2000).map(x => x.slice(0, 120)) : undefined);
  return clean({
    id: str(s.id, 120), name: str(s.name, 120) ?? '', nameHe: str(s.nameHe, 120), color: str(s.color, 20) ?? '#94a3b8',
    order: num(s.order) ?? 0, active: s.active !== false, includes, includesTr,
    kind: s.kind === 'marker' ? 'marker' : s.kind === 'work' ? 'work' : undefined,
    custom: bool(s.custom), onApartments: ids(s.onApartments), onTipus: ids(s.onTipus), onBuildings: ids(s.onBuildings),
    everywhere: bool(s.everywhere),
    how: ['site', 'inspection', 'office'].includes(s.how) ? s.how : undefined,
    doneWord: str(s.doneWord, 40), doneWordHe: str(s.doneWordHe, 40),
    createdAt: '', updatedAt: '',
  });
}

/** Geometry only: numbers, short strings, booleans, nested plain objects/arrays — for the board's layout maps. */
function geometry(v, depth = 0) {
  if (depth > 6) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.slice(0, 60);
  if (v === null) return null;
  if (Array.isArray(v)) return v.slice(0, 500).map(x => geometry(x, depth + 1));
  if (typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v).slice(0, 500)) { const g = geometry(x, depth + 1); if (g !== undefined) out[k.slice(0, 60)] = g; }
    return out;
  }
  return undefined;
}

function boardOut(bs) {
  const b = bs && typeof bs === 'object' ? bs : {};
  return clean({
    tipusim: Array.isArray(b.tipusim) ? b.tipusim.filter(x => typeof x === 'string').slice(0, 100).map(x => x.slice(0, 40)) : undefined,
    tipusStages: b.tipusStages && typeof b.tipusStages === 'object' ? geometry(b.tipusStages) : undefined,
    customButtons: Array.isArray(b.customButtons)
      ? b.customButtons.filter(c => c && typeof c.id === 'string').slice(0, 50).map(c => ({ id: c.id.slice(0, 80), name: str(c.name, 80) ?? '' }))
      : undefined,
    floorHeights: b.floorHeights ? geometry(b.floorHeights) : undefined,
    buildingLayout: b.buildingLayout ? geometry(b.buildingLayout) : undefined,
    stickyBuildingName: bool(b.stickyBuildingName),
  });
}

function aptOut(a, ctx) {
  const marks = {};
  if (a.stageMarks && typeof a.stageMarks === 'object') {
    for (const [k, v] of Object.entries(a.stageMarks)) if (ctx.stageIds.has(k) && MARKS.has(v)) marks[k] = v;
  }
  const answers = {};
  if (a.customAnswers && typeof a.customAnswers === 'object') {
    for (const [k, v] of Object.entries(a.customAnswers)) if (ctx.buttonIds.has(k) && ANSWERS.has(v)) answers[k] = v;
  }
  const done = {};
  if (a.stageDone && typeof a.stageDone === 'object') {
    for (const [k, v] of Object.entries(a.stageDone)) if (ctx.stageIds.has(k) && v && typeof v.at === 'string') done[k] = { by: '', at: v.at.slice(0, 40) };
  }
  // Inspections: when, which stage, approved or not, and the pictures — never the inspector's notes.
  const inspections = Array.isArray(a.inspections) ? a.inspections.slice(0, 50).map((ins, i) => clean({
    id: `i${i}`, at: str(ins?.at, 40) ?? '', byId: '', byName: (str(ins?.byName, 60) ?? '').split(' ')[0],
    afterStageId: typeof ins?.afterStageId === 'string' && ctx.stageIds.has(ins.afterStageId) ? ins.afterStageId : null,
    stageId: typeof ins?.stageId === 'string' && ctx.stageIds.has(ins.stageId) ? ins.stageId : undefined,
    approved: bool(ins?.approved),
    files: (Array.isArray(ins?.files) ? ins.files : []).slice(0, 60)
      .filter(f => f && typeof f.driveFileId === 'string' && DRIVE_ID_RE.test(f.driveFileId) && MEDIA_TYPES.test(String(f.mimeType ?? '')))
      .map(f => ({ filename: '', mimeType: f.mimeType, driveFileId: ctx.seal('d', f.driveFileId) })),
  })) : undefined;
  // Someone working here now (the board's green glow) — never who.
  const working = Array.isArray(a.siteVisits) ? a.siteVisits.filter(v => v && v.status === 'working').slice(0, 10)
    .map((v, i) => ({ id: `v${i}`, byId: '', byName: '', startedAt: str(v.startedAt, 40) ?? '', status: 'working' })) : undefined;
  const planId = driveIdOf(a.plansPdfLink);
  return clean({
    id: a.id,
    buildingId: str(a.buildingId, 20) ?? '',
    apartmentNumber: str(a.apartmentNumber, 20) ?? '',
    displayName: str(a.displayName, 120) ?? '',
    floor: num(a.floor) ?? 0,
    colPosition: num(a.colPosition) ?? 1,
    colSpan: num(a.colSpan) ?? 1,
    coveredBy: str(a.coveredBy, 120),
    isDuplexApt: a.isDuplexApt === true,
    currentStageId: typeof a.currentStageId === 'string' && ctx.stageIds.has(a.currentStageId) ? a.currentStageId : null,
    classification: a.classification === 'shinui' ? 'shinui' : 'standard',
    shinuiDetails: null,
    generalNotes: '',
    isUnnamed: a.isUnnamed === true,
    mergedWith: str(a.mergedWith, 120),
    tipus: str(a.tipus, 40),
    crew: str(a.crew, 60),
    acCompany: str(a.acCompany, 60),
    stageMarks: Object.keys(marks).length ? marks : undefined,
    bubbles: bool(a.bubbles),
    stageDone: Object.keys(done).length ? done : undefined,
    customAnswers: Object.keys(answers).length ? answers : undefined,
    inspections: inspections?.length ? inspections : undefined,
    siteVisits: working?.length ? working : undefined,
    planRef: planId ? ctx.seal('d', planId) : undefined,
    // Was the starred plan approved by Tzvi himself? (owner, 2026-11-19: the outside link says "Approved by Tzvi", or
    // in red "This plan was not approved by Tzvi yet"). Only yes / no leaves the server — never who else approved it.
    planByTzvi: planId ? isTzvi(a.plansApprovedBy) : undefined,
    createdAt: '', updatedAt: '', updatedBy: '', updatedByName: '',
  });
}

/**
 * Build the whole outside view of one project. Returns { view, internal }: `view` goes to the browser; `internal`
 * (each apartment's Drive folder, its plan's real id) never leaves the server.
 */
export async function buildProjection(db, link, secret) {
  const pid = link.projectId;
  const seal = (kind, value) => sealRef(secret, link.id, kind, value);
  const [app, stagesAll, tomb, aptDocs, pinDocs] = await Promise.all([
    db.get('settings', 'app'),
    db.list('stages'),
    db.get(collName(pid, 'tombstones'), 'deleted'),
    db.list(collName(pid, 'apartments')),
    db.where('sharedPins', 'linkId', link.id),
  ]);
  const boardAll = app?.boardSettings && typeof app.boardSettings === 'object' ? app.boardSettings : {};
  const custom = Array.isArray(app?.customProjects) ? app.customProjects.find(p => p && p.id === pid) : null;
  if (!BUILT_IN_BUILDINGS[pid] && !custom) return null;      // a project that no longer exists
  const buildings = BUILT_IN_BUILDINGS[pid]
    ?? (Array.isArray(boardAll[pid]?.buildings) ? boardAll[pid].buildings : [])
      .filter(b => b && typeof b.id === 'string').map(b => ({ id: b.id.slice(0, 20), name: str(b.name, 60) ?? b.id }));
  const buildingIds = new Set(buildings.map(b => b.id));
  const board = boardOut(boardAll[pid]);
  const stages = stagesAll.filter(s => s && typeof s.id === 'string' && !s.projectId).map(stageOut);
  const stageIds = new Set(stages.map(s => s.id));
  const buttonIds = new Set((board.customButtons ?? []).map(c => c.id));
  const gone = new Set(Object.keys(tomb?.ids && typeof tomb.ids === 'object' ? tomb.ids : {}));
  const ctx = { stageIds, buttonIds, seal };

  const apartments = [];
  const internal = { folderOf: new Map(), planOf: new Map() };
  const seen = new Set();
  for (const a of aptDocs) {
    if (!a || typeof a.id !== 'string' || seen.has(a.id) || gone.has(a.id) || !buildingIds.has(a.buildingId)) continue;
    seen.add(a.id);
    apartments.push(aptOut(a, ctx));
    const folder = folderIdOf(a.driveLink);
    if (folder) internal.folderOf.set(a.id, folder);
    const plan = driveIdOf(a.plansPdfLink);
    if (plan) internal.planOf.set(a.id, plan);
  }
  const pins = pinDocs.filter(p => p.projectId === pid && seen.has(p.apartmentId)).map(p => pinOut(p, seal));
  const view = {
    link: { name: link.name },
    project: { id: pid, name: BUILT_IN_NAMES[pid] ?? str(custom?.name, 80) ?? pid },
    buildings, board, stages, apartments, pins,
  };
  internal.stageIds = stageIds;
  return { view, internal };
}

/**
 * One apartment's site pictures (a stage's photos), read when that apartment is looked at — never the whole
 * project's on every open (the read bill: 2026-09-22). The office's own rule: only the uploads of THIS apartment's
 * own tasks.
 */
export async function sitePhotos(db, link, aptId, stageIds, seal) {
  const pid = link.projectId;
  const [photoDocs, taskDocs] = await Promise.all([
    db.where(collName(pid, 'contractorPhotos'), 'apartmentId', aptId, 2000,
      ['apartmentId', 'assignmentId', 'stageId', 'fileType', 'mimeType', 'driveFileId', 'storageUrl', 'uploadedAt']),
    db.where(collName(pid, 'contractorAssignments'), 'apartmentId', aptId, 2000, ['apartmentId']),
  ]);
  const tasks = new Set(taskDocs.filter(t => t.apartmentId === aptId).map(t => t.id));
  const photos = [];
  for (const p of photoDocs) {
    if (!p || p.apartmentId !== aptId || !tasks.has(p.assignmentId)) continue;
    let ref = null;
    if (typeof p.driveFileId === 'string' && DRIVE_ID_RE.test(p.driveFileId)) ref = seal('d', p.driveFileId);
    else if (isStorageUrl(p.storageUrl)) ref = seal('s', p.storageUrl);
    if (!ref) continue;
    const fileType = p.fileType === 'video' ? 'video' : p.fileType === 'file' ? 'file' : 'image';
    if (fileType === 'file') continue;
    photos.push(clean({
      id: `${aptId}#${photos.length}`, assignmentId: '', apartmentId: aptId, contractorId: '', dataUrl: '', filename: '',
      fileType, stageId: typeof p.stageId === 'string' && stageIds.has(p.stageId) ? p.stageId : undefined,
      mimeType: MEDIA_TYPES.test(String(p.mimeType ?? '')) ? p.mimeType : (fileType === 'video' ? 'video/mp4' : 'image/jpeg'),
      uploadedAt: str(p.uploadedAt, 40) ?? '', driveFileId: ref,
    }));
  }
  return photos;
}

/** One attachment as the outside sees it: a sealed ref, its type and its name — never the Drive id. */
function pinFileOut(f, seal) {
  if (!f || typeof f !== 'object' || !PIN_FILE_ID_RE.test(String(f.id ?? '')) || !DRIVE_ID_RE.test(String(f.driveFileId ?? ''))) return null;
  if (!Object.hasOwn(PIN_FILE_TYPES, String(f.mimeType ?? ''))) return null;
  return { id: f.id, ref: seal('d', f.driveFileId), mimeType: f.mimeType, name: safeName(f.name) };
}

function pinOut(p, seal) {
  const files = (Array.isArray(p.files) ? p.files : []).slice(0, MAX_FILES_PER_PIN).map(f => pinFileOut(f, seal)).filter(Boolean);
  return {
    id: p.id, apartmentId: p.apartmentId, planRef: DRIVE_ID_RE.test(String(p.planFileId ?? '')) ? seal('d', p.planFileId) : '',
    page: num(p.page) ?? 0, xPct: num(p.xPct) ?? 0, yPct: num(p.yPct) ?? 0, text: str(p.text, MAX_PIN_TEXT) ?? '',
    createdAt: str(p.createdAt, 40) ?? '', files,
  };
}

// ── Drive (the service account, read-only) ──────────────────────────────────

/** The real Drive door — injected so tests can stand in for it. */
export async function realDrive(env = process.env) {
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });
  return {
    async children(folderId) {
      const out = [];
      let pageToken;
      for (let i = 0; i < 20; i++) {
        const r = await drive.files.list({
          q: `'${folderId}' in parents and trashed = false`, pageSize: 1000, pageToken,
          fields: 'nextPageToken, files(id,name,mimeType)', supportsAllDrives: true, includeItemsFromAllDrives: true,
        });
        out.push(...(r.data.files ?? []));
        pageToken = r.data.nextPageToken;
        if (!pageToken) break;
      }
      return out;
    },
    async meta(fileId) {
      const r = await drive.files.get({ fileId, fields: 'id,mimeType,size,thumbnailLink,trashed', supportsAllDrives: true });
      return r.data;
    },
    async media(fileId, range) {
      const r = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream', ...(range ? { headers: { Range: range } } : {}) });
      const h = r.headers ?? {};
      const get = n => (typeof h.get === 'function' ? h.get(n) : h[n]);
      return { status: r.status, stream: r.data, contentRange: get('content-range'), contentLength: get('content-length') };
    },
    async thumb(thumbnailLink, w) {
      const token = await auth.getAccessToken();
      const url = thumbnailLink.replace(/=s\d+$/, `=w${w}`);
      return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    },
  };
}

/**
 * The ONE Drive door that can write — used only by an outside pin's attachment upload, and only for: find (or make)
 * the apartment's "Punch List/Outside" folder, and put one new file in it. Everything else stays on the read-only
 * door above. Injected in tests.
 */
export async function realDriveWriter(env = process.env) {
  const { google } = await import('googleapis');
  const { Readable } = await import('stream');
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const drive = google.drive({ version: 'v3', auth });
  return {
    async ensureFolder(parentId, name) {
      if (!DRIVE_ID_RE.test(parentId) || !/^[A-Za-z ]{1,40}$/.test(name)) throw new Error('bad folder');
      const r = await drive.files.list({
        q: `'${parentId}' in parents and name = '${name}' and mimeType = '${FOLDER}' and trashed = false`,
        fields: 'files(id)', pageSize: 5, supportsAllDrives: true, includeItemsFromAllDrives: true,
      });
      const hit = r.data.files?.[0]?.id;
      if (hit) return hit;
      const made = await drive.files.create({
        requestBody: { name, mimeType: FOLDER, parents: [parentId] }, fields: 'id', supportsAllDrives: true,
      });
      return made.data.id;
    },
    async create(parentId, name, mimeType, bytes) {
      const made = await drive.files.create({
        requestBody: { name, parents: [parentId] }, media: { mimeType, body: Readable.from(bytes) },
        fields: 'id', supportsAllDrives: true,
      });
      return made.data.id;
    },
  };
}

const normFolder = n => String(n ?? '').normalize('NFKC').replace(/[​-‏⁠﻿]/g, '').toLowerCase()
  .replace(/[_\-–—.]+/g, ' ').replace(/\s+/g, ' ').trim();
const FOLDER = 'application/vnd.google-apps.folder';
/** Subfolders an outside person never sees: notes of every kind, punch-list attachments. */
const PRIVATE_FOLDER = /note|הער|punch|פאנץ|private|office|משרד/i;

/** One apartment's Photos folder, as refs — the same folder rule as the office's Photos tab, minus the notes. */
export async function listPhotos(drive, folderId, seal) {
  const top = await drive.children(folderId);
  const folders = top.filter(f => f.mimeType === FOLDER);
  const photosFolder = folders.find(f => /^photos?$/.test(normFolder(f.name)) || normFolder(f.name) === 'תמונות')
    ?? folders.find(f => /\bphotos?\b/.test(normFolder(f.name)) || normFolder(f.name).includes('תמונות'));
  if (!photosFolder) return [];
  const inside = await drive.children(photosFolder.id);
  const out = [];
  const take = (f, folder) => {
    if (f.mimeType === FOLDER || !/^(image|video)\//i.test(String(f.mimeType ?? '')) || !DRIVE_ID_RE.test(String(f.id ?? ''))) return;
    out.push({ ref: seal('d', f.id), mimeType: f.mimeType, folder: String(folder).slice(0, 80) });
  };
  for (const f of inside) take(f, 'Photos');
  const subs = inside.filter(f => f.mimeType === FOLDER && !PRIVATE_FOLDER.test(f.name ?? '')).slice(0, 40);
  const lists = await Promise.all(subs.map(sf => drive.children(sf.id).catch(() => [])));
  subs.forEach((sf, i) => lists[i].forEach(f => take(f, sf.name)));
  return out.slice(0, 2000);
}

// ── per-instance guards: rate limits and a short cache ──────────────────────

const buckets = new Map();
/** Best effort, per warm instance: at most `max` hits per minute for a key. */
export function rateLimited(key, max) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start > 60_000) { b = { start: now, n: 0 }; buckets.set(key, b); }
  b.n++;
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.start > 60_000) buckets.delete(k);
  return b.n > max;
}
// ── the link's log (owner, 2026-11-19: "tracking of who opened it … by IP address … a log of what they're doing") ──
// One short line per thing done — opened, looked at an apartment, its plan, its photos, added / removed a pin — with
// the IP, Vercel's city and country for that IP, and the device. The same line is not repeated within a minute
// (a plan page or a photo strip asks for many files), so the log reads like a diary, not a server dump.
const lastLog = new Map();
const LOG_GAP_MS = 60_000;
function deviceOf(ua) {
  const u = String(ua ?? '');
  const os = /iPad/.test(u) ? 'iPad' : /iPhone/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows'
    : /Mac OS X|Macintosh/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : '';
  const br = /Edg\//.test(u) ? 'Edge' : /SamsungBrowser/.test(u) ? 'Samsung' : /CriOS|Chrome\//.test(u) ? 'Chrome'
    : /FxiOS|Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(' · ') || u.slice(0, 60);
}
function headerText(req, name, max) {
  let v = String(req.headers?.[name] ?? '');
  try { v = decodeURIComponent(v); } catch { /* keep raw */ }
  return v.replace(/[^\p{L}\p{N} .,'()-]/gu, '').slice(0, max);
}
export function logHit(db, link, req, ip, action, apartmentId, now) {
  const key = `${link.id}|${ip}|${action}|${apartmentId ?? ''}`;
  const t = now().getTime();
  if (t - (lastLog.get(key) ?? 0) < LOG_GAP_MS) return;
  lastLog.set(key, t);
  if (lastLog.size > 5000) for (const [k, v] of lastLog) if (t - v > LOG_GAP_MS) lastLog.delete(k);
  const id = `lg_${crypto.randomBytes(12).toString('hex')}`;
  const row = clean({
    id, linkId: link.id, projectId: link.projectId, at: now().toISOString(), action,
    apartmentId: apartmentId ? String(apartmentId).slice(0, 120) : undefined,
    ip: String(ip).slice(0, 60), city: headerText(req, 'x-vercel-ip-city', 60) || undefined,
    country: headerText(req, 'x-vercel-ip-country', 8) || undefined, device: deviceOf(req.headers?.['user-agent']),
  });
  db.commit([{
    update: { name: db.docName('sharedLinkLogs', id), fields: Object.fromEntries(Object.entries(row).map(([k, v]) => [k, toFs(v)])) },
    updateTransforms: [{ fieldPath: '_updatedAt', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { exists: false },
  }]).catch(e => console.warn('shared view: log not saved:', e.message));
}

const cache = new Map();          // linkId → { at, built }
const CACHE_MS = 20_000;
const pinFolders = new Map();     // apartment folder id → its "Punch List/Outside" folder id
export function _resetForTests() { buckets.clear(); cache.clear(); lastLog.clear(); pinFolders.clear(); }

// ── HTTP ─────────────────────────────────────────────────────────────────────

function baseHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}
function send(res, status, body) {
  if (res.headersSent) { try { res.end(); } catch { /* gone */ } return; }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.end(JSON.stringify(body));
}
const notFound = res => send(res, 404, { error: 'not_found' });
const bad = res => send(res, 400, { error: 'bad_request' });

function queryOf(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  try { return Object.fromEntries(new URL(req.url, 'http://x').searchParams); } catch { return {}; }
}
const one = v => (Array.isArray(v) ? v[0] : v);
function ipOf(req) {
  const xf = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim();
  return xf || req.socket?.remoteAddress || '?';
}

/** Is this request for the shared view? (api/share.js asks before anything else.) */
export function isSharedRequest(req) {
  return !!one(queryOf(req).sv);
}

/**
 * The whole shared-view route. `deps` lets tests stand in for the database (fetchImpl), Drive and the clock.
 */
export async function handleShared(req, res, deps = {}) {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  baseHeaders(res);
  const q = queryOf(req);
  const action = one(q.sv);
  const method = req.method;
  if (method === 'OPTIONS') return send(res, 405, { error: 'method' });   // same-origin only: no CORS is offered
  const ip = ipOf(req);
  if (rateLimited(`ip|${ip}`, 900)) return send(res, 429, { error: 'slow_down' });

  const token = String(req.headers?.['x-share-token'] ?? one(q.t) ?? '');
  if (!TOKEN_RE.test(token)) { rateLimited(`bad|${ip}`, 30); return notFound(res); }
  if ((buckets.get(`bad|${ip}`)?.n ?? 0) > 30) return send(res, 429, { error: 'slow_down' });

  let db, secret;
  try { db = makeDb(fetchImpl, env); secret = shareSecret(env); } catch (e) {
    console.error('shared view: not configured:', e.message);
    return send(res, 503, { error: 'unavailable' });
  }

  try {
    const link = await findLink(db, token);
    if (!link) { rateLimited(`bad|${ip}`, 30); return notFound(res); }
    const per = `${ip}|${link.id}`;

    const projection = async (fresh = false) => {
      const hit = cache.get(link.id);
      if (!fresh && hit && now().getTime() - hit.at < CACHE_MS) return hit.built;
      const built = await buildProjection(db, link, secret);
      if (built) cache.set(link.id, { at: now().getTime(), built });
      return built;
    };

    if (action === 'data' && method === 'GET') {
      if (rateLimited(`data|${per}`, 30)) return send(res, 429, { error: 'slow_down' });
      const built = await projection(true);
      if (!built) return notFound(res);
      // Opened: when, and how many times — written field by field, never the whole link.
      db.commit([{
        update: { name: db.docName('sharedLinks', link.id), fields: { lastOpenedAt: toFs(now().toISOString()) } },
        updateMask: { fieldPaths: ['lastOpenedAt'] },
        updateTransforms: [{ fieldPath: 'openCount', increment: { integerValue: '1' } }, { fieldPath: '_updatedAt', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: true },
      }]).catch(e => console.warn('shared view: open count not saved:', e.message));
      logHit(db, link, req, ip, 'open', undefined, now);
      return send(res, 200, built.view);
    }

    if (action === 'media' && method === 'GET') {
      if (rateLimited(`media|${per}`, 120)) return send(res, 429, { error: 'slow_down' });
      const aptId = String(one(q.apt) ?? '');
      if (!APT_ID_RE.test(aptId)) return bad(res);
      const built = await projection();
      if (!built || !built.view.apartments.some(a => a.id === aptId)) return notFound(res);
      const photos = await sitePhotos(db, link, aptId, built.internal.stageIds, (k, v) => sealRef(secret, link.id, k, v));
      logHit(db, link, req, ip, 'apartment', aptId, now);
      return send(res, 200, { photos });
    }

    if (action === 'photos' && method === 'GET') {
      if (rateLimited(`photos|${per}`, 60)) return send(res, 429, { error: 'slow_down' });
      const aptId = String(one(q.apt) ?? '');
      if (!APT_ID_RE.test(aptId)) return bad(res);
      const built = await projection();
      if (!built || !built.view.apartments.some(a => a.id === aptId)) return notFound(res);
      const folder = built.internal.folderOf.get(aptId);
      if (!folder) return send(res, 200, { photos: [] });
      const drive = deps.drive ?? await realDrive(env);
      const photos = await listPhotos(drive, folder, (k, v) => sealRef(secret, link.id, k, v)).catch(e => {
        console.warn('shared view: photos not listed:', e.message);
        return [];
      });
      return send(res, 200, { photos });
    }

    if (action === 'file' && method === 'GET') {
      if (rateLimited(`file|${per}`, 600)) return send(res, 429, { error: 'slow_down' });
      const ref = openRef(secret, link.id, String(one(q.f) ?? ''));
      if (!ref) return notFound(res);
      const w = Math.max(0, Math.min(1600, Math.round(Number(one(q.w) ?? 0)) || 0));
      // The log: a plan (and whose) or a photo — read off the cached projection, never another database trip.
      const hit = cache.get(link.id)?.built;
      const planApt = hit && ref.kind === 'd' ? [...hit.internal.planOf].find(([, id]) => id === ref.value)?.[0] : undefined;
      logHit(db, link, req, ip, planApt ? 'plan' : 'photo', planApt, now);
      return await streamFile(res, req, ref, w, deps.drive ?? await realDrive(env), fetchImpl);
    }

    if (action === 'pin' && method === 'POST') {
      if (rateLimited(`pin|${per}`, 30)) return send(res, 429, { error: 'slow_down' });
      const body = await readBody(req);
      if (!body) return bad(res);
      const built = await projection();
      if (!built) return notFound(res);
      const aptId = typeof body.apartmentId === 'string' ? body.apartmentId : '';
      if (!APT_ID_RE.test(aptId) || !built.view.apartments.some(a => a.id === aptId)) return bad(res);
      const plan = openRef(secret, link.id, String(body.planRef ?? ''));
      // The pin goes on THIS apartment's own plan, and nowhere else.
      if (!plan || plan.kind !== 'd' || built.internal.planOf.get(aptId) !== plan.value) return bad(res);
      const page = body.page, x = body.xPct, y = body.yPct;
      if (!Number.isInteger(page) || page < 0 || page > 999) return bad(res);
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) return bad(res);
      if (typeof body.text !== 'string') return bad(res);
      // eslint-disable-next-line no-control-regex
      const text = body.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
      // Words, or (attachments: true) a recording / files that follow right after — a pin may be just a voice note.
      if ((!text && body.attachments !== true) || text.length > MAX_PIN_TEXT) return bad(res);
      const mine = await db.where('sharedPins', 'linkId', link.id);
      if (mine.length >= MAX_PINS_PER_LINK) return send(res, 409, { error: 'too_many_pins' });
      const id = `sp_${crypto.randomBytes(16).toString('hex')}`;
      const pin = {
        id, linkId: link.id, linkName: link.name, projectId: link.projectId, apartmentId: aptId, planFileId: plan.value,
        page, xPct: Math.round(x * 1000) / 1000, yPct: Math.round(y * 1000) / 1000, text, createdAt: now().toISOString(),
      };
      await db.commit([{
        update: { name: db.docName('sharedPins', id), fields: Object.fromEntries(Object.entries(pin).map(([k, v]) => [k, toFs(v)])) },
        updateTransforms: [{ fieldPath: '_updatedAt', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false },
      }]);
      lastLog.delete(`${link.id}|${ip}|pin-add|${aptId}`);   // every pin is its own line
      logHit(db, link, req, ip, 'pin-add', aptId, now);
      return send(res, 200, { pin: pinOut(pin, (k, v) => sealRef(secret, link.id, k, v)) });
    }

    if (action === 'pin' && method === 'DELETE') {
      if (rateLimited(`pin|${per}`, 30)) return send(res, 429, { error: 'slow_down' });
      const id = String(one(q.id) ?? '');
      if (!PIN_ID_RE.test(id)) return bad(res);
      const pin = await db.get('sharedPins', id);
      // Only a pin THIS link placed; anything else is simply "not found".
      if (!pin || pin.linkId !== link.id || pin.projectId !== link.projectId) return notFound(res);
      await db.commit([{ delete: db.docName('sharedPins', id), currentDocument: { updateTime: pin.updateTime } }]);
      lastLog.delete(`${link.id}|${ip}|pin-remove|${pin.apartmentId}`);
      logHit(db, link, req, ip, 'pin-remove', pin.apartmentId, now);
      return send(res, 200, { ok: true });
    }

    // ── a pin's attachment: POST ?sv=pinfile&pin=<id>&type=<mime>&name=<file name>, the bytes as the body ──
    if (action === 'pinfile' && method === 'POST') {
      if (rateLimited(`pinfile|${per}`, 20)) return send(res, 429, { error: 'slow_down' });
      const id = String(one(q.pin) ?? '');
      if (!PIN_ID_RE.test(id)) return bad(res);
      const type = String(one(q.type) ?? '').split(';')[0].trim().toLowerCase();
      if (!Object.hasOwn(PIN_FILE_TYPES, type)) return send(res, 415, { error: 'type' });
      if (!/^application\/octet-stream\b/i.test(String(req.headers?.['content-type'] ?? ''))) return bad(res);
      if (Number(req.headers?.['content-length'] ?? 0) > PIN_FILE_MAX_BYTES) return send(res, 413, { error: 'too_big' });
      const pin = await db.get('sharedPins', id);
      // Only a pin THIS link placed; anything else is simply "not found".
      if (!pin || pin.linkId !== link.id || pin.projectId !== link.projectId) return notFound(res);
      const had = Array.isArray(pin.files) ? pin.files : [];
      if (had.length >= MAX_FILES_PER_PIN) return send(res, 409, { error: 'too_many_files' });
      const built = await projection();
      if (!built || !built.view.apartments.some(a => a.id === pin.apartmentId)) return notFound(res);
      const folder = built.internal.folderOf.get(pin.apartmentId);
      if (!folder) return send(res, 409, { error: 'no_folder' });
      const bytes = await readBytes(req, PIN_FILE_MAX_BYTES);
      if (bytes === 'too_big') return send(res, 413, { error: 'too_big' });
      if (!bytes || !bytes.length) return bad(res);
      if (!looksLike(PIN_FILE_TYPES[type], bytes)) return send(res, 415, { error: 'type' });
      const name = safeName(one(q.name));
      const writer = deps.driveWriter ?? await realDriveWriter(env);
      let target = pinFolders.get(folder);
      if (!target) {
        target = await writer.ensureFolder(await writer.ensureFolder(folder, PIN_FOLDER), PIN_SUBFOLDER);
        pinFolders.set(folder, target);
      }
      const driveFileId = await writer.create(target, safeName(`${link.name || 'Shared link'} - ${name}`), type, bytes);
      if (!DRIVE_ID_RE.test(String(driveFileId ?? ''))) throw new Error('upload gave no id');
      const entry = {
        id: `pf_${crypto.randomBytes(8).toString('hex')}`, driveFileId, mimeType: type, name, size: bytes.length,
        createdAt: now().toISOString(),
      };
      // Only the pin's `files` changes, and only if nobody changed the pin meanwhile (one retry on a race).
      let cur = pin;
      for (let attempt = 0; ; attempt++) {
        const list = [...(Array.isArray(cur.files) ? cur.files : []), entry];
        try {
          await db.commit([{
            update: { name: db.docName('sharedPins', id), fields: { files: toFs(list) } },
            updateMask: { fieldPaths: ['files'] },
            updateTransforms: [{ fieldPath: '_updatedAt', setToServerValue: 'REQUEST_TIME' }],
            currentDocument: { updateTime: cur.updateTime },
          }]);
          break;
        } catch (e) {
          if (attempt >= 1) throw e;
          cur = await db.get('sharedPins', id);
          if (!cur || cur.linkId !== link.id) return notFound(res);
          if ((Array.isArray(cur.files) ? cur.files.length : 0) >= MAX_FILES_PER_PIN) return send(res, 409, { error: 'too_many_files' });
        }
      }
      lastLog.delete(`${link.id}|${ip}|pin-file|${pin.apartmentId}`);
      logHit(db, link, req, ip, 'pin-file', pin.apartmentId, now);
      return send(res, 200, { file: pinFileOut(entry, (k, v) => sealRef(secret, link.id, k, v)) });
    }

    // ── take one attachment off a pin THIS link placed (the file itself stays in the office's Drive) ──
    if (action === 'pinfile' && method === 'DELETE') {
      if (rateLimited(`pinfile|${per}`, 20)) return send(res, 429, { error: 'slow_down' });
      const id = String(one(q.pin) ?? ''), fid = String(one(q.id) ?? '');
      if (!PIN_ID_RE.test(id) || !PIN_FILE_ID_RE.test(fid)) return bad(res);
      const pin = await db.get('sharedPins', id);
      if (!pin || pin.linkId !== link.id || pin.projectId !== link.projectId) return notFound(res);
      const had = Array.isArray(pin.files) ? pin.files : [];
      if (!had.some(f => f?.id === fid)) return notFound(res);
      await db.commit([{
        update: { name: db.docName('sharedPins', id), fields: { files: toFs(had.filter(f => f?.id !== fid)) } },
        updateMask: { fieldPaths: ['files'] },
        updateTransforms: [{ fieldPath: '_updatedAt', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { updateTime: pin.updateTime },
      }]);
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'method' });
  } catch (e) {
    console.error('shared view error:', e?.message);
    return send(res, 500, { error: 'unavailable' });
  }
}

/** A small JSON body, or null. Vercel has usually parsed it already; either way the size is capped. */
async function readBody(req) {
  const len = Number(req.headers?.['content-length'] ?? 0);
  if (len > MAX_BODY_BYTES) return null;
  const ct = String(req.headers?.['content-type'] ?? '');
  if (!/^application\/json\b/i.test(ct)) return null;
  let body = req.body;
  if (body === undefined) {
    let raw = '';
    try {
      for await (const chunk of req) { raw += chunk; if (raw.length > MAX_BODY_BYTES) return null; }
    } catch { return null; }
    try { body = JSON.parse(raw); } catch { return null; }
  } else if (typeof body === 'string' || Buffer.isBuffer(body)) {
    const s = String(body);
    if (s.length > MAX_BODY_BYTES) return null;
    try { body = JSON.parse(s); } catch { return null; }
  } else if (JSON.stringify(body ?? null).length > MAX_BODY_BYTES) return null;
  return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
}

/**
 * A raw body (one attachment), capped. Vercel hands an application/octet-stream body over as a Buffer already;
 * otherwise it is read off the request, stopping the moment it passes the cap. 'too_big', a Buffer, or null.
 */
async function readBytes(req, max) {
  const body = req.body;
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) return body.length > max ? 'too_big' : Buffer.from(body);
  if (body !== undefined) return null;
  const parts = [];
  let n = 0;
  try {
    for await (const chunk of req) {
      n += chunk.length;
      if (n > max) return 'too_big';
      parts.push(Buffer.from(chunk));
    }
  } catch { return null; }
  return Buffer.concat(parts);
}

/** Stream one allowed file. Drive files by the service account; Storage files only from Firebase Storage's host. */
async function streamFile(res, req, ref, w, drive, fetchImpl) {
  const pipeWeb = async (r, type) => {
    if (!r.ok || !r.body) return notFound(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', 'inline');
    const len = r.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    const { Readable } = await import('stream');
    await new Promise((resolve, reject) => {
      const s = Readable.fromWeb(r.body);
      s.on('end', resolve); s.on('error', reject);
      res.on('close', () => { try { s.destroy(); } catch { /* done */ } resolve(); });
      s.pipe(res);
    });
  };
  if (ref.kind === 's') {
    const r = await fetchImpl(ref.value, { redirect: 'error' });
    const type = String(r.headers?.get?.('content-type') ?? '').split(';')[0];
    if (!MEDIA_TYPES.test(type)) return notFound(res);
    return pipeWeb(r, type);
  }
  const meta = await drive.meta(ref.value).catch(() => null);
  if (!meta || meta.trashed || !STREAM_TYPES.test(String(meta.mimeType ?? ''))) return notFound(res);
  if (w && meta.thumbnailLink && /^(image|video)\//i.test(meta.mimeType) && /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//i.test(meta.thumbnailLink)) {
    const t = await drive.thumb(meta.thumbnailLink, w).catch(() => null);
    if (t && t.ok) {
      const type = String(t.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
      if (/^image\//i.test(type)) return pipeWeb(t, type);
    }
    if (/^video\//i.test(meta.mimeType)) return notFound(res);   // no picture of a film: the page shows a play mark
  }
  const range = typeof req.headers?.range === 'string' && /^bytes=\d*-\d*$/.test(req.headers.range) ? req.headers.range : undefined;
  const r = await drive.media(ref.value, range);
  res.statusCode = r.status === 206 ? 206 : 200;
  res.setHeader('Content-Type', meta.mimeType);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Accept-Ranges', 'bytes');
  if (r.contentRange) res.setHeader('Content-Range', r.contentRange);
  const len = r.contentLength || (r.status !== 206 && meta.size ? String(meta.size) : null);
  if (len) res.setHeader('Content-Length', len);
  await new Promise((resolve, reject) => {
    r.stream.on('end', resolve);
    r.stream.on('error', reject);
    res.on('close', () => { try { r.stream.destroy(); } catch { /* done */ } resolve(); });
    r.stream.pipe(res);
  });
}
