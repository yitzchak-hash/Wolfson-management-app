// The dead-sidebar theory, tested: React Router v7 renders navigations as
// interruptible TRANSITIONS. If live updates keep arriving (Firestore
// snapshots, presence peers), can they starve the navigation so the URL
// changes but the page never does — "the links move on top, nothing happens"?
// HIS board + a live presence-peer churn at several rates, then a sidebar click.
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

for (const everyMs of [400, 150, 50, 16]) {
  await page.goto('http://localhost:5173/jobs');
  await page.waitForTimeout(4000);
  // Live churn: presence peers moving constantly — each injection is a state
  // update racing whatever render is in flight.
  await page.evaluate(ms => {
    const w = window;
    let x = 0;
    w.__churnTimer = setInterval(() => {
      x = (x + 7) % 500;
      w.__injectPresence?.([
        { id: 'peer-a', name: 'Esther', color: '#e11d48', x: 200 + x, y: 300, at: Date.now() },
        { id: 'peer-b', name: 'Moshe', color: '#0ea5e9', x: 500, y: 200 + x, at: Date.now(),
          drag: { 'G-1': { x: 300 + x, y: 400 } } },
      ]);
    }, ms);
  }, everyMs);
  await page.waitForTimeout(800);
  await page.locator('aside a[href="/dashboard"]').click({ force: true });
  // Watch for FIVE seconds: does the dashboard ever actually render?
  let committed = false, urlNow = '';
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({
      url: location.pathname,
      dash: !!document.querySelector('main')?.textContent?.includes('Dashboard'),
      board: !!document.querySelector('[data-board-world]'),
    }));
    urlNow = r.url;
    if (r.url === '/dashboard' && !r.board && r.dash) { committed = true; break; }
  }
  console.log(`churn every ${everyMs}ms: url=${urlNow} → ${committed ? 'PAGE FOLLOWED' : 'PAGE NEVER CHANGED — STARVED'}`);
  await page.evaluate(() => clearInterval(window.__churnTimer));
}

await b.close();
