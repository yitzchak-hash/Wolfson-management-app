import { create } from 'zustand';
import { Apartment, ActivityLog, Stage, StageNote, User, Building, Contractor, ContractorAssignment, ContractorNote, ContractorPhoto, BackupSnapshot, DataSummary, OfficeNoteFile, BackupFrequency, BackupLogEntry, ContractorUiStrings, DEFAULT_CONTRACTOR_UI_STRINGS } from '../types';
import {
  DEFAULT_BUILDINGS, DEFAULT_STAGES, DEFAULT_USERS, buildDefaultApartments, DATA_VERSION,
} from './initialData';
import { fsSet, fsDelete, fsDeleteFile, fsBatchSet, fsGetAll, fsListen, isFirebaseConfigured, db } from './firebase';

const STORAGE_KEY = 'wolfson_app_data';
const VERSION_KEY = 'wolfson_app_version';
const THEME_KEY = 'wolfson_theme';

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
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(VERSION_KEY, String(DATA_VERSION));
    return true; // was reset
  }
  return false;
}

checkAndMigrateData();

const stored = loadFromStorage(STORAGE_KEY, null) as Record<string, unknown> | null;

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const defaultData = {
  dataVersion: DATA_VERSION,
  currentUser: null as User | null,
  users: DEFAULT_USERS,
  buildings: DEFAULT_BUILDINGS,
  stages: DEFAULT_STAGES,
  apartments: buildDefaultApartments(),
  stageNotes: [] as StageNote[],
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

  updateApartment: (id: string, changes: Partial<Apartment>, user: User) => void;
  bulkUpdateApartments: (ids: string[], changes: Partial<Apartment>, user: User) => void;
  addApartment: (apt: Apartment) => void;

  upsertStageNote: (apartmentId: string, stageId: string, noteText: string, user: User) => void;
  getStageNote: (apartmentId: string, stageId: string) => StageNote | undefined;

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
  totalStorageBytes: number;
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
  setAutoBackup: (v: boolean) => void;
  setBackupFrequency: (f: BackupFrequency) => void;
  setBackupDriveFolder: (url: string) => void;
  addBackupLog: (entry: Omit<BackupLogEntry, 'id' | 'createdAt'>) => void;
  restoreFromSnapshot: (snapshotId: string) => void;
  getDataSummary: () => DataSummary;

  // Contractor UI language strings
  contractorUiStrings: ContractorUiStrings;
  updateContractorUiStrings: (partial: Partial<ContractorUiStrings>) => void;

  // Office note files
  addOfficeNoteFile: (f: Omit<OfficeNoteFile, 'id' | 'uploadedAt'>) => void;
  deleteOfficeNoteFile: (id: string) => void;

  // Backup / restore
  exportData: () => string;
  importData: (json: string) => { ok: boolean; error?: string; summary?: DataSummary };

  // Firebase sync
  startFirebaseSync: () => void;
  applyFirebaseData: (data: Partial<AppState>) => void;
}

export const useStore = create<AppState>((set, get) => ({
  dataVersion: DATA_VERSION,
  currentUser: stored?.currentUser as User | null ?? null,
  users: (stored?.users as User[] | null) ?? defaultData.users,
  buildings: defaultData.buildings,
  stages: (stored?.stages as Stage[] | null) ?? defaultData.stages,
  apartments: (stored?.apartments as Apartment[] | null) ?? defaultData.apartments,
  stageNotes: (stored?.stageNotes as StageNote[] | null) ?? [],
  activityLogs: (stored?.activityLogs as ActivityLog[] | null) ?? [],
  contractors: (stored?.contractors as Contractor[] | null) ?? [],
  contractorAssignments: (stored?.contractorAssignments as ContractorAssignment[] | null) ?? [],
  contractorNotes: (stored?.contractorNotes as ContractorNote[] | null) ?? [],
  contractorPhotos: (stored?.contractorPhotos as ContractorPhoto[] | null) ?? [],
  officeNoteFiles: (stored?.officeNoteFiles as OfficeNoteFile[] | null) ?? [],
  firebaseListening: false,
  firebaseSyncError: null,
  googleClientId: (stored?.googleClientId as string | null) ?? '',
  googleAccessToken: null,
  googleTokenExpiry: null,
  autoBackup: (stored?.autoBackup as boolean | null) ?? false,
  backupFrequency: (stored?.backupFrequency as BackupFrequency | null) ?? 'activity',
  lastAutoBackupAt: (stored?.lastAutoBackupAt as string | null) ?? null,
  backupSnapshots: (stored?.backupSnapshots as BackupSnapshot[] | null) ?? [],
  backupLogs: (stored?.backupLogs as BackupLogEntry[] | null) ?? [],
  backupDriveFolderLink: (stored?.backupDriveFolderLink as string | null) ?? '',
  contractorUiStrings: (stored?.contractorUiStrings as ContractorUiStrings | null) ?? DEFAULT_CONTRACTOR_UI_STRINGS,
  totalStorageBytes: (stored?.totalStorageBytes as number | null) ?? 0,
  lightTheme: localStorage.getItem(THEME_KEY) === 'light',
  setLightTheme: (v: boolean) => {
    set({ lightTheme: v });
    localStorage.setItem(THEME_KEY, v ? 'light' : 'dark');
  },

  login: (code: string) => {
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
    const syncedFields = ['currentStageId', 'classification', 'driveLink', 'plansPdfLink'] as const;
    const changesHaveSync = syncedFields.some(f => f in changes);
    if (changesHaveSync && updated.mergedWith) {
      const partner = get().apartments.find(a => a.id === updated.mergedWith);
      if (partner) {
        const partnerPatch: Partial<Apartment> = {};
        if ('currentStageId' in changes) partnerPatch.currentStageId = updated.currentStageId;
        if ('classification' in changes) partnerPatch.classification = updated.classification;
        if ('driveLink' in changes) partnerPatch.driveLink = updated.driveLink;
        if ('plansPdfLink' in changes) partnerPatch.plansPdfLink = updated.plansPdfLink;
        const needsUpdate = Object.keys(partnerPatch).some(k =>
          JSON.stringify(partner[k as keyof Apartment]) !== JSON.stringify(partnerPatch[k as keyof Apartment])
        );
        if (needsUpdate) {
          extraUpdates = [{ ...partner, ...partnerPatch, updatedAt: now, updatedBy: user.id, updatedByName: user.name }];
        }
      }
    }

    set(state => ({
      apartments: state.apartments.map(a => {
        if (a.id === id) return updated;
        const extra = extraUpdates.find(e => e.id === a.id);
        return extra ?? a;
      }),
    }));
    persist(get);

    // Firebase sync
    fsSet('apartments', id, updated);
    extraUpdates.forEach(e => fsSet('apartments', e.id, e));

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
    updated.filter(a => ids.includes(a.id)).forEach(a => fsSet('apartments', a.id, a));
  },

  addApartment: (apt) => {
    set(state => ({ apartments: [...state.apartments, apt] }));
    persist(get);
    fsSet('apartments', apt.id, apt);
  },

  upsertStageNote: (apartmentId, stageId, noteText, user) => {
    const now = new Date().toISOString();
    const existing = get().stageNotes.find(n => n.apartmentId === apartmentId && n.stageId === stageId);
    const prevText = existing?.noteText ?? '';

    let note: StageNote;
    if (existing) {
      note = { ...existing, noteText, updatedAt: now, updatedBy: user.id, updatedByName: user.name };
      set(state => ({
        stageNotes: state.stageNotes.map(n =>
          n.apartmentId === apartmentId && n.stageId === stageId ? note : n
        ),
      }));
    } else {
      note = { id: generateId(), apartmentId, stageId, noteText, updatedAt: now, updatedBy: user.id, updatedByName: user.name };
      set(state => ({ stageNotes: [...state.stageNotes, note] }));
    }
    persist(get);
    fsSet('stageNotes', note.id, note);

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
      .forEach(a => fsSet('apartments', a.id, a));
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
    updates.forEach((updated, id) => fsSet('apartments', id, updated));
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
    updates.forEach((updated, id) => fsSet('apartments', id, updated));
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
    fsDelete('contractors', id);
    assignmentIds.forEach(aid => fsDelete('contractorAssignments', aid));
    noteIds.forEach(nid => fsDelete('contractorNotes', nid));
    photoIds.forEach(pid => fsDelete('contractorPhotos', pid));
  },

  addContractorAssignment: (fields) => {
    const a: ContractorAssignment = { ...fields, id: generateId(), createdAt: new Date().toISOString() };
    set(state => ({ contractorAssignments: [...state.contractorAssignments, a] }));
    persist(get);
    // Strip attachment dataUrls before Firestore (keep metadata only)
    const aForFs = { ...a, attachments: a.attachments?.map(att => ({ ...att, dataUrl: '' })) };
    fsSet('contractorAssignments', a.id, aForFs);
  },

  updateContractorAssignment: (id, changes) => {
    set(state => ({
      contractorAssignments: state.contractorAssignments.map(a => a.id === id ? { ...a, ...changes } : a),
    }));
    persist(get);
    const updated = get().contractorAssignments.find(a => a.id === id);
    if (updated) {
      const updForFs = { ...updated, attachments: updated.attachments?.map(att => ({ ...att, dataUrl: '' })) };
      fsSet('contractorAssignments', id, updForFs);
    }
  },

  deleteContractorAssignment: (id) => {
    const state = get();
    const noteIds = state.contractorNotes.filter(n => n.assignmentId === id).map(n => n.id);
    const photoIds = state.contractorPhotos.filter(p => p.assignmentId === id).map(p => p.id);
    set(s => ({
      contractorAssignments: s.contractorAssignments.filter(a => a.id !== id),
      contractorNotes: s.contractorNotes.filter(n => n.assignmentId !== id),
      contractorPhotos: s.contractorPhotos.filter(p => p.assignmentId !== id),
    }));
    persist(get);
    fsDelete('contractorAssignments', id);
    noteIds.forEach(nid => fsDelete('contractorNotes', nid));
    photoIds.forEach(pid => fsDelete('contractorPhotos', pid));
  },

  addContractorNote: (fields) => {
    const n: ContractorNote = { ...fields, id: generateId(), createdAt: new Date().toISOString() };
    set(state => ({ contractorNotes: [...state.contractorNotes, n] }));
    persist(get);
    fsSet('contractorNotes', n.id, { ...n, attachmentDataUrl: undefined });
  },

  addContractorPhoto: (fields) => {
    const p: ContractorPhoto = { ...fields, id: generateId(), uploadedAt: new Date().toISOString() };
    set(state => ({
      contractorPhotos: [...state.contractorPhotos, p],
      totalStorageBytes: state.totalStorageBytes + (fields.fileSizeBytes ?? 0),
    }));
    persist(get);
    // Store metadata only in Firestore — dataUrl stays local
    fsSet('contractorPhotos', p.id, { ...p, dataUrl: '' });
    fsSet('settings', 'app', { totalStorageBytes: get().totalStorageBytes });
    return p.id;
  },

  updateContractorPhoto: (id, changes) => {
    set(state => ({
      contractorPhotos: state.contractorPhotos.map(p => p.id === id ? { ...p, ...changes } : p),
    }));
    persist(get);
    const updated = get().contractorPhotos.find(p => p.id === id);
    if (updated) fsSet('contractorPhotos', id, { ...updated, dataUrl: '' });
  },

  deleteContractorPhoto: (id) => {
    const photo = get().contractorPhotos.find(p => p.id === id);
    set(state => ({
      contractorPhotos: state.contractorPhotos.filter(p => p.id !== id),
      totalStorageBytes: Math.max(0, state.totalStorageBytes - (photo?.fileSizeBytes ?? 0)),
    }));
    persist(get);
    fsDelete('contractorPhotos', id);
    if (photo?.storagePath) fsDeleteFile(photo.storagePath);
    fsSet('settings', 'app', { totalStorageBytes: get().totalStorageBytes });
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
      activityLogs: state.activityLogs,
      contractors: state.contractors,
      contractorAssignments: state.contractorAssignments,
      contractorNotes: state.contractorNotes,
      contractorPhotos: state.contractorPhotos,
      officeNoteFiles: state.officeNoteFiles,
    };
    return JSON.stringify(snapshot, null, 2);
  },

  importData: (json) => {
    try {
      const data = JSON.parse(json);
      if (!data.apartments || !data.stages) {
        return { ok: false, error: 'Invalid backup file — missing required fields.' };
      }
      set({
        users: data.users ?? get().users,
        stages: data.stages,
        apartments: data.apartments,
        stageNotes: data.stageNotes ?? [],
        activityLogs: data.activityLogs ?? [],
        contractors: data.contractors ?? [],
        contractorAssignments: data.contractorAssignments ?? [],
        contractorNotes: data.contractorNotes ?? [],
        contractorPhotos: data.contractorPhotos ?? [],
        officeNoteFiles: data.officeNoteFiles ?? [],
      });
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
      };
      return {
        activityLogs: newLogs,
        backupSnapshots: [snapshot, ...state.backupSnapshots],
        lastAutoBackupAt: entry.createdAt,
      };
    });
    persist(get);
    fsSet('activityLogs', entry.id, entry);
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

  addOfficeNoteFile: (fields) => {
    const f: OfficeNoteFile = { ...fields, id: generateId(), uploadedAt: new Date().toISOString() };
    set(state => ({ officeNoteFiles: [...state.officeNoteFiles, f] }));
    persist(get);
    // dataUrl stays local; only metadata goes to Firestore
    fsSet('officeNoteFiles', f.id, { ...f, dataUrl: '' });
  },

  deleteOfficeNoteFile: (id) => {
    set(state => ({ officeNoteFiles: state.officeNoteFiles.filter(f => f.id !== id) }));
    persist(get);
    fsDelete('officeNoteFiles', id);
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

    // Load all collections from Firestore in parallel
    const [
      fbApts, fbStageNotes, fbStages, fbUsers, fbLogs,
      fbContractors, fbAssignments, fbNotes, fbPhotos, fbOfficeFiles, fbSettings,
    ] = await Promise.all([
      fsGetAll('apartments'),
      fsGetAll('stageNotes'),
      fsGetAll('stages'),
      fsGetAll('users'),
      fsGetAll('activityLogs'),
      fsGetAll('contractors'),
      fsGetAll('contractorAssignments'),
      fsGetAll('contractorNotes'),
      fsGetAll('contractorPhotos'),
      fsGetAll('officeNoteFiles'),
      fsGetAll('settings'),
    ]);

    const hasFirebaseData = fbApts.length > 0 || fbContractors.length > 0 || fbAssignments.length > 0
      || fbStages.length > 0 || fbUsers.length > 0;

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

      set(state => ({
        apartments:            fbApts.length > 0        ? (fbApts as unknown as Apartment[])   : state.apartments,
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
        ...(appSettings.backupFrequency      ? { backupFrequency:      appSettings.backupFrequency as BackupFrequency }      : {}),
        ...(appSettings.backupDriveFolderLink !== undefined ? { backupDriveFolderLink: appSettings.backupDriveFolderLink as string } : {}),
        ...(appSettings.contractorUiStrings  ? { contractorUiStrings:  appSettings.contractorUiStrings as ContractorUiStrings } : {}),
        ...(appSettings.autoBackup           !== undefined ? { autoBackup: appSettings.autoBackup as boolean } : {}),
        ...(appSettings.totalStorageBytes    !== undefined ? { totalStorageBytes: appSettings.totalStorageBytes as number } : {}),
      }));
      persist(get);
    } else {
      // First run — push everything from localStorage to Firestore
      const state = get();
      await Promise.all([
        fsBatchSet('apartments',  state.apartments.map(a => ({ id: a.id, data: a }))),
        fsBatchSet('stages',      state.stages.map(s => ({ id: s.id, data: s }))),
        fsBatchSet('users',       state.users.map(u => ({ id: u.id, data: u }))),
        state.stageNotes.length > 0
          ? fsBatchSet('stageNotes', state.stageNotes.map(n => ({ id: n.id, data: n })))
          : Promise.resolve(),
        state.contractors.length > 0
          ? fsBatchSet('contractors', state.contractors.map(c => ({ id: c.id, data: c })))
          : Promise.resolve(),
        state.contractorAssignments.length > 0
          ? fsBatchSet('contractorAssignments', state.contractorAssignments.map(a => ({
              id: a.id,
              data: { ...a, attachments: a.attachments?.map(att => ({ ...att, dataUrl: '' })) },
            })))
          : Promise.resolve(),
        state.contractorNotes.length > 0
          ? fsBatchSet('contractorNotes', state.contractorNotes.map(n => ({ id: n.id, data: n })))
          : Promise.resolve(),
        state.contractorPhotos.length > 0
          ? fsBatchSet('contractorPhotos', state.contractorPhotos.map(p => ({ id: p.id, data: { ...p, dataUrl: '' } })))
          : Promise.resolve(),
        state.officeNoteFiles.length > 0
          ? fsBatchSet('officeNoteFiles', state.officeNoteFiles.map(f => ({ id: f.id, data: { ...f, dataUrl: '' } })))
          : Promise.resolve(),
        fsSet('settings', 'app', {
          autoBackup:            state.autoBackup,
          backupFrequency:       state.backupFrequency,
          backupDriveFolderLink: state.backupDriveFolderLink,
          contractorUiStrings:   state.contractorUiStrings,
          totalStorageBytes:     state.totalStorageBytes,
        }),
      ]);
    }

    // ── Real-time listeners for all collections ──────────────────────────────
    // Store every unsubscribe fn so logout() can cancel them cleanly.
    _firebaseUnsubscribers = [
      fsListen('apartments', (docs) => {
        if (docs.length > 0) { set({ apartments: docs as unknown as Apartment[] }); persist(get); }
      }),
      fsListen('stageNotes', (docs) => {
        set({ stageNotes: docs as unknown as StageNote[] }); persist(get);
      }),
      fsListen('activityLogs', (docs) => {
        const sorted = (docs as unknown as ActivityLog[])
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 500);
        set({ activityLogs: sorted }); persist(get);
      }),
      fsListen('contractors', (docs) => {
        set({ contractors: docs as unknown as Contractor[] }); persist(get);
      }),
      fsListen('contractorAssignments', (docs) => {
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
      fsListen('contractorNotes', (docs) => {
        set({ contractorNotes: docs as unknown as ContractorNote[] }); persist(get);
      }),
      fsListen('contractorPhotos', (docs) => {
        const localP = get().contractorPhotos;
        const merged = (docs as unknown as ContractorPhoto[]).map(fbP => {
          const local = localP.find(p => p.id === fbP.id);
          return { ...fbP, dataUrl: fbP.driveUrl ? '' : (local?.dataUrl ?? '') };
        });
        set({ contractorPhotos: merged }); persist(get);
      }),
      fsListen('officeNoteFiles', (docs) => {
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
          ...(appS.totalStorageBytes    !== undefined ? { totalStorageBytes: appS.totalStorageBytes as number } : {}),
        }));
        persist(get);
      }),
    ];
    set({ firebaseSyncError: null });
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

  // Strip base64 from photos already on Drive (driveUrl is the source of truth)
  const photosLean = state.contractorPhotos.map(p =>
    p.driveUrl ? { ...p, dataUrl: '' } : p
  );

  const payload = {
    currentUser: state.currentUser,
    users: state.users,
    stages: state.stages,
    apartments: state.apartments,
    stageNotes: state.stageNotes,
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
    contractorUiStrings: state.contractorUiStrings,
    totalStorageBytes: state.totalStorageBytes,
  };

  const ok = saveToStorage(STORAGE_KEY, payload);
  if (!ok) {
    // Quota still exceeded — strip all binary data and try again
    saveToStorage(STORAGE_KEY, {
      ...payload,
      contractorPhotos: state.contractorPhotos.map(p => ({ ...p, dataUrl: '' })),
      officeNoteFiles: state.officeNoteFiles.map(f => ({ ...f, dataUrl: '' })),
      backupSnapshots: [],
      activityLogs: state.activityLogs.slice(0, 50),
    });
  }
}
