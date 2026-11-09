// The open Fold held sideways, building view (owner's picture 2026-11-08: "make smaller so all 4 fit", and the
// "172 units · 46 not started" line up beside Print). Checks the floor's four flats and four cards are all on screen
// without scrolling, and the counts sit on the toolbar's row. W= H= override the screen. SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const SIZES = process.env.W ? [[+process.env.W, +process.env.H, 'custom']] : [[938, 620, 'his-fold'], [1000, 640, 'fold-open-side'], [910, 620, 'fold-open-side-small'], [841, 673, 'fold-side'], [673, 841, 'fold-open'], [1024, 700, 'tablet-side'], [1180, 760, 'ipad-side'], [1440, 900, 'pc']];
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
for (const [w, h, name] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 1100, hasTouch: w < 1100, deviceScaleFactor: 1 });
  await applySeed(ctx, blob);
  const p = await ctx.newPage();
  await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2600);
  // one building, as in his picture (the "2" press)
  const two = p.locator('button:visible', { hasText: /^2$/ }).first();
  if (await two.count()) { await two.click(); await p.waitForTimeout(1200); }
  const ten = p.locator('.bv-rail-btn:visible', { hasText: /^10$/ }).first();
  if (await ten.count()) { await ten.click(); await p.waitForTimeout(1200); }
  const r = await p.evaluate(() => {
    const vis = e => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), h: Math.round(b.height) }; };
    const stage = document.querySelector('.bv-stage');
    const cards = [...document.querySelectorAll('[data-card]')].map(vis);
    const flats = [...document.querySelectorAll('[data-current="1"] [data-apt], .bv-flat[data-apt]')].map(vis);
    const scroller = document.querySelector('.short-scroll-body');
    const stats = [...document.querySelectorAll('strong')].find(s => /^\d+$/.test(s.textContent) && s.parentElement?.textContent.includes('units'));
    const print = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Print');
    return {
      vh: innerHeight, vw: innerWidth, stage: stage && vis(stage), cards, flats: flats.length,
      scroll: scroller ? scroller.scrollHeight - scroller.clientHeight : -1,
      statsTop: stats ? vis(stats.parentElement).top : null, printTop: print ? vis(print).top : null,
      pageScroll: document.documentElement.scrollHeight - innerHeight,
    };
  });
  await p.screenshot({ path: `${OUT}/bv-${name}.png` });
  const inView = r.cards.filter(c => c.top >= 0 && c.bottom <= r.vh && c.h > 20);
  T(r.cards.length >= 4 && inView.length >= 4, `${name} ${w}×${h}: all four cards on screen (${inView.length}/${r.cards.length}; bottoms ${r.cards.map(c => c.bottom).join(',')} of ${r.vh})`);
  T(r.scroll <= 2 && r.pageScroll <= 2, `${name}: nothing to scroll (${r.scroll}, ${r.pageScroll})`);
  T(r.statsTop !== null && r.printTop !== null && Math.abs(r.statsTop - r.printTop) < 24, `${name}: the counts sit on Print's row (${r.statsTop} vs ${r.printTop})`);
  await ctx.close();
}
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
