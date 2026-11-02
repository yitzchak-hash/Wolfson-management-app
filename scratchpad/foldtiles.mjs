// The Fold's big screen (his boss's phone, 2026-11-02): the Wolfson tiles at
// 1129 × 847 (gallery's fold-big) — the number, tipus and + must not overlap,
// the family name must not be torn mid-word. SHOT= picture path; W= width.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const W = +(process.env.W || 1129), H = +(process.env.H || 847);
const browser = await chromium.launch({ executablePath: undefined });
const seed = JSON.parse(await realisticWolfson(browser));
// His screenshot's tiles carry a tipus ("A+", "C1+", "C2+") — the seed has none.
const TIP = ['A+', 'B+', 'C1+', 'C2+', 'A+C2'];
seed.apartments.forEach((a, i) => { if (a.apartmentNumber) a.tipus = TIP[i % TIP.length]; });
const blob = JSON.stringify(seed);
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: false });
await applySeed(ctx, blob);
const page = await ctx.newPage();
await page.goto('http://localhost:5173/project');
await page.waitForTimeout(2500);
const r = await page.evaluate(() => {
  const out = { cells: 0, overlaps: 0, torn: 0, widths: [] };
  const box = e => e.getBoundingClientRect();
  const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  for (const c of document.querySelectorAll('[data-apt-id]')) {
    const n = c.querySelector('[data-cell-number]'), t = c.querySelector('[data-tipus-line]'), p = c.querySelector('button[title]');
    if (!n) continue;
    out.cells++; out.widths.push(Math.round(box(c).width));
    const parts = [n, t, p].filter(Boolean).filter(e => getComputedStyle(e).display !== 'none');
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (hit(box(parts[i]), box(parts[j]))) { out.overlaps++; }
    const nm = c.querySelector('[data-cell-name]');
    if (nm) {
      // Torn: one word-piece drawn on two lines; or the whole name with no
      // piece at all (the old single text node, which tore freely).
      const pieces = nm.querySelectorAll('.truncate');
      if (!pieces.length && /\w/.test(nm.textContent) && nm.getClientRects().length && nm.textContent.trim() !== 'Not sold') out.torn++;
      for (const pc of pieces) if (pc.getClientRects().length > 1 || pc.getBoundingClientRect().height > 20) out.torn++;
      out.names = (out.names || 0) + pieces.length;
    }
  }
  out.widths = [Math.min(...out.widths), Math.max(...out.widths)];
  return out;
});
console.log(JSON.stringify(r));
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await browser.close();
