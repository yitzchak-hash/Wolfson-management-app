// THE SET MODEL ("Bubbles, Not Stages", built 2026-09-22), end to end:
//   1 · the migration writes the old line out as marks (Ready to start is a
//       MARKER, the stage it stood on is TO DO, bubbles: true);
//   2 · the apartment window's stage board — fraction, groups, a tap walks a
//       stage on, a right-click marks it half done, × takes it off, "+ add a
//       stage" mints a custom stage for this apartment alone, and the
//       HEADLINE follows the marks (doing > half done > next to do);
//   3 · the buildings page cell draws the fraction and the strip;
//   4 · the worker's phone: "What are you doing here? select one or multiple"
//       at the start (marks DOING), then the close — did you finish
//       everything → which didn't you finish → three pictures for EACH
//       finished stage, tagged with it → finished ones done, the rest half
//       done, and the headline moves on by itself;
//   5 · a task form's pill shows every stage the task is for.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');
const files = n => Array.from({ length: n }, (_, i) => ({ name: `site-${i + 1}.png`, mimeType: 'image/png', buffer: PNG }));

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
      perms: { seeDiagrams: true, seeAllApartments: true, workHere: true } }],
    contractorAssignments: [],
    apartments: [{
      id: 'A1-7', buildingId: 'A1', floor: 3, apartmentNumber: '7',
      displayName: 'Artzi', isUnnamed: false, isDuplexApt: false,
      classification: 'standard', generalNotes: '', address: '3 Wolfson St',
      currentStageId: 'S3', stageDates: {},
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }, {
      id: 'A1-8', buildingId: 'A1', floor: 3, apartmentNumber: '8',
      displayName: 'Baruch', isUnnamed: false, isDuplexApt: false,
      classification: 'standard', generalNotes: '', address: '3 Wolfson St',
      currentStageId: 'S1', stageDates: {},
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
  }));
});
const store = p => p.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')));
const aptOf = async (p, id) => (await store(p)).apartments.find(a => a.id === id);

// ── 1 · THE MIGRATION ─────────────────────────────────────────────────────────
let page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/project`);
await page.waitForTimeout(3600);
let d = await store(page);
let a7 = d.apartments.find(a => a.id === 'A1-7');
check(a7.bubbles === true && a7.stageMarks?.S2 === 'done' && a7.stageMarks?.S3 === 'todo' && !a7.stageMarks?.S1,
  'A1-7 (stood at Concealed units) migrated: Piping done, Concealed units to do, the marker untouched, bubbles on', JSON.stringify(a7.stageMarks));
check(a7.currentStageId === 'S3', 'its headline is still Concealed units');
const s1 = d.stages.find(s => s.id === 'S1');
check(s1?.kind === 'marker' && d.stages.find(s => s.id === 'S2')?.kind === 'work', 'stage kinds seeded: Ready to start is a MARKER, Piping is WORK', JSON.stringify(d.stages.map(s => s.kind)));
const a8 = d.apartments.find(a => a.id === 'A1-8');
check(a8.bubbles === true && !a8.stageMarks && a8.currentStageId === 'S1', 'A1-8 (Ready to start) keeps its marker headline and no marks');

// ── 2 · THE STAGE BOARD ───────────────────────────────────────────────────────
check((await page.locator('[data-apt-id="A1-7"] [data-cell-fraction]').first().innerText()).trim() === '1/3',
  'the cell prints the fraction 1/3 (Piping done of Piping · Concealed · Wall units)');
check(await page.locator('[data-apt-id="A1-7"] [data-cell-strip] > span').count() === 3, 'and a three-segment strip');
await page.locator('[data-apt-id="A1-7"]').first().click();
await page.waitForTimeout(900);
check((await page.locator('[data-stage-fraction]').innerText()).trim() === '1/3', 'the field wears the fraction');
await page.locator('[data-stage-picker]').click();
await page.waitForTimeout(400);
check(await page.locator('[data-stage-group="todo"] [data-stage-bubble]').count() === 2
  && await page.locator('[data-stage-group="done"] [data-stage-bubble="S2"]').count() === 1,
  'the panel groups: two still to do, Piping done');
check(await page.locator('[data-stage-marker="S1"]').count() === 1 && await page.locator('[data-stage-bubble="S1"]').count() === 0,
  'the marker is offered as a whole-flat state, never as a bubble');
// a TAP walks Wall units on: to do → happening now
await page.locator('[data-stage-bubble="S4"]').click();
await page.waitForTimeout(600);
check(await page.locator('[data-stage-group="doing"] [data-stage-bubble="S4"]').count() === 1, 'a tap makes Wall units HAPPENING NOW');
a7 = await aptOf(page, 'A1-7');
check(a7.currentStageId === 'S4', 'and the headline follows the work happening now', a7.currentStageId);
// another tap: done
await page.locator('[data-stage-bubble="S4"]').click();
await page.waitForTimeout(600);
a7 = await aptOf(page, 'A1-7');
check(a7.stageMarks?.S4 === 'done' && a7.currentStageId === 'S3', 'a second tap finishes it and the headline falls back to the next to do', `${a7.currentStageId} ${JSON.stringify(a7.stageMarks)}`);
check((await page.locator('[data-stage-fraction]').innerText()).trim() === '2/3', 'fraction 2/3');
// right-click: half done
await page.locator('[data-stage-bubble="S3"]').click({ button: 'right' });
await page.waitForTimeout(600);
a7 = await aptOf(page, 'A1-7');
check(a7.stageMarks?.S3 === 'pending' && await page.locator('[data-stage-group="pending"] [data-stage-bubble="S3"]').count() === 1,
  'a right-click marks Concealed units HALF DONE');
check(await page.locator('[data-pending-bell]').count() === 1, 'the header wears the orange clock');
// × takes a stage off; the fraction shrinks; put back restores
await page.locator('[data-stage-bubble="S3"]').hover();
await page.locator('[data-stage-off="S3"]').click();
await page.waitForTimeout(600);
a7 = await aptOf(page, 'A1-7');
check(a7.stageMarks?.S3 === 'off' && (await page.locator('[data-stage-fraction]').innerText()).trim() === '2/2',
  '× takes it off this apartment and it stops counting (2/2)', JSON.stringify(a7.stageMarks));
await page.locator('[data-stage-putback="S3"]').click();
await page.waitForTimeout(600);
a7 = await aptOf(page, 'A1-7');
check(a7.stageMarks?.S3 === 'todo' && (await page.locator('[data-stage-fraction]').innerText()).trim() === '2/3', 'put back: it counts again');
// + add a stage → a custom one for this apartment only
await page.locator('[data-stage-add]').click();
await page.waitForTimeout(200);
check((await page.locator('[data-stage-add-panel]').innerText()).includes('already on this apartment'),
  'nothing left in the list to add (the whole list is on it) — so a NEW stage is offered');
await page.locator('[data-stage-custom-start]').click();
await page.locator('[data-stage-custom-name]').fill('Extra drainage');
await page.locator('[data-stage-custom-add]').click();
await page.waitForTimeout(700);
d = await store(page);
const custom = d.stages.find(s => s.name === 'Extra drainage');
check(!!custom && custom.custom === true && JSON.stringify(custom.onApartments) === JSON.stringify(['A1-7']),
  'the custom stage lives in the workspace list, flagged, on A1-7 alone', JSON.stringify(custom));
check(await page.locator(`[data-stage-group="todo"] [data-stage-bubble="${custom?.id}"]`).count() === 1
  && (await page.locator('[data-stage-fraction]').innerText()).trim() === '2/4',
  'it shows under Still to do and the fraction is 2/4');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
// the OTHER apartment does not carry it
await page.locator('[data-apt-id="A1-8"]').first().click();
await page.waitForTimeout(900);
check((await page.locator('[data-stage-fraction]').innerText()).trim() === '0/3', 'A1-8 carries the three ordinary stages only (0/3) — the custom one is hidden from it');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
check((await page.locator('[data-apt-id="A1-7"] [data-cell-fraction]').first().innerText()).trim() === '2/4', 'the cell agrees: 2/4');
await page.close();

// ── 4 · THE WORKER ────────────────────────────────────────────────────────────
page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/c/tok-jo`);
await page.waitForTimeout(2500);
await page.locator('button:has-text("Building Map")').first().click();
await page.waitForTimeout(900);
if (await page.locator('[data-map-square="wolfson"]').count()) { await page.locator('[data-map-square="wolfson"]').click(); await page.waitForTimeout(1200); }
await page.locator('[data-apt-id="A1-7"]').first().click();
await page.waitForTimeout(800);
await page.locator('[data-work-here]').click();
await page.waitForTimeout(600);
check(await page.locator('[data-work-pick]').count() === 1
  && /select one or multiple/i.test(await page.locator('[data-work-pick]').innerText()),
  '"What are you doing here?" with the owner\'s words: select one or multiple');
check(await page.locator('[data-work-stage]').count() === 2
  && await page.locator('[data-work-stage="S3"]').count() === 1 && await page.locator(`[data-work-stage="${custom.id}"]`).count() === 1,
  'only the OPEN stages of this apartment are offered (Concealed units + Extra drainage; Piping and Wall units are done)',
  String(await page.locator('[data-work-stage]').count()));
check(await page.locator('[data-work-start]').isDisabled(), 'Start waits for a pick');
await page.locator('[data-work-stage="S3"]').click();
await page.locator(`[data-work-stage="${custom.id}"]`).click();
await page.locator('[data-work-start]').click();
await page.waitForTimeout(1200);
d = await store(page);
const report = d.contractorAssignments.find(a => a.stageReport && a.apartmentId === 'A1-7');
check(!!report && !report.completedAt && JSON.stringify(report.stageIds) === JSON.stringify(['S3', custom.id]) && report.stageId === 'S3',
  'one OPEN report task for today carrying both stages', JSON.stringify({ ids: report?.stageIds, first: report?.stageId }));
a7 = d.apartments.find(a => a.id === 'A1-7');
check(a7.stageMarks?.S3 === 'doing' && a7.stageMarks?.[custom.id] === 'doing' && a7.currentStageId === 'S3',
  'both are HAPPENING NOW on the apartment and the headline is the first of them', JSON.stringify(a7.stageMarks));
check(await page.locator('[data-close-job]').count() === 1, 'the task sheet opened with Close job');

// the close: did you finish everything? → No → which didn't you finish → pictures per finished stage
await page.locator('[data-close-job]').first().click();
await page.waitForTimeout(600);
check(await page.locator('[data-close-stage]').count() === 1 && /finish everything you started/i.test(await page.locator('[data-close-stage]').innerText()),
  'the close asks "Did you finish everything you started?"');
check(await page.locator('[data-close-now]').isDisabled(), 'Send waits for the answer');
await page.locator('[data-close-finished-pick="no"]').click();
await page.waitForTimeout(300);
check(await page.locator('[data-close-unfinished-pick]').count() === 2, '"Which didn\'t you finish?" lists only the two he started');
await page.locator(`[data-close-unfinished-pick="${custom.id}"]`).click();
await page.locator('[data-close-carry-on]').click();
await page.waitForTimeout(400);
check(await page.locator('[data-close-photo-step="S3"]').count() === 1 && /stage 1 of 1/i.test(await page.locator('[data-close-photo-step="S3"]').innerText()),
  'a picture step for Concealed units — the one he finished — and none for Extra drainage');
check((await page.locator('[data-close-count]').innerText()).trim() === '0/3' && await page.locator('[data-close-now]').isDisabled(), '0/3, Send locked');
await page.locator('input[type="file"][accept*="video"][accept*=".zip"]').setInputFiles(files(3));
await page.waitForTimeout(2500);
check((await page.locator('[data-close-count]').innerText()).trim() === '3/3', '3/3 after three pictures');
check(!(await page.locator('[data-close-now]').isDisabled()), 'Send unlocks');
d = await store(page);
const tagged = d.contractorPhotos.filter(p => p.assignmentId === report.id && p.stageId === 'S3').length;
check(tagged === 3, 'the three pictures are tagged with the stage they show', String(tagged));
await page.locator('[data-close-now]').click();
await page.waitForTimeout(1800);
d = await store(page);
const done = d.contractorAssignments.find(a => a.id === report.id);
check(!!done?.completedAt && JSON.stringify(done.stagesUnfinished) === JSON.stringify([custom.id]) && done.stagesFinished === false,
  'the task closed with what he did not finish recorded', JSON.stringify({ done: !!done?.completedAt, un: done?.stagesUnfinished }));
a7 = d.apartments.find(a => a.id === 'A1-7');
check(a7.stageMarks?.S3 === 'done' && a7.stageMarks?.[custom.id] === 'pending',
  'Concealed units is DONE, Extra drainage is HALF DONE', JSON.stringify(a7.stageMarks));
check(a7.currentStageId === custom.id, 'and the headline moved on by itself — to the half-done stage', a7.currentStageId);
await page.close();

// ── 5 · THE OFFICE, after: the pill on the task, the office clears half done ───
page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/project`);
await page.waitForTimeout(2800);
check((await page.locator('[data-apt-id="A1-7"] [data-cell-fraction]').first().innerText()).trim() === '3/4', 'the cell reads 3/4');
await page.locator('[data-apt-id="A1-7"]').first().click();
await page.waitForTimeout(900);
await page.locator('.drawer-panel button:has-text("Tasks")').first().click();
await page.waitForTimeout(500);
const pill = await page.locator('[data-stage-pill]').first().innerText();
check(pill.includes('Concealed units') && pill.includes('Extra drainage'), 'the task row names both stages it was for', pill);
await page.locator('.drawer-panel button:has-text("Details")').first().click();
await page.waitForTimeout(400);
await page.locator('[data-stage-picker]').click();
await page.waitForTimeout(400);
check(await page.locator(`[data-stage-group="pending"] [data-stage-bubble="${custom.id}"]`).count() === 1, 'the office sees Extra drainage half done');
await page.locator(`[data-stage-bubble="${custom.id}"]`).click();
await page.waitForTimeout(600);
a7 = await aptOf(page, 'A1-7');
check(a7.stageMarks?.[custom.id] === 'done' && (await page.locator('[data-stage-fraction]').innerText()).trim() === '4/4',
  'one office tap finishes it — 4/4', JSON.stringify(a7.stageMarks));
check(a7.currentStageId === custom.id, 'everything done and no closing marker: the headline is the last stage done — never Ready to start', a7.currentStageId);
await page.close();

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
