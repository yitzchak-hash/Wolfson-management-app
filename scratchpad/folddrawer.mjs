// Reproduce the owner's Fold screenshot: drawer + plan pane at desktop-width
// viewports, measuring whether the modal and the SHEET actually fit.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

const PLAN_ID = 'HARNESSPLAN1';
async function makePlan(w, h) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([w, h]);
  page.drawRectangle({ x: 20, y: 20, width: w - 40, height: h - 40, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  page.drawText('PLAN RIGHT EDGE >>', { x: w - 260, y: h / 2, size: 22, color: rgb(0.8, 0.1, 0.1) });
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan(842, 1100); // portrait-ish like the owner's sheet (ratio ~0.77)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);
let fails = 0;

for (const [W, H] of [[1129, 847], [1092, 984], [1366, 1024], [1600, 1075], [1920, 1080]]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
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
  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(2000);
  await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().click();
  await page.waitForTimeout(5000); // let the aspect measure + refit land
  const m = await page.evaluate(() => {
    const modal = document.querySelector('.drawer-panel');
    const pane = [...modal.querySelectorAll(':scope > div')].at(-1);
    const canvases = [...modal.querySelectorAll('canvas')];
    const sheet = canvases.length ? canvases[0].getBoundingClientRect() : null;
    const mr = modal.getBoundingClientRect();
    const bars = [...modal.querySelectorAll('div')].filter(d => {
      const bg = getComputedStyle(d).backgroundColor;
      return (bg === 'rgb(30, 58, 95)' || bg === 'rgb(44, 79, 120)') && d.getBoundingClientRect().height < 70 && d.getBoundingClientRect().height > 20;
    }).map(d => Math.round(d.getBoundingClientRect().height));
    const dl = [...modal.querySelectorAll('button')].find(b => (b.title || b.textContent).match(/Download/i));
    return {
      vw: innerWidth, modal: { l: Math.round(mr.left), r: Math.round(mr.right), w: Math.round(mr.width), h: Math.round(mr.height) },
      sheet: sheet ? { l: Math.round(sheet.left), r: Math.round(sheet.right), w: Math.round(sheet.width) } : null,
      sheetFits: sheet ? sheet.right <= mr.right + 1 : null,
      modalFits: mr.right <= innerWidth + 1 && mr.left >= -1,
      barHeights: bars,
      downloadVisible: dl ? (dl.getBoundingClientRect().right <= innerWidth + 1 && dl.offsetWidth > 0) : 'no-btn',
    };
  });
  const ok = m.modalFits && m.sheetFits && m.downloadVisible === true;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${W}x${H}:`, JSON.stringify(m));
  if (!ok) fails++;
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all good');
process.exit(fails ? 1 : 0);
// (assertions added when this probe became a keeper — see folddrawer section
// of CLAUDE.md; sheetFits/modalFits/downloadVisible must hold at every size)
