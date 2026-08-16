// Plan pane auto-aspect: the pane opens at the landscape fallback, snaps to
// the sheet's MEASURED shape when the thumbnail answers, caches per file id,
// and never asks the thumbnail again on a reopen. The orientation chips are gone.
//
// The thumbnail is a real PNG drawn by chromium itself (200x300 — portrait
// 2:3), so the Image path runs for real. It is served SLOWLY (800ms) so the
// fallback state is observable first. All other drive.google.com traffic is
// aborted — no internet here and the iframe is inert anyway.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!cond) failures++;
};
const near = (a, b, tol = 14) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1800, height: 860 } });

// A guaranteed-valid PNG, drawn by the browser itself (the map round taught
// us what a hand-corrupted stub PNG does to a harness).
const scratch = await ctx.newPage();
const dataUrl = await scratch.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 200; c.height = 300;
  const g = c.getContext('2d'); g.fillStyle = '#1e3a5f'; g.fillRect(0, 0, 200, 300);
  return c.toDataURL('image/png');
});
await scratch.close();
const png = Buffer.from(dataUrl.split(',')[1], 'base64');

let thumbRequests = 0;
await ctx.route('**://drive.google.com/**', r => r.abort());
await ctx.route('**://drive.google.com/thumbnail*', async r => {
  thumbRequests++;
  await new Promise(res => setTimeout(res, 800));
  await r.fulfill({ contentType: 'image/png', body: png });
});

const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'Architect Avi', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    users: [{ id: 'U-test', name: 'Architect Avi', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' }],
    apartments: [{
      id: 'A1-1', buildingId: 'A1', apartmentNumber: '1', displayName: 'Pin Test',
      floor: 2, isUnnamed: false, isDuplexApt: false, classification: 'standard',
      currentStageId: null, generalNotes: '',
      plansPdfLink: 'https://drive.google.com/file/d/FAKEPDF12345/view',
    }],
  }));
});

await page.goto(APP + '/project');
await page.waitForTimeout(1200);
await page.locator('[class*="cursor-pointer"]', { hasText: 'Pin Test' }).first().click()
  .catch(async () => { await page.getByText('Pin Test', { exact: false }).first().click(); });
await page.waitForTimeout(350);   // before the slow thumbnail answers

const modal = page.locator('.drawer-panel');
const modalH = Math.min(980, 860 * 0.93);
const paneH = modalH - 56;
const expectFallback = Math.min(560 + Math.round(paneH * Math.SQRT2), 1800 * 0.96);
const expectPortrait = 560 + Math.round(paneH * (200 / 300));

const w1 = (await modal.boundingBox()).width;
ok('opens at the landscape fallback', near(w1, expectFallback), `${w1} vs ${expectFallback}`);
ok('orientation chips are gone', await page.locator('button[title="Portrait sheet"], button[title="Landscape sheet"]').count() === 0);

await page.waitForTimeout(1600);  // thumbnail lands
const w2 = (await modal.boundingBox()).width;
ok('snaps to the measured portrait shape', near(w2, expectPortrait), `${w2} vs ${expectPortrait}`);
const cached = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('plan_aspect_cache') ?? '{}').FAKEPDF12345);
ok('ratio cached per file id', typeof cached === 'number' && Math.abs(cached - 2 / 3) < 0.01, String(cached));
const asked = thumbRequests;
ok('the thumbnail was consulted', asked >= 1, String(asked));

// Reopen: the cache answers, the thumbnail is not asked again.
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.locator('[class*="cursor-pointer"]', { hasText: 'Pin Test' }).first().click()
  .catch(async () => { await page.getByText('Pin Test', { exact: false }).first().click(); });
await page.waitForTimeout(500);
const w3 = (await modal.boundingBox()).width;
ok('reopen is portrait from the cache', near(w3, expectPortrait), `${w3} vs ${expectPortrait}`);
ok('no second thumbnail request', thumbRequests === asked, `${thumbRequests} vs ${asked}`);

await page.screenshot({ path: 'scratchpad/planaspect.png' });
await browser.close();
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
