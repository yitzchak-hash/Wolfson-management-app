// The Plan Sketcher's give-back (its B10): the sketch studio inside THIS app.
// Opens an apartment with a plan, presses the drawer's new Sketch button, and
// asserts the studio mounts over the plan with its shelf, its layers and the
// Export door — then closes back to the buildings. Needs the dev server on
// 5173 and `npm i --no-save playwright pdf-lib`.
//
//   node scratchpad/sketchgiveback.mjs
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

const APP = 'http://localhost:5173';
const PLAN_ID = 'HARNESSPLAN1';
async function makePlan() {
  const pdf = await PDFDocument.create(); const page = pdf.addPage([1000, 700]); const ink = rgb(0.08, 0.08, 0.08);
  page.drawRectangle({ x: 100, y: 100, width: 800, height: 500, borderWidth: 8, borderColor: ink });
  page.drawLine({ start: { x: 500, y: 100 }, end: { x: 500, y: 380 }, thickness: 6, color: ink });
  return Buffer.from(await pdf.save());
}
const planBytes = await makePlan();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
await applySeed(ctx, blob);
const FOLDER = 'application/vnd.google-apps.folder';
await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"files":[]}' }));
await ctx.route('**/api/drive-files', async r => {
  const id = JSON.parse(r.request().postData() ?? '{}').folderId;
  const files = { JOBFOLDER: [{ id: 'PLANSFOLDER', name: 'Engineered Plans', mimeType: FOLDER }], PLANSFOLDER: [{ id: PLAN_ID, name: 'Sample.pdf', mimeType: 'application/pdf' }] }[id] ?? [];
  await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files }) });
});
await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx.addInitScript(planId => {
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw);
  for (const a of d.apartments ?? []) if (a.id === 'A1-53') { a.displayName = 'Sampleson, Yaakov'; a.address = '12 Example St'; a.phone = '050-0000000'; a.driveLink = 'https://drive.google.com/drive/folders/JOBFOLDER'; a.plansPdfLink = `https://drive.google.com/file/d/${planId}/view`; }
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}, PLAN_ID);
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const ok = [], bad = []; const t = (n, c, x) => (c ? ok : bad).push(n + (x !== undefined ? ' :: ' + x : ''));
try {
  await p.goto(`${APP}/project`); await p.waitForTimeout(2500);
  const cell = p.locator('[data-apt-id="A1-53"]').first(); await cell.click(); await p.waitForTimeout(5000);
  t('the drawer opened with the plan pane', (await p.locator('.drawer-panel').count()) === 1 && (await p.locator('.drawer-panel canvas').count()) > 0);
  t('the plan bar carries a Sketch button beside Mark up', (await p.locator('[data-sketch-open]').count()) === 1);
  await p.click('[data-sketch-open]'); await p.waitForTimeout(500);
  t('it goes to /sketch/<plan> with the job, the workspace and the JOB folder (the export files Engineered Plans › Sketcher under it)', /\/sketch\/HARNESSPLAN1\?/.test(p.url()) && /job=A1-53/.test(p.url()) && /project=wolfson/.test(p.url()) && /folder=JOBFOLDER/.test(p.url()), p.url());
  await p.waitForSelector('[data-gvs-layer]', { timeout: 30000 }); await p.waitForSelector('[data-shelf-block]', { timeout: 20000 }); await p.waitForTimeout(600);
  t('the studio mounts: the block shelf sells the catalog, the gvs layer stands over the sheet', (await p.locator('[data-shelf-block]').count()) > 50 && (await p.locator('[data-gvs-layer]').count()) === 1);
  t('the bar carries Export…, Download and Print', (await p.locator('[data-sketch-export]').count()) === 1 && (await p.locator('[data-plan-download]').count()) === 1);
  // a block goes on the sheet through the sketcher's own store, and lands in localStorage `sketcher_app_data`
  const blk = p.locator('[data-shelf-block]').first(); await blk.click(); await p.waitForTimeout(200);
  const sheet = await p.locator('[data-sheet]').first().boundingBox();
  await p.mouse.click(sheet.x + sheet.width * 0.5, sheet.y + sheet.height * 0.5); await p.waitForTimeout(600);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('sketcher_app_data') || '{}'));
  t('a stamped block is a record in the sketcher\'s own store (sketcher_app_data), never the job app\'s', (st.items?.length ?? 0) === 1 && !JSON.parse(await p.evaluate(() => localStorage.getItem('wolfson_app_data'))).items, JSON.stringify(st.items?.[0]?.blockId));
  await p.click('[data-sketch-export]'); await p.waitForSelector('[data-export-dialog]', { timeout: 8000 });
  t('Export… prefills the title block from the APARTMENT: the family name, the phone, the address', (await p.inputValue('[data-tb="family"]')).includes('Sampleson') && (await p.inputValue('[data-tb="phone"]')) === '050-0000000' && (await p.inputValue('[data-tb="address"]')) === '12 Example St', await p.inputValue('[data-tb="family"]'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.screenshot({ path: 'scratchpad/sketchgiveback.png' });
  await p.locator('[data-sketch-page] button[aria-label="Close"], [data-sketch-page] button[title="Close"]').first().click({ timeout: 3000 }).catch(async () => { await p.keyboard.press('Escape'); });
  await p.waitForTimeout(800);
  t('closing the studio comes back to the buildings', /\/project$/.test(p.url()), p.url());
  t('no page errors', errs.length === 0, errs.join(' | '));
} catch (e) { bad.push('THREW ' + e.message.split('\n')[0]); await p.screenshot({ path: 'scratchpad/sketchgiveback-fail.png' }).catch(() => {}); }
console.log('OK', ok.length); ok.forEach(x => console.log('  ✓', x)); console.log('BAD', bad.length); bad.forEach(x => console.log('  ✗', x));
await browser.close(); process.exit(bad.length ? 1 : 0);
