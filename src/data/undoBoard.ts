/**
 * What an undo of a BOARD action has to put back.
 *
 * The board's actions all come down to the same three shapes — a record
 * changed, a record appeared, a record went away — so rather than writing a
 * bespoke inverse for each of thirty call sites (which is thirty chances to be
 * subtly wrong about what changed), each site captures the records it is about
 * to touch, does its work, captures them again, and hands both sides here.
 *
 * Undo walks from `after` back to `before`; redo walks the other way. They are
 * the same function with the sides swapped, which is the point: an undo that
 * cannot be redone exactly is an undo nobody trusts.
 *
 * The one rule that makes this safe on a shared board: a side restores only
 * the fields that DIFFER between the two sides. Writing the whole record back
 * would silently revert anything a colleague changed in between — an undo of
 * "I moved a tile" must not also undo "somebody renamed the job".
 */

import type { Apartment, CanvasElement } from '../types';

/** `null` means "this record did not exist on this side of the action". */
export type Side<T> = Record<string, T | null>;

export interface BoardSides {
  jobs?: Side<Apartment>;
  els?: Side<CanvasElement>;
}

/** Deep-ish equality, good enough for the small values a board record holds. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The patch that turns `from` into `to`.
 *
 * A field present on `from` and absent on `to` comes back as `undefined`,
 * which is exactly right for this codebase: `updateApartment` merges, and
 * `fsSet` turns `undefined` into `deleteField()`, so the field genuinely goes
 * rather than being left behind at its old value.
 */
export function patchBetween<T extends object>(from: T, to: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(from), ...Object.keys(to)])) {
    const a = (from as Record<string, unknown>)[k];
    const b = (to as Record<string, unknown>)[k];
    if (!same(a, b)) out[k] = b;
  }
  return out as Partial<T>;
}

/** Snapshot the named records, `null` for any that are not there. */
export function snapJobs(all: Apartment[], ids: Iterable<string>): Side<Apartment> {
  const by = new Map(all.map(a => [a.id, a]));
  const out: Side<Apartment> = {};
  for (const id of ids) out[id] = by.get(id) ? { ...by.get(id)! } : null;
  return out;
}

export function snapEls(all: CanvasElement[], ids: Iterable<string>): Side<CanvasElement> {
  const by = new Map(all.map(e => [e.id, e]));
  const out: Side<CanvasElement> = {};
  for (const id of ids) out[id] = by.get(id) ? { ...by.get(id)! } : null;
  return out;
}

/** True when the two sides describe no change at all — nothing worth recording. */
export function sidesDiffer(before: BoardSides, after: BoardSides): boolean {
  const kinds: ('jobs' | 'els')[] = ['jobs', 'els'];
  for (const kind of kinds) {
    const b = before[kind] ?? {};
    const a = after[kind] ?? {};
    for (const id of new Set([...Object.keys(b), ...Object.keys(a)])) {
      const x = b[id] ?? null;
      const y = a[id] ?? null;
      if ((x === null) !== (y === null)) return true;
      if (x && y && Object.keys(patchBetween(x, y)).length > 0) return true;
    }
  }
  return false;
}

/** The writes the board can perform on this application's behalf. */
export interface BoardWriters {
  updateJob: (id: string, patch: Partial<Apartment>) => void;
  updateEl: (id: string, patch: Partial<CanvasElement>) => void;
  /** Put removed nodes back, tombstones and all. */
  restoreEls: (els: CanvasElement[]) => void;
  /** Take added nodes away again. */
  deleteEl: (id: string) => void;
}

/**
 * Move the board from one side of an action to the other.
 *
 * `to` is the side being restored; `from` is where things stand now, and is
 * needed only to know which fields the action actually touched.
 */
export function applySide(to: BoardSides, from: BoardSides, w: BoardWriters) {
  const jobsTo = to.jobs ?? {};
  const jobsFrom = from.jobs ?? {};
  for (const id of Object.keys(jobsTo)) {
    const want = jobsTo[id];
    const now = jobsFrom[id] ?? null;
    // A job is never created or destroyed by an undo. Permanent deletion has
    // its own confirmation and its own tombstone, and the reversible version
    // of throwing a job away is the Trash group, which is an ordinary field
    // change and undoes like one.
    if (!want || !now) continue;
    const patch = patchBetween(now, want);
    if (Object.keys(patch).length > 0) w.updateJob(id, patch);
  }

  const elsTo = to.els ?? {};
  const elsFrom = from.els ?? {};
  const bringBack: CanvasElement[] = [];
  for (const id of Object.keys(elsTo)) {
    const want = elsTo[id];
    const now = elsFrom[id] ?? null;
    if (want && !now) { bringBack.push(want); continue; }
    if (!want && now) { w.deleteEl(id); continue; }
    if (!want || !now) continue;
    const patch = patchBetween(now, want);
    if (Object.keys(patch).length > 0) w.updateEl(id, patch);
  }
  if (bringBack.length > 0) w.restoreEls(bringBack);
}
