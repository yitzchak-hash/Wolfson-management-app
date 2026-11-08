// Measures the header on a 390 phone (practice): every child's box, and any overlap.
// Run: node scratchpad/d19-header-probe.mjs <out.png> [width]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = process.argv[2];
const W = Number(process.argv[3] || 390);
const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } });
const ctx = await b.newContext({ viewport: { width: W, height: 844 }, isMobile: W < 500, hasTouch: W < 500 });
const p = await ctx.newPage();
await p.goto('http://localhost:5173/login');
await p.getByText('Avital Ronen').first().click({ timeout: 30000 });
await p.waitForSelector('input[inputmode="numeric"]');
await p.locator('input[inputmode="numeric"]').first().click();
await p.keyboard.type('111111', { delay: 60 });
await p.waitForURL(u => !String(u).includes('/login'), { timeout: 30000 });
await p.waitForTimeout(3000);
const boxes = await p.evaluate(() => {
  const h = document.querySelector('header');
  const items = [...h.querySelectorAll('[data-practice-tag], button, [data-lang-toggle], img, a')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[data-lang-toggle] button') ; });
  const rs = items.map(e => { const r = e.getBoundingClientRect(); return { n: (e.getAttribute('data-practice-tag') !== null ? 'PRACTICE' : e.getAttribute('title') || e.textContent.trim().slice(0, 14) || e.tagName), l: Math.round(r.left), r: Math.round(r.right) }; });
  const over = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], c = rs[j];
    if (a.l < c.r - 1 && c.l < a.r - 1 && !(a.l <= c.l && a.r >= c.r) && !(c.l <= a.l && c.r >= a.r)) over.push(`${a.n} ✕ ${c.n}`);
  }
  return { rs, over, scroll: document.documentElement.scrollWidth };
});
console.log(JSON.stringify(boxes.rs));
console.log('overlaps:', boxes.over.length ? boxes.over.join(' | ') : 'none', '· page width', boxes.scroll);
await p.screenshot({ path: OUT, clip: { x: 0, y: 0, width: W, height: 70 } });
await b.close();
