// This round's board work, end to end on the real app:
//  · the Select tile is the visible default — pen and eraser put it out,
//    pressing it puts them down;
//  · the eraser is its own tile with its own right-click panel, and while it
//    is armed a size circle follows the pointer;
//  · the pen panel lost its hard-coded explainer and its eraser section;
//  · a LEGACY flat-ink stroke (no data.own, wrong stored box) is promoted to
//    a node on load and can then be erased — the owner's two immortal
//    scribbles;
//  · lock: a locked note/tile cannot be dragged or resized, survives the
//    Delete key, still opens on a click, and unlocking restores everything;
//  · the workspace dropdown paints ABOVE the board chrome and above the
//    sticky building headers (the portal fix + the shared BuildingNameBar).
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) fails++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [{
      id: 'G-lock1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Lockable Job',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 80, canvasY: 300,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U-test', updatedByName: 'A',
    }],
    canvasElements: [
      { id: 'CE-note1', type: 'note', x: 80, y: 520, w: 180, h: 140, text: 'LockNote', color: '#fef9c3' },
      // A LEGACY stroke: real ink at (700,150)-(900,250), but the stored box is
      // a lie (0,0,10x10) and there is no data.own — exactly the shape of a
      // drawing from before every stroke became a node.
      { id: 'CE-legacy', type: 'stroke', x: 0, y: 0, w: 10, h: 10,
        points: '700,150 750,175 800,200 850,225 900,250', color: '#dc2626', strokeWidth: 4 },
    ],
  }));
});

const page = await ctx.newPage();
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2500);

const rail = page.locator('.board-rail');
const tile = name => rail.locator('button', { has: page.locator(`span:text-is("${name}")`) }).first();
const bgOf = async loc => (await loc.evaluate(el => getComputedStyle(el).backgroundColor)).trim();
const NAVY = 'rgb(30, 58, 95)';
const stored = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  return {
    job: d.apartments?.find(a => a.id === 'G-lock1'),
    note: d.canvasElements?.find(e => e.id === 'CE-note1'),
    legacy: d.canvasElements?.find(e => e.id === 'CE-legacy'),
    strokes: (d.canvasElements ?? []).filter(e => e.type === 'stroke'),
  };
});

// ── Select is the visible default ──
check(await tile('Select').count() > 0, 'a Select tile is on the rail');
check(await bgOf(tile('Select')) === NAVY, 'Select is lit by default');
await tile('Pen').click();
await page.waitForTimeout(200);
check(await bgOf(tile('Pen')) === NAVY, 'picking the pen lights the pen');
check(await bgOf(tile('Select')) !== NAVY, '…and puts Select out');
await tile('Select').click();
await page.waitForTimeout(200);
check(await bgOf(tile('Select')) === NAVY && await bgOf(tile('Pen')) !== NAVY,
  'pressing Select puts the pen down');

// ── The eraser is its own tile, with its own panel and its own cursor ──
await tile('Eraser').click();
await page.waitForTimeout(250);
check(await bgOf(tile('Eraser')) === NAVY, 'the Eraser tile arms the eraser');
check(await page.getByText(/Eraser — rub out/).count() > 0, 'the armed banner shows');
check(await bgOf(tile('Select')) !== NAVY, 'Select is out while the eraser is up');

// The outline follows the pointer at the eraser's size (26 world px × 100%).
const vp = await page.locator('[data-board-viewport]').boundingBox();
await page.mouse.move(vp.x + vp.width / 2, vp.y + vp.height / 2);
await page.waitForTimeout(150);
const circle = await page.evaluate(() => {
  const dots = [...document.querySelectorAll('.fixed.pointer-events-none')]
    .filter(n => n.firstElementChild?.classList.contains('rounded-full'))
    .map(n => ({ display: getComputedStyle(n).display, w: n.firstElementChild.getBoundingClientRect().width }));
  return dots.find(d => d.display !== 'none') ?? null;
});
check(!!circle && Math.abs(circle.w - 26) < 2, `the outline circle rides the pointer at its size (${circle?.w}px)`);

// Right-click the tile: the eraser's OWN panel.
await tile('Eraser').click({ button: 'right' });
await page.waitForTimeout(250);
check(await page.getByText('ERASER', { exact: true }).count() > 0, 'right-click opens the eraser panel');
check(await page.getByRole('button', { name: 'Whole mark' }).count() > 0, '…with its two kinds');
await page.getByRole('button', { name: 'Whole mark' }).click();
await page.waitForTimeout(150);
// Close the panel by its BACKDROP — Escape would also put the armed eraser
// down (that is the designed way out of the mode), which is not what this
// step is testing.
await page.mouse.click(10, 880);
await page.waitForTimeout(150);

// ── The legacy scribble was promoted on load, and now erases ──
const st0 = await stored();
check(st0.legacy?.data?.own === true, 'the legacy stroke was promoted to a node');
check(Math.abs((st0.legacy?.x ?? 0) - 700) < 2 && (st0.legacy?.w ?? 0) > 150,
  `…with its box rewritten from its real ink (x=${st0.legacy?.x}, w=${st0.legacy?.w})`);

// Whole-mark press on the ink itself.
const strokeBox = await page.locator('[data-node-id="CE-legacy"]').boundingBox();
if (strokeBox) {
  await page.mouse.move(strokeBox.x + strokeBox.width / 2, strokeBox.y + strokeBox.height / 2);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(500);
}
const st1 = await stored();
check(!!strokeBox && !st1.legacy, 'the whole-mark eraser takes the scribble out');

// Put the eraser down through its tile.
await tile('Eraser').click();
await page.waitForTimeout(200);
check(await page.getByText(/Eraser — rub out|Eraser — whole marks/).count() === 0, 'pressing the tile again puts it down');

// ── The pen panel lost its hard-coded text and its eraser section ──
await tile('Pen').click({ button: 'right' });
await page.waitForTimeout(250);
check(await page.getByText('PEN', { exact: true }).count() > 0, 'the pen panel opens');
check(await page.getByText(/Pick up the eraser/).count() === 0, 'no eraser section in the pen panel');
check(await page.getByText(/Draw anywhere, tiles included/).count() === 0, 'the explainer paragraph is gone');
await page.mouse.click(10, 880);
await page.waitForTimeout(150);
await tile('Select').click();
await page.waitForTimeout(150);

// ── Lock: a note ──
const note = page.locator('[data-node-id="CE-note1"]');
await note.hover();
await page.waitForTimeout(300);
await note.locator('button[title="Lock in place"]').click();
await page.waitForTimeout(300);
check((await stored()).note?.locked === true, 'the strip lock pins the note');
check(await note.locator('[data-resize]').count() === 0, 'a locked note shows no resize handles');

const nb = await note.boundingBox();
await page.mouse.move(nb.x + nb.width / 2, nb.y + 20);
await page.mouse.down();
await page.mouse.move(nb.x + nb.width / 2 + 140, nb.y + 20, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);
const afterDrag = await stored();
check(afterDrag.note?.x === 80 && afterDrag.note?.y === 520, 'dragging a locked note leaves it exactly where it was');

// Delete key spares it.
await page.keyboard.press('Escape');
const nb2 = await note.boundingBox();
await page.mouse.click(nb2.x + nb2.width / 2, nb2.y + 20);
await page.waitForTimeout(200);
await page.keyboard.press('Delete');
await page.waitForTimeout(300);
check(!!(await stored()).note, 'the Delete key spares a locked note');

// Unlock restores the drag.
await note.hover();
await page.waitForTimeout(300);
await note.locator('button[title="Locked in place — click to unlock"]').click();
await page.waitForTimeout(300);
const nb3 = await note.boundingBox();
await page.mouse.move(nb3.x + nb3.width / 2, nb3.y + 20);
await page.mouse.down();
await page.mouse.move(nb3.x + nb3.width / 2 + 120, nb3.y + 20, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);
check(((await stored()).note?.x ?? 80) > 150, 'unlocking makes it movable again');

// ── Lock: a job tile ──
const job = page.locator('[data-node-id="G-lock1"]');
await job.hover();
await page.waitForTimeout(300);
await job.locator('button[title="Lock in place"]').click();
await page.waitForTimeout(300);
check((await stored()).job?.boardLocked === true, 'the tile lock pins the job');

const jb = await job.boundingBox();
await page.mouse.move(jb.x + jb.width / 2, jb.y + jb.height / 2);
await page.mouse.down();
await page.mouse.move(jb.x + jb.width / 2 + 150, jb.y + jb.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);
check((await stored()).job?.canvasX === 80, 'dragging a locked tile leaves it in place (the board pans instead)');

// A plain click still opens the job.
const jb2 = await job.boundingBox();
await page.mouse.click(jb2.x + jb2.width / 2, jb2.y + jb2.height / 2);
await page.waitForTimeout(600);
check(await page.locator('.drawer-panel').count() > 0, 'a click on a locked tile opens the job');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// Right-click offers Unlock.
const jb3 = await job.boundingBox();
await page.mouse.click(jb3.x + jb3.width / 2, jb3.y + jb3.height / 2, { button: 'right' });
await page.waitForTimeout(300);
check(await page.getByRole('button', { name: /^Unlock$/ }).count() > 0, 'the tile menu offers Unlock');
await page.getByRole('button', { name: /^Unlock$/ }).click();
await page.waitForTimeout(300);
check(!(await stored()).job?.boardLocked, '…and it unlocks');

// ── The workspace dropdown paints over the board chrome ──
await page.locator('header button[aria-haspopup="menu"]').click();
await page.waitForTimeout(300);
const menuHits = await page.evaluate(() => {
  const menu = document.querySelector('[role="menu"]');
  if (!menu) return { rows: 0, covered: 0 };
  const rows = [...menu.querySelectorAll('button')];
  let covered = 0;
  for (const r of rows) {
    const b = r.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    if (!menu.contains(hit)) covered++;
  }
  return { rows: rows.length, covered };
});
check(menuHits.rows >= 3 && menuHits.covered === 0,
  `every dropdown row is hittable over the BOARD (${menuHits.covered}/${menuHits.rows} covered)`);

// Switch to Wolfson through the menu, where the sticky building names live.
await page.getByRole('menu').getByText(/Wolfson/).first().click();
await page.waitForTimeout(2500);
check(page.url().includes('/project'), 'picking Wolfson lands on the diagram');

// The sticky building bar sits at z-20.
//
// It was z-10 when this was written, which is exactly what was wrong with it:
// a highlighted cell carries z-10 too and comes LATER in the document, so the
// tie went to the cells and the building name was painted over as they
// scrolled past. Both columns now share one `BuildingNameBar` at z-20 — far
// below any dialog (What's New is z-260).
const barZ = await page.evaluate(() => {
  const bars = [...document.querySelectorAll('.sticky')]
    .filter(n => /^A\d$/.test(n.textContent?.trim() ?? ''));
  return bars.map(b => getComputedStyle(b).zIndex);
});
check(barZ.length > 0 && barZ.every(z => z === '20'), `building name bars are z-20 (${barZ.join(',')})`);

// And the dropdown wins over them.
await page.locator('header button[aria-haspopup="menu"]').click();
await page.waitForTimeout(300);
const menuHits2 = await page.evaluate(() => {
  const menu = document.querySelector('[role="menu"]');
  if (!menu) return { rows: 0, covered: 0 };
  const rows = [...menu.querySelectorAll('button')];
  let covered = 0;
  for (const r of rows) {
    const b = r.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    if (!menu.contains(hit)) covered++;
  }
  return { rows: rows.length, covered };
});
check(menuHits2.rows >= 3 && menuHits2.covered === 0,
  `every dropdown row is hittable over the BUILDING NAMES (${menuHits2.covered}/${menuHits2.rows} covered)`);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
await browser.close();
process.exit(fails ? 1 : 0);
