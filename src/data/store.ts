import { create } from 'zustand';
import { Apartment, ActivityLog, Stage, StageNote, User, Building } from '../types';
import {
  DEFAULT_BUILDINGS, DEFAULT_STAGES, DEFAULT_USERS, buildDefaultApartments, DATA_VERSION,
} from './initialData';
import { fsSet, fsBatchSet, fsGetAll, fsListen, isFirebaseConfigured } from './firebase';

const STORAGE_KEY = 'wolfson_app_data';
const VERSION_KEY = 'wolfson_app_version';
const THEME_KEY = 'wolfson_theme';

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

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
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

const defaultData = {
  dataVersion: DATA_VERSION,
  currentUser: null as User | null,
  users: DEFAULT_USERS,
  buildings: DEFAULT_BUILDINGS,
  stages: DEFAULT_STAGES,
  apartments: buildDefaultApartments(),
  stageNotes: [] as StageNote[],
  activityLogs: [] as ActivityLog[],
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
  lightTheme: boolean;
  setLightTheme: (v: boolean) => void;

  login: (code: string) => User | null;
  logout: () => void;

  updateApartment: (id: string, changes: Partial<Apartment>, user: User) => void;
  addApartment: (apt: Apartment) => void;

  upsertStageNote: (apartmentId: string, stageId: string, noteText: string, user: User) => void;
  getStageNote: (apartmentId: string, stageId: string) => StageNote | undefined;

  updateStage: (id: string, changes: Partial<Stage>) => void;
  addStage: (stage: Stage) => void;
  deleteStage: (id: string) => void;

  updateUser: (id: string, changes: Partial<User>) => void;
  addUser: (user: User) => void;

  addActivityLog: (log: Omit<ActivityLog, 'id' | 'createdAt'>) => void;

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
  firebaseListening: false,
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
    set({ currentUser: null });
    persist(get);
  },

  updateApartment: (id, changes, user) => {
    const existing = get().apartments.find(a => a.id === id);
    if (!existing) return;
    const now = new Date().toISOString();
    const updated: Apartment = {
      ...existing,
      ...changes,
      updatedAt: now,
      updatedBy: user.id,
      updatedByName: user.name,
    };
    set(state => ({ apartments: state.apartments.map(a => a.id === id ? updated : a) }));
    persist(get);

    // Firebase sync
    fsSet('apartments', id, updated);

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
    set(state => ({
      stages: state.stages.filter(s => s.id !== id),
      apartments: state.apartments.map(a => a.currentStageId === id ? { ...a, currentStageId: null } : a),
    }));
    persist(get);
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
    set(state => ({ activityLogs: [entry, ...state.activityLogs].slice(0, 500) }));
    persist(get);
    fsSet('activityLogs', entry.id, entry);
  },

  startFirebaseSync: async () => {
    if (get().firebaseListening) return;
    set({ firebaseListening: true });

    // Load existing data from Firestore
    const [fbApts, fbStageNotes, fbStages, fbUsers, fbLogs] = await Promise.all([
      fsGetAll('apartments'),
      fsGetAll('stageNotes'),
      fsGetAll('stages'),
      fsGetAll('users'),
      fsGetAll('activityLogs'),
    ]);

    if (fbApts.length > 0 || fbStageNotes.length > 0) {
      set(state => ({
        apartments: fbApts.length > 0 ? (fbApts as unknown as Apartment[]) : state.apartments,
        stageNotes: fbStageNotes.length > 0 ? (fbStageNotes as unknown as StageNote[]) : state.stageNotes,
        stages: fbStages.length > 0 ? (fbStages as unknown as Stage[]) : state.stages,
        users: fbUsers.length > 0 ? (fbUsers as unknown as User[]) : state.users,
        activityLogs: fbLogs.length > 0
          ? (fbLogs as unknown as ActivityLog[]).sort((a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            ).slice(0, 500)
          : state.activityLogs,
      }));
      persist(get);
    } else {
      // First time: push local data to Firebase
      const state = get();
      await fsBatchSet('apartments', state.apartments.map(a => ({ id: a.id, data: a })));
      await fsBatchSet('stages', state.stages.map(s => ({ id: s.id, data: s })));
      await fsBatchSet('users', state.users.map(u => ({ id: u.id, data: u })));
    }

    // Real-time listeners
    fsListen('apartments', (docs) => {
      if (docs.length > 0) {
        set({ apartments: docs as unknown as Apartment[] });
        persist(get);
      }
    });

    fsListen('stageNotes', (docs) => {
      set({ stageNotes: docs as unknown as StageNote[] });
      persist(get);
    });

    fsListen('activityLogs', (docs) => {
      const sorted = (docs as unknown as ActivityLog[])
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 500);
      set({ activityLogs: sorted });
      persist(get);
    });
  },

  applyFirebaseData: (data) => {
    set(data);
    persist(get);
  },
}));

function persist(get: () => AppState) {
  const state = get();
  saveToStorage(STORAGE_KEY, {
    currentUser: state.currentUser,
    users: state.users,
    stages: state.stages,
    apartments: state.apartments,
    stageNotes: state.stageNotes,
    activityLogs: state.activityLogs,
  });
}
