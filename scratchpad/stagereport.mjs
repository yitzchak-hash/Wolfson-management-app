// Stage discipline, end to end: the drawer's stage picker draws passed stages
// crossed off, a box click crosses one off by hand, a right-click marks it
// half done (glowing orange clock); the header grows the office's pending
// list; and on the worker's building map an apartment opens the step-by-step
// "I'm going to work here" flow (2026-09-15) — the stage it is AT makes an
// OPEN task for today, and the CLOSE asks what stage it is at now, runs the
// 3-picture closing screen, moves the unit there and crosses the stage off.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');
const files = n => Array.from({ length: n }, (_, i) => ({
  name: `site-${i + 1}.png`, mimeType: 'image/png', buffer: PNG,
}));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('wolfson_app_data')) return;
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [
      { id: 'S1', name: 'Ready to start', color: '#64748b', order: 1, active: true },
      { id: 'S2', name: 'Piping', color: '#3b82f6', order: 2, active: true },
      { id: 'S3', name: 'Concealed units', color: '#8b5cf6', order: 3, active: true },
      { id: 'S4', name: 'Wall units', color: '#f59e0b', order: 4, active: true },
    ],
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01',
      perms: { seeDiagrams: true, seeAllApartments: true } }],
    contractorAssignments: [],
    apartments: [{
      id: 'A1-7', buildingId: 'A1', floor: 3, apartmentNumber: '7',
      displayName: 'Artzi', isUnnamed: false, isDuplexApt: false,
      classification: 'standard', generalNotes: '', address: '3 Wolfson St',
      currentStageId: 'S2', stageDates: {},
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
  }));
});
const store = p => p.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')));
const marksOf = async p => (await store(p)).apartments.find(a => a.id === 'A1-7').stageMarks ?? {};

// ── 1 · THE OFFICE: the stage picker's boxes ────────────────────────────────
let page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/project`);
await page.waitForTimeout(2800);
await page.locator('[data-apt-id="A1-7"]').first().click();
await page.waitForTimeout(900);
await page.locator('[data-stage-picker]').click();
await page.waitForTimeout(400);
check(await page.locator('[data-stage-row]').count() === 4, 'the panel lists every stage');
const s1 = page.locator('[data-stage-row="S1"]');
check(await s1.locator('[data-stage-box][data-stage-state="done"]').count() === 1,
  'a stage the job moved PAST draws crossed off with a green check');
const s1Style = await s1.locator('span').nth(1).evaluate(el => getComputedStyle(el).textDecorationLine);
check(s1Style.includes('line-through'), 'and its name wears the strike line', s1Style);
check(await page.locator('[data-stage-row="S2"] [data-stage-box][data-stage-state="open"]').count() === 1,
  'the CURRENT stage is not crossed — only moving past it closes it');
// Cross Wall units off by hand — work done out of order.
await page.locator('[data-stage-row="S4"] [data-stage-box]').click();
await page.waitForTimeout(600);
let marks = await marksOf(page);
check(marks.S4 === 'done', 'a box press crosses a stage off by hand', JSON.stringify(marks));
// Right-click Concealed units — half done.
await page.locator('[data-stage-row="S3"] [data-stage-box]').click({ button: 'right' });
await page.waitForTimeout(600);
marks = await marksOf(page);
check(marks.S3 === 'pending', 'a RIGHT-click marks a stage half done', JSON.stringify(marks));
check(await page.locator('[data-stage-row="S3"] [data-stage-state="pending"]').count() === 1,
  'the glowing orange clock draws in the box');
await page.keyboard.press('Escape');   // closes the panel…
await page.waitForTimeout(300);
await page.keyboard.press('Escape');   // …then the drawer
await page.waitForTimeout(500);

// ── 2 · THE OFFICE: the pending list in the header ──────────────────────────
check(await page.locator('[data-pending-bell]').count() === 1
  && (await page.locator('[data-pending-bell]').innerText()).trim() === '1',
  'the header wears the orange clock with the pending count');
await page.locator('[data-pending-bell]').click();
await page.waitForTimeout(400);
const menuText = await page.locator('[data-pending-menu]').innerText();
check(menuText.includes('Artzi') && menuText.includes('Concealed units'),
  'the list names the apartment and the half-done stage', menuText.replace(/\n/g, ' · ').slice(0, 90));
await page.locator('[data-pending-row]').first().click();
await page.waitForTimeout(1200);
check(await page.locator('.drawer-panel').count() === 1
  && (await page.locator('.drawer-panel').innerText()).includes('Artzi'),
  'a row opens that apartment');
await page.close();

// ── 3 · THE WORKER: "I'm going to work here" → the stage it is AT → an OPEN task today
// (owner, 2026-09-15: the finish is decided at the CLOSE, never at the start)
page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/c/tok-jo`);
await page.waitForTimeout(2500);
await page.locator('button:has-text("Building Map")').first().click();
await page.waitForTimeout(900);
// The map opens on the project chooser when more than one workspace has buildings (the worker's-phone round).
if (await page.locator('[data-map-square="wolfson"]').count()) { await page.locator('[data-map-square="wolfson"]').click(); await page.waitForTimeout(1200); }
await page.locator('[data-apt-id="A1-7"]').first().click();
await page.waitForTimeout(700);
check(await page.locator('[data-work-sheet]').count() === 1
  && (await page.locator('[data-work-sheet]').innerText()).includes('Artzi'),
  'tapping an apartment opens its sheet');
check(await page.locator('[data-work-here]').count() === 1
  && /going to work here/i.test(await page.locator('[data-work-here]').innerText()),
  'with the big "I\'m going to work here" button');
await page.locator('[data-work-here]').click();
await page.waitForTimeout(400);
check(await page.locator('[data-work-stages] button').count() === 4,
  'What stage is it at? — every stage of the workspace, one per row');
check(await page.locator('[data-work-stage="S2"][data-current]').count() === 1,
  "the unit's own stage is marked as the one it is at now");
check(await page.locator('[data-finished-yes]').count() === 0 && await page.locator('[data-work-note]').count() === 0,
  'no "did you finish?" and no note at the START');
await page.locator('[data-work-stage="S2"]').click();
await page.waitForTimeout(900);
let d = await store(page);
const today = new Date(); today.setHours(0, 0, 0, 0);
const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const report = d.contractorAssignments.find(a => a.stageReport && a.stageId === 'S2');
check(!!report && !report.completedAt && report.dueDate === todayIso && report.contractorId === 'C-jo',
  'an OPEN stage-report task for TODAY was made on the unit', JSON.stringify({ due: report?.dueDate, done: report?.completedAt }));
check((d.apartments.find(a => a.id === 'A1-7').stageMarks ?? {}).S2 !== 'pending', 'nothing is marked half done by starting');
check(await page.locator('[data-work-sheet]').count() === 0 && await page.locator('[data-close-job]').count() === 1,
  'and the task sheet opened on it, with Close job ready for the end of the day');

// ── 4 · THE WORKER at the end of the day: close → "what stage is it at now?" → pictures → closed
await page.locator('[data-close-job]').first().click();
await page.waitForTimeout(500);
check(await page.locator('[data-closing-panel]').count() === 1, 'Close job opens the standing closing screen');
check(await page.locator('[data-close-stage]').count() === 1
  && await page.locator('[data-close-stage-pick="S2"][data-on]').count() === 1,
  'it asks what stage the unit is at NOW, the task\'s own stage picked');
await page.locator('[data-close-stage-pick="S3"]').click();
await page.waitForTimeout(200);
check(await page.locator('[data-close-stage-pick="S3"][data-on]').count() === 1, 'picking Concealed units lights it');
await page.locator('input[type="file"][accept*="video"][accept*=".zip"]').setInputFiles(files(3));
await page.waitForTimeout(2500);
await page.locator('[data-close-now]').click();
await page.waitForTimeout(1500);
d = await store(page);
marks = d.apartments.find(a => a.id === 'A1-7').stageMarks ?? {};
const doneReport = d.contractorAssignments.find(a => a.id === report.id);
check(!!doneReport?.completedAt && doneReport.stageWhenDone === 'S3', 'the task closed carrying the stage he named as when-done',
  JSON.stringify({ done: doneReport?.completedAt, to: doneReport?.stageWhenDone }));
check(d.apartments.find(a => a.id === 'A1-7').currentStageId === 'S3', 'and the unit MOVED to Concealed units');
check(marks.S2 === 'done', 'the stage he worked on is crossed off', JSON.stringify(marks));
await page.close();

// ── 5 · THE OFFICE again: the pending it marked itself still stands; the worker made none ──
page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/project`);
await page.waitForTimeout(2800);
check((await page.locator('[data-pending-bell]').innerText()).trim() === '1',
  "the office bell still counts its own half-done stage (the worker's start marks nothing)");

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
