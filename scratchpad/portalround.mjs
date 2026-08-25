// The portal round, on a phone: All leads the filter row; the calendar is
// two big bubbles (Weekly first — a day-list of the week — Monthly the
// grid); the task sheet's picture prompt is a Close job button opening the
// closing screen ("add at least 3 pictures", the count, the note row) whose
// final press really closes; the planner sheet scrolls sideways instead of
// smushing; and the Contractors settings row grows the building-diagrams
// quick toggle that writes the two permission switches.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

// A real 1×1 PNG, three times over — the closing rule wants three pictures.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');
const files = n => Array.from({ length: n }, (_, i) => ({
  name: `site-${i + 1}.png`, mimeType: 'image/png', buffer: PNG,
}));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [],
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01',
      perms: { seeSchedule: true, seePlanner: true } }],
    contractorAssignments: [{
      id: 'T-1', contractorId: 'C-jo', apartmentId: 'G-cohen', buildingId: 'G',
      taskDescription: 'Hang the unit', stageId: null, dueDate: '2026-08-24',
      priority: 'normal', completedAt: null, createdAt: '2026-08-01', createdBy: 'A', createdByName: 'A',
    }],
    apartments: [{
      id: 'G-cohen', buildingId: 'G', floor: 0, apartmentNumber: '',
      displayName: 'Cohen', isUnnamed: false, isDuplexApt: false,
      classification: 'standard', generalNotes: '', address: '14 Sokolov St, Holon',
      currentStageId: null, stageDates: {}, canvasX: 100, canvasY: 100,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [{
      id: 'CE-rota', type: 'widget', widget: 'rota', x: 60, y: 420, w: 1050, h: 380,
      text: '', color: '#ffffff',
      data: { people: ['c:C-jo'], firstWeek: '2026-08-23', weekCount: 1, span: 5, cells: {} },
    }],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/c/tok-jo`);
await page.waitForTimeout(2500);
const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));

// ── 1 · All leads the filter row ────────────────────────────────────────────
const firstPill = await page.locator('main').locator('button').filter({ hasText: /^(All|הכול|הכל)$/ }).first();
const pills = await page.evaluate(() => {
  const bar = [...document.querySelectorAll('button')].filter(x =>
    ['All', 'Yesterday', 'Today', 'Tomorrow'].includes(x.textContent.trim()));
  return bar.map(x => x.textContent.trim());
});
check(pills[0] === 'All', 'All is the FIRST filter bubble', JSON.stringify(pills));

// ── 2 · the calendar bubbles: Weekly first, Monthly the grid ────────────────
await page.locator('button:has-text("Calendar")').first().click();
await page.waitForTimeout(600);
check(await page.locator('[data-cal-mode="week"]').count() === 1
  && await page.locator('[data-cal-mode="month"]').count() === 1,
  'two big bubbles: Weekly and Monthly');
check(await page.locator('[data-cal-week]').count() === 1, 'Weekly is the one it opens on');
const weekText = await page.locator('[data-cal-week]').innerText();
check(weekText.includes('Hang the unit'), 'the task sits on its day in the week list');
await page.locator('[data-cal-mode="month"]').click();
await page.waitForTimeout(400);
check(await page.locator('[data-cal-week]').count() === 0,
  'Monthly switches to the month grid');

// ── 3 · the Close job flow ──────────────────────────────────────────────────
await page.locator('button:has-text("My Tasks")').first().click();
await page.waitForTimeout(400);
// The default filter is Today and the seeded task's date is FIXED — the
// container clock walks on, so show All before reaching for the card.
await page.locator('button', { hasText: /^All$/ }).first().click();
await page.waitForTimeout(400);
await page.locator('button:has-text("Hang the unit")').first().click();
await page.waitForTimeout(600);
check(await page.locator('button:has-text("Mark as Complete")').count() === 0,
  'the old Mark-as-Complete button is gone');
check(await page.locator('[data-close-job]').count() >= 1,
  'the picture prompt became a Close job button');
await page.locator('[data-close-job]').last().click();
await page.waitForTimeout(400);
check(await page.locator('[data-closing-panel]').count() === 1
  && (await page.locator('[data-closing-panel]').innerText()).includes('at least 3 pictures'),
  'Close job opens the closing screen asking for 3 pictures');
check(await page.locator('[data-close-now]').isDisabled(),
  'the final press is locked until the pictures are in');
check((await page.locator('[data-close-count]').innerText()).trim() === '0/3',
  'the count reads 0/3');
// The media input is the one that also takes video.
await page.locator('input[type="file"][accept*="video"]').setInputFiles(files(3));
await page.waitForTimeout(2500);
check((await page.locator('[data-close-count]').innerText()).trim() === '3/3',
  'three pictures in — the count follows', await page.locator('[data-close-count]').innerText());
check(!(await page.locator('[data-close-now]').isDisabled()), 'and the final press unlocks');
await page.locator('[data-close-now]').click();
await page.waitForTimeout(900);
let d = await store();
check(!!d.contractorAssignments[0].completedAt, 'the final press really closes the task');
check(await page.locator('[data-closing-panel]').count() === 0
  && (await page.evaluate(() => document.body.innerText.includes('(3)'))),
  'after closing, the sheet shows the three photos as before');

// ── 4 · the planner sheet scrolls sideways instead of smushing ──────────────
// The finish celebration (the WhatsApp report, z-220) covers the page until
// tapped away — dismiss it the way a worker does.
await page.mouse.click(12, 420);
await page.waitForTimeout(400);
// The sheet closes by a tap on its backdrop, the way a thumb does.
await page.mouse.click(195, 50);
await page.waitForTimeout(500);
await page.locator('button:has-text("Planner")').first().click();
await page.waitForTimeout(600);
const plannerFit = await page.evaluate(() => {
  const box = [...document.querySelectorAll('div')].find(x =>
    String(x.className).includes('overflow-x-auto') && x.querySelector('.planner-scroll'));
  if (!box) return null;
  return { boxW: box.clientWidth, innerW: box.scrollWidth };
});
check(!!plannerFit && plannerFit.innerW >= 620 && plannerFit.boxW < 420,
  'the week keeps its width and scrolls — no smush at 390px', JSON.stringify(plannerFit));

// ── 5 · the Contractors settings row: the building-diagrams toggle ──────────
const admin = await ctx.newPage();
await admin.setViewportSize({ width: 1440, height: 900 });
await admin.goto(`${APP}/app-settings`);
await admin.waitForTimeout(2000);
// The tab says WORKERS — the standing words-only rename.
await admin.locator('button:has-text("Workers")').first().click();
await admin.waitForTimeout(600);
const tog = admin.locator('[data-diagrams-toggle]');
check(await tog.count() === 1, 'each worker row carries the building-diagrams toggle');
check((await tog.innerText()).includes('own units only'), 'off by default: own units only');
await tog.click();
await admin.waitForTimeout(700);
check((await tog.innerText()).includes('building diagrams'), 'one press turns the full diagrams on');
d = await store();
const jo = d.contractors.find(c => c.id === 'C-jo');
check(!!jo.perms?.seeDiagrams && !!jo.perms?.seeAllApartments,
  'and it wrote the two permission switches', JSON.stringify(jo.perms));

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
