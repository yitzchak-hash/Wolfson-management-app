// The plan zooms to the POINT UNDER THE MOUSE — including from the fitted,
// centred view, which is where it used to drift to the middle — and the Move
// tool pans when dragged on empty sheet.
//
// Same trick as planviewer: a real PDF made with pdf-lib, served on the route
// the app actually asks, because this container has no Drive.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

const PLAN_ID = 'HARNESSPLAN2';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'FAIL' : 'FAIL'}` && `${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  page.drawText('ZOOM SHEET', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
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

const cell = await page.$('[data-apt-id="A1-53"]') ?? await page.$('text=53');
if (!cell) { console.log('FAIL could not find apartment 53'); process.exit(1); }
await cell.click();
await page.waitForTimeout(4000);

/** The sheet's rect: the PDF canvas of the (only) mounted annotator. */
const sheetRect = () => page.evaluate(() => {
  const c = [...document.querySelectorAll('canvas')].find(x => x.width > 200 && x.height > 150);
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
});

// ── 1 · wheel zoom holds the sheet point under the cursor ───────────────────
let sr = await sheetRect();
check(!!sr && sr.width > 100, 'the sheet rendered', JSON.stringify(sr));

// A point deliberately OFF-CENTRE — a centre-anchored zoom passes at 0.5/0.5.
const f = { x: 0.22, y: 0.31 };
const at = { x: sr.left + sr.width * f.x, y: sr.top + sr.height * f.y };
await page.mouse.move(at.x, at.y);
for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
await page.waitForTimeout(500);

let sr2 = await sheetRect();
const fx2 = (at.x - sr2.left) / sr2.width;
const fy2 = (at.y - sr2.top) / sr2.height;
console.log('       zoom anchor:', JSON.stringify({ before: f, after: { x: +fx2.toFixed(3), y: +fy2.toFixed(3) }, grew: `${Math.round(sr.width)} → ${Math.round(sr2.width)}` }));
check(sr2.width > sr.width * 1.3, 'the wheel really zoomed in', `${Math.round(sr.width)} → ${Math.round(sr2.width)}`);
check(Math.abs(fx2 - f.x) < 0.04 && Math.abs(fy2 - f.y) < 0.04,
  'the sheet point under the cursor stayed under the cursor',
  `(${f.x}, ${f.y}) → (${fx2.toFixed(3)}, ${fy2.toFixed(3)})`);

// Zoom OUT holds it too.
for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(120); }
await page.waitForTimeout(400);
const sr3 = await sheetRect();
const fx3 = (at.x - sr3.left) / sr3.width;
check(Math.abs(fx3 - f.x) < 0.05, 'and zooming back out holds it as well', fx3.toFixed(3));

// ── 2 · the markup studio: Move drags the view on empty sheet ───────────────
const markUp = page.locator('button', { hasText: 'Mark up' }).first();
if (await markUp.count()) {
  await markUp.click();
  await page.waitForTimeout(3500);
  // Zoom in enough that there is somewhere to pan to.
  const zin = page.locator('button[title="Zoom in"]').last();
  for (let i = 0; i < 5; i++) { await zin.click(); await page.waitForTimeout(150); }
  await page.waitForTimeout(600);
  await page.keyboard.press('s');            // the Move tool's hotkey
  await page.waitForTimeout(300);

  const scr = () => page.evaluate(() => {
    const els = [...document.querySelectorAll('div')].filter(d =>
      d.scrollWidth > d.clientWidth + 40 && d.clientWidth > 400
      && /auto|scroll/.test(getComputedStyle(d).overflowX));
    const el = els[els.length - 1];
    return el ? { l: el.scrollLeft, t: el.scrollTop } : null;
  });
  const s0 = await scr();
  check(!!s0, 'the studio has a scrollable stage after zooming in');
  // Drag on empty sheet — well away from the title text at the top.
  await page.mouse.move(760, 560);
  await page.mouse.down();
  await page.mouse.move(560, 460, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const s1 = await scr();
  console.log('       move-pan:', JSON.stringify({ s0, s1 }));
  check(!!s1 && (Math.abs(s1.l - s0.l) > 120 || Math.abs(s1.t - s0.t) > 60),
    'in Move, a drag on empty sheet pans the view', JSON.stringify({ s0, s1 }));
  check(!!s1 && s1.l > s0.l, 'and in the direction the hand pulled');
} else {
  check(false, 'could not find the Mark up button');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
