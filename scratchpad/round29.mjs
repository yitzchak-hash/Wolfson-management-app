// Round 29: a foreign job clicked on the weekly notebook PEEKS instead of
// carrying you to its workspace; the browser's Back button returns to the
// workspace you were actually looking at (and Forward comes back); and the
// notebook's add-a-week plus is always visible — including the bottom week's,
// which adds a week in the FUTURE.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  // The OTHER workspace's snapshot — what the peek and the planner's foreign
  // entries read, since only the open workspace is live.
  if (!localStorage.getItem('wolfson_app_data')) {
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      apartments: [{
        id: 'A1-7', buildingId: 'A1', floor: 3, apartmentNumber: '7',
        displayName: 'Artzi', isUnnamed: false, isDuplexApt: false,
        classification: 'standard', generalNotes: '', address: '3 Wolfson St',
        currentStageId: null, stageDates: {},
        createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
      }],
      stages: [], contractorAssignments: [],
    }));
  }
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [],
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }],
    contractorAssignments: [],
    apartments: [],
    canvasElements: [{
      id: 'CE-rota', type: 'widget', widget: 'rota', x: 60, y: 420, w: 1050, h: 380,
      text: '', color: '#ffffff',
      data: {
        people: ['c:C-jo'], firstWeek: '2026-08-23', weekCount: 1, span: 5,
        cells: {
          // A card whose job lives in WOLFSON, sitting on Joseph's Monday.
          'c:C-jo|2026-08-24': [{ id: 'E-1', jobId: 'A1-7', projectId: 'wolfson' }],
        },
      },
    }],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3000);
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));
const pid = () => page.evaluate(() => localStorage.getItem('active_project'));

// ── 1 · a foreign card on the notebook PEEKS — you stay on the board ────────
const card = page.locator('[data-node-id="CE-rota"] .planner-card').first();
check((await card.innerText()).includes('Artzi'), 'the Wolfson card resolves on the notebook');
await card.click();
await page.waitForTimeout(2800);
// OWNER REVERSAL (2026-08-26): the peek is gone — the click IS the journey:
// it switches to the unit's workspace and opens the full apartment window.
check((await pid()) === 'wolfson', 'clicking it travels to the unit\'s workspace', await pid());
check(page.url().includes('/project'), 'and lands on the building page');
check(await page.evaluate(() =>
  document.querySelectorAll('.drawer-panel').length > 0 && !document.querySelector('[data-unit-peek]')),
  'the FULL drawer is open — no peek window');
check(await page.evaluate(() => document.body.innerText.includes('Artzi')),
  'showing the unit itself');
// Closing the drawer redeems the RETURN TICKET (the touch round's
// unitTravel): the app itself carries you back to where you were standing —
// no header walk needed any more.
await page.keyboard.press('Escape');
await page.waitForTimeout(2200);
check((await pid()) === 'general' && page.url().includes('/jobs'),
  'closing the drawer redeems the return ticket back to the board', `${await pid()} ${page.url()}`);

// ── 2 · the browser back button returns to the workspace you SAW ────────────
// Switch to Wolfson the way a person does — through the real header dropdown.
await page.locator('header button', { hasText: /Job Board/ }).first().click();
await page.waitForTimeout(500);
await page.getByRole('menu').getByText(/Wolfson/).first().click();
await page.waitForTimeout(2200);
check((await pid()) === 'wolfson' && page.url().includes('/project'),
  'the header switch lands in Wolfson', `${await pid()} ${page.url()}`);
await page.goBack();
await page.waitForTimeout(2200);
check((await pid()) === 'general', 'BACK restores the Job Board workspace', await pid());
check(page.url().includes('/jobs'), 'and the board route', page.url());
check(await page.locator('[data-node-id="CE-rota"]').count() === 1,
  'the notebook is really on screen again');
await page.goForward();
await page.waitForTimeout(2200);
check((await pid()) === 'wolfson' && page.url().includes('/project'),
  'FORWARD returns to Wolfson', `${await pid()} ${page.url()}`);
// And back again for part 3.
await page.goBack();
await page.waitForTimeout(2200);

// ── 3 · the add-a-week plus is always visible; the bottom one adds the FUTURE ─
const labels = page.locator('[data-node-id="CE-rota"] .group\\/wk');
const plusVis = await page.evaluate(() => {
  const wk = document.querySelector('[data-node-id="CE-rota"] .group\\/wk');
  if (!wk) return null;
  const btn = [...wk.querySelectorAll('button')].find(x =>
    (x.getAttribute('title') || '').includes('Add the week after'));
  if (!btn) return { found: false };
  const span = btn.parentElement;
  return { found: true, opacity: getComputedStyle(span).opacity };
});
check(!!plusVis?.found && plusVis.opacity === '1',
  'the add-a-week plus is visible WITHOUT hovering', JSON.stringify(plusVis));
await page.evaluate(() => {
  const wk = document.querySelector('[data-node-id="CE-rota"] .group\\/wk');
  const btn = [...wk.querySelectorAll('button')].find(x =>
    (x.getAttribute('title') || '').includes('Add the week after'));
  btn.click();
});
await page.waitForTimeout(800);
let d = await data();
let rota = d.canvasElements.find(e => e.id === 'CE-rota');
check(rota.data.weekCount === 2, 'pressing it adds a week in the future',
  `weekCount ${rota.data.weekCount}`);
const weekHeads = await page.locator('[data-node-id="CE-rota"] .group\\/wk').count();
check(weekHeads === 2, 'and the new week draws under the old one', String(weekHeads));

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
