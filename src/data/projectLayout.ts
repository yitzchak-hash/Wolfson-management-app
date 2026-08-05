import { Apartment } from '../types';

/**
 * A data-driven building layout.
 *
 * Wolfson and Netiv are currently hard-coded — two bespoke generator functions
 * plus two bespoke rendering columns — so a third building project cannot be
 * added without writing code. This model expresses both of them, and anything
 * future, as plain data.
 *
 * A floor is a row of SLOTS, and a slot is either an apartment or an empty
 * position. There is no stairwell kind: a position with no apartment in it is
 * simply empty, which is what a gap already says.
 *
 * ── Joins ──────────────────────────────────────────────────────────────────
 * Two neighbouring slots can be joined, and the KIND of join is the whole
 * distinction that used to be missing:
 *
 *  - **duplex** — ONE home over two floors. One number, counts once, produces a
 *    single apartment record. Only ever vertical.
 *  - **connected** — TWO homes a buyer knocked together. Two numbers, counts
 *    twice, produces two records linked by `mergedWith`. Vertical or horizontal.
 *
 * The link is by `uid` rather than by position, because inserting a floor or a
 * column shifts every index and would silently re-point a positional link at
 * the wrong slot.
 */
export type SlotKind = 'apartment' | 'gap';

export type JoinKind = 'duplex' | 'connected';

export interface LayoutSlot {
  /** Stable identity within the layout. Joins point at this, never at indices. */
  uid: string;
  kind: SlotKind;
  /** Apartment number. Absent on empty positions. */
  number?: string;
  /** The other half of this join, if it has one. Always mutual. */
  joinUid?: string;
  joinKind?: JoinKind;
  /**
   * For a duplex, the half that carries the number and becomes the record.
   * Meaningless on a connected pair, where both halves are real apartments.
   */
  joinPrimary?: boolean;
  /** A number typed by hand is PINNED — auto-numbering must leave it alone. */
  pinned?: boolean;
}

let uidSeq = 0;
/** Fresh slot identity. Prefixed so it can never collide with an apartment id. */
export function slotUid(): string {
  uidSeq += 1;
  return `s${Date.now().toString(36)}${uidSeq.toString(36)}`;
}

export function newSlot(kind: SlotKind = 'apartment'): LayoutSlot {
  return { uid: slotUid(), kind };
}

// ─── Join helpers ────────────────────────────────────────────────────────────

export interface SlotPos { f: number; s: number }

/** Where a uid sits in a building, or null if it is not in this building. */
export function findSlot(building: LayoutBuilding, uid: string): SlotPos | null {
  for (let f = 0; f < building.floors.length; f++) {
    const s = building.floors[f].slots.findIndex(x => x.uid === uid);
    if (s !== -1) return { f, s };
  }
  return null;
}

/** The two positions must touch — edge to edge, never diagonally. */
export function areNeighbours(a: SlotPos, b: SlotPos): false | 'vertical' | 'horizontal' {
  if (a.s === b.s && Math.abs(a.f - b.f) === 1) return 'vertical';
  if (a.f === b.f && Math.abs(a.s - b.s) === 1) return 'horizontal';
  return false;
}

/** Why these two cannot be joined this way, or null when they can. */
export function joinRefusal(
  building: LayoutBuilding, aPos: SlotPos, bPos: SlotPos, kind: JoinKind,
): string | null {
  const a = building.floors[aPos.f]?.slots[aPos.s];
  const b = building.floors[bPos.f]?.slots[bPos.s];
  if (!a || !b) return 'That position is not there any more.';
  if (a.uid === b.uid) return 'Pick a different apartment to join it to.';
  if (a.kind !== 'apartment' || b.kind !== 'apartment') return 'Only apartments can be joined.';
  if (a.joinUid || b.joinUid) return 'One of these is already joined to something else.';
  const rel = areNeighbours(aPos, bPos);
  if (!rel) return 'They have to be next to each other.';
  if (kind === 'duplex' && rel !== 'vertical') return 'A duplex is one home over two floors — pick the one above or below.';
  return null;
}

/** Joins two slots. Mutual on both halves, so neither can be left dangling. */
export function joinSlots(
  building: LayoutBuilding, aPos: SlotPos, bPos: SlotPos, kind: JoinKind,
): LayoutBuilding {
  const a = building.floors[aPos.f].slots[aPos.s];
  const b = building.floors[bPos.f].slots[bPos.s];
  a.joinUid = b.uid; a.joinKind = kind;
  b.joinUid = a.uid; b.joinKind = kind;
  if (kind === 'duplex') {
    // The lower floor owns a duplex: that is the floor people say it is on.
    const lower = aPos.f > bPos.f ? a : b;
    const upper = lower === a ? b : a;
    lower.joinPrimary = true;
    upper.joinPrimary = false;
    // A duplex is one home, so the upper half surrenders its number.
    delete upper.number;
    delete upper.pinned;
  } else {
    a.joinPrimary = true;
    b.joinPrimary = false;
  }
  return building;
}

/** Separates a join, from either half. */
export function unjoinSlot(building: LayoutBuilding, uid: string): LayoutBuilding {
  const pos = findSlot(building, uid);
  if (!pos) return building;
  const slot = building.floors[pos.f].slots[pos.s];
  const partnerUid = slot.joinUid;
  const clear = (x: LayoutSlot) => { delete x.joinUid; delete x.joinKind; delete x.joinPrimary; };
  clear(slot);
  if (partnerUid) {
    const p = findSlot(building, partnerUid);
    if (p) clear(building.floors[p.f].slots[p.s]);
  }
  return building;
}

/** True when this slot is the half of a duplex that does not carry the number. */
export function isDuplexUpper(slot: LayoutSlot): boolean {
  return slot.joinKind === 'duplex' && slot.joinPrimary === false;
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
 *  - empty positions are skipped entirely,
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
      if (slot.kind !== 'apartment') continue;   // empty positions are never numbered
      if (isDuplexUpper(slot)) continue;         // one home, one number
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
      if (s.kind !== 'apartment' || s.pinned || isDuplexUpper(s)) continue;
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
      if (s.kind !== 'apartment' || !s.number || isDuplexUpper(s)) continue;
      seen.set(s.number, (seen.get(s.number) ?? 0) + 1);
    }
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([num]) => num);
}

/**
 * How many real homes a layout describes.
 *
 * A duplex is ONE home over two floors, so its upper half is not counted. A
 * connected pair is TWO homes a buyer knocked together, so both are — that
 * difference is the reason the two join kinds exist at all.
 */
export function countUnits(layout: ProjectLayout): number {
  let n = 0;
  for (const b of layout.buildings) {
    for (const f of b.floors) {
      for (const s of f.slots) {
        if (s.kind !== 'apartment') continue;
        if (isDuplexUpper(s)) continue;
        n++;
      }
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
      slots: Array.from({ length: opts.perFloor }, () => newSlot('apartment')),
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
  /** slot uid -> the record id it produced, so joins can be linked afterwards. */
  const idByUid = new Map<string, string>();

  for (const b of layout.buildings) {
    b.floors.forEach((floor, floorIdx) => {
      const floorNum = Number(floor.label);
      floor.slots.forEach((slot, col) => {
        if (slot.kind !== 'apartment') return;
        // The upper half of a duplex is not its own home — it is the same home,
        // one floor up — so it produces no record at all.
        if (isDuplexUpper(slot)) return;

        const key = `${b.id}#${slot.number ?? ''}`;
        const prior = slot.number ? byKey.get(key) : undefined;
        const id = prior?.id ?? `${b.id}-${slot.number ?? `r${floorIdx}c${col}`}`;
        idByUid.set(slot.uid, id);

        out.push({
          ...(prior ?? {
            id,
            classification: 'standard',
            currentStageId: null,
            generalNotes: '',
            stageDates: {},
            createdAt: now,
            isUnnamed: !slot.number,
            displayName: '',
          } as unknown as Apartment),
          id,
          buildingId: b.id,
          apartmentNumber: slot.number ?? '',
          floor: Number.isFinite(floorNum) ? floorNum : 0,
          colPosition: col + 1,
          // A duplex is drawn across two floors; a connected pair is not.
          isDuplexApt: slot.joinKind === 'duplex',
          updatedAt: now,
        } as Apartment);
      });
    });
  }

  /**
   * Connected pairs become the app's existing bilateral `mergedWith` link —
   * two records, two numbers, one home — which is exactly what the drawer, the
   * diagram and the merged-name syncing already understand.
   */
  const byId = new Map(out.map(a => [a.id, a]));
  for (const b of layout.buildings) {
    for (const floor of b.floors) {
      for (const slot of floor.slots) {
        if (slot.joinKind !== 'connected' || !slot.joinUid) continue;
        const mine = idByUid.get(slot.uid);
        const theirs = idByUid.get(slot.joinUid);
        if (!mine || !theirs) continue;
        const rec = byId.get(mine);
        if (rec) rec.mergedWith = theirs;
      }
    }
  }

  return out;
}
