/**
 * Pipes and ducts by hand (B8, picks 28 · 54–57): draw rough, get straight.
 *
 * A pen stroke in SHEET UNITS comes in; a clean run goes out: simplified,
 * every stretch within ~25° of an axis made the axis (a deliberate diagonal
 * stays as drawn — pick 54), corners drawn as quarter circles, a run laid
 * beside an existing one stepped aside so both show. Each end snaps to a
 * unit's connection dot (pick 56), and the run knows its kind, its two ends
 * and its length in metres (pick 55). Pure: no store, no DOM.
 */
import type { Pt } from './gvs';

export type PipeKind = 'refrigerant' | 'drain' | 'duct' | 'electric';
export const PIPE_KINDS: PipeKind[] = ['refrigerant', 'drain', 'duct', 'electric'];

/** How a kind is drawn (pick 57: each its own look from the sheet's legend) — the admin app's rules override these (pick 55). */
export interface PipeLook { color: string; dash?: string; /** a pair of lines (the refrigerant pair) */ pair?: boolean; /** default width for a duct, cm */ sizeCm?: number; label?: string }
export const DEFAULT_PIPE_LOOKS: Record<PipeKind, PipeLook> = {
  refrigerant: { color: '#dc2626', pair: true, label: '' },
  drain: { color: '#2563eb', dash: '6 4', label: '' },
  duct: { color: '#0891b2', sizeCm: 20, label: '' },
  electric: { color: '#f59e0b', dash: '2 4', label: '' },
};
export type PipeRules = Partial<Record<PipeKind, Partial<PipeLook>>>;
export const pipeLook = (kind: PipeKind, rules?: PipeRules | null): PipeLook => ({ ...DEFAULT_PIPE_LOOKS[kind], ...(rules?.[kind] ?? {}) });

/** A run on the sheet. */
export interface SketchPipe {
  id: string;
  sheetId: string;
  page: number;
  option?: string;
  kind: PipeKind;
  /** The straightened run, sheet units. */
  pts: Pt[];
  /** The units it leaves and reaches, when its ends snapped to their dots. */
  fromId?: string;
  toId?: string;
  /** A duct's width, cm — the outlet's it left (pick 56). */
  widthCm?: number;
  createdAt: string;
  createdBy: string;
}

/** A connection dot on a unit, in sheet units. */
export interface Dot { itemId: string; x: number; y: number; kind: 'pipe' | 'outlet'; sizeCm: number }

/** Length of a run in metres. */
export function pipeLength(pts: Pt[], mPerW: number): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return (s * mPerW) / 1000;
}

/** Ramer–Douglas–Peucker. */
export function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const d2 = (p: Pt, a: Pt, b: Pt) => {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const t = L < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const rec = (i0: number, i1: number, out: Pt[]) => {
    let far = -1, fd = tol;
    for (let i = i0 + 1; i < i1; i++) { const d = d2(pts[i], pts[i0], pts[i1]); if (d > fd) { fd = d; far = i; } }
    if (far < 0) return;
    rec(i0, far, out); out.push(pts[far]); rec(far, i1, out);
  };
  const out: Pt[] = [pts[0]]; rec(0, pts.length - 1, out); out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Straighten LIGHTLY (pick 54): a stretch within `tolDeg` of an axis becomes
 * the axis (the next point slides onto it); anything steeper stays as drawn.
 * Consecutive collinear stretches fold into one.
 */
export function straighten(raw: Pt[], tol = 5, tolDeg = 25): Pt[] {
  const pts = simplify(raw, tol).map(p => ({ ...p }));
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i];
    const dx = q.x - p.x, dy = q.y - p.y;
    const ang = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;   // 0 = horizontal, 90 = vertical
    if (ang <= tolDeg) q.y = p.y;
    else if (ang >= 90 - tolDeg) q.x = p.x;
  }
  return fold(pts);
}

/** Fold collinear neighbours and drop zero-length steps. */
export function fold(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    if (out.length && Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) < 0.05) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2], b = out[out.length - 1];
      const cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x);
      const dot = (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y);
      if (Math.abs(cross) < 1e-6 && dot > 0) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  return out;
}

/** The nearest dot within reach, or null. */
export function nearestDot(p: Pt, dots: Dot[], reach: number): Dot | null {
  let best: Dot | null = null, bd = reach;
  for (const d of dots) { const dd = Math.hypot(d.x - p.x, d.y - p.y); if (dd < bd) { bd = dd; best = d; } }
  return best;
}

/**
 * Pin an end of a straightened run to a dot. The end moves onto the dot; if
 * that bends its last stretch off the axis it was on, an elbow is added so
 * the run still arrives square (the way pipes are actually laid).
 */
export function pinEnd(pts: Pt[], target: Pt, atStart: boolean): Pt[] {
  const p = atStart ? [...pts].reverse() : pts.slice();
  if (p.length === 1) return [target];
  const last = p[p.length - 1], prev = p[p.length - 2];
  const EPS = 0.05;   // a twentieth of a sheet unit: "on the axis" is a judgement, not an equality
  const wasH = Math.abs(last.y - prev.y) < EPS, wasV = Math.abs(last.x - prev.x) < EPS;
  const out = p.slice(0, -1);
  if (wasH && Math.abs(target.y - prev.y) > EPS && Math.abs(target.x - prev.x) > EPS) out.push({ x: target.x, y: prev.y });
  else if (wasV && Math.abs(target.x - prev.x) > EPS && Math.abs(target.y - prev.y) > EPS) out.push({ x: prev.x, y: target.y });
  else if (wasH) out[out.length - 1] = { x: prev.x, y: target.y };   // a hair off the axis: the stretch simply ends on the dot's line
  else if (wasV) out[out.length - 1] = { x: target.x, y: prev.y };
  out.push(target);
  const folded = fold(out);
  return atStart ? folded.reverse() : folded;
}

/**
 * Step aside (Sitting 10): an axis stretch laid within `gap` of an existing
 * run's parallel stretch, overlapping it, is shifted `gap` away so both
 * lines show. The first and last stretches are left alone — their ends may
 * be pinned to a dot. Neighbouring stretches, being perpendicular, simply
 * lengthen or shorten.
 */
export function stepAside(pts: Pt[], others: Pt[][], gap: number): Pt[] {
  const out = pts.map(p => ({ ...p }));
  for (let i = 1; i < out.length - 2; i++) {
    const a = out[i], b = out[i + 1];
    const horiz = Math.abs(a.y - b.y) < 1e-6, vert = Math.abs(a.x - b.x) < 1e-6;
    if (!horiz && !vert) continue;
    let shift = 0;
    for (const o of others) for (let j = 1; j < o.length; j++) {
      const c = o[j - 1], d = o[j];
      if (horiz && Math.abs(c.y - d.y) < 1e-6) {
        const dist = a.y - c.y;
        const overlap = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
        if (Math.abs(dist) < gap && overlap > 0) shift = (dist >= 0 ? 1 : -1) * (gap - Math.abs(dist)) || gap;
      } else if (vert && Math.abs(c.x - d.x) < 1e-6) {
        const dist = a.x - c.x;
        const overlap = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
        if (Math.abs(dist) < gap && overlap > 0) shift = (dist >= 0 ? 1 : -1) * (gap - Math.abs(dist)) || gap;
      }
    }
    if (shift) { if (horiz) { a.y += shift; b.y += shift; } else { a.x += shift; b.x += shift; } }
  }
  return fold(out);
}

/** An SVG path with quarter-circle corners of radius `r` (shortened where a stretch is short). */
export function roundedPath(pts: Pt[], r: number): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${pts[0].x} ${pts[0].y} L${pts[1].x} ${pts[1].y}`;
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1], c = pts[i], n = pts[i + 1];
    const l1 = Math.hypot(c.x - p.x, c.y - p.y), l2 = Math.hypot(n.x - c.x, n.y - c.y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    if (rr < 0.01) { d += ` L${c.x} ${c.y}`; continue; }
    const u1 = { x: (c.x - p.x) / l1, y: (c.y - p.y) / l1 }, u2 = { x: (n.x - c.x) / l2, y: (n.y - c.y) / l2 };
    const a = { x: c.x - u1.x * rr, y: c.y - u1.y * rr }, b = { x: c.x + u2.x * rr, y: c.y + u2.y * rr };
    const cross = u1.x * u2.y - u1.y * u2.x;
    const sweep = cross > 0 ? 1 : 0;
    d += ` L${a.x} ${a.y} A${rr} ${rr} 0 0 ${sweep} ${b.x} ${b.y}`;
  }
  const e = pts[pts.length - 1];
  d += ` L${e.x} ${e.y}`;
  return d;
}

/** The midpoint along the run, for its label. */
export function midpoint(pts: Pt[]): { x: number; y: number; horiz: boolean } {
  let total = 0; const segs: number[] = [];
  for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); segs.push(L); total += L; }
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    if (acc + segs[i] >= total / 2) {
      const t = segs[i] < 1e-9 ? 0 : (total / 2 - acc) / segs[i];
      const a = pts[i], b = pts[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, horiz: Math.abs(b.y - a.y) <= Math.abs(b.x - a.x) };
    }
    acc += segs[i];
  }
  return { x: pts[0].x, y: pts[0].y, horiz: true };
}
