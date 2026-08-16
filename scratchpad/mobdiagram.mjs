// Phone diagram round: one building behind big tabs, filters in a sheet.
// Real default Wolfson data (168 units) on an iPhone-sized touch profile.
import { chromium, devices } from 'playwright';

let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!cond) failures++;
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  userAgent: devices['iPhone 13'].userAgent,
});
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('whats_new_seen', '2026-08-16');
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'Architect Avi', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
  }));
});

await page.goto('http://localhost:5173/project');
await page.waitForTimeout(1500);

// 1 — one building, chosen by big tabs, no sideways scroll.
const headers = await page.locator('div.sticky', { hasText: /^A\d$/ }).allTextContents();
ok('exactly one building rendered', headers.length === 1, headers.join(','));
ok('A1 is the default', headers[0] === 'A1');
const overflow = await page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok('no horizontal overflow', overflow === 0, `${overflow}px`);
// visible=true throughout: the desktop bar still EXISTS (hidden md:block),
// and counting its hidden buttons reports the test's fault as the product's.
const tabs = page.locator('button >> visible=true', { hasText: /^A[123]$/ });
ok('three building tabs', await tabs.count() === 3, String(await tabs.count()));

// The diagram must start high on the page — the old filter wall pushed it
// ~1100px down. The building header should be on the first screen.
const bldTop = await page.locator('div.sticky', { hasText: 'A1' }).boundingBox();
ok('building starts on the first screen', bldTop.y < 400, `y=${Math.round(bldTop.y)}`);

// Cells are finger-sized.
const cellBox = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[class*="cursor-pointer"]')]
    .find(e => /49/.test(e.textContent ?? '') && e.getBoundingClientRect().width < 120 && e.getBoundingClientRect().width > 10);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
ok('cells at least 44px tall', !!cellBox && cellBox.h >= 44, JSON.stringify(cellBox));

// 2 — tabs actually switch the building.
await page.locator('button', { hasText: /^A2$/ }).first().tap();
await page.waitForTimeout(500);
const after = await page.locator('div.sticky', { hasText: /^A\d$/ }).allTextContents();
ok('tapping A2 shows only A2', after.length === 1 && after[0] === 'A2', after.join(','));

// 3 — the filter wall is gone from the page; a Filters button opens a sheet.
ok('legend not visible on the page', await page.locator('text=Concealed Units Installed >> visible=true').count() === 0);
ok('no visible Bulk Update on the page', await page.locator('text=Bulk Update >> visible=true').count() === 0);
await page.getByRole('button', { name: /Filters/ }).tap();
await page.waitForTimeout(400);
ok('sheet shows the stage legend', await page.locator('text=Concealed Units Installed >> visible=true').count() >= 1);
ok('sheet shows the counts', await page.locator('text=/168/ >> visible=true').count() >= 1);

// 4 — a stage filter picked in the sheet dims the rest and badges the button.
const sheet = page.locator('div.fixed.inset-0.z-50');
await sheet.getByText('Piping', { exact: false }).first().tap();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Done' }).tap();
await page.waitForTimeout(400);
ok('sheet closed on Done', await page.getByRole('button', { name: 'Done' }).count() === 0);
const badge = await page.getByRole('button', { name: /Filters/ }).textContent();
ok('Filters button shows the active count', /1/.test(badge ?? ''), badge ?? '');

// 5 — tapping a cell opens the apartment.
await page.getByRole('button', { name: /Filters/ }).tap();
await page.waitForTimeout(300);
await page.locator('div.fixed.inset-0.z-50').getByText('Clear', { exact: true }).tap();
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Done' }).tap();
await page.waitForTimeout(300);
const cell = page.locator('[class*="cursor-pointer"]', { hasText: /^49/ }).first();
await cell.tap();
await page.waitForTimeout(700);
ok('cell opens the apartment window', await page.locator('.drawer-panel').count() === 1);
const panel = await page.locator('.drawer-panel').boundingBox();
ok('the window fits the phone', panel && panel.width <= 390, `${panel?.width}px`);

await page.screenshot({ path: 'scratchpad/mob-diagram-after.png' });
await browser.close();
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
