/**
 * The gvs (B8, picks 23–26 · 58–62): a lowered-ceiling box drawn by hand,
 * in SHEET UNITS (the block layer's), knowing its own numbers.
 *
 * Pure geometry: area and perimeter (m² and running metres once the sheet's
 * scale is applied), the corner snap (walls, wall corners and other boxes —
 * pick 59), and the union of two RECTILINEAR boxes of the same drop that
 * overlap or share a stretch of edge (pick 62: one perimeter, one m²; a
 * corner touch alone never joins). The running-metre number is the plain
 * perimeter until the architect's formula lands (follow-up #3).
 */

export interface Pt { x: number; y: number }

/** A lowered ceiling on the sheet. */
export interface SketchShape {
  id: string;
  sheetId: string;
  page: number;
  /** Which option of the floor it belongs to (pick 27); absent = the first. */
  option?: string;
  /** Corners, sheet units, in order (closed implicitly). */
  pts: Pt[];
  /** How far it drops, cm (a positive number: 35 is "−35"). */
  drop: number;
  /** The legend's colour for that drop, or a custom one (pick 58). */
  color: string;
  name?: string;
  createdAt: string;
  createdBy: string;
}

/** The sheet's legend (Sitting 11): the drop in cm and its colour. */
export const DROPS: { drop: number; color: string }[] = [
  { drop: 10, color: '#16a34a' },
  { drop: 30, color: '#eab308' },
  { drop: 35, color: '#6b8e23' },
  { drop: 40, color: '#ec4899' },
];
export const colorForDrop = (drop: number): string => DROPS.find(d => d.drop === drop)?.color ?? '#64748b';
export const dropLabel = (drop: number): string => `−${drop}`;

/** Signed area (shoelace), sheet units². */
export function polyArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
  return a / 2;
}
export function polyPerimeter(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += Math.hypot(q.x - p.x, q.y - p.y); }
  return s;
}
export function centroid(pts: Pt[]): Pt {
  const a = polyArea(pts);
  if (Math.abs(a) < 1e-9) return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; const f = p.x * q.y - q.x * p.y; cx += (p.x + q.x) * f; cy += (p.y + q.y) * f; }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}
export function pointInPoly(p: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export const bounds = (pts: Pt[]) => ({ x0: Math.min(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), x1: Math.max(...pts.map(p => p.x)), y1: Math.max(...pts.map(p => p.y)) });

/** A dragged rectangle, as a polygon. */
export function rectPoly(a: Pt, b: Pt): Pt[] {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}

/** The box's numbers (pick 60): drop, m², running metres. */
export function boxNumbers(pts: Pt[], mPerW: number): { m2: number; runM: number } {
  const k = mPerW / 1000;                       // metres per sheet unit
  return { m2: Math.abs(polyArea(pts)) * k * k, runM: polyPerimeter(pts) * k };
}

/** Every edge is horizontal or vertical (within a hair). */
export function isRectilinear(pts: Pt[], eps = 0.01): boolean {
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; if (Math.abs(p.x - q.x) > eps && Math.abs(p.y - q.y) > eps) return false; }
  return true;
}

/* ── the corner snap (pick 59) ─────────────────────────────────────────── */

/** Snap a point to the nearest of these magnets (other boxes' corners and edges), within reach; `null` when none. */
export function snapToBoxes(p: Pt, boxes: Pt[][], reach: number): Pt | null {
  let best: Pt | null = null, bd = reach;
  for (const poly of boxes) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      // a corner first — it is the stronger magnet
      const dc = Math.hypot(a.x - p.x, a.y - p.y);
      if (dc < bd) { bd = dc; best = { ...a }; }
      // then the nearest point on the edge
      const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
      if (L < 1e-9) continue;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
      const q = { x: a.x + t * dx, y: a.y + t * dy };
      const de = Math.hypot(q.x - p.x, q.y - p.y);
      if (de < bd - 1e-6) { bd = de; best = q; }
    }
  }
  return best;
}

/**
 * Snap to the plan's INK: the nearest dark pixel within reach is a wall's
 * face; if ink runs both across and down from it, it is a wall corner, and
 * the corner wins. In the pixels of the image handed in.
 */
export function snapToInk(img: ImageData, cx: number, cy: number, reach: number): { x: number; y: number; corner: boolean } | null {
  const { width, height, data } = img;
  const dark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const i = (y * width + x) * 4;
    return data[i + 3] >= 40 && 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 120;
  };
  const R = Math.ceil(reach);
  let best: { x: number; y: number; d: number } | null = null;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = dx * dx + dy * dy; if (d > reach * reach) continue;
    const x = Math.round(cx) + dx, y = Math.round(cy) + dy;
    if (!dark(x, y)) continue;
    // prefer the wall's FACE: an ink pixel with paper beside it
    const face = !dark(x - 1, y) || !dark(x + 1, y) || !dark(x, y - 1) || !dark(x, y + 1);
    const score = d + (face ? 0 : reach * reach);
    if (!best || score < best.d) best = { x, y, d: score };
  }
  if (!best) return null;
  // a corner: an INSIDE corner is an ink pixel with paper on its diagonal while both walls run on along
  // their axes; an OUTSIDE corner is where both walls END — paper along both axes ahead, ink behind
  let corner: { x: number; y: number } | null = null, cd = Infinity;
  // looked for over one and a half times the reach: a corner is the stronger magnet (pick 59 — the risk of grabbing the
  // wrong one is accepted), and a hand aiming at a corner lands short of it more often than beside it
  const R2 = Math.ceil(reach * 1.5);
  for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) {
    const x = Math.round(cx) + dx, y = Math.round(cy) + dy;
    if (dx * dx + dy * dy > R2 * R2 || !dark(x, y)) continue;
    let isCorner = false;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const inside = !dark(x + sx, y + sy) && dark(x + 3 * sx, y) && dark(x, y + 3 * sy);
      const outside = !dark(x + sx, y) && !dark(x, y + sy) && dark(x - 3 * sx, y) && dark(x, y - 3 * sy);
      if (inside || outside) isCorner = true;
    }
    if (isCorner) { const d = Math.hypot(x - cx, y - cy); if (d < cd) { cd = d; corner = { x, y }; } }
  }
  return corner ? { ...corner, corner: true } : { x: best.x, y: best.y, corner: false };
}

/* ── the union (pick 62) ──────────────────────────────────────────────── */

/** Do two rectilinear boxes overlap or share a stretch of edge? A corner touch alone is not touching. */
export function boxesTouch(a: Pt[], b: Pt[]): boolean {
  const u = unionRectilinear(a, b);
  return u !== null;
}

/**
 * The union of two rectilinear polygons, or `null` when they do not touch
 * (overlap, or share a stretch of edge). Coordinate compression: every x and
 * y of both is a grid line; a cell is inside when its centre is inside
 * either; the cells must be one 4-connected piece; the boundary is the cell
 * edges that do not cancel, chained into the largest loop, collinear points
 * dropped.
 */
export function unionRectilinear(a: Pt[], b: Pt[]): Pt[] | null {
  if (!isRectilinear(a) || !isRectilinear(b)) return null;
  const xs = [...new Set([...a, ...b].map(p => +p.x.toFixed(3)))].sort((p, q) => p - q);
  const ys = [...new Set([...a, ...b].map(p => +p.y.toFixed(3)))].sort((p, q) => p - q);
  const nx = xs.length - 1, ny = ys.length - 1;
  if (nx < 1 || ny < 1) return null;
  const inside: boolean[] = new Array(nx * ny).fill(false);
  const inA: boolean[] = new Array(nx * ny).fill(false), inB: boolean[] = new Array(nx * ny).fill(false);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 };
    inA[j * nx + i] = pointInPoly(c, a); inB[j * nx + i] = pointInPoly(c, b);
    inside[j * nx + i] = inA[j * nx + i] || inB[j * nx + i];
  }
  // one connected piece, and both boxes represented in it
  const seen = new Array(nx * ny).fill(false);
  const start = inside.findIndex(Boolean); if (start < 0) return null;
  const stack = [start]; seen[start] = true; let sawA = false, sawB = false;
  while (stack.length) {
    const k = stack.pop()!; const i = k % nx, j = (k - i) / nx;
    if (inA[k]) sawA = true; if (inB[k]) sawB = true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const kk = jj * nx + ii; if (inside[kk] && !seen[kk]) { seen[kk] = true; stack.push(kk); }
    }
  }
  if (!sawA || !sawB || inside.some((v, k) => v && !seen[k])) return null;
  // boundary edges: directed, opposite pairs cancel
  const key = (p: Pt, q: Pt) => `${p.x},${p.y}>${q.x},${q.y}`;
  const edges = new Map<string, [Pt, Pt]>();
  const add = (p: Pt, q: Pt) => { const rk = key(q, p); if (edges.has(rk)) edges.delete(rk); else edges.set(key(p, q), [p, q]); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!inside[j * nx + i]) continue;
    const p00 = { x: xs[i], y: ys[j] }, p10 = { x: xs[i + 1], y: ys[j] }, p11 = { x: xs[i + 1], y: ys[j + 1] }, p01 = { x: xs[i], y: ys[j + 1] };
    add(p00, p10); add(p10, p11); add(p11, p01); add(p01, p00);
  }
  // chain into loops
  const byStart = new Map<string, [Pt, Pt][]>();
  for (const e of edges.values()) { const k = `${e[0].x},${e[0].y}`; if (!byStart.has(k)) byStart.set(k, []); byStart.get(k)!.push(e); }
  const loops: Pt[][] = [];
  const used = new Set<[Pt, Pt]>();
  for (const e0 of edges.values()) {
    if (used.has(e0)) continue;
    const loop: Pt[] = [e0[0]]; let cur = e0; used.add(cur);
    for (let guard = 0; guard < edges.size + 1; guard++) {
      const next = (byStart.get(`${cur[1].x},${cur[1].y}`) ?? []).find(e => !used.has(e));
      if (!next) break;
      loop.push(next[0]); used.add(next); cur = next;
      if (cur[1].x === e0[0].x && cur[1].y === e0[0].y) break;
    }
    loops.push(loop);
  }
  if (!loops.length) return null;
  loops.sort((p, q) => Math.abs(polyArea(q)) - Math.abs(polyArea(p)));
  return dropCollinear(loops[0]);
}

/** Drop points that sit on the straight line between their neighbours. */
export function dropCollinear(pts: Pt[]): Pt[] {
  if (pts.length < 4) return pts;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[(i + pts.length - 1) % pts.length], c = pts[i], n = pts[(i + 1) % pts.length];
    const cross = (c.x - p.x) * (n.y - c.y) - (c.y - p.y) * (n.x - c.x);
    if (Math.abs(cross) > 1e-6) out.push(c);
  }
  return out.length >= 3 ? out : pts;
}

/**
 * Merge a fresh box into the sheet's boxes: any box of the SAME drop and
 * colour it touches is swallowed, repeatedly, until nothing touches. Returns
 * the merged polygon and the ids it absorbed.
 */
export function mergeInto(fresh: Pt[], drop: number, color: string, others: SketchShape[]): { pts: Pt[]; absorbed: string[] } {
  let pts = fresh; const absorbed: string[] = [];
  let again = true;
  while (again) {
    again = false;
    for (const o of others) {
      if (absorbed.includes(o.id) || o.drop !== drop || o.color !== color) continue;
      const u = unionRectilinear(pts, o.pts);
      if (u) { pts = u; absorbed.push(o.id); again = true; }
    }
  }
  return { pts, absorbed };
}
