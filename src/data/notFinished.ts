/**
 * "Not finished today" (owner, 2026-10-11) — PURE, so the arithmetic is
 * tested offline (scratchpad/notfinished-test.mjs) and the worker's phone and
 * the office's window cannot disagree about what one press means.
 *
 * A worker started a one-day job, did not finish, and nothing in the app could
 * say so: the job turned red as late and the office had to guess. Now:
 *
 *  - the job STAYS OPEN — nothing is closed, no pictures are demanded;
 *  - the day he worked is on the task (so the notebook shows he was there),
 *    and the day he is coming back is added (so his calendar and the
 *    notebook carry it, and the job stops reading late);
 *  - the stages he finished that day are crossed off, the task's others go
 *    half done (the orange clock), through the set model's one writer;
 *  - "I don't know yet" adds no day: the job then NEEDS A NEW DAY, derived —
 *    the moment the office drags the tile to a later day the need is met.
 */
import type { ContractorAssignment, StageMark, UnfinishedReport } from '../types';
import { daysOf, nextWorkingDay, parseDay } from './taskDays';
import { taskStageIds } from './stageMarks';

export interface NotFinishedInput {
  /** The day worked (local yyyy-MM-dd). */
  today: string;
  /** The day he is coming back, or null for "I don't know yet". */
  next: string | null;
  /** The task's stages he finished today. */
  finishedIds: string[];
  by: string;
  /** ISO time of the report. */
  at: string;
}

export interface NotFinishedPlan {
  /** The task's days afterwards; undefined when only one day is left. */
  days: string[] | undefined;
  dueDate: string;
  unfinished: UnfinishedReport[];
  /** Marks to lay over the apartment's own (finished → done, the rest → pending). */
  marks: Record<string, StageMark>;
}

export function notFinishedPlan(task: ContractorAssignment, input: NotFinishedInput): NotFinishedPlan {
  const all = new Set(daysOf(task));
  all.add(input.today);
  if (input.next && input.next > input.today) all.add(input.next);
  const sorted = [...all].sort();
  const stages = taskStageIds(task);
  const finished = input.finishedIds.filter(id => stages.includes(id));
  const marks: Record<string, StageMark> = {};
  for (const id of stages) marks[id] = finished.includes(id) ? 'done' : 'pending';
  const report: UnfinishedReport = {
    at: input.at, by: input.by, day: input.today,
    next: input.next && input.next > input.today ? input.next : null,
    ...(finished.length ? { finished } : {}),
  };
  return {
    days: sorted.length > 1 ? sorted : undefined,
    dueDate: sorted[sorted.length - 1],
    unfinished: [...(task.unfinished ?? []), report],
    marks,
  };
}

/** The latest "not finished" report, if any. */
export function lastUnfinished(task: Pick<ContractorAssignment, 'unfinished'>): UnfinishedReport | null {
  const list = task.unfinished ?? [];
  return list.length ? list[list.length - 1] : null;
}

/**
 * The job needs a new day from the office: its latest report said "I don't
 * know yet" and no day has been added after that report's day since.
 */
export function needsNewDay(task: ContractorAssignment): boolean {
  if (task.completedAt) return false;
  const r = lastUnfinished(task);
  if (!r || r.next) return false;
  return !daysOf(task).some(d => d > r.day);
}

/** Was the job reported not finished on this day? (the notebook's amber tag). */
export function unfinishedOn(task: Pick<ContractorAssignment, 'unfinished'>, day: string): boolean {
  return (task.unfinished ?? []).some(r => r.day === day);
}

/**
 * THE MORNING QUESTION: an open job whose last day has passed and that nobody
 * has said anything about since — "Did you finish A3 12 yesterday?". Returns
 * that last day, or null when there is nothing to ask. Problems and general
 * jobs never ask (a problem waits for approval; a general job is never his to
 * close).
 */
export function morningAskDay(task: ContractorAssignment, today: string): string | null {
  if (task.completedAt || task.problem || task.general) return null;
  const days = daysOf(task);
  if (!days.length) return null;
  const last = days[days.length - 1];
  if (last >= today) return null;
  if ((task.unfinished ?? []).some(r => r.day >= last)) return null;
  return last;
}

/** The next working day after today (skips Friday and Saturday). */
export function comeBackDay(today: string): string {
  return nextWorkingDay(today);
}

/** Days between two local dates (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);
}

/**
 * The line the app writes into the task's messages — ENGLISH, the standing
 * rule for a stored record (every screen translates on the way out).
 */
export function notFinishedLine(r: Pick<UnfinishedReport, 'next' | 'finished'>, stageName: (id: string) => string): string {
  const back = r.next
    ? `Coming back ${parseDay(r.next).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}.`
    : 'New day not decided yet.';
  const fin = r.finished?.length ? ` Finished today: ${r.finished.map(stageName).join(', ')}.` : '';
  return `Not finished today. ${back}${fin}`;
}
