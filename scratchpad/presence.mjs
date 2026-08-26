// Live presence, drawn: a colleague's named cursor in their colour, and the
// dashed ghost of the tile their hand is mid-drag with. The container has no
// Firebase and a websocket cannot be stubbed with page.route, so the DEV
// build's injection door (`window.__injectPresence`) feeds the layer through
// the exact fan-out the real Realtime Database channel uses.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    apartments: [{
      id: 'G-a', buildingId: 'G', floor: 0, apartmentNumber: '',
      displayName: 'Cohen', isUnnamed: false, isDuplexApt: false,
      classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 200, canvasY: 220,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
// A cold dev server compiles the presence modules on first request — wait for
// the injection door itself, not a guessed number of seconds.
await page.waitForFunction(() => typeof window.__injectPresence === 'function', { timeout: 30000 });
await page.waitForTimeout(1200);

// ── 1 · a live colleague appears: cursor with name, ghost with dashes ──────
await page.evaluate(() => {
  window.__injectPresence([{
    key: 'T-esther', name: 'Esther', color: '#0d9488', board: '',
    x: 500, y: 320, at: Date.now(),
    drag: { 'G-a': { x: 640, y: 400 } },
  }]);
});
await page.waitForTimeout(400);
check(await page.locator('[data-presence-layer]').count() === 1, 'the presence layer is on the board');
const cur = page.locator('[data-presence-cursor="T-esther"]');
check(await cur.count() === 1, "the colleague's cursor is drawn");
check((await cur.innerText()).includes('Esther'), 'wearing their name');
const ghost = page.locator('[data-presence-drag="G-a"]');
check(await ghost.count() === 1, 'the tile they are mid-drag with draws as a ghost');
const g = await ghost.evaluate(el => ({
  left: parseFloat(el.style.left), top: parseFloat(el.style.top),
  dashed: getComputedStyle(el).borderStyle.includes('dashed'),
  name: el.textContent,
}));
check(g.left === 640 && g.top === 400 && g.dashed, 'at their live position, dashed', JSON.stringify(g));
check(/Cohen/.test(g.name), "labelled with the job's name");

// ── 2 · the layer never takes the pointer ──────────────────────────────────
const hit = await page.evaluate(() => {
  const c = document.querySelector('[data-presence-cursor="T-esther"]').getBoundingClientRect();
  const el = document.elementFromPoint(c.left + 4, c.top + 4);
  return !el?.closest('[data-presence-layer]');
});
check(hit, "a click where their cursor sits falls through to the board");

// ── 3 · a peer whose row went quiet fades out ──────────────────────────────
await page.evaluate(() => {
  window.__injectPresence([{
    key: 'T-old', name: 'Ghost', color: '#999', board: '',
    x: 300, y: 300, at: Date.now() - 60_000,
  }]);
});
await page.waitForTimeout(400);
check(await page.locator('[data-presence-cursor="T-old"]').count() === 0,
  'a stale row (60s quiet) is not drawn');

// ── 4 · my own hand publishes — the publisher is wired even without RTDB ───
// presenceReady() is false here (no Firebase), so the listeners deliberately
// do NOT register: assert exactly that no crash and no self-cursor appears.
const vp = await page.locator('[data-board-viewport]').boundingBox();
await page.mouse.move(vp.x + 400, vp.y + 400);
await page.waitForTimeout(300);
check(await page.locator('[data-presence-cursor]').count() === 0,
  'without the database URL nothing publishes and nothing crashes');

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
