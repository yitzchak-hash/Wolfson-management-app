// The tap-in board, after the wall fix: every tile is one big button that
// really punches the clock — on the office board AND on the read-only TV wall
// (a punch is not a board edit); rows share the widget's height evenly.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    employees: [
      { id: 'E-1', name: 'Avi', role: 'installer', active: true, sortOrder: 1 },
      { id: 'E-2', name: 'Ben', role: 'installer', active: true, sortOrder: 2 },
      { id: 'E-3', name: 'Chaim', role: 'driver', active: true, sortOrder: 3 },
      { id: 'E-4', name: 'Dov', role: 'driver', active: true, sortOrder: 4 },
    ],
    timePunches: [],
    apartments: [],
    canvasElements: [
      { id: 'CE-tap', type: 'widget', widget: 'tap-in', x: 400, y: 300, w: 340, h: 300, text: '', color: '#ffffff',
        data: { cols: 2 } },
      { id: 'CE-bin-done', type: 'bin', binKind: 'done', x: 2100, y: 24, w: 180, h: 112, text: 'Done', color: '#16a34a' },
      { id: 'CE-bin-ready', type: 'bin', binKind: 'ready', x: 2100, y: 154, w: 180, h: 112, text: 'Ready', color: '#0ea5e9' },
      { id: 'CE-bin-archive', type: 'bin', binKind: 'archive', x: 2100, y: 284, w: 180, h: 112, text: 'Archive', color: '#64748b' },
      { id: 'CE-bin-trash', type: 'bin', binKind: 'trash', x: 2100, y: 414, w: 180, h: 112, text: 'Trash', color: '#dc2626' },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3000);

const punches = () => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('general_app_data')).timePunches ?? []).map(p => `${p.employeeId}:${p.kind}`));

// ── 1 · one tap punches the clock, the tile fills with colour ───────────────
const avi = page.locator('[data-node-id="CE-tap"] button[title*="Avi"]');
// RED out, GREEN in — the owner's 2026-09-01 traffic-light dress. Gradients,
// so read backgroundImage, never backgroundColor (always transparent here).
const bgBefore = await avi.evaluate(n => getComputedStyle(n).backgroundImage);
check(/254, 202, 202|fecaca/i.test(bgBefore), 'a clocked-out tile is red', bgBefore.slice(0, 60));
await avi.click();
await page.waitForTimeout(900);
check((await punches()).join() === 'E-1:in', 'tapping a name clocks them in', (await punches()).join());
const bgAfter = await avi.evaluate(n => getComputedStyle(n).backgroundImage);
check(/34, 197, 94|22c55e/i.test(bgAfter), 'and the tile turns green', bgAfter.slice(0, 60));
check(await avi.locator('[data-tap-counter]').count() === 1, 'with a running counter on it');
check((await avi.textContent() || '').includes('in since'), 'with the arrival time under the name');

// ── 2 · rows share the widget's height evenly ───────────────────────────────
const geom = await page.evaluate(() => {
  const grid = document.querySelector('[data-node-id="CE-tap"] .grid');
  const tiles = [...grid.querySelectorAll('button')];
  const r = tiles.map(t => t.getBoundingClientRect());
  return {
    boxH: grid.getBoundingClientRect().height,
    tileH: r[0].height,
    row1Top: [r[0].top, r[1].top],
    row2Top: [r[2].top, r[3].top],
  };
});
check(Math.abs(geom.row1Top[0] - geom.row1Top[1]) < 1 && Math.abs(geom.row2Top[0] - geom.row2Top[1]) < 1,
  'tiles in a row sit on one line', JSON.stringify(geom.row1Top.map(Math.round)));
check(geom.tileH * 2 > geom.boxH * 0.85,
  'two rows genuinely fill the box — no dead band below', `tile ${Math.round(geom.tileH)} × 2 in ${Math.round(geom.boxH)}`);

// ── 3 · one column stacks and still fills ───────────────────────────────────
// A FRESH context: patching localStorage and reloading is overwritten by the
// app's own flush-on-unload — the standing trap.
const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx2.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    employees: [
      { id: 'E-1', name: 'Avi', role: 'installer', active: true, sortOrder: 1 },
      { id: 'E-2', name: 'Ben', role: 'installer', active: true, sortOrder: 2 },
      { id: 'E-3', name: 'Chaim', role: 'driver', active: true, sortOrder: 3 },
      { id: 'E-4', name: 'Dov', role: 'driver', active: true, sortOrder: 4 },
    ],
    timePunches: [],
    apartments: [],
    canvasElements: [
      { id: 'CE-tap', type: 'widget', widget: 'tap-in', x: 400, y: 300, w: 340, h: 300, text: '', color: '#ffffff',
        data: { cols: 1 } },
    ],
  }));
});
const page2 = await ctx2.newPage();
await page2.goto(`${APP}/jobs`);
await page2.waitForTimeout(3000);
const oneCol = await page2.evaluate(() => {
  const grid = document.querySelector('[data-node-id="CE-tap"] .grid');
  const r = [...grid.querySelectorAll('button')].map(t => t.getBoundingClientRect());
  return { lefts: r.map(x => Math.round(x.left)), tops: r.map(x => Math.round(x.top)) };
});
check(new Set(oneCol.lefts).size === 1 && new Set(oneCol.tops).size === 4,
  'one across = one tidy column', JSON.stringify(oneCol.lefts));
await ctx2.close();

// ── 4 · the WALL takes punches too (readOnly must not kill the clock) ───────
await page.goto(`${APP}/tv`);
await page.waitForTimeout(4000);
const wallTile = page.locator('button[title*="Ben"]').first();
const onWall = await wallTile.count();
check(onWall === 1, 'the tap-in board is drawn on the TV wall');
if (onWall) {
  await wallTile.click();
  await page.waitForTimeout(900);
  const after = await punches();
  check(after.includes('E-2:in'), 'and a tap on the wall clocks in — read-only wall or not', after.join());
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
