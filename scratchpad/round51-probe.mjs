// Recording 2026-10-15 10:11: "Add existing" in the Add Job window (another
// tile of a job that already exists — even one filed in a group — and a card
// for another workspace's unit), and the search list in layers (jobs first,
// then tasks, then the rest). No real client family names.
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
  if (localStorage.getItem('general_app_data')) return;
  const user = { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const job = (id, name, extra) => ({ id, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: name,
    isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null,
    stageDates: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', ...extra });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: user,
    contractors: [{ id: 'C-1', name: 'Worker One', category: 'ac', token: 't1', active: true, createdAt: '2026-01-01' }],
    apartments: [
      job('G-on', 'Quarry Board Job', { canvasX: 80, canvasY: 300 }),
      job('G-grp', 'Quarry Grouped Job', { boardBin: 'done', binnedAt: '2026-01-01', canvasX: 2000, canvasY: 2000 }),
      job('G-trash', 'Quarry Trashed Job', { boardBin: 'trash', binnedAt: '2026-01-01' }),
    ],
    contractorAssignments: [
      { id: 'T-1', apartmentId: 'G-on', contractorId: 'C-1', taskDescription: 'Quarry the ducts', dueDate: '2026-10-20',
        completedAt: null, createdAt: '2026-01-01', createdBy: 'U', createdByName: 'Office' },
    ],
    canvasElements: [{ id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 3000, y: 3000, w: 200, h: 120, text: '', color: '#fff', data: {} }],
  }));
  if (!localStorage.getItem('wolfson_app_data')) localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: user, buildings: [{ id: 'A1', name: 'A1' }],
    apartments: [{ id: 'A1-5', buildingId: 'A1', floor: 3, colPosition: 1, apartmentNumber: '5', displayName: 'Quarryman',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {},
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' }],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data') ?? '{}'));
const openAdd = async () => {
  await page.locator('button', { hasText: /^\s*Add Job\s*$/ }).first().click();
  await page.waitForTimeout(300);
};

// ── 1 · the Add Job window has two tabs ─────────────────────────────────
await openAdd();
check(await page.locator('[data-add-mode-pick="existing"]').count() === 1, 'the Add Job window offers "Add existing"');
await page.locator('[data-add-mode-pick="existing"]').click();
await page.waitForTimeout(200);
check(await page.locator('[data-add-existing-search]').count() === 1, 'it opens a search');
await page.locator('[data-add-existing-search]').fill('quarry');
await page.waitForTimeout(400);
const rowIds = await page.locator('[data-add-existing-row]').evaluateAll(n => n.map(x => x.getAttribute('data-add-existing-row')));
check(rowIds.includes('G-on') && rowIds.includes('G-grp'), 'it finds jobs on the board and in a group', rowIds.join());
check(!rowIds.includes('G-trash'), 'Trash never appears');
check(rowIds.includes('A1-5'), 'and another workspace\'s unit');

// ── 2 · a grouped job gets another tile, and stays in its group ─────────
await page.locator('[data-add-existing-row="G-grp"]').click();
await page.waitForTimeout(600);
let d = await stored();
let grp = d.apartments.find(a => a.id === 'G-grp');
check((grp.ghosts ?? []).length === 1 && grp.boardBin === 'done', 'the grouped job wears a ghost and is still in Done', JSON.stringify(grp.ghosts));
check(await page.locator('[data-node-id="G-grp"][data-ghost="0"]').count() === 1, 'its extra tile is drawn on the board');
const gb = await page.locator('[data-node-id="G-grp"][data-ghost="0"]').boundingBox();
check(gb && gb.x > 100 && gb.x < 1400 && gb.y > 100 && gb.y < 900, 'in the middle of the screen', JSON.stringify(gb));
check(await page.locator('[data-add-existing]').count() === 0, 'and the window closes');

// ── 3 · a board job gets a second tile ──────────────────────────────────
await openAdd();
check(await page.locator('[data-add-mode-pick="new"]').evaluate(n => getComputedStyle(n).backgroundColor) !== 'rgba(0, 0, 0, 0)', 'the window opens on New job again');
await page.locator('[data-add-mode-pick="existing"]').click();
await page.locator('[data-add-existing-search]').fill('quarry board');
await page.waitForTimeout(400);
await page.locator('[data-add-existing-row="G-on"]').click();
await page.waitForTimeout(500);
d = await stored();
check((d.apartments.find(a => a.id === 'G-on').ghosts ?? []).length === 1, 'a job on the board gets another tile');
check(d.apartments.length === 3, 'nothing was copied — still three jobs');

// ── 4 · another workspace's unit lands as a unit card ───────────────────
await openAdd();
await page.locator('[data-add-mode-pick="existing"]').click();
await page.locator('[data-add-existing-search]').fill('quarryman');
await page.waitForTimeout(400);
await page.locator('[data-add-existing-row="A1-5"]').click();
await page.waitForTimeout(500);
d = await stored();
const card = (d.canvasElements ?? []).find(e => e.widget === 'unit-card');
check(card && card.data?.projectId === 'wolfson' && card.data?.aptId === 'A1-5', 'a unit card points at the Wolfson unit', JSON.stringify(card?.data));

// ── 5 · the search list comes in layers ─────────────────────────────────
await page.keyboard.press('Control+k');
await page.waitForTimeout(400);
await page.keyboard.type('quarry');
await page.waitForTimeout(600);
const layers = await page.locator('[data-search-layer]').evaluateAll(n => n.map(x => x.getAttribute('data-search-layer')));
check(layers[0] === 'jobs' && layers.includes('tasks'), 'jobs first, then tasks', layers.join());
check(layers.indexOf('jobs') < layers.indexOf('tasks'), 'the layers keep their order');
const heads = await page.locator('[data-search-layer] > div:first-child').allTextContents();
check(/Jobs\s*\d/.test(heads[0] ?? ''), 'each layer has a heading with its count', heads.join(' | '));
const tasks = await page.locator('[data-search-layer="tasks"]').textContent();
check(/Quarry the ducts/.test(tasks ?? ''), 'the task sits in its own layer');

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
