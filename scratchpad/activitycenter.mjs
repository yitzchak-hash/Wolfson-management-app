// THE ACTIVITY LOG, round 2026-10-05: the Job Board is the activity centre for
// every workspace; every record reads in plain words; runs fold into one row;
// the set model logs which stages moved, never the headline.
//
// Seeded with Igor's real kind of day in Wolfson (five camera-named uploads,
// "I'm going to work here", a close, an old headline record) and a little on
// the Job Board, then driven through the real page, the apartment window's
// History tab and the header ticker. Dev server: APP (default 5173).
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://localhost:5173';
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m, x ? `— ${x}` : ''); } };

/** Words that must never reach a person: field names, type codes, timestamps. */
const JARGON = /\b(viewed|completedAt|photo_uploaded|stage note task|Stage\/field change|contractor_upload|contractor_note|contractor_complete|contractor_assigned|task_created|task_completed|task_uncompleted|stage_marks|stageMarks|currentStageId|generalNotes|note_added|changed stage|updated stage note)\b|\d{4}-\d{2}-\d{2}T\d{2}:/i;
/** A camera's file name — allowed only small, inside an opened run. */
const CAMERA = /\d{9,}\.(jpe?g|png|mp4|webm)/i;

function seed([now, hebrew]) {
  const ago = m => new Date(now - m * 60000).toISOString();
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('netiv_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  // This harness reads the full list; the day story has its own (daystory-probe).
  if (!localStorage.getItem('activity_view')) localStorage.setItem('activity_view', 'all');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'general');
  if (localStorage.getItem('general_app_data')) return;
  const user = { id: 'U-y', name: 'Yitzchak', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const contractors = [{ id: 'C-igor', name: 'Igor', category: 'ac', token: 'tok-igor', active: true, createdAt: '2026-01-01' }];
  const stages = [
    { id: 'st-pipe', name: 'Piping', nameHe: 'צנרת', color: '#f0cf6a', order: 1, active: true, kind: 'work' },
    { id: 'st-wall', name: 'Wall Units', nameHe: 'יחידות קיר', color: '#f59e0b', order: 2, active: true, kind: 'work' },
    { id: 'st-reg', name: 'Registers', nameHe: 'רשתות', color: '#84cc16', order: 3, active: true, kind: 'work' },
    { id: 'st-acc', name: 'Access Panels', nameHe: 'פתחי שירות', color: '#22c55e', order: 4, active: true, kind: 'work' },
    { id: 'st-done', name: 'Job completed', nameHe: 'העבודה הושלמה', color: '#16a34a', order: 9, active: true, kind: 'marker' },
    { id: 'gs-ac', name: 'AC installation', color: '#3b82f6', order: 1, active: true, projectId: 'general', kind: 'work' },
  ];
  const unit = (id, extra) => ({
    id, floor: 3, isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {}, bubbles: true, createdAt: '2026-01-01', updatedAt: ago(500),
    updatedBy: 'U', updatedByName: 'U', ...extra,
  });
  const L = (id, extra) => ({
    id, userId: 'C-igor', userName: 'Igor', buildingId: 'A1', apartmentId: 'A1-9', apartmentNumber: '9',
    actionType: 'update', fieldChanged: '', previousValue: '', newValue: '', stageId: '', ...extra,
  });
  // ── The Job Board: a short run of uploads on "Levi", and an office task ──
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: user, contractors, stages,
    ...(hebrew ? { mainUiStrings: { isRtl: true } } : {}),
    apartments: [unit('G-1', { buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Levi', canvasX: 300, canvasY: 300 })],
    canvasElements: [],
    activityLogs: [
      L('g-u3', { userName: 'Igor', buildingId: 'G', apartmentId: 'G-1', apartmentNumber: 'Levi', actionType: 'contractor_upload', fieldChanged: 'photo_uploaded', newValue: '20261005_101500.jpg', createdAt: ago(10) }),
      L('g-u2', { userName: 'Igor', buildingId: 'G', apartmentId: 'G-1', apartmentNumber: 'Levi', actionType: 'contractor_upload', fieldChanged: 'photo_uploaded', newValue: '20261005_101200.jpg', createdAt: ago(13) }),
      L('g-u1', { userName: 'Igor', buildingId: 'G', apartmentId: 'G-1', apartmentNumber: 'Levi', actionType: 'contractor_upload', fieldChanged: 'photo_uploaded', newValue: '20261005_100900.jpg', createdAt: ago(16) }),
      L('g-t1', { userId: 'U-e', userName: 'Esther', buildingId: 'G', apartmentId: 'G-1', apartmentNumber: 'Levi', actionType: 'task_created', fieldChanged: 'task', newValue: 'Fit the indoor unit', createdAt: ago(200) }),
    ],
  }));
  // ── Wolfson: Igor's day on 9 — Building 1/9, the shapes the app really wrote ──
  const ups = [0, 1, 2, 3, 4].map(i => L(`w-u${i}`, {
    actionType: 'contractor_upload', fieldChanged: 'photo_uploaded',
    newValue: `17912041424974093224${i}2886791595.jpg`, createdAt: ago(30 + i * 4),
  }));
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: user, contractors, stages,
    buildings: [{ id: 'A1', name: 'A1' }, { id: 'A3', name: 'A3' }],
    apartments: [
      unit('A1-9', { buildingId: 'A1', apartmentNumber: '9', displayName: 'Building 1/9', currentStageId: 'st-reg', stageMarks: { 'st-pipe': 'done', 'st-wall': 'done', 'st-reg': 'todo' } }),
      unit('A3-12', { buildingId: 'A3', apartmentNumber: '12', displayName: 'Building 3/12', currentStageId: 'st-acc' }),
    ],
    canvasElements: [],
    activityLogs: [
      L('w-close', { actionType: 'contractor_complete', fieldChanged: 'completedAt', newValue: ago(20), createdAt: ago(20) }),
      ...ups,
      L('w-start', { actionType: 'task_created', fieldChanged: 'task', newValue: 'Registers — working here today', stageId: 'st-reg', createdAt: ago(60) }),
      L('w-old', { buildingId: 'A3', apartmentId: 'A3-12', apartmentNumber: 'Building 3/12', fieldChanged: 'currentStageId', previousValue: 'Wall Units', newValue: 'Access Panels', stageId: 'st-acc', createdAt: ago(90) }),
      L('w-task', { actionType: 'task_created', fieldChanged: 'task', newValue: 'Registers — working here today', createdAt: ago(95), buildingId: 'A3', apartmentId: 'A3-12' }),
      L('w-marks', { actionType: 'stage_marks', fieldChanged: 'stageMarks', marks: [{ id: 'st-wall', name: 'Wall Units', from: 'doing', to: 'done' }], newValue: 'marked Wall Units done', createdAt: ago(120) }),
    ],
  }));
  // Esther's Netiv note lands at 45 minutes ago — IN THE MIDDLE of Igor's
  // uploads (30…46). Deliberate: the centre interleaves every workspace, and
  // somebody else's line must not split his run in two.
  localStorage.setItem('netiv_app_data', JSON.stringify({
    currentUser: user, contractors, stages,
    buildings: [{ id: 'B1', name: 'B1' }],
    apartments: [unit('B1-4', { buildingId: 'B1', apartmentNumber: '4', displayName: 'Mizrachi' })],
    canvasElements: [],
    activityLogs: [L('n-note', { userId: 'U-e', userName: 'Esther', buildingId: 'B1', apartmentId: 'B1-4', apartmentNumber: 'Mizrachi', actionType: 'note', fieldChanged: 'stageNote', stageId: 'st-pipe', newValue: 'Bring the long ladder', createdAt: ago(45) })],
  }));
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const stub = async page => { await page.route(/fonts\.g|open-meteo|tiktok|vercel\.app|tzviair-goals/, r => r.abort()); };
const bodyText = page => page.evaluate(() => document.body.innerText);
const rowText = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');

// ── 1. The Job Board's centre, in English ──
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addInitScript(seed, [Date.now(), false]);
  const page = await ctx.newPage(); await stub(page);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${APP}/activity`);
  await page.waitForSelector('[data-activity-row]', { timeout: 30000 });
  await page.waitForTimeout(600);

  console.log('— the centre —');
  ok(await page.$('[data-activity-center]') !== null, 'the Job Board\'s Activity page says it is every workspace');
  const wsOf = await page.$$eval('[data-activity-row]', els => els.map(e => e.dataset.activityWs));
  ok(wsOf.includes('general') && wsOf.includes('wolfson') && wsOf.includes('netiv'), `rows from all three workspaces (${[...new Set(wsOf)].join(', ')})`);
  const chips = await page.$$eval('[data-activity-ws-chip]', els => [...new Set(els.map(e => e.textContent.trim()))]);
  ok(chips.some(c => /Wolfson/.test(c)) && chips.some(c => /Job Board|Jobs/i.test(c)), `each row wears its workspace (${chips.join(' · ')})`);
  const times = await page.$$eval('[data-activity-row]', els => els.map(e => e.dataset.activityRow));
  ok(times[0] === 'g-u3', 'newest first across workspaces — the Job Board\'s uploads ten minutes ago lead', times.slice(0, 3).join(','));
  ok(await page.$('[data-activity-day]') !== null && (await rowText(page, '[data-activity-day]')).toLowerCase() === 'today', 'rows sit under a "Today" heading');

  console.log('— plain words —');
  const text = await bodyText(page);
  ok(!JARGON.test(text), 'no field names, type codes or timestamps anywhere on the page', (text.match(JARGON) || [])[0]);
  const sentences = await page.$$eval('[data-activity-sentence]', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(!sentences.some(s => CAMERA.test(s)), 'no camera file name in any sentence');
  const run = '[data-activity-row="w-u0"]';
  ok(await page.$eval(run, e => e.dataset.activityKind === 'upload' && e.dataset.activityCount === '5').catch(() => false), 'Igor\'s five uploads are ONE row — even with Esther\'s Netiv note landing in the middle of them');
  ok((await rowText(page, `${run} [data-activity-sentence]`)) === 'Igor uploaded 5 photos', `it reads "Igor uploaded 5 photos" (${await rowText(page, `${run} [data-activity-sentence]`)})`);
  ok(/\d\d:\d\d–\d\d:\d\d/.test(await rowText(page, `${run} [data-activity-time]`)), 'with the time range of the run');
  ok((await rowText(page, '[data-activity-row="w-start"] [data-activity-sentence]')) === 'Igor started work here — Registers', '"I\'m going to work here" reads "started work here — Registers"');
  ok((await rowText(page, '[data-activity-row="w-close"] [data-activity-sentence]')) === 'Igor closed the task', 'the portal close reads "closed the task" — no timestamp');
  const old = await rowText(page, '[data-activity-row="w-old"] [data-activity-sentence]');
  ok(old === 'Igor — next up: Access Panels (was Wall Units)', `an old headline record reads neutrally: "${old}"`);
  ok((await rowText(page, '[data-activity-row="w-marks"] [data-activity-sentence]')) === 'Igor marked Wall Units done', 'a set-model record reads "marked Wall Units done"');
  ok(/9 — Building 1\/9/.test(await rowText(page, `${run} [data-activity-place]`)), 'the row names its unit by the unit\'s own label');

  console.log('— a run opens up —');
  await page.click(`${run} [data-activity-expand]`);
  await page.waitForTimeout(200);
  ok((await page.$$(`${run} [data-activity-entry]`)).length === 5, 'Show all 5 lists each upload');
  ok(/Hide/.test(await rowText(page, `${run} [data-activity-expand]`)), 'and the button says Hide');
  await page.click(`${run} [data-activity-expand]`);
  await page.waitForTimeout(150);
  ok((await page.$$(`${run} [data-activity-entry]`)).length === 0, 'Hide folds it again');

  console.log('— filters —');
  await page.click('[data-ws-pick="wolfson"]'); await page.waitForTimeout(200);
  const onlyW = await page.$$eval('[data-activity-row]', els => els.map(e => e.dataset.activityWs));
  ok(onlyW.length > 0 && onlyW.every(w => w === 'wolfson'), `the Wolfson chip shows only Wolfson (${onlyW.length} rows)`);
  await page.click('[data-family-pick="photos"]'); await page.waitForTimeout(200);
  const kinds = await page.$$eval('[data-activity-row]', els => els.map(e => e.dataset.activityKind));
  ok(kinds.length === 1 && kinds[0] === 'upload', `Photos & files shows only the upload row (${kinds.join(',')})`);
  await page.click('[data-ws-pick="all"]'); await page.click('[data-family-pick="all"]'); await page.waitForTimeout(200);
  ok((await page.$$('[data-activity-building]')).length > 0 && (await page.$('button:has-text("A3")')) === null,
    'the Building row waits for one workspace to be chosen (no A1·A3·B1 mixed)');
  await page.selectOption('[data-activity-person]', { label: 'Esther' }); await page.waitForTimeout(200);
  const whoRows = await page.$$eval('[data-activity-sentence]', els => els.map(e => e.textContent.trim()));
  ok(whoRows.length > 0 && whoRows.every(t => t.startsWith('Esther')), `Who: Esther shows only Esther (${whoRows.length} rows, across workspaces)`);
  await page.selectOption('[data-activity-person]', 'all'); await page.waitForTimeout(200);

  console.log('— the ticker —');
  const live = await rowText(page, '[data-live-line]');
  ok(live.length > 0 && !JARGON.test(live) && !CAMERA.test(live), `the header ticker reads plain: "${live}"`);
  ok(/Igor uploaded 3 photos · Levi/.test(live), 'and folds the Job Board\'s run: "Igor uploaded 3 photos · Levi"');

  console.log('— a Job Board row opens here —');
  await page.click('[data-activity-row="g-u3"]');
  await page.waitForSelector('.drawer-panel', { timeout: 5000 }).catch(() => null);
  ok((await page.$('.drawer-panel')) !== null && new URL(page.url()).pathname === '/activity', 'the job\'s window opens over the list, which stays put');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  ok((await page.$('.drawer-panel')) === null, 'Escape closes it');

  console.log('— a Wolfson row travels there and back —');
  await page.click('[data-activity-row="w-u0"]');
  await page.waitForSelector('.drawer-panel', { timeout: 8000 }).catch(() => null);
  const ws = await page.evaluate(() => window.__store.getState().currentProjectId);
  ok(ws === 'wolfson' && new URL(page.url()).pathname === '/project', `pressing it switches to Wolfson (${ws}, ${new URL(page.url()).pathname})`);
  ok((await page.$('.drawer-panel')) !== null && /9/.test(await rowText(page, '.drawer-panel')), 'and opens 9 — Building 1/9\'s window');

  console.log('— the History tab —');
  await page.waitForTimeout(500);
  await page.click('.drawer-panel button:has-text("History")');
  await page.waitForSelector('[data-history-row]', { timeout: 5000 }).catch(() => null);
  const hist = await page.$$eval('[data-history-row]', els => els.map(e => ({ id: e.dataset.historyRow, n: e.dataset.activityCount, kind: e.dataset.activityKind, t: e.querySelector('[data-activity-sentence]')?.textContent.replace(/\s+/g, ' ').trim() })));
  const histUp = hist.find(h => h.kind === 'upload');
  ok(histUp && histUp.n === '5' && histUp.t === 'Igor uploaded 5 photos', `the five uploads are one row in History (${histUp?.t})`);
  ok(hist.some(h => h.t === 'Yitzchak opened the apartment'), 'opening it is in the history, in words');
  ok(hist.some(h => h.t === 'Igor started work here — Registers'), 'the start of work too');
  const histText = await rowText(page, '[data-history-list]');
  ok(!JARGON.test(histText) && !/Apt Building/.test(histText), 'no jargon and no "Apt Building" in History', (histText.match(JARGON) || [])[0]);

  console.log('— ticking a stage logs the stage, never the headline —');
  await page.click('.drawer-panel button:has-text("Details")');
  await page.waitForTimeout(300);
  await page.click('[data-stage-picker]');
  await page.waitForSelector('[data-stage-bubble="st-reg"]', { timeout: 4000 }).catch(() => null);
  await page.click('[data-stage-bubble="st-reg"]');           // to do → happening now
  await page.waitForTimeout(250);
  await page.click('[data-stage-bubble="st-reg"]');           // happening now → done
  await page.waitForTimeout(400);
  const logs = await page.evaluate(() => window.__store.getState().activityLogs.slice(0, 4).map(l => ({ a: l.actionType, f: l.fieldChanged, m: l.marks, n: l.newValue })));
  ok(logs[0].a === 'stage_marks' && logs[0].m?.[0]?.id === 'st-reg' && logs[0].m[0].to === 'done', `the record names Registers → done (${JSON.stringify(logs[0].m)})`);
  ok(logs[1].a === 'stage_marks' && logs[1].m?.[0]?.to === 'doing', 'the first tap recorded Registers → happening now');
  ok(!logs.some(l => l.f === 'currentStageId'), 'and nothing logged the headline moving');
  ok(logs[0].n === 'marked Registers done', `the record carries its English words (${logs[0].n})`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.click('.drawer-panel button:has-text("History")');
  await page.waitForTimeout(300);
  const top = await rowText(page, '[data-history-row] [data-activity-sentence]');
  ok(top === 'Yitzchak marked Registers done', `History's top row: "${top}" (the two taps fold — started then done is done)`);

  console.log('— closing goes home —');
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  const back = await page.evaluate(() => window.__store.getState().currentProjectId);
  ok(back === 'general' && new URL(page.url()).pathname === '/activity', `closing the window brings you back to the centre (${back}, ${new URL(page.url()).pathname})`);
  const fresh = await page.$$eval('[data-activity-row]', els => els.map(e => e.dataset.activityWs + ':' + e.dataset.activityKind));
  ok(fresh.includes('wolfson:stages') && fresh.includes('wolfson:opened'), 'and the centre now shows what was just done in Wolfson');

  console.log('— a building workspace keeps its own page —');
  await page.evaluate(() => window.__store.getState().setCurrentProject('netiv'));
  await page.waitForTimeout(400);
  await page.click('a[href="/activity"]').catch(() => null);
  await page.waitForTimeout(600);
  const own = await page.$$eval('[data-activity-row]', els => els.map(e => e.dataset.activityWs));
  ok(own.length > 0 && own.every(w => w === 'netiv') && (await page.$('[data-activity-center]')) === null, `Netiv's Activity page shows only Netiv (${own.length} rows)`);
  ok((await rowText(page, '[data-activity-row] [data-activity-sentence]')) === 'Esther added a note — Piping', 'a stage note reads "added a note — Piping"');
  ok(errs.length === 0, `no page errors (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

// ── 2. Hebrew ──
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addInitScript(seed, [Date.now(), true]);
  const page = await ctx.newPage(); await stub(page);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${APP}/activity`);
  await page.waitForSelector('[data-activity-row]', { timeout: 30000 });
  await page.waitForTimeout(500);
  console.log('— in Hebrew —');
  ok((await rowText(page, '[data-activity-row="w-u0"] [data-activity-sentence]')) === 'Igor העלה 5 תמונות', `Hebrew: "${await rowText(page, '[data-activity-row="w-u0"] [data-activity-sentence]')}"`);
  ok((await rowText(page, '[data-activity-row="w-marks"] [data-activity-sentence]')) === 'Igor סימן כגמור: יחידות קיר', 'Hebrew: the stage is named in Hebrew');
  ok((await rowText(page, '[data-activity-day]')) === 'היום', 'Hebrew: "היום"');
  const text = await bodyText(page);
  ok(!JARGON.test(text), 'Hebrew: no jargon on the page', (text.match(JARGON) || [])[0]);
  ok(errs.length === 0, `no page errors (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

// ── 3. The worker's phone, with an office login sitting in the same browser ──
// (the owner's own test setup — which is how "Yitzchak moved it to Registers"
// came to be written when Igor had closed his task)
{
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  await ctx.addInitScript(seed, [Date.now(), false]);
  await ctx.addInitScript(() => {
    localStorage.setItem('active_project', 'wolfson');
    const raw = JSON.parse(localStorage.getItem('wolfson_app_data'));
    if (raw.contractors[0].perms) return;
    raw.contractors[0] = { ...raw.contractors[0], photosOptional: true, perms: { seeDiagrams: true, seeAllApartments: true, workHere: true } };
    localStorage.setItem('wolfson_app_data', JSON.stringify(raw));
  });
  const page = await ctx.newPage(); await stub(page);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const logsNow = () => page.evaluate(() => window.__store.getState().activityLogs.map(l => ({ a: l.actionType, f: l.fieldChanged, who: l.userName, v: l.newValue, m: l.marks })));
  console.log('— the worker starts work —');
  await page.goto(`${APP}/c/tok-igor`);
  await page.waitForTimeout(2500);
  await page.locator('button:has-text("Building Map")').first().click();
  await page.waitForTimeout(900);
  if (await page.locator('[data-map-square="wolfson"]').count()) { await page.locator('[data-map-square="wolfson"]').click(); await page.waitForTimeout(1200); }
  await page.locator('[data-apt-id="A1-9"]').first().click();
  await page.waitForTimeout(700);
  const before = (await logsNow()).length;
  await page.locator('[data-work-here]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-work-stage="st-reg"]').click();
  await page.locator('[data-work-start]').click();
  // Round 48: Start asks "are you sure you will be doing these today" first.
  await page.waitForTimeout(300);
  await page.locator('[data-work-confirm-yes]').click();
  await page.waitForTimeout(1200);
  let logs = await logsNow();
  const added = logs.slice(0, logs.length - before);
  ok(added.length === 1 && added[0].a === 'task_created' && added[0].f === 'work_started' && added[0].who === 'Igor',
    `"I'm going to work here" writes ONE line, the start of work (${added.map(l => l.a + '/' + l.f).join(', ')})`);
  ok(await page.evaluate(() => window.__store.getState().apartments.find(a => a.id === 'A1-9').stageMarks['st-reg'] === 'doing'), 'and Registers is still marked happening now — the quiet write still happened');

  console.log('— the worker closes —');
  await page.locator('[data-close-job]').first().click();
  await page.waitForTimeout(500);
  await page.locator('[data-close-finished-pick="yes"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-close-now]').click();
  await page.waitForTimeout(1500);
  logs = await logsNow();
  const close = logs.slice(0, 3);
  ok(close[0].a === 'contractor_complete' && close[0].who === 'Igor' && close[0].v === 'Registers — working here today',
    `the close is Igor's and carries the task's words, not a timestamp ("${close[0].v}")`);
  ok(close[1].a === 'stage_marks' && close[1].who === 'Igor' && close[1].m?.[0]?.id === 'st-reg' && close[1].m[0].to === 'done',
    `the stage ticked by the close is credited to IGOR, not the office login in the same browser (${close[1].who}: ${JSON.stringify(close[1].m)})`);
  ok(!logs.some(l => l.a === 'task_completed') && !logs.some(l => l.f === 'currentStageId' && l.who === 'Yitzchak'), 'no second "closed" line and no headline record by Yitzchak');
  await page.waitForTimeout(400);
  await page.goto(`${APP}/activity`);
  await page.waitForSelector('[data-activity-row]', { timeout: 20000 });
  await page.waitForTimeout(500);
  const top = await page.$$eval('[data-activity-sentence]', els => els.slice(0, 3).map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(top[0] === 'Igor closed the task' && top[1] === 'Igor marked Registers done' && top[2] === 'Igor started work here — Registers',
    `Wolfson's log tells his visit in three lines: ${top.join(' / ')}`);
  ok(errs.length === 0, `no page errors (${errs.slice(0, 2).join(' | ')})`);
  await ctx.close();
}

// ── 4. A narrow phone: nothing runs off the side ──
for (const heb of [false, true]) {
  const ctx = await b.newContext({ viewport: { width: 360, height: 780 } });
  await ctx.addInitScript(seed, [Date.now(), heb]);
  const page = await ctx.newPage(); await stub(page);
  await page.goto(`${APP}/activity`);
  await page.waitForSelector('[data-activity-row]', { timeout: 30000 });
  await page.waitForTimeout(500);
  // Measured at load, scrolled to the top — the click below scrolls the page.
  const firstRow = await page.evaluate(() => { window.scrollTo(0, 0); const m = document.querySelector('main'); if (m) m.scrollTop = 0; return document.querySelector('[data-activity-row]').getBoundingClientRect().top; });
  await page.click('[data-activity-row="w-u0"] [data-activity-expand]');
  await page.waitForTimeout(250);
  const fit = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [...document.querySelectorAll('main *')].filter(e => {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      // a sideways chip scroller is allowed to hold chips past the edge — it scrolls
      if (e.closest('[data-activity-ws-filter],[data-activity-family-filter]')) return false;
      return r.right > vw + 1 || r.left < -1;
    }).map(e => e.tagName + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''));
    return { page: document.documentElement.scrollWidth <= vw, out };
  });
  ok(fit.page && fit.out.length === 0, `${heb ? 'Hebrew' : 'English'} at 360px: the page fits, nothing past the edge`, fit.out.slice(0, 4).join(', '));
  ok(firstRow < 780, `${heb ? 'Hebrew' : 'English'} at 360px: the first row is on the first screen (top ${Math.round(firstRow)}px)`);
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
