// Probe: a multi-selection shows NO per-node strips — ONE lock/focus/TV strip
// rides the combined box and acts on the whole selection. A single selection
// keeps the full per-node strip.
import { chromium } from 'playwright';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => {
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('active_project', 'general');
  const user = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user, contractors: [] }));
  localStorage.setItem('general_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors: [], apartments: [],
    canvasElements: [0, 1, 2].map(i => ({
      id: `CE-s${i}`, type: 'note', x: 260 + i * 260, y: 320, w: 200, h: 160,
      text: `note ${i}`, color: '#fef9c3',
    })),
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(3000);

// Scoped to the three seeded notes — the lasso can also catch the board's
// own seeded bins, and hovering any UNSELECTED node legitimately reveals
// its strip.
const perNodeStrips = () => page.evaluate(() =>
  ['CE-s0', 'CE-s1', 'CE-s2'].filter(id =>
    document.querySelector(`[data-node-id="${id}"] button[title*="Centre this"]`)).length);

// Single selection: the full per-node strip.
const one = await page.locator('[data-node-id="CE-s0"]').boundingBox();
await page.mouse.click(one.x + one.width / 2, one.y + one.height / 2);
await page.waitForTimeout(400);
check(await perNodeStrips() >= 1, 'a single selection keeps its own full strip');
check(await page.locator('[data-sel-strip]').count() === 0, 'and no selection strip is drawn');

// Lasso all three.
await page.keyboard.down('Control');
await page.mouse.move(200, 260);
await page.mouse.down();
for (let i = 1; i <= 8; i++) { await page.mouse.move(200 + i * 85, 260 + i * 32); await page.waitForTimeout(16); }
await page.mouse.up();
await page.keyboard.up('Control');
// Park the mouse off every node — a hover on an unselected one shows ITS strip.
await page.mouse.move(60, 840);
await page.waitForTimeout(500);

check(await perNodeStrips() === 0, 'multi-selected nodes wear NO strips of their own');
const selStrip = page.locator('[data-sel-strip]');
check(await selStrip.count() === 1, 'ONE strip rides the combined box');
check(await selStrip.locator('button').count() === 3, 'with exactly lock · focus · TV');

// Its lock button locks the WHOLE selection in one press.
await selStrip.locator('button[title*="Lock all"]').click();
await page.waitForTimeout(700);
const locked = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('general_app_data')).canvasElements
    .filter(e => /^CE-s\d$/.test(e.id) && e.locked).length);
check(locked === 3, `one press locked all three (${locked})`);
// And its TV button hides them all.
await selStrip.locator('button[title*="Hide all"]').click();
await page.waitForTimeout(700);
const hidden = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('general_app_data')).canvasElements
    .filter(e => /^CE-s\d$/.test(e.id) && e.showOnTv === false).length);
check(hidden === 3, `one press hid all three from the TV (${hidden})`);

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
