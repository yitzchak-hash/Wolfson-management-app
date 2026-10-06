// THE DAY STORY on the Activity page (owner, 2026-10-06: "yes"): one card per
// person per day, one line per visit, pictures that open, "now <stage>", the
// opened-only places folded away, no flags. Driven through the real page in
// the Job Board's centre (days that cross workspaces), in Wolfson (a visit
// opens the apartment window), in Hebrew, and at phone width.
// Dev server: APP (default 5173).
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://localhost:5173';
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m, x ? `— ${x}` : ''); } };
const JARGON = /\b(viewed|completedAt|photo_uploaded|contractor_upload|stage_marks|stageMarks|currentStageId|task_created)\b|\d{4}-\d{2}-\d{2}T\d{2}:/i;

function seed([now, hebrew, active]) {
  const base = new Date(now); base.setHours(12, 0, 0, 0);
  const at = m => new Date(base.getTime() - m * 60000).toISOString();
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('netiv_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', active);
  if (localStorage.getItem('general_app_data')) return;
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const user = { id: 'U-y', name: 'Yitzchak', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const contractors = [{ id: 'C-igor', name: 'Igor', category: 'ac', token: 'tok-igor', active: true, createdAt: '2026-01-01' }];
  const stages = [
    { id: 'st-drill', name: 'Drilling', nameHe: 'קידוחים', color: '#0891b2', order: 1, active: true, kind: 'work' },
    { id: 'st-pipe', name: 'Piping', nameHe: 'צנרת', color: '#9ca3af', order: 2, active: true, kind: 'work' },
    { id: 'st-wall', name: 'Wall Units', nameHe: 'יחידות קיר', color: '#f59e0b', order: 3, active: true, kind: 'work' },
    { id: 'st-reg', name: 'Registers', nameHe: 'פתחים', color: '#ea580c', order: 4, active: true, kind: 'work' },
    { id: 'gs-ac', name: 'AC installation', color: '#3b82f6', order: 1, active: true, projectId: 'general', kind: 'work' },
  ];
  const unit = (id, extra) => ({
    id, floor: 3, isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {}, bubbles: true, createdAt: '2026-01-01', updatedAt: at(500),
    updatedBy: 'U', updatedByName: 'U', ...extra,
  });
  const L = (id, apt, extra) => ({
    id, userId: 'C-igor', userName: 'Igor', buildingId: apt.split('-')[0], apartmentId: apt, apartmentNumber: apt.split('-')[1],
    actionType: 'update', fieldChanged: '', previousValue: '', newValue: '', stageId: '', ...extra,
  });
  const up = (id, apt, m) => L(id, apt, { actionType: 'contractor_upload', fieldChanged: 'photo_uploaded', newValue: `1791204142497409${m}.jpg`, createdAt: at(m) });
  const photo = (id, apt, m) => ({ id, assignmentId: 'T-1', apartmentId: apt, contractorId: 'C-igor', dataUrl: PNG, filename: `p${m}.png`, fileType: 'image', mimeType: 'image/png', uploadedAt: at(m) });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: user, contractors, stages,
    ...(hebrew ? { mainUiStrings: { isRtl: true } } : {}),
    apartments: [unit('G-1', { buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Harbor Street job', canvasX: 300, canvasY: 300, currentStageId: 'gs-ac' })],
    canvasElements: [], contractorPhotos: [],
    activityLogs: [up('g-u1', 'G-1', 20)].map(l => ({ ...l, buildingId: 'G', apartmentNumber: 'Harbor Street job' })),
  }));
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: user, contractors, stages,
    ...(hebrew ? { mainUiStrings: { isRtl: true } } : {}),
    buildings: [{ id: 'A1', name: 'A1' }, { id: 'A3', name: 'A3' }],
    apartments: [
      unit('A3-12', { buildingId: 'A3', apartmentNumber: '12', displayName: 'Unit Twelve', currentStageId: 'st-reg', stageMarks: { 'st-drill': 'done', 'st-pipe': 'done', 'st-wall': 'done' } }),
      unit('A1-9', { buildingId: 'A1', apartmentNumber: '9', displayName: 'Unit Nine', currentStageId: 'st-wall', stageMarks: { 'st-wall': 'pending' } }),
      unit('A3-16', { buildingId: 'A3', apartmentNumber: '16', displayName: 'Unit Sixteen' }),
    ],
    canvasElements: [],
    contractorAssignments: [{ id: 'T-1', contractorId: 'C-igor', apartmentId: 'A3-12', taskDescription: 'Wall Units — working here today', createdAt: at(200), stageReport: true }],
    contractorPhotos: [180, 178, 176, 174, 172].map((m, i) => photo(`P${i}`, 'A3-12', m)),
    activityLogs: [
      L('w-start', 'A3-12', { actionType: 'task_created', fieldChanged: 'work_started', newValue: 'Wall Units — working here today', stageId: 'st-wall', createdAt: at(200) }),
      ...[180, 178, 176, 174, 172].map((m, i) => up(`w-u${i}`, 'A3-12', m)),
      L('w-marks', 'A3-12', { actionType: 'stage_marks', fieldChanged: 'stageMarks', marks: [{ id: 'st-wall', name: 'Wall Units', from: 'doing', to: 'done' }], createdAt: at(170) }),
      L('w-close', 'A3-12', { actionType: 'contractor_complete', fieldChanged: 'completedAt', newValue: at(169), createdAt: at(169) }),
      L('w-look', 'A3-16', { actionType: 'opened', fieldChanged: 'viewed', createdAt: at(150) }),
      L('w-half', 'A1-9', { actionType: 'stage_marks', fieldChanged: 'stageMarks', marks: [{ id: 'st-wall', name: 'Wall Units', from: 'todo', to: 'pending' }], createdAt: at(100) }),
      L('w-msg', 'A1-9', { actionType: 'contractor_note', fieldChanged: 'note_added', newValue: 'one unit left', createdAt: at(98) }),
    ],
  }));
  localStorage.setItem('netiv_app_data', JSON.stringify({
    currentUser: user, contractors, stages,
    buildings: [{ id: 'B1', name: 'B1' }],
    apartments: [unit('B1-4', { buildingId: 'B1', apartmentNumber: '4', displayName: 'Unit Four' })],
    canvasElements: [],
    activityLogs: [L('n-note', 'B1-4', { userId: 'U-e', userName: 'Esther', actionType: 'note', fieldChanged: 'stageNote', stageId: 'st-pipe', newValue: 'Bring the long ladder', createdAt: at(45) })],
  }));
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const stub = async page => { await page.route(/fonts\.g|open-meteo|tiktok|vercel\.app|tzviair-goals/, r => r.abort()); };
const txt = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
const igor = '[data-day-person="Igor"]';

// ── 1. The Job Board's centre, English ──
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(seed, [Date.now(), false, 'general']);
  const page = await ctx.newPage(); await stub(page);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${APP}/activity`);
  await page.waitForSelector('[data-day-card]', { timeout: 30000 });
  await page.waitForTimeout(500);
  console.log('— the day story, by default —');
  ok(await page.$('[data-activity-view="day"]') !== null, 'the page opens on "Day by day"');
  ok((await page.$$('[data-day-card]')).length === 2, 'one card per person for the day (Igor, Esther)', String((await page.$$('[data-day-card]')).length));
  ok((await txt(page, `${igor} [data-day-counts]`)) === '3 places · 1 closed', `Igor's header counts the places worked and closed (${await txt(page, `${igor} [data-day-counts]`)})`);
  const wsChips = await page.$$eval(`${igor} [data-day-ws]`, els => els.map(e => e.dataset.dayWs));
  ok(wsChips.includes('wolfson') && wsChips.includes('general'), `a day that crossed workspaces wears both (${wsChips.join(', ')})`);
  const visits = await page.$$eval(`${igor} [data-day-visit]`, els => els.map(e => e.dataset.dayVisit));
  ok(visits.join(',') === 'A3-12,A1-9,G-1', `the day reads forward: ${visits.join(' → ')}`);
  const first = await txt(page, `${igor} [data-day-visit="A3-12"] [data-day-visit-line]`);
  ok(/^started Wall Units · Wall Units done · 5 photos · closed \d\d:\d\d$/.test(first), `the first visit tells it in order: "${first}"`);
  ok(/^\d\d:\d\d–\d\d:\d\d$/.test(await txt(page, `${igor} [data-day-visit="A3-12"] [data-day-time]`)), 'with the time it began and ended');
  ok((await txt(page, `${igor} [data-day-visit="A1-9"] [data-day-visit-line]`)) === 'Wall Units half done · 1 message', 'half done, and the message');
  ok(/now.*Registers/.test(await txt(page, `${igor} [data-day-visit="A3-12"] [data-day-now]`)), 'where it stands now — from the live record');
  ok((await page.$$(`${igor} [data-day-visit="A3-12"] [data-day-thumb]`)).length === 4 && await page.$(`${igor} [data-day-visit="A3-12"] [data-day-thumb-more]`) !== null, 'four pictures and a "+1"');
  const looked = await page.$eval(`${igor} [data-day-looked]`, e => ({ n: e.dataset.dayLooked, t: e.textContent })).catch(() => null);
  ok(looked?.n === '1' && /Unit Sixteen/.test(looked.t), 'the place he only opened folds into one "also looked at" line', looked?.t);
  ok(await page.$(`${igor} [data-day-visit="A3-16"]`) === null, '…and is not a visit');
  const body = await page.evaluate(() => document.body.innerText);
  ok(!JARGON.test(body), 'no field names or timestamps on the page', (body.match(JARGON) || [])[0]);
  ok(!/suspicious|wrong building|\bflag/i.test(body), 'no flags — the story judges nothing');

  console.log('— pictures —');
  await page.click(`${igor} [data-day-visit="A3-12"] [data-day-thumb] >> nth=1`);
  await page.waitForSelector('[data-media-viewer]', { timeout: 5000 }).catch(() => {});
  ok(await page.$('[data-media-viewer] [data-viewer-image]') !== null, 'a thumbnail opens the picture viewer');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok(await page.$('[data-media-viewer]') === null && await page.$('[data-day-card]') !== null, 'Escape closes the viewer and leaves the page');

  console.log('— filters and the switch —');
  await page.click('[data-family-pick="photos"]');
  await page.waitForTimeout(300);
  const onlyPhotos = await page.$$eval('[data-day-visit-line]', els => els.map(e => e.textContent.trim()));
  ok(onlyPhotos.length > 0 && onlyPhotos.every(t => /^\d+ photos?$/.test(t)), `the "Photos" filter leaves only the pictures (${onlyPhotos.join(' | ')})`);
  await page.click('[data-family-pick="all"]');
  await page.click('[data-activity-view-pick="all"]');
  await page.waitForSelector('[data-activity-row]', { timeout: 5000 }).catch(() => {});
  ok(await page.$('[data-activity-row]') !== null && await page.$('[data-day-card]') === null, '"Every change" shows the full list');
  await page.reload();
  await page.waitForSelector('[data-activity-row]', { timeout: 15000 }).catch(() => {});
  ok(await page.$('[data-activity-view="all"]') !== null, 'and this computer remembers the choice');
  await page.click('[data-activity-view-pick="day"]');
  await page.waitForSelector('[data-day-card]', { timeout: 5000 }).catch(() => {});
  ok(await page.$('[data-day-card]') !== null, 'switching back draws the cards again');
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await ctx.close();
}

// ── 2. Standing in Wolfson: a visit opens the apartment window ──
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(seed, [Date.now(), false, 'wolfson']);
  const page = await ctx.newPage(); await stub(page);
  await page.goto(`${APP}/activity`);
  await page.waitForSelector('[data-day-card]', { timeout: 30000 });
  console.log('— in Wolfson —');
  ok(await page.$('[data-day-ws]') === null, 'no workspace chips outside the centre');
  await page.click(`${igor} [data-day-visit="A3-12"] [data-day-place]`);
  await page.waitForSelector('.drawer-panel [data-drawer-floor]', { timeout: 8000 }).catch(() => {});
  ok(await page.$('.drawer-panel') !== null, 'a visit\'s place opens the apartment window over the page');
  await ctx.close();
}

// ── 3. Hebrew ──
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(seed, [Date.now(), true, 'general']);
  const page = await ctx.newPage(); await stub(page);
  await page.goto(`${APP}/activity`);
  await page.waitForSelector('[data-day-card]', { timeout: 30000 });
  console.log('— Hebrew —');
  ok((await txt(page, '[data-activity-view-pick="day"]')) === 'יום אחר יום', 'the switch is in Hebrew');
  const line = await txt(page, `${igor} [data-day-visit="A3-12"] [data-day-visit-line]`);
  ok(/^התחיל יחידות קיר · יחידות קיר בוצע · 5 תמונות · נסגר \d\d:\d\d$/.test(line), `the line in Hebrew, stages by their Hebrew names: "${line}"`);
  ok(/3 מקומות · אחד נסגר/.test(await txt(page, `${igor} [data-day-counts]`)), 'the counts in Hebrew');
  await ctx.close();
}

// ── 4. A phone ──
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(seed, [Date.now(), false, 'general']);
  const page = await ctx.newPage(); await stub(page);
  await page.goto(`${APP}/activity`);
  await page.waitForSelector('[data-day-card]', { timeout: 30000 });
  console.log('— a phone —');
  const over = await page.evaluate(() => [...document.querySelectorAll('[data-day-list] *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).length);
  ok(over === 0, 'nothing in the day story runs past a 390px screen', String(over));
  await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
