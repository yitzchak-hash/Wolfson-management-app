// The board gives empty edge back — but never while your hand is on it.
//
// Two claims, and they pull in opposite directions, so both have to be
// measured or "fixing" one silently breaks the other:
//   1. WHILE dragging: the world must not shrink and the pan must not move.
//      That is the "everything jumps" the office reported — the surface gets
//      smaller under the pointer, the pan re-clamps to the new edge, and the
//      board slides sideways while something is still being held.
//   2. AFTER the drop: the world takes its true size and the space closes up.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });

// One note near the origin, and one FAR out — the far one is what holds the
// board open, so carrying it back in is what should give the space back.
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], apartments: [],
    canvasElements: [
      { id: 'CE-home', type: 'note', x: 200, y: 200, w: 200, h: 140, text: 'home', color: '#fef9c3' },
      { id: 'CE-far', type: 'note', x: 3000, y: 240, w: 200, h: 140, text: 'far', color: '#dbeafe' },
      { id: 'CE-bin-x', type: 'bin', x: 260, y: 500, w: 178, h: 92, text: 'A group', color: '#64748b' },
      { id: 'CE-gnear', type: 'note', x: 20, y: 40, w: 180, h: 120, text: 'near', color: '#fef9c3', board: 'CE-bin-x' },
      { id: 'CE-gfar', type: 'note', x: 1500, y: 40, w: 180, h: 120, text: 'far', color: '#dbeafe', board: 'CE-bin-x' },
    ],
  }));
});

const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3200);

/**
 * The world div's own width/height, and where the board is panned to.
 *
 * Found by NAME. The first version took the viewport's first child, which is
 * the tool rail — so every reading was 116px wide and the harness cheerfully
 * reported that the board never shrinks, for entirely the wrong reason.
 */
const world = () => page.evaluate(() => {
  const w = document.querySelector('[data-board-world]');
  if (!w) return null;
  // The pan lives on the TRANSFORMED ancestor, not on the surface itself.
  const moved = w.closest('[style*="translate"]') ?? w.parentElement;
  const t = getComputedStyle(moved).transform;
  const m = t && t !== 'none' ? t.match(/matrix\(([^)]+)\)/) : null;
  const n = m ? m[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0];
  return { w: w.offsetWidth, h: w.offsetHeight, panX: Math.round(n[4]), panY: Math.round(n[5]) };
});

const before = await world();
console.log('       world at rest:', JSON.stringify(before));
check(!!before && before.w >= 3200, 'the far note holds the board open', `${before?.w}px wide`);

// Pan right so the far note is on screen and there IS empty board past it.
await page.mouse.move(700, 500);
await page.mouse.down({ button: 'middle' });
await page.mouse.move(-1700, 500, { steps: 20 });
await page.mouse.up({ button: 'middle' });
await page.waitForTimeout(500);

const far = await page.$('[data-node-id="CE-far"]');
check(!!far, 'the far note is reachable');
if (!far) { console.log('CANNOT CONTINUE'); await b.close(); process.exit(1); }

// ── 1. Mid-drag: nothing shrinks, nothing slides ──────────────────────────
const fb = await far.boundingBox();
const held = { x: fb.x + fb.width / 2, y: fb.y + fb.height / 2 };
await page.mouse.move(held.x, held.y);
await page.mouse.down();
await page.mouse.move(held.x - 40, held.y + 10);
await page.waitForTimeout(90);

const atGrab = await world();
// Carry it back toward the origin, sampling as it goes — 500px is already
// more than one 400px step of content, so the world would certainly have
// shrunk under the hand before.
//
// Deliberately STOPPING well clear of the screen edge: within 80px of it the
// board's edge auto-pan arms and moves the pan on purpose, which is a feature
// and not the fault being measured. The first version dragged into that band
// and reported the auto-pan as the board sliding under the hand.
const EDGE_REACH = 80;
const samples = [];
for (let i = 1; i <= 5; i++) {
  const at = held.x - 40 - i * 100;
  if (at < EDGE_REACH + 60) break;
  await page.mouse.move(at, held.y + 10, { steps: 3 });
  await page.waitForTimeout(70);
  samples.push(await world());
}
console.log('       at grab:', JSON.stringify(atGrab));
console.log('       during :', JSON.stringify(samples.map(s => `${s.w}@${s.panX}`)));

const shrank = samples.filter(s => s.w < atGrab.w);
const slid = samples.filter(s => s.panX !== atGrab.panX || s.panY !== atGrab.panY);
check(shrank.length === 0, 'the world never shrinks while the note is held',
  shrank.length ? `${shrank.length} of ${samples.length} samples smaller` : '');
check(slid.length === 0, 'and the board does not slide under the hand',
  slid.length ? `pan moved on ${slid.length} of ${samples.length} samples` : '');

// ── 2. On release: the space is given back ────────────────────────────────
await page.mouse.up();
await page.waitForTimeout(900);
const settled = await world();
console.log('       settled:', JSON.stringify(settled));
check(settled.w < atGrab.w, 'the board de-expands once the note is let go',
  `${atGrab.w} → ${settled.w}`);

const moved = await page.evaluate(() => {
  const el = (JSON.parse(localStorage.getItem('general_app_data')).canvasElements ?? [])
    .find(e => e.id === 'CE-far');
  return el ? el.x : null;
});
check(moved !== null && moved < 2500, 'and the note really did move in', `x ${moved}`);

// ── 3. Dragging OUTWARD still grows the board under the tile ──────────────
{
  const n = await page.$('[data-node-id="CE-far"]');
  const nb = await n.boundingBox();
  const start = await world();
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(nb.x + nb.width / 2 + i * 130, nb.y + nb.height / 2, { steps: 3 });
    await page.waitForTimeout(70);
  }
  const grown = await world();
  await page.mouse.up();
  await page.waitForTimeout(700);
  console.log('       outward:', JSON.stringify({ start: start.w, grown: grown.w }));
  check(grown.w >= start.w, 'dragging outward still grows the board under the tile',
    `${start.w} → ${grown.w}`);
}

// ── 4. The same rule inside a group ───────────────────────────────────────
// A group's surface is a native SCROLLER, so one that shrinks under the
// pointer has its scroll clamped by the browser and the content lurches — the
// same fault arriving by a different route.
{
  // Back to the home corner first. The tests above deliberately pan the board
  // thousands of pixels to the right, so the group — which lives near the
  // origin — is off the left of the screen and a double-click aimed at its
  // rect lands on nothing. The seed guard means a reload keeps the state.
  await page.reload();
  await page.waitForTimeout(3000);

  const bin = await page.$('[data-node-id="CE-bin-x"]');
  check(!!bin, 'the group is on the board');
  if (bin) {
    // ROUND-6: the drag above left the view panned far right (the pinned-edge
    // clamp keeps a valid pan where the hand left it, it no longer springs
    // back), so the group near the origin is OFF-SCREEN. Come home with the
    // board's own 100% button before reaching for it, and let the glide land.
    await page.locator('button', { hasText: /^100%$/ }).first().click();
    await page.waitForTimeout(700);
    const bb = await bin.boundingBox();
    await page.mouse.dblclick(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(1100);

    const surf = () => page.evaluate(() => {
      const el = document.querySelector('.bin-window-in [data-bin-surface]');
      return el ? Math.round(el.getBoundingClientRect().width) : null;
    });
    const opened = await surf();
    check(opened !== null && opened > 1500, 'its far note holds the group open', `${opened}px`);

    // Scroll so the far note is on screen, then carry it back in.
    await page.evaluate(() => {
      const sc = document.querySelector('.bin-window-in .absolute.inset-0.overflow-auto');
      if (sc) sc.scrollLeft = 900;
    });
    await page.waitForTimeout(400);
    const far = await page.$('.bin-window-in [data-node-id="CE-gfar"]');
    check(!!far, 'the far note inside the group is reachable');
    if (far) {
      const r = await far.boundingBox();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down();
      await page.mouse.move(r.x + r.width / 2 - 30, r.y + r.height / 2);
      await page.waitForTimeout(80);
      const atGrab = await surf();
      const seen = [];
      for (let i = 1; i <= 5; i++) {
        await page.mouse.move(r.x + r.width / 2 - 30 - i * 90, r.y + r.height / 2, { steps: 3 });
        await page.waitForTimeout(70);
        seen.push(await surf());
      }
      await page.mouse.up();
      await page.waitForTimeout(800);
      const after = await surf();
      console.log('       group surface:', JSON.stringify({ atGrab, during: seen, after }));
      check(seen.every(v => v >= atGrab), 'the group surface never shrinks mid-drag',
        JSON.stringify(seen));
      check(after < atGrab, 'and gives the space back once the note is let go',
        `${atGrab} → ${after}`);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}

// ── 5. Nothing low down means no empty bottom ─────────────────────────────
// "There are currently no widgets on the bottom of the canvas… it's empty on
// the whole bottom part and it's still really expanded all the way down."
// The board rounded its size up in 400px chunks on top of a 140px pad, so up
// to 568px of nothing sat past the lowest thing on it.
{
  const fit = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
    const els = (d.canvasElements ?? []).filter(e => !e.board);
    const lowest = Math.max(0, ...els.map(e => (e.y ?? 0) + (e.h ?? 0)));
    const w = document.querySelector('[data-board-world]');
    const vp = document.querySelector('[data-board-viewport]');
    return { lowest, worldH: w?.offsetHeight ?? 0, viewportH: vp?.clientHeight ?? 0 };
  });
  const slack = fit.worldH - Math.max(fit.lowest, fit.viewportH);
  console.log('       bottom:', JSON.stringify({ ...fit, slack }));
  check(slack <= 300,
    'the board carries no more than a little room past the lowest thing',
    `${slack}px of empty bottom`);
  check(fit.worldH >= fit.viewportH,
    'and it still fills the window rather than stopping partway down',
    `${fit.worldH} vs ${fit.viewportH}`);
}

await page.screenshot({ path: 'scratchpad/deexpand.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
