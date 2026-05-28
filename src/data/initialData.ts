import { Apartment, Building, BuildingId, Stage, User } from '../types';

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

function makeApt(
  buildingId: BuildingId,
  floor: number,
  aptNum: string,
  isUnnamed = false,
  unassignedIdx = 0
): Apartment {
  const id = isUnnamed ? `${buildingId}-UNASSIGNED-0${unassignedIdx}` : `${buildingId}-${aptNum}`;
  return {
    id,
    buildingId,
    apartmentNumber: isUnnamed ? '' : aptNum,
    displayName: isUnnamed ? '' : aptNum,
    floor,
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

export function buildDefaultApartments(): Apartment[] {
  const apts: Apartment[] = [];

  // A1 – floors 1–13 (2 per floor), ground (2 unnamed)
  const a1Floors: [number, string, string][] = [
    [13, '131', '132'], [12, '121', '122'], [11, '111', '112'], [10, '101', '102'],
    [9, '91', '92'], [8, '81', '82'], [7, '71', '72'], [6, '61', '62'],
    [5, '51', '52'], [4, '41', '42'], [3, '31', '32'], [2, '21', '22'], [1, '11', '12'],
  ];
  a1Floors.forEach(([fl, a, b]) => {
    apts.push(makeApt('A1', fl, a));
    apts.push(makeApt('A1', fl, b));
  });
  apts.push(makeApt('A1', 0, '', true, 1));
  apts.push(makeApt('A1', 0, '', true, 2));

  // A2 – floors 1–13
  const a2Floors: [number, string, string][] = [
    [13, '133', '134'], [12, '123', '124'], [11, '113', '114'], [10, '103', '104'],
    [9, '93', '94'], [8, '83', '84'], [7, '73', '74'], [6, '63', '64'],
    [5, '53', '54'], [4, '43', '44'], [3, '33', '34'], [2, '23', '24'], [1, '13', '14'],
  ];
  a2Floors.forEach(([fl, a, b]) => {
    apts.push(makeApt('A2', fl, a));
    apts.push(makeApt('A2', fl, b));
  });
  apts.push(makeApt('A2', 0, '', true, 1));
  apts.push(makeApt('A2', 0, '', true, 2));

  // A3 – floors 1–13
  const a3Floors: [number, string, string][] = [
    [13, '135', '136'], [12, '125', '126'], [11, '115', '116'], [10, '105', '106'],
    [9, '95', '96'], [8, '85', '86'], [7, '75', '76'], [6, '65', '66'],
    [5, '55', '56'], [4, '45', '46'], [3, '35', '36'], [2, '25', '26'], [1, '15', '16'],
  ];
  a3Floors.forEach(([fl, a, b]) => {
    apts.push(makeApt('A3', fl, a));
    apts.push(makeApt('A3', fl, b));
  });
  apts.push(makeApt('A3', 0, '', true, 1));
  apts.push(makeApt('A3', 0, '', true, 2));

  return apts;
}
