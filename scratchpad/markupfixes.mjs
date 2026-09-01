// The markup round's four independent fixes, end to end on a real rendered
// PDF: the zoom-out floor at fit, the honest fit-to-page icon beside a REAL
// full-screen button, gentler zoom taps on a touch screen, and the per-machine
// button-size setting the studio follows.
//
// Like planviewer, the PDF is made with pdf-lib and served on the route the
// app actually asks (`/api/drive-fetch`) — there is no Drive in this container.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

const PLAN_ID = 'HARNESSPLAN1';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  for (let i = 1; i < 9; i++) {
    page.drawLine({ start: { x: 30 + i * 125, y: 30 }, end: { x: 30 + i * 125, y: 812 }, thickness: 0.6, color: rgb(0.55, 0.62, 0.72) });
  }
  page.drawText('MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  return Buffer.from(await doc.save());
}

const planBytes = await makePlan();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);

async function freshCtx(extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ...extra });
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
  return ctx;
}

async function openViewer(page) {
  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(2500);
  const cell = await page.$('[data-apt-id="A1-53"]') ?? await page.$('text=53');
  if (!cell) throw new Error('could not find apartment 53');
  await cell.click();
  await page.waitForTimeout(4000);
}

const pct = p => p.evaluate(() => {
  const b = [...document.querySelectorAll('button')]
    .find(x => x.title === 'Fit the sheet to the window' && /%/.test(x.textContent ?? ''));
  return b ? parseInt(b.textContent, 10) : null;
});

// ── 1 · the desk viewer: the floor, the fit icon, real full screen ─────────
{
  const ctx = await freshCtx();
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await openViewer(page);

  const open = await pct(page);
  check(open != null && open > 5, 'the viewer opened fitted', `${open}%`);

  // OWNER REVERSAL (2026-09-01): zooming out no longer stops at the fit — the
  // sheet shrinks into the stage, and only the real floor (a quarter of the
  // fit) greys the −, honestly.
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => x.title === 'Zoom out' || x.title === 'As small as it goes');
      if (b && !b.disabled) b.click();
    });
    await page.waitForTimeout(70);
  }
  const floored = await pct(page);
  check(floored != null && floored < open - 10,
    'zooming out goes BELOW the fit now', `${open}% → ${floored}%`);
  const minusState = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => x.title === 'Zoom out' || x.title === 'As small as it goes');
    return b ? { dis: b.disabled, title: b.title } : null;
  });
  check(!!minusState && minusState.dis && minusState.title === 'As small as it goes',
    'and the − greys honestly at the real floor', JSON.stringify(minusState));

  // Back to the fit, then in past it, then the fit button brings it back.
  await page.click('[data-plan-fit]');
  await page.waitForTimeout(600);
  for (let i = 0; i < 4; i++) { await page.click('[title="Zoom in"]'); await page.waitForTimeout(70); }
  const zoomed = await pct(page);
  check(zoomed != null && zoomed > open + 20, 'zooming in still works past the fit', `${zoomed}%`);
  await page.click('[data-plan-fit]');
  await page.waitForTimeout(600);
  const refit = await pct(page);
  check(refit != null && Math.abs(refit - open) <= 1, 'the fit-to-page button fits the page', `${refit}%`);

  // The pill's order and honesty: fullscreen sits between zoom-in and fit,
  // the fit icon is the square, and fullscreen genuinely goes full screen.
  const order = await page.evaluate(() => {
    const pill = document.querySelector('[data-plan-fullscreen]')?.parentElement;
    if (!pill) return null;
    const kids = [...pill.querySelectorAll('button')].map(b => b.title);
    const fit = pill.querySelector('[data-plan-fit]');
    return {
      titles: kids,
      fsAfterPlus: kids.indexOf('Full screen') === kids.indexOf('Zoom in') + 1,
      fitLast: kids.indexOf('Fit to page') === kids.length - 1,
      fitIsSquare: !!fit?.querySelector('svg rect'),
    };
  });
  check(!!order && order.fsAfterPlus, 'Full screen sits right after zoom-in', JSON.stringify(order?.titles));
  check(!!order && order.fitLast && order.fitIsSquare, 'and the fit button wears the SQUARE icon');

  await page.click('[data-plan-fullscreen]');
  await page.waitForTimeout(700);
  const inFull = await page.evaluate(() => ({
    full: !!document.fullscreenElement,
    exitBtn: [...document.querySelectorAll('[data-plan-fullscreen]')].some(b => b.title === 'Exit full screen'),
  }));
  check(inFull.full, 'pressing Full screen really enters full screen');
  check(inFull.exitBtn, 'and the button itself becomes the visible way out');
  await page.click('[data-plan-fullscreen]');
  await page.waitForTimeout(700);
  check(await page.evaluate(() => !document.fullscreenElement), 'pressing it again leaves full screen');

  await ctx.close();
}

// ── 2 · a touch screen zooms in gentler steps ──────────────────────────────
{
  const ctx = await freshCtx();
  const page = await ctx.newPage();
  await openViewer(page);
  // setTouchEmulationEnabled (+ mouse-as-touch) genuinely flips
  // `any-hover: none`, so the touch step rule is live rather than simulated —
  // setEmulatedMedia's feature overrides do NOT reach matchMedia in this
  // Chromium, probed. Switched on AFTER the viewer is open because the mouse
  // emulation hangs Playwright's own synthetic clicks; the button below is
  // pressed through the DOM instead.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  await page.waitForTimeout(300);
  const anyHover = await page.evaluate(() => matchMedia('(any-hover: none)').matches);
  check(anyHover, 'the touch profile is live (any-hover: none)');

  const before = await pct(page);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => b.title === 'Zoom in')?.click();
  });
  await page.waitForTimeout(300);
  const after = await pct(page);
  const grew = after - before;
  // OWNER SUPERSESSION (2026-09-01): the gentle ~8% tap was his "the plus
  // zoom thing we need to fix" — a tap now moves a real ×1.25 step.
  const step = Math.round(before * 1.25) - before;
  check(before != null && grew > 0 && Math.abs(grew - step) <= 1,
    'one tap moves a real ×1.25 step', `${before}% → ${after}% (+${grew})`);
  await ctx.close();
}

// ── 3 · the per-machine button size, set in app settings, followed live ────
{
  const ctx = await freshCtx();
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/app-settings');
  await page.waitForTimeout(1800);
  // The App tab holds the This-computer card.
  await page.click('button:text-is("App")');
  await page.waitForTimeout(600);
  const card = page.locator('[data-markup-scale]');
  check(await card.count() === 1, 'the This-computer card offers the markup button size');
  check(await card.locator('button').count() === 5, 'five sizes, Normal to Giant');
  await card.locator('button', { hasText: 'Bigger' }).click();
  await page.waitForTimeout(300);
  const stored = await page.evaluate(() => localStorage.getItem('markup_ui_scale'));
  check(stored === '1.5', 'picking Bigger stores 1.5 on THIS machine only', String(stored));

  // The studio follows: at 1.5 the top-bar undo icon is 14 × 1.5 = 21px.
  await openViewer(page);
  const markUp = page.locator('button:has-text("Mark up")').first();
  check(await markUp.count() === 1, 'the drawer offers Mark up');
  await markUp.click();
  await page.waitForTimeout(2500);
  const icon = await page.evaluate(() => {
    const svg = document.querySelector('[data-top-undo] svg');
    return svg ? Number(svg.getAttribute('width')) : null;
  });
  check(icon === 21, 'the studio draws its buttons half again as big', `undo icon ${icon}px`);

  // The studio's header cluster carries the same honest pair.
  const studio = await page.evaluate(() => {
    const fs = [...document.querySelectorAll('[data-plan-fullscreen]')].find(b => b.closest('.fixed'));
    const fit = [...document.querySelectorAll('[data-plan-fit]')].find(b => b.closest('.fixed'));
    return { fs: !!fs, fit: !!fit && !!fit.querySelector('svg rect') };
  });
  check(studio.fs && studio.fit, 'the markup header has Full screen and the square fit too');
  await ctx.close();
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await browser.close();
process.exit(fails ? 1 : 0);
