// Every stage label in the phone diagram must be FULLY readable — not
// ellipsized. shots.mjs exempts `truncate` as deliberate, which is right for a
// widget blurb and exactly wrong here, so this checks the diagram on its own.
import { chromium, devices } from 'playwright';
import { realisticWolfson, applySeed } from './seed.mjs';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);
for (const width of [390, 360, 412]) {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 2, userAgent: devices['iPhone 13'].userAgent,
  });
  await applySeed(ctx, blob);
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(1800);
  const r = await page.evaluate(() => {
    const bad = [];
    for (const el of Array.from(document.querySelectorAll('span'))) {
      const t = (el.textContent || '').trim();
      if (!t || el.children.length) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs > 11) continue;                       // number / family name
      if (el.scrollWidth > el.clientWidth + 0.5) {
        bad.push({ t: t.slice(0, 30), fs: Math.round(fs * 10) / 10, need: el.scrollWidth, has: el.clientWidth });
      }
    }
    const seen = new Map();
    for (const b of bad) if (!seen.has(b.t)) seen.set(b.t, b);
    return { count: bad.length, samples: [...seen.values()].slice(0, 6) };
  });
  console.log(`${width}px  ellipsized labels: ${r.count}`);
  r.samples.forEach(s => console.log(`     "${s.t}"  ${s.fs}px  needs ${s.need} has ${s.has}`));
  await ctx.close();
}
await browser.close();
