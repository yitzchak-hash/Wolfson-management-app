// The top bar at phone widths: no two buttons on top of each other (the device gallery, 2026-11-05 — the What's New
// sparkle sat on the Calendar button on a 360-wide Galaxy). SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
for (const w of [344, 360, 373, 390, 402, 412, 440]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true });
  await applySeed(ctx, blob);
  const p = await ctx.newPage();
  await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2200);
  const hits = await p.evaluate(() => {
    const hdr = document.querySelector('header');
    const els = [...hdr.querySelectorAll('button, a, img')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(e).visibility !== 'hidden'; })
      .filter(e => !e.parentElement?.closest('button, a'));
    const out = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 2 && oy > 2) out.push(`${els[i].title || els[i].textContent.trim().slice(0, 12) || els[i].tagName} × ${els[j].title || els[j].textContent.trim().slice(0, 12) || els[j].tagName}`);
    }
    const right = Math.max(...els.map(e => e.getBoundingClientRect().right));
    return { out, past: right > document.documentElement.clientWidth + 1 };
  });
  T(hits.out.length === 0 && !hits.past, `${w}px: the top bar's buttons stand apart and on screen ${hits.out.join(', ')}${hits.past ? ' PAST THE EDGE' : ''}`);
  await p.screenshot({ path: `${OUT}/hdr-${w}.png`, clip: { x: 0, y: 0, width: w, height: 60 } });
  await ctx.close();
}
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
