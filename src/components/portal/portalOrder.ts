/**
 * The worker's list and calendar, in the order a worker reads them — pure,
 * no store and no clock (`today` is handed in), so the arithmetic is
 * testable offline (scratchpad/portalorder-test.mjs).
 *
 * The owner, on Igor's phone (2026-10-07): "Default should show all the ones
 * that are NOT done, then a line, and everything that was done — not
 * everything in one shot. Right now this is an actual installation happening
 * today, so the first thing we should see is today, then the past due, then
 * the future."
 */
import type { ContractorAssignment } from '../../types';
import { daysOf } from '../../data/taskDays';
import { problemStateOf } from '../../data/problems';

/** Where an OPEN task sits in the list. Lower comes first. */
export type OpenBucket = 'problem' | 'waiting' | 'today' | 'overdue' | 'future' | 'dateless';
const BUCKET_RANK: Record<OpenBucket, number> = {
  problem: 0, waiting: 1, today: 2, overdue: 3, future: 4, dateless: 5,
};
const PRIORITY_RANK: Record<string, number> = { urgent: 0, normal: 1, low: 2 };

/**
 * Which part of the open list a task belongs to, and the day that places it.
 *
 * A multi-day task that covers today IS today's work. Otherwise the next day
 * it still covers puts it in the future; with every day behind us it is past
 * due, placed by its LAST day (the day "late" started).
 * A live problem has no day of its own (it is on every day until fixed) and
 * keeps the head of the list, as the owner ruled on 2026-09-06.
 */
export function openBucketOf(a: ContractorAssignment, today: string): { bucket: OpenBucket; day: string } {
  const st = problemStateOf(a);
  if (st === 'open') return { bucket: 'problem', day: a.dueDate ?? '' };
  if (st === 'waiting') return { bucket: 'waiting', day: a.dueDate ?? '' };
  const days = daysOf(a);
  if (!days.length) return { bucket: 'dateless', day: '' };
  if (days.includes(today)) return { bucket: 'today', day: today };
  const next = days.find(d => d > today);
  if (next) return { bucket: 'future', day: next };
  return { bucket: 'overdue', day: days[days.length - 1] };
}

/**
 * Open first — problems, today, past due (the most RECENTLY due first: the
 * list reads outward from today in both directions, yesterday before last
 * week), the future (soonest first), then dateless — and the finished work
 * after them, newest closed first. A stable sort: ties keep their order.
 */
export function orderTaskRows<T extends { a: ContractorAssignment }>(rows: T[], today = isoToday()): T[] {
  const open = rows.filter(r => !r.a.completedAt);
  const done = rows.filter(r => !!r.a.completedAt);
  const keyed = open.map((r, i) => ({ r, i, ...openBucketOf(r.a, today) }));
  keyed.sort((x, y) => {
    const b = BUCKET_RANK[x.bucket] - BUCKET_RANK[y.bucket];
    if (b) return b;
    if (x.bucket === 'overdue' && x.day !== y.day) return y.day.localeCompare(x.day);
    if (x.bucket === 'future' && x.day !== y.day) return x.day.localeCompare(y.day);
    const p = (PRIORITY_RANK[x.r.a.priority ?? 'normal'] ?? 1) - (PRIORITY_RANK[y.r.a.priority ?? 'normal'] ?? 1);
    return p || x.i - y.i;
  });
  const doneSorted = done
    .map((r, i) => ({ r, i }))
    .sort((x, y) => (y.r.a.completedAt ?? '').localeCompare(x.r.a.completedAt ?? '') || x.i - y.i);
  return [...keyed.map(k => k.r), ...doneSorted.map(k => k.r)];
}

// The calendar's done-work FOLD is not here: it is TaskCalendar's own
// `dayItems` (groupKey = the workspace), shared with the office's calendars.

/** The local date, as the planner writes it — never the UTC date. */
export function isoToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
