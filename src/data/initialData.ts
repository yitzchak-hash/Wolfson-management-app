import { Apartment, Building, BuildingId, Project, Stage, User } from '../types';

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

export const DEFAULT_PROJECTS: Project[] = [
  { id: 'wolfson',  name: 'Wolfson Residence', shortName: 'Wolfson', logoPath: '/wolfson-building.png', color: '#b8860b' },
  { id: 'netiv',    name: 'Netiv Neve Shamir', shortName: 'Netiv',   logoPath: '/netiv-logo.png', color: '#0d9488' },
  // Orange, from the TzviAir mark — the previous violet read as generic app
  // chrome rather than as this company's board.
  // The Job Board is the company's own board, so it wears the company mark
  // rather than a generic briefcase.
  { id: 'general',  name: 'Job Board',         shortName: 'Job Board', logoPath: '/tzviair-logo.png', type: 'general', color: '#ea6b13' },
];

export const NETIV_BUILDINGS: Building[] = [
  { id: 'B1', name: 'Building B1', displayOrder: 1 },
  { id: 'B2', name: 'Building B2', displayOrder: 2 },
];

// Netiv layout (per building, identical for B1 and B2):
//
// Lobby (floor -1):  3 unnamed future slots in cols 1-3
// Floor 0 (Ground):  apt 1 (col 1), empty (col 2)
// Floor 1:  apt 6 (col 1), apt 7 (col 2), duplex apts 2-5 BASE (cols 3-6)
// Floor 2:  duplex apts 2-5 TOP (auto-rendered via isDuplexApt at floor+1), cols 1-2 empty
// Floors 3-8: 4 apts/floor in cols 1-4  (apts 8-31)
// Floor 9:  3 apts (32-34) + 1 empty, cols 1-4
// Floor 10: 2 apts (35-36) + 2 empty, cols 1-4
//
// Total: 36 apartments per building (apt 1-36)
// NOTE: the duplexes physically occupy floors 1-2 (base on 1, top on 2).

function makeNetivApt(bid: BuildingId, aptNum: number, floor: number, col: number, isDuplex = false, isUnnamed = false): Apartment {
  return {
    id: `${bid}-${aptNum}`,
    buildingId: bid,
    apartmentNumber: isUnnamed ? '' : String(aptNum),
    displayName: isUnnamed ? '' : String(aptNum),
    floor,
    colPosition: col,
    colSpan: 1,
    isDuplexApt: isDuplex,
    currentStageId: null,
    classification: 'standard',
    shinuiDetails: null,
    generalNotes: '',
    isUnnamed,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    updatedBy: '',
    updatedByName: '',
  };
}

function makeNetivEmpty(bid: BuildingId, slotId: string, floor: number, col: number): Apartment {
  return {
    id: `${bid}-${slotId}`,
    buildingId: bid,
    apartmentNumber: '',
    displayName: '',
    floor,
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

export function buildNetivApartments(): Apartment[] {
  const apts: Apartment[] = [];

  for (const bid of ['B1', 'B2'] as BuildingId[]) {
    // Lobby (floor -1): 3 unnamed future slots
    for (let col = 1; col <= 3; col++) {
      apts.push(makeNetivEmpty(bid, `lobby-${col}`, -1, col));
    }

    // Floor 0 (Ground): apt 1 (col 1), empty col 2
    apts.push(makeNetivApt(bid, 1, 0, 1));
    apts.push(makeNetivEmpty(bid, 'f0-col2', 0, 2));

    // Floor 1: apt 6 (col 1), apt 7 (col 2), duplex apts 2-5 BASE (cols 3-6)
    // Duplex tops (apts 2-5) appear on floor 2 via isDuplexApt rendering in the diagram
    apts.push(makeNetivApt(bid, 6, 1, 1));
    apts.push(makeNetivApt(bid, 7, 1, 2));
    apts.push(makeNetivApt(bid, 2, 1, 3, true));
    apts.push(makeNetivApt(bid, 3, 1, 4, true));
    apts.push(makeNetivApt(bid, 4, 1, 5, true));
    apts.push(makeNetivApt(bid, 5, 1, 6, true));

    // Floors 3-8: 4 apts per floor (apts 8-31)
    let aptNum = 8;
    for (let floor = 3; floor <= 8; floor++) {
      for (let col = 1; col <= 4; col++) {
        apts.push(makeNetivApt(bid, aptNum++, floor, col));
      }
    }

    // Floor 9: 3 apts + 1 empty (apts 32-34)
    for (let col = 1; col <= 3; col++) {
      apts.push(makeNetivApt(bid, aptNum++, 9, col));
    }
    apts.push(makeNetivEmpty(bid, 'f9-col4', 9, 4));

    // Floor 10: 2 apts + 2 empty (apts 35-36)
    for (let col = 1; col <= 2; col++) {
      apts.push(makeNetivApt(bid, aptNum++, 10, col));
    }
    apts.push(makeNetivEmpty(bid, 'f10-col3', 10, 3));
    apts.push(makeNetivEmpty(bid, 'f10-col4', 10, 4));
  }

  return apts;
}

// Returns the correct floor / column / duplex flag for a Netiv apartment number,
// or null if the number is outside the known 1-36 range. Single source of truth
// used by both the seed builder (above) and the migration below.
export function netivLayoutForApt(aptNum: number): { floor: number; col: number; isDuplex: boolean } | null {
  if (aptNum === 1) return { floor: 0, col: 1, isDuplex: false };
  if (aptNum >= 2 && aptNum <= 5) return { floor: 1, col: aptNum + 1, isDuplex: true }; // bases cols 3-6, tops auto on floor 2
  if (aptNum === 6) return { floor: 1, col: 1, isDuplex: false };
  if (aptNum === 7) return { floor: 1, col: 2, isDuplex: false };
  if (aptNum >= 8 && aptNum <= 31) return { floor: 3 + Math.floor((aptNum - 8) / 4), col: ((aptNum - 8) % 4) + 1, isDuplex: false };
  if (aptNum >= 32 && aptNum <= 34) return { floor: 9, col: aptNum - 31, isDuplex: false }; // cols 1-3
  if (aptNum >= 35 && aptNum <= 36) return { floor: 10, col: aptNum - 34, isDuplex: false }; // cols 1-2
  return null;
}

// Idempotent: corrects floor / colPosition / isDuplexApt for existing Netiv (B1/B2)
// apartments so the duplexes (2-5) sit on floors 1-2 and the regular stack starts at
// floor 3. Existing records persisted before this change keep their old floors, so this
// recomputes them from the apartment number. Returns the (possibly) corrected array plus
// the list of records that actually changed (for Firestore push).
// The blank placeholder slots a Netiv building is supposed to have. Anything else
// unnamed is left over from an older layout (the duplex renumber moved floors 8/9
// to 9/10) and must be dropped, or a stale slot can sit on top of a real
// apartment's grid position and hide it.
const NETIV_SLOT_IDS = new Set(['lobby-1', 'lobby-2', 'lobby-3', 'f0-col2', 'f9-col4', 'f10-col3', 'f10-col4']);

export function migrateNetivApartments(apts: Apartment[]): { apts: Apartment[]; changed: Apartment[] } {
  const changed: Apartment[] = [];
  apts = apts.filter(a => {
    if ((a.buildingId !== 'B1' && a.buildingId !== 'B2') || !a.isUnnamed) return true;
    const slotId = a.id.replace(/^B[12]-/, '');
    // Keep numbered placeholders (they are real units awaiting a name); drop only
    // stale named-slot scaffolding from a previous layout.
    return /^\d+$/.test(slotId) || NETIV_SLOT_IDS.has(slotId);
  });
  const result = apts.map(a => {
    if ((a.buildingId !== 'B1' && a.buildingId !== 'B2') || a.isUnnamed) return a;
    const n = Number(a.apartmentNumber);
    if (!n) return a;
    const layout = netivLayoutForApt(n);
    if (!layout) return a;
    if (a.floor === layout.floor && a.colPosition === layout.col && (a.isDuplexApt ?? false) === layout.isDuplex) {
      return a;
    }
    const updated = { ...a, floor: layout.floor, colPosition: layout.col, isDuplexApt: layout.isDuplex };
    changed.push(updated);
    return updated;
  });
  return { apts: result, changed };
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
