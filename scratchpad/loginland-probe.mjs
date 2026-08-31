// Probe: logging in with the Job Board as the active workspace must land ON
// the job board, with the board actually drawn — no second click on "Jobs".
import { chromium } from 'playwright';

const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('active_project', 'wolfson');
  // Users but NO currentUser — the logged-out state.
  const users = [{ id: 'U-1', name: 'Esther', code: '123456', role: 'admin', active: true, createdAt: '2026-01-01' }];
  localStorage.setItem('wolfson_app_data', JSON.stringify({ users }));
  localStorage.setItem('general_app_data', JSON.stringify({
    users,
    apartments: [{
      id: 'G-x1', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Landing Probe',
      classification: 'standard', isUnnamed: false, createdAt: '2026-01-01', canvasX: 400, canvasY: 300,
    }],
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2500);
check(page.url().includes('/login'), 'logged out lands on the login page', page.url());

// Pick the tile, type the code.
await page.getByText('Esther').first().click();
await page.waitForTimeout(600);
await page.keyboard.type('123456', { delay: 60 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SCRATCH}/login-landing.png` });
check(page.url().endsWith('/jobs'), 'after login the URL is /jobs', page.url());
const boardThere = await page.locator('[data-board-viewport], [data-board-world]').count();
check(boardThere > 0, 'the job board is actually drawn');
const tile = await page.getByText('Landing Probe').count();
check(tile > 0, 'the seeded job tile is visible');

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
