import { Apartment, Stage, StageMark, ContractorAssignment } from '../types';
import { isLiveProblem } from './problems';

/**
 * THE SET MODEL — the owner's "bubbles" plan, built 2026-09-22. On screen the
 * word stays STAGE (locked answer 1); "bubble" is only this file's word for
 * how a stage now behaves.
 *
 * An apartment no longer stands at ONE point on a line. It carries a SET of
 * work stages, each with a state, and the office ticks them off in whatever
 * order the site allows. Everything on every screen derives from three
 * things, all of which already ride `apartments` / `stages` / `boardSettings`
 * (no new store key anywhere):
 *
 *   - the WORKSPACE LIST (`stages`), where each line is WORK or a MARKER
 *     (`Stage.kind`) and may be CUSTOM (on a few apartments only);
 *   - the TIPUS SETS (`BoardSetting.tipusStages`) — what an A2 flat starts with;
 *   - the apartment's own MARKS (`Apartment.stageMarks`) — added / doing /
 *     half done / done / not needed, each written by a person or a close.
 *
 * `currentStageId` survives as the apartment's HEADLINE — the one word the
 * cell prints (locked answer 3: what is happening now, else the next thing
 * in the order) — and it is DERIVED and re-written by `applyMarks` every
 * time the marks change, so the fifty readers written for one stage keep
 * working without knowing any of this happened.
 */

export type StageState = 'todo' | 'booked' | 'doing' | 'pending' | 'problem' | 'done' | 'off';

/** What the set rules need to know about the workspace. */
export interface SetContext {
  tipusStages?: Record<string, string[]>;
}

type AptLike = Pick<Apartment, 'id' | 'currentStageId' | 'stageMarks' | 'bubbles' | 'tipus' | 'buildingId'>;

export function isWorkStage(s: Stage): boolean {
  return s.kind !== 'marker';
}

/**
 * Does this stage belong to the apartment's set BEFORE any mark is read —
 * the tipus door, the everywhere door, and a custom stage's own list of
 * where it applies. Markers are never in a set: they are states of the
 * whole flat, not work anybody does.
 */
export function inBaseSet(apt: AptLike, stage: Stage, ctx?: SetContext): boolean {
  if (!isWorkStage(stage)) return false;
  if (stage.custom) {
    return !!(stage.onApartments?.includes(apt.id)
      || (apt.tipus && stage.onTipus?.includes(apt.tipus))
      || (apt.buildingId && stage.onBuildings?.includes(apt.buildingId)));
  }
  if (stage.everywhere) return true;
  const tipusSet = apt.tipus ? ctx?.tipusStages?.[apt.tipus] : undefined;
  if (tipusSet) return tipusSet.includes(stage.id);
  return true;
}

/**
 * The apartment's SET, in the workspace order: every work stage that is
 * either explicitly marked (and not switched off) or in the base set.
 */
export function stageSetOf(apt: AptLike, sortedStages: Stage[], ctx?: SetContext): Stage[] {
  const marks = apt.stageMarks ?? {};
  return sortedStages.filter(st => {
    if (!isWorkStage(st) || !st.active) return false;
    const m = marks[st.id];
    if (m) return m !== 'off';
    return inBaseSet(apt, st, ctx);
  });
}

/**
 * The STORED state of one stage on one apartment. A mark always wins. With
 * no mark, a migrated apartment (`bubbles`) reads TO DO; a record that has
 * not been migrated yet keeps the old derivation — every stage ordered
 * before the one it stands on is done — so nothing changes on screen until
 * the migration has written the same thing out explicitly.
 */
export function stageStateOf(
  apt: Pick<Apartment, 'currentStageId' | 'stageMarks'> & Partial<Pick<Apartment, 'bubbles'>>,
  stageId: string,
  sortedStages: Stage[],
): StageState {
  const mark = apt.stageMarks?.[stageId];
  if (mark) return mark;
  if (apt.bubbles) return 'todo';
  if (!apt.currentStageId) return 'todo';
  const cur = sortedStages.find(s => s.id === apt.currentStageId);
  const st = sortedStages.find(s => s.id === stageId);
  if (!cur || !st) return 'todo';
  return st.order < cur.order ? 'done' : 'todo';
}

/**
 * The LIVE state — the stored state with what the apartment's open tasks
 * say laid over it: a live problem on the stage is PROBLEM; an open task
 * with a date on a to-do stage makes it BOOKED; an open stage report that
 * names the stage makes it DOING (belt and braces — the start flow writes
 * the mark too). Neither booked nor problem is ever stored.
 */
export function liveStateOf(
  apt: Pick<Apartment, 'id' | 'currentStageId' | 'stageMarks'> & Partial<Pick<Apartment, 'bubbles'>>,
  stageId: string,
  sortedStages: Stage[],
  tasks: ContractorAssignment[],
): StageState {
  const stored = stageStateOf(apt, stageId, sortedStages);
  if (stored === 'done' || stored === 'off') return stored;
  let out: StageState = stored;
  for (const t of tasks) {
    if (t.apartmentId !== apt.id || t.completedAt) continue;
    const ids = taskStageIds(t);
    if (!ids.includes(stageId)) continue;
    if (isLiveProblem(t)) return 'problem';
    if (t.stageReport && out !== 'pending') out = 'doing';
    else if (out === 'todo' && t.dueDate) out = 'booked';
  }
  return out;
}

/** Every stage a task is for — the new list, else the single stage. */
export function taskStageIds(t: Pick<ContractorAssignment, 'stageId' | 'stageIds'>): string[] {
  if (t.stageIds?.length) return t.stageIds;
  return t.stageId ? [t.stageId] : [];
}

/**
 * The HEADLINE — the one word an apartment's cell prints (locked answer 3):
 * the stage being worked NOW; else the half-done one; else the NEXT to do
 * in the order. With everything done, the last MARKER in the list ("Job
 * completed") if there is one, else the last stage done. And before any
 * work has been recorded at all, the headline is left exactly as it stood —
 * a white "not started" cell or a "Ready to start" marker — so the
 * migration turns no building into a wall of the first stage's colour.
 */
export function headlineStageId(apt: AptLike, sortedStages: Stage[], ctx?: SetContext): string | null {
  const set = stageSetOf(apt, sortedStages, ctx);
  const state = (id: string) => stageStateOf(apt, id, sortedStages);
  const touched = set.some(st => { const s = state(st.id); return s === 'done' || s === 'doing' || s === 'pending'; });
  if (!touched) {
    // Nothing recorded yet: keep a marker (or nothing); a stale work stage
    // that is no longer in the set falls to the first to-do.
    const cur = sortedStages.find(s => s.id === apt.currentStageId);
    if (!cur) return null;
    if (!isWorkStage(cur)) return cur.id;
    return set.some(s => s.id === cur.id) ? cur.id : (set[0]?.id ?? null);
  }
  const doing = set.find(st => state(st.id) === 'doing');
  if (doing) return doing.id;
  const pending = set.find(st => state(st.id) === 'pending');
  if (pending) return pending.id;
  const next = set.find(st => state(st.id) === 'todo');
  if (next) return next.id;
  // Everything in the set is done: the CLOSING marker ("Job completed") if
  // the list has one — a marker ordered after the last work stage, never
  // "Ready to start" at the top — else the last stage done.
  const lastWorkOrder = set.length ? set[set.length - 1].order : -Infinity;
  const closing = sortedStages.filter(s => !isWorkStage(s) && s.active && s.order > lastWorkOrder);
  if (closing.length) return closing[closing.length - 1].id;
  const lastDone = [...set].reverse().find(st => state(st.id) === 'done');
  return lastDone?.id ?? apt.currentStageId ?? null;
}

/**
 * The ONE writer. Every change to an apartment's marks goes through here —
 * the picker, a task closing, the worker's start, the bulk bar, adding a
 * custom stage — and comes out as the fields to write: the marks (an empty
 * map collapses to undefined so the field vanishes), the re-derived
 * headline, and the migration flag, because a record whose marks were
 * written in full IS a migrated record.
 */
export function applyMarks(
  apt: AptLike,
  marks: Record<string, StageMark> | undefined,
  sortedStages: Stage[],
  ctx?: SetContext,
): Pick<Apartment, 'stageMarks' | 'currentStageId' | 'bubbles'> {
  const clean = marks && Object.keys(marks).length ? marks : undefined;
  const next: AptLike = { ...apt, stageMarks: clean, bubbles: true };
  return { stageMarks: clean, currentStageId: headlineStageId(next, sortedStages, ctx), bubbles: true };
}

/**
 * "The job is at X" — what setting the headline by hand still means (the
 * bulk bar, the settings move-jobs flow, the CSV import): every work stage
 * before X in the set is done, X itself is to do (a half-done X keeps its
 * clock), and everything after is left alone. Returns the marks to hand to
 * `applyMarks`. A marker (Ready to start / Job completed) sets no marks —
 * it is the flat's state, not a place on the line.
 */
export function marksForCurrent(
  apt: AptLike,
  stageId: string | null,
  sortedStages: Stage[],
  ctx?: SetContext,
): Record<string, StageMark> | undefined {
  const marks: Record<string, StageMark> = { ...(apt.stageMarks ?? {}) };
  if (!stageId) {
    // Back to "not started": nothing is done any more, nothing is doing.
    for (const k of Object.keys(marks)) if (marks[k] !== 'off') delete marks[k];
    return Object.keys(marks).length ? marks : undefined;
  }
  const target = sortedStages.find(s => s.id === stageId);
  if (!target) return apt.stageMarks;
  if (!isWorkStage(target)) {
    // "Job completed": everything in the set is done. "Ready to start": nothing is.
    const set = stageSetOf({ ...apt, stageMarks: marks }, sortedStages, ctx);
    const last = sortedStages.filter(s => !isWorkStage(s) && s.active).slice(-1)[0];
    if (last && last.id === target.id && set.length) {
      for (const st of set) marks[st.id] = 'done';
    } else {
      for (const st of set) if (marks[st.id] && marks[st.id] !== 'off') delete marks[st.id];
    }
    return Object.keys(marks).length ? marks : undefined;
  }
  const set = stageSetOf({ ...apt, stageMarks: marks }, sortedStages, ctx);
  for (const st of set) {
    if (st.order < target.order) { if (marks[st.id] !== 'off') marks[st.id] = 'done'; }
    else if (st.id === target.id) { if (marks[st.id] !== 'pending') marks[st.id] = 'todo'; }
    else if (marks[st.id] === 'done' || marks[st.id] === 'doing') delete marks[st.id];
  }
  // A stage after the target that was done stays done? No — "the job is at
  // X" is the old whole-line statement, and what comes after X is not done.
  return Object.keys(marks).length ? marks : undefined;
}

export interface StageProgress {
  done: number;
  total: number;
  doing: number;
  pending: number;
  /** The set's stages with their stored states, in order — what a strip draws. */
  rows: Array<{ stage: Stage; state: StageState }>;
}

/** The fraction a cell, a tile and a report print: done of the set. */
export function progressOf(apt: AptLike, sortedStages: Stage[], ctx?: SetContext, tasks?: ContractorAssignment[]): StageProgress {
  const set = stageSetOf(apt, sortedStages, ctx);
  const rows = set.map(stage => ({
    stage,
    state: tasks ? liveStateOf(apt, stage.id, sortedStages, tasks) : stageStateOf(apt, stage.id, sortedStages),
  }));
  return {
    done: rows.filter(r => r.state === 'done').length,
    total: rows.length,
    doing: rows.filter(r => r.state === 'doing').length,
    pending: rows.filter(r => r.state === 'pending').length,
    rows,
  };
}

/** One row of the office's pending list. */
export interface PendingStageRow {
  apartment: Apartment;
  stage: Stage;
}

/**
 * Every HALF-DONE stage across the given apartments — the running list
 * behind the header's orange clock. A mark whose stage has since been
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
 * One press on a stage's box in the apartment window. TAP walks the bubble
 * on — to do → doing → done → to do (a half-done stage goes straight to
 * done: pressing it is saying "this is finished now"); RIGHT press toggles
 * half done. Switching a stage OFF is its own control (`setMark`), never a
 * step in the cycle — a tap must not be able to take a stage out of the
 * fraction by accident.
 */
export function cycleMark(
  marks: Record<string, StageMark> | undefined,
  stageId: string,
  press: 'left' | 'right',
  current: StageState,
): Record<string, StageMark> | undefined {
  const next: Record<string, StageMark> = { ...(marks ?? {}) };
  if (press === 'left') {
    if (current === 'done') next[stageId] = 'todo';
    else if (current === 'doing' || current === 'pending') next[stageId] = 'done';
    else next[stageId] = 'doing';
  } else {
    if (current === 'pending') next[stageId] = 'todo';
    else next[stageId] = 'pending';
  }
  return Object.keys(next).length ? next : undefined;
}

/** Write one mark outright (or remove it with null). */
export function setMark(
  marks: Record<string, StageMark> | undefined,
  stageId: string,
  mark: StageMark | null,
): Record<string, StageMark> | undefined {
  const next: Record<string, StageMark> = { ...(marks ?? {}) };
  if (mark) next[stageId] = mark; else delete next[stageId];
  return Object.keys(next).length ? next : undefined;
}

/**
 * The one-time move of a record onto the set model: writes out what the old
 * line derivation only implied — every work stage before the one it stands
 * on is DONE, the one it stands on is TO DO (explicit, so the headline lands
 * on it) — and raises `bubbles`. Idempotent; null when nothing needs writing.
 */
export function migrateToBubbles(apt: AptLike, sortedStages: Stage[]): Partial<Apartment> | null {
  if (apt.bubbles) return null;
  const marks: Record<string, StageMark> = { ...(apt.stageMarks ?? {}) };
  const cur = sortedStages.find(s => s.id === apt.currentStageId);
  if (cur) {
    for (const st of sortedStages) {
      if (!isWorkStage(st) || marks[st.id]) continue;
      if (st.order < cur.order) marks[st.id] = 'done';
      else if (st.id === cur.id) marks[st.id] = 'todo';
    }
  }
  return { stageMarks: Object.keys(marks).length ? marks : undefined, bubbles: true };
}

const MARKER_NAMES = /^(ready to start|not started|job completed|completed|finished|done|מוכן להתחלה|העבודה הושלמה|הושלם)$/i;

/**
 * The first time a workspace's list is seen without kinds: the lines that
 * are plainly states of the whole flat become MARKERS, everything else is
 * WORK — written explicitly, once, so the office's later choice is never
 * second-guessed by a name match.
 */
export function seedStageKinds(stages: Stage[]): Array<{ id: string; kind: 'work' | 'marker' }> {
  if (stages.some(s => s.kind)) return [];
  return stages.map(s => ({ id: s.id, kind: MARKER_NAMES.test(s.name.trim()) ? 'marker' : 'work' }));
}

/** Where a custom stage applies, in words for a settings row. */
export function customReach(stage: Stage): { apartments: number; tipus: string[]; buildings: string[] } {
  return {
    apartments: stage.onApartments?.length ?? 0,
    tipus: stage.onTipus ?? [],
    buildings: stage.onBuildings ?? [],
  };
}
