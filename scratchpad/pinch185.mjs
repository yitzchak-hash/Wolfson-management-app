// THE PINCH-TIME #185, reproduced and guarded.
//
// ProjectMini (the Building-progress widget) carried a latent infinite
// render loop: `units` was a bare .filter() (new array identity every
// render), `byBuilding`'s memo therefore re-made its array every render, and
// the measure effect keyed on it re-ran every render and unconditionally
// wrote a FRESH state object — render → effect → setState → render, forever.
// Passive effects yield between cycles, so it only smouldered — until a
// pinch: React flushes pending passive effects SYNCHRONOUSLY on each
// discrete touch event, the cascade goes synchronous, and the 50-update
// ceiling throws minified React #185 mid-gesture (the owner's crash).
//
// The harness mounts a board with the widget, drives a real two-finger
// pinch storm through CDP touch events (any pageerror fails it), and then
// MEASURES THE SMOULDER: script time and style recalcs while the page sits
// completely idle. That measurement is the non-vacuous anchor — the crash
// itself needs production's exact scheduling and would not reproduce in the
// dev build, but the loop is unmissable: measured pre-fix, the idle board
// burnt 854ms of script PER SECOND with 69 style recalcs/s (a whole CPU
// core — which is also what made machines slow enough for the router
// starvation to bite); with the fix, 12ms and 5/s. The threshold sits far
// above the healthy figure and far below the sick one.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, hasTouch: true });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  // A Wolfson snapshot so the miniature has real buildings to measure.
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    apartments: Array.from({ length: 24 }, (_, i) => ({
      id: `A1-${i + 1}`, buildingId: i < 12 ? 'A1' : 'A2', floor: 2 + Math.floor((i % 12) / 4),
      apartmentNumber: String(i + 1), displayName: `Fam ${i}`, isUnnamed: false,
      isDuplexApt: false, classification: 'standard', currentStageId: null,
      createdAt: '2026-01-01', updatedAt: '2026-01-01' })),
    stages: [], contractorAssignments: [],
  }));
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    apartments: [{ id: 'G-1', buildingId: 'G', apartmentNumber: '', floor: 0, isUnnamed: false,
      displayName: 'Lev', classification: 'standard', isDuplexApt: false,
      canvasX: 700, canvasY: 300, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    canvasElements: [{ id: 'CE-pm', type: 'widget', widget: 'project-mini',
      x: 120, y: 120, w: 320, h: 260, text: '', color: '#ffffff',
      data: { projectId: 'wolfson' } }],
  }));
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);
check(await page.locator('[data-board-viewport]').count() === 1, 'the board mounted');
check(await page.evaluate(() => document.body.textContent.includes('WOLFSON') || document.body.textContent.toLowerCase().includes('wolfson')),
  'the Building-progress miniature resolved its workspace');

// A real two-finger pinch storm: 3 gestures, ~40 move frames each, through
// CDP so the board's touch handlers see genuine touch events.
const cdp = await ctx.newCDPSession(page);
const box = await page.locator('[data-board-viewport]').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
const pts = (d) => [{ x: cx - d, y: cy }, { x: cx + d, y: cy }];
for (let g = 0; g < 3; g++) {
  const out = g % 2 === 0;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(out ? 60 : 220) });
  for (let i = 1; i <= 40; i++) {
    const d = out ? 60 + i * 4 : 220 - i * 4;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
}
await page.waitForTimeout(1200);

check(errors.length === 0, 'no page error through three pinch storms', errors[0]?.slice(0, 120) ?? '');
const zoom = await page.evaluate(() => {
  const world = document.querySelector('[data-board-world]');
  const t = world?.parentElement ? getComputedStyle(world.parentElement).transform : '';
  const m = /matrix\(([-\d.]+)/.exec(t);
  return m ? Number(m[1]) : null;
});
check(zoom !== null && Math.abs(zoom - 1) > 0.01, 'the pinch really zoomed the board', String(zoom));
check(await page.locator('[data-board-viewport]').count() === 1, 'and the board is still standing');

// ── the smoulder meter ─────────────────────────────────────────────────────
await cdp.send('Performance.enable');
const grab = async () => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const g = n => metrics.find(m => m.name === n)?.value ?? 0;
  return { script: g('ScriptDuration'), recalc: g('RecalcStyleCount') };
};
await page.waitForTimeout(800);
const m0 = await grab();
await page.waitForTimeout(5000);
const m1 = await grab();
const scriptMsPerSec = Math.round((m1.script - m0.script) * 200);
const recalcPerSec = (m1.recalc - m0.recalc) / 5;
check(scriptMsPerSec < 250 && recalcPerSec < 30,
  'the idle board does not smoulder (no self-feeding render loop)',
  `script ${scriptMsPerSec}ms/s · recalc ${recalcPerSec}/s`);

console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
await b.close();
process.exit(fails ? 1 : 0);
