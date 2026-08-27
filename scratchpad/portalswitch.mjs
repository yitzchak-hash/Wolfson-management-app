// The portal must open on the workspace the worker's tasks are IN, even when
// this browser last stood in a workspace he has nothing in.
import { chromium } from 'playwright';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from './seed.mjs';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser, {});
const ctx = await browser.newContext({ viewport: { width: 344, height: 882 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await applySeed(ctx, blob, {});
const page = await ctx.newPage();
// stand in the Job Board the way a person does — through the header dropdown
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(1500);
await page.locator('header button', { hasText: /Wolfson/ }).first().tap();
await page.waitForTimeout(500);
await page.getByRole('menu').getByText(/Job Board/).first().tap();
await page.waitForTimeout(2200);
// now the worker opens his link on this browser
await page.goto(`http://localhost:5173/c/${PORTAL_TOKEN}`);
await page.waitForTimeout(5500); // the settle timer + switch
const text = await page.evaluate(() => document.body.innerText.slice(0, 300));
console.log(text);
const ok = /6 tasks/.test(text);
console.log(ok ? 'PASS auto-switched to the workspace with his work' : 'FAIL still empty');
await browser.close();
process.exit(ok ? 0 : 1);
