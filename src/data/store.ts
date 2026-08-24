import {
  UndoState, UndoEntry, emptyUndo, remember, popUndo, popRedo,
} from './undo';
import { create } from 'zustand';
import { Apartment, CanvasElement, ActivityLog, Project, Stage, StageNote, StageNoteAttachment, StageNoteVersion, GeneralNoteVersion, User, Building, Contractor, ContractorAssignment, ContractorNote, ContractorPhoto, BackupSnapshot, DataSummary, OfficeNoteFile, BackupFrequency, DriveExportFrequency, BackupLogEntry, ContractorUiStrings, DEFAULT_CONTRACTOR_UI_STRINGS, MainUiStrings, DEFAULT_MAIN_UI_STRINGS, HEBREW_MAIN_UI_STRINGS, BoardSetting, BoardSettingKey, BoardLayout, PlanPin, PlanAnnotation, BoardView, Employee, TimePunch, TimeClockSettings, WorkerLevel, FocusIntent } from '../types';
import { ReportDef } from './reportModel';

// Always merge stored mainUiStrings ON TOP of the fresh preset so code-added keys
// are never missing even when localStorage has an older saved version.
function mergeFreshMainUi(ms: Partial<MainUiStrings> | null | undefined): MainUiStrings {
  const safe = ms ?? {};
  return { ...(safe.isRtl ? HEBREW_MAIN_UI_STRINGS : DEFAULT_MAIN_UI_STRINGS), ...safe };
}
import {
  DEFAULT_BUILDINGS, DEFAULT_PROJECTS, DEFAULT_STAGES, DEFAULT_USERS, NETIV_BUILDINGS,
  buildDefaultApartments, buildNetivApartments, buildGroundFirstFloorSlots, migrateNetivApartments, DATA_VERSION,
} from './initialData';
import {
  fsSet, fsDelete, fsBatchSet, fsGetAll, fsListen, isFirebaseConfigured, db, projectCollection,
  fsTombstone,
  fsUntombstone, fsGetTombstones, fsListenTombstones,
} from './firebase';
import { DEFAULT_TIME_CLOCK, resolvePunch } from './timeClock';
import { purgeJobsFromPlanner, isPlannerElement } from './plannerPurge';
import { DEFAULT_WORKER_LEVELS } from './workerLevels';

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
export async function ensureProjectSnapshot(projectId: string): Promise<void> {
  if (!isFirebaseConfigured || !db || !projectId) return;
  if (_snapFetched.has(projectId)) return;
  _snapFetched.add(projectId);
  const key = getProjectStorageKey(projectId);
  const existing = loadFromStorage(key, null) as Record<string, unknown> | null;
  // A snapshot with rooms in it is this machine's own memory — leave it be.
  if (existing && Array.isArray(existing.apartments) && (existing.apartments as unknown[]).length > 0) return;
  try {
    const col = (base: string) => projectCollection(projectId, base);
    const [apartments, assignments, stageNotes, contractorNotes, canvasElements, planAnnotations, stages] =
      await Promise.all([
        fsGetAll(col('apartments')),
        fsGetAll(col('contractorAssignments')),
        fsGetAll(col('stageNotes')),
        fsGetAll(col('contractorNotes')),
        fsGetAll(col('canvasElements')),
        fsGetAll(col('planAnnotations')),
        fsGetAll('stages'),
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
    });
    useStore.setState(st => ({ snapshotTick: st.snapshotTick + 1 }));
  } catch {
    // A failed fetch is allowed to retry the next time somebody asks.
    _snapFetched.delete(projectId);
  }
}

// Holds unsubscribe functions for all active Firestore real-time listeners.
// Stored outside the Zustand state (not serializable) so they survive re-renders.
let _firebaseUnsubscribers: Array<() => void> = [];

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
  archive: BoardSetting['plannerArchive'];
  archiveChanged: boolean;
  removed: number;
} | null {
  const gone = new Set(ids);
  if (!gone.size) return null;
  let removed = 0;
  const changed: CanvasElement[] = [];
  const elements = state.canvasElements.map(el => {
    if (!isPlannerElement(el)) return el;
    const r = purgeJobsFromPlanner(el.data as Record<string, unknown> | undefined, gone);
    if (!r) return el;
    removed += r.removed;
    const next = { ...el, data: r.data };
    changed.push(next);
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
  return { elements, changed, archive, archiveChanged, removed };
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
  purge.changed.forEach(el => fsSet(projectCollection(pid, 'canvasElements'), el.id, el));
  if (!purge.archiveChanged) return;
  const next = {
    ...get().boardSettings,
    [pid]: { ...(get().boardSettings[pid] ?? {}), plannerArchive: purge.archive },
  };
  useStore.setState({ boardSettings: next });
  fsSet('settings', 'app', { boardSettings: next });
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

  updateApartment: (id: string, changes: Partial<Apartment>, user: User) => void;
  bulkUpdateApartments: (ids: string[], changes: Partial<Apartment>, user: User) => void;
  addApartment: (apt: Apartment) => void;
  /** Bulk add — one state set, one persist, one (chunked) Firestore batch. */
  importJobs: (jobs: Apartment[]) => void;
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
  addContractorNote: (n: Omit<ContractorNote, 'id' | 'createdAt'>) => void;
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
  exportToDrive: () => Promise<{ ok: boolean; error?: string }>;
  getDataSummary: () => DataSummary;

  // Contractor UI language strings
  contractorUiStrings: ContractorUiStrings;
  updateContractorUiStrings: (partial: Partial<ContractorUiStrings>) => void;
  mainUiStrings: MainUiStrings;
  updateMainUiStrings: (s: MainUiStrings) => void;

  // Office note files
  addOfficeNoteFile: (f: Omit<OfficeNoteFile, 'id' | 'uploadedAt'>) => void;
  deleteOfficeNoteFile: (id: string) => void;

  // Backup / restore
  exportData: () => string;
  importData: (json: string) => { ok: boolean; error?: string; summary?: DataSummary };

  // Firebase sync
  startFirebaseSync: () => void;
  forcePushToFirestore: () => Promise<void>;
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
   * "This job is on the planner and just got a dated task" — the queued
   * question. Session-only. Answered by answerPlannerAsk with one of the
   * three confirmed choices.
   */
  plannerAsk: { widgetId: string; jobId: string; contractorId: string; dueDate: string } | null;
  answerPlannerAsk: (choice: 'ghost' | 'skip' | 'move') => void;

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
  saveBoardLayout: (label: string) => void;
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
  contractorUiStrings: (stored?.contractorUiStrings as ContractorUiStrings | null) ?? DEFAULT_CONTRACTOR_UI_STRINGS,
  mainUiStrings: mergeFreshMainUi(stored?.mainUiStrings as Partial<MainUiStrings> | null),
  pendingOpenAptId: null,
  pendingFocus: null,
  snapshotTick: 0,
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
  lightTheme: localStorage.getItem(THEME_KEY) !== 'dark',
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
    if (!ask || choice === 'skip') return;

    const el = st.canvasElements.find(x => x.id === ask.widgetId);
    if (!el) return;
    const data = (el.data ?? {}) as { cells?: Record<string, { id: string; jobId?: string; text?: string }[]> };
    const cells = { ...(data.cells ?? {}) };

    if (choice === 'move') {
      // The job leaves wherever it was standing; the ghost below is its new home.
      for (const key of Object.keys(cells)) {
        const kept = cells[key].filter(en => en.jobId !== ask.jobId);
        if (kept.length !== cells[key].length) {
          if (kept.length) cells[key] = kept; else delete cells[key];
        }
      }
    }

    const key = `c:${ask.contractorId}|${ask.dueDate}`;
    const landing = cells[key] ?? [];
    // Never the same job twice in one square.
    if (!landing.some(en => en.jobId === ask.jobId)) {
      cells[key] = [...landing, { id: `R-${Math.random().toString(36).slice(2, 8)}`, jobId: ask.jobId }];
    }
    get().updateCanvasElement(el.id, { data: { ...(el.data ?? {}), cells } });
  },
  setDashboardLayout: (order: string[], hidden: string[]) => {
    set({ dashboardWidgetOrder: order, dashboardHiddenWidgets: hidden });
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
    const nextCustom = [...get().customProjects, project];
    set({
      customProjects: nextCustom,
      projects: [...get().projects, project],
      // Stages are global records carrying a projectId, like every other stage.
      stages: [...get().stages, ...stages],
    });

    // Seed the new workspace's own storage, without disturbing the live one.
    saveToStorage(getProjectStorageKey(project.id), {
      buildings, apartments,
      stageNotes: [], stageNoteVersions: [], generalNoteVersions: [], activityLogs: [],
      contractorAssignments: [], contractorNotes: [], contractorPhotos: [],
      officeNoteFiles: [], canvasElements: [], planPins: [], planAnnotations: [],
      dashboardWidgetOrder: [], dashboardHiddenWidgets: [],
    });

    persist(get);
    fsSet('settings', 'app', { customProjects: nextCustom });
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
    const nextCustom = get().customProjects.filter(p => p.id !== id);
    set({
      customProjects: nextCustom,
      projects: get().projects.filter(p => p.id !== id),
    });
    if (get().currentProjectId === id) get().setCurrentProject('general');
    persist(get);
    fsSet('settings', 'app', { customProjects: nextCustom });
  },

  setProjectColor: (projectId, color) => {
    const next = { ...get().projectColors, [projectId]: color };
    set({
      projectColors: next,
      projects: get().projects.map(p => (p.id === projectId ? { ...p, color } : p)),
    });
    persist(get);
    fsSet('settings', 'app', { projectColors: next });
  },

  setBoardSetting: (key, value) => {
    const pid = get().currentProjectId;
    const next = { ...get().boardSettings, [pid]: { ...(get().boardSettings[pid] ?? {}), [key]: value } };
    set({ boardSettings: next });
    persist(get);
    fsSet('settings', 'app', { boardSettings: next });
  },

  boardLayouts: (stored?.boardLayouts as Record<string, BoardLayout[]> | null) ?? {},

  saveBoardLayout: (label) => {
    const st = get();
    const pid = st.currentProjectId;
    const layout: BoardLayout = {
      id: 'BL-' + Date.now().toString(36),
      at: new Date().toISOString(),
      label,
      jobs: st.apartments
        .filter(a => a.buildingId === 'G' && typeof a.canvasX === 'number' && typeof a.canvasY === 'number')
        .map(a => ({ id: a.id, x: a.canvasX!, y: a.canvasY! })),
      els: st.canvasElements.map(e => ({ id: e.id, x: e.x, y: e.y, w: e.w, h: e.h })),
    };
    // Capped, because these are convenience snapshots and not a backup.
    const next = { ...st.boardLayouts, [pid]: [layout, ...(st.boardLayouts[pid] ?? [])].slice(0, 10) };
    set({ boardLayouts: next });
    persist(get);
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
    set({ apartments, canvasElements });
    persist(get);
    apartments.forEach(a => { if (jobPos.has(a.id)) fsSet(projectCollection(pid, 'apartments'), a.id, a); });
    canvasElements.forEach(e => { if (elPos.has(e.id)) fsSet(projectCollection(pid, 'canvasElements'), e.id, e); });
  },

  deleteBoardLayout: (layoutId) => {
    const st = get();
    const pid = st.currentProjectId;
    set({ boardLayouts: { ...st.boardLayouts, [pid]: (st.boardLayouts[pid] ?? []).filter(l => l.id !== layoutId) } });
    persist(get);
  },

  setTvSetting: (key, value) => {
    const next = { ...get().boardSettings, __tv: { ...(get().boardSettings.__tv ?? {}), [key]: value } };
    set({ boardSettings: next });
    persist(get);
    fsSet('settings', 'app', { boardSettings: next });
  },

  setContractorSheetLink: (url: string) => {
    const pid = get().currentProjectId;
    const next = { ...get().contractorSheetLinks, [pid]: url };
    set({ contractorSheetLinks: next });
    persist(get);
    // settings/app is the shared global doc, so the link follows the user to any device
    fsSet('settings', 'app', { contractorSheetLinks: next });
  },

  setLightTheme: (v: boolean) => {
    set({ lightTheme: v });
    localStorage.setItem(THEME_KEY, v ? 'light' : 'dark');
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

  updateApartment: (id, changes, user) => {
    const existing = get().apartments.find(a => a.id === id);
    if (!existing) return;
    const now = new Date().toISOString();

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
    const CANVAS_ONLY = new Set(['canvasX', 'canvasY', 'tileColor', 'boardBin', 'binnedAt', 'boardLocked', 'boardGroup', 'tileW', 'tileH', 'viewPos', 'ghosts', 'stageOrder', 'showOnTv']);
    const touchedContent = Object.keys(changes).some(k => !CANVAS_ONLY.has(k));
    if (touchedContent) updated.contentUpdatedAt = now;

    // Sync shared fields to merged partner when they change
    let extraUpdates: Apartment[] = [];
    // displayName is synced too: a linked pair is one physical home, so it carries
    // one family name. Each cell still shows its own apartment number.
    const syncedFields = ['currentStageId', 'classification', 'driveLink', 'plansPdfLink', 'displayName'] as const;
    const changesHaveSync = syncedFields.some(f => f in changes);
    if (changesHaveSync && updated.mergedWith) {
      const partner = get().apartments.find(a => a.id === updated.mergedWith);
      if (partner) {
        const partnerPatch: Partial<Apartment> = {};
        if ('currentStageId' in changes) partnerPatch.currentStageId = updated.currentStageId;
        if ('classification' in changes) partnerPatch.classification = updated.classification;
        if ('driveLink' in changes) partnerPatch.driveLink = updated.driveLink;
        if ('plansPdfLink' in changes) partnerPatch.plansPdfLink = updated.plansPdfLink;
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

    // Firebase sync
    fsSet(projectCollection(_pid, 'apartments'), id, updated);
    extraUpdates.forEach(e => fsSet(projectCollection(_pid, 'apartments'), e.id, e));

    // Log changes
    const loggable: Array<keyof Apartment> = ['currentStageId', 'classification', 'generalNotes', 'displayName'];
    loggable.forEach(field => {
      const prev = existing[field];
      const next = updated[field];
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        const stages = get().stages;
        const prevLabel = field === 'currentStageId' ? (stages.find(s => s.id === String(prev))?.name ?? 'Not started') : String(prev ?? '');
        const nextLabel = field === 'currentStageId' ? (stages.find(s => s.id === String(next))?.name ?? 'Not started') : String(next ?? '');
        get().addActivityLog({
          userId: user.id,
          userName: user.name,
          buildingId: existing.buildingId,
          apartmentId: id,
          apartmentNumber: existing.displayName || existing.apartmentNumber || id,
          actionType: 'update',
          fieldChanged: field,
          previousValue: prevLabel,
          newValue: nextLabel,
          stageId: field === 'currentStageId' ? String(next ?? '') : '',
        });
      }
    });
  },

  bulkUpdateApartments: (ids, changes, user) => {
    const now = new Date().toISOString();
    const updated = get().apartments.map(a => {
      if (!ids.includes(a.id)) return a;
      let stageDates = a.stageDates ?? {};
      if (changes.currentStageId && changes.currentStageId !== a.currentStageId && !stageDates[changes.currentStageId]) {
        stageDates = { ...stageDates, [changes.currentStageId]: now };
      }
      return { ...a, ...changes, stageDates, updatedAt: now, updatedBy: user.id, updatedByName: user.name };
    });
    set({ apartments: updated });
    persist(get);
    updated.filter(a => ids.includes(a.id)).forEach(a => fsSet(projectCollection(get().currentProjectId, 'apartments'), a.id, a));
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
    set(state => ({
      apartments: state.apartments.map(a => a.id === id
        ? { ...a, ghosts: [...(a.ghosts ?? []), { x, y }] } : a),
    }));
    persist(get);
    const u = get().apartments.find(a => a.id === id);
    if (u) fsSet(projectCollection(pid, 'apartments'), id, u);
  },

  moveGhost: (id, index, x, y) => {
    const pid = get().currentProjectId;
    set(state => ({
      apartments: state.apartments.map(a => a.id === id
        ? { ...a, ghosts: (a.ghosts ?? []).map((g, i) => (i === index ? { x, y } : g)) } : a),
    }));
    persist(get);
    const u = get().apartments.find(a => a.id === id);
    if (u) fsSet(projectCollection(pid, 'apartments'), id, u);
  },

  removeGhost: (id, index) => {
    const pid = get().currentProjectId;
    set(state => ({
      apartments: state.apartments.map(a => a.id === id
        ? { ...a, ghosts: (a.ghosts ?? []).filter((_, i) => i !== index) } : a),
    }));
    persist(get);
    const u = get().apartments.find(a => a.id === id);
    if (u) fsSet(projectCollection(pid, 'apartments'), id, u);
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
    set(st => ({ undoState: remember(st.undoState, entry) }));
  },
  stepUndo: () => {
    const { entry, next } = popUndo(get().undoState);
    if (!entry) return null;
    // The stack moves FIRST: `entry.undo()` writes to the store, and anything
    // that re-entered here mid-write would find the entry still on the past.
    set({ undoState: next });
    _undoWalking = true;
    try { entry.undo(); } finally { _undoWalking = false; }
    return entry;
  },
  stepRedo: () => {
    const { entry, next } = popRedo(get().undoState);
    if (!entry) return null;
    set({ undoState: next });
    _undoWalking = true;
    try { entry.redo(); } finally { _undoWalking = false; }
    return entry;
  },

  restoreCanvasElements: (els) => {
    if (els.length === 0) return;
    const pid = get().currentProjectId;
    untombstone(pid, els.map(e => e.id));
    set(state => {
      const have = new Set(state.canvasElements.map(e => e.id));
      return { canvasElements: [...state.canvasElements, ...els.filter(e => !have.has(e.id))] };
    });
    els.forEach(e => fsSet(projectCollection(pid, 'canvasElements'), e.id, e));
    persist(get);
  },

  moveToBin: (id, bin) => {
    const pid = get().currentProjectId;
    set(state => ({
      apartments: state.apartments.map(a => a.id === id
        ? { ...a, boardBin: bin ?? undefined, binnedAt: bin ? new Date().toISOString() : undefined }
        : a),
    }));
    persist(get);
    const updated = get().apartments.find(a => a.id === id);
    if (updated) fsSet(projectCollection(pid, 'apartments'), id, updated);
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
      if (partner) fsSet(projectCollection(pid, 'apartments'), partner.id, partner);
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
    fsSet('settings', 'app', { savedReports: get().savedReports });
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
    fsSet('settings', 'app', { savedReports: get().savedReports });
    persist(get);
  },
  addBoardView: (v) => {
    set(state => ({ boardViews: [...state.boardViews, v] }));
    fsSet('settings', 'app', { boardViews: get().boardViews });
    persist(get);
  },
  updateBoardView: (id, changes) => {
    set(state => ({ boardViews: state.boardViews.map(v => v.id === id ? { ...v, ...changes } : v) }));
    fsSet('settings', 'app', { boardViews: get().boardViews });
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
    set(state => ({
      boardViews: state.boardViews.filter(v => v.id !== id),
      canvasElements: state.canvasElements.map(el =>
        el.board === id ? { ...el, board: undefined } : el),
      activeBoardView: state.activeBoardView === id ? '' : state.activeBoardView,
    }));
    const pid = get().currentProjectId;
    get().canvasElements
      .filter(el => el.board === undefined)
      .forEach(el => fsSet(projectCollection(pid, 'canvasElements'), el.id, el));
    fsSet('settings', 'app', { boardViews: get().boardViews });
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
    set({ projectOrder: ids });
    fsSet('settings', 'app', { projectOrder: ids });
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
    try { return localStorage.getItem('active_board_view') ?? ''; } catch { return ''; }
  })(),
  setActiveBoardView: (id) => {
    try { localStorage.setItem('active_board_view', id); } catch { /* private mode */ }
    set({ activeBoardView: id });
  },

  planAnnotations: (stored?.planAnnotations as PlanAnnotation[] | null) ?? [],
  savePlanAnnotation: (ann) => {
    set(state => ({
      planAnnotations: [...state.planAnnotations.filter(a => a.id !== ann.id), ann],
    }));
    fsSet(projectCollection(get().currentProjectId, 'planAnnotations'), ann.id, ann);
    persist(get);
  },
  updatePlanAnnotation: (id, changes) => {
    set(state => ({
      planAnnotations: state.planAnnotations.map(a => a.id === id ? { ...a, ...changes } : a),
    }));
    const updated = get().planAnnotations.find(a => a.id === id);
    if (updated) fsSet(projectCollection(get().currentProjectId, 'planAnnotations'), id, updated);
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
    set(state => ({ planPins: state.planPins.map(p => p.id === id ? { ...p, ...changes } : p) }));
    const updated = get().planPins.find(p => p.id === id);
    if (updated) fsSet(projectCollection(get().currentProjectId, 'planPins'), id, updated);
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
    set(state => ({ canvasElements: state.canvasElements.map(el => el.id === id ? { ...el, ...changes } : el) }));
    persist(get);
    const updatedEl = get().canvasElements.find(el => el.id === id);
    if (updatedEl) fsSet(projectCollection(get().currentProjectId, 'canvasElements'), id, updatedEl);
  },
  deleteCanvasElement: (id) => {
    const pid = get().currentProjectId;
    set(state => ({ canvasElements: state.canvasElements.filter(el => el.id !== id) }));
    tombstone(pid, [id]);
    fsDelete(projectCollection(pid, 'canvasElements'), id);
    persist(get);
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
    // Strip dataUrl from attachments before Firestore write
    const noteForFs: StageNote = {
      ...note,
      attachmentDataUrl: undefined,
      attachments: note.attachments?.map(a => ({ ...a, dataUrl: undefined })),
    };
    fsSet(projectCollection(get().currentProjectId, 'stageNotes'), note.id, noteForFs);

    const apt = get().apartments.find(a => a.id === apartmentId);
    const stage = get().stages.find(s => s.id === stageId);
    if (apt && stage) {
      get().addActivityLog({
        userId: user.id,
        userName: user.name,
        buildingId: apt.buildingId,
        apartmentId,
        apartmentNumber: apt.displayName || apt.apartmentNumber || apartmentId,
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

  getStageNoteVersions: (noteId) => {
    return get().stageNoteVersions.filter(v => v.noteId === noteId).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },

  getGeneralNoteVersions: (aptId) => {
    return get().generalNoteVersions.filter(v => v.apartmentId === aptId).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },

  updateStage: (id, changes) => {
    set(state => ({
      stages: state.stages.map(s => s.id === id ? { ...s, ...changes, updatedAt: new Date().toISOString() } : s),
    }));
    persist(get);
    const updated = get().stages.find(s => s.id === id);
    if (updated) fsSet('stages', id, updated);
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
    set(state => ({
      stages: state.stages.filter(s => s.id !== id),
      apartments: state.apartments.map(a => a.currentStageId === id ? { ...a, currentStageId: null } : a),
    }));
    persist(get);
    fsDelete('stages', id);
    get().apartments
      .filter(a => affectedAptIds.has(a.id))
      .forEach(a => fsSet(projectCollection(get().currentProjectId, 'apartments'), a.id, a));
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
    fsBatchSet(projectCollection(get().currentProjectId, 'apartments'), Array.from(updates.entries()).map(([id, data]) => ({ id, data })));
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
    fsBatchSet(projectCollection(get().currentProjectId, 'apartments'), Array.from(updates.entries()).map(([id, data]) => ({ id, data })));
  },

  setGoogleClientId: (id) => {
    set({ googleClientId: id });
    persist(get);
  },

  setGoogleToken: (token, expiry) => {
    set({ googleAccessToken: token, googleTokenExpiry: expiry });
    // not persisted — session-only
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
    set(state => ({
      workerLevels: state.workerLevels.map(l => (l.id === id ? { ...l, ...changes } : l)),
    }));
    persist(get);
    const updated = get().workerLevels.find(l => l.id === id);
    if (updated) fsSet('workerLevels', id, updated);
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
    orphans.forEach(c => fsSet('contractors', c.id, { ...c, levelId: DEFAULT_WORKER_LEVELS[0].id }));
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
    set(state => ({ employees: state.employees.map(e => e.id === id ? { ...e, ...changes } : e) }));
    persist(get);
    const updated = get().employees.find(e => e.id === id);
    if (updated) fsSet('employees', id, updated);
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
    set(state => ({ timePunches: state.timePunches.map(p => p.id === id ? { ...p, ...changes } : p) }));
    persist(get);
    const updated = get().timePunches.find(p => p.id === id);
    if (updated) fsSet('timePunches', id, updated);
  },

  deletePunch: (id) => {
    set(state => ({ timePunches: state.timePunches.filter(p => p.id !== id) }));
    persist(get);
    fsDelete('timePunches', id);
  },

  setTimeClock: (changes) => {
    const next = { ...get().timeClock, ...changes };
    set({ timeClock: next });
    persist(get);
    fsSet('settings', 'app', { timeClock: next });
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
    set(state => ({ contractors: state.contractors.map(c => c.id === id ? { ...c, ...changes } : c) }));
    persist(get);
    const updated = get().contractors.find(c => c.id === id);
    if (updated) fsSet('contractors', id, updated);
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
    if (a.dueDate && a.contractorId) {
      const holder = get().canvasElements.find(el =>
        el.type === 'widget' && el.widget === 'rota'
        && Object.values(((el.data ?? {}) as { cells?: Record<string, { jobId?: string }[]> }).cells ?? {})
          .some(list => list.some(en => en.jobId === a.apartmentId)));
      if (holder) {
        set({ plannerAsk: {
          widgetId: holder.id, jobId: a.apartmentId,
          contractorId: a.contractorId, dueDate: a.dueDate,
        } });
      }
    }
    // Strip attachment dataUrls before Firestore (keep metadata only)
    const aForFs = { ...a, attachments: a.attachments?.map(att => ({ ...att, dataUrl: '' })) };
    fsSet(projectCollection(get().currentProjectId, 'contractorAssignments'), a.id, aForFs);
    // Activity log
    const apt = get().apartments.find(ap => ap.id === a.apartmentId);
    if (apt) {
      get().addActivityLog({
        userId: a.createdBy,
        userName: a.createdByName,
        buildingId: a.buildingId,
        apartmentId: a.apartmentId,
        apartmentNumber: apt.displayName || apt.apartmentNumber || a.apartmentId,
        actionType: 'task_created',
        fieldChanged: 'task',
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
    set(state => ({
      contractorAssignments: state.contractorAssignments.map(a => a.id === id ? { ...a, ...changes } : a),
    }));
    persist(get);
    const updated = get().contractorAssignments.find(a => a.id === id);
    if (updated) {
      const updForFs = { ...updated, attachments: updated.attachments?.map(att => ({ ...att, dataUrl: '' })) };
      fsSet(projectCollection(get().currentProjectId, 'contractorAssignments'), id, updForFs);
    }
    /**
     * Closing a task MOVES THE JOB to the stage picked at creation.
     *
     * Here, at the one write every screen goes through — the planner made the
     * task, the portal or the Tasks page may close it, and nobody has to
     * remember the stage. The worker's portal has no signed-in user, so the
     * stage write is attributed to the worker by name; re-opening the task
     * does NOT move the stage back (the job may have moved on for other
     * reasons — an automatic revert would be a guess).
     */
    if (before && updated && 'completedAt' in changes
        && !before.completedAt && updated.completedAt && updated.stageWhenDone) {
      const apt = get().apartments.find(ap => ap.id === updated.apartmentId);
      if (apt && apt.currentStageId !== updated.stageWhenDone) {
        const who = get().currentUser
          ?? {
            id: updated.contractorId,
            name: get().contractors.find(c => c.id === updated.contractorId)?.name ?? 'Worker',
            code: '', role: 'viewer', active: true, createdAt: updated.createdAt,
          } as User;
        get().updateApartment(updated.apartmentId, { currentStageId: updated.stageWhenDone }, who);
      }
    }
    // Log completion / undo-completion
    if (before && updated && 'completedAt' in changes) {
      const apt = get().apartments.find(ap => ap.id === updated.apartmentId);
      const user = get().currentUser;
      if (apt && user) {
        const wasCompleted = !!before.completedAt;
        const isNowCompleted = !!updated.completedAt;
        if (!wasCompleted && isNowCompleted) {
          get().addActivityLog({
            userId: user.id,
            userName: user.name,
            buildingId: updated.buildingId,
            apartmentId: updated.apartmentId,
            apartmentNumber: apt.displayName || apt.apartmentNumber || updated.apartmentId,
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
            apartmentNumber: apt.displayName || apt.apartmentNumber || updated.apartmentId,
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
          apartmentNumber: apt.displayName || apt.apartmentNumber || assignment.apartmentId,
          actionType: 'task_deleted',
          fieldChanged: 'task',
          previousValue: assignment.taskDescription,
          newValue: '',
          stageId: assignment.stageId ?? '',
        });
      }
    }
  },

  addContractorNote: (fields) => {
    const n: ContractorNote = { ...fields, id: generateId(), createdAt: new Date().toISOString() };
    set(state => ({ contractorNotes: [...state.contractorNotes, n] }));
    persist(get);
    fsSet(projectCollection(get().currentProjectId, 'contractorNotes'), n.id, { ...n, attachmentDataUrl: undefined });
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
    set(state => ({
      contractorPhotos: state.contractorPhotos.map(p => p.id === id ? { ...p, ...changes } : p),
    }));
    persist(get);
    const updated = get().contractorPhotos.find(p => p.id === id);
    if (updated) fsSet(projectCollection(get().currentProjectId, 'contractorPhotos'), id, { ...updated, dataUrl: '' });
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
    set(state => ({
      users: state.users.map(u => u.id === id ? { ...u, ...changes } : u),
      currentUser: state.currentUser?.id === id ? { ...state.currentUser, ...changes } : state.currentUser,
    }));
    persist(get);
    const updated = get().users.find(u => u.id === id);
    if (updated) fsSet('users', id, updated);
  },

  addUser: (user) => {
    set(state => ({ users: [...state.users, user] }));
    persist(get);
    fsSet('users', user.id, user);
  },

  addActivityLog: (log) => {
    const entry: ActivityLog = { ...log, id: generateId(), createdAt: new Date().toISOString() };
    set(state => {
      const newLogs = [entry, ...state.activityLogs].slice(0, 500);
      if (!state.autoBackup) return { activityLogs: newLogs };

      // Check frequency before snapshotting
      const freq = state.backupFrequency ?? 'activity';
      const now = Date.now();
      const last = state.lastAutoBackupAt ? new Date(state.lastAutoBackupAt).getTime() : 0;
      const DAY = 86_400_000;
      let shouldSnapshot = false;
      if (freq === 'activity') shouldSnapshot = true;
      else if (freq === 'daily' && now - last > DAY) shouldSnapshot = true;
      else if (freq === 'weekly' && now - last > 7 * DAY) shouldSnapshot = true;
      else if (freq === 'monthly' && now - last > 30 * DAY) shouldSnapshot = true;

      if (!shouldSnapshot) return { activityLogs: newLogs };

      const snapshot: BackupSnapshot = {
        id: generateId(),
        activityLogId: entry.id,
        createdAt: entry.createdAt,
        label: `${entry.userName} · ${entry.fieldChanged}${entry.apartmentNumber ? ` · Apt ${entry.apartmentNumber}` : ''}`,
        apartmentStates: state.apartments.map(a => ({
          id: a.id,
          currentStageId: a.currentStageId,
          classification: a.classification,
          generalNotes: a.generalNotes,
          driveLink: a.driveLink,
          plansPdfLink: a.plansPdfLink,
          displayName: a.displayName,
          mergedWith: a.mergedWith,
        })),
        stageNotes: state.stageNotes,
        contractorAssignments: state.contractorAssignments,
        contractors: state.contractors,
        contractorNotes: state.contractorNotes,
      };
      return {
        activityLogs: newLogs,
        backupSnapshots: [snapshot, ...state.backupSnapshots],
        lastAutoBackupAt: entry.createdAt,
      };
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

  exportToDrive: async () => {
    const state = get();
    const { backupDriveFolderLink } = state;
    const key = (import.meta.env as Record<string, string>)['VITE_DRIVE_API_KEY'] ?? '';
    if (!backupDriveFolderLink || !key) return { ok: false, error: 'Drive folder not configured' };
    try {
      const json = get().exportData();
      const filename = `wolfson-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
      // Find or create Backups subfolder
      const { extractFolderId } = await import('./driveApi');
      const parentId = extractFolderId(backupDriveFolderLink);
      if (!parentId) return { ok: false, error: 'Invalid Drive folder URL' };
      const folderRes = await fetch('/api/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ parentId, name: 'Backups' }),
      });
      if (!folderRes.ok) return { ok: false, error: 'Failed to access Drive folder' };
      const { folderId } = await folderRes.json();
      const data = btoa(unescape(encodeURIComponent(json)));
      const uploadRes = await fetch('/api/drive-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ folderId, filename, mimeType: 'application/json', data }),
      });
      if (!uploadRes.ok) return { ok: false, error: 'Upload failed' };
      const now = new Date().toISOString();
      set({ lastDriveExportAt: now });
      persist(get);
      get().addBackupLog({ filename, sizeKB: Math.round(json.length / 1024), driveUploaded: true, triggeredBy: 'scheduled' });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  addBackupLog: (fields) => {
    const entry: BackupLogEntry = { ...fields, id: generateId(), createdAt: new Date().toISOString() };
    set(state => ({ backupLogs: [entry, ...state.backupLogs].slice(0, 50) }));
    persist(get);
  },

  updateContractorUiStrings: (partial) => {
    set(state => ({ contractorUiStrings: { ...state.contractorUiStrings, ...partial } }));
    persist(get);
    fsSet('settings', 'app', { contractorUiStrings: get().contractorUiStrings });
  },

  updateMainUiStrings: (s) => {
    set({ mainUiStrings: s });
    persist(get);
    fsSet('settings', 'app', { mainUiStrings: s });
  },

  addOfficeNoteFile: (fields) => {
    const f: OfficeNoteFile = { ...fields, id: generateId(), uploadedAt: new Date().toISOString() };
    set(state => ({ officeNoteFiles: [...state.officeNoteFiles, f] }));
    persist(get);
    // dataUrl stays local; only metadata goes to Firestore
    fsSet(projectCollection(get().currentProjectId, 'officeNoteFiles'), f.id, { ...f, dataUrl: '' });
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

  forcePushToFirestore: async () => {
    if (!db) return;
    const state = get();
    const fpid = state.currentProjectId;
    const pc = (base: string) => projectCollection(fpid, base);
    await Promise.all([
      fsBatchSet(pc('apartments'), state.apartments.map(a => ({ id: a.id, data: a }))),
      fsBatchSet('stages',        state.stages.map(s => ({ id: s.id, data: s }))),
      fsBatchSet('users',         state.users.map(u => ({ id: u.id, data: u }))),
      state.stageNotes.length > 0
        ? fsBatchSet(pc('stageNotes'), state.stageNotes.map(n => ({ id: n.id, data: n })))
        : Promise.resolve(),
      state.contractors.length > 0
        ? fsBatchSet('contractors', state.contractors.map(c => ({ id: c.id, data: c })))
        : Promise.resolve(),
      state.contractorAssignments.length > 0
        ? fsBatchSet(pc('contractorAssignments'), state.contractorAssignments.map(a => ({
            id: a.id, data: { ...a, attachments: a.attachments?.map(att => ({ ...att, dataUrl: '' })) },
          })))
        : Promise.resolve(),
      state.contractorNotes.length > 0
        ? fsBatchSet(pc('contractorNotes'), state.contractorNotes.map(n => ({ id: n.id, data: n })))
        : Promise.resolve(),
      state.contractorPhotos.length > 0
        ? fsBatchSet(pc('contractorPhotos'), state.contractorPhotos.map(p => ({ id: p.id, data: { ...p, dataUrl: '' } })))
        : Promise.resolve(),
      state.officeNoteFiles.length > 0
        ? fsBatchSet(pc('officeNoteFiles'), state.officeNoteFiles.map(f => ({ id: f.id, data: { ...f, dataUrl: '' } })))
        : Promise.resolve(),
      state.canvasElements.length > 0
        ? fsBatchSet(pc('canvasElements'), state.canvasElements.map(e => ({ id: e.id, data: e })))
        : Promise.resolve(),
      state.employees.length > 0
        ? fsBatchSet('employees', state.employees.map(e => ({ id: e.id, data: e })))
        : Promise.resolve(),
      state.timePunches.length > 0
        ? fsBatchSet('timePunches', state.timePunches.map(pch => ({ id: pch.id, data: pch })))
        : Promise.resolve(),
      fsBatchSet('workerLevels', state.workerLevels.map(l => ({ id: l.id, data: l }))),
      fsSet('settings', 'app', {
        autoBackup: state.autoBackup, backupFrequency: state.backupFrequency,
        backupDriveFolderLink: state.backupDriveFolderLink,
        contractorUiStrings: state.contractorUiStrings,
        mainUiStrings: state.mainUiStrings,
        timeClock: state.timeClock,
      }),
    ]);
  },

  startFirebaseSync: async () => {
    if (get().firebaseListening) return;
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

    // Load all collections from Firestore in parallel.
    // Per-project collections use the project-scoped name via col(); the GLOBAL
    // collections (stages / users / contractors / settings) always use the bare
    // name, because every mutation action writes them bare. Reading them through
    // col() made adds in Netiv/General silently disappear on the next load.
    const pid = get().currentProjectId;
    const col = (base: string) => projectCollection(pid, base);
    const [
      fbApts, fbStageNotes, fbStages, fbUsers, fbLogs,
      fbContractors, fbAssignments, fbNotes, fbPhotos, fbOfficeFiles, fbSettings,
      fbStageNoteVersions, fbGeneralNoteVersions, fbCanvasElements, fbPlanPins, fbPlanAnnotations,
      fbEmployees, fbPunches, fbLevels,
    ] = await Promise.all([
      fsGetAll(col('apartments')),
      fsGetAll(col('stageNotes')),
      fsGetAll('stages'),
      fsGetAll('users'),
      fsGetAll(col('activityLogs')),
      fsGetAll('contractors'),
      fsGetAll(col('contractorAssignments')),
      fsGetAll(col('contractorNotes')),
      fsGetAll(col('contractorPhotos')),
      fsGetAll(col('officeNoteFiles')),
      fsGetAll('settings'),
      fsGetAll(col('stageNoteVersions')),
      fsGetAll(col('generalNoteVersions')),
      fsGetAll(col('canvasElements')),
      fsGetAll(col('planPins')),
      fsGetAll(col('planAnnotations')),
      // Bare, in every workspace: the payroll is company-wide.
      fsGetAll('employees'),
      fsGetAll('timePunches'),
      fsGetAll('workerLevels'),
    ]);

    // What this workspace has deleted on purpose. Read BEFORE anything is
    // pushed up: a record this device still holds locally but the cloud has
    // buried must be dropped here, or the "seed anything missing" step below
    // resurrects it — the reason a removed import kept reappearing.
    _tombstones = await fsGetTombstones(pid);
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

    if (hasFirebaseData) {
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
        ...(appSettings.mainUiStrings        ? { mainUiStrings: mergeFreshMainUi(appSettings.mainUiStrings as Partial<MainUiStrings>) } : {}),
        ...(appSettings.contractorSheetLinks ? { contractorSheetLinks: appSettings.contractorSheetLinks as Record<string, string> } : {}),
        ...(appSettings.boardViews ? { boardViews: appSettings.boardViews as BoardView[] } : {}),
        ...(appSettings.savedReports ? { savedReports: appSettings.savedReports as Record<string, ReportDef[]> } : {}),
        ...(appSettings.projectOrder ? { projectOrder: appSettings.projectOrder as string[] } : {}),
        ...(appSettings.boardSettings ? { boardSettings: appSettings.boardSettings as Record<string, BoardSetting> } : {}),
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
        const { apts: migratedNetiv, changed: netivChanged } = migrateNetivApartments(get().apartments);
        if (netivChanged.length > 0) {
          set({ apartments: migratedNetiv });
          persist(get);
          fsBatchSet(col('apartments'), netivChanged.map(a => ({ id: a.id, data: a })));
        }
      }

      // Seed any apartments that are missing from Firestore (in case the first-run seed was partial).
      // Anything tombstoned is missing BECAUSE it was deleted, and must stay gone.
      const fbAptIds = new Set((fbApts as unknown as Apartment[]).map(a => a.id));
      const missingApts = get().apartments.filter(a => !fbAptIds.has(a.id) && !_tombstones.has(a.id));
      if (missingApts.length > 0) {
        fsBatchSet(col('apartments'), missingApts.map(a => ({ id: a.id, data: a })));
      }

      // Board notes and boxes were localStorage-only until now, so a device that
      // already has them must push them up rather than silently lose them.
      const fbElIds = new Set((fbCanvasElements as unknown as CanvasElement[]).map(e => e.id));
      const missingEls = get().canvasElements.filter(e => !fbElIds.has(e.id) && !_tombstones.has(e.id));
      if (missingEls.length > 0) {
        fsBatchSet(col('canvasElements'), missingEls.map(e => ({ id: e.id, data: e })));
      }
    } else {
      // First run — push everything from localStorage to Firestore
      const state = get();
      await Promise.all([
        fsBatchSet(col('apartments'),  state.apartments.map(a => ({ id: a.id, data: a }))),
        fsBatchSet('stages',           state.stages.map(s => ({ id: s.id, data: s }))),
        fsBatchSet('users',            state.users.map(u => ({ id: u.id, data: u }))),
        state.stageNotes.length > 0
          ? fsBatchSet(col('stageNotes'), state.stageNotes.map(n => ({ id: n.id, data: n })))
          : Promise.resolve(),
        state.contractors.length > 0
          ? fsBatchSet('contractors', state.contractors.map(c => ({ id: c.id, data: c })))
          : Promise.resolve(),
        state.contractorAssignments.length > 0
          ? fsBatchSet(col('contractorAssignments'), state.contractorAssignments.map(a => ({
              id: a.id,
              data: { ...a, attachments: a.attachments?.map(att => ({ ...att, dataUrl: '' })) },
            })))
          : Promise.resolve(),
        state.contractorNotes.length > 0
          ? fsBatchSet(col('contractorNotes'), state.contractorNotes.map(n => ({ id: n.id, data: n })))
          : Promise.resolve(),
        state.contractorPhotos.length > 0
          ? fsBatchSet(col('contractorPhotos'), state.contractorPhotos.map(p => ({ id: p.id, data: { ...p, dataUrl: '' } })))
          : Promise.resolve(),
        state.officeNoteFiles.length > 0
          ? fsBatchSet(col('officeNoteFiles'), state.officeNoteFiles.map(f => ({ id: f.id, data: { ...f, dataUrl: '' } })))
          : Promise.resolve(),
        state.canvasElements.length > 0
          ? fsBatchSet(col('canvasElements'), state.canvasElements.map(e => ({ id: e.id, data: e })))
          : Promise.resolve(),
        state.planPins.length > 0
          ? fsBatchSet(col('planPins'), state.planPins.map(p => ({ id: p.id, data: p })))
          : Promise.resolve(),
        state.planAnnotations.length > 0
          ? fsBatchSet(col('planAnnotations'), state.planAnnotations.map(a => ({ id: a.id, data: a })))
          : Promise.resolve(),
        state.employees.length > 0
          ? fsBatchSet('employees', state.employees.map(e => ({ id: e.id, data: e })))
          : Promise.resolve(),
        state.timePunches.length > 0
          ? fsBatchSet('timePunches', state.timePunches.map(pch => ({ id: pch.id, data: pch })))
          : Promise.resolve(),
        fsBatchSet('workerLevels', state.workerLevels.map(l => ({ id: l.id, data: l }))),
        fsSet('settings', 'app', {
          autoBackup:            state.autoBackup,
          backupFrequency:       state.backupFrequency,
          backupDriveFolderLink: state.backupDriveFolderLink,
          contractorUiStrings:   state.contractorUiStrings,
          mainUiStrings:         state.mainUiStrings,
          timeClock:             state.timeClock,
        }),
      ]);
    }

    // ── Real-time listeners for all collections ──────────────────────────────
    // Store every unsubscribe fn so logout() can cancel them cleanly.
    _firebaseUnsubscribers = [
      fsListen(col('apartments'), (docs) => {
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
      fsListen(col('stageNotes'), (docs) => {
        if (docs.length > 0) { set({ stageNotes: docs as unknown as StageNote[] }); persist(get); }
      }),
      fsListen(col('stageNoteVersions'), (docs) => {
        if (docs.length > 0) { set({ stageNoteVersions: docs as unknown as StageNoteVersion[] }); persist(get); }
      }),
      fsListen(col('generalNoteVersions'), (docs) => {
        if (docs.length > 0) { set({ generalNoteVersions: docs as unknown as GeneralNoteVersion[] }); persist(get); }
      }),
      fsListen(col('activityLogs'), (docs) => {
        if (docs.length > 0) {
          const sorted = (docs as unknown as ActivityLog[])
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 500);
          set({ activityLogs: sorted }); persist(get);
        }
      }),
      fsListen('contractors', (docs) => {
        if (docs.length > 0) { set({ contractors: docs as unknown as Contractor[] }); persist(get); }
      }),
      // Bare, like every other global collection. A tap on the wall panel has
      // to show up on the office machine within the second, which is the whole
      // reason the board is worth having.
      fsListen('employees', (docs) => {
        if (docs.length > 0) { set({ employees: docs as unknown as Employee[] }); persist(get); }
      }),
      fsListen('timePunches', (docs) => {
        if (docs.length > 0) { set({ timePunches: docs as unknown as TimePunch[] }); persist(get); }
      }),
      fsListen('workerLevels', (docs) => {
        if (docs.length > 0) { set({ workerLevels: docs as unknown as WorkerLevel[] }); persist(get); }
      }),
      fsListen(col('contractorAssignments'), (docs) => {
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
      fsListen(col('contractorNotes'), (docs) => {
        if (docs.length > 0) { set({ contractorNotes: docs as unknown as ContractorNote[] }); persist(get); }
      }),
      fsListen(col('contractorPhotos'), (docs) => {
        const localP = get().contractorPhotos;
        const merged = (docs as unknown as ContractorPhoto[]).map(fbP => {
          const local = localP.find(p => p.id === fbP.id);
          return { ...fbP, dataUrl: fbP.driveUrl ? '' : (local?.dataUrl ?? '') };
        });
        set({ contractorPhotos: merged }); persist(get);
      }),
      fsListen(col('officeNoteFiles'), (docs) => {
        const localF = get().officeNoteFiles;
        const merged = (docs as unknown as OfficeNoteFile[]).map(fbF => {
          const local = localF.find(f => f.id === fbF.id);
          return { ...fbF, dataUrl: local?.dataUrl ?? '' };
        });
        set({ officeNoteFiles: merged }); persist(get);
      }),
      fsListen(col('canvasElements'), (docs) => {
        set({ canvasElements: (docs as unknown as CanvasElement[]).filter(e => !_tombstones.has(e.id)) });
        persist(get);
      }),
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
      fsListen(col('planPins'), (docs) => {
        set({ planPins: docs as unknown as PlanPin[] });
        persist(get);
      }),
      fsListen(col('planAnnotations'), (docs) => {
        set({ planAnnotations: docs as unknown as PlanAnnotation[] });
        persist(get);
      }),
      fsListen('stages', (docs) => {
        if (docs.length > 0) { set({ stages: docs as unknown as Stage[] }); persist(get); }
      }),
      fsListen('users', (docs) => {
        if (docs.length > 0) { set({ users: docs as unknown as User[] }); persist(get); }
      }),
      fsListen('settings', (docs) => {
        const appS = (docs.find(d => (d as Record<string,unknown>).id === 'app') ?? {}) as Record<string, unknown>;
        set(state => ({
          ...(appS.backupFrequency      ? { backupFrequency:      appS.backupFrequency as BackupFrequency }      : {}),
          ...(appS.backupDriveFolderLink !== undefined ? { backupDriveFolderLink: appS.backupDriveFolderLink as string } : {}),
          ...(appS.contractorUiStrings  ? { contractorUiStrings:  appS.contractorUiStrings as ContractorUiStrings } : {}),
          ...(appS.autoBackup           !== undefined ? { autoBackup: appS.autoBackup as boolean } : {}),
          ...(appS.mainUiStrings        ? { mainUiStrings: mergeFreshMainUi(appS.mainUiStrings as Partial<MainUiStrings>) } : {}),
          ...(appS.contractorSheetLinks ? { contractorSheetLinks: appS.contractorSheetLinks as Record<string, string> } : {}),
          ...(appS.boardSettings ? { boardSettings: appS.boardSettings as Record<string, BoardSetting> } : {}),
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
        }));
        persist(get);
      }),
    ];
    set({ firebaseSyncError: null });

    // Drive auto-export scheduler — checks every 5 minutes, runs immediately on login
    const DRIVE_THRESHOLDS: Record<string, number> = {
      off: 0, hourly: 3_600_000, every5h: 18_000_000, every12h: 43_200_000, daily: 86_400_000, weekly: 604_800_000,
    };
    function checkDriveExport() {
      const { driveExportFrequency, lastDriveExportAt, backupDriveFolderLink } = get();
      if (driveExportFrequency === 'off' || !backupDriveFolderLink) return;
      const threshold = DRIVE_THRESHOLDS[driveExportFrequency] ?? 0;
      if (threshold === 0) return;
      const last = lastDriveExportAt ? new Date(lastDriveExportAt).getTime() : 0;
      if (Date.now() - last >= threshold) get().exportToDrive();
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
