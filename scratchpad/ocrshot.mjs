// A look at the scanned-plan reading (the other session's f46345b, for the owner's review 2026-11-09): an apartment
// whose plan is a SCAN (a picture with a title block, FAKE details) and no address yet. The details tab reads the
// scan's title block and offers the address; the picture is a screenshot of what he would see. Dev server with
// VITE_DRIVE_API_KEY on 5173. usage: ocrshot.mjs <fake-scan.png> [SHOTS=dir]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const scan = readFileSync(process.argv[2]);
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
// a Netiv apartment: the address field lives on the non-Wolfson workspaces' details
const boot = await browser.newPage();
await boot.goto('http://localhost:5173/');
const netiv = await boot.evaluate(async () => (await import('/src/data/initialData.ts')).buildNetivApartments().map(a => (a.id === 'B2-17'
  ? { ...a, displayName: 'Levi, Dana', address: '', phone: '', driveLink: 'https://drive.google.com/drive/folders/JOBFOLDER0001', plansPdfLink: 'https://drive.google.com/file/d/SCANPLAN0001/view' } : a)));
await boot.close();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await applySeed(ctx, blob);
await ctx.addInitScript((apts) => {
  localStorage.setItem('active_project', 'netiv');
  if (!localStorage.getItem('netiv_app_data')) {
    const w = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
    localStorage.setItem('netiv_app_data', JSON.stringify({ apartments: apts, currentUser: w.currentUser }));
  }
}, netiv);
await ctx.route('**/api/**', async r => {
  const u = r.request().url();
  if (u.includes('/api/drive-fetch')) return r.fulfill({ status: 200, contentType: 'image/png', body: scan });
  if (u.includes('/api/drive-files')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'SCANPLAN0001', name: 'floor plan scan.png', mimeType: 'image/png' }] }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, files: [] }) });
});
await ctx.route(/drive\.google\.com\/thumbnail/, r => r.fulfill({ status: 200, contentType: 'image/png', body: scan }));
const p = await ctx.newPage();
const logs = []; p.on('console', m => { if (/ocr|tesseract|plan/i.test(m.text())) logs.push(m.text().slice(0, 160)); });
await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2200);
await p.locator('[data-view-switch] [data-view="board"]:visible').first().click().catch(() => {}); await p.waitForTimeout(800);
const b2 = p.locator('button:visible', { hasText: /^B2$/ }).first(); if (await b2.count()) { await b2.click(); await p.waitForTimeout(900); }
await p.locator('[data-apt-id="B2-17"]').first().click();
// the reading (tesseract loads its language files the first time) — wait for an offer, up to 90 s
let state = '';
for (let i = 0; i < 90; i++) {
  await p.waitForTimeout(1000);
  state = await p.evaluate(() => [...document.querySelectorAll('[data-plan-address]')].map(e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 140)).join(' || '));
  if (/herzl|052/i.test(state)) break;
}
console.log('offer:', state || '(none)');
console.log(logs.slice(-5).join('\n'));
const card = p.locator('[data-plan-address]').first();
if (await card.count()) await card.scrollIntoViewIfNeeded();
await p.screenshot({ path: `${OUT}/ocr-details.png` });
const eye = p.locator('[data-plan-address] button').first();
if (await eye.count()) { await eye.click().catch(() => {}); await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/ocr-cutout.png` }); }
await browser.close();
