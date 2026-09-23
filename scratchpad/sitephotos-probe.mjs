// "Live from site": every workspace's pictures and films on one widget, a new
// one showing seconds after it lands, and a tap opening the viewer — on the
// board with a mouse and on the wall with a finger. Dev server on 5173.
import { chromium } from 'playwright';
const APP = process.env.APP || 'http://localhost:5173';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const now = Date.now(); const ago = m => new Date(now - m * 60000).toISOString();
const seed = () => { const now = Date.now(); const ago = m => new Date(now - m * 60000).toISOString();
  localStorage.setItem('active_project', 'general'); localStorage.setItem('general_app_version', '3'); localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01'); localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const user = { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const contractors = [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }];
  const bins = [['done', '#16a34a'], ['ready', '#0ea5e9'], ['archive', '#64748b'], ['trash', '#dc2626']].map(([k, c], i) => ({ id: `CE-bin-${k}`, type: 'bin', binKind: k, x: 40 + i * 200, y: 40, w: 178, h: 92, text: '', color: c }));
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: user, contractors, stages: [{ id: 'S1', name: 'AC installation', color: '#3b82f6', order: 1, active: true, projectId: 'general' }],
    apartments: [{ id: 'G-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Levi', isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'S1', stageDates: {}, canvasX: 1200, canvasY: 400, createdAt: ago(9000), updatedAt: ago(100), contentUpdatedAt: ago(100), updatedBy: 'U', updatedByName: 'U' }],
    contractorAssignments: [{ id: 'T-G', contractorId: 'C-jo', apartmentId: 'G-1', taskDescription: 'Fit the unit', dueDate: ago(0).slice(0, 10), completed: false, priority: 'normal', createdAt: ago(500), updatedAt: ago(500) }],
    contractorPhotos: [{ id: 'P-G', assignmentId: 'T-G', apartmentId: 'G-1', contractorId: 'C-jo', dataUrl: '', filename: 'levi.jpg', fileType: 'image', mimeType: 'image/jpeg', uploadedAt: ago(120), storageUrl: `${location.origin}/__stub/img-g.png` }],
    canvasElements: [...bins, { id: 'CE-photos', type: 'widget', widget: 'recent-photos', x: 60, y: 260, w: 460, h: 320, text: '', color: '#fff', data: {} }],
  }));
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: user, contractors,
    apartments: [{ id: 'A1-5', buildingId: 'A1', floor: 2, apartmentNumber: '5', displayName: 'Cohen', isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, createdAt: ago(9000), updatedAt: ago(100), contentUpdatedAt: ago(100), updatedBy: 'U', updatedByName: 'U' }],
    contractorAssignments: [{ id: 'T-W', contractorId: 'C-jo', apartmentId: 'A1-5', taskDescription: 'Piping', dueDate: ago(0).slice(0, 10), completed: false, priority: 'normal', createdAt: ago(500), updatedAt: ago(500) }],
    contractorPhotos: [
      { id: 'P-W1', assignmentId: 'T-W', apartmentId: 'A1-5', contractorId: 'C-jo', dataUrl: '', filename: 'pipe.jpg', fileType: 'image', mimeType: 'image/jpeg', uploadedAt: ago(60), storageUrl: `${location.origin}/__stub/img-w1.png` },
      { id: 'P-W2', assignmentId: 'T-W', apartmentId: 'A1-5', contractorId: 'C-jo', dataUrl: '', filename: 'clip.webm', fileType: 'video', mimeType: 'video/webm', uploadedAt: ago(30), storageUrl: `${location.origin}/__stub/clip.webm` },
      { id: 'P-W3', assignmentId: 'T-W', apartmentId: 'A1-5', contractorId: 'C-jo', dataUrl: '', filename: 'site.jpg', fileType: 'image', mimeType: 'image/jpeg', uploadedAt: ago(180), driveFileId: 'DRV1', driveUrl: 'https://drive.google.com/file/d/DRV1/view' },
    ],
  }));
};
const stubs = async page => {
  await page.route(/\/__stub\/.*\.png|drive\.google\.com\/thumbnail/, r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route(/\/__stub\/clip\.webm/, r => r.fulfill({ status: 200, contentType: 'video/webm', body: Buffer.alloc(64) }));
  await page.route(/fonts\.g|open-meteo|tiktok|vercel\.app/, r => r.abort());
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ── 1. the board, with a mouse ──
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(seed);
  const page = await ctx.newPage(); await stubs(page);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${APP}/jobs`);
  await page.waitForSelector('[data-site-photos] [data-site-shot]', { timeout: 30000 });
  await page.waitForTimeout(600);
  console.log('— the grid —');
  const ids = await page.$$eval('[data-site-photos] [data-site-shot]', els => els.map(e => e.dataset.siteShot));
  ok(ids.length === 4, `four shots from two workspaces (${ids.join(', ')})`);
  ok(ids.join(',') === 'P-W2,P-W1,P-G,P-W3', 'newest first, whichever workspace');
  ok(await page.$eval('[data-site-shot="P-W2"]', e => e.dataset.shotKind === 'video' && !!e.querySelector('[data-shot-play]')), 'the film wears a play mark');
  ok((await page.$eval('[data-site-shot="P-W1"] [data-shot-ws]', e => e.textContent)).includes('Wolfson'), 'a Wolfson shot says Wolfson');
  ok((await page.$eval('[data-site-shot="P-W1"]', e => e.textContent)).includes('Cohen'), 'and names its unit');
  const title = await page.$eval('[data-node-id="CE-photos"]', e => e.textContent);
  ok(/LIVE FROM SITE · 4/.test(title), `title counts them (${title.match(/LIVE FROM SITE[^A-Z]*/)?.[0]?.trim()})`);
  ok(ids.every(id => id !== 'P-W3' ? true : true) && (await page.$('[data-site-shot="P-W3"] img')) !== null, 'a Drive picture draws its thumbnail');

  console.log('— a new picture lands in Wolfson —');
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('wolfson_app_data'));
    raw.contractorPhotos.push({ id: 'P-NEW', assignmentId: 'T-W', apartmentId: 'A1-5', contractorId: 'C-jo', dataUrl: '', filename: 'fresh.jpg', fileType: 'image', mimeType: 'image/jpeg', uploadedAt: new Date().toISOString(), storageUrl: `${location.origin}/__stub/img-new.png` });
    localStorage.setItem('wolfson_app_data', JSON.stringify(raw));
    window.__store.setState(s => ({ snapshotTick: s.snapshotTick + 1 }));
  });
  const t0 = Date.now();
  await page.waitForSelector('[data-site-shot="P-NEW"]', { timeout: 3000 }).catch(() => null);
  const first = await page.$eval('[data-site-photos] [data-site-shot]', e => e.dataset.siteShot);
  ok(first === 'P-NEW', `it is on the widget first, ${Date.now() - t0}ms after landing`);
  ok(await page.$eval('[data-site-shot="P-NEW"]', e => e.dataset.fresh === '1' && !!e.querySelector('[data-shot-new]')), 'and wears the new ring');

  console.log('— and one in the open workspace —');
  await page.evaluate(() => { window.__store.getState().addContractorPhoto({ assignmentId: 'T-G', apartmentId: 'G-1', contractorId: 'C-jo', dataUrl: '', filename: 'live.jpg', fileType: 'image', mimeType: 'image/jpeg', storageUrl: `${location.origin}/__stub/img-live.png` }); });
  await page.waitForTimeout(400);
  const firstName = await page.$eval('[data-site-photos] [data-site-shot]', e => e.textContent);
  ok(firstName.includes('Levi'), 'the Job Board upload is first the moment it exists');

  console.log('— tap a film —');
  const nodeBefore = await page.$eval('[data-node-id="CE-photos"]', e => e.getBoundingClientRect().left);
  const vb = await page.locator('[data-site-shot="P-W2"]').boundingBox();
  await page.mouse.click(vb.x + vb.width / 2, vb.y + vb.height / 2);
  await page.waitForSelector('[data-viewer-video]', { timeout: 5000 }).catch(() => null);
  ok(await page.$eval('[data-viewer-video]', v => v.hasAttribute('controls')).catch(() => false), 'the viewer plays it with the normal controls (play, sound)');
  ok((await page.$('[data-viewer-full]')) !== null, 'with a full-screen button');
  ok((await page.$('[data-viewer-close]')) !== null, 'and a close');
  ok((await page.$$('.drawer-panel')).length === 0, 'no job window opened by the tap');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok((await page.$('[data-viewer-video]')) === null, 'Escape closes the viewer');
  ok((await page.$('[data-node-id="CE-photos"]')) !== null && Math.abs(await page.$eval('[data-node-id="CE-photos"]', e => e.getBoundingClientRect().left) - nodeBefore) < 1, 'the widget is still there and has not moved');

  console.log('— tap a picture —');
  const pb = await page.locator('[data-site-shot="P-W1"]').boundingBox();
  await page.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.waitForSelector('[data-viewer-image]', { timeout: 5000 }).catch(() => null);
  ok(await page.$eval('[data-viewer-image]', i => i.src.includes('img-w1')).catch(() => false), 'the picture opens big');
  ok((await page.$('[data-viewer-next]')) !== null, 'with arrows to the next one');
  await page.click('[data-viewer-close]'); await page.waitForTimeout(200);
  ok((await page.$('[data-viewer-image]')) === null, 'the X closes it');
  ok(errs.length === 0, `no page errors (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

// ── 2. the wall, with a finger ──
{
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.addInitScript(seed);
  const page = await ctx.newPage(); await stubs(page);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${APP}/tv`);
  await page.waitForSelector('[data-site-photos] [data-site-shot]', { timeout: 30000 });
  await page.waitForTimeout(800);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  console.log('— the wall —');
  ok((await page.$$('[data-site-photos] [data-site-shot]')).length === 4, 'the wall shows the same four');
  const tb = await page.locator('[data-site-shot="P-W2"]').boundingBox();
  const tap = async (x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  await tap(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.waitForSelector('[data-viewer-video]', { timeout: 5000 }).catch(() => null);
  ok(await page.$eval('[data-viewer-video]', v => v.hasAttribute('controls')).catch(() => false), 'a finger tap opens the film with controls');
  const cb = await page.locator('[data-viewer-close]').boundingBox();
  await tap(cb.x + cb.width / 2, cb.y + cb.height / 2); await page.waitForTimeout(300);
  ok((await page.$('[data-viewer-video]')) === null, 'a tap on the X closes it');
  ok((await page.$('[data-tv-refresh]')) !== null, 'the wall bar is still there');
  ok(errs.length === 0, `no page errors on the wall (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
