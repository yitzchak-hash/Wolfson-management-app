// D19 screenshots: a practice flat's Money part, computer and phone, English and Hebrew.
// Needs `npm run dev` on 5173 with the PRACTICE Firebase config (.env.local, VITE_PRACTICE=1).
// Run: node scratchpad/d19-shots.mjs <outDir>
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const OUT = process.argv[2] || 'docs/screens/practice-d19';
fs.mkdirSync(OUT, { recursive: true });
const APP = 'http://localhost:5173';
const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } });

async function session(width, height, lang) {
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: width < 500, hasTouch: width < 500 });
  await ctx.addInitScript(() => { try { localStorage.setItem('active_project', 'wolfson'); localStorage.setItem('whats_new_seen', '2099-01-01'); } catch { /* */ } });
  const p = await ctx.newPage();
  await p.goto(`${APP}/login`);
  await p.getByText('Avital Ronen').first().click({ timeout: 30000 });
  await p.waitForSelector('input[inputmode="numeric"]', { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.locator('input[inputmode="numeric"]').first().click();
  await p.keyboard.type('111111', { delay: 80 });
  await p.waitForTimeout(500);
  const go = p.getByRole('button', { name: /sign in|enter|log in|continue/i }).first();
  if (await go.count()) await go.click().catch(() => {});
  await p.waitForURL(u => !String(u).includes('/login'), { timeout: 30000 });
  await p.waitForTimeout(2500);
  const en = p.locator('[data-lang-toggle] [data-lang="en"]').first();
  if (await en.count() && await en.isVisible() && await en.getAttribute('aria-pressed') !== 'true') { await en.dispatchEvent('click'); await p.waitForTimeout(600); }
  await p.screenshot({ path: `${OUT}/debug-login-${width}.png` });
  for (let i = 0; i < 4; i++) {
    // A flat window restored from an earlier visit is closed first.
    if (await p.locator('[data-title-chip="print"]').count()) { await p.keyboard.press('Escape'); await p.waitForTimeout(700); continue; }
    if (p.url().includes('/project')) break;
    // Through the app's own workspace picker (the header's first menu).
    await p.locator('header button').filter({ hasText: /Job Board|לוח העבודה/ }).first().dispatchEvent('click');
    await p.waitForTimeout(500);
    await p.locator('[role="menuitemradio"]').filter({ hasText: /Wolfson/ }).first().dispatchEvent('click');
    await p.waitForTimeout(1500);
  }
  try { await p.waitForSelector('[data-apt-id="A1-1"]', { timeout: 45000 }); }
  catch (e) { await p.screenshot({ path: `${OUT}/debug-${width}.png` }); console.log('url', p.url()); throw e; }
  await p.waitForTimeout(2500);
  const toggle = p.locator(`[data-lang-toggle] [data-lang="${lang}"]`).first();
  if (await toggle.count() && await toggle.getAttribute('aria-pressed') !== 'true') { await toggle.dispatchEvent('click'); await p.waitForTimeout(800); }
  return { ctx, p };
}

for (const lang of ['en', 'he']) {
  for (const [w, h] of (process.env.ONLY_PHONE ? [[390, 844]] : [[1440, 900], [390, 844]])) {
    const { ctx, p } = await session(w, h, lang);
    const tag = `${w}-${lang}`;
    await p.locator('[data-apt-id="A1-2"]').first().scrollIntoViewIfNeeded();
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}/board-${tag}.png` });
    await p.locator('[data-apt-id="A1-1"]').first().click();
    const part = p.locator('[data-flat-money]').first();
    await part.waitFor({ timeout: 20000 });
    await p.waitForTimeout(1200);
    await part.scrollIntoViewIfNeeded();
    const tg = part.locator('[data-money-prices-toggle]');
    for (let i = 0; i < 3 && await tg.getAttribute('aria-expanded') !== 'true'; i++) { await tg.click(); await p.waitForTimeout(500); }
    await part.scrollIntoViewIfNeeded();
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/flat-${tag}.png` });
    await part.screenshot({ path: `${OUT}/money-${tag}.png` });
    const marks = await p.locator('[data-money-mark]').count();
    console.log(tag, 'money part:', await part.getAttribute('data-flat-money') !== null, 'orders:', await part.locator('[data-money-order]').count(), 'tile marks on board:', marks);
    await ctx.close();
  }
}
// Leave the practice user in English, as found.
{ const { ctx } = await session(1440, 900, 'en'); await ctx.close(); }
await b.close();
