// Inspection round 2 (owner, 2026-11-09): a film is taken by the PHONE'S OWN CAMERA (full quality, proper sound) and
// comes back into the strip; a job with no Drive folder saves into the general folder (Settings → Backups) under
// "Jobs without a Drive folder"; with no folder anywhere a film is refused out loud, never dropped silently.
// Dev server with VITE_DRIVE_API_KEY on 5173. SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
const film = { name: 'IMG_0001.MOV', mimeType: 'video/quicktime', buffer: Buffer.alloc(4096, 7) };

for (const sc of ['own-folder', 'general-folder', 'no-folder']) {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, permissions: ['camera'] });
  await applySeed(ctx, blob);
  await ctx.addInitScript((sc) => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw); if (d.__i2) return; d.__i2 = 1;
    d.currentUser = { ...(d.currentUser ?? {}), name: 'Tzvi' };
    d.backupDriveFolderLink = sc === 'no-folder' ? '' : 'https://drive.google.com/drive/folders/GENERALFOLDER01';
    for (const a of d.apartments ?? []) if (a.id === 'A1-53') { a.driveLink = sc === 'own-folder' ? 'https://drive.google.com/drive/folders/JOBFOLDER0001' : ''; a.inspections = []; }
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  }, sc);
  const calls = [];
  await ctx.route('**/api/**', async r => {
    const u = r.request().url(); const b = r.request().postDataJSON?.() ?? {};
    if (u.includes('/api/folder')) calls.push(`folder:${b.parentId ?? b.parent ?? ''}>${b.name ?? ''}`);
    if (u.includes('/api/drive-session')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uploadUrl: 'https://upload.harness.test/put' }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'F-' + (b.name ?? 'x').replace(/\W/g, '').slice(0, 12), folderId: 'F-' + (b.name ?? 'x').replace(/\W/g, '').slice(0, 12), files: [], ok: true }) });
  });
  await ctx.route('https://upload.harness.test/**', async r => {
    calls.push('put');
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: 'FILM1', webViewLink: 'https://drive.google.com/file/d/FILM1/view' }) });
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2200);
  await p.locator('[data-view-switch-narrow] [data-view="board"], [data-view-switch] [data-view="board"]').first().click().catch(() => {}); await p.waitForTimeout(900);
  await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1500);
  await p.locator('[data-inspect]').scrollIntoViewIfNeeded(); await p.locator('[data-inspect]').click(); await p.waitForTimeout(1200);
  const cam = p.locator('[data-inspect-camera]');
  await cam.locator('[data-camera-mode="video"]').click(); await p.waitForTimeout(500);
  const [chooser] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), cam.locator('[data-camera-shutter]').click()]);
  T(!!chooser, `${sc}: Video opens the phone's own camera`);
  T(chooser ? await chooser.element().evaluate(e => e.getAttribute('accept') === 'video/*' && e.getAttribute('capture') === 'environment') : false, `${sc}: it asks for a video from the back camera`);
  if (chooser) await chooser.setFiles(film);
  await p.waitForTimeout(500);
  T(await cam.locator('[data-camera-strip] > div').count() === 1, `${sc}: the film waits in the strip`);
  await cam.locator('[data-camera-done]').click();
  const said = []; for (let i = 0; i < 20; i++) { await p.waitForTimeout(110); const t = await p.evaluate(() => document.body.innerText); if (/not saved/i.test(t)) { said.push(t.match(/[^\n]*not saved[^\n]*/i)[0]); break; } }
  await p.waitForTimeout(800);
  if (sc === 'own-folder') {
    T(calls.some(c => c.startsWith('folder:JOBFOLDER0001>Photos')) && calls.includes('put'), `own folder: the film goes to the job's Drive › Photos (${calls.join(' ')})`);
    T(await p.locator('[data-inspection]').count() === 1, 'own folder: the inspection row appears');
  } else if (sc === 'general-folder') {
    T(calls.some(c => c.includes('GENERALFOLDER01>Jobs without a Drive folder')), `no job folder: it goes to the general folder › "Jobs without a Drive folder" (${calls.join(' ')})`);
    T(calls.includes('put'), 'no job folder: the film is uploaded');
    T(await p.locator('[data-inspection]').count() === 1, 'no job folder: the inspection row appears');
  } else {
    T(said.length > 0, `no folder anywhere: a film is refused out loud (${said.join(' | ')})`);
    T(!calls.includes('put'), 'no folder anywhere: nothing uploads');
  }
  await p.screenshot({ path: `${OUT}/inspect2-${sc}.png` });
  await ctx.close();
}
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
