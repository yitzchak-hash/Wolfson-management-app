// CLOUD CLEANUP — records that sit in the WRONG workspace's collection.
//
// Found 2026-09-22: Wolfson's bare `apartments` held all 3,520 Job Board jobs,
// `general_apartments` held 244 Wolfson units, `netiv_apartments` 245 Wolfson
// units plus 86 N1/N2 orphans of the old building rename. Invisible on every
// screen (scopeApartmentsToProject drops them at load) and billed on every
// load of every device — the read bill in one place. Cause: a workspace
// switch racing an in-flight sync (see _syncRun in store.ts); the guard ships
// with this script, so the junk cannot come back the same way.
//
//   node scratchpad/cloudclean.mjs            → dry run: counts + a full backup
//   node scratchpad/cloudclean.mjs --delete   → the same, then the deletes
//
// Rules: a record is MISPLACED when its buildingId is not one of the
// collection's own. A misplaced record with NO copy in its home collection is
// COPIED HOME first (whole document), then removed. Every misplaced document
// is written whole to the backup file before anything is touched — the file
// sits in the session scratchpad, never in the repo (real records). Public
// rules answer the REST API directly; no key, no SDK.
import fs from 'node:fs';
const PROJECT = process.env.FS_PROJECT || 'wolfson-54874';
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;   // a write names a document by this RESOURCE path
const BASE = `https://firestore.googleapis.com/v1/${DOCS}`;
const DEL = process.argv.includes('--delete');
const OUT = process.env.OUT || '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
const HOME = { apartments: ['A1', 'A2', 'A3'], general_apartments: ['G'], netiv_apartments: ['B1', 'B2'] };
const homeOf = b => b === 'G' ? 'general_apartments' : /^A\d$/.test(b) ? 'apartments' : /^B\d$/.test(b) ? 'netiv_apartments' : null;

async function listAll(coll) {
  const out = new Map();
  let pageToken = '';
  do {
    const r = await fetch(`${BASE}/${coll}?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`);
    if (!r.ok) throw new Error(`${coll}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    for (const d of j.documents || []) out.set(d.name.split('/').pop(), d);
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}
const str = d => d.fields?.buildingId?.stringValue ?? '';

const colls = {};
for (const c of Object.keys(HOME)) { colls[c] = await listAll(c); console.log(`${c}: ${colls[c].size} docs`); }

const plan = []; // { coll, id, copyHome: doc|null }
for (const [c, m] of Object.entries(colls)) {
  const own = new Set(HOME[c]);
  for (const [id, d] of m) {
    const b = str(d);
    if (own.has(b)) continue;
    const h = homeOf(b);
    const atHome = h ? colls[h].get(id) : null;
    plan.push({ coll: c, id, b, home: h, copyHome: h && !atHome ? d : null });
  }
}
const backup = `${OUT}/cloudclean-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
fs.writeFileSync(backup, JSON.stringify(plan.map(p => ({ coll: p.coll, id: p.id, doc: colls[p.coll].get(p.id) })), null, 0));
const byColl = {};
for (const p of plan) { byColl[p.coll] ??= { remove: 0, copyHome: 0, orphan: 0 }; byColl[p.coll].remove++; if (p.copyHome) byColl[p.coll].copyHome++; if (!p.home) byColl[p.coll].orphan++; }
console.log('plan:', JSON.stringify(byColl), `\nbackup of ${plan.length} documents → ${backup}`);
if (!DEL) { console.log('dry run — nothing touched'); process.exit(0); }

async function commit(writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const chunk = writes.slice(i, i + 400);
    const r = await fetch(`${BASE.replace(/\/documents$/, '')}/documents:commit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: chunk }),
    });
    if (!r.ok) throw new Error(`commit: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
    process.stdout.write(`  ${Math.min(i + 400, writes.length)}/${writes.length}\r`);
  }
  console.log('');
}
// 1 · copies home (whole documents, fields as they are)
const copies = plan.filter(p => p.copyHome).map(p => ({
  update: { name: `${DOCS}/${p.home}/${p.id}`, fields: p.copyHome.fields },
}));
if (copies.length) { console.log(`copying ${copies.length} home…`); await commit(copies); }
// 2 · the deletes
const dels = plan.map(p => ({ delete: `${DOCS}/${p.coll}/${p.id}` }));
console.log(`deleting ${dels.length}…`); await commit(dels);
// 3 · the count after
for (const c of Object.keys(HOME)) { const m = await listAll(c); console.log(`${c}: ${m.size} docs now`); }
