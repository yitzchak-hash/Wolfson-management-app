// Probe: how the TV building-diagram view actually lays out at 1920x1080.
import { chromium } from 'playwright';
import { realisticWolfson, applySeed } from './seed.mjs';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await applySeed(ctx, blob);
const page = await ctx.newPage();
await page.goto('http://localhost:5173/tv?view=wolfson&scale=0.7');
await page.waitForTimeout(4000);
await page.screenshot({ path: process.env.SCRATCH ? `${process.env.SCRATCH}/tvdiag07.png` : '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad/tvdiag07.png' });

const facts = await page.evaluate(() => {
  const box = document.querySelector('.flex-1.overflow-hidden.p-3');
  const diag = box?.firstElementChild;
  const inner = diag?.querySelector('.m-auto');
  const cols = [...document.querySelectorAll('.flex.flex-col.flex-1')].slice(0, 6)
    .map(c => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
  const r = inner?.getBoundingClientRect();
  return {
    boxW: box?.clientWidth, boxH: box?.clientHeight,
    zoom: diag ? getComputedStyle(diag).zoom : null,
    innerRect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
    innerLocal: inner ? { w: inner.clientWidth, h: inner.clientHeight, sw: inner.scrollWidth, sh: inner.scrollHeight } : null,
    cols,
  };
});
console.log(JSON.stringify(facts, null, 2));
await browser.close();
