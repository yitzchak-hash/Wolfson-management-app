/**
 * Snapping, and the lines that explain it.
 *
 * A board where everything is a pixel or two out reads as untidy no matter how
 * carefully it was arranged, and nudging things into line by eye is a job
 * nobody should be doing. This lines a moving box up with the boxes already
 * there — not to a grid, which only helps if everything else happens to sit on
 * the same grid, but to the EDGES AND CENTRES of its neighbours, which is what
 * "line these up" actually means.
 *
 * It is pure: boxes in, an offset and some lines out. That makes it testable
 * without a browser, and keeps the board's pointer handlers doing one thing.
 */

export interface Box { x: number; y: number; w: number; h: number }

/** A line to draw while a drag is live, in board coordinates. */
export interface Guide {
  axis: 'x' | 'y';
  /** Where the line sits: an x for a vertical line, a y for a horizontal one. */
  at: number;
  /** How far the line runs, so it reaches from the moving box to its partner. */
  from: number;
  to: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: Guide[];
}

/**
 * The candidate positions on one axis: near edge, far edge, and centre.
 *
 * Three per box per axis is what makes "smart" snapping feel smart — a tile
 * lines up with another tile's left, its right, or its middle, and each of
 * those is a thing somebody means at some point.
 */
function pointsX(b: Box): number[] { return [b.x, b.x + b.w / 2, b.x + b.w]; }
function pointsY(b: Box): number[] { return [b.y, b.y + b.h / 2, b.y + b.h]; }

/**
 * Line `moving` up with anything in `others` it is nearly level with.
 *
 * `tolerance` is in BOARD units and should be divided by the zoom by the
 * caller, so the pull feels the same size on screen however far in or out you
 * are — a fixed board tolerance is a huge magnet at 25% and none at 300%.
 */
export function snapBox(
  moving: Box,
  others: Box[],
  tolerance = 6,
  gridStep = 0,
): SnapResult {
  let bestX: { delta: number; guide: Guide } | null = null;
  let bestY: { delta: number; guide: Guide } | null = null;

  const mineX = pointsX(moving);
  const mineY = pointsY(moving);

  for (const o of others) {
    for (const ox of pointsX(o)) {
      for (const mx of mineX) {
        const delta = ox - mx;
        if (Math.abs(delta) > tolerance) continue;
        if (bestX && Math.abs(bestX.delta) <= Math.abs(delta)) continue;
        bestX = {
          delta,
          guide: {
            axis: 'x', at: ox,
            from: Math.min(moving.y, o.y),
            to: Math.max(moving.y + moving.h, o.y + o.h),
          },
        };
      }
    }
    for (const oy of pointsY(o)) {
      for (const my of mineY) {
        const delta = oy - my;
        if (Math.abs(delta) > tolerance) continue;
        if (bestY && Math.abs(bestY.delta) <= Math.abs(delta)) continue;
        bestY = {
          delta,
          guide: {
            axis: 'y', at: oy,
            from: Math.min(moving.x, o.x),
            to: Math.max(moving.x + moving.w, o.x + o.w),
          },
        };
      }
    }
  }

  /**
   * The grid is the FALLBACK, never the first answer.
   *
   * Lining up with the thing next to it is what somebody means; landing on a
   * grid line is a consolation when there is nothing next to it. Taking the
   * grid first would drag a tile away from the tile it was being lined up with.
   */
  let x = moving.x + (bestX?.delta ?? 0);
  let y = moving.y + (bestY?.delta ?? 0);
  if (gridStep > 0) {
    if (!bestX) x = Math.round(x / gridStep) * gridStep;
    if (!bestY) y = Math.round(y / gridStep) * gridStep;
  }

  const guides: Guide[] = [];
  if (bestX) guides.push(bestX.guide);
  if (bestY) guides.push(bestY.guide);
  return { x, y, guides };
}

/**
 * The same, for a resize: the moving box's far corner is what is being placed,
 * so its near corner must stay put.
 */
export function snapResize(
  box: Box,
  others: Box[],
  tolerance = 6,
  gridStep = 0,
): { w: number; h: number; guides: Guide[] } {
  const far = { x: box.x + box.w, y: box.y + box.h, w: 0, h: 0 };
  const snapped = snapBox(far, others, tolerance, gridStep);
  return {
    w: Math.max(24, snapped.x - box.x),
    h: Math.max(24, snapped.y - box.y),
    guides: snapped.guides,
  };
}
