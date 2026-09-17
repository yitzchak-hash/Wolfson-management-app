// The owner's photo: on the Tab S10 FE (landscape, PC layout) an A1 plan sat TINY in the
// stage at 37%. Reproduce with an A1 sheet, then turn the tablet with the studio open.
import { chromium, devices } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
const PLAN_ID = 'HARNESSPLAN1';
async function makePlan(w, h) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([w, h]);
  page.drawRectangle({ x: 30, y: 30, width: w - 60, height: h - 60, borderWidth: 3, borderColor: rgb(0.1, 0.1, 0.2) });
  for (let i = 1; i < 8; i++) page.drawLine({ start: { x: 30 + i * (w - 60) / 8, y: 30 }, end: { x: 30 + i * (w - 60) / 8, y: h - 30 }, thickness: 1, color: rgb(0.6, 0.66, 0.75) });
  page.drawText('A1 SHEET', { x: 80, y: h - 120, size: 60, color: rgb(0.12, 0.23, 0.37) });
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan(Number(process.env.PW || 2384), Number(process.env.PH || 1684));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);
const measure = (page) => page.evaluate(() => {
  const st = document.querySelector('[data-plan-surface="studio"]');
  const cs = [...st.querySelectorAll('canvas')];
  const c = cs[cs.length - 1]; const r = c.getBoundingClientRect();
  const stage = c.closest('[class*="overflow"]') || c.parentElement.parentElement;
  const sr = stage.getBoundingClientRect();
  const pct = [...st.querySelectorAll('button,span')].map(b => (b.textContent || '').trim()).find(t => /^\d+%$/.test(t));
  return { sheet: [Math.round(r.width), Math.round(r.height)], stage: [Math.round(sr.width), Math.round(sr.height)], pct, vw: innerWidth, vh: innerHeight };
});
for (const [tag, W, H, rotateTo] of [['land', 1152, 720, null], ['port-then-land', 720, 1152, [1152, 720]]]) {
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
  await page.locator('button').filter({ hasText: /Mark up/i }).first().tap();
  for (let i = 0; i < 45; i++) { if (await page.locator('[data-plan-surface="studio"] canvas').count() >= 3) break; await page.waitForTimeout(2000); }
  await page.waitForTimeout(2500);
  console.log(tag, 'opened:', JSON.stringify(await measure(page)));
  await page.screenshot({ path: `${OUT}/tabfit-${tag}-a.jpg`, type: 'jpeg', quality: 80 });
  if (rotateTo) {
    await page.setViewportSize({ width: rotateTo[0], height: rotateTo[1] });
    await page.waitForTimeout(2500);
    console.log(tag, 'after turning:', JSON.stringify(await measure(page)));
    await page.screenshot({ path: `${OUT}/tabfit-${tag}-b.jpg`, type: 'jpeg', quality: 80 });
  }
  await ctx.close();
}
await browser.close();
