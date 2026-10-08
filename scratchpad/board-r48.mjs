// Round 48 (board): the four asks from the owner's 2026-10-08 recording.
//  1. "Live from site" shows EVERY workspace's worker photos on the Job Board —
//     including the production case: a grid whose stored `jobIds` names every
//     Job Board job (the pencil's "Pick all"), which hid every Wolfson photo
//     and titled the widget "From site · N jobs". Every look and every retired
//     alias; a Wolfson snapshot that has no `contractorPhotos` key at all.
//  2. The board's zoom speaks in a new unit: what read 75% reads 100%.
//  3. Settings → Stages saves itself — no Save buttons, a "Saved" tick.
//  4. An import row opens its jobs as the board's own tiles, culled, searchable,
//     each opening the real job window.
// Dev server: APP=http://localhost:5184 (default 5173).
import { chromium } from 'playwright';
const APP = process.env.APP || 'http://localhost:5173';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** One seed, parameterised. Runs as an init script — data comes in as the ARG. */
const seed = (opt) => {
  const now = Date.now(); const ago = m => new Date(now - m * 60000).toISOString();
  localStorage.setItem('active_project', localStorage.getItem('active_project') || 'general');
  localStorage.setItem('general_app_version', '3'); localStorage.setItem('wolfson_app_version', '3'); localStorage.setItem('netiv_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (opt.defaultZoom !== undefined && !localStorage.getItem('__seeded')) {
    if (opt.defaultZoom === null) localStorage.removeItem('board_default_zoom_general');
    else localStorage.setItem('board_default_zoom_general', opt.defaultZoom);
  }
  if (opt.view && !localStorage.getItem('__seeded')) localStorage.setItem('board_view_general_', JSON.stringify(opt.view));  // the main board's id is '' (not 'main')
  if (localStorage.getItem('__seeded')) return;
  localStorage.setItem('__seeded', '1');
  const user = { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const contractors = [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }];
  const bins = [['done', '#16a34a'], ['ready', '#0ea5e9'], ['archive', '#64748b'], ['trash', '#dc2626']].map(([k, c], i) => ({ id: `CE-bin-${k}`, type: 'bin', binKind: k, x: 40 + i * 200, y: 40, w: 178, h: 92, text: '', color: c }));
  const job = (id, name, extra = {}) => ({ id, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: name, isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'S1', stageDates: {}, createdAt: ago(9000), updatedAt: ago(100), contentUpdatedAt: ago(9000), updatedBy: 'U', updatedByName: 'U', ...extra });
  const jobs = [job('G-1', 'Hand made', { canvasX: 1200, canvasY: 400, contentUpdatedAt: ago(100) }), job('G-2', 'Second hand made', { canvasX: 1500, canvasY: 400 })];
  // The import: N jobs in one batch, spread over the groups like the real one.
  const groups = [undefined, 'done', 'trash', 'archive', 'ready'];
  for (let i = 0; i < (opt.importN || 0); i++) {
    const name = i === 777 ? 'Zebulun Needle' : `Family ${String(i).padStart(4, '0')}`;
    const created = ago(80000);
    jobs.push(job(`G-imp-${opt.stamp}-${i}-x${i % 7}`, name, {
      boardBin: groups[i % groups.length], createdAt: created, contentUpdatedAt: i % 50 === 0 ? ago(20) : created,
    }));
  }
  const widgets = (opt.widgets || []).map((w, i) => ({ id: w.id, type: 'widget', widget: w.widget, x: 60 + (i % 2) * 520, y: 300 + Math.floor(i / 2) * 360, w: 480, h: 320, text: '', color: '#fff', data: w.data || {} }));
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: user, contractors,
    stages: [
      { id: 'S1', name: 'AC installation', color: '#3b82f6', order: 1, active: true, projectId: 'general' },
      { id: 'S2', name: 'Ready to start', color: '#0ea5e9', order: 2, active: true, projectId: 'general' },
    ],
    apartments: jobs,
    contractorAssignments: [], contractorPhotos: [],
    canvasElements: [...bins, ...widgets],
  }));
  const wolfson = {
    currentUser: user, contractors,
    apartments: [{ id: 'A1-5', buildingId: 'A1', floor: 2, apartmentNumber: '5', displayName: 'Cohen', isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, createdAt: ago(9000), updatedAt: ago(100), contentUpdatedAt: ago(100), updatedBy: 'U', updatedByName: 'U' }],
    contractorAssignments: [{ id: 'T-W', contractorId: 'C-jo', apartmentId: 'A1-5', taskDescription: 'Piping', dueDate: ago(0).slice(0, 10), completed: false, priority: 'normal', createdAt: ago(500), updatedAt: ago(500) }],
  };
  if (opt.wolfsonPhotos) wolfson.contractorPhotos = [
    { id: 'P-W1', assignmentId: 'T-W', apartmentId: 'A1-5', contractorId: 'C-jo', dataUrl: '', filename: 'pipe.jpg', fileType: 'image', mimeType: 'image/jpeg', uploadedAt: ago(60), storageUrl: `${location.origin}/__stub/img-w1.png` },
    { id: 'P-W2', assignmentId: 'T-W', apartmentId: 'A1-5', contractorId: 'C-jo', dataUrl: '', filename: 'clip.webm', fileType: 'video', mimeType: 'video/webm', uploadedAt: ago(30), storageUrl: `${location.origin}/__stub/clip.webm` },
    { id: 'P-W3', assignmentId: 'T-W', apartmentId: 'A1-5', contractorId: 'C-jo', dataUrl: '', filename: 'site.jpg', fileType: 'image', mimeType: 'image/jpeg', uploadedAt: ago(180), driveFileId: 'DRV1', driveUrl: 'https://drive.google.com/file/d/DRV1/view' },
    // A film that lives ONLY on Drive (keeps Drive's thumbnail), and a film kept as a local data URL (draws its own frame).
    { id: 'P-W4', assignmentId: 'T-W', apartmentId: 'A1-5', contractorId: 'C-jo', dataUrl: '', filename: 'walk.mp4', fileType: 'video', mimeType: 'video/mp4', uploadedAt: ago(240), driveFileId: 'DRV2', driveUrl: 'https://drive.google.com/file/d/DRV2/view' },
    { id: 'P-W5', assignmentId: 'T-W', apartmentId: 'A1-5', contractorId: 'C-jo', dataUrl: 'data:video/webm;base64,GkXfow==', filename: 'local.webm', fileType: 'video', mimeType: 'video/webm', uploadedAt: ago(300) },
  ];
  localStorage.setItem('wolfson_app_data', JSON.stringify(wolfson));
};
const stubs = async page => {
  await page.route(/\/__stub\/.*\.png|drive\.google\.com\/thumbnail/, r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route(/\/__stub\/clip\.webm/, r => r.fulfill({ status: 200, contentType: 'video/webm', body: Buffer.alloc(64) }));
  await page.route(/fonts\.g|open-meteo|tiktok|vercel\.app/, r => r.abort());
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const open = async (opt, path, viewport = { width: 1500, height: 900 }) => {
  const ctx = await b.newContext({ viewport });
  await ctx.addInitScript(seed, opt);
  const page = await ctx.newPage(); await stubs(page);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${APP}${path}`);
  return { ctx, page, errs };
};
const shotsIn = (page, id) => page.$$eval(`[data-node-id="${id}"] [data-site-shot]`, els => els.map(e => e.dataset.siteShot));

// ── 1a. Live from site, the production record ─────────────────────────────
{
  console.log('— 1a. Live from site on the Job Board, photos only in Wolfson —');
  // The grid as production holds it: every Job Board job frozen into jobIds.
  const allJobs = ['G-1', 'G-2'];
  const { ctx, page, errs } = await open({
    wolfsonPhotos: true, defaultZoom: null,
    widgets: [
      { id: 'CE-grid', widget: 'recent-photos', data: { jobIds: allJobs, limit: '10' } },
      { id: 'CE-one', widget: 'recent-photos', data: { look: 'one' } },
      { id: 'CE-wall', widget: 'recent-photos', data: { look: 'wall' } },
      { id: 'CE-old1', widget: 'tv-photo', data: {} },
      { id: 'CE-old2', widget: 'tv-photo-wall', data: {} },
    ],
  }, '/jobs');
  await page.waitForSelector('[data-node-id="CE-grid"]', { timeout: 30000 });
  await page.waitForTimeout(900);
  const grid = await shotsIn(page, 'CE-grid');
  ok(grid.length === 5, `the grid shows all five Wolfson shots despite a stored "only these jobs" list (${grid.join(',')})`);
  ok(grid.join(',') === 'P-W2,P-W1,P-W3,P-W4,P-W5', 'newest first');
  const title = await page.$eval('[data-node-id="CE-grid"]', e => e.textContent || '');
  ok(/LIVE FROM SITE · 5/i.test(title) && !/JOBS/i.test(title.split('·').slice(0, 2).join('·')), `the title counts photos, not jobs (${(title.match(/LIVE FROM SITE[^a-z]*/i) || [''])[0].trim()})`);
  ok((await page.$('[data-node-id="CE-grid"] [data-site-photos-empty]')) === null, 'no "No photos yet"');
  for (const id of ['CE-one', 'CE-wall', 'CE-old1', 'CE-old2']) {
    const got = await shotsIn(page, id);
    ok(got.length >= 1 && got.every(x => ['P-W1', 'P-W2', 'P-W3', 'P-W4', 'P-W5'].includes(x)), `${id} shows the Wolfson shots (${got.join(',')})`);
  }
  // A film is never an <img> of the video file (the broken square): a playable
  // one draws its own first frame, a Drive-only one Drive's thumbnail.
  const tileOf = (node, shot) => page.$eval(`[data-node-id="${node}"] [data-site-shot="${shot}"]`, e => ({
    video: e.querySelector('video')?.getAttribute('src') || '', img: e.querySelector('img')?.getAttribute('src') || '',
    play: !!e.querySelector('[data-shot-play]') })).catch(() => null);
  for (const node of ['CE-grid', 'CE-wall', 'CE-one']) {
    const t = await tileOf(node, 'P-W2');
    ok(t && t.video.includes('clip.webm') && !t.img, `${node}: a Storage film draws its own first frame, no <img> of the video (${JSON.stringify(t)})`);
  }
  const t5 = await tileOf('CE-grid', 'P-W5');
  ok(t5 && t5.video.startsWith('data:video') && !t5.img, 'a data-URL film draws its own frame too');
  const t4 = await tileOf('CE-grid', 'P-W4');
  ok(t4 && /thumbnail\?.*DRV2|DRV2.*thumbnail/.test(t4.img) && !t4.video && t4.play, `a Drive-only film keeps Drive's thumbnail and its play mark (${t4 && t4.img.slice(0, 60)})`);
  const t1 = await tileOf('CE-grid', 'P-W1');
  ok(t1 && t1.img.includes('img-w1') && !t1.video, 'a picture is still a picture');
  ok((await shotsIn(page, 'CE-one'))[0] === 'P-W2', 'the rotating look starts on the newest');
  const keys = await page.evaluate(async () => (await import('/src/data/widgetFields.ts')).WIDGET_FIELDS['recent-photos'].map(f => f.key));
  ok(!keys.includes('jobIds'), `the pencil no longer offers "Only these jobs" (${keys.join(',')})`);
  ok(errs.length === 0, `no page errors (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

// ── 1b. A Wolfson snapshot with no photos key, then the foreign sync lands ──
{
  console.log('— 1b. A snapshot that predates the photos field —');
  const { ctx, page, errs } = await open({ wolfsonPhotos: false, defaultZoom: null,
    widgets: [{ id: 'CE-grid', widget: 'recent-photos', data: {} }] }, '/jobs');
  await page.waitForSelector('[data-node-id="CE-grid"]', { timeout: 30000 });
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => !('contractorPhotos' in JSON.parse(localStorage.getItem('wolfson_app_data')))), 'the Wolfson snapshot carries no contractorPhotos key');
  ok((await page.$('[data-node-id="CE-grid"] [data-site-photos-empty]')) !== null, 'the widget says so honestly, no crash');
  // What attachForeign's listener does on its first answer: write the
  // collection into the snapshot and bump the tick.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('wolfson_app_data'));
    raw.contractorPhotos = [{ id: 'P-LATE', assignmentId: 'T-W', apartmentId: 'A1-5', contractorId: 'C-jo', dataUrl: '', filename: 'late.jpg', fileType: 'image', mimeType: 'image/jpeg', uploadedAt: new Date().toISOString(), storageUrl: `${location.origin}/__stub/img-late.png` }];
    localStorage.setItem('wolfson_app_data', JSON.stringify(raw));
    window.__store.setState(s => ({ snapshotTick: s.snapshotTick + 1 }));
  });
  await page.waitForSelector('[data-node-id="CE-grid"] [data-site-shot="P-LATE"]', { timeout: 3000 }).catch(() => null);
  ok((await shotsIn(page, 'CE-grid'))[0] === 'P-LATE', 'the moment the sync writes them, they show — newest first, with the ring');
  ok(errs.length === 0, `no page errors (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

// ── 2. The zoom unit ──────────────────────────────────────────────────────
const worldScale = page => page.evaluate(() => {
  const w = document.querySelector('[data-board-world]');
  return w ? Math.round((w.getBoundingClientRect().width / w.offsetWidth) * 10000) / 10000 : -1;
});
const readout = page => page.$eval('input[title="Type a zoom level"]', i => i.value);
{
  console.log('— 2. "100%" is what used to be 75% —');
  const { ctx, page, errs } = await open({ defaultZoom: null, widgets: [] }, '/jobs');
  await page.waitForSelector('[data-board-world]', { timeout: 30000 });
  await page.waitForTimeout(900);
  ok(await readout(page) === '100', `opens reading 100% (${await readout(page)})`);
  ok(Math.abs(await worldScale(page) - 0.75) < 0.002, `…drawn at what used to be 75% (scale ${await worldScale(page)})`);
  await page.click('button[title="Zoom in"]'); await page.waitForTimeout(400);
  ok(await readout(page) === '125', `+ steps to 125% (${await readout(page)})`);
  ok(Math.abs(await worldScale(page) - 0.9375) < 0.002, `…a real 0.9375 (${await worldScale(page)})`);
  await page.click('button[title="Zoom out"]'); await page.click('button[title="Zoom out"]'); await page.waitForTimeout(400);
  ok(await readout(page) === '75', `− − steps to 75% (${await readout(page)})`);
  await page.fill('input[title="Type a zoom level"]', '150'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ok(await readout(page) === '150' && Math.abs(await worldScale(page) - 1.125) < 0.002, `typing 150 lands on 150% (real ${await worldScale(page)})`);
  await page.locator('button', { hasText: /^100%$/ }).first().click(); await page.waitForTimeout(400);
  ok(await readout(page) === '100' && Math.abs(await worldScale(page) - 0.75) < 0.002, `the 100% button comes home to the new 100% (real ${await worldScale(page)})`);
  // The typed default zoom, in displayed numbers.
  await page.evaluate(() => [...document.querySelectorAll('button')].find(x => x.title === 'Board settings')?.click());
  await page.waitForTimeout(400);
  const field = page.locator('[data-default-zoom]');
  ok(await field.inputValue() === '100', `the default field reads 100 (${await field.inputValue()})`);
  await field.fill('125'); await field.blur(); await page.waitForTimeout(400);
  ok(await page.evaluate(() => localStorage.getItem('board_default_zoom_general')) === '1.25', 'typing 125 stores the displayed 1.25');
  ok(await readout(page) === '125' && Math.abs(await worldScale(page) - 0.9375) < 0.002, `…and the board follows to 125% (real ${await worldScale(page)})`);
  ok(errs.length === 0, `no page errors (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}
{
  const { ctx, page } = await open({ defaultZoom: '1', widgets: [] }, '/jobs');
  await page.waitForSelector('[data-board-world]', { timeout: 30000 }); await page.waitForTimeout(900);
  ok(await readout(page) === '100' && Math.abs(await worldScale(page) - 0.75) < 0.002, `a stored default of "1" reads as 100% — the new 100% (real ${await worldScale(page)})`);
  await ctx.close();
}
{
  const { ctx, page } = await open({ defaultZoom: null, view: { x: 0, y: 100, z: 0.5025 }, widgets: [] }, '/jobs');
  await page.waitForSelector('[data-board-world]', { timeout: 30000 }); await page.waitForTimeout(900);
  ok(await readout(page) === '67' && Math.abs(await worldScale(page) - 0.5025) < 0.002, `view memory keeps the REAL zoom it saved (reads ${await readout(page)}%, real ${await worldScale(page)})`);
  await ctx.close();
}

// ── 3. Stages save themselves ─────────────────────────────────────────────
{
  console.log('— 3. Settings → Stages, no Save buttons —');
  const { ctx, page, errs } = await open({ defaultZoom: null, widgets: [] }, '/settings');
  await page.waitForSelector('[data-stage-name="S1"]', { timeout: 30000 });
  ok((await page.$$('[data-stage-save]')).length === 0, 'no per-row Save buttons');
  const stage = () => page.evaluate(() => window.__store.getState().stages.find(s => s.id === 'S1'));
  await page.fill('[data-stage-name="S1"]', 'AC installed');
  ok((await stage()).name === 'AC installation', 'typing alone writes nothing');
  await page.click('h3'); await page.waitForTimeout(450);
  ok((await stage()).name === 'AC installed', 'blur saves the English name');
  ok(await page.$eval('[data-stage-saved="S1"]', e => getComputedStyle(e).opacity === '1'), 'a "Saved" tick answers');
  await page.fill('[data-stage-name="S1"] ~ [data-stage-he]', 'התקנת מזגן');
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  ok((await stage()).nameHe === 'התקנת מזגן', 'Enter saves the Hebrew name (Enter blurs)');
  await page.fill('[data-stage-name="S1"] ~ [data-stage-ru]', 'Монтаж');
  await page.click('h3'); await page.waitForTimeout(150);
  ok((await stage()).nameRu === 'Монтаж', 'blur saves the Russian name');
  await page.fill('[data-stage-name="S1"]', '   '); await page.click('h3'); await page.waitForTimeout(150);
  ok((await stage()).name === 'AC installed' && await page.inputValue('[data-stage-name="S1"]') === 'AC installed', 'a blanked English name is refused, not saved');
  await page.click('[data-stage-kind="S1"]'); await page.waitForTimeout(150);
  ok((await stage()).kind === 'marker', 'the work/marker toggle saves on the press');
  await page.click('[data-stage-kind="S1"]'); await page.waitForTimeout(150);
  ok((await stage()).kind === 'work', '…and back');
  await page.click('[data-stage-active="S2"]'); await page.waitForTimeout(150);
  ok((await page.evaluate(() => window.__store.getState().stages.find(s => s.id === 'S2'))).active === false, 'Active/Hidden saves on the press (a stage holding no jobs)');
  // Colour: open the swatch, pick a preset.
  const before = (await stage()).color;
  await page.locator('[data-stage-name="S1"]').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]').locator('button.w-8.h-8').click();
  await page.waitForTimeout(200);
  const swatch = page.locator('[data-stage-name="S1"]').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]').locator('button[title^="#"]').nth(3);
  const want = (await swatch.getAttribute('title')).toLowerCase();
  await swatch.click(); await page.waitForTimeout(500);
  const got = (await stage()).color.toLowerCase();
  ok(got === want && got !== before.toLowerCase(), `a colour saves itself a beat after the pick (${before} → ${got})`);
  ok(errs.length === 0, `no page errors (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

// ── 4. An import opens as tiles ───────────────────────────────────────────
{
  console.log('— 4. Import rows open the batch —');
  const stamp = String(Date.parse('2026-08-19T09:30:00Z'));
  const N = 1100;
  const { ctx, page, errs } = await open({ stamp, importN: N, defaultZoom: null, widgets: [] }, '/settings');
  await page.waitForSelector(`[data-import-batch="${stamp}"]`, { timeout: 30000 });
  const t0 = Date.now();
  await page.click(`[data-import-batch="${stamp}"]`);
  await page.waitForSelector('[data-import-window] [data-node-id]', { timeout: 10000 });
  const opened = Date.now() - t0;
  ok(opened < 2500, `the window opens in ${opened}ms`);
  ok(await page.evaluate(() => document.querySelector('[data-import-window]')?.parentElement === document.body), 'portalled to body');
  const count = await page.$eval('[data-import-count]', e => e.textContent);
  ok(count.includes(`${N} jobs`) && count.includes('22 edited since'), `the count says what is in it (${count.split('·').slice(0, 2).join('·').trim()})`);
  const mounted = await page.$$eval('[data-import-window] [data-node-id]', els => els.length);
  ok(mounted > 4 && mounted < 120, `only the rows on screen are mounted (${mounted} of ${N})`);
  ok(await page.$$eval('[data-import-window] [data-node-id]', els => els.every(e => e.style.width === '215px')), 'they are the board\'s own tiles (215×132)');
  ok((await page.$$('[data-import-window] [data-resize]')).filter(Boolean).length === 0
    || await page.$$eval('[data-import-window] [data-resize]', els => els.every(e => getComputedStyle(e).display === 'none')), 'the resize corner is not offered in a grid');
  ok(await page.$eval('[data-import-window] [data-import-tile-group]', e => e.textContent.trim().length > 0), 'each tile says which group it sits in');
  // Scroll to the bottom: the last tiles mount, the first ones leave.
  await page.$eval('[data-import-window] .overflow-y-auto', e => { e.scrollTop = e.scrollHeight; });
  await page.waitForTimeout(300);
  ok(await page.$('[data-import-window] [data-node-id="G-imp-' + stamp + '-1099-x' + (1099 % 7) + '"]') !== null, 'scrolled to the end, the last job is there');
  ok(await page.$('[data-import-window] [data-node-id="G-imp-' + stamp + '-0-x0"]') === null, 'and the first is no longer mounted');
  // Search.
  await page.fill('[data-import-search]', 'needle');
  await page.waitForTimeout(500);
  const c2 = await page.$eval('[data-import-count]', e => e.textContent);
  ok(c2.includes(`1 of ${N} jobs`), `search narrows (${c2.split('·')[0].trim()})`);
  const hit = `G-imp-${stamp}-777-x${777 % 7}`;
  ok((await page.$$eval('[data-import-window] [data-node-id]', els => els.map(e => e.dataset.nodeId))).join() === hit, 'to the one job');
  // A click picks, a second opens the real job window.
  const tb = await page.locator(`[data-import-window] [data-node-id="${hit}"]`).boundingBox();
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2 + 10);
  await page.waitForTimeout(250);
  ok((await page.$$('.drawer-panel')).length === 0, 'one click picks the tile (the board\'s gesture)');
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2 + 10);
  await page.waitForSelector('.drawer-panel', { timeout: 4000 }).catch(() => null);
  ok(await page.$eval('.drawer-panel', e => e.textContent.includes('Zebulun Needle')).catch(() => false), 'the second opens the real job window on that job');
  ok(await page.evaluate(() => {
    const d = document.querySelector('.drawer-panel'); const w = document.querySelector('[data-import-window]');
    return Number(getComputedStyle(d).zIndex) > Number(getComputedStyle(w).zIndex);
  }), 'the job window sits over the import window');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  ok((await page.$$('.drawer-panel')).length === 0 && (await page.$('[data-import-window]')) !== null, 'Escape closes the job window and leaves the batch open');
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok(await page.inputValue('[data-import-search]').catch(() => 'x') === '', 'the next Escape clears the search first');
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok((await page.$('[data-import-window]')) === null, 'and the one after closes the window');
  // Double-click opens too.
  await page.click(`[data-import-batch="${stamp}"]`);
  await page.waitForSelector('[data-import-window] [data-node-id]', { timeout: 10000 });
  const first = page.locator('[data-import-window] [data-node-id]').first();
  const fb = await first.boundingBox();
  await page.mouse.dblclick(fb.x + fb.width / 2, fb.y + fb.height / 2 + 10);
  await page.waitForSelector('.drawer-panel', { timeout: 4000 }).catch(() => null);
  ok((await page.$$('.drawer-panel')).length === 1, 'a double-click opens it as on the board');
  ok(errs.length === 0, `no page errors (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
