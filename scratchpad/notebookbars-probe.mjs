// The notebook after "Buildings, Plans and the Notebook Plus" (locked
// 2026-09-15): tasks are drawn FROM THE TASKS as one bar across their days;
// the old per-day cards fold into their tasks once; a square's hover plus
// opens the add-a-job dialog (job search, who search adding a row, the
// stage pair, the day picker); the "already has work" ask fires only on an
// overlap and can take the new task back out; a bar drags (working-day
// pattern kept), its edge resizes, its X takes it off.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const apt = (id, name, x) => ({
    id, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', currentStageId: 'S-pipe', stageDates: {}, canvasX: x, canvasY: 190,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [
      { id: 'S-pipe', name: 'Piping', color: '#6366f1', order: 1, active: true, projectId: 'general' },
      { id: 'S-conc', name: 'Concealed units', color: '#0ea5e9', order: 2, active: true, projectId: 'general' },
    ],
    contractors: [
      { id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' },
      { id: 'C-mo', name: 'Moshe', category: 'general', token: 'tok-mo', active: true, createdAt: '2026-01-01' },
    ],
    contractorAssignments: [
      { id: 'T-old', apartmentId: 'G-levi', buildingId: 'G', contractorId: 'C-jo', taskDescription: 'Old two-day task',
        dueDate: '2026-09-16', days: ['2026-09-15', '2026-09-16'], stageId: 'S-pipe', completedAt: null,
        createdAt: '2026-09-01', createdBy: 'U-t', createdByName: 'A' },
      { id: 'T-done', apartmentId: 'G-cohen', buildingId: 'G', contractorId: 'C-jo', taskDescription: 'Finished piping',
        dueDate: '2026-09-14', stageId: 'S-pipe', completedAt: '2026-09-14T12:00:00Z',
        createdAt: '2026-09-01', createdBy: 'U-t', createdByName: 'A' },
    ],
    apartments: [apt('G-cohen', 'Cohen', 620), apt('G-levi', 'Levi', 900)],
    canvasElements: [{
      id: 'CE-rota', type: 'widget', widget: 'rota', x: 60, y: 420, w: 1100, h: 420, text: '', color: '#ffffff',
      data: {
        people: ['c:C-jo'], firstWeek: '2026-09-13', weekCount: 2, span: 5, askOnDrop: '1',
        // OLD-STYLE cards: the notebook's own copy of T-old, one per day.
        cells: {
          'c:C-jo|2026-09-15': [{ id: 'R1', jobId: 'G-levi', taskId: 'T-old' }],
          'c:C-jo|2026-09-16': [{ id: 'R2', jobId: 'G-levi', taskId: 'T-old' }],
        },
      },
    }],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);

const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));
const rota = () => data().then(d => d.canvasElements.find(e => e.id === 'CE-rota').data);
const tasks = () => data().then(d => d.contractorAssignments);
const cellCentre = (i) => page.evaluate(i => {
  const cell = document.querySelectorAll('[data-node-id="CE-rota"] .group\\/cell')[i];
  const r = cell.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
}, i);
const centre = async (sel) => { const bb = await page.locator(sel).first().boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, w: bb.width }; };
const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
};

// ── 1 · the fold: the old cards are gone, the task keeps its days ──────────
{
  const r = await rota();
  const taskCards = Object.values(r.cells ?? {}).flat().filter(e => e.taskId).length;
  check(taskCards === 0, '1 · the old per-day task cards folded away', JSON.stringify(r.cells));
  const t = (await tasks()).find(a => a.id === 'T-old');
  check(JSON.stringify(t.days) === JSON.stringify(['2026-09-15', '2026-09-16']), '1 · and the task keeps its two days', JSON.stringify(t.days));
}

// ── 2 · one bar across two days; the done task struck ───────────────────────
{
  const bar = page.locator('[data-task-bar="T-old"]');
  check(await bar.count() === 1, '2 · T-old draws as ONE bar', String(await bar.count()));
  check(await bar.getAttribute('data-bar-days') === '2', '2 · spanning its two days');
  const bb = await bar.boundingBox();
  const cell = await cellCentre(2);
  check(bb.width > cell.w * 1.8, '2 · and it really lies across two cells', `${Math.round(bb.width)} vs cell ${Math.round(cell.w)}`);
  const op = await page.locator('[data-task-bar="T-done"]').evaluate(e => getComputedStyle(e).opacity);
  check(Number(op) < 1, '2 · the closed task is dimmed and struck, not gone', op);
  check(await page.locator('[data-day-pill]').count() === 0, '2 · no "day k of n" pills any more');
}

// ── 3 · the hover plus opens the add-a-job dialog ───────────────────────────
{
  const thu = await cellCentre(4);
  await page.mouse.move(thu.x, thu.y);
  await page.waitForTimeout(300);
  const plus = page.locator('[data-cell-plus]');
  check(await plus.count() === 1, '3 · a big plus appears on the hovered square only', String(await plus.count()));
  await plus.click();
  await page.waitForTimeout(400);
  check(await page.locator('[data-task-dialog]').count() === 1, '3 · the plus opens the add-a-job dialog');
  await page.locator('[data-job-search]').fill('coh');
  await page.waitForTimeout(400);
  check(await page.locator('[data-job-hit="G-cohen"]').count() === 1, '3 · the job search finds Cohen');
  await page.locator('[data-job-hit="G-cohen"]').click();
  await page.waitForTimeout(200);
  check(await page.locator('[data-job-picked]').count() === 1, '3 · picked');
  check(await page.locator('[data-who-pick="C-jo"][data-on]').count() === 1, "3 · the square's own worker is pre-picked");
  await page.locator('[data-who-search]').fill('mo');
  await page.waitForTimeout(150);
  await page.locator('[data-who-pick="C-mo"]').click();
  check(await page.locator('[data-who-pick="C-mo"][data-on]').count() === 1, '3 · a second worker, not on the sheet, is picked too');
  await page.locator('[data-task-dialog] textarea').fill('Concealed units in the bedrooms');
  const from = page.locator('[data-task-dialog] [data-stage-from]');
  check(await from.inputValue() === 'S-pipe', "3 · the FROM stage defaults to the job's stage", await from.inputValue());
  const fromText = await from.evaluate(s => [...s.options].map(o => o.textContent).join(' | '));
  check(/not reached yet/.test(fromText), '3 · a future stage wears "not reached yet"', fromText);
  await from.selectOption('S-conc');
  await page.locator('[data-task-dialog] [data-task-days] button[aria-label="One day more"]').first().click();
  await page.waitForTimeout(200);
  const readout = await page.locator('[data-task-dialog] [data-day-readout]').innerText();
  check(/2 days/.test(readout) && /Sun/.test(readout), '3 · two days: Thursday and the next working day (Sunday)', readout);
  await page.locator('[data-add-the-job]').click();
  await page.waitForTimeout(1200);
  const ts = await tasks();
  const made = ts.filter(a => a.taskDescription === 'Concealed units in the bedrooms');
  check(made.length === 2, '3 · one task per picked worker', String(made.length));
  check(made.every(a => JSON.stringify(a.days) === JSON.stringify(['2026-09-17', '2026-09-20']) && a.dueDate === '2026-09-20'),
    '3 · each carries Thu 17 + Sun 20, dueDate on the last', JSON.stringify(made.map(a => a.days)));
  check(made.every(a => a.stageId === 'S-conc'), '3 · on the picked FROM stage — a future stage, and the job did NOT move',
    JSON.stringify((await data()).apartments.find(a => a.id === 'G-cohen').currentStageId));
  check((await data()).apartments.find(a => a.id === 'G-cohen').currentStageId === 'S-pipe', "3 · (the job's own stage is untouched)");
  const r = await rota();
  check(r.people.includes('c:C-mo'), "3 · Moshe's row was added to the sheet", JSON.stringify(r.people));
  check(Object.values(r.cells ?? {}).flat().length === 0, '3 · and NO card was written — the task draws itself');
  const jo = made.find(a => a.contractorId === 'C-jo');
  const bars = page.locator(`[data-task-bar="${jo.id}"]`);
  check(await bars.count() === 2, "3 · Joseph's task shows as two stretches (Thu, then Sunday of the next week)", String(await bars.count()));
  check(await page.locator('[data-planner-ask]').count() === 0, '3 · no "already has work" ask — nothing overlapped');
}

// ── 4 · the overlap ask, and taking the task back out ───────────────────────
{
  const before = (await tasks()).length;
  const tue = await cellCentre(2);
  await page.mouse.move(tue.x + 4, tue.y + 40);   // below the bar, on the square itself
  await page.waitForTimeout(300);
  let plus = page.locator('[data-cell-plus]');
  if (await plus.count() === 0) { await page.mouse.move(tue.x, tue.y + 60); await page.waitForTimeout(300); plus = page.locator('[data-cell-plus]'); }
  check(await plus.count() === 1, '4 · the plus on a square that already holds a bar');
  await plus.click();
  await page.waitForTimeout(300);
  await page.locator('[data-job-search]').fill('lev');
  await page.waitForTimeout(400);
  await page.locator('[data-job-hit="G-levi"]').click();
  await page.locator('[data-task-dialog] textarea').fill('Second visit to Levi');
  await page.locator('[data-add-the-job]').click();
  await page.waitForTimeout(900);
  const ask = page.locator('[data-planner-ask]');
  check(await ask.count() === 1, '4 · same job, same day → the ask appears');
  const askText = await ask.innerText();
  check(/Levi/.test(askText) && /Joseph/.test(askText), '4 · and it names the job and who is already there', askText.replace(/\n/g, ' '));
  await page.locator('[data-ask-remove]').click();
  await page.waitForTimeout(700);
  check((await tasks()).length === before, '4 · "Pick another day" takes the new task back out', `${before} → ${(await tasks()).length}`);
  check(await page.locator('[data-planner-ask]').count() === 0, '4 · the ask is gone');
}

// ── 5 · dragging a bar moves the task, working-day pattern kept ─────────────
{
  const from = await centre('[data-task-bar="T-old"]');
  const to = await cellCentre(4);
  await drag({ x: from.x - from.w / 4, y: from.y }, to);
  await page.waitForTimeout(900);
  const t = (await tasks()).find(a => a.id === 'T-old');
  check(JSON.stringify(t.days) === JSON.stringify(['2026-09-17', '2026-09-20']), '5 · Tue–Wed dropped on Thursday → Thu + Sunday (never Saturday)', JSON.stringify(t.days));
  check(t.dueDate === '2026-09-20', '5 · dueDate re-pinned to the last day', t.dueDate);
  check(await page.locator('[data-task-bar="T-old"]').count() === 2, '5 · drawn as two stretches across the week edge');
}

// ── 6 · pulling the edge changes how many days ──────────────────────────────
{
  const edge = await centre('[data-task-bar="T-done"] [data-bar-edge]');
  // T-done sits on Mon 14 (the 13th is the Sunday); the third cell is Tue 15.
  const to = await cellCentre(3);
  await drag(edge, to);
  await page.waitForTimeout(900);
  const t = (await tasks()).find(a => a.id === 'T-done');
  check(JSON.stringify(t.days) === JSON.stringify(['2026-09-14', '2026-09-15', '2026-09-16']), '6 · the edge pulled to Wednesday → Mon, Tue, Wed', JSON.stringify(t.days));
  check(await page.locator('[data-task-bar="T-done"]').getAttribute('data-bar-days') === '3', '6 · the bar now spans three');
}

// ── 7 · the X takes the stretch off; the last one asks ──────────────────────
{
  await page.locator('[data-task-bar="T-done"] [data-bar-remove]').evaluate(b => b.click());
  await page.waitForTimeout(500);
  const dlg = page.locator('text=Keep the task');
  check(await dlg.count() === 1, '7 · the last stretch asks: keep the task or delete it');
  await dlg.click();
  await page.waitForTimeout(700);
  const t = (await tasks()).find(a => a.id === 'T-done');
  check(!!t && !t.dueDate && !t.days, '7 · kept, but dateless — off the sheet', JSON.stringify({ due: t?.dueDate, days: t?.days }));
  check(await page.locator('[data-task-bar="T-done"]').count() === 0, '7 · and the bar is gone');
}

// ── 8 · the task rows say "on → to" ────────────────────────────────────────
{
  await page.goto(`${APP}/tasks`);
  await page.waitForTimeout(2000);
  const pills = page.locator('[data-stage-pill]');
  check(await pills.count() >= 2, '8 · task rows wear the stage pill', String(await pills.count()));
  const txt = await pills.first().innerText();
  check(/Concealed|Piping/.test(txt), '8 · naming the stage the task is on', txt);
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
