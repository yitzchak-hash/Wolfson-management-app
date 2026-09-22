// A foreign unit drops on the notebook LIKE A REGULAR JOB (owner, 2026-09-16):
// a Building Progress square or a unit card released on a square opens the
// task dialog for THAT unit, the task is made in the unit's own workspace
// with that workspace's stages, and the notebook draws it as a bar — no
// pointer card. And every dialog lists only the JOB's workspace's stages.
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
  const stages = [
    { id: 'ST-rp', name: 'Rough plumbing', color: '#0ea5e9', order: 1, active: true },
    { id: 'ST-el', name: 'Electrics', color: '#f59e0b', order: 2, active: true },
    { id: 'S-pipe', name: 'Piping', color: '#6366f1', order: 1, active: true, projectId: 'general' },
    { id: 'S-conc', name: 'Concealed units', color: '#0ea5e9', order: 2, active: true, projectId: 'general' },
  ];
  const wapt = (id, n, name, st) => ({
    id, buildingId: 'A1', floor: 2, apartmentNumber: n, displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', currentStageId: st, stageDates: {},
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  if (!localStorage.getItem('wolfson_app_data')) {
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      stages, buildings: [{ id: 'A1', name: 'A1' }],
      apartments: [wapt('A1-1', '1', 'Artzi', 'ST-rp'), wapt('A1-2', '2', 'Levi', null)],
      contractorAssignments: [],
    }));
  }
  if (localStorage.getItem('general_app_data')) return;
  const d = new Date(); d.setDate(d.getDate() - d.getDay());
  const sunday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages,
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }],
    contractorAssignments: [],
    apartments: [{
      id: 'G-cohen', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Cohen', isUnnamed: false,
      isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'S-pipe', stageDates: {},
      canvasX: 60, canvasY: 720, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [
      { id: 'CE-bp', type: 'widget', widget: 'project-mini', x: 40, y: 150, w: 300, h: 240, text: '', color: '#ffffff',
        data: { projectId: 'wolfson' } },
      { id: 'CE-unit', type: 'widget', widget: 'unit-card', x: 40, y: 430, w: 230, h: 120, text: '', color: '#ffffff',
        data: { projectId: 'wolfson', aptId: 'A1-2' } },
      // Narrow enough that Thursday clears the tool rail on the right (a
      // square under the board's chrome takes no hover — the standing trap).
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 400, y: 130, w: 920, h: 440, text: '', color: '#ffffff',
        data: { people: ['c:C-jo'], firstWeek: sunday, weekCount: 1, span: 5, askOnDrop: '1', cells: {} } },
      // The Goals fixture, parked far away — seeded at the view centre it lands
      // over the notebook (the round32 lesson).
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 40, y: 1500, w: 300, h: 200, text: '', color: '#ffffff', data: {} },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);

const gdata = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));
const wdata = () => page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')));
const rotaCells = async () => (await gdata()).canvasElements.find(e => e.id === 'CE-rota').data.cells ?? {};
const cellCentre = (i) => page.evaluate(i => {
  const cell = document.querySelectorAll('[data-node-id="CE-rota"] .group\\/cell')[i];
  const r = cell.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
}, i);
const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
};
// A given job's name sits in the dialog's TITLE (the which-job field is not drawn).
const dialogTitle = () => page.evaluate(() => {
  const d = document.querySelector('[data-task-dialog]');
  return d?.closest('.fixed')?.querySelector('h3')?.textContent ?? '';
});
// The set model (2026-09-22): the picker is bubbles, not a select.
const stageOptions = async () => (await page.locator('[data-task-dialog] [data-stage-pick]').allInnerTexts()).join(' | ');

// ── 1 · a Building Progress square → the task dialog, in Wolfson ────────────
{
  const cell = page.locator('[data-node-id="CE-bp"] button', { hasText: 'Artzi' }).first();
  await cell.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  const cb = await cell.boundingBox();
  check(!!cb, '1 · Building Progress draws Artzi');
  const tue = await cellCentre(2);
  await drag({ x: cb.x + cb.width / 2, y: cb.y + cb.height / 2 }, tue);
  await page.waitForTimeout(600);
  check(await page.locator('[data-task-dialog]').count() === 1, '1 · the drop opens the task dialog (no pointer card)');
  const picked = await dialogTitle();
  check(/Put .*Artzi/.test(picked), '1 · with Artzi as the job', picked);
  const opts = await stageOptions();
  check(/Rough plumbing/.test(opts) && /Electrics/.test(opts), "1 · the stage list is WOLFSON's", opts);
  check(!/Piping|Concealed/.test(opts), "1 · …and none of the Job Board's", opts);
  await page.locator('[data-task-dialog] textarea').fill('Check the rough plumbing');
  await page.locator('[data-add-the-job]').click();
  await page.waitForTimeout(1200);
  const wt = (await wdata()).contractorAssignments ?? [];
  const made = wt.find(a => a.taskDescription === 'Check the rough plumbing');
  check(!!made && made.apartmentId === 'A1-1' && made.contractorId === 'C-jo', "1 · the task is written into WOLFSON's records, on Artzi, for Joseph", JSON.stringify(made));
  check(((await gdata()).contractorAssignments ?? []).length === 0, "1 · nothing was written into the Job Board's tasks");
  check(Object.values(await rotaCells()).flat().length === 0, '1 · and no card was parked in the square');
  check(made && await page.locator(`[data-task-bar="${made.id}"]`).count() === 1, '1 · the notebook draws it as a bar right away');
}

// ── 2 · a unit card → the same dialog; the card stays put ───────────────────
{
  const before = (await gdata()).canvasElements.find(e => e.id === 'CE-unit');
  const node = page.locator('[data-node-id="CE-unit"]');
  const nb = await node.boundingBox();
  const wed = await cellCentre(3);
  await drag({ x: nb.x + nb.width / 2, y: nb.y + nb.height / 2 + 10 }, wed);
  await page.waitForTimeout(600);
  check(await page.locator('[data-task-dialog]').count() === 1, '2 · the unit card opens the task dialog');
  const picked = await dialogTitle();
  check(/Put .*Levi/.test(picked), '2 · for Levi', picked);
  const opts = await stageOptions();
  check(/Rough plumbing/.test(opts) && !/Piping/.test(opts), "2 · Wolfson's stages again", opts);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const after = (await gdata()).canvasElements.find(e => e.id === 'CE-unit');
  check(after.x === before.x && after.y === before.y, '2 · the card did not move', `${before.x},${before.y} → ${after.x},${after.y}`);
  check(Object.values(await rotaCells()).flat().length === 0, '2 · cancel wrote nothing');
}

// ── 3 · a Job Board tile → the Job Board's stages only ──────────────────────
{
  const tile = page.locator('[data-node-id="G-cohen"]');
  const tb = await tile.boundingBox();
  const mon = await cellCentre(1);
  await drag({ x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 + 8 }, mon);
  await page.waitForTimeout(600);
  check(await page.locator('[data-task-dialog]').count() === 1, '3 · a tile drop still opens the dialog');
  const opts = await stageOptions();
  check(/Piping/.test(opts) && /Concealed/.test(opts) && !/Rough plumbing/.test(opts), "3 · with the JOB BOARD's stages only", opts);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(await page.locator('[data-task-dialog]').count() === 0, '3 · Escape closes it');
}

// ── 4 · the hover plus, picking a Job Board job ─────────────────────────────
{
  const thuCell = page.locator('[data-node-id="CE-rota"] .group\\/cell').nth(4);
  await thuCell.hover();
  await page.waitForTimeout(400);
  let plusN = await page.locator('[data-cell-plus]').count();
  if (!plusN) {
    const under = await page.evaluate(() => {
      const c = document.querySelectorAll('[data-node-id="CE-rota"] .group\\/cell')[4];
      const r = c.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return `${el?.tagName}.${el?.className}`.slice(0, 120) + ` | cell contains: ${c.contains(el)}`;
    });
    console.log('       under the pointer:', under);
  }
  check(plusN === 1, '4 · the plus appears on the hovered square', String(plusN));
  await page.locator('[data-cell-plus]').click({ timeout: 5000 });
  await page.waitForTimeout(400);
  await page.locator('[data-job-search]').fill('coh');
  await page.waitForTimeout(400);
  await page.locator('[data-job-hit="G-cohen"]').click();
  await page.waitForTimeout(200);
  const opts = await stageOptions();
  check(/Piping/.test(opts) && !/Rough plumbing/.test(opts), "4 · the plus dialog lists the Job Board's stages only", opts);
  await page.keyboard.press('Escape');
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
