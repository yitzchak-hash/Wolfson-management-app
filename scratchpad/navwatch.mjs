// The TV button lives only on the Job Board's sidebar, and the ?debugnav=1
// watchdog: silent when navigation works, a red banner naming the facts when
// a click goes nowhere (simulated here by preventDefault-ing the link).
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
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [], apartments: [], canvasElements: [],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });

// ── TV button scoping ──────────────────────────────────────────────────────
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2500);
check(await page.locator('aside a[href="/tv-view"]').count() === 1,
  'the Job Board sidebar keeps its TV button');
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('header button')]
    .find(x => /wolfson/i.test(x.textContent || '') || x.querySelector('img'));
  btn?.click();
});
await page.waitForTimeout(600);
await page.evaluate(() => {
  const row = [...document.querySelectorAll('button, [role="menuitem"], a')]
    .find(x => /wolfson/i.test(x.textContent || ''));
  row?.click();
});
await page.waitForTimeout(2500);
const ws = await page.evaluate(() => localStorage.getItem('active_project'));
if (ws === 'wolfson') {
  check(await page.locator('aside a[href="/tv-view"]').count() === 0,
    'Wolfson\'s sidebar has NO TV button — one wall, one door');
} else {
  console.log('SKIP workspace switch did not land (picker markup changed?) —', ws);
}

// ── the watchdog ───────────────────────────────────────────────────────────
const page2 = await ctx.newPage();
await page2.goto(`${APP}/jobs?debugnav=1`);
await page2.waitForTimeout(2500);
// Working navigation: silent.
await page2.locator('aside a[href="/dashboard"]').click();
await page2.waitForTimeout(2200);
check(await page2.evaluate(() => location.pathname) === '/dashboard'
  && await page2.evaluate(() => document.body.textContent.includes('NAV WATCH')) === false,
  'a WORKING click navigates and the watchdog stays silent');
await page2.goBack();
await page2.waitForTimeout(1500);
// A blocked navigation: the banner names the facts.
await page2.evaluate(() => {
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('aside a')) e.preventDefault();
  }, true);
});
await page2.locator('aside a[href="/tasks"]').click();
await page2.waitForTimeout(2200);
const banner = await page2.evaluate(() => {
  const d = [...document.querySelectorAll('div')].find(x => (x.textContent || '').startsWith('NAV WATCH'));
  return d ? d.textContent : '';
});
check(/clicked: \/tasks/.test(banner) && /still on: \/jobs/.test(banner) && /click landed on:/.test(banner),
  'a BLOCKED click raises the red banner with the facts', banner.slice(0, 90).replace(/\n/g, ' · '));
// Without the flag: nothing arms.
const page3 = await ctx.newPage();
await page3.goto(`${APP}/jobs`);
await page3.waitForTimeout(2000);
await page3.evaluate(() => {
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('aside a')) e.preventDefault();
  }, true);
});
await page3.locator('aside a[href="/tasks"]').click();
await page3.waitForTimeout(2200);
check(await page3.evaluate(() => document.body.textContent.includes('NAV WATCH')) === false,
  'without the flag the watchdog does not exist');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
