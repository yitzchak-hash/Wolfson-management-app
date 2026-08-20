/**
 * Freehand ink on a board surface — the geometry, and what a rub-out does.
 *
 * Lifted out of `GeneralJobsPage` because a group window is a board too, and
 * the one thing this codebase keeps paying for is a second copy of a rule: the
 * eraser alone carries three separate traps (a legacy stroke's stored box is a
 * lie, a surviving run must be re-added as a NODE, a run of one point draws
 * nothing), and a group window with its own version of them would have fallen
 * into all three again.
 *
 * Everything here is PURE — no store, no DOM, no React. `planErase` says what
 * a pass of the eraser would change and the caller does the writing, which is
 * what makes it testable offline and what lets the main board and a group
 * window share it without either knowing the other exists.
 */
import { CanvasElement } from '../types';
import { strokePoints } from '../components/board/BoardNodes';

export interface InkPoint { x: number; y: number }

/**
 * How far a point is from a segment.
 *
 * Testing the stored POINTS alone is what made the plan editor's first eraser
 * only work at a stroke's corners: a fast drag leaves a long straight segment
 * with nothing in the middle of it to hit.
 */
export function distToSegment(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number,
): number {
  const vx = bx - ax, vy = by - ay;
  const len = vx * vx + vy * vy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/** The box a polyline occupies, which is also the box its node gets. */
export function pointsBounds(pts: InkPoint[]) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  // A perfectly straight line has no extent on one axis, and a node with no
  // height cannot be drawn into or grabbed.
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
}

export const fmtPoints = (pts: InkPoint[]) =>
  pts.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');

/**
 * The record a finished stroke becomes.
 *
 * EVERY finished drawing is a node — movable, resizable, snappable. The first
 * rule promoted only ink that overlapped nothing, treating a stroke across a
 * tile as annotation; on a real board that read as "my scribble didn't become
 * anything", because a dense board leaves no clear space. The blocking problem
 * that rule existed to avoid is solved at the hit test instead: a drawing
 * node's container is `pointer-events-none` and only a fat invisible hit-line
 * over the ink catches the pointer, so a stroke across a tile never stops the
 * tile being clicked.
 *
 * The points are rounded FIRST, so the stored box and the stored path describe
 * exactly the same rectangle — a box a fraction out draws the ink very
 * slightly stretched.
 */
export function strokeRecord(opts: {
  id: string;
  pts: InkPoint[];
  color: string;
  width: number;
  nib?: string;
  /** A highlighter lays translucent ink and is stored as such. */
  marker?: boolean;
  /** Which board this belongs to — omit for the main one. */
  board?: string;
}): CanvasElement {
  const pts = opts.pts.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  return {
    id: opts.id,
    type: 'stroke',
    ...(opts.board ? { board: opts.board } : {}),
    ...pointsBounds(pts),
    text: '',
    color: opts.color,
    points: fmtPoints(pts),
    strokeWidth: opts.width,
    nib: opts.nib as CanvasElement['nib'],
    ...(opts.marker ? { art: 'marker' as const } : {}),
    data: { own: true },
  } as CanvasElement;
}

export interface ErasePlan {
  /** Elements to delete outright. */
  remove: string[];
  /** Surviving pieces of a cut stroke, to be added. */
  add: CanvasElement[];
}

/**
 * One pass of the eraser at a board point.
 *
 * `whole` lifts any mark it touches. Otherwise the stroke is CUT: the points
 * inside the eraser go, and each run that survives either side becomes a stroke
 * of its own — still one record per stroke, never one per point. A run of a
 * single point is dropped, because a polyline of one draws nothing and would
 * only be an invisible thing to trip over later.
 */
export function planErase(
  elements: CanvasElement[],
  p: InkPoint,
  opts: {
    /** The eraser's width, in BOARD units. Halved here. */
    width: number;
    whole: boolean;
    /** The board being rubbed out — nothing on another one is touched. */
    board?: string;
    newId: () => string;
  },
): ErasePlan {
  const plan: ErasePlan = { remove: [], add: [] };
  const r = opts.width / 2;
  const want = opts.board ?? '';

  elements.forEach(el => {
    if (el.type !== 'stroke' || !el.points) return;
    if ((el.board ?? '') !== want) return;
    const reach = r + (el.strokeWidth ?? 3) / 2;
    // Cheap rejection first: most of a board is nowhere near the pointer.
    // Trusted only for strokes that became nodes — a legacy flat-ink stroke
    // (drawn before every stroke was promoted) can carry a stored box that has
    // nothing to do with where its ink actually is, which is exactly how two
    // old scribbles shrugged the eraser off. Those are box-checked from their
    // real points below instead.
    if (el.data?.own && (p.x < el.x - reach || p.x > el.x + el.w + reach
      || p.y < el.y - reach || p.y > el.y + el.h + reach)) return;

    const pts = strokePoints(el);
    if (pts.length < 2) return;
    if (!el.data?.own) {
      const b = pointsBounds(pts);
      if (p.x < b.x - reach || p.x > b.x + b.w + reach
        || p.y < b.y - reach || p.y > b.y + b.h + reach) return;
    }
    const hitsSegment = pts.some((pt, i) =>
      i > 0 && distToSegment(p.x, p.y, pts[i - 1].x, pts[i - 1].y, pt.x, pt.y) <= reach);
    if (!hitsSegment) return;

    if (opts.whole) { plan.remove.push(el.id); return; }

    const runs: InkPoint[][] = [];
    let run: InkPoint[] = [];
    pts.forEach(pt => {
      if (Math.hypot(pt.x - p.x, pt.y - p.y) <= reach) {
        if (run.length) { runs.push(run); run = []; }
      } else {
        run.push(pt);
      }
    });
    if (run.length) runs.push(run);

    plan.remove.push(el.id);
    runs.filter(rn => rn.length > 1).forEach(rn => {
      // The surviving pieces are always nodes, even when the stroke that was
      // cut was legacy flat ink — otherwise erasing a scribble would breed more
      // unerasable ones.
      plan.add.push({
        ...el, id: opts.newId(), ...pointsBounds(rn), points: fmtPoints(rn),
        data: { ...(el.data ?? {}), own: true },
      });
    });
  });

  return plan;
}
