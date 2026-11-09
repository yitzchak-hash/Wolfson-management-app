/**
 * NETIV (Or Amiad), traced off the AC engineer's sheets for BUILDING 2 (A.F. Air Conditioning, "בניין 2", the Drive
 * folder the owner handed over 2026-11-08: Floor 0 · Floor 2-7 · Floor 7 · Floor 8). The same method as Wolfson's:
 * every outline read off the sheet on a 50-point grid and checked by laying it back over the drawing (the cyan walls).
 *
 * Units: half a sheet point on the typical floor's sheet (the ground sheet is drawn shifted and lands on it by its
 * lifts). The architect's floors run one under the app's above the ground: their "Floor 2-7" is the app's 3–8, their
 * 7 the app's 8 (apartments 28–31), their 8 the app's 9 (32–34).
 *
 * Floor by floor (the app's numbering):
 *   0  apartment 1 (top right) · the entrance lobby (top left) · the four garden duplexes 5 · 4 | walk | 3 · 2 below
 *   1  apartments 6 · 7 and the duplexes' upper storeys — NO PLAN YET: drawn from the floors round it (estimated)
 *   3–8  four flats round the core, numbered clockwise from the top left (8 9 10 11 · 12 13 14 15 · …)
 *   9  32 (top left) · 33 (top right) · 34 the whole bottom with its open roof terrace
 *   10 35 · 36 — NO PLAN YET: drawn as the top two flats (estimated)
 * Building 1 is the same building as Building 2 (owner, 2026-11-08: "Building one and two plans are exactly the same"), so one plan draws both.
 */
import type { Apartment } from '../../types';
import type { BuildingPlan, CardSpot, FloorSpec, Pt } from './buildingPlan';

const TL: Pt[] = [[500, 268], [600, 268], [600, 356], [827, 356], [827, 525], [705, 525], [705, 615], [595, 615], [595, 490], [458, 490], [458, 425], [500, 425]];
const TR: Pt[] = [[827, 356], [1000, 356], [1000, 270], [1140, 270], [1140, 395], [1185, 395], [1185, 440], [1140, 440], [1140, 535], [1050, 535], [1050, 615], [945, 615], [945, 525], [827, 525]];
const BL: Pt[] = [[455, 695], [595, 695], [595, 615], [705, 615], [705, 695], [817, 695], [817, 880], [650, 880], [650, 995], [455, 995], [455, 845], [435, 845], [435, 775], [455, 775]];
const BR: Pt[] = [[817, 695], [945, 695], [945, 615], [1050, 615], [1050, 695], [1180, 695], [1180, 775], [1200, 775], [1200, 845], [1180, 845], [1180, 995], [985, 995], [985, 880], [817, 880]];
const P34: Pt[] = [[455, 695], [595, 695], [595, 615], [705, 615], [705, 695], [945, 695], [945, 615], [1050, 615], [1050, 880], [650, 880], [650, 995], [455, 995], [455, 845], [435, 845], [435, 775], [455, 775]];
const G1: Pt[] = [[820, 340], [970, 340], [970, 270], [1135, 270], [1135, 370], [1190, 370], [1190, 455], [1135, 455], [1135, 520], [1045, 520], [1045, 600], [930, 600], [930, 505], [820, 505]];
const D5: Pt[] = [[342, 670], [575, 670], [575, 950], [342, 950]];
const D4: Pt[] = [[575, 655], [765, 655], [765, 990], [575, 990]];
const D3: Pt[] = [[850, 655], [1045, 655], [1045, 990], [850, 990]];
const D2: Pt[] = [[1045, 670], [1265, 670], [1265, 950], [1045, 950]];

const SHAPES: Record<string, Pt[]> = {
  TL, TR, BL, BR,                      // the typical floor
  TL8: TL, TR8: TR, P34,               // the app's floor 9
  TL10: TL, TR10: TR,                  // the app's floor 10 (estimated)
  G1, D5, D4, D3, D2,                  // the ground
  F6: TL, F7: TR, U5: D5, U4: D4, U3: D3, U2: D2, // the app's floor 1 (estimated)
};
const SUN_TL: Pt[][] = [[[600, 200], [827, 200], [827, 356], [600, 356]], [[455, 495], [595, 495], [595, 600], [455, 600]]];
const SUN_TR: Pt[][] = [[[827, 200], [995, 200], [995, 356], [827, 356]], [[1050, 535], [1145, 535], [1145, 600], [1050, 600]]];
const TERRACES: Record<string, Pt[][]> = {
  TL: SUN_TL, TR: SUN_TR, TL10: SUN_TL, TR10: SUN_TR, F6: SUN_TL, F7: SUN_TR,
  BL: [[[650, 880], [817, 880], [817, 1002], [650, 1002]]],
  BR: [[[817, 880], [985, 880], [985, 1002], [817, 1002]]],
  // the top floor's sun terraces are shorter (its sheet), the side ones the same
  TL8: [[[600, 270], [827, 270], [827, 356], [600, 356]], SUN_TL[1]],
  TR8: [[[827, 270], [995, 270], [995, 356], [827, 356]], SUN_TR[1]],
  P34: [[[1050, 695], [1198, 695], [1198, 995], [650, 995], [650, 880], [1050, 880]]],
};
const LABEL: Record<string, Pt> = {
  TL: [715, 440], TR: [915, 440], BL: [730, 795], BR: [905, 795], P34: [850, 790],
  G1: [910, 430], D5: [458, 810], D4: [670, 820], D3: [948, 820], D2: [1155, 810],
};
for (const [k, s] of [['TL8', 'TL'], ['TR8', 'TR'], ['TL10', 'TL'], ['TR10', 'TR'], ['F6', 'TL'], ['F7', 'TR'],
  ['U5', 'D5'], ['U4', 'D4'], ['U3', 'D3'], ['U2', 'D2']] as const) LABEL[k] = LABEL[s];

const SPOT: Record<string, CardSpot> = {
  TL: 'tl', TR: 'tr', BR: 'br', BL: 'bl', TL8: 'tl', TR8: 'tr', P34: 'bl', TL10: 'tl', TR10: 'tr',
  G1: 'tr', D5: 'bl', D4: 'ml', D3: 'mr', D2: 'br', F6: 'tl', F7: 'tr', U5: 'bl', U4: 'ml', U3: 'mr', U2: 'br',
};

const CORE: Pt[] = [[705, 525], [945, 525], [945, 695], [705, 695]];
const CORE_G: Pt[] = [[585, 252], [820, 252], [820, 505], [930, 505], [930, 655], [585, 655]];
const STAIRS: [number, number, number, number][] = [[862, 555, 55, 110]];
const LIFTS: [number, number, number, number][] = [[712, 530, 36, 36], [712, 570, 36, 36]];
const STAIRS_G: [number, number, number, number][] = [[842, 512, 86, 138]];
const LIFTS_G: [number, number, number, number][] = [[697, 512, 34, 48], [697, 565, 34, 48]];
const BOX = { x: 330, y: 190, w: 945, h: 815 };
const FLOOR_NO: Pt = [825, 612];
const FLOOR_NO_G: Pt = [702, 380];

/** The typical floor's four flats, clockwise from the top left. */
const RING = ['TL', 'TR', 'BR', 'BL'] as const;

function num(apt: Apartment): number { return Number((apt.apartmentNumber ?? '').trim()); }

export const NETIV_PLAN: BuildingPlan = {
  id: 'netiv',
  box: BOX,
  shapes: SHAPES,
  terraces: TERRACES,
  labelAt: LABEL,
  cardSpot: SPOT,
  /** By the apartment's NUMBER, as the sheets number them — whatever row or column the board gives it. */
  shapesOf(apt, rowFloor) {
    const n = num(apt);
    if (n === 1) return ['G1'];
    if (n >= 2 && n <= 5) return [rowFloor < apt.floor ? `D${n}` : `U${n}`];
    if (n === 6) return ['F6'];
    if (n === 7) return ['F7'];
    if (n >= 8 && n <= 31) return [RING[(n - 8) % 4]];
    if (n === 32) return ['TL8'];
    if (n === 33) return ['TR8'];
    if (n === 34) return ['P34'];
    if (n === 35) return ['TL10'];
    if (n === 36) return ['TR10'];
    return [RING[Math.max(0, Math.min(3, (apt.colPosition ?? 1) - 1))]];
  },
  /** A garden duplex stands on the ground AND the storey above: its record is on the upper one, it is drawn on both. */
  alsoOn(apt) {
    const n = num(apt);
    return n >= 2 && n <= 5 ? [apt.floor - 1] : [];
  },
  floorOf(row): FloorSpec {
    const has = (re: RegExp) => row.keys.some(k => re.test(k));
    const base = { core: CORE, stairs: STAIRS, lifts: LIFTS, floorNoAt: FLOOR_NO };
    if (has(/^(G1|D\d)$/) && !has(/^(F\d|U\d)$/)) {
      return { core: CORE_G, stairs: STAIRS_G, lifts: LIFTS_G, floorNoAt: FLOOR_NO_G,
        slab: ['G1', 'D5', 'D4', 'D3', 'D2'], drawing: { src: '/building/netiv-ground.png', box: BOX, clip: true } };
    }
    if (has(/^(F\d|U\d)$/)) return { ...base, slab: ['F6', 'F7', 'U5', 'U4', 'U3', 'U2'], estimated: true };
    if (has(/^(TL8|TR8|P34)$/)) return { ...base, slab: ['TL8', 'TR8', 'P34'], drawing: { src: '/building/netiv-f8.png', box: BOX, clip: true } };
    if (has(/^(TL10|TR10)$/)) return { ...base, slab: ['TL10', 'TR10'], estimated: true };
    // the architect's floor 7 (the app's 8, flats 28–31) has its own sheet; 2–7 share the typical one
    const src = row.nums.some(n => n >= 28 && n <= 31) ? '/building/netiv-f7.png' : '/building/netiv-typical.png';
    return { ...base, slab: ['TL', 'TR', 'BR', 'BL'], drawing: { src, box: BOX, clip: true } };
  },
};
