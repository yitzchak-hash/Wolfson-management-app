// Tzvi's inspection (owner, 2026-11-08, plan approved): only his user sees "Inspection" on the Stages; it offers a
// photo, a video or the gallery; what he takes goes to Drive › Photos › Inspections and a row "Inspected by Tzvi ✓"
// stands right after the stage that was last finished, opening to show the file. Drive is a stand-in. Run against a
// dev server started with VITE_DRIVE_API_KEY set. SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
// Chromium's fake camera feeds the in-app viewfinder a test picture.
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const uploads = [];
for (const who of ['Tzvi', 'Esther']) {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, permissions: ['camera', 'microphone'] });
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
  await btn.scrollIntoViewIfNeeded(); await btn.click(); await p.waitForTimeout(1500);
  // The camera INSIDE the app: three pictures, then Done.
  const cam = p.locator('[data-inspect-camera]');
  T(await cam.isVisible(), 'Inspection opens the camera inside the app');
  T(!(await cam.locator('[data-camera-failed]').count()), 'the viewfinder shows the camera');
  for (let i = 0; i < 3; i++) { await cam.locator('[data-camera-shutter]').click(); await p.waitForTimeout(350); }
  T(await cam.locator('[data-camera-strip] img').count() === 3, 'three shots wait in the strip — nothing sent yet');
  await p.screenshot({ path: `${OUT}/inspect-camera.png` });
  await cam.locator('[data-camera-done]').click(); await p.waitForTimeout(2000);
  const row = p.locator('[data-inspection]');
  T(await row.count() === 1, 'Done: one row "Inspected by Tzvi" joined the stages');
  T((await row.textContent()).includes('3'), 'the inspection carries the three pictures');
  T((await row.textContent()).includes('Inspected by Tzvi'), 'it says "Inspected by Tzvi"');
  const place = await p.evaluate(() => { const r = document.querySelector('[data-inspection]'); const prev = r?.previousElementSibling; return prev?.getAttribute('data-stage-row') ?? (prev ? 'other' : 'first'); });
  T(place === (lastDone ?? 'first'), `it stands right after the last finished stage (${place} · expected ${lastDone ?? 'first'})`);
  T(uploads.includes('put') && uploads.some(u => u === 'folder:Inspections'), `the file went to Drive › Photos › Inspections (${uploads.join(', ')})`);
  // Again within half an hour: the new pictures fold into the SAME inspection.
  await btn.click(); await p.waitForTimeout(1500);
  await cam.locator('[data-camera-shutter]').click(); await p.waitForTimeout(350);
  await cam.locator('[data-camera-done]').click(); await p.waitForTimeout(2000);
  T(await row.count() === 1, 'a second round within half an hour folds into the same inspection (still one row)');
  await row.locator('[data-inspection-toggle]').click(); await p.waitForTimeout(300);
  T(await row.locator('[data-inspection-file]').count() === 4, `pressing the row opens it to show all four pictures (${await row.locator('[data-inspection-file]').count()})`);
  await row.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/inspect-row.png` });
  await ctx.close();
}
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
