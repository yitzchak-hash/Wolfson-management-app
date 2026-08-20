// Spacing snapping, worked by hand.
//
// The whole module is pure — boxes in, an offset and some lines out — so it is
// checked with arithmetic rather than by dragging things about in a browser.
// Every expected number below was worked out on paper first; a test that asks
// the code what it does and then asserts that is not a test.
import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await (await b.newContext()).newPage();
await p.goto('http://localhost:5173/');

const out = await p.evaluate(async () => {
  const m = await import('/src/data/snapping.ts');
  const r = [];
  const near = (a, want, eps = 0.51) => Math.abs(a - want) <= eps;
  /** The bars a result is drawing, as plain numbers. */
  const bars = res => res.guides.filter(g => g.gap)
    .map(g => ({ axis: g.axis, at: Math.round(g.at), span: Math.round(g.to - g.from), label: g.label }));

  // A row of three cards, 100 wide, 60 tall, gaps of 40.
  //   A: 0..100   B: 140..240   C: 280..380      all at y 0..60
  const A = { x: 0, y: 0, w: 100, h: 60 };
  const B = { x: 140, y: 0, w: 100, h: 60 };
  const C = { x: 280, y: 0, w: 100, h: 60 };

  // ── 1. The same gap again ───────────────────────────────────────────────
  // A fourth card dropped near the end of the row: the known gap is 40, so
  // its left edge wants x = 380 + 40 = 420. Dropped at 423, it is pulled 3.
  {
    const moving = { x: 423, y: 0, w: 100, h: 60 };
    const res = m.snapBox(moving, [A, B, C], 6, 0, true);
    r.push(['a fourth card takes the row’s own gap', near(res.x, 420), `x ${res.x}`]);
    r.push(['and two bars say why', bars(res).length === 2, JSON.stringify(bars(res))]);
    r.push(['both measuring 40', bars(res).every(x => x.label === '40'), JSON.stringify(bars(res).map(x => x.label))]);
    r.push(['drawn as horizontal bars (axis y) at the shared middle',
      bars(res).every(x => x.axis === 'y' && x.at === 30), JSON.stringify(bars(res))]);
  }

  // ── 2. Nothing within reach is left alone ───────────────────────────────
  {
    const moving = { x: 460, y: 0, w: 100, h: 60 };   // 40 past the snap point
    const res = m.snapBox(moving, [A, B, C], 6, 0, true);
    r.push(['a card nowhere near a gap is not dragged to one', near(res.x, 460), `x ${res.x}`]);
    r.push(['and draws no bars', bars(res).length === 0]);
  }

  // ── 3. Put it in the middle ─────────────────────────────────────────────
  // A wide hole: D at 0..100 and E at 500..600, so 400 of free space. A 100
  // wide card centred in it sits at 100 + (400-100)/2 = 250.
  {
    const D = { x: 0, y: 0, w: 100, h: 60 };
    const E = { x: 500, y: 0, w: 100, h: 60 };
    const moving = { x: 253, y: 0, w: 100, h: 60 };
    const res = m.snapBox(moving, [D, E], 6, 0, true);
    r.push(['dropped between two things it lands in the middle', near(res.x, 250), `x ${res.x}`]);
    const bb = bars(res);
    r.push(['with a bar on each side', bb.length === 2, JSON.stringify(bb)]);
    r.push(['both the same width', bb.length === 2 && bb[0].span === bb[1].span,
      JSON.stringify(bb.map(x => x.span))]);
    r.push(['and that width is 150', bb.every(x => x.span === 150), JSON.stringify(bb.map(x => x.span))]);
  }

  // ── 4. Off by default ───────────────────────────────────────────────────
  {
    const moving = { x: 423, y: 0, w: 100, h: 60 };
    const res = m.snapBox(moving, [A, B, C], 6, 0);
    r.push(['spacing is off unless asked for', near(res.x, 423), `x ${res.x}`]);
  }

  // ── 5. Alignment still wins its axis ────────────────────────────────────
  // A card whose left edge is 2px from C's left edge AND 3px from the row's
  // gap position. The edge is the stronger statement and must take the axis.
  {
    const moving = { x: 282, y: 200, w: 100, h: 60 };
    const res = m.snapBox(moving, [A, B, C], 6, 0, true);
    r.push(['a real edge beats a gap that also fits', near(res.x, 280), `x ${res.x}`]);
    r.push(['and it draws an alignment line, not a spacing bar',
      bars(res).length === 0 && res.guides.length > 0, JSON.stringify(res.guides)]);
  }

  // ── 6. Each axis decides for itself ─────────────────────────────────────
  // The classic case: a third card taking its SPACING from the row and its
  // ALIGNMENT from the tops. Dropped 3 short on x and 2 low on y.
  {
    const moving = { x: 423, y: 2, w: 100, h: 60 };
    const res = m.snapBox(moving, [A, B, C], 6, 0, true);
    r.push(['spacing on one axis and alignment on the other, together',
      near(res.x, 420) && near(res.y, 0), `x ${res.x} y ${res.y}`]);
  }

  // ── 7. Another row is not this row ──────────────────────────────────────
  // The same three cards moved far down. A card up at y 0 shares no band with
  // them, so their gap says nothing about where it belongs.
  {
    const far = [A, B, C].map(o => ({ ...o, y: 900 }));
    const moving = { x: 423, y: 0, w: 100, h: 60 };
    const res = m.snapBox(moving, far, 6, 0, true);
    r.push(['a gap in another row is not offered', near(res.x, 423), `x ${res.x}`]);
  }

  // ── 8. The grid is still the last answer ────────────────────────────────
  // Spacing decided x, so the grid must not then round it to 22s. (The card
  // has to be IN the row for spacing to have anything to say — parking it far
  // below to dodge the alignment on y would test nothing but the grid.)
  {
    const moving = { x: 423, y: 3, w: 100, h: 60 };
    const res = m.snapBox(moving, [A, B, C], 6, 22, true);
    r.push(['a spacing snap is not then rounded to the grid', near(res.x, 420), `x ${res.x}`]);
  }
  {
    // …and with nothing in reach, the grid still has the last word.
    const moving = { x: 1000, y: 1000, w: 100, h: 60 };
    const res = m.snapBox(moving, [A, B, C], 6, 22, true);
    r.push(['with nothing in reach the grid still rounds',
      res.x % 22 === 0 && res.y % 22 === 0, `x ${res.x} y ${res.y}`]);
  }

  // ── 9. Resizing to leave a known gap ────────────────────────────────────
  // P at 300..400 and Q at 460..560, so the row's own gap is 60. A box at
  // x 0 grown until the space ahead of it reads 60 is 300 - 60 = 240 wide.
  //
  // The numbers are chosen so 240 is NOT near any edge of P or Q: with the
  // first set it landed exactly on a neighbour's right edge, and plain edge
  // alignment produced the same answer — the assertion passed while the code
  // under test never ran.
  {
    const P = { x: 300, y: 0, w: 100, h: 60 };
    const Q = { x: 460, y: 0, w: 100, h: 60 };
    const box = { x: 0, y: 0, w: 237, h: 60 };
    const res = m.snapResize(box, [P, Q], 6, 0, false, true);
    r.push(['a resize can land on a known gap', near(res.w, 240), `w ${res.w}`]);
    r.push(['and says so with a bar', res.guides.some(g => g.gap && g.label === '60'),
      JSON.stringify(res.guides.filter(g => g.gap))]);
    const off = m.snapResize(box, [P, Q], 6, 0, false);
    r.push(['and does nothing at all when spacing is off', near(off.w, 237), `w ${off.w}`]);
  }

  // ── 10. A resize is never offered the gap BEHIND it ─────────────────────
  // The near edge is pinned, so "sit 40 after B" is not something a resize can
  // do — and acting on it would size the box to a number that means nothing.
  {
    const box = { x: 243, y: 0, w: 30, h: 60 };   // left edge 3 off "40 after B"
    const res = m.snapResize(box, [A, B], 6, 0, false, true);
    r.push(['a resize ignores the gap behind it', near(res.w, 30), `w ${res.w}`]);
  }

  // ── 11. Width AND height can both match ─────────────────────────────────
  // They could not before: matching the width pushed guides labelled with the
  // other axis's letter, which the height's own test then found and refused.
  {
    const twin = { x: 700, y: 700, w: 180, h: 120 };
    const box = { x: 0, y: 300, w: 177, h: 123 };
    const res = m.snapResize(box, [twin], 6, 0, true);
    r.push(['a resize can match a width and a height at once',
      near(res.w, 180) && near(res.h, 120), `${res.w}x${res.h}`]);
  }

  return r;
});

let fails = 0;
for (const [label, ok, extra] of out) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) fails++;
}
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
