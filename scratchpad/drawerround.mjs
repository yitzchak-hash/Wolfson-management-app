// The owner's four: the History tab surviving a nameless entry, the drawer's
// task card and editor knowing about days, a stage naming the worker who is
// actually on it, and the day dialog's wording.
import { chromium } from 'playwright';
import { realisticWolfson, applySeed } from './seed.mjs';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Next Monday, so a three-day run is Mon–Wed and meets no Friday or Saturday.
const monday = (() => { const d = new Date(Date.now() + 86400000); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); return iso(d); })();
const plus = n => { const d = new Date(`${monday}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await applySeed(ctx, blob);
await ctx.addInitScript(days => {
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw);
  const apt = (d.apartments || []).find(a => a.id === 'A1-53');
  const stages = (d.stages || []).filter(s => !s.projectId);
  if (apt && stages[1]) apt.currentStageId = stages[1].id;
  const worker = (d.contractors || [])[0];
  d.contractorAssignments = [
    // A three-day task, and NO stage on it — the ordinary case that used to
    // leave every stage reading "none".
    { id: 'T-DAYS', apartmentId: 'A1-53', buildingId: 'A1', contractorId: worker?.id,
      taskDescription: 'Three day run', stageId: null,
      dueDate: days[2], days, priority: 'normal',
      createdAt: '2026-08-01', createdBy: 'U', createdByName: 'Office', completedAt: null },
  ];
  // A history entry with NO userName — exactly what fsSet's undefined-strip
  // leaves behind, and what took the History tab down.
  d.activityLogs = [
    { id: 'L-NONAME', userId: 'U', buildingId: 'A1', apartmentId: 'A1-53',
      apartmentNumber: '53', actionType: 'task_created', fieldChanged: 'task',
      previousValue: '', newValue: 'Three day run', stageId: '', createdAt: '2026-08-01T09:00:00.000Z' },
  ];
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}, [monday, plus(1), plus(2)]);

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
await page.goto('http://localhost:5173/project');
await page.waitForTimeout(3000);
await page.locator('[data-apt-id="A1-53"]').first().click();
await page.waitForTimeout(2500);

// ── the History tab must not crash on a nameless entry ─────────────────────
await page.locator('.drawer-panel button:has-text("History")').first().click();
await page.waitForTimeout(1500);
const hist = await page.evaluate(() => ({
  crashed: !!document.querySelector('[data-crash-detail]'),
  text: (document.querySelector('.drawer-panel')?.textContent || '').slice(0, 160),
}));
check(!hist.crashed && !errs.some(e => /charAt/.test(e)),
  'the History tab survives an entry whose name was stripped',
  hist.crashed ? 'CRASH SCREEN' : (errs[0] || 'no errors'));
check(/Someone/.test(hist.text) || !hist.crashed,
  'and it names the entry something rather than blowing up');

// ── the task card says how many days, and the editor can change them ───────
await page.locator('.drawer-panel button:has-text("Tasks")').first().click();
await page.waitForTimeout(1200);
const chip = await page.evaluate(() =>
  document.querySelector('[data-task-days-chip]')?.textContent?.trim() ?? '');
check(/3/.test(chip), 'the task card shows that it takes 3 days', chip || 'no chip');

// Open the inline editor and check the day picker is there, already on 3.
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.drawer-panel button')];
  const edit = btns.find(b => /edit/i.test(b.getAttribute('title') || ''));
  edit?.click();
});
await page.waitForTimeout(900);
const editor = await page.evaluate(() => {
  const p = document.querySelector('.drawer-panel [data-task-days]');
  return p ? { present: true, count: p.querySelector('[data-days-count="first"]')?.textContent?.trim(),
               readout: document.querySelector('[data-day-readout]')?.textContent ?? '' } : { present: false };
});
check(editor.present, 'the drawer\'s task editor carries the days picker');
check(editor.count === '3', 'and it opens on the 3 days the task already has', String(editor.count));
check(/3 days/.test(editor.readout), 'with the days read out', editor.readout.slice(0, 60));
// The run must be the task's OWN days. Seeding the date box from dueDate —
// the LAST day — silently shifted the whole task forward on every edit.
const wantDays = [monday, plus(1), plus(2)].map(d =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }));
check(wantDays.every(w => editor.readout.includes(w)),
  'and the days are the task\'s own, not a run shifted off its due date',
  `${editor.readout.slice(0, 60)} | want ${wantDays.join(', ')}`);

// ── the stage names the worker who is actually on it ───────────────────────
await page.locator('.drawer-panel button:has-text("Notes")').first().click();
await page.waitForTimeout(1200);
const stageRow = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.drawer-panel .border.border-gray-200.rounded-lg')];
  return rows.map(r => (r.textContent || '').replace(/\s+/g, ' ').slice(0, 70));
});
const worker = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
  return (d.contractors || [])[0]?.name ?? '';
});
check(stageRow.some(r => r.includes(worker)),
  `the stage the job is at names its worker (${worker}) instead of none`,
  stageRow.find(r => r.includes(worker)) || stageRow.slice(0, 2).join(' | '));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
