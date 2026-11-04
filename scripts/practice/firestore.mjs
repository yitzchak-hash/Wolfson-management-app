// The practice database's REST door, and its lock.
//
// Every script that writes practice data comes through here, and this file
// REFUSES to talk to any project but `wolfson-practice`. The office's real
// project is never named, never read, never written. Fail closed: a wrong or
// missing project stops the script before a single request is made.
//
// Credentials, in this order (none is ever printed or written to disk):
//   GOOGLE_ACCESS_TOKEN       an OAuth token with access to wolfson-practice
//   PRACTICE_SA_JSON_FILE     path to a service-account key for wolfson-practice
//   (neither)                 the practice web key alone; works only while the
//                             practice rules allow it

import crypto from 'node:crypto';
import fs from 'node:fs';

export const PRACTICE_PROJECT = 'wolfson-practice';
const PRACTICE_WEB_KEY = 'AIzaSyBa8VJgM4O1XzqOQDcZRFEYu3PM27Y5OxY'; // public, already in the practice page

/** Hard stop unless the target is exactly the practice project. */
export function assertPractice(project) {
  if (project !== PRACTICE_PROJECT) {
    throw new Error(`REFUSED: this script only ever touches "${PRACTICE_PROJECT}", not "${project}".`);
  }
}

const requested = process.env.PRACTICE_PROJECT ?? PRACTICE_PROJECT;
assertPractice(requested);
const BASE = `https://firestore.googleapis.com/v1/projects/${PRACTICE_PROJECT}/databases/(default)/documents`;
if (!BASE.includes(`/projects/${PRACTICE_PROJECT}/`)) throw new Error('REFUSED: bad base address');

async function tokenFromKeyFile(file) {
  const key = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (key.project_id && key.project_id !== PRACTICE_PROJECT) {
    // A key from another cloud project is fine for IAM (it may be invited),
    // but say which one it is so nobody is surprised.
    console.log(`  (using a key made in project ${key.project_id}, invited to ${PRACTICE_PROJECT})`);
  }
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 })}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), key.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${sig}`,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('sign-in refused: ' + (j.error ?? r.status));
  return j.access_token;
}

let authHeaders = null;
async function headers() {
  if (authHeaders) return authHeaders;
  if (process.env.GOOGLE_ACCESS_TOKEN) {
    authHeaders = { Authorization: `Bearer ${process.env.GOOGLE_ACCESS_TOKEN}`, 'x-goog-user-project': PRACTICE_PROJECT };
  } else if (process.env.PRACTICE_SA_JSON_FILE) {
    authHeaders = { Authorization: `Bearer ${await tokenFromKeyFile(process.env.PRACTICE_SA_JSON_FILE)}`, 'x-goog-user-project': PRACTICE_PROJECT };
  } else {
    authHeaders = {};
  }
  return authHeaders;
}
const withKey = (url) => (authHeaders && authHeaders.Authorization ? url : `${url}${url.includes('?') ? '&' : '?'}key=${PRACTICE_WEB_KEY}`);

async function call(path, init = {}) {
  const h = await headers();
  const url = withKey(`${BASE}${path}`);
  if (!url.startsWith(`https://firestore.googleapis.com/v1/projects/${PRACTICE_PROJECT}/`)) throw new Error('REFUSED: address outside the practice project');
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...h, ...(init.headers ?? {}) } });
    if (r.ok) return r.json();
    const text = await r.text();
    if ((r.status === 429 || r.status >= 500) && attempt < 5) { await new Promise(res => setTimeout(res, 800 * (attempt + 1))); continue; }
    throw new Error(`Firestore ${r.status} on ${path.slice(0, 80)}: ${text.slice(0, 300)}`);
  }
}

// ── plain values → Firestore's typed values ─────────────────────────────────
export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.filter(x => x !== undefined).map(toValue) } };
  switch (typeof v) {
    case 'boolean': return { booleanValue: v };
    case 'number': return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    case 'string': return { stringValue: v };
    case 'object': return { mapValue: { fields: toFields(v) } };
    default: return { stringValue: String(v) };
  }
}
export function toFields(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = toValue(v);
  return out;
}

const docName = (col, id) => `projects/${PRACTICE_PROJECT}/databases/(default)/documents/${col}/${encodeURIComponent(id)}`;

/** Writes whole documents, 400 to a request. Each gets `_updatedAt` like the app's own writes. */
export async function writeDocs(col, docs, onProgress) {
  const stamp = new Date();
  for (let i = 0; i < docs.length; i += 400) {
    const chunk = docs.slice(i, i + 400);
    await call(':commit', {
      method: 'POST',
      body: JSON.stringify({
        writes: chunk.map(d => ({ update: { name: docName(col, d.id), fields: toFields({ ...d, _updatedAt: stamp }) } })),
      }),
    });
    onProgress?.(Math.min(i + 400, docs.length));
  }
}

/** Every collection at the top of the practice database. */
export async function listCollections() {
  const ids = [];
  let pageToken = '';
  do {
    const j = await call(':listCollectionIds', { method: 'POST', body: JSON.stringify({ pageSize: 300, ...(pageToken ? { pageToken } : {}) }) });
    ids.push(...(j.collectionIds ?? []));
    pageToken = j.nextPageToken ?? '';
  } while (pageToken);
  return ids;
}

/** Deletes every document of one collection (names only are read). */
export async function wipeCollection(col) {
  let removed = 0;
  for (;;) {
    const j = await call(`/${encodeURIComponent(col)}?pageSize=300&mask.fieldPaths=__name__`);
    const names = (j.documents ?? []).map(d => d.name);
    if (!names.length) break;
    for (const n of names) if (!n.startsWith(`projects/${PRACTICE_PROJECT}/`)) throw new Error('REFUSED: document outside the practice project');
    for (let i = 0; i < names.length; i += 400) {
      await call(':commit', { method: 'POST', body: JSON.stringify({ writes: names.slice(i, i + 400).map(name => ({ delete: name })) }) });
    }
    removed += names.length;
  }
  return removed;
}

/** One document, or null. */
export async function getDoc(col, id) {
  try { return await call(`/${encodeURIComponent(col)}/${encodeURIComponent(id)}`); } catch (e) { if (String(e.message).includes(' 404 ')) return null; throw e; }
}

export async function countDocs(col) {
  let n = 0, pageToken = '';
  do {
    const j = await call(`/${encodeURIComponent(col)}?pageSize=300&mask.fieldPaths=__name__${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    n += (j.documents ?? []).length;
    pageToken = j.nextPageToken ?? '';
  } while (pageToken);
  return n;
}
