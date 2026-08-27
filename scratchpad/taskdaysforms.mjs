// The Geves request: "how many days" lives in EVERY task form now, not only
// the notebook's drop dialog. Two doors driven for real — the Tasks page's
// add form and the drawer's Add Task (QuickAddTaskPanel) on the Job Board —
// asserting the stored assignment carries `days` with dueDate pinned to the
// LAST day, exactly the notebook's own model.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

// Derive dates from the REAL clock (the standing date-drift rule): the next
// Monday at least a day out, so a 3-day run is Mon-Wed and never meets a
// Friday or Saturday.
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monday = (() => {
  const d = new Date(Date.now() + 86_400_000);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return iso(d);
})();
const plusDays = (start, n) => {
  const d = new Date(`${start}T00:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'S-geves', name: 'Installation of Geves', color: '#f59e0b', order: 1, active: true, projectId: 'general' }],
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'general', token: 'tok-jo', active: true, createdAt: '2026-01-01' }],
    contractorAssignments: [],
    apartments: [{
      id: 'G-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Cohen',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: 'S-geves', stageDates: {}, canvasX: 300, canvasY: 320,
      driveLink: 'https://drive.google.com/drive/folders/1FakeFolderIdForTests',
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [
      { id: 'CE-bin-done', type: 'bin', binKind: 'done', x: 2100, y: 24, w: 180, h: 112, text: 'Done', color: '#16a34a' },
      { id: 'CE-bin-ready', type: 'bin', binKind: 'ready', x: 2100, y: 154, w: 180, h: 112, text: 'Ready', color: '#0ea5e9' },
      { id: 'CE-bin-archive', type: 'bin', binKind: 'archive', x: 2100, y: 284, w: 180, h: 112, text: 'Archive', color: '#64748b' },
      { id: 'CE-bin-trash', type: 'bin', binKind: 'trash', x: 2100, y: 414, w: 180, h: 112, text: 'Trash', color: '#dc2626' },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });

const readTasks = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  return (d.contractorAssignments ?? []).map(a => ({
    id: a.id, desc: a.taskDescription, dueDate: a.dueDate, days: a.days ?? null,
  }));
});

// ── 1 · the Tasks page's add form ──────────────────────────────────────────
await page.goto(`${APP}/tasks`);
await page.waitForTimeout(2500);
// The header's Add Task toggle opens the blue panel; the panel's own Add Task
// button is a second button with the same words, so open first, then fill.
await page.locator('button:has-text("Add Task")').first().click();
await page.waitForTimeout(500);

// Scope everything to the blue add panel — the page's FILTER bar also has a
// contractor select with the same options, and an unscoped first() fills it.
const panel = page.locator('div.bg-blue-50');
await panel.locator('select').filter({ has: page.locator('option[value="C-jo"]') }).first().selectOption('C-jo');
await panel.locator('select').filter({ has: page.locator('option[value="G-1"]') }).first().selectOption('G-1');
await panel.locator('input[type="date"]').first().fill(monday);
await page.waitForTimeout(400);
check(await panel.locator('[data-task-days]').count() >= 1,
  'the Tasks page form grows the day picker once a start day is set');

// Two presses of + → three days → the green readout appears.
await panel.locator('[data-task-days] button[aria-label="One day more"]').first().click();
await panel.locator('[data-task-days] button[aria-label="One day more"]').first().click();
await page.waitForTimeout(400);
const readout = await page.evaluate(() =>
  document.querySelector('[data-day-readout]')?.textContent ?? '');
check(/3 days/.test(readout), 'the readout names three days', readout.slice(0, 90));

await panel.locator('textarea').first().fill('Geves — three day run');
await panel.locator('button:has-text("Add Task")').last().click();
await page.waitForTimeout(900);

let tasks = await readTasks();
const t1 = tasks.find(t => /three day run/.test(t.desc));
check(!!t1, 'the task is created');
check(!!t1 && Array.isArray(t1.days) && t1.days.length === 3,
  'and it CARRIES all three days', JSON.stringify(t1?.days));
check(!!t1 && t1.days?.[0] === monday && t1.days?.[2] === plusDays(monday, 2),
  'Monday through Wednesday exactly', JSON.stringify(t1?.days));
check(!!t1 && t1.dueDate === t1.days?.[2],
  'with dueDate pinned to the LAST day (the model\'s invariant)', String(t1?.dueDate));

// ── 2 · the drawer's Add Task on the Job Board (the owner's exact case) ────
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2500);
const tile = page.locator('[data-node-id="G-1"]');
await tile.dblclick();
await page.waitForTimeout(900); // the drawer's own settle window
await page.locator('.drawer-panel button:has-text("Tasks")').first().click();
await page.waitForTimeout(500);
await page.locator('.drawer-panel button:has-text("Add Task")').first().click();
await page.waitForTimeout(900);

// The QuickAdd panel is the only drawer-panel now (the drawer closed itself).
const qa = page.locator('.drawer-panel');
await qa.locator('select').filter({ has: page.locator('option[value="C-jo"]') }).first().selectOption('C-jo');
await qa.locator('textarea').first().fill('Geves — two more days');
await qa.locator('input[type="date"]').first().fill(monday);
await page.waitForTimeout(400);
check(await qa.locator('[data-task-days]').count() === 1,
  'the drawer\'s Add Task grows the same day picker');
await qa.locator('[data-task-days] button[aria-label="One day more"]').first().click();
await page.waitForTimeout(400);
const readout2 = await page.evaluate(() =>
  document.querySelector('[data-day-readout]')?.textContent ?? '');
check(/2 days/.test(readout2), 'its readout names two days', readout2.slice(0, 90));
await qa.locator('[data-create-task]').click();
await page.waitForTimeout(1200);

tasks = await readTasks();
const t2 = tasks.find(t => /two more days/.test(t.desc));
check(!!t2 && Array.isArray(t2.days) && t2.days.length === 2
  && t2.days[0] === monday && t2.dueDate === t2.days[1],
  'the drawer-made task carries both days, dueDate on the last', JSON.stringify(t2));
// The regression this harness caught on its first run: the drawer's quick-add
// passed id '' and the store's fields-last spread KEPT it — a task with no id
// cannot be edited, completed or deleted.
check(tasks.every(t => typeof t.id === 'string' && t.id.length > 0),
  'every stored task carries a REAL id', JSON.stringify(tasks.map(t => t.id)));

// A single-day task stays the plain single-date task it always was.
check(!!t1 && !!t2, '(both multi-day tasks stored)');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
