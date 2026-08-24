// Multi-day tasks, end to end, on the container clock of Mon 2026-08-24:
// drop a job on the notebook's Wednesday → the rebuilt ask card (current
// stage, when-done stage, one text box, days with the Friday checkbox and the
// green readout) → one card per day with its "day k of n" pill → dragging one
// day just moves, silently, and rewrites the task's days → the worker's
// portal shows every day, matches Today on any of them, and closing early
// asks in big words → yes crosses the days off (struck cards, "finished
// early") and moves the job to the when-done stage.
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
const dialog = page.locator('h3:has-text("Joseph")');
check(await dialog.count() === 1, 'the ask card opens on the drop');
check(await page.locator('text=Current stage').count() === 1
  && await page.locator('text=When it\'s done, move to').count() === 1,
  'it shows the current stage and asks where the job moves when done');

// ── 2 · fill it: when-done stage, the one text box, three days ──────────────
await page.selectOption('.fixed.z-\\[171\\] select >> nth=0', 'S-done');
await page.fill('.fixed.z-\\[171\\] textarea', 'Close the ceiling in both bedrooms');
await page.click('button[aria-label="One day more"]');
await page.click('button[aria-label="One day more"]');
await page.waitForTimeout(200);
check(await page.locator('text=Include Friday?').count() === 1,
  'three days from Wednesday pass a Friday — the checkbox appears, off');
// Locale-formatted ("Sun, Aug 30" here) — assert the substance, not the commas.
const readout = await page.locator('[data-day-readout]').innerText();
check(/Sun\b.*30/.test(readout) && !/Fri/.test(readout) && !/29/.test(readout)
  && readout.includes('3 days'),
  'the green line reads Wed, Thu, Sunday — Friday and Saturday skipped', readout);
await page.click('button:has-text("Add the task")');
await page.waitForTimeout(900);

let d = await data();
let task = d.contractorAssignments[0];
check(!!task && JSON.stringify(task.days) === JSON.stringify(['2026-08-26', '2026-08-27', '2026-08-30'])
  && task.dueDate === '2026-08-30' && task.stageWhenDone === 'S-done',
  'the task carries ALL its days, due on the last, with the when-done stage',
  JSON.stringify({ days: task?.days, due: task?.dueDate, when: task?.stageWhenDone }));
const cells1 = d.canvasElements.find(e => e.id === 'CE-rota').data.cells;
check(['2026-08-26', '2026-08-27', '2026-08-30'].every(day =>
  (cells1[`c:C-jo|${day}`] ?? []).some(e => e.taskId === task.id)),
  'one card per day landed on the notebook');
check(await page.locator('[data-day-pill]').count() === 3
  && (await page.locator('[data-day-pill]').first().innerText()).includes('1 of 3'),
  'each card wears its day-of pill');

// ── 3 · drag ONE day (Thursday → Monday): silent, and the task follows ──────
const thuCard = await page.locator('[data-node-id="CE-rota"] .group\\/cell >> nth=4')
  .locator('.planner-card').boundingBox();
await drag({ x: thuCard.x + thuCard.width / 2, y: thuCard.y + thuCard.height / 2 }, await cellCentre(1));
await page.waitForTimeout(700);
check(await page.locator('.fixed.z-\\[171\\]').count() === 0,
  'no question card — a single day of a multi-day task just moves');
d = await data();
task = d.contractorAssignments[0];
check(JSON.stringify(task.days) === JSON.stringify(['2026-08-24', '2026-08-26', '2026-08-30'])
  && task.dueDate === '2026-08-30',
  'the task\'s days follow the hand', JSON.stringify(task.days));
const cells2 = d.canvasElements.find(e => e.id === 'CE-rota').data.cells;
check((cells2['c:C-jo|2026-08-24'] ?? []).length === 1 && !cells2['c:C-jo|2026-08-27'],
  'the card lives on Monday now, Thursday is empty');

// ── 3½ · Non-consecutive: the checkbox opens a second stretch ───────────────
const levi = await page.locator('[data-node-id="G-levi"]').boundingBox();
await drag({ x: levi.x + levi.width / 2, y: levi.y + levi.height / 2 }, await cellCentre(0));
await page.waitForTimeout(600);
await page.click('text=Non-consecutive — work it in separate stretches');
await page.waitForTimeout(200);
check(await page.locator('.fixed.z-\\[171\\] input[type="date"]').count() === 2
  && await page.locator('text=And again from').count() === 1,
  'ticking Non-consecutive opens a second stretch with its own start and count');
const readout2 = await page.locator('[data-day-readout]').innerText();
check(readout2.includes('2 days'), 'the green line reads both stretches together', readout2);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// ── 4 · the worker's portal: every day shown, Today matches, finish early ───
await page.goto(`${APP}/c/tok-jo`);
await page.waitForTimeout(2500);
const cardText = await page.locator('button:has-text("Close the ceiling")').first().innerText();
check(cardText.includes('Mon 24 Aug') && cardText.includes('Wed 26 Aug') && cardText.includes('Sun 30 Aug'),
  'the worker sees EVERY day on the task card', cardText.replace(/\n/g, ' · ').slice(0, 120));
check(cardText.includes('Today'), 'and it reads Today — today is one of its days');
await page.locator('button:has-text("Close the ceiling")').first().click();
await page.waitForTimeout(600);
// The new flow: Close job opens the closing screen; the final press closes.
await page.locator('[data-close-job]').first().click();
await page.waitForTimeout(300);
await page.locator('[data-close-now]').click();
await page.waitForTimeout(400);
const ask = page.locator('[data-finish-early]');
check(await ask.count() === 1, 'closing with days ahead raises the big-words ask');
const askText = await ask.innerText();
check(askText.includes('Wednesday 26 August') && askText.includes('Sunday 30 August'),
  'it names the days he would come back for', askText.replace(/\n/g, ' · ').slice(0, 140));
await ask.locator('button').first().click();       // "I finished everything"
await page.waitForTimeout(900);
d = await data();
task = d.contractorAssignments[0];
check(!!task.completedAt, 'yes closes the task');
check(d.apartments.find(a => a.id === 'G-cohen').currentStageId === 'S-done',
  'and the JOB moved itself to the when-done stage');

// ── 5 · the record: struck cards on the notebook, "finished early" ahead ────
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3000);
const struck = await page.evaluate(() => {
  const node = document.querySelector('[data-node-id="CE-rota"]');
  const lines = [...node.querySelectorAll('.planner-card span')]
    .filter(s => (s.getAttribute('style') || '').includes('rotate(-4deg)')).length;
  return { lines, early: node.textContent.includes('finished early'), done: node.textContent.includes('done') };
});
check(struck.lines === 3, 'every day card wears the strike line — the record, not a deletion',
  JSON.stringify(struck));
check(struck.early, 'the days ahead say "finished early"');

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
