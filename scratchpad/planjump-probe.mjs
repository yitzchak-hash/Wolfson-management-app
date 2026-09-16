// Reproduce the owner's "the zoom jumps in and out" on the plan pane, with
// CLASSIC scrollbars — headless Chromium hides its scrollbars by default
// (`--hide-scrollbars`), which is exactly the Windows condition every earlier
// plan harness could never see.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

const PLAN_ID = 'HARNESSPLAN1';
const FULL = process.env.FULL === '1';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  for (let i = 1; i < 9; i++) page.drawLine({ start: { x: 30 + i * 125, y: 30 }, end: { x: 30 + i * 125, y: 812 }, thickness: 0.6, color: rgb(0.55, 0.62, 0.72) });
  page.drawText('SHEET 1', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  return Buffer.from(await doc.save());
}

const planBytes = await makePlan();
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ignoreDefaultArgs: ['--hide-scrollbars'],
});
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await applySeed(ctx, blob);
await ctx.addInitScript(planId => {
  const raw = localStorage.getItem('wolfson_app_data');
  if (!raw) return;
  const d = JSON.parse(raw);
  for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.plansPdfLink = `https://drive.google.com/file/d/${planId}/view`;
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}, PLAN_ID);
// Log every ResizeObserver callback with the target's boxes.
await ctx.addInitScript(() => {
  window.__ro = [];
  const Orig = window.ResizeObserver;
  window.ResizeObserver = class extends Orig {
    constructor(cb) {
      super((entries, obs) => {
        for (const e of entries) {
          const t = e.target;
          window.__ro.push({ t: performance.now() | 0, cls: (t.className || '').slice(0, 40),
            ow: t.offsetWidth, oh: t.offsetHeight, cw: t.clientWidth, ch: t.clientHeight });
        }
        cb(entries, obs);
      });
    }
  };
});
await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx.route('**://drive.google.com/**', r => r.abort());

const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto('http://localhost:5173/project');
await page.waitForTimeout(2500);
const cell = await page.$('[data-apt-id="A1-53"]');
await cell.click();
await page.waitForFunction(() => [...document.querySelectorAll('canvas')].some(c => c.width > 200), null, { timeout: 30000 });
await page.waitForTimeout(1500);

const sheet = () => page.evaluate(() => {
  const c = [...document.querySelectorAll('canvas')].find(x => x.width > 200 && x.height > 150);
  const st = c?.closest('.overflow-auto');
  const pct = [...document.querySelectorAll('button')].map(b => b.textContent?.trim() ?? '').find(t => /^\d+%$/.test(t));
  return { css: Math.round(c.getBoundingClientRect().width), pct,
    stage: st ? { ow: st.offsetWidth, oh: st.offsetHeight, cw: st.clientWidth, ch: st.clientHeight } : null,
    ro: window.__ro.length };
});
const bar = await page.evaluate(() => {
  const d = document.createElement('div'); d.style.cssText = 'position:absolute;width:100px;height:100px;overflow:scroll;visibility:hidden';
  document.body.appendChild(d); const w = d.offsetWidth - d.clientWidth; d.remove(); return w;
});
console.log('classic scrollbar width:', bar);

if (FULL) {
  await page.click('[data-plan-fullscreen]');
  await page.waitForTimeout(800);
  console.log('fullscreen element:', await page.evaluate(() => document.fullscreenElement?.tagName ?? null));
}

const s0 = await sheet();
console.log('start', s0);
// Aim the wheel at the sheet's middle and zoom IN ten notches, 40ms apart —
// a mouse wheel's pace. Record the sheet width after every notch.
const c0 = await page.evaluate(() => {
  const c = [...document.querySelectorAll('canvas')].find(x => x.width > 200); const r = c.getBoundingClientRect();
  return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.5 };
});
await page.mouse.move(c0.x, c0.y);
const seq = [];
let ups = 0, downs = 0, prev = s0.css;
for (let i = 0; i < 10; i++) {
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(45);
  const s = await sheet();
  seq.push(`${s.pct}/${s.css}`);
  if (s.css > prev) ups++; else if (s.css < prev) downs++;
  prev = s.css;
}
await page.waitForTimeout(600);
const s1 = await sheet();
seq.push(`settled ${s1.pct}/${s1.css}`);
console.log(seq.join('  '));
check(downs === 0, 'zooming in never shrinks the sheet', `${ups} up, ${downs} down`);
check(s1.css > s0.css * 1.8, 'ten notches in really zoomed in', `${s0.css} → ${s1.css}`);
const ro = await page.evaluate(() => window.__ro.slice(-12));
console.log('RO tail:', JSON.stringify(ro));
console.log('stage after:', s1.stage);

// ── The stage changes shape under a CHOSEN zoom: the zoom stays ─────────
// Whatever moves the stage's box (a scrollbar on some platform, a window
// nudge, the drawer's pane narrowing), a zoom somebody picked is theirs.
if (!FULL) {
  // 1000px: the modal is min(1020px, 94vw), so the pane REALLY narrows here.
  await page.setViewportSize({ width: 1000, height: 900 });
  // Poll for 1.5s: the old code snapped to the fit two frames after the
  // reshape, so one late read could miss it.
  const seen = new Set();
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(100); seen.add((await sheet()).pct); }
  const s2 = await sheet();
  check(seen.size === 1 && s2.pct === s1.pct, 'a chosen zoom survives the stage changing shape', `${s1.pct} → ${s2.pct}; stage ${JSON.stringify(s1.stage)} → ${JSON.stringify(s2.stage)}; ro ${s1.ro}→${s2.ro}`);
  // Fit is one number, scrollbars or not: press Fit twice — once from the
  // zoomed sheet (scrollbars showing) and once from the fitted one.
  await page.click('[data-plan-fit]');
  await page.waitForTimeout(500);
  const f1 = await sheet();
  await page.click('[data-plan-fit]');
  await page.waitForTimeout(500);
  const f2 = await sheet();
  check(f1.pct === f2.pct, 'the fit is the same number with and without scrollbars', `${f1.pct} / ${f2.pct}`);
  check(f1.css < s1.css, 'Fit really brought the sheet back down', `${s1.css} → ${f1.css}`);
  // A FITTED sheet still follows its stage: widen the window, it re-fits.
  await page.setViewportSize({ width: 1700, height: 900 });
  await page.waitForTimeout(800);
  const f3 = await sheet();
  check(f3.css !== f1.css, 'a fitted sheet re-fits when the stage changes shape', `${f1.pct} → ${f3.pct}`);
  // Full screen from a zoomed sheet fits the screen, and back out fits the pane.
  await page.mouse.move(c0.x, c0.y);
  await page.mouse.wheel(0, -100); await page.waitForTimeout(300);
  const z1 = await sheet();
  await page.click('[data-plan-fullscreen]');
  await page.waitForTimeout(900);
  const fs1 = await sheet();
  check(!!(await page.evaluate(() => document.fullscreenElement)), 'full screen engaged');
  check(fs1.stage.ow === 1700 && fs1.css > z1.css, 'full screen fits the sheet to the whole screen', `${z1.pct} → ${fs1.pct} in a ${fs1.stage.ow}px stage`);
  // Wheel in full screen: no snap-back.
  const c1 = await page.evaluate(() => { const c = [...document.querySelectorAll('canvas')].find(x => x.width > 200); const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.5 }; });
  await page.mouse.move(c1.x, c1.y);
  let p2 = fs1.css, dn = 0;
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(45); const s = await sheet(); if (s.css < p2) dn++; p2 = s.css; }
  await page.waitForTimeout(500);
  check(dn === 0, 'wheeling in full screen never snaps back', `${dn} shrink steps`);
  // The button, not Escape: a synthetic Escape reaches the page (the drawer
  // closes on it) instead of the browser's own leave-full-screen.
  await page.click('[data-plan-fullscreen]');
  await page.waitForTimeout(900);
  const back = await sheet();
  check(!(await page.evaluate(() => document.fullscreenElement)) && back.pct === f3.pct, 'leaving full screen fits the pane again', `${back.pct} (pane fit ${f3.pct})`);
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL GREEN');
process.exit(fails ? 1 : 0);
