// The plan screens on a phone: the viewer with its pins, and the markup studio.
//
// These were never in the sweep, because both need a real PDF and the
// container has no Drive. So the harness makes one with pdf-lib and serves it
// on the route the app actually asks — `/api/drive-fetch` — which means the
// studio loads pdf.js, renders a page and arms its tools for real rather than
// being poked at through a mock.
import { chromium, devices } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from './seed.mjs';

const LANDSCAPE = process.env.VIEW === 'landscape';
const VW = LANDSCAPE ? 844 : 390;
const VH = LANDSCAPE ? 390 : 844;
const TAG = LANDSCAPE ? 'land-' : '';
const PLAN_ID = 'HARNESSPLAN1';

/** A landscape sheet with enough line work to see what markup lands on. */
async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);            // A3 landscape, points
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  for (let i = 1; i < 6; i++) {
    page.drawLine({ start: { x: 30 + i * 188, y: 30 }, end: { x: 30 + i * 188, y: 812 }, thickness: 0.8, color: rgb(0.6, 0.66, 0.75) });
  }
  for (let i = 1; i < 4; i++) {
    page.drawLine({ start: { x: 30, y: 30 + i * 195 }, end: { x: 1161, y: 30 + i * 195 }, thickness: 0.8, color: rgb(0.6, 0.66, 0.75) });
  }
  page.drawText('A1 / 53 — MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  return Buffer.from(await doc.save());
}

const planBytes = await makePlan();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);

const ctx = await browser.newContext({
  viewport: { width: VW, height: VH },
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  userAgent: devices['iPhone 13'].userAgent,
});
await applySeed(ctx, blob);
// Give apartment A1-53 a plan. Seeded through the same field the office fills,
// so nothing about the app's own path is bypassed.
await ctx.addInitScript(planId => {
  const raw = localStorage.getItem('wolfson_app_data');
  if (!raw) return;
  const d = JSON.parse(raw);
  const link = `https://drive.google.com/file/d/${planId}/view`;
  // A1-53 for the office, and every apartment the worker has a task on — the
  // portal only draws its plan section when the job HAS a plan, so seeding one
  // apartment tested the office and quietly skipped the worker.
  const wanted = new Set(['A1-53', ...(d.contractorAssignments ?? []).map(a => a.apartmentId)]);
  for (const a of d.apartments ?? []) if (wanted.has(a.id)) a.plansPdfLink = link;
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}, PLAN_ID);

await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx.route('**://drive.google.com/**', r => r.abort());

const page = await ctx.newPage();

async function audit(label) {
  return await page.evaluate(() => {
    const out = { overflow: [], clipped: [] };
    const vw = document.documentElement.clientWidth;
    const vis = el => { const c = getComputedStyle(el); return c.visibility !== 'hidden' && c.display !== 'none' && c.opacity !== '0'; };
    const inScroller = el => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll') return p.getBoundingClientRect().right <= vw + 1.5;
      }
      return false;
    };
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || !vis(el)) continue;
      if (r.right > vw + 1.5 && r.width < vw * 3 && !inScroller(el)) {
        out.overflow.push(`${el.tagName}.${(el.className || '').toString().slice(0, 46)} right=${Math.round(r.right)}`);
      }
      if (el.children.length === 0 && (el.textContent || '').trim() && !(el.className || '').toString().includes('truncate')) {
        const cs = getComputedStyle(el);
        if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible') {
          out.clipped.push(`"${(el.textContent || '').trim().slice(0, 20)}" ${el.scrollWidth}>${el.clientWidth}`);
        }
      }
    }
    return out;
  });
}

async function report(name) {
  await page.screenshot({ path: `scratchpad/plan-${TAG}${name}.png` });
  const a = await audit(name);
  const bad = a.overflow.length + a.clipped.length;
  console.log(`${bad ? 'FAIL' : 'OK  '} ${TAG}${name}  overflow=${a.overflow.length} clipped=${a.clipped.length}`);
  a.overflow.slice(0, 6).forEach(x => console.log('       > ' + x));
  a.clipped.slice(0, 6).forEach(x => console.log('       ~ ' + x));
  return bad;
}

// ── the office: plan pane and its pins ────────────────────────────────────
await page.goto('http://localhost:5173/project');
await page.waitForTimeout(1700);
await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().tap();
await page.waitForTimeout(1200);
await report('drawer-plan');

// The plan tab, where the viewer and the pin controls live on a phone.
const planTab = page.locator('.drawer-panel button').filter({ hasText: /^Plan/ });
if (await planTab.count()) {
  await planTab.first().tap();
  await page.waitForTimeout(1200);
  await report('drawer-plantab');
} else {
  console.log('     (no Plan tab found in the drawer)');
}

// ── the markup studio ─────────────────────────────────────────────────────
const markup = page.locator('button').filter({ hasText: /Mark up/i });
if (await markup.count()) {
  await markup.first().tap();
  await page.waitForTimeout(3500);          // pdf.js + first render
  await report('studio');
  const tools = await page.evaluate(() =>
    [...document.querySelectorAll('button[title]')].filter(b => b.offsetParent).length);
  console.log(`       tools visible: ${tools}`);

  // ── a FINGER draws a stroke ──
  // The one claim layout checks cannot make: a bare touch, on the live canvas,
  // leaves ink. Arm the pen, drag a finger, and read the committed-ink canvas's
  // pixels — the palm rule and touch-action both sit in this path, so if either
  // regresses this goes blank.
  // The pen opens ARMED, and since the tray round a tap on the armed ink tile
  // opens the PEN DRAWER — whose backdrop would swallow the drawing touch. So
  // the tap stays (it proves the tile is tappable) and the drawer, if it
  // opened, is closed by a tap on its backdrop before drawing.
  const pen = page.locator('button[title]').filter({ hasText: /^Pen$/ });
  if (await pen.count()) await pen.first().tap();
  await page.waitForTimeout(400);
  if (await page.locator('[data-pen-tray]').count()) {
    await page.touchscreen.tap(5, 5);
    await page.waitForTimeout(400);
  }
  const canvases = page.locator('canvas');
  const nCanv = await canvases.count();
  const cbox = await canvases.nth(nCanv - 1).boundingBox();   // live layer is topmost
  const inkBefore = await page.evaluate(() => {
    const list = [...document.querySelectorAll('canvas')];
    const c = list[list.length - 2];                          // studio committed-ink (its stack is last; the plan pane below has its own three)
    if (!c) return -1;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  const sx = cbox.x + cbox.width * 0.3, sy = cbox.y + cbox.height * 0.5;
  // A raw touch sequence, not tap(): a stroke is a press that MOVES.
  const cdp = await page.context().newCDPSession(page);
  const pts = Array.from({ length: 12 }, (_, i) => ({
    x: sx + i * (cbox.width * 0.35 / 11), y: sy + Math.sin(i / 2) * 30 }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
  for (const pt of pts.slice(1)) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(900);
  const inkAfter = await page.evaluate(() => {
    const list = [...document.querySelectorAll('canvas')];
    const c = list[list.length - 2];
    if (!c) return -1;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  console.log(`       committed ink pixels: ${inkBefore} -> ${inkAfter}`);
  console.log(inkAfter > inkBefore + 200
    ? 'OK   a finger stroke committed ink'
    : 'FAIL finger drawing left no ink');
} else {
  console.log('     (no Mark up button found)');
}

// ── the pins, driven with a finger ────────────────────────────────────────
// The point of this page on a phone: can somebody standing in the flat drop a
// snag and type it? Tapping, not clicking — a phone has no hover to reveal
// anything with.
await page.goto('http://localhost:5173/project');
await page.waitForTimeout(1700);
await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().tap();
await page.waitForTimeout(1200);
const planTab2 = page.locator('.drawer-panel button').filter({ hasText: /^Plan/ });
if (await planTab2.count()) { await planTab2.first().tap(); await page.waitForTimeout(900); }
const pinBtn = page.getByRole('button', { name: /^Pin$/ });
if (await pinBtn.count()) {
  await pinBtn.first().tap();
  const box = await page.locator('div.relative.flex-1.min-h-0').filter({ has: page.locator('canvas') }).first().boundingBox();
  if (box) {
    await page.touchscreen.tap(box.x + box.width * 0.45, box.y + box.height * 0.4);
    await page.waitForTimeout(700);
    const ta = page.locator('textarea[placeholder="What needs doing here?"]');
    const opened = await ta.count() > 0;
    console.log(`${opened ? 'OK  ' : 'FAIL'} pin dropped by tap and its note opened`);
    if (opened) {
      await ta.fill('Riser boxed in too tight — needs 40mm clearance');
      await page.getByRole('button', { name: 'Save', exact: true }).tap();
      await page.waitForTimeout(400);
      await report('pin-note');
      const w = await page.evaluate(() => {
        const el = document.querySelector('textarea[placeholder="What needs doing here?"]')?.closest('div');
        return el ? Math.round(el.getBoundingClientRect().right) : 0;
      });
      console.log(`       note bubble right edge: ${w}px (viewport ${VW})`);
    }
  }
} else {
  console.log('FAIL no Pin button on the phone plan view');
}

// ── the worker: the same plan, read-only ──────────────────────────────────
await page.goto(`http://localhost:5173/c/${PORTAL_TOKEN}`);
await page.waitForTimeout(1800);
const card = page.locator('button').filter({ hasText: /concealed unit|registers|thermostats/i });
if (await card.count()) {
  await card.first().tap();
  await page.waitForTimeout(1500);
  await report('portal-plan');

  // Expanded, which is where the office's pins draw for the worker. A snag he
  // cannot see is a snag nobody fixes.
  const expand = page.getByText(/Tap to expand|View/i).first();
  if (await expand.count()) {
    await expand.tap();
    await page.waitForTimeout(1400);
    await report('portal-plan-open');
    const pins = await page.evaluate(() =>
      [...document.querySelectorAll('button')].filter(b => {
        const r = b.getBoundingClientRect();
        return r.width > 20 && r.width < 34 && Math.abs(r.width - r.height) < 6 && b.offsetParent;
      }).length);
    console.log(`       round pin markers drawn for the worker: ${pins}`);
  }
}

await browser.close();
