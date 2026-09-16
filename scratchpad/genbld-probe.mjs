// The add-a-job dialog's which-building step (owner, 2026-09-16): an ALL
// pill, and buildings that toggle so several can be picked at once; the
// task carries the set and every label reads it.
import { chromium } from 'playwright';
const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date(); const sunday = new Date(now); sunday.setDate(now.getDate() - now.getDay());
const firstWeek = iso(sunday);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(({ firstWeek }) => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3'); localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const user = { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const contractors = [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }];
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: user, users: [user], stages: [], contractors, contractorAssignments: [], apartments: [],
    canvasElements: [{ id: 'CE-rota', type: 'widget', widget: 'rota', x: 60, y: 420, w: 1100, h: 420, text: '', color: '#ffffff',
      data: { people: ['c:C-jo'], firstWeek, weekCount: 1, span: 5, cells: {} } }],
  }));
  const apt = (id, bld, n, f, name) => ({ id, buildingId: bld, floor: f, apartmentNumber: String(n), displayName: name, isUnnamed: false,
    isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
  localStorage.setItem('wolfson_app_data', JSON.stringify({ currentUser: user, users: [user], stages: [], contractors,
    buildings: [{ id: 'A1', name: 'Building A1' }, { id: 'A2', name: 'Building A2' }, { id: 'A3', name: 'Building A3' }],
    apartments: [apt('A1-47', 'A1', 47, 13, 'Aharonov')], contractorAssignments: [], canvasElements: [] }));
}, { firstWeek });
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);
const cellCentre = (i) => page.evaluate(i => {
  const cell = document.querySelectorAll('[data-node-id="CE-rota"] .group\\/cell')[i];
  const r = cell.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, i);
const wolfsonTasks = () => page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')).contractorAssignments);
async function openDialog(i) {
  const c = await cellCentre(i);
  await page.mouse.move(c.x, c.y); await page.waitForTimeout(300);
  let plus = page.locator('[data-cell-plus]');
  if (await plus.count() === 0) { await page.mouse.move(c.x, c.y + 30); await page.waitForTimeout(300); plus = page.locator('[data-cell-plus]'); }
  await plus.first().click(); await page.waitForTimeout(400);
  await page.locator('[data-general-job]').click(); await page.waitForTimeout(200);
  await page.locator('[data-general-ws-pick="wolfson"]').click(); await page.waitForTimeout(200);
}
// ── 1 · several buildings at once ───────────────────────────────────────────
await openDialog(0);
check(await page.locator('[data-general-bld-pick="all"]').count() === 1, '1 · an All pill stands beside the buildings');
check(await page.locator('[data-general-bld-done]').isDisabled(), '1 · Done waits until something is ticked');
await page.locator('[data-general-bld-pick="A1"]').click();
await page.locator('[data-general-bld-pick="A2"]').click();
check(await page.locator('[data-general-bld-pick="A1"][data-on]').count() === 1 && await page.locator('[data-general-bld-pick="A2"][data-on]').count() === 1
  && await page.locator('[data-general-bld-pick="A3"][data-on]').count() === 0, '1 · two buildings tick, the third stays off');
await page.locator('[data-general-bld-pick="A2"]').click();
check(await page.locator('[data-general-bld-pick="A2"][data-on]').count() === 0, '1 · a second press unticks');
await page.locator('[data-general-bld-pick="A2"]').click();
check((await page.locator('[data-general-bld-done]').innerText()).includes('2'), '1 · Done counts the picks');
await page.locator('[data-general-bld-done]').click(); await page.waitForTimeout(200);
const label1 = await page.locator('[data-job-general]').innerText();
check(/Wolfson/.test(label1) && /A1, A2/.test(label1), '1 · the picked job reads both buildings', label1);
await page.locator('[data-task-dialog] textarea').fill('Check the roof units');
await page.locator('[data-add-the-job]').click(); await page.waitForTimeout(1500);
const t1 = await wolfsonTasks();
const made1 = t1.find(a => a.taskDescription === 'Check the roof units');
check(!!made1 && made1.general?.projectId === 'wolfson' && JSON.stringify(made1.general?.buildingIds) === '["A1","A2"]' && !made1.general?.buildingId,
  '1 · the task carries the SET of buildings, no single legacy pick', JSON.stringify(made1?.general));
// ── 2 · All ────────────────────────────────────────────────────────────────
await openDialog(1);
await page.locator('[data-general-bld-pick="all"]').click(); await page.waitForTimeout(200);
const label2 = await page.locator('[data-job-general]').innerText();
check(/Wolfson/.test(label2) && !/A\d/.test(label2), '2 · All names the workspace alone', label2);
await page.locator('[data-task-dialog] textarea').fill('Walk every building');
await page.locator('[data-add-the-job]').click(); await page.waitForTimeout(1500);
const made2 = (await wolfsonTasks()).find(a => a.taskDescription === 'Walk every building');
check(!!made2 && made2.general?.projectId === 'wolfson' && !made2.general?.buildingIds && !made2.general?.buildingId, '2 · the task names no building', JSON.stringify(made2?.general));
// ── 3 · one building keeps the legacy field too ─────────────────────────────
await openDialog(2);
await page.locator('[data-general-bld-pick="A3"]').click();
await page.locator('[data-general-bld-done]').click(); await page.waitForTimeout(200);
await page.locator('[data-task-dialog] textarea').fill('Only A3');
await page.locator('[data-add-the-job]').click(); await page.waitForTimeout(1500);
const made3 = (await wolfsonTasks()).find(a => a.taskDescription === 'Only A3');
check(!!made3 && made3.general?.buildingId === 'A3' && JSON.stringify(made3.general?.buildingIds) === '["A3"]', '3 · one building writes both the set and the single field', JSON.stringify(made3?.general));
// ── 4 · the notebook bar's label reads the set ──────────────────────────────
const barText = await page.locator('[data-node-id="CE-rota"] [data-task-bar]').allInnerTexts();
check(barText.some(t => /A1, A2/.test(t)), '4 · the notebook bar says "A1, A2"', barText.join(' | '));
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
