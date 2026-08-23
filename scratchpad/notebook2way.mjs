// Two notebooks on one board.
//
// The owner reports three things with a second notebook placed:
//   · the X on a card does not take the job off
//   · nothing syncs between the two
//   · the second one should have every control the first has
// This reproduces all three before anything is changed, so the fix is aimed
// at a fault that has been SEEN rather than one that has been guessed at.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const job = (i, extra) => ({
    id: `G-t${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: `Two job ${i}`, address: 'Somewhere 1',
    isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {}, canvasX: 980, canvasY: 220 + i * 150,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    ...extra,
  });
  const book = (id, y, extra) => ({
    id, type: 'widget', widget: 'rota',
    x: 60, y, w: 700, h: 280, text: '', color: '#ffffff',
    data: {
      people: ['n:Moshe', 'n:Dovid'], firstWeek: '2026-08-16', weekCount: 1, span: 5,
      cells: {
        'n:Moshe|2026-08-17': [{ id: 'e-solo', jobId: 'G-t0' }],
        'n:Moshe|2026-08-18': [{ id: 'e-two-a', jobId: 'G-t1' }],
        'n:Dovid|2026-08-19': [{ id: 'e-two-b', jobId: 'G-t1' }],
      },
      ...extra,
    },
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [],
    apartments: [
      job(0, { inNotebook: 'CE-main' }),
      job(1, { inNotebook: 'CE-main' }),
      job(2),                                   // still on the board, so it has a tile to drag
    ],
    // The MAIN carries the data; the second is a projection of it, which is
    // what right-click → Duplicate makes.
    canvasElements: [book('CE-main', 40), book('CE-proj', 360, { role: 'projection' })],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(4000);

const state = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  const els = d.canvasElements ?? [];
  const cellsOf = id => {
    const e = els.find(x => x.id === id);
    const o = {};
    for (const [k, v] of Object.entries(e?.data?.cells ?? {})) o[k] = (v ?? []).map(x => x.jobId ?? '"txt"');
    return o;
  };
  const count = id => Object.values(cellsOf(id)).flat().length;
  return {
    main: cellsOf('CE-main'), mainN: count('CE-main'),
    proj: cellsOf('CE-proj'), projN: count('CE-proj'),
    flags: Object.fromEntries((d.apartments ?? []).map(a => [a.id, a.inNotebook ?? null])),
  };
});

/** The two mounted notebooks, and what each is drawing. */
const boards = () => page.evaluate(() => ['CE-main', 'CE-proj'].map(id => {
  const n = document.querySelector(`[data-node-id="${id}"]`);
  if (!n) return { id, missing: true };
  return {
    id,
    cards: n.querySelectorAll('.planner-card').length,
    xs: n.querySelectorAll('.planner-card [data-card-action]').length,
    tag: /projection/.test(n.textContent ?? ''),
  };
}));

const start = await state();
console.log('       start:', JSON.stringify(start));
console.log('       drawn:', JSON.stringify(await boards()));
check(start.mainN === 3, 'the main notebook has three cards', String(start.mainN));

// ── 1. The X on a card of the MAIN, with a projection also on the board ───
{
  const before = await state();
  const hit = await page.evaluate(() => {
    const n = document.querySelector('[data-node-id="CE-main"]');
    for (const card of n.querySelectorAll('.planner-card')) {
      if (!/Two job 1/.test(card.textContent ?? '')) continue;   // it has a twin: no question
      const x = card.querySelector('[data-card-action]');
      if (!x) return 'no X on the card';
      const r = x.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return 'no card for that job';
  });
  check(typeof hit !== 'string', '1 · the main notebook draws an X on its cards', String(hit));
  if (typeof hit !== 'string') {
    await page.mouse.move(hit.x, hit.y);
    await page.waitForTimeout(120);
    await page.mouse.click(hit.x, hit.y);
    await page.waitForTimeout(800);
    const after = await state();
    console.log('       after the X:', JSON.stringify(after));
    check(after.mainN === before.mainN - 1,
      '1 · the X really takes the card off', `${before.mainN} → ${after.mainN}`);
  }
}

// ── 2. Does anything the projection is asked to do reach the main? ────────
{
  const drawn = await boards();
  console.log('       drawn now:', JSON.stringify(drawn));
  const proj = drawn.find(x => x.id === 'CE-proj');
  check(proj && !proj.missing, '2 · the second notebook is on the board');
  check(proj?.cards > 0, '2 · and draws the main notebook’s cards', JSON.stringify(proj));
  check(proj?.xs > 0, '3 · the second notebook has the X on its cards too', JSON.stringify(proj));
}

// ── 2b. The X on the SECOND notebook writes through to the main ───────────
{
  const before = await state();
  const hit = await page.evaluate(() => {
    const n = document.querySelector('[data-node-id="CE-proj"]');
    const card = n.querySelector('.planner-card');
    const x = card?.querySelector('[data-card-action]');
    if (!x) return 'no X on the second notebook';
    const r = x.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  check(typeof hit !== 'string', '2b · the second notebook draws an X', String(hit));
  if (typeof hit !== 'string') {
    await page.mouse.move(hit.x, hit.y);
    await page.waitForTimeout(120);
    await page.mouse.click(hit.x, hit.y);
    await page.waitForTimeout(600);
    // Its last square, so it asks — the same question the main asks.
    const asked = await page.evaluate(() => [...document.querySelectorAll('button')]
      .some(b2 => /take it off the notebook/i.test(b2.textContent ?? '')));
    if (asked) {
      await page.evaluate(() => [...document.querySelectorAll('button')]
        .find(b2 => /take it off the notebook/i.test(b2.textContent ?? ''))?.click());
      await page.waitForTimeout(700);
    }
    const after = await state();
    console.log('       after the second one s X:', JSON.stringify(after.main), 'asked=' + asked);
    check(after.mainN === before.mainN - 1,
      '2b · and it takes the card off THE MAIN — one notebook, shown twice',
      `${before.mainN} → ${after.mainN}`);
  }
}

// ── 3. Can a job be dropped onto the SECOND notebook? ─────────────────────
{
  const before = await state();
  const drag = await page.evaluate(() => {
    const tile = document.querySelector('[data-node-id="G-t2"]');
    const proj = document.querySelector('[data-node-id="CE-proj"]');
    if (!tile || !proj) return null;
    const t = tile.getBoundingClientRect();
    const cells = [...proj.querySelectorAll('[class*="group/cell"]')]
      .filter(c => !c.querySelector('.planner-card'));
    if (!cells.length) return null;
    const c = cells[Math.floor(cells.length / 2)].getBoundingClientRect();
    return { fx: t.x + t.width / 2, fy: t.y + t.height / 2,
             tx: c.x + c.width / 2, ty: c.y + c.height / 2 };
  });
  if (!drag) { check(false, '3 · found a tile and an empty square on the second notebook'); }
  else {
    await page.mouse.move(drag.fx, drag.fy);
    await page.mouse.down();
    await page.mouse.move(drag.tx, drag.ty, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    const after = await state();
    console.log('       after dropping on the second:', JSON.stringify(after));
    check(after.mainN > before.mainN,
      '3 · dropping a job on the SECOND notebook writes it to the main',
      `${before.mainN} → ${after.mainN}`);
  }
}

// ── 4. TWO MAINS: the state a board made before projections existed ───────
//
// This is the one that explains the report. Two independent notebooks look
// identical and share nothing, so taking a card off one leaves it standing on
// the other — "the X doesn't work" and "there is no two-way sync" are the
// same fault seen from two sides. The app has to heal it.
//
// Its OWN context with its OWN init script. Patching localStorage and
// reloading does not work: the app flushes persist() on unload and writes
// straight over the patch — the standing trap — so the reload came up on the
// previous state and the heal was never exercised at all.
{
  const ctx2 = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx2.addInitScript(() => {
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    localStorage.setItem('board_default_zoom_general', '1');
    const job = (i, extra) => ({
      id: `G-m${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
      displayName: `Main job ${i}`, isUnnamed: false, isDuplexApt: false,
      classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {},
      canvasX: 980, canvasY: 220 + i * 150,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', ...extra,
    });
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
      stages: [],
      apartments: [job(0, { inNotebook: 'CE-b' }), job(1, { inNotebook: 'CE-b' })],
      canvasElements: [
        // The RICHER one, and the older one.
        { id: 'CE-a', type: 'widget', widget: 'rota', addedAt: '2026-01-01',
          x: 60, y: 40, w: 700, h: 280, text: '', color: '#ffffff',
          data: { people: ['n:Moshe'], firstWeek: '2026-08-16', weekCount: 1, span: 5,
                  cells: { 'n:Moshe|2026-08-17': [{ id: 'm1', jobId: 'G-m0' }],
                           'n:Moshe|2026-08-18': [{ id: 'm2', jobId: 'G-m1' }] } } },
        // A second MAIN — no role, its own thinner copy of the data.
        { id: 'CE-b', type: 'widget', widget: 'rota', addedAt: '2026-02-01',
          x: 60, y: 360, w: 700, h: 280, text: '', color: '#ffffff',
          data: { people: ['n:Moshe'], firstWeek: '2026-08-16', weekCount: 1, span: 5,
                  cells: { 'n:Moshe|2026-08-19': [{ id: 'b1', jobId: 'G-m0' }] } } },
      ],
    }));
  });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await p2.goto(`${APP}/jobs`);
  await p2.waitForTimeout(4500);

  const after = await p2.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
    const books = (d.canvasElements ?? []).filter(e => e.widget === 'rota');
    return {
      roles: books.map(e => ({ id: e.id, role: e.data?.role ?? 'main' })),
      archived: (d.boardSettings?.general?.plannerArchive ?? []).length,
      pointing: Object.fromEntries((d.apartments ?? []).map(a => [a.id, a.inNotebook ?? null])),
    };
  });
  console.log('       two mains →', JSON.stringify(after));
  const mains = after.roles.filter(r => r.role === 'main');
  check(mains.length === 1, '4 · two mains are healed down to one', JSON.stringify(after.roles));
  check(mains[0]?.id === 'CE-a',
    '4 · and the RICHER one keeps the crown, so no planning is lost', String(mains[0]?.id));
  check(after.archived > 0, '4 · the demoted one’s contents are filed, not dropped',
    String(after.archived));
  check(Object.values(after.pointing).every(v => v !== 'CE-b'),
    '4 · and no job is left pointing at the demoted notebook', JSON.stringify(after.pointing));

  await p2.screenshot({ path: 'scratchpad/notebook2way-heal.png' });
  await ctx2.close();
}

await page.screenshot({ path: 'scratchpad/notebook2way.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
