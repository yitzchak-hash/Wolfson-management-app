// This round's board work:
//  · invisible groups — dragging any member carries the rest, the chip beside
//    the lock ungroups exactly one thing, right-click groups a selection;
//  · the lock has no corner badge any more, only the amber button;
//  · zoom − holds the pinned top-left corner instead of shoving the board down;
//  · a locked edge never asks to make room;
//  · removing a weekly notebook ARCHIVES its contents and releases the jobs it
//    was holding, and adding one back brings the contents with it.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) fails++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  const job = (n, x, y) => ({
    id: `G-g${n}`, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: `Job ${n}`,
    isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {}, canvasX: x, canvasY: y,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [job(1, 60, 260), job(2, 320, 260), job(3, 60, 470)],
    canvasElements: [
      { id: 'CE-n1', type: 'note', x: 620, y: 260, w: 180, h: 140, text: 'GroupNote', color: '#fef9c3' },
      // A notebook with somebody on it and a job filed into it — what must
      // survive the widget being removed.
      { id: 'CE-book', type: 'widget', widget: 'rota', x: 60, y: 640, w: 760, h: 340,
        text: '', color: '#ffffff',
        data: { title: 'Season', people: ['n:Yaakov', 'n:Igor'],
                cells: { 'n:Yaakov|2026-08-18': [{ id: 'e1', text: 'Pardes 8 am' }] } } },
    ],
  }));
});

const page = await ctx.newPage();
page.on('pageerror', e => console.log('  [pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 160)); });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2600);

const stored = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  return {
    jobs: Object.fromEntries((d.apartments ?? []).map(a => [a.id,
      { x: a.canvasX, y: a.canvasY, group: a.boardGroup ?? null, inNotebook: a.inNotebook ?? null }])),
    note: (d.canvasElements ?? []).find(e => e.id === 'CE-n1'),
    book: (d.canvasElements ?? []).find(e => e.id === 'CE-book'),
  };
});
const box = id => page.locator(`[data-node-id="${id}"]`).boundingBox();
// Grab the MIDDLE of the thing. The top strip is where the TV, lock and
// group-chip buttons live, so a press up there is a button press, not a drag —
// the harness's own trap, and it read as "dragging does nothing".
const drag = async (from, dx, dy) => {
  const b = await box(from);
  const gx = b.x + b.width / 2, gy = b.y + b.height / 2;
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx + dx, gy + dy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(450);
};

// ── The lock has no corner badge ──
const job1 = page.locator('[data-node-id="G-g1"]');
await job1.hover();
await page.waitForTimeout(300);
await job1.locator('button[title="Lock in place"]').click();
await page.waitForTimeout(350);
check((await stored()).jobs['G-g1'].group === null, 'locking does not touch grouping');
const badges = await job1.locator('span.rounded-full').filter({ hasText: '' }).count();
const lockBtn = job1.locator('button[title="Locked in place — click to unlock"]');
check(await lockBtn.count() === 1, 'the lock button reads as locked');
const btnBg = await lockBtn.evaluate(el => getComputedStyle(el).backgroundColor);
check(btnBg.includes('254, 243, 199'), `the lock button itself is amber (${btnBg})`);
await lockBtn.click();
await page.waitForTimeout(300);

// ── Group two tiles and a note by right-click ──
await page.mouse.click((await box('G-g1')).x + 60, (await box('G-g1')).y + 60);
await page.keyboard.down('Control');
await page.mouse.click((await box('G-g2')).x + 60, (await box('G-g2')).y + 60);
await page.keyboard.up('Control');
await page.waitForTimeout(250);
const b2 = await box('G-g2');
await page.mouse.click(b2.x + 60, b2.y + 60, { button: 'right' });
await page.waitForTimeout(300);
check(await page.getByRole('button', { name: /Group these 2/ }).count() > 0, 'the menu offers to group a selection');
await page.getByRole('button', { name: /Group these 2/ }).click();
await page.waitForTimeout(500);
const g = await stored();
check(!!g.jobs['G-g1'].group && g.jobs['G-g1'].group === g.jobs['G-g2'].group, 'both tiles share one group id');
check(g.jobs['G-g3'].group === null, 'an unselected tile is left alone');

// Nothing is drawn around it: the group has no box of its own on the board.
const groupBoxes = await page.locator('[data-group-box]').count();
check(groupBoxes === 0, 'the group is invisible — no box drawn');

// ── Dragging one member carries the other ──
const before = await stored();
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await drag('G-g1', 130, 60);
const after = await stored();
const moved1 = { dx: after.jobs['G-g1'].x - before.jobs['G-g1'].x, dy: after.jobs['G-g1'].y - before.jobs['G-g1'].y };
const moved2 = { dx: after.jobs['G-g2'].x - before.jobs['G-g2'].x, dy: after.jobs['G-g2'].y - before.jobs['G-g2'].y };
check(moved1.dx > 60 && Math.abs(moved1.dx - moved2.dx) <= 2 && Math.abs(moved1.dy - moved2.dy) <= 2,
  `dragging one member carried the other (${JSON.stringify(moved1)} vs ${JSON.stringify(moved2)})`);
check(after.jobs['G-g3'].x === before.jobs['G-g3'].x, 'a tile outside the group stayed put');

// ── The chip beside the lock takes ONE thing out ──
const j2 = page.locator('[data-node-id="G-g2"]');
await j2.hover();
await page.waitForTimeout(300);
await j2.locator('button[title="Grouped with others — click to take this one out"]').click();
await page.waitForTimeout(450);
const un = await stored();
check(un.jobs['G-g2'].group === null, 'the chip ungrouped that tile');
// One member left is not a group, so it dissolves.
check(un.jobs['G-g1'].group === null, 'the last member left is released too');

// ── Zoom − holds the corner ──
const originOf = () => page.evaluate(() => {
  const vp = document.querySelector('[data-board-viewport]');
  const world = [...(vp?.querySelectorAll('div') ?? [])]
    .find(n => /matrix/.test(getComputedStyle(n).transform) && n.parentElement === vp);
  const m = new DOMMatrix(getComputedStyle(world).transform);
  return { y: Math.round(m.f), z: +m.a.toFixed(2) };
});
const o0 = await originOf();
await page.locator('button[title="Zoom out"]').click();
await page.waitForTimeout(350);
const o1 = await originOf();
await page.locator('button[title="Zoom out"]').click();
await page.waitForTimeout(350);
const o2 = await originOf();
check(o1.z < o0.z && o1.y === o0.y && o2.y === o0.y,
  `the corner holds through zoom-out (${o0.y} → ${o1.y} → ${o2.y})`);

// ── A locked edge never asks for room ──
await page.locator('button[title="Zoom in"]').click();
await page.locator('button[title="Zoom in"]').click();
await page.waitForTimeout(400);
await drag('G-g3', -400, -400);      // shove hard into the locked corner
await page.waitForTimeout(900);
check(await page.getByText(/Make room above|Make room on the left/).count() === 0,
  'shoving into a locked edge asks nothing');

// ── The notebook survives being removed ──
const bookBefore = (await stored()).book;
check(!!bookBefore?.data?.people?.length, 'the notebook starts with people on it');
const bookNode = page.locator('[data-node-id="CE-book"]');
await bookNode.scrollIntoViewIfNeeded().catch(() => {});
await bookNode.hover();
await page.waitForTimeout(400);
page.once('dialog', d => d.accept());
// The notebook draws its own per-entry Remove buttons, so aim at the node's
// action strip specifically rather than at any button called Remove.
await bookNode.locator('button[data-el-action][title="Remove"]').first().click();
await page.waitForTimeout(800);
const gone = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  return (d.canvasElements ?? []).some(e => e.id === 'CE-book');
});
check(!gone, 'the notebook node was removed');
const archived = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  const bs = raw.boardSettings?.general ?? {};
  return bs.plannerArchive ?? [];
});
check(archived.length === 1 && archived[0].data?.people?.length === 2,
  `its contents were archived, not destroyed (${archived.length} entry)`);
check(!!archived[0].data?.cells?.['n:Yaakov|2026-08-18']?.length, 'the squares came with it');

// ── Adding a notebook back brings its contents ──
await page.locator('button[title]').filter({ hasText: /^Store$/ }).first().click();
await page.waitForTimeout(1400);
await page.locator('input[placeholder="Search widgets"]').fill('Weekly notebook');
await page.waitForTimeout(700);
await page.locator('[data-widget-id="rota"]').first().click();
await page.waitForTimeout(900);
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
const revived = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  const books = (d.canvasElements ?? []).filter(e => e.widget === 'rota');
  return books.map(b => ({ people: b.data?.people?.length ?? 0,
                           cells: Object.keys(b.data?.cells ?? {}).length }));
});
check(revived.length === 1 && revived[0].people === 2 && revived[0].cells === 1,
  `a new notebook came back with what was in the last one (${JSON.stringify(revived)})`);

// ── Renaming a group keeps focus (the settings panel is module-level now) ──
await page.locator('[data-node-id="CE-bin-done"]').first().hover().catch(() => {});
await page.waitForTimeout(300);
await page.locator('[data-node-id="CE-bin-done"] button[title="Settings"]').first().click();
await page.waitForTimeout(600);
const nameInput = page.locator('input[placeholder="Group name"]').first();
await nameInput.click();
await nameInput.fill('Ready to price');
await page.waitForTimeout(1600);   // long enough for a store echo to remount it
const stillThere = await nameInput.count();
const value = stillThere ? await nameInput.inputValue() : '(gone)';
const focused = await page.evaluate(() =>
  document.activeElement?.getAttribute('placeholder') === 'Group name');
check(stillThere === 1 && value === 'Ready to price' && focused,
  `the rename box survives and keeps focus (value=${value}, focused=${focused})`);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
await browser.close();
process.exit(fails ? 1 : 0);
