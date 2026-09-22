/**
 * THE WOLFSON STAGE SPLIT (owner, 2026-09-22: "piping, detailed units and
 * fans have three bubbles; wall units and outdoor units, two bubbles;
 * registers, access panels, thermostats — more bubbles", on the grey →
 * yellow → orange → green ramp he drew; "remove them and go on the split").
 *
 * Three combined stages in the GLOBAL list (Wolfson and Netiv share it)
 * become eight, each a real work stage of its own. Nothing is destroyed:
 * the combined stage is RETIRED (`active: false`, its record kept for the
 * history, the notes and the tasks that name it), its children are minted
 * under FIXED ids so two machines running the migration write the same
 * documents, and every apartment's mark on the parent is COPIED onto each
 * child — done stays done on all three, half done stays half done — so
 * nothing already ticked comes undone. The colours are the ramp from the
 * preview the owner approved.
 *
 * Pure: the store runs `planStageSplit` once for the list and the three
 * `split…` helpers per record; every one answers null when there is nothing
 * to do, which is what makes the migration idempotent (a Firestore echo of an
 * old record is simply split again).
 */
import type { Apartment, ContractorAssignment, Stage, StageMark, StageNote } from '../types';

export interface SplitChild { id: string; name: string; nameHe: string; color: string; order: number }
export interface StageSplit { parent: string; children: SplitChild[] }

export const STAGE_SPLITS: StageSplit[] = [
  { parent: 's1', children: [
    { id: 's1-piping',    name: 'Piping',          nameHe: 'צנרת',           color: '#9ca3af', order: 2 },
    { id: 's1-concealed', name: 'Concealed Units', nameHe: 'יחידות נסתרות',  color: '#c9b95c', order: 3 },
    { id: 's1-fans',      name: 'Fans',            nameHe: 'מפוחים',         color: '#eab308', order: 4 },
  ] },
  { parent: 's4', children: [
    { id: 's4-wall',      name: 'Wall Units',      nameHe: 'עיליים',         color: '#f59e0b', order: 5 },
    { id: 's4-outdoor',   name: 'Outdoor Units',   nameHe: 'מעבים',          color: '#f97316', order: 6 },
  ] },
  { parent: 's7', children: [
    { id: 's7-registers', name: 'Registers',       nameHe: 'פתחים',          color: '#ea580c', order: 7 },
    { id: 's7-panels',    name: 'Access Panels',   nameHe: 'תריסים',         color: '#a3a512', order: 8 },
    { id: 's7-thermostats', name: 'Thermostats',   nameHe: 'תרמוסטטים',      color: '#65a30d', order: 9 },
  ] },
];

const BY_PARENT = new Map(STAGE_SPLITS.map(s => [s.parent, s]));
export const isSplitParent = (id: string | null | undefined): boolean => !!id && BY_PARENT.has(id);
export const firstChildOf = (parentId: string): string => BY_PARENT.get(parentId)!.children[0].id;

/** The child records to add (only the missing ones) and the parents still to retire. */
export function planStageSplit(stages: Stage[], now: string): { add: Stage[]; retire: string[] } {
  const add: Stage[] = [];
  const retire: string[] = [];
  for (const sp of STAGE_SPLITS) {
    const parent = stages.find(s => s.id === sp.parent);
    // Only the GLOBAL combined stage — a workspace with its own list (the Job
    // Board) never carried these ids, and a same-id stage scoped to a
    // workspace is somebody else's.
    if (!parent || parent.projectId) continue;
    for (const c of sp.children) {
      if (stages.some(s => s.id === c.id)) continue;
      add.push({ id: c.id, name: c.name, nameHe: c.nameHe, color: c.color, order: c.order, active: true, kind: 'work', createdAt: now, updatedAt: now });
    }
    if (parent.active) retire.push(parent.id);
  }
  return { add, retire };
}

/** A stage-id list with every parent replaced by its children (in place, deduplicated); null when no parent was in it. */
export function splitStageIdList(ids: string[] | undefined): string[] | null {
  if (!ids || !ids.some(isSplitParent)) return null;
  const out: string[] = [];
  for (const id of ids) {
    const sp = BY_PARENT.get(id);
    for (const x of sp ? sp.children.map(c => c.id) : [id]) if (!out.includes(x)) out.push(x);
  }
  return out;
}

/**
 * The apartment's marks with each parent's mark copied onto its children
 * (a child already marked keeps its own mark) and the parent's mark gone.
 * `headline` is the child to print when the apartment STOOD on a parent with
 * nothing marked — the headline derivation leaves an unmarked record where it
 * stood, and where it stood is retired. Null when nothing named a parent.
 */
export function splitApartment(apt: Pick<Apartment, 'stageMarks' | 'currentStageId'>): { marks: Record<string, StageMark> | undefined; headline: string | null } | null {
  const marks = apt.stageMarks ?? {};
  const touched = Object.keys(marks).some(isSplitParent) || isSplitParent(apt.currentStageId);
  if (!touched) return null;
  const next: Record<string, StageMark> = { ...marks };
  for (const sp of STAGE_SPLITS) {
    const m = next[sp.parent];
    if (!m) continue;
    for (const c of sp.children) if (!next[c.id]) next[c.id] = m;
    delete next[sp.parent];
  }
  return { marks: Object.keys(next).length ? next : undefined, headline: isSplitParent(apt.currentStageId) ? firstChildOf(apt.currentStageId!) : null };
}

/** A task's stage fields re-pointed: the single stage to the first child, every list expanded. Null when untouched. */
export function splitTask(t: ContractorAssignment): Partial<ContractorAssignment> | null {
  const patch: Partial<ContractorAssignment> = {};
  if (isSplitParent(t.stageId)) patch.stageId = firstChildOf(t.stageId!);
  if (isSplitParent(t.stageWhenDone)) patch.stageWhenDone = firstChildOf(t.stageWhenDone!);
  for (const k of ['stageIds', 'stagesWorked', 'stagesUnfinished'] as const) {
    const v = splitStageIdList(t[k] as string[] | undefined);
    if (v) (patch as Record<string, unknown>)[k] = v;
  }
  return Object.keys(patch).length ? patch : null;
}

/** A stage note filed on a parent moves to its first child. */
export function splitStageNote(n: Pick<StageNote, 'stageId'>): Partial<StageNote> | null {
  return isSplitParent(n.stageId) ? { stageId: firstChildOf(n.stageId) } : null;
}
