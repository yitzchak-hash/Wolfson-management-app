import { Apartment } from '../types';

/**
 * A data-driven building layout.
 *
 * Wolfson and Netiv are currently hard-coded — two bespoke generator functions
 * plus two bespoke rendering columns — so a third building project cannot be
 * added without writing code. This model expresses both of them, and anything
 * future, as plain data.
 *
 * A floor is a row of SLOTS. A slot is an apartment, a gap, or a stairwell.
 * A duplex is an apartment that spans its own floor and the one above.
 */
export type SlotKind = 'apartment' | 'gap' | 'stairwell';

export interface LayoutSlot {
  kind: SlotKind;
  /** Apartment number. Absent on gaps and stairwells. */
  number?: string;
  /** Occupies this floor AND the one above, drawn as one tall cell. */
  duplex?: boolean;
  /** Column span; 1 unless the unit is wide. */
  width?: number;
  /** A number typed by hand is PINNED — auto-numbering must leave it alone. */
  pinned?: boolean;
}

export interface LayoutFloor {
  /** "Ground", "7", "-1", "Lobby" — free text, because real buildings vary. */
  label: string;
  slots: LayoutSlot[];
}

export interface LayoutBuilding {
  id: string;
  name: string;
  displayOrder: number;
  /** Top floor first, matching how the diagram is drawn. */
  floors: LayoutFloor[];
}

export interface ProjectLayout {
  buildings: LayoutBuilding[];
}

// ─── Numbering ───────────────────────────────────────────────────────────────

export interface NumberingOptions {
  start: number;
  /** Number left→right or right→left within each floor. */
  direction: 'ltr' | 'rtl';
  /** Continue across floors, or restart at `start` on every floor. */
  continueAcrossFloors: boolean;
}

export interface NumberChange { buildingId: string; floor: string; from?: string; to: string }

/**
 * Proposes numbers WITHOUT applying them.
 *
 * Three rules make this match how real buildings are numbered:
 *  - a duplex counts ONCE (it spans two floors but takes one number),
 *  - gaps and stairwells are skipped entirely,
 *  - a hand-typed (pinned) number is never touched.
 *
 * Returns the changes so the UI can show a diff before anything is written.
 */
export function proposeNumbering(
  building: LayoutBuilding,
  opts: NumberingOptions,
): NumberChange[] {
  const changes: NumberChange[] = [];
  let next = opts.start;

  // Bottom-up: numbering runs from the lowest floor, but floors are stored top-first.
  const floors = [...building.floors].reverse();

  for (const floor of floors) {
    if (!opts.continueAcrossFloors) next = opts.start;
    const order = opts.direction === 'ltr' ? floor.slots : [...floor.slots].reverse();
    for (const slot of order) {
      if (slot.kind !== 'apartment') continue;   // gaps + stairwells never numbered
      if (slot.pinned) continue;                 // manual always wins
      const to = String(next++);
      if (slot.number !== to) {
        changes.push({ buildingId: building.id, floor: floor.label, from: slot.number, to });
      }
    }
  }
  return changes;
}

/** Applies a proposal. Separated from proposeNumbering so the UI can preview first. */
export function applyNumbering(building: LayoutBuilding, opts: NumberingOptions): LayoutBuilding {
  let next = opts.start;
  const floors = [...building.floors].reverse().map(floor => {
    if (!opts.continueAcrossFloors) next = opts.start;
    const idx = opts.direction === 'ltr'
      ? floor.slots.map((_, i) => i)
      : floor.slots.map((_, i) => floor.slots.length - 1 - i);
    const slots = [...floor.slots];
    for (const i of idx) {
      const s = slots[i];
      if (s.kind !== 'apartment' || s.pinned) continue;
      slots[i] = { ...s, number: String(next++) };
    }
    return { ...floor, slots };
  });
  return { ...building, floors: floors.reverse() };
}

/** Duplicate apartment numbers inside one building — flagged, never blocked. */
export function findDuplicateNumbers(building: LayoutBuilding): string[] {
  const seen = new Map<string, number>();
  for (const f of building.floors) {
    for (const s of f.slots) {
      if (s.kind !== 'apartment' || !s.number) continue;
      seen.set(s.number, (seen.get(s.number) ?? 0) + 1);
    }
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([num]) => num);
}

/** How many real units a layout describes — a duplex counts once. */
export function countUnits(layout: ProjectLayout): number {
  let n = 0;
  for (const b of layout.buildings) {
    for (const f of b.floors) {
      for (const s of f.slots) if (s.kind === 'apartment' && s.number) n++;
    }
  }
  return n;
}

// ─── Grid generator ──────────────────────────────────────────────────────────

/** "10 floors × 4 apartments" — the fast start for a regular tower. */
export function generateGrid(opts: {
  id: string; name: string; displayOrder: number;
  floors: number; perFloor: number; startFloor?: number;
  numbering?: Partial<NumberingOptions>;
}): LayoutBuilding {
  const startFloor = opts.startFloor ?? 1;
  const floors: LayoutFloor[] = [];
  for (let f = opts.floors - 1 + startFloor; f >= startFloor; f--) {
    floors.push({
      label: String(f),
      slots: Array.from({ length: opts.perFloor }, () => ({ kind: 'apartment' as SlotKind })),
    });
  }
  const building: LayoutBuilding = { id: opts.id, name: opts.name, displayOrder: opts.displayOrder, floors };
  return applyNumbering(building, {
    start: opts.numbering?.start ?? 1,
    direction: opts.numbering?.direction ?? 'ltr',
    continueAcrossFloors: opts.numbering?.continueAcrossFloors ?? true,
  });
}

// ─── Apartment records ───────────────────────────────────────────────────────

/**
 * Turns a layout into Apartment records.
 *
 * `existing` is matched by building + number so stages, tasks, photos, notes and
 * Drive links survive a layout edit — the identity is the record, never the
 * number printed on the tile.
 */
export function layoutToApartments(
  layout: ProjectLayout,
  existing: Apartment[] = [],
): Apartment[] {
  const byKey = new Map(existing.filter(a => a.apartmentNumber)
    .map(a => [`${a.buildingId}#${a.apartmentNumber}`, a]));
  const out: Apartment[] = [];
  const now = new Date().toISOString();

  for (const b of layout.buildings) {
    b.floors.forEach((floor, floorIdx) => {
      const floorNum = Number(floor.label);
      floor.slots.forEach((slot, col) => {
        if (slot.kind !== 'apartment') return;
        const key = `${b.id}#${slot.number ?? ''}`;
        const prior = slot.number ? byKey.get(key) : undefined;
        out.push({
          ...(prior ?? {
            id: `${b.id}-${slot.number ?? `r${floorIdx}c${col}`}`,
            classification: 'standard',
            currentStageId: null,
            generalNotes: '',
            stageDates: {},
            createdAt: now,
            isUnnamed: !slot.number,
            displayName: slot.number ?? '',
          } as unknown as Apartment),
          buildingId: b.id,
          apartmentNumber: slot.number ?? '',
          floor: Number.isFinite(floorNum) ? floorNum : 0,
          colPosition: col + 1,
          isDuplexApt: !!slot.duplex,
          updatedAt: now,
        } as Apartment);
      });
    });
  }
  return out;
}
