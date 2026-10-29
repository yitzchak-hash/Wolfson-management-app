// THE BACKUP RULE, enforced (owner, 2026-10-29): "any new features we add
// should also be added to these backup systems. Everything."
//
// Runs before every build (package.json "build"); a failure stops the build,
// so nothing new can reach the live app without being backed up.
//
//  1. Every Firestore collection the app writes or reads must be in the full
//     backup's lists (lib/fullBackup.js WORKSPACE_COLLECTIONS /
//     GLOBAL_COLLECTIONS). A new collection → add it there.
//  2. Every key the app keeps in the browser (localStorage / sessionStorage)
//     must be in the device-only register (src/data/deviceOnly.ts) WITH the
//     reason it may live on one computer. Anything that is data or a setting
//     a person would expect on a new computer belongs in the cloud instead.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { WORKSPACE_COLLECTIONS, GLOBAL_COLLECTIONS } from '../lib/fullBackup.js';

const root = new URL('..', import.meta.url).pathname;
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f)) files.push(p);
  }
})(join(root, 'src'));

const problems = [];

// ── 1 · Firestore collections ───────────────────────────────────────────────
const NOT_DATA = new Set(['_healthcheck']);   // the Settings connection test writes one throwaway doc
const backedUp = new Set([...WORKSPACE_COLLECTIONS, ...GLOBAL_COLLECTIONS]);
const patterns = [
  /projectCollection\([^,()]+,\s*'([A-Za-z_]+)'\)/g,
  /\b(?:col|pc)\('([A-Za-z_]+)'\)/g,
  // (the tombstone helpers take a WORKSPACE id, not a collection)
  /\bfs(?!GetTombstones|Tombstone|Untombstone|ListenTombstones)[A-Z][A-Za-z]*\(\s*'([A-Za-z_]+)'/g,
  /collection\(db!?,\s*'([A-Za-z_]+)'/g,
  /doc\(db!?,\s*'([A-Za-z_]+)'/g,
];
const used = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const re of patterns) for (const m of src.matchAll(re)) {
    if (!used.has(m[1])) used.set(m[1], f.slice(root.length));
  }
  // A collection named through a constant: fsPatch(COLL, …) with const COLL = 'x'.
  const named = new Map([...src.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*'([A-Za-z_]+)'/g)].map(m => [m[1], m[2]]));
  for (const m of src.matchAll(/\bfs(?!GetTombstones|Tombstone|Untombstone|ListenTombstones)[A-Z][A-Za-z]*\(\s*([A-Z_][A-Z0-9_]*)\s*,/g)) {
    const name = named.get(m[1]);
    if (name && !used.has(name)) used.set(name, f.slice(root.length));
  }
}
for (const [name, where] of used) {
  if (NOT_DATA.has(name) || backedUp.has(name)) continue;
  problems.push(`Firestore collection "${name}" (${where}) is not in the full backup — add it to lib/fullBackup.js.`);
}

// ── 2 · browser storage keys ────────────────────────────────────────────────
const register = readFileSync(join(root, 'src/data/deviceOnly.ts'), 'utf8');
// Each entry: 'key': 'the reason …' — a key without a written reason does not count.
const allowed = [...register.matchAll(/^\s*'([^']+)':\s*'(.{12,})',?\s*$/gm)].map(m => m[1]);
const allowedRe = allowed.map(k => new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/<[a-z]+>/g, '.+') + '$'));
const keyUses = [];
for (const f of files) {
  if (f.endsWith('deviceOnly.ts') || f.endsWith('prefs.ts')) continue;   // prefs.ts: its own mirror (registered) and the move from browser to cloud
  const src = readFileSync(f, 'utf8');
  // Named constants, resolved in the file that uses them.
  const consts = new Map();
  for (const m of src.matchAll(/(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(['`])([^'`]+)\2/g)) consts.set(m[1], m[3]);
  for (const m of src.matchAll(/(?:localStorage|sessionStorage)\.(?:setItem|getItem|removeItem)\(\s*([^,)]+)/g)) {
    keyUses.push({ f: f.slice(root.length), expr: m[1].trim(), consts });
  }
}
const keyOf = (expr, consts) => {
  let e = expr;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(e) && consts.has(e)) e = `'${consts.get(e)}'`;
  const lit = e.match(/^(['"`])(.*)\1$/s);
  if (!lit) return null;                     // built elsewhere — checked through its helper
  return lit[2].replace(/\$\{[^}]+\}/g, '<x>');
};
// Keys built by a helper the check cannot read through. Each is listed with
// what it builds; anything else the check cannot read FAILS — a new feature
// must use a plain key (or prefs.ts) so the rule can see it.
const KNOWN_DYNAMIC = {
  'src/data/store.ts': ['key'],                         // saveToStorage/loadFromStorage: <x>_app_data, rescue_marks_<x>
  'src/data/pushClient.ts': ['onKey(contractorId'],     // push_on_<x>
};
for (const { f, expr, consts } of keyUses) {
  const key = keyOf(expr, consts);
  if (key === null) {
    if ((KNOWN_DYNAMIC[f] ?? []).includes(expr)) continue;
    problems.push(`Browser key built as "${expr}" (${f}) cannot be checked — use a plain key or prefs.ts, or register the helper in scripts/check-backup-coverage.mjs.`);
    continue;
  }
  const probe = key.replace(/<x>/g, 'X');
  if (allowedRe.some(re => re.test(probe) || re.test(key))) continue;
  problems.push(`Browser key "${key}" (${f}) is not in src/data/deviceOnly.ts — put it in the cloud, or register it there with the reason it must stay on one computer.`);
}

if (problems.length) {
  console.error('\n✗ BACKUP RULE — something would not be backed up:\n  ' + problems.join('\n  ') + '\n');
  process.exit(1);
}
console.log(`✓ backup rule: ${used.size} cloud collections all in the full backup; ${keyUses.length} browser-storage uses all registered device-only.`);
