// Every task EDITOR draws the apartment's stages as bubbles (owner,
// 2026-09-22 — his screenshot of a plain stage dropdown on Igor's task):
// the drawer's Tasks tab, the Tasks page, and the quick-add panel's own
// edit mode. No plain stage <select> may remain in any of them, the task's
// own stages open picked, and a changed pick saves stageId + stageIds.
import { chromium } from 'playwright';
import { realisticWolfson, applySeed } from './seed.mjs';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tomorrow = iso(new Date(Date.now() + 86400000));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await applySeed(ctx, blob);
await ctx.addInitScript(due => {
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw);
  if ((d.contractorAssignments || []).some(a => a.id === 'T-BUB')) return;
  // The seed stores NO stage list (the app fills its defaults on load), and
  // the Wolfson split retires s1/s4/s7 on arrival — so the task is seeded
  // on 's2' (Concealed Units), a default stage that stays as it is.
  const worker = (d.contractors || [])[0];
  d.contractorAssignments = [
    { id: 'T-BUB', apartmentId: 'A1-53', buildingId: 'A1', contractorId: worker?.id,
      taskDescription: 'Bubble edit test', stageId: 's2', stageIds: ['s2'],
      dueDate: due, priority: 'normal',
      createdAt: '2026-08-01', createdBy: 'U', createdByName: 'Office', completedAt: null },
  ];
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}, tomorrow);

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message.slice(0, 160)));

const readTask = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
  const t = (d.contractorAssignments || []).find(a => a.id === 'T-BUB');
  const order = Object.fromEntries((d.stages || []).map(s => [s.id, s.order]));
  return t ? { stageId: t.stageId, stageIds: t.stageIds ?? null, order } : null;
});

// The form under test: bubbles present, no stage dropdown, the task's own
// stages picked — and the id of one unpicked bubble to press.
const inspect = scope => page.evaluate(scope => {
  const root = document.querySelector(scope) || document;
  const box = root.querySelector('[data-task-edit-stages]');
  if (!box) return { present: false };
  const picks = [...box.querySelectorAll('[data-stage-pick]')];
  const form = box.closest('form') || box.parentElement?.parentElement || box.parentElement;
  const selects = [...(form?.querySelectorAll('select') ?? [])]
    .filter(s => [...s.options].some(o => /piping|concealed|wall units|registers|sold/i.test(o.textContent || '')));
  return {
    present: true,
    count: picks.length,
    on: picks.filter(p => p.hasAttribute('data-on')).map(p => p.getAttribute('data-stage-pick')),
    off: picks.filter(p => !p.hasAttribute('data-on')).map(p => p.getAttribute('data-stage-pick')),
    stageSelects: selects.length,
  };
}, scope);

await page.goto('http://localhost:5173/project');
await page.waitForTimeout(3500);
const before = await readTask();
check(!!before && before.stageId, 'the seeded task carries one stage', JSON.stringify(before?.stageIds));

// ── 1. the drawer's Tasks tab ─────────────────────────────────────────────
await page.locator('[data-apt-id="A1-53"]').first().click();
await page.waitForTimeout(2500);
await page.locator('.drawer-panel button:has-text("Tasks")').first().click();
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const edit = [...document.querySelectorAll('.drawer-panel button')].find(b => /edit task/i.test(b.getAttribute('title') || ''));
  edit?.click();
});
await page.waitForTimeout(800);
let f = await inspect('.drawer-panel');
check(f.present && f.count >= 3, 'the drawer\'s task editor draws the stage bubbles', `bubbles ${f.count ?? 0}`);
check(f.present && f.stageSelects === 0, 'and no plain stage dropdown is left in it', `selects ${f.stageSelects}`);
check(f.present && f.on.length === 1 && f.on[0] === before.stageId, 'the task\'s own stage opens picked', JSON.stringify(f.on));
const extra = f.off?.[0];
await page.locator(`.drawer-panel [data-task-edit-stages] [data-stage-pick="${extra}"]`).click();
await page.waitForTimeout(200);
await page.locator('.drawer-panel [data-task-edit-save]').click();
await page.waitForTimeout(900);
let after = await readTask();
const wantTwo = [before.stageId, extra].sort((a, b) => after.order[a] - after.order[b]);
check(JSON.stringify(after.stageIds) === JSON.stringify(wantTwo), 'saving writes both stages, in settings order', `${JSON.stringify(after.stageIds)} vs ${JSON.stringify(wantTwo)}`);
check(after.stageId === wantTwo[0], 'and stageId is the first of them', after.stageId);
const pill = await page.evaluate(() => document.querySelector('.drawer-panel [data-stage-pill]')?.textContent?.trim() ?? '');
check(pill.length > 0, 'the task card shows its stages as chips', pill.slice(0, 60));

// ── 2. the quick-add panel's own edit mode ────────────────────────────────
await page.locator('.drawer-panel button:has-text("Add Task")').first().click();
await page.waitForTimeout(1200);
const qaPresent = await page.locator('[data-edit-task="T-BUB"]').count();
if (qaPresent) {
  await page.locator('[data-edit-task="T-BUB"]').first().click();
  await page.waitForTimeout(600);
  f = await inspect('body');
  check(f.present && f.count >= 3, 'the quick-add panel\'s editor draws the bubbles too', `bubbles ${f.count ?? 0}`);
  check(f.present && f.stageSelects === 0, 'with no stage dropdown', `selects ${f.stageSelects}`);
  check(f.present && f.on.length === 2, 'and both saved stages open picked', JSON.stringify(f.on));
  // Unpick the extra one there.
  await page.locator(`[data-task-edit-stages] [data-stage-pick="${extra}"]`).first().click();
  await page.waitForTimeout(200);
  await page.locator('[data-task-edit-save]').first().click();
  await page.waitForTimeout(900);
  after = await readTask();
  check(JSON.stringify(after.stageIds) === JSON.stringify([before.stageId]) && after.stageId === before.stageId,
    'unpicking there saves one stage again', JSON.stringify(after.stageIds));
} else {
  check(false, 'the quick-add panel lists the task with an edit button');
}
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// ── 3. the Tasks page ─────────────────────────────────────────────────────
await page.goto('http://localhost:5173/tasks');
await page.waitForTimeout(2500);
await page.locator('[data-edit-task="T-BUB"]').first().click();
await page.waitForTimeout(800);
f = await inspect('body');
check(f.present && f.count >= 3, 'the Tasks page editor draws the bubbles', `bubbles ${f.count ?? 0}`);
check(f.present && f.stageSelects === 0, 'and no stage dropdown', `selects ${f.stageSelects}`);
check(f.present && f.on.length === 1 && f.on[0] === before.stageId, 'the task\'s stage opens picked there', JSON.stringify(f.on));
const extra2 = f.off?.[0];
await page.locator(`[data-task-edit-stages] [data-stage-pick="${extra2}"]`).first().click();
await page.waitForTimeout(200);
await page.locator('[data-task-edit-save]').first().click();
await page.waitForTimeout(900);
after = await readTask();
const want2 = [before.stageId, extra2].sort((a, b) => after.order[a] - after.order[b]);
check(JSON.stringify(after.stageIds) === JSON.stringify(want2) && after.stageId === want2[0],
  'the Tasks page saves the pair in order with stageId first', `${JSON.stringify(after.stageIds)} / ${after.stageId}`);

// ── nothing crashed ───────────────────────────────────────────────────────
check(errs.length === 0, 'no page errors', errs[0] || '');

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
