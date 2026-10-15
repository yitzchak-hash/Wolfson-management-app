// The three recordings of 15 Oct 14:13–14:19, on the board:
//   · a notebook person can be HIDDEN from the pencil, and shown again;
//   · a task bar dragged elsewhere ASKS ("move the task you gave X on Y …?"),
//     No leaves it, a different trade's row says so in words;
//   · Active jobs: a bar moved on the notebook is notebook activity; the kind
//     marks are icons; the tiles follow the widget's WIDTH (fluid) and the
//     Tile size slider zooms them.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date();
const sun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
const day = n => iso(new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + n));
const SEED = { first: day(0), mon: day(1), tue: day(2) };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript((S) => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const apt = (id, name, x) => ({
    id, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', currentStageId: 'S-pipe', stageDates: {}, canvasX: x, canvasY: 3000,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'Office', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'S-pipe', name: 'Piping', color: '#6366f1', order: 1, active: true, projectId: 'general' }],
    contractors: [
      { id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' },
      { id: 'C-mx', name: 'Max', category: 'drywall', token: 'tok-mx', active: true, createdAt: '2026-01-01' },
      { id: 'C-zz', name: 'Zalman', category: 'general', token: 'tok-zz', active: true, createdAt: '2026-01-01' },
    ],
    contractorAssignments: [
      { id: 'T-1', apartmentId: 'G-a', buildingId: 'G', contractorId: 'C-jo', taskDescription: 'Two days',
        dueDate: S.tue, days: [S.mon, S.tue], stageId: 'S-pipe', completedAt: null,
        createdAt: '2025-01-01', createdBy: 'U-t', createdByName: 'Office' },
    ],
    apartments: [apt('G-a', 'Alpha', 200), ...Array.from({ length: 6 }, (_, i) => apt(`G-x${i}`, `Job ${i}`, 500 + i * 230))],
    activityLogs: Array.from({ length: 6 }, (_, i) => ({ id: `L${i}`, apartmentId: `G-x${i}`, actionType: 'field_updated',
      fieldChanged: 'generalNotes', userName: 'Office', createdAt: new Date(Date.now() - i * 3600e3).toISOString() })),
    canvasElements: [
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 60, y: 260, w: 1000, h: 300, text: '', color: '#ffffff',
        data: { people: ['c:C-jo', 'c:C-mx', 'c:C-zz'], firstWeek: S.first, weekCount: 1, span: 5, cells: {} } },
      { id: 'CE-act', type: 'widget', widget: 'active-jobs', x: 1100, y: 260, w: 300, h: 420, text: '', color: '#ffffff',
        data: { days: 30 } },
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 6000, y: 6000, w: 200, h: 200, text: '', color: '#fff', data: {} },
    ],
  }));
}, SEED);
const page = await ctx.newPage();
page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message); fails++; } });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);
await page.locator('button:has-text("100%")').first().click().catch(() => {});
await page.waitForTimeout(600);

const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));
const rotaData = () => data().then(d => d.canvasElements.find(e => e.id === 'CE-rota').data);
const centre = async (sel) => { const bb = await page.locator(sel).first().boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, w: bb.width }; };
const cellOf = (person, d) => page.evaluate(([p, dd]) => {
  const c = document.querySelector(`[data-node-id="CE-rota"] [data-cell-person="${p}"][data-cell-day="${dd}"]`);
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, [person, d]);
const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
};
const openPencil = async (id) => {
  await page.locator(`[data-node-id="${id}"]`).hover();
  await page.waitForTimeout(200);
  await page.locator(`[data-node-id="${id}"] button[title="Settings"]`).first().evaluate(b => b.click());
  await page.waitForTimeout(500);
};

// ── 1 · a bar dragged to another day ASKS; No leaves it ─────────────────────
{
  const from = await centre('[data-task-bar="T-1"]');
  const to = await cellOf('c:C-jo', day(4));
  await drag({ x: from.x - from.w / 4, y: from.y }, to);
  await page.waitForTimeout(500);
  const txt = (await page.locator('[data-move-confirm-text]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/the task you gave Joseph on/.test(txt) && /Monday/.test(txt) && /Thursday/.test(txt),
    '1 · "Move … the task you gave Joseph on Monday … to Thursday?"', txt);
  await page.locator('[data-move-confirm-no]').click();
  await page.waitForTimeout(500);
  const t = (await data()).contractorAssignments.find(a => a.id === 'T-1');
  check(JSON.stringify(t.days) === JSON.stringify([SEED.mon, SEED.tue]), '1 · No leaves the task where it was', JSON.stringify(t.days));
}

// ── 2 · onto a drywall row: the ask says it is another trade; Yes moves it ──
{
  const from = await centre('[data-task-bar="T-1"]');
  const to = await cellOf('c:C-mx', day(1));
  await drag({ x: from.x - from.w / 4, y: from.y }, to);
  await page.waitForTimeout(500);
  const trade = (await page.locator('[data-move-confirm-trade]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/Max is in Drywall, not AC/.test(trade), '2 · moving onto a drywall worker says so in words', trade);
  await page.locator('[data-move-confirm-yes]').click();
  await page.waitForTimeout(800);
  const t = (await data()).contractorAssignments.find(a => a.id === 'T-1');
  check(t.contractorId === 'C-mx', '2 · Yes gives the task to Max', t.contractorId);
  check(!!t.plannedAt && t.plannedBy === 'Office', '2 · and stamps when the notebook moved it', `${t.plannedAt} · ${t.plannedBy}`);
}

// ── 3 · Active jobs: the notebook move is notebook activity ─────────────────
{
  await page.locator('[data-node-id="CE-act"] [data-active-filter="notebook"]').evaluate(b => b.click());
  await page.waitForTimeout(600);
  const rows = await page.locator('[data-node-id="CE-act"] [data-active-row="G-a"]').count();
  check(rows === 1, '3 · the Notebook filter shows the job whose bar was just moved', String(rows));
  const what = await page.locator('[data-node-id="CE-act"] [data-active-row="G-a"]').innerText().catch(() => '');
  check(/planned on the notebook/.test(what), '3 · saying what happened', what.replace(/\s+/g, ' '));
  const sq = page.locator('[data-node-id="CE-act"] [data-active-square="notebook"]');
  check(await sq.count() >= 1 && await sq.first().locator('svg').count() === 1, '3 · the kind marks are icons, not letters');
  await page.locator('[data-node-id="CE-act"] [data-active-filter="all"]').evaluate(b => b.click());
  await page.waitForTimeout(400);
}

// ── 4 · tiles follow the WIDTH; Tile size zooms them ────────────────────────
const columns = () => page.evaluate(() => {
  const g = document.querySelector('[data-node-id="CE-act"] [data-active-tiles]');
  return g ? getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
});
{
  const narrow = await columns();
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('general_app_data'));
    return s;
  });
  // Widen the node through the store (the same write a resize makes).
  await page.evaluate(() => window.__store?.getState().updateCanvasElement('CE-act', { w: 700 }));
  await page.waitForTimeout(600);
  const wide = await columns();
  check(wide > narrow, '4 · a wider widget fits MORE tiles side by side', `${narrow} → ${wide}`);
  const tileW = await page.locator('[data-node-id="CE-act"] [data-active-tile]').first().evaluate(e => e.getBoundingClientRect().width);
  check(tileW < 300, '4 · …instead of magnifying them', String(Math.round(tileW)));
  await openPencil('CE-act');
  check(await page.locator('[data-field-scale="tileSize"]').count() === 1, '4 · the pencil has a Tile size slider');
  check(await page.getByText('Tiles across').count() === 0, '4 · and no "Tiles across" any more');
  await page.locator('[data-field-scale="tileSize"] input').evaluate(i => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(i, '160'); i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(600);
  const big = await columns();
  check(big < wide, '4 · a bigger Tile size puts fewer, larger tiles across', `${wide} → ${big}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// ── 5 · hide a person from the notebook, then show them again ───────────────
{
  await openPencil('CE-rota');
  await page.getByText('People and days', { exact: true }).click();
  await page.waitForTimeout(300);
  const hide = page.locator('[data-person-hide="c:C-zz"]');
  check(await hide.count() === 1, '5 · every person on the list has a hide button');
  await hide.click();
  await page.waitForTimeout(500);
  let r = await rotaData();
  check(JSON.stringify(r.hiddenPeople) === '["c:C-zz"]' && r.people.includes('c:C-zz'), '5 · hidden, but still on the list', JSON.stringify(r.hiddenPeople));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(await page.locator('[data-node-id="CE-rota"] [data-cell-person="c:C-zz"]').count() === 0, '5 · and their row is not drawn on the notebook');
  check(await page.locator('[data-node-id="CE-rota"] [data-cell-person="c:C-jo"]').count() > 0, '5 · the others still are');
  await openPencil('CE-rota');
  if (await page.locator('[data-person-hide="c:C-zz"]').count() === 0) { await page.getByText('People and days', { exact: true }).click(); await page.waitForTimeout(300); }
  check(await page.locator('[data-person-row="c:C-zz"][data-hidden]').count() === 1, '5 · the list marks them hidden');
  await page.locator('[data-person-hide="c:C-zz"]').click();
  await page.waitForTimeout(500);
  r = await rotaData();
  check(!r.hiddenPeople, '5 · showing again clears it', JSON.stringify(r.hiddenPeople));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(await page.locator('[data-node-id="CE-rota"] [data-cell-person="c:C-zz"]').count() > 0, '5 · and the row is back');
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
