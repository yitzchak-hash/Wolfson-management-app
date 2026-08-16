// Landscape: can you actually reach an apartment, and does one flick do it?
import { chromium, devices } from 'playwright';
import { realisticWolfson, applySeed } from './seed.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(b);
const c = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent });
await applySeed(c, blob);
const p = await c.newPage();
await p.goto('http://localhost:5173/project');
await p.waitForTimeout(1800);

const before = await p.evaluate(() => {
  const cell = [...document.querySelectorAll('[class*="cursor-pointer"]')].find(e => /Vizgen|Cohen/.test(e.textContent ?? ''));
  return cell ? Math.round(cell.getBoundingClientRect().top) : null;
});
console.log(await p.evaluate(() => {
  const m = document.querySelector('main');
  const page = document.querySelector('.short-scroll');
  return `main scrollH=${m.scrollHeight} clientH=${m.clientHeight} | page h=${getComputedStyle(page).height} ovf=${getComputedStyle(page).overflow}`;
}));
// One flick, the way a thumb does it — on the page, not wherever the mouse sits.
await p.evaluate(() => { document.querySelector('main').scrollTop = 400; });
await p.waitForTimeout(500);
const after = await p.evaluate(() => {
  const cell = [...document.querySelectorAll('[class*="cursor-pointer"]')].find(e => /Vizgen|Cohen/.test(e.textContent ?? ''));
  return cell ? Math.round(cell.getBoundingClientRect().top) : null;
});
console.log(`first apartment top: before=${before}px  after one flick=${after}px  (viewport 390)`);
console.log(after !== null && after < 390 ? 'PASS  reachable on screen after one scroll' : 'FAIL  still below the fold');
await p.screenshot({ path: 'scratchpad/land-after-scroll.png' });
await b.close();
