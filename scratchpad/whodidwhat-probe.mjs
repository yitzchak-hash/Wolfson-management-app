// "Who did what": finished work as sentences, newest first, across every
// workspace — standing on the Job Board, a worker's closed stage reports in
// the Wolfson SNAPSHOT read "Ari finished Drilling in 27, 26, 25, 28 · A2",
// each apartment a link that travels there and opens it, the pictures under
// the line opening the viewer. Plus a live close in the open workspace, a
// snapshot arrival joining its sentence, the worker filter, the shelf's
// preview and the wall. Dev server: APP (default http://localhost:5185).
import { chromium } from 'playwright';
const APP = process.env.APP || 'http://localhost:5185';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const seed = () => {
  const now = Date.now(); const ago = m => new Date(now - m * 60000).toISOString();
  localStorage.setItem('active_project', localStorage.getItem('active_project') || 'general');
  localStorage.setItem('general_app_version', '3'); localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01'); localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const user = { id: 'U-t', name: 'Office', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const contractors = [
    { id: 'C-ari', name: 'Ari', category: 'ac', token: 'tok-ari', active: true, createdAt: '2026-01-01' },
    { id: 'C-dov', name: 'Dov', category: 'drywall', token: 'tok-dov', active: true, createdAt: '2026-01-01' },
  ];
  const stages = [
    { id: 'S-drill', name: 'Drilling', nameHe: 'קידוחים', color: '#0891b2', order: 2, active: true },
    { id: 'S-dry', name: 'Drywall', color: '#a855f7', order: 3, active: true },
    { id: 'S-gen', name: 'AC installation', color: '#3b82f6', order: 1, active: true, projectId: 'general' },
  ];
  const bins = [['done', '#16a34a'], ['ready', '#0ea5e9'], ['archive', '#64748b'], ['trash', '#dc2626']].map(([k, c], i) => ({ id: `CE-bin-${k}`, type: 'bin', binKind: k, x: 1500 + i * 200, y: 1400, w: 178, h: 92, text: '', color: c }));
  const job = (id, name, extra = {}) => ({ id, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: name, isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, canvasX: 1300, canvasY: 300, createdAt: ago(9000), updatedAt: ago(100), contentUpdatedAt: ago(100), updatedBy: 'U', updatedByName: 'U', ...extra });
  const task = (id, apt, who, desc, closed, extra = {}) => ({ id, apartmentId: apt, buildingId: 'G', contractorId: who, taskDescription: desc, dueDate: null, stageId: null, completedAt: closed, createdAt: ago(900), createdBy: 'U-t', createdByName: 'Office', ...extra });
  localStorage.setItem('general_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors, stages,
    apartments: [job('G-1', 'Rooftop job'), job('G-2', 'Filed-away job', { boardBin: 'done', binnedAt: ago(10) })],
    contractorAssignments: [
      task('T-G1', 'G-1', 'C-dov', 'Gas top-up and leak test', ago(30)),
      task('T-G2', 'G-2', 'C-dov', 'Final clean', ago(35)),
      task('T-G3', 'G-1', 'C-ari', 'Balance the system', null),
    ],
    contractorPhotos: [
      { id: 'P-G', assignmentId: 'T-G1', apartmentId: 'G-1', contractorId: 'C-dov', dataUrl: '', filename: 'gas.jpg', fileType: 'image', mimeType: 'image/jpeg', uploadedAt: ago(32), storageUrl: `${location.origin}/__stub/img-g.png` },
    ],
    canvasElements: [...bins, { id: 'CE-wdw', type: 'widget', widget: 'who-did-what', x: 60, y: 180, w: 620, h: 560, text: '', color: '#ffffff', data: {} }],
  }));
  const unit = (b, n) => ({ id: `${b}-${n}`, buildingId: b, floor: 8, apartmentNumber: n, displayName: '', isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'S-drill', stageDates: {}, createdAt: ago(9000), updatedAt: ago(100), updatedBy: 'U', updatedByName: 'U' });
  const report = (id, apt, who, stageId, closed) => ({ id, apartmentId: apt, buildingId: apt.split('-')[0], contractorId: who, taskDescription: 'working here today', dueDate: null, stageId, stageIds: [stageId], stagesWorked: [stageId], stageReport: true, completedAt: closed, createdAt: ago(600), createdBy: '', createdByName: '' });
  const pic = (id, task, apt, who, at, kind = 'image') => ({ id, assignmentId: task, apartmentId: apt, contractorId: who, dataUrl: '', filename: kind === 'video' ? `${id}.webm` : `${id}.jpg`, fileType: kind, mimeType: kind === 'video' ? 'video/webm' : 'image/jpeg', uploadedAt: at, storageUrl: `${location.origin}/__stub/${id}.${kind === 'video' ? 'webm' : 'png'}` });
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors, stages,
    apartments: [unit('A2', '25'), unit('A2', '26'), unit('A2', '27'), unit('A2', '28'), unit('A3', '9')],
    contractorAssignments: [
      report('T-W27', 'A2-27', 'C-ari', 'S-drill', ago(50)),
      report('T-W26', 'A2-26', 'C-ari', 'S-drill', ago(44)),
      report('T-W25', 'A2-25', 'C-ari', 'S-drill', ago(41)),
      report('T-W28', 'A2-28', 'C-ari', 'S-drill', ago(38)),
      report('T-D9', 'A3-9', 'C-dov', 'S-dry', ago(1500)),
      report('T-D25', 'A2-25', 'C-dov', 'S-dry', ago(1490)),
    ],
    contractorPhotos: [
      pic('P-27a', 'T-W27', 'A2-27', 'C-ari', ago(52)),
      pic('P-27v', 'T-W27', 'A2-27', 'C-ari', ago(51), 'video'),
      pic('P-26a', 'T-W26', 'A2-26', 'C-ari', ago(45)),
      pic('P-28a', 'T-W28', 'A2-28', 'C-ari', ago(39)),
      pic('P-9a', 'T-D9', 'A3-9', 'C-dov', ago(1501)),
    ],
  }));
};
const stubs = async page => {
  await page.route(/\/__stub\/.*\.png|drive\.google\.com\/thumbnail/, r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route(/\/__stub\/.*\.webm/, r => r.fulfill({ status: 200, contentType: 'video/webm', body: Buffer.alloc(64) }));
  await page.route(/fonts\.g|open-meteo|tiktok|vercel\.app/, r => r.abort());
};
const lineTexts = page => page.$$eval('[data-wdw-line]', els => els.map(e => ({ key: e.dataset.wdwLine, kind: e.dataset.wdwKind, ws: e.dataset.wdwLineWs, text: e.querySelector('[data-wdw-sentence]').textContent.replace(/\s+/g, ' ').trim() })));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ── 1. the board, standing on the Job Board ──
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(seed);
  const page = await ctx.newPage(); await stubs(page);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${APP}/jobs`);
  await page.waitForSelector('[data-who-did-what] [data-wdw-line]', { timeout: 40000 });
  await page.waitForTimeout(500);
  console.log('— the sentences —');
  let lines = await lineTexts(page);
  console.log('    ', lines.map(l => `${l.ws}: ${l.text}`).join('\n      '));
  const drill = lines.find(l => /Ari finished.*Drilling/.test(l.text));
  ok(!!drill, 'a Wolfson stage report reads "Ari finished Drilling …" on the Job Board');
  ok(drill && /in 27, 26, 25, 28/.test(drill.text) && /· A2/.test(drill.text), `its apartments in the order the work was done, with the building (${drill?.text})`);
  ok(lines.filter(l => /Ari finished.*Drilling/.test(l.text)).length === 1, 'four closes, one sentence');
  ok(drill?.ws === 'wolfson' && (await page.$eval(`[data-wdw-line="${drill.key}"] [data-wdw-ws-chip]`, e => e.textContent)).includes('Wolfson'), 'it wears the Wolfson chip');
  const gas = lines.find(l => l.ws === 'general' && /Gas top-up/.test(l.text));
  ok(!!gas && /Dov finished “Gas top-up and leak test” in Rooftop job/.test(gas.text), 'a Job Board task with no stages reads its own words');
  ok(lines.some(l => /Final clean.*Filed-away job/.test(l.text)), 'a job filed into a group still says what was done there');
  ok(lines.findIndex(l => l === gas) < lines.findIndex(l => l === drill), 'newest first, whichever workspace (the Job Board close is newer)');
  const dayLabels = await page.$$eval('[data-wdw-day-label]', els => els.map(e => e.textContent.trim()));
  ok(dayLabels[0] === 'Today' && dayLabels[1] === 'Yesterday', `day headings (${dayLabels.join(' · ')})`);
  const dry = lines.find(l => /Dov finished.*Drywall/.test(l.text));
  ok(!!dry && /9 · A3/.test(dry.text) && /25 · A2/.test(dry.text), `yesterday's sentence names two buildings (${dry?.text})`);
  ok(!lines.some(l => /Balance the system/.test(l.text)), 'an open task is not finished work');
  ok(/2 workers/.test(await page.$eval('[data-wdw-summary]', e => e.textContent)), 'the summary counts the workers');

  console.log('— the pictures —');
  const shots = await page.$$eval(`[data-wdw-line="${drill.key}"] [data-wdw-photos] [data-site-shot]`, els => els.map(e => e.dataset.siteShot));
  ok(shots.join(',') === 'P-27a,P-27v,P-26a,P-28a', `the line's pictures and film, in the order taken (${shots.join(',')})`);
  ok(await page.$eval('[data-site-shot="P-27v"]', e => !!e.querySelector('[data-shot-play]')), 'the film wears a play mark');
  const before = await page.$eval('[data-node-id="CE-wdw"]', e => e.getBoundingClientRect().left);
  const tb = await page.locator('[data-site-shot="P-26a"]').boundingBox();
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.waitForSelector('[data-viewer-image]', { timeout: 5000 }).catch(() => null);
  ok(await page.$eval('[data-viewer-image]', i => i.src.includes('P-26a')).catch(() => false), 'a thumbnail opens that picture in the viewer');
  ok((await page.$('[data-viewer-next]')) !== null && (await page.$('[data-viewer-prev]')) !== null, 'with arrows through the rest of the line');
  ok((await page.$$('.drawer-panel')).length === 0, 'no job window opened by the tap');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok((await page.$('[data-viewer-image]')) === null, 'Escape closes the viewer');
  ok(Math.abs(await page.$eval('[data-node-id="CE-wdw"]', e => e.getBoundingClientRect().left) - before) < 1, 'the widget did not move');

  console.log('— a new close lands in Wolfson —');
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('wolfson_app_data'));
    raw.contractorAssignments.push({ id: 'T-W9', apartmentId: 'A3-9', buildingId: 'A3', contractorId: 'C-ari', taskDescription: 'working here today', dueDate: null, stageId: 'S-drill', stageIds: ['S-drill'], stagesWorked: ['S-drill'], stageReport: true, completedAt: new Date().toISOString(), createdAt: new Date().toISOString(), createdBy: '', createdByName: '' });
    localStorage.setItem('wolfson_app_data', JSON.stringify(raw));
    window.__store.setState(s => ({ snapshotTick: s.snapshotTick + 1 }));
  });
  await page.waitForTimeout(400);
  lines = await lineTexts(page);
  ok(/Ari finished.*Drilling in 27, 26, 25, 28 · A2 · 9 · A3/.test(lines[0]?.text ?? ''), `it joins its sentence, which moves to the top (${lines[0]?.text})`);

  console.log('— and a close in the open workspace —');
  await page.evaluate(() => window.__store.getState().updateContractorAssignment('T-G3', { completedAt: new Date().toISOString() }));
  await page.waitForTimeout(400);
  lines = await lineTexts(page);
  ok(/Ari finished “Balance the system” in Rooftop job/.test(lines[0]?.text ?? ''), `the moment it closes it is the first sentence (${lines[0]?.text})`);

  console.log('— the worker filter —');
  await page.evaluate(() => window.__store.getState().updateCanvasElement('CE-wdw', { data: { contractorId: 'C-dov' } }));
  await page.waitForTimeout(300);
  lines = await lineTexts(page);
  ok(lines.length > 0 && lines.every(l => /^Dov /.test(l.text)), `only Dov's work (${lines.length} sentences)`);
  ok((await page.$eval('[data-wdw-only]', e => e.textContent)).includes('Dov'), 'the summary says whose');
  await page.evaluate(() => window.__store.getState().updateCanvasElement('CE-wdw', { data: { photos: '0' } }));
  await page.waitForTimeout(300);
  ok((await page.$$('[data-wdw-photos]')).length === 0, 'pictures off in the pencil hides every strip');
  await page.evaluate(() => window.__store.getState().updateCanvasElement('CE-wdw', { data: {} }));
  await page.waitForTimeout(300);

  console.log('— a Job Board link opens the job here —');
  await page.click('[data-wdw-place="G-1"]');
  await page.waitForSelector('.drawer-panel', { timeout: 6000 }).catch(() => null);
  ok((await page.$('.drawer-panel')) !== null && (await page.$eval('.drawer-panel', e => e.textContent)).includes('Rooftop job'), 'the job window opens on that job');
  ok(await page.evaluate(() => window.__store.getState().currentProjectId) === 'general', 'without leaving the Job Board');
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);

  console.log('— a Wolfson link travels —');
  await page.click('[data-wdw-place="A2-27"]');
  await page.waitForFunction(() => window.__store.getState().currentProjectId === 'wolfson', null, { timeout: 8000 }).catch(() => null);
  await page.waitForSelector('.drawer-panel', { timeout: 10000 }).catch(() => null);
  ok(await page.evaluate(() => window.__store.getState().currentProjectId) === 'wolfson', 'the workspace switched to Wolfson');
  ok(page.url().includes('/project'), `onto the building page (${new URL(page.url()).pathname})`);
  const head = await page.$eval('.drawer-panel', e => e.textContent).catch(() => '');
  ok(/27/.test(head) && /A2/.test(head), 'and the window opened on A2 27');
  ok(errs.length === 0, `no page errors (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

// ── 2. the shelf's preview ──
{
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript(seed);
  const page = await ctx.newPage(); await stubs(page);
  await page.goto(`${APP}/jobs`);
  await page.waitForTimeout(2600);
  await page.locator('button[title]').filter({ hasText: /^Store$/ }).first().click();
  await page.waitForTimeout(1200);
  await page.locator('button', { hasText: /^All$/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  console.log('— the shelf —');
  const card = page.locator('[data-widget-id="who-did-what"]').first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);
  const info = await card.evaluate(c => ({
    lines: c.querySelectorAll('[data-wdw-line]').length,
    shots: c.querySelectorAll('[data-wdw-photos] [data-site-shot]').length,
    half: c.querySelectorAll('[data-wdw-half]').length,
    chips: [...new Set([...c.querySelectorAll('[data-wdw-ws-chip]')].map(e => e.textContent.trim()))],
    empty: !!c.querySelector('[data-wdw-empty]'),
    text: (c.querySelector('[data-wdw-line] [data-wdw-sentence]')?.textContent || '').replace(/\s+/g, ' ').trim(),
  })).catch(() => null);
  ok(!!info && info.lines >= 4 && !info.empty, `the card draws sentences, not an empty state (${info?.lines} lines)`);
  ok(!!info && info.shots >= 4, `with pictures under them (${info?.shots})`);
  ok(!!info && info.chips.length >= 2, `from more than one workspace (${info?.chips.join(', ')})`);
  ok(!!info && info.half >= 1, 'and a half-done stage');
  console.log('    ', info?.text);
  ok(!!info && (await card.evaluate(c => c.querySelectorAll('[data-wdw-place]').length)) > 0 && (await card.evaluate(c => c.querySelectorAll('button[data-wdw-place]').length)) === 0,
    'its apartments are names, not links — the shelf opens nothing');
  await ctx.close();
}

// ── 3. the wall ──
{
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.addInitScript(seed);
  const page = await ctx.newPage(); await stubs(page);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${APP}/tv`);
  await page.waitForSelector('[data-who-did-what] [data-wdw-line]', { timeout: 40000 }).catch(() => null);
  console.log('— the wall —');
  const n = (await page.$$('[data-who-did-what] [data-wdw-line]')).length;
  ok(n >= 3, `the wall draws the sentences too (${n})`);
  ok((await page.$$('[data-who-did-what] button[data-wdw-place]')).length > 0, 'and its apartments are links there');
  ok(errs.length === 0, `no page errors on the wall (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
