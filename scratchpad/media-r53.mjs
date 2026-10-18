// The worker's pictures, 2026-10-18 (owner: "a minimum of one file, either a
// video or a picture" · "if you open the camera, it should have a video mode"
// · "it's uploading slow"):
//   A · by default ONE picture or video unlocks Close; a PDF does not count;
//   B · the three ways in — Take photo / Record video / Choose files — each a
//       finger-sized button opening an input that asks for exactly that;
//   C · Settings → Workers raises it to 3: three needed, or a picture and a
//       video;
//   D · (APP_KEYED, a server started WITH VITE_DRIVE_API_KEY) six picked
//       files go up three at a time with a preview each the moment they are
//       picked, the stage folder is looked up ONCE, the share is not waited
//       for, and Drive gets the original bytes. Timed against a stubbed slow
//       backend; APP_BASE (the same, on the previous build) gives the
//       before-number.
// All names are made up.
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://localhost:5177';
const APP_KEYED = process.env.APP_KEYED || '';
const APP_BASE = process.env.APP_BASE || '';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(new Date());
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pic = n => ({ name: `site-${n}.png`, mimeType: 'image/png', buffer: PNG });
const film = { name: 'site-film.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(4096, 1) };
const pdf = { name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') };
const big = n => ({ name: `big-${n}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.alloc(200_000 + n, 7) });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

function seed(driveLink) {
  return ([T, D]) => {
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
    if (localStorage.getItem('wolfson_app_data')) return;
    const admin = { id: 'U-t', name: 'Dana', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
    const stages = [
      { id: 'S1', name: 'Ready to start', color: '#64748b', order: 1, active: true, kind: 'marker' },
      { id: 'S2', name: 'Fans', color: '#0ea5e9', order: 2, active: true, kind: 'work' },
      { id: 'S3', name: 'Wall units', color: '#f59e0b', order: 3, active: true, kind: 'work' },
    ];
    const apt = (id, num, fam) => ({ id, buildingId: 'A1', floor: 4, apartmentNumber: num, displayName: fam, isUnnamed: false,
      isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'S2', stageDates: {}, bubbles: true,
      stageMarks: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
      ...(D ? { driveLink: D } : {}) });
    const task = (id, a) => ({ id, apartmentId: a, buildingId: 'A1', contractorId: 'C-jo', taskDescription: 'Install',
      dueDate: T, stageId: 'S2', stageIds: ['S2'], completedAt: null, createdAt: '2026-01-01', createdBy: 'U-t', createdByName: 'Dana' });
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      currentUser: admin, users: [admin], stages,
      contractors: [{ id: 'C-jo', name: 'Yaakov', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01', lang: 'en' }],
      contractorAssignments: [task('T-1', 'A1-16'), task('T-2', 'A1-17'), task('T-3', 'A1-18'), task('T-4', 'A1-19')],
      apartments: [apt('A1-16', '16', 'Alpha'), apt('A1-17', '17', 'Bravo'), apt('A1-18', '18', 'Charlie'), apt('A1-19', '19', 'Delta')],
    }));
  };
}
const FAM = { 'T-1': 'Alpha', 'T-2': 'Bravo', 'T-3': 'Charlie', 'T-4': 'Delta' };
const media = 'input[type="file"][accept*="video"][accept*=".zip"]';

async function openClose(page, id) {
  if (await page.locator('button:has-text("All")').count()) await page.locator('button:has-text("All")').first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.locator(`text=${FAM[id]}`).first().click();
  await page.waitForTimeout(700);
  await page.locator('[data-close-job]').first().click();
  await page.waitForTimeout(500);
  await page.locator('[data-close-finished-pick="yes"]').click();
  await page.locator('[data-close-more-pick="no"]').click();
  await page.waitForTimeout(250);
}
const count = p => p.locator('[data-close-count]').innerText().then(t => t.trim()).catch(() => '');
const closed = async (p, id) => !!(await p.evaluate(i => JSON.parse(localStorage.getItem('wolfson_app_data')).contractorAssignments.find(a => a.id === i)?.completedAt, id));

// ── A + B · the default, and the three ways in ──────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  await ctx.addInitScript(seed(''), [TODAY, '']);
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message); fails++; } });
  await page.goto(`${APP}/c/tok-jo`);
  await page.waitForTimeout(2500);
  await openClose(page, 'T-1');
  check(await page.locator('[data-close-photo-step]').getAttribute('data-step-need') === '1', 'A · by default a close step needs ONE file');
  check(/one picture or video/.test(await page.locator('[data-close-photo-step]').innerText()), 'A · and says so: "one picture or video"');
  check(await page.locator('[data-close-now]').isDisabled(), 'A · Close waits for it');
  await page.locator(media).setInputFiles([pdf]);
  await page.waitForTimeout(1500);
  check(await page.locator('[data-close-now]').isDisabled(), 'A · a PDF is not a picture or a video — Close still waits', await count(page));
  await page.locator(media).setInputFiles([film]);
  await page.waitForTimeout(1500);
  check(!(await page.locator('[data-close-now]').isDisabled()), 'A · one video unlocks Close', await count(page));
  check((await count(page)) === '✓ 1', 'A · the count reads ✓ 1', await count(page));

  // B · the three buttons
  const btns = [['data-add-photo-camera', 'image/*', 'environment', false], ['data-add-video-camera', 'video/*', 'environment', false], ['data-add-files', 'image/*,video/*', null, true]];
  for (const [hook, accept, capture, multiple] of btns) {
    const btn = page.locator(`[${hook}]`);
    const box = await btn.boundingBox().catch(() => null);
    check(!!box && box.height >= 44 && box.width >= 44, `B · [${hook}] is there and finger-sized`, box ? `${Math.round(box.width)}×${Math.round(box.height)}` : 'missing');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null), btn.click()]);
    const el = chooser ? await chooser.element() : null;
    const got = el ? await el.evaluate(i => ({ accept: i.getAttribute('accept'), capture: i.getAttribute('capture'), multiple: i.multiple })) : null;
    check(!!got && got.accept.startsWith(accept) && got.capture === capture && got.multiple === multiple,
      `B · [${hook}] opens an input asking for ${accept}${capture ? ' from the camera' : ''}`, JSON.stringify(got));
    if (chooser && hook === 'data-add-photo-camera') {
      await chooser.setFiles([pic(9)]);
      await page.waitForTimeout(1200);
      check((await count(page)) === '✓ 2', 'B · a picture taken by "Take photo" lands through the same upload', await count(page));
    } else if (chooser) await chooser.setFiles([]);
  }
  const labels = await page.locator('[data-add-photo-camera],[data-add-video-camera],[data-add-files]').allInnerTexts();
  check(labels.map(s => s.trim()).join('|') === 'Take photo|Record video|Choose files', 'B · in his words', labels.join('|'));
  await page.locator('[data-close-now]').click();
  await page.waitForTimeout(1500);
  check(await closed(page, 'T-1'), 'A · the task closes with one file');

  // C · the office raises it to 3 in Settings → Workers.
  await page.goto(`${APP}/app-settings`);
  await page.waitForTimeout(2000);
  await page.locator('button:has-text("Workers")').first().click().catch(() => {});
  await page.waitForTimeout(600);
  const ctl = page.locator('[data-close-min-files]');
  check(await ctl.count() === 1 && (await ctl.getAttribute('data-close-min-files')) === '1', 'C · Settings → Workers shows the number, 1 by default');
  check(await page.locator('[data-close-min-files-pick]').count() === 5, 'C · 1 to 5');
  await page.locator('[data-close-min-files-pick="3"]').click();
  await page.waitForTimeout(500);
  check(await page.evaluate(() => window.__store.getState().boardSettings.__tv?.closeMinFiles) === 3, 'C · pressing 3 stores closeMinFiles: 3');
  await page.goto(`${APP}/c/tok-jo`);
  await page.waitForTimeout(2500);
  await openClose(page, 'T-2');
  check(await page.locator('[data-close-photo-step]').getAttribute('data-step-need') === '3', 'C · now a step needs three');
  check(/3 pictures — or 1 picture and 1 video/.test(await page.locator('[data-close-photo-step]').innerText()), 'C · and says three, or a picture and a video');
  await page.locator(media).setInputFiles([pic(1), pic(2)]);
  await page.waitForTimeout(1600);
  check(await page.locator('[data-close-now]').isDisabled() && (await count(page)) === '2/3', 'C · two pictures are not enough', await count(page));
  await page.locator(media).setInputFiles([pic(3)]);
  await page.waitForTimeout(1200);
  check(!(await page.locator('[data-close-now]').isDisabled()) && (await count(page)) === '✓ 3', 'C · three are', await count(page));
  // A fresh page: a picture and a video.
  await page.goto(`${APP}/c/tok-jo`);
  await page.waitForTimeout(2500);
  await openClose(page, 'T-3');
  await page.locator(media).setInputFiles([pic(4)]);
  await page.waitForTimeout(1200);
  check(await page.locator('[data-close-now]').isDisabled(), 'C · one picture alone is not enough');
  await page.locator('[data-add-video-camera]').count();
  await page.locator('input[data-input="video-camera"]').setInputFiles([film]);
  await page.waitForTimeout(1200);
  check(!(await page.locator('[data-close-now]').isDisabled()) && (await count(page)) === '✓ 2', 'C · a picture and a video (from "Record video") are', await count(page));
  // Back to the default for anyone running after us.
  await page.evaluate(() => window.__store.getState().setTvSetting('closeMinFiles', undefined));
  await ctx.close();
}

// ── D · the upload, timed ───────────────────────────────────────────────────
async function timed(appUrl, label) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  await ctx.addInitScript(seed(''), [TODAY, 'https://drive.google.com/drive/folders/JOBFOLDER1']);
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message); fails++; } });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const stats = { folder: 0, session: 0, share: 0, put: 0, inFlight: 0, maxInFlight: 0, putBytes: [] };
  await page.route('**/api/**', async route => {
    const url = route.request().url();
    if (url.includes('/api/folder')) {
      stats.folder++; await sleep(400);
      const { name } = route.request().postDataJSON();
      return route.fulfill({ json: { folderId: 'F-' + name.replace(/\W/g, '') } });
    }
    if (url.includes('/api/drive-session')) {
      stats.session++; await sleep(300);
      return route.fulfill({ json: { uploadUrl: `${appUrl}/__upload/${stats.session}` } });
    }
    if (url.includes('/api/share')) { stats.share++; await sleep(300); return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ json: { files: [] } });
  });
  await page.route('**/__upload/**', async route => {
    stats.put++; stats.inFlight++; stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
    stats.putBytes.push(route.request().postDataBuffer()?.length ?? 0);
    await sleep(1500);
    stats.inFlight--;
    const n = route.request().url().split('/').pop();
    return route.fulfill({ json: { id: 'fid-' + n, webViewLink: `https://drive.google.com/file/d/fid-${n}/view` } });
  });
  await page.route('**/drive.google.com/**', r => r.abort());
  await page.goto(`${appUrl}/c/tok-jo`);
  await page.waitForTimeout(2500);
  await openClose(page, 'T-4');
  const files = [1, 2, 3, 4, 5, 6].map(big);
  const t0 = Date.now();
  await page.locator(media).setInputFiles(files);
  let tilesAt = -1;
  const deadline = t0 + 40000;
  let n = 0;
  while (Date.now() < deadline) {
    if (tilesAt < 0 && await page.locator('[data-upload-tile]').count() === 6) tilesAt = Date.now() - t0;
    n = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data') || '{}').contractorPhotos?.filter(p => p.assignmentId === 'T-4').length ?? 0)
      .catch(() => 0);
    if (n >= 6) break;
    await page.waitForTimeout(100);
  }
  const total = Date.now() - t0;
  console.log(`  [${label}] 6 files: all stored in ${(total / 1000).toFixed(1)}s · ${stats.folder} folder lookups · ${stats.session} sessions · ${stats.share} shares · ${stats.maxInFlight} PUTs at once${tilesAt >= 0 ? ` · previews on screen at ${tilesAt}ms` : ''}`);
  const photos = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')).contractorPhotos.filter(p => p.assignmentId === 'T-4'));
  await ctx.close();
  return { total, stats, tilesAt, n, photos };
}

if (APP_KEYED) {
  const now = await timed(APP_KEYED, 'this build');
  check(now.n === 6, 'D · all six land', String(now.n));
  check(now.tilesAt >= 0 && now.tilesAt < 600, 'D · a preview of every picked file is on screen at once', `${now.tilesAt}ms`);
  check(now.stats.maxInFlight === 3, 'D · three go up side by side, never more', String(now.stats.maxInFlight));
  check(now.stats.folder === 2, 'D · the folders are looked up once for the batch (Photos + the stage)', String(now.stats.folder));
  check(JSON.stringify(now.stats.putBytes.sort((a, b) => a - b)) === JSON.stringify([1, 2, 3, 4, 5, 6].map(n => 200_000 + n)),
    'D · Drive gets every file byte for byte (the original — EXIF rule)', JSON.stringify(now.stats.putBytes));
  check(now.photos.every(p => p.stageId === 'S2' && p.fileType === 'image' && p.driveFileId), 'D · each is tagged to the step it was taken on');
  check(now.total < 7000, 'D · six files in under 7s against a 1.5s-per-file upload', `${now.total}ms`);
  if (APP_BASE) {
    const before = await timed(APP_BASE, 'previous build');
    console.log(`  → ${(before.total / now.total).toFixed(1)}× faster (${(before.total / 1000).toFixed(1)}s → ${(now.total / 1000).toFixed(1)}s)`);
    check(now.total * 2 < before.total, 'D · at least twice as fast as the previous build');
  }
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
