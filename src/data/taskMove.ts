import { Apartment, ContractorAssignment, ContractorNote, ContractorPhoto, Stage, StageMark } from '../types';
import { isWorkStage, taskStageIds, inBaseSet, migrateToBubbles, isStartStage, IMPLIED_DONE } from './stageMarks';
import type { SetContext } from './stageMarks';
import { mediaKindOf } from './mediaKind';

/**
 * MOVING A TASK TO ANOTHER APARTMENT — the arithmetic, pure.
 *
 * The owner, 2026-10-05: a worker recorded a day's work on A1 floor 3 when
 * he was standing in A3 floor 3, and the office had to put it right by hand.
 * "I need a way of dealing with a situation like this… and to give a
 * contractor the permission to move something that he did by mistake."
 *
 * A task's own records follow it (its photos and its messages carry the
 * apartment too); what needs thought is the STAGE TICKS the task left on the
 * apartment it was recorded on. They come OFF the wrong apartment and go ONTO
 * the right one — exactly the marks the task itself wrote, read back through
 * the same rules that wrote them:
 *
 *   - a CLOSED task ticked each of its stages done, except the ones the
 *     worker said he had not finished, which went half done (the completion
 *     rule in `updateContractorAssignment`, mirrored here, not re-invented);
 *   - an OPEN stage report put its stages to "happening now" (the portal's
 *     start, `startWork`);
 *   - an ordinary task that only carried `stageWhenDone` moved the headline
 *     and wrote no mark — there is nothing to carry, and the headline is
 *     left alone on both sides;
 *   - a PROBLEM ticks nothing (its red is derived from the task, so it
 *     follows the task by itself).
 *
 * Two rules keep a move from destroying somebody else's work:
 *   - a mark comes off the old apartment only if NO OTHER task there also
 *     stands behind that stage, and only if it still reads what this task
 *     wrote (a mark the office changed by hand since is the office's);
 *   - on the new apartment a move never undoes a finished stage and never
 *     overrides a stage the office switched off — "done" and "not needed"
 *     are answers somebody gave about THAT apartment.
 */

export interface MarkMove { stageId: string; mark: StageMark }

export interface TaskMovePlan {
  /** Marks that come OFF the old apartment. */
  off: MarkMove[];
  /** Marks that go ONTO the new apartment. */
  on: MarkMove[];
  /** Marks this task wrote that STAY on the old apartment — another task there stands behind them. Carries the mark as it reads now. */
  kept: MarkMove[];
  /** The old apartment's marks after the move — hand to `applyMarks`. */
  fromMarks: Record<string, StageMark> | undefined;
  /** The new apartment's marks after the move. */
  toMarks: Record<string, StageMark> | undefined;
  fromChanged: boolean;
  toChanged: boolean;
  /** The old apartment was put back from the task's own before-snapshot. */
  restored?: boolean;
  /** The new apartment's marks before the move — the moved task's next snapshot. */
  toBefore?: Record<string, StageMark>;
}

/** The workspace's own stages, in order, inactive ones included — what the completion rule reads. */
export function workspaceStages(projectId: string, stages: Stage[]): Stage[] {
  return stages
    .filter(st => (projectId === 'general' ? st.projectId === 'general' : !st.projectId))
    .sort((a, b) => a.order - b.order);
}

/**
 * The marks a task WROTE onto its apartment — the inverse of reading them.
 *
 * Mirrors the two writers exactly: the store's completion rule for a closed
 * task, the portal's start for an open stage report.
 */
export function marksTaskWrote(t: ContractorAssignment, sortedStages: Stage[]): MarkMove[] {
  if (t.problem) return [];
  const isWork = (id: string) => sortedStages.some(st => st.id === id && isWorkStage(st));
  if (t.completedAt) {
    const worked = [...new Set((t.stagesWorked?.length ? t.stagesWorked : taskStageIds(t)).filter(isWork))];
    const unfinished = new Set(t.stagesUnfinished ?? (t.stagesFinished === false ? worked : []));
    return worked.map(stageId => ({ stageId, mark: unfinished.has(stageId) ? 'pending' : 'done' }));
  }
  if (t.stageReport) {
    return [...new Set((t.stagesWorked ?? []).filter(isWork))].map(stageId => ({ stageId, mark: 'doing' as StageMark }));
  }
  return [];
}

/** An apartment's marks as the set model reads them — a record not yet migrated is read through the migration. */
function effectiveMarks(apt: Apartment, sortedStages: Stage[]): Record<string, StageMark> {
  if (apt.bubbles) return { ...(apt.stageMarks ?? {}) };
  return { ...(migrateToBubbles(apt, sortedStages)?.stageMarks ?? apt.stageMarks ?? {}) };
}

const tidy = (m: Record<string, StageMark>) => (Object.keys(m).length ? m : undefined);

export function planTaskMove(
  task: ContractorAssignment,
  from: Apartment,
  to: Apartment,
  tasks: ContractorAssignment[],
  sortedStages: Stage[],
  ctx?: SetContext,
): TaskMovePlan {
  const wrote = marksTaskWrote(task, sortedStages);
  const fromBefore = effectiveMarks(from, sortedStages);
  const toBefore = effectiveMarks(to, sortedStages);

  // Every stage another task on the old apartment stands behind.
  const covered = new Set<string>();
  for (const t of tasks) {
    if (t.id === task.id || t.apartmentId !== from.id) continue;
    for (const m of marksTaskWrote(t, sortedStages)) covered.add(m.stageId);
  }

  const fromMarks = { ...fromBefore };
  const off: MarkMove[] = [];
  const kept: MarkMove[] = [];
  // The worker's own start remembered the apartment as it stood before he
  // touched it (owner, 2026-10-08: "the apartment that he changed from should
  // automatically go back to the previous state it was in before he touched
  // it that day"). With that snapshot the old apartment's touched stages go
  // back to EXACTLY what they were — a half-done stage is half done again,
  // not merely "to do" — including the stages his marks ticked by themselves
  // (Sold/Start, Drilling under Piping). The two safety rules still hold: a
  // stage another task on that apartment stands behind stays, and a stage
  // somebody changed by hand since is theirs.
  const snap = task.marksBefore;
  const restored = !!snap;
  if (snap) {
    const wroteIds = new Set(wrote.map(w => w.stageId));
    const implied = new Map<string, string[]>();   // stage → the written stages that tick it
    for (const st of sortedStages) {
      if (!isStartStage(st)) continue;
      implied.set(st.id, sortedStages.filter(o => o.order > st.order && wroteIds.has(o.id)).map(o => o.id));
    }
    for (const [when, also] of IMPLIED_DONE) if (wroteIds.has(when)) implied.set(also, [...(implied.get(also) ?? []), when]);
    const coveredLater = (id: string) => {
      const st = sortedStages.find(o => o.id === id);
      if (!st) return false;
      if (isStartStage(st)) return [...covered].some(c => (sortedStages.find(o => o.id === c)?.order ?? -1) > st.order);
      return IMPLIED_DONE.some(([w, a]) => a === id && covered.has(w));
    };
    const touched: MarkMove[] = [
      ...wrote,
      ...[...implied.entries()].filter(([id, by]) => by.length && !wroteIds.has(id)).map(([stageId]) => ({ stageId, mark: 'done' as StageMark })),
    ];
    for (const { stageId, mark } of touched) {
      const now = fromMarks[stageId];
      const was = snap[stageId];
      if (now === was) continue;
      if (covered.has(stageId) || coveredLater(stageId)) {
        if (now && now !== 'todo' && now !== 'off') kept.push({ stageId, mark: now });
        continue;
      }
      // What this task (or its implication) left there: its own mark, or —
      // for an open report that has since been closed by the same task —
      // anything it could have written. Anything else is somebody's hand.
      const ours = now === mark || (wroteIds.has(stageId) && (now === 'doing' || now === 'done' || now === 'pending'));
      if (!ours) continue;
      if (was === undefined) delete fromMarks[stageId];
      else fromMarks[stageId] = was;
      off.push({ stageId, mark: now ?? 'todo' });
    }
  }
  for (const { stageId, mark } of (restored ? [] : wrote)) {
    const now = fromMarks[stageId];
    if (covered.has(stageId)) {
      if (now && now !== 'todo' && now !== 'off') kept.push({ stageId, mark: now });
      continue;
    }
    if (now !== mark) continue;               // changed by hand since — the office's, not ours
    const stage = sortedStages.find(st => st.id === stageId);
    // Back to "to do". A stage in the apartment's base set needs no mark for
    // that; one that is there only because somebody added it keeps an
    // explicit to-do, or taking the tick off would take the stage away too.
    if (stage && inBaseSet(from, stage, ctx)) delete fromMarks[stageId];
    else fromMarks[stageId] = 'todo';
    off.push({ stageId, mark });
  }

  const toMarks = { ...toBefore };
  const on: MarkMove[] = [];
  for (const { stageId, mark } of wrote) {
    const now = toMarks[stageId];
    if (now === 'done' || now === 'off' || now === mark) continue;
    toMarks[stageId] = mark;
    on.push({ stageId, mark });
  }

  return {
    off, on, kept,
    fromMarks: tidy(fromMarks),
    toMarks: tidy(toMarks),
    fromChanged: off.length > 0,
    toChanged: on.length > 0,
    restored,
    toBefore,
  };
}

/** What travels WITH a task — counted the way a person counts it. */
export interface TaskBaggage {
  photos: number;
  films: number;
  files: number;
  messages: number;
  /** Does any of it live in Google Drive? (the move leaves the bytes where they are) */
  onDrive: boolean;
}

export function taskBaggage(taskId: string, photos: ContractorPhoto[], notes: ContractorNote[]): TaskBaggage {
  const out: TaskBaggage = { photos: 0, films: 0, files: 0, messages: 0, onDrive: false };
  for (const p of photos) {
    if (p.assignmentId !== taskId) continue;
    const k = mediaKindOf(p.filename, p.mimeType);
    // The name decides; a record with no extension and no type falls back to
    // its own label, and an old typeless record is a picture (the default).
    const legacy = k === 'file' && !p.mimeType;
    if (k === 'video' || (legacy && p.fileType === 'video')) out.films++;
    else if (k === 'image' || (legacy && p.fileType !== 'file')) out.photos++;
    else out.files++;
    if (p.driveFileId || p.driveUrl) out.onDrive = true;
  }
  for (const n of notes) {
    if (n.assignmentId !== taskId) continue;
    out.messages++;
    if (n.attachmentDriveFileId || n.attachmentDriveUrl) out.onDrive = true;
  }
  return out;
}

/**
 * Where an apartment is, short — "A1 10" — for sentences and history lines.
 * A Job Board job has no building or number worth printing: its name is the
 * place.
 */
export function placeLabel(apt: Pick<Apartment, 'buildingId' | 'apartmentNumber' | 'displayName'> | null | undefined): string {
  if (!apt) return '?';
  const num = apt.apartmentNumber?.trim() ?? '';
  const name = apt.displayName?.trim() ?? '';
  if (!apt.buildingId || apt.buildingId === 'G') return name || num || '?';
  return `${apt.buildingId} ${num || name || '?'}`;
}

/**
 * Can a task be moved TO this record? A real unit — the counting rule — with
 * one widening for the Job Board: a job filed in a group is still a real job
 * (the import put a thousand of them in Done and Archive), so only Trash and
 * nameless scaffolding are refused. On a building workspace nothing is ever
 * filed, so this is exactly `isCountableApartment`.
 */
export function isMoveTarget(apt: Pick<Apartment, 'isUnnamed' | 'apartmentNumber' | 'displayName' | 'boardBin'>): boolean {
  if (apt.isUnnamed) return false;
  if (apt.boardBin === 'trash') return false;
  return !!(apt.apartmentNumber?.trim() || apt.displayName?.trim());
}
