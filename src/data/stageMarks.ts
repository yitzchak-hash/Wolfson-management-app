import { Apartment, Stage } from '../types';

/**
 * Per-stage state for one apartment — the owner's stage-discipline round.
 *
 * Contractors do not always work the stage order, so "which stage is the job
 * on" stopped being the whole story: a stage can be DONE although the job has
 * not reached it, or half-done (PENDING) although the job has moved past it.
 *
 * `'done'`    — crossed off with a green check in the stage picker.
 * `'pending'` — half-done: a glowing orange clock, and a row in the office's
 *               pending list in the header. Only ever a MANUAL/reported mark.
 * `'open'`    — nothing recorded.
 *
 * The rule, in one sentence: a manual mark always wins; without one, every
 * stage ordered BEFORE the current stage reads as done (moving on is what
 * closes a stage), and the current stage itself stays open until the job
 * moves past it or somebody marks it.
 */
export type StageState = 'done' | 'pending' | 'open';

export function stageStateOf(
  apt: Pick<Apartment, 'currentStageId' | 'stageMarks'>,
  stageId: string,
  sortedStages: Stage[],
): StageState {
  const mark = apt.stageMarks?.[stageId];
  if (mark) return mark;
  if (!apt.currentStageId) return 'open';
  const cur = sortedStages.find(s => s.id === apt.currentStageId);
  const st = sortedStages.find(s => s.id === stageId);
  if (!cur || !st) return 'open';
  return st.order < cur.order ? 'done' : 'open';
}

/** One row of the office's pending list. */
export interface PendingStageRow {
  apartment: Apartment;
  stage: Stage;
}

/**
 * Every MANUALLY pending stage across the given apartments — the running list
 * behind the header's orange clock. Derived-done stages never appear here
 * (they are bookkeeping, not an alarm), and a mark whose stage has since been
 * deleted is skipped rather than drawn as a blank row.
 */
export function pendingStages(apartments: Apartment[], stages: Stage[]): PendingStageRow[] {
  const byId = new Map(stages.map(s => [s.id, s]));
  const rows: PendingStageRow[] = [];
  for (const apt of apartments) {
    for (const [stageId, mark] of Object.entries(apt.stageMarks ?? {})) {
      if (mark !== 'pending') continue;
      const stage = byId.get(stageId);
      if (stage) rows.push({ apartment: apt, stage });
    }
  }
  return rows;
}

/**
 * The next value of `stageMarks` after one press on a stage's checkbox.
 * Left press cycles open → done → open (a pending stage goes straight to
 * done — pressing the box is saying "this is finished now"); the right-click
 * press toggles pending ↔ open. An empty map collapses to undefined so the
 * field vanishes from records that carry no marks.
 */
export function cycleMark(
  marks: Record<string, 'done' | 'pending'> | undefined,
  stageId: string,
  press: 'left' | 'right',
): Record<string, 'done' | 'pending'> | undefined {
  const next = { ...(marks ?? {}) };
  const cur = next[stageId];
  if (press === 'left') {
    if (cur === 'done') delete next[stageId];
    else next[stageId] = 'done';
  } else {
    if (cur === 'pending') delete next[stageId];
    else next[stageId] = 'pending';
  }
  return Object.keys(next).length ? next : undefined;
}
