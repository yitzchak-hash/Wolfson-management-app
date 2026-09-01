// The punch-list pins reach the STAMPED Drive PDF: pinStamp() (planExport)
// through the real server stamp() (api/plan-annotate.js), then the stamped
// bytes rendered by the app's own viewer and the pixels counted — a red disc
// for the open pin, a grey one for the resolved pin, on the sheet itself.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';
import { stamp } from '../api/plan-annotate.js';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

// pinStamp is TypeScript — load it the taskdays way.
const vite = await createServer({ server: { middlewareMode: true }, logLevel: 'silent' });
const { pinStamp } = await vite.ssrLoadModule('/src/data/planExport.ts');

const W = 1191, H = 842;
const doc = await PDFDocument.create();
const page0 = doc.addPage([W, H]);
page0.drawRectangle({ x: 20, y: 20, width: W - 40, height: H - 40, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
const planBytes = Buffer.from(await doc.save());

const pins = [
  { id: 'P1', apartmentId: 'A1-53', xPct: 30, yPct: 40, text: 'leak', createdAt: '2026-01-01', createdBy: 'Probe' },
  { id: 'P2', apartmentId: 'A1-53', xPct: 70, yPct: 60, text: 'done', createdAt: '2026-01-01', createdBy: 'Probe', resolvedAt: '2026-02-01' },
];
const marks = pinStamp(pins, W / H);
check(marks.length === 8, `two pins make eight marks (${marks.length})`);
check(marks.filter(m => m.tool === 'ellipse').length === 4, 'ring + disc per pin');
check(marks.filter(m => m.tool === 'text').length === 2, 'a number per pin');
// The disc is a CIRCLE on the page: x-extent × pageW must equal y-extent × pageH.
const disc = marks.find(m => m.id === 'pin-P1-disc');
const xExt = (disc.pts[3] - disc.pts[0]) * W;
const yExt = (disc.pts[4] - disc.pts[1]) * H;
check(Math.abs(xExt - yExt) < 0.01, `the disc is round on the sheet (${xExt.toFixed(2)} vs ${yExt.toFixed(2)})`);

const stamped = Buffer.from(await stamp(planBytes, marks.map(({ id: _id, ...r }) => r), 'Markup — v1', 'Probe'));
check(stamped.length > planBytes.length, `stamp grew the file (${planBytes.length} -> ${stamped.length})`);
check(stamped.includes('ocMarkup'), 'the marks sit in the optional-content layer');

// Render the stamped PDF through the app's own viewer and count the pixels.
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true });
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await applySeed(ctx, blob);
await ctx.addInitScript(() => {
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw);
  for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.plansPdfLink = 'https://drive.google.com/file/d/PINSTAMPED1/view';
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});
await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: stamped }));
await ctx.route('**://drive.google.com/**', r => r.abort());
const page = await ctx.newPage();
await page.goto('http://localhost:5173/project');
await page.waitForTimeout(3000);
await page.evaluate(() => document.querySelector('[data-apt-id="A1-53"]')?.click());
await page.waitForTimeout(6500);

const ink = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')].filter(c => c.width > 200 && c.height > 200);
  let best = null, bestArea = 0;
  for (const c of cs) { const a = c.width * c.height; if (a > bestArea) { bestArea = a; best = c; } }
  if (!best) return null;
  const g = best.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, best.width, best.height).data;
  let red = 0, grey = 0;
  for (let i = 0; i < d.length; i += 16) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a < 40) continue;
    if (r > 160 && gg < 110 && b < 110) red++;
    if (r > 120 && r < 180 && gg > 135 && gg < 195 && b > 160 && b < 215) grey++;
  }
  return { red, grey, w: best.width };
});
check(!!ink && ink.w > 300, 'the stamped sheet rendered', JSON.stringify(ink));
check(!!ink && ink.red > 120, `the open pin's red disc is on the sheet (${ink?.red})`);
check(!!ink && ink.grey > 80, `the resolved pin's grey disc too (${ink?.grey})`);

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await vite.close();
await browser.close();
process.exit(fails ? 1 : 0);
