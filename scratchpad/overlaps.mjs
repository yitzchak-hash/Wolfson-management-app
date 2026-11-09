// Buttons on top of each other, on the phones the office carries (owner, 2026-11-08: "On the Z Fold, a bunch of
// buttons overlapped too. Also on the iPhone with the plan view and everything"). Every screen is swept for any two
// presses (buttons, links, inputs) whose boxes cross, and for presses past the screen's edge. SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const doc = await PDFDocument.create();
for (const n of [1, 2]) { const pg = doc.addPage([1191, 842]); pg.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) }); pg.drawText(`FAKE PLAN ${n}`, { x: 60, y: 760, size: 28 }); }
const planBytes = Buffer.from(await doc.save());
const DEVICES = [
  ['iphone17pro', 402, 874], ['iphone17pm', 440, 956], ['galaxy-s', 360, 780],
  ['fold-cover', 373, 839], ['fold-open', 673, 841], ['fold-side', 841, 673], ['iphone-side', 874, 402],
];
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
const SWEEP = () => {
  const vw = innerWidth, vh = innerHeight;
  const vis = e => { const r = e.getBoundingClientRect(); if (r.width < 6 || r.height < 6) return false;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false;
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return false;
    // hidden behind something else (a sheet over the page): the top element at its middle must be it or inside it
    const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(x, y); return !!top && (top === e || e.contains(top) || top.contains(e)); };
  const els = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, [role=button]')]
    .filter(e => !e.parentElement?.closest('button, a[href], [role=button]')).filter(vis);
  const name = e => (e.getAttribute('aria-label') || e.title || e.textContent || e.placeholder || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 24);
  const out = [], past = [];
  for (let i = 0; i < els.length; i++) {
    const a = els[i].getBoundingClientRect();
    if (a.right > vw + 1 || a.left < -1) past.push(name(els[i]));
    for (let j = i + 1; j < els.length; j++) {
      if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
      const b = els[j].getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 3 && oy > 3) out.push(`${name(els[i])} × ${name(els[j])}`);
    }
  }
  return { out, past };
};
let total = 0;
for (const [tag, W, H] of DEVICES) {
  if (ONLY.length && !ONLY.includes(tag)) continue;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await applySeed(ctx, blob);
  await ctx.addInitScript(() => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw); if (d.__ov) return; d.__ov = 1;
    for (const a of d.apartments ?? []) a.plansPdfLink = 'https://drive.google.com/file/d/HARNESSPLAN1/view';
    d.boardSettings = { ...(d.boardSettings ?? {}), wolfson: { ...((d.boardSettings ?? {}).wolfson ?? {}), customButtons: [{ id: 'cb-wall', name: 'Wall Yes/No' }] } };
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  });
  await ctx.route('**/api/drive-fetch**', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  const p = await ctx.newPage();
  const check = async name => {
    const r = await p.evaluate(SWEEP);
    await p.screenshot({ path: `${OUT}/ov-${tag}-${name}.png` });
    const n = r.out.length + r.past.length; total += n;
    console.log(`${n ? 'BAD' : 'ok '} ${tag} ${name}${r.out.length ? ' · overlap: ' + r.out.join(' | ') : ''}${r.past.length ? ' · past the edge: ' + r.past.join(' | ') : ''}`);
  };
  await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2500);
  await check('building');
  await p.locator('[data-view-switch] [data-view="board"]:visible').first().click().catch(() => {}); await p.waitForTimeout(1200);
  await check('board');
  await p.locator('[data-apt-id="A1-53"]').first().click().catch(() => {}); await p.waitForTimeout(W >= 800 ? 5000 : 1800);
  await check('apartment');
  const planTab = p.locator('.drawer-panel button', { hasText: /^(Plan|תוכנית)$/ }).first();
  if (await planTab.count() && await planTab.isVisible()) { await planTab.click(); await p.waitForTimeout(3500); await check('plan-tab'); }
  // the plan full screen: a tap on it (phone tab) or its full-screen button (side by side)
  const stage = p.locator('[data-plan-tap-full] [data-plan-stage]').first();
  if (await stage.count()) { const b = await stage.boundingBox(); await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height * 0.4); }
  else await p.locator('.drawer-panel [title="Full screen"]').first().click().catch(() => {});
  await p.waitForTimeout(3000);
  await check('plan-full');
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  // the problem form
  await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2000);
  await p.locator('[data-view-switch] [data-view="board"]:visible').first().click().catch(() => {}); await p.waitForTimeout(1000);
  await p.locator('[data-apt-id="A1-53"]').first().click().catch(() => {}); await p.waitForTimeout(1800);
  const rp = p.locator('[data-report-problem]').first();
  if (await rp.count()) { await rp.scrollIntoViewIfNeeded().catch(() => {}); await rp.click().catch(() => {}); await p.waitForTimeout(900); await check('problem'); await p.keyboard.press('Escape'); }
  // the worker's phone
  await p.goto(`http://localhost:5173/c/${PORTAL_TOKEN}`); await p.waitForTimeout(4500);
  await check('worker');
  await p.locator('button, [role=button]').filter({ hasText: /concealed unit|registers|thermostats|piping|fans/i }).first().click({ timeout: 6000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await check('worker-task');
  await ctx.close();
}
console.log(`\n${total} problems`);
await browser.close();
