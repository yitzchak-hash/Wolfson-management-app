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

export interface ShinuiDetail {
  description: string;
  requestedBy: string;
  notes: string;
  dateOfChange: string;
}

export interface Apartment {
  id: string;
  buildingId: BuildingId;
  apartmentNumber: string;
  displayName: string;
  floor: number;
  currentStageId: string | null;
  classification: Classification;
  shinuiDetails: ShinuiDetail | null;
  generalNotes: string;
  isUnnamed: boolean;
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
