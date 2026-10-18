// A second weekly notebook in plain words (owner, 2026-10-18: "now it's showing
// me that it's a projection … I should be able to change it from the settings.
// I don't even know what the difference is"). His board's exact shape: the
// original far off to the right holding the real week, a fresh copy in view
// holding months-old leftovers. The copy says what it is, flies to the
// original, and "Make this the original" moves the REAL week onto it.
import { chromium } from 'playwright';
const APP = process.env.APP || 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const seed = () => {
  localStorage.setItem('active_project', 'general'); localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01'); localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const u = { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const apt = (id, nb) => ({ id, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: id, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, canvasX: 40, canvasY: 2000, inNotebook: nb,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
  localStorage.setItem('general_app_data', JSON.stringify({ currentUser: u, users: [u],
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }],
    apartments: [apt('G-held', 'CE-main')], contractorAssignments: [],
    canvasElements: [
      { id: 'CE-copy', type: 'widget', widget: 'rota', x: 31, y: 144, w: 1061, h: 700, text: '', color: '#fff',
        data: { role: 'projection', people: ['c:C-jo'], firstWeek: '2026-07-19', weekCount: 6, cells: { stale: [] } } },
      { id: 'CE-main', type: 'widget', widget: 'rota', x: 4889, y: 56, w: 1496, h: 900, text: '', color: '#fff',
        data: { people: ['c:C-jo'], firstWeek: '2026-07-19', weekCount: 20, cells: { 'c:C-jo|2026-10-19': [{ id: 'e1', jobId: 'G-held' }] }, marker: 'real' } },
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 9000, y: 9000, w: 300, h: 300, text: '', color: '#fff', data: {} },
    ] }));
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(seed);
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`); await page.waitForSelector('[data-node-id="CE-copy"] [data-week-ribbon]', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(800);
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));
const C = '[data-node-id="CE-copy"]';

check(await page.locator(`${C} [data-week-ribbon]`).count() === 1, '1 · a copy carries the week chips too');
const tag = page.locator(`${C} [data-notebook-copy]`);
check((await tag.innerText()).includes('Copy of the notebook'), '1 · it says "Copy of the notebook", not "projection"', await tag.innerText());
check(!(await page.locator(C).innerText()).toLowerCase().includes('projection'), '1 · the word "projection" is gone from the board');

// Show the original: the far-right notebook comes on screen.
const before = await page.locator('[data-node-id="CE-main"]').boundingBox();
await page.locator(`${C} [data-notebook-goto-original]`).click();
await page.waitForTimeout(900);
const after = await page.locator('[data-node-id="CE-main"]').boundingBox();
check(before.x > 1440 && after.x < 1440 && after.x + after.width > 0, '2 · "Show the original" flies to the far-right notebook', `${Math.round(before.x)} → ${Math.round(after.x)}`);

// Back, then make the copy the original.
await page.getByRole('button', { name: /^100%$/ }).first().click().catch(() => {});
await page.waitForTimeout(700);
await page.locator(`${C} [data-notebook-make-original]`).click();
await page.waitForTimeout(800);
let d = await data();
const copy = d.canvasElements.find(e => e.id === 'CE-copy'), main = d.canvasElements.find(e => e.id === 'CE-main');
check(!copy.data.role && main.data.role === 'projection', '3 · the crown moved: this one is the original, the other a copy');
check(copy.data.marker === 'real' && copy.data.weekCount >= 20 && copy.data.cells['c:C-jo|2026-10-19']?.length === 1 && !copy.data.cells.stale,
  '3 · the REAL week moved onto it — not its months-old leftovers', JSON.stringify({ wc: copy.data.weekCount, keys: Object.keys(copy.data.cells) }));
check(d.apartments.find(a => a.id === 'G-held').inNotebook === 'CE-copy', '3 · a job filed in the notebook follows it');
check(await page.locator(`${C} [data-notebook-copy]`).count() === 0, '3 · the copy tag is gone from it');
check((await page.locator('[data-node-id="CE-main"] [data-notebook-copy]').count()) === 1, '3 · the other one now says it is the copy');

// One undo puts it all back.
await page.keyboard.press('Control+z'); await page.waitForTimeout(400);
const yes = page.getByRole('button', { name: /Yes, do it/i });
if (await yes.count()) await yes.first().click();
await page.waitForTimeout(700);
d = await data();
check(d.canvasElements.find(e => e.id === 'CE-copy').data.role === 'projection' && !d.canvasElements.find(e => e.id === 'CE-main').data.role
  && d.apartments.find(a => a.id === 'G-held').inNotebook === 'CE-main', '4 · one undo puts the original back');

// The pencil says the same thing in the same words.
await page.locator(`${C} button[title="Settings"]`).first().evaluate(b => b.click()).catch(e => console.log('no settings', e.message));
await page.waitForTimeout(500);
const role = page.locator('[data-notebook-role]');
if (await role.count()) {
  check((await role.innerText()).includes('The original') && (await role.innerText()).includes('A copy'), '5 · the pencil reads "The original / A copy"');
  await page.locator('[data-notebook-role-pick="main"]').click(); await page.waitForTimeout(700);
  d = await data();
  check(!d.canvasElements.find(e => e.id === 'CE-copy').data.role && d.canvasElements.find(e => e.id === 'CE-copy').data.marker === 'real',
    '5 · the pencil crowns it the same safe way');
} else check(false, '5 · the pencil\'s role switch is there');
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
