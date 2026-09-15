import { Apartment, isCountableApartment } from '../types';

/**
 * THE ONE ROW MODEL for a building.
 *
 * The project page's diagram and the layout builder used to each carry their
 * own idea of what the floors of a building are — the diagram a hard-coded
 * list keyed by apartment NUMBER (Wolfson) or the floors found on the records
 * (Netiv), the builder a third thing derived from `floor`/`colPosition`. Three
 * models is how the builder and the diagram came to disagree: a unit moved in
 * one did not move in the other. This module is the single answer, and both
 * screens read it.
 *
 * Every row is POSITIONAL: a unit sits at (`floor`, `colPosition`) and may
 * span several positions to its right (`colSpan` — one wide cell drawn over
 * them, the lobby's "one job, one square"). A position it covers may hold a
 * blank placeholder record carrying `coveredBy`, which is never drawn and
 * never counts, and comes back as a blank slot when the unit is unmerged.
 *
 * The Wolfson towers have a fixed shape that the records cannot lose: 16
 * (drawn "15", two wide units), 15 ("14"), 14…2 (drawn one lower), then ONE
 * row for floor 1 which IS the lobby ("1 · Lobby"), then the basements.
 * Floor 0 — the old empty "Ground / Commercial" row — is REMOVED from the
 * model, not hidden: nothing on floor 0 is drawn anywhere (owner, 2026-09-15).
 * Netiv's rows are exactly the floors its records name, with -1 the lobby.
 */
export type RowHeight = 'normal' | 'tall' | 'short';
export type RowKind = 'wide' | 'normal' | 'lobby' | 'ground' | 'basement';

export interface FloorRow {
  /** The record floor — what `Apartment.floor` says. */
  floor: number;
  /** `String(floor)` — the key in `BoardSetting.floorHeights`. */
  key: string;
  /** The number printed on the row's label, '' when the row has no number. */
  num: string;
  kind: RowKind;
  /** Positions across this row — at least 4, more when a unit was placed further out. */
  cols: number;
  height: RowHeight;
}

/** buildingId → floor key → row height. Absent means normal. */
export type FloorHeights = Record<string, Record<string, RowHeight>>;

export function isWolfsonBuilding(buildingId: string): boolean {
  return /^A\d/.test(buildingId);
}

export function floorKey(floor: number): string {
  return String(floor);
}

/** How many positions a unit covers, never less than one. */
export function aptSpan(apt: Pick<Apartment, 'colSpan'> | undefined): number {
  const n = Number(apt?.colSpan);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
}

/** The unit's column, falling back to the Wolfson numbering rule for a record written before positions existed. */
export function aptCol(apt: Pick<Apartment, 'colPosition' | 'apartmentNumber' | 'buildingId'>): number {
  const c = Number(apt.colPosition);
  if (Number.isFinite(c) && c >= 1) return Math.floor(c);
  const n = Number(apt.apartmentNumber);
  if (isWolfsonBuilding(apt.buildingId) && Number.isFinite(n) && n >= 1) {
    // 57+ are the basement / ground / first-floor slots, four to a floor —
    // the old rule sent every one of them to column 3, and records that
    // shared a position silently hid each other.
    if (n >= 57) return ((n - 57) % 4) + 1;
    if (n >= 55) return n === 55 ? 1 : 3;
    if (n >= 53) return n === 53 ? 1 : 3;
    if (n <= 52) return ((n - 1) % 4) + 1;
  }
  return 1;
}

/** Which row kind a floor is, for this building. */
export function rowKindOf(buildingId: string, floor: number): RowKind {
  if (isWolfsonBuilding(buildingId)) {
    if (floor >= 15) return 'wide';
    if (floor >= 2) return 'normal';
    if (floor === 1) return 'lobby';
    if (floor === 0) return 'ground';
    return 'basement';
  }
  if (floor === -1) return 'lobby';
  if (floor === 0) return 'ground';
  if (floor < -1) return 'basement';
  return 'normal';
}

/** The number on the row label — Wolfson's towers print one lower than the record floor. */
export function rowNumOf(buildingId: string, floor: number): string {
  if (isWolfsonBuilding(buildingId)) {
    if (floor >= 2) return String(floor - 1);
    if (floor === 1) return '1';
    if (floor === 0) return '';
    return String(floor);
  }
  if (floor === -1 || floor === 0) return '';
  return String(floor);
}

/**
 * Wolfson's canonical floors — always drawn, even when a floor holds no
 * record: the tower 16..1 AND the basements the building was built with
 * (A1 has the half-level -0.5; every tower has -1..-4). The rows are the
 * building's shape, not a summary of whatever records happen to be loaded —
 * a basement row that only appeared once its slot records synced read as
 * "my basement jobs vanished".
 */
function wolfsonCanonicalFloors(buildingId: string): number[] {
  const out: number[] = [];
  for (let f = 16; f >= 1; f--) out.push(f);
  if (buildingId === 'A1') out.push(-0.5);
  out.push(-1, -2, -3, -4);
  return out;
}

/** The floors a building draws, top first. */
export function floorsOf(buildingId: string, apartments: Apartment[]): number[] {
  const set = new Set<number>();
  if (isWolfsonBuilding(buildingId)) wolfsonCanonicalFloors(buildingId).forEach(f => set.add(f));
  let groundHasUnit = false;
  for (const a of apartments) {
    if (a.buildingId !== buildingId) continue;
    if (!Number.isFinite(a.floor)) continue;
    set.add(a.floor);
    if (a.isDuplexApt) set.add(a.floor + 1);
    if (a.floor === 0 && isCountableApartment(a)) groundHasUnit = true;
  }
  // The empty Ground / Commercial row is gone from the Wolfson model — but a
  // REAL unit somebody named there is never hidden: the row comes back for
  // as long as it holds one.
  if (isWolfsonBuilding(buildingId) && !groundHasUnit) set.delete(0);
  return [...set].sort((a, b) => b - a);
}

export function buildFloorRows(
  buildingId: string,
  apartments: Apartment[],
  heights?: Record<string, RowHeight> | null,
): FloorRow[] {
  const floors = floorsOf(buildingId, apartments);
  const { colsByFloor } = placeUnits(buildingId, apartments);
  return floors.map(floor => {
    const cols = Math.max(4, colsByFloor.get(floor) ?? 0);
    const key = floorKey(floor);
    const h = heights?.[key];
    return {
      floor, key,
      num: rowNumOf(buildingId, floor),
      kind: rowKindOf(buildingId, floor),
      cols,
      height: h === 'tall' || h === 'short' ? h : 'normal',
    };
  });
}

export type RowMode = 'desktop' | 'phone' | 'compact';

/** Every row is a normal row's height — a named lobby or basement unit never has its text cut off. */
export function rowBaseHeightPx(buildingId: string, mode: RowMode): number {
  if (mode === 'compact') return 36;
  if (isWolfsonBuilding(buildingId)) return mode === 'phone' ? 78 : 68;
  return mode === 'phone' ? 74 : 64;
}

export function roofHeightPx(mode: RowMode): number {
  return mode === 'compact' ? 16 : mode === 'phone' ? 22 : 26;
}

export function rowHeightPx(row: Pick<FloorRow, 'height'>, buildingId: string, mode: RowMode): number {
  const base = rowBaseHeightPx(buildingId, mode);
  if (row.height === 'tall') return Math.round(base * 1.5);
  if (row.height === 'short') return Math.max(24, Math.round(base * 0.6));
  return base;
}

/**
 * Where every drawn unit of a building sits: `${floor}-${col}` → the record.
 * A duplex base also claims the position above it. Covered placeholders are
 * left out — the unit that covers them is what is drawn there.
 */
export function positionMap(buildingId: string, apartments: Apartment[]): Map<string, Apartment> {
  return placeUnits(buildingId, apartments).pos;
}

/** id → the column each unit is DRAWN at (after collisions are stepped aside). */
export function placedColumns(buildingId: string, apartments: Apartment[]): Map<string, number> {
  return placeUnits(buildingId, apartments).colOf;
}

/**
 * The placement itself, shared by `positionMap` and `buildFloorRows` so the
 * row widths and the drawn cells can never disagree. Two records claiming
 * ONE position — the old column rule did that to every basement slot — never
 * hide each other: the later one steps right to the next free column, and
 * the row grows to hold it. A wrong column is a thing you can see and drag;
 * a vanished unit is not.
 */
function placeUnits(buildingId: string, apartments: Apartment[]): {
  pos: Map<string, Apartment>; colsByFloor: Map<number, number>; colOf: Map<string, number>;
} {
  const pos = new Map<string, Apartment>();
  const colsByFloor = new Map<number, number>();
  const colOf = new Map<string, number>();
  const claim = (floor: number, col: number, span: number) => {
    colsByFloor.set(floor, Math.max(colsByFloor.get(floor) ?? 0, col + span - 1));
  };
  const free = (floor: number, col: number, span: number) => {
    for (let c = col; c < col + span; c++) if (pos.has(`${floor}-${c}`)) return false;
    return true;
  };
  const mine = apartments
    .filter(a => a.buildingId === buildingId && !a.coveredBy)
    // A record with a stored column is placed first; the guessed ones fill in after.
    .sort((a, b) => Number(Number.isFinite(Number(b.colPosition))) - Number(Number.isFinite(Number(a.colPosition))));
  for (const a of mine) {
    const span = aptSpan(a);
    let col = aptCol(a);
    while (!free(a.floor, col, span) || (a.isDuplexApt && !free(a.floor + 1, col, 1))) col += 1;
    for (let c = col; c < col + span; c++) pos.set(`${a.floor}-${c}`, a);
    colOf.set(a.id, col);
    claim(a.floor, col, span);
    if (a.isDuplexApt) { pos.set(`${a.floor + 1}-${col}`, a); claim(a.floor + 1, col, 1); }
  }
  return { pos, colsByFloor, colOf };
}

/**
 * The cells of one row, in order: a unit (with its span), or an empty
 * position. Positions a spanning unit covers are skipped, so the row's cell
 * list is what is actually drawn, gaps included.
 */
export interface RowCell { col: number; span: number; apt?: Apartment }

export function rowCells(row: FloorRow, pos: Map<string, Apartment>): RowCell[] {
  const out: RowCell[] = [];
  let col = 1;
  while (col <= row.cols) {
    const apt = pos.get(`${row.floor}-${col}`);
    if (apt) {
      const span = Math.max(1, Math.min(aptSpan(apt), row.cols - col + 1));
      out.push({ col, span, apt });
      col += span;
    } else {
      out.push({ col, span: 1 });
      col += 1;
    }
  }
  return out;
}

/** The phone pill over the stairwell: the row's number, or one letter for a named row. */
export function rowPillLabel(row: FloorRow): string {
  if (row.num) return row.num;
  return row.kind === 'lobby' ? 'L' : row.kind === 'ground' ? 'G' : '';
}

/** The row's printed label — "15", "1 · Lobby", "Ground / Commercial", "-2" — given the two translated words. */
export function rowLabelText(row: Pick<FloorRow, 'num' | 'kind'>, lobbyWord: string, groundWord: string): string {
  if (row.kind === 'lobby') return row.num ? `${row.num} · ${lobbyWord}` : lobbyWord;
  if (row.kind === 'ground') return groundWord;
  return row.num;
}
