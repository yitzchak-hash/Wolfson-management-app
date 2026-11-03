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
export type ShapeKey = 'A' | 'B' | 'C1' | 'C2';
type Pt = [number, number];

/** The view box that holds the whole floor, with a little air round it. */
export const PLAN_BOX = { x: 80, y: 20, w: 945, h: 800 };

export const SHAPES: Record<ShapeKey, Pt[]> = {
  A:  [[97,100],[225,100],[225,38],[596,38],[596,197],[662,197],[662,300],[262,300],[262,420],[122,420],[122,305],[97,305]],
  B:  [[712,38],[885,38],[885,137],[1007,137],[1007,305],[979,305],[979,420],[848,420],[848,300],[662,300],[662,197],[712,197]],
  C2: [[122,420],[262,420],[262,542],[550,542],[550,630],[495,630],[495,800],[225,800],[225,740],[97,740],[97,525],[122,525]],
  C1: [[848,420],[979,420],[979,525],[1007,525],[1007,740],[885,740],[885,800],[610,800],[610,630],[550,630],[550,542],[848,542]],
};

/** Where an apartment's number sits — inside its biggest room (the living wing). */
export const LABEL_AT: Record<ShapeKey, Pt> = {
  A: [178, 215], B: [930, 228], C2: [178, 640], C1: [930, 640],
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

export function shapesOf(apt: { tipus?: string; colPosition: number; colSpan?: number }): ShapeKey[] {
  const span = Math.max(1, apt.colSpan ?? 1);
  // A merged penthouse covers several columns: its outline is theirs together.
  if (span > 1) return Array.from({ length: span }, (_, i) => shapeOfColumn(apt.colPosition + i));
  const t = (apt.tipus ?? '').trim().toUpperCase();
  const m = t.match(/^(A|B|C1|C2)\b/);
  return [m ? (m[1] as ShapeKey) : shapeOfColumn(apt.colPosition)];
}

export function pathOf(pts: Pt[]): string {
  return 'M' + pts.map(p => `${p[0]} ${p[1]}`).join('L') + 'Z';
}

/** The corner of the screen each apartment's card stands in (his red boxes). */
export const CARD_CORNER: Record<ShapeKey, 'tl' | 'tr' | 'bl' | 'br'> = {
  A: 'tl', B: 'tr', C2: 'bl', C1: 'br',
};
