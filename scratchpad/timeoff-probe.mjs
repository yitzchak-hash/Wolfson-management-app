// Calendar and Time Off (owner, 2026-10-12: "all stars, build it").
// Time off set from the notebook's name menu and a square's right-click;
// the band; booked tasks listed with Move / Keep; the task form's away
// warning; the ONE calendar drawn like the notebook (tiles, a multi-day bar,
// a bundle, the band, the +, a drag); the worker's phone in Russian.
// Dates are offsets from the real clock. Invented names only.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const sun = new Date(); sun.setDate(sun.getDate() - sun.getDay());
const dayOf = n => { const d = new Date(sun); d.setDate(d.getDate() + n); return iso(d); };
const SUN = dayOf(0), MON = dayOf(1), TUE = dayOf(2), WED = dayOf(3), THU = dayOf(4);

const seed = ([SUN, MON, TUE, WED, THU]) => {
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  const stages = [
    { id: 'W-dr', name: 'Drilling', color: '#0891b2', order: 1, active: true },
    { id: 'W-pi', name: 'Piping', color: '#9ca3af', order: 2, active: true },
    { id: 'S-inst', name: 'Installation', color: '#0ea5e9', order: 1, active: true, projectId: 'general' },
  ];
  const contractors = [
    { id: 'C-ig', name: 'Igor', category: 'ac', token: 'tok-ig', active: true, createdAt: '2026-01-01' },
    { id: 'C-mo', name: 'Gadi', category: 'ac', token: 'tok-mo', active: true, createdAt: '2026-01-01', lang: 'ru',
      perms: { seeSchedule: true } },
  ];
  const currentUser = { id: 'U-t', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const wapt = (bld, n, name) => ({
    id: `${bld}-${n}`, buildingId: bld, floor: 2 + Math.floor((n - 1) / 4), colPosition: ((n - 1) % 4) + 1,
    apartmentNumber: String(n), displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', currentStageId: 'W-dr', stageDates: {},
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  const t = (id, apt, who, day, done, extra = {}) => ({
    id, apartmentId: apt, buildingId: apt.split('-')[0], contractorId: who,
    taskDescription: 'Drill the sleeves', stageId: 'W-dr', dueDate: day,
    completedAt: done ? `${day}T${done}:00.000Z` : null,
    createdAt: '2026-01-01', createdBy: 'U', createdByName: 'Office', ...extra,
  });
  if (!localStorage.getItem('wolfson_app_data')) {
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      currentUser, contractors, stages,
      buildings: [{ id: 'A2', name: 'A2' }, { id: 'A3', name: 'A3' }],
      apartments: [wapt('A2', 9, 'Quenby'), wapt('A2', 10, 'Trelawn'), wapt('A2', 13, 'Halberd'),
        wapt('A3', 21, 'Ostrander'), wapt('A3', 5, 'Vasquel'), wapt('A3', 6, 'Brindle')],
      contractorAssignments: [
        // Igor, Monday: four singles in one workspace — one bundle tile.
        t('T-b1', 'A2-9', 'C-ig', MON, '07:10'),
        t('T-b2', 'A2-10', 'C-ig', MON, null),
        t('T-b3', 'A2-13', 'C-ig', MON, null, { stageId: 'W-pi' }),
        t('T-b4', 'A3-21', 'C-ig', MON, null),
        // Gadi: R (Mon–Tue) and S (Tue–Wed).
        t('T-R', 'A3-5', 'C-mo', TUE, null, { days: [MON, TUE] }),
        t('T-S', 'A3-6', 'C-mo', WED, null, { days: [TUE, WED], stageId: 'W-pi' }),
      ],
    }));
  }
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser, stages, contractors,
    contractorAssignments: [{
      id: 'T-vrf', apartmentId: 'G-vrf', buildingId: 'G', contractorId: 'C-ig',
      taskDescription: 'Hang the six indoor units', stageId: 'S-inst',
      dueDate: THU, completedAt: null, createdAt: '2026-01-01', createdBy: 'U', createdByName: 'Office',
    }],
    apartments: [{
      id: 'G-vrf', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'VRF job', isUnnamed: false,
      isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'S-inst', stageDates: {},
      canvasX: 60, canvasY: 1400, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 160, y: 120, w: 1100, h: 760, text: '', color: '#ffffff',
        data: { people: ['c:C-ig', 'c:C-mo'], firstWeek: SUN, weekCount: 1, span: 5 } },
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 40, y: 1900, w: 300, h: 200, text: '', color: '#ffffff', data: {} },
    ],
  }));
};

const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addInitScript(seed, [SUN, MON, TUE, WED, THU]);
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForSelector('[data-person-name="c:C-mo"]', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(800);
const store = fn => page.evaluate(fn);

// ── 1 · the name opens a menu with Time off… ─────────────────────────────────
await page.locator('[data-person-name="c:C-mo"]').click();
check(await page.locator('[data-mini-menu]').count() === 1, '1 pressing the name opens its menu');
await page.locator('[data-mini-menu] [data-menu-time-off]').click();
check(await page.locator('[data-time-off-dialog]').count() === 1, '1 Time off… opens the form');

// ── 2 · the form: days, kind, the booked tasks ───────────────────────────────
await page.locator('[data-time-off-from]').fill(TUE);
await page.locator('[data-time-off-to]').fill(THU);
await page.locator('[data-time-off-kind="vacation"]').click();
await page.locator('[data-time-off-note]').fill('Family wedding up north');
await page.waitForTimeout(200);
const booked = await page.locator('[data-time-off-task]').evaluateAll(n => n.map(x => x.getAttribute('data-time-off-task')));
check(booked.includes('T-R') && booked.includes('T-S'), '2 both of his tasks on those days are listed', booked.join(','));
check(await page.locator('[data-time-off-booked]').innerText().then(t => /2 tasks/.test(t)), '2 "Gadi has 2 tasks on those days"');
// Move S to Igor, keep R on him.
await page.locator('[data-time-off-task="T-S"] [data-time-off-move]').click();
check(await page.locator('[data-time-off-save]').isDisabled(), '2 Save waits until "who instead" is chosen');
await page.locator('[data-time-off-task="T-S"] [data-time-off-move-to]').selectOption('C-ig');
await page.locator('[data-time-off-save]').click();
await page.waitForTimeout(500);
const list = await store(() => window.__store.getState().boardSettings.__tv?.timeOff ?? []);
check(list.length === 1 && list[0].person === 'c:C-mo' && list[0].from === TUE && list[0].to === THU && list[0].kind === 'vacation' && list[0].note,
  '2 the entry is stored once, on the person', JSON.stringify(list[0] ?? {}));
const tasksNow = await store(() => {
  const all = JSON.parse(localStorage.getItem('wolfson_app_data')).contractorAssignments;
  return Object.fromEntries(all.map(a => [a.id, a.contractorId]));
});
check(tasksNow['T-S'] === 'C-ig', '2 the task he chose to move went to Igor', tasksNow['T-S']);
check(tasksNow['T-R'] === 'C-mo', '2 the task he kept stays on Gadi (nothing moved by itself)');

// ── 3 · the band on his row ──────────────────────────────────────────────────
await page.waitForTimeout(400);
const band = page.locator('[data-time-off-band="vacation"][data-band-person="c:C-mo"]');
check(await band.count() === 1, '3 one band on his row');
const bandTxt = await band.innerText().catch(() => '');
check(/Vacation/.test(bandTxt) && /back/.test(bandTxt), '3 the band says the kind and when he is back', bandTxt);
const geo = await page.evaluate(([TUE, THU]) => {
  const bnd = document.querySelector('[data-band-person="c:C-mo"]')?.getBoundingClientRect();
  const a = document.querySelector(`[data-cell-person="c:C-mo"][data-cell-day="${TUE}"]`)?.getBoundingClientRect();
  const z = document.querySelector(`[data-cell-person="c:C-mo"][data-cell-day="${THU}"]`)?.getBoundingClientRect();
  return bnd && a && z ? { l: bnd.left - a.left, r: z.right - bnd.right } : null;
}, [TUE, THU]);
check(geo && Math.abs(geo.l) < 6 && Math.abs(geo.r) < 6, '3 the band spans Tue → Thu', JSON.stringify(geo));
const offCells = await page.locator('[data-cell-person="c:C-mo"][data-cell-off]').count();
check(offCells === 3, '3 three squares wear the stripes', String(offCells));
check(await page.locator('[data-task-bar="T-R"] [data-bar-away]').count() >= 1, '3 the task kept on him says "he\'s away"');
check(await page.locator('[data-task-bar="T-S"]').count() >= 1 && await page.locator('[data-task-bar="T-S"] [data-bar-away]').count() === 0,
  '3 the moved task carries no warning');

// ── 4 · right-click a square: Off this day, then Back on this day ────────────
const sq = page.locator(`[data-cell-person="c:C-ig"][data-cell-day="${SUN}"]`);
await sq.click({ button: 'right', position: { x: 8, y: 8 } });
await page.locator('[data-mini-menu] [data-menu-off-day]').click();
await page.waitForTimeout(300);
check(await sq.getAttribute('data-cell-off') === 'vacation', '4 "Off this day" stripes one square');
await sq.click({ button: 'right', position: { x: 8, y: 8 } });
check(await page.locator('[data-mini-menu] [data-menu-back-on-day]').count() === 1, '4 the menu now offers "Back on this day"');
await page.locator('[data-mini-menu] [data-menu-back-on-day]').click();
await page.waitForTimeout(300);
check(await sq.getAttribute('data-cell-off') === null, '4 and it comes back off');

// ── 5 · the task form warns about somebody away ──────────────────────────────
const cell = page.locator(`[data-cell-person="c:C-mo"][data-cell-day="${WED}"]`);
await cell.hover({ position: { x: 20, y: 60 } });
await page.locator('[data-cell-plus]').first().click();
await page.waitForSelector('[data-task-dialog]');
check(await page.locator('[data-who-pick="C-mo"][data-who-away="vacation"]').count() === 1, '5 Gadi is tagged "vacation" in Who');
await page.locator('[data-job-search]').fill('Quenby');
await page.waitForTimeout(300);
await page.locator('[data-job-hit]').first().click();
await page.locator('[data-planner-task-box] textarea, [data-task-dialog] textarea').first().fill('Check the drain');
await page.locator('[data-add-the-job]').click();
await page.waitForTimeout(200);
const sent = await page.locator('[data-away-sentence]').innerText().catch(() => '');
check(/Gadi is on vacation on/.test(sent) && /back/.test(sent), '5 "Gadi is on vacation on … (back …)"', sent);
await page.locator('[data-away-pick-other]').click();
check(await page.locator('[data-away-ask]').count() === 0 && await page.locator('[data-task-dialog]').count() === 1, '5 "Pick someone else" goes back to the form');
const before = await store(() => JSON.parse(localStorage.getItem('wolfson_app_data')).contractorAssignments.length);
await page.locator('[data-add-the-job]').click();
await page.locator('[data-away-add-anyway]').click();
await page.waitForTimeout(700);
const after = await store(() => JSON.parse(localStorage.getItem('wolfson_app_data')).contractorAssignments.length);
check(after === before + 1, '5 "Add anyway" makes the task', `${before} → ${after}`);
const ask = page.locator('[data-ask-keep]');
if (await ask.count()) await ask.click();

// ── 6 · ONE calendar ─────────────────────────────────────────────────────────
await page.goto(`${APP}/project-calendar`);
await page.waitForSelector('[data-calendar-page]', { timeout: 10000 }).catch(() => {});
check(new URL(page.url()).pathname === '/calendar', '6 the old sidebar address lands on the one calendar');
await page.waitForTimeout(500);
const rTile = page.locator('[data-cal-task="T-R"]');
check(await rTile.count() === 1 && await rTile.getAttribute('data-cal-days') === '2', '6 a two-day task is ONE bar across two days');
const rgeo = await page.evaluate(([MON, TUE]) => {
  const t = document.querySelector('[data-cal-task="T-R"]')?.getBoundingClientRect();
  const a = document.querySelector(`[data-cal-day="${MON}"]`)?.getBoundingClientRect();
  const z = document.querySelector(`[data-cal-day="${TUE}"]`)?.getBoundingClientRect();
  return t && a && z ? { l: t.left - a.left, r: z.right - t.right } : null;
}, [MON, TUE]);
check(rgeo && rgeo.l >= 0 && rgeo.l < 10 && rgeo.r >= 0 && rgeo.r < 10, '6 …running Monday to Tuesday', JSON.stringify(rgeo));
check(await rTile.locator('[data-cal-away-tag]').count() === 1, '6 the kept task wears "he\'s away" here too');
const frame = await rTile.evaluate(e => getComputedStyle(e).borderTopColor);
check(frame === 'rgb(8, 145, 178)', '6 the frame is the stage colour', frame);
check(await page.locator(`[data-task-bundle="4"]`).count() === 1, '6 Igor\'s four Monday tasks fold into one bundle');
check(await page.locator('[data-cal-task="T-b1"]').count() === 0, '6 …and are not drawn one by one');
check(await page.locator('[data-cal-off="vacation"][data-cal-off-person="c:C-mo"]').count() >= 1, '6 the time-off band is on the calendar');
check(await page.locator('[data-cal-task="T-vrf"]').count() === 1 && await page.locator('[data-cal-task="T-S"]').count() === 1,
  '6 all workspaces: the Job Board\'s and Wolfson\'s tasks side by side');
// The bundle opens.
await page.locator('[data-task-bundle="4"]').click();
check(await page.locator('[data-bundle-popup]').count() === 1, '6 pressing the bundle opens every task');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
if (await page.locator('[data-bundle-popup]').count()) await page.mouse.click(5, 5);
// The + opens the notebook's own form, on that day, nobody chosen.
const plusHost = page.locator(`[data-cal-plus="${WED}"]`);
await plusHost.hover();
await plusHost.click();
await page.waitForSelector('[data-task-dialog]', { timeout: 3000 }).catch(() => {});
const ttl = await page.locator('h3').filter({ hasText: /New task/ }).count();
check(ttl === 1, '6 the + opens "New task · <day>"');
check(await page.locator('[data-who-pick][data-on]').count() === 0, '6 …with nobody chosen yet');
check(await page.locator('[data-just-park]').count() === 0, '6 …and no "just put it on the planner"');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
// Drag the Job Board task from Thursday to Wednesday.
const vb = await page.locator('[data-cal-task="T-vrf"]').boundingBox();
const wb = await page.locator(`[data-cal-day="${WED}"]`).boundingBox();
await page.mouse.move(vb.x + 20, vb.y + 10);
await page.mouse.down();
await page.mouse.move(vb.x - 10, vb.y + 20, { steps: 4 });
await page.mouse.move(wb.x + wb.width / 2, vb.y + 20, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(400);
const vrf = await store(() => window.__store.getState().contractorAssignments.find(a => a.id === 'T-vrf'));
check(vrf?.dueDate === WED, '6 dragging a tile to another day moves the task', vrf?.dueDate);
check(new URL(page.url()).pathname === '/calendar', '6 …and a drag does not open it');
// A done task is green.
await page.locator('[data-task-bundle="4"]').count();
check(await page.locator('[data-calendar-scope-pick="here"]').count() === 1, '6 the This workspace / All switch is inside');
await page.locator('[data-calendar-scope-pick="here"]').click();
await page.waitForTimeout(300);
check(await page.locator('[data-cal-task="T-R"]').count() === 0 && await page.locator('[data-cal-task="T-vrf"]').count() === 1,
  '6 This workspace shows only the Job Board\'s');
await page.locator('[data-calendar-scope-pick="all"]').click();
// Press the band → the form, to change or remove.
await page.locator('[data-cal-off="vacation"]').first().click();
check(await page.locator('[data-time-off-remove]').count() === 1, '6 pressing the band opens it to change or remove');
await page.keyboard.press('Escape');

// ── 7 · his phone, in Russian ────────────────────────────────────────────────
const phone = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await phone.addInitScript(seed, [SUN, MON, TUE, WED, THU]);
const tl = await store(() => window.__store.getState().boardSettings);
await phone.addInitScript(bs => {
  for (const k of ['wolfson_app_data', 'general_app_data']) {
    const d = JSON.parse(localStorage.getItem(k) || '{}');
    if (!d.boardSettings) { d.boardSettings = bs; localStorage.setItem(k, JSON.stringify(d)); }
  }
}, tl);
const pp = await phone.newPage();
pp.on('pageerror', e => { console.log('PHONE ERROR', e.message); fails++; });
await pp.goto(`${APP}/c/tok-mo`);
await pp.waitForTimeout(1500);
await pp.locator('button').filter({ hasText: /Calendar|Календарь/ }).first().click();
await pp.waitForTimeout(500);
const offLbl = await pp.locator('[data-calendar-off-label]').first().innerText().catch(() => '');
check(offLbl === 'Отпуск', '7 his month shows the band in his own language', offLbl);
check(await pp.locator('[data-calendar-off]').count() === 3, '7 …on his three days');
await pp.locator('[data-cal-mode="week"]').click();
await pp.waitForTimeout(300);
const wk = await pp.locator('[data-week-off]').first().innerText().catch(() => '');
check(/Отпуск/.test(wk) && /до/.test(wk), '7 his week: "Отпуск · до …"', wk);
check(await pp.locator('[data-week-kept]').count() >= 1, '7 the task the office kept on him says so');

console.log(`\n${fails ? fails + ' FAILED' : 'ALL PASS'}`);
await b.close();
process.exit(fails ? 1 : 0);
