// Pictures of the plan picker ("Which plan, out of which folder") and the job window's Plan tab as they are today, on
// a FAKE job Drive, for the owner's "make the plan drive searcher much better" preview (2026-11-10). Dev server 5173.
// SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const F = 'application/vnd.google-apps.folder';
const pdf = (id, name, days) => ({ id, name, mimeType: 'application/pdf', modifiedTime: new Date(Date.now() - days * 864e5).toISOString() });
const TREE = {
  JOBFOLDER1: [
    { id: 'EP', name: 'Engineered Plans', mimeType: F }, { id: 'AR', name: 'Architect', mimeType: F },
    { id: 'PH', name: 'Photos', mimeType: F }, { id: 'PR', name: 'Proposals', mimeType: F },
    { id: 'APR', name: 'Approvals', mimeType: F },
  ],
  EP: [
    pdf('P1', 'Levi - ground floor AC plan.pdf', 2), pdf('P2', 'Levi - first floor AC plan.pdf', 2),
    pdf('P3', 'Levi - roof units.pdf', 9), { id: 'D1', name: 'Levi villa.dwg', mimeType: 'application/acad' },
    pdf('P4', 'Levi villa — converted.pdf', 9), { id: 'AP', name: 'Annotated Plans', mimeType: F },
  ],
  AP: [pdf('A1', 'Levi - ground floor AC plan — annotated version 3.0.pdf', 1), pdf('A2', 'Levi - ground floor AC plan — annotated version 2.0.pdf', 4)],
  AR: [pdf('R1', 'architect plans rev C.pdf', 20), pdf('R2', 'architect plans rev B.pdf', 40), { id: 'J1', name: 'kitchen elevation.jpg', mimeType: 'image/jpeg' }],
  PH: [{ id: 'BEF', name: 'Before works', mimeType: F }],
  BEF: [], PR: [pdf('Q1', 'proposal v2.pdf', 30)], APR: [pdf('K1', 'electrical approval.pdf', 15)],
};
const doc = await PDFDocument.create(); const pg = doc.addPage([1191, 842]);
pg.drawRectangle({ x: 40, y: 40, width: 1111, height: 762, borderWidth: 3, borderColor: rgb(.1, .1, .2) });
pg.drawRectangle({ x: 200, y: 200, width: 500, height: 400, borderWidth: 6, borderColor: rgb(.1, .1, .2) });
const planBytes = Buffer.from(await doc.save());

const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await applySeed(ctx, blob);
await ctx.addInitScript(() => {
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw); if (d.__ps) return; d.__ps = 1;
  for (const a of d.apartments ?? []) if (a.id === 'A1-53') {
    a.plansPdfLink = 'https://drive.google.com/file/d/P1/view';
    a.driveLink = 'https://drive.google.com/drive/folders/JOBFOLDER1';
  }
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});
await ctx.route('**/api/**', async r => {
  const u = r.request().url(); const body = JSON.parse(r.request().postData() || '{}');
  if (u.includes('/api/drive-fetch')) return r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes });
  if (u.includes('/api/drive-files')) return r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(body.metaOnly ? { folder: { id: body.folderId, name: 'folder' } } : { files: TREE[body.folderId] ?? [] }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, files: [] }) });
});
await ctx.route('**://drive.google.com/**', r => r.abort());
const p = await ctx.newPage();
await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2500);
await p.locator('[data-view-switch] [data-view="board"]').first().click().catch(() => {}); await p.waitForTimeout(800);
await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1500);
// the Plan tab (PlanBrowser)
await p.locator('button', { hasText: /^Plan$/ }).first().click().catch(() => {}); await p.waitForTimeout(4000);
await p.screenshot({ path: `${OUT}/ps-plantab.png` });
// the picker
await p.evaluate(() => { [...document.querySelectorAll('button')].find(b => /Choose a plan/i.test(b.title || ''))?.click(); });
await p.waitForTimeout(1500);
console.log('picker', await p.locator('[data-plan-picker]').count());
await p.screenshot({ path: `${OUT}/ps-picker.png` });
await p.locator('[data-plan-picker] input').first().fill('architect'); await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/ps-picker-search.png` });
await p.locator('[data-plan-picker] input').first().fill(''); await p.waitForTimeout(300);
await p.locator('[data-folder-button]').click().catch(() => {}); await p.waitForTimeout(2000);
await p.screenshot({ path: `${OUT}/ps-picker-folders.png` });
await browser.close();
