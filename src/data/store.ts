import {
  UndoState, UndoEntry, emptyUndo, remember, popUndo, popRedo,
} from './undo';
import type { TrackOpts } from './undo';
import { applySide, patchBetween, sidesDiffer, snapEls, snapJobs } from './undoBoard';
import type { BoardSides, Side } from './undoBoard';
import { describeUndo, BOOKKEEPING } from './undoWords';
import type { UndoDiff, UndoWorld } from './undoWords';
import { create } from 'zustand';
import { Apartment, CanvasElement, ActivityLog, Project, Stage, StageNote, StageNoteEntry, StageNoteAttachment, StageNoteVersion, GeneralNoteVersion, User, Building, Contractor, ContractorAssignment, ContractorNote, ContractorPhoto, BackupSnapshot, DataSummary, OfficeNoteFile, BackupFrequency, DriveExportFrequency, BackupLogEntry, ContractorUiStrings, DEFAULT_CONTRACTOR_UI_STRINGS, MainUiStrings, DEFAULT_MAIN_UI_STRINGS, HEBREW_MAIN_UI_STRINGS, BoardSetting, BoardSettingKey, BoardLayout, PlanPin, PlanAnnotation, BoardView, Employee, TimePunch, TimeClockSettings, WorkerLevel, StageSuggestion, FocusIntent, StageMark } from '../types';
import { ReportDef } from './reportModel';
/** How often the full backup runs during the day (Settings → Backups). The night one always runs. */
export type FullBackupEvery = 'activity' | 'hourly' | 'every4h' | 'night';
import { setPrefsPerson, prefGet, prefSet, onPrefsChange, prefsPerson } from './prefs';
import { saveNewStep, moveStep, dropSteps, loadSteps } from './undoCloud';

/**
 * THE WORDS, PER PERSON (owner, 2026-10-29: "every user should be able to
 * choose his language … just the words in Hebrew, the layout stays the same").
 *
 * The office keeps its own wording per language in settings/app:
 * `mainUiStrings` (the office set, English unless it says isRtl) and
 * `mainUiStringsHe` (the office's Hebrew changes). Each person picks a
 * language (prefs.ts `ui_lang`, so it follows them to any computer); the
 * screen shows the preset of that language with the office's changes in it.
 * The layout never flips: the office app is always left to right.
 */
let _officeUi: Partial<MainUiStrings> = {};
let _officeUiHe: Partial<MainUiStrings> = {};
export type UiLang = 'en' | 'he';
export function uiLangNow(): UiLang {
  const p = prefGet('ui_lang');
  if (p === 'he' || p === 'en') return p;
  return _officeUi.isRtl ? 'he' : 'en';
}
function effectiveUi(): MainUiStrings {
  if (uiLangNow() === 'he') {
    return { ...HEBREW_MAIN_UI_STRINGS, ...(_officeUi.isRtl ? _officeUi : {}), ..._officeUiHe, isRtl: true } as MainUiStrings;
  }
  return { ...DEFAULT_MAIN_UI_STRINGS, ...(!_officeUi.isRtl ? _officeUi : {}), isRtl: false } as MainUiStrings;
}
// Stored/cloud office words in; the words for THIS person out. Code-added
// keys are never missing: the preset sits underneath.
function mergeFreshMainUi(ms: Partial<MainUiStrings> | null | undefined, he?: Partial<MainUiStrings> | null): MainUiStrings {
  if (ms) _officeUi = ms;
  if (he) _officeUiHe = he;
  return effectiveUi();
}
import { wolfsonTipus, WOLFSON_TIPUSIM } from './wolfsonTipus';
import { isWolfsonBuilding } from './floorRows';
import {
  DEFAULT_BUILDINGS, DEFAULT_PROJECTS, DEFAULT_STAGES, DEFAULT_USERS, NETIV_BUILDINGS,
  buildDefaultApartments, buildNetivApartments, buildGroundFirstFloorSlots, migrateNetivApartments, DATA_VERSION,
} from './initialData';
import {
  fsSet, fsPatch, fsBatchPatch, fsBatchCreate, fsDelete, fsBatchSet, fsGetAll, fsListen, fsListenSince, fsAttach, isFirebaseConfigured, db, projectCollection,
  type Attached,
  fsTombstone,
  fsUntombstone, fsGetTombstones, fsListenTombstones,
} from './firebase';
import { DEFAULT_TIME_CLOCK, resolvePunch } from './timeClock';
import { purgeJobsFromPlanner, isPlannerElement } from './plannerPurge';
import { DEFAULT_WORKER_LEVELS } from './workerLevels';
import { daysOf, closeDayFields } from './taskDays';
import { applyMarks, marksForCurrent, migrateToBubbles, seedStageKinds, taskStageIds, isWorkStage, stageChangesOf, markerRole, headlineStageId } from './stageMarks';
import type { SetContext } from './stageMarks';
import { planStageSplit, splitApartment, splitTask, splitStageNote, splitStageIdList, isSplitParent, firstChildOf } from './stageSplit';
import { notifyWorker } from './pushNotify';
import { plainSummary } from './activityWords';
import { aptLabel } from '../types';
import { planTaskMove, planTaskUndo, placeLabel } from './taskMove';
import type { TaskMovePlan } from './taskMove';

/** How many AUTOMATIC layout snapshots rotate, separate from the 10 manual. */
const LAYOUTS_AUTO_MAX = 8;
const WOLFSON_STORAGE_KEY = 'wolfson_app_data';
const VERSION_KEY = 'wolfson_app_version';
const THEME_KEY = 'wolfson_theme';
const ACTIVE_PROJECT_KEY = 'active_project';

function getProjectStorageKey(projectId: string): string {
  return projectId === 'wolfson' ? WOLFSON_STORAGE_KEY : `${projectId}_app_data`;
}

// Reads every project's tasks + apartments straight from localStorage so the
// global calendar can show all workspaces at once. localStorage is kept current
// by persist() on every mutation, so this is a reliable cross-project snapshot.
export interface ProjectTaskData {
  projectId: string;
  assignments: ContractorAssignment[];
  apartments: Apartment[];
  stages: Stage[];
}
export function loadAllProjectsTaskData(): ProjectTaskData[] {
  return DEFAULT_PROJECTS.map(p => {
    const data = loadFromStorage(getProjectStorageKey(p.id), null) as Record<string, unknown> | null;
    return {
      projectId: p.id,
      assignments: (data?.contractorAssignments as ContractorAssignment[] | null) ?? [],
      apartments: (data?.apartments as Apartment[] | null) ?? [],
      // Stages travel too, so the global calendar can colour a day by the
      // task's stage rather than by whoever it happens to be assigned to.
      stages: (data?.stages as Stage[] | null) ?? [],
    };
  });
}

/**
 * One workspace's rooms and stages, read from its own cache.
 *
 * The dashboard shows a miniature of EVERY workspace at once, and only the
 * active one is live in the store — the others are whatever `persist()` last
 * wrote for them. That is the same limitation the global calendar carries, and
 * for a thumbnail it is the right trade: the alternative is holding three
 * projects' worth of Firestore listeners open on a page that is mostly numbers.
 */
export function loadProjectSnapshot(projectId: string): {
  apartments: Apartment[]; buildings: { id: string; name?: string }[]; stages: Stage[];
  // Everything else the global search needs. One JSON.parse either way, so a
  // caller that only wants the rooms pays nothing for these being here.
  assignments: ContractorAssignment[];
  stageNotes: StageNote[];
  contractorNotes: ContractorNote[];
  canvasElements: CanvasElement[];
  planAnnotations: PlanAnnotation[];
  planPins: PlanPin[];
  officeNoteFiles: OfficeNoteFile[];
  /** Site uploads (metadata — the bytes live in Storage or Drive). Kept live by the foreign sync. */
  photos: ContractorPhoto[];
  /**
   * What this machine last saw of the workspace's activity log (persist keeps
   * the newest 200). NOT kept live — the Job Board's activity centre fetches
   * the cloud's copy when the page opens and only falls back to this.
   */
  activityLogs: ActivityLog[];
} {
  const data = loadFromStorage(getProjectStorageKey(projectId), null) as Record<string, unknown> | null;
  return {
    apartments: (data?.apartments as Apartment[] | null) ?? [],
    buildings: (data?.buildings as { id: string; name?: string }[] | null) ?? [],
    stages: (data?.stages as Stage[] | null) ?? [],
    assignments: (data?.contractorAssignments as ContractorAssignment[] | null) ?? [],
    stageNotes: (data?.stageNotes as StageNote[] | null) ?? [],
    contractorNotes: (data?.contractorNotes as ContractorNote[] | null) ?? [],
    canvasElements: (data?.canvasElements as CanvasElement[] | null) ?? [],
    planAnnotations: (data?.planAnnotations as PlanAnnotation[] | null) ?? [],
    planPins: (data?.planPins as PlanPin[] | null) ?? [],
    officeNoteFiles: (data?.officeNoteFiles as OfficeNoteFile[] | null) ?? [],
    photos: (data?.contractorPhotos as ContractorPhoto[] | null) ?? [],
    activityLogs: (data?.activityLogs as ActivityLog[] | null) ?? [],
  };
}

/**
 * Fetch a workspace's snapshot down from the CLOUD when this machine has none.
 *
 * Everything cross-workspace — Building Progress, the workspace miniatures,
 * unit cards, the notebook's foreign entries — reads `loadProjectSnapshot`,
 * which is whatever `persist()` last wrote on THIS machine. Clear the
 * browser's storage (or sit at a brand-new computer) and every one of them
 * says "not opened on this device yet" even though the data is sitting in
 * Firestore. This pulls the project-scoped collections once per session for a
 * workspace whose local snapshot is missing, writes them to the same
 * localStorage key `persist()` uses, and bumps `snapshotTick` so consumers
 * look again. Opening the workspace properly later overwrites all of it with
 * the live sync, so this can never fight the real thing.
 */
const _snapFetched = new Set<string>();
/** The pull in flight per workspace — a second caller AWAITS it rather than reading nothing. */
const _snapInflight = new Map<string, Promise<void>>();
export function ensureProjectSnapshot(projectId: string): Promise<void> {
  if (!isFirebaseConfigured || !db || !projectId) return Promise.resolve();
  if (_snapFetched.has(projectId)) return _snapInflight.get(projectId) ?? Promise.resolve();
  _snapFetched.add(projectId);
  const p = ensureProjectSnapshotNow(projectId).finally(() => { _snapInflight.delete(projectId); });
  _snapInflight.set(projectId, p);
  return p;
}
async function ensureProjectSnapshotNow(projectId: string): Promise<void> {
  const key = getProjectStorageKey(projectId);
  const existing = loadFromStorage(key, null) as Record<string, unknown> | null;
  // A snapshot with rooms in it is this machine's own memory — leave it be.
  if (existing && Array.isArray(existing.apartments) && (existing.apartments as unknown[]).length > 0) return;
  try {
    const col = (base: string) => projectCollection(projectId, base);
    const [apartments, assignments, stageNotes, contractorNotes, canvasElements, planAnnotations, stages, contractorPhotos] =
      await Promise.all([
        fsGetAll(col('apartments')),
        fsGetAll(col('contractorAssignments')),
        fsGetAll(col('stageNotes')),
        fsGetAll(col('contractorNotes')),
        fsGetAll(col('canvasElements')),
        fsGetAll(col('planAnnotations')),
        fsGetAll('stages'),
        fsGetAll(col('contractorPhotos')),
      ]);
    if (!apartments.length) return;
    // Buildings are not a Firestore collection — the built-ins are seeded.
    const buildings = getDefaultBuildings(projectId);
    const scoped = scopeApartmentsToProject(projectId, apartments as unknown as Apartment[], buildings);
    saveToStorage(key, {
      ...(existing ?? {}),
      apartments: scoped,
      buildings,
      stages,
      contractorAssignments: assignments,
      stageNotes,
      contractorNotes,
      canvasElements,
      planAnnotations,
      contractorPhotos,
    });
    useStore.setState(st => ({ snapshotTick: st.snapshotTick + 1 }));
  } catch {
    // A failed fetch is allowed to retry the next time somebody asks.
    _snapFetched.delete(projectId);
  }
}

/**
 * LIVE SYNC OF THE OTHER WORKSPACES' WORK (owner, 2026-09-16).
 *
 * Only the open workspace ever had listeners. Everything cross-workspace —
 * the worker's portal listing his tasks in every workspace, the notebook's
 * bars for a Wolfson task planned from the Job Board, Building Progress —
 * reads `loadProjectSnapshot`, a localStorage copy that `ensureProjectSnapshot`
 * fills ONCE when it is missing and `persist()` refreshes only while that
 * workspace is the open one. So a task the secretary made in Wolfson showed
 * on her machine (she was standing in Wolfson) and on nobody else's until
 * they opened Wolfson themselves: the owner's "she sees it, I don't" and
 * "the contractor doesn't see it that same second".
 *
 * This attaches real-time listeners to every OTHER workspace's task-bearing
 * collections — apartments (the units the tasks hang off), assignments and
 * the task threads — and writes each change into that workspace's snapshot
 * key, the same key `persist()` and `ensureProjectSnapshot` write, then bumps
 * `snapshotTick` so every consumer re-reads. Firebase wins wholesale for a
 * snapshot (a foreign snapshot is a copy of the cloud, never a place the
 * office writes), so there is no local-keeps rule and no tombstone walk.
 * Writes are debounced per workspace: three listeners answer at once on
 * attach, and one JSON.stringify of a thousand-job board per answer is one
 * too many.
 *
 * Keyed on the OPEN workspace: switching re-attaches so the newly-open one
 * drops out (its own sync takes over) and the one just left joins. A
 * snapshot's stages/canvas/plans still come from `ensureProjectSnapshot`'s
 * one-time pull — nothing cross-workspace needs those live.
 */
let _foreignUnsubs: Array<() => void> = [];
let _foreignFor: string | null = null;
/** Bumped by every stop: an attach still awaiting its snapshot pull must not attach for a run that was stopped. */
let _foreignRun = 0;
export function stopForeignSync(): void {
  _foreignUnsubs.forEach(u => { try { u(); } catch { /* already gone */ } });
  _foreignUnsubs = [];
  _foreignFor = null;
  _foreignRun++;
}
export function startForeignSync(currentProjectId: string): void {
  if (!isFirebaseConfigured || !db || !currentProjectId) return;
  if (_foreignFor === currentProjectId) return;
  stopForeignSync();
  _foreignFor = currentProjectId;
  const { projects } = useStore.getState();
  for (const p of projects) {
    if (p.id === currentProjectId) continue;
    void attachForeign(p.id, currentProjectId);
  }
}

/**
 * One foreign workspace's listeners. The UNITS are the big collection (the
 * Job Board alone is thousands of records), so they arrive as a DELTA: only
 * records stamped at or after the newest `updatedAt` this machine's snapshot
 * already holds, less a two-hour margin for a slow clock. The snapshot is
 * pulled once by `ensureProjectSnapshot` when the machine has none, so the
 * full read happens once per machine rather than on every open — the read
 * bill was every device re-reading every workspace on every load. Tasks and
 * task threads stay whole listeners: they carry no reliable stamp, and they
 * are the collections this exists for. Deletions reach the snapshot through
 * the workspace's tombstone document (one read).
 */
const FOREIGN_MARGIN_MS = 2 * 60 * 60 * 1000;
async function attachForeign(pid: string, currentProjectId: string): Promise<void> {
  const key = getProjectStorageKey(pid);
  const run = _foreignRun;
  await ensureProjectSnapshot(pid);
  if (_foreignFor !== currentProjectId || run !== _foreignRun) return;
  const existing0 = (loadFromStorage(key, null) as Record<string, unknown> | null) ?? {};
  const known = Array.isArray(existing0.apartments) ? existing0.apartments as Apartment[] : [];
  let newest = '';
  for (const a of known) if (a.updatedAt && a.updatedAt > newest) newest = a.updatedAt;
  const sinceMs = newest ? new Date(newest).getTime() - FOREIGN_MARGIN_MS : 0;
  const since = known.length && Number.isFinite(sinceMs) && sinceMs > 0 ? new Date(sinceMs).toISOString() : '';

  let pending: Record<string, unknown> = {};
  let dead = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let first = true;
  const flush = () => {
    timer = null;
    const patch = pending; pending = {};
    // A guard against a listener answering after the sync was re-pointed.
    if (_foreignFor !== currentProjectId) return;
    const existing = (loadFromStorage(key, null) as Record<string, unknown> | null) ?? {};
    if (!Array.isArray(existing.buildings) || !(existing.buildings as unknown[]).length) {
      existing.buildings = getDefaultBuildings(pid);
    }
    if (patch.apartments || patch.tombstones) {
      // Changed units are laid over the snapshot's own; buried ones leave.
      const have = new Map((Array.isArray(existing.apartments) ? existing.apartments as Apartment[] : []).map(a => [a.id, a]));
      for (const a of (patch.apartments as Apartment[] | undefined) ?? []) have.set(a.id, a);
      for (const id of dead) have.delete(id);
      delete patch.tombstones;
      patch.apartments = scopeApartmentsToProject(pid, Array.from(have.values()), existing.buildings as Building[]);
    }
    saveToStorage(key, { ...existing, ...patch });
    useStore.setState(st => ({ snapshotTick: st.snapshotTick + 1 }));
  };
  const queue = (k: string, v: unknown) => {
    pending[k] = v;
    if (timer) clearTimeout(timer);
    // The attach answer comes fast and whole; a later change is one record.
    timer = setTimeout(flush, first ? 120 : 400);
    first = false;
  };
  const col = (base: string) => projectCollection(pid, base);
  _foreignUnsubs.push(
    fsListenSince(col('apartments'), 'updatedAt', since, docs => queue('apartments', docs)),
    fsListenTombstones(pid, ids => { dead = ids; queue('tombstones', true); }),
    fsListen(col('contractorAssignments'), docs => queue('contractorAssignments', docs)),
    fsListen(col('contractorNotes'), docs => queue('contractorNotes', docs)),
    // Site uploads too (metadata only — small): the wall stands on the Job
    // Board while the workers close tasks on Wolfson and Netiv, and "Live
    // from site" has to show a picture seconds after it lands wherever it
    // landed (owner, 2026-09-23).
    fsListen(col('contractorPhotos'), docs => queue('contractorPhotos', docs)),
    () => { if (timer) clearTimeout(timer); timer = null; },
  );
}

// Holds unsubscribe functions for all active Firestore real-time listeners.
// Stored outside the Zustand state (not serializable) so they survive re-renders.
let _firebaseUnsubscribers: Array<() => void> = [];
/** The running sync left the office-only collections out (the worker's phone). */
let _syncLean = false;
/**
 * Which startFirebaseSync run is the live one. A run that is still awaiting
 * its first answers when the workspace switches used to finish anyway —
 * merging workspace A's units into workspace B's state (its `pid` was
 * captured before the switch, so the scoping kept A's records), persisting
 * them there, and then B's own run pushed them up as "missing" into B's
 * collection. That is how 3,520 Job Board jobs came to live in Wolfson's
 * apartments collection and 244 Wolfson units in the Job Board's (found
 * 2026-09-22: every load read four workspaces' worth of records). Every
 * await and every listener callback now checks it is still the live run
 * for the open workspace, and a stale run detaches itself.
 */
let _syncRun = 0;
/** Does this apartment record belong in `pid`'s own collection? The writer-side twin of scopeApartmentsToProject. */
function ownsRecord(pid: string, a: Apartment, buildings: Building[]): boolean {
  if (pid === 'general') return a.buildingId === 'G';
  if (a.buildingId === 'G') return false;
  const ids = new Set(buildings.map(b => b.id));
  return ids.size === 0 || ids.has(a.buildingId);
}

/**
 * Ids this workspace has deleted on purpose — see fsTombstone in firebase.ts.
 *
 * Kept outside the state deliberately: it is a mechanism, not the office's
 * data, so it has no business in a backup and would only be one more key to
 * forget in the persist/export/import trio. The cloud copy is the shared
 * memory; this is the fast local answer used while a listener is firing.
 */
let _tombstones = new Set<string>();
export function isTombstoned(id: string): boolean { return _tombstones.has(id); }

/** True while an undo/redo entry's closure is executing — see rememberUndo. */
let _undoWalking = false;

/** Remember a deletion, locally and for every other device. */
function tombstone(projectId: string, ids: string[]) {
  ids.forEach(id => _tombstones.add(id));
  fsTombstone(projectId, ids);
}

/**
 * Forget a deletion — for UNDO, and for nothing else.
 *
 * Putting a record back without this is not an undo: the tombstone stands, the
 * next sync takes it out again, and the thing blinks back and vanishes on
 * every device. Whatever puts a record back must lift its tombstone in the
 * same breath.
 */
function untombstone(projectId: string, ids: string[]) {
  ids.forEach(id => _tombstones.delete(id));
  fsUntombstone(projectId, ids);
}

// ─── Undo: one tracker for every kind of record ─────────────────────────────
/**
 * `trackUndo(opts, body)` — THE door onto the undo stack (owner, 2026-10-15:
 * "any action I do, I want to see an undo").
 *
 * It snapshots every record the office can change — jobs, board nodes, tasks,
 * task messages, photos, stage notes, office files, the per-workspace
 * settings bags (time off lives there) and any task written into ANOTHER
 * workspace during the body — runs the body, snapshots again, and records ONE
 * entry for whatever differs. The entry's undo/redo restore only the fields
 * that differ between the two sides, onto the live record, so a colleague's
 * edit to another field in between survives.
 *
 * Rules:
 *   · Nested calls are one step: only the OUTERMOST records. A store action
 *     that records itself (addContractorAssignment…) called inside a
 *     caller's track becomes part of the caller's step.
 *   · Nothing is recorded while an undo/redo is walking, inside
 *     `withoutUndo` (automated writes — migrations, the notebook's fold), or
 *     on the worker's portal (no undo there; his writes are not the office's).
 *   · `opts` null → worded from the change itself (undoWords.ts), always
 *     `content`, because every self-recording action changes content.
 *   · Bookkeeping stamps (updatedAt, contentUpdatedAt …) are neither a
 *     change nor restored.
 *   · A JOB is never created or destroyed by an undo (applySide's rule).
 *   · Tasks, messages and photos are restored RAW — no completion rule, no
 *     push to the worker, no history line, no planner question: an undo puts
 *     the record back, it does not perform the action again. Task deletes
 *     write no tombstone, so there is none to lift; board nodes go through
 *     restoreCanvasElements, which lifts theirs.
 */
type RawKind = 'contractorAssignments' | 'contractorNotes' | 'contractorPhotos' | 'stageNotes' | 'officeNoteFiles';
const RAW_KINDS: RawKind[] = ['contractorAssignments', 'contractorNotes', 'contractorPhotos', 'stageNotes', 'officeNoteFiles'];
type AnyRec = { id: string } & Record<string, unknown>;
/** What each kind sends to Firestore — the binary stays on this machine, as on every normal write. */
/** A stage note as the cloud keeps it: no file bytes. */
function leanNote(n: StageNote | undefined): Record<string, unknown> | undefined {
  return n ? RAW_LEAN.stageNotes(n as unknown as AnyRec) : undefined;
}

const RAW_LEAN: Record<RawKind, (r: AnyRec) => AnyRec> = {
  contractorAssignments: a => ({ ...a, attachments: (a as unknown as ContractorAssignment).attachments?.map(att => ({ ...att, dataUrl: '' })) }),
  contractorNotes: n => ({ ...n, attachmentDataUrl: undefined }),
  contractorPhotos: p => ({ ...p, dataUrl: '' }),
  stageNotes: n => {
    const note = n as unknown as StageNote;
    return {
      ...n, attachmentDataUrl: undefined,
      attachments: note.attachments?.map(a => ({ ...a, dataUrl: undefined })),
      entries: note.entries?.map(e => ({ ...e, attachments: e.attachments?.map(a => ({ ...a, dataUrl: undefined })) })),
    };
  },
  officeNoteFiles: f => ({ ...f, dataUrl: '' }),
};

let _trackDepth = 0;
let _undoQuiet = 0;
/** Tasks written into another workspace during the open track: `pid|id` → before. */
let _foreignTouched: Map<string, { pid: string; id: string; before: ContractorAssignment | null }> | null = null;

/** Run automated writes (migrations, sweeps, folds) without putting them on the undo stack. */
export function withoutUndo<T>(body: () => T): T {
  _undoQuiet++;
  try { return body(); } finally { _undoQuiet--; }
}

/** The foreign task writers call this BEFORE writing, so the open track can undo them. */
function noteForeignTask(pid: string, id: string, before: ContractorAssignment | null) {
  if (!_foreignTouched) return;
  const k = `${pid}|${id}`;
  if (!_foreignTouched.has(k)) _foreignTouched.set(k, { pid, id, before: before ? { ...before } : null });
}

function foreignTasksOf(pid: string): ContractorAssignment[] {
  const snap = loadFromStorage<Record<string, unknown>>(`${pid}_app_data`, {});
  return Array.isArray(snap.contractorAssignments) ? snap.contractorAssignments as ContractorAssignment[] : [];
}

const unbook = <T extends object>(r: T): T => {
  const out = { ...r } as Record<string, unknown>;
  for (const k of BOOKKEEPING) delete out[k];
  return out as T;
};
const sameRec = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** The ids whose record appeared, went, or changed in more than bookkeeping. */
function diffIds<T extends { id: string }>(m0: Map<string, T>, m1: Map<string, T>): string[] {
  const out: string[] = [];
  for (const id of new Set([...m0.keys(), ...m1.keys()])) {
    const a = m0.get(id); const b = m1.get(id);
    if (a === b) continue;
    if (!a || !b) { out.push(id); continue; }
    if (!sameRec(unbook(a), unbook(b))) out.push(id);
  }
  return out;
}

const byIdMap = <T extends { id: string }>(list: T[]) => new Map(list.map(r => [r.id, r]));

interface UndoSides {
  board: BoardSides;
  raw: Partial<Record<RawKind, Record<string, AnyRec | null>>>;
  settings: Record<string, BoardSetting | null>;
  foreign: Record<string, Record<string, ContractorAssignment | null>>;
}

export function trackUndo<T>(opts: TrackOpts | null, body: () => T): T {
  if (_trackDepth > 0 || _undoWalking || _undoQuiet > 0 || onPortalPath()) return body();
  const s0 = useStore.getState();
  const pid = s0.currentProjectId;
  const jobs0 = byIdMap(s0.apartments);
  const els0 = byIdMap(s0.canvasElements);
  const raw0 = Object.fromEntries(RAW_KINDS.map(k => [k, byIdMap(s0[k] as unknown as AnyRec[])])) as Record<RawKind, Map<string, AnyRec>>;
  const set0 = s0.boardSettings;
  const foreign = new Map<string, { pid: string; id: string; before: ContractorAssignment | null }>();
  const prevForeign = _foreignTouched;
  _foreignTouched = foreign;
  _trackDepth++;
  let out: T;
  try {
    out = body();
  } finally {
    _trackDepth--;
    _foreignTouched = prevForeign;
  }
  const s1 = useStore.getState();
  // A workspace switch inside the body: the before and after describe two
  // different collections — nothing honest can be recorded.
  if (s1.currentProjectId !== pid) return out;

  const jobs1 = byIdMap(s1.apartments);
  const els1 = byIdMap(s1.canvasElements);
  const jobIds = diffIds(jobs0, jobs1);
  const elIds = diffIds(els0, els1);
  const before: UndoSides = { board: {}, raw: {}, settings: {}, foreign: {} };
  const after: UndoSides = { board: {}, raw: {}, settings: {}, foreign: {} };
  let any = false;
  if (jobIds.length || elIds.length) {
    const unJobs = (side: Side<Apartment>) => Object.fromEntries(Object.entries(side).map(([k, v]) => [k, v && unbook(v)])) as Side<Apartment>;
    before.board = { jobs: unJobs(snapJobs([...jobs0.values()], jobIds)), els: snapEls([...els0.values()], elIds) };
    after.board = { jobs: unJobs(snapJobs([...jobs1.values()], jobIds)), els: snapEls([...els1.values()], elIds) };
    if (sidesDiffer(before.board, after.board)) any = true;
    else { before.board = {}; after.board = {}; }
  }
  for (const k of RAW_KINDS) {
    const m1 = byIdMap(s1[k] as unknown as AnyRec[]);
    const ids = diffIds(raw0[k], m1);
    if (!ids.length) continue;
    any = true;
    before.raw[k] = Object.fromEntries(ids.map(id => [id, raw0[k].has(id) ? unbook(raw0[k].get(id)!) : null]));
    after.raw[k] = Object.fromEntries(ids.map(id => [id, m1.has(id) ? unbook(m1.get(id)!) : null]));
  }
  const set1 = s1.boardSettings;
  if (set1 !== set0) {
    for (const key of new Set([...Object.keys(set0), ...Object.keys(set1)])) {
      if (set0[key] === set1[key] || sameRec(set0[key], set1[key])) continue;
      any = true;
      before.settings[key] = set0[key] ? { ...set0[key] } : null;
      after.settings[key] = set1[key] ? { ...set1[key] } : null;
    }
  }
  for (const f of foreign.values()) {
    const now = foreignTasksOf(f.pid).find(a => a.id === f.id) ?? null;
    if (sameRec(f.before && unbook(f.before), now && unbook(now))) continue;
    any = true;
    (before.foreign[f.pid] ??= {})[f.id] = f.before && unbook(f.before);
    (after.foreign[f.pid] ??= {})[f.id] = now && unbook(now);
  }
  if (!any) return out;

  const words = opts ?? describeUndo(undoDiffOf(before, after, pid), undoWorldOf(s1));
  s1.rememberUndo({
    projectId: pid,
    weight: words.weight,
    label: words.label,
    explain: words.explain,
    undo: () => applyUndoSides(before, after),
    redo: () => applyUndoSides(after, before),
    sides: { before, after },
  });
  return out;
}

function undoDiffOf(b: UndoSides, a: UndoSides, pid: string): UndoDiff {
  const pairs = <T,>(x: Record<string, unknown> | undefined, y: Record<string, unknown> | undefined) =>
    Object.keys({ ...(x ?? {}), ...(y ?? {}) }).map(id => [(x?.[id] ?? null) as T | null, (y?.[id] ?? null) as T | null] as [T | null, T | null]);
  const tasks: UndoDiff['tasks'] = pairs<ContractorAssignment>(b.raw.contractorAssignments, a.raw.contractorAssignments)
    .map(([before, after]) => ({ pid, before, after }));
  for (const fp of new Set([...Object.keys(b.foreign), ...Object.keys(a.foreign)])) {
    for (const [before, after] of pairs<ContractorAssignment>(b.foreign[fp], a.foreign[fp])) tasks.push({ pid: fp, before, after });
  }
  return {
    jobs: pairs<Apartment>(b.board.jobs, a.board.jobs),
    els: pairs<CanvasElement>(b.board.els, a.board.els),
    tasks,
    notes: pairs<ContractorNote>(b.raw.contractorNotes, a.raw.contractorNotes),
    photos: pairs<ContractorPhoto>(b.raw.contractorPhotos, a.raw.contractorPhotos),
    stageNotes: pairs<StageNote>(b.raw.stageNotes, a.raw.stageNotes),
    officeFiles: pairs<OfficeNoteFile>(b.raw.officeNoteFiles, a.raw.officeNoteFiles),
    settings: Object.keys({ ...b.settings, ...a.settings }).map(key => ({ key, before: b.settings[key] ?? null, after: a.settings[key] ?? null })),
  };
}

function undoWorldOf(st: AppState): UndoWorld {
  const pid = st.currentProjectId;
  const snapApts = new Map<string, Apartment[]>();
  return {
    projectId: pid,
    aptOf: (id, p) => {
      if (p === pid) return st.apartments.find(a => a.id === id);
      if (!snapApts.has(p)) {
        const snap = loadFromStorage<Record<string, unknown>>(`${p}_app_data`, {});
        snapApts.set(p, Array.isArray(snap.apartments) ? snap.apartments as Apartment[] : []);
      }
      return snapApts.get(p)!.find(a => a.id === id);
    },
    contractors: st.contractors,
    users: st.users,
    sortedStages: stagesOfProject(pid, st.stages),
    ctx: setContextOf(pid, st.boardSettings),
    workspaceName: p => { const pr = st.projects.find(x => x.id === p); return pr?.shortName ?? pr?.name ?? p; },
  };
}

/** `cur` with exactly the fields that differ between the two sides put back. */
function withPatch<T extends object>(cur: T, was: T, want: T): T {
  return { ...cur, ...patchBetween(was, want) };
}

function applyUndoSides(to: UndoSides, from: UndoSides) {
  const st = useStore.getState();
  const pid = st.currentProjectId;
  // Tasks, messages, photos, notes, files — raw, exactly as they were.
  for (const kind of RAW_KINDS) {
    const want = to.raw[kind]; const was = from.raw[kind] ?? {};
    if (!want) continue;
    const live = byIdMap(useStore.getState()[kind] as unknown as AnyRec[]);
    const puts = new Map<string, AnyRec>(); const removes = new Set<string>();
    for (const id of Object.keys(want)) {
      const w = want[id] ?? null; const f = was[id] ?? null; const cur = live.get(id) ?? null;
      if (w && !f) puts.set(id, cur ? withPatch(cur, cur, w) : { ...w });
      else if (!w && f) { if (cur) removes.add(id); }
      // Somebody deleted it meanwhile: an undo of an EDIT does not resurrect it.
      else if (w && f && cur) puts.set(id, withPatch(cur, f, w));
    }
    if (!puts.size && !removes.size) continue;
    useStore.setState(s => {
      const list = s[kind] as unknown as AnyRec[];
      const have = new Set(list.map(r => r.id));
      return {
        [kind]: [
          ...list.filter(r => !removes.has(r.id)).map(r => puts.get(r.id) ?? r),
          ...[...puts.values()].filter(r => !have.has(r.id)),
        ],
      } as Partial<AppState>;
    });
    puts.forEach(r => {
      const cur = live.get(r.id);
      fsPatch(projectCollection(pid, kind), r.id, cur ? RAW_LEAN[kind](cur) : null, RAW_LEAN[kind](r));
    });
    removes.forEach(id => fsDelete(projectCollection(pid, kind), id));
  }
  persist(useStore.getState);

  // Jobs and board nodes — through the board's own writer (field patches; a
  // job is never created or destroyed; nodes come back with their tombstone lifted).
  if (to.board.jobs || to.board.els) {
    const user = st.currentUser ?? ({ id: 'office', name: 'Office' } as User);
    applySide(to.board, from.board, {
      updateJob: (id, patch) => useStore.getState().updateApartment(id, patch, user),
      updateEl: (id, patch) => useStore.getState().updateCanvasElement(id, patch),
      restoreEls: els => useStore.getState().restoreCanvasElements(els),
      deleteEl: id => useStore.getState().deleteCanvasElement(id),
    });
  }

  // The settings bags (time off, tipus sets …): field by field, one key at a time.
  const keys = Object.keys(to.settings);
  if (keys.length) {
    const prevBs = useStore.getState().boardSettings;
    const next: Record<string, BoardSetting> = { ...prevBs };
    for (const key of keys) {
      const w = to.settings[key]; const f = from.settings[key] ?? null; const cur = next[key] ?? null;
      if (w && !f) next[key] = { ...(cur ?? {}), ...w };
      else if (!w && f) delete next[key];
      else if (w && f) next[key] = withPatch(cur ?? {}, f, w);
    }
    useStore.setState({ boardSettings: next });
    persist(useStore.getState);
    saveBoardSettings(prevBs, next);
  }

  // Tasks in other workspaces — back into that workspace's snapshot and collection.
  for (const fpid of Object.keys(to.foreign)) {
    const want = to.foreign[fpid]; const was = from.foreign[fpid] ?? {};
    const key = `${fpid}_app_data`;
    const snap = loadFromStorage<Record<string, unknown>>(key, {});
    let list = Array.isArray(snap.contractorAssignments) ? [...snap.contractorAssignments as ContractorAssignment[]] : [];
    for (const id of Object.keys(want)) {
      const w = want[id] ?? null; const f = was[id] ?? null;
      const cur = list.find(a => a.id === id) ?? null;
      let put: ContractorAssignment | null = null;
      if (w && !f) put = cur ? { ...cur, ...w } : { ...w };
      else if (!w && f) {
        if (cur) { list = list.filter(a => a.id !== id); fsDelete(projectCollection(fpid, 'contractorAssignments'), id); }
      } else if (w && f && cur) put = withPatch(cur, f, w);
      if (put) {
        list = list.some(a => a.id === id) ? list.map(a => (a.id === id ? put! : a)) : [...list, put];
        fsPatch(projectCollection(fpid, 'contractorAssignments'), id, cur, put);
      }
    }
    saveToStorage(key, { ...snap, contractorAssignments: list });
  }
  if (Object.keys(to.foreign).length) useStore.setState(s => ({ snapshotTick: s.snapshotTick + 1 }));
}

/**
 * What deleting these jobs means for every weekly notebook.
 *
 * A notebook entry is a REFERENCE to a job, so deleting the job left the entry
 * behind pointing at nothing — a cell reading "(job removed)". Nothing cleared
 * them, so removing an import turned a season's planning into a wall of those
 * three words.
 *
 * Computed rather than applied, and reporting only the elements that actually
 * CHANGED: writing every notebook back on every delete would touch documents on
 * every device for a job that was never in one. Returns null when no notebook
 * mentions any of them, which is the common case.
 */
function plannerPurgePlan(state: AppState, ids: string[]): {
  elements: CanvasElement[];
  changed: CanvasElement[];
  /** Each changed element as it was before the purge — so only the change is written. */
  before: Map<string, CanvasElement>;
  archive: BoardSetting['plannerArchive'];
  archiveChanged: boolean;
  removed: number;
} | null {
  const gone = new Set(ids);
  if (!gone.size) return null;
  let removed = 0;
  const changed: CanvasElement[] = [];
  const before = new Map<string, CanvasElement>();
  const elements = state.canvasElements.map(el => {
    if (!isPlannerElement(el)) return el;
    const r = purgeJobsFromPlanner(el.data as Record<string, unknown> | undefined, gone);
    if (!r) return el;
    removed += r.removed;
    const next = { ...el, data: r.data };
    changed.push(next);
    before.set(el.id, el);
    return next;
  });

  // A notebook that was removed still holds its planning in the archive, and
  // placing a fresh one revives it — so a dead reference left in there comes
  // back to life later. Clean it at the same time.
  const pid = state.currentProjectId;
  const oldArchive = state.boardSettings[pid]?.plannerArchive;
  let archiveChanged = false;
  const archive = oldArchive?.map(a => {
    const r = purgeJobsFromPlanner(a.data, gone);
    if (!r) return a;
    removed += r.removed;
    archiveChanged = true;
    return { ...a, data: r.data };
  });

  if (!changed.length && !archiveChanged) return null;
  return { elements, changed, before, archive, archiveChanged, removed };
}

/**
 * THE RESCUE COPY (owner, 2026-10-29). Before the cloud's records replace
 * this computer's own copy, every flat whose ticks this computer holds and
 * the cloud does NOT is kept aside in `rescue_marks_<workspace>` — so a wipe
 * in the cloud (one computer writing empty progress over everyone's) can be
 * undone from any other computer that still had the real ticks. Settings →
 * "Bring back stage ticks" reads it. An earlier, larger rescue is never
 * replaced by a smaller one.
 */
export const RESCUE_PREFIX = 'rescue_marks_';
export interface MarksRescue { at: string; apts: Array<Pick<Apartment, 'id' | 'stageMarks' | 'currentStageId'>> }
function keepMarksRescue(pid: string, local: Apartment[], remote: Apartment[]) {
  try {
    const cloud = new Map(remote.map(a => [a.id, a]));
    const apts = local.filter(a => {
      const c = cloud.get(a.id);
      const mine = a.stageMarks && Object.keys(a.stageMarks).length > 0;
      const theirs = c?.stageMarks && Object.keys(c.stageMarks).length > 0;
      return c && mine && !theirs;
    }).map(a => ({ id: a.id, stageMarks: a.stageMarks, currentStageId: a.currentStageId }));
    if (apts.length < 3) return;
    const key = RESCUE_PREFIX + pid;
    const old = JSON.parse(localStorage.getItem(key) || 'null') as MarksRescue | null;
    if (old && old.apts.length >= apts.length) return;
    localStorage.setItem(key, JSON.stringify({ at: new Date().toISOString(), apts }));
  } catch { /* full or blocked storage — nothing to keep */ }
}

/**
 * Board settings live in ONE shared document (settings/app → boardSettings),
 * one entry per workspace. Writing the whole map from this computer's copy is
 * what wiped every workspace's settings on 2026-10-29. Only the keys that
 * changed go up now: boardSettings.<workspace>.<key>, down to the one value.
 */
function saveBoardSettings(prev: Record<string, BoardSetting>, next: Record<string, BoardSetting>) {
  saveAppField('boardSettings', prev, next);
}

/** Any shared field of settings/app, the same way: only what changed in it goes up. */
function saveAppField(field: string, prev: unknown, next: unknown) {
  fsPatch('settings', 'app', { [field]: prev }, { [field]: next });
}

/**
 * Write a planner purge out.
 *
 * The elements themselves are set by the caller inside its own `set`, so the
 * screen updates in one commit with the delete. This does the two things that
 * have to happen AFTER that: sync the notebooks that changed, and — only if the
 * archive was touched — put the cleaned archive back.
 */
function applyPlannerPurge(
  get: () => AppState,
  pid: string,
  purge: NonNullable<ReturnType<typeof plannerPurgePlan>>,
) {
  purge.changed.forEach(el => fsPatch(projectCollection(pid, 'canvasElements'), el.id, purge.before.get(el.id), el));
  if (!purge.archiveChanged) return;
  const prev = get().boardSettings;
  const next = {
    ...prev,
    [pid]: { ...(prev[pid] ?? {}), plannerArchive: purge.archive },
  };
  useStore.setState({ boardSettings: next });
  saveBoardSettings(prev, next);
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// Load from localStorage with version check
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      console.warn('[wolfson] localStorage quota exceeded — trying trimmed save');
    }
    return false;
  }
}

// Check if stored data version matches current; reset if not
function checkAndMigrateData() {
  const stored = localStorage.getItem(VERSION_KEY);
  if (stored !== String(DATA_VERSION)) {
    localStorage.removeItem(WOLFSON_STORAGE_KEY);
    localStorage.setItem(VERSION_KEY, String(DATA_VERSION));
    return true; // was reset
  }
  return false;
}

checkAndMigrateData();

const _activeProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY) ?? 'wolfson';
const stored = loadFromStorage(getProjectStorageKey(_activeProjectId), null) as Record<string, unknown> | null;

function migrateApartments(apts: Apartment[]): Apartment[] {
  let changed = false;
  let result = [...apts];

  // Fix A1 apt 37: was blank placeholder (id A1-BLANK-37), should be a real apartment
  const blankIdx = result.findIndex(a => a.id === 'A1-BLANK-37');
  if (blankIdx !== -1) {
    const old = result[blankIdx];
    result[blankIdx] = {
      ...old,
      id: 'A1-37',
      apartmentNumber: '37',
      displayName: old.displayName || '37',
      isUnnamed: false,
    };
    changed = true;
  }

  // Add ground floor (0) and first floor (1) slots if missing
  for (const bid of ['A1', 'A2', 'A3'] as const) {
    const groundStart = bid === 'A1' ? 77 : 73;
    const hasGround = result.some(a => a.buildingId === bid && a.floor === 0);
    const hasFirst  = result.some(a => a.buildingId === bid && a.floor === 1);
    if (!hasGround || !hasFirst) {
      const newSlots = buildGroundFirstFloorSlots(bid);
      if (!hasGround) result.push(...newSlots.filter(s => s.floor === 0));
      if (!hasFirst)  result.push(...newSlots.filter(s => s.floor === 1));
      changed = true;
    }
    void groundStart; // suppress unused-var warning
  }

  return changed ? result : apts;
}

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Keeps only apartments that belong to the given project.
 *
 * Renaming a project's buildings (Netiv's N1/N2 -> B1/B2) left the old records
 * behind in Firestore and localStorage, so every count was reading two full
 * copies of the project. Scoping by the project's own building ids at load time
 * makes orphaned records from any past rename simply disappear from state.
 */
function scopeApartmentsToProject(projectId: string, apts: Apartment[], buildings: Building[]): Apartment[] {
  const ids = new Set(buildings.map(b => b.id));
  const scoped = projectId === 'general'
    ? apts.filter(a => a.buildingId === 'G')
    : ids.size === 0 ? apts : apts.filter(a => ids.has(a.buildingId));
  // Collapse repeated ids — a duplicate record would otherwise be counted twice
  // and show up repeatedly in pickers like the connected-unit dropdown.
  const byId = new Map<string, Apartment>();
  for (const a of scoped) byId.set(a.id, a);
  return byId.size === scoped.length ? scoped : Array.from(byId.values());
}

/**
 * Seed data for a workspace that has none yet.
 *
 * Only the three built-in workspaces have seeds. A workspace created in the app
 * writes its own storage when it is created, so it must fall through to EMPTY
 * here — returning Wolfson's buildings would hand a brand-new project 168
 * apartments that are not its own.
 */
function getDefaultBuildings(projectId: string): Building[] {
  if (projectId === 'netiv') return NETIV_BUILDINGS;
  if (projectId === 'general') return [];
  if (projectId === 'wolfson') return DEFAULT_BUILDINGS;
  // A workspace made in the app keeps its buildings in the cloud
  // (boardSettings.<id>.buildings), so a new computer has them too.
  try {
    const fromCloud = useStore.getState().boardSettings[projectId]?.buildings;
    if (fromCloud?.length) return fromCloud as Building[];
  } catch { /* the store is still being created */ }
  return [];
}

function getDefaultApartments(projectId: string): Apartment[] {
  if (projectId === 'netiv') return buildNetivApartments();
  if (projectId === 'general') return [];
  if (projectId !== 'wolfson') return [];
  return buildDefaultApartments();
}

const defaultData = {
  dataVersion: DATA_VERSION,
  currentUser: null as User | null,
  users: DEFAULT_USERS,
  buildings: getDefaultBuildings(_activeProjectId),
  stages: DEFAULT_STAGES,
  apartments: getDefaultApartments(_activeProjectId),
  stageNotes: [] as StageNote[],
  stageNoteVersions: [] as StageNoteVersion[],
  generalNoteVersions: [] as GeneralNoteVersion[],
  activityLogs: [] as ActivityLog[],
  contractors: [] as Contractor[],
  contractorAssignments: [] as ContractorAssignment[],
  contractorNotes: [] as ContractorNote[],
  contractorPhotos: [] as ContractorPhoto[],
};

/** The overlap question — one line in AppState so the backup audit can read the key. */
export interface PlannerAsk {
  jobId: string; contractorId: string; dueDate: string; taskId: string;
  days: string[];
  overlap: { taskId: string; contractorId: string; days: string[]; stageId: string | null };
}

interface AppState {
  dataVersion: number;
  currentUser: User | null;
  users: User[];
  buildings: Building[];
  stages: Stage[];
  apartments: Apartment[];
  stageNotes: StageNote[];
  stageNoteVersions: StageNoteVersion[];
  generalNoteVersions: GeneralNoteVersion[];
  activityLogs: ActivityLog[];
  firebaseListening: boolean;
  firebaseSyncError: string | null;
  lightTheme: boolean;
  setLightTheme: (v: boolean) => void;

  /**
   * The payroll list and the taps against it.
   *
   * GLOBAL, like users and contractors: somebody works for the company, not
   * for a workspace, and a month's timesheet must not change depending on
   * which project happens to be open. Both collections are therefore bare in
   * Firestore, never wrapped in projectCollection().
   */
  employees: Employee[];
  timePunches: TimePunch[];
  timeClock: TimeClockSettings;
  addEmployee: (e: Omit<Employee, 'id' | 'createdAt'>) => Employee;
  updateEmployee: (id: string, changes: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  /** Tap in or out. Returns what was written, in words, for the toast. */
  punchClock: (employeeId: string, kind: 'in' | 'out', source?: string) => string;
  /** Add or correct a punch by hand, from the settings screen. */
  addPunch: (p: Omit<TimePunch, 'id'>) => void;
  updatePunch: (id: string, changes: Partial<TimePunch>) => void;
  deletePunch: (id: string) => void;
  setTimeClock: (changes: Partial<TimeClockSettings>) => void;

  /**
   * The saved permission sets workers are put on.
   *
   * Global and bare in Firestore, like users and contractors: a level is a kind
   * of person, not a kind of person on one site.
   */
  workerLevels: WorkerLevel[];
  /** Workers' "not on the list" words, waiting for the office (global, bare). */
  stageSuggestions: StageSuggestion[];
  addStageSuggestion: (s: Omit<StageSuggestion, 'id' | 'at' | 'status'>) => void;
  /** Files the words under a stage as an `includes` word, or puts them aside. */
  resolveStageSuggestion: (id: string, choice: { stageId: string } | 'dismiss', byName: string) => void;
  addWorkerLevel: (l: Omit<WorkerLevel, 'id'>) => WorkerLevel;
  updateWorkerLevel: (id: string, changes: Partial<WorkerLevel>) => void;
  deleteWorkerLevel: (id: string) => void;

  // Contractors
  contractors: Contractor[];
  contractorAssignments: ContractorAssignment[];
  contractorNotes: ContractorNote[];
  contractorPhotos: ContractorPhoto[];
  officeNoteFiles: OfficeNoteFile[];

  login: (code: string) => User | null;
  logout: () => void;
  /** True once the authoritative user list is known and codes may be checked. */
  authReady: boolean;
  loadUsersForLogin: () => Promise<void>;

  /**
   * `quiet` writes without an activity line — only for a write whose story is
   * told by the line written right beside it (the worker's "I'm going to work
   * here" is ONE line, "started work here — Registers", not that plus
   * "started Registers").
   */
  updateApartment: (id: string, changes: Partial<Apartment>, user: User, opts?: { quiet?: boolean }) => void;
  bulkUpdateApartments: (ids: string[], changes: Partial<Apartment>, user: User) => void;
  /**
   * The set model (2026-09-22): write an apartment's stage marks through the
   * ONE writer — the headline (`currentStageId`) is re-derived in the same
   * motion, so the fifty screens that print one word per apartment stay in
   * step with the marks.
   */
  setApartmentMarks: (id: string, marks: Record<string, StageMark> | undefined, user: User, opts?: { quiet?: boolean }) => void;
  /**
   * setApartmentMarks for an apartment of ANY workspace — the open one goes
   * through setApartmentMarks; another is written to its own collection and
   * local snapshot, with the same history line the app would write there.
   */
  setApartmentMarksInProject: (projectId: string, id: string, marks: Record<string, StageMark>, user: User) => void;
  /**
   * The office answers a piece of "not on the list" work (owner, 2026-10-18):
   * it was one of the stages (switched on for the apartment and ticked done),
   * it becomes a closed task of its own, or it stays a note. One undo step.
   */
  answerOffList: (projectId: string, taskId: string, itemId: string,
    choice: { kind: 'stage'; stageId: string } | { kind: 'task' } | { kind: 'note' }) => void;
  /**
   * Moves every record in the open workspace onto the set model — explicit
   * marks, `bubbles: true` — and gives the workspace's stages a kind (work
   * or marker) if none has one yet. Idempotent; returns how many records
   * were written. Run by AppLayout once the workspace has landed.
   */
  migrateStageSets: () => number;
  /** The Wolfson stage split (2026-09-22): three combined global stages → eight; marks copied onto the children. Idempotent. */
  splitCombinedStages: () => number;
  /** Wolfson's tipus by rule, into every EMPTY field; the start stage renamed "Sold". */
  fillWolfsonTipus: () => number;
  addApartment: (apt: Apartment) => void;
  /** Bulk add — one state set, one persist, one (chunked) Firestore batch. */
  importJobs: (jobs: Apartment[]) => void;
  /**
   * Jobs (and, optionally, a group node) written into a NAMED workspace —
   * the Drive sweep runs from whichever workspace the office is standing in
   * and always writes to the Job Board. The open workspace goes through the
   * ordinary actions; any other is written to its Firestore collections and
   * its local snapshot (the addAssignmentToProject idiom). Ids are the
   * caller's, so two machines sweeping at once land on the same documents.
   */
  addJobsToProject: (projectId: string, jobs: Apartment[], group?: CanvasElement) => void;
  /** setBoardSetting for a workspace other than the open one. */
  setBoardSettingFor: (projectId: string, key: BoardSettingKey, value: BoardSetting[BoardSettingKey]) => void;
  /**
   * Remember Drive folder titles on jobs of ANY workspace (id → title) — the
   * sweep's backfill. Bookkeeping: never bumps "last edited", one batched
   * cloud write, the other workspace through its snapshot.
   */
  setDriveFolderNames: (projectId: string, names: Record<string, string>) => void;
  /** Undo a bulk import: permanently removes jobs whose id carries the import
   *  prefix. Returns how many went. Touches nothing else. */
  removeJobsByIdPrefix: (prefix: string) => number;
  /** PERMANENT, cascading. Only reachable from the Trash window. */
  deleteApartment: (id: string) => void;
  /** Counts of everything a delete would take with it — for the warning. */
  deletionImpact: (id: string) => {
    tasks: number; photos: number; workerNotes: number;
    stageNotes: number; pins: number; markups: number;
  };
  /** Move a job into a board bin (or back to the board with null). Never destroys anything. */
  moveToBin: (id: string, bin: string | null) => void;

  /**
   * Undo / redo, for the board and the notebook.
   *
   * Session-only and deliberately NOT persisted — see `src/data/undo.ts`. It
   * is excused in the backup audit for the same reason `pendingFocus` is: it
   * is a mechanism, not the office's data.
   */
  undoState: UndoState;
  /** Record something that just happened, with the closures to reverse it. */
  rememberUndo: (entry: Omit<UndoEntry, 'id' | 'at'>) => void;
  /** Take one step back. Returns the entry acted on, or null. */
  stepUndo: () => UndoEntry | null;
  /** …and forward again. */
  stepRedo: () => UndoEntry | null;
  /**
   * Put deleted board records back — the undo of a removal, and nothing else.
   *
   * It lifts the tombstone as well as re-adding the record. Re-adding alone is
   * not an undo: the tombstone stands, the next sync takes the record straight
   * out again, and it blinks back and vanishes on every device.
   */
  restoreCanvasElements: (els: CanvasElement[]) => void;
  /** Extra board position for the SAME job — one record, drawn twice. */
  addGhost: (id: string, x: number, y: number) => void;
  moveGhost: (id: string, index: number, x: number, y: number) => void;
  removeGhost: (id: string, index: number) => void;

  upsertStageNote: (apartmentId: string, stageId: string, noteText: string, user: User, attachment?: { filename?: string; mimeType?: string; dataUrl?: string; driveFileId?: string; driveUrl?: string } | null, attachments?: StageNoteAttachment[]) => void;
  getStageNote: (apartmentId: string, stageId: string) => StageNote | undefined;
  /**
   * One BULLET onto a stage's notes (the notes tab, owner 2026-09-06). A note
   * written before the bullets keeps its text as the first bullet — nothing
   * old is lost or migrated. `noteText` is kept as the flat join, so search
   * and reports read every bullet as they always read the note.
   */
  appendStageNoteEntry: (apartmentId: string, stageId: string, entry: { text: string; attachments?: StageNoteAttachment[]; officeOnly?: boolean }, user: User) => void;
  /**
   * Who sees one bullet: absent/false = the worker reads it on site when this
   * stage comes up, true = the office keeps it to itself (owner, 2026-09-17).
   */
  setStageNoteEntryVisibility: (noteId: string, entryId: string, officeOnly: boolean) => void;
  getStageNoteVersions: (noteId: string) => StageNoteVersion[];
  getGeneralNoteVersions: (aptId: string) => GeneralNoteVersion[];

  updateStage: (id: string, changes: Partial<Stage>) => void;
  addStage: (stage: Stage) => void;
  deleteStage: (id: string) => void;

  mergeApartments: (aptId: string, partnerId: string | null, user: User) => void;
  unmergeApartments: (aptId: string, keepDataAptId: string | 'both', user: User) => void;

  // Google Drive
  googleClientId: string;
  googleAccessToken: string | null;
  googleTokenExpiry: number | null;
  setGoogleClientId: (id: string) => void;
  setGoogleToken: (token: string | null, expiry: number | null) => void;

  updateUser: (id: string, changes: Partial<User>) => void;
  addUser: (user: User) => void;

  addActivityLog: (log: Omit<ActivityLog, 'id' | 'createdAt'>) => void;

  // Contractor actions
  addContractor: (c: Omit<Contractor, 'id' | 'token' | 'createdAt'>) => Contractor;
  updateContractor: (id: string, changes: Partial<Contractor>) => void;
  deleteContractor: (id: string) => void;
  addContractorAssignment: (a: Omit<ContractorAssignment, 'id' | 'createdAt'>) => void;
  updateContractorAssignment: (id: string, changes: Partial<ContractorAssignment>) => void;
  deleteContractorAssignment: (id: string) => void;
  /**
   * Move a task — with its photos and messages — to another apartment in the
   * SAME workspace (owner, 2026-10-05: a day's work recorded on A1 when it was
   * done in A3). The stage ticks the task left come off the old apartment and
   * go onto the new one unless `moveMarks` is false (`planTaskMove` says
   * exactly which); one history line is written on each apartment. Returns
   * false when nothing could be moved.
   */
  moveTaskToApartment: (taskId: string, toApartmentId: string, user: User, opts?: { moveMarks?: boolean }) => boolean;
  /** What that move would do to the two apartments' stage ticks — the confirm step reads it. Null when the move cannot be made. */
  taskMovePlan: (taskId: string, toApartmentId: string) => TaskMovePlan | null;
  /**
   * Take back a task the WORKER opened by mistake ("I'm going to work here",
   * a task he gave himself) — owner, 2026-10-19. The apartment's stage ticks
   * the task left go back to how they stood before he started (`planTaskUndo`,
   * the move's own rules), the general job forgets the visit, and the task
   * goes with its photos and messages. One history line, in the worker's name.
   */
  undoOwnTask: (taskId: string, user: User) => boolean;
  addContractorNote: (n: Omit<ContractorNote, 'id' | 'createdAt'>) => void;
  /** A field or two onto a note — the memo's transcript, once it is known. */
  updateContractorNote: (id: string, changes: Partial<ContractorNote>) => void;
  /**
   * Take a message OUT of a task's conversation (owner, 2026-09-16: "we need
   * a way for people to delete messages that we sent"). Each side deletes
   * only its own — the hosts decide that; the store just removes the record.
   * The notes listener replaces the list wholesale, so the deletion reaches
   * every device without a tombstone.
   */
  deleteContractorNote: (id: string) => void;
  /**
   * A task written into ANOTHER workspace's collection — a general job for
   * Wolfson created while standing on the Job Board. The open workspace goes
   * through addContractorAssignment as usual; any other is written to that
   * workspace's Firestore collection and its local snapshot, so the worker's
   * phone and the notebook (which read every snapshot) see it at once.
   */
  addAssignmentToProject: (projectId: string, fields: Omit<ContractorAssignment, 'id' | 'createdAt'>) => string;
  /** Edit / delete a task that lives in ANOTHER workspace (the notebook's foreign bars) — its Firestore collection + local snapshot. */
  updateAssignmentInProject: (projectId: string, id: string, patch: Partial<ContractorAssignment>) => void;
  deleteAssignmentInProject: (projectId: string, id: string) => void;
  addContractorPhoto: (p: Omit<ContractorPhoto, 'id' | 'uploadedAt'>) => string;
  updateContractorPhoto: (id: string, changes: Partial<ContractorPhoto>) => void;
  deleteContractorPhoto: (id: string) => void;

  // Auto-backup / snapshot restore
  autoBackup: boolean;
  backupFrequency: BackupFrequency;
  lastAutoBackupAt: string | null;
  backupSnapshots: BackupSnapshot[];
  backupLogs: BackupLogEntry[];
  backupDriveFolderLink: string;
  driveExportFrequency: DriveExportFrequency;
  lastDriveExportAt: string | null;
  setAutoBackup: (v: boolean) => void;
  setBackupFrequency: (f: BackupFrequency) => void;
  setBackupDriveFolder: (url: string) => void;
  setDriveExportFrequency: (f: DriveExportFrequency) => void;
  addBackupLog: (entry: Omit<BackupLogEntry, 'id' | 'createdAt'>) => void;
  restoreFromSnapshot: (snapshotId: string) => void;
  exportToDrive: (opts?: { now?: boolean }) => Promise<{ ok: boolean; error?: string; file?: string; skipped?: string }>;
  /** How often the full backup runs during the day (the night one always runs). */
  fullBackupEvery: FullBackupEvery;
  setFullBackupEvery: (v: FullBackupEvery) => void;
  getDataSummary: () => DataSummary;

  // Contractor UI language strings
  contractorUiStrings: ContractorUiStrings;
  updateContractorUiStrings: (partial: Partial<ContractorUiStrings>) => void;
  mainUiStrings: MainUiStrings;
  updateMainUiStrings: (s: MainUiStrings) => void;
  /** This person's language for the words (the layout never flips). */
  uiLang: UiLang;
  setUiLang: (lang: UiLang) => void;

  // Office note files
  /** Returns the new record's id, so a memo's transcript can be written onto it when it arrives. */
  addOfficeNoteFile: (f: Omit<OfficeNoteFile, 'id' | 'uploadedAt'>) => string;
  updateOfficeNoteFile: (id: string, changes: Partial<OfficeNoteFile>) => void;
  deleteOfficeNoteFile: (id: string) => void;
  /**
   * A general note as a BULLET: appends an entry (converting the legacy
   * `generalNotes` text into entry one on the first append) and rewrites
   * `generalNotes` as the flat join, through updateApartment so the version
   * history, the sync and the activity log all see it as before.
   */
  appendApartmentNote: (apartmentId: string, text: string, user: User) => void;
  removeApartmentNote: (apartmentId: string, entryId: string, user: User) => void;

  // Backup / restore
  exportData: () => string;
  importData: (json: string) => { ok: boolean; error?: string; summary?: DataSummary };

  // Firebase sync
  startFirebaseSync: (opts?: { lean?: boolean }) => void;
  applyFirebaseData: (data: Partial<AppState>) => void;

  // Pending apartment open (used by DashboardPage → ProjectDiagramPage navigation)
  pendingOpenAptId: string | null;
  setPendingOpenAptId: (id: string | null) => void;

  /**
   * "Show me this", handed across a navigation. Session-only: never persisted,
   * never synced, and consumed by the page that can show it.
   */
  pendingFocus: FocusIntent | null;
  setPendingFocus: (f: FocusIntent | null) => void;

  /**
   * Bumped when `ensureProjectSnapshot` writes a workspace's snapshot down
   * from the cloud, so everything that reads `loadProjectSnapshot` re-renders
   * and picks it up. Session-only mechanism, never persisted — the snapshots
   * themselves live in localStorage, this is only the "look again" signal.
   */
  snapshotTick: number;
  /**
   * The workspace whose records have ARRIVED from the cloud in this tab (null
   * until then). The on-open repairs wait for it (owner, 2026-10-29): they ran
   * 1.6 s after opening on whatever the tab held, and on a brand-new browser
   * that was the built-in starter copy — Hodaya's first login wrote the
   * starter's empty progress over every Wolfson flat's real ticks.
   */
  cloudSyncedProject: string | null;

  /**
   * "This job is on the planner and just got a dated task" — the queued
   * question. Session-only. Answered by answerPlannerAsk with one of the
   * three confirmed choices.
   */
  /**
   * A dated task was just made for a job that ALREADY has work on one of those
   * days (locked answer 8, 2026-09-15: the ask fires on an OVERLAP — same job,
   * same day — and on nothing else). Names the task that was there.
   */
  plannerAsk: PlannerAsk | null;
  answerPlannerAsk: (choice: 'keep' | 'remove' | 'skip') => void;

  // Dashboard layout customization
  dashboardWidgetOrder: string[];
  dashboardHiddenWidgets: string[];
  setDashboardLayout: (order: string[], hidden: string[]) => void;

  /** Board appearance & behaviour, one entry per project. Synced via settings/app. */
  boardSettings: Record<string, BoardSetting>;
  setBoardSetting: <K extends BoardSettingKey>(key: K, value: BoardSetting[K]) => void;
  /** TV wallboard defaults. Stored under the reserved `__tv` key, not a project. */
  setTvSetting: <K extends BoardSettingKey>(key: K, value: BoardSetting[K]) => void;

  /** Saved board arrangements, per project. Positions only — never content. */
  boardLayouts: Record<string, BoardLayout[]>;
  saveBoardLayout: (label: string, auto?: boolean) => void;
  restoreBoardLayout: (layoutId: string) => void;
  deleteBoardLayout: (layoutId: string) => void;

  // Contractor status spreadsheet — one link per project, synced via settings/app
  contractorSheetLinks: Record<string, string>;
  setContractorSheetLink: (url: string) => void;

  // Multi-project support
  currentProjectId: string;
  projects: Project[];
  setCurrentProject: (id: string) => void;
  /** Workspace identity colour. Shared by everyone, so it lives in settings/app. */
  setProjectColor: (projectId: string, color: string) => void;
  projectColors: Record<string, string>;
  /**
   * Workspaces created in the app, on top of the three that ship with it.
   * Shared through settings/app, because a workspace one person creates has to
   * exist for everyone.
   */
  customProjects: Project[];
  addProject: (project: Project, buildings: Building[], apartments: Apartment[], stages: Stage[]) => void;
  deleteProject: (id: string) => void;

  // General Jobs canvas elements (sticky notes, section boxes)
  canvasElements: CanvasElement[];
  addCanvasElement: (el: CanvasElement) => void;
  updateCanvasElement: (id: string, changes: Partial<CanvasElement>) => void;
  deleteCanvasElement: (id: string) => void;

  /** Punch-list pins drawn over an apartment's engineering plan. */
  planPins: PlanPin[];
  addPlanPin: (pin: PlanPin) => void;
  updatePlanPin: (id: string, changes: Partial<PlanPin>) => void;
  deletePlanPin: (id: string) => void;

  /**
   * Named boards inside each workspace, and which one is showing.
   *
   * Global, like every other settings-shaped thing, so a board shared with
   * somebody appears in their picker on their own machine.
   */
  boardViews: BoardView[];

  /**
   * Saved reports, per workspace.
   *
   * In `settings/app` rather than a project collection so a report Esther
   * builds is a report everybody has — a report is a QUESTION, and the answer
   * being different on each machine is worse than not having it saved at all.
   */
  savedReports: Record<string, ReportDef[]>;
  saveReport: (def: ReportDef) => void;
  deleteReport: (id: string) => void;
  addBoardView: (v: BoardView) => void;
  updateBoardView: (id: string, changes: Partial<BoardView>) => void;
  deleteBoardView: (id: string) => void;
  /** The order the workspace tiles sit in along the top, by project id. */
  projectOrder: string[];
  setProjectOrder: (ids: string[]) => void;

  /** '' is the workspace's original board. */
  activeBoardView: string;
  setActiveBoardView: (id: string) => void;

  /** Saved markup versions of engineering plans. */
  planAnnotations: PlanAnnotation[];
  savePlanAnnotation: (ann: PlanAnnotation) => void;
  updatePlanAnnotation: (id: string, changes: Partial<PlanAnnotation>) => void;
  deletePlanAnnotation: (id: string) => void;
}

/** Is this tab the worker's portal? The worker is the one standing there, whoever else is logged in. */
const onPortalPath = () => typeof location !== 'undefined' && location.pathname.startsWith('/c/');
/** The task's worker as a User, for writes and log lines the store attributes to a person. */
function workerAsUser(t: ContractorAssignment, contractors: Contractor[]): User {
  return {
    id: t.contractorId,
    name: contractors.find(c => c.id === t.contractorId)?.name ?? 'Worker',
    code: '', role: 'viewer', active: true, createdAt: t.createdAt,
  } as User;
}
/** The workspace's own stages, in order — what the set rules read. */
function stagesOfProject(pid: string, stages: Stage[]): Stage[] {
  return stages
    .filter(st => (pid === 'general' ? st.projectId === 'general' : !st.projectId))
    .sort((a, b) => a.order - b.order);
}
function setContextOf(pid: string, boardSettings: Record<string, BoardSetting>): SetContext {
  return { tipusStages: boardSettings[pid]?.tipusStages };
}
/**
 * A write that names a headline but no marks is the OLD statement "the job
 * is at X" — translated into marks (everything before X done, X to do) so
 * the two never disagree; a write that names marks but no headline gets its
 * headline derived. Both go through `applyMarks`, the one writer.
 */
function normaliseStageWrite(existing: Apartment, changes: Partial<Apartment>, stages: Stage[], boardSettings: Record<string, BoardSetting>, pid: string): Partial<Apartment> {
  const hasCur = 'currentStageId' in changes;
  const hasMarks = 'stageMarks' in changes;
  if (!hasCur && !hasMarks) return changes;
  if (hasCur && hasMarks) return changes;
  const sorted = stagesOfProject(pid, stages);
  const ctx = setContextOf(pid, boardSettings);
  if (hasCur) {
    const want = changes.currentStageId ?? null;
    if (want === (existing.currentStageId ?? null) && existing.bubbles) return changes;
    const marks = marksForCurrent(existing, want, sorted, ctx);
    const applied = applyMarks({ ...existing, currentStageId: want }, marks, sorted, ctx);
    // A marker asked for by hand is the flat's state and stands as asked.
    const target = want ? sorted.find(st => st.id === want) : null;
    if (target && !isWorkStage(target)) applied.currentStageId = want;
    return { ...changes, ...applied };
  }
  return { ...changes, ...applyMarks(existing, changes.stageMarks, sorted, ctx) };
}

export const useStore = create<AppState>((set, get) => ({
  dataVersion: DATA_VERSION,
  currentUser: stored?.currentUser as User | null ?? null,
  users: (stored?.users as User[] | null) ?? defaultData.users,
  buildings: _activeProjectId === 'general'
    ? []
    : (stored?.buildings as Building[] | null) ?? defaultData.buildings,
  stages: (stored?.stages as Stage[] | null) ?? defaultData.stages,
  apartments: scopeApartmentsToProject(
    _activeProjectId,
    _activeProjectId === 'wolfson'
      ? migrateApartments((stored?.apartments as Apartment[] | null) ?? defaultData.apartments)
      : _activeProjectId === 'netiv'
      ? migrateNetivApartments((stored?.apartments as Apartment[] | null) ?? defaultData.apartments).apts
      : (stored?.apartments as Apartment[] | null) ?? defaultData.apartments,
    _activeProjectId === 'general' ? [] : (stored?.buildings as Building[] | null) ?? defaultData.buildings,
  ),
  stageNotes: (stored?.stageNotes as StageNote[] | null) ?? [],
  stageNoteVersions: (stored?.stageNoteVersions as StageNoteVersion[] | null) ?? [],
  generalNoteVersions: (stored?.generalNoteVersions as GeneralNoteVersion[] | null) ?? [],
  activityLogs: (stored?.activityLogs as ActivityLog[] | null) ?? [],
  contractors: (stored?.contractors as Contractor[] | null) ?? [],
  workerLevels: (stored?.workerLevels as WorkerLevel[] | null) ?? DEFAULT_WORKER_LEVELS,
  stageSuggestions: (stored?.stageSuggestions as StageSuggestion[] | null) ?? [],
  employees: (stored?.employees as Employee[] | null) ?? [],
  timePunches: (stored?.timePunches as TimePunch[] | null) ?? [],
  timeClock: { ...DEFAULT_TIME_CLOCK, ...((stored?.timeClock as Partial<TimeClockSettings> | null) ?? {}) },
  contractorAssignments: (stored?.contractorAssignments as ContractorAssignment[] | null) ?? [],
  contractorNotes: (stored?.contractorNotes as ContractorNote[] | null) ?? [],
  contractorPhotos: (stored?.contractorPhotos as ContractorPhoto[] | null) ?? [],
  officeNoteFiles: (stored?.officeNoteFiles as OfficeNoteFile[] | null) ?? [],
  canvasElements: (stored?.canvasElements as CanvasElement[] | null) ?? [],
  firebaseListening: false,
  firebaseSyncError: null,
  authReady: !isFirebaseConfigured,
  googleClientId: (stored?.googleClientId as string | null) ?? '',
  googleAccessToken: null,
  googleTokenExpiry: null,
  autoBackup: (stored?.autoBackup as boolean | null) ?? false,
  backupFrequency: (stored?.backupFrequency as BackupFrequency | null) ?? 'activity',
  lastAutoBackupAt: (stored?.lastAutoBackupAt as string | null) ?? null,
  backupSnapshots: (stored?.backupSnapshots as BackupSnapshot[] | null) ?? [],
  backupLogs: (stored?.backupLogs as BackupLogEntry[] | null) ?? [],
  backupDriveFolderLink: (stored?.backupDriveFolderLink as string | null) ?? '',
  driveExportFrequency: (stored?.driveExportFrequency as DriveExportFrequency | null) ?? 'off',
  lastDriveExportAt: (stored?.lastDriveExportAt as string | null) ?? null,
  fullBackupEvery: ((stored as Record<string, unknown> | null)?.fullBackupEvery as FullBackupEvery | undefined) ?? 'activity',
  setFullBackupEvery: (v) => {
    const prev = get().fullBackupEvery;
    set({ fullBackupEvery: v });
    persist(get);
    saveAppField('fullBackupEvery', prev, v);
  },
  contractorUiStrings: (stored?.contractorUiStrings as ContractorUiStrings | null) ?? DEFAULT_CONTRACTOR_UI_STRINGS,
  mainUiStrings: mergeFreshMainUi(stored?.mainUiStrings as Partial<MainUiStrings> | null),
  pendingOpenAptId: null,
  pendingFocus: null,
  snapshotTick: 0,
  cloudSyncedProject: null,
  plannerAsk: null,
  dashboardWidgetOrder: (stored?.dashboardWidgetOrder as string[] | null) ?? ['apt-stats', 'task-stats', 'stage-progress', 'building-progress', 'activity'],
  dashboardHiddenWidgets: (stored?.dashboardHiddenWidgets as string[] | null) ?? [],
  boardSettings: (stored?.boardSettings as Record<string, BoardSetting> | null) ?? {},
  contractorSheetLinks: (stored?.contractorSheetLinks as Record<string, string> | null) ?? {},
  currentProjectId: _activeProjectId,
  projectColors: (stored?.projectColors as Record<string, string> | null) ?? {},
  customProjects: (stored?.customProjects as Project[] | null) ?? [],
  projects: [
    ...DEFAULT_PROJECTS,
    ...((stored?.customProjects as Project[] | null) ?? []),
  ].map(p => ({
    ...p,
    color: ((stored?.projectColors as Record<string, string> | null) ?? {})[p.id] ?? p.color,
  })),
  lightTheme: prefGet(THEME_KEY) !== 'dark',
  setPendingOpenAptId: (id: string | null) => {
    set({ pendingOpenAptId: id });
  },
  setPendingFocus: (f: FocusIntent | null) => {
    set({ pendingFocus: f });
  },
  answerPlannerAsk: (choice) => {
    const st = get();
    const ask = st.plannerAsk;
    set({ plannerAsk: null });
    if (!ask || choice !== 'remove') return;
    // "Pick another day": the task that just landed on a day the job already
    // had work on is taken back out. Nothing else is touched.
    if (st.contractorAssignments.some(x => x.id === ask.taskId)) get().deleteContractorAssignment(ask.taskId);
  },
  setDashboardLayout: (order: string[], hidden: string[]) => {
    set({ dashboardWidgetOrder: order, dashboardHiddenWidgets: hidden });
    // In the cloud, per workspace, so every computer shows the same dashboard.
    {
      const pid = get().currentProjectId;
      const prev = get().boardSettings;
      const next = { ...prev, [pid]: { ...(prev[pid] ?? {}), dashboardWidgetOrder: order, dashboardHiddenWidgets: hidden } };
      set({ boardSettings: next });
      saveBoardSettings(prev, next);
    }
    persist(get);
  },

  setCurrentProject: (id: string) => {
    const state = get();
    if (id === state.currentProjectId) return;

    // Save current project data first
    persist(get);

    // Extract global settings to carry over
    const globalState = {
      users: state.users,
      stages: state.stages,
      contractors: state.contractors,
      // Employees and their taps belong to the company, not to a workspace —
      // switching project must not empty the timesheet.
      employees: state.employees,
      timePunches: state.timePunches,
      timeClock: state.timeClock,
      workerLevels: state.workerLevels,
      stageSuggestions: state.stageSuggestions,
      autoBackup: state.autoBackup,
      backupFrequency: state.backupFrequency,
      backupDriveFolderLink: state.backupDriveFolderLink,
      driveExportFrequency: state.driveExportFrequency,
      contractorUiStrings: state.contractorUiStrings,
      mainUiStrings: state.mainUiStrings,
      lightTheme: state.lightTheme,
      backupLogs: state.backupLogs,
    };

    // Load new project's saved data (or fresh defaults)
    const newStored = loadFromStorage(getProjectStorageKey(id), null) as Record<string, unknown> | null;
    // Same rule as getDefaultBuildings: only the built-in three have seeds.
    const defaultBuildings = getDefaultBuildings(id);
    const defaultApartments = getDefaultApartments(id);

    const rawApartments = (newStored?.apartments as Apartment[] | null) ?? defaultApartments;
    const newProjectData = {
      buildings:             id === 'general' ? [] : (newStored?.buildings as Building[] | null) ?? defaultBuildings,
      apartments:            scopeApartmentsToProject(
        id,
        id === 'netiv' ? migrateNetivApartments(rawApartments).apts : rawApartments,
        id === 'general' ? [] : (newStored?.buildings as Building[] | null) ?? defaultBuildings,
      ),
      stageNotes:            (newStored?.stageNotes as StageNote[] | null)            ?? [],
      stageNoteVersions:     (newStored?.stageNoteVersions as StageNoteVersion[] | null) ?? [],
      generalNoteVersions:   (newStored?.generalNoteVersions as GeneralNoteVersion[] | null) ?? [],
      activityLogs:          (newStored?.activityLogs as ActivityLog[] | null)        ?? [],
      contractorAssignments: (newStored?.contractorAssignments as ContractorAssignment[] | null) ?? [],
      contractorNotes:       (newStored?.contractorNotes as ContractorNote[] | null)  ?? [],
      contractorPhotos:      (newStored?.contractorPhotos as ContractorPhoto[] | null) ?? [],
      officeNoteFiles:       (newStored?.officeNoteFiles as OfficeNoteFile[] | null)  ?? [],
      backupSnapshots:       (newStored?.backupSnapshots as BackupSnapshot[] | null)  ?? [],
      dashboardWidgetOrder:  (newStored?.dashboardWidgetOrder as string[] | null)     ?? ['apt-stats', 'task-stats', 'stage-progress', 'building-progress', 'activity'],
      dashboardHiddenWidgets:(newStored?.dashboardHiddenWidgets as string[] | null)   ?? [],
      canvasElements:        (newStored?.canvasElements as CanvasElement[] | null)    ?? [],
      planPins:              (newStored?.planPins as PlanPin[] | null)                  ?? [],
      planAnnotations:       (newStored?.planAnnotations as PlanAnnotation[] | null)    ?? [],
    };

    // Cancel existing Firebase listeners and switch project
    _firebaseUnsubscribers.forEach(u => u());
    _firebaseUnsubscribers = [];
    // Tombstones are per-workspace; the incoming project's are read by its own sync.
    _tombstones = new Set();

    localStorage.setItem(ACTIVE_PROJECT_KEY, id);

    set({
      currentProjectId: id,
      firebaseListening: false,
      pendingOpenAptId: null,
      pendingFocus: null,
      plannerAsk: null,
      // Arriving somewhere new starts with nothing to take back. An entry from
      // the previous workspace would write to records that are not in this
      // one's collections — a write to nowhere, which reads as "undo does
      // nothing" rather than as an error.
      undoState: emptyUndo(),
      ...newProjectData,
      ...globalState,  // global settings always win
    });

    // Persist new project state
    persist(get);

    // Restart Firebase sync for new project if configured
    if (isFirebaseConfigured && !get().firebaseListening) {
      get().startFirebaseSync();
    }
  },

  /**
   * Creates a workspace and seeds it.
   *
   * The whole point is that it touches NOTHING that already exists: the new
   * workspace's records are written to its own storage key and its own
   * Firestore collections, exactly like the three built-in ones, and the
   * current workspace is left alone until someone switches to it.
   */
  addProject: (project, buildings, apartments, stages) => {
    const prevCustom = get().customProjects;
    const nextCustom = [...get().customProjects, project];
    set({
      customProjects: nextCustom,
      projects: [...get().projects, project],
      // Stages are global records carrying a projectId, like every other stage.
      stages: [...get().stages, ...stages],
    });

    // Its buildings go to the cloud with it (boardSettings.<id>.buildings).
    {
      const prev = get().boardSettings;
      const next = { ...prev, [project.id]: { ...(prev[project.id] ?? {}), buildings: buildings.map(b => ({ id: b.id, name: b.name, displayOrder: b.displayOrder })) } };
      set({ boardSettings: next });
      saveBoardSettings(prev, next);
    }

    // Seed the new workspace's own storage, without disturbing the live one.
    saveToStorage(getProjectStorageKey(project.id), {
      buildings, apartments,
      stageNotes: [], stageNoteVersions: [], generalNoteVersions: [], activityLogs: [],
      contractorAssignments: [], contractorNotes: [], contractorPhotos: [],
      officeNoteFiles: [], canvasElements: [], planPins: [], planAnnotations: [],
      dashboardWidgetOrder: [], dashboardHiddenWidgets: [],
    });

    persist(get);
    saveAppField('customProjects', prevCustom, nextCustom);
    if (isFirebaseConfigured) {
      stages.forEach(st => fsSet('stages', st.id, st));
      if (apartments.length) {
        fsBatchSet(projectCollection(project.id, 'apartments'), apartments.map(a => ({ id: a.id, data: a })));
      }
    }
  },

  /**
   * Removes a workspace from the list. Deliberately does NOT erase its records —
   * they stay in their own storage and collections, so a workspace removed by
   * mistake can be brought back by re-creating it with the same id.
   */
  deleteProject: (id) => {
    if (DEFAULT_PROJECTS.some(p => p.id === id)) return;  // the built-in three stay
    const prevCustom = get().customProjects;
    const nextCustom = prevCustom.filter(p => p.id !== id);
    set({
      customProjects: nextCustom,
      projects: get().projects.filter(p => p.id !== id),
    });
    if (get().currentProjectId === id) get().setCurrentProject('general');
    persist(get);
    saveAppField('customProjects', prevCustom, nextCustom);
  },

  setProjectColor: (projectId, color) => {
    const prevColors = get().projectColors;
    const next = { ...prevColors, [projectId]: color };
    set({
      projectColors: next,
      projects: get().projects.map(p => (p.id === projectId ? { ...p, color } : p)),
    });
    persist(get);
    saveAppField('projectColors', prevColors, next);
  },

  setBoardSetting: (key, value) => {
    const pid = get().currentProjectId;
    const prev = get().boardSettings;
    const next = { ...prev, [pid]: { ...(prev[pid] ?? {}), [key]: value } };
    set({ boardSettings: next });
    persist(get);
    saveBoardSettings(prev, next);
  },

  boardLayouts: (stored?.boardLayouts as Record<string, BoardLayout[]> | null) ?? {},

  saveBoardLayout: (label, auto) => {
    const st = get();
    const pid = st.currentProjectId;
    const layout: BoardLayout = {
      id: 'BL-' + Date.now().toString(36),
      at: new Date().toISOString(),
      label,
      ...(auto ? { auto: true } : {}),
      jobs: st.apartments
        .filter(a => a.buildingId === 'G' && typeof a.canvasX === 'number' && typeof a.canvasY === 'number')
        .map(a => ({ id: a.id, x: a.canvasX!, y: a.canvasY! })),
      els: st.canvasElements.map(e => ({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h })),
    };
    // Capped, because these are convenience snapshots and not a backup — and
    // capped SEPARATELY: the clock's snapshots rotate in their own slots, so
    // an hourly ticker can never push out an arrangement somebody saved on
    // purpose, and ten deliberate saves can never starve the automatic ones.
    const merged = [layout, ...(st.boardLayouts[pid] ?? [])];
    const manualKeep = new Set(merged.filter(l => !l.auto).slice(0, 10).map(l => l.id));
    const autoKeep = new Set(merged.filter(l => l.auto).slice(0, LAYOUTS_AUTO_MAX).map(l => l.id));
    const next = {
      ...st.boardLayouts,
      [pid]: merged.filter(l => (l.auto ? autoKeep.has(l.id) : manualKeep.has(l.id))),
    };
    set({ boardLayouts: next });
    persist(get);
    // In the cloud (one record per arrangement, per workspace), so every
    // computer has the same saved arrangements — and the backup holds them.
    fsSet(projectCollection(pid, 'boardLayouts'), layout.id, layout);
    merged.filter(l => !next[pid].some(k => k.id === l.id))
      .forEach(l => fsDelete(projectCollection(pid, 'boardLayouts'), l.id));
  },

  restoreBoardLayout: (layoutId) => {
    const st = get();
    const pid = st.currentProjectId;
    const layout = (st.boardLayouts[pid] ?? []).find(l => l.id === layoutId);
    if (!layout) return;
    const jobPos = new Map(layout.jobs.map(j => [j.id, j]));
    const elPos = new Map(layout.els.map(e => [e.id, e]));
    // Only positions are written back. A job that did not exist when the
    // snapshot was taken keeps its current place rather than jumping to 0,0.
    const apartments = st.apartments.map(a => {
      const p = jobPos.get(a.id);
      return p ? { ...a, canvasX: p.x, canvasY: p.y } : a;
    });
    const canvasElements = st.canvasElements.map(e => {
      const p = elPos.get(e.id);
      return p ? { ...e, x: p.x, y: p.y, w: p.w, h: p.h } : e;
    });
    const prevApts = new Map(st.apartments.map(a => [a.id, a]));
    const prevEls = new Map(st.canvasElements.map(e => [e.id, e]));
    set({ apartments, canvasElements });
    persist(get);
    // Positions only — never the whole record from this computer's copy.
    apartments.forEach(a => { if (jobPos.has(a.id)) fsPatch(projectCollection(pid, 'apartments'), a.id, prevApts.get(a.id), a); });
    canvasElements.forEach(e => { if (elPos.has(e.id)) fsPatch(projectCollection(pid, 'canvasElements'), e.id, prevEls.get(e.id), e); });
  },

  deleteBoardLayout: (layoutId) => {
    const st = get();
    const pid = st.currentProjectId;
    set({ boardLayouts: { ...st.boardLayouts, [pid]: (st.boardLayouts[pid] ?? []).filter(l => l.id !== layoutId) } });
    persist(get);
    fsDelete(projectCollection(pid, 'boardLayouts'), layoutId);
  },

  setTvSetting: (key, value) => {
    const prev = get().boardSettings;
    const next = { ...prev, __tv: { ...(prev.__tv ?? {}), [key]: value } };
    set({ boardSettings: next });
    persist(get);
    saveBoardSettings(prev, next);
  },

  setContractorSheetLink: (url: string) => {
    const pid = get().currentProjectId;
    const prevLinks = get().contractorSheetLinks;
    const next = { ...prevLinks, [pid]: url };
    set({ contractorSheetLinks: next });
    persist(get);
    // settings/app is the shared global doc, so the link follows the user to any device
    saveAppField('contractorSheetLinks', prevLinks, next);
  },

  setLightTheme: (v: boolean) => {
    set({ lightTheme: v });
    prefSet(THEME_KEY, v ? 'light' : 'dark');
  },

  // Fetches the authoritative user list before any code is accepted.
  //
  // SECURITY: the seed users in initialData ship inside the public JS bundle. On a
  // browser with no localStorage the store falls back to that seed, and because
  // Firebase sync only started *after* login, a seed code used to authenticate
  // against the live app. The real list must therefore be loaded up front, and
  // once it exists the seed must never be accepted.
  loadUsersForLogin: async () => {
    if (!isFirebaseConfigured) { set({ authReady: true }); return; }
    try {
      const cloudUsers = (await fsGetAll('users')) as unknown as User[];
      if (cloudUsers.length > 0) set({ users: cloudUsers });
      // An empty cloud list means a genuine first run; the seed then bootstraps it.
      set({ authReady: true });
    } catch {
      // Never open the door because the network failed.
      set({ authReady: false });
    }
  },

  login: (code: string) => {
    // Refuse to check codes until the real user list is known.
    if (isFirebaseConfigured && !get().authReady) return null;
    const user = get().users.find(u => u.code === code && u.active);
    if (user) {
      set({ currentUser: user });
      persist(get);
      // Start Firebase sync on login
      if (isFirebaseConfigured && !get().firebaseListening) {
        get().startFirebaseSync();
      }
    }
    return user ?? null;
  },

  logout: () => {
    // Cancel all real-time Firestore listeners so they don't fire after sign-out
    _firebaseUnsubscribers.forEach(unsub => unsub());
    _firebaseUnsubscribers = [];
    set({ currentUser: null, firebaseListening: false });
    persist(get);
  },

  updateApartment: (id, changes, user, opts) => {
    const existing = get().apartments.find(a => a.id === id);
    if (!existing) return;
    const now = new Date().toISOString();
    // What the CALLER asked for, before the headline is translated into marks:
    // a write naming a headline and no marks is somebody setting it by hand.
    const asked = changes;
    changes = normaliseStageWrite(existing, changes, get().stages, get().boardSettings, get().currentProjectId);

    // Record the date the first time each stage is set
    let stageDates = existing.stageDates ?? {};
    if (changes.currentStageId && changes.currentStageId !== existing.currentStageId) {
      if (!stageDates[changes.currentStageId]) {
        stageDates = { ...stageDates, [changes.currentStageId]: now };
      }
    }

    const updated: Apartment = {
      ...existing,
      ...changes,
      stageDates,
      updatedAt: now,
      updatedBy: user.id,
      updatedByName: user.name,
    };

    // Board position is not "content" — tidying the board must not make every
    // tile read "edited just now".
    const CANVAS_ONLY = new Set(['canvasX', 'canvasY', 'tileColor', 'boardBin', 'binnedAt', 'boardLocked', 'boardGroup', 'tileW', 'tileH', 'viewPos', 'ghosts', 'stageOrder', 'showOnTv', 'pinsDriveFileId', 'driveFolderName']);
    const touchedContent = Object.keys(changes).some(k => !CANVAS_ONLY.has(k));
    if (touchedContent) updated.contentUpdatedAt = now;

    // Sync shared fields to merged partner when they change
    let extraUpdates: Apartment[] = [];
    let partnerBefore: Apartment | undefined;
    // displayName is synced too: a linked pair is one physical home, so it carries
    // one family name. Each cell still shows its own apartment number.
    // stageMarks syncs like currentStageId — a merged pair is one home, and
    // its stage bookkeeping (done / pending per stage) is one record too.
    const syncedFields = ['currentStageId', 'classification', 'driveLink', 'plansPdfLink', 'displayName', 'stageMarks', 'bubbles'] as const;
    const changesHaveSync = syncedFields.some(f => f in changes);
    if (changesHaveSync && updated.mergedWith) {
      const partner = get().apartments.find(a => a.id === updated.mergedWith);
      partnerBefore = partner;
      if (partner) {
        const partnerPatch: Partial<Apartment> = {};
        if ('currentStageId' in changes) partnerPatch.currentStageId = updated.currentStageId;
        if ('classification' in changes) partnerPatch.classification = updated.classification;
        if ('driveLink' in changes) partnerPatch.driveLink = updated.driveLink;
        if ('plansPdfLink' in changes) partnerPatch.plansPdfLink = updated.plansPdfLink;
        if ('stageMarks' in changes) partnerPatch.stageMarks = updated.stageMarks;
        if ('bubbles' in changes) partnerPatch.bubbles = updated.bubbles;
        // Never copy a name that is just the source apartment's own number
        if ('displayName' in changes && updated.displayName?.trim()
            && updated.displayName.trim() !== updated.apartmentNumber?.trim()) {
          partnerPatch.displayName = updated.displayName;
        }
        const needsUpdate = Object.keys(partnerPatch).some(k =>
          JSON.stringify(partner[k as keyof Apartment]) !== JSON.stringify(partnerPatch[k as keyof Apartment])
        );
        if (needsUpdate) {
          extraUpdates = [{ ...partner, ...partnerPatch, updatedAt: now, updatedBy: user.id, updatedByName: user.name }];
        }
      }
    }

    // Save a general note version if the text changed
    let newGeneralNoteVersion: GeneralNoteVersion | null = null;
    if (changes.generalNotes !== undefined && changes.generalNotes !== existing.generalNotes && existing.generalNotes.trim()) {
      newGeneralNoteVersion = {
        id: generateId(),
        apartmentId: id,
        noteText: existing.generalNotes,
        savedAt: now,
        savedBy: user.id,
        savedByName: user.name,
      };
    }

    set(state => {
      let generalNoteVersions = state.generalNoteVersions;
      if (newGeneralNoteVersion) {
        const aptVersions = generalNoteVersions.filter(v => v.apartmentId === id);
        const otherVersions = generalNoteVersions.filter(v => v.apartmentId !== id);
        const keep = [newGeneralNoteVersion, ...aptVersions].slice(0, 20);
        generalNoteVersions = [...otherVersions, ...keep];
      }
      return {
        apartments: state.apartments.map(a => {
          if (a.id === id) return updated;
          const extra = extraUpdates.find(e => e.id === a.id);
          return extra ?? a;
        }),
        generalNoteVersions,
      };
    });
    persist(get);

    const _pid = get().currentProjectId;
    if (newGeneralNoteVersion) fsSet(projectCollection(_pid, 'generalNoteVersions'), newGeneralNoteVersion.id, newGeneralNoteVersion);

    // Firebase sync — only the fields this action changed (fsPatch).
    fsPatch(projectCollection(_pid, 'apartments'), id, existing, updated);
    extraUpdates.forEach(e => fsPatch(projectCollection(_pid, 'apartments'), e.id, partnerBefore, e));

    // Log changes
    if (opts?.quiet) return;
    const logBase = {
      userId: user.id,
      userName: user.name,
      buildingId: existing.buildingId,
      apartmentId: id,
      apartmentNumber: existing.displayName || existing.apartmentNumber || '',
    };

    /**
     * THE SET MODEL'S LOG LINE (owner, 2026-10-05: "we're not changing
     * states anymore — we have multiple states that need to get done, each
     * in their own way and form"). The old line logged the HEADLINE moving,
     * "Registers → Access Panels" — but the headline is derived by
     * `applyMarks` on every write; nobody moved it. What somebody DID is
     * tick stages: so the record names which stages changed state
     * (`stageChangesOf`, before vs after), one record per write however many
     * it touched. The headline is never logged. A MARKER the office sets by
     * hand (Ready to start / Job completed — a write naming a headline and no
     * marks) is the one headline that IS an act, and is named as such.
     */
    if ('stageMarks' in changes || 'currentStageId' in changes) {
      const pid = get().currentProjectId;
      const sorted = stagesOfProject(pid, get().stages);
      const marks = stageChangesOf(existing, updated, sorted, setContextOf(pid, get().boardSettings));
      const byHand = 'currentStageId' in asked && !('stageMarks' in asked);
      const target = byHand && updated.currentStageId ? sorted.find(st => st.id === updated.currentStageId) : undefined;
      const marker = target && !isWorkStage(target) && updated.currentStageId !== existing.currentStageId ? target.name : undefined;
      if (marks.length || marker) {
        const entry: Omit<ActivityLog, 'id' | 'createdAt'> = {
          ...logBase,
          actionType: 'stage_marks',
          fieldChanged: 'stageMarks',
          previousValue: '',
          newValue: '',
          stageId: marks[0]?.id ?? target?.id ?? '',
          ...(marks.length ? { marks } : {}),
          ...(marker ? { marker } : {}),
        };
        // The English sentence rides in newValue for anything that reads the
        // raw record (an export, an older tab) rather than the words module.
        entry.newValue = plainSummary({ ...entry, id: '', createdAt: now }, get().stages);
        get().addActivityLog(entry);
      }
    }

    /**
     * General notes are BULLETS (`noteEntries`): the record carries exactly
     * the line that was added (newValue) or taken away (previousValue) — never
     * the whole growing list, which made every row read like a paragraph.
     */
    if (JSON.stringify(existing.generalNotes) !== JSON.stringify(updated.generalNotes)) {
      let prevLabel = String(existing.generalNotes ?? '');
      let nextLabel = String(updated.generalNotes ?? '');
      if ('noteEntries' in changes) {
        const before = existing.noteEntries
          ?? (prevLabel.trim() ? [{ id: `${id}-note-0`, text: prevLabel }] : []);
        const after = updated.noteEntries ?? [];
        const had = new Set(before.map(e => e.id));
        const has = new Set(after.map(e => e.id));
        nextLabel = after.filter(e => !had.has(e.id)).map(e => e.text).join('\n');
        prevLabel = before.filter(e => !has.has(e.id)).map(e => e.text).join('\n');
      } else if (prevLabel && nextLabel.startsWith(prevLabel)) {
        nextLabel = nextLabel.slice(prevLabel.length).replace(/^\n/, '');
        prevLabel = '';
      }
      if (prevLabel || nextLabel) {
        get().addActivityLog({ ...logBase, actionType: 'update', fieldChanged: 'generalNotes', previousValue: prevLabel, newValue: nextLabel, stageId: '' });
      }
    }

    const loggable: Array<keyof Apartment> = ['classification', 'displayName'];
    loggable.forEach(field => {
      const prev = existing[field];
      const next = updated[field];
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        get().addActivityLog({
          ...logBase,
          actionType: 'update',
          fieldChanged: field,
          previousValue: String(prev ?? ''),
          newValue: String(next ?? ''),
          stageId: '',
        });
      }
    });
  },

  bulkUpdateApartments: (ids, changes, user) => {
    const now = new Date().toISOString();
    const updated = get().apartments.map(a => {
      if (!ids.includes(a.id)) return a;
      const own = normaliseStageWrite(a, changes, get().stages, get().boardSettings, get().currentProjectId);
      let stageDates = a.stageDates ?? {};
      if (own.currentStageId && own.currentStageId !== a.currentStageId && !stageDates[own.currentStageId]) {
        stageDates = { ...stageDates, [own.currentStageId]: now };
      }
      return { ...a, ...own, stageDates, updatedAt: now, updatedBy: user.id, updatedByName: user.name };
    });
    const before = new Map(get().apartments.map(a => [a.id, a]));
    set({ apartments: updated });
    persist(get);
    updated.filter(a => ids.includes(a.id)).forEach(a => fsPatch(projectCollection(get().currentProjectId, 'apartments'), a.id, before.get(a.id), a));
  },

  setApartmentMarks: (id, marks, user, opts) => {
    const existing = get().apartments.find(a => a.id === id);
    if (!existing) return;
    const pid = get().currentProjectId;
    const sorted = stagesOfProject(pid, get().stages);
    get().updateApartment(id, applyMarks(existing, marks, sorted, setContextOf(pid, get().boardSettings)), user, opts);
  },

  setApartmentMarksInProject: (projectId, id, marks, user) => {
    if (projectId === get().currentProjectId) { get().setApartmentMarks(id, marks, user); return; }
    const key = `${projectId}_app_data`;
    const snap = loadFromStorage<Record<string, unknown>>(key, {});
    const list = Array.isArray(snap.apartments) ? snap.apartments as Apartment[] : [];
    const existing = list.find(a => a.id === id);
    if (!existing) return;
    const sorted = stagesOfProject(projectId, get().stages);
    const ctx = setContextOf(projectId, get().boardSettings);
    const now = new Date().toISOString();
    const next = { ...existing, ...applyMarks(existing, marks, sorted, ctx), updatedAt: now } as Apartment;
    saveToStorage(key, { ...snap, apartments: list.map(a => (a.id === id ? next : a)) });
    // This copy comes from the other workspace's snapshot on THIS computer,
    // which can be days old — only the ticks changed here go up.
    fsPatch(projectCollection(projectId, 'apartments'), id, existing, next);
    const changed = stageChangesOf(existing, next, sorted, ctx);
    if (changed.length) {
      const log: ActivityLog = {
        id: generateId(), createdAt: now, userId: user.id, userName: user.name || 'Office',
        buildingId: existing.buildingId, apartmentId: id,
        apartmentNumber: existing.displayName || existing.apartmentNumber || '',
        actionType: 'stage_marks', fieldChanged: 'stageMarks', previousValue: '', newValue: '',
        stageId: changed[0].id, marks: changed,
      } as ActivityLog;
      log.newValue = plainSummary(log, get().stages);
      fsSet(projectCollection(projectId, 'activityLogs'), log.id, log);
    }
    set(st => ({ snapshotTick: st.snapshotTick + 1 }));
  },

  answerOffList: (projectId, taskId, itemId, choice) => {
    const live = projectId === get().currentProjectId;
    const tasks = live ? get().contractorAssignments : loadProjectSnapshot(projectId).assignments;
    const t = tasks.find(a => a.id === taskId);
    const item = t?.offList?.find(i => i.id === itemId);
    if (!t || !item || item.answer) return;
    const user = get().currentUser;
    const who: User = user ?? ({ id: 'office', name: 'Office', code: '', role: 'admin', active: true, createdAt: '' } as User);
    const at = new Date().toISOString();
    const verb = choice.kind === 'stage' ? 'counted as a stage' : choice.kind === 'task' ? 'made a task of its own' : 'kept as a note';
    trackUndo({ weight: 'content', label: `Answered: "${item.text.slice(0, 40)}"`,
      explain: `Undo takes back the answer to "${item.text.slice(0, 60)}" (${verb}).` }, () => {
      let newTask: string | undefined;
      if (choice.kind === 'task') {
        const d = new Date(item.at);
        const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        newTask = get().addAssignmentToProject(projectId, {
          contractorId: t.contractorId, apartmentId: t.apartmentId, buildingId: t.buildingId,
          taskDescription: item.text, dueDate: day, stageId: null, completedAt: item.at,
          createdBy: who.id, createdByName: who.name, ...(t.general ? { general: t.general } : {}),
        } as never);
      }
      if (choice.kind === 'stage' && t.apartmentId) {
        const apts = live ? get().apartments : loadProjectSnapshot(projectId).apartments;
        const apt = apts.find(a => a.id === t.apartmentId);
        if (apt) get().setApartmentMarksInProject(projectId, apt.id, { ...(apt.stageMarks ?? {}), [choice.stageId]: 'done' }, who);
      }
      const answer = { kind: choice.kind, by: who.name, at,
        ...(choice.kind === 'stage' ? { stageId: choice.stageId } : {}), ...(newTask ? { taskId: newTask } : {}) };
      const offList = (t.offList ?? []).map(i => (i.id === itemId ? { ...i, answer } : i));
      get().updateAssignmentInProject(projectId, taskId, { offList });
    });
  },

  migrateStageSets: () => {
    const pid = get().currentProjectId;
    get().fillWolfsonTipus();
    const sorted = stagesOfProject(pid, get().stages);
    // Kinds first: the seed is by name, once, and only while no line has one.
    for (const k of seedStageKinds(sorted)) get().updateStage(k.id, { kind: k.kind });
    get().splitCombinedStages();
    const sortedNow = stagesOfProject(pid, get().stages);
    const now = new Date().toISOString();
    const changed: Apartment[] = [];
    const ctxNow = setContextOf(pid, get().boardSettings);
    const beforeById = new Map(get().apartments.map(a => [a.id, a]));
    const apartments = get().apartments.map(a => {
      const patch = migrateToBubbles(a, sortedNow);
      let next: Apartment = patch ? { ...a, ...patch, updatedAt: now } : a;
      /**
       * A job left standing on an OPENING marker ("Ready to start") while its
       * work is recorded takes the headline its marks say. The list's order
       * used to make Ready to start the Job Board's closing marker, so a job
       * with every stage done headlined "Ready to start" (owner's recording,
       * 2026-10-19); the rule is fixed in `markerRole`, this heals the records
       * it already wrote. Nothing but the headline changes.
       */
      const cur = sortedNow.find(st => st.id === next.currentStageId);
      if (next.bubbles && cur && !isWorkStage(cur) && markerRole(cur, sortedNow) === 'opening'
        && Object.values(next.stageMarks ?? {}).some(m => m === 'done' || m === 'doing' || m === 'pending')) {
        const head = headlineStageId(next, sortedNow, ctxNow);
        if (head && head !== next.currentStageId) next = { ...next, currentStageId: head, updatedAt: now };
      }
      if (next === a) return a;
      changed.push(next);
      return next;
    });
    if (!changed.length) return 0;
    set({ apartments });
    persist(get);
    // Only what the repair changed, tick by tick, and never a deletion: an
    // absent mark or headline on this computer is not a decision (that is how
    // one browser's empty copy wiped the cloud's ticks, 2026-10-29).
    const was = new Map(get().apartments.map(a => [a.id, a]));
    fsBatchPatch(projectCollection(pid, 'apartments'),
      changed.map(a => ({ id: a.id, before: beforeById.get(a.id) ?? was.get(a.id), after: a })), { noDeletes: true, noCreate: true });
    return changed.length;
  },

  fillWolfsonTipus: () => {
    /**
     * Owner, recording 2026-10-28 (the "Wolfson Tipus Map", approved): every
     * Wolfson flat carries its tipus by the rule in `wolfsonTipus`, and the
     * start stage reads "Sold" rather than "Sold/Start". Only EMPTY tipus
     * fields are filled — one somebody set by hand is never touched — so this
     * is safe to run on every open and does nothing after the first.
     */
    let n = 0;
    const startStage = get().stages.find(st => /^\s*sold\s*\/\s*start\s*$/i.test(st.name || ''));
    if (startStage) {
      const nameHe = startStage.nameHe && /נמכר/.test(startStage.nameHe) ? 'נמכר' : startStage.nameHe;
      get().updateStage(startStage.id, { name: 'Sold', ...(nameHe !== startStage.nameHe ? { nameHe } : {}) });
      n++;
    }
    if (get().currentProjectId !== 'wolfson') return n;
    if (!get().boardSettings.wolfson?.tipusim?.length) {
      get().setBoardSetting('tipusim', [...WOLFSON_TIPUSIM]);
      n++;
    }
    const now = new Date().toISOString();
    const changed: Array<{ id: string; tipus: string }> = [];
    const apartments = get().apartments.map(a => {
      if (a.tipus?.trim() || a.isUnnamed || a.coveredBy || !isWolfsonBuilding(a.buildingId)) return a;
      const tipus = wolfsonTipus(a);
      if (!tipus) return a;
      changed.push({ id: a.id, tipus });
      return { ...a, tipus };
    });
    if (!changed.length) return n;
    set({ apartments });
    persist(get);
    fsBatchSet(projectCollection('wolfson', 'apartments'), changed.map(c => ({ id: c.id, data: { tipus: c.tipus, updatedAt: now } })));  // only the empty tipus field it fills
    return n + changed.length;
  },

  splitCombinedStages: () => {
    const pid = get().currentProjectId;
    const now = new Date().toISOString();
    const { add, retire } = planStageSplit(get().stages, now);
    for (const st of add) get().addStage(st);
    for (const id of retire) get().updateStage(id, { active: false });
    // Only a workspace on the GLOBAL list holds records that name these
    // stages; the Job Board's own list never did.
    if (pid === 'general') return add.length + retire.length;
    const sorted = stagesOfProject(pid, get().stages);
    const ctx = setContextOf(pid, get().boardSettings);
    let n = add.length + retire.length;
    // Apartments: each parent's mark copied onto its children, the headline re-derived
    // (a record that STOOD on a parent with nothing marked moves to the first child).
    const changedApts: Apartment[] = [];
    const splitWas = new Map(get().apartments.map(a => [a.id, a]));
    const apartments = get().apartments.map(a => {
      const sm = splitApartment(a);
      if (!sm) return a;
      const applied = applyMarks(a, sm.marks, sorted, ctx);
      // A record that STOOD on a parent by hand (no marks at all) moves to its first
      // child; one with marks takes the derived headline unless that is a parent.
      const currentStageId = isSplitParent(applied.currentStageId) ? (sm.headline ?? firstChildOf(applied.currentStageId!))
        : (!sm.marks && sm.headline) ? sm.headline : applied.currentStageId;
      const next = { ...a, ...applied, currentStageId, updatedAt: now };
      changedApts.push(next);
      return next;
    });
    // Tasks: the stage lists expanded, the single stages re-pointed at the first child.
    const taskPatches: Array<{ id: string; data: Partial<ContractorAssignment> }> = [];
    const contractorAssignments = get().contractorAssignments.map(t => {
      const patch = splitTask(t);
      if (!patch) return t;
      taskPatches.push({ id: t.id, data: patch });
      return { ...t, ...patch };
    });
    // Stage notes filed on a parent move to its first child.
    const notePatches: Array<{ id: string; data: Partial<StageNote> }> = [];
    const stageNotes = get().stageNotes.map(nt => {
      const patch = splitStageNote(nt);
      if (!patch) return nt;
      notePatches.push({ id: nt.id, data: patch });
      return { ...nt, ...patch };
    });
    if (!changedApts.length && !taskPatches.length && !notePatches.length) return n;
    n += changedApts.length + taskPatches.length + notePatches.length;
    set({ apartments, contractorAssignments, stageNotes });
    persist(get);
    // Tick by tick, never a deletion, never a new record (as migrateStageSets).
    if (changedApts.length) fsBatchPatch(projectCollection(pid, 'apartments'),
      changedApts.map(a => ({ id: a.id, before: splitWas.get(a.id), after: a })), { noDeletes: true, noCreate: true });
    if (taskPatches.length) fsBatchSet(projectCollection(pid, 'contractorAssignments'), taskPatches);
    if (notePatches.length) fsBatchSet(projectCollection(pid, 'stageNotes'), notePatches);
    // A tipus set naming a parent names its children now.
    const bs = get().boardSettings[pid];
    if (bs?.tipusStages) {
      let touched = false;
      const tipusStages: Record<string, string[]> = {};
      for (const [t, ids] of Object.entries(bs.tipusStages)) {
        const v = splitStageIdList(ids);
        if (v) touched = true;
        tipusStages[t] = v ?? ids;
      }
      if (touched) get().setBoardSetting('tipusStages', tipusStages);
    }
    return n;
  },

  addApartment: (apt) => {
    set(state => ({ apartments: [...state.apartments, apt] }));
    persist(get);
    fsSet(projectCollection(get().currentProjectId, 'apartments'), apt.id, apt);
  },

  importJobs: (jobs) => {
    if (!jobs.length) return;
    set(state => ({ apartments: [...state.apartments, ...jobs] }));
    persist(get);
    // One chunked batch, not hundreds of single writes — a CSV import lands
    // several hundred jobs at once and each fsSet is its own network round.
    fsBatchSet(projectCollection(get().currentProjectId, 'apartments'), jobs.map(j => ({ id: j.id, data: j })));
  },

  addJobsToProject: (projectId, jobs, group) => {
    if (projectId === get().currentProjectId) {
      if (group && !get().canvasElements.some(e => e.id === group.id)) get().addCanvasElement(group);
      const have = new Set(get().apartments.map(a => a.id));
      get().importJobs(jobs.filter(j => !have.has(j.id)));
      return;
    }
    const key = `${projectId}_app_data`;
    const snap = loadFromStorage<Record<string, unknown>>(key, {});
    const apts = Array.isArray(snap.apartments) ? snap.apartments as Apartment[] : [];
    const have = new Set(apts.map(a => a.id));
    const fresh = jobs.filter(j => !have.has(j.id));
    const els = Array.isArray(snap.canvasElements) ? snap.canvasElements as CanvasElement[] : [];
    const addGroup = group && !els.some(e => e.id === group.id) ? group : null;
    saveToStorage(key, {
      ...snap,
      apartments: [...apts, ...fresh],
      canvasElements: addGroup ? [...els, addGroup] : els,
    });
    // "Fresh" is judged on this computer's copy of the other workspace, which
    // can be old: create-only, so a job the cloud already has is never overwritten.
    if (fresh.length) fsBatchCreate(projectCollection(projectId, 'apartments'), fresh.map(j => ({ id: j.id, data: j })));
    if (addGroup) fsBatchCreate(projectCollection(projectId, 'canvasElements'), [{ id: addGroup.id, data: addGroup }]);
    set(st => ({ snapshotTick: st.snapshotTick + 1 }));
  },

  setDriveFolderNames: (projectId, names) => {
    const ids = Object.keys(names);
    if (!ids.length) return;
    const patch = (a: Apartment) => (names[a.id] !== undefined && names[a.id] !== a.driveFolderName)
      ? { ...a, driveFolderName: names[a.id] } : a;
    if (projectId === get().currentProjectId) {
      const next = get().apartments.map(patch);
      const changed = next.filter((a, i) => a !== get().apartments[i]);
      if (!changed.length) return;
      set({ apartments: next });
      persist(get);
      fsBatchSet(projectCollection(projectId, 'apartments'), changed.map(a => ({ id: a.id, data: { driveFolderName: a.driveFolderName } })));
      return;
    }
    const key = `${projectId}_app_data`;
    const snap = loadFromStorage<Record<string, unknown>>(key, {});
    const apts = Array.isArray(snap.apartments) ? snap.apartments as Apartment[] : [];
    const next = apts.map(patch);
    const changed = next.filter((a, i) => a !== apts[i]);
    if (!changed.length) return;
    saveToStorage(key, { ...snap, apartments: next });
    fsBatchSet(projectCollection(projectId, 'apartments'), changed.map(a => ({ id: a.id, data: { driveFolderName: a.driveFolderName } })));
    set(st => ({ snapshotTick: st.snapshotTick + 1 }));
  },

  setBoardSettingFor: (projectId, key, value) => {
    const prev = get().boardSettings;
    const next = { ...prev, [projectId]: { ...(prev[projectId] ?? {}), [key]: value } };
    set({ boardSettings: next });
    persist(get);
    saveBoardSettings(prev, next);
  },

  removeJobsByIdPrefix: (prefix) => {
    const pid = get().currentProjectId;
    const doomed = get().apartments
      .filter(a => a.buildingId === 'G' && a.id.startsWith(prefix))
      .map(a => a.id);
    if (!doomed.length) return 0;
    const gone = new Set(doomed);
    // Out of the notebooks too, or removing an import leaves a wall of
    // "(job removed)" where the planning used to be.
    const purge = plannerPurgePlan(get(), doomed);
    set(state => ({
      apartments: state.apartments.filter(a => !gone.has(a.id)),
      ...(purge ? { canvasElements: purge.elements } : {}),
    }));
    if (purge) applyPlannerPurge(get, pid, purge);
    persist(get);
    // Tombstone BEFORE the deletes: another device still holding these locally
    // would otherwise re-seed them on its next sync, which is exactly why a
    // removed import kept coming back.
    tombstone(pid, doomed);
    doomed.forEach(id => fsDelete(projectCollection(pid, 'apartments'), id));
    return doomed.length;
  },

  addGhost: (id, x, y) => {
    const pid = get().currentProjectId;
    const was = get().apartments.find(a => a.id === id);
    set(state => ({
      apartments: state.apartments.map(a => a.id === id
        ? { ...a, ghosts: [...(a.ghosts ?? []), { x, y }] } : a),
    }));
    persist(get);
    const u = get().apartments.find(a => a.id === id);
    if (u) fsPatch(projectCollection(pid, 'apartments'), id, was, u);
  },

  moveGhost: (id, index, x, y) => {
    const pid = get().currentProjectId;
    const was = get().apartments.find(a => a.id === id);
    set(state => ({
      apartments: state.apartments.map(a => a.id === id
        ? { ...a, ghosts: (a.ghosts ?? []).map((g, i) => (i === index ? { x, y } : g)) } : a),
    }));
    persist(get);
    const u = get().apartments.find(a => a.id === id);
    if (u) fsPatch(projectCollection(pid, 'apartments'), id, was, u);
  },

  removeGhost: (id, index) => {
    const pid = get().currentProjectId;
    const was = get().apartments.find(a => a.id === id);
    set(state => ({
      apartments: state.apartments.map(a => a.id === id
        ? { ...a, ghosts: (a.ghosts ?? []).filter((_, i) => i !== index) } : a),
    }));
    persist(get);
    const u = get().apartments.find(a => a.id === id);
    if (u) fsPatch(projectCollection(pid, 'apartments'), id, was, u);
  },

  undoState: emptyUndo(),
  /**
   * A write that happens BECAUSE an undo/redo is executing must never be
   * recorded as a new action — recording it would clear the redo stack (the
   * classic new-action rule), which is exactly the owner's "I undo five times
   * and my redos disappear". The steppers raise the flag around the entry's
   * own closure, so any tracked side-effect a restore triggers downstream is
   * treated as part of the step, not as a different turn taken.
   */
  rememberUndo: entry => {
    if (_undoWalking) return;
    const was = get().undoState;
    const next = remember(was, entry);
    set({ undoState: next });
    // In the cloud too: the new step, minus the redo list it cleared and any
    // step that fell off the end.
    const keep = new Set(next.past.map(e => e.id));
    saveNewStep(prefsPerson(), next.past[next.past.length - 1], was.future);
    dropSteps(prefsPerson(), was.past.filter(e => !keep.has(e.id)));
  },
  stepUndo: () => {
    const { entry, next } = popUndo(get().undoState);
    if (!entry) return null;
    // The stack moves FIRST: `entry.undo()` writes to the store, and anything
    // that re-entered here mid-write would find the entry still on the past.
    set({ undoState: next });
    moveStep(prefsPerson(), entry, 'future');
    _undoWalking = true;
    try { entry.undo(); } finally { _undoWalking = false; }
    return entry;
  },
  stepRedo: () => {
    const { entry, next } = popRedo(get().undoState);
    if (!entry) return null;
    set({ undoState: next });
    moveStep(prefsPerson(), entry, 'past');
    _undoWalking = true;
    try { entry.redo(); } finally { _undoWalking = false; }
    return entry;
  },

  restoreCanvasElements: (els) => {
    if (els.length === 0) return;
    const pid = get().currentProjectId;
    untombstone(pid, els.map(e => e.id));
    const had = new Map(get().canvasElements.map(e => [e.id, e]));
    set(state => {
      const have = new Set(state.canvasElements.map(e => e.id));
      return { canvasElements: [...state.canvasElements, ...els.filter(e => !have.has(e.id))] };
    });
    // A returning element is written whole (it was deleted); one this computer
    // still holds sends only what differs.
    els.forEach(e => fsPatch(projectCollection(pid, 'canvasElements'), e.id, had.get(e.id), e));
    persist(get);
  },

  moveToBin: (id, bin) => {
    const pid = get().currentProjectId;
    const was = get().apartments.find(a => a.id === id);
    set(state => ({
      apartments: state.apartments.map(a => a.id === id
        ? { ...a, boardBin: bin ?? undefined, binnedAt: bin ? new Date().toISOString() : undefined, updatedAt: new Date().toISOString() }
        : a),
    }));
    persist(get);
    const updated = get().apartments.find(a => a.id === id);
    if (updated) fsPatch(projectCollection(pid, 'apartments'), id, was, updated);
  },

  /**
   * What deleting this job takes with it — counted BEFORE the act, so every
   * confirm dialog can say the same true thing. One source for the numbers,
   * or the board's warning and the drawer's warning drift into two answers.
   */
  deletionImpact: (id) => {
    const st = get();
    const assignments = st.contractorAssignments.filter(a => a.apartmentId === id);
    const aids = new Set(assignments.map(a => a.id));
    return {
      tasks: assignments.length,
      photos: st.contractorPhotos.filter(p => aids.has(p.assignmentId)).length,
      workerNotes: st.contractorNotes.filter(n => aids.has(n.assignmentId)).length,
      stageNotes: st.stageNotes.filter(n => n.apartmentId === id && (n.noteText ?? '').trim()).length,
      pins: st.planPins.filter(p => p.apartmentId === id).length,
      markups: st.planAnnotations.filter(m => m.apartmentId === id).length,
    };
  },

  deleteApartment: (id) => {
    const state = get();
    const pid = state.currentProjectId;

    // Collect all linked records to cascade-delete. EVERYTHING that points at
    // the job goes with it: leaving orphans behind is how a count on one page
    // disagrees with a count on another six months later.
    const linkedAssignments = state.contractorAssignments.filter(a => a.apartmentId === id);
    const linkedIds = new Set(linkedAssignments.map(a => a.id));
    const linkedNotes  = state.contractorNotes.filter(n => linkedIds.has(n.assignmentId));
    const linkedPhotos = state.contractorPhotos.filter(p => linkedIds.has(p.assignmentId));
    const linkedStageNotes = state.stageNotes.filter(n => n.apartmentId === id);
    const linkedPins = state.planPins.filter(p => p.apartmentId === id);
    const linkedMarkups = state.planAnnotations.filter(m => m.apartmentId === id);

    // A merged partner keeps living — but its link must not point at a ghost.
    const partnerId = state.apartments.find(a => a.id === id)?.mergedWith;

    // The notebooks hold a REFERENCE to this job, not a copy — clear them, or
    // the cell is left reading "(job removed)" for ever.
    const purge = plannerPurgePlan(state, [id]);

    set(st => ({
      apartments: st.apartments
        .filter(a => a.id !== id)
        .map(a => (a.id === partnerId ? { ...a, mergedWith: undefined } : a)),
      ...(purge ? { canvasElements: purge.elements } : {}),
      contractorAssignments: st.contractorAssignments.filter(a => a.apartmentId !== id),
      contractorNotes:       st.contractorNotes.filter(n => !linkedIds.has(n.assignmentId)),
      contractorPhotos:      st.contractorPhotos.filter(p => !linkedIds.has(p.assignmentId)),
      stageNotes:            st.stageNotes.filter(n => n.apartmentId !== id),
      planPins:              st.planPins.filter(p => p.apartmentId !== id),
      planAnnotations:       st.planAnnotations.filter(m => m.apartmentId !== id),
    }));
    if (purge) applyPlannerPurge(get, pid, purge);
    persist(get);

    // Firestore cascade
    tombstone(pid, [id]);
    fsDelete(projectCollection(pid, 'apartments'), id);
    linkedAssignments.forEach(a => fsDelete(projectCollection(pid, 'contractorAssignments'), a.id));
    linkedNotes.forEach(n  => fsDelete(projectCollection(pid, 'contractorNotes'), n.id));
    linkedPhotos.forEach(p => fsDelete(projectCollection(pid, 'contractorPhotos'), p.id));
    linkedStageNotes.forEach(n => fsDelete(projectCollection(pid, 'stageNotes'), n.id));
    linkedPins.forEach(p => fsDelete(projectCollection(pid, 'planPins'), p.id));
    linkedMarkups.forEach(m => fsDelete(projectCollection(pid, 'planAnnotations'), m.id));
    if (partnerId) {
      const partner = get().apartments.find(a => a.id === partnerId);
      // Only its link goes (mergedWith → deleted), not its whole record.
      if (partner) fsPatch(projectCollection(pid, 'apartments'), partner.id, state.apartments.find(a => a.id === partnerId), partner);
    }
  },

  boardViews: (stored?.boardViews as BoardView[] | null) ?? [],

  savedReports: (stored?.savedReports as Record<string, ReportDef[]> | null) ?? {},
  saveReport: (def) => {
    const st = get();
    const pid = st.currentProjectId;
    const mine = st.savedReports[pid] ?? [];
    // Upsert by id, so editing a report does not leave the old one behind.
    const next = mine.some(r => r.id === def.id)
      ? mine.map(r => (r.id === def.id ? def : r))
      : [...mine, def];
    set({ savedReports: { ...st.savedReports, [pid]: next } });
    saveAppField('savedReports', st.savedReports, get().savedReports);
    persist(get);
  },
  deleteReport: (id) => {
    const st = get();
    const pid = st.currentProjectId;
    set({
      savedReports: {
        ...st.savedReports,
        [pid]: (st.savedReports[pid] ?? []).filter(r => r.id !== id),
      },
    });
    saveAppField('savedReports', st.savedReports, get().savedReports);
    persist(get);
  },
  addBoardView: (v) => {
    const prevViews = get().boardViews;
    set(state => ({ boardViews: [...state.boardViews, v] }));
    saveAppField('boardViews', prevViews, get().boardViews);
    persist(get);
  },
  updateBoardView: (id, changes) => {
    const prevViews = get().boardViews;
    set(state => ({ boardViews: state.boardViews.map(v => v.id === id ? { ...v, ...changes } : v) }));
    saveAppField('boardViews', prevViews, get().boardViews);
    persist(get);
  },
  deleteBoardView: (id) => {
    /**
     * Removing a board must not remove what is on it.
     *
     * Its notes, widgets and groups come back out onto the workspace's main
     * board rather than vanishing with the container — the same rule a group
     * follows when it is deleted. The jobs were never on it exclusively; only
     * their positions were, and those are simply forgotten.
     */
    const prevViews = get().boardViews;
    const prevEls = new Map(get().canvasElements.map(el => [el.id, el]));
    set(state => ({
      boardViews: state.boardViews.filter(v => v.id !== id),
      canvasElements: state.canvasElements.map(el =>
        el.board === id ? { ...el, board: undefined } : el),
      activeBoardView: state.activeBoardView === id ? '' : state.activeBoardView,
    }));
    const pid = get().currentProjectId;
    // Only the elements that were ON the removed board change (their `board`
    // goes); every other element is left alone in the cloud.
    get().canvasElements
      .filter(el => prevEls.get(el.id)?.board === id)
      .forEach(el => fsPatch(projectCollection(pid, 'canvasElements'), el.id, prevEls.get(el.id), el));
    saveAppField('boardViews', prevViews, get().boardViews);
    persist(get);
  },

  /**
   * The order of the workspace tiles.
   *
   * Shared rather than per-machine: the office talks about "the third one
   * along", so it should be the third one along on everybody's screen.
   */
  projectOrder: (stored?.projectOrder as string[] | null) ?? [],
  setProjectOrder: (ids) => {
    const prevOrder = get().projectOrder;
    set({ projectOrder: ids });
    saveAppField('projectOrder', prevOrder, ids);
    persist(get);
  },

  /**
   * Which board is showing — on THIS machine, deliberately.
   *
   * Somebody choosing to look at the installation board should not move
   * everybody else's screen, so it is a local preference rather than shared
   * state. It is remembered per workspace so switching back returns you to the
   * board you were on.
   */
  activeBoardView: (() => {
    try { return prefGet('active_board_view') ?? ''; } catch { return ''; }
  })(),
  setActiveBoardView: (id) => {
    try { prefSet('active_board_view', id); } catch { /* private mode */ }
    set({ activeBoardView: id });
  },

  planAnnotations: (stored?.planAnnotations as PlanAnnotation[] | null) ?? [],
  savePlanAnnotation: (ann) => {
    const was = get().planAnnotations.find(a => a.id === ann.id);
    set(state => ({
      planAnnotations: [...state.planAnnotations.filter(a => a.id !== ann.id), ann],
    }));
    fsPatch(projectCollection(get().currentProjectId, 'planAnnotations'), ann.id, was, ann);
    persist(get);
  },
  updatePlanAnnotation: (id, changes) => {
    const was = get().planAnnotations.find(a => a.id === id);
    set(state => ({
      planAnnotations: state.planAnnotations.map(a => a.id === id ? { ...a, ...changes } : a),
    }));
    const updated = get().planAnnotations.find(a => a.id === id);
    if (updated) fsPatch(projectCollection(get().currentProjectId, 'planAnnotations'), id, was, updated);
    persist(get);
  },
  deletePlanAnnotation: (id) => {
    set(state => ({ planAnnotations: state.planAnnotations.filter(a => a.id !== id) }));
    fsDelete(projectCollection(get().currentProjectId, 'planAnnotations'), id);
    persist(get);
  },

  planPins: (stored?.planPins as PlanPin[] | null) ?? [],
  addPlanPin: (pin) => {
    set(state => ({ planPins: [...state.planPins, pin] }));
    fsSet(projectCollection(get().currentProjectId, 'planPins'), pin.id, pin);
    persist(get);
  },
  updatePlanPin: (id, changes) => {
    const was = get().planPins.find(p => p.id === id);
    set(state => ({ planPins: state.planPins.map(p => p.id === id ? { ...p, ...changes } : p) }));
    const updated = get().planPins.find(p => p.id === id);
    if (updated) fsPatch(projectCollection(get().currentProjectId, 'planPins'), id, was, updated);
    persist(get);
  },
  deletePlanPin: (id) => {
    set(state => ({ planPins: state.planPins.filter(p => p.id !== id) }));
    fsDelete(projectCollection(get().currentProjectId, 'planPins'), id);
    persist(get);
  },

  addCanvasElement: (el) => {
    set(state => ({ canvasElements: [...state.canvasElements, el] }));
    fsSet(projectCollection(get().currentProjectId, 'canvasElements'), el.id, el);
    persist(get);
  },
  updateCanvasElement: (id, changes) => {
    // Only the fields this change touched go up — inside `data` key by key, and
    // a list of pins/cards as adds/removes/edits replayed on the cloud's list.
    // A computer with an old copy of the widget can no longer empty it
    // (2026-10-28: a stale computer wrote 7 widgets whole and emptied a pin board).
    const was = get().canvasElements.find(el => el.id === id);
    set(state => ({ canvasElements: state.canvasElements.map(el => el.id === id ? { ...el, ...changes } : el) }));
    persist(get);
    const updatedEl = get().canvasElements.find(el => el.id === id);
    if (updatedEl) fsPatch(projectCollection(get().currentProjectId, 'canvasElements'), id, was, updatedEl);
  },
  deleteCanvasElement: (id) => {
    const pid = get().currentProjectId;
    set(state => ({ canvasElements: state.canvasElements.filter(el => el.id !== id) }));
    tombstone(pid, [id]);
    fsDelete(projectCollection(pid, 'canvasElements'), id);
    persist(get);
  },

  appendStageNoteEntry: (apartmentId, stageId, entry, user) => {
    const now = new Date().toISOString();
    const existing = get().stageNotes.find(n => n.apartmentId === apartmentId && n.stageId === stageId);
    const legacy: StageNoteEntry[] = existing && !existing.entries && (existing.noteText.trim() || existing.attachments?.length)
      ? [{ id: `${existing.id}-0`, text: existing.noteText, at: existing.updatedAt, by: existing.updatedBy, byName: existing.updatedByName, attachments: existing.attachments }]
      : [];
    const next: StageNoteEntry = { id: generateId(), text: entry.text, at: now, by: user.id, byName: user.name, attachments: entry.attachments?.length ? entry.attachments : undefined, officeOnly: entry.officeOnly || undefined };
    const entries = [...(existing?.entries ?? legacy), next];
    const noteText = entries.map(e => e.text).filter(Boolean).join('\n');
    const note: StageNote = existing
      ? { ...existing, entries, noteText, updatedAt: now, updatedBy: user.id, updatedByName: user.name }
      : { id: generateId(), apartmentId, stageId, noteText, entries, updatedAt: now, updatedBy: user.id, updatedByName: user.name };
    set(state => ({
      stageNotes: existing
        ? state.stageNotes.map(n => (n.id === existing.id ? note : n))
        : [...state.stageNotes, note],
    }));
    persist(get);
    // Entries go up as additions to the cloud's list (fsPatch), so a note
    // written on two computers keeps both entries.
    fsPatch(projectCollection(get().currentProjectId, 'stageNotes'), note.id, leanNote(existing), leanNote(note)!);
    const apt = get().apartments.find(a => a.id === apartmentId);
    if (apt) {
      // A note that is only a memo or a picture records the FILE, and says
      // so — the reader words it "added a voice memo", never the file name.
      const fileOnly = !entry.text?.trim() && !!entry.attachments?.length;
      get().addActivityLog({
        userId: user.id, userName: user.name, buildingId: apt.buildingId, apartmentId,
        apartmentNumber: apt.displayName || apt.apartmentNumber || '',
        actionType: 'note', fieldChanged: fileOnly ? 'stageNoteFile' : 'stageNote', previousValue: '',
        newValue: fileOnly ? (entry.attachments ?? []).map(x => x.filename).join(', ') : entry.text,
        stageId,
      });
    }
  },
  upsertStageNote: (apartmentId, stageId, noteText, user, attachment, attachments) => {
    const now = new Date().toISOString();
    const existing = get().stageNotes.find(n => n.apartmentId === apartmentId && n.stageId === stageId);
    const prevText = existing?.noteText ?? '';

    const attachFields = attachment === null
      ? { attachmentFilename: undefined, attachmentMimeType: undefined, attachmentDataUrl: undefined, attachmentDriveFileId: undefined, attachmentDriveUrl: undefined }
      : attachment
        ? { attachmentFilename: attachment.filename, attachmentMimeType: attachment.mimeType, attachmentDataUrl: attachment.dataUrl, attachmentDriveFileId: attachment.driveFileId, attachmentDriveUrl: attachment.driveUrl }
        : {};

    // Merge legacy single attachment into attachments array if needed
    let finalAttachments: StageNoteAttachment[] | undefined = attachments;
    if (!finalAttachments && existing?.attachments) {
      finalAttachments = existing.attachments;
    }

    let note: StageNote;
    if (existing) {
      // Save current version before overwriting
      const version: StageNoteVersion = {
        id: generateId(),
        noteId: existing.id,
        noteText: existing.noteText,
        attachments: existing.attachments,
        savedAt: existing.updatedAt,
        savedBy: existing.updatedBy,
        savedByName: existing.updatedByName,
      };
      const MAX_VERSIONS = 20;
      set(state => {
        const prevVersions = state.stageNoteVersions.filter(v => v.noteId === existing.id);
        const keep = prevVersions.length >= MAX_VERSIONS ? prevVersions.slice(-(MAX_VERSIONS - 1)) : prevVersions;
        const otherVersions = state.stageNoteVersions.filter(v => v.noteId !== existing.id);
        return { stageNoteVersions: [...otherVersions, ...keep, version] };
      });
      fsSet(projectCollection(get().currentProjectId, 'stageNoteVersions'), version.id, version);

      note = { ...existing, noteText, updatedAt: now, updatedBy: user.id, updatedByName: user.name, ...attachFields, attachments: finalAttachments };
      set(state => ({
        stageNotes: state.stageNotes.map(n =>
          n.apartmentId === apartmentId && n.stageId === stageId ? note : n
        ),
      }));
    } else {
      note = { id: generateId(), apartmentId, stageId, noteText, updatedAt: now, updatedBy: user.id, updatedByName: user.name, ...attachFields, attachments: finalAttachments };
      set(state => ({ stageNotes: [...state.stageNotes, note] }));
    }
    persist(get);
    // Without file bytes (dataUrl), and only what changed.
    fsPatch(projectCollection(get().currentProjectId, 'stageNotes'), note.id, leanNote(existing), leanNote(note)!);

    const apt = get().apartments.find(a => a.id === apartmentId);
    const stage = get().stages.find(s => s.id === stageId);
    if (apt && stage) {
      get().addActivityLog({
        userId: user.id,
        userName: user.name,
        buildingId: apt.buildingId,
        apartmentId,
        apartmentNumber: apt.displayName || apt.apartmentNumber || '',
        actionType: 'note',
        fieldChanged: 'stageNote',
        previousValue: prevText,
        newValue: noteText,
        stageId,
      });
    }
  },

  getStageNote: (apartmentId, stageId) => {
    return get().stageNotes.find(n => n.apartmentId === apartmentId && n.stageId === stageId);
  },

  setStageNoteEntryVisibility: (noteId, entryId, officeOnly) => {
    const note = get().stageNotes.find(n => n.id === noteId);
    if (!note?.entries) return;
    const entries = note.entries.map(e => e.id === entryId ? { ...e, officeOnly: officeOnly || undefined } : e);
    const updated: StageNote = { ...note, entries };
    set(state => ({ stageNotes: state.stageNotes.map(n => (n.id === noteId ? updated : n)) }));
    persist(get);
    fsPatch(projectCollection(get().currentProjectId, 'stageNotes'), note.id, leanNote(note), leanNote(updated)!);
  },

  getStageNoteVersions: (noteId) => {
    return get().stageNoteVersions.filter(v => v.noteId === noteId).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },

  getGeneralNoteVersions: (aptId) => {
    return get().generalNoteVersions.filter(v => v.apartmentId === aptId).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },

  updateStage: (id, changes) => {
    const was = get().stages.find(s => s.id === id);
    set(state => ({
      stages: state.stages.map(s => s.id === id ? { ...s, ...changes, updatedAt: new Date().toISOString() } : s),
    }));
    persist(get);
    const updated = get().stages.find(s => s.id === id);
    if (updated) fsPatch('stages', id, was, updated);
  },

  addStage: (stage) => {
    set(state => ({ stages: [...state.stages, stage] }));
    persist(get);
    fsSet('stages', stage.id, stage);
  },

  deleteStage: (id) => {
    // Capture which apartments are affected before mutating state
    const affectedAptIds = new Set(
      get().apartments.filter(a => a.currentStageId === id).map(a => a.id)
    );
    const was = new Map(get().apartments.map(a => [a.id, a]));
    set(state => ({
      stages: state.stages.filter(s => s.id !== id),
      apartments: state.apartments.map(a => a.currentStageId === id ? { ...a, currentStageId: null } : a),
    }));
    persist(get);
    fsDelete('stages', id);
    get().apartments
      .filter(a => affectedAptIds.has(a.id))
      .forEach(a => fsPatch(projectCollection(get().currentProjectId, 'apartments'), a.id, was.get(a.id), a));
  },

  mergeApartments: (aptId, partnerId, user) => {
    const state = get();
    const apt = state.apartments.find(a => a.id === aptId);
    if (!apt) return;

    const now = new Date().toISOString();
    const updates = new Map<string, Apartment>();

    // Clear old partner's back-link
    if (apt.mergedWith && apt.mergedWith !== partnerId) {
      const oldPartner = state.apartments.find(a => a.id === apt.mergedWith);
      if (oldPartner) {
        updates.set(oldPartner.id, { ...oldPartner, mergedWith: undefined, updatedAt: now, updatedBy: user.id, updatedByName: user.name });
      }
    }

    // Update this apartment
    updates.set(aptId, { ...apt, mergedWith: partnerId ?? undefined, updatedAt: now, updatedBy: user.id, updatedByName: user.name });

    // Update new partner
    if (partnerId) {
      const partner = state.apartments.find(a => a.id === partnerId);
      if (partner) {
        // If partner was linked to someone else, clear that too
        if (partner.mergedWith && partner.mergedWith !== aptId) {
          const partnerOld = state.apartments.find(a => a.id === partner.mergedWith);
          if (partnerOld && !updates.has(partnerOld.id)) {
            updates.set(partnerOld.id, { ...partnerOld, mergedWith: undefined, updatedAt: now, updatedBy: user.id, updatedByName: user.name });
          }
        }
        // Sync driveLink: use whichever partner has one set
        const sharedLink = apt.driveLink || partner.driveLink || undefined;
        const thisApt = updates.get(aptId)!;
        updates.set(aptId, { ...thisApt, driveLink: sharedLink });
        updates.set(partnerId, { ...partner, mergedWith: aptId, driveLink: sharedLink, updatedAt: now, updatedBy: user.id, updatedByName: user.name });
      }
    }

    set(state => ({ apartments: state.apartments.map(a => updates.has(a.id) ? updates.get(a.id)! : a) }));
    persist(get);
    fsBatchPatch(projectCollection(get().currentProjectId, 'apartments'),
      Array.from(updates.entries()).map(([id, after]) => ({ id, before: state.apartments.find(a => a.id === id), after })));
  },

  unmergeApartments: (aptId, keepDataAptId, user) => {
    const state = get();
    const apt = state.apartments.find(a => a.id === aptId);
    if (!apt) return;
    const partnerId = apt.mergedWith;
    if (!partnerId) return;
    const partner = state.apartments.find(a => a.id === partnerId);
    if (!partner) return;

    const now = new Date().toISOString();
    const updates = new Map<string, Apartment>();

    if (keepDataAptId === 'both') {
      updates.set(aptId, { ...apt, mergedWith: undefined, updatedAt: now, updatedBy: user.id, updatedByName: user.name });
      updates.set(partnerId, { ...partner, mergedWith: undefined, updatedAt: now, updatedBy: user.id, updatedByName: user.name });
    } else {
      const keeper = keepDataAptId === aptId ? apt : partner;
      const loser = keepDataAptId === aptId ? partner : apt;
      updates.set(keeper.id, { ...keeper, mergedWith: undefined, updatedAt: now, updatedBy: user.id, updatedByName: user.name });
      updates.set(loser.id, {
        ...loser,
        mergedWith: undefined,
        currentStageId: null,
        driveLink: undefined,
        plansPdfLink: undefined,
        updatedAt: now,
        updatedBy: user.id,
        updatedByName: user.name,
      });
    }

    set(state => ({ apartments: state.apartments.map(a => updates.has(a.id) ? updates.get(a.id)! : a) }));
    persist(get);
    fsBatchPatch(projectCollection(get().currentProjectId, 'apartments'),
      Array.from(updates.entries()).map(([id, after]) => ({ id, before: state.apartments.find(a => a.id === id), after })));
  },

  setGoogleClientId: (id) => {
    set({ googleClientId: id });
    persist(get);
  },

  setGoogleToken: (token, expiry) => {
    set({ googleAccessToken: token, googleTokenExpiry: expiry });
    // not persisted — session-only
  },

  addStageSuggestion: (fields) => {
    const text = fields.text.trim().split(/\s+/).slice(0, 4).join(' ').slice(0, 40);
    if (!text) return;
    const sug: StageSuggestion = { ...fields, text, id: 'sg-' + generateId(), at: new Date().toISOString(), status: 'open' };
    set(state => ({ stageSuggestions: [sug, ...state.stageSuggestions] }));
    persist(get);
    fsSet('stageSuggestions', sug.id, sug);
  },

  resolveStageSuggestion: (id, choice, byName) => {
    const sug = get().stageSuggestions.find(x => x.id === id);
    if (!sug) return;
    const doneAt = new Date().toISOString();
    const next: StageSuggestion = choice === 'dismiss'
      ? { ...sug, status: 'dismissed', doneBy: byName, doneAt }
      : { ...sug, status: 'applied', stageId: choice.stageId, doneBy: byName, doneAt };
    trackUndo({ weight: 'content', label: 'Filed a worker\'s words',
      explain: choice === 'dismiss' ? `Put aside "${sug.text}".` : `Added "${sug.text}" to a stage's list.` }, () => {
      if (choice !== 'dismiss') {
        const st = get().stages.find(x => x.id === choice.stageId);
        if (st) {
          const have = st.includes ?? [];
          if (!have.some(w => w.toLowerCase() === sug.text.toLowerCase())) get().updateStage(st.id, { includes: [...have, sug.text] });
        }
      }
      set(state => ({ stageSuggestions: state.stageSuggestions.map(x => (x.id === id ? next : x)) }));
      persist(get);
      fsPatch('stageSuggestions', id, sug, next);
    });
  },

  // ─── Contractor actions ────────────────────────────────────────────────────
  addWorkerLevel: (fields) => {
    const l: WorkerLevel = { ...fields, id: 'lvl-' + generateId() };
    set(state => ({ workerLevels: [...state.workerLevels, l] }));
    persist(get);
    fsSet('workerLevels', l.id, l);
    return l;
  },

  updateWorkerLevel: (id, changes) => {
    const was = get().workerLevels.find(x => x.id === id);
    set(state => ({
      workerLevels: state.workerLevels.map(l => (l.id === id ? { ...l, ...changes } : l)),
    }));
    persist(get);
    const updated = get().workerLevels.find(l => l.id === id);
    if (updated) fsPatch('workerLevels', id, was, updated);
  },

  /**
   * Removing a level moves everybody on it back to the starting one.
   *
   * A worker pointing at a level that no longer exists would fall through to
   * no permissions at all, which is a portal that opens and shows nothing —
   * indistinguishable from the app being broken.
   */
  deleteWorkerLevel: (id) => {
    const level = get().workerLevels.find(l => l.id === id);
    if (!level || level.builtIn) return;
    const orphans = get().contractors.filter(c => c.levelId === id);
    set(state => ({
      workerLevels: state.workerLevels.filter(l => l.id !== id),
      contractors: state.contractors.map(c =>
        (c.levelId === id ? { ...c, levelId: DEFAULT_WORKER_LEVELS[0].id } : c)),
    }));
    persist(get);
    fsDelete('workerLevels', id);
    orphans.forEach(c => fsPatch('contractors', c.id, c, { ...c, levelId: DEFAULT_WORKER_LEVELS[0].id }));
  },

  addEmployee: (fields) => {
    const e: Employee = {
      ...fields,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    set(state => ({ employees: [...state.employees, e] }));
    persist(get);
    fsSet('employees', e.id, e);
    return e;
  },

  updateEmployee: (id, changes) => {
    const was = get().employees.find(x => x.id === id);
    set(state => ({ employees: state.employees.map(e => e.id === id ? { ...e, ...changes } : e) }));
    persist(get);
    const updated = get().employees.find(e => e.id === id);
    if (updated) fsPatch('employees', id, was, updated);
  },

  /**
   * Removing somebody takes their taps with them.
   *
   * The alternative — orphaned punches nothing can name — would quietly
   * inflate nothing and be impossible to audit. Somebody who has LEFT should
   * be marked inactive instead, which keeps every hour they ever worked; this
   * is for a row entered by mistake.
   */
  deleteEmployee: (id) => {
    const doomed = get().timePunches.filter(p => p.employeeId === id);
    set(state => ({
      employees: state.employees.filter(e => e.id !== id),
      timePunches: state.timePunches.filter(p => p.employeeId !== id),
    }));
    persist(get);
    fsDelete('employees', id);
    doomed.forEach(p => fsDelete('timePunches', p.id));
  },

  /**
   * A tap on the board.
   *
   * The decision about WHAT to write lives in `resolvePunch`, which is pure and
   * tested on its own: a forgotten clock-out from an earlier day gets closed at
   * that day's end, and a clock-out with no clock-in gets a start written at the
   * normal start time. Both are marked so the month's report can flag them
   * rather than quietly inventing hours.
   */
  punchClock: (employeeId, kind, source = 'board') => {
    const state = get();
    const plan = resolvePunch(state.timePunches, employeeId, kind, new Date(), state.timeClock, source);
    if (!plan.writes.length) return plan.message;
    const made: TimePunch[] = plan.writes.map(w => ({ ...w, id: generateId() }));
    set(st => ({ timePunches: [...st.timePunches, ...made] }));
    persist(get);
    made.forEach(pch => fsSet('timePunches', pch.id, pch));
    return plan.message;
  },

  addPunch: (fields) => {
    const pch: TimePunch = { ...fields, id: generateId() };
    set(state => ({ timePunches: [...state.timePunches, pch] }));
    persist(get);
    fsSet('timePunches', pch.id, pch);
  },

  updatePunch: (id, changes) => {
    const was = get().timePunches.find(x => x.id === id);
    set(state => ({ timePunches: state.timePunches.map(p => p.id === id ? { ...p, ...changes } : p) }));
    persist(get);
    const updated = get().timePunches.find(p => p.id === id);
    if (updated) fsPatch('timePunches', id, was, updated);
  },

  deletePunch: (id) => {
    set(state => ({ timePunches: state.timePunches.filter(p => p.id !== id) }));
    persist(get);
    fsDelete('timePunches', id);
  },

  setTimeClock: (changes) => {
    const prevClock = get().timeClock;
    const next = { ...prevClock, ...changes };
    set({ timeClock: next });
    persist(get);
    saveAppField('timeClock', prevClock, next);
  },

  addContractor: (fields) => {
    const c: Contractor = {
      ...fields,
      id: generateId(),
      token: generateToken(),
      createdAt: new Date().toISOString(),
    };
    set(state => ({ contractors: [...state.contractors, c] }));
    persist(get);
    fsSet('contractors', c.id, c);
    return c;
  },

  updateContractor: (id, changes) => {
    const was = get().contractors.find(x => x.id === id);
    set(state => ({ contractors: state.contractors.map(c => c.id === id ? { ...c, ...changes } : c) }));
    persist(get);
    const updated = get().contractors.find(c => c.id === id);
    if (updated) fsPatch('contractors', id, was, updated);
  },

  deleteContractor: (id) => {
    const state = get();
    const assignmentIds = state.contractorAssignments.filter(a => a.contractorId === id).map(a => a.id);
    const noteIds = state.contractorNotes.filter(n => n.contractorId === id).map(n => n.id);
    const photoIds = state.contractorPhotos.filter(p => p.contractorId === id).map(p => p.id);
    set(s => ({
      contractors: s.contractors.filter(c => c.id !== id),
      contractorAssignments: s.contractorAssignments.filter(a => a.contractorId !== id),
      contractorNotes: s.contractorNotes.filter(n => n.contractorId !== id),
      contractorPhotos: s.contractorPhotos.filter(p => p.contractorId !== id),
    }));
    persist(get);
    const _pid2 = get().currentProjectId;
    fsDelete('contractors', id);
    assignmentIds.forEach(aid => fsDelete(projectCollection(_pid2, 'contractorAssignments'), aid));
    noteIds.forEach(nid => fsDelete(projectCollection(_pid2, 'contractorNotes'), nid));
    photoIds.forEach(pid => fsDelete(projectCollection(_pid2, 'contractorPhotos'), pid));
  },

  addContractorAssignment: (fields) => {
    /**
     * A caller that minted its own id KEEPS it. The planner's drop dialog
     * writes its id onto the day cards it creates before this returns —
     * `{ ...fields, id: generateId() }` silently rewrote it, so every card
     * pointed at a task that did not exist: no day pill, no take-the-task-off
     * question, no strike-through on completion. Defaults first, fields last.
     */
    const a: ContractorAssignment = {
      id: generateId(), createdAt: new Date().toISOString(), ...fields,
    } as ContractorAssignment;
    // Keeping a MINTED id must not keep an EMPTY one: the drawer's quick-add
    // passes id '' as a placeholder, and fields-last let it win — every task
    // it made stored (and synced) with no id at all, so editing, completing
    // and deleting it matched nothing.
    if (!a.id) a.id = generateId();
    set(state => ({ contractorAssignments: [...state.contractorAssignments, a] }));
    persist(get);

    /**
     * Is this job already on somebody's planner?
     *
     * If it is, and the new task carries a date, the office is asked what the
     * planner should do about it — add a ghost of the job on the assignee's
     * row at the due date, leave the planner alone, or move the existing
     * entry (confirmed choice: ask every time). The question is queued here,
     * next to the fact that raises it, and drawn by the admin layout;
     * session-only, never persisted, and the worker portal never renders it.
     */
    if (a.dueDate && a.contractorId && a.apartmentId && !a.completedAt) {
      const mine = daysOf(a);
      const clash = get().contractorAssignments.find(o =>
        o.id !== a.id && o.apartmentId === a.apartmentId && !o.completedAt
        && daysOf(o).some(dd => mine.includes(dd)));
      if (clash) {
        set({ plannerAsk: {
          jobId: a.apartmentId, contractorId: a.contractorId, dueDate: a.dueDate, taskId: a.id,
          days: mine,
          overlap: { taskId: clash.id, contractorId: clash.contractorId, days: daysOf(clash), stageId: clash.stageId ?? null },
        } });
      }
    }
    // Strip attachment dataUrls before Firestore (keep metadata only)
    const aForFs = { ...a, attachments: a.attachments?.map(att => ({ ...att, dataUrl: '' })) };
    fsSet(projectCollection(get().currentProjectId, 'contractorAssignments'), a.id, aForFs);
    // Ring the worker's phone (pushNotify stands down on the portal itself,
    // so a task the worker starts for himself never rings him).
    if (a.contractorId && !a.completedAt) {
      const aptFor = get().apartments.find(ap => ap.id === a.apartmentId);
      notifyWorker(get().contractors.find(c => c.id === a.contractorId), get().boardSettings.__tv?.portalDomain, {
        kind: 'task', body: a.taskDescription, taskId: a.id,
        where: aptFor ? (aptLabel(aptFor) || aptFor.displayName || '') : '',
      });
    }
    // Activity log. A PROBLEM is logged by the form that raises it ("reported
    // a problem"), so it is not logged twice here as a plain task.
    const apt = get().apartments.find(ap => ap.id === a.apartmentId);
    if (apt && !a.problem) {
      get().addActivityLog({
        userId: a.createdBy,
        // Never undefined: fsSet turns an undefined into a field DELETE, so a
        // task made without a createdByName produced a history entry with no
        // name at all — which the History tab then crashed on.
        userName: a.createdByName || get().currentUser?.name || 'Office',
        buildingId: a.buildingId,
        apartmentId: a.apartmentId,
        apartmentNumber: apt.displayName || apt.apartmentNumber || '',
        actionType: 'task_created',
        // The worker's "I'm going to work here" is a start of work, and the
        // record says so — the reader words it "started work here — Registers".
        fieldChanged: a.stageReport ? 'work_started' : 'task',
        previousValue: '',
        newValue: a.taskDescription,
        stageId: a.stageId ?? '',
      });
    }
  },

  updateContractorAssignment: (id, changes) => {
    const before = get().contractorAssignments.find(a => a.id === id);
    /**
     * A hand-typed due date beats a stale day list. The Tasks page and the
     * drawer edit `dueDate` alone; on a multi-day task that would leave
     * `days` describing days the office just moved away from, and every
     * calendar drawing the old ones. Retyping the date collapses the task to
     * that one day — explicit and predictable; the planner's own moves write
     * `days` and `dueDate` together and never hit this.
     */
    if ('dueDate' in changes && !('days' in changes)
        && before?.days?.length && changes.dueDate && !before.days.includes(changes.dueDate)) {
      changes = { ...changes, days: undefined };
    }
    // Closed late → the closing day joins the task's days (closeDayFields).
    if (before && !before.completedAt && changes.completedAt && !('days' in changes)) {
      const late = closeDayFields(before, changes.completedAt);
      if (late) changes = { ...changes, ...late };
    }
    set(state => ({
      contractorAssignments: state.contractorAssignments.map(a => a.id === id ? { ...a, ...changes } : a),
    }));
    persist(get);
    const updated = get().contractorAssignments.find(a => a.id === id);
    if (updated) {
      const lean = (a: ContractorAssignment) => ({ ...a, attachments: a.attachments?.map(att => ({ ...att, dataUrl: '' })) });
      fsPatch(projectCollection(get().currentProjectId, 'contractorAssignments'), id, before && lean(before), lean(updated));
    }
    /**
     * Closing a task TICKS ITS STAGES OFF (the set model, locked answer 7):
     * every stage the task is for becomes DONE on the apartment — except the
     * ones the worker said he did not finish at the close, which become HALF
     * DONE (the orange clock, cleared by the office only) — and the headline
     * walks to the next stage in the order by itself, through `applyMarks`.
     *
     * Here, at the one write every screen goes through: the planner made the
     * task, the portal or the Tasks page may close it, and nobody has to
     * remember the stage. The worker's portal has no signed-in user, so the
     * write is attributed to the worker by name. Re-opening a task does NOT
     * un-tick anything (the office may have confirmed it by hand meanwhile).
     * A PROBLEM's close is "waiting for approval" — it ticks nothing.
     * `stageWhenDone` — the old pair's second half — is still honoured on a
     * task that carries it and names no stages of its own.
     */
    if (before && updated && 'completedAt' in changes
        && !before.completedAt && updated.completedAt && !updated.problem) {
      const apt = get().apartments.find(ap => ap.id === updated.apartmentId);
      if (apt) {
        // On the worker's portal the WORKER closed it — even when an office
        // login happens to sit in the same browser, which used to credit
        // the office with the worker's stages ("Yitzchak moved it to
        // Registers" when Igor had closed his task).
        const who = (onPortalPath() ? null : get().currentUser)
          ?? workerAsUser(updated, get().contractors);
        const pid = get().currentProjectId;
        const sorted = stagesOfProject(pid, get().stages);
        const ctx = setContextOf(pid, get().boardSettings);
        const worked = (updated.stagesWorked?.length ? updated.stagesWorked : taskStageIds(updated))
          .filter((x): x is string => !!x && sorted.some(st => st.id === x && isWorkStage(st)));
        const unfinished = new Set(updated.stagesUnfinished
          ?? (updated.stagesFinished === false ? worked : []));
        if (worked.length) {
          const marks = { ...(apt.stageMarks ?? {}) };
          for (const sid of worked) marks[sid] = unfinished.has(sid) ? 'pending' : 'done';
          get().updateApartment(updated.apartmentId, applyMarks(apt, marks, sorted, ctx), who);
        } else if (updated.stageWhenDone && apt.currentStageId !== updated.stageWhenDone) {
          get().updateApartment(updated.apartmentId, { currentStageId: updated.stageWhenDone }, who);
        }
      }
    }
    /**
     * Log completion / undo-completion — attributed to whoever is really
     * standing there. On the portal that is the worker, and the portal writes
     * its own "closed the task" line, so a close there is not logged twice;
     * an approval writes its own "approved the fix", likewise.
     */
    if (before && updated && 'completedAt' in changes) {
      const apt = get().apartments.find(ap => ap.id === updated.apartmentId);
      const portal = onPortalPath();
      const user = portal ? workerAsUser(updated, get().contractors) : get().currentUser;
      if (apt && user) {
        const wasCompleted = !!before.completedAt;
        const isNowCompleted = !!updated.completedAt;
        const approval = !!updated.problem && changes.problem?.status === 'solved';
        if (!wasCompleted && isNowCompleted && !portal && !approval) {
          get().addActivityLog({
            userId: user.id,
            userName: user.name,
            buildingId: updated.buildingId,
            apartmentId: updated.apartmentId,
            apartmentNumber: apt.displayName || apt.apartmentNumber || '',
            actionType: 'task_completed',
            fieldChanged: 'task',
            previousValue: '',
            newValue: updated.taskDescription,
            stageId: updated.stageId ?? '',
          });
        } else if (wasCompleted && !isNowCompleted) {
          get().addActivityLog({
            userId: user.id,
            userName: user.name,
            buildingId: updated.buildingId,
            apartmentId: updated.apartmentId,
            apartmentNumber: apt.displayName || apt.apartmentNumber || '',
            actionType: 'task_uncompleted',
            fieldChanged: 'task',
            previousValue: before.taskDescription,
            newValue: '',
            stageId: updated.stageId ?? '',
          });
        }
      }
    }
  },

  deleteContractorAssignment: (id) => {
    const state = get();
    const assignment = state.contractorAssignments.find(a => a.id === id);
    const noteIds = state.contractorNotes.filter(n => n.assignmentId === id).map(n => n.id);
    const photoIds = state.contractorPhotos.filter(p => p.assignmentId === id).map(p => p.id);
    set(s => ({
      contractorAssignments: s.contractorAssignments.filter(a => a.id !== id),
      contractorNotes: s.contractorNotes.filter(n => n.assignmentId !== id),
      contractorPhotos: s.contractorPhotos.filter(p => p.assignmentId !== id),
    }));
    persist(get);
    const _pid3 = get().currentProjectId;
    fsDelete(projectCollection(_pid3, 'contractorAssignments'), id);
    noteIds.forEach(nid => fsDelete(projectCollection(_pid3, 'contractorNotes'), nid));
    photoIds.forEach(pid => fsDelete(projectCollection(_pid3, 'contractorPhotos'), pid));
    // Activity log
    if (assignment) {
      const apt = get().apartments.find(ap => ap.id === assignment.apartmentId);
      const user = get().currentUser;
      if (apt && user) {
        get().addActivityLog({
          userId: user.id,
          userName: user.name,
          buildingId: assignment.buildingId,
          apartmentId: assignment.apartmentId,
          apartmentNumber: apt.displayName || apt.apartmentNumber || '',
          actionType: 'task_deleted',
          fieldChanged: 'task',
          previousValue: assignment.taskDescription,
          newValue: '',
          stageId: assignment.stageId ?? '',
        });
      }
    }
  },

  taskMovePlan: (taskId, toApartmentId) => {
    const st = get();
    const task = st.contractorAssignments.find(a => a.id === taskId);
    if (!task || !task.apartmentId || task.general || task.apartmentId === toApartmentId) return null;
    const to = st.apartments.find(a => a.id === toApartmentId);
    if (!to) return null;
    const pid = st.currentProjectId;
    // An old apartment that is gone from this workspace has no marks to take
    // anything off; the task still moves.
    const from = st.apartments.find(a => a.id === task.apartmentId)
      ?? ({ id: task.apartmentId, buildingId: task.buildingId, apartmentNumber: '', displayName: '', currentStageId: null, bubbles: true } as unknown as Apartment);
    return planTaskMove(task, from, to, st.contractorAssignments, stagesOfProject(pid, st.stages), setContextOf(pid, st.boardSettings));
  },

  moveTaskToApartment: (taskId, toApartmentId, user, opts) => {
    const st = get();
    const task = st.contractorAssignments.find(a => a.id === taskId);
    // A general job has no apartment to move FROM; the same apartment is no move.
    if (!task || !task.apartmentId || task.general || task.apartmentId === toApartmentId) return false;
    const to = st.apartments.find(a => a.id === toApartmentId);
    if (!to) return false;
    const from = st.apartments.find(a => a.id === task.apartmentId);
    const pid = st.currentProjectId;
    const sorted = stagesOfProject(pid, st.stages);
    const ctx = setContextOf(pid, st.boardSettings);
    // Read BEFORE anything moves — "another task on the old apartment stands
    // behind this tick" must not count the task being moved.
    const plan = get().taskMovePlan(taskId, toApartmentId);

    // ── The records: the task, everything filed under it, and the general
    //    job's own note of the visit when this report was one. A problem
    //    remembers the stage of the apartment it is NOW on.
    const moved: ContractorAssignment = {
      ...task, apartmentId: to.id, buildingId: to.buildingId,
      // The new apartment's own "before" — so a second move (wrong again)
      // puts THIS apartment back too.
      ...(task.marksBefore && plan?.toBefore ? { marksBefore: plan.toBefore, marksBeforeAt: new Date().toISOString() } : {}),
      ...(task.problem ? { problem: { ...task.problem, stageBefore: to.currentStageId ?? null } } : {}),
    };
    const contractorAssignments = st.contractorAssignments.map(a => {
      if (a.id === taskId) return moved;
      if (!a.visits?.some(v => v.reportTaskId === taskId)) return a;
      return { ...a, visits: a.visits.map(v => (v.reportTaskId === taskId ? { ...v, apartmentId: to.id } : v)) };
    });
    const visitHosts = contractorAssignments.filter((a, i) => a.id !== taskId && a !== st.contractorAssignments[i]);
    const contractorPhotos = st.contractorPhotos.map(p => (p.assignmentId === taskId ? { ...p, apartmentId: to.id } : p));
    const contractorNotes = st.contractorNotes.map(n => (n.assignmentId === taskId ? { ...n, apartmentId: to.id } : n));
    set({ contractorAssignments, contractorPhotos, contractorNotes });
    persist(get);
    // Only the fields that moved. fsPatch never leaves a stub: a record the
    // cloud does not have yet is written whole instead (a lone field on a
    // missing document would hand every device a photo with no task and no file).
    const col = (base: string) => projectCollection(pid, base);
    const lean = (a: ContractorAssignment) => ({ ...a, attachments: a.attachments?.map(att => ({ ...att, dataUrl: '' })) });
    const taskWas = new Map(st.contractorAssignments.map(a => [a.id, a]));
    fsBatchPatch(col('contractorAssignments'), [moved, ...visitHosts].map(a => {
      const w = taskWas.get(a.id);
      return { id: a.id, before: w && lean(w), after: lean(a) };
    }));
    const photoWas = new Map(st.contractorPhotos.map(p => [p.id, p]));
    const photos = contractorPhotos.filter(p => p.assignmentId === taskId);
    if (photos.length) fsBatchPatch(col('contractorPhotos'), photos.map(p => {
      const w = photoWas.get(p.id);
      return { id: p.id, before: w && { ...w, dataUrl: '' }, after: { ...p, dataUrl: '' } };
    }));
    const noteWas = new Map(st.contractorNotes.map(n => [n.id, n]));
    const notes = contractorNotes.filter(n => n.assignmentId === taskId);
    if (notes.length) fsBatchPatch(col('contractorNotes'), notes.map(n => {
      const w = noteWas.get(n.id);
      return { id: n.id, before: w && { ...w, attachmentDataUrl: undefined }, after: { ...n, attachmentDataUrl: undefined } };
    }));

    // ── One history line on EACH apartment, in plain words.
    const fromPlace = placeLabel(from ?? { buildingId: task.buildingId, apartmentNumber: '', displayName: '' });
    const toPlace = placeLabel(to);
    const workerName = st.contractors.find(c => c.id === task.contractorId)?.name;
    const line = (apt: Apartment, actionType: 'task_moved_out' | 'task_moved_in') => get().addActivityLog({
      userId: user.id,
      userName: user.name,
      buildingId: apt.buildingId,
      apartmentId: apt.id,
      apartmentNumber: apt.displayName || apt.apartmentNumber || apt.id,
      actionType,
      fieldChanged: 'task',
      previousValue: fromPlace,
      newValue: toPlace,
      stageId: task.stageId ?? '',
      taskText: task.taskDescription,
      ...(workerName ? { workerName } : {}),
      ...(actionType === 'task_moved_out' && plan?.restored && plan.fromChanged ? { restoredBefore: true } : {}),
    });
    if (from) line(from, 'task_moved_out');
    line(to, 'task_moved_in');

    // ── The stage ticks, through the set model's one writer, so each
    //    apartment's headline re-derives from what is left on it.
    if (opts?.moveMarks !== false && plan) {
      if (plan.fromChanged && from) {
        const now = get().apartments.find(a => a.id === from.id);
        if (now) get().updateApartment(from.id, applyMarks(now, plan.fromMarks, sorted, ctx), user);
      }
      if (plan.toChanged) {
        const now = get().apartments.find(a => a.id === to.id);
        if (now) get().updateApartment(to.id, applyMarks(now, plan.toMarks, sorted, ctx), user);
      }
    }
    return true;
  },

  undoOwnTask: (taskId, user) => {
    const st = get();
    const task = st.contractorAssignments.find(a => a.id === taskId);
    if (!task || task.problem) return false;
    const pid = st.currentProjectId;
    const sorted = stagesOfProject(pid, st.stages);
    const ctx = setContextOf(pid, st.boardSettings);
    const from = task.apartmentId ? st.apartments.find(a => a.id === task.apartmentId) : undefined;
    // Read BEFORE the task goes — "another task stands behind this tick" must not count it.
    const plan = from && !task.general ? planTaskUndo(task, from, st.contractorAssignments, sorted, ctx) : null;
    trackUndo({ weight: 'content', label: 'Undid a task', explain: `Took back "${task.taskDescription}" and put the apartment's stages back.` }, () => {
      if (plan?.fromChanged && from) {
        const now = get().apartments.find(a => a.id === from.id);
        // Quiet: the one history line below says what happened.
        if (now) get().updateApartment(from.id, applyMarks(now, plan.fromMarks, sorted, ctx), user, { quiet: true });
      }
      // A general job that filed this report as one of its visits forgets it.
      for (const host of get().contractorAssignments) {
        if (host.id === taskId || !host.visits?.some(v => v.reportTaskId === taskId)) continue;
        get().updateContractorAssignment(host.id, { visits: host.visits.filter(v => v.reportTaskId !== taskId) });
      }
      if (from) {
        get().addActivityLog({
          userId: user.id,
          userName: user.name,
          buildingId: from.buildingId,
          apartmentId: from.id,
          apartmentNumber: from.displayName || from.apartmentNumber || from.id,
          actionType: 'task_deleted',
          fieldChanged: 'task',
          previousValue: task.taskDescription,
          newValue: '',
          stageId: task.stageId ?? '',
          ...(plan?.restored && plan.fromChanged ? { restoredBefore: true } : {}),
        });
      }
      // The office user, if any, is NOT who did this — the line above is the record.
      const cur = get().currentUser;
      if (cur) useStore.setState({ currentUser: null });
      try { get().deleteContractorAssignment(taskId); }
      finally { if (cur) useStore.setState({ currentUser: cur }); }
    });
    return true;
  },

  addContractorNote: (fields) => {
    const n: ContractorNote = { ...fields, id: generateId(), createdAt: new Date().toISOString() };
    set(state => ({ contractorNotes: [...state.contractorNotes, n] }));
    persist(get);
    fsSet(projectCollection(get().currentProjectId, 'contractorNotes'), n.id, { ...n, attachmentDataUrl: undefined });
    if (n.authorType === 'office' && n.contractorId) {
      notifyWorker(get().contractors.find(c => c.id === n.contractorId), get().boardSettings.__tv?.portalDomain, {
        kind: 'message', from: n.authorName, taskId: n.assignmentId,
        body: n.text?.trim() || '', attachment: n.attachmentMimeType,
      });
    }
  },

  updateContractorNote: (id, changes) => {
    const was = get().contractorNotes.find(x => x.id === id);
    set(state => ({
      contractorNotes: state.contractorNotes.map(n => n.id === id ? { ...n, ...changes } : n),
    }));
    persist(get);
    const updated = get().contractorNotes.find(n => n.id === id);
    if (updated) fsPatch(projectCollection(get().currentProjectId, 'contractorNotes'), id, was && { ...was, attachmentDataUrl: undefined }, { ...updated, attachmentDataUrl: undefined });
  },

  deleteContractorNote: (id) => {
    set(state => ({ contractorNotes: state.contractorNotes.filter(n => n.id !== id) }));
    persist(get);
    fsDelete(projectCollection(get().currentProjectId, 'contractorNotes'), id);
  },

  addAssignmentToProject: (projectId, fields) => {
    if (projectId === get().currentProjectId) {
      const id = generateId();
      get().addContractorAssignment({ ...fields, id } as never);
      return id;
    }
    const a: ContractorAssignment = { id: generateId(), createdAt: new Date().toISOString(), ...fields } as ContractorAssignment;
    noteForeignTask(projectId, a.id, null);
    const key = `${projectId}_app_data`;
    const snap = loadFromStorage<Record<string, unknown>>(key, {});
    const list = Array.isArray(snap.contractorAssignments) ? snap.contractorAssignments as ContractorAssignment[] : [];
    saveToStorage(key, { ...snap, contractorAssignments: [...list, a] });
    fsSet(projectCollection(projectId, 'contractorAssignments'), a.id, a);
    set(st => ({ snapshotTick: st.snapshotTick + 1 }));
    if (a.contractorId && !a.completedAt) {
      const apts = Array.isArray(snap.apartments) ? snap.apartments as Apartment[] : [];
      const aptFor = apts.find(ap => ap.id === a.apartmentId);
      notifyWorker(get().contractors.find(c => c.id === a.contractorId), get().boardSettings.__tv?.portalDomain, {
        kind: 'task', body: a.taskDescription, taskId: a.id,
        where: aptFor ? (aptLabel(aptFor) || aptFor.displayName || '') : '',
      });
    }
    return a.id;
  },

  updateAssignmentInProject: (projectId, id, patch) => {
    if (projectId === get().currentProjectId) { get().updateContractorAssignment(id, patch); return; }
    const key = `${projectId}_app_data`;
    const snap = loadFromStorage<Record<string, unknown>>(key, {});
    const list = Array.isArray(snap.contractorAssignments) ? snap.contractorAssignments as ContractorAssignment[] : [];
    const cur = list.find(a => a.id === id);
    if (!cur) return;
    noteForeignTask(projectId, id, cur);
    if (!cur.completedAt && patch.completedAt && !('days' in patch)) {
      const late = closeDayFields(cur, patch.completedAt);
      if (late) patch = { ...patch, ...late };
    }
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() } as ContractorAssignment;
    saveToStorage(key, { ...snap, contractorAssignments: list.map(a => (a.id === id ? next : a)) });
    // The other workspace's copy on this computer can be old: only the patch goes up.
    fsPatch(projectCollection(projectId, 'contractorAssignments'), id, cur, next);
    set(st => ({ snapshotTick: st.snapshotTick + 1 }));
  },
  deleteAssignmentInProject: (projectId, id) => {
    if (projectId === get().currentProjectId) { get().deleteContractorAssignment(id); return; }
    const key = `${projectId}_app_data`;
    const snap = loadFromStorage<Record<string, unknown>>(key, {});
    const list = Array.isArray(snap.contractorAssignments) ? snap.contractorAssignments as ContractorAssignment[] : [];
    noteForeignTask(projectId, id, list.find(a => a.id === id) ?? null);
    saveToStorage(key, { ...snap, contractorAssignments: list.filter(a => a.id !== id) });
    fsDelete(projectCollection(projectId, 'contractorAssignments'), id);
    set(st => ({ snapshotTick: st.snapshotTick + 1 }));
  },

  addContractorPhoto: (fields) => {
    const p: ContractorPhoto = { ...fields, id: generateId(), uploadedAt: new Date().toISOString() };
    set(state => ({
      contractorPhotos: [...state.contractorPhotos, p],
    }));
    persist(get);
    // Store metadata only in Firestore — dataUrl stays local
    fsSet(projectCollection(get().currentProjectId, 'contractorPhotos'), p.id, { ...p, dataUrl: '' });
    return p.id;
  },

  updateContractorPhoto: (id, changes) => {
    const was = get().contractorPhotos.find(x => x.id === id);
    set(state => ({
      contractorPhotos: state.contractorPhotos.map(p => p.id === id ? { ...p, ...changes } : p),
    }));
    persist(get);
    const updated = get().contractorPhotos.find(p => p.id === id);
    if (updated) fsPatch(projectCollection(get().currentProjectId, 'contractorPhotos'), id, was && { ...was, dataUrl: '' }, { ...updated, dataUrl: '' });
  },

  deleteContractorPhoto: (id) => {
    set(state => ({
      contractorPhotos: state.contractorPhotos.filter(p => p.id !== id),
    }));
    persist(get);
    fsDelete(projectCollection(get().currentProjectId, 'contractorPhotos'), id);
  },

  // ─── Backup / Restore ──────────────────────────────────────────────────────
  exportData: () => {
    const state = get();
    const snapshot = {
      exportedAt: new Date().toISOString(),
      version: DATA_VERSION,
      users: state.users,
      stages: state.stages,
      apartments: state.apartments,
      stageNotes: state.stageNotes,
      stageNoteVersions: state.stageNoteVersions,
      generalNoteVersions: state.generalNoteVersions,
      activityLogs: state.activityLogs,
      contractors: state.contractors,
      // Wages. Top level, next to apartments — the importer reads it there.
      employees: state.employees,
      timePunches: state.timePunches,
      timeClock: state.timeClock,
      workerLevels: state.workerLevels,
      stageSuggestions: state.stageSuggestions,
      contractorAssignments: state.contractorAssignments,
      contractorNotes: state.contractorNotes,
      contractorPhotos: state.contractorPhotos,
      officeNoteFiles: state.officeNoteFiles,
      // These five sit at the TOP LEVEL, next to apartments — not inside
      // `settings`. importData reads them from the top level, so nesting them
      // meant a backup carried them out and a restore never put them back.
      buildings: state.buildings,
      canvasElements: state.canvasElements,
      contractorSheetLinks: state.contractorSheetLinks,
      boardSettings: state.boardSettings,
      boardLayouts: state.boardLayouts,
      planPins: state.planPins,
      planAnnotations: state.planAnnotations,
      boardViews: state.boardViews,
      savedReports: state.savedReports,
      projectOrder: state.projectOrder,
      dashboardWidgetOrder: state.dashboardWidgetOrder,
      dashboardHiddenWidgets: state.dashboardHiddenWidgets,
      // The importer has always READ these two from the top level; the exporter
      // never wrote them. A restore therefore wiped every workspace made with
      // the project builder, and every workspace colour, without saying so.
      // Found by re-running the backup audit — which is why the audit exists.
      projectColors: state.projectColors,
      customProjects: state.customProjects,
      // The record of which backups have been taken. Small, and it is history.
      backupLogs: state.backupLogs,
      settings: {
        autoBackup: state.autoBackup,
        backupFrequency: state.backupFrequency,
        backupDriveFolderLink: state.backupDriveFolderLink,
        driveExportFrequency: state.driveExportFrequency,
        contractorUiStrings: state.contractorUiStrings,
        mainUiStrings: state.mainUiStrings,
      },
    };
    return JSON.stringify(snapshot, null, 2);
  },

  importData: (json) => {
    try {
      const data = JSON.parse(json);
      if (!data.apartments || !data.stages) {
        return { ok: false, error: 'Invalid backup file — missing required fields.' };
      }
      set(state => ({
        users: data.users ?? state.users,
        stages: data.stages,
        apartments: data.apartments,
        stageNotes: data.stageNotes ?? [],
        stageNoteVersions: data.stageNoteVersions ?? state.stageNoteVersions,
        generalNoteVersions: data.generalNoteVersions ?? [],
        activityLogs: data.activityLogs ?? [],
        contractors: data.contractors ?? [],
        // Current state as the fallback, never [] — restoring an older backup
        // must not be able to delete a month of clock-ins.
        employees: data.employees ?? state.employees,
        timePunches: data.timePunches ?? state.timePunches,
        timeClock: { ...DEFAULT_TIME_CLOCK, ...(data.timeClock ?? state.timeClock) },
        workerLevels: data.workerLevels ?? state.workerLevels,
        stageSuggestions: data.stageSuggestions ?? state.stageSuggestions,
        contractorAssignments: data.contractorAssignments ?? [],
        contractorNotes: data.contractorNotes ?? [],
        contractorPhotos: data.contractorPhotos ?? [],
        officeNoteFiles: data.officeNoteFiles ?? [],
        // Board notes/boxes and the sheet links were absent from restore, so a
        // backup taken today would silently lose them. Fall back to current
        // state rather than [] so an OLDER backup cannot wipe them either.
        canvasElements: data.canvasElements ?? state.canvasElements,
        contractorSheetLinks: data.contractorSheetLinks ?? state.contractorSheetLinks,
        boardSettings: data.boardSettings ?? state.boardSettings,
        boardLayouts: data.boardLayouts ?? state.boardLayouts,
        planPins: data.planPins ?? state.planPins,
        planAnnotations: data.planAnnotations ?? state.planAnnotations,
        boardViews: data.boardViews ?? state.boardViews,
        savedReports: data.savedReports ?? state.savedReports,
        projectOrder: data.projectOrder ?? state.projectOrder,
        projectColors: data.projectColors ?? state.projectColors,
        backupLogs: data.backupLogs ?? state.backupLogs,
        ...(data.customProjects ? {
          customProjects: data.customProjects as Project[],
          projects: [...DEFAULT_PROJECTS, ...(data.customProjects as Project[])],
        } : {}),
        // Building definitions and the dashboard layout were never restored, so
        // a project built in the builder came back without its buildings.
        buildings: data.buildings ?? state.buildings,
        dashboardWidgetOrder: data.dashboardWidgetOrder ?? state.dashboardWidgetOrder,
        dashboardHiddenWidgets: data.dashboardHiddenWidgets ?? state.dashboardHiddenWidgets,
        ...(data.settings ? {
          autoBackup: data.settings.autoBackup ?? state.autoBackup,
          backupFrequency: data.settings.backupFrequency ?? state.backupFrequency,
          backupDriveFolderLink: data.settings.backupDriveFolderLink ?? state.backupDriveFolderLink,
          driveExportFrequency: data.settings.driveExportFrequency ?? state.driveExportFrequency,
          contractorUiStrings: data.settings.contractorUiStrings ?? state.contractorUiStrings,
          mainUiStrings: data.settings.mainUiStrings ?? state.mainUiStrings,
        } : {}),
      }));
      persist(get);
      const summary: DataSummary = {
        apartments: (data.apartments as Apartment[]).filter(a => !a.isUnnamed).length,
        stages: (data.stages as Stage[]).filter(s => s.active).length,
        contractors: (data.contractors ?? []).filter((c: Contractor) => c.active).length,
        tasks: (data.contractorAssignments ?? []).length,
        completedTasks: (data.contractorAssignments ?? []).filter((a: ContractorAssignment) => !!a.completedAt).length,
        photos: (data.contractorPhotos ?? []).length,
        notes: (data.contractorNotes ?? []).length,
        activityLogs: (data.activityLogs ?? []).length,
      };
      return { ok: true, summary };
    } catch (e) {
      return { ok: false, error: 'Could not parse backup file.' };
    }
  },

  updateUser: (id, changes) => {
    const was = get().users.find(x => x.id === id);
    set(state => ({
      users: state.users.map(u => u.id === id ? { ...u, ...changes } : u),
      currentUser: state.currentUser?.id === id ? { ...state.currentUser, ...changes } : state.currentUser,
    }));
    persist(get);
    const updated = get().users.find(u => u.id === id);
    if (updated) fsPatch('users', id, was, updated);
  },

  addUser: (user) => {
    set(state => ({ users: [...state.users, user] }));
    persist(get);
    fsSet('users', user.id, user);
  },

  addActivityLog: (log) => {
    // A log line nobody can attribute is not a log line — and a nameless one
    // comes back from Firestore with the field GONE (fsSet turns undefined
    // into deleteField), which is one `.charAt` from a white screen on every
    // page that lists history. The readers guard too; this is the writer's half.
    const userName = log.userName || get().currentUser?.name || 'Office';
    const entry: ActivityLog = { ...log, userName, id: generateId(), createdAt: new Date().toISOString() };
    set(state => {
      const newLogs = [entry, ...state.activityLogs].slice(0, 500);
      // Somebody LOOKING at a job changes no data — a snapshot exists to
      // restore what a change overwrote, so an 'opened' entry never takes one.
      // Snapshot history is retired (owner, 2026-10-29): the full backups in
      // Drive hold every workspace, and they are what a restore uses.
      return { activityLogs: newLogs };
    });
    persist(get);
    fsSet(projectCollection(get().currentProjectId, 'activityLogs'), entry.id, entry);
  },

  setAutoBackup: (v) => {
    set({ autoBackup: v });
    persist(get);
    fsSet('settings', 'app', { autoBackup: v });
  },

  setBackupFrequency: (f) => {
    set({ backupFrequency: f });
    persist(get);
    fsSet('settings', 'app', { backupFrequency: f });
  },

  setBackupDriveFolder: (url) => {
    set({ backupDriveFolderLink: url });
    persist(get);
    fsSet('settings', 'app', { backupDriveFolderLink: url });
  },

  setDriveExportFrequency: (f) => {
    set({ driveExportFrequency: f });
    persist(get);
    fsSet('settings', 'app', { driveExportFrequency: f });
  },

  exportToDrive: async (opts?: { now?: boolean }) => {
    // The FULL backup — every workspace, every record — made on the server
    // from the cloud itself (lib/fullBackup.js). The old one-workspace files
    // are retired (owner, 2026-10-29). `now`: "Back up now" — read
    // everything, ignore the 20-minute gap.
    const key = (import.meta.env as Record<string, string>)['VITE_DRIVE_API_KEY'] ?? '';
    if (!get().backupDriveFolderLink || !key) return { ok: false, error: 'No Drive folder is set for backups' };
    const prevAt = get().lastDriveExportAt;
    const at = new Date().toISOString();
    // Claim the slot first, so the office's other computers do not all ask at once.
    set({ lastDriveExportAt: at });
    saveAppField('lastDriveExportAt', prevAt, at);
    try {
      const r = await fetch('/api/drive-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({
          mode: 'full-backup', now: !!opts?.now,
          projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
          apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || !out?.ok) return { ok: false, error: out?.error ?? `Drive answered ${r.status}` };
      if (out.file && !out.skipped) get().addBackupLog({ filename: out.file, sizeKB: out.sizeKB ?? 0, driveUploaded: true, triggeredBy: opts?.now ? 'manual' : 'scheduled' });
      return { ok: true, file: out.file as string | undefined, skipped: out.skipped as string | undefined };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  addBackupLog: (fields) => {
    const entry: BackupLogEntry = { ...fields, id: generateId(), createdAt: new Date().toISOString() };
    const prevLogs = get().backupLogs;
    set(state => ({ backupLogs: [entry, ...state.backupLogs].slice(0, 50) }));
    // Shared: every computer sees the same backup history.
    saveAppField('backupLogs', prevLogs, get().backupLogs);
    persist(get);
  },

  updateContractorUiStrings: (partial) => {
    const prevStrings = get().contractorUiStrings;
    set(state => ({ contractorUiStrings: { ...state.contractorUiStrings, ...partial } }));
    persist(get);
    saveAppField('contractorUiStrings', prevStrings, get().contractorUiStrings);
  },

  updateMainUiStrings: (s) => {
    // Words edited while reading Hebrew are the office's HEBREW wording; they
    // never land in the English set (and the other way round).
    if (s.isRtl && !_officeUi.isRtl) {
      const prevHe = _officeUiHe;
      const nextHe: Partial<MainUiStrings> = {};
      for (const k of Object.keys(s) as (keyof MainUiStrings)[]) {
        if (k !== 'isRtl' && s[k] !== HEBREW_MAIN_UI_STRINGS[k]) (nextHe as Record<string, unknown>)[k] = s[k];
      }
      _officeUiHe = nextHe;
      set({ mainUiStrings: effectiveUi() });
      persist(get);
      saveAppField('mainUiStringsHe', prevHe, nextHe);
      return;
    }
    const prevStrings = _officeUi;
    _officeUi = s;
    set({ mainUiStrings: effectiveUi() });
    persist(get);
    saveAppField('mainUiStrings', prevStrings, s);
  },
  uiLang: uiLangNow(),
  setUiLang: (lang) => {
    prefSet('ui_lang', lang);
    set({ uiLang: lang, mainUiStrings: effectiveUi() });
    try { document.documentElement.lang = lang; } catch { /* no document */ }
  },

  addOfficeNoteFile: (fields) => {
    const f: OfficeNoteFile = { ...fields, id: generateId(), uploadedAt: new Date().toISOString() };
    set(state => ({ officeNoteFiles: [...state.officeNoteFiles, f] }));
    persist(get);
    // dataUrl stays local; only metadata goes to Firestore
    fsSet(projectCollection(get().currentProjectId, 'officeNoteFiles'), f.id, { ...f, dataUrl: '' });
    return f.id;
  },

  updateOfficeNoteFile: (id, changes) => {
    const existing = get().officeNoteFiles.find(f => f.id === id);
    if (!existing) return;
    const next = { ...existing, ...changes };
    set(state => ({ officeNoteFiles: state.officeNoteFiles.map(f => (f.id === id ? next : f)) }));
    persist(get);
    fsPatch(projectCollection(get().currentProjectId, 'officeNoteFiles'), id, { ...existing, dataUrl: '' }, { ...next, dataUrl: '' });
  },

  appendApartmentNote: (apartmentId, text, user) => {
    const apt = get().apartments.find(a => a.id === apartmentId);
    if (!apt || !text.trim()) return;
    const now = new Date().toISOString();
    const legacy: StageNoteEntry[] = !apt.noteEntries && (apt.generalNotes ?? '').trim()
      ? [{ id: `${apt.id}-note-0`, text: apt.generalNotes, at: apt.updatedAt ?? now, by: apt.updatedBy ?? '', byName: apt.updatedByName ?? 'Office' }]
      : [];
    const entries = [...(apt.noteEntries ?? legacy), { id: generateId(), text: text.trim(), at: now, by: user.id, byName: user.name }];
    get().updateApartment(apartmentId, { noteEntries: entries, generalNotes: entries.map(e => e.text).join('\n') }, user);
  },

  removeApartmentNote: (apartmentId, entryId, user) => {
    const apt = get().apartments.find(a => a.id === apartmentId);
    if (!apt) return;
    const legacy: StageNoteEntry[] = !apt.noteEntries && (apt.generalNotes ?? '').trim()
      ? [{ id: `${apt.id}-note-0`, text: apt.generalNotes, at: apt.updatedAt ?? '', by: apt.updatedBy ?? '', byName: apt.updatedByName ?? 'Office' }]
      : [];
    const entries = (apt.noteEntries ?? legacy).filter(e => e.id !== entryId);
    get().updateApartment(apartmentId, { noteEntries: entries, generalNotes: entries.map(e => e.text).join('\n') }, user);
  },

  deleteOfficeNoteFile: (id) => {
    set(state => ({ officeNoteFiles: state.officeNoteFiles.filter(f => f.id !== id) }));
    persist(get);
    fsDelete(projectCollection(get().currentProjectId, 'officeNoteFiles'), id);
  },

  restoreFromSnapshot: (snapshotId) => {
    const snapshot = get().backupSnapshots.find(s => s.id === snapshotId);
    if (!snapshot) return;
    set(state => ({
      apartments: state.apartments.map(a => {
        const s = snapshot.apartmentStates.find(x => x.id === a.id);
        if (!s) return a;
        return { ...a, currentStageId: s.currentStageId, classification: s.classification as Apartment['classification'],
          generalNotes: s.generalNotes, driveLink: s.driveLink, plansPdfLink: s.plansPdfLink,
          displayName: s.displayName, mergedWith: s.mergedWith };
      }),
      stageNotes: snapshot.stageNotes,
      contractorAssignments: snapshot.contractorAssignments,
    }));
    persist(get);
  },

  getDataSummary: (): DataSummary => {
    const s = get();
    return {
      apartments: s.apartments.filter(a => !a.isUnnamed).length,
      stages: s.stages.filter(st => st.active).length,
      contractors: s.contractors.filter(c => c.active).length,
      tasks: s.contractorAssignments.length,
      completedTasks: s.contractorAssignments.filter(a => !!a.completedAt).length,
      photos: s.contractorPhotos.length,
      notes: s.contractorNotes.length,
      activityLogs: s.activityLogs.length,
    };
  },

  startFirebaseSync: async (opts) => {
    if (get().firebaseListening) {
      // A lean (portal) sync is upgraded to the full one when the office app
      // starts in the same tab; anything else is already running.
      if (!(_syncLean && !opts?.lean)) return;
      _firebaseUnsubscribers.forEach(u => u());
      _firebaseUnsubscribers = [];
    }
    set({ firebaseListening: true });
    try {

    // If Firebase env vars are present but db failed to initialize, surface that clearly
    if (isFirebaseConfigured && !db) {
      set({
        firebaseListening: false,
        firebaseSyncError: 'Firebase env vars are set but connection failed. Check browser console for [Firebase] logs to see which fields are missing.',
      });
      return;
    }

    // The collections. Per-project ones use the project-scoped name via col();
    // the GLOBAL collections (stages / users / contractors / settings) always
    // use the bare name, because every mutation action writes them bare.
    // Reading them through col() made adds in Netiv/General silently disappear.
    const pid = get().currentProjectId;
    const col = (base: string) => projectCollection(pid, base);
    const run = ++_syncRun;
    const stale = () => run !== _syncRun || get().currentProjectId !== pid;
    // The worker's phone never reads the activity log, the note versions, the
    // time clock or the office files — `lean` leaves those out of its load.
    const lean = !!opts?.lean;
    _syncLean = lean;
    // ── ONE listener per collection is also the load (fsAttach) ──────────────
    // The callbacks are the live path; they are held back (`release`) until the
    // merge-or-seed decision below has run on each collection's first answer.
    const none = (): Attached => ({ first: Promise.resolve([]), offline: () => false, release: () => {}, unsub: () => {} });
    const G = (name: string, cb: (docs: Record<string, unknown>[]) => void, recent?: { field: string; n: number }): Attached =>
      fsAttach(name, docs => { if (stale()) return; cb(docs); }, recent);
    const attached: Attached[] = [
      G(col('apartments'), (docs) => {
        if (docs.length === 0) return;
        const fbMap = new Map((docs as unknown as Apartment[]).map(a => [a.id, a]));
        set(state => {
          // A record the snapshot does not carry is KEPT — it may simply not be
          // uploaded yet. Unless it is tombstoned, in which case it is missing
          // because somebody deleted it, and keeping it is the resurrection bug.
          const updated = state.apartments
            .filter(a => !_tombstones.has(a.id))
            .map(a => (fbMap.get(a.id) as Apartment | undefined) ?? a);
          const localIds = new Set(state.apartments.map(a => a.id));
          (docs as unknown as Apartment[]).forEach(r => { if (!localIds.has(r.id)) updated.push(r as Apartment); });
          // Orphans from a past building rename must not stream back in
          return { apartments: scopeApartmentsToProject(pid, updated, state.buildings) };
        });
        persist(get);
      }),
      G(col('stageNotes'), (docs) => {
        if (docs.length > 0) { set({ stageNotes: docs as unknown as StageNote[] }); persist(get); }
      }),
      lean ? none() : G(col('stageNoteVersions'), (docs) => {
        if (docs.length > 0) { set({ stageNoteVersions: docs as unknown as StageNoteVersion[] }); persist(get); }
      }, { field: 'savedAt', n: 200 }),
      lean ? none() : G(col('generalNoteVersions'), (docs) => {
        if (docs.length > 0) { set({ generalNoteVersions: docs as unknown as GeneralNoteVersion[] }); persist(get); }
      }, { field: 'savedAt', n: 200 }),
      lean ? none() : G(col('activityLogs'), (docs) => {
        if (docs.length > 0) {
          const sorted = (docs as unknown as ActivityLog[])
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 200);
          set({ activityLogs: sorted }); persist(get);
        }
      }, { field: 'createdAt', n: 200 }),
      G('contractors', (docs) => {
        if (docs.length > 0) { set({ contractors: docs as unknown as Contractor[] }); persist(get); }
      }),
      // Bare, like every other global collection. A tap on the wall panel has
      // to show up on the office machine within the second, which is the whole
      // reason the board is worth having.
      lean ? none() : G('employees', (docs) => {
        if (docs.length > 0) { set({ employees: docs as unknown as Employee[] }); persist(get); }
      }),
      lean ? none() : G('timePunches', (docs) => {
        if (docs.length > 0) { set({ timePunches: docs as unknown as TimePunch[] }); persist(get); }
      }),
      G('stageSuggestions', (docs) => {
        set({ stageSuggestions: (docs as unknown as StageSuggestion[]).sort((a, b) => (b.at > a.at ? 1 : -1)) });
        persist(get);
      }),
      G('workerLevels', (docs) => {
        if (docs.length > 0) { set({ workerLevels: docs as unknown as WorkerLevel[] }); persist(get); }
      }),
      G(col('contractorAssignments'), (docs) => {
        const localA = get().contractorAssignments;
        const merged = (docs as unknown as ContractorAssignment[]).map(fbA => {
          const local = localA.find(a => a.id === fbA.id);
          return {
            ...fbA,
            attachments: fbA.attachments?.map((att, i) => ({
              ...att,
              dataUrl: local?.attachments?.[i]?.dataUrl ?? '',
            })),
          };
        });
        set({ contractorAssignments: merged }); persist(get);
      }),
      G(col('contractorNotes'), (docs) => {
        if (docs.length > 0) { set({ contractorNotes: docs as unknown as ContractorNote[] }); persist(get); }
      }),
      G(col('contractorPhotos'), (docs) => {
        const localP = get().contractorPhotos;
        const merged = (docs as unknown as ContractorPhoto[]).map(fbP => {
          const local = localP.find(p => p.id === fbP.id);
          return { ...fbP, dataUrl: fbP.driveUrl ? '' : (local?.dataUrl ?? '') };
        });
        set({ contractorPhotos: merged }); persist(get);
      }),
      lean ? none() : G(col('officeNoteFiles'), (docs) => {
        const localF = get().officeNoteFiles;
        const merged = (docs as unknown as OfficeNoteFile[]).map(fbF => {
          const local = localF.find(f => f.id === fbF.id);
          return { ...fbF, dataUrl: local?.dataUrl ?? '' };
        });
        set({ officeNoteFiles: merged }); persist(get);
      }),
      G(col('canvasElements'), (docs) => {
        set({ canvasElements: (docs as unknown as CanvasElement[]).filter(e => !_tombstones.has(e.id)) });
        persist(get);
      }),
      G(col('planPins'), (docs) => {
        set({ planPins: docs as unknown as PlanPin[] });
        persist(get);
      }),
      G(col('planAnnotations'), (docs) => {
        set({ planAnnotations: docs as unknown as PlanAnnotation[] });
        persist(get);
      }),
      G('stages', (docs) => {
        if (docs.length > 0) { set({ stages: docs as unknown as Stage[] }); persist(get); }
      }),
      G('users', (docs) => {
        if (docs.length > 0) { set({ users: docs as unknown as User[] }); persist(get); }
      }),
      G('settings', (docs) => {
        const appS = (docs.find(d => (d as Record<string,unknown>).id === 'app') ?? {}) as Record<string, unknown>;
        set(state => ({
          ...(appS.backupFrequency      ? { backupFrequency:      appS.backupFrequency as BackupFrequency }      : {}),
          ...(appS.backupDriveFolderLink !== undefined ? { backupDriveFolderLink: appS.backupDriveFolderLink as string } : {}),
          ...(appS.contractorUiStrings  ? { contractorUiStrings:  appS.contractorUiStrings as ContractorUiStrings } : {}),
          ...(appS.autoBackup           !== undefined ? { autoBackup: appS.autoBackup as boolean } : {}),
          ...(appS.mainUiStrings || appS.mainUiStringsHe ? { mainUiStrings: mergeFreshMainUi(appS.mainUiStrings as Partial<MainUiStrings> | undefined, appS.mainUiStringsHe as Partial<MainUiStrings> | undefined) } : {}),
          ...(appS.contractorSheetLinks ? { contractorSheetLinks: appS.contractorSheetLinks as Record<string, string> } : {}),
          ...(appS.boardSettings ? { boardSettings: appS.boardSettings as Record<string, BoardSetting> } : {}),
          // A workspace made in the app: its buildings come from the cloud on a new computer.
          ...(!state.buildings.length && (appS.boardSettings as Record<string, BoardSetting> | undefined)?.[pid]?.buildings?.length
            ? { buildings: (appS.boardSettings as Record<string, BoardSetting>)[pid].buildings as Building[] } : {}),
          ...(appS.timeClock ? { timeClock: { ...DEFAULT_TIME_CLOCK, ...(appS.timeClock as Partial<TimeClockSettings>) } } : {}),
          ...(appS.boardViews ? { boardViews: appS.boardViews as BoardView[] } : {}),
          ...(appS.savedReports ? { savedReports: appS.savedReports as Record<string, ReportDef[]> } : {}),
          ...(appS.projectOrder ? { projectOrder: appS.projectOrder as string[] } : {}),
          ...(appS.customProjects ? {
            customProjects: appS.customProjects as Project[],
            projects: [...DEFAULT_PROJECTS, ...(appS.customProjects as Project[])],
          } : {}),
          ...(appS.projectColors ? {
            projectColors: appS.projectColors as Record<string, string>,
            projects: get().projects.map(p => ({
              ...p, color: (appS.projectColors as Record<string, string>)[p.id] ?? p.color })),
          } : {}),
          ...(appS.driveExportFrequency ? { driveExportFrequency: appS.driveExportFrequency as DriveExportFrequency } : {}),
          ...(Array.isArray(appS.backupLogs) ? { backupLogs: appS.backupLogs as BackupLogEntry[] } : {}),
          ...(typeof appS.fullBackupEvery === 'string' ? { fullBackupEvery: appS.fullBackupEvery as FullBackupEvery } : {}),
          ...(typeof appS.lastDriveExportAt === 'string' && appS.lastDriveExportAt > (state.lastDriveExportAt ?? '') ? { lastDriveExportAt: appS.lastDriveExportAt } : {}),
        }));
        persist(get);
      }),
      // Saved board arrangements — in the cloud since 2026-10-29. A computer
      // that kept some before then hands them up once, while the cloud has none.
      lean ? none() : G(col('boardLayouts'), (docs) => {
        const cloud = (docs as unknown as BoardLayout[]).sort((a, b) => (b.at > a.at ? 1 : -1));
        const local = get().boardLayouts[pid] ?? [];
        if (!cloud.length && local.length) {
          fsBatchCreate(col('boardLayouts'), local.map(l => ({ id: l.id, data: l })));
          return;
        }
        set(st => ({ boardLayouts: { ...st.boardLayouts, [pid]: cloud } }));
        persist(get);
      }),
    ];
    const [
      fbApts, fbStageNotes, fbStageNoteVersions, fbGeneralNoteVersions, fbLogs,
      fbContractors, fbEmployees, fbPunches, fbLevels,
      fbAssignments, fbNotes, fbPhotos, fbOfficeFiles, fbCanvasElements,
      fbPlanPins, fbPlanAnnotations, fbStages, fbUsers, fbSettings,
    ] = await Promise.all(attached.map(a => a.first));
    const bail = () => { attached.forEach(a => a.unsub()); };
    if (stale()) { bail(); return; }
    // No word from the server on the collections that decide seeding: an
    // offline tab used to read an empty answer as an EMPTY CLOUD and push its
    // localStorage up as the first-run seed. It merges nothing and seeds
    // nothing now; the listeners stay attached and deliver when the line is back.
    const offline = attached[0].offline() || attached[9].offline() || attached[1].offline();

    // What this workspace has deleted on purpose. Read BEFORE anything is
    // pushed up: a record this device still holds locally but the cloud has
    // buried must be dropped here, or the "seed anything missing" step below
    // resurrects it — the reason a removed import kept reappearing.
    _tombstones = await fsGetTombstones(pid);
    if (stale()) { bail(); return; }
    if (_tombstones.size > 0) {
      const before = get();
      const apts = before.apartments.filter(a => !_tombstones.has(a.id));
      const els  = before.canvasElements.filter(e => !_tombstones.has(e.id));
      if (apts.length !== before.apartments.length || els.length !== before.canvasElements.length) {
        set({ apartments: apts, canvasElements: els });
        persist(get);
      }
    }

    // Only PROJECT-scoped signals decide whether this project has already been seeded.
    // The global collections (stages/users/contractors) are shared, so they are
    // non-empty as soon as any project has synced and would mask a brand-new project.
    const hasFirebaseData = fbApts.length > 0 || fbAssignments.length > 0 || fbStageNotes.length > 0;

    if (offline) {
      console.warn('[Firebase] no answer from the server on load — nothing merged, nothing seeded');
    } else if (hasFirebaseData) {
      const localPhotos = get().contractorPhotos;
      const localFiles = get().officeNoteFiles;
      const localAssignments = get().contractorAssignments;

      // Merge: restore local dataUrl for binary fields Firestore doesn't store
      const mergedPhotos = (fbPhotos as unknown as ContractorPhoto[]).map(fbP => {
        const local = localPhotos.find(p => p.id === fbP.id);
        return { ...fbP, dataUrl: fbP.driveUrl ? '' : (local?.dataUrl ?? '') };
      });
      const mergedFiles = (fbOfficeFiles as unknown as OfficeNoteFile[]).map(fbF => {
        const local = localFiles.find(f => f.id === fbF.id);
        return { ...fbF, dataUrl: local?.dataUrl ?? '' };
      });
      const mergedAssignments = (fbAssignments as unknown as ContractorAssignment[]).map(fbA => {
        const local = localAssignments.find(a => a.id === fbA.id);
        return {
          ...fbA,
          attachments: fbA.attachments?.map((att, i) => ({
            ...att,
            dataUrl: local?.attachments?.[i]?.dataUrl ?? '',
          })),
        };
      });

      const appSettings = (fbSettings.find(s => (s as Record<string,unknown>).id === 'app') ?? {}) as Record<string, unknown>;

      // Helper: merge two arrays by id, Firebase wins for any item that exists remotely
      function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
        const remoteMap = new Map(remote.map(r => [r.id, r]));
        const merged = local.map(a => (remoteMap.get(a.id) as T | undefined) ?? a);
        remote.forEach(r => { if (!local.find(a => a.id === r.id)) merged.push(r); });
        return merged;
      }

      keepMarksRescue(pid, get().apartments, fbApts as unknown as Apartment[]);
      set(state => ({
        apartments:            scopeApartmentsToProject(pid, mergeById(state.apartments, fbApts as unknown as Apartment[]), state.buildings),
        stageNotes:            fbStageNotes.length > 0  ? (fbStageNotes as unknown as StageNote[]) : state.stageNotes,
        stages:                fbStages.length > 0      ? (fbStages as unknown as Stage[])     : state.stages,
        users:                 fbUsers.length > 0       ? (fbUsers as unknown as User[])       : state.users,
        activityLogs:          fbLogs.length > 0
          ? (fbLogs as unknown as ActivityLog[]).sort((a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 500)
          : state.activityLogs,
        contractors:           fbContractors.length > 0 ? (fbContractors as unknown as Contractor[]) : state.contractors,
        contractorAssignments: mergedAssignments.length > 0 ? mergedAssignments : state.contractorAssignments,
        contractorNotes:       fbNotes.length > 0       ? (fbNotes as unknown as ContractorNote[]) : state.contractorNotes,
        contractorPhotos:      mergedPhotos.length > 0  ? mergedPhotos : state.contractorPhotos,
        officeNoteFiles:       mergedFiles.length > 0   ? mergedFiles  : state.officeNoteFiles,
        stageNoteVersions:     fbStageNoteVersions.length > 0 ? (fbStageNoteVersions as unknown as StageNoteVersion[]) : state.stageNoteVersions,
        generalNoteVersions:   fbGeneralNoteVersions.length > 0 ? (fbGeneralNoteVersions as unknown as GeneralNoteVersion[]) : state.generalNoteVersions,
        canvasElements:        fbCanvasElements.length > 0 ? (fbCanvasElements as unknown as CanvasElement[]) : state.canvasElements,
        planPins:              fbPlanPins.length > 0 ? (fbPlanPins as unknown as PlanPin[]) : state.planPins,
        planAnnotations:       fbPlanAnnotations.length > 0 ? (fbPlanAnnotations as unknown as PlanAnnotation[]) : state.planAnnotations,
        employees:             fbEmployees.length > 0 ? (fbEmployees as unknown as Employee[]) : state.employees,
        timePunches:           fbPunches.length > 0 ? (fbPunches as unknown as TimePunch[]) : state.timePunches,
        workerLevels:          fbLevels.length > 0 ? (fbLevels as unknown as WorkerLevel[]) : state.workerLevels,
        ...(appSettings.backupFrequency      ? { backupFrequency:      appSettings.backupFrequency as BackupFrequency }      : {}),
        ...(appSettings.backupDriveFolderLink !== undefined ? { backupDriveFolderLink: appSettings.backupDriveFolderLink as string } : {}),
        ...(appSettings.contractorUiStrings  ? { contractorUiStrings:  appSettings.contractorUiStrings as ContractorUiStrings } : {}),
        ...(appSettings.autoBackup           !== undefined ? { autoBackup: appSettings.autoBackup as boolean } : {}),
        ...(appSettings.mainUiStrings || appSettings.mainUiStringsHe ? { mainUiStrings: mergeFreshMainUi(appSettings.mainUiStrings as Partial<MainUiStrings> | undefined, appSettings.mainUiStringsHe as Partial<MainUiStrings> | undefined) } : {}),
        ...(appSettings.contractorSheetLinks ? { contractorSheetLinks: appSettings.contractorSheetLinks as Record<string, string> } : {}),
        ...(appSettings.boardViews ? { boardViews: appSettings.boardViews as BoardView[] } : {}),
        ...(appSettings.driveExportFrequency ? { driveExportFrequency: appSettings.driveExportFrequency as DriveExportFrequency } : {}),
        ...(Array.isArray(appSettings.backupLogs) ? { backupLogs: appSettings.backupLogs as BackupLogEntry[] } : {}),
        ...(typeof appSettings.fullBackupEvery === 'string' ? { fullBackupEvery: appSettings.fullBackupEvery as FullBackupEvery } : {}),
        ...(typeof appSettings.lastDriveExportAt === 'string' && appSettings.lastDriveExportAt > (state.lastDriveExportAt ?? '') ? { lastDriveExportAt: appSettings.lastDriveExportAt } : {}),
        ...(appSettings.savedReports ? { savedReports: appSettings.savedReports as Record<string, ReportDef[]> } : {}),
        ...(appSettings.projectOrder ? { projectOrder: appSettings.projectOrder as string[] } : {}),
        ...(appSettings.boardSettings ? { boardSettings: appSettings.boardSettings as Record<string, BoardSetting> } : {}),
        ...(!state.buildings.length && (appSettings.boardSettings as Record<string, BoardSetting> | undefined)?.[pid]?.buildings?.length
          ? { buildings: (appSettings.boardSettings as Record<string, BoardSetting>)[pid].buildings as Building[] } : {}),
        ...(appSettings.timeClock ? { timeClock: { ...DEFAULT_TIME_CLOCK, ...(appSettings.timeClock as Partial<TimeClockSettings>) } } : {}),
        ...(appSettings.customProjects ? {
          customProjects: appSettings.customProjects as Project[],
          projects: [...DEFAULT_PROJECTS, ...(appSettings.customProjects as Project[])],
        } : {}),
        ...(appSettings.projectColors ? {
          projectColors: appSettings.projectColors as Record<string, string>,
          projects: state.projects.map(p => ({
            ...p, color: (appSettings.projectColors as Record<string, string>)[p.id] ?? p.color })),
        } : {}),
      }));
      persist(get);

      // Netiv duplex floor correction: recompute floors from apt number and push any
      // changed records to Firestore so the fix wins against the "Firebase wins" listener.
      if (pid === 'netiv') {
        const preNetiv = new Map(get().apartments.map(a => [a.id, a]));
        const { apts: migratedNetiv, changed: netivChanged } = migrateNetivApartments(get().apartments);
        if (netivChanged.length > 0) {
          set({ apartments: migratedNetiv });
          persist(get);
          // The corrected fields only; never a deletion, never a new record.
          fsBatchPatch(col('apartments'), netivChanged.map(a => ({ id: a.id, before: preNetiv.get(a.id), after: a })), { noDeletes: true, noCreate: true });
        }
      }

      set({ cloudSyncedProject: pid });
      void loadUndoFromCloud(pid);

      // Seed any apartments that are missing from Firestore (in case the first-run seed was partial).
      // Anything tombstoned is missing BECAUSE it was deleted, and must stay gone.
      const fbAptIds = new Set((fbApts as unknown as Apartment[]).map(a => a.id));
      const missingApts = get().apartments.filter(a => !fbAptIds.has(a.id) && !_tombstones.has(a.id) && ownsRecord(pid, a, get().buildings));
      if (missingApts.length > 0) {
        fsBatchCreate(col('apartments'), missingApts.map(a => ({ id: a.id, data: a })));
      }

      // Board notes and boxes were localStorage-only until now, so a device that
      // already has them must push them up rather than silently lose them.
      const fbElIds = new Set((fbCanvasElements as unknown as CanvasElement[]).map(e => e.id));
      const missingEls = get().canvasElements.filter(e => !fbElIds.has(e.id) && !_tombstones.has(e.id));
      if (missingEls.length > 0) {
        fsBatchCreate(col('canvasElements'), missingEls.map(e => ({ id: e.id, data: e })));
      }
    } else {
      // First run of THIS WORKSPACE — push its records up, CREATE-ONLY: a
      // record the cloud already has is never overwritten by this computer's
      // copy (fsBatchCreate), even if this computer misjudged the cloud as empty. The GLOBAL
      // collections (stages, users, workers, levels, the time clock, the app
      // settings) are shared by every workspace and are pushed only when the
      // cloud holds none of them: an empty new workspace once pushed a device's
      // built-in stage list over the office's real one (2026-10-18) and
      // brought four retired stages back as duplicates.
      const state = get();
      const appDocThere = fbSettings.some(s => (s as Record<string, unknown>).id === 'app');
      await Promise.all([
        fsBatchCreate(col('apartments'),  state.apartments.filter(a => ownsRecord(pid, a, state.buildings)).map(a => ({ id: a.id, data: a }))),
        fbStages.length === 0 ? fsBatchCreate('stages', state.stages.map(s => ({ id: s.id, data: s }))) : Promise.resolve(),
        fbUsers.length === 0 ? fsBatchCreate('users', state.users.map(u => ({ id: u.id, data: u }))) : Promise.resolve(),
        state.stageNotes.length > 0
          ? fsBatchCreate(col('stageNotes'), state.stageNotes.map(n => ({ id: n.id, data: n })))
          : Promise.resolve(),
        state.contractors.length > 0 && fbContractors.length === 0
          ? fsBatchCreate('contractors', state.contractors.map(c => ({ id: c.id, data: c })))
          : Promise.resolve(),
        state.contractorAssignments.length > 0
          ? fsBatchCreate(col('contractorAssignments'), state.contractorAssignments.map(a => ({
              id: a.id,
              data: { ...a, attachments: a.attachments?.map(att => ({ ...att, dataUrl: '' })) },
            })))
          : Promise.resolve(),
        state.contractorNotes.length > 0
          ? fsBatchCreate(col('contractorNotes'), state.contractorNotes.map(n => ({ id: n.id, data: n })))
          : Promise.resolve(),
        state.contractorPhotos.length > 0
          ? fsBatchCreate(col('contractorPhotos'), state.contractorPhotos.map(p => ({ id: p.id, data: { ...p, dataUrl: '' } })))
          : Promise.resolve(),
        state.officeNoteFiles.length > 0
          ? fsBatchCreate(col('officeNoteFiles'), state.officeNoteFiles.map(f => ({ id: f.id, data: { ...f, dataUrl: '' } })))
          : Promise.resolve(),
        state.canvasElements.length > 0
          ? fsBatchCreate(col('canvasElements'), state.canvasElements.map(e => ({ id: e.id, data: e })))
          : Promise.resolve(),
        state.planPins.length > 0
          ? fsBatchCreate(col('planPins'), state.planPins.map(p => ({ id: p.id, data: p })))
          : Promise.resolve(),
        state.planAnnotations.length > 0
          ? fsBatchCreate(col('planAnnotations'), state.planAnnotations.map(a => ({ id: a.id, data: a })))
          : Promise.resolve(),
        state.employees.length > 0 && fbEmployees.length === 0
          ? fsBatchCreate('employees', state.employees.map(e => ({ id: e.id, data: e })))
          : Promise.resolve(),
        state.timePunches.length > 0 && fbPunches.length === 0
          ? fsBatchCreate('timePunches', state.timePunches.map(pch => ({ id: pch.id, data: pch })))
          : Promise.resolve(),
        fbLevels.length === 0 ? fsBatchCreate('workerLevels', state.workerLevels.map(l => ({ id: l.id, data: l }))) : Promise.resolve(),
        appDocThere ? Promise.resolve() : fsBatchCreate('settings', [{ id: 'app', data: {
          autoBackup:            state.autoBackup,
          backupFrequency:       state.backupFrequency,
          backupDriveFolderLink: state.backupDriveFolderLink,
          contractorUiStrings:   state.contractorUiStrings,
          mainUiStrings:         state.mainUiStrings,
          timeClock:             state.timeClock,
        } }]),
      ]);
    }

    // The live path takes over: every unsubscribe kept so logout() and a
    // workspace switch can cancel it, then each collection's latest answer
    // is replayed once through its callback (what the old listener's first
    // answer used to do).
    if (stale()) { bail(); return; }
    _firebaseUnsubscribers = [
      ...attached.map(a => a.unsub),
      // A delete on one device reaches the others through here. Without it the
      // TV and the phones would each keep showing what the office removed until
      // their next reload.
      fsListenTombstones(pid, (ids) => {
        if (ids.size === 0) return;
        _tombstones = ids;
        const st = get();
        const apts = st.apartments.filter(a => !ids.has(a.id));
        const els  = st.canvasElements.filter(e => !ids.has(e.id));
        if (apts.length !== st.apartments.length || els.length !== st.canvasElements.length) {
          set({ apartments: apts, canvasElements: els });
          persist(get);
        }
      }),
    ];
    attached.forEach(a => a.release());
    set({ firebaseSyncError: null });

    // Drive auto-export scheduler — checks every 5 minutes, runs immediately on login
    const DRIVE_THRESHOLDS: Record<string, number> = {
      off: 0, hourly: 3_600_000, every5h: 18_000_000, every12h: 43_200_000, daily: 86_400_000, weekly: 604_800_000,
    };
    // The FULL backup (lib/fullBackup.js) during the day, as often as
    // Settings → Backups says; the night one runs on the server regardless.
    // One shared clock (lastDriveExportAt in settings/app) for every computer.
    void DRIVE_THRESHOLDS;
    const FULL_EVERY: Record<FullBackupEvery, number> = { activity: 20 * 60_000, hourly: 3_600_000, every4h: 4 * 3_600_000, night: 0 };
    function checkDriveExport() {
      const { fullBackupEvery, lastDriveExportAt, backupDriveFolderLink } = get();
      const threshold = FULL_EVERY[fullBackupEvery] ?? 0;
      if (!threshold || !backupDriveFolderLink) return;
      const last = lastDriveExportAt ? new Date(lastDriveExportAt).getTime() : 0;
      if (Date.now() - last >= threshold) void get().exportToDrive();
    }
    checkDriveExport();
    const driveTimer = setInterval(checkDriveExport, 5 * 60 * 1000);
    _firebaseUnsubscribers.push(() => clearInterval(driveTimer));

    } catch (e) {
      console.error('[wolfson] Firebase sync failed:', e);
      set({ firebaseListening: false, firebaseSyncError: 'Cloud sync is offline — changes are saved locally only. Check Firebase Console → Firestore → Rules.' });
    }
  },

  applyFirebaseData: (data) => {
    set(data);
    persist(get);
  },
}));

/**
 * The actions that put THEMSELVES on the undo stack, whichever screen calls
 * them (owner, 2026-10-15: "if I add a task, undo. If I delete something,
 * undo"). Each is wrapped once, here, in `trackUndo(null, …)`, so a new button
 * that adds or deletes a task is undoable without anybody remembering to say
 * so. A caller that wants its own words (or several writes as ONE step) wraps
 * its writes in `trackUndo` / `useBoardTrack` — nesting makes the inner
 * recordings part of its step.
 *
 * Deliberately NOT here: `updateApartment` (migrations, sweeps and auto-fills
 * call it constantly — screens wrap their own edits), the transcript writers
 * (`updateContractorNote`, `updateOfficeNoteFile`) and `addContractorPhoto`
 * (uploads), none of which is a person's deliberate change.
 */
const SELF_RECORDING = [
  'addContractorAssignment', 'updateContractorAssignment', 'deleteContractorAssignment',
  'addAssignmentToProject', 'updateAssignmentInProject', 'deleteAssignmentInProject',
  'moveTaskToApartment', 'setApartmentMarks', 'bulkUpdateApartments',
  'appendApartmentNote', 'removeApartmentNote',
  'appendStageNoteEntry', 'setStageNoteEntryVisibility',
  'addContractorNote', 'deleteContractorNote', 'deleteContractorPhoto',
  'addOfficeNoteFile', 'deleteOfficeNoteFile',
] as const satisfies ReadonlyArray<keyof AppState>;
{
  const st = useStore.getState() as unknown as Record<string, (...args: unknown[]) => unknown>;
  useStore.setState(Object.fromEntries(SELF_RECORDING.map(name => {
    const inner = st[name];
    return [name, (...args: unknown[]) => trackUndo(null, () => inner(...args))];
  })) as Partial<AppState>);
}

/**
 * Debounced localStorage write.
 *
 * persistNow() serialises the WHOLE project — every apartment, all photo
 * metadata, notes and activity logs. It is called from 60+ mutations, including
 * some that fire per pointermove (box resize), which made dragging serialise the
 * entire app on every animation frame.
 *
 * Writes are therefore coalesced onto a trailing timer. To make that safe, any
 * pending write is FLUSHED SYNCHRONOUSLY when the page is hidden or unloaded, so
 * closing the tab mid-edit can never lose the last change.
 */
let _persistTimer: ReturnType<typeof setTimeout> | null = null;
let _persistGet: (() => AppState) | null = null;
let _flushBound = false;

export function flushPersist() {
  if (_persistTimer !== null) {
    clearTimeout(_persistTimer);
    _persistTimer = null;
  }
  if (_persistGet) persistNow(_persistGet);
}

function persist(get: () => AppState) {
  _persistGet = get;
  if (!_flushBound && typeof window !== 'undefined') {
    _flushBound = true;
    // pagehide covers mobile Safari, where beforeunload is unreliable
    window.addEventListener('pagehide', flushPersist);
    window.addEventListener('beforeunload', flushPersist);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushPersist();
    });
  }
  if (_persistTimer !== null) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    if (_persistGet) persistNow(_persistGet);
  }, 250);
}

function persistNow(get: () => AppState) {
  const state = get();
  const storageKey = getProjectStorageKey(state.currentProjectId);

  // Strip base64 from photos already on Drive (driveUrl is the source of truth)
  const photosLean = state.contractorPhotos.map(p =>
    p.driveUrl ? { ...p, dataUrl: '' } : p
  );

  const payload = {
    currentUser: state.currentUser,
    users: state.users,
    stages: state.stages,
    buildings: state.buildings,
    apartments: state.apartments,
    stageNotes: state.stageNotes,
    stageNoteVersions: state.stageNoteVersions.slice(0, 200),
    activityLogs: state.activityLogs.slice(0, 200),
    contractors: state.contractors,
    employees: state.employees,
    timePunches: state.timePunches,
    timeClock: state.timeClock,
    workerLevels: state.workerLevels,
    stageSuggestions: state.stageSuggestions,
    contractorAssignments: state.contractorAssignments,
    contractorNotes: state.contractorNotes,
    contractorPhotos: photosLean,
    officeNoteFiles: state.officeNoteFiles,
    googleClientId: state.googleClientId,
    autoBackup: state.autoBackup,
    backupFrequency: state.backupFrequency,
    lastAutoBackupAt: state.lastAutoBackupAt,
    backupSnapshots: state.backupSnapshots.slice(0, 5),
    backupLogs: state.backupLogs.slice(0, 50),
    backupDriveFolderLink: state.backupDriveFolderLink,
    driveExportFrequency: state.driveExportFrequency,
    lastDriveExportAt: state.lastDriveExportAt,
    fullBackupEvery: state.fullBackupEvery,
    contractorUiStrings: state.contractorUiStrings,
    mainUiStrings: state.mainUiStrings,
    generalNoteVersions: state.generalNoteVersions.slice(0, 200),
    dashboardWidgetOrder: state.dashboardWidgetOrder,
    dashboardHiddenWidgets: state.dashboardHiddenWidgets,
    canvasElements: state.canvasElements,
    contractorSheetLinks: state.contractorSheetLinks,
    boardSettings: state.boardSettings,
    boardLayouts: state.boardLayouts,
    planPins: state.planPins,
    planAnnotations: state.planAnnotations,
    boardViews: state.boardViews,
    savedReports: state.savedReports,
    projectOrder: state.projectOrder,
    projectColors: state.projectColors,
    customProjects: state.customProjects,
  };

  const ok = saveToStorage(storageKey, payload);
  if (!ok) {
    // Quota still exceeded — strip all binary data and try again
    saveToStorage(storageKey, {
      ...payload,
      contractorPhotos: state.contractorPhotos.map(p => ({ ...p, dataUrl: '' })),
      officeNoteFiles: state.officeNoteFiles.map(f => ({ ...f, dataUrl: '' })),
      backupSnapshots: [],
      activityLogs: state.activityLogs.slice(0, 50),
    });
  }
}

/**
 * A harness door, DEV builds only: the probes reach the store to inject an
 * arrival (a task written into another workspace's snapshot) without a
 * Firestore to carry it — the presence layer's `__injectPresence` idiom.
 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __store?: typeof useStore }).__store = useStore;
}

// Personal choices follow whoever is signed in on this computer (prefs.ts).
if (typeof window !== 'undefined') {
  const who = (st: AppState) => (st.currentUser ? `u:${st.currentUser.id}` : null);
  setPrefsPerson(who(useStore.getState()));
  useStore.subscribe(st => setPrefsPerson(who(st)));
  // A new computer: the person's theme and board arrive from the cloud a
  // moment after sign-in.
  onPrefsChange(() => {
    const st = useStore.getState();
    // The person's language arrives from the cloud on a new computer.
    const lang = uiLangNow();
    if (lang !== st.uiLang) useStore.setState({ uiLang: lang, mainUiStrings: effectiveUi() });
    const light = prefGet(THEME_KEY) !== 'dark';
    const view = prefGet('active_board_view') ?? '';
    if (light !== st.lightTheme) useStore.setState({ lightTheme: light });
    if (view !== st.activeBoardView) useStore.setState({ activeBoardView: view });
  });
}

/**
 * The person's undo list for this workspace, from the cloud (undoCloud.ts) —
 * after a reload, a workspace switch or on another computer. Steps taken in
 * the moment before it arrived stay, newest last.
 */
async function loadUndoFromCloud(pid: string) {
  const owner = prefsPerson();
  if (!owner) return;
  try {
    const cloud = await loadSteps(owner, pid, sides => ({
      undo: () => applyUndoSides(sides.before as UndoSides, sides.after as UndoSides),
      redo: () => applyUndoSides(sides.after as UndoSides, sides.before as UndoSides),
    }));
    const st = useStore.getState();
    if (st.currentProjectId !== pid) return;
    const have = new Set([...st.undoState.past, ...st.undoState.future].map(e => e.id));
    useStore.setState({ undoState: {
      past: [...cloud.past.filter(e => !have.has(e.id)), ...st.undoState.past],
      future: [...cloud.future.filter(e => !have.has(e.id)), ...st.undoState.future],
    } });
  } catch (e) {
    console.warn('undo list could not be read from the cloud:', e);
  }
}

/**
 * Has THIS workspace's data arrived from the cloud? Every automatic writer —
 * an effect, a timer, a repair, nothing a person clicked — waits for this, so
 * nothing is ever decided on the copy a tab starts with (2026-10-29: a new
 * browser's starter copy wrote empty progress over every Wolfson flat).
 */
export function cloudReady(): boolean {
  const st = useStore.getState();
  return !isFirebaseConfigured || st.cloudSyncedProject === st.currentProjectId;
}
/** cloudReady as a hook, so an effect re-runs the moment the data lands. */
export function useCloudReady(): boolean {
  return useStore(st => !isFirebaseConfigured || st.cloudSyncedProject === st.currentProjectId);
}
