// The 26 Oct recording, board half: full screen keeps the menus (the whole
// document goes full screen, the board page is pinned over the chrome), a TV
// picked from the menu FLIES the board to its green frame, the Active jobs
// widget has its little search, and a tooltip never outlives the pointer on
// its trigger.
import { chromium } from 'playwright';

const APP = process.env.APP ?? 'http://localhost:5173';
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
  const now = new Date().toISOString();
  const job = (id, name, x, y, addr) => ({
    id, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', address: addr,
    currentStageId: null, stageDates: {}, canvasX: x, canvasY: y,
    createdAt: '2026-01-01', updatedAt: now, contentUpdatedAt: now, updatedBy: 'U', updatedByName: 'U',
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    apartments: [
      job('G-anchor', 'Anchor', 300, 260, 'Herzl 4'),
      job('G-bravo', 'Bravo', 600, 400, 'Jaffa 9'),
      job('G-charlie', 'Charlie', 3600, 2600, 'Ben Yehuda 2'),
    ],
    canvasElements: [
      { id: 'CE-goals-board', type: 'note', x: 5200, y: 4200, w: 100, h: 80, text: '', color: '#fff' },
      { id: 'CE-act', type: 'widget', widget: 'active-jobs', x: 900, y: 240, w: 460, h: 380, text: '', color: '#fff', data: {} },
    ],
    boardSettings: { __tv: { tvView: { x: 3300, y: 2300, w: 900, h: 506 } } },
  }));
};

const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(seed);
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3000);

// ════ 1 · Active jobs: the little search ═════════════════════════════════
const tiles = () => page.locator('[data-active-tile]').count();
const before = await tiles();
check(before >= 2, 'active jobs: the widget lists the recent jobs', `${before}`);
await page.evaluate(() => document.querySelector('[data-active-search-toggle]')?.click());
await page.waitForTimeout(300);
check(await page.locator('[data-active-search-input]').count() === 1, 'active jobs: the search icon opens a box');
await page.locator('[data-active-search-input]').fill('bravo');
await page.waitForTimeout(400);
const after = await tiles();
check(after === 1, 'active jobs: typing narrows the list to the match', `${before} → ${after}`);
await page.locator('[data-active-search-input]').fill('jaffa');
await page.waitForTimeout(400);
check(await tiles() === 1, 'active jobs: the address finds it too');
await page.locator('[data-active-search-input]').press('Escape');
await page.waitForTimeout(300);
check(await tiles() === before, 'active jobs: Escape clears it and the whole list is back');

// ════ 2 · Board full screen keeps menus on screen ═════════════════════════
await page.click('button[title="Board full screen"]');
await page.waitForTimeout(800);
const fs = await page.evaluate(() => ({
  el: document.fullscreenElement === document.documentElement,
  cls: document.documentElement.classList.contains('board-full'),
}));
check(fs.el && fs.cls, 'full screen: the whole document is full screen with the board pinned over it', JSON.stringify(fs));
const rootBox = await page.locator('[data-board-page-root]').boundingBox();
check(rootBox && rootBox.x === 0 && rootBox.y === 0, 'full screen: the board page fills the screen from the corner',
  JSON.stringify(rootBox));
await page.click('[data-show-tv]');
await page.waitForTimeout(500);
const menuVisible = await page.evaluate(() => {
  const m = document.querySelector('[data-tv-menu]');
  if (!m) return 'none';
  const r = m.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 12);
  return m.contains(hit) ? 'seen' : `covered by ${hit?.tagName}`;
});
check(menuVisible === 'seen', 'full screen: the TV menu pops up and is on top', menuVisible);

// ════ 3 · Picking a TV flies the board to its frame ═══════════════════════
await page.click('[data-tv-menu-row="default"]');
await page.waitForTimeout(1200);
const fr = await page.locator('[data-tv-frame]').boundingBox();
const vp = page.viewportSize();
check(!!fr && fr.x >= 0 && fr.y >= 0 && fr.x + fr.width <= vp.width && fr.y + fr.height <= vp.height,
  'tv: after picking, the whole green frame is on screen', JSON.stringify(fr));
check(!!fr && Math.abs(fr.x + fr.width / 2 - vp.width / 2) < vp.width * 0.2,
  'tv: and it is roughly centred', fr ? `${Math.round(fr.x + fr.width / 2)} vs ${vp.width / 2}` : '');

await page.click('button[title="Leave full screen"]');
await page.waitForTimeout(600);
check(await page.evaluate(() => !document.fullscreenElement && !document.documentElement.classList.contains('board-full')),
  'full screen: leaving takes the pin away');

// ════ 4 · A tooltip never outlives the pointer ════════════════════════════
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2500);
// Any tooltip-wrapped header button: hover, then cover it with a full-screen
// overlay WITHOUT a mouseleave, then move the mouse.
const trig = page.locator('span.relative.inline-flex').filter({ has: page.locator('button') }).first();
const tb = await trig.boundingBox();
await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
await page.waitForTimeout(300);
const shown = await page.locator('[role="tooltip"]').count();
await page.evaluate(() => {
  const d = document.createElement('div');
  d.id = 'cover'; d.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.1)';
  document.body.appendChild(d);
});
await page.mouse.move(tb.x + tb.width / 2 + 3, tb.y + tb.height / 2 + 2);
await page.waitForTimeout(200);
check(shown === 1 && await page.locator('[role="tooltip"]').count() === 0,
  'tooltip: covered by a panel, the bubble goes away on the next move', `shown ${shown}`);

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
