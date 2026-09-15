// Multi-day tasks, end to end, on the container clock of Mon 2026-08-24:
// drop a job on the notebook's Wednesday → the add-a-job dialog (the stage
// pair, one text box, days with the Friday checkbox and the green readout) →
// ONE task drawn as a bar across its days, no stored per-day cards
// (2026-09-15: tasks are drawn from the tasks) → dragging the bar moves the
// whole task, working-day pattern kept → the worker's portal shows every
// day, matches Today on any of them, and closing early asks in big words →
// yes crosses the days off (a struck bar saying "finished early") and moves
// the job to the when-done stage.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'S-done', name: 'Drywall done', color: '#3b82f6', order: 1, active: true, projectId: 'general' }],
    contractors: [{
      id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true,
      photosOptional: true, createdAt: '2026-01-01',
    }],
    contractorAssignments: [],
    apartments: [{
      id: 'G-cohen', buildingId: 'G', floor: 0, apartmentNumber: '',
      displayName: 'Cohen', isUnnamed: false, isDuplexApt: false,
      classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 620, canvasY: 190,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }, {
      id: 'G-levi', buildingId: 'G', floor: 0, apartmentNumber: '',
      displayName: 'Levi', isUnnamed: false, isDuplexApt: false,
      classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 900, canvasY: 190,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [{
      id: 'CE-rota', type: 'widget', widget: 'rota', x: 60, y: 420, w: 1050, h: 380,
      text: '', color: '#ffffff',
      data: { people: ['c:C-jo'], firstWeek: '2026-08-23', weekCount: 2, span: 5, askOnDrop: '1', cells: {} },
    }],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3200);

const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));
const cellCentre = (i) => page.evaluate(i => {
  const cell = document.querySelectorAll('[data-node-id="CE-rota"] .group\\/cell')[i];
  const r = cell.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, i);
const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
};

// ── 1 · drop the tile on Joseph's WEDNESDAY (three days will pass a Friday) ─
const tile = await page.locator('[data-node-id="G-cohen"]').boundingBox();
await drag({ x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 }, await cellCentre(3));
await page.waitForTimeout(600);
const dialog = page.locator('[data-task-dialog]');
check(await dialog.count() === 1, 'the add-a-job dialog opens on the drop');
const dlgHead = await page.locator('.fixed.z-\\[171\\]').innerText();
check(/Cohen/.test(dlgHead) && /Joseph/.test(dlgHead), 'it names the job and the row it landed on', dlgHead.slice(0, 80));
check(await page.locator('[data-task-dialog] [data-stage-from]').count() === 1
  && await page.locator('[data-task-dialog] [data-stage-to]').count() === 1,
  'it asks which stage the task is ON and where the job moves when done');

// ── 2 · fill it: when-done stage, the one text box, three days ──────────────
await page.locator('[data-task-dialog] [data-stage-to]').selectOption('S-done');
await page.fill('[data-task-dialog] textarea', 'Close the ceiling in both bedrooms');
await page.locator('[data-task-dialog] button[aria-label="One day more"]').first().click();
await page.locator('[data-task-dialog] button[aria-label="One day more"]').first().click();
await page.waitForTimeout(200);
check(await page.locator('[data-task-dialog] >> text=Include Friday?').count() === 1,
  'three days from Wednesday pass a Friday — the checkbox appears, off');
// Locale-formatted ("Sun, Aug 30" here) — assert the substance, not the commas.
const readout = await page.locator('[data-task-dialog] [data-day-readout]').innerText();
check(/Sun\b.*30/.test(readout) && !/Fri/.test(readout) && !/29/.test(readout)
  && readout.includes('3 days'),
  'the green line reads Wed, Thu, Sunday — Friday and Saturday skipped', readout);
await page.locator('[data-add-the-job]').click();
await page.waitForTimeout(900);

let d = await data();
let task = d.contractorAssignments[0];
check(!!task && JSON.stringify(task.days) === JSON.stringify(['2026-08-26', '2026-08-27', '2026-08-30'])
  && task.dueDate === '2026-08-30' && task.stageWhenDone === 'S-done',
  'the task carries ALL its days, due on the last, with the when-done stage',
  JSON.stringify({ days: task?.days, due: task?.dueDate, when: task?.stageWhenDone }));
const cells1 = d.canvasElements.find(e => e.id === 'CE-rota').data.cells ?? {};
check(Object.values(cells1).flat().length === 0, 'and NO card was written into the notebook — the task draws itself',
  JSON.stringify(cells1));
check(d.apartments.find(a => a.id === 'G-cohen').currentStageId === null, 'the job did not move (the task is ON a stage, it never moves the job)');
const bars = page.locator(`[data-task-bar="${task.id}"]`);
check(await bars.count() === 2, 'drawn as two stretches: Wed–Thu, then Sunday of the next week', String(await bars.count()));
check(await bars.first().getAttribute('data-bar-days') === '2', 'the first bar spans its two days');
check(await page.locator('[data-day-pill]').count() === 0, 'no "day k of n" pills — one bar says it all');

// ── 3 · drag the bar to Monday: the WHOLE task moves, pattern kept ──────────
const midOf = r => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const rotaCells = () => data().then(x => x.canvasElements.find(e => e.id === 'CE-rota').data.cells ?? {});
const firstBar = await bars.first().boundingBox();
await drag({ x: firstBar.x + firstBar.width / 4, y: firstBar.y + firstBar.height / 2 }, await cellCentre(1));
await page.waitForTimeout(800);
d = await data();
task = d.contractorAssignments[0];
check(JSON.stringify(task.days) === JSON.stringify(['2026-08-24', '2026-08-25', '2026-08-26'])
  && task.dueDate === '2026-08-26',
  'Move: Wed, Thu, Sun becomes Mon, Tue, Wed — three working days from the drop', JSON.stringify(task.days));
check(Object.values(await rotaCells()).flat().length === 0, 'still no stored cards');
check(await page.locator(`[data-task-bar="${task.id}"]`).count() === 1
  && await page.locator(`[data-task-bar="${task.id}"]`).getAttribute('data-bar-days') === '3',
  'one bar across the three days now');

// ── 3½ · Non-consecutive: the checkbox opens a second stretch ───────────────
const levi = await page.locator('[data-node-id="G-levi"]').boundingBox();
await drag({ x: levi.x + levi.width / 2, y: levi.y + levi.height / 2 }, await cellCentre(0));
await page.waitForTimeout(600);
await page.click('[data-task-dialog] >> text=Non-consecutive — work it in separate stretches');
await page.waitForTimeout(200);
check(await page.locator('[data-task-dialog] input[type="date"]').count() === 2
  && await page.locator('[data-task-dialog] >> text=And again from').count() === 1,
  'ticking Non-consecutive opens a second stretch with its own start and count');
const readout2 = await page.locator('[data-task-dialog] [data-day-readout]').innerText();
check(readout2.includes('2 days'), 'the green line reads both stretches together', readout2);
check(await page.locator('[data-task-dialog] [data-different-stages]').count() === 1,
  'and offers "different stages" for the second stretch');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// ── 4 · the worker's portal: every day shown, Today matches, finish early ───
await page.goto(`${APP}/c/tok-jo`);
await page.waitForTimeout(2500);
// The default filter is Today, and the harness's task days are FIXED dates in
// the week of 2026-08-23 — the container clock walks on, so show All first.
await page.locator('button', { hasText: /^All$/ }).first().click();
await page.waitForTimeout(400);
const cardText = await page.locator('button:has-text("Close the ceiling")').first().innerText();
check(cardText.includes('Mon 24 Aug') && cardText.includes('Tue 25 Aug') && cardText.includes('Wed 26 Aug'),
  'the worker sees EVERY day on the task card', cardText.replace(/\n/g, ' · ').slice(0, 120));
// The badge counts to the NEXT covered day, so what it says depends on the
// real clock — DERIVE the expectation instead of pinning it, or the harness
// goes red at midnight (the standing date-drift trap).
const taskDaysArr = ['2026-08-24', '2026-08-25', '2026-08-26'];
const now0 = new Date(); now0.setHours(0, 0, 0, 0);
const localIso = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const todayIso = localIso(now0);
const nextCovered = taskDaysArr.find(x => x >= todayIso);
let expectBadge = null;
if (taskDaysArr.includes(todayIso)) expectBadge = 'Today';
else if (!nextCovered) expectBadge = 'Overdue';
else {
  const diff = Math.round((new Date(`${nextCovered}T00:00:00`) - now0) / 86400000);
  if (diff === 1) expectBadge = 'Tomorrow';
}
if (expectBadge) {
  check(cardText.includes(expectBadge), `and the badge counts to the next covered day (${expectBadge})`);
} else {
  console.log('SKIP badge wording — the clock sits between covered days, the badge counts days');
}
await page.locator('button:has-text("Close the ceiling")').first().click();
await page.waitForTimeout(600);
// The new flow: Close job opens the closing screen; the final press closes.
await page.locator('[data-close-job]').first().click();
await page.waitForTimeout(300);
await page.locator('[data-close-now]').click();
await page.waitForTimeout(400);
// The finish-early ask exists only while days lie AHEAD of the clock —
// derive them rather than pinning, the same drift rule as the badge.
const futureDays = taskDaysArr.filter(x => x > todayIso);
const ask = page.locator('[data-finish-early]');
if (futureDays.length) {
  check(await ask.count() === 1, 'closing with days ahead raises the big-words ask');
  const askText = await ask.innerText();
  check(futureDays.every(x => askText.includes(String(Number(x.slice(8))))),
    'it names the days he would come back for', askText.replace(/\n/g, ' · ').slice(0, 140));
  await ask.locator('button').first().click();     // "I finished everything"
} else {
  console.log('SKIP finish-early — the clock has passed every covered day');
}
await page.waitForTimeout(900);
d = await data();
task = d.contractorAssignments.find(a => a.taskDescription?.includes('Close the ceiling'));
check(!!task.completedAt, 'yes closes the task');
check(d.apartments.find(a => a.id === 'G-cohen').currentStageId === 'S-done',
  'and the JOB moved itself to the when-done stage');

// ── 5 · the record: the struck bar on the notebook, "finished early" ───────
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3000);
const struck = await page.evaluate(id => {
  const bar = document.querySelector(`[data-task-bar="${id}"]`);
  const lines = bar ? [...bar.querySelectorAll('span')]
    .filter(s => (s.getAttribute('style') || '').includes('rotate(-2deg)')).length : 0;
  return { present: !!bar, lines, opacity: bar ? getComputedStyle(bar).opacity : null,
    early: bar?.textContent.includes('finished early'), done: bar?.textContent.includes('done') };
}, task.id);
check(struck.present && struck.lines === 1 && Number(struck.opacity) < 1,
  'the bar stays, dimmed and struck — the record, not a deletion', JSON.stringify(struck));
if (futureDays.length) check(struck.early, 'and says "finished early" — its days ran past the close');
else console.log('SKIP finished-early wording — no days lay ahead of the clock');

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
