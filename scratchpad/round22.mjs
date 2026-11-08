// Round 22: the notebook stacks OLDEST WEEK ON TOP (and its add/put-away
// buttons follow) · assigned tasks show themselves in the right worker's
// square, from every workspace · removing the MAIN notebook hands everything
// to a projection, or files it into the archive — data is never lost.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (!localStorage.getItem('wolfson_app_data')) {
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      stages: [],
      apartments: [
        { id: 'A1-9', buildingId: 'A1', floor: 3, apartmentNumber: '9', displayName: 'Katz',
          isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
          currentStageId: null, stageDates: {},
          createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' },
      ],
      contractorAssignments: [
        // Joseph, Tuesday of week 2 — from ANOTHER workspace.
        { id: 'T-wolf', contractorId: 'C-jo', apartmentId: 'A1-9',
          taskDescription: 'Fix the VRF', stageId: null, dueDate: '2026-08-25',
          priority: 'normal', completedAt: null, createdAt: '2026-08-01' },
      ],
      buildings: [{ id: 'A1', name: 'A1' }],
    }));
  }
  if (localStorage.getItem('general_app_data')) return;
  const job = (i, name, extra) => ({
    id: `G-w${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {}, canvasX: 170, canvasY: 150 + i * 150,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    ...extra,
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [],
    contractors: [
      { id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' },
    ],
    contractorAssignments: [
      // Monday of week 1 — this workspace, live.
      { id: 'T-gen', contractorId: 'C-jo', apartmentId: 'G-w0',
        taskDescription: 'Hang the unit', stageId: null, dueDate: '2026-08-17',
        priority: 'normal', completedAt: null, createdAt: '2026-08-01' },
      // Placed BY HAND on the notebook already (an entry carries its id) —
      // must NOT also appear as a chip.
      { id: 'T-dup', contractorId: 'C-jo', apartmentId: 'G-w1',
        taskDescription: 'Duplicate check', stageId: null, dueDate: '2026-08-18',
        priority: 'normal', completedAt: null, createdAt: '2026-08-01' },
    ],
    apartments: [job(0, 'Genjob'), job(1, 'Handplaced', { inNotebook: 'CE-main' })],
    canvasElements: [
      { id: 'CE-main', type: 'widget', widget: 'rota',
        x: 560, y: 120, w: 760, h: 420, text: '', color: '#ffffff',
        data: { weekView: 'all',
          people: ['c:C-jo'],
          firstWeek: '2026-08-16', weekCount: 2, span: 5,
          // e-h is a TASK's card: "the fold" turns it into the task's own
          // days (PlannerWidget "THE FOLD"), so it leaves the squares by
          // design. e-p is a job parked on a day with no task — the kind the
          // fold leaves alone — so it is what the handover must carry.
          cells: {
            'c:C-jo|2026-08-18': [{ id: 'e-h', jobId: 'G-w1', taskId: 'T-dup' }],
            'c:C-jo|2026-08-19': [{ id: 'e-p', jobId: 'G-w0' }],
          },
        } },
      { id: 'CE-proj', type: 'widget', widget: 'rota',
        x: 560, y: 580, w: 760, h: 300, text: '', color: '#ffffff',
        data: { weekView: 'all', role: 'projection' } },
      // The board seeds its Goals widget once, at the centre of the view
      // (GeneralJobsPage "The Goals widget appears on the board once") —
      // right over the notebook, where it caught the week's "+". Placed out
      // of the way, so the board does not add one in the middle.
      { id: 'CE-goals-board', type: 'widget', widget: 'goals',
        x: 2400, y: 1600, w: 340, h: 320, text: '', color: '#ffffff', data: {} },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
page.on('dialog', d => d.accept());
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);

const main = page.locator('[data-node-id="CE-main"]');

// ── 1 · oldest week on top (the owner's 2026-08-24 reversal: a calendar
//        reads downward; the current week is reached by the open-on-today
//        scroll and by putting worked weeks away) ───────────────────────────
const weekTops = await page.evaluate(() => {
  const el = document.querySelector('[data-node-id="CE-main"]');
  const spans = [...el.querySelectorAll('span')]
    .filter(s => /^AUG \d+$/.test((s.textContent || '').trim()));
  return spans.map(s => ({ label: s.textContent.trim(), y: s.getBoundingClientRect().top }));
});
console.log('       week labels:', JSON.stringify(weekTops));
const w16 = weekTops.find(w => w.label === 'AUG 16');
const w23 = weekTops.find(w => w.label === 'AUG 23');
check(!!w16 && !!w23, 'both weeks of the run are drawn');
check(w23 && w16 && w16.y < w23.y, 'the OLDER week sits on top', JSON.stringify({ w16: w16?.y, w23: w23?.y }));

// ── 2 · the top plus adds an OLDER week; the bottom plus a NEWER one ────────
const dataNow = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  const el = (d.canvasElements ?? []).find(e => e.id === 'CE-main')
    ?? (d.canvasElements ?? []).find(e => e.widget === 'rota' && e.data?.people?.length);
  return el ? { id: el.id, ...el.data } : null;
});
// The controls are hover-revealed on the week's label row.
await page.locator('[data-node-id="CE-main"] .group\\/wk').first().hover();
await page.waitForTimeout(250);
await main.locator('button[title="Add the week before this one"]').first().click();
await page.waitForTimeout(700);
let dd = await dataNow();
check(dd.weekCount === 3 && dd.firstWeek === '2026-08-09',
  'the TOP plus adds the week BEFORE — older, above', JSON.stringify({ firstWeek: dd.firstWeek, weekCount: dd.weekCount }));
await page.locator('[data-node-id="CE-main"] .group\\/wk').last().hover();
await page.waitForTimeout(250);
await main.locator('button[title="Add the week after this one"]').first().click();
await page.waitForTimeout(700);
dd = await dataNow();
check(dd.weekCount === 4 && dd.firstWeek === '2026-08-09',
  'the BOTTOM plus adds the week AFTER — newer, at the bottom', JSON.stringify({ firstWeek: dd.firstWeek, weekCount: dd.weekCount }));

// ── 3 · assigned tasks show themselves in the worker's square ───────────────
// A worker's tasks draw as TASK BARS across their days now ([data-task-bar],
// carrying the task's id), not the old "From the task list" chips.
const chips = await page.evaluate(() => {
  const el = document.querySelector('[data-node-id="CE-main"]');
  return [...el.querySelectorAll('[data-task-bar]')]
    .map(c => ({ id: c.getAttribute('data-task-bar'), text: (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) }));
});
console.log('       task bars:', JSON.stringify(chips));
check(chips.some(c => c.id === 'T-gen' && /Genjob/.test(c.text) && /Hang the unit/.test(c.text)),
  'a task in THIS workspace appears on its day');
check(chips.some(c => c.id === 'T-wolf' && /Katz/.test(c.text) && /Fix the VRF/.test(c.text) && /Wolfson/i.test(c.text)),
  'a task from ANOTHER workspace appears too, labeled with its workspace');
check(chips.filter(c => c.id === 'T-dup').length <= 1,
  'a task already placed by hand gets no second copy', JSON.stringify(chips.filter(c => c.id === 'T-dup')));

// ── 4 · removing the MAIN hands everything to the projection ────────────────
await main.hover();
await page.waitForTimeout(300);
// The action strip's remove X floats above the node.
// The strip renders before the widget's content, so the FIRST Remove is the
// node's own X. Clicked via the DOM: the synthetic pointer sequence tangles
// with the node's pointer capture in a way a real hand does not.
await main.locator('button[title="Remove"]').first().evaluate(b => b.click());
await page.waitForTimeout(900);
const after = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  const els = (d.canvasElements ?? []).filter(e => e.widget === 'rota');
  const heir = els.find(e => e.id === 'CE-proj');
  return {
    rotas: els.map(e => ({ id: e.id, role: e.data?.role ?? null, people: e.data?.people ?? [], cells: Object.keys(e.data?.cells ?? {}) })),
    heldBy: (d.apartments ?? []).find(a => a.id === 'G-w1')?.inNotebook ?? null,
    heir: heir ? { role: heir.data?.role ?? null, weekCount: heir.data?.weekCount } : null,
  };
});
console.log('       after removing the main:', JSON.stringify(after));
check(after.rotas.length === 1 && after.rotas[0].id === 'CE-proj',
  'the main is gone and the projection remains', JSON.stringify(after.rotas.map(r => r.id)));
check(after.heir && after.heir.role === null && after.heir.weekCount === 4,
  'the projection inherited the crown AND every week', JSON.stringify(after.heir));
check(after.rotas[0]?.cells.includes('c:C-jo|2026-08-19'),
  'with the squares intact', JSON.stringify(after.rotas[0]?.cells));
check(after.heldBy === 'CE-proj',
  'and the job filed in the notebook follows it', String(after.heldBy));

// ── 5 · removing the LAST notebook files the planning away ──────────────────
const proj = page.locator('[data-node-id="CE-proj"]');
await proj.hover();
await page.waitForTimeout(300);
await proj.locator('button[title="Remove"]').first().evaluate(b => b.click());
await page.waitForTimeout(900);
const filed = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  const arch = d.boardSettings?.general?.plannerArchive ?? [];
  return {
    rotasLeft: (d.canvasElements ?? []).filter(e => e.widget === 'rota').length,
    archived: arch.length,
    weekCount: arch[0]?.data?.weekCount,
    cells: Object.keys(arch[0]?.data?.cells ?? {}),
  };
});
console.log('       after removing the last:', JSON.stringify(filed));
check(filed.rotasLeft === 0, 'the last notebook is off the board');
check(filed.archived >= 1 && filed.weekCount === 4 && filed.cells.includes('c:C-jo|2026-08-19'),
  'and every week and card is filed in the archive, not deleted', JSON.stringify(filed));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
