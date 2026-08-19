// The tool rail's band, the overview's resize corner, the store's already-here
// label, and the planner's Main / Projection.
import { chromium } from 'playwright';
const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: Array.from({ length: 6 }, (_, i) => ({
      id: `G-p${i}`, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: `Job ${i}`,
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 60 + (i % 2) * 240, canvasY: 60 + Math.floor(i / 2) * 150,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    })),
    canvasElements: [
      // The main notebook, with something written in it.
      { id: 'CE-main', type: 'widget', widget: 'rota', x: 620, y: 60, w: 700, h: 320,
        text: '', color: '#ffffff',
        data: { title: 'Season', span: 5, weekStart: 0, weekCount: 1, textSize: 11,
                people: ['n:Yaakov', 'n:Igor'],
                cells: { 'n:Yaakov|2026-08-18': [{ id: 'e1', text: 'Pardes 8 am' }] } } },
      // Something far away so the overview is shown at all.
      { id: 'CE-far', type: 'note', x: 3000, y: 2000, w: 180, h: 140, text: 'Far', color: '#fef9c3' },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2800);

// ── 1. the rail sits between the header and the overview ───────────────────
{
  const m = await page.evaluate(() => {
    const vp = document.querySelector('[data-board-viewport]');
    const rail = [...document.querySelectorAll('div')].find(d =>
      d.className.includes('hidden md:flex absolute z-40 select-none'));
    const add = [...document.querySelectorAll('button')].find(x => /add job/i.test(x.textContent ?? ''));
    const ov = document.querySelector('[data-board-overview]');
    if (!rail || !vp) return null;
    const r = rail.getBoundingClientRect();
    return {
      rail: { top: Math.round(r.top), bottom: Math.round(r.bottom) },
      add: add ? { top: Math.round(add.getBoundingClientRect().top), bottom: Math.round(add.getBoundingClientRect().bottom),
                   left: Math.round(add.getBoundingClientRect().left), right: Math.round(add.getBoundingClientRect().right) } : null,
      overTop: ov ? Math.round(ov.getBoundingClientRect().top) : null,
    };
  });
  check(!!m && !!m.add, 'the rail and the Add job button are both on screen');
  if (m?.add) {
    check(m.rail.top >= m.add.bottom - 1, 'the rail starts BELOW the Add job button',
      `rail top ${m.rail.top}, Add job bottom ${m.add.bottom}`);
  }
  if (m?.overTop) {
    check(m.rail.bottom <= m.overTop + 1, 'and stops above the overview',
      `rail bottom ${m.rail.bottom}, overview top ${m.overTop}`);
  }
}

// ── 2. the overview resizes from its corner, and 0 puts the size back ──────
{
  const before = await page.evaluate(() => {
    const o = document.querySelector('[data-board-overview]').getBoundingClientRect();
    return { w: Math.round(o.width), h: Math.round(o.height) };
  });
  const grip = await page.$('[title="Drag to size the overview"]');
  check(!!grip, 'the overview has a resize corner');
  if (grip) {
    const g = await grip.boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x - 120, g.y - 90, { steps: 8 });
    await page.waitForTimeout(80);
    const hint = await page.evaluate(() =>
      [...document.querySelectorAll('div')].some(d => /press 0 to reset/.test(d.textContent ?? '')));
    check(hint, 'the size hint says 0 resets it');
    const bigger = await page.evaluate(() => {
      const o = document.querySelector('[data-board-overview]').getBoundingClientRect();
      return { w: Math.round(o.width), h: Math.round(o.height) };
    });
    check(bigger.w > before.w + 60 && bigger.h > before.h + 40, 'dragging the corner grows it',
      `${before.w}×${before.h} → ${bigger.w}×${bigger.h}`);
    await page.keyboard.press('0');
    await page.mouse.up();
    await page.waitForTimeout(150);
    const back = await page.evaluate(() => {
      const o = document.querySelector('[data-board-overview]').getBoundingClientRect();
      return { w: Math.round(o.width), h: Math.round(o.height) };
    });
    check(Math.abs(back.w - before.w) < 3 && Math.abs(back.h - before.h) < 3,
      '0 puts the size back', `${bigger.w}×${bigger.h} → ${back.w}×${back.h}`);
  }
}

// ── 3. the store labels what is already on the board ───────────────────────
{
  const storeBtn = await page.$('[title*="widget" i]') ?? await page.$('button:has-text("Store")');
  if (storeBtn) await storeBtn.click();
  await page.waitForTimeout(1400);
  await page.fill('input[placeholder="Search widgets"]', 'weekly');
  await page.waitForTimeout(500);
  const labelled = await page.evaluate(() =>
    [...document.querySelectorAll('span')].some(s => /on the board/.test(s.textContent ?? '')));
  check(labelled, 'the notebook card says it is already on the board');
  const addable = await page.evaluate(() => {
    const card = document.querySelector('[data-widget-id="rota"]');
    if (!card) return null;
    return [...card.querySelectorAll('button,span')].some(x => /Add to/.test(x.textContent ?? ''));
  });
  check(addable === true, 'and can still be added again');

  // Add a second one — it must arrive as a projection.
  const rotaCard = await page.$('[data-widget-id="rota"]');
  check(!!rotaCard, 'the notebook card is on the shelf');
  if (rotaCard) await rotaCard.click({ force: true });
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const roles = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
    return (d.canvasElements ?? []).filter(e => e.widget === 'rota')
      .map(e => (e.data?.role ?? 'main'));
  });
  check(roles.length >= 2, 'a second notebook was placed', JSON.stringify(roles));
  check(roles.filter(r => r !== 'projection').length === 1,
    'exactly one of them is the main one', JSON.stringify(roles));
  check(roles.includes('projection'), 'the new one came in as a projection');
}

// ── 4. the projection shows the main's contents and cannot be typed into ───
{
  const seen = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[data-node-id]')];
    const proj = nodes.find(n =>
      [...n.querySelectorAll('span')].some(s => s.textContent === 'projection'));
    // The MAIN renders a free-text entry as an input, whose value is not part
    // of textContent — reading text on both and expecting two hits is the
    // harness measuring the difference between an input and a label.
    const mainHas = nodes.some(n => n !== proj
      && [...n.querySelectorAll('input')].some(i => i.value === 'Pardes 8 am'));
    return {
      projHas: !!proj && /Pardes 8 am/.test(proj.textContent ?? ''),
      mainHas,
      badges: [...document.querySelectorAll('span')].filter(s => s.textContent === 'projection').length,
    };
  });
  check(seen.mainHas, 'the main notebook holds the entry');
  check(seen.projHas, 'and the projection is showing it');
  check(seen.badges >= 1, 'and is marked as a projection');
  const editable = await page.evaluate(() => {
    const proj = [...document.querySelectorAll('[data-node-id]')].find(n =>
      [...n.querySelectorAll('span')].some(s => s.textContent === 'projection'));
    return proj ? proj.querySelectorAll('input,textarea').length : -1;
  });
  check(editable === 0, 'nothing in it can be typed into', `${editable} inputs`);
}

await page.screenshot({ path: 'scratchpad/round12.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
