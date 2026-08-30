// NAVIGATION IS URGENT AGAIN — the dead-buttons fix, proven.
//
// react-router v7 wraps every navigation in React.startTransition, and a
// transition render is restarted by any urgent update — this app ticks every
// second, so on a slow machine the router never finished: URL moved, screen
// did not (the office's dead sidebar; the TV bar's dead buttons). The
// `router-urgent-nav` shim in vite.config.ts makes react-router's
// startTransition run inline.
//
// The proof has two halves:
//  1. THE SIGNATURE — with the shim, the DOM swap lands by the end of the
//     click's MICROTASK queue (an urgent update; no timer or tick can get in
//     ahead of a microtask). A transition render goes through the scheduler's
//     macrotask and never can. Measured both ways: shim on → gone at the
//     microtask; shim off → not gone even a frame later. The check fails the
//     moment anyone removes the shim.
//  2. THE DISEASE — navigation completes under CPU throttle + presence churn
//     (the starvation that killed it). Needs the dev build for
//     window.__injectPresence.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  const jobs = Array.from({ length: 40 }, (_, i) => ({
    id: `G-un-${i}`, buildingId: 'G', apartmentNumber: '', floor: 0, isUnnamed: false,
    displayName: `Job ${i}`, classification: 'standard', isDuplexApt: false,
    canvasX: 40 + (i % 8) * 240, canvasY: 40 + Math.floor(i / 8) * 160,
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }));
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [], apartments: jobs, canvasElements: [],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });

await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3000);
check(await page.locator('[data-board-viewport]').count() === 1, 'the board mounted');

// ── 1. the signature: the click's own microtask queue swaps the screen ─────
const sync = await page.evaluate(async () => {
  const link = document.querySelector('aside a[href="/dashboard"]');
  if (!link) return { missing: true };
  link.click();
  // The microtask queue drains before ANY timer, interval or scheduler
  // callback — an urgent update is here; a transition never is.
  await Promise.resolve();
  return {
    path: location.pathname,
    boardGone: !document.querySelector('[data-board-viewport]'),
  };
});
check(!sync.missing && sync.path === '/dashboard' && sync.boardGone,
  'a sidebar click swaps the screen within its own microtask queue (inline startTransition is live)',
  JSON.stringify(sync));

// ── 2. the disease: navigation survives throttle + churn ───────────────────
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3000);
const hasInject = await page.evaluate(() => typeof window.__injectPresence === 'function');
if (!hasInject) {
  console.log('SKIP churn half — __injectPresence needs the dev build');
} else {
  await page.evaluate(() => {
    let x = 100;
    window.__churn = setInterval(() => {
      x = (x + 13) % 2000;
      window.__injectPresence([
        { id: 'p1', name: 'Esther', color: '#e0483d', x, y: 400 + (x % 200), at: Date.now() },
        { id: 'p2', name: 'Moshe', color: '#177a4b', x: 2000 - x, y: 700 - (x % 150), at: Date.now() },
      ]);
    }, 50);
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 10 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('aside a[href="/tasks"]')?.click());
  await page.waitForTimeout(4000);
  const path = await page.evaluate(() => location.pathname);
  const boardGone = await page.locator('[data-board-viewport]').count() === 0;
  check(path === '/tasks' && boardGone,
    'under 10x throttle + presence churn the click still lands and renders',
    `path=${path} boardGone=${boardGone}`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.evaluate(() => clearInterval(window.__churn));
}

console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
await b.close();
process.exit(fails ? 1 : 0);
