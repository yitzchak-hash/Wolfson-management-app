// Photos tab: Select → pick → Delete, Tzvi's account only (owner, 2026-11-08). Drive is a stand-in: the Photos folder
// holds DRVPHOTO0001 (a picture) and DRVPHOTO0002 (a video); a site photo lives only in the app. Run against a dev
// server started with VITE_DRIVE_API_KEY set. SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
for (const who of ['Esther', 'Tzvi']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await applySeed(ctx, blob);
  await ctx.addInitScript((name) => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw); if (d.__pd) return; d.__pd = 1;
    d.currentUser = { ...(d.currentUser ?? {}), name };
    const at = new Date().toISOString(); const cid = d.contractors?.[0]?.id ?? 'C1';
    for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.driveLink = 'https://drive.google.com/drive/folders/HARNESSFOLDER';
    d.contractorAssignments = [...(d.contractorAssignments ?? []), { id: 'T-PD', contractorId: cid, apartmentId: 'A1-53', taskDescription: 'Fit', dueDate: at.slice(0, 10), completed: false, priority: 'normal', createdAt: at, updatedAt: at }];
    d.contractorPhotos = [...(d.contractorPhotos ?? []),
      { id: 'P-PD1', assignmentId: 'T-PD', apartmentId: 'A1-53', contractorId: cid, dataUrl: '', filename: 'site.jpg', fileType: 'image', mimeType: 'image/jpeg', uploadedAt: at, storageUrl: `${location.origin}/__stub/site.png`, reviewedAt: at },
      { id: 'P-PD2', assignmentId: 'T-PD', apartmentId: 'A1-53', contractorId: cid, dataUrl: '', filename: 'drv.jpg', fileType: 'image', mimeType: 'image/jpeg', uploadedAt: at, driveFileId: 'DRVPHOTO0001', reviewedAt: at }];
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  }, who);
  const trashed = [];
  await ctx.route('**/api/**', async r => {
    const u = r.request().url(); const b = r.request().postDataJSON?.() ?? {};
    if (u.includes('/api/drive-upload') && b.mode === 'trash-files') { trashed.push(...b.fileIds); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, results: b.fileIds.map(id => ({ id, trashed: true })) }) }); }
    if (u.includes('/api/drive-files')) {
      const files = b.folderId === 'HARNESSFOLDER' ? [{ id: 'PHOTOSFOLDER1', name: 'Photos', mimeType: 'application/vnd.google-apps.folder' }]
        : b.folderId === 'PHOTOSFOLDER1' ? [{ id: 'DRVPHOTO0001', name: 'drv.jpg', mimeType: 'image/jpeg' }, { id: 'DRVPHOTO0002', name: 'walk.mp4', mimeType: 'video/mp4' }] : [];
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, files: [] }) });
  });
  await ctx.route(/__stub|drive\.google\.com\/thumbnail/, r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }));
  const p = await ctx.newPage();
  await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2200);
  await p.locator('[data-view-switch] [data-view="board"]:visible').first().click().catch(() => {}); await p.waitForTimeout(800);
  await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: /^Photos/ }).first().click(); await p.waitForTimeout(1800);
  const tiles = p.locator('[data-photo-tile]');
  const n0 = await tiles.count();
  if (who !== 'Tzvi') { T(await p.locator('[data-photos-select]').count() === 0 && n0 >= 3, `${who}: no Select button (${n0} tiles)`); await ctx.close(); continue; }
  T(n0 === 3, `Tzvi sees the three files (${n0})`);
  await p.locator('[data-photos-select]').click(); await p.waitForTimeout(200);
  T(await p.locator('[data-photos-select-bar]').isVisible(), 'Select opens the bar');
  await p.locator('[data-photo-tile="P-PD1"]').click(); await p.locator('[data-photo-tile="DRVPHOTO0001"]').click(); await p.waitForTimeout(200);
  T(await p.locator('[data-photos-picked]').getAttribute('data-photos-picked') === '2', 'two picked, and a tap picks instead of opening');
  T(await p.locator('[data-lightbox], [role=dialog][aria-label*="photo" i]').count() === 0, 'no viewer opened while selecting');
  await p.screenshot({ path: `${OUT}/photos-select.png` });
  await p.locator('[data-photos-delete]').click(); await p.waitForTimeout(200);
  T(await p.locator('[data-photos-delete-ask]').isVisible(), 'Delete asks first');
  await p.locator('[data-photos-delete-yes]').click(); await p.waitForTimeout(1200);
  T(trashed.join() === 'DRVPHOTO0001', `only the Drive file went to Drive's trash (${trashed.join()})`);
  T(await tiles.count() === 1 && await p.locator('[data-photo-tile="DRVPHOTO0002"]').count() === 1, `the video stays (${await tiles.count()})`);
  T(await p.locator('[data-photos-select-bar]').count() === 0, 'the bar closes after deleting');
  // A record left behind would come back as a loose tile (its Drive copy is gone from the list): one tile left = both
  // site records went with their pictures.
  T(await p.locator('[data-photo-tile="P-PD1"], [data-photo-tile="P-PD2"]').count() === 0, 'no site record of the deleted pictures is left on screen')
  await ctx.close();
}
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
