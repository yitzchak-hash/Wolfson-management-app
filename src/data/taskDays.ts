/**
 * Multi-day tasks — the arithmetic, pure.
 *
 * A task that takes days carries ALL of them (`ContractorAssignment.days`),
 * not one due date: the worker's schedule shows every day, every calendar
 * plots every day, and "late" starts only after the LAST one. `dueDate` is
 * kept equal to that last day, which is what lets every consumer written for
 * the single-date world (sorting, overdue, badges) stay correct unchanged.
 *
 * The counting rules are the owner's, locked 2026-08-24:
 *  - SATURDAY never counts.
 *  - FRIDAY counts only when its stretch's checkbox says so — asked only
 *    when the stretch actually passes a Friday, default off.
 * Everything here takes dates as ISO strings and does its own calendar
 * walking, so it can be tested offline against hand-worked numbers.
 */

/** One run of consecutive working days. */
export interface DayStretch {
  /** ISO date the stretch starts on. */
  start: string;
  /** How many WORKING days it covers. */
  days: number;
  /** Count Fridays as working days for this stretch. */
  friday?: boolean;
}

const MS = 86_400_000;

/** Parse an ISO date in local time — `new Date('YYYY-MM-DD')` would be UTC. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function dayIso(d: Date): string {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return t.toISOString().slice(0, 10);
}

/**
 * The working days a stretch covers, walking the calendar from its start —
 * and whether the walk passed a Friday, which is what decides whether the
 * "Include Friday?" checkbox exists at all.
 */
export function workingRun(startIso: string, count: number, includeFriday = false): {
  days: string[];
  crossesFriday: boolean;
} {
  const days: string[] = [];
  let crossed = false;
  let d = parseDay(startIso);
  let guard = 0;
  while (days.length < Math.max(1, Math.min(30, Math.round(count))) && guard++ < 90) {
    const dow = d.getDay();
    if (dow === 5) crossed = true;
    if (dow !== 6 && (dow !== 5 || includeFriday)) days.push(dayIso(d));
    d = new Date(d.getTime() + MS);
  }
  return { days, crossesFriday: crossed };
}

/** Every day the task covers: the stretches merged, deduped, sorted. */
export function stretchDays(stretches: DayStretch[]): string[] {
  const all = new Set<string>();
  for (const s of stretches) {
    for (const day of workingRun(s.start, s.days, s.friday).days) all.add(day);
  }
  return [...all].sort();
}

/** The first working day after a stretch ends — where a second stretch offers to start. */
export function nextWorkingDay(afterIso: string): string {
  let d = new Date(parseDay(afterIso).getTime() + MS);
  while (d.getDay() === 5 || d.getDay() === 6) d = new Date(d.getTime() + MS);
  return dayIso(d);
}

/**
 * The little "day 2 of 3" pill on a card. Null for a single-day task, or for
 * a day the task does not actually cover (a card moved by hand keeps working
 * — its day is written back into the task, but a beat of lag must not crash
 * a render).
 */
export function dayNumberOf(days: string[] | undefined, day: string): { k: number; n: number } | null {
  if (!days || days.length < 2) return null;
  const k = days.indexOf(day);
  return k === -1 ? null : { k: k + 1, n: days.length };
}

/** The days a task still has AHEAD of `todayIso` — what finishing early would cross off. */
export function futureDaysOf(days: string[] | undefined, todayIso: string): string[] {
  return (days ?? []).filter(d => d > todayIso);
}

/** A task's days wherever it is drawn: the list when it has one, else the due date. */
export function daysOf(a: { days?: string[]; dueDate: string | null }): string[] {
  if (a.days?.length) return a.days;
  return a.dueDate ? [a.dueDate] : [];
}

/**
 * Move one day of a task to another: the write behind dragging a single card.
 * Returns the fields to store — days sorted, dueDate pinned to the new last
 * day — or null when the move changes nothing.
 */
export function moveTaskDay(days: string[] | undefined, from: string, to: string): {
  days: string[]; dueDate: string;
} | null {
  if (!days || !days.includes(from) || days.includes(to)) return null;
  const next = days.filter(d => d !== from).concat(to).sort();
  return { days: next, dueDate: next[next.length - 1] };
}

/** Take one day off a task entirely (the X on a non-last card). */
export function removeTaskDay(days: string[] | undefined, day: string): {
  days: string[]; dueDate: string;
} | null {
  if (!days || !days.includes(day) || days.length < 2) return null;
  const next = days.filter(d => d !== day);
  return { days: next, dueDate: next[next.length - 1] };
}

/** Add a day to a task (the Ctrl-copy of one of its cards onto another square). */
export function addTaskDay(days: string[] | undefined, day: string): {
  days: string[]; dueDate: string;
} | null {
  const base = days ?? [];
  if (base.includes(day)) return null;
  const next = [...base, day].sort();
  return { days: next, dueDate: next[next.length - 1] };
}

/**
 * Read a saved day list BACK into the two stretches the picker edits.
 *
 * The picker's controls are "how many days, from here" — but a task on disk
 * is just a list of dates. Opening a three-day task for editing therefore has
 * to work out what to put in the boxes, or the editor shows "1 day" over a
 * task that covers three and saving quietly throws two of them away.
 *
 * The rule: take the LONGEST working run starting at the first day that is a
 * prefix of the list (trying without Friday first, since that is the default),
 * and hand whatever is left over to a second stretch. A list nobody could have
 * built out of two stretches — days scattered across a month — falls back to
 * the first day alone rather than lying about the rest; the caller keeps the
 * stored days until something is actually changed.
 */
export function stretchesFromDays(days: string[]): {
  count: number; friday: boolean; second: DayStretch | null; exact: boolean;
} {
  const none = { count: 1, friday: false, second: null, exact: false };
  if (!days || days.length === 0) return none;
  const sorted = [...days].sort();
  const start = sorted[0];

  /** The longest run from `from` that the list opens with. */
  const bestRun = (from: string, list: string[]) => {
    let best = { n: 1, friday: false, used: 1 };
    for (const friday of [false, true]) {
      for (let n = 1; n <= 30; n++) {
        const run = workingRun(from, n, friday).days;
        if (run.length !== n) break;
        const isPrefix = run.every((d, i) => list[i] === d);
        if (!isPrefix) break;
        if (n > best.n) best = { n, friday, used: n };
      }
    }
    return best;
  };

  const first = bestRun(start, sorted);
  const rest = sorted.slice(first.used);
  if (rest.length === 0) {
    return { count: first.n, friday: first.friday, second: null, exact: true };
  }
  const secondRun = bestRun(rest[0], rest);
  return {
    count: first.n,
    friday: first.friday,
    second: { start: rest[0], days: secondRun.n, friday: secondRun.friday },
    // Only claim an exact reading when the two stretches account for every day.
    exact: first.used + secondRun.used === sorted.length,
  };
}
