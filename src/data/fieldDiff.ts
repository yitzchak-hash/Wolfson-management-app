/**
 * WHAT CHANGED — the heart of "save only what changed".
 *
 * Two incidents (2026-10-28, 2026-10-29) had one cause: a computer wrote a
 * WHOLE record from its own copy, and its copy was old (a computer left open
 * since yesterday) or not loaded yet (a brand-new browser's starter copy).
 * Every field it had not touched went up anyway and replaced newer work in
 * the cloud: a pin board's pins, every Wolfson flat's ticks, every
 * workspace's board settings.
 *
 * The cure is to send only the difference between what this computer had
 * BEFORE the action and what it has AFTER it. A field the person did not
 * touch is never sent, however old this computer's copy of it is.
 *
 *  - Plain maps (stageMarks, data, boardSettings.<workspace>) are walked key
 *    by key, so changing one tick sends one tick, and changing one board
 *    setting sends that one setting of that one workspace.
 *  - A key that went away is sent as an explicit DELETE of that one key.
 *  - Lists of things with an id (a pin board's pins, a notebook's cards) are
 *    not sent as a list at all: the writer reads the cloud's list and applies
 *    only this computer's adds, removes and edits to it (`mergeIdList`), so a
 *    pin added on another computer survives.
 *  - Anything else that changed (a number, a text, a plain list) is sent as
 *    that one value.
 *
 * Pure, no Firestore here: the writer in firebase.ts turns the result into a
 * write. Tested offline in scratchpad/fielddiff-test.mjs.
 */

export const DELETE = Symbol('delete');

export type DiffOp =
  | { kind: 'set'; path: string[]; value: unknown }
  | { kind: 'delete'; path: string[] }
  /** A list of records with ids changed: apply mine onto the cloud's list. */
  | { kind: 'idList'; path: string[]; before: IdRec[]; after: IdRec[] };

export type IdRec = { id: string } & Record<string, unknown>;

/** A plain {…} map — not a list, not a Date, not a Firestore sentinel/Timestamp. */
export function isPlainMap(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export function isIdList(v: unknown): v is IdRec[] {
  return Array.isArray(v) && v.length > 0
    && v.every(x => isPlainMap(x) && typeof x.id === 'string' && x.id !== '')
    && new Set(v.map(x => (x as IdRec).id)).size === v.length;
}

/** Deep equality for JSON-like data. `undefined` map entries count as absent. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isPlainMap(a) && isPlainMap(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  // Class instances (Timestamp, Date): compare their JSON form.
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  }
  return false;
}

/** Fields the writer stamps itself — never part of a diff. */
const IGNORE_TOP = new Set(['_updatedAt']);

/**
 * The difference between `before` and `after`, as the smallest set of
 * writes. Empty when nothing changed — the caller then writes nothing.
 */
export function diffRecord(before: Record<string, unknown>, after: Record<string, unknown>): DiffOp[] {
  const ops: DiffOp[] = [];
  walk(before, after, [], ops);
  return ops;
}

function walk(a: Record<string, unknown>, b: Record<string, unknown>, path: string[], ops: DiffOp[]) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (path.length === 0 && IGNORE_TOP.has(k)) continue;
    const av = a[k]; const bv = b[k];
    if (deepEqual(av, bv)) continue;
    const p = [...path, k];
    // A map key Firestore cannot address on its own (empty) — send the
    // whole parent value instead of risking a malformed path.
    if (k === '') { ops.push({ kind: 'set', path, value: b }); return; }
    if (bv === undefined) { ops.push({ kind: 'delete', path: p }); continue; }
    if (isPlainMap(av) && isPlainMap(bv)) { walk(av, bv, p, ops); continue; }
    // A map this computer never had (a workspace's settings it never saw, a
    // record's first mark): only the keys it ADDS go up, one by one — sending
    // the map whole would wipe whatever the cloud already keeps in it.
    if (av === undefined && isPlainMap(bv) && Object.keys(bv).length) { walk({}, bv, p, ops); continue; }
    // A list of records on either side, the other side a list of records,
    // an empty list or nothing: replay my adds/removes/edits on the cloud's
    // list. An EMPTY or missing list here is exactly the dangerous case — a
    // computer that never saw the pins adding one must not send "[my pin]".
    const emptyish = (v: unknown) => v === undefined || (Array.isArray(v) && v.length === 0);
    if ((isIdList(av) || emptyish(av)) && (isIdList(bv) || emptyish(bv)) && (isIdList(av) || isIdList(bv))) {
      ops.push({ kind: 'idList', path: p, before: isIdList(av) ? av : [], after: isIdList(bv) ? bv : [] });
      continue;
    }
    ops.push({ kind: 'set', path: p, value: bv });
  }
}

/**
 * Apply MY change to a list of records onto the CLOUD's list.
 *
 * What I did is read from `before` → `after` (my copy before and after the
 * action); it is then replayed on `cloud`, the list as it is now:
 *  - a record I added is added (or, if it is already there, takes my version);
 *  - a record I removed is removed;
 *  - a record I edited takes my version;
 *  - a record I did not touch keeps the cloud's version — and if somebody
 *    else removed it meanwhile, it stays removed;
 *  - a record somebody else added meanwhile is kept.
 * The order is mine, with records the cloud gained appended after it.
 */
export function mergeIdList(before: IdRec[], after: IdRec[], cloud: unknown): IdRec[] {
  if (!Array.isArray(cloud)) return after;
  const cloudRecs = cloud.filter((x): x is IdRec => isPlainMap(x) && typeof x.id === 'string');
  if (cloudRecs.length !== cloud.length) return after;   // not a list of records: mine stands
  const baseBy = new Map(before.map(r => [r.id, r]));
  const cloudBy = new Map(cloudRecs.map(r => [r.id, r]));
  const mineIds = new Set(after.map(r => r.id));
  const out: IdRec[] = [];
  const seen = new Set<string>();
  for (const m of after) {
    if (seen.has(m.id)) continue;
    const base = baseBy.get(m.id);
    if (base && deepEqual(base, m)) {
      const c = cloudBy.get(m.id);
      if (c) { out.push(c); seen.add(m.id); }
      continue;
    }
    out.push(m); seen.add(m.id);
  }
  for (const c of cloudRecs) {
    if (seen.has(c.id) || mineIds.has(c.id) || baseBy.has(c.id)) continue;
    out.push(c); seen.add(c.id);
  }
  return out;
}

/** Read the value at a path in a plain object (undefined when absent). */
export function getAtPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (!isPlainMap(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}
