// The standard plan per building (owner, recording 2026-11-10 144934): a button under each building's number in the
// Building view and a bubble on a single building; a press opens the plan full screen (the File Tray's read-only
// studio); a right-click opens the box — paste a file link, or a folder link → the picker → choose with the star.
// Each building its own; Netiv too. FAKE Drive only. Dev server on 5173 (APP=). SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';
const APP = process.env.APP || 'http://localhost:5173';
const OUT = process.env.SHOTS || '/tmp';
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
const doc = await PDFDocument.create(); const pg = doc.addPage([1191, 842]);
pg.drawRectangle({ x: 60, y: 60, width: 1071, height: 722, borderWidth: 4, borderColor: rgb(.1, .1, .2) });
const pdf = Buffer.from(await doc.save());
const F = 'application/vnd.google-apps.folder';
const TREE = { PLANSFOLDER1: [{ id: 'TYP-B2', name: 'Typical floor B2.pdf', mimeType: 'application/pdf', modifiedTime: new Date().toISOString() }, { id: 'TYP-B3', name: 'Typical floor B3.pdf', mimeType: 'application/pdf', modifiedTime: new Date().toISOString() }] };

const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
async function open(project) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await applySeed(ctx, blob);
  if (project) {
    // Netiv's own apartments (FAKE), the way ocrshot.mjs seeds them.
    const boot = await browser.newPage(); await boot.goto(`${APP}/`);
    const apts = await boot.evaluate(async () => (await import('/src/data/initialData.ts')).buildNetivApartments());
    await boot.close();
    await ctx.addInitScript(([p, apts]) => {
      if (sessionStorage.getItem('sp_set')) return; sessionStorage.setItem('sp_set', '1');
      localStorage.setItem('active_project', p);
      const w = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
      localStorage.setItem('netiv_app_data', JSON.stringify({ apartments: apts, currentUser: w.currentUser }));
    }, [project, apts]);
  }
  await ctx.route('**/api/**', async r => {
    const u = r.request().url(); const b = JSON.parse(r.request().postData() || '{}');
    if (u.includes('/api/drive-fetch')) return r.fulfill({ status: 200, contentType: 'application/pdf', body: pdf });
    if (u.includes('/api/drive-files')) {
      if (b.metaOnly) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ folder: { id: b.folderId, name: b.folderId === 'TYP-B1' ? 'Typical floor B1.pdf' : 'Plans' } }) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: TREE[b.folderId] ?? [] }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, files: [] }) });
  });
  await ctx.route('**://drive.google.com/**', r => r.abort());
  const p = await ctx.newPage();
  await p.goto(`${APP}/project`); await p.waitForTimeout(2500);
  await p.getByRole('button', { name: /^Building$/ }).first().click(); await p.waitForTimeout(1500);
  return { ctx, p };
}
const plans = p => p.evaluate(() => { const s = window.__store.getState(); return JSON.parse(JSON.stringify(s.boardSettings[s.currentProjectId]?.standardPlans ?? {})); });

// ── Wolfson, the three buildings ──
const { ctx, p } = await open();
const btns = p.locator('[data-standard-plan]');
const n = await btns.count();
T(n === 3, `one Standard plan button per building (${n})`);
const ids = await btns.evaluateAll(es => es.map(e => e.getAttribute('data-standard-plan')));
// under the number: the button's top is below the label's bottom, centred on it
const geo = await p.evaluate(() => { const t = document.querySelector('.bv-title').getBoundingClientRect(); const b = document.querySelector('[data-standard-plan]').getBoundingClientRect(); return { tb: t.bottom, bt: b.top, tc: t.left + t.width / 2, bc: b.left + b.width / 2 }; });
T(geo.bt >= geo.tb - 1 && Math.abs(geo.tc - geo.bc) < 6, `it sits under the building's number (${JSON.stringify(geo)})`);
await p.screenshot({ path: `${OUT}/sp-trio.png` });

// a press with nothing set opens the box
await btns.first().click(); await p.waitForTimeout(500);
T(await p.locator('[data-standard-plan-setup]').count() === 1, 'with no plan yet, a press opens the box');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
T(await p.locator('[data-standard-plan-setup]').count() === 0, 'Escape closes it');

// right-click → paste a file link
await btns.first().click({ button: 'right' }); await p.waitForTimeout(500);
T(await p.locator('[data-standard-plan-setup]').count() === 1, 'a right-click opens the box');
await p.screenshot({ path: `${OUT}/sp-setup.png` });
await p.locator('[data-standard-plan-link]').fill('https://drive.google.com/file/d/TYP-B1/view?usp=sharing');
await p.locator('[data-standard-plan-use]').click(); await p.waitForTimeout(2500);
let sp = await plans(p);
T(sp[ids[0]]?.fileId === 'TYP-B1' && sp[ids[0]]?.name === 'Typical floor B1.pdf', `the link is saved for that building, with the file's name (${JSON.stringify(sp[ids[0]])})`);
T(await p.locator('[data-standard-plan-viewer]').count() === 1, 'and the plan opens full screen');
for (let i = 0; i < 30; i++) { await p.waitForTimeout(300); if (await p.locator('[data-standard-plan-viewer] canvas').count()) break; }
T(await p.locator('[data-standard-plan-viewer] canvas').count() > 0, 'drawn by the plan viewer (zoom, pages)');
T(await p.locator('[data-standard-plan-viewer] [data-plan-share]').count() > 0, 'with Share on its bar');
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/sp-viewer.png` });
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
T(await p.locator('[data-standard-plan-viewer]').count() === 0, 'Escape closes the viewer');

// a plain press now opens it
await btns.first().click(); await p.waitForTimeout(800);
T(await p.locator('[data-standard-plan-viewer]').count() === 1, 'once set, a press opens the plan');
await p.locator('[data-standard-plan-close]').click(); await p.waitForTimeout(300);

// right-click the second → a folder link → the picker → the star
await btns.nth(1).click({ button: 'right' }); await p.waitForTimeout(500);
await p.locator('[data-standard-plan-link]').fill('https://drive.google.com/drive/folders/PLANSFOLDER1');
await p.locator('[data-standard-plan-use]').click(); await p.waitForTimeout(2500);
T(await p.locator('[data-plan-picker]').count() === 1, 'a folder link opens the plan picker inside that folder');
await p.screenshot({ path: `${OUT}/sp-picker.png` });
const star = p.locator('[data-plan-picker] [data-plan-star], [data-plan-picker] button[title*="tar"]');
if (await star.count()) await star.nth(1).click(); else await p.locator('[data-plan-row="TYP-B3"]').first().click();
await p.waitForTimeout(1200);
sp = await plans(p);
T(!!sp[ids[1]]?.fileId && sp[ids[1]].fileId !== sp[ids[0]].fileId, `choosing in the picker saves the second building's own plan (${sp[ids[1]]?.name})`);
T(sp[ids[0]]?.fileId === 'TYP-B1', 'the first building keeps its own');
const folderSaved = await p.evaluate(() => { const s = window.__store.getState(); return s.boardSettings[s.currentProjectId]?.standardPlansFolder; });
T(/PLANSFOLDER1/.test(folderSaved ?? ''), 'the folder is remembered for the next building');
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

// the third building: "Choose from Drive" opens the remembered folder
await btns.nth(2).click({ button: 'right' }); await p.waitForTimeout(500);
T(await p.locator('[data-standard-plan-browse]').count() === 1, 'the next building offers "Choose from Drive" in the remembered folder');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

// one building on its own: the bubble on top
await p.locator('button:visible', { hasText: /^1$/ }).first().click(); await p.waitForTimeout(1200);
const bub = p.locator('[data-standard-plan].bv-plan-bubble');
T(await bub.count() === 1, 'one building on its own: the button is a small bubble on top');
await p.screenshot({ path: `${OUT}/sp-single.png` });
await ctx.close();

// ── Netiv ──
const nv = await open('netiv');
const nb = await nv.p.locator('[data-standard-plan]').count();
T(nb >= 2, `Netiv has a button per building too (${nb})`);
await nv.p.locator('[data-standard-plan]').first().click({ button: 'right' }); await nv.p.waitForTimeout(500);
await nv.p.locator('[data-standard-plan-link]').fill('https://drive.google.com/file/d/TYP-B1/view');
await nv.p.locator('[data-standard-plan-use]').click(); await nv.p.waitForTimeout(2000);
const np = await nv.p.evaluate(() => { const s = window.__store.getState(); return { pid: s.currentProjectId, sp: JSON.parse(JSON.stringify(s.boardSettings[s.currentProjectId]?.standardPlans ?? {})), w: Object.keys(s.boardSettings.wolfson?.standardPlans ?? {}).length }; });
T(np.pid === 'netiv' && Object.keys(np.sp).length === 1, `Netiv keeps its own standard plans (${np.pid}, ${Object.keys(np.sp).length})`);
await nv.p.screenshot({ path: `${OUT}/sp-netiv.png` });
await nv.ctx.close();
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
