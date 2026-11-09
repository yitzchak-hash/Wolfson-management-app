// Netiv's building view (owner, 2026-11-08: "do the same thing we did with the building views … with Nativ … the
// tiles the same"). FAKE names on the app's own Netiv layout (initialData.buildNetivApartments). Walks every floor of
// B2: the right flats on each floor, a card per flat inside the screen, the plan's drawing under the typical floors,
// the duplexes on the ground AND floor 1, the two estimated floors dashed; All shows B1 and B2 side by side; a phone.
// SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const NAMES = ['Levi, Dana', 'Cohen, Avi', 'Mizrahi, Noa', 'Peretz, Yossi', 'Biton, Tamar', 'Dahan, Eli', 'Friedman, Sara', 'Katz, Moshe'];
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };

const boot = await browser.newPage();
await boot.goto('http://localhost:5173/');
const netiv = await boot.evaluate(async (names) => {
  const m = await import('/src/data/initialData.ts');
  let n = 0;
  return m.buildNetivApartments().map(a => {
    if (a.isUnnamed || !a.apartmentNumber) return a;
    n++;
    return n % 5 === 0 ? a : { ...a, displayName: names[n % names.length] };
  });
}, NAMES);
await boot.close();

async function open(w, h, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: !!opts.phone, hasTouch: !!opts.phone });
  await applySeed(ctx, blob);
  await ctx.addInitScript((apts) => {
    localStorage.setItem('active_project', 'netiv');
    if (!localStorage.getItem('netiv_app_data')) {
      const w = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
      localStorage.setItem('netiv_app_data', JSON.stringify({ apartments: apts, currentUser: w.currentUser, stages: w.stages }));
    }
  }, netiv);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2600);
  return { ctx, p, errs };
}

// 1. one building on a computer
{
  const { ctx, p, errs } = await open(1440, 900);
  const b2 = p.locator('button:visible', { hasText: /^(B2|2)$/ }).first();
  if (await b2.count()) { await b2.click(); await p.waitForTimeout(800); }
  await p.locator('[data-view-switch] [data-view="building"]').first().click().catch(() => {}); await p.waitForTimeout(1500);
  T(await p.locator('.bv-root').count() === 1, 'Netiv B2 opens a building view');
  const rail = await p.locator('.bv-rail-btn').allTextContents();
  T(rail.length >= 10, `the rail lists the floors (${rail.join(' ')})`);
  const want = { top: null };
  const floors = await p.evaluate(() => [...document.querySelectorAll('.bv-plate')].map(pl => ({
    floor: pl.getAttribute('data-floor'), est: pl.getAttribute('data-estimated') === '1',
    apts: [...pl.querySelectorAll('.bv-flat')].map(f => f.getAttribute('data-apt')),
    drawing: !!pl.querySelector('.bv-interior image'),
  })));
  const byFloor = Object.fromEntries(floors.map(f => [f.floor, f]));
  const nums = f => (byFloor[f]?.apts ?? []).map(id => Number(id.split('-')[1])).sort((a, b) => a - b).join(',');
  T(nums(0) === '1,2,3,4,5', `ground: apartment 1 and the four duplexes (${nums(0)})`);
  T(nums(1) === '2,3,4,5,6,7', `floor 1: 6, 7 and the duplexes' upper storeys (${nums(1)})`);
  T(nums(3) === '8,9,10,11' && nums(8) === '28,29,30,31', `typical floors: four flats (${nums(3)} · ${nums(8)})`);
  T(nums(9) === '32,33,34' && nums(10) === '35,36', `the top two floors (${nums(9)} · ${nums(10)})`);
  T(byFloor[3]?.drawing && byFloor[0]?.drawing && byFloor[9]?.drawing, 'the plan\'s drawing lies on the ground, typical and top floors');
  T(byFloor[1]?.est && byFloor[10]?.est && !byFloor[3]?.est, 'floors 1 and 10 are marked estimated (no plan yet)');
  for (const f of ['10', '9', '8', '3', '1', '0']) {
    await (f === '0' ? p.locator('.bv-rail-btn').last() : p.locator('.bv-rail-btn', { hasText: new RegExp(`^${f}$`) }).first()).click().catch(() => {});
    await p.waitForTimeout(900);
    const cards = await p.evaluate(() => [...document.querySelectorAll('[data-card]')].map(c => { const r = c.getBoundingClientRect(); return { id: c.getAttribute('data-card'), t: r.top, b: r.bottom, l: r.left, r: r.right }; }));
    const stage = await p.locator('.bv-stage').boundingBox();
    const inside = cards.every(c => c.t >= stage.y - 1 && c.b <= stage.y + stage.height + 1 && c.l >= stage.x - 1 && c.r <= stage.x + stage.width + 1);
    const overlap = cards.some((a, i) => cards.some((b, j) => j > i && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b));
    T(cards.length > 0 && inside && !overlap, `floor ${f}: ${cards.length} cards, all inside, none on another`);
    await p.screenshot({ path: `${OUT}/netiv-b2-f${f}.png` });
  }
  T(!errs.length, `no page errors (${errs.join(' | ')})`);
  await ctx.close();
}
// 2. All: the two buildings side by side
{
  const { ctx, p, errs } = await open(1440, 900);
  const all = p.locator('button:visible', { hasText: /^All$/ }).first();
  if (await all.count()) { await all.click(); await p.waitForTimeout(800); }
  await p.locator('[data-view-switch] [data-view="building"]').first().click().catch(() => {}); await p.waitForTimeout(1500);
  T(await p.locator('[data-building-trio] .bv-root').count() === 2, 'All shows B1 and B2 side by side');
  await p.screenshot({ path: `${OUT}/netiv-all.png` });
  T(!errs.length, `no page errors (${errs.join(' | ')})`);
  await ctx.close();
}
// 3. a phone
{
  const { ctx, p, errs } = await open(402, 874, { phone: true });
  await p.locator('[data-view-switch-narrow] [data-view="building"]').first().click().catch(() => {}); await p.waitForTimeout(1500);
  T(await p.locator('.bv-root').count() === 1, 'a phone has the Netiv building view');
  await p.screenshot({ path: `${OUT}/netiv-phone.png` });
  T(!errs.length, `no page errors (${errs.join(' | ')})`);
  await ctx.close();
}
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
