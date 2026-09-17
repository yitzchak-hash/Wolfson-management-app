// Capture the markup studio on the Tab S10 FE as it stands: rest, pen tray, shapes tray, download sheet.
import { chromium, devices } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
const PLAN_ID = 'HARNESSPLAN1';
async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  for (let i = 1; i < 6; i++) page.drawLine({ start: { x: 30 + i * 188, y: 30 }, end: { x: 30 + i * 188, y: 812 }, thickness: 0.8, color: rgb(0.6, 0.66, 0.75) });
  for (let j = 1; j < 4; j++) page.drawLine({ start: { x: 30, y: 30 + j * 195 }, end: { x: 1161, y: 30 + j * 195 }, thickness: 0.8, color: rgb(0.6, 0.66, 0.75) });
  page.drawText('A1 / 53 — MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);
const report = {};
for (const [tag, W, H] of [['land', 1152, 720], ['port', 720, 1152]]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: devices['Galaxy Tab S4'].userAgent });
  await applySeed(ctx, blob);
  await ctx.addInitScript(planId => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw); const link = `https://drive.google.com/file/d/${planId}/view`;
    for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.plansPdfLink = link;
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  }, PLAN_ID);
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 10 });
  await page.goto('http://localhost:5173/project'); await page.waitForTimeout(2000);
  await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().tap(); await page.waitForTimeout(1400);
  const planTab = page.locator('.drawer-panel button').filter({ hasText: /^Plan/ });
  if (await planTab.count()) { await planTab.first().tap(); await page.waitForTimeout(1200); }
  const markup = page.locator('button').filter({ hasText: /Mark up/i });
  await markup.first().tap();
  for (let i = 0; i < 45; i++) { if (await page.locator('[data-plan-surface="studio"] canvas').count() >= 3) break; await page.waitForTimeout(2000); }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/tab-${tag}-studio.jpg`, type: 'jpeg', quality: 85 });
  // measure: every button in the studio — size and position
  const m = await page.evaluate(() => {
    const st = document.querySelector('[data-plan-surface="studio"]');
    const btns = [...st.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(); return { t: (b.getAttribute('title') || b.textContent || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), vis: r.width > 0 && r.height > 0 }; }).filter(b => b.vis);
    const canvases = [...st.querySelectorAll('canvas')].map(c => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }; });
    const small = btns.filter(b => b.w < 40 || b.h < 40);
    return { buttons: btns.length, small: small.length, smallList: small.slice(0, 40), canvases, off: btns.filter(b => b.x + b.w > innerWidth || b.y + b.h > innerHeight).length };
  });
  report[tag] = m;
  const penBtn = page.locator('[data-plan-surface="studio"] button[title]').filter({ hasText: /^Pen$/ });
  if (await penBtn.count()) { await penBtn.first().tap(); await page.waitForTimeout(500); }
  if (!(await page.locator('[data-pen-tray]').count()) && await penBtn.count()) { await penBtn.first().tap(); await page.waitForTimeout(500); }
  await page.screenshot({ path: `${OUT}/tab-${tag}-tray.jpg`, type: 'jpeg', quality: 85 });
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  const shp = page.locator('[data-plan-surface="studio"] button[title]').filter({ hasText: /^(Line|Shapes|Box)$/ });
  if (await shp.count()) { await shp.first().tap(); await page.waitForTimeout(400); await shp.first().tap(); await page.waitForTimeout(500); }
  await page.screenshot({ path: `${OUT}/tab-${tag}-shapes.jpg`, type: 'jpeg', quality: 85 });
  await ctx.close();
}
console.log(JSON.stringify(report, null, 1));
await browser.close();
