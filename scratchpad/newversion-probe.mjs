// "A newer version is ready" — the office tab learns a newer build is out.
// Runs against the production bundle (vite preview on 4173): the dev server
// has no /assets bundle, so the note can never show there.
import { chromium } from 'playwright';
const APP = process.env.APP || 'http://localhost:4173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => {
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('active_project', 'general'); localStorage.setItem('general_app_version', '3');
  if (!localStorage.getItem('general_app_data')) {
    const u = { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
    localStorage.setItem('general_app_data', JSON.stringify({ currentUser: u, users: [u], apartments: [], canvasElements: [] }));
  }
});
const page = await ctx.newPage();
await page.goto(`${APP}/jobs`); await page.waitForTimeout(2500);
check(!page.url().includes('/login'), '0 · signed in', page.url());
const poke = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await poke(); await page.waitForTimeout(1200);
check(await page.locator('[data-new-version]').count() === 0, '1 · the same build: no note');
await page.route(`${APP}/`, async r => {
  const res = await r.fetch();
  const html = (await res.text()).replace(/\/assets\/index-[^"']+\.js/, '/assets/index-NEWER123.js');
  await r.fulfill({ response: res, body: html });
});
await poke(); await page.waitForTimeout(1500);
check(await page.locator('[data-new-version]').count() === 1, '2 · a newer build on the server: the note shows');
check((await page.locator('[data-new-version]').innerText().catch(() => '')).includes('newer version'), '2 · in plain words');
await page.unroute(`${APP}/`);
const nav = page.waitForNavigation({ timeout: 8000 }).then(() => true).catch(() => false);
await page.locator('[data-new-version-reload]').click().catch(() => {});
check(await nav, '3 · Reload reloads the page');
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
