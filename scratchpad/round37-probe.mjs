// Round 37: the plan zooms from the KEYBOARD (= / + in, - out, 0 fits, Ctrl
// variants intercepted), a drawer pane stands down while the studio is open
// over it, and the dead "Saved versions" button is gone.
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
    a.plansPdfLink = 'https://drive.google.com/file/d/R37PLAN/view';
    a.driveLink = 'https://drive.google.com/drive/folders/JOBFOLDER1';
  }
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});
await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx.route('**/api/drive-files', r => {
  const body = JSON.parse(r.request().postData() || '{}');
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(body.metaOnly ? { folder: { id: body.folderId, name: 'folder' } } : { files: [] }) });
});
await ctx.route('**/api/share', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
await ctx.route('**://drive.google.com/**', r => r.abort());

const page = await ctx.newPage();
await page.goto('http://localhost:5174/project');
await page.waitForTimeout(3000);
await page.evaluate(() => document.querySelector('[data-apt-id="A1-53"]')?.click());
await page.waitForTimeout(6000);

const paneW = () => page.evaluate(() => {
  const c = [...document.querySelectorAll('[data-plan-surface="pane"] canvas')]
    .find(x => x.getBoundingClientRect().width > 100);
  return Math.round(c?.getBoundingClientRect().width ?? 0);
});
const studioW = () => page.evaluate(() => {
  const c = [...document.querySelectorAll('[data-plan-surface="studio"] canvas')]
    .find(x => x.getBoundingClientRect().width > 100);
  return Math.round(c?.getBoundingClientRect().width ?? 0);
});

// ── 1 · the drawer pane zooms from the keyboard ───────────────────────────
const p0 = await paneW();
check(p0 > 100, 'the pane rendered its sheet', `${p0}px`);
await page.keyboard.press('=');
await page.waitForTimeout(500);
const p1 = await paneW();
check(p1 > p0 + 20, '= zooms the pane in', `${p0}px -> ${p1}px`);
await page.keyboard.press('-');
await page.keyboard.press('-');
await page.waitForTimeout(500);
const p2 = await paneW();
check(p2 < p1 - 20, '- zooms it back out', `${p1}px -> ${p2}px`);
await page.keyboard.press('0');
await page.waitForTimeout(700);
const p3 = await paneW();
check(Math.abs(p3 - p0) <= 3, '0 fits the page again', `${p3}px vs the opening ${p0}px`);

// ── 2 · the studio takes the keys; the pane behind stands down ────────────
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => /^Mark up/.test((x.textContent ?? '').trim()) || x.title === 'Mark up')?.click();
});
await page.waitForTimeout(3000);
const s0 = await studioW();
const pBefore = await paneW();
check(s0 > 100, 'the studio rendered its sheet', `${s0}px`);
await page.keyboard.press('=');
await page.keyboard.press('=');
await page.waitForTimeout(500);
const s1 = await studioW();
check(s1 > s0 + 30, '= zooms the STUDIO in', `${s0}px -> ${s1}px`);
check(await paneW() === pBefore, 'and the pane behind it does not move', `${pBefore}px`);
await page.keyboard.press('Control+-');
await page.waitForTimeout(500);
const s2 = await studioW();
check(s2 < s1 - 20, 'Ctrl+- zooms the plan out instead of the browser', `${s1}px -> ${s2}px`);

// ── 3 · the dead button is gone ───────────────────────────────────────────
check(await page.evaluate(() =>
  ![...document.querySelectorAll('button')].some(b => b.title === 'Saved versions')),
  'the dead "Saved versions" button is gone — the version tabs on the rail ARE the versions');

await browser.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
