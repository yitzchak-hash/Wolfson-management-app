// Login round: a tile per saved user, per-user code entry, no project logos.
//
// Firebase is NOT configured in dev, so authReady is true at boot and the
// store's users come from the seeded localStorage list — the same list login()
// checks. The wrong-tile-right-code case is the one that matters: login()
// signs in whoever owns the code, so the page must refuse a valid code typed
// on somebody else's tile.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!cond) failures++;
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

const USERS = [
  { id: 'U-a', name: 'Esther Cohen', code: '111222', role: 'admin', active: true, createdAt: '2026-01-01' },
  { id: 'U-b', name: 'Yitzchak Levi', code: '333444', role: 'admin', active: true, createdAt: '2026-01-01' },
  { id: 'U-c', name: 'Old Account', code: '555666', role: 'admin', active: false, createdAt: '2026-01-01' },
];
await page.addInitScript(users => {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('wolfson_app_data', JSON.stringify({ currentUser: null, users }));
}, USERS);

await page.goto(APP + '/');
await page.waitForTimeout(1000);

// 1 — the first screen is user tiles, no code boxes, no project logos.
ok('shows Who is signing in?', await page.getByText('Who is signing in?').count() === 1);
ok('a tile per active user', await page.getByRole('button', { name: 'Esther Cohen' }).count() === 1
  && await page.getByRole('button', { name: 'Yitzchak Levi' }).count() === 1);
ok('inactive user gets no tile', await page.getByText('Old Account').count() === 0);
ok('no code inputs on the first screen', await page.locator('input[inputmode="numeric"]').count() === 0);
ok('no project logos on the first screen', await page.locator('img[alt="Wolfson"], img[alt="Netiv"]').count() === 0);

// 2 — picking a tile asks for THAT user's code.
await page.getByRole('button', { name: 'Esther Cohen' }).click();
await page.waitForTimeout(300);
ok('code step shows the picked name', await page.getByText('Esther Cohen').count() >= 1);
ok('six code boxes appear', await page.locator('input[inputmode="numeric"]').count() === 6);

// 3 — the OTHER user's valid code is refused on this tile.
await page.locator('input[inputmode="numeric"]').first().click();
await page.keyboard.type('333444', { delay: 40 });
await page.waitForTimeout(700);
ok('wrong-tile-right-code refused', await page.getByText('Invalid code').count() === 1);
const who = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('wolfson_app_data') ?? '{}').currentUser?.name ?? null);
ok('nobody got signed in by it', who === null, String(who));

// 4 — back returns to the tiles.
await page.getByRole('button', { name: 'Go back' }).click();
await page.waitForTimeout(200);
ok('back returns to tiles', await page.getByText('Who is signing in?').count() === 1);

// 5 — the right code signs in and lands in the workspace, no project step.
await page.getByRole('button', { name: 'Esther Cohen' }).click();
await page.locator('input[inputmode="numeric"]').first().click();
await page.keyboard.type('111222', { delay: 40 });
await page.waitForTimeout(1200);
ok('lands on /project directly', page.url().includes('/project'), page.url());
const who2 = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('wolfson_app_data') ?? '{}').currentUser?.name ?? null);
ok('signed in as the picked user', who2 === 'Esther Cohen', String(who2));

await page.screenshot({ path: 'scratchpad/logintiles.png' });
await browser.close();
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
