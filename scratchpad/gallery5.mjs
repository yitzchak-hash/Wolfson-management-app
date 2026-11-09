// Device Gallery, round of 2026-11-05 (owner: "create a device gallery … because we have problems"): the screens the
// office uses now — the board, the Building view, the apartment window, the plan with Share in its zoom bar, and the
// worker's plan — on every device he named. Each picture is AUDITED: anything past the screen's right edge and any
// text cut off by its own box is counted and written to gal5-audit.json beside the pictures.
// node scratchpad/gallery5.mjs [profile…]   OUT= dir (default the session scratchpad's gal5/)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'node:fs';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from './seed.mjs';

const OUT = process.env.OUT || '/tmp/claude-0/-home-user/5aa05b05-0399-5fa1-9ab2-84b21f667c30/scratchpad/gal5';
fs.mkdirSync(OUT, { recursive: true });
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const SAMSUNG_UA = 'Mozilla/5.0 (Linux; Android 15; SM-S931B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36';
const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

// [tag, width, height, touch/mobile, device ratio, user agent]
export const PROFILES = [
  ['iphone17pm', 440, 956, true, 3, IPHONE_UA],     // iPhone 17 Pro Max
  ['galaxy-s', 360, 780, true, 3, SAMSUNG_UA],      // Galaxy S24 · S25 · S26 (all 360 wide)
  ['fold-cover', 373, 839, true, 3, SAMSUNG_UA],    // Galaxy Z Fold, folded (cover screen)
  ['fold-open', 673, 841, true, 2.6, SAMSUNG_UA],   // Galaxy Z Fold, opened, upright
  ['fold-side', 841, 673, true, 2.6, SAMSUNG_UA],   // Galaxy Z Fold, opened, on its side
  ['ipad-port', 820, 1180, true, 2, IPAD_UA],       // iPad, upright
  ['ipad-land', 1180, 820, true, 2, IPAD_UA],       // iPad, sideways
  ['tab-s10', 720, 1152, true, 2, SAMSUNG_UA],      // Galaxy Tab S10 FE, upright
  ['laptop', 1440, 900, false, 1.5, undefined],     // a laptop
  ['pc', 1920, 1080, false, 1, undefined],          // the office computer
];

async function makePlan() {
  const doc = await PDFDocument.create();
  for (const p of [1, 2]) {
    const page = doc.addPage([1191, 842]);
    page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
    for (let i = 1; i < 6; i++) page.drawLine({ start: { x: 30 + i * 188, y: 30 }, end: { x: 30 + i * 188, y: 812 }, thickness: 0.8, color: rgb(0.6, 0.66, 0.75) });
    for (let i = 1; i < 4; i++) page.drawLine({ start: { x: 30, y: 30 + i * 195 }, end: { x: 1161, y: 30 + i * 195 }, thickness: 0.8, color: rgb(0.6, 0.66, 0.75) });
    page.drawText(`A1 / 53 — MECHANICAL LAYOUT · sheet ${p}`, { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  }
  return Buffer.from(await doc.save());
}

/** Counts what spills past the screen's right edge, and text its own box cuts off. */
const AUDIT = () => {
  const vw = document.documentElement.clientWidth;
  const shown = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const scrollerFits = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) return p.getBoundingClientRect().right <= vw + 1.5; } return false; };
  const over = [], cut = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el) || el.closest('svg') || el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1.5 && !scrollerFits(el)) over.push((el.className?.toString?.() || el.tagName).slice(0, 60));
    const cs = getComputedStyle(el);
    const leaf = el.childElementCount === 0 && (el.textContent || '').trim().length > 1;
    if (leaf && cs.textOverflow !== 'ellipsis' && /(hidden|clip)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2)
      cut.push((el.textContent || '').trim().slice(0, 40));
  }
  return { overflow: over.length, clipped: cut.length, overflowWhat: over.slice(0, 6), clippedWhat: cut.slice(0, 6), pageWiderThanScreen: document.documentElement.scrollWidth > vw + 1 };
};

const planBytes = await makePlan();
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
const only = process.argv.slice(2);
const audit = fs.existsSync(`${OUT}/gal5-audit.json`) ? JSON.parse(fs.readFileSync(`${OUT}/gal5-audit.json`, 'utf8')) : {};

for (const [tag, W, H, touch, dpr, ua] of PROFILES) {
  if (only.length && !only.includes(tag)) continue;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: touch && W < 1000, hasTouch: touch, deviceScaleFactor: Math.min(dpr, 2), ...(ua ? { userAgent: ua } : {}) });
  await applySeed(ctx, blob);
  await ctx.addInitScript(() => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw); if (d.__g5) return; d.__g5 = 1;
    const TIP = ['A', 'B', 'C1', 'C2'];
    for (const a of d.apartments ?? []) {
      if (a.apartmentNumber && a.colPosition) a.tipus = TIP[(a.colPosition - 1) % 4];
      a.plansPdfLink = 'https://drive.google.com/file/d/HARNESSPLAN1/view';
      if (a.id === 'A1-53') { a.classification = 'shinui'; a.customAnswers = { 'cb-wall': 'yes' }; }
    }
    d.boardSettings = { ...(d.boardSettings ?? {}), wolfson: { ...((d.boardSettings ?? {}).wolfson ?? {}), customButtons: [{ id: 'cb-wall', name: 'Wall Yes/No' }] } };
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  });
  await ctx.route('**/api/drive-fetch**', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 120)));
  audit[tag] = {};
  const snap = async name => {
    await page.screenshot({ path: `${OUT}/${tag}-${name}.jpg`, type: 'jpeg', quality: 72 });
    audit[tag][name] = await page.evaluate(AUDIT);
  };

  // 1 · the Building view — what opens first, everywhere (owner, 2026-11-05)
  await page.goto('http://localhost:5173/project'); await page.waitForTimeout(3000);
  if (!(await page.locator('.bv-plate').count())) console.log(`  ${tag}: the Building view did NOT open first`);
  const apt = page.locator('.bv-plate[data-current="1"] [data-apt-labels] text.bv-flat-no').first();
  if (await apt.count()) { const b = await apt.boundingBox(); if (b && !touch) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 14); }
  await page.waitForTimeout(500);
  await snap('building');
  // 2 · the board, one press away
  await page.locator('[data-view-switch] [data-view="board"]:visible').first().click().catch(() => console.log(`  ${tag}: no Board press`));
  await page.waitForTimeout(1500);
  await snap('board');
  // 3 · the apartment window, 4 · its plan with Share in the zoom bar
  await page.locator('[data-apt-id="A1-53"]').first().click().catch(e => console.log(`  ${tag}: open apt failed ${e.message.split('\n')[0]}`));
  await page.waitForTimeout(W >= 800 ? 5000 : 1500);
  await snap('apartment');
  if (W < 800) {
    await page.locator('.drawer-panel button', { hasText: /^(Plan|תוכנית)$/ }).first().click().catch(() => {});
    await page.waitForTimeout(4000);
    await snap('plan');
  } else {
    // the plan beside the details is already on screen: the closer picture is the full screen view
    await page.locator('.drawer-panel [title="Full screen"]').first().click().catch(() => {});
    await page.waitForTimeout(3500);
    await snap('plan');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  }
  // 5 · the worker's plan, with Share beside Download
  await page.goto(`http://localhost:5173/c/${PORTAL_TOKEN}`); await page.waitForTimeout(5000);
  await page.locator('button, [role=button]').filter({ hasText: /concealed unit|registers|thermostats|piping|fans/i }).first().click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const tog = page.locator('[data-plan-toggle]').first();
  if (await tog.count()) { await tog.scrollIntoViewIfNeeded(); await tog.click().catch(() => {}); await page.waitForTimeout(2500); }
  const sh = page.locator('[data-plan-share]').first();
  if (await sh.count()) { await sh.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(300); }
  await snap('worker');
  audit[tag].__errors = errs;
  console.log(`${tag} done ${JSON.stringify(Object.fromEntries(Object.entries(audit[tag]).filter(([k]) => k !== '__errors').map(([k, v]) => [k, `${v.overflow}/${v.clipped}${v.pageWiderThanScreen ? ' WIDE' : ''}`])))}${errs.length ? ' ERR ' + errs.join(' | ') : ''}`);
  await ctx.close();
}
fs.writeFileSync(`${OUT}/gal5-audit.json`, JSON.stringify(audit, null, 1));
await browser.close();
console.log('GALLERY_DONE');
