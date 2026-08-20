// The backup audit.
//
// CLAUDE.md's oldest standing rule: every data-bearing state key must appear in
// ALL THREE of persistNow's payload, exportData's snapshot (at the TOP LEVEL,
// next to `apartments`), and importData's set(). Forgetting one is silent — a
// backup carries the key out and a restore never puts it back, or a reload
// simply loses it — and every fault this has caught was found weeks after it
// shipped.
//
// It reads `AppState` ITSELF rather than a hand-written list of keys. The old
// version carried a list, which made it useless in exactly the situation it
// exists for: whoever forgot the backup also forgot the list, so it passed.
// Every key must therefore be either CHECKED or EXPLICITLY EXCUSED with a
// reason, and an unknown new key is a failure until somebody decides which.
//
// Static, offline, no browser: this is a question about the source.
import { readFileSync } from 'fs';

const SRC = readFileSync('src/data/store.ts', 'utf8');
let fails = 0;
const check = (ok, l, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`);
  if (!ok) fails++;
};

/**
 * Keys that are deliberately NOT backed up, each with the reason.
 *
 * A reason is required, and it is required to be a reason — "not needed" is
 * how a real key gets waved through. These are the ones argued out in
 * CLAUDE.md, plus every action (a function is not data).
 */
const EXCUSED = {
  currentUser: 'session — who is signed in on THIS device',
  currentProjectId: 'session — which workspace is open on THIS device',
  dataVersion: 'the schema number, written by the code, never restored',
  googleClientId: 'dead OAuth field, kept only for backward compat',
  googleAccessToken: 'a live token; restoring an expired one is worse than none',
  googleTokenExpiry: 'the expiry of that same live token',
  lastAutoBackupAt: 'a schedule, not data — restoring it would re-time backups wrongly',
  lastDriveExportAt: 'a schedule too — the same reason as lastAutoBackupAt',
  backupSnapshots: 'in-session restore points; the export IS the backup',
  firebaseListening: 'a live connection flag',
  firebaseSyncError: 'a live connection flag',
  authReady: 'a live gate on the login flow',
  pendingFocus: 'transient — "show me this", consumed by the next page',
  plannerAsk: 'transient — a question on screen right now',
  undoState: 'session-only by design: an undo stack that survived a reload would '
    + 'offer to undo something another device has since changed. Its entries are '
    + 'CLOSURES and cannot be serialised at all.',
  activeBoardView: 'per-machine: which board this screen is looking at',
  pendingOpenAptId: 'transient — an apartment a page has asked to be opened',
  projects: 'DERIVED at load from DEFAULT_PROJECTS + customProjects + projectColors, '
    + 'both of which ARE backed up. Storing it too would let the copy disagree.',
  lightTheme: 'a per-device preference, carried in the settings block',
};

// ── The three places ──────────────────────────────────────────────────────
const region = (startRe, endRe, label) => {
  const s = SRC.search(startRe);
  if (s < 0) throw new Error(`could not find ${label}`);
  const e = SRC.slice(s).search(endRe);
  return SRC.slice(s, e < 0 ? undefined : s + e);
};

const stateBody = region(/^interface AppState \{/m, /^\}/m, 'AppState');
const persistBody = region(/^  const payload = \{/m, /^  \};/m, "persistNow's payload");
const exportBody = region(/^    const snapshot = \{/m, /^    \};/m, "exportData's snapshot");
const importBody = region(/^  importData: \(json\) => \{/m, /^  \},/m, "importData");

// AppState carries actions as well as data. A function type is not a key that
// can be backed up, so the split is on the declaration itself.
const stateKeys = [...stateBody.matchAll(/^  ([a-zA-Z_][\w]*)([?]?): (.+);$/gm)]
  .filter(m => !/^\(.*\) =>/.test(m[3]) && !/=> (void|Promise|\{|null|string|number|boolean)/.test(m[3]))
  .map(m => m[1]);

check(stateKeys.length > 30, `AppState parsed (${stateKeys.length} data keys)`);

// `settings: { … }` inside the export is the one legitimate nesting — the
// importer reads that block from `data.settings`. Everything else must be top
// level, which is the fault this audit was written after.
const exportTop = new Set([...exportBody.matchAll(/^      ([a-zA-Z_]\w*):/gm)].map(m => m[1]));
const exportNested = new Set([...exportBody.matchAll(/^        ([a-zA-Z_]\w*):/gm)].map(m => m[1]));
const persistKeys = new Set([...persistBody.matchAll(/^    ([a-zA-Z_]\w*):/gm)].map(m => m[1]));
// The importer reads `data.<key> ?? state.<key>` (or `?? []` / `?? {}`).
const importKeys = new Set([...importBody.matchAll(/\bdata\.([a-zA-Z_]\w*)\b/g)].map(m => m[1]));
// `data.settings.autoBackup` — the one nesting the importer knows about.
const importNested = new Set(
  [...importBody.matchAll(/\bdata\.settings\.([a-zA-Z_]\w*)\b/g)].map(m => m[1]));

const missing = { persist: [], export: [], import: [], nested: [], unknown: [] };
for (const k of stateKeys) {
  if (k in EXCUSED) continue;
  if (!persistKeys.has(k)) missing.persist.push(k);
  // A nested key is fine ONLY if the importer reads it from where it was
  // written. Exported inside `settings` and read at the top level is the exact
  // fault this audit was written after — four board keys, silently dropped.
  if (exportTop.has(k)) {
    if (!importKeys.has(k)) missing.import.push(k);
  } else if (exportNested.has(k)) {
    if (!importNested.has(k)) missing.nested.push(k);
  } else {
    missing.export.push(k);
    if (!importKeys.has(k)) missing.import.push(k);
  }
}

// A key that is neither backed up nor excused is the whole point of the audit.
for (const k of stateKeys) {
  if (k in EXCUSED) continue;
  if (!persistKeys.has(k) && !exportTop.has(k) && !exportNested.has(k)
      && !importKeys.has(k) && !importNested.has(k)) {
    missing.unknown.push(k);
  }
}

check(missing.persist.length === 0, 'every data key is in persistNow', missing.persist.join(', '));
check(missing.export.length === 0, 'every data key is in exportData', missing.export.join(', '));
check(missing.nested.length === 0,
  'nothing is exported inside `settings` that the importer reads at the top level',
  missing.nested.join(', '));
check(missing.import.length === 0, 'every data key is read by importData', missing.import.join(', '));
check(missing.unknown.length === 0,
  'no key is silently absent from all three (add it, or excuse it with a reason)',
  missing.unknown.join(', '));

// An excuse for a key that no longer exists is stale, and a stale excuse is how
// a real key later inherits somebody else's reason.
const stale = Object.keys(EXCUSED).filter(k => !stateKeys.includes(k));
check(stale.length === 0, 'no excuse names a key that is gone', stale.join(', '));

// Every excuse must actually say something.
const thin = Object.entries(EXCUSED).filter(([, why]) => why.length < 20).map(([k]) => k);
check(thin.length === 0, 'every excuse gives a real reason', thin.join(', '));

console.log(`\n       ${stateKeys.length} data keys · ${Object.keys(EXCUSED).length} excused`);
console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
