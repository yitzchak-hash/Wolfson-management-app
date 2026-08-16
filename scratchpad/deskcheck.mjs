// The phone fixes touched SHARED components (drawer top row, drawer header,
// the Drive grid, the dashboard header). This proves the desktop layout still
// puts them on one row rather than silently inheriting the phone stacking.
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
await page.waitForTimeout(1600);
await page.locator('[class*="cursor-pointer"]', { hasText: /^49/ }).first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: 'scratchpad/desk-drawer.png' });

// The four top-row fields must share ONE line: same top offset, all inside the panel.
const row = await page.evaluate(() => {
  const labels = Array.from(document.querySelectorAll('.drawer-panel label'));
  const want = ['Apt', 'Family', 'Type', 'Stage'];
  const found = want.map(w => {
    const el = labels.find(l => (l.textContent || '').includes(w));
    if (!el) return { w, missing: true };
    const r = el.getBoundingClientRect();
    return { w, top: Math.round(r.top), left: Math.round(r.left) };
  });
  const panel = document.querySelector('.drawer-panel').getBoundingClientRect();
  // The Drive grid must be two columns on desktop.
  const grid = Array.from(document.querySelectorAll('.drawer-panel .grid'))
    .map(g => getComputedStyle(g).gridTemplateColumns)
    .filter(c => c && c !== 'none');
  return { found, panel: { left: Math.round(panel.left), right: Math.round(panel.right) }, grid };
});

console.log('drawer top-row labels:', JSON.stringify(row.found));
const tops = row.found.filter(f => !f.missing).map(f => f.top);
const oneLine = tops.length === 4 && new Set(tops).size === 1;
console.log(oneLine ? 'PASS all four on one line' : `FAIL tops differ: ${tops.join(',')}`);
console.log('drive grid columns:', row.grid.filter(c => c.split(' ').length === 2).length >= 1
  ? 'PASS two-column present' : `FAIL ${JSON.stringify(row.grid)}`);

await page.goto('http://localhost:5173/dashboard');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'scratchpad/desk-dashboard.png' });
const dash = await page.evaluate(() => {
  const h1 = document.querySelector('h1');
  const btns = h1?.parentElement?.querySelector('div');
  if (!h1 || !btns) return null;
  return { h1Top: Math.round(h1.getBoundingClientRect().top), btnTop: Math.round(btns.getBoundingClientRect().top) };
});
console.log('dashboard header:', JSON.stringify(dash),
  dash && Math.abs(dash.h1Top - dash.btnTop) < 24 ? 'PASS title and buttons share a row' : 'FAIL wrapped');

await browser.close();
