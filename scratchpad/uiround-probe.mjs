// Quick functional probe of the round's two thresholds and the StageBar.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

const PLAN_ID = 'HARNESSPLAN1';
async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  page.drawText('A1 / 53 - MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(.12, .23, .37) });
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };
const blob = await realisticWolfson(b);

// ── the diagram at 768 (below 900): one building, stage bar, no desktop bar ──
{
  const ctx = await b.newContext({ viewport: { width: 768, height: 1024 } });
  await applySeed(ctx, blob);
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(2600);
  const bar = page.locator('[data-stage-bar]');
  check(await bar.isVisible(), 'the stage bar shows at 768');
  const segs = await page.locator('[data-stage-seg]').count();
  check(segs >= 3, 'it has stage segments', `${segs}`);
  const barText = await bar.innerText();
  check(/168/.test(barText), 'the total reads 168 through isCountableApartment', barText.slice(0, 60));
  const deskBarVisible = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div')].filter(d =>
      (d.className || '').toString().includes('diag:block'));
    return els.some(d => d.offsetWidth > 0);
  });
  check(!deskBarVisible, 'the desktop toolbar is hidden below 900');
  const buildings = await page.evaluate(() =>
    [...document.querySelectorAll('div.tracking-widest')].filter(d => d.getBoundingClientRect().width > 0).length);
  check(buildings === 1, 'one building at a time at 768', `${buildings} name bars`);
  // press the first segment → the filter takes it
  const segId = await page.locator('[data-stage-seg]').first().getAttribute('data-stage-seg');
  await page.locator('[data-stage-seg]').first().click();
  await page.waitForTimeout(400);
  const dimmed = await page.evaluate(() =>
    [...document.querySelectorAll('[data-stage-seg]')].filter(x => Number(getComputedStyle(x).opacity) < 0.5).length);
  check(dimmed >= 1, 'pressing a segment filters (others step back)', `${dimmed} dimmed, picked ${segId}`);
  // at 1000 the desktop bar returns and the stage bar goes
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.waitForTimeout(600);
  check(!(await bar.isVisible()), 'the stage bar goes at 900+');
  const buildings2 = await page.evaluate(() =>
    [...document.querySelectorAll('div.tracking-widest')].filter(d => d.getBoundingClientRect().width > 0).length);
  check(buildings2 === 3, 'all three buildings return at 900+', `${buildings2}`);
  await ctx.close();
}

// ── the drawer at 768 vs 829: the plan tab vs the side pane ────────────────
{
  const ctx = await b.newContext({ viewport: { width: 829, height: 690 } });
  await applySeed(ctx, blob);
  await ctx.addInitScript(id => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw);
    for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.plansPdfLink = `https://drive.google.com/file/d/${id}/view`;
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  }, PLAN_ID);
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(2600);
  await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().click();
  await page.waitForTimeout(1500);
  const planTab829 = await page.locator('.drawer-panel button', { hasText: /^(Plan|תוכנית)$/ }).count();
  check(planTab829 === 0, 'at 829 (≥800) there is no Plan tab — the plan sits beside the details');
  await page.waitForTimeout(2500);
  const cols = await page.evaluate(() => {
    const panel = document.querySelector('.drawer-panel');
    const fields = [...panel.querySelectorAll('div')].find(d => /^0 0 \d+px$/.test(d.style.flex));
    return { fields: fields ? parseInt(fields.style.flex.match(/(\d+)px/)[1], 10) : 0,
             modal: Math.round(panel.getBoundingClientRect().width) };
  });
  check(cols.fields > 0 && cols.fields < 560,
    'the details column GIVES WAY on a narrow screen (decision 1)', JSON.stringify(cols));
  // fold it: 768 wide — the tab appears, the pane goes
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(800);
  const planTab768 = await page.locator('.drawer-panel button', { hasText: /^(Plan|תוכנית)$/ }).count();
  check(planTab768 === 1, 'at 768 (<800) the Plan tab appears with the window still open');
  await page.locator('.drawer-panel button', { hasText: /^(Plan|תוכנית)$/ }).first().click();
  await page.waitForTimeout(800);
  check(await page.locator('[data-plan-tabs]').count() === 0,
    'and the Plan tab draws no tab strip (decision 2)');
  await ctx.close();
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
