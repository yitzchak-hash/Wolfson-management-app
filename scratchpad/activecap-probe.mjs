// The Active-jobs widget DRAWS at most 40 rows at a time (the Chrome freezes,
// measured 2026-09-23: three copies × ~1,200 rows ≈ 77,000 nodes repainted on
// every scroll). Seeds the big-board shape (bigboard-probe's own seed) and
// counts: 40 rows drawn, the count still says every job, and "Show more" adds
// the next 40. Run against the built bundle: APP=http://localhost:4173.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const APP = process.env.APP || 'http://localhost:4173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const src = readFileSync(new URL('./bigboard-probe.mjs', import.meta.url), 'utf8');
const m = /await ctx\.addInitScript\((\(\{ NOWIDGETS, FEW \}\) => \{[\s\S]*?\n\}), \{ NOWIDGETS, FEW \}\);/.exec(src);
if (!m) { console.log('FAIL bigboard seed not found'); process.exit(1); }
const seed = (0, eval)(m[1]);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(seed, { NOWIDGETS: false, FEW: false });
const page = await ctx.newPage();
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(6000);
const read = () => page.evaluate(() => {
  const w = document.querySelector('[data-node-id="CE-act"]');
  return { rows: w ? w.querySelectorAll('[data-active-row]').length : -1, els: w ? w.querySelectorAll('*').length : -1,
    count: Number(w?.querySelector('[data-active-count]')?.textContent ?? 0) };
});
const r1 = await read();
check(r1.rows === 40, 'the widget draws 40 rows, not every job', JSON.stringify(r1));
check(r1.count > 40, 'its count still says how many jobs moved', String(r1.count));
check(r1.els < 1500, 'and stays under 1,500 elements', String(r1.els));
await page.locator('[data-node-id="CE-act"] [data-active-more]').evaluate(el => el.click());
await page.waitForTimeout(500);
const r2 = await read();
check(r2.rows === 80, '"Show more" adds the next 40', String(r2.rows));
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
