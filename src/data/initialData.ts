import { Apartment, Building, BuildingId, Stage, User } from '../types';

export const DATA_VERSION = 3; // Bump this to force a reset when data model changes

export const DEFAULT_USERS: User[] = [
  { id: 'u1', name: 'Isaac', role: 'Admin', code: '111111', active: true, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'u2', name: 'Moshe', role: 'Project Manager', code: '222222', active: true, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'u3', name: 'Tzvi', role: 'Technician', code: '333333', active: true, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'u4', name: 'Sarah', role: 'Coordinator', code: '444444', active: true, createdAt: '2024-01-01T00:00:00Z' },
];

export const DEFAULT_BUILDINGS: Building[] = [
  { id: 'A1', name: 'Building A1', displayOrder: 3 },
  { id: 'A2', name: 'Building A2', displayOrder: 2 },
  { id: 'A3', name: 'Building A3', displayOrder: 1 },
];

export const DEFAULT_STAGES: Stage[] = [
  { id: 's1', name: 'Piping', color: '#6366f1', order: 1, active: true, description: 'Pipe installation', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 's2', name: 'Concealed Units Installed', color: '#0ea5e9', order: 2, active: true, description: 'Indoor concealed AC units installed', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 's3', name: 'Inline Fans Installed', color: '#10b981', order: 3, active: true, description: 'Inline fan units installed', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 's4', name: 'Wall Units Installed', color: '#f59e0b', order: 4, active: true, description: 'Wall-mounted units installed', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 's5', name: 'Outdoor Units Installed', color: '#ef4444', order: 5, active: true, description: 'Outdoor compressor units installed', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 's6', name: 'Thermostats & Haffala', color: '#8b5cf6', order: 6, active: true, description: 'Thermostats and control systems', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 's7', name: 'Registers & Access Panels', color: '#14b8a6', order: 7, active: true, description: 'Registers, grilles, and access panels', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
];

// Building layout (A1, A2, A3 are identical in floor structure):
// Each building has apartments numbered 1-56.
// Floor 16:    apts 55 (left) and 56 (right) — 2-wide, no duplexes
// Floor 15:    apts 53 (left half) and 54 (right half)
// Floors 2-14:  4 apts per floor in 4 columns
//   Col 1 (leftmost):  1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49
//   Col 2:             2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50
//   Col 3:             3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51
//   Col 4 (rightmost): 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52
// Floor 1 (first):  unnamed slots 4 per floor, added for user labelling
// Floor 0 (ground): unnamed slots 4 per floor, added for user labelling
// Basement:     -1 to -4 (A1 has -0.5, -1, -2, -3, -4)
// Apt numbering: 1-56 standard, 57+ basement/ground/first in each building
//   A1:  basement 57-76, ground 77-80, first 81-84
//   A2/A3: basement 57-72, ground 73-76, first 77-80

function getFloorForApt(aptNum: number): number {
  if (aptNum >= 55) return 16; // duplex: stored on lower floor (16)
  if (aptNum >= 53) return 15;
  return Math.floor((aptNum - 1) / 4) + 2; // floors 2-14
}

function getColForApt(aptNum: number): number {
  if (aptNum >= 55) return aptNum === 55 ? 1 : 3; // left half or right half
  if (aptNum >= 53) return aptNum === 53 ? 1 : 3;
  return ((aptNum - 1) % 4) + 1;
}

function makeApt(
  buildingId: BuildingId,
  aptNum: number,
  isBlank = false
): Apartment {
  const id = isBlank ? `${buildingId}-BLANK-${aptNum}` : `${buildingId}-${aptNum}`;
  const floor = getFloorForApt(aptNum);
  const col = getColForApt(aptNum);
  return {
    id,
    buildingId,
    apartmentNumber: isBlank ? '' : String(aptNum),
    displayName: isBlank ? '' : String(aptNum),
    floor,
    colPosition: col,
    colSpan: aptNum >= 53 ? 2 : 1,
    isDuplexApt: false,
    currentStageId: null,
    classification: 'standard',
    shinuiDetails: null,
    generalNotes: '',
    isUnnamed: isBlank,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    updatedBy: '',
    updatedByName: '',
  };
}

// Basement slots: 4 per floor, numbered from 57 upward per building.
// A1 has floors: -0.5, -1, -2, -3, -4 (apt nums 57-76)
// A2/A3 have floors: -1, -2, -3, -4 (apt nums 57-72)
// Slots start as unnamed so users can label them (e.g. "Parking 7", "Storage B").
interface BasementFloorDef { floorNum: number; startAptNum: number }
function getBasementFloors(buildingId: BuildingId): BasementFloorDef[] {
  if (buildingId === 'A1') {
    return [
      { floorNum: -0.5, startAptNum: 57 },
      { floorNum: -1,   startAptNum: 61 },
      { floorNum: -2,   startAptNum: 65 },
      { floorNum: -3,   startAptNum: 69 },
      { floorNum: -4,   startAptNum: 73 },
    ];
  }
  return [
    { floorNum: -1, startAptNum: 57 },
    { floorNum: -2, startAptNum: 61 },
    { floorNum: -3, startAptNum: 65 },
    { floorNum: -4, startAptNum: 69 },
  ];
}

function makeUnnamedSlot(bid: BuildingId, aptNum: number, floorNum: number, col: number): Apartment {
  return {
    id: `${bid}-${aptNum}`,
    buildingId: bid,
    apartmentNumber: String(aptNum),
    displayName: '',
    floor: floorNum,
    colPosition: col,
    colSpan: 1,
    isDuplexApt: false,
    currentStageId: null,
    classification: 'standard',
    shinuiDetails: null,
    generalNotes: '',
    isUnnamed: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    updatedBy: '',
    updatedByName: '',
  };
}

export function buildGroundFirstFloorSlots(bid: BuildingId): Apartment[] {
  const groundStart = bid === 'A1' ? 77 : 73;
  const firstStart  = bid === 'A1' ? 81 : 77;
  const slots: Apartment[] = [];
  for (let col = 1; col <= 4; col++) slots.push(makeUnnamedSlot(bid, groundStart + col - 1, 0, col));
  for (let col = 1; col <= 4; col++) slots.push(makeUnnamedSlot(bid, firstStart  + col - 1, 1, col));
  return slots;
}

export function buildDefaultApartments(): Apartment[] {
  const apts: Apartment[] = [];

  const buildings: BuildingId[] = ['A1', 'A2', 'A3'];

  buildings.forEach(bid => {
    // Apts 1-52 (floors 2-14, 4 per floor)
    for (let n = 1; n <= 52; n++) {
      apts.push(makeApt(bid, n));
    }
    // Apts 53-54 (floor 15, 2 per floor)
    apts.push(makeApt(bid, 53));
    apts.push(makeApt(bid, 54));
    // Apts 55-56 (floor 16)
    apts.push(makeApt(bid, 55));
    apts.push(makeApt(bid, 56));

    // Basement slots (unnamed by default — user assigns labels via the drawer)
    getBasementFloors(bid).forEach(({ floorNum, startAptNum }) => {
      for (let col = 1; col <= 4; col++) {
        apts.push(makeUnnamedSlot(bid, startAptNum + col - 1, floorNum, col));
      }
    });

    // Ground floor (0) and first floor (1) unnamed slots
    apts.push(...buildGroundFirstFloorSlots(bid));
  });

  return apts;
}
