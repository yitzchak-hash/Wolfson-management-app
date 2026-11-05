// Videos 2026-11-04 (the Galaxy Fold): Share opens on the FIRST press, the Share in the plan's zoom bar, the page
// count on one line, and Board · Building on a phone held upright. SHOTS= dir for the pictures.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const doc = await PDFDocument.create();
for (const t of ['A1 / 53 FAKE PLAN p1', 'A1 / 53 FAKE PLAN p2']) {
  const pg = doc.addPage([1191, 842]);
  pg.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  pg.drawText(t, { x: 60, y: 760, size: 28 });
}
const planBytes = Buffer.from(await doc.save());
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };

// The Fold's inner screen held upright, as Samsung's browser reports it.
const ctx = await browser.newContext({ viewport: { width: 673, height: 841 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await applySeed(ctx, blob);
await ctx.addInitScript(() => {
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw); if (d.__fd) return; d.__fd = 1;
  for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.plansPdfLink = 'https://drive.google.com/file/d/HARNESSPLAN1/view';
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});
await ctx.addInitScript(() => {
  // A STRICT share sheet, like Samsung's browser: it refuses unless it is asked within 20 ms of the press.
  window.__shared = []; window.__refused = 0; let pressAt = -1e9;
  document.addEventListener('click', () => { pressAt = performance.now(); }, true);
  navigator.canShare = (o) => !!(o && o.files && o.files.length);
  navigator.share = async (o) => {
    if (performance.now() - pressAt > 20) { window.__refused++; const e = new Error('no press'); e.name = 'NotAllowedError'; throw e; }
    const f = o.files?.[0];
    window.__shared.push({ n: o.files?.length ?? 0, type: f?.type, head: f ? new TextDecoder().decode(new Uint8Array(await f.slice(0, 5).arrayBuffer())) : '' });
  };
});
await ctx.route('**/api/drive-fetch**', async r => { await new Promise(res => setTimeout(res, 300)); await r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }); });
await ctx.route('**://drive.google.com/**', r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2500);

// 1. Board · Building on the upright phone — Building is what opens (owner, 2026-11-05)
const sw = p.locator('[data-view-switch-narrow]');
T(await sw.isVisible(), 'upright: the Board · Building switch is there');
T(await p.locator('.bv-plate').count() > 0 && (await sw.locator('[data-view="building"]').getAttribute('aria-pressed')) === 'true', 'upright: the Building view opens first');
T(await p.locator('[data-building-trio]').count() === 0, 'upright: one building, never All');
await sw.locator('[data-view="board"]').click(); await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/fold-board.png` });
await sw.locator('[data-view="building"]').click(); await p.waitForTimeout(1500);
T(await p.locator('.bv-plate').count() > 0, 'upright: Building shows the building');
T(!(await p.locator('text=/Stages · tap to filter/i').first().isVisible().catch(() => false)), 'upright, Building: the stage filter bar steps aside');
await p.screenshot({ path: `${OUT}/fold-building.png` });
await sw.locator('[data-view="board"]').click(); await p.waitForTimeout(1200);
T(await p.locator('[data-apt-id]').count() > 0, 'upright: Board brings the board back');

// 2. the plan: Share in the zoom bar, the page count on one line, Share opens at once
await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1500);
const tab = p.locator('.drawer-panel button', { hasText: /^Plan$/ }).first(); if (await tab.count()) { await tab.click(); }
await p.waitForTimeout(3000);
const bar = p.locator('[data-plan-zoombar]:visible').first();
T(await bar.count() === 1, 'the plan has its zoom bar');
const sb = bar.locator('[data-plan-share-bar]');
T(await sb.count() === 1, 'Share stands in the zoom bar, beside the plan');
const count = bar.locator('span', { hasText: '/' }).first();
const cb = await count.boundingBox();
T(cb && cb.height < 24, `the page count "1 / 2" is on one line (${cb && Math.round(cb.height)}px tall)`);
const bb = await bar.boundingBox(); const vw = 673;
T(bb && bb.x >= 0 && bb.x + bb.width <= vw, 'the zoom bar fits the screen');
await p.screenshot({ path: `${OUT}/fold-plan.png` });
if (bb) await p.screenshot({ path: `${OUT}/fold-zoombar.png`, clip: { x: Math.max(0, bb.x - 10), y: bb.y - 10, width: Math.min(vw, bb.width + 20), height: bb.height + 20 } });
await sb.click(); await p.waitForTimeout(1200);
const st = await p.evaluate(() => ({ s: window.__shared, r: window.__refused }));
T(st.s.length === 1 && st.r === 0, `the FIRST press opens the share menu (shared ${st.s.length}, refused ${st.r})`);
T(st.s[0]?.type === 'application/pdf' && st.s[0]?.head === '%PDF-', 'it carries the real PDF');
// 3. a still tap on the plan opens it full screen (owner, 2026-11-05, the iPhone held upright)
const before = await p.locator('[data-plan-zoombar]').count();
const stage = p.locator('[data-plan-tap-full] [data-plan-stage]').first();
const sbb = await stage.boundingBox();
await p.touchscreen.tap(sbb.x + sbb.width / 2, sbb.y + sbb.height * 0.4); await p.waitForTimeout(2500);
T((await p.locator('[data-plan-zoombar]').count()) > before, 'a tap on the plan opens it full screen');
await p.screenshot({ path: `${OUT}/fold-plan-full.png` });
T(errs.length === 0, `no page errors (${errs.join(' | ')})`);
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
