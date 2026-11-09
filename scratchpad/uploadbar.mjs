// A picked file is SEEN going up (owner, 2026-11-08: "we don't see like uploading with the progress … wait 10 seconds
// and nothing happens, and then boom"). Drive is a stand-in that takes 3 s; the problem form's paperclip must show
// "Uploading…" with a bar AT ONCE, and drop it when the file lands. Run against a dev server started with
// VITE_DRIVE_API_KEY set (any value). SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
await applySeed(ctx, blob);
await ctx.addInitScript(() => {
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw); if (d.__ub) return; d.__ub = 1;
  for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.driveLink = 'https://drive.google.com/drive/folders/HARNESSFOLDER';
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});
await ctx.route('**/api/**', async r => {
  const u = r.request().url();
  if (u.includes('/api/drive-session')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uploadUrl: 'https://upload.harness.test/put' }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'F1', folderId: 'F1', files: [], ok: true }) });
});
await ctx.route('https://upload.harness.test/**', async r => {
  await new Promise(res => setTimeout(res, 3000));
  await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: 'UP1', webViewLink: 'https://drive.google.com/file/d/UP1/view' }) });
});
const p = await ctx.newPage();
await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2200);
await p.locator('[data-view-switch] [data-view="board"]:visible').first().click().catch(() => {}); await p.waitForTimeout(1000);
await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1500);
await p.locator('[data-report-problem]').first().scrollIntoViewIfNeeded(); await p.locator('[data-report-problem]').first().click(); await p.waitForTimeout(800);
const box = p.locator('[data-problem-box]').first();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await box.locator('input[type=file]').setInputFiles({ name: 'site-photo.png', mimeType: 'image/png', buffer: png });
await p.waitForTimeout(400);
T(await box.locator('[data-attach-uploading]').isVisible(), 'the moment a file is picked, "Uploading…" shows with a bar');
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/upload-bar.png` });
await p.waitForTimeout(3500);
T(!(await box.locator('[data-attach-uploading]').count()), 'it goes when the file has landed');
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
