import { Apartment, ContractorAssignment, ProblemInfo } from '../types';

/**
 * PROBLEMS — the one rule every drawing reads (owner, 2026-09-06).
 *
 * A problem is a TASK carrying `problem`, so nothing here stores anything:
 * the apartment's state is DERIVED from its tasks, which is what lets the
 * diagram cell, the board tile, the wallboard, the Building Progress square
 * and the drawer's band all agree. The apartment's real stage is never
 * touched — a problem wears its colour on top and comes off when approved.
 *
 *   open / returned → 'open'   — red, with a big exclamation
 *   waiting         → 'waiting' — a softer red, "waiting for approval"
 *   solved (completed) → null — the apartment is simply on its stage again
 */
export type ProblemState = 'open' | 'waiting' | null;

export const PROBLEM_RED = '#dc2626';
export const PROBLEM_ROSE = '#f43f5e';
/** Cell fills — the same reds, lighter for the rose so the words stay legible. */
export const PROBLEM_FILL: Record<Exclude<ProblemState, null>, string> = { open: '#dc2626', waiting: '#fb7185' };

/** Is this task a LIVE problem — one the worker or the office still has to act on? */
export function isLiveProblem(a: ContractorAssignment): boolean {
  return !!a.problem && !a.completedAt && a.problem.status !== 'solved';
}

export function problemStateOf(a: ContractorAssignment): ProblemState {
  if (!isLiveProblem(a)) return null;
  return a.problem!.status === 'waiting' ? 'waiting' : 'open';
}

/** The apartment's state: open beats waiting — one unfixed problem is a red apartment. */
export function problemState(aptId: string, tasks: ContractorAssignment[]): ProblemState {
  let out: ProblemState = null;
  for (const a of tasks) {
    if (a.apartmentId !== aptId) continue;
    const st = problemStateOf(a);
    if (st === 'open') return 'open';
    if (st === 'waiting') out = 'waiting';
  }
  return out;
}

/** Every apartment's state in one pass — for a diagram of 168 cells. */
export function problemStates(tasks: ContractorAssignment[]): Map<string, Exclude<ProblemState, null>> {
  const m = new Map<string, Exclude<ProblemState, null>>();
  for (const a of tasks) {
    const st = problemStateOf(a);
    if (!st) continue;
    const cur = m.get(a.apartmentId);
    if (cur === 'open') continue;
    m.set(a.apartmentId, st);
  }
  return m;
}

/** Live problems on one apartment, the open ones first, newest first. */
export function problemsOf(aptId: string, tasks: ContractorAssignment[]): ContractorAssignment[] {
  return tasks
    .filter(a => a.apartmentId === aptId && !!a.problem)
    .sort((a, b) => (Number(isLiveProblem(b)) - Number(isLiveProblem(a))) || b.createdAt.localeCompare(a.createdAt));
}

/** Days past the deadline (0 when not late). `today` is passed in — a rule that reads the clock cannot be tested. */
export function problemDaysLate(a: ContractorAssignment, today: string): number {
  if (!a.dueDate || !isLiveProblem(a) || a.problem!.status === 'waiting') return 0;
  const ms = Date.parse(today) - Date.parse(a.dueDate);
  return ms > 0 ? Math.floor(ms / 86400000) : 0;
}

/**
 * The deadline a new problem opens with: three WORKING days from today —
 * Friday and Saturday skipped (the starred answer the owner let stand).
 */
export function defaultDeadline(today: Date, workingDays = 3): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let left = workingDays;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd === 5 || wd === 6) continue;
    left--;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A solved problem's band stays as the record for this long, then folds into History. */
export const SOLVED_BAND_DAYS = 30;

export function bandWorthy(a: ContractorAssignment, today: string): boolean {
  if (!a.problem) return false;
  if (isLiveProblem(a)) return true;
  const at = a.problem.approvedAt ?? a.completedAt;
  if (!at) return false;
  return (Date.parse(today) - Date.parse(at.slice(0, 10))) / 86400000 <= SOLVED_BAND_DAYS;
}

/** What a fresh problem record carries, given where the apartment stands now. */
export function newProblemInfo(apt: Pick<Apartment, 'currentStageId'>, photosRequired: boolean): ProblemInfo {
  return { photosRequired, status: 'open', stageBefore: apt.currentStageId ?? null };
}

/** Who may approve: admin users only (the starred answer). */
export function canApproveProblem(user: { role?: string } | null | undefined): boolean {
  return !!user && user.role === 'admin';
}
