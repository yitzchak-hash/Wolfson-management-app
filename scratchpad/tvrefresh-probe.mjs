// Probe: the refresh button sits LEFT of the ⋯, which sits left of the
// overdue pill, and pressing it reloads the page.
import { chromium } from 'playwright';
import { realisticWolfson, applySeed } from './seed.mjs';

const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const blob = await realisticWolfson(browser);
const data = JSON.parse(blob);
const apt = data.apartments[10];
data.contractorAssignments = [{
  id: 'T-over-1', apartmentId: apt.id, buildingId: apt.buildingId, contractorId: 'C-x',
  taskDescription: 'Overdue probe task', dueDate: '2026-08-01', completedAt: null,
  createdAt: '2026-07-01T09:00:00Z', priority: 'normal',
}];
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await applySeed(ctx, JSON.stringify(data));
const page = await ctx.newPage();
await page.goto('http://localhost:5173/tv?view=wolfson');
await page.waitForTimeout(3500);

const boxes = await page.evaluate(() => {
  const r = sel => document.querySelector(sel)?.getBoundingClientRect() ?? null;
  return {
    refresh: r('[data-tv-refresh]'),
    more: r('[data-tv-more]'),
    overdue: r('[data-tv-overdue]'),
  };
});
check(!!boxes.refresh, 'refresh button is on the bar');
check(!!boxes.refresh && !!boxes.more && boxes.refresh.x < boxes.more.x,
  `refresh sits left of the three dots (${Math.round(boxes.refresh?.x)} < ${Math.round(boxes.more?.x)})`);
check(!!boxes.more && !!boxes.overdue && boxes.more.x < boxes.overdue.x,
  'three dots still left of the overdue pill');
await page.screenshot({ path: `${SCRATCH}/tv-refresh.png` });

// Pressing it reloads the page — a reload wipes any in-page marker.
await page.evaluate(() => { window.__probeMarker = 1; });
await page.click('[data-tv-refresh]');
await page.waitForTimeout(2500);
const marker = await page.evaluate(() => window.__probeMarker ?? null);
check(marker === null, 'pressing refresh reloads the page (marker cleared)');
await page.waitForSelector('[data-tv-refresh]', { timeout: 15000 }).catch(() => {});
check(await page.locator('[data-tv-refresh]').count() === 1, 'the wall comes back after the reload');

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
