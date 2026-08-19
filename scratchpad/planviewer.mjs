// The plan VIEWER, at the desk: sharpness, a zoom that does not blink, and
// the Drive-shaped controls the office already has in their hands.
//
// Like planphone, it makes a real PDF with pdf-lib and serves it on the route
// the app actually asks (`/api/drive-fetch`), so pdf.js loads and a page really
// renders — there is no Drive in this container.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

const PLAN_ID = 'HARNESSPLAN1';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan() {
  const doc = await PDFDocument.create();
  for (let pg = 0; pg < 3; pg++) {
    const page = doc.addPage([1191, 842]);
    page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
    for (let i = 1; i < 9; i++) {
      page.drawLine({ start: { x: 30 + i * 125, y: 30 }, end: { x: 30 + i * 125, y: 812 }, thickness: 0.6, color: rgb(0.55, 0.62, 0.72) });
    }
    for (let i = 1; i < 6; i++) {
      page.drawLine({ start: { x: 30, y: 30 + i * 130 }, end: { x: 1161, y: 30 + i * 130 }, thickness: 0.6, color: rgb(0.55, 0.62, 0.72) });
    }
    page.drawText(`SHEET ${pg + 1} — MECHANICAL LAYOUT`, { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  }
  return Buffer.from(await doc.save());
}

const planBytes = await makePlan();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await applySeed(ctx, blob);
await ctx.addInitScript(planId => {
  const raw = localStorage.getItem('wolfson_app_data');
  if (!raw) return;
  const d = JSON.parse(raw);
  const link = `https://drive.google.com/file/d/${planId}/view`;
  for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.plansPdfLink = link;
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}, PLAN_ID);
await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx.route('**://drive.google.com/**', r => r.abort());

const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto('http://localhost:5173/project');
await page.waitForTimeout(2500);

// Open A1-53 — the drawer's plan pane is the read-only viewer.
const cell = await page.$('[data-apt-id="A1-53"]') ?? await page.$('text=53');
if (!cell) { console.log('FAIL could not find apartment 53'); process.exit(1); }
await cell.click();
await page.waitForTimeout(4000);

const stack = () => page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')];
  // The plan layer is the first of the viewer's three stacked canvases.
  const c = cs.find(x => x.width > 200 && x.height > 150);
  if (!c) return null;
  const css = parseFloat(c.style.width) || c.getBoundingClientRect().width;
  const ctx2 = c.getContext('2d');
  const d = ctx2.getImageData(0, 0, Math.min(c.width, 400), Math.min(c.height, 300)).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) ink++;
  return { backing: c.width, css: Math.round(css), ratio: +(c.width / css).toFixed(2), ink };
});

const a = await stack();
check(!!a, 'the plan rendered in the drawer');
if (a) {
  check(a.ink > 500, 'there is line work on the canvas', `${a.ink} inked pixels`);
  check(a.ratio >= 1.9, 'the sheet is drawn ABOVE screen resolution',
    `backing ${a.backing}px for ${a.css}px on screen (${a.ratio}×)`);
}

// The Drive-shaped control bar.
const bar = await page.evaluate(() => {
  const b = [...document.querySelectorAll('div')].find(d =>
    typeof d.className === 'string' && d.className.includes('rounded-full')
    && d.className.includes('absolute') && /\d+ \/ \d+/.test(d.textContent ?? ''));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  const host = b.offsetParent?.getBoundingClientRect();
  return {
    text: (b.textContent ?? '').replace(/\s+/g, ' ').trim(),
    centred: host ? Math.abs((r.left + r.width / 2) - (host.left + host.width / 2)) < 8 : false,
    nearBottom: host ? (host.bottom - r.bottom) < 40 : false,
  };
});
check(!!bar, 'the viewer has a floating control bar');
if (bar) {
  check(/\d+ \/ 3/.test(bar.text), 'it carries the page count', bar.text);
  check(bar.centred, 'centred, the way Drive puts it');
  check(bar.nearBottom, 'and along the bottom');
}

// Zooming must not blank the sheet. Five quick steps, reading the canvas
// straight after each one — the old code cleared all three layers per step.
let blanked = 0;
for (let i = 0; i < 5; i++) {
  const plus = await page.$('[title="Zoom in"]');
  if (!plus) break;
  await plus.click();
  await page.waitForTimeout(60);
  const s = await stack();
  if (!s || s.ink < 200) blanked++;
}
check(blanked === 0, 'zooming never leaves the sheet blank', `${blanked} of 5 steps came up empty`);

const after = await stack();
check(!!after && after.css > (a?.css ?? 0), 'and the sheet actually got bigger',
  `${a?.css} → ${after?.css}px`);

// Once the hand stops, it is redrawn at full resolution again.
await page.waitForTimeout(1200);
const settled = await stack();
check(!!settled && settled.ratio >= 1.9, 'and is re-drawn sharp when the zoom settles',
  `${settled?.ratio}×`);

await page.screenshot({ path: 'scratchpad/planviewer.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await browser.close();
process.exit(fails ? 1 : 0);
