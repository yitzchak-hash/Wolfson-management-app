// THE TV OPENS THE REAL JOB WINDOW (owner ruling, 2026-08-30): tapping a job
// anywhere on the wall — a tile, a diagram cell, a notebook card, a widget
// row, the overdue pill's list — opens the same ApartmentDetailDrawer a PC
// shows, over the wall. The old wall-only job screen is deleted. A card whose
// job lives in ANOTHER workspace switches the wall's view there and opens.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    apartments: [{ id: 'A1-7', buildingId: 'A1', floor: 3, apartmentNumber: '7',
      displayName: 'Artzi', isUnnamed: false, isDuplexApt: false, classification: 'standard',
      generalNotes: '', address: '3 Wolfson St', currentStageId: null, stageDates: {},
      createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    stages: [], contractorAssignments: [],
  }));
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: null,
    users: [{ id: 'U-a', name: 'Esther', code: '123456', role: 'admin', active: true, createdAt: '2026-01-01' }],
    stages: [{ id: 'S-1', name: 'Piping', color: '#4aa8d8', order: 1, active: true, projectId: 'general' }],
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }],
    contractorAssignments: [],
    apartments: [
      { id: 'G-1', buildingId: 'G', apartmentNumber: '', floor: 0, isUnnamed: false,
        displayName: 'Ben-Ami', classification: 'standard', isDuplexApt: false,
        currentStageId: 'S-1', canvasX: 60, canvasY: 60, address: 'Herzl 12',
        createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    ],
    canvasElements: [{ id: 'CE-rota', type: 'widget', widget: 'rota',
      x: 320, y: 60, w: 1050, h: 380, text: '', color: '#ffffff',
      data: { people: ['c:C-jo'], firstWeek: '2026-08-23', weekCount: 1, span: 5,
        cells: { 'c:C-jo|2026-08-24': [{ id: 'E-1', jobId: 'A1-7', projectId: 'wolfson' }] } } }],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });

// ── a tile opens the REAL drawer ───────────────────────────────────────────
await page.goto(`${APP}/tv?view=general`);
await page.waitForTimeout(3500);
await page.locator('button', { hasText: 'Ben-Ami' }).first().click();
await page.waitForTimeout(1200);
check(await page.locator('.drawer-panel').count() === 1,
  'tapping a tile opens the REAL job window (.drawer-panel)');
check(await page.evaluate(() => document.body.textContent.includes('Herzl 12')),
  'showing the live record');
check(!(await page.evaluate(() => document.body.textContent.includes('Back to board'))),
  'the old wall job screen is gone');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
check(await page.locator('.drawer-panel').count() === 0, 'Escape closes it');

// ── a FOREIGN notebook card switches the wall and opens the unit ───────────
const card = page.locator('.planner-card').first();
check((await card.innerText()).includes('Artzi'), 'the Wolfson card resolves on the wall notebook');
await card.click();
await page.waitForTimeout(3500);
check((await page.evaluate(() => localStorage.getItem('active_project'))) === 'wolfson',
  'tapping it switches the wall to the unit\'s workspace');
// The address lives in an INPUT's value — textContent never carries it, so
// assert on the drawer's own heading instead.
check(await page.locator('.drawer-panel').count() === 1
  && (await page.locator('.drawer-panel').first().innerText()).includes('Artzi'),
  'and opens the REAL window on the unit');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

// ── the bar is still alive after all of it ─────────────────────────────────
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('Dashboard'))?.click();
});
await page.waitForTimeout(1500);
check((await page.evaluate(() => location.search)).includes('view=dashboard'),
  'the Dashboard bar button still works after opening jobs');

console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
await b.close();
process.exit(fails ? 1 : 0);
