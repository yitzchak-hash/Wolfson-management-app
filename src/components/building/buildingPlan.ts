/**
 * A BUILDING PLAN — everything the building view needs to draw one project's floors (owner, 2026-11-08: "we want to
 * do the same thing we did with the building views … with Netiv … I need you to fix the building view so it works
 * exactly the same way").
 *
 * The building view used to read the Wolfson plan directly. Now it reads one of these: Wolfson's (wolfsonPlan.ts,
 * unchanged — the same outlines, cores, penthouse drawings and lower levels) or Netiv's (netivPlan.ts, traced off the
 * AC engineer's B2 sheets). A project without a plan has no building view.
 *
 * Pure data and pure functions: no React, nothing from the store.
 */
import type { Apartment } from '../../types';
import {
  CARD_CORNER, CORE, CORE_PH14, CORE_PH15, FLOOR_NO_AT, LABEL_AT, PH_BOX, PH_DRAWING, PH_TERRACES, PLAN_BOX, SHAPES, WALLS,
  isPenthouseShape, shapesOf as wolfsonShapesOf, type ShapeKey,
} from './wolfsonPlan';

export type Pt = [number, number];
export type Box = { x: number; y: number; w: number; h: number };
/** Where a flat's card stands round the floor: the four corners, or the middle of a side (a floor of 5–6 flats). */
export type CardSpot = 'tl' | 'tr' | 'bl' | 'br' | 'ml' | 'mr';

/** One floor as the view holds it: its number, the shape keys its flats use, their apartment numbers. */
export interface PlanRow { floor: number; keys: string[]; nums: number[] }

/** How one floor is drawn. */
export interface FloorSpec {
  /** The stair-and-lift core's outline. */
  core: Pt[];
  /** Drawn as plain boxes only when the floor has no drawing of its own. */
  stairs: [number, number, number, number][];
  lifts: [number, number, number, number][];
  /** Every shape of the floor's slab, sold or not (so an empty flat still has its outline). */
  slab: string[];
  /** The plan's own drawing (walls, doors, furniture) laid on the floor; `clip` cuts it to the slab. */
  drawing?: { src: string; box: Box; clip: boolean };
  /** Where the floor's number stands. */
  floorNoAt: Pt;
  /** Drawn from the floors round it because no plan of this floor has been handed in yet. */
  estimated?: boolean;
}

export interface BuildingPlan {
  id: 'wolfson' | 'netiv';
  box: Box;
  shapes: Record<string, Pt[]>;
  terraces: Record<string, Pt[][]>;
  labelAt: Record<string, Pt>;
  /** The marked wall of a shape (a list of polylines) — drawn green on a flat answered "Wall: Yes". */
  walls?: Record<string, Pt[][]>;
  cardSpot: Record<string, CardSpot>;
  /** The shapes a flat is drawn as on floor `rowFloor`. */
  shapesOf(apt: Apartment, rowFloor: number): string[];
  /** Other floors a flat also stands on (a duplex's second storey). */
  alsoOn?(apt: Apartment): number[];
  floorOf(row: PlanRow, interiorSrc?: string): FloorSpec;
}

const WOLFSON_TYPICAL: ShapeKey[] = ['A', 'B', 'C1', 'C2'];

export const WOLFSON_PLAN: BuildingPlan = {
  id: 'wolfson',
  box: PLAN_BOX,
  shapes: SHAPES,
  terraces: PH_TERRACES as Record<string, Pt[][]>,
  labelAt: LABEL_AT,
  walls: WALLS as Record<string, Pt[][]>,
  cardSpot: CARD_CORNER,
  shapesOf: apt => wolfsonShapesOf(apt),
  floorOf(row, interiorSrc) {
    const keys = row.keys as ShapeKey[];
    const ph = keys.find(k => isPenthouseShape(k));
    const phSrc = ph ? PH_DRAWING[ph] : undefined;
    const typical = keys.every(k => WOLFSON_TYPICAL.includes(k));
    const slab = keys.some(k => k === 'WL' || k === 'WR' || isPenthouseShape(k)) ? keys : WOLFSON_TYPICAL;
    return {
      core: phSrc ? (phSrc.includes('ph15') ? CORE_PH15 : CORE_PH14) : CORE.outline,
      stairs: CORE.stairs,
      lifts: CORE.lifts,
      slab,
      drawing: phSrc ? { src: phSrc, box: PH_BOX, clip: false }
        : interiorSrc && typical ? { src: interiorSrc, box: PLAN_BOX, clip: true } : undefined,
      floorNoAt: FLOOR_NO_AT,
    };
  },
};
