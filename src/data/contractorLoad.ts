import { ContractorAssignment } from '../types';

/**
 * How much a contractor already has on their plate.
 *
 * Shown at the moment of assigning, because that is the only moment the answer
 * changes anything. Deliberately just two numbers: open work and how much of it
 * is already late. Anything richer becomes a report nobody reads mid-task.
 *
 * Counted across ALL workspaces the caller passes in — a contractor does not
 * stop being busy because the work is on a different project.
 */
export interface ContractorLoad {
  open: number;
  overdue: number;
  dueThisWeek: number;
}

export function contractorLoad(
  assignments: ContractorAssignment[],
  contractorId: string,
  today = new Date(),
): ContractorLoad {
  const iso = today.toISOString().slice(0, 10);
  const weekEnd = new Date(today.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

  let open = 0, overdue = 0, dueThisWeek = 0;
  for (const a of assignments) {
    if (a.contractorId !== contractorId || a.completedAt) continue;
    open++;
    if (a.dueDate && a.dueDate < iso) overdue++;
    else if (a.dueDate && a.dueDate <= weekEnd) dueThisWeek++;
  }
  return { open, overdue, dueThisWeek };
}

/** Short hover text — one line, never a paragraph. */
export function loadTooltip(l: ContractorLoad): string {
  if (l.open === 0) return 'Nothing open';
  const bits = [`${l.open} open`];
  if (l.overdue) bits.push(`${l.overdue} overdue`);
  if (l.dueThisWeek) bits.push(`${l.dueThisWeek} due this week`);
  return bits.join(' · ');
}

/**
 * Badge colour. Overdue work is the only thing that turns it red — a long queue
 * with everything on time is not a problem worth shouting about.
 */
export function loadColor(l: ContractorLoad): string {
  if (l.overdue > 0) return '#dc2626';
  if (l.open >= 8) return '#d97706';
  return '#94a3b8';
}
