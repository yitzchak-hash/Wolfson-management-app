// A MOUSE drag on the drawer's plan pane PANS the sheet (owner, 2026-09-22:
// "holding the left button on the mouse and dragging, that doesn't work").
// Wheel and zoom already worked; a mouse never drag-scrolls by itself, so the
// stage takes the press. A motionless click still opens full screen, and the
// studio's Pan tool gets the same drag.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

const PLAN_ID = 'HARNESSPANPLAN';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  page.drawText('PAN SHEET', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
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
const cell = await page.$('[data-apt-id="A1-53"]');
if (!cell) { console.log('FAIL could not find apartment 53'); process.exit(1); }
await cell.click();
await page.waitForSelector('[data-plan-surface="pane"] canvas', { timeout: 20000 });
await page.waitForTimeout(2500);

const sheetRect = (surface = 'pane') => page.evaluate(sf => {
  const root = document.querySelector(`[data-plan-surface="${sf}"]`);
  const c = [...(root ?? document).querySelectorAll('canvas')].find(x => x.width > 200 && x.height > 150);
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}, surface);
const stageScroll = (surface = 'pane') => page.evaluate(sf => {
  const st = document.querySelector(`[data-plan-surface="${sf}"] [data-plan-stage]`);
  return st ? { sl: st.scrollLeft, st: st.scrollTop, cursor: getComputedStyle(st).cursor } : null;
}, surface);
const drag = async (from, to, steps = 8) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
};

// ── 1 · zoom in with the wheel (as before), then DRAG the sheet ─────────────
let sr = await sheetRect();
check(!!sr && sr.width > 100, '1 · the pane rendered the sheet', JSON.stringify(sr));
const mid = { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 };
await page.mouse.move(mid.x, mid.y);
for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
await page.waitForTimeout(500);
const zoomed = await sheetRect();
check(zoomed.width > sr.width * 1.4, '1 · the wheel zoomed in', `${Math.round(sr.width)} → ${Math.round(zoomed.width)}`);
const s0 = await stageScroll();
check(s0?.cursor === 'grab', '1 · the pane shows a grab hand', s0?.cursor);
const from = { x: mid.x + 60, y: mid.y + 40 };
const to = { x: from.x - 180, y: from.y - 120 };
await drag(from, to);
await page.waitForTimeout(300);
const s1 = await stageScroll();
console.log('       scroll:', JSON.stringify({ before: s0, after: s1 }));
check(!!s0 && !!s1 && Math.abs((s1.sl - s0.sl) - 180) <= 3 && Math.abs((s1.st - s0.st) - 120) <= 3,
  '1 · a left-button drag pans the sheet by exactly the hand\'s travel', `dx ${s1.sl - s0.sl} dy ${s1.st - s0.st}`);
check(await page.locator('[data-plan-surface="pane"]').evaluate(el => !!document.fullscreenElement) === false
  && await page.evaluate(() => !document.fullscreenElement), '1 · a drag did NOT open full screen');
const s1b = await stageScroll();
check(s1b.cursor === 'grab', '1 · the hand relaxes after the drag', s1b.cursor);

// The other way, too.
await drag(to, from);
await page.waitForTimeout(300);
const s2 = await stageScroll();
check(Math.abs(s2.sl - s0.sl) <= 3 && Math.abs(s2.st - s0.st) <= 3, '1 · dragging back returns to the same scroll', JSON.stringify(s2));

// ── 2 · a motionless click still opens full screen ──────────────────────────
await page.mouse.click(mid.x, mid.y);
await page.waitForTimeout(600);
const full = await page.evaluate(() => !!document.fullscreenElement);
check(full, '2 · a plain click on the sheet still opens full screen');
if (full) {
  // In full screen the same drag pans too.
  const fr = await sheetRect();
  const fm = { x: fr.left + fr.width / 2, y: fr.top + fr.height / 2 };
  await page.mouse.move(fm.x, fm.y);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
  await page.waitForTimeout(400);
  const f0 = await stageScroll();
  await drag({ x: fm.x + 50, y: fm.y + 50 }, { x: fm.x - 100, y: fm.y - 50 });
  await page.waitForTimeout(300);
  const f1 = await stageScroll();
  check(Math.abs((f1.sl - f0.sl) - 150) <= 3 && Math.abs((f1.st - f0.st) - 100) <= 3, '2 · the drag pans in full screen too', `dx ${f1.sl - f0.sl} dy ${f1.st - f0.st}`);
  await page.locator('[data-plan-surface="pane"] [data-plan-fullscreen]').first().click();
  await page.waitForTimeout(600);
  check(await page.evaluate(() => !document.fullscreenElement), '2 · the button leaves full screen');
}

// ── 3 · the pin overlay keeps its own press (a pin can still be placed) ─────
{
  const pinBtn = page.locator('[data-plan-surface="pane"]').locator('xpath=ancestor::*[contains(@class,"drawer-panel")]').locator('button', { hasText: /^Pin$|Add a pin/i }).first();
  const anyPinBtn = await page.locator('button', { hasText: /^Pin$/ }).count();
  if (anyPinBtn) {
    await page.locator('button', { hasText: /^Pin$/ }).first().click();
    await page.waitForTimeout(300);
    const r = await sheetRect();
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data') ?? '{}').planPins?.length ?? 0);
    await page.mouse.click(r.left + r.width * 0.3, r.top + r.height * 0.4);
    await page.waitForTimeout(600);
    const bubble = await page.locator('textarea, [data-pin-note]').count();
    check(bubble > 0 || (await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data') ?? '{}').planPins?.length ?? 0)) > before,
      '3 · placing a pin on the sheet still works (the overlay kept its press)');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } else {
    console.log('       (no Pin button drawn — the pin section is skipped)');
  }
}

// ── 4 · the studio's Pan tool drags with the mouse ──────────────────────────
{
  const markup = page.locator('button', { hasText: 'Mark up' }).first();
  if (await markup.count()) {
    await markup.click();
    await page.waitForSelector('[data-plan-surface="studio"] canvas', { timeout: 20000 });
    await page.waitForTimeout(2000);
    await page.keyboard.press('v');   // Pan tool
    await page.waitForTimeout(200);
    const r = await sheetRect('studio');
    const m = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    await page.mouse.move(m.x, m.y);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
    await page.waitForTimeout(400);
    const p0 = await stageScroll('studio');
    await drag({ x: m.x + 40, y: m.y + 40 }, { x: m.x - 160, y: m.y - 60 });
    await page.waitForTimeout(300);
    const p1 = await stageScroll('studio');
    check(!!p0 && !!p1 && Math.abs((p1.sl - p0.sl) - 200) <= 3 && Math.abs((p1.st - p0.st) - 100) <= 3,
      "4 · the studio's Pan tool drags with the mouse", `dx ${p1?.sl - p0?.sl} dy ${p1?.st - p0?.st}`);
    check(await page.locator('[data-plan-surface="studio"]').count() === 1, '4 · the studio is still open (no full screen toggle in the studio)');
  } else {
    console.log('       (no Mark up button — the studio section is skipped)');
  }
}

// ── 5 · a FINGER drags the pane too (the browser's own scroll, touch-action) ─
{
  // Back to the pane: close the studio if it is open.
  if (await page.locator('[data-plan-surface="studio"]').count()) {
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  }
  // The studio's Escape can take the drawer with it in a harness — reopen.
  if (!(await page.locator('[data-plan-surface="pane"] canvas').count())) {
    await page.locator('[data-apt-id="A1-53"]').click();
    await page.waitForSelector('[data-plan-surface="pane"] canvas', { timeout: 20000 });
    await page.waitForTimeout(2500);
  }
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const r = await sheetRect();
  const m = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  await page.mouse.move(m.x, m.y);
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
  await page.waitForTimeout(400);
  const t0 = await stageScroll();
  const from = { x: m.x + 40, y: m.y + 40 };
  const fingerDrag = async (sx, sy) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + sx * i, y: from.y + sy * i }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(500);
  };
  await fingerDrag(-12, -3);
  const t1 = await stageScroll();
  console.log('       finger →:', JSON.stringify({ before: t0, after: t1 }));
  check(!!t0 && !!t1 && (t1.sl - t0.sl) > 60, '5 · a finger drag scrolls the pane sideways (native touch scroll)', `dx ${t1.sl - t0.sl}`);
  await fingerDrag(-3, -12);
  const t1b = await stageScroll();
  console.log('       finger ↓:', JSON.stringify({ before: t1, after: t1b }));
  check((t1b.st - t1.st) > 60, '5 · a finger drag scrolls the pane up and down', `dy ${t1b.st - t1.st}`);
  check(await page.evaluate(() => !document.fullscreenElement), '5 · a finger drag does not open full screen');
  // A finger TAP still opens full screen.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: m.x, y: m.y }] });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(700);
  check(await page.evaluate(() => !!document.fullscreenElement), '5 · a finger TAP on the sheet opens full screen');
  if (await page.evaluate(() => !!document.fullscreenElement)) {
    await page.locator('[data-plan-surface="pane"] [data-plan-fullscreen]').first().evaluate(b => b.click());
    await page.waitForTimeout(600);
  }
  // Two fingers still pinch.
  const r2 = await sheetRect();
  const c = { x: r2.left + r2.width / 2, y: r2.top + r2.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x - 40, y: c.y }, { x: c.x + 40, y: c.y }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x - 40 - 8 * i, y: c.y }, { x: c.x + 40 + 8 * i, y: c.y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
  const r3 = await sheetRect();
  check(r3.width > r2.width * 1.2, '5 · two fingers still pinch-zoom the pane', `${Math.round(r2.width)} → ${Math.round(r3.width)}`);
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
