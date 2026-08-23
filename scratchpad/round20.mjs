// Round 20: search ranks by match quality and learns picks · cut fades and
// pastes to the middle of the screen · the focus button centres a tile · the
// fullscreen button · dead space + cursor-anchored zoom-out are in board.mjs.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const job = (i, name, extra) => ({
    id: `G-s${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: name, address: 'Somewhere 1',
    isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {},
    canvasX: 170, canvasY: 150 + i * 150,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    ...extra,
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [
      // The false-positive from the owner's screenshot: one letter off "lev"
      // at the loose fuzzy threshold. It must never sit above a real name.
      { id: 'ST-c', name: 'Concealed Units', color: '#7c3aed', order: 1, active: true, projectId: 'general' },
    ],
    apartments: [
      job(0, 'Lev'),
      job(1, 'Levine'),
      job(2, 'Shalev'),
    ],
    canvasElements: [],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3200);

const jobsNow = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  return Object.fromEntries((d.apartments ?? []).map(a => [a.displayName, { x: a.canvasX, y: a.canvasY }]));
});

// ── 1 · search: prefix beats fuzzy, the stage sinks ─────────────────────────
await page.keyboard.press('Control+k');
await page.waitForTimeout(400);
const input = page.locator('input[placeholder]').first();
await input.fill('lev');
await page.waitForTimeout(700);
const rows = await page.evaluate(() =>
  [...document.querySelectorAll('.fixed.z-\\[300\\] [role="button"], .fixed [role="button"]')]
    .map(r => (r.querySelector('.text-sm')?.textContent ?? '').trim()).filter(Boolean));
console.log('       rows for "lev":', JSON.stringify(rows.slice(0, 6)));
check(rows.length >= 3, 'searching "lev" finds the jobs', String(rows.length));
check(rows[0] === 'Lev' || rows[0] === 'Levine',
  'a name that STARTS with it is first', rows[0]);
const stageAt = rows.findIndex(r => /Concealed/i.test(r));
const shalevAt = rows.findIndex(r => r === 'Shalev');
check(stageAt === -1 || (stageAt > shalevAt && shalevAt !== -1),
  'the fuzzy stage match sits below every real name', `stage@${stageAt} shalev@${shalevAt}`);

// ── 2 · the search LEARNS: pick Shalev, retype, Shalev is first ─────────────
await page.locator('[role="button"]', { hasText: 'Shalev' }).first().click();
await page.waitForTimeout(900);
await page.keyboard.press('Escape');            // close whatever opened
await page.waitForTimeout(400);
await page.keyboard.press('Control+k');
await page.waitForTimeout(400);
await page.locator('input[placeholder]').first().fill('lev');
await page.waitForTimeout(700);
const rows2 = await page.evaluate(() =>
  [...document.querySelectorAll('.fixed [role="button"]')]
    .map(r => (r.querySelector('.text-sm')?.textContent ?? '').trim()).filter(Boolean));
console.log('       rows after picking Shalev:', JSON.stringify(rows2.slice(0, 4)));
check(rows2[0] === 'Shalev', 'the picked result is remembered and comes first', rows2[0]);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.keyboard.press('Escape');            // clear any selection
await page.waitForTimeout(300);

// ── 3 · cut fades, paste lands centred on the screen ────────────────────────
const tile = page.locator('[data-node-id="G-s0"]');
await tile.click();                              // select
await page.waitForTimeout(300);
await page.keyboard.press('Control+x');
await page.waitForTimeout(400);
const op = await tile.evaluate(el => getComputedStyle(el).opacity);
check(Number(op) < 0.6, 'a cut tile fades — visibly in the air', op);
await page.keyboard.press('Control+v');
await page.waitForTimeout(800);
const opAfter = await tile.evaluate(el => getComputedStyle(el).opacity);
check(Number(opAfter) > 0.9, 'and turns solid again on paste', opAfter);
let jp = await jobsNow();
const centre = await page.evaluate(() => {
  const vp = document.querySelector('[data-board-viewport]');
  const world = document.querySelector('[data-board-world]');
  const vr = vp.getBoundingClientRect(), wr = world.getBoundingClientRect();
  const zoom = wr.width / world.offsetWidth;
  return { x: (vr.left + vp.clientWidth / 2 - wr.left) / zoom, y: (vr.top + vp.clientHeight / 2 - wr.top) / zoom };
});
console.log('       cut-paste landed:', JSON.stringify(jp['Lev']), 'centre', JSON.stringify(centre));
check(jp['Lev'] && Math.abs(jp['Lev'].x + 107 - centre.x) < 40 && Math.abs(jp['Lev'].y + 66 - centre.y) < 80,
  'the cut tile moved to the middle of the screen');
const total1 = Object.keys(jp).length;
check(total1 === 3, 'a cut MOVES — no duplicate was made', String(total1));

// ── 4 · copy-paste duplicates to the middle ─────────────────────────────────
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.locator('[data-node-id="G-s1"]').click();
await page.waitForTimeout(200);
await page.keyboard.press('Control+c');
await page.waitForTimeout(200);
await page.keyboard.press('Control+v');
await page.waitForTimeout(800);
jp = await jobsNow();
const copyName = Object.keys(jp).find(n => /Levine \(copy\)/.test(n));
check(!!copyName, 'copy-paste made a duplicate', JSON.stringify(Object.keys(jp)));
if (copyName) {
  check(Math.abs(jp[copyName].x + 107 - centre.x) < 40,
    'and it landed in the middle of the screen', JSON.stringify(jp[copyName]));
}

// ── 5 · the focus button centres a tile ─────────────────────────────────────
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
// G-s1: the paste-centre landed on top of G-s2's spot, so that tile is
// buried under the pasted pair — a hover there hits the copy, not it.
const far = page.locator('[data-node-id="G-s1"]');
await far.hover();
await page.waitForTimeout(300);
const focusBtn = far.locator('button[title="Centre this on the screen"]');
check(await focusBtn.count() > 0, 'every tile carries a focus button');
await focusBtn.click();
await page.waitForTimeout(900);
const tb = await far.boundingBox();
const vpBox = await page.evaluate(() => {
  const r = document.querySelector('[data-board-viewport]').getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
});
console.log('       focused tile centre:', JSON.stringify({ x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 }), 'viewport centre', JSON.stringify(vpBox));
/**
 * 2026-09-05 contract: LEFT and BOTTOM are free (desk may show), TOP and
 * RIGHT are flush. Centring a near-origin tile horizontally is possible now
 * (grey opens on the left); vertically the glide stops where the top pin
 * holds. So: x centred, tile fully on screen, and never above the chrome.
 */
check(Math.abs(tb.x + tb.width / 2 - vpBox.cx) < 30,
  'pressing it glides the tile to the middle horizontally');
check(tb.x >= vpBox.l - 1 && tb.y >= vpBox.t - 1 && tb.x + tb.width <= vpBox.r + 1 && tb.y + tb.height <= vpBox.b + 1,
  'and the tile is fully on the screen, as centred as the top pin allows');

// ── 6 · the fullscreen button ───────────────────────────────────────────────
const fsBtn = page.locator('button[title="Board full screen"]');
check(await fsBtn.count() > 0, 'the fullscreen button sits in the board header');
await fsBtn.click();
await page.waitForTimeout(700);
const fsOn = await page.evaluate(() => !!document.fullscreenElement);
check(fsOn, 'pressing it takes the board full screen');
if (fsOn) {
  await page.locator('button[title="Leave full screen"]').click();
  await page.waitForTimeout(500);
  check(await page.evaluate(() => !document.fullscreenElement), 'and pressing again leaves it');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
