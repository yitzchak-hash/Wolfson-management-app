// Offline test of the shape recognizer — pure geometry, hand-built figures,
// run through vite's ssrLoadModule (the taskdays idiom). Every figure is
// generated in the recognizer's own UNIFORM space and converted to sheet
// coordinates, so a "square" really is square on the landscape sheet.
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const { recognizeShape } = await vite.ssrLoadModule('/src/components/plans/shapeSnap.ts');

let fails = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) fails++;
};

const ASPECT = 1.4;                       // a landscape sheet
// uniform space -> normalised sheet coordinates
const toSheet = (X, Y) => ({ x: X / 1000, y: (Y * ASPECT) / 1000 });
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 2 - 1; };
const j = (v, amp = 2) => v + rnd() * amp;

// walk an edge with n samples, jittered
function edge(ax, ay, bx, by, n = 14, amp = 2) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    out.push(toSheet(j(ax + (bx - ax) * t, amp), j(ay + (by - ay) * t, amp)));
  }
  return out;
}

// 1 — a wobbly but level line snaps to a LINE, dead level
{
  const pts = edge(200, 300, 420, 304, 30, 2.2);
  const r = recognizeShape(pts, ASPECT);
  check(r?.kind === 'line' && r.as === 'line', `a near-level stroke is a line (${r?.kind})`);
  const dy = r ? Math.abs(r.pts[0].y - r.pts[1].y) : 1;
  check(r && dy < 1e-6, 'and it is snapped exactly level');
}

// 2 — the calligraphy zigzag is NOT a line and NOT a shape
{
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    pts.push(toSheet(200 + i * 12, 300 + (i % 2 ? 26 : -20)));
  }
  check(recognizeShape(pts, ASPECT) === null, 'a zigzag stays freehand');
}

// 3 — a rough square becomes a SQUARE (equalised box)
{
  const pts = [
    ...edge(300, 200, 460, 202, 14, 2.5),
    ...edge(460, 202, 458, 358, 14, 2.5),
    ...edge(458, 358, 300, 356, 14, 2.5),
    ...edge(300, 356, 301, 203, 14, 2.5),
  ];
  const r = recognizeShape(pts, ASPECT);
  check(r?.kind === 'square' && r.as === 'rect', `a rough square is a square (${r?.kind})`);
  if (r) {
    const w = Math.abs(r.pts[1].x - r.pts[0].x) * 1000;
    const h = (Math.abs(r.pts[1].y - r.pts[0].y) * 1000) / ASPECT;
    check(Math.abs(w - h) < 0.01, `and its sides are equal (${w.toFixed(1)} vs ${h.toFixed(1)})`);
  }
}

// 4 — a plainly-oblong box stays a RECTANGLE
{
  const pts = [
    ...edge(200, 200, 520, 203, 16, 2.5),
    ...edge(520, 203, 518, 330, 12, 2.5),
    ...edge(518, 330, 200, 327, 16, 2.5),
    ...edge(200, 327, 202, 202, 12, 2.5),
  ];
  const r = recognizeShape(pts, ASPECT);
  check(r?.kind === 'rect' && r.as === 'rect', `an oblong box is a rectangle (${r?.kind})`);
}

// 5 — a rough circle becomes a CIRCLE (equal box)
{
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * Math.PI * 2;
    pts.push(toSheet(j(400 + Math.cos(t) * 110, 3), j(320 + Math.sin(t) * 110, 3)));
  }
  const r = recognizeShape(pts, ASPECT);
  check(r?.kind === 'circle' && r.as === 'ellipse', `a round loop is a circle (${r?.kind})`);
  if (r) {
    const w = Math.abs(r.pts[1].x - r.pts[0].x) * 1000;
    const h = (Math.abs(r.pts[1].y - r.pts[0].y) * 1000) / ASPECT;
    check(Math.abs(w - h) < 0.01, 'and its box is equal-sided');
  }
}

// 6 — a wide oval becomes an ELLIPSE
{
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * Math.PI * 2;
    pts.push(toSheet(j(400 + Math.cos(t) * 160, 3), j(320 + Math.sin(t) * 80, 3)));
  }
  const r = recognizeShape(pts, ASPECT);
  check(r?.kind === 'ellipse', `a wide oval is an ellipse (${r?.kind})`);
}

// 7 — three corners are a TRIANGLE, emitted as a closed polyline
{
  const pts = [
    ...edge(350, 180, 480, 400, 16, 2.5),
    ...edge(480, 400, 220, 396, 16, 2.5),
    ...edge(220, 396, 348, 182, 16, 2.5),
  ];
  const r = recognizeShape(pts, ASPECT);
  check(r?.kind === 'triangle' && r.as === 'poly' && r.pts.length === 4,
    `three corners are a triangle (${r?.kind}, ${r?.pts.length} pts)`);
  if (r) {
    const yb1 = (r.pts[1].y * 1000) / ASPECT, yb2 = (r.pts[2].y * 1000) / ASPECT;
    check(Math.abs(yb1 - yb2) < 0.01, 'and its flattish base is levelled');
  }
}

// 8 — ten alternating spikes are a STAR
{
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const th = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? 150 : 62;
    const a = { x: 400 + Math.cos(th) * rr, y: 330 + Math.sin(th) * rr };
    const thN = -Math.PI / 2 + ((i + 1) * Math.PI) / 5;
    const rrN = (i + 1) % 2 === 0 ? 150 : 62;
    const b = { x: 400 + Math.cos(thN) * rrN, y: 330 + Math.sin(thN) * rrN };
    for (let k = 0; k < 6; k++) {
      const t = k / 6;
      pts.push(toSheet(j(a.x + (b.x - a.x) * t, 1.6), j(a.y + (b.y - a.y) * t, 1.6)));
    }
    if (i === 10) break;
  }
  const r = recognizeShape(pts, ASPECT);
  check(r?.kind === 'star' && r.as === 'poly', `alternating spikes are a star (${r?.kind})`);
}

// 9 — a hand-drawn heart matches the template
{
  const pts = [];
  for (let i = 0; i <= 56; i++) {
    const t = (i / 56) * Math.PI * 2;
    const X = 16 * Math.sin(t) ** 3;
    const Y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push(toSheet(j(400 + X * 7, 2.4), j(300 + Y * 7, 2.4)));
  }
  const r = recognizeShape(pts, ASPECT);
  check(r?.kind === 'heart' && r.as === 'poly', `a drawn heart is a heart (${r?.kind})`);
}

// 10 — an aimless scribble is left alone
{
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    pts.push(toSheet(300 + i * 6 + rnd() * 30, 300 + Math.sin(i * 1.7) * 60 + rnd() * 30));
  }
  check(recognizeShape(pts, ASPECT) === null, 'an aimless scribble stays freehand');
}

// 11 — a tiny tick is left alone
{
  const pts = edge(300, 300, 310, 306, 8, 1);
  check(recognizeShape(pts, ASPECT) === null, 'a tiny mark stays freehand');
}

await vite.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
