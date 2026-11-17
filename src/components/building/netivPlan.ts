/**
 * NETIV (Or Amiad), traced off the AC engineer's sheets (A.F. Air Conditioning; the Drive folder "PDF מקבלן",
 * "בנין 1" and "בנין 2": Floor 0 · 1 · 2-7 · 7 · 8 · 9). The same method as Wolfson's: every outline read off the
 * sheet on a measured grid and checked by laying it back over the drawing.
 *
 * Units: one unit is two sheet points on the typical floor's sheet (the ground sheet is drawn shifted and lands on
 * it by its lifts). The architect's floors run one under the app's above the ground: their "Floor 2-7" is the app's
 * 3–8, their 7 the app's 8 (apartments 28–31), their 8 the app's 9 (32–34), their 9 the app's 10 (35 · 36).
 *
 * Floor by floor (the app's numbering), as Building 2's sheets draw it:
 *   0  apartment 1 (top right) · the entrance lobby (top left) · the four garden duplexes 5 · 4 | walk | 3 · 2 below
 *   1  apartments 6 · 7 on top and the duplexes' upper storeys below (traced 2026-11-17 off "Floor 1")
 *   3–8  four flats round the core, numbered clockwise from the top left (8 9 10 11 · 12 13 14 15 · …)
 *   9  32 (top left) · 33 (top right) · 34 the whole bottom with its open roof terrace
 *   10 35 the whole top (bedrooms left and right of the living room) · 36 the bottom (traced 2026-11-17 off "Floor 9")
 *
 * THE TWO BUILDINGS ARE MIRROR IMAGES (found 2026-11-17, when the owner asked which building has something else
 * where the app drew a flat): every sheet of Building 1, flipped left to right, lies on Building 2's sheet with the
 * same offset on all five floors (x₁ = 3266 − x₂ in sheet points), flat numbers and all — 13 is top left in
 * Building 1 where 12 is in Building 2. One difference: Building 1's unit 1, on the ground, is not a flat but the
 * PUBLIC BUILDING (מבנה ציבור, about 100 m², its own fan-coil), on the footprint apartment 1 has in Building 2.
 * So everything is traced once, in Building 2's frame, and Building 1's plan is that, mirrored.
 *
 * TURNED 180° ON SCREEN (owner, 2026-11-17: "flip the buildings 180 degrees so that apartment 13 and 12 go on the
 * bottom and apartment 14 and 15 go on the top", and his sketch of the ground floor: apartment 1 bottom left, the
 * duplexes 2 · 3 · 4 · 5 along the top, the street below). The sheets' pictures are mirrored and turned with the
 * outlines (`drawing.mirror`, `drawing.rotate`), so the walls still lie on them. The pictures carry no lettering
 * (it was taken out of the sheets), so nothing reads upside down or backwards.
 */
import type { Apartment } from '../../types';
import type { BuildingPlan, CardSpot, FloorSpec, Pt } from './buildingPlan';

type Rect = [number, number, number, number];

// ── as traced, in Building 2's frame ────────────────────────────────────────────────────────────────────────
const TL: Pt[] = [[500, 268], [600, 268], [600, 356], [827, 356], [827, 525], [705, 525], [705, 615], [595, 615], [595, 490], [458, 490], [458, 425], [500, 425]];
const TR: Pt[] = [[827, 356], [1000, 356], [1000, 270], [1140, 270], [1140, 395], [1185, 395], [1185, 440], [1140, 440], [1140, 535], [1050, 535], [1050, 615], [945, 615], [945, 525], [827, 525]];
const BL: Pt[] = [[455, 695], [595, 695], [595, 615], [705, 615], [705, 695], [817, 695], [817, 880], [650, 880], [650, 995], [455, 995], [455, 845], [435, 845], [435, 775], [455, 775]];
const BR: Pt[] = [[817, 695], [945, 695], [945, 615], [1050, 615], [1050, 695], [1180, 695], [1180, 775], [1200, 775], [1200, 845], [1180, 845], [1180, 995], [985, 995], [985, 880], [817, 880]];
const P34: Pt[] = [[455, 695], [595, 695], [595, 615], [705, 615], [705, 695], [945, 695], [945, 615], [1050, 615], [1050, 880], [650, 880], [650, 995], [455, 995], [455, 845], [435, 845], [435, 775], [455, 775]];
/** The app's floor 10: 35 runs along the whole top, with a bedroom wing each side of the core's top. */
const P35: Pt[] = [[500, 268], [600, 268], [600, 358], [1053, 358], [1053, 697], [945, 697], [945, 525], [705, 525], [705, 615], [595, 615], [595, 490], [458, 490], [458, 425], [500, 425]];
const P36: Pt[] = [[455, 695], [595, 695], [595, 615], [705, 615], [705, 695], [950, 695], [950, 880], [650, 880], [650, 995], [455, 995], [455, 845], [435, 845], [435, 775], [455, 775]];
const G1: Pt[] = [[820, 340], [970, 340], [970, 270], [1135, 270], [1135, 370], [1190, 370], [1190, 455], [1135, 455], [1135, 520], [1045, 520], [1045, 600], [930, 600], [930, 505], [820, 505]];
/** Building 1's unit 1 — the public building, off Building 1's own ground sheet (flipped into this frame). */
const PUB: Pt[] = [[817, 338], [968, 338], [968, 253], [1147, 253], [1147, 520], [1043, 520], [1043, 600], [930, 600], [930, 507], [817, 507]];
const D5: Pt[] = [[342, 670], [575, 670], [575, 950], [342, 950]];
const D4: Pt[] = [[575, 655], [765, 655], [765, 990], [575, 990]];
const D3: Pt[] = [[850, 655], [1045, 655], [1045, 990], [850, 990]];
const D2: Pt[] = [[1045, 670], [1265, 670], [1265, 950], [1045, 950]];
/** The duplexes' upper storeys, off the "Floor 1" sheet: wider than the ground ones, with a shaft between 4 and 3. */
const U5: Pt[] = [[351, 689], [588, 689], [588, 979], [459, 979], [459, 1002], [360, 1002], [360, 880], [351, 880]];
const U4: Pt[] = [[588, 696], [817, 696], [817, 772], [772, 772], [772, 979], [588, 979]];
const U3: Pt[] = [[820, 696], [1049, 696], [1049, 979], [865, 979], [865, 772], [820, 772]];
const U2: Pt[] = [[1049, 689], [1284, 689], [1284, 880], [1275, 880], [1275, 1002], [1176, 1002], [1176, 979], [1049, 979]];

const SHAPES: Record<string, Pt[]> = {
  TL, TR, BL, BR,                      // the typical floor
  TL8: TL, TR8: TR, P34,               // the app's floor 9
  P35, P36,                            // the app's floor 10
  G1, PUB, D5, D4, D3, D2,             // the ground (G1 in Building 2, PUB in Building 1)
  F6: TL, F7: TR, U5, U4, U3, U2,      // the app's floor 1
};
const SUN_TL: Pt[][] = [[[600, 200], [827, 200], [827, 356], [600, 356]], [[455, 495], [595, 495], [595, 600], [455, 600]]];
const SUN_TR: Pt[][] = [[[827, 200], [995, 200], [995, 356], [827, 356]], [[1050, 535], [1145, 535], [1145, 600], [1050, 600]]];
const TERRACES: Record<string, Pt[][]> = {
  TL: SUN_TL, TR: SUN_TR, F6: SUN_TL, F7: SUN_TR,
  BL: [[[650, 880], [817, 880], [817, 1002], [650, 1002]]],
  BR: [[[817, 880], [985, 880], [985, 1002], [817, 1002]]],
  // the top floors' sun terraces are shorter (their sheets), the side ones the same
  TL8: [[[600, 270], [827, 270], [827, 356], [600, 356]], SUN_TL[1]],
  TR8: [[[827, 270], [995, 270], [995, 356], [827, 356]], SUN_TR[1]],
  P34: [[[1050, 695], [1198, 695], [1198, 995], [650, 995], [650, 880], [1050, 880]]],
  P35: [[[1053, 272], [1140, 272], [1140, 395], [1185, 395], [1185, 440], [1140, 440], [1140, 535], [1053, 535]], [[600, 305], [1053, 305], [1053, 358], [600, 358]], SUN_TL[1]],
  P36: [[[950, 697], [1050, 697], [1050, 880], [950, 880]]],
  U4: [[[650, 979], [777, 979], [777, 1030], [650, 1030]]],
  U3: [[[860, 979], [988, 979], [988, 1030], [860, 1030]]],
};
const LABEL: Record<string, Pt> = {
  TL: [715, 440], TR: [915, 440], BL: [730, 795], BR: [905, 795], P34: [850, 790], P35: [830, 445], P36: [800, 790],
  G1: [910, 430], PUB: [985, 420], D5: [458, 810], D4: [670, 820], D3: [948, 820], D2: [1155, 810],
  U5: [470, 840], U4: [680, 850], U3: [957, 850], U2: [1165, 840],
};
for (const [k, s] of [['TL8', 'TL'], ['TR8', 'TR'], ['F6', 'TL'], ['F7', 'TR']] as const) LABEL[k] = LABEL[s];

const SPOT: Record<string, CardSpot> = {
  TL: 'tl', TR: 'tr', BR: 'br', BL: 'bl', TL8: 'tl', TR8: 'tr', P34: 'bl', P35: 'tr', P36: 'bl',
  G1: 'tr', PUB: 'tr', D5: 'bl', D4: 'ml', D3: 'mr', D2: 'br', F6: 'tl', F7: 'tr', U5: 'bl', U4: 'ml', U3: 'mr', U2: 'br',
};

const CORE: Pt[] = [[705, 525], [945, 525], [945, 695], [705, 695]];
const CORE_G: Pt[] = [[585, 252], [820, 252], [820, 505], [930, 505], [930, 655], [585, 655]];
const STAIRS: Rect[] = [[862, 555, 55, 110]];
const LIFTS: Rect[] = [[712, 530, 36, 36], [712, 570, 36, 36]];
const STAIRS_G: Rect[] = [[842, 512, 86, 138]];
const LIFTS_G: Rect[] = [[697, 512, 34, 48], [697, 565, 34, 48]];
/** Wide enough for floor 1, whose duplexes reach further out and down than any other floor. */
const BOX = { x: 320, y: 180, w: 980, h: 860 };
const FLOOR_NO: Pt = [825, 612];
const FLOOR_NO_G: Pt = [702, 380];

/** The typical floor's four flats, clockwise from the top left (Building 2's frame). */
const RING = ['TL', 'TR', 'BR', 'BL'] as const;

function num(apt: Apartment): number { return Number((apt.apartmentNumber ?? '').trim()); }

const mapValues = <T, U>(o: Record<string, T>, f: (v: T) => U): Record<string, U> =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
const TURNED: Record<CardSpot, CardSpot> = { tl: 'br', tr: 'bl', bl: 'tr', br: 'tl', ml: 'mr', mr: 'ml' };
const MIRRORED: Record<CardSpot, CardSpot> = { tl: 'tr', tr: 'tl', bl: 'br', br: 'bl', ml: 'mr', mr: 'ml' };

/**
 * One building's plan: the traced frame, mirrored for Building 1, then turned half round for the screen.
 * A mirror and a half turn together are a top-to-bottom flip, which is what Building 1 comes to.
 */
function netivPlan(mirror: boolean): BuildingPlan {
  const CX = BOX.x + BOX.w / 2, CY = BOX.y + BOX.h / 2;
  const at = ([x, y]: Pt): Pt => [mirror ? x : 2 * CX - x, 2 * CY - y];
  const all = (pts: Pt[]): Pt[] => pts.map(at);
  const rect = ([x, y, w, h]: Rect): Rect => [mirror ? x : 2 * CX - x - w, 2 * CY - y - h, w, h];
  const spot = (s: CardSpot): CardSpot => TURNED[mirror ? MIRRORED[s] : s];
  const sheet = (name: string) => ({ src: `/building/${name}.png`, box: BOX, clip: true, rotate: true, mirror });
  const upper = { core: all(CORE), stairs: STAIRS.map(rect), lifts: LIFTS.map(rect), floorNoAt: at(FLOOR_NO) };
  const unit1 = mirror ? 'PUB' : 'G1';

  return {
    id: 'netiv',
    box: BOX,
    shapes: mapValues(SHAPES, all),
    terraces: mapValues(TERRACES, list => list.map(all)),
    labelAt: mapValues(LABEL, at),
    cardSpot: mapValues(SPOT, spot),
    /** By the apartment's NUMBER, as the sheets number them — whatever row or column the board gives it. */
    shapesOf(apt, rowFloor) {
      const n = num(apt);
      if (n === 1) return [unit1];
      if (n >= 2 && n <= 5) return [rowFloor < apt.floor ? `D${n}` : `U${n}`];
      if (n === 6) return ['F6'];
      if (n === 7) return ['F7'];
      if (n >= 8 && n <= 31) return [RING[(n - 8) % 4]];
      if (n === 32) return ['TL8'];
      if (n === 33) return ['TR8'];
      if (n === 34) return ['P34'];
      if (n === 35) return ['P35'];
      if (n === 36) return ['P36'];
      return [RING[Math.max(0, Math.min(3, (apt.colPosition ?? 1) - 1))]];
    },
    /** A garden duplex stands on the ground AND the storey above: its record is on the upper one, it is drawn on both. */
    alsoOn(apt) {
      const n = num(apt);
      return n >= 2 && n <= 5 ? [apt.floor - 1] : [];
    },
    floorOf(row): FloorSpec {
      const has = (re: RegExp) => row.keys.some(k => re.test(k));
      if (has(/^(G1|PUB|D\d)$/) && !has(/^(F\d|U\d)$/)) {
        return { core: all(CORE_G), stairs: STAIRS_G.map(rect), lifts: LIFTS_G.map(rect), floorNoAt: at(FLOOR_NO_G),
          slab: [unit1, 'D5', 'D4', 'D3', 'D2'], drawing: sheet(mirror ? 'netiv-b1-ground' : 'netiv-ground') };
      }
      if (has(/^(F\d|U\d)$/)) return { ...upper, slab: ['F6', 'F7', 'U5', 'U4', 'U3', 'U2'], drawing: sheet('netiv-f1') };
      if (has(/^(TL8|TR8|P34)$/)) return { ...upper, slab: ['TL8', 'TR8', 'P34'], drawing: sheet('netiv-f8') };
      if (has(/^(P35|P36)$/)) return { ...upper, slab: ['P35', 'P36'], drawing: sheet('netiv-f9') };
      // Building 2's top typical floor (the app's 8, flats 28–31) has its own sheet; Building 1 has none, its 3–8 share one
      const own = !mirror && row.nums.some(n => n >= 28 && n <= 31);
      return { ...upper, slab: ['TL', 'TR', 'BR', 'BL'], drawing: sheet(own ? 'netiv-f7' : 'netiv-typical') };
    },
  };
}

/** Building 2, as its sheets draw it. */
export const NETIV_PLAN: BuildingPlan = netivPlan(false);
/** Building 1: Building 2 mirrored, with the public building where apartment 1 is. */
export const NETIV_PLAN_B1: BuildingPlan = netivPlan(true);
