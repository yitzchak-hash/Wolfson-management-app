// Probe: the big Search button widget — press opens the window, the search
// forgives a near-miss, a row from ANOTHER workspace travels there, and
// Escape closes just the window.
import { chromium } from 'playwright';
import { realisticWolfson, applySeed } from './seed.mjs';

const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const blob = await realisticWolfson(browser);   // Wolfson snapshot with Cohen, David etc.
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await applySeed(ctx, blob);
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_data', JSON.stringify({
    apartments: [{
      id: 'G-s1', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Levinger',
      classification: 'standard', isUnnamed: false, createdAt: '2026-01-01', canvasX: 700, canvasY: 300,
    }],
    canvasElements: [{
      id: 'CE-probe-search', type: 'widget', widget: 'search-tile',
      x: 120, y: 160, w: 210, h: 210, text: '', color: '#ffffff', data: {},
    }],
    currentUser: { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(3000);

const tile = page.locator('[data-search-tile]');
check(await tile.count() === 1, 'the big search tile is on the board');
await page.screenshot({ path: `${SCRATCH}/searchtile-board.png` });
await tile.click();
await page.waitForTimeout(500);
check(await page.locator('[data-search-window]').count() === 1, 'pressing it pops the search window');
check(await page.locator('[data-search-mic]').count() >= 1, 'the microphone is in the window');

// Same-workspace hit.
await page.fill('[data-search-window] input', 'levinger');
await page.waitForTimeout(400);
check(await page.locator('[data-search-hit]', { hasText: 'Levinger' }).count() >= 1,
  'a job in this workspace is found');

// A near miss against ANOTHER workspace: "coen" should still find Cohen.
await page.fill('[data-search-window] input', 'coen');
await page.waitForTimeout(500);
const cohen = page.locator('[data-search-hit]', { hasText: 'Cohen' }).first();
check(await cohen.count() >= 1, 'a misspelt name still finds Cohen in Wolfson');
await page.screenshot({ path: `${SCRATCH}/searchtile-results.png` });

// Escape closes only the window.
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check(await page.locator('[data-search-window]').count() === 0, 'Escape closes the window');
check(await page.locator('[data-search-tile]').count() === 1, 'the board is still standing behind it');

// A foreign row travels there and opens the unit.
await tile.click();
await page.fill('[data-search-window] input', 'cohen');
await page.waitForTimeout(500);
await page.locator('[data-search-hit]', { hasText: 'Cohen' }).first().click();
await page.waitForTimeout(2500);
const proj = await page.evaluate(() => localStorage.getItem('active_project'));
check(proj === 'wolfson', 'a Wolfson row travels to Wolfson', proj);
check(await page.locator('.drawer-panel').count() > 0, 'and opens the job window there');
await page.screenshot({ path: `${SCRATCH}/searchtile-travel.png` });

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
