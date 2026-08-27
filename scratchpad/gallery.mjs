// The device gallery: the drawer (with a real plan), the diagram, the board
// and the worker portal, captured at every device shape the owner carries —
// the source pictures for the "Device Gallery" preview artifact.
import { chromium, devices } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from './seed.mjs';

const PLAN_ID = 'HARNESSPLAN1';
async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]); // A3 landscape
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  for (let i = 1; i < 6; i++) page.drawLine({ start: { x: 30 + i * 188, y: 30 }, end: { x: 30 + i * 188, y: 812 }, thickness: 0.8, color: rgb(0.6, 0.66, 0.75) });
  for (let i = 1; i < 4; i++) page.drawLine({ start: { x: 30, y: 30 + i * 195 }, end: { x: 1161, y: 30 + i * 195 }, thickness: 0.8, color: rgb(0.6, 0.66, 0.75) });
  page.drawText('A1 / 53 — MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);

const PROFILES = [
  ['flip',        344, 882,  true],
  ['fold-open',   690, 829,  true],
  ['fold-side',   829, 690,  false],
  ['fold-big',   1129, 847,  false],
  ['ipad-port',   768, 1024, false],
  ['ipad-land',  1024, 768,  false],
  ['ipadpro11',   834, 1194, false],
  ['ipadpro13', 1366, 1024,  false],
];

for (const [tag, W, H, phone] of PROFILES) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    isMobile: phone, hasTouch: true, deviceScaleFactor: phone ? 2 : 1.5,
    userAgent: devices['iPhone 13'].userAgent,
  });
  await applySeed(ctx, blob);
  await ctx.addInitScript(planId => {
    const raw = localStorage.getItem('wolfson_app_data');
    if (!raw) return;
    const d = JSON.parse(raw);
    for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.plansPdfLink = `https://drive.google.com/file/d/${planId}/view`;
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  }, PLAN_ID);
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  const page = await ctx.newPage();
  const snap = name => page.screenshot({ path: `scratchpad/gal-${tag}-${name}.png` });

  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(2200);
  await snap('diagram');

  // the drawer, plan showing: desktop = side pane; phone = the Plan tab
  await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().click();
  await page.waitForTimeout(phone ? 1500 : 6000);
  if (phone) {
    await page.locator('.drawer-panel button', { hasText: /^(Plan|תוכנית)/ }).first().click();
    await page.waitForTimeout(5000);
  }
  await snap('drawer');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  // the board, through the real header dropdown (the standing localStorage trap)
  try {
    await page.locator('header button', { hasText: /Wolfson/ }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole('menu').getByText(/Job Board/).first().click();
    await page.waitForTimeout(2400);
    if (await page.locator('[data-board-viewport]').count()) await snap('board');
  } catch { console.log(`  ${tag}: board switch failed`); }

  // the worker portal — the auto-switch walks it back to Wolfson's tasks
  await page.goto(`http://localhost:5173/c/${PORTAL_TOKEN}`);
  await page.waitForTimeout(5500);
  try {
    await page.locator('button').filter({ hasText: /^(All|הכול|הכל)$/ }).first().click();
    await page.waitForTimeout(400);
    await page.locator('button, [role=button]').filter({ hasText: /concealed unit|registers|thermostats/i }).first().click({ timeout: 8000 });
    await page.waitForTimeout(1000);
  } catch { console.log(`  ${tag}: portal card tap failed`); }
  await snap('portal');

  console.log(`${tag} done`);
  await ctx.close();
}
await browser.close();
