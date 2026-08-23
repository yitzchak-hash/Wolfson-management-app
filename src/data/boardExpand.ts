import { Apartment, CanvasElement } from '../types';

/**
 * How the board gains room, and why it has to be asked for.
 *
 * The board's origin is 0,0 and it grows down and to the right, which is what
 * makes everything else simple: the world is exactly as big as what is on it,
 * the overview maps cleanly, and panning clamps against a known rectangle.
 *
 * Wanting room ABOVE or to the LEFT breaks that — there is nothing to grow
 * into, because negative space does not exist. So instead of moving the origin
 * (which would ripple through the pan clamp, the overview, the saved layouts
 * and every stored position), everything already on the board is SHIFTED down
 * or right by a screenful. The result is what you asked for — empty room above
 * your work — with the origin left exactly where every other part of the app
 * expects to find it.
 *
 * Because that moves things somebody placed deliberately, it is never silent.
 * Dragging a node hard against a locked edge asks first, and the answer can be
 * kept as a standing permission for that side.
 */

export type Side = 'top' | 'left' | 'right' | 'bottom';

export interface ExpandLocks {
  top?: boolean; left?: boolean; right?: boolean; bottom?: boolean;
}

/** Down and right by default — how a board has always behaved. */
export const allowed = (locks: ExpandLocks | undefined, side: Side): boolean => {
  const l = locks ?? {};
  if (side === 'right') return l.right ?? true;
  if (side === 'bottom') return l.bottom ?? true;
  return l[side] ?? false;
};

/**
 * How near an edge counts as asking for room.
 *
 * In WORLD units, so it means the same thing at every zoom — a threshold in
 * screen pixels would make the gesture easy at 25% and nearly impossible at
 * 300%.
 */
export const EDGE_REACH = 80;

/**
 * Which edge a node has been pushed against, if any.
 *
 * Only the two that need permission: down and right grow on their own, so
 * there is nothing to ask about there.
 */
export function edgePushed(x: number, y: number): Side | null {
  if (y < EDGE_REACH && y <= x) return 'top';
  if (x < EDGE_REACH) return 'left';
  return null;
}

/**
 * A LITTLE room at a time — the owner's ruling. A whole screenful per press
 * teleported the board: press once and everything you were looking at is
 * gone. 300 world units is about a tile and a half; press it again for more.
 * The caller compensates the pan by the same amount, so nothing on screen
 * appears to move — the board simply gains space.
 */
export const roomFor = (_viewport: number, _zoom: number): number => 300;

export interface Shift { dx: number; dy: number }

/**
 * Everything moves, including the thing that was just dragged.
 *
 * The node that asked for the room keeps its position RELATIVE to the rest —
 * it does not stay pinned to the edge while the board slides out from under
 * it, which would read as the drag having been undone.
 */
export function shiftFor(side: Side, amount: number): Shift {
  return side === 'top' ? { dx: 0, dy: amount }
    : side === 'left' ? { dx: amount, dy: 0 }
    : { dx: 0, dy: 0 };
}

/** The new position of every job on this board after a shift. */
export function shiftJobs(
  jobs: Apartment[],
  { dx, dy }: Shift,
  viewId: string,
): { id: string; x: number; y: number }[] {
  return jobs.map(j => {
    const at = viewId
      ? { x: j.viewPos?.[viewId]?.x ?? j.canvasX ?? 0, y: j.viewPos?.[viewId]?.y ?? j.canvasY ?? 0 }
      : { x: j.canvasX ?? 0, y: j.canvasY ?? 0 };
    return { id: j.id, x: at.x + dx, y: at.y + dy };
  });
}

/**
 * And every node — except the bins, which are furniture.
 *
 * A bin sits where the office put it and is a fixture of the board rather than
 * content on it; sliding the four of them every time somebody makes room above
 * would slowly walk them off into the distance.
 */
export function shiftNodes(
  nodes: CanvasElement[],
  { dx, dy }: Shift,
): { id: string; x: number; y: number }[] {
  return nodes
    .filter(n => n.type !== 'bin')
    .map(n => ({ id: n.id, x: n.x + dx, y: n.y + dy }));
}
