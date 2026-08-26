// The TV frame round: the green box is what the TV really SHOWS —
// display size folded in — everywhere it is drawn; the settings picker's box
// shrinks when the size slider rises; the board's TV button opens a menu of
// the actual panels; picking one lays a draggable, corner-resizable green
// frame over the real board that writes straight into that TV's settings;
// and the wall itself crops CENTRED, from the same shared arithmetic.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

const seed = () => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const job = (id, name, x, y) => ({
    id, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {}, canvasX: x, canvasY: y,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [],
    contractors: [],
    contractorAssignments: [],
    apartments: [
      job('G-anchor', 'Anchor', 300, 200),
      job('G-bravo', 'Bravo', 600, 380),
      job('G-charlie', 'Charlie', 900, 560),
    ],
    canvasElements: [],
  }));
};

const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(seed);
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });

const tvBag = () => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('general_app_data')).boardSettings ?? {}).__tv ?? {});

// ════ 1 · The settings picker: the box IS what the TV shows ════════════════
await page.goto(`${APP}/app-settings`);
await page.waitForTimeout(2500);
await page.click('button:has-text("TV")');
await page.waitForTimeout(800);

const frame = page.locator('[data-region-fits]');
check(await frame.count() === 1, 'settings: the default picker draws its green box');
// The picker sits below the fold on this tab — a mouse press aimed off-screen
// lands on nothing and reads as "the drag saves nothing".
await frame.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
const w1 = (await frame.boundingBox()).width;

// Commit a region by nudging the box, so scale changes act on a saved region.
const fb = await frame.boundingBox();
await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
await page.mouse.down();
await page.mouse.move(fb.x + fb.width / 2 + 12, fb.y + fb.height / 2, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(700);
const bag1 = await tvBag();
check(!!bag1.tvView && bag1.tvView.w > 0, 'settings: dragging the box saves a region',
  JSON.stringify(bag1.tvView));

// Raise the display size to 200%: the wall now shows HALF the region across,
// so the green box must shrink to half — the owner's exact report was that it
// did not change at all.
await page.evaluate(() => {
  const el = [...document.querySelectorAll('input[type="range"]')]
    .find(r => r.min === '0.6' && r.max === '3');
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(el, '2');
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(600);
const w2 = (await frame.boundingBox()).width;
check(Math.abs(w2 / w1 - 0.5) < 0.06, 'settings: 200% display size halves the green box',
  `${Math.round(w1)}px → ${Math.round(w2)}px`);
const note = await page.locator('[data-vis-note]').first().innerText();
check(note.includes('200%'), 'settings: the box says it allows for the display size', note);

// Moving the box at 200% must still round-trip: the stored region keeps its
// size (a move is not a resize) and shifts with the hand.
const r1 = (await tvBag()).tvView;
await frame.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
const fb2 = await frame.boundingBox();
await page.mouse.move(fb2.x + fb2.width / 2, fb2.y + fb2.height / 2);
await page.mouse.down();
await page.mouse.move(fb2.x + fb2.width / 2 + 20, fb2.y + fb2.height / 2 + 10, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(700);
const r2 = (await tvBag()).tvView;
check(Math.abs(r2.w - r1.w) <= 2 && Math.abs(r2.h - r1.h) <= 2,
  'settings: moving at 200% keeps the region size (round trip is exact)',
  `${r1.w}×${r1.h} → ${r2.w}×${r2.h}`);
check(r2.x !== r1.x || r2.y !== r1.y, 'settings: …and the region really moved');

// ════ 2 · The board: the TV button is a menu, the frame is a hand tool ═════
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2500);
await page.click('[data-show-tv]');
await page.waitForTimeout(400);
check(await page.locator('[data-tv-menu]').count() === 1, 'board: the TV button opens the menu');
check(await page.locator('[data-tv-menu-row="default"]').count() === 1,
  'board: the menu offers the shared default');
const menuNote = await page.locator('[data-tv-menu]').innerText();
check(/cloud sync|No TV has reported/.test(menuNote),
  'board: with no reporting panels the menu says so honestly');

await page.click('[data-tv-menu-row="default"]');
await page.waitForTimeout(400);
check(await page.locator('[data-tv-menu]').count() === 0, 'board: picking closes the menu');
const bFrame = page.locator('[data-tv-frame]');
check(await bFrame.count() === 1, 'board: the picked TV\'s frame is on the board');

// The frame must be the EFFECTIVE view: the stored region divided by the
// 200% display size set above, centred — not the raw region.
const zoom = await page.evaluate(() => {
  const world = document.querySelector('[data-board-world]');
  return +/scale\(([\d.]+)\)/.exec(world.parentElement.style.transform)[1];
});
const visW = await bFrame.evaluate(el => parseFloat(el.style.width));
const rNow = (await tvBag()).tvView;
check(Math.abs(visW - rNow.w / 2) < 3,
  'board: the frame is the region ÷ display size — what the TV really shows',
  `frame ${Math.round(visW)} vs region ${rNow.w} at 200%`);

// The BODY is see-through, per the owner: a press in the middle of the green
// falls through to whatever is under it — only the grip and the corner are
// live. So the board (or a tile) is what the browser finds there, never the
// frame itself.
const bb = await bFrame.boundingBox();
const under = await page.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  return { inFrame: !!el?.closest('[data-tv-overlay]'), tag: el?.tagName ?? '' };
}, [bb.x + bb.width / 2, bb.y + bb.height / 2]);
check(!under.inFrame, 'board: the frame BODY is click-through — the board is under the green', under.tag);
check(await page.locator('[data-tv-frame-move]').count() === 1,
  'board: a move grip sits on the top-left corner');

// Drag the frame by its GRIP: it moves 1:1 under the hand (screen ÷ zoom)
// and the release writes the region — moved, same size.
const before = await bFrame.evaluate(el => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) }));
const gb = await page.locator('[data-tv-frame-move]').boundingBox();
await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
await page.mouse.down();
await page.mouse.move(gb.x + gb.width / 2 + 80, gb.y + gb.height / 2 + 40, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(700);
const after = await bFrame.evaluate(el => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) }));
check(Math.abs(after.x - before.x - 80 / zoom) < 3 && Math.abs(after.y - before.y - 40 / zoom) < 3,
  'board: dragging the GRIP moves the frame with the hand at this zoom',
  `moved ${Math.round(after.x - before.x)},${Math.round(after.y - before.y)} for 80,40 at ${zoom}`);
const rMoved = (await tvBag()).tvView;
check(Math.abs(rMoved.w - rNow.w) <= 2 && rMoved.x !== rNow.x,
  'board: the drag wrote the TV\'s saved region (moved, same size)');

// The corner handle resizes, locked to the TV's shape.
const hb = await page.locator('[data-tv-frame-handle]').boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
await page.mouse.move(hb.x + hb.width / 2 + 90, hb.y + hb.height / 2, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(700);
const sized = await bFrame.evaluate(el => ({
  w: parseFloat(el.style.width), h: parseFloat(el.style.height),
}));
check(sized.w > visW + 60 / zoom, 'board: the corner handle grows the frame',
  `${Math.round(visW)} → ${Math.round(sized.w)}`);
check(Math.abs(sized.w / sized.h - 16 / 9) < 0.02,
  'board: resizing keeps the TV\'s own shape', (sized.w / sized.h).toFixed(3));
const rSized = (await tvBag()).tvView;
check(Math.abs(rSized.w - sized.w * 2) <= 3,
  'board: the resize wrote the region at display-size × the frame',
  `region ${rSized.w} vs frame ${Math.round(sized.w)} × 2`);

// "Hide the frame" stands the overlay down.
await page.click('[data-show-tv]');
await page.waitForTimeout(300);
await page.click('[data-tv-menu-hide]');
await page.waitForTimeout(300);
check(await bFrame.count() === 0, 'board: Hide the frame hides it');

// ════ 3 · The wall crops CENTRED — the same arithmetic ═════════════════════
// With the display size at 200% the panel shows the middle of the region, so
// the drawn origin must sit INSIDE the region, not on its top-left corner
// (which is exactly what the old anchor did).
await page.goto(`${APP}/tv?view=general`);
await page.waitForTimeout(3000);
const wall = await page.evaluate(() => {
  const z = document.querySelector('div[dir="ltr"][style*="zoom"]');
  if (!z) return null;
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(z.firstElementChild.style.transform);
  return m ? { x: -+m[1], y: -+m[2] } : null;
});
const rFinal = (await tvBag()).tvView;
check(!!wall, 'wall: the board view is drawn');
if (wall) {
  check(wall.x > rFinal.x + 4 && wall.y > rFinal.y + 4,
    'wall: at 200% the crop starts inside the region — centred, not corner-anchored',
    `origin ${Math.round(wall.x)},${Math.round(wall.y)} vs region ${rFinal.x},${rFinal.y}`);
  const visWallW = rFinal.w / 2;
  check(Math.abs((wall.x - rFinal.x) * 2 + visWallW - rFinal.w) < visWallW * 0.35,
    'wall: the crop is roughly the middle half of the region');
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
