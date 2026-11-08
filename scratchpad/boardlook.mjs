// The board (the "regular view") of Wolfson and of Netiv side by side, one building each and All, for comparing their
// tiles (owner, 2026-11-08: Netiv's regular view should "look like the Wolfson buildings would look like"). SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const NAMES = ['Levi, Dana', 'Cohen, Avi', 'Mizrahi, Noa', 'Peretz, Yossi', 'Biton, Tamar', 'Dahan, Eli', 'Friedman, Sara', 'Katz, Moshe'];
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
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
const W = +(process.env.W || 1440), H = +(process.env.H || 900);
for (const proj of ['wolfson', 'netiv']) {
  for (const which of ['one', 'all']) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    await applySeed(ctx, blob);
    await ctx.addInitScript(([apts, pid]) => {
      localStorage.setItem('active_project', pid);
      if (pid === 'netiv' && !localStorage.getItem('netiv_app_data')) {
        const w = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
        // the Netiv flats take the Wolfson seed's stages so their tiles are coloured the same way
        const st = (w.apartments ?? []).map(a => a.currentStageId).filter(Boolean);
        localStorage.setItem('netiv_app_data', JSON.stringify({ apartments: apts.map((a, i) => (a.displayName && a.apartmentNumber ? { ...a, currentStageId: st[i % st.length] } : a)), currentUser: w.currentUser }));
      }
    }, [netiv, proj]);
    const p = await ctx.newPage();
    await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2500);
    await p.locator('[data-view-switch] [data-view="board"]').first().click().catch(() => {}); await p.waitForTimeout(800);
    if (which === 'one') {
      const b = p.locator('button:visible', { hasText: proj === 'wolfson' ? /^2$/ : /^B2$/ }).first();
      if (await b.count()) { await b.click(); await p.waitForTimeout(1200); }
    }
    await p.screenshot({ path: `${OUT}/board-${proj}-${which}.png` });
    await p.evaluate(() => { const s = document.querySelector('.short-scroll-body'); if (s) s.scrollTop = s.scrollHeight - s.clientHeight - 300; }); await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/board-${proj}-${which}-bottom.png` });
    await ctx.close();
  }
}
await browser.close();
console.log('done');
