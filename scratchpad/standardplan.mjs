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
const doc = await PDFDocument.create();
for (let i = 0; i < 3; i++) { const pg = doc.addPage([1191, 842]); pg.drawRectangle({ x: 60 + i * 40, y: 60, width: 1071 - i * 80, height: 722, borderWidth: 4, borderColor: rgb(.1, .1, .2) }); }
const pdf = Buffer.from(await doc.save());
const F = 'application/vnd.google-apps.folder';
const TREE = { PLANSFOLDER1: [{ id: 'TYP-B1', name: 'Typical floor B1.pdf', mimeType: 'application/pdf', modifiedTime: new Date().toISOString() }, { id: 'TYP-B2', name: 'Typical floor B2.pdf', mimeType: 'application/pdf', modifiedTime: new Date().toISOString() }, { id: 'TYP-B3', name: 'Typical floor B3.pdf', mimeType: 'application/pdf', modifiedTime: new Date().toISOString() }] };

const ups = [];
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
    if (u.includes('/api/drive-session')) { ups.push(`session:${b.folderId ?? b.parentId ?? ''}:${b.name ?? b.fileName ?? ''}`); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uploadUrl: 'https://upload.harness.test/put' }) }); }
    if (u.includes('/api/drive-files')) {
      if (b.metaOnly) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ folder: b.folderId === 'TYP-B1'
        ? { id: 'TYP-B1', name: 'Typical floor B1.pdf', mimeType: 'application/pdf', parents: ['PLANSFOLDER1'] }
        : { id: b.folderId, name: 'Plans', mimeType: 'application/vnd.google-apps.folder' } }) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: TREE[b.folderId] ?? [] }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, files: [] }) });
  });
  await ctx.route('https://upload.harness.test/**', r => { ups.push('put'); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: 'UPLOADED1', webViewLink: 'https://drive.google.com/file/d/UPLOADED1/view' }) }); });
  await ctx.route('**://drive.google.com/**', r => r.abort());
  const p = await ctx.newPage();
  await p.goto(`${APP}/project`); await p.waitForTimeout(2500);
  await p.getByRole('button', { name: /^Building$/ }).first().click(); await p.waitForTimeout(1500);
  return { ctx, p };
}
const plans = p => p.evaluate(() => { const s = window.__store.getState(); const b = s.boardSettings[s.currentProjectId] ?? {}; return JSON.parse(JSON.stringify({ whole: b.standardPlans ?? {}, floor: b.standardPlansByFloor ?? {} })); });
const paste = (p, text) => p.locator('[data-standard-plan-link]').evaluate((el, t) => { const dt = new DataTransfer(); dt.setData('text', t); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, text);

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

// right-click → a FILE link → the finder opens on the folder it lives in, the file lit (recording 2026-11-11)
const f15 = await btns.first().getAttribute('data-standard-plan-floor');
await btns.first().click({ button: 'right' }); await p.waitForTimeout(500);
T(await p.locator('[data-standard-plan-setup]').count() === 1, 'a right-click opens the box');
await p.screenshot({ path: `${OUT}/sp-setup.png` });
await p.locator('[data-standard-plan-link]').fill('https://drive.google.com/file/d/TYP-B1/view?usp=sharing');
await p.locator('[data-standard-plan-use]').click(); await p.waitForTimeout(2500);
T(await p.locator('[data-plan-finder]').count() === 1, 'a file link opens the Plan Finder on the folder the file lives in');
T(await p.locator('[data-plan-row="TYP-B1"][data-current="1"]').count() === 1, 'with that file lit');
T(await p.locator('[data-plan-row]').count() === 3, 'and the folder\'s other files to choose from');
await p.screenshot({ path: `${OUT}/sp-picker.png` });
await p.locator('[data-plan-row="TYP-B1"]').click(); await p.waitForTimeout(900);
T(await p.locator('[data-finder-preview="TYP-B1"]').count() === 1, 'a press looks at it full screen first');
await p.locator('[data-preview-star]').click(); await p.waitForTimeout(1500);
let sp = await plans(p);
T(sp.floor[ids[0]]?.[f15]?.fileId === 'TYP-B1' && sp.floor[ids[0]][f15].name === 'Typical floor B1.pdf', `the Star saves it for that building AND that floor (${f15}: ${JSON.stringify(sp.floor[ids[0]]?.[f15]?.name)})`);
T(await p.locator('[data-standard-plan-viewer]').count() === 1, 'and the plan opens full screen');
for (let i = 0; i < 30; i++) { await p.waitForTimeout(300); if (await p.locator('[data-standard-plan-viewer] canvas').count()) break; }
T(await p.locator('[data-standard-plan-viewer] canvas').count() > 0, 'drawn by the plan viewer (zoom, pages)');
T(await p.locator('[data-standard-plan-viewer] [data-plan-share]').count() > 0, 'with Share on its bar');
// a plan of several pages (owner, 2026-11-11)
const pageWord = () => p.locator('[data-standard-plan-viewer]').evaluate(el => [...el.querySelectorAll('span')].map(x => x.textContent.trim()).find(t => /^\d+ \/ \d+$/.test(t)) ?? '');
T(await pageWord() === '1 / 3', `a 3-page plan says its pages (${await pageWord()})`);
await p.locator('[data-standard-plan-viewer] button[title="Next page"]').click(); await p.waitForTimeout(700);
T(await pageWord() === '2 / 3', 'the bar\'s › goes to the next page');
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(700);
T(await pageWord() === '3 / 3', 'the right arrow key too');
await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(700);
T(await pageWord() === '2 / 3', 'and the left arrow goes back');
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/sp-viewer.png` });
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
T(await p.locator('[data-standard-plan-viewer]').count() === 0, 'Escape closes the viewer');

// a plain press now opens it
await btns.first().click(); await p.waitForTimeout(800);
T(await p.locator('[data-standard-plan-viewer]').count() === 1, 'once set, a press opens the plan');
await p.locator('[data-standard-plan-close]').click(); await p.waitForTimeout(300);

// EVERY FLOOR ITS OWN (owner, 2026-11-11): another floor has no plan until it is given one
const rail = await p.locator('[data-rail-floor]').evaluateAll(es => es.map(e => e.getAttribute('data-rail-floor')));
const other = rail.find(l => l !== rail[0] && /^\d+$/.test(l)) ?? rail[1];
await p.locator(`[data-rail-floor="${other}"]`).click(); await p.waitForTimeout(900);
const f2 = await btns.first().getAttribute('data-standard-plan-floor');
T(f2 !== f15 && await btns.first().getAttribute('data-standard-plan-set') === '0', `on another floor (${f2}) the button has no plan yet`);
await btns.first().click({ button: 'right' }); await p.waitForTimeout(500);
// pasting is enough — no second press
await paste(p, 'https://drive.google.com/drive/folders/PLANSFOLDER1'); await p.waitForTimeout(2500);
T(await p.locator('[data-plan-finder]').count() === 1, 'PASTING a folder link opens the Plan Finder in that folder, no second press');
await p.locator('[data-plan-row="TYP-B2"]').click(); await p.waitForTimeout(900);
await p.locator('[data-preview-open]').click(); await p.waitForTimeout(1500);
sp = await plans(p);
T(sp.floor[ids[0]]?.[f2]?.fileId === 'TYP-B2' && sp.floor[ids[0]]?.[f15]?.fileId === 'TYP-B1', `each floor keeps its own plan (${f15}: B1, ${f2}: B2)`);
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await p.locator(`[data-rail-floor="${rail[0]}"]`).click(); await p.waitForTimeout(900);
T(/Typical floor B1/.test(await btns.first().getAttribute('title') ?? ''), 'back on the first floor the button is that floor\'s plan again');

// the second building: "Use for every floor"
await btns.nth(1).click({ button: 'right' }); await p.waitForTimeout(500);
T(await p.locator('[data-standard-plan-browse]').count() === 1, 'the next building offers "Choose from Drive" in the remembered folder');
await p.locator('[data-standard-plan-all]').check();
await p.locator('[data-standard-plan-browse]').click(); await p.waitForTimeout(2000);
await p.locator('[data-plan-row="TYP-B3"] [data-tile-star]').click({ force: true }); await p.waitForTimeout(1500);
sp = await plans(p);
T(sp.whole[ids[1]]?.fileId === 'TYP-B3', '"Use for every floor" saves the building\'s own plan');
T(!sp.whole[ids[0]] && sp.floor[ids[0]]?.[f15]?.fileId === 'TYP-B1', 'the first building keeps its own');
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await p.locator(`[data-rail-floor="${other}"]`).click(); await p.waitForTimeout(900);
T(await btns.nth(1).getAttribute('data-standard-plan-set') === '1', 'and every floor of that building shows it');
const folderSaved = await p.evaluate(() => { const s = window.__store.getState(); return s.boardSettings[s.currentProjectId]?.standardPlansFolder; });
T(/PLANSFOLDER1/.test(folderSaved ?? ''), 'the folder is remembered for the next building');

// UPLOAD A PDF directly (owner, 2026-11-11)
await btns.nth(2).click({ button: 'right' }); await p.waitForTimeout(500);
T(await p.locator('[data-standard-plan-upload]').count() === 1, 'the box offers "Upload a PDF" beside the link');
await p.screenshot({ path: `${OUT}/sp-setup.png` });
await p.locator('[data-standard-plan-file]').setInputFiles({ name: 'Typical floor B3 new.pdf', mimeType: 'application/pdf', buffer: pdf });
await p.waitForTimeout(2500);
sp = await plans(p);
const fNow = await btns.nth(2).getAttribute('data-standard-plan-floor');
T(ups.includes('put') && sp.floor[ids[2]]?.[fNow]?.fileId === 'UPLOADED1' && sp.floor[ids[2]][fNow].name === 'Typical floor B3 new.pdf', `the PDF goes up to Drive and becomes that floor's plan (${ups.join(' ')})`);
T(ups.some(u => u.startsWith('session:PLANSFOLDER1')), 'into the folder the plans were last chosen from');
T(await p.locator('[data-standard-plan-viewer]').count() === 1, 'and it opens');
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

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
await nv.p.locator('[data-standard-plan-use]').click(); await nv.p.waitForTimeout(2500);
await nv.p.locator('[data-plan-row="TYP-B1"] [data-tile-star]').click({ force: true }); await nv.p.waitForTimeout(1500);
const np = await nv.p.evaluate(() => { const s = window.__store.getState(); return { pid: s.currentProjectId, sp: JSON.parse(JSON.stringify(s.boardSettings[s.currentProjectId]?.standardPlansByFloor ?? {})), w: Object.keys(s.boardSettings.wolfson?.standardPlansByFloor ?? {}).length }; });
T(np.pid === 'netiv' && Object.keys(np.sp).length === 1, `Netiv keeps its own standard plans (${np.pid}, ${Object.keys(np.sp).length})`);
await nv.p.screenshot({ path: `${OUT}/sp-netiv.png` });
await nv.ctx.close();
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
