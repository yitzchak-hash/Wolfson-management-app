// The recording of 12 Oct 2026 (14:17): the notebook decluttered, the
// calendar readable, the worker's name where it belongs.
//  · a busy day where everything is done wears the done tile's green and does
//    not say its count twice; no building lines on it;
//  · a finished tile does not say "N days";
//  · what has to be done shows on hover only;
//  · the strip runs orange → green along the bar, not stage colours;
//  · the worker's name sits in the middle of its row, and a right-click on it
//    opens HIS menu, never the board's;
//  · the calendar's tiles are a size up and lead with the worker in his colour;
//  · a Job Board job on the Tasks page is its name, never "G · Apt <name>".
// Dates are offsets from the real clock. No real client family names.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const sun = new Date(); sun.setDate(sun.getDate() - sun.getDay());
const dayOf = n => { const d = new Date(sun); d.setDate(d.getDate() + n); return iso(d); };
const SUN = dayOf(0), MON = dayOf(1), TUE = dayOf(2), WED = dayOf(3), THU = dayOf(4);

const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addInitScript(([SUN, MON, TUE, WED, THU]) => {
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  localStorage.setItem('calendar_scope', 'all');
  const stages = [
    { id: 'W-dr', name: 'Drilling', color: '#0891b2', order: 1, active: true },
    { id: 'W-pi', name: 'Piping', color: '#9ca3af', order: 2, active: true },
    { id: 'W-wa', name: 'Wall Units', color: '#f59e0b', order: 3, active: true },
    { id: 'S-inst', name: 'Installation', color: '#0ea5e9', order: 1, active: true, projectId: 'general' },
  ];
  const contractors = [
    { id: 'C-ig', name: 'Igor', category: 'ac', token: 'tok-ig', active: true, createdAt: '2026-01-01', color: '#7c3aed' },
    { id: 'C-mo', name: 'Moshe', category: 'ac', token: 'tok-mo', active: true, createdAt: '2026-01-01' },
  ];
  const currentUser = { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const wapt = (bld, n, name, extra = {}) => ({
    id: `${bld}-${n}`, buildingId: bld, floor: 2 + Math.floor((n - 1) / 4), colPosition: ((n - 1) % 4) + 1,
    apartmentNumber: String(n), displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', currentStageId: 'W-dr', stageDates: {},
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', ...extra,
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
      apartments: [
        wapt('A2', 9, 'Alpha'), wapt('A2', 10, 'Bravo'), wapt('A2', 13, 'Charlie'), wapt('A3', 21, 'Delta'),
        wapt('A3', 14, 'Foxtrot', { bubbles: true, stageMarks: { 'W-dr': 'done', 'W-pi': 'done' }, currentStageId: 'W-pi' }),
        wapt('A3', 5, 'Golf'),
      ],
      contractorAssignments: [
        // Monday: four singles, ALL done — one green bundle.
        t('T-b1', 'A2-9', 'C-ig', MON, '07:10'),
        t('T-b2', 'A2-10', 'C-ig', MON, '08:10'),
        t('T-b3', 'A2-13', 'C-ig', MON, '08:40'),
        t('T-b4', 'A3-21', 'C-ig', MON, '09:10'),
        // Wednesday: an open task with words, on a flat two stages along.
        t('T-open', 'A3-14', 'C-ig', WED, null, { taskDescription: 'Hang the wall units' , stageId: 'W-wa' }),
        // Moshe: a finished two-day task.
        t('T-2d', 'A3-5', 'C-mo', TUE, '15:00', { days: [MON, TUE], stageId: 'W-pi' }),
      ],
    }));
  }
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser, stages, contractors,
    contractorAssignments: [{
      id: 'T-vrf', apartmentId: 'G-vrf', buildingId: 'G', contractorId: 'C-ig',
      taskDescription: 'Hang the indoor units', stageId: 'S-inst',
      dueDate: THU, completedAt: null, createdAt: '2026-01-01', createdBy: 'U', createdByName: 'Office',
    }],
    apartments: [{
      id: 'G-vrf', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'VRF job', isUnnamed: false,
      isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'S-inst', stageDates: {},
      canvasX: 60, canvasY: 1400, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 160, y: 120, w: 1100, h: 760, text: '', color: '#ffffff',
        data: { people: ['c:C-ig', 'c:C-mo'], firstWeek: SUN, weekCount: 1, span: 5, cells: {} } },
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 40, y: 1900, w: 300, h: 200, text: '', color: '#ffffff', data: {} },
    ],
  }));
}, [SUN, MON, TUE, WED, THU]);

const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForSelector('[data-task-bar]', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1200);

// ── 1 · the all-done busy day ────────────────────────────────────────────
{
  const bun = await page.evaluate(() => {
    const el = document.querySelector('[data-task-bundle]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      text: el.textContent, bg: cs.backgroundColor, border: cs.borderTopColor,
      done: el.querySelector('[data-bundle-done-txt]')?.textContent ?? '',
      seeAll: (el.querySelector('[data-bundle-see-all]')?.textContent ?? '').trim(),
    };
  });
  check(!!bun, '1 · the four singles fold into one busy-day tile');
  check(bun?.border === 'rgb(22, 163, 74)' && bun?.bg === 'rgb(240, 253, 244)', '1 · all done → the done tile’s green frame and ground', `${bun?.border} · ${bun?.bg}`);
  check(/^\s*done\s*$/i.test(bun?.done ?? '') , '1 · it says "done", not the count a second time', bun?.done);
  check(bun?.seeAll === 'See all ›', '1 · and "See all ›" without the number', bun?.seeAll);
  check(!/apartment|A2|A3/.test(bun?.text ?? ''), '1 · no building lines', bun?.text);
}

// ── 2 · a finished tile does not say how many days ───────────────────────
check(await page.locator('[data-task-bar="T-2d"]').count() > 0, '2 · the finished two-day task is on the notebook');
check(await page.locator('[data-task-bar="T-2d"] [data-bar-days-count]').count() === 0, '2 · and it carries no "2 days"');

// ── 3 · the words show on hover only ─────────────────────────────────────
{
  const sel = '[data-task-bar="T-open"] [data-bar-desc]';
  const rest = await page.evaluate(s => getComputedStyle(document.querySelector(s)).display, sel);
  const box = await page.locator('[data-task-bar="T-open"]').boundingBox();
  const h0 = box.height;
  await page.mouse.move(box.x + box.width / 2, box.y + 8);
  await page.waitForTimeout(250);
  const hov = await page.evaluate(s => getComputedStyle(document.querySelector(s)).display, sel);
  const h1 = (await page.locator('[data-task-bar="T-open"]').boundingBox()).height;
  check(rest === 'none', '3 · at rest the task’s words are not on the tile', rest);
  check(hov === 'block', '3 · on hover they show', hov);
  check(Math.abs(h1 - h0) < 1, '3 · and the tile’s height does not move', `${h0} → ${h1}`);
  await page.mouse.move(5, 5);
}

// ── 4 · the strip heads from orange to green ─────────────────────────────
{
  const segs = await page.evaluate(() => [...document.querySelectorAll('[data-task-bar="T-open"] [data-bar-strip-seg]')]
    .map(s => ({ st: s.getAttribute('data-bar-strip-seg'), c: getComputedStyle(s).backgroundColor })));
  console.log('       segs:', JSON.stringify(segs));
  check(segs[0]?.st === 'done' && segs[0]?.c === 'rgb(249, 115, 22)', '4 · the first done stage is orange', segs[0]?.c);
  check(segs[1]?.st === 'done' && segs[1]?.c !== 'rgb(156, 163, 175)' && segs[1]?.c !== segs[0]?.c, '4 · the next is further along the orange → green run, not its stage colour', segs[1]?.c);
  check(segs[2]?.st !== 'done' && segs[2]?.c === 'rgb(229, 231, 235)', '4 · what is still to do stays grey', segs[2]?.c);
}

// ── 5 · the name in the middle, and its own right-click ──────────────────
{
  const align = await page.evaluate(() => getComputedStyle(document.querySelector('[data-person-name="c:C-ig"]')).alignItems);
  check(align === 'center', '5 · the worker’s name sits in the middle of its row', align);
  await page.locator('[data-person-name="c:C-ig"]').first().click({ button: 'right' });
  await page.waitForTimeout(400);
  const menu = await page.evaluate(() => document.querySelector('[data-mini-menu]')?.textContent ?? '');
  check(/Time off/i.test(menu), '5 · a right-click on the name opens his menu (Time off…)', menu.slice(0, 80));
  const boardMenu = await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Bring to front/.test(b.textContent ?? '')));
  check(!boardMenu, '5 · and not the board’s node menu');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// ── 6 · the calendar ─────────────────────────────────────────────────────
{
  await page.goto(`${APP}/calendar`);
  await page.waitForSelector('[data-cal-task]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const t = await page.evaluate(() => {
    const el = document.querySelector('[data-cal-task="T-open"]');
    if (!el) return null;
    const w = el.querySelector('[data-cal-worker]');
    const lab = el.querySelector('[data-cal-label]');
    return {
      worker: w?.textContent ?? '', wbg: w ? getComputedStyle(w).backgroundColor : '', wfg: w ? getComputedStyle(w).color : '',
      fs: lab ? parseFloat(getComputedStyle(lab).fontSize) : 0,
      first: w ? w.parentElement.firstElementChild === w : false,
    };
  });
  check(t?.worker === 'Igor' && t?.wbg === 'rgb(124, 58, 237)' && t?.wfg === 'rgb(255, 255, 255)', '6 · the worker is a chip in his own colour', JSON.stringify(t));
  check(!!t?.first, '6 · and leads its line');
  check((t?.fs ?? 0) >= 13, '6 · the tile’s name is a size up', String(t?.fs));
}

// ── 7 · the Tasks page names a Job Board job by its name ─────────────────
{
  await page.goto(`${APP}/tasks`);
  await page.waitForSelector('[data-open-task="T-vrf"]', { timeout: 15000 }).catch(() => {});
  const txt = (await page.locator('[data-open-task="T-vrf"]').first().textContent().catch(() => '')).trim();
  check(txt === 'VRF job', '7 · "VRF job", never "G · Apt VRF job"', txt);
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
