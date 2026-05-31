export type Classification = 'standard' | 'shinui';

export type BuildingId = 'A1' | 'A2' | 'A3';

export interface User {
  id: string;
  name: string;
  role: string;
  code: string;
  active: boolean;
  createdAt: string;
}

export interface Building {
  id: BuildingId;
  name: string;
  displayOrder: number;
}

export interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
  active: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface StageNote {
  id: string;
  apartmentId: string;
  stageId: string;
  noteText: string;
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
}

export interface Apartment {
  id: string;
  buildingId: BuildingId;
  apartmentNumber: string;
  displayName: string;
  floor: number;
  colPosition: number;  // 1-4 within the 4-col building grid
  colSpan: number;      // 1 = single col, 2 = spans left or right half
  isDuplexApt: boolean; // true for apts 55-56 (shown on 2 floors)
  currentStageId: string | null;
  classification: Classification;
  shinuiDetails: null; // kept for data compat, form removed from UI
  generalNotes: string;
  isUnnamed: boolean;
  mergedWith?: string; // id of partner apartment when buyer physically connected two units
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  buildingId: string;
  apartmentId: string;
  apartmentNumber: string;
  actionType: string;
  fieldChanged: string;
  previousValue: string;
  newValue: string;
  stageId: string;
  createdAt: string;
}

export interface AppSettings {
  loginCodes: { code: string; userId: string }[];
}
