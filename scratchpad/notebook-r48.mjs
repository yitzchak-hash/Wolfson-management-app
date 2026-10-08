// Round 48 — a worker who does a small task in twenty apartments a day
// (owner, 2026-10-08). Four asks:
//   1. the notebook BUNDLES 4+ single-day tasks of one person, one day, one
//      workspace into one bar; a press opens a window with every task and
//      the building lit;
//   2. a right-click on a notebook bar or card does nothing — no "Take this
//      off this day?" ask, no browser menu;
//   3. the office calendars fold one worker's DONE tasks in one workspace
//      into one chip a day, and "+N more" opens a day list;
//   4. the Tasks page says which workspace(s) it shows, shows its filters
//      as chips, and lists open work first with done below a divider.
// Dates are offsets from the real clock (the standing drift rule). No real
// client family names — the units carry made-up ones.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const sun = new Date(); sun.setDate(sun.getDate() - sun.getDay());
const dayOf = n => { const d = new Date(sun); d.setDate(d.getDate() + n); return iso(d); };
const SUN = dayOf(0), MON = dayOf(1), TUE = dayOf(2), WED = dayOf(3), THU = dayOf(4);

/** Everything the round needs, written once (the app's own writes survive a navigation). */
async function seedCtx(ctx, { active = 'general', scope } = {}) {
  await ctx.addInitScript(([active, scope, SUN, MON, TUE, WED, THU]) => {
    if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', active);
    if (scope && !localStorage.getItem('tasks_scope')) localStorage.setItem('tasks_scope', scope);
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    localStorage.setItem('board_default_zoom_general', '1');
    const stages = [
      { id: 'W-dr', name: 'Drilling', color: '#0891b2', order: 1, active: true },
      { id: 'W-pi', name: 'Piping', color: '#9ca3af', order: 2, active: true },
      { id: 'S-pipe', name: 'Piping', color: '#6366f1', order: 1, active: true, projectId: 'general' },
    ];
    const contractors = [
      { id: 'C-ig', name: 'Igor', category: 'ac', token: 'tok-ig', active: true, createdAt: '2026-01-01' },
      { id: 'C-mo', name: 'Moshe', category: 'ac', token: 'tok-mo', active: true, createdAt: '2026-01-01' },
    ];
    const currentUser = { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
    const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
    const wapt = (b, n) => ({
      id: `${b}-${n}`, buildingId: b, floor: 2 + Math.floor((n - 1) / 4), colPosition: ((n - 1) % 4) + 1,
      apartmentNumber: String(n), displayName: `${NAMES[n % NAMES.length]}-${n}`, isUnnamed: false, isDuplexApt: false,
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
      const apts = [];
      for (const n of [1, 2, 3, 4, 5, 6, 9, 10, 11, 12]) apts.push(wapt('A1', n));
      for (const n of [13, 14, 15, 16]) apts.push(wapt('A3', n));
      localStorage.setItem('wolfson_app_data', JSON.stringify({
        currentUser, contractors, stages,
        buildings: [{ id: 'A1', name: 'A1' }, { id: 'A3', name: 'A3' }],
        apartments: apts,
        contractorAssignments: [
          // Monday: five single-day reports in Wolfson — four done, one open.
          t('T-b1', 'A1-9', 'C-ig', MON, '07:10'),
          t('T-b2', 'A1-10', 'C-ig', MON, '08:20'),
          t('T-b3', 'A1-11', 'C-ig', MON, '09:30'),
          t('T-b4', 'A1-12', 'C-ig', MON, '10:40'),
          t('T-b5', 'A3-13', 'C-ig', MON, null),
          // A two-day task — a stretch, never bundled.
          t('T-multi', 'A3-14', 'C-ig', WED, null, { days: [TUE, WED], taskDescription: 'Two-day piping' }),
          // Wednesday: only two singles — under the bundle line.
          t('T-w1', 'A3-15', 'C-ig', WED, null),
          t('T-w2', 'A3-16', 'C-ig', WED, null),
          // Tuesday: six open tasks of somebody else — a busy calendar day.
          ...[1, 2, 3, 4, 5, 6].map(n => t(`T-m${n}`, `A1-${n}`, 'C-mo', TUE, null, { taskDescription: `Fan ${n}` })),
        ],
      }));
    }
    if (localStorage.getItem('general_app_data')) return;
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser, stages, contractors,
      contractorAssignments: [{
        id: 'T-g1', apartmentId: 'G-cohen', buildingId: 'G', contractorId: 'C-ig', taskDescription: 'Measure the roof',
        stageId: 'S-pipe', dueDate: THU, completedAt: null, createdAt: '2026-01-01', createdBy: 'U', createdByName: 'Office',
      }],
      apartments: [{
        id: 'G-cohen', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Kilo', isUnnamed: false,
        isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'S-pipe', stageDates: {},
        canvasX: 60, canvasY: 720, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
      }],
      canvasElements: [
        { id: 'CE-rota', type: 'widget', widget: 'rota', x: 300, y: 130, w: 960, h: 460, text: '', color: '#ffffff',
          data: { people: ['c:C-ig'], firstWeek: SUN, weekCount: 1, span: 5, cells: {} } },
        { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 40, y: 1500, w: 300, h: 200, text: '', color: '#ffffff', data: {} },
      ],
    }));
  }, [active, scope ?? null, SUN, MON, TUE, WED, THU]);
}
const wdata = page => page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data') || '{}'));

// ═══ 1 + 2 · the notebook ═══════════════════════════════════════════════════
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
  await seedCtx(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/jobs`);
  await page.waitForSelector('[data-task-bar]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);

  const state = await page.evaluate(() => ({
    bundles: [...document.querySelectorAll('[data-task-bundle]')].map(el => ({
      n: el.getAttribute('data-task-bundle'), ws: el.getAttribute('data-bundle-ws'),
      done: el.getAttribute('data-bundle-done'), text: el.textContent,
      h: el.getBoundingClientRect().height,
      day: el.closest('[data-cell-day]')?.getAttribute('data-cell-day'),
    })),
    bars: [...document.querySelectorAll('[data-task-bar]')].map(el => ({
      id: el.getAttribute('data-task-bar'), h: el.getBoundingClientRect().height,
    })),
  }));
  const bars = state.bars.map(x => x.id);
  check(state.bundles.length === 1, '1 · Monday’s five Wolfson reports draw as ONE bundle', JSON.stringify(state.bundles.map(x => x.n)));
  const bun = state.bundles[0];
  check(bun?.n === '5' && bun?.ws === 'wolfson' && bun?.done === '4', '1 · the bundle holds 5, in Wolfson, 4 done', JSON.stringify(bun));
  check(bun?.day === MON, '1 · it sits on Monday’s square', bun?.day);
  check(/5 tasks/.test(bun?.text ?? '') && /Wolfson/.test(bun?.text ?? '') && /4 done/.test(bun?.text ?? ''),
    '1 · it reads "5 tasks · Wolfson · 4 done"', bun?.text);
  check(!['T-b1', 'T-b2', 'T-b3', 'T-b4', 'T-b5'].some(id => bars.includes(id)), '1 · none of the five is drawn on its own', bars.join(','));
  check(bars.includes('T-multi'), '1 · the two-day task stays its own bar', bars.join(','));
  check(bars.includes('T-w1') && bars.includes('T-w2'), '1 · two singles on Wednesday are under the line and stay bars');
  // Look A (2026-10-08): a tile is as tall as its words, so the bundle is no
  // longer a bar's height. What must hold is that it is ONE tile in ONE lane:
  // nothing else in its square lies under it.
  const lane = await page.evaluate(() => {
    const el = document.querySelector('[data-task-bundle]');
    const cell = el?.closest('[data-cell-day]');
    if (!el || !cell) return null;
    const kids = [...cell.children].map(k => k.getBoundingClientRect()).filter(r => r.height > 0);
    const overlaps = kids.some((a, i) => kids.some((b, j) => j > i && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5));
    return { overlaps, n: document.querySelectorAll('[data-task-bundle]').length };
  });
  check(lane && !lane.overlaps && bun?.h > 0, '1 · the bundle is ONE tile in ONE lane — nothing in its square lies under it', JSON.stringify(lane));

  // ── the window ──
  await page.locator('[data-task-bundle]').click();
  await page.waitForSelector('[data-bundle-popup]', { timeout: 4000 }).catch(() => {});
  const pop = await page.evaluate(() => {
    const p = document.querySelector('[data-bundle-popup]');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return {
      person: p.querySelector('[data-bundle-person]')?.textContent ?? '',
      ws: p.querySelector('[data-bundle-ws-chip]')?.textContent ?? '',
      rows: [...p.querySelectorAll('[data-bundle-row]')].map(el => ({
        id: el.getAttribute('data-bundle-row'), done: el.getAttribute('data-bundle-row-done'), text: el.textContent,
      })),
      cells: [...p.querySelectorAll('[data-bundle-cell]')].map(el => ({
        id: el.getAttribute('data-bundle-cell'), state: el.getAttribute('data-bundle-cell-state'),
      })),
      buildings: [...p.querySelectorAll('[data-bundle-building]')].map(el => el.getAttribute('data-bundle-building')),
      centred: Math.abs((r.left + r.width / 2) - innerWidth / 2) < 4 && Math.abs((r.top + r.height / 2) - innerHeight / 2) < 4,
      inBody: p.parentElement?.parentElement === document.body,
    };
  });
  check(!!pop, '1 · pressing the bundle opens its window');
  check(pop?.centred && pop?.inBody, '1 · centred, portalled to the body', JSON.stringify({ c: pop?.centred, b: pop?.inBody }));
  check(/Igor/.test(pop?.person ?? '') && pop?.ws === 'Wolfson', '1 · it names the person, the day and the workspace', `${pop?.person} / ${pop?.ws}`);
  check(pop?.rows.length === 5, '1 · every task is a row', String(pop?.rows.length));
  check(pop?.rows[0]?.id === 'T-b5' && pop?.rows[0]?.done === '0', '1 · the open one leads the list', pop?.rows[0]?.id);
  check(pop?.rows.filter(r => r.done === '1').length === 4, '1 · four rows are marked done');
  check(/9 — /.test(pop?.rows.find(r => r.id === 'T-b1')?.text ?? '') && /Drilling/.test(pop?.rows.find(r => r.id === 'T-b1')?.text ?? ''),
    '1 · a row names the unit and its stage', pop?.rows.find(r => r.id === 'T-b1')?.text);
  check(/\d{2}:\d{2}/.test(pop?.rows.find(r => r.id === 'T-b1')?.text ?? ''), '1 · a done row says when it closed');
  check(pop?.buildings.join(',') === 'A1,A3', '1 · the building visual draws the workspace’s buildings', pop?.buildings.join(','));
  const lit = Object.fromEntries((pop?.cells ?? []).map(c => [c.id, c.state]));
  check(lit['A1-9'] === 'done' && lit['A1-12'] === 'done' && lit['A3-13'] === 'open' && Object.keys(lit).length === 5,
    '1 · the five apartments are lit — done green, open amber', JSON.stringify(lit));
  const cellColor = await page.evaluate(() => getComputedStyle(document.querySelector('[data-bundle-cell="A1-9"]')).backgroundColor);
  check(cellColor === 'rgb(22, 163, 74)', '1 · a done cell is green', cellColor);
  await page.screenshot({ path: 'scratchpad/notebook-r48-popup.png' });

  // A press inside the window must not leak to the board node behind it.
  await page.locator('[data-bundle-popup] h4').first().click();
  check(await page.locator('[data-bundle-popup]').count() === 1, '1 · a press inside the window keeps it open (sealed)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check(await page.locator('[data-bundle-popup]').count() === 0, '1 · Escape closes the window');
  check(await page.locator('[data-node-id="CE-rota"]').count() === 1, '1 · and the notebook is still there');

  // ── 2 · right-click on a bar ──
  await page.evaluate(() => {
    window.__menus = [];
    window.addEventListener('contextmenu', e => setTimeout(() => window.__menus.push(e.defaultPrevented), 0), true);
  });
  const multi = page.locator('[data-task-bar="T-multi"]');
  const mb = await multi.boundingBox();
  await page.mouse.click(mb.x + 30, mb.y + mb.height / 2, { button: 'right' });
  await page.waitForTimeout(300);
  const after1 = await page.evaluate(() => ({ menus: window.__menus, text: document.body.innerText }));
  check(after1.menus.length === 1 && after1.menus[0] === true, '2 · a right-click on a bar shows no browser menu', JSON.stringify(after1.menus));
  check(!/off this day\?/.test(after1.text), '2 · and no "Take this off this day?" ask');
  check(await page.locator('.drawer-panel').count() === 0, '2 · and opens nothing');
  // The fault itself: a right press that wanders, then lets go (the browser
  // menu used to steal the release and the move read as a drag off the sheet).
  await page.mouse.move(mb.x + 30, mb.y + mb.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(mb.x + 80, mb.y + 260, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(350);
  const t2 = await page.evaluate(() => document.body.innerText);
  check(!/off this day\?/.test(t2), '2 · a wandering right press asks nothing either');
  const multiAfter = (await wdata(page)).contractorAssignments.find(a => a.id === 'T-multi');
  check(JSON.stringify(multiAfter?.days) === JSON.stringify([TUE, WED]), '2 · and the task’s days are untouched', JSON.stringify(multiAfter?.days));
  // Left click still means open.
  check(await page.locator('[data-task-bar="T-w1"]').count() === 1, '2 · (a bar to left-click)');

  // ── 1 · a row travels to the unit ──
  await page.locator('[data-task-bundle]').click();
  await page.waitForSelector('[data-bundle-popup]');
  await page.locator('[data-bundle-row="T-b2"]').click();
  await page.waitForTimeout(2500);
  const there = await page.evaluate(() => ({
    url: location.pathname, pid: window.__store?.getState().currentProjectId,
    drawer: !!document.querySelector('.drawer-panel'), popup: !!document.querySelector('[data-bundle-popup]'),
    head: document.querySelector('.drawer-panel')?.textContent?.slice(0, 200) ?? '',
  }));
  check(!there.popup, '1 · pressing a row closes the window');
  check(there.pid === 'wolfson' && there.url === '/project', '1 · and travels to the unit’s workspace', JSON.stringify({ u: there.url, p: there.pid }));
  check(there.drawer && /10/.test(there.head), '1 · with the apartment’s window open', there.head.slice(0, 80));
  await ctx.close();
}

// ═══ 3 · the office calendars ═══════════════════════════════════════════════
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
  await seedCtx(ctx, { active: 'wolfson' });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/calendar`);
  await page.waitForSelector(`[data-calendar-day="${MON}"]`, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
  const mon = await page.evaluate(d => {
    const cell = document.querySelector(`[data-calendar-day="${d}"]`);
    const kids = [...cell.querySelectorAll('[data-calendar-ev],[data-calendar-fold]')];
    return {
      order: kids.map(k => k.hasAttribute('data-calendar-fold') ? `fold:${k.getAttribute('data-calendar-fold')}` : `ev:${k.getAttribute('data-calendar-ev-done')}`),
      foldText: cell.querySelector('[data-calendar-fold]')?.textContent ?? '',
      struck: [...cell.querySelectorAll('*')].some(n => getComputedStyle(n).textDecorationLine.includes('line-through')),
    };
  }, MON);
  check(mon.order.join(',') === 'ev:0,fold:4', '3 · Monday: the open task first, then ONE folded chip of 4', mon.order.join(','));
  check(/Igor/.test(mon.foldText) && /Wolfson/.test(mon.foldText) && /4 done/.test(mon.foldText) && /✓/.test(mon.foldText),
    '3 · the chip reads "Igor · Wolfson · 4 done ✓"', mon.foldText);
  check(!mon.struck, '3 · nothing on the day is struck through');
  await page.locator(`[data-calendar-day="${MON}"] [data-calendar-fold]`).click();
  await page.waitForSelector('[data-calendar-daylist]', { timeout: 3000 }).catch(() => {});
  const fold = await page.evaluate(() => ({
    n: document.querySelector('[data-calendar-daylist]')?.getAttribute('data-calendar-daylist'),
    rows: document.querySelectorAll('[data-calendar-daylist-row]').length,
  }));
  check(fold.n === '4' && fold.rows === 4, '3 · pressing the chip lists its four tasks', JSON.stringify(fold));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(await page.locator('[data-calendar-daylist]').count() === 0, '3 · Escape closes the list');

  const tue = await page.evaluate(d => {
    const cell = document.querySelector(`[data-calendar-day="${d}"]`);
    return {
      shown: cell.querySelectorAll('[data-calendar-ev],[data-calendar-fold]').length,
      more: cell.querySelector('[data-calendar-more]')?.getAttribute('data-calendar-more'),
      moreText: cell.querySelector('[data-calendar-more]')?.textContent ?? '',
    };
  }, TUE);
  check(tue.shown === 5 && tue.more === '2', '3 · Tuesday’s seven open tasks: five drawn, "+2"', JSON.stringify(tue));
  check(/\+2 more/.test(tue.moreText), '3 · it says "+2 more"', tue.moreText);
  await page.locator(`[data-calendar-day="${TUE}"] [data-calendar-more]`).click();
  await page.waitForSelector('[data-calendar-daylist]', { timeout: 3000 }).catch(() => {});
  check(await page.locator('[data-calendar-daylist-row]').count() === 7, '3 · "+2 more" opens the whole day as a list');
  await page.locator('[data-calendar-daylist-row]').first().click();
  await page.waitForTimeout(1200);
  check(page.url().includes('/tasks'), '3 · a row in the list keeps its own click (to Tasks)', page.url());

  // The workspace's own calendar folds the same way.
  await page.goto(`${APP}/project-calendar`);
  await page.waitForSelector(`[data-calendar-day="${MON}"]`, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
  const pc = await page.evaluate(d => document.querySelector(`[data-calendar-day="${d}"] [data-calendar-fold]`)?.getAttribute('data-calendar-fold'), MON);
  check(pc === '4', '3 · the project calendar folds too', String(pc));
  await ctx.close();
}

// ═══ 4 · the Tasks page ═════════════════════════════════════════════════════
{
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  await seedCtx(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/tasks`);
  await page.waitForSelector('[data-task-scope="here"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  const scopeText = await page.evaluate(() => ({
    here: document.querySelector('[data-task-scope="here"]')?.textContent ?? '',
    all: document.querySelector('[data-task-scope="all"]')?.textContent ?? '',
    on: document.querySelector('[data-task-scope][data-on]')?.getAttribute('data-task-scope'),
    rows: document.querySelectorAll('[data-task-row]').length,
  }));
  check(scopeText.here === 'This workspace (1)' && scopeText.all === 'All workspaces (15)',
    '4 · the switch says what each scope holds', `${scopeText.here} | ${scopeText.all}`);
  check(scopeText.on === 'here' && scopeText.rows === 1, '4 · this workspace by default — one row', JSON.stringify(scopeText));

  await page.locator('[data-task-scope="all"]').click();
  await page.waitForTimeout(400);
  const all = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-task-row], [data-done-divider]')];
    return {
      seq: rows.map(r => r.hasAttribute('data-done-divider') ? `|${r.getAttribute('data-done-divider')}|` : `${r.getAttribute('data-task-row')}:${r.getAttribute('data-task-done')}`),
      chips: document.querySelectorAll('[data-task-ws-chip="wolfson"]').length,
      note: !!document.querySelector('[data-task-scope-note]'),
      stored: localStorage.getItem('tasks_scope'),
    };
  });
  const rowsOnly = all.seq.filter(x => !x.startsWith('|'));
  check(rowsOnly.length === 15, '4 · all workspaces — fifteen rows', String(rowsOnly.length));
  check(all.chips === 14, '4 · each Wolfson row wears its workspace chip', String(all.chips));
  check(all.note, '4 · and the page says where the other workspaces come from');
  check(all.stored === 'all', '4 · the choice is remembered on this machine');
  const div = all.seq.findIndex(x => x.startsWith('|'));
  check(div === 11 && all.seq[div] === '|4|', '4 · eleven open rows, then the "Done · 4" divider', all.seq.join(' '));
  check(all.seq.slice(0, div).every(x => x.endsWith(':0')) && all.seq.slice(div + 1).every(x => x.endsWith(':1')),
    '4 · open above the line, done below it');
  check(all.seq.slice(div + 1).map(x => x.split(':')[0]).join(',') === 'T-b4,T-b3,T-b2,T-b1', '4 · done rows newest first', all.seq.slice(div + 1).join(','));
  const divText = await page.locator('[data-done-divider]').textContent();
  check(/Done · 4/.test(divText ?? ''), '4 · the divider reads "Done · 4"', divText);

  // ── a Wolfson row's NAME travels to its apartment window, and back ──
  await page.locator('[data-open-task="T-b2"]').click();
  await page.waitForTimeout(2500);
  const away = await page.evaluate(() => ({
    url: location.pathname, pid: window.__store?.getState().currentProjectId,
    lit: !!document.querySelector('[data-task-card="T-b2"][data-task-lit="1"]'),
  }));
  check(away.url === '/project' && away.pid === 'wolfson' && away.lit,
    '4 · a Wolfson row’s name opens ITS apartment window on that task', JSON.stringify(away));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2000);
  const home = await page.evaluate(() => ({ url: location.pathname, pid: window.__store?.getState().currentProjectId }));
  check(home.url === '/tasks' && home.pid === 'general', '4 · closing it comes back to the Job Board’s task list', JSON.stringify(home));
  await page.waitForSelector('[data-task-scope]', { timeout: 8000 }).catch(() => {});

  // ── filter chips ──
  await page.locator('[data-filter-worker]').selectOption('C-ig');
  await page.waitForTimeout(200);
  let chips = await page.evaluate(() => ({
    keys: [...document.querySelectorAll('[data-filter-chip]')].map(c => c.getAttribute('data-filter-chip')),
    text: document.querySelector('[data-filter-chip="worker"]')?.textContent ?? '',
    count: document.querySelector('[data-filter-count]')?.getAttribute('data-filter-count'),
    rows: document.querySelectorAll('[data-task-row]').length,
  }));
  check(chips.keys.join(',') === 'worker' && /Worker: Igor/.test(chips.text), '4 · picking a worker shows "Worker: Igor ×"', chips.text);
  check(chips.count === '1', '4 · the Filter button wears a count', String(chips.count));
  check(chips.rows === 9, '4 · Igor’s nine tasks', String(chips.rows));
  await page.locator('[data-filter-btn]').click();
  await page.locator('[data-filter-overdue]').check();
  await page.waitForTimeout(200);
  chips = await page.evaluate(() => ({
    keys: [...document.querySelectorAll('[data-filter-chip]')].map(c => c.getAttribute('data-filter-chip')),
    count: document.querySelector('[data-filter-count]')?.getAttribute('data-filter-count'),
  }));
  check(chips.keys.join(',') === 'worker,overdue' && chips.count === '2', '4 · "Overdue only" joins as its own chip', JSON.stringify(chips));
  await page.locator('[data-filter-chip-x="worker"]').click();
  await page.waitForTimeout(200);
  chips = await page.evaluate(() => [...document.querySelectorAll('[data-filter-chip]')].map(c => c.getAttribute('data-filter-chip')));
  check(chips.join(',') === 'overdue', '4 · a chip’s × takes just that filter off', chips.join(','));
  await page.locator('[data-filter-clear-all]').click();
  await page.waitForTimeout(200);
  check(await page.locator('[data-filter-chips]').count() === 0 && await page.locator('[data-filter-count]').count() === 0,
    '4 · Clear all leaves no filter on');

  // ── the Tasks page calendar folds too ──
  await page.locator('[data-task-view="calendar"]').click();
  await page.waitForTimeout(400);
  const tcal = await page.evaluate(d => document.querySelector(`[data-calendar-day="${d}"] [data-calendar-fold]`)?.textContent ?? '', MON);
  check(/Igor · Wolfson/.test(tcal) && /4 done/.test(tcal), '4 · in its calendar, Monday folds to one chip', tcal);
  await page.locator('[data-task-view="list"]').click();
  await page.waitForTimeout(300);

  // ── editing a Wolfson task travels there ──
  await page.locator('[data-edit-task="T-b5"]').click();
  await page.waitForTimeout(2200);
  const travelled = await page.evaluate(() => ({
    pid: window.__store?.getState().currentProjectId, url: location.pathname,
    editing: !!document.querySelector('[data-task-row="T-b5"] [data-task-edit-save]'),
    foreign: document.querySelector('[data-task-row="T-b5"]')?.getAttribute('data-task-foreign'),
  }));
  check(travelled.pid === 'wolfson' && travelled.url === '/tasks', '4 · its pencil switches to Wolfson and stays on Tasks', JSON.stringify(travelled));
  check(travelled.editing && !travelled.foreign, '4 · with THAT task’s editor open', JSON.stringify(travelled));
  await page.reload();
  await page.waitForSelector('[data-task-scope]', { timeout: 10000 }).catch(() => {});
  check(await page.locator('[data-task-scope="all"][data-on]').count() === 1, '4 · after a reload the page is still on All workspaces');
  await page.screenshot({ path: 'scratchpad/notebook-r48-tasks.png' });
  await ctx.close();
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
