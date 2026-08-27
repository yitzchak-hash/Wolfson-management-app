// The first sweep's accident, isolated: open the TV menu, press Escape, then
// ONE click on a tile — a drawer opened from a single click. Is Escape not
// closing the menu, and does the menu-closing click misbehave?
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const payload = readFileSync('/tmp/claude-0/-home-user-Wolfson-management-app/99bdbf4a-e40f-5735-845d-1466af88b019/scratchpad/his-general.json', 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(p => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('general_app_data', p);
}, payload);
const page = await ctx.newPage();
page.on('pageerror', e => { if (!/localStorage/.test(e.message)) console.log('PAGE ERROR', e.message.slice(0, 200)); });
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(4000);

const state = () => page.evaluate(() => ({
  menu: !!document.querySelector('[data-tv-menu]'),
  drawer: !!document.querySelector('.drawer-panel'),
  path: location.pathname,
}));

// 1 · open the TV menu.
await page.locator('[data-show-tv]').first().click();
await page.waitForTimeout(500);
console.log('menu open:', JSON.stringify(await state()));

// 2 · Escape — does the menu close?
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
console.log('after Escape:', JSON.stringify(await state()));

// 3 · while the menu stands, click the SIDEBAR — does navigation happen?
await page.locator('aside a[href="/dashboard"]').click({ timeout: 2000, force: true }).catch(e => console.log('sidebar click failed:', e.message.split('\n')[0]));
await page.waitForTimeout(800);
console.log('after sidebar click:', JSON.stringify(await state()));

await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2500);

// 4 · menu open again, then ONE click on a tile.
await page.locator('[data-show-tv]').first().click();
await page.waitForTimeout(500);
const tile = page.locator('[data-node-id^="G-"]').first();
const tb = await tile.boundingBox();
if (tb) {
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.waitForTimeout(900);
  console.log('after single tile click with menu open:', JSON.stringify(await state()));
}

await b.close();
