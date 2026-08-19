/**
 * Taking deleted jobs out of the weekly notebook.
 *
 * A notebook cell holds ENTRIES, and an entry that came from the board is a
 * reference — a `jobId`, not a copy. That is deliberate: the job stays on the
 * board, it can be on two people's rows at once, and editing it anywhere edits
 * the one record. But a reference outlives the thing it points at, and nothing
 * was clearing them: deleting a job (or taking an import back out) left the
 * notebook full of rows reading "(job removed)", which is how the office found
 * it — a season's planning turned into a wall of the same three words.
 *
 * Everything here is PURE — no store, no DOM — so the arithmetic is testable
 * offline, and it is written against the SHAPE of planner data rather than
 * importing `PlannerData` from the widget: the store must not pull a component
 * module in, and this only ever needs to know that cells hold things which may
 * carry a `jobId`.
 */

/** The widget ids whose `data` is a planner. */
export const PLANNER_WIDGET_IDS = ['rota', 'week-planner'];

interface EntryLike { jobId?: string }
interface PlannerLike {
  cells?: Record<string, EntryLike[]>;
  /** Slots belonging to somebody taken off, kept so they come back intact. */
  offKept?: Record<string, Record<string, EntryLike[]>>;
}

/** Is this element a notebook, whatever it is called? */
export function isPlannerElement(
  el: { type?: string; widget?: string },
): boolean {
  return el.type === 'widget' && !!el.widget && PLANNER_WIDGET_IDS.includes(el.widget);
}

function stripCells(
  cells: Record<string, EntryLike[]> | undefined,
  gone: Set<string>,
): { cells: Record<string, EntryLike[]>; removed: number } | null {
  if (!cells) return null;
  let removed = 0;
  const next: Record<string, EntryLike[]> = {};
  for (const [key, list] of Object.entries(cells)) {
    if (!Array.isArray(list)) { next[key] = list; continue; }
    const kept = list.filter(e => !(e?.jobId && gone.has(e.jobId)));
    removed += list.length - kept.length;
    // An emptied cell is dropped rather than left as an empty array: a cell
    // that exists but holds nothing is indistinguishable on screen from one
    // that was never written, and keeping it only grows the record.
    if (kept.length) next[key] = kept;
  }
  return removed ? { cells: next, removed } : null;
}

/**
 * Strip every entry pointing at one of `ids` out of one planner's data.
 *
 * Returns `null` when nothing changed, so a caller can leave the element — and
 * its Firestore document — completely alone. Writing back an identical object
 * would bump every notebook on every device for a job that was never in one.
 */
export function purgeJobsFromPlanner<T extends PlannerLike>(
  data: T | undefined | null,
  ids: Iterable<string>,
): { data: T; removed: number } | null {
  if (!data) return null;
  const gone = ids instanceof Set ? ids : new Set(ids);
  if (!gone.size) return null;

  let removed = 0;
  const out: PlannerLike = {};

  const live = stripCells(data.cells, gone);
  if (live) { out.cells = live.cells; removed += live.removed; }

  // The same job can also be sitting in somebody's put-aside slots. Missing
  // these would bring the dead rows straight back the moment that person was
  // put back on the notebook.
  if (data.offKept) {
    let touched = false;
    const nextOff: Record<string, Record<string, EntryLike[]>> = {};
    for (const [person, cells] of Object.entries(data.offKept)) {
      const r = stripCells(cells, gone);
      if (r) { nextOff[person] = r.cells; removed += r.removed; touched = true; }
      else nextOff[person] = cells;
    }
    if (touched) out.offKept = nextOff;
  }

  return removed ? { data: { ...data, ...out } as T, removed } : null;
}
