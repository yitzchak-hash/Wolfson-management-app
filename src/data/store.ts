import { create } from 'zustand';
import { Apartment, CanvasElement, ActivityLog, Project, Stage, StageNote, StageNoteAttachment, StageNoteVersion, GeneralNoteVersion, User, Building, Contractor, ContractorAssignment, ContractorNote, ContractorPhoto, BackupSnapshot, DataSummary, OfficeNoteFile, BackupFrequency, DriveExportFrequency, BackupLogEntry, ContractorUiStrings, DEFAULT_CONTRACTOR_UI_STRINGS, MainUiStrings, DEFAULT_MAIN_UI_STRINGS, HEBREW_MAIN_UI_STRINGS } from '../types';

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
import { fsSet, fsDelete, fsBatchSet, fsGetAll, fsListen, isFirebaseConfigured, db, projectCollection } from './firebase';

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
}
export function loadAllProjectsTaskData(): ProjectTaskData[] {
  return DEFAULT_PROJECTS.map(p => {
    const data = loadFromStorage(getProjectStorageKey(p.id), null) as Record<string, unknown> | null;
    return {
      projectId: p.id,
      assignments: (data?.contractorAssignments as ContractorAssignment[] | null) ?? [],
      apartments: (data?.apartments as Apartment[] | null) ?? [],
    };
  });
}

// Holds unsubscribe functions for all active Firestore real-time listeners.
// Stored outside the Zustand state (not serializable) so they survive re-renders.
let _firebaseUnsubscribers: Array<() => void> = [];

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

function getDefaultBuildings(projectId: string): Building[] {
  if (projectId === 'netiv') return NETIV_BUILDINGS;
  if (projectId === 'general') return [];
  return DEFAULT_BUILDINGS;
}

function getDefaultApartments(projectId: string): Apartment[] {
  if (projectId === 'netiv') return buildNetivApartments();
  if (projectId === 'general') return [];
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
  deleteApartment: (id: string) => void;

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

  // Dashboard layout customization
  dashboardWidgetOrder: string[];
  dashboardHiddenWidgets: string[];
  setDashboardLayout: (order: string[], hidden: string[]) => void;

  // Contractor status spreadsheet — one link per project, synced via settings/app
  contractorSheetLinks: Record<string, string>;
  setContractorSheetLink: (url: string) => void;

  // Multi-project support
  currentProjectId: string;
  projects: Project[];
  setCurrentProject: (id: string) => void;

  // General Jobs canvas elements (sticky notes, section boxes)
  canvasElements: CanvasElement[];
  addCanvasElement: (el: CanvasElement) => void;
  updateCanvasElement: (id: string, changes: Partial<CanvasElement>) => void;
  deleteCanvasElement: (id: string) => void;
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
  dashboardWidgetOrder: (stored?.dashboardWidgetOrder as string[] | null) ?? ['apt-stats', 'task-stats', 'stage-progress', 'building-progress', 'activity'],
  dashboardHiddenWidgets: (stored?.dashboardHiddenWidgets as string[] | null) ?? [],
  contractorSheetLinks: (stored?.contractorSheetLinks as Record<string, string> | null) ?? {},
  currentProjectId: _activeProjectId,
  projects: DEFAULT_PROJECTS,
  lightTheme: localStorage.getItem(THEME_KEY) !== 'dark',
  setPendingOpenAptId: (id: string | null) => {
    set({ pendingOpenAptId: id });
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
    const defaultBuildings = id === 'netiv' ? NETIV_BUILDINGS : id === 'general' ? [] : DEFAULT_BUILDINGS;
    const defaultApartments = id === 'netiv' ? buildNetivApartments() : id === 'general' ? [] : buildDefaultApartments();

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
    };

    // Cancel existing Firebase listeners and switch project
    _firebaseUnsubscribers.forEach(u => u());
    _firebaseUnsubscribers = [];

    localStorage.setItem(ACTIVE_PROJECT_KEY, id);

    set({
      currentProjectId: id,
      firebaseListening: false,
      pendingOpenAptId: null,
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

  deleteApartment: (id) => {
    const state = get();
    const pid = state.currentProjectId;

    // Collect all linked records to cascade-delete
    const linkedAssignments = state.contractorAssignments.filter(a => a.apartmentId === id);
    const linkedIds = new Set(linkedAssignments.map(a => a.id));
    const linkedNotes  = state.contractorNotes.filter(n => linkedIds.has(n.assignmentId));
    const linkedPhotos = state.contractorPhotos.filter(p => linkedIds.has(p.assignmentId));
    const linkedStageNotes = state.stageNotes.filter(n => n.apartmentId === id);

    set(st => ({
      apartments:            st.apartments.filter(a => a.id !== id),
      contractorAssignments: st.contractorAssignments.filter(a => a.apartmentId !== id),
      contractorNotes:       st.contractorNotes.filter(n => !linkedIds.has(n.assignmentId)),
      contractorPhotos:      st.contractorPhotos.filter(p => !linkedIds.has(p.assignmentId)),
      stageNotes:            st.stageNotes.filter(n => n.apartmentId !== id),
    }));
    persist(get);

    // Firestore cascade
    fsDelete(projectCollection(pid, 'apartments'), id);
    linkedAssignments.forEach(a => fsDelete(projectCollection(pid, 'contractorAssignments'), a.id));
    linkedNotes.forEach(n  => fsDelete(projectCollection(pid, 'contractorNotes'), n.id));
    linkedPhotos.forEach(p => fsDelete(projectCollection(pid, 'contractorPhotos'), p.id));
    linkedStageNotes.forEach(n => fsDelete(projectCollection(pid, 'stageNotes'), n.id));
  },

  addCanvasElement: (el) => {
    set(state => ({ canvasElements: [...state.canvasElements, el] }));
    persist(get);
  },
  updateCanvasElement: (id, changes) => {
    set(state => ({ canvasElements: state.canvasElements.map(el => el.id === id ? { ...el, ...changes } : el) }));
    persist(get);
  },
  deleteCanvasElement: (id) => {
    set(state => ({ canvasElements: state.canvasElements.filter(el => el.id !== id) }));
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
    const a: ContractorAssignment = { ...fields, id: generateId(), createdAt: new Date().toISOString() };
    set(state => ({ contractorAssignments: [...state.contractorAssignments, a] }));
    persist(get);
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
    set(state => ({
      contractorAssignments: state.contractorAssignments.map(a => a.id === id ? { ...a, ...changes } : a),
    }));
    persist(get);
    const updated = get().contractorAssignments.find(a => a.id === id);
    if (updated) {
      const updForFs = { ...updated, attachments: updated.attachments?.map(att => ({ ...att, dataUrl: '' })) };
      fsSet(projectCollection(get().currentProjectId, 'contractorAssignments'), id, updForFs);
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
      contractorAssignments: state.contractorAssignments,
      contractorNotes: state.contractorNotes,
      contractorPhotos: state.contractorPhotos,
      officeNoteFiles: state.officeNoteFiles,
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
        contractorAssignments: data.contractorAssignments ?? [],
        contractorNotes: data.contractorNotes ?? [],
        contractorPhotos: data.contractorPhotos ?? [],
        officeNoteFiles: data.officeNoteFiles ?? [],
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
      fsSet('settings', 'app', {
        autoBackup: state.autoBackup, backupFrequency: state.backupFrequency,
        backupDriveFolderLink: state.backupDriveFolderLink,
        contractorUiStrings: state.contractorUiStrings,
        mainUiStrings: state.mainUiStrings,
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
      fbStageNoteVersions, fbGeneralNoteVersions,
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
    ]);

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
        ...(appSettings.backupFrequency      ? { backupFrequency:      appSettings.backupFrequency as BackupFrequency }      : {}),
        ...(appSettings.backupDriveFolderLink !== undefined ? { backupDriveFolderLink: appSettings.backupDriveFolderLink as string } : {}),
        ...(appSettings.contractorUiStrings  ? { contractorUiStrings:  appSettings.contractorUiStrings as ContractorUiStrings } : {}),
        ...(appSettings.autoBackup           !== undefined ? { autoBackup: appSettings.autoBackup as boolean } : {}),
        ...(appSettings.mainUiStrings        ? { mainUiStrings: mergeFreshMainUi(appSettings.mainUiStrings as Partial<MainUiStrings>) } : {}),
        ...(appSettings.contractorSheetLinks ? { contractorSheetLinks: appSettings.contractorSheetLinks as Record<string, string> } : {}),
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

      // Seed any apartments that are missing from Firestore (in case the first-run seed was partial)
      const fbAptIds = new Set((fbApts as unknown as Apartment[]).map(a => a.id));
      const missingApts = get().apartments.filter(a => !fbAptIds.has(a.id));
      if (missingApts.length > 0) {
        fsBatchSet(col('apartments'), missingApts.map(a => ({ id: a.id, data: a })));
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
        fsSet('settings', 'app', {
          autoBackup:            state.autoBackup,
          backupFrequency:       state.backupFrequency,
          backupDriveFolderLink: state.backupDriveFolderLink,
          contractorUiStrings:   state.contractorUiStrings,
          mainUiStrings:         state.mainUiStrings,
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
          const updated = state.apartments.map(a => (fbMap.get(a.id) as Apartment | undefined) ?? a);
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

function persist(get: () => AppState) {
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
