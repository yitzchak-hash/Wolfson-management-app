/**
 * The Wolfson typical floor, traced off the architects' plan (W RESIDENCE,
 * "קומה טיפוסית", 14/10/2026) — owner, recording 2026-11-02: "the most important
 * part is to really extract the shape of the apartment in the right way".
 *
 * Every number is in the plan's own units (PDF points on the A3 sheet), read
 * off the drawing on a 10-point grid and checked by laying the outlines back
 * over the plan (A · B · C1 · C2 land on their walls). The apartments are cut
 * where he cut them in yellow on the printed sheet: A top-left with the middle
 * ממ"ד above the core, B top-right with the other one, C2 bottom-left, C1
 * bottom-right, the core (stairs, lifts, the corridor) in the middle.
 *
 * Pure data: no React, nothing from the store.
 */
export type ShapeKey = 'A' | 'B' | 'C1' | 'C2' | 'WL' | 'WR' | 'PL14' | 'PR14' | 'PL15' | 'PR15';
type Pt = [number, number];

/** The view box that holds the whole floor, with a little air round it. */
export const PLAN_BOX = { x: 80, y: 20, w: 945, h: 800 };

export const SHAPES: Record<ShapeKey, Pt[]> = {
  A:  [[97,100],[225,100],[225,38],[596,38],[596,197],[662,197],[662,300],[262,300],[262,420],[122,420],[122,305],[97,305]],
  B:  [[712,38],[885,38],[885,137],[1007,137],[1007,305],[979,305],[979,420],[848,420],[848,300],[662,300],[662,197],[712,197]],
  C2: [[122,420],[262,420],[262,542],[550,542],[550,630],[495,630],[495,800],[225,800],[225,740],[97,740],[97,525],[122,525]],
  C1: [[848,420],[979,420],[979,525],[1007,525],[1007,740],[885,740],[885,800],[610,800],[610,630],[550,630],[550,542],[848,542]],
  // The top penthouse floor is set back: below the core it is open terrace
  // (the engineers' "קומה 15 A/B" sheets). What is left of the two lower
  // wings beside the core joins the penthouse on its side.
  WL: [[122,420],[262,420],[262,542],[97,542],[97,525],[122,525]],
  WR: [[848,420],[979,420],[979,525],[1007,525],[1007,542],[848,542]],
  // THE PENTHOUSES, each ONE apartment (owner, 2026-11-03: "they feel like two
  // connected apartments … a line in the middle"). Video 2026-11-03 14:56 ("just
  // a square, there's no actual shape of a building"): the outlines are now
  // TRACED off the engineers' own walls on the floor 14 and floor 15 A sheets
  // (TES 2441-08/-09, drawn into the plan's units — their stairs land on the
  // typical floor's), the rooms only; the open terraces are PH_TERRACES. The two
  // flats meet on the party wall at x 555, as C2 and C1 do.
  PL14: [[120,115],[230,115],[230,55],[500,55],[500,190],[555,190],[555,305],[290,305],[290,540],[555,540],[555,705],[120,705]],
  PR14: [[600,55],[890,55],[890,130],[985,130],[985,705],[555,705],[555,540],[790,540],[790,305],[555,305],[555,190],[600,190]],
  PL15: [[115,107],[230,107],[230,50],[490,50],[490,190],[555,190],[555,300],[315,300],[315,558],[115,558]],
  PR15: [[600,50],[895,50],[895,120],[990,120],[990,558],[790,558],[790,300],[555,300],[555,190],[600,190]],
};

/** The penthouse floors' core, and each penthouse floor's own drawing. */
/**
 * The penthouse floors are fitted by their STAIRS and LIFTS onto the typical
 * floor's (owner, video 2026-11-03: "this is the staircase … here the layout
 * of that is different") — one shaft through the building. Their drawings are
 * drawn on a wider frame (PH_BOX), since the set-back floors stand further out
 * on one side.
 */
export const PH_BOX = { x: -20, y: 0, w: 1045, h: 820 };
export const CORE_PH14: [number, number][] = [[290,305],[790,305],[790,540],[290,540]];
export const CORE_PH15: [number, number][] = [[315,300],[790,300],[790,558],[315,558]];
/** Each penthouse's open terraces, read off the same sheets: drawn lighter than its rooms. */
export const PH_TERRACES: Partial<Record<ShapeKey, Pt[][]>> = {
  PL14: [[[500,55],[555,55],[555,190],[500,190]]],
  PR14: [[[555,55],[600,55],[600,190],[555,190]]],
  PL15: [[[490,50],[555,50],[555,190],[490,190]], [[115,558],[555,558],[555,700],[115,700]]],
  PR15: [[[555,50],[600,50],[600,190],[555,190]], [[555,558],[995,558],[995,700],[555,700]]],
};
export const CORE_PH: [number, number][] = CORE_PH14;
/** The floor number stands in the middle of the stair core, on every floor. */
export const FLOOR_NO_AT: [number, number] = [551, 444];
export const PH_DRAWING: Record<string, string> = { PL14: '/building/wolfson-ph14.png', PR14: '/building/wolfson-ph14.png', PL15: '/building/wolfson-ph15.png', PR15: '/building/wolfson-ph15.png' };
export function isPenthouseShape(k: ShapeKey): boolean { return k.startsWith('P'); }

/** Where an apartment's number sits — inside its biggest room (the living wing). */
export const LABEL_AT: Record<ShapeKey, Pt> = {
  A: [178, 215], B: [930, 228], C2: [178, 640], C1: [930, 640], WL: [180, 480], WR: [925, 480], PL14: [150, 640], PR14: [800, 640], PL15: [160, 470], PR15: [830, 470],
};

/** The core: the corridor band, two stairwells and the lifts. */
export const CORE = {
  outline: [[262,300],[848,300],[848,542],[262,542]] as Pt[],
  stairs: [[323,375,98,160],[612,375,100,160]] as [number, number, number, number][],
  lifts: [[432,378,60,72],[432,455,60,72],[500,378,58,72]] as [number, number, number, number][],
};

/**
 * Which shape a flat is. Its TIPUS when the office set one ("A", "C1"…), else
 * its column on the board: 49 A · 50 B · 51 C1 · 52 C2, every floor the same
 * (his sketch, 2026-11-02 — the numbers spiral down the building).
 */
export function shapeOfColumn(col: number): ShapeKey {
  return (['A', 'B', 'C1', 'C2'] as const)[(Math.max(1, Math.min(4, col)) - 1)];
}

export function shapesOf(apt: { tipus?: string; colPosition: number; colSpan?: number; isDuplexApt?: boolean; apartmentNumber?: string }): ShapeKey[] {
  const span = Math.max(1, apt.colSpan ?? 1);
  // A penthouse is half a floor, split LEFT and RIGHT (the engineers'
  // Wolfson sheets, "קומה 14" and "קומה 15 A/B", 2026-11-03): the one at the
  // board's first columns is the left half (A over C2), the other the right
  // (B over C1). The top one (55/56, two storeys) sits on the set-back floor.
  if (span > 1) {
    const left = apt.colPosition <= 2;
    const top = !!apt.isDuplexApt || Number(apt.apartmentNumber) >= 55;
    // By NUMBER, as he marked the sheets: 54 and 55 are the one side, 53 and 56
    // the other (55 stands over 54) — whatever columns the board gives them.
    const n = Number(apt.apartmentNumber);
    if (n === 54) return ['PL14'];
    if (n === 53) return ['PR14'];
    if (n === 55) return ['PL15'];
    if (n === 56) return ['PR15'];
    if (top) return [left ? 'PL15' : 'PR15'];
    return [left ? 'PL14' : 'PR14'];
  }
  const t = (apt.tipus ?? '').trim().toUpperCase();
  const m = t.match(/^(A|B|C1|C2)\b/);
  return [m ? (m[1] as ShapeKey) : shapeOfColumn(apt.colPosition)];
}

export function pathOf(pts: Pt[]): string {
  return 'M' + pts.map(p => `${p[0]} ${p[1]}`).join('L') + 'Z';
}

/** The corner of the screen each apartment's card stands in (his red boxes). */
export const CARD_CORNER: Record<ShapeKey, 'tl' | 'tr' | 'bl' | 'br'> = {
  A: 'tl', B: 'tr', C2: 'bl', C1: 'br', WL: 'bl', WR: 'br', PL14: 'tl', PR14: 'tr', PL15: 'tl', PR15: 'tr',
};

/**
 * THE LEVELS UNDER THE TOWERS (owner, 2026-11-03: "the basements … one wide
 * floor under all three"). Ground, the spa level and the two basements are ONE
 * long floor under A1, A2 and A3, read off the engineers' sheets 2441-06, -05,
 * -04, -03 (all 1:100 and all drawn in one frame, so they stack exactly). STRIP
 * is that frame in the sheet's points; the three cores stand at CORES_X, at
 * CORE_Y; a tower's own slice runs between the midpoints (CUTS). The typical
 * floor is 1:100 too, so one sheet point is one plan unit and a tower's core
 * centre (CORE_C) lands on its core in the strip.
 */
export interface LowerLevel { key: string; label: string; src: string }
export const STRIP = { x: 120, y: 760, w: 4040, h: 1070 };
export const CORES_X = [860, 2000, 3160];
export const CORE_Y = 1324;
export const CUTS = [1430, 2580];
export const CORE_C: [number, number] = [555, 421];
export const WOLFSON_LOWER: LowerLevel[] = [
  { key: 'b2', label: '-2', src: '/building/wolfson-basement-2.png' },
  { key: 'b1', label: '-1', src: '/building/wolfson-basement-1.png' },
  { key: 'spa', label: 'Spa', src: '/building/wolfson-spa.png' },
  { key: 'g', label: '0', src: '/building/wolfson-ground.png' },
];
/** Where the strip lands in tower `i`'s plan units, and that tower's own slice of it. */
export function stripFor(i: number) {
  const cx = CORES_X[i] ?? CORES_X[0];
  const dx = CORE_C[0] - cx, dy = CORE_C[1] - CORE_Y;
  const from = i === 0 ? STRIP.x : CUTS[i - 1];
  const to = i >= CUTS.length ? STRIP.x + STRIP.w : CUTS[i];
  return { x: STRIP.x + dx, y: STRIP.y + dy, w: STRIP.w, h: STRIP.h, sliceX: from + dx, sliceW: to - from };
}

/**
 * THE BOARD'S OWN SLOTS on the lower levels (owner, 2026-11-03: "you see how in
 * the board view we have a bunch of drive links and slots on the bottom floors?
 * … bring it into the bottom floors of the building … find out what sections
 * want, for example the spa, and have that kind of highlight on that floor").
 * Which board floors each level holds, and the areas a slot's NAME lights:
 * read off the sheets (the spa fills the left end of the spa level, the
 * storage rooms the left end of basement -2, parking the rest; the lobbies sit
 * round each core on the ground floor). In the strip's points.
 */
export const LEVEL_FLOORS: Record<string, number[]> = { g: [0, 1], spa: [-0.5], b1: [-1, -1.5], b2: [-2, -3, -4] };
export interface Zone { key: string; level: string; words: RegExp; rect?: [number, number, number, number]; perTower?: [number, number, number, number] }
export const ZONES: Zone[] = [
  { key: 'spa', level: 'spa', words: /spa|ספא|pool|בריכ|gym|כושר|sauna|סאונה|wellness/i, rect: [150, 820, 1450, 1700] },
  { key: 'storage', level: 'b2', words: /storage|מחסנ|מחסן|store ?room/i, rect: [150, 830, 1000, 1760] },
  { key: 'parking', level: 'b1', words: /park|חני/i, rect: [1450, 830, 4100, 1760] },
  { key: 'parking2', level: 'b2', words: /park|חני/i, rect: [1000, 830, 4100, 1760] },
  // round each tower's core: [dx0, y0, dx1, y1] from the core's x
  { key: 'lobby', level: 'g', words: /lobby|לובי|entrance|כניס/i, perTower: [-380, 1050, 380, 1560] },
  // A slot named for its level ("-2", "-1", "קרקע" — the office's own names)
  // is that tower's whole part of the level.
  { key: 'whole', level: '*', words: /^\s*-?\d+(\.\d+)?\s*$|^\s*(קרקע|ground|basement|מרתף)/i, perTower: [0, 0, 0, 0] },
  { key: 'shop', level: 'g', words: /commerc|מסחר|shop|חנו|store\b/i, perTower: [-520, 840, 520, 1620] },
];
/** The area a slot lights on its level, in strip points, for tower i; none when its name names no area. */
export function zoneFor(level: string, name: string, tower: number): [number, number, number, number] | null {
  for (const z of ZONES) {
    if ((z.level !== level && z.level !== '*') || !z.words.test(name)) continue;
    if (z.key === 'whole') {
      const from = tower === 0 ? STRIP.x + 30 : CUTS[tower - 1];
      const to = tower >= CUTS.length ? STRIP.x + STRIP.w - 60 : CUTS[tower];
      return [from + 20, STRIP.y + 60, to - 20, STRIP.y + STRIP.h - 40];
    }
    if (z.rect) return z.rect;
    if (z.perTower) { const cx = CORES_X[tower] ?? CORES_X[0]; return [cx + z.perTower[0], z.perTower[1], cx + z.perTower[2], z.perTower[3]]; }
  }
  return null;
}
