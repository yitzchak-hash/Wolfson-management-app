// The owner's 2026-09-22 asks: a task's NAME on the Tasks page opens the
// apartment window on that task, and a task closed AFTER its last day gains
// the closing day (struck as done) instead of sitting red on a day nobody
// was there. Dates are offsets from the real clock (the standing drift rule).
import { chromium } from 'playwright';
import { realisticWolfson, applySeed } from './seed.mjs';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = iso(new Date());
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await applySeed(ctx, blob);
await ctx.addInitScript(([late, lateEnd]) => {
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw);
  if ((d.contractorAssignments || []).some(a => a.id === 'T-LATE')) return; // seed once — the app's own writes must survive a navigation
  const worker = (d.contractors || [])[0];
  d.contractorAssignments = [
    // Two days, both last week, never closed — overdue.
    { id: 'T-LATE', apartmentId: 'A1-53', buildingId: 'A1', contractorId: worker?.id,
      taskDescription: 'Late two-day run', stageId: null,
      dueDate: lateEnd, days: [late, lateEnd], priority: 'normal',
      createdAt: '2026-08-01', createdBy: 'U', createdByName: 'Office', completedAt: null },
    { id: 'T-OTHER', apartmentId: 'A1-53', buildingId: 'A1', contractorId: worker?.id,
      taskDescription: 'Another task here', stageId: null,
      dueDate: lateEnd, priority: 'normal',
      createdAt: '2026-08-01', createdBy: 'U', createdByName: 'Office', completedAt: null },
  ];
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}, [daysAgo(6), daysAgo(5)]);

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
await page.goto('http://localhost:5173/tasks');
await page.waitForTimeout(2500);

// ── 1. the name opens the apartment window ON that task ────────────────────
const link = page.locator('[data-open-task="T-LATE"]');
check(await link.count() === 1, 'the task row carries its open-in-window button');
await link.click();
await page.waitForTimeout(2500);
check(page.url().includes('/project'), 'pressing the name lands on the buildings page', page.url());
const drawer = await page.evaluate(() => ({
  open: !!document.querySelector('.drawer-panel'),
  lit: document.querySelector('[data-task-card="T-LATE"][data-task-lit="1"]') !== null,
  cards: document.querySelectorAll('[data-task-card]').length,
}));
check(drawer.open, 'the apartment window opened');
check(drawer.lit, 'it opened on the Tasks tab with THAT task lit', JSON.stringify(drawer));

// ── 2. closing an overdue task adds the closing day ────────────────────────
await page.keyboard.press('Escape');
await page.goto('http://localhost:5173/tasks');
await page.waitForTimeout(2000);
const row = page.locator('[data-open-task="T-LATE"]').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
await row.locator('button').first().click();   // the complete circle
await page.waitForTimeout(900);
const after = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
  const t = (d.contractorAssignments || []).find(a => a.id === 'T-LATE');
  return { days: t?.days, dueDate: t?.dueDate, done: !!t?.completedAt };
});
check(after.done, 'the task is closed');
check(Array.isArray(after.days) && after.days.length === 3 && after.days[2] === today,
  'the closing day (today) joined the task’s days', JSON.stringify(after));
check(after.dueDate === today, 'the due date followed to the closing day', after.dueDate);
// The list must not read it as late any more.
const badge = await page.locator('[data-open-task="T-LATE"]').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]').textContent();
check(!/Overdue|overdue/.test(badge || ''), 'no overdue badge on a closed task');

// ── 3. closing ON TIME changes no days ─────────────────────────────────────
// T-OTHER's due date is last week too; re-date it to today first through
// the store (the dev harness door), then close it.
await page.evaluate(t => { window.__store.getState().updateContractorAssignment('T-OTHER', { dueDate: t }); }, today);
await page.waitForTimeout(400);
await page.evaluate(() => { window.__store.getState().updateContractorAssignment('T-OTHER', { completedAt: new Date().toISOString() }); });
await page.waitForTimeout(600);
const onTime = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
  const t = (d.contractorAssignments || []).find(a => a.id === 'T-OTHER');
  return { days: t?.days, dueDate: t?.dueDate, done: !!t?.completedAt };
});
check(onTime.done && !onTime.days && onTime.dueDate === today, 'a task closed on its day keeps its one day', JSON.stringify(onTime));

check(errs.length === 0, 'no page errors', errs[0] || '');
await ctx.close();

// ── 4. the worker's OWN task on an apartment draws on the office's notebook ─
// Standing on the Job Board with a notebook, the office assigned Joseph a
// GENERAL job at Wolfson (the bar says "Wolfson Residence"); Joseph then
// pressed "I'm going to work here" on apartment 1 — a stage report of his
// own, in WOLFSON's records. It must draw as ITS OWN bar named by the
// apartment, beside the workspace bar. Read from the Wolfson snapshot,
// exactly as the foreign live sync feeds it.
const ctx2 = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await ctx2.addInitScript(today => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  const stages = [
    { id: 'ST-rp', name: 'Rough plumbing', color: '#0ea5e9', order: 1, active: true },
    { id: 'S-pipe', name: 'Piping', color: '#6366f1', order: 1, active: true, projectId: 'general' },
  ];
  const wapt = (id, n, name, st) => ({
    id, buildingId: 'A1', floor: 2, apartmentNumber: n, displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', currentStageId: st, stageDates: {},
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  if (!localStorage.getItem('wolfson_app_data')) {
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      stages, buildings: [{ id: 'A1', name: 'A1' }],
      apartments: [wapt('A1-1', '1', 'Artzi', 'ST-rp')],
      contractorAssignments: [
        { id: 'T-GEN', apartmentId: '', buildingId: '', contractorId: 'C-jo', general: { projectId: 'wolfson' },
          taskDescription: 'A day at Wolfson', stageId: null, dueDate: today, priority: 'normal',
          createdAt: '2026-08-01', createdBy: 'U', createdByName: 'Office', completedAt: null },
        { id: 'SR-jo', apartmentId: 'A1-1', buildingId: 'A1', contractorId: 'C-jo', stageReport: true,
          taskDescription: 'Rough plumbing — working here today', stageId: 'ST-rp', dueDate: today, priority: 'normal',
          createdAt: '2026-08-01', createdBy: 'C-jo', createdByName: 'Joseph', completedAt: null },
      ],
    }));
  }
  if (localStorage.getItem('general_app_data')) return;
  const d = new Date(); d.setDate(d.getDate() - d.getDay());
  const sunday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages,
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }],
    contractorAssignments: [], apartments: [],
    canvasElements: [
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 400, y: 130, w: 920, h: 440, text: '', color: '#ffffff',
        data: { people: ['c:C-jo'], firstWeek: sunday, weekCount: 1, span: 5, cells: {} } },
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 40, y: 1500, w: 300, h: 200, text: '', color: '#ffffff', data: {} },
    ],
  }));
}, today);
const p2 = await ctx2.newPage();
p2.on('pageerror', e => errs.push(e.message.slice(0, 160)));
await p2.goto('http://localhost:5173/jobs');
await p2.waitForTimeout(3500);
const bars = await p2.evaluate(() => [...document.querySelectorAll('[data-node-id="CE-rota"] [data-task-bar]')]
  .map(b => ({ id: b.getAttribute('data-task-bar'), text: (b.textContent || '').replace(/\s+/g, ' ').trim() })));
const gen = bars.find(b => b.id === 'T-GEN'), own = bars.find(b => b.id === 'SR-jo');
check(!!gen && /Wolfson/.test(gen.text), 'the general job draws as a bar naming the workspace', JSON.stringify(gen));
check(!!own && /Artzi/.test(own.text) && /1/.test(own.text), "the worker's own report draws as ITS OWN bar named by the apartment", JSON.stringify(own));
check(!!own && /Wolfson/.test(own.text), 'the apartment bar wears its workspace tag', JSON.stringify(own));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
