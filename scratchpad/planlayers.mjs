// The plan viewer's Layers selector: switching a layer off must actually
// change what is drawn.
//
// A plan with real optional-content groups is the only way to test this, so the
// harness BUILDS one — two OCGs, each wrapping its own block of drawing, using
// the same pdf-lib machinery api/plan-annotate.js uses to add our markup layer.
import { chromium } from 'playwright';
import { PDFDocument, PDFName, PDFHexString, PDFOperator, PDFOperatorNames as Ops, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

const PLAN_ID = 'LAYERPLAN1';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

/** Put a named resource on a page, making the dictionary if it is missing. */
function addResource(pdf, page, kind, name, ref) {
  let res = page.node.lookup(PDFName.of('Resources'));
  if (!res) { res = pdf.context.obj({}); page.node.set(PDFName.of('Resources'), res); }
  let sub = res.lookup(PDFName.of(kind));
  if (!sub) { sub = pdf.context.obj({}); res.set(PDFName.of(kind), sub); }
  sub.set(PDFName.of(name), ref);
}

async function makeLayeredPlan() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([1191, 842]);

  // The base drawing, on no layer at all — so the sheet is never blank.
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  page.drawText('SHEET 1 — MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });

  const ctx = pdf.context;
  const groups = [
    { key: 'ocElec', label: 'Electrical', colour: rgb(0.85, 0.15, 0.15), y: 120 },
    { key: 'ocDuct', label: 'Ductwork', colour: rgb(0.1, 0.4, 0.85), y: 420 },
  ];
  const refs = [];
  for (const g of groups) {
    // PDFHexString, not a literal — a literal string is PDFDocEncoded and
    // mangles anything outside Latin-1. Same rule as the server.
    const ref = ctx.register(ctx.obj({ Type: 'OCG', Name: PDFHexString.fromText(g.label) }));
    refs.push(ref);
    addResource(pdf, page, 'Properties', g.key, ref);
    page.pushOperators(PDFOperator.of(Ops.BeginMarkedContentSequence, ['/OC', `/${g.key}`]));
    // A big solid band, so switching it off is unmissable in the pixels.
    page.drawRectangle({ x: 80, y: g.y, width: 1000, height: 240, color: g.colour });
    page.pushOperators(PDFOperator.of(Ops.EndMarkedContent));
  }
  pdf.catalog.set(PDFName.of('OCProperties'), ctx.obj({
    OCGs: refs,
    D: ctx.obj({ Order: refs, ON: refs, OFF: [] }),
  }));
  return Buffer.from(await pdf.save());
}

const planBytes = await makeLayeredPlan();
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
await page.waitForTimeout(4500);

/**
 * How much RED and BLUE the plan canvas is actually painting.
 *
 * The committed-ink canvas sits above the plan one and the drawer's pane
 * contributes its own stack, so the plan canvas is found by being the biggest
 * one that has anything on it rather than by its position — counting from an
 * index is what made an earlier harness read the wrong canvas and report no ink.
 */
const inkOf = () => page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')].filter(c => c.width > 200 && c.height > 200);
  let best = null, bestArea = 0;
  for (const c of cs) {
    const a = c.width * c.height;
    if (a > bestArea) { bestArea = a; best = c; }
  }
  if (!best) return null;
  const g = best.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, best.width, best.height).data;
  let red = 0, blue = 0;
  for (let i = 0; i < d.length; i += 16) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a < 40) continue;
    if (r > 150 && gg < 110 && b < 110) red++;
    if (b > 150 && r < 110) blue++;
  }
  return { red, blue, w: best.width, h: best.height };
});

const start = await inkOf();
console.log('       as opened:', JSON.stringify(start));
check(!!start && start.w > 200, 'the layered plan rendered');
check(!!start && start.red > 200 && start.blue > 200,
  'both layers are drawn to begin with', `red ${start?.red} blue ${start?.blue}`);

// Open the Layers panel.
const layersBtn = await page.$('button[title*="Layer"], button:has-text("Layers")');
check(!!layersBtn, 'there is a Layers control');
if (layersBtn) {
  await layersBtn.click({ force: true });
  await page.waitForTimeout(700);
  const listed = await page.evaluate(() => {
    const t = document.body.innerText;
    return { electrical: /Electrical/.test(t), ductwork: /Ductwork/.test(t) };
  });
  console.log('       panel lists:', JSON.stringify(listed));
  check(listed.electrical && listed.ductwork,
    'and it lists the plan’s own layers by name');

  if (listed.electrical) {
    // Switch Electrical off.
    const row = page.locator('button', { hasText: 'Electrical' }).first();
    await row.click({ force: true });
    await page.waitForTimeout(1400);
    const after = await inkOf();
    console.log('       after switching Electrical off:', JSON.stringify(after));
    check(after.red < start.red * 0.25,
      'switching a layer off really removes it from the drawing',
      `red ${start.red} → ${after.red}`);
    check(after.blue > start.blue * 0.6,
      'and leaves the other layer alone', `blue ${start.blue} → ${after.blue}`);

    // And back on again.
    await row.click({ force: true });
    await page.waitForTimeout(1400);
    const back = await inkOf();
    check(back.red > start.red * 0.6, 'switching it back on brings it back',
      `red ${after.red} → ${back.red}`);
  }
}

await page.screenshot({ path: 'scratchpad/planlayers.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await browser.close();
process.exit(fails ? 1 : 0);
