import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Apartment, ActivityLog, Stage, StageNote, User, Building } from '../types';
import { DEFAULT_BUILDINGS, DEFAULT_STAGES, DEFAULT_USERS, buildDefaultApartments } from './initialData';

interface AppState {
  currentUser: User | null;
  users: User[];
  buildings: Building[];
  stages: Stage[];
  apartments: Apartment[];
  stageNotes: StageNote[];
  activityLogs: ActivityLog[];

  // Auth
  login: (code: string) => User | null;
  logout: () => void;

  // Apartments
  updateApartment: (id: string, changes: Partial<Apartment>, user: User) => void;
  addApartment: (apt: Apartment) => void;

  // Stage notes
  upsertStageNote: (apartmentId: string, stageId: string, noteText: string, user: User) => void;
  getStageNote: (apartmentId: string, stageId: string) => StageNote | undefined;

  // Stages
  updateStage: (id: string, changes: Partial<Stage>) => void;
  addStage: (stage: Stage) => void;
  deleteStage: (id: string) => void;

  // Users
  updateUser: (id: string, changes: Partial<User>) => void;
  addUser: (user: User) => void;

  // Activity
  addActivityLog: (log: Omit<ActivityLog, 'id' | 'createdAt'>) => void;
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

const defaultData = {
  currentUser: null,
  users: DEFAULT_USERS,
  buildings: DEFAULT_BUILDINGS,
  stages: DEFAULT_STAGES,
  apartments: buildDefaultApartments(),
  stageNotes: [] as StageNote[],
  activityLogs: [] as ActivityLog[],
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...defaultData,

      login: (code: string) => {
        const user = get().users.find(u => u.code === code && u.active);
        if (user) {
          set({ currentUser: user });
        }
        return user ?? null;
      },

      logout: () => set({ currentUser: null }),

      updateApartment: (id, changes, user) => {
        const existing = get().apartments.find(a => a.id === id);
        if (!existing) return;

        const now = new Date().toISOString();
        const updated = {
          ...existing,
          ...changes,
          updatedAt: now,
          updatedBy: user.id,
          updatedByName: user.name,
        };

        set(state => ({
          apartments: state.apartments.map(a => a.id === id ? updated : a),
        }));

        // Log relevant changes
        const loggable: Array<keyof Apartment> = ['currentStageId', 'classification', 'generalNotes', 'displayName', 'shinuiDetails'];
        loggable.forEach(field => {
          const prev = existing[field];
          const next = updated[field];
          if (JSON.stringify(prev) !== JSON.stringify(next)) {
            const stages = get().stages;
            const prevStage = field === 'currentStageId' ? stages.find(s => s.id === String(prev))?.name ?? '' : '';
            const nextStage = field === 'currentStageId' ? stages.find(s => s.id === String(next))?.name ?? '' : '';
            get().addActivityLog({
              userId: user.id,
              userName: user.name,
              buildingId: existing.buildingId,
              apartmentId: id,
              apartmentNumber: existing.displayName || existing.apartmentNumber || id,
              actionType: 'update',
              fieldChanged: field,
              previousValue: field === 'currentStageId' ? (prevStage || 'Not started') : String(prev ?? ''),
              newValue: field === 'currentStageId' ? (nextStage || 'Not started') : String(next ?? ''),
              stageId: field === 'currentStageId' ? String(next ?? '') : '',
            });
          }
        });
      },

      addApartment: (apt) => {
        set(state => ({ apartments: [...state.apartments, apt] }));
      },

      upsertStageNote: (apartmentId, stageId, noteText, user) => {
        const now = new Date().toISOString();
        const existing = get().stageNotes.find(n => n.apartmentId === apartmentId && n.stageId === stageId);
        const prevText = existing?.noteText ?? '';

        if (existing) {
          set(state => ({
            stageNotes: state.stageNotes.map(n =>
              n.apartmentId === apartmentId && n.stageId === stageId
                ? { ...n, noteText, updatedAt: now, updatedBy: user.id, updatedByName: user.name }
                : n
            ),
          }));
        } else {
          const note: StageNote = {
            id: generateId(),
            apartmentId,
            stageId,
            noteText,
            updatedAt: now,
            updatedBy: user.id,
            updatedByName: user.name,
          };
          set(state => ({ stageNotes: [...state.stageNotes, note] }));
        }

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
      },

      addStage: (stage) => {
        set(state => ({ stages: [...state.stages, stage] }));
      },

      deleteStage: (id) => {
        set(state => ({
          stages: state.stages.filter(s => s.id !== id),
          apartments: state.apartments.map(a => a.currentStageId === id ? { ...a, currentStageId: null } : a),
        }));
      },

      updateUser: (id, changes) => {
        set(state => ({
          users: state.users.map(u => u.id === id ? { ...u, ...changes } : u),
          currentUser: state.currentUser?.id === id ? { ...state.currentUser, ...changes } : state.currentUser,
        }));
      },

      addUser: (user) => {
        set(state => ({ users: [...state.users, user] }));
      },

      addActivityLog: (log) => {
        const entry: ActivityLog = {
          ...log,
          id: generateId(),
          createdAt: new Date().toISOString(),
        };
        set(state => ({
          activityLogs: [entry, ...state.activityLogs].slice(0, 500),
        }));
      },
    }),
    {
      name: 'wolfson_app_data',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
