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
  /**
   * A SPACING bar rather than an alignment line.
   *
   * It runs across the gap it is measuring instead of along an edge, and the
   * board draws it with end caps and its measurement. Without the distinction
   * a spacing bar reads as an alignment line lying across the middle of two
   * things that are not, in fact, lined up with anything.
   */
  gap?: boolean;
  /** What to print on a spacing bar — the gap, in board units. */
  label?: string;
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

// ─── Spacing ─────────────────────────────────────────────────────────────────
/**
 * Snapping to the SPACE between things, not only to their edges.
 *
 * Lining edges up is half of tidiness; the other half is that the gaps are the
 * same. Edge and size snapping cannot express that at all — three cards whose
 * tops are perfectly level and whose gaps read 18, 41 and 18 are lined up and
 * still look wrong, and nothing in the older rules would ever have pulled the
 * middle one straight. That was the owner's "the snapping doesn't help
 * separating between two items".
 *
 * Two things a hand actually means:
 *   - **put it in the middle** — dropping something between two neighbours
 *     lands it with equal space either side;
 *   - **the same gap again** — a gap that already exists somewhere in the row
 *     is offered as the gap to the next thing along.
 */

/** Do these two share a band on the cross axis — i.e. are they in the same row? */
function sameRow(m: Box, o: Box) { return o.y < m.y + m.h && o.y + o.h > m.y; }
function sameCol(m: Box, o: Box) { return o.x < m.x + m.w && o.x + o.w > m.x; }

/**
 * Where a spacing bar should sit across a pair, so it lands on both of them.
 *
 * `axis` here names the CROSS axis — the one the bar is positioned on — so it
 * is the middle of however much of each other the two boxes cover.
 */
function bandMid(a: Box, b: Box, axis: 'x' | 'y') {
  const lo = axis === 'x' ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
  const hi = axis === 'x'
    ? Math.min(a.x + a.w, b.x + b.w)
    : Math.min(a.y + a.h, b.y + b.h);
  return (lo + hi) / 2;
}

interface GapCandidate { delta: number; guides: Guide[] }

/**
 * One axis of spacing snapping, written once and used for both.
 *
 * `mode` is what keeps it honest for a resize. A MOVE changes the gap on both
 * sides of the box, so every candidate is fair game. A resize pins the near
 * edge, so the gap BEHIND the box cannot change at all — offering a candidate
 * that assumed it could would size the box to a number that means nothing.
 * Only "the far edge sits a known gap short of the thing ahead" survives.
 */
function gapAxis(
  moving: Box, others: Box[], tolerance: number, axis: 'x' | 'y',
  mode: 'move' | 'grow' = 'move',
): GapCandidate | null {
  const pos = (b: Box) => (axis === 'x' ? b.x : b.y);
  const size = (b: Box) => (axis === 'x' ? b.w : b.h);
  const end = (b: Box) => pos(b) + size(b);
  const shifted = (d: number): Box => (axis === 'x'
    ? { ...moving, x: moving.x + d } : { ...moving, y: moving.y + d });

  // Only things in the same band count. A gap between two boxes that do not
  // overlap on the other axis is not a gap anybody can see, and offering it
  // would drag things towards numbers taken from the far side of the board.
  const row = others
    .filter(o => (axis === 'x' ? sameRow(moving, o) : sameCol(moving, o)))
    .sort((a, b) => pos(a) - pos(b));
  if (!row.length) return null;

  /** A spacing bar spanning `lo..hi` across the pair it measures. */
  const bar = (a: Box, b: Box, lo: number, hi: number): Guide => ({
    // A HORIZONTAL bar is `axis: 'y'` in this module's language (a y and a
    // span of x), which is the opposite letter from the axis being snapped.
    axis: axis === 'x' ? 'y' : 'x',
    // …and it is positioned on the cross axis, which is the opposite letter
    // again — so `bandMid` is asked about the axis being snapped.
    at: bandMid(a, b, axis === 'x' ? 'y' : 'x'),
    from: lo, to: hi,
    gap: true,
    label: String(Math.round(hi - lo)),
  });

  const cands: GapCandidate[] = [];

  // The gaps that already exist between consecutive neighbours in this band.
  const known: { g: number; a: Box; b: Box }[] = [];
  for (let i = 0; i < row.length - 1; i++) {
    const g = pos(row[i + 1]) - end(row[i]);
    if (g > 0.5) known.push({ g, a: row[i], b: row[i + 1] });
  }

  // ── Put it in the middle ────────────────────────────────────────────────
  // A move only: centring depends on the gap behind the box, which a resize
  // cannot touch.
  for (let i = 0; mode === 'move' && i < row.length - 1; i++) {
    const a = row[i], b = row[i + 1];
    const free = pos(b) - end(a);
    if (free <= size(moving)) continue;               // it does not fit between them
    const g = (free - size(moving)) / 2;
    const want = end(a) + g;
    const delta = want - pos(moving);
    if (Math.abs(delta) > tolerance) continue;
    const m = shifted(delta);
    cands.push({
      delta,
      guides: [bar(a, m, end(a), pos(m)), bar(m, b, end(m), pos(b))],
    });
  }

  // ── The same gap again ──────────────────────────────────────────────────
  for (const { g, a: sa, b: sb } of known) {
    for (const o of row) {
      // After it… (the gap BEHIND the box, so a move only)
      let delta = (end(o) + g) - pos(moving);
      if (mode === 'move' && Math.abs(delta) <= tolerance) {
        const m = shifted(delta);
        // The bar over the gap that SUPPLIED the number is drawn too: one bar
        // says "this gap is 24", two say "this gap is the same as that one",
        // which is the whole claim being made.
        cands.push({ delta, guides: [bar(o, m, end(o), pos(m)), bar(sa, sb, end(sa), pos(sb))] });
      }
      // …and before it — the gap AHEAD, which is the one a resize can change,
      // so this is the only candidate a growing box is offered.
      delta = (pos(o) - g - size(moving)) - pos(moving);
      if (pos(o) > end(moving) - tolerance && Math.abs(delta) <= tolerance) {
        const m = shifted(delta);
        cands.push({ delta, guides: [bar(m, o, end(m), pos(o)), bar(sa, sb, end(sa), pos(sb))] });
      }
    }
  }

  if (!cands.length) return null;
  return cands.reduce((best, c) => (Math.abs(c.delta) < Math.abs(best.delta) ? c : best));
}

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
  /** Offer equal spacing as well as alignment. */
  spacing = false,
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

  const guides: Guide[] = [];
  if (bestX) guides.push(bestX.guide);
  if (bestY) guides.push(bestY.guide);

  let x = moving.x + (bestX?.delta ?? 0);
  let y = moving.y + (bestY?.delta ?? 0);

  /**
   * Spacing comes SECOND on each axis, and the grid third.
   *
   * An edge that genuinely lines up is a stronger statement than a gap that
   * happens to match, so a real alignment keeps the axis — the same rule the
   * grid and the size match already follow. But each axis decides for itself,
   * which is what makes the ordinary case work: placing a third card in a row
   * takes its spacing from the X axis and its alignment from the Y.
   */
  let decidedX = !!bestX, decidedY = !!bestY;
  if (spacing) {
    if (!decidedX) {
      const g = gapAxis(moving, others, tolerance, 'x');
      if (g) { x = moving.x + g.delta; guides.push(...g.guides); decidedX = true; }
    }
    if (!decidedY) {
      const g = gapAxis(moving, others, tolerance, 'y');
      if (g) { y = moving.y + g.delta; guides.push(...g.guides); decidedY = true; }
    }
  }

  /**
   * The grid is the LAST answer.
   *
   * Lining up with the thing next to it is what somebody means; landing on a
   * grid line is a consolation when there is nothing next to it. Taking the
   * grid first would drag a tile away from the tile it was being lined up with.
   *
   * Which axes are already spoken for is tracked in two plain booleans rather
   * than read back out of the guide list: a spacing bar's `axis` is the
   * OPPOSITE letter to the axis it decides, so sniffing the list gets it
   * backwards in a way that is very easy to write and very hard to see.
   */
  if (gridStep > 0) {
    if (!decidedX) x = Math.round(x / gridStep) * gridStep;
    if (!decidedY) y = Math.round(y / gridStep) * gridStep;
  }

  return { x, y, guides };
}

/**
 * The same, for a resize: the moving box's far corner is what is being placed,
 * so its near corner must stay put.
 *
 * `matchSize` is the advanced half the owner asked for: as well as lining the
 * far edge up with a neighbour's edge or middle, the box can snap to a
 * neighbour's WIDTH or HEIGHT — "resize to certain sizes together with other
 * objects next to it". Two boxes the same size but not in a line have no edge
 * in common, so edge snapping alone can never find it.
 *
 * A size match draws its guide along the matched dimension of BOTH boxes — two
 * lines of the same length say "these two are now the same width" in a way a
 * single line at an edge cannot.
 */
export function snapResize(
  box: Box,
  others: Box[],
  tolerance = 6,
  gridStep = 0,
  matchSize = false,
  /** Offer the gap to the neighbour ahead as well as its edges and its size. */
  spacing = false,
): { w: number; h: number; guides: Guide[] } {
  const far = { x: box.x + box.w, y: box.y + box.h, w: 0, h: 0 };
  const snapped = snapBox(far, others, tolerance, gridStep);
  let w = Math.max(24, snapped.x - box.x);
  let h = Math.max(24, snapped.y - box.y);
  const guides = [...snapped.guides];

  /**
   * Which axis has already been settled, in two plain booleans.
   *
   * This used to be read back out of the guide list, which was wrong twice
   * over: a size match on the WIDTH pushes guides labelled `axis: 'y'` (they
   * are horizontal lines), so the height's own test then found them and
   * refused — width and height could never both be matched. A spacing bar has
   * the same inverted letter. Recording the decision where it is made is the
   * only version of this that stays right.
   */
  let doneX = snapped.guides.some(g => g.axis === 'x');
  let doneY = snapped.guides.some(g => g.axis === 'y');

  if (matchSize) {
    // The nearest neighbour of nearly the same size wins, so a board of
    // like-sized cards does not fight over which one is being matched.
    let bw: Box | null = null, bh: Box | null = null;
    for (const o of others) {
      if (Math.abs(o.w - w) <= tolerance && (!bw || Math.abs(o.w - w) < Math.abs(bw.w - w))) bw = o;
      if (Math.abs(o.h - h) <= tolerance && (!bh || Math.abs(o.h - h) < Math.abs(bh.h - h))) bh = o;
    }
    // Only when an edge did not already decide that axis — a real alignment
    // beats a coincidence of size.
    if (bw && !doneX) {
      w = bw.w; doneX = true;
      guides.push({ axis: 'y', at: box.y + h / 2, from: box.x, to: box.x + w });
      guides.push({ axis: 'y', at: bw.y + bw.h / 2, from: bw.x, to: bw.x + bw.w });
    }
    if (bh && !doneY) {
      h = bh.h; doneY = true;
      guides.push({ axis: 'x', at: box.x + w / 2, from: box.y, to: box.y + h });
      guides.push({ axis: 'x', at: bh.x + bh.w / 2, from: bh.y, to: bh.y + bh.h });
    }
  }

  /**
   * Growing a box until the space it leaves matches a space that already
   * exists — the resize half of the same idea.
   *
   * Only the FAR edge is moving, so only a neighbour ahead of it can be
   * involved: the near edge is pinned and the gap behind the box cannot
   * change. The candidate comes from asking `gapAxis` about a box the size
   * being tried; whatever it wants to SHIFT that box by is what the size has
   * to change by instead, which is why a shift that would have moved the box
   * backwards (a smaller box, gap unchanged) is not a resize answer at all.
   */
  if (spacing) {
    if (!doneX) {
      const g = gapAxis({ x: box.x, y: box.y, w, h }, others, tolerance, 'x', 'grow');
      if (g && w + g.delta >= 24) { w += g.delta; guides.push(...g.guides); doneX = true; }
    }
    if (!doneY) {
      const g = gapAxis({ x: box.x, y: box.y, w, h }, others, tolerance, 'y', 'grow');
      if (g && h + g.delta >= 24) { h += g.delta; guides.push(...g.guides); }
    }
  }

  return { w, h, guides };
}
