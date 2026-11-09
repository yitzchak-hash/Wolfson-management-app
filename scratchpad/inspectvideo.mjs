// Tzvi's inspection video (owner, 2026-11-09: "tzvis inspection video is not playing"). An inspection holding a Drive
// video; the app's stream answers with bytes this browser cannot play (a stand-in for the iPhone's "length unknown"
// MP4), so the viewer must switch to Drive's own player, and a stream that never starts must switch after 8 s too.
// Dev server with VITE_DRIVE_API_KEY on 5173. SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
for (const mode of ['refused', 'stalls']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await applySeed(ctx, blob);
  await ctx.addInitScript(() => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw); if (d.__iv) return; d.__iv = 1;
    for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.inspections = [{ id: 'ins-v', at: new Date().toISOString(), lastAt: new Date().toISOString(), byId: 'u1', byName: 'Tzvi', afterStageId: null,
      files: [{ filename: 'inspection-video.mp4', mimeType: 'video/mp4', driveFileId: 'VIDEOFILE0001', driveUrl: 'https://drive.google.com/file/d/VIDEOFILE0001/view' }] }];
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  });
  await ctx.route('**/api/drive-fetch**', async r => {
    if (mode === 'refused') return r.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from('not really a film') });
    await new Promise(res => setTimeout(res, 20000)); return r.abort();   // a stream that never starts
  });
  await ctx.route(/drive\.google\.com\/(thumbnail|file)/, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body style="background:#111;color:#fff">DRIVE PLAYER</body></html>' }));
  const p = await ctx.newPage();
  await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2200);
  await p.locator('[data-view-switch] [data-view="board"]:visible').first().click().catch(() => {}); await p.waitForTimeout(800);
  await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1500);
  const row = p.locator('[data-inspection]').first();
  await row.locator('[data-inspection-toggle]').click(); await p.waitForTimeout(300);
  await row.locator('[data-inspection-file]').first().click(); await p.waitForTimeout(mode === 'refused' ? 2500 : 9500);
  const player = p.locator('[data-viewer-drive-player]');
  T(await player.count() === 1, `${mode}: the viewer switches to Drive's player`);
  T((await player.getAttribute('src') ?? '').includes('VIDEOFILE0001'), `${mode}: Drive's player shows that file`);
  T(await p.locator('[data-viewer-drive]').count() === 1, `${mode}: "Open in Drive" stays in the bar`);
  await p.screenshot({ path: `${OUT}/inspect-video-${mode}.png` });
  await ctx.close();
}
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
