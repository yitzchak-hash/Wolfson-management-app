// Stage discipline, end to end: the drawer's stage picker draws passed stages
// crossed off, a box click crosses one off by hand, a right-click marks it
// half done (glowing orange clock); the header grows the office's pending
// list; and on the worker's building map an apartment opens the step-by-step
// "I did work here" flow — not-finished files a note and marks the stage
// pending, finished runs the 3-picture closing screen and marks it done.
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

// ── 3 · THE WORKER: not finished → a note, and the stage goes pending ───────
page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/c/tok-jo`);
await page.waitForTimeout(2500);
await page.locator('button:has-text("Building Map")').first().click();
await page.waitForTimeout(900);
await page.locator('[data-apt-id="A1-7"]').first().click();
await page.waitForTimeout(700);
check(await page.locator('[data-work-sheet]').count() === 1
  && (await page.locator('[data-work-sheet]').innerText()).includes('Artzi'),
  'tapping an apartment opens its sheet');
check(await page.locator('[data-work-here]').count() === 1, 'with the big I-did-work-here button');
await page.locator('[data-work-here]').click();
await page.waitForTimeout(400);
check(await page.locator('[data-work-stages] button').count() === 4,
  'What did you do? — the workspace stages, one per row');
await page.locator('[data-work-stages] button:has-text("Piping")').click();
await page.waitForTimeout(400);
check(await page.locator('[data-finished-yes]').count() === 1
  && await page.locator('[data-finished-no]').count() === 1,
  'Did you finish this stage? — yes or no');
await page.locator('[data-finished-no]').click();
await page.waitForTimeout(400);
await page.locator('[data-work-note] textarea').fill('Two bedrooms still open');
await page.locator('[data-work-send]').click();
await page.waitForTimeout(900);
let d = await store(page);
marks = d.apartments.find(a => a.id === 'A1-7').stageMarks ?? {};
check(marks.S2 === 'pending', 'not-finished marks the stage half done', JSON.stringify(marks));
const report = d.contractorAssignments.find(a => a.stageReport && a.stageId === 'S2');
check(!!report && !report.completedAt, 'an OPEN stage-report task carries it', report?.taskDescription);
check((d.contractorNotes ?? []).some(n => n.assignmentId === report?.id && n.text === 'Two bedrooms still open'),
  "and the worker's note of what is left hangs under the task");

// ── 4 · THE WORKER: finished → pictures, close, and the stage goes done ─────
await page.locator('[data-apt-id="A1-7"]').first().click();
await page.waitForTimeout(700);
await page.locator('[data-work-here]').click();
await page.waitForTimeout(400);
await page.locator('[data-work-stages] button:has-text("Ready to start")').click();
await page.waitForTimeout(400);
await page.locator('[data-finished-yes]').click();
await page.waitForTimeout(900);
check(await page.locator('[data-closing-panel]').count() === 1,
  'finished hands over to the standing closing screen (3 pictures)');
await page.locator('input[type="file"][accept*="video"]').setInputFiles(files(3));
await page.waitForTimeout(2500);
await page.locator('[data-close-now]').click();
await page.waitForTimeout(1200);
d = await store(page);
marks = d.apartments.find(a => a.id === 'A1-7').stageMarks ?? {};
check(marks.S1 === 'done', 'closing the report marks the stage DONE on the apartment', JSON.stringify(marks));
const doneReport = d.contractorAssignments.find(a => a.stageReport && a.stageId === 'S1');
check(!!doneReport?.completedAt, 'and the report task itself is closed');
await page.close();

// ── 5 · THE OFFICE again: both pendings on the list, notes and all ──────────
page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/project`);
await page.waitForTimeout(2800);
check((await page.locator('[data-pending-bell]').innerText()).trim() === '2',
  'the office bell now counts both half-done stages');
await page.locator('[data-pending-bell]').click();
await page.waitForTimeout(400);
const menu2 = await page.locator('[data-pending-menu]').innerText();
check(menu2.includes('Piping') && menu2.includes('Two bedrooms still open'),
  "the worker's report is on the list, note and all", menu2.replace(/\n/g, ' · ').slice(0, 110));

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
