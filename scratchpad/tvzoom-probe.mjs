// Reproduce the owner's "the zoom from the markup screen on the tv doesn't
// work": open a job's plan on the /tv wall (real drawer → embedded viewer
// pill), press − / + / the studio's zoom, and measure the sheet — with the
// TV's own conditions: a touch screen (any-hover: none via CDP) and a big
// panel. Plan served on /api/drive-fetch, the planphone manner.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const PLAN_ID = 'TVZOOMPLAN1';

async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  page.drawText('TV ZOOM SHEET', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  return Buffer.from(await doc.save());
}

const planBytes = await makePlan();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true });
const blob = await realisticWolfson(browser);

const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
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
await page.goto('http://localhost:5173/tv?p=wolfson');
await page.waitForTimeout(4500);

// The TV is a touch screen — flip any-hover:none for real (the markupfixes
// lesson: setTouchEmulationEnabled is what genuinely flips it; arm it AFTER
// navigation, and press buttons through the DOM because synthetic clicks can
// hang under mouse-as-touch emulation).
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
check(await page.evaluate(() => matchMedia('(any-hover: none)').matches), 'the wall really reports any-hover: none');

// Open A1-53's job window off the wall diagram.
const opened = await page.evaluate(() => {
  const cell = document.querySelector('[data-apt-id="A1-53"]');
  if (!cell) return 'no cell';
  cell.click();
  return 'ok';
});
check(opened === 'ok', 'the diagram cell for A1-53 exists on the wall', opened);
await page.waitForTimeout(1200);
check(await page.locator('.drawer-panel').count() >= 1, 'the real job window opened');

// The embedded viewer pill: wait for the sheet, then measure.
await page.waitForTimeout(6000);
const pill = page.locator('.drawer-panel button[title="Zoom in"]').last();
const pillThere = await pill.count();
check(pillThere >= 1, 'the viewer pill is on the plan pane');

async function planState() {
  return await page.evaluate(() => {
    const pct = [...document.querySelectorAll('.drawer-panel button')]
      .map(b => b.textContent?.trim() ?? '').find(t => /^\d+%$/.test(t)) ?? null;
    const canvases = [...document.querySelectorAll('.drawer-panel canvas')];
    const c = canvases[0];
    return { pct, w: c ? c.getBoundingClientRect().width : 0, canvases: canvases.length };
  });
}

const before = await planState();
check(before.canvases >= 3 && before.w > 100, 'the sheet rendered in the pane', JSON.stringify(before));

// At the fit floor the − is DISABLED and says why — a live-looking button
// that does nothing at exactly the zoom every sheet opens on is what made
// the whole pill read as broken on the wall.
const minusFloored = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.drawer-panel button')]
    .filter(x => /already in view|Zoom out/.test(x.title)).pop();
  return b ? { disabled: b.disabled, title: b.title } : null;
});
check(!!minusFloored && minusFloored.disabled && /already in view/.test(minusFloored.title),
  'at the fit, − is greyed and says the sheet is already all in view', JSON.stringify(minusFloored));

// Press + through the DOM (touch-emulated synthetic clicks hang).
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.drawer-panel button')].filter(x => x.title === 'Zoom in').pop();
  b?.click();
});
await page.waitForTimeout(700);
const afterIn = await planState();
check(afterIn.w > before.w * 1.03, `+ grows the sheet (${Math.round(before.w)} -> ${Math.round(afterIn.w)}, ${before.pct} -> ${afterIn.pct})`);

// And − (re-enabled once off the floor) brings it back down.
const minusLive = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.drawer-panel button')].filter(x => x.title === 'Zoom out').pop();
  const out = b ? { disabled: b.disabled } : null;
  b?.click();
  return out;
});
check(!!minusLive && !minusLive.disabled, 'off the floor, − comes back to life');
await page.waitForTimeout(700);
const afterOut = await planState();
check(afterOut.w < afterIn.w * 0.99, `- shrinks it back (${Math.round(afterIn.w)} -> ${Math.round(afterOut.w)})`);

// − at the fit floor is a designed no-op; + must always work. Press + five
// times and expect real growth.
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.drawer-panel button')].filter(x => x.title === 'Zoom in').pop();
    b?.click();
  });
  await page.waitForTimeout(200);
}
await page.waitForTimeout(800);
const afterFive = await planState();
check(afterFive.w > afterOut.w * 1.3, `five + presses zoom well in (${Math.round(afterOut.w)} -> ${Math.round(afterFive.w)}, now ${afterFive.pct})`);

// The studio too: Mark up, then ITS zoom, measured on ITS canvases — the
// pane's stack is still mounted behind it, and an unscoped max reads the
// wrong sheet (this probe's own first trap).
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent ?? '').trim() === 'Mark up' || x.title === 'Mark up');
  b?.click();
});
await page.waitForTimeout(3000);
check(await page.locator('[data-top-undo]').count() === 1, 'the studio opened unlocked');
const studioState = async () => await page.evaluate(() => {
  const undo = document.querySelector('[data-top-undo]');
  let root = undo; while (root && !root.classList.contains('fixed')) root = root.parentElement;
  if (!root) return null;
  const ws = [...root.querySelectorAll('canvas')].map(c => c.getBoundingClientRect().width).filter(w => w > 50);
  return { n: ws.length, max: Math.max(0, ...ws) };
});
const s0 = await studioState();
await page.evaluate(() => {
  const undo = document.querySelector('[data-top-undo]');
  let root = undo; while (root && !root.classList.contains('fixed')) root = root.parentElement;
  [...(root?.querySelectorAll('button') ?? [])].find(x => x.title === 'Zoom in')?.click();
});
await page.waitForTimeout(900);
const s1 = await studioState();
check(!!s0 && !!s1 && s1.max > s0.max * 1.02,
  `the studio's own zoom works on the touch wall (${Math.round(s0?.max ?? 0)} -> ${Math.round(s1?.max ?? 0)})`);

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
