/**
 * Snap-to-shape — Samsung Notes' "neat shapes" idea, done locally.
 *
 * A freehand stroke, on pen-lift and only while the toggle is on, is offered
 * to this recognizer. If the hand plainly meant a shape — a line, a box, a
 * circle, a triangle, a star, a heart — the stroke is replaced by the clean
 * version, in the same ink. If nothing matches confidently the stroke stays
 * exactly as drawn: a wrong snap is worse than no snap, so every threshold
 * here errs toward "leave it alone".
 *
 * Pure geometry, no store, no DOM — tested offline by scratchpad/shapesnap.mjs
 * with hand-worked figures.
 *
 * COORDINATES. Stroke points arrive normalised 0..1 against the SHEET (x of
 * its width, y of its height), which distorts angles on any non-square page —
 * a square drawn on a landscape A1 comes in wider than tall. Everything here
 * therefore works in a uniform space (x·1000, y·1000/aspect where aspect is
 * sheetW/sheetH — the same 1000-unit reference width the stroke widths use)
 * and converts back at the end.
 */

export interface SnapShape {
  kind: 'line' | 'rect' | 'square' | 'ellipse' | 'circle' | 'triangle' | 'star' | 'heart';
  /**
   * How to emit it: as one of the app's own first-class shape marks, or as a
   * clean freehand polyline in the pen that drew it (for the shapes that have
   * no tool of their own).
   */
  as: 'line' | 'rect' | 'ellipse' | 'poly';
  /** Output points, back in normalised sheet coordinates. */
  pts: { x: number; y: number }[];
}

interface P { x: number; y: number }

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(pts: P[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

/** Resample a path to n evenly spaced points (the $1-recognizer step). */
function resample(pts: P[], n: number): P[] {
  const L = pathLength(pts) / (n - 1);
  if (L <= 0) return pts.slice(0, 1);
  const out: P[] = [{ ...pts[0] }];
  let acc = 0;
  const src = pts.map(p => ({ ...p }));
  for (let i = 1; i < src.length; i++) {
    const d = dist(src[i - 1], src[i]);
    if (acc + d >= L && d > 0) {
      const t = (L - acc) / d;
      const q = {
        x: src[i - 1].x + t * (src[i].x - src[i - 1].x),
        y: src[i - 1].y + t * (src[i].y - src[i - 1].y),
      };
      out.push(q);
      src.splice(i, 0, q);
      acc = 0;
    } else acc += d;
  }
  while (out.length < n) out.push({ ...src[src.length - 1] });
  return out.slice(0, n);
}

function bbox(pts: P[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

function centroid(pts: P[]): P {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}

/**
 * Corners of a CLOSED path: turning angle over a window, local maxima only.
 * Resampled first so the window means the same thing on a slow, dense stroke
 * and a fast, sparse one.
 */
function corners(rs: P[]): { idx: number; turn: number }[] {
  const n = rs.length;
  const k = 4;
  const turns: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rs[(i - k + n) % n], b = rs[i], c = rs[(i + k) % n];
    const v1 = { x: b.x - a.x, y: b.y - a.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const l1 = Math.hypot(v1.x, v1.y), l2 = Math.hypot(v2.x, v2.y);
    if (l1 < 1e-6 || l2 < 1e-6) { turns.push(0); continue; }
    const cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (l1 * l2)));
    turns.push((Math.acos(cos) * 180) / Math.PI);
  }
  const found: { idx: number; turn: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = turns[i];
    if (t < 38) continue;
    // local max over ±5 samples, circular
    let isMax = true;
    for (let j = -5; j <= 5; j++) {
      if (j !== 0 && turns[(i + j + n) % n] > t) { isMax = false; break; }
    }
    if (!isMax) continue;
    // non-max suppression: keep one per neighbourhood
    const near = found.find(f => Math.min(Math.abs(f.idx - i), n - Math.abs(f.idx - i)) < 7);
    if (near) { if (t > near.turn) { near.idx = i; near.turn = t; } continue; }
    found.push({ idx: i, turn: t });
  }
  return found.sort((a, b) => a.idx - b.idx);
}

/** The classic upright heart, sampled once, normalised to a centred unit box. */
function heartTemplate(n: number): P[] {
  const raw: P[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    // y is flipped for screen coordinates (down is positive)
    raw.push({
      x: 16 * Math.sin(t) ** 3,
      y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
    });
  }
  return normBox(raw);
}

/** Scale a closed path into a unit box centred on the origin. */
function normBox(pts: P[]): P[] {
  const b = bbox(pts);
  const s = Math.max(b.w, b.h) || 1;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  return pts.map(p => ({ x: (p.x - cx) / s, y: (p.y - cy) / s }));
}

/**
 * Mean point distance between two same-length closed loops, under the best
 * cyclic shift and either direction — the drawing may start anywhere on the
 * outline and run either way round.
 */
function loopScore(a: P[], b: P[]): number {
  const n = a.length;
  let best = Infinity;
  for (const dir of [1, -1]) {
    for (let s = 0; s < n; s++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const j = (s + dir * i + n * n) % n;
        sum += dist(a[i], b[j]);
        if (sum > best * n) break;       // early out
      }
      const m = sum / n;
      if (m < best) best = m;
    }
  }
  return best;
}

const HEART = heartTemplate(48);

/**
 * Recognise a freehand stroke as a shape, or answer null to leave it alone.
 *
 * `aspect` is sheetWidth / sheetHeight — see the coordinates note on top.
 */
export function recognizeShape(raw: P[], aspect: number): SnapShape | null {
  if (raw.length < 6) return null;
  const A = aspect > 0 ? aspect : 1;
  const pts: P[] = raw.map(p => ({ x: p.x * 1000, y: (p.y * 1000) / A }));
  const back = (p: P): P => ({ x: p.x / 1000, y: (p.y * A) / 1000 });

  const L = pathLength(pts);
  const b = bbox(pts);
  const diag = Math.hypot(b.w, b.h);
  if (diag < 18 || L < 24) return null;          // a dot or a tick, not a shape

  const first = pts[0], last = pts[pts.length - 1];
  const gapEnds = dist(first, last);

  // ── LINE — an open stroke that never strays from its own chord ──────────
  if (gapEnds > L * 0.55) {
    const chord = gapEnds;
    let maxDev = 0;
    const dx = last.x - first.x, dy = last.y - first.y;
    for (const p of pts) {
      const t = Math.max(0, Math.min(1, ((p.x - first.x) * dx + (p.y - first.y) * dy) / (chord * chord)));
      const d = Math.hypot(p.x - (first.x + t * dx), p.y - (first.y + t * dy));
      if (d > maxDev) maxDev = d;
    }
    if (chord > 26 && maxDev < Math.max(5, chord * 0.055)) {
      // Snap a nearly-level or nearly-45° line to exactly that angle, about
      // its midpoint — 2° of slope on a long line reads as a mistake.
      let a0 = first, a1 = last;
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      const snapped = Math.round(ang / 45) * 45;
      if (Math.abs(ang - snapped) < 6) {
        const mid = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
        const r = chord / 2, th = (snapped * Math.PI) / 180;
        a0 = { x: mid.x - Math.cos(th) * r, y: mid.y - Math.sin(th) * r };
        a1 = { x: mid.x + Math.cos(th) * r, y: mid.y + Math.sin(th) * r };
      }
      return { kind: 'line', as: 'line', pts: [back(a0), back(a1)] };
    }
    return null;
  }

  // ── everything below needs a CLOSED loop ────────────────────────────────
  if (gapEnds > Math.max(L * 0.18, 26)) return null;

  const rs = resample(pts, 96);
  const cs = corners(rs);
  const c = centroid(rs);

  /**
   * How far the drawn path strays from straight between two corners, as a
   * fraction of that edge's length. What separates a rectangle from a heart
   * that also happens to show four "corners": a rectangle's sides are
   * straight, a heart's lobes bulge.
   */
  const edgeBulge = (): number => {
    let worst = 0;
    for (let e = 0; e < cs.length; e++) {
      const i0 = cs[e].idx, i1 = cs[(e + 1) % cs.length].idx;
      const a = rs[i0], bp = rs[i1];
      const chord = dist(a, bp);
      if (chord < 1e-6) continue;
      const dx = bp.x - a.x, dy = bp.y - a.y;
      let i = i0;
      while (i !== i1) {
        i = (i + 1) % rs.length;
        const p = rs[i];
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (chord * chord)));
        const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) / chord;
        if (d > worst) worst = d;
      }
    }
    return worst;
  };

  // ── CIRCLE / ELLIPSE — the radius profile fits an axis-aligned ellipse ──
  // A wide oval's two tight ends legitimately read as "corners", so up to two
  // are allowed; the fit error is the real gate.
  if (cs.length <= 2) {
    const a = Math.max(1e-6, b.w / 2), e = Math.max(1e-6, b.h / 2);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    let err = 0;
    for (const p of rs) {
      const q = ((p.x - cx) / a) ** 2 + ((p.y - cy) / e) ** 2;
      err += Math.abs(Math.sqrt(Math.max(0, q)) - 1);
    }
    err /= rs.length;
    if (err < 0.16 && Math.min(a, e) > 9) {
      const round = Math.abs(a - e) < 0.16 * Math.max(a, e);
      const r = (a + e) / 2;
      const p0 = round ? { x: cx - r, y: cy - r } : { x: b.x0, y: b.y0 };
      const p1 = round ? { x: cx + r, y: cy + r } : { x: b.x1, y: b.y1 };
      return { kind: round ? 'circle' : 'ellipse', as: 'ellipse', pts: [back(p0), back(p1)] };
    }
  }

  // ── TRIANGLE — three real corners joined by straight-ish edges ──────────
  if (cs.length === 3 && edgeBulge() < 0.1) {
    const tri = cs.map(k => rs[k.idx]);
    // A triangle drawn with a flattish base gets the base levelled — the
    // Samsung manner: the shape you meant, not the wobble you drew.
    let lo = 0;
    for (let i = 1; i < 3; i++) if (tri[i].y > tri[lo].y) lo = i;
    const others = [0, 1, 2].filter(i => i !== lo);
    const base = others.reduce((m, i) => (tri[i].y > tri[m].y ? i : m), others[0]);
    if (Math.abs(tri[lo].y - tri[base].y) < 0.12 * b.h) {
      const y = (tri[lo].y + tri[base].y) / 2;
      tri[lo] = { ...tri[lo], y }; tri[base] = { ...tri[base], y };
    }
    return { kind: 'triangle', as: 'poly', pts: [...tri, tri[0]].map(back) };
  }

  // ── RECTANGLE / SQUARE — four corners joined by straight-ish edges ──────
  if (cs.length === 4 && edgeBulge() < 0.09) {
    const quad = cs.map(k => rs[k.idx]);
    // Edge orientations, folded into 0..90 — a rectangle's edges all land on
    // the same answer mod 90.
    let sx = 0, sy = 0;
    for (let i = 0; i < 4; i++) {
      const p = quad[i], q = quad[(i + 1) % 4];
      const th = Math.atan2(q.y - p.y, q.x - p.x);
      sx += Math.cos(4 * th); sy += Math.sin(4 * th);
    }
    const dom = Math.atan2(sy, sx) / 4;          // -22.5°..22.5° about an axis
    const domDeg = (dom * 180) / Math.PI;
    if (Math.abs(domDeg) < 11) {
      // Meant straight: the corners' own bounding box, squared up.
      let { x0, y0, x1, y1 } = bbox(quad);
      if (Math.abs((x1 - x0) - (y1 - y0)) < 0.14 * Math.max(x1 - x0, y1 - y0)) {
        const s = ((x1 - x0) + (y1 - y0)) / 2;
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        x0 = cx - s / 2; x1 = cx + s / 2; y0 = cy - s / 2; y1 = cy + s / 2;
        return { kind: 'square', as: 'rect', pts: [back({ x: x0, y: y0 }), back({ x: x1, y: y1 })] };
      }
      return { kind: 'rect', as: 'rect', pts: [back({ x: x0, y: y0 }), back({ x: x1, y: y1 })] };
    }
    // Deliberately tilted: a true rotated rectangle through the drawn centre.
    const w2 = [];
    for (let i = 0; i < 4; i++) w2.push(dist(quad[i], quad[(i + 1) % 4]));
    const eW = (w2[0] + w2[2]) / 2, eH = (w2[1] + w2[3]) / 2;
    const th0 = Math.atan2(quad[1].y - quad[0].y, quad[1].x - quad[0].x);
    const cq = centroid(quad);
    const ux = Math.cos(th0), uy = Math.sin(th0);
    const vx = -uy, vy = ux;
    const cornersOut: P[] = [
      { x: cq.x - (ux * eW) / 2 - (vx * eH) / 2, y: cq.y - (uy * eW) / 2 - (vy * eH) / 2 },
      { x: cq.x + (ux * eW) / 2 - (vx * eH) / 2, y: cq.y + (uy * eW) / 2 - (vy * eH) / 2 },
      { x: cq.x + (ux * eW) / 2 + (vx * eH) / 2, y: cq.y + (uy * eW) / 2 + (vy * eH) / 2 },
      { x: cq.x - (ux * eW) / 2 + (vx * eH) / 2, y: cq.y - (uy * eW) / 2 + (vy * eH) / 2 },
    ];
    return { kind: 'rect', as: 'poly', pts: [...cornersOut, cornersOut[0]].map(back) };
  }

  // ── STAR — ten-ish corners whose radii alternate long/short ─────────────
  if (cs.length >= 8 && cs.length <= 12) {
    const radii = cs.map(k => dist(rs[k.idx], c));
    const n = radii.length;
    // The walk may START on a spike or in a valley, so the test is that the
    // radius genuinely zigzags — the sign of the step flips at every corner —
    // never that the even positions are the long ones.
    let flips = 0;
    for (let i = 0; i < n; i++) {
      const d1 = radii[i] - radii[(i + 1) % n];
      const d2 = radii[(i + 1) % n] - radii[(i + 2) % n];
      if (d1 * d2 < 0) flips++;
    }
    const sorted = [...radii].sort((a, b) => a - b);
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
    const r = mean(sorted.slice(0, n >> 1));
    const R = mean(sorted.slice(n >> 1));
    if (flips >= n - 2 && R / Math.max(1e-6, r) > 1.45) {
      // An ideal five-point star, its top spike straight up.
      const out: P[] = [];
      for (let i = 0; i < 10; i++) {
        const th = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? R : r;
        out.push({ x: c.x + Math.cos(th) * rr, y: c.y + Math.sin(th) * rr });
      }
      return { kind: 'star', as: 'poly', pts: [...out, out[0]].map(back) };
    }
  }

  // ── HEART — a template match, because a heart has no tidy geometry ──────
  if (cs.length <= 4) {
    const cand = normBox(resample(pts, 48));
    if (loopScore(cand, HEART) < 0.085) {
      const s = Math.max(b.w, b.h);
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      const out = HEART.map(p => ({ x: cx + p.x * s, y: cy + p.y * s }));
      return { kind: 'heart', as: 'poly', pts: [...out, out[0]].map(back) };
    }
  }

  return null;
}
