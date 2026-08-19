// The wall on the office's own panel: 2560 x 1248 CSS at a device ratio of
// 0.75, which is a 1080p screen being asked to lay out 2560 across.
//
// Two separate faults hide behind one complaint of "fuzzy", and the remedy for
// one does nothing for the other:
//   SIZE — how many REAL pixels tall a letter ends up, which is what decides
//          whether it can be read from across the room. Governed by the wall's
//          own zoom, which somebody can turn down without realising.
//   SHARPNESS — whether those pixels are crisp, which at a ratio below 1 they
//          cannot be, because the letter is drawn into less than one of them.
// Everything is measured in DEVICE pixels, never CSS: CSS pixels are exactly
// the unit that lies on this screen.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const PANEL = { width: 2560, height: 1248 };
const DPR = 0.75;

const SEED = () => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'gs1', name: 'AC installation', color: '#0ea5e9', order: 1, active: true,
               projectId: 'general', description: '', createdAt: '', updatedAt: '' }],
    apartments: Array.from({ length: 12 }, (_, i) => ({
      id: `G-t${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
      displayName: `Weinstein, Steven ${i}`, address: 'Mekor Chaim 39/6, Jerusalem',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: 'gs1', stageDates: {},
      canvasX: 40 + (i % 4) * 240, canvasY: 40 + Math.floor(i / 4) * 160,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    })),
    canvasElements: [],
  }));
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

/**
 * How tall the wall's text really is, in DEVICE pixels, plus the scale the
 * frame is drawn at.
 *
 * `rect.height / offsetHeight` is the ratio the browser is really drawing at:
 * it folds in every `zoom` between the element and the viewport, which is
 * exactly what somebody across the room sees. The first version of this
 * harness looked for `[data-node-id]`, which the wall does not use, so it
 * measured nothing and reported its own miss as a blank.
 */
const MEASURE = () => {
  const dpr = window.devicePixelRatio;
  const seen = [];
  for (const el of document.querySelectorAll('div, span, p, b, strong, h1, h2, h3, button')) {
    const txt = (el.textContent ?? '').trim();
    if (!txt || el.children.length || !el.offsetHeight) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) continue;
    seen.push({
      px: +(parseFloat(getComputedStyle(el).fontSize) * (r.height / el.offsetHeight) * dpr).toFixed(1),
      txt: txt.slice(0, 20),
    });
  }
  seen.sort((a, c) => a.px - c.px);
  const frame = document.querySelector('.h-screen.w-screen');
  const fz = frame ? getComputedStyle(frame).zoom : null;
  const fr = frame?.getBoundingClientRect();
  return {
    dpr,
    inner: [window.innerWidth, window.innerHeight],
    device: [Math.round(window.innerWidth * dpr), Math.round(window.innerHeight * dpr)],
    frameZoom: fz && fz !== 'normal' ? +Number(fz).toFixed(4) : 1,
    frameLocal: frame ? [frame.clientWidth, frame.clientHeight] : null,
    frameOnScreen: fr ? [Math.round(fr.width), Math.round(fr.height)] : null,
    texts: seen.length,
    smallest: seen.length ? seen[0].px : null,
    median: seen.length ? seen[Math.floor(seen.length / 2)].px : null,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
  };
};

// ── 1. The panel, with the wall's zoom left alone ──────────────────────────
{
  const ctx = await b.newContext({ viewport: PANEL, deviceScaleFactor: DPR });
  await ctx.addInitScript(SEED);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/tv?view=general`);
  await page.waitForTimeout(3800);

  const m = await page.evaluate(MEASURE);
  console.log('       panel @0.75:', JSON.stringify(m));
  check(m.dpr === DPR, 'the harness really is emulating a 0.75 ratio', String(m.dpr));
  check(m.texts > 10, 'the wall drew something with words on it', `${m.texts} text nodes`);

  // THE sharpness guarantee: one CSS pixel inside the frame is one device
  // pixel, so a letter is rasterised at the size it is shown.
  check(Math.abs(m.frameZoom * m.dpr - 1) < 0.005,
    'one CSS pixel inside the wall is exactly one real pixel',
    `frame zoom ${m.frameZoom} × ratio ${m.dpr} = ${(m.frameZoom * m.dpr).toFixed(3)}`);
  check(m.frameLocal && m.frameLocal[0] === m.device[0],
    'the wall lays itself out in the panel’s real pixels',
    `${m.frameLocal?.[0]} vs ${m.device[0]}`);
  check(m.frameOnScreen && Math.abs(m.frameOnScreen[0] - m.inner[0]) <= 2,
    'and still fills the window exactly',
    `${m.frameOnScreen?.[0]} vs ${m.inner[0]}`);
  check(m.overflowX <= 2, 'nothing runs off the side', `${m.overflowX}px over`);

  // A before/after of the SAME pixels, for the owner to look at.
  const CROP = { x: 0, y: 60, width: 900, height: 420 };
  await page.screenshot({ path: 'scratchpad/tv-after.png', clip: CROP });
  await page.evaluate(() => {
    const f = document.querySelector('.h-screen.w-screen');
    f.style.zoom = ''; f.style.width = ''; f.style.height = '';
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'scratchpad/tv-before.png', clip: CROP });
  await ctx.close();
}

// ── 2. The office's actual situation: the wall's own zoom turned down ──────
{
  const ctx = await b.newContext({ viewport: PANEL, deviceScaleFactor: DPR });
  await ctx.addInitScript(SEED);
  // The office's panel reports a 1920x1080 SCREEN behind a 1920x936 window —
  // 144 real pixels of browser toolbar. Playwright reports `screen` as the
  // viewport, so without this the condition simply cannot arise and the check
  // would pass or fail for the wrong reason.
  await ctx.addInitScript(() => {
    Object.defineProperty(window.screen, 'width', { get: () => 1920 });
    Object.defineProperty(window.screen, 'height', { get: () => 1080 });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  // scale=0.7 reproduces the 112% the office read out: 1.6 automatic × 0.7.
  await page.goto(`${APP}/tv?view=general&scale=0.7`);
  await page.waitForTimeout(3800);

  const m = await page.evaluate(MEASURE);
  console.log('       at 70% wall zoom:', JSON.stringify(m));

  // Open the ⓘ. Match the WHOLE title: "Full screen" also contains "screen",
  // sits earlier in the bar, and a loose /screen/ put the wall into full screen
  // instead of opening the report — which then read as "the report is broken".
  await page.click('button[title="About this screen"]');
  await page.waitForTimeout(700);
  const report = await page.evaluate(() => {
    const t = document.body.innerText;
    const get = k => (t.match(new RegExp(k + '\\s*\\n?\\s*([^\\n]+)')) ?? [])[1]?.trim() ?? null;
    return {
      open: /About this screen/.test(t),
      wallZoom: get('Wall zoom'), smallest: get('Smallest text'),
      lost: get('Lost to browser bars'), boardScaleGone: /Board scale/.test(t),
      callsItOut: /too small to read from across a room/i.test(t),
      noCtrlZero: !/Ctrl and 0/.test(t),
    };
  });
  console.log('       report:', JSON.stringify(report));
  check(report.open, 'the ⓘ report opens');
  check(report.wallZoom === '70%', 'it names the wall’s OWN zoom, which is the thing turned down',
    report.wallZoom ?? 'missing');
  check(!!report.smallest && /\d+ real pixels/.test(report.smallest),
    'it says how tall the words really are, in real pixels', report.smallest ?? 'missing');
  check(!!report.lost, 'it says how much screen the browser bars are eating', report.lost ?? 'missing');
  check(report.callsItOut, 'and says plainly that this is a size problem, not a sharpness one');
  check(report.noCtrlZero, 'it no longer tells somebody holding a remote to press Ctrl and 0');

  await page.screenshot({ path: 'scratchpad/tv-report.png' });

  // The one press.
  const fix = await page.$('button:has-text("Make the words readable")');
  check(!!fix, 'it offers a one-press fix');
  if (fix) {
    await fix.click();
    await page.waitForTimeout(1400);
    const after = await page.evaluate(MEASURE);
    const zoomNow = await page.evaluate(() => new URL(location.href).searchParams.get('scale'));
    console.log('       after the fix:', JSON.stringify({ smallest: after.smallest, zoomNow }));
    check(Number(zoomNow) >= 1, 'the wall’s zoom comes back up', `${zoomNow}`);
    check(after.smallest > m.smallest * 1.3, 'and the words get materially bigger',
      `${m.smallest} → ${after.smallest} real pixels`);
    check(after.smallest >= 14, 'to something readable across a room', `${after.smallest} real pixels`);
  }
  await ctx.close();
}

// ── 3. A normal screen must be left completely alone ───────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(SEED);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/tv?view=general`);
  await page.waitForTimeout(3200);
  const m = await page.evaluate(MEASURE);
  console.log('       normal 1:1 screen:', JSON.stringify(m));
  check(m.frameZoom === 1, 'a screen already drawing at 1:1 is not touched', `frame zoom ${m.frameZoom}`);
  check(m.overflowX <= 2, 'and still fits', `${m.overflowX}px over`);
  await ctx.close();
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
