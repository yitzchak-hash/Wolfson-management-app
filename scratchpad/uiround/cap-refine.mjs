// The two refinements the owner made on Proposal A, captured on the REAL app:
//   · the Drive/Zoho pair side by side with the text clipped at the field edge
//   · the plan's tab strip gone from the PHONE preview too (he extended the
//     rule to every preview on every device)
import { chromium, devices } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from '../seed.mjs';

const PLAN_ID = 'HARNESSPLAN1';
async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  for (let i = 1; i < 6; i++) page.drawLine({ start: { x: 30 + i * 188, y: 30 }, end: { x: 30 + i * 188, y: 812 }, thickness: .8, color: rgb(.6, .66, .75) });
  for (let i = 1; i < 4; i++) page.drawLine({ start: { x: 30, y: 30 + i * 195 }, end: { x: 1161, y: 30 + i * 195 }, thickness: .8, color: rgb(.6, .66, .75) });
  page.drawText('A1 / 53 — MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(.12, .23, .37) });
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(b);

async function drawer(W, H, phone) {
  const ctx = await b.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: phone ? 2 : 1.5,
    isMobile: phone, hasTouch: phone, userAgent: phone ? devices['iPhone 13'].userAgent : undefined,
  });
  await applySeed(ctx, blob);
  await ctx.addInitScript(id => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw);
    for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.plansPdfLink = `https://drive.google.com/file/d/${id}/view`;
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  }, PLAN_ID);
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(2000);
  await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().click();
  await page.waitForTimeout(phone ? 1800 : 5500);
  return { ctx, page };
}

// ── 1. Drive + Zoho on a narrowed details column ──
{
  const { ctx, page } = await drawer(829, 690, false);
  // narrow the column the way decision 1 will
  await page.evaluate(() => {
    const f = [...document.querySelectorAll('.drawer-panel div')].find(d => d.style.flex === '0 0 560px');
    if (f) f.style.flex = '0 0 400px';
    document.querySelector('.drawer-panel').style.width = '96vw';
  });
  await page.waitForTimeout(900);
  const grid = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.drawer-panel div')]
      .find(d => d.className.includes('md:grid-cols-2') && d.className.includes('grid'));
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const clip = { x: grid.x - 14, y: grid.y - 26, width: grid.w + 28, height: grid.h + 40 };
  await page.screenshot({ path: 'scratchpad/ref-links-now.png', clip });
  // the fix: the box may shrink, and its words are clipped at the edge
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.drawer-panel div')]
      .find(d => d.className.includes('md:grid-cols-2') && d.className.includes('grid'));
    for (const cell of el.children) {
      cell.style.minWidth = '0';
      const btn = cell.querySelector('button.border-dashed');
      if (!btn) continue;
      btn.style.minWidth = '0';
      btn.style.overflow = 'hidden';
      // wrap the bare text node so it can be clipped and faded at the edge
      const txt = [...btn.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
      if (txt) {
        const s = document.createElement('span');
        s.textContent = txt.textContent.trim();
        s.style.cssText = 'min-width:0;flex:1;overflow:hidden;white-space:nowrap;'
          + '-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 22px),transparent);'
          + 'mask-image:linear-gradient(to right,#000 calc(100% - 22px),transparent);text-align:left';
        txt.replaceWith(s);
      }
    }
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'scratchpad/ref-links-fixed.png', clip });
  await ctx.close();
  console.log('links pair ok');
}

// ── 2. the phone preview's tab strip ──
{
  const { ctx, page } = await drawer(402, 874, true);
  await page.locator('.drawer-panel button', { hasText: /^Plan/ }).first().click();
  await page.waitForTimeout(5000);
  const shot = async name => {
    const box = await page.evaluate(() => {
      const p = document.querySelector('.drawer-panel').getBoundingClientRect();
      return { x: p.x, y: p.y + 40, w: p.width };
    });
    await page.screenshot({ path: `scratchpad/ref-phonetabs-${name}.png`,
      clip: { x: box.x, y: box.y, width: box.w, height: 300 } });
  };
  await shot('now');
  await page.evaluate(() => {
    const strip = document.querySelector('[data-plan-tabs]');
    if (!strip) return;
    const row = strip.parentElement;
    (row && row.children.length === 1 ? row : strip).remove();
  });
  await page.waitForTimeout(700);
  await shot('gone');
  await ctx.close();
  console.log('phone tabs pair ok');
}
await b.close();
