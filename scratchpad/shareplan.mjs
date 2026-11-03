// Share the plan as a PDF (owner, 2026-11-03): the button on the plan bar, on a PC
// and on a phone; navigator.share receives a real PDF FILE, never a link.
// SHOTS= dir for the pictures.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const doc = await PDFDocument.create(); const pg = doc.addPage([1191, 842]);
pg.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
pg.drawText('A1 / 53 FAKE PLAN', { x: 60, y: 760, size: 28 });
const planBytes = Buffer.from(await doc.save());
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
for (const [tag, vp, mobile] of [['pc', { width: 1440, height: 900 }, false], ['phone', { width: 402, height: 874 }, true]]) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile });
  await applySeed(ctx, blob);
  await ctx.addInitScript(() => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw); if (d.__sp) return; d.__sp = 1;
    for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.plansPdfLink = 'https://drive.google.com/file/d/HARNESSPLAN1/view';
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
    window.__shared = [];
    navigator.canShare = (o) => !!(o && o.files && o.files.length);
    navigator.share = async (o) => { const f = o.files?.[0]; window.__shared.push({ n: o.files?.length ?? 0, name: f?.name, type: f?.type, size: f?.size, url: o.url ?? null, head: f ? new TextDecoder().decode(new Uint8Array(await f.slice(0, 5).arrayBuffer())) : '' }); };
  });
  await ctx.route('**/api/drive-fetch**', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  const p = await ctx.newPage();
  await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2500);
  if (mobile) await p.locator('button:visible', { hasText: /^1$/ }).first().click().catch(() => {});
  await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1500);
  if (mobile) { const tab = p.locator('.drawer-panel button', { hasText: /^Plan$/ }).first(); if (await tab.count()) { await tab.click(); await p.waitForTimeout(1200); } }
  const btn = p.locator('[data-plan-share]:visible').first();
  T(await btn.count() === 1, `${tag}: the Share button is on the plan bar`);
  if (!(await btn.count())) { await p.screenshot({ path: `${OUT}/share-${tag}.png` }); await ctx.close(); continue; }
  const bb = await btn.boundingBox();
  await p.screenshot({ path: `${OUT}/share-${tag}.png` });
  await p.screenshot({ path: `${OUT}/share-${tag}-zoom.png`, clip: { x: Math.max(0, bb.x - 260), y: Math.max(0, bb.y - 40), width: Math.min(vp.width, 520), height: 110 } });
  await btn.click(); await p.waitForTimeout(1500);
  const s = await p.evaluate(() => window.__shared);
  T(s.length === 1, `${tag}: the share menu was opened once`);
  T(s[0]?.n === 1 && s[0]?.type === 'application/pdf' && s[0]?.head === '%PDF-', `${tag}: it carries a real PDF file (${s[0]?.name}, ${s[0]?.size} bytes)`);
  T(!s[0]?.url, `${tag}: no link is sent, only the file`);
  await ctx.close();
}
// the worker's portal: Share on the plan's corner, beside Download
{
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
  await applySeed(ctx, blob);
  await ctx.addInitScript(() => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw); if (d.__sp) return; d.__sp = 1;
    for (const a of d.apartments ?? []) a.plansPdfLink = 'https://drive.google.com/file/d/HARNESSPLAN1/view';
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
    window.__shared = [];
    navigator.canShare = (o) => !!(o && o.files && o.files.length);
    navigator.share = async (o) => { const f = o.files?.[0]; window.__shared.push({ n: o.files?.length ?? 0, name: f?.name, type: f?.type, url: o.url ?? null }); };
  });
  await ctx.route('**/api/drive-fetch**', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  const p = await ctx.newPage();
  await p.goto(`http://localhost:5173/c/${PORTAL_TOKEN}`); await p.waitForTimeout(5000);
  await p.locator('button, [role=button]').filter({ hasText: /concealed unit|registers|thermostats|piping|fans/i }).first().click({ timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const tog = p.locator('[data-plan-toggle]').first();
  if (await tog.count()) { await tog.scrollIntoViewIfNeeded(); await tog.click(); await p.waitForTimeout(2000); }
  const sb = p.locator('[data-plan-share]').first();
  T(await sb.count() === 1, 'portal: Share sits on the plan beside Download');
  if (await sb.count()) {
    await sb.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}/share-portal.png` });
    await sb.click(); await p.waitForTimeout(1200);
    const s = await p.evaluate(() => window.__shared);
    T(s.length === 1 && s[0].type === 'application/pdf' && !s[0].url, `portal: a real PDF file is shared (${s[0]?.name})`);
  } else await p.screenshot({ path: `${OUT}/share-portal.png` });
  await ctx.close();
}
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
