// Video 14 (2026-11-02): one building big · the floor window on All · Board/Building switch.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const browser = await chromium.launch();
const seed = JSON.parse(await realisticWolfson(browser));
const TIP = ['A', 'B', 'C1', 'C2'];
seed.apartments.forEach(a => { if (a.apartmentNumber && a.colPosition) a.tipus = TIP[(a.colPosition - 1) % 4]; });
// a joined pair, as the office has them (38/39 on A1)
const j1 = seed.apartments.find(a => a.id === 'A2-50'), j2 = seed.apartments.find(a => a.id === 'A2-51');
if (j1 && j2) { j1.mergedWith = j2.id; j2.mergedWith = j1.id; }
const upg = seed.apartments.find(a => a.id === 'A2-49'); if (upg) { upg.classification = 'shinui'; upg.customAnswers = { 'cb-wall': 'yes' }; }
seed.boardSettings = { ...(seed.boardSettings ?? {}), wolfson: { ...((seed.boardSettings ?? {}).wolfson ?? {}), customButtons: [{ id: 'cb-wall', name: 'Wall' }] } };
// lower-level slots as the office names them (FAKE labels): a spa, a lobby, a storage room, and one with no known area
const slot = (b, floor, col, name) => { const s = seed.apartments.find(a => a.buildingId === b && a.floor === floor && a.colPosition === col); if (s) { s.displayName = name; } return !!s; };
globalThis.__slots = [slot('A1', -0.5, 1, 'ספא'), slot('A2', 1, 1, 'קרקע'), slot('A2', -2, 1, '-2'), slot('A3', -1, 2, 'Generator room')];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await applySeed(ctx, JSON.stringify(seed));
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2500);
// 1. the floor window on All
const lab = p.locator('[data-floor-open]').first();
T(await lab.count() > 0, 'floor numbers are presses on All');
await lab.click(); await p.waitForTimeout(600);
const win = p.locator('[data-floor-window]');
T(await win.count() === 1, 'the floor window opens');
const tiles = await win.locator('[data-apt-id]').count();
T(tiles >= 2 && tiles <= 4, `it holds only that floor's flats (${tiles})`);
const big = await win.locator('[data-apt-id][data-big]').count();
T(big === tiles, 'its tiles are the big ones');
const ww = await win.locator('[role=dialog]').boundingBox();
T(ww.width > 1300, `it spans across (${Math.round(ww.width)}px)`);
await p.screenshot({ path: OUT + '/v14-floorwin.png' });
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
T(await win.count() === 0, 'Escape closes it');
// 2. one building big
await p.locator('button:visible', { hasText: /^2$/ }).first().click(); await p.waitForTimeout(800);
T(await p.locator('button:visible', { hasText: /^Clear$/ }).count() === 0, 'picking a building is not a filter: no Clear');
const bigTiles = await p.locator('[data-apt-id][data-big]').count();
T(bigTiles > 10, `one building: big tiles (${bigTiles})`);
const tw = await p.locator('[data-apt-id][data-big]').first().boundingBox();
T(tw.width > 200 && tw.height > 170, `a tile is big (${Math.round(tw.width)}×${Math.round(tw.height)})`);
T(await p.locator('[data-cell-progress]').count() > 0, 'tiles say their progress');
T(await p.locator('[data-floor-open]').count() === 0, 'no floor window presses with one building');
await p.screenshot({ path: OUT + '/v14-big.png' });
// 3. Board · Building
T(await p.locator('[data-view-switch]').count() === 1, 'the Board · Building switch is there');
await p.click('[data-view="building"]'); await p.waitForTimeout(1200);
T(await p.locator('[data-building-view]').count() === 1, 'the building view shows');
await p.screenshot({ path: OUT + '/v14-building.png' });
const flat = p.locator('.bv-plate[data-current="1"] [data-apt] text.bv-flat-no').first();
const fb = await flat.boundingBox();
await p.mouse.click(fb.x + fb.width / 2, fb.y + fb.height / 2 + 15); await p.waitForTimeout(900);
T(await p.locator('.drawer-panel').count() > 0, 'a press on a flat opens its window');
await p.goto('http://localhost:5173/project'); await p.waitForTimeout(1500);
T(await p.locator('[data-view-switch]').count() === 1, 'the switch shows on All too');
T(await p.locator('text=/^Clear$/').count() === 0, 'no Clear on All with nothing filtered');
await p.click('[data-view="building"]'); await p.waitForTimeout(1200);
T(await p.locator('[data-building-trio] [data-building-view]').count() === 3, 'Building on All shows the three side by side');
{ const f = p.locator('[data-building-trio] .bv-plate[data-current="1"] [data-apt] text.bv-flat-no').first(); const fb = await f.boundingBox();
  await p.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2 + 10); await p.waitForTimeout(400);
  const cb = await p.locator('[data-building-trio] .bv-card').first().boundingBox();
  const sb = await p.locator('[data-building-trio]').boundingBox();
  T(!!cb && cb.y >= sb.y && cb.y + cb.height <= sb.y + sb.height, 'on All the hover card stands whole, above the plans');
  await p.screenshot({ path: OUT + '/v15-trio-hover.png' }); }
const before = await p.locator('[data-rail-floor][data-on="1"]').textContent();
const st = await p.locator('[data-building-view]').first().boundingBox();
await p.mouse.move(st.x + st.width / 2, st.y + st.height / 2);
await p.mouse.wheel(0, 100); await p.waitForTimeout(900);
const after = await p.locator('[data-rail-floor][data-on="1"]').textContent();
T(after !== before, `a wheel over one moves them (${before} → ${after})`);
const solid = await p.evaluate(() => [...document.querySelectorAll('[data-building-trio] [data-building-view]')].map(v => v.querySelector('.bv-plate[data-solid="1"]')?.getAttribute('data-floor')));
T(new Set(solid).size === 1, `all three on the same floor (${solid.join(',')})`);
await p.screenshot({ path: OUT + '/v14-trio.png' });
// the shared levels: one wide floor under the three on All
await p.click('[data-building-trio] [data-rail-floor="-1"]'); await p.waitForTimeout(900);
T(await p.locator('.bv-wide-plate[data-wide="b1"][data-solid="1"]').count() === 1, 'On All, basement -1 is one wide floor');
T(await p.locator('.bv-wide-plate[data-wide="b1"] [data-slot]').count() === 1, 'a slot with no known area still shows on its floor');
await p.click('[data-building-trio] [data-rail-floor="Spa"]'); await p.waitForTimeout(900);
T(await p.locator('.bv-wide-plate[data-wide="spa"] [data-slot][data-zone="1"]').count() === 1, 'On All, the Spa slot lights the spa');
const sp = p.locator('.bv-wide-plate[data-wide="spa"] [data-slot] .bv-chip').first();
await sp.click(); await p.waitForTimeout(900);
T(await p.locator('.drawer-panel').count() > 0, 'a press on the Spa slot opens it');
await p.screenshot({ path: OUT + '/v14-spa.png' });
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
if (await p.locator('.drawer-panel').count()) { await p.locator('.drawer-panel button[aria-label*="lose"], .drawer-panel [data-drawer-close]').first().click().catch(() => {}); await p.waitForTimeout(400); }
await p.screenshot({ path: OUT + '/v14-trio-b1.png' });
// one building: its own slice lit, the rest grey
await p.locator('button:visible', { hasText: /^2$/ }).first().click(); await p.waitForTimeout(500);
await p.click('[data-rail-floor="-1"]'); await p.waitForTimeout(1200);
T(await p.locator('.bv-plate[data-solid="1"] svg[data-lower="b1"]').count() === 1, 'one building: basement -1 shows, its slice lit');
// penthouses: one shape each, their own drawing
await p.click('[data-rail-floor="14"]'); await p.waitForTimeout(1200);
const nums = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.bv-plate[data-current="1"] [data-apt]')].map(g => [g.querySelector('text.bv-flat-no').textContent, g.querySelector('text.bv-flat-no').getAttribute('x')])));
T(Number(nums['54']) < Number(nums['53']), `floor 14 as he marked it: 54 on the one side, 53 the other (${JSON.stringify(nums)})`);
const ph = await p.evaluate(() => [...document.querySelectorAll('.bv-plate[data-current="1"] [data-apt]')].map(g => g.querySelectorAll('path:not(.bv-terrace)').length));
T(ph.length === 2 && ph.every(n => n === 1), `floor 14: two penthouses, each one shape (${ph})`);
// video 21: the real building shape, not a square — each penthouse's rooms outline has the notches, and its terrace is apart
const pts = await p.evaluate(() => [...document.querySelectorAll('.bv-plate[data-current="1"] [data-apt] path:not(.bv-terrace)')].map(e => (e.getAttribute('d').match(/L/g) || []).length + 1));
T(pts.every(n => n >= 10), `floor 14: each penthouse is its traced outline, not a box (${pts} corners)`);
T(await p.locator('.bv-plate[data-current="1"] [data-apt] path.bv-terrace').count() === 2, 'floor 14: the top terraces drawn apart, lighter');
T(await p.locator('.bv-plate[data-current="1"] .bv-interior image[href*="ph14"]').count() === 1, 'floor 14 shows its own drawing');
await p.screenshot({ path: OUT + '/v14-ph14.png' });
await p.click('[data-rail-floor="15"]'); await p.waitForTimeout(1200);
T(await p.locator('.bv-plate[data-current="1"] .bv-interior image[href*="ph15"]').count() === 1, 'floor 15 shows its own drawing');
T(await p.locator('.bv-plate[data-current="1"] [data-apt] path.bv-terrace').count() === 4, 'floor 15: the terraces (top and the long one below) drawn apart');
await p.screenshot({ path: OUT + '/v14-ph15.png' });
// the board's slots on the ground floor of building 2: Lobby lights its area
await p.click('[data-rail-floor="0"]'); await p.waitForTimeout(1200);
T(await p.locator('.bv-plate[data-current="1"] [data-slot][data-zone="1"]').count() >= 1, 'ground floor: the קרקע slot lights its building\'s part');
await p.click('[data-rail-floor="-2"]'); await p.waitForTimeout(1200);
T(await p.locator('.bv-plate[data-current="1"] [data-slot][data-zone="1"]').count() === 1, 'basement -2: the -2 slot lights its building\'s part');
await p.screenshot({ path: OUT + '/v14-b2slot.png' });
await p.screenshot({ path: OUT + '/v14-ground.png' });
await p.click('[data-rail-floor="13"]'); await p.waitForTimeout(1200);
const j = p.locator('.bv-plate[data-current="1"] [data-apt="A2-50"] text.bv-flat-no');
if (await j.count()) {
  const jb = await j.boundingBox(); await p.mouse.move(jb.x + jb.width / 2, jb.y + jb.height / 2 + 12); await p.waitForTimeout(400);
  const litN = await p.locator('.bv-plate[data-current="1"] [data-apt][data-on="1"]').count();
  T(litN === 2, `a joined pair lights together (${litN})`);
  T(await p.locator('[data-card-joined]').count() === 2, 'both cards say they are joined');
T(await p.locator('.bv-plate[data-current="1"] [data-flat-tipus]').count() === 4, 'every flat wears its tipus beside its number');
T(await p.locator('.bv-plate[data-current="1"] [data-flat-upgraded]').count() >= 1, 'an upgraded flat wears the U');
T(await p.locator('.bv-plate[data-current="1"] [data-flat-answer="yes"]').count() === 1, 'the Wall answer lies on the floor beside the number');
{ const n = p.locator('.bv-plate[data-current="1"] [data-apt="A2-49"] text.bv-flat-no'); const nb = await n.boundingBox();
  await p.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2 + 14); await p.waitForTimeout(400);
  const order = await p.evaluate(() => { const c = document.querySelector('[data-card="A2-49"] .bv-card-top'); return c ? [...c.children].map(e => e.className.split(' ')[0]) : []; });
  T(order.join(',') === 'bv-card-no,bv-card-tip,bv-card-ans,bv-card-u', `the card says Wall between the tipus and the U (${order})`);
  await p.screenshot({ path: OUT + '/v16-answers.png' }); }
  await p.screenshot({ path: OUT + '/v14-joined.png' });
} else T(false, 'flat 50 on floor 13');
await p.screenshot({ path: OUT + '/v14-one-b1.png' });
console.log(`\n${ok} ok · ${bad} bad · errors: ${errs.length ? errs.join(' | ') : 'none'}`);
await browser.close();
