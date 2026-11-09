// Inspection round 3 (owner, 2026-11-09): ONE upload card for the whole batch ("Uploading n of N", one bar); the
// Inspection button works while a batch is going up; the phone's own PHOTO camera fills the strip one trip at a time;
// the Photos tab shows the inspection the moment it lands, on a job with no Drive folder too.
// Dev server with VITE_DRIVE_API_KEY on 5173. SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
// a real 1×1 PNG so the browser can draw it
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pic = n => ({ name: `IMG_${n}.png`, mimeType: 'image/png', buffer: png });

const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, permissions: ['camera'] });
await applySeed(ctx, blob);
await ctx.addInitScript(() => {
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw); if (d.__i3) return; d.__i3 = 1;
  d.currentUser = { ...(d.currentUser ?? {}), name: 'Tzvi' };
  d.backupDriveFolderLink = 'https://drive.google.com/drive/folders/GENERALFOLDER01';
  for (const a of d.apartments ?? []) if (a.id === 'A1-53') { a.driveLink = ''; a.inspections = []; }
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});
let seq = 0;
await ctx.route('**/api/**', async r => {
  const u = r.request().url(); const b = r.request().postDataJSON?.() ?? {};
  if (u.includes('/api/drive-session')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uploadUrl: 'https://upload.harness.test/put' }) });
  if (u.includes('/api/drive-upload') && (b.data || b.base64 || b.content)) {
    await new Promise(res => setTimeout(res, 1500)); seq++;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: `PIC${seq}`, fileId: `PIC${seq}`, webViewLink: `https://drive.google.com/file/d/PIC${seq}/view` }) });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'F-' + (b.name ?? 'x').replace(/\W/g, '').slice(0, 12), folderId: 'F-' + (b.name ?? 'x').replace(/\W/g, '').slice(0, 12), files: [], ok: true }) });
});
await ctx.route('https://upload.harness.test/**', async r => {
  await new Promise(res => setTimeout(res, 1500)); seq++;
  await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: `PIC${seq}`, webViewLink: `https://drive.google.com/file/d/PIC${seq}/view` }) });
});
await ctx.route(/drive\.google\.com\/thumbnail/, r => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
const p = await ctx.newPage();
await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2200);
await p.locator('[data-view-switch-narrow] [data-view="board"], [data-view-switch] [data-view="board"]').first().click().catch(() => {}); await p.waitForTimeout(900);
await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1500);
await p.locator('[data-inspect]').scrollIntoViewIfNeeded(); await p.locator('[data-inspect]').click(); await p.waitForTimeout(1200);
const cam = p.locator('[data-inspect-camera]');

// the phone's own photo camera, three trips
const phone = cam.locator('[data-camera-phone]');
T(await phone.count() === 1, 'Photo mode shows "Phone camera"');
for (let i = 1; i <= 3; i++) {
  const [ch] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), phone.click()]);
  if (i === 1) T(ch ? await ch.element().evaluate(e => e.getAttribute('accept') === 'image/*' && e.getAttribute('capture') === 'environment') : false, 'it asks for a picture from the back camera');
  if (ch) await ch.setFiles(pic(i));
  await p.waitForTimeout(300);
}
T(await cam.locator('[data-camera-strip] > div').count() === 3, 'three trips → three pictures waiting in the strip');
await cam.locator('[data-camera-mode="video"]').click(); await p.waitForTimeout(200);
T(await cam.locator('[data-camera-phone]').count() === 0, 'Video mode has no "Phone camera" (the shutter is the phone camera there)');
await cam.locator('[data-camera-mode="photo"]').click();
await cam.locator('[data-camera-done]').click();

// one card for the batch
let seen = null;
for (let i = 0; i < 30; i++) {
  await p.waitForTimeout(150);
  const n = await p.locator('[data-upload-toast]').count();
  if (n) { seen = await p.locator('[data-upload-toast]').first().evaluate(e => ({ count: e.dataset.uploadCount, text: e.innerText, cards: document.querySelectorAll('[data-upload-toast]').length })); if (seen.count === '3') break; }
}
T(!!seen && seen.cards === 1, `ONE upload card, not one per file (${seen?.cards})`);
T(!!seen && seen.count === '3' && /of 3/.test(seen.text), `it counts the whole batch (${seen?.text?.replace(/\s+/g, ' ')})`);
await p.screenshot({ path: `${OUT}/inspect3-uploading.png` });

// the button works mid-upload
const btn = p.locator('[data-inspect]');
T(!(await btn.isDisabled()), 'the Inspection button is not locked while uploading');
await btn.click(); await p.waitForTimeout(900);
T(await p.locator('[data-inspect-camera]').count() === 1, 'pressing it mid-upload opens the camera again');
const [ch2] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), p.locator('[data-inspect-camera] [data-camera-phone]').click()]);
if (ch2) await ch2.setFiles(pic(4));
await p.waitForTimeout(300);
await p.locator('[data-inspect-camera] [data-camera-done]').click();
let grew = null;
for (let i = 0; i < 20; i++) { await p.waitForTimeout(120); grew = await p.locator('[data-upload-toast]').first().getAttribute('data-upload-count').catch(() => null); if (grew === '4') break; }
T(grew === '4', `the second batch joins the same bar (${grew})`);

// everything lands in ONE inspection
for (let i = 0; i < 80; i++) { await p.waitForTimeout(200); if (!(await p.locator('[data-upload-toast]').count())) break; }
await p.waitForTimeout(800);
T(await p.locator('[data-upload-toast]').count() === 0, 'the card goes away when all are up');
const files = await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
  const a = (d.apartments ?? []).find(x => x.id === 'A1-53');
  return (a?.inspections ?? []).map(i => i.files.length);
});
T(files.length === 1 && files[0] === 4, `both batches fold into one inspection of 4 (${JSON.stringify(files)})`);

// the Photos tab, at once, on a job with no Drive folder
await p.locator('[data-tab="photos"], button:has-text("Photos")').first().click().catch(() => {}); await p.waitForTimeout(900);
const tiles = await p.locator('[data-photo-tile^="ins-"]').count();
T(tiles === 4, `the Photos tab shows the 4 inspection pictures right away (${tiles})`);
T(/inspections/i.test(await p.evaluate(() => document.body.innerText)), 'under an "Inspections" section');
await p.screenshot({ path: `${OUT}/inspect3-photos.png`, fullPage: false });
await ctx.close();
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
