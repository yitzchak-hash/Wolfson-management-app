// Tzvi's inspection (owner, 2026-11-08, plan approved): only his user sees "Inspection" on the Stages; it offers a
// photo, a video or the gallery; what he takes goes to Drive › Photos › Inspections and a row "Inspected by Tzvi ✓"
// stands right after the stage that was last finished, opening to show the file. Drive is a stand-in. Run against a
// dev server started with VITE_DRIVE_API_KEY set. SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const uploads = [];
for (const who of ['Tzvi', 'Esther']) {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
  await applySeed(ctx, blob);
  await ctx.addInitScript((name) => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw); if (d.__in) return; d.__in = 1;
    d.currentUser = { ...(d.currentUser ?? {}), name };
    for (const a of d.apartments ?? []) if (a.id === 'A1-53') { a.driveLink = 'https://drive.google.com/drive/folders/HARNESSFOLDER'; a.inspections = []; }
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  }, who);
  await ctx.route('**/api/**', async r => {
    const u = r.request().url();
    if (u.includes('/api/folder')) { const b = r.request().postDataJSON?.() ?? {}; uploads.push(`folder:${b.name ?? ''}`); }
    if (u.includes('/api/drive-session')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uploadUrl: 'https://upload.harness.test/put' }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'F1', folderId: 'F1', files: [], ok: true }) });
  });
  await ctx.route('https://upload.harness.test/**', async r => {
    uploads.push('put');
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: 'INSP1', webViewLink: 'https://drive.google.com/file/d/INSP1/view' }) });
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2200);
  await p.locator('[data-view-switch] [data-view="board"]:visible').first().click().catch(() => {}); await p.waitForTimeout(1000);
  await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1500);
  const btn = p.locator('[data-inspect]');
  if (who !== 'Tzvi') { T(await btn.count() === 0, `${who}: no Inspection button — it is Tzvi's alone`); await ctx.close(); continue; }
  T(await btn.count() === 1, 'Tzvi: the Inspection button stands on the Stages');
  // Finish the FIRST stage (Drilling) by hand: to do → working → done, so "after the last finished stage" is real.
  const firstBubble = p.locator('[data-stage-bubble]').first();
  for (let i = 0; i < 3; i++) {
    if ((await firstBubble.getAttribute('data-stage-state')) === 'done') break;
    await firstBubble.click(); await p.waitForTimeout(400);
  }
  T((await firstBubble.getAttribute('data-stage-state')) === 'done', 'the first stage is finished');
  const lastDone = await p.evaluate(() => [...document.querySelectorAll('[data-stage-row][data-stage-state="done"]')].pop()?.getAttribute('data-stage-row') ?? null);
  await btn.scrollIntoViewIfNeeded(); await btn.click(); await p.waitForTimeout(300);
  T(await p.locator('[data-inspect-ask] [data-inspect-choice]').count() === 3, 'it offers Take a photo · Take a video · From the gallery');
  await p.screenshot({ path: `${OUT}/inspect-ask.png` });
  await p.locator('[data-inspect-input="photo"]').setInputFiles({ name: 'inspection.png', mimeType: 'image/png', buffer: png });
  await p.waitForTimeout(1500);
  const row = p.locator('[data-inspection]');
  T(await row.count() === 1, 'a row "Inspected by Tzvi" joined the stages');
  T((await row.textContent()).includes('Inspected by Tzvi'), 'it says "Inspected by Tzvi"');
  const place = await p.evaluate(() => { const r = document.querySelector('[data-inspection]'); const prev = r?.previousElementSibling; return prev?.getAttribute('data-stage-row') ?? (prev ? 'other' : 'first'); });
  T(place === (lastDone ?? 'first'), `it stands right after the last finished stage (${place} · expected ${lastDone ?? 'first'})`);
  T(uploads.includes('put') && uploads.some(u => u === 'folder:Inspections'), `the file went to Drive › Photos › Inspections (${uploads.join(', ')})`);
  await row.locator('[data-inspection-toggle]').click(); await p.waitForTimeout(300);
  T(await row.locator('[data-inspection-file]').count() === 1, 'pressing the row opens it to show the picture');
  await row.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/inspect-row.png` });
  await ctx.close();
}
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
