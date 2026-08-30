// The owner's REAL board (fetched to /tmp, never the repo) against the DEV
// build: catch the max-update-depth loop, the dead sidebar, and how a job
// opens. Run: node scratchpad/hisboard-crash.mjs [path-to-his-general.json]
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const payloadPath = process.argv[2]
  ?? '/tmp/claude-0/-home-user-Wolfson-management-app/e8907eee-31fb-5f3a-8bd4-40e921002733/scratchpad/his-general.json';
const payload = readFileSync(payloadPath, 'utf8');

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.addInitScript(p => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('general_app_data', p);
}, payload);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 400)));
page.on('console', m => {
  if (m.type() === 'error' || m.type() === 'warning') {
    const t = m.text();
    if (/Maximum update depth|Warning|Error/i.test(t)) errs.push(m.type().toUpperCase() + ' ' + t.slice(0, 400));
  }
});

console.log('— loading /jobs with the real board —');
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(9000);
console.log('crash screen:', await page.evaluate(() =>
  document.body.innerText.includes('something went wrong') || document.body.innerText.includes('Reload')));
console.log('board mounted:', await page.locator('[data-board-viewport]').count());

// let it stew — an update loop can take a while to trip the depth guard
await page.waitForTimeout(8000);

// ── sidebar navigation from the Job Board workspace ──
for (const [label, path] of [['Tasks', '/tasks'], ['Dashboard', '/dashboard'], ['Reports', '/reports']]) {
  try {
    await page.locator(`nav a[href="${path}"], aside a[href="${path}"], a[href="${path}"]`).first().click({ timeout: 5000 });
  } catch { console.log(`${label}: link not found/clickable`); continue; }
  await page.waitForTimeout(2500);
  const url = new URL(page.url()).pathname;
  const boardStill = await page.locator('[data-board-viewport]').count();
  console.log(`${label}: url=${url} boardStillMounted=${boardStill}`);
  await page.goto('http://localhost:5173/jobs');
  await page.waitForTimeout(4000);
}

// ── how does a job open? double-click a tile ──
const tile = page.locator('[data-node-id^="G-"]').first();
if (await tile.count()) {
  await tile.dblclick().catch(() => console.log('tile dblclick failed'));
  await page.waitForTimeout(3000);
  console.log('drawer panels:', await page.locator('.drawer-panel').count());
  await page.keyboard.press('Escape');
} else console.log('no tile visible to open');

console.log('\n— errors seen —');
[...new Set(errs)].slice(0, 15).forEach(e => console.log(e));
if (!errs.length) console.log('(none)');
await page.screenshot({ path: 'scratchpad/hisboard.png' });
await b.close();
