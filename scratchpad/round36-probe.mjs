// Round 36: the drawer's second pass (realistic pens, live slider fill, width
// sync with the top bar, the Samsung see-through ramp, the in-app custom
// colour picker), the zoom floor reversal (minus goes below the fit), neat
// shapes (snap-to-shape with its toggle), and the consolidated Shapes tile.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 20, y: 20, width: 1151, height: 802, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  return Buffer.from(await doc.save());
}

const planBytes = await makePlan();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true });
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await applySeed(ctx, blob);
await ctx.addInitScript(() => {
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw);
  for (const a of d.apartments ?? []) if (a.id === 'A1-53') {
    a.plansPdfLink = 'https://drive.google.com/file/d/R36PLAN/view';
    a.driveLink = 'https://drive.google.com/drive/folders/JOBFOLDER1';
  }
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});
await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx.route('**/api/plan-annotate', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
  fileId: 'MK1', name: 'x.pdf', webViewLink: 'https://drive.google.com/file/d/MK1/view', folderId: 'AF', version: 1, sizeBytes: 9,
}) }));
await ctx.route('**/api/drive-files', r => {
  const body = JSON.parse(r.request().postData() || '{}');
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(body.metaOnly
      ? { folder: { id: body.folderId, name: 'folder' } }
      : { files: [] }) });
});
await ctx.route('**/api/share', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
await ctx.route('**://drive.google.com/**', r => r.abort());

const page = await ctx.newPage();
await page.goto('http://localhost:5174/project');
await page.waitForTimeout(3000);
await page.evaluate(() => document.querySelector('[data-apt-id="A1-53"]')?.click());
await page.waitForTimeout(6000);
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => /^Mark up/.test((x.textContent ?? '').trim()) || x.title === 'Mark up')?.click();
});
await page.waitForTimeout(3000);

const setRange = (sel, v) => page.evaluate(([s, val]) => {
  const el = typeof s === 'string' ? document.querySelector(s) : null;
  if (!el) return false;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}, [sel, v]);
const topSlider = label => `
  const lab = [...document.querySelectorAll('label')].find(l => (l.textContent ?? '').includes('${label}'));
  const inp = lab && lab.querySelector('input');`;
const strokes = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('wolfson_app_data') ?? '{}');
  return (d.planAnnotations ?? []).flatMap(a => a.strokes ?? []).map(s => ({ tool: s.tool, n: s.pts.length }));
});
async function drawPath(fracs, delay = 18) {
  const cs = await page.evaluate(() => {
    const arr = [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width > 300);
    const r = arr[arr.length - 1].getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await page.mouse.move(cs.x + cs.w * fracs[0][0], cs.y + cs.h * fracs[0][1]);
  await page.mouse.down();
  for (const [fx, fy] of fracs.slice(1)) {
    await page.mouse.move(cs.x + cs.w * fx, cs.y + cs.h * fy);
    await page.waitForTimeout(delay);
  }
  await page.mouse.up();
  await page.waitForTimeout(1000);
}
const jitter = () => (Math.random() - 0.5) * 0.004;
function edge(ax, ay, bx, by, n = 6) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    out.push([ax + (bx - ax) * t + jitter(), ay + (by - ay) * t + jitter()]);
  }
  return out;
}

// ── 1 · the drawer, second pass ───────────────────────────────────────────
await page.evaluate(() => document.querySelector('[data-ink-tile]')?.click());
await page.waitForTimeout(500);
check(await page.locator('[data-pen-tray]').count() === 1, 'the drawer opens');

// realistic pens: the crayon wears its label oval, the pencil its pink
// eraser, the marker its colour-coded end — each pen is drawn whole now
const pens = await page.evaluate(() => ({
  crayonOvals: document.querySelectorAll('[data-pen="crayon"] svg ellipse').length,
  pencilPink: !!document.querySelector('[data-pen="pencil"] svg [fill="#f2a6b3"]'),
  brushParts: document.querySelectorAll('[data-pen="brush"] svg path, [data-pen="brush"] svg rect, [data-pen="brush"] svg line').length,
  barrels: document.querySelectorAll('[data-pen-tray] [data-pen] span span').length,
}));
check(pens.crayonOvals >= 2, 'the crayon wears its Crayola label oval', `${pens.crayonOvals} ellipses`);
check(pens.pencilPink, 'the pencil ends in its pink eraser');
check(pens.brushParts >= 4, 'the brush is drawn whole (bristles, ferrule, handle)', `${pens.brushParts} parts`);

// the width slider's fill FOLLOWS the thumb now
const fillBefore = await page.evaluate(() =>
  document.querySelector('[data-tray-size]')?.style.getPropertyValue('--fill'));
await page.evaluate(() => document.querySelector('[data-tray-plus]')?.click());
await page.evaluate(() => document.querySelector('[data-tray-plus]')?.click());
await page.waitForTimeout(300);
const fillAfter = await page.evaluate(() =>
  document.querySelector('[data-tray-size]')?.style.getPropertyValue('--fill'));
check(!!fillBefore && !!fillAfter && fillBefore !== fillAfter,
  'the blue fill moves with the thumb', `${fillBefore} -> ${fillAfter}`);

// the see-through ramp: Samsung's manner — transparent -> the ink itself
const alpha = await page.evaluate(() => {
  const el = document.querySelector('[data-tray-alpha]');
  return el ? { bg: el.style.backgroundImage, val: el.value } : null;
});
check(!!alpha && alpha.bg.includes('linear-gradient') && alpha.bg.includes('conic'),
  'the see-through track is a colour ramp over a checkerboard');
await setRange('[data-tray-alpha]', 40);
await page.waitForTimeout(300);
const alphaNum = await page.evaluate(() => document.querySelector('[data-tray-alpha-num]')?.textContent);
const topAlpha = await page.evaluate(() => {
  const lab = [...document.querySelectorAll('label')].find(l => (l.textContent ?? '').includes('See-through'));
  return lab?.querySelector('input')?.value;
});
check(alphaNum === '40%', 'the tray see-through reads back', `${alphaNum}`);
check(topAlpha === '0.4', 'and the TOP BAR See-through moved with it', `${topAlpha}`);

// the custom colour chip opens the full in-app picker ABOVE the tray
await page.evaluate(() => document.querySelector('[data-tray-custom]')?.click());
await page.waitForTimeout(500);
const pickerOnTop = await page.evaluate(() => {
  const hue = document.querySelector('.ink-hue');
  if (!hue) return { there: false };
  const r = hue.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { there: true, pressable: hue === hit || hue.contains(hit) };
});
check(pickerOnTop.there, 'the rainbow chip opens the in-app colour picker');
check(pickerOnTop.pressable, 'and the picker sits ABOVE the tray, pressable');
await page.mouse.click(6, 6);           // the picker backdrop — closes IT alone
await page.waitForTimeout(400);
check(await page.evaluate(() => !document.querySelector('.ink-hue') && !!document.querySelector('[data-pen-tray]')),
  'closing the picker leaves the tray standing');

// width typed on the TOP BAR shows in the tray at the same number
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.evaluate(() => {
  const lab = [...document.querySelectorAll('label')].find(l => (l.textContent ?? '').includes('Width'));
  const el = lab?.querySelector('input');
  if (!el) return;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, 30);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(300);
await page.evaluate(() => document.querySelector('[data-ink-tile]')?.click());
await page.waitForTimeout(500);
const sync = await page.evaluate(() => ({
  num: document.querySelector('[data-tray-size-num]')?.textContent,
  val: document.querySelector('[data-tray-size]')?.value,
  max: +(document.querySelector('[data-tray-size]')?.max ?? 0),
}));
check(sync.num === '30' && sync.val === '30' && sync.max >= 30,
  'a width set on the top bar shows in the tray, same number, in range', JSON.stringify(sync));
// put the pen back to its own size for the drawing below
await page.evaluate(() => document.querySelector('[data-pen="pen"]')?.click());
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// ── 2 · the zoom floor reversal ───────────────────────────────────────────
// The drawer PANE behind the studio carries its own zoom pill with the same
// titles, so everything here is scoped to the STUDIO — the container of the
// last (topmost) sheet canvas.
// The pane behind the studio has its own pill with the same button titles,
// and the studio's header shows no % readout at all — so the STUDIO's zoom is
// measured off its own sheet canvas's width, and its buttons are found by
// walking UP from that canvas to the first ancestor that carries them.
const sheetW = () => page.evaluate(() => {
  const arr = [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width > 100);
  return Math.round(arr[arr.length - 1]?.getBoundingClientRect().width ?? 0);
});
const clickZoom = title => page.evaluate(t => {
  const match = b => b.title === t || (t === 'Zoom out' && b.title === 'As small as it goes');
  const arr = [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width > 100);
  let node = arr[arr.length - 1];
  while (node && node !== document.body) {
    const b = [...node.querySelectorAll('button')].find(match);
    if (b) { const dis = !!b.disabled; if (!dis) b.click(); return { found: true, dis }; }
    node = node.parentElement;
  }
  return { found: false, dis: false };
}, title);
const w0 = await sheetW();
const minus = await clickZoom('Zoom out');
await page.waitForTimeout(600);
const w1 = await sheetW();
check(minus.found && !minus.dis, 'minus is ALIVE at the fit');
check(w1 < w0 - 20, 'and pressing it goes BELOW the fit', `${w0}px -> ${w1}px`);
await clickZoom('Zoom out');
await page.waitForTimeout(600);
const around = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width > 100);
  const sheet = cs[cs.length - 1]?.getBoundingClientRect();
  const stage = cs[cs.length - 1]?.closest('.overflow-auto')?.getBoundingClientRect();
  return sheet && stage ? { ok: sheet.width < stage.width - 40 && sheet.height < stage.height - 40 } : { ok: false };
});
check(around.ok, 'the stage shows AROUND the shrunken sheet');
const w2 = await sheetW();
await clickZoom('Zoom in');
await page.waitForTimeout(600);
const w3 = await sheetW();
check(w3 > w2 + 20, 'plus zooms back in', `${w2}px -> ${w3}px`);
// back to the fit for clean drawing coordinates — the STUDIO's own fit button
await page.evaluate(() => {
  const arr = [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width > 100);
  let node = arr[arr.length - 1];
  while (node && node !== document.body) {
    const b = node.querySelector('[data-plan-fit]');
    if (b) { b.click(); return; }
    node = node.parentElement;
  }
});
await page.waitForTimeout(800);

// ── 3 · neat shapes ───────────────────────────────────────────────────────
const snapBtn = await page.evaluate(() => {
  const b = document.querySelector('[data-shape-snap]');
  return b ? { bg: getComputedStyle(b).backgroundColor } : null;
});
check(!!snapBtn, 'the Neat shapes toggle stands on the top bar');
check(snapBtn?.bg === 'rgb(74, 168, 216)', 'and it is ON by default (accent)', snapBtn?.bg);

// a rough square becomes the app's own BOX mark
await drawPath([
  ...edge(0.30, 0.30, 0.50, 0.30), ...edge(0.50, 0.30, 0.50, 0.55),
  ...edge(0.50, 0.55, 0.30, 0.55), ...edge(0.30, 0.55, 0.30, 0.31),
]);
let st = await strokes();
check(st.filter(s => s.tool === 'rect').length === 1 && st[st.length - 1].n === 6,
  'a drawn square snaps to a straight box (2 clean corners)', JSON.stringify(st));

// a rough circle becomes the app's own CIRCLE mark
{
  const fr = [];
  const cs = await page.evaluate(() => {
    const arr = [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width > 300);
    const r = arr[arr.length - 1].getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  const r = 0.16 * cs.h;
  for (let i = 0; i <= 34; i++) {
    const t = (i / 34) * Math.PI * 2;
    fr.push([0.62 + (r * Math.cos(t)) / cs.w + jitter(), 0.42 + (r * Math.sin(t)) / cs.h + jitter()]);
  }
  await drawPath(fr, 12);
}
st = await strokes();
check(st.filter(s => s.tool === 'ellipse').length === 1, 'a drawn circle snaps to a circle', JSON.stringify(st.map(s => s.tool)));

// toggled OFF, the same square stays exactly as drawn
await page.evaluate(() => document.querySelector('[data-shape-snap]')?.click());
await page.waitForTimeout(300);
await drawPath([
  ...edge(0.30, 0.62, 0.46, 0.62), ...edge(0.46, 0.62, 0.46, 0.82),
  ...edge(0.46, 0.82, 0.30, 0.82), ...edge(0.30, 0.82, 0.30, 0.63),
]);
st = await strokes();
const freehandSquare = st.filter(s => s.tool === 'pen');
check(freehandSquare.length === 1 && freehandSquare[0].n > 20,
  'toggled off, the square stays freehand', JSON.stringify(st.map(s => `${s.tool}:${s.n}`)));

// toggled back ON, an honest zigzag is NOT snapped to anything
await page.evaluate(() => document.querySelector('[data-shape-snap]')?.click());
await page.waitForTimeout(300);
{
  const fr = [];
  for (let i = 0; i <= 14; i++) fr.push([0.55 + i * 0.02, 0.72 + (i % 2 ? 0.045 : -0.035)]);
  await drawPath(fr);
}
st = await strokes();
check(st.filter(s => s.tool === 'pen').length === 2, 'a zigzag stays freehand with the toggle on',
  JSON.stringify(st.map(s => s.tool)));

// ── 4 · the Shapes tile ───────────────────────────────────────────────────
const tiles = await page.evaluate(() => {
  const labels = [...document.querySelectorAll('button span')].map(s => s.textContent?.trim());
  return {
    shapeTiles: document.querySelectorAll('[data-shape-tile]').length,
    arrow: labels.filter(l => l === 'Arrow').length,
    box: labels.filter(l => l === 'Box').length,
    circle: labels.filter(l => l === 'Circle').length,
    bubble: labels.filter(l => l === 'Bubble').length,
  };
});
check(tiles.shapeTiles === 1, 'ONE Shapes tile on the rail');
check(tiles.arrow === 0 && tiles.box === 0 && tiles.circle === 0,
  'arrow / box / circle tiles are gone', JSON.stringify(tiles));
check(tiles.bubble === 1, 'the bubble keeps its own tile');

await page.evaluate(() => document.querySelector('[data-shape-tile]')?.click());   // arms Line
await page.waitForTimeout(300);
await page.evaluate(() => document.querySelector('[data-shape-tile]')?.click());   // opens the flyout
await page.waitForTimeout(500);
check(await page.locator('[data-shape-tray]').count() === 1
  && await page.locator('[data-shape-tray] [data-shape]').count() === 4,
  'pressing the armed tile opens the four-shape flyout');
await page.evaluate(() => document.querySelector('[data-shape="rect"]')?.click());
await page.waitForTimeout(400);
const wearing = await page.evaluate(() => ({
  gone: !document.querySelector('[data-shape-tray]'),
  label: document.querySelector('[data-shape-tile]')?.textContent?.trim(),
}));
check(wearing.gone && wearing.label === 'Box', 'picking Box closes the flyout and the tile wears it', JSON.stringify(wearing));
await drawPath([[0.56, 0.6], [0.6, 0.64], [0.66, 0.7]], 30);
st = await strokes();
check(st.filter(s => s.tool === 'rect').length === 2, 'and drawing with it makes a box', JSON.stringify(st.map(s => s.tool)));

await browser.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
