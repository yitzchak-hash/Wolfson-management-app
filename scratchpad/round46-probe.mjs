// Round 46 (2026-09-17): a film, a picture or a file OPENS in one viewer with
// full screen, an info panel and Download; task messages fold away; crossing
// the current stage off moves the job on; a task the worker starts is stored
// in ENGLISH; the drawer's chip says Contractor status.
import { chromium } from 'playwright';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const APP = 'http://localhost:5173';
const USER = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
const STAGES = [
  { id: 'S1', name: 'Ready to start', color: '#64748b', order: 1, active: true },
  { id: 'S2', name: 'Piping', color: '#3b82f6', order: 2, active: true },
  { id: 'S3', name: 'Concealed units', color: '#8b5cf6', order: 3, active: true },
];
const APT = { id: 'A1-7', buildingId: 'A1', floor: 3, apartmentNumber: '7', displayName: 'Artzi', isUnnamed: false, isDuplexApt: false,
  classification: 'standard', generalNotes: '', currentStageId: 'S2', stageDates: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
const TASK = { id: 'T-1', contractorId: 'C-jo', apartmentId: 'A1-7', buildingId: 'A1', taskDescription: 'Run the pipes', stageId: 'S2',
  dueDate: day(0), priority: 'normal', createdAt: '2026-01-01T08:00:00.000Z', completedAt: null };
const WORKER = { id: 'C-jo', name: 'Igor', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01', lang: 'ru',
  perms: { seeDiagrams: true, seeAllApartments: true, workHere: true } };
// A film and a picture the worker sent back, as ordinary thread notes.
const NOTES = [
  { id: 'N-vid', assignmentId: 'T-1', apartmentId: 'A1-7', authorType: 'contractor', authorName: 'Igor', text: '',
    attachmentFilename: '20260917_112941.mp4', attachmentMimeType: 'video/mp4', attachmentDriveFileId: 'VID1',
    createdAt: '2026-09-17T08:31:00.000Z' },
  { id: 'N-doc', assignmentId: 'T-1', apartmentId: 'A1-7', authorType: 'contractor', authorName: 'Igor', text: '',
    attachmentFilename: 'notes.dwg', attachmentMimeType: 'image/vnd.dwg', attachmentDriveFileId: 'DWG1',
    createdAt: '2026-09-17T08:32:00.000Z' },
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const seed = ctx => ctx.addInitScript(([user, stages, worker, apts, tasks, notes]) => {
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('wolfson_app_data')) return;
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: user, users: [user], stages, contractors: [worker], apartments: apts,
    contractorAssignments: tasks, contractorNotes: notes, contractorPhotos: [],
  }));
}, [USER, STAGES, WORKER, [APT], [TASK], NOTES]);
const store = page => page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data') || '{}'));

async function openDrawer(page) {
  await page.goto(`${APP}/project`); await page.waitForTimeout(2400);
  await page.locator('[data-apt-id="A1-7"]').first().click();
  await page.waitForTimeout(1300);
}

// ── A · the office: one viewer for every file, and a thread that folds ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx);
  // Drive is not reachable here: the thumbnail and the bytes both answer.
  await ctx.route('**://drive.google.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('89504e470d0a1a0a', 'hex') }));
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from('00', 'hex') }));
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await openDrawer(page);
  check((await page.locator('.drawer-panel').innerText()).includes('Contractor status'),
    'the chip at the top says Contractor status');

  await page.locator('.drawer-panel button').filter({ hasText: /^Tasks/ }).first().click();
  await page.waitForTimeout(900);

  // The fold
  const toggle = page.locator('[data-thread-toggle]').first();
  check(await toggle.count() === 1, 'the Task messages heading is a button');
  check(await page.locator('[data-thread-count]').first().innerText() === '2',
    'and says how many messages there are', await page.locator('[data-thread-count]').first().innerText().catch(() => '-'));
  check(await page.locator('[data-video-tile]').count() === 1, 'the mp4 draws as a video tile, not a filename');
  await toggle.click(); await page.waitForTimeout(400);
  check(await page.locator('[data-video-tile]').count() === 0, 'pressing it folds the whole thread away');
  await toggle.click(); await page.waitForTimeout(400);
  check(await page.locator('[data-video-tile]').count() === 1, 'and pressing again brings it back');

  // The viewer
  await page.locator('[data-video-full]').first().click();
  await page.waitForTimeout(900);
  check(await page.locator('[data-media-viewer]').count() === 1, 'the film opens in the media viewer');
  const bar = page.locator('[data-media-viewer]');
  check(await bar.locator('[data-viewer-full]').count() === 1, 'with a full-screen button');
  check(await bar.locator('[data-viewer-download]').count() === 1, 'a download button');
  check(await bar.locator('[data-viewer-drive]').count() === 1, 'and a way to open it in Drive');
  check((await bar.innerText()).includes('20260917_112941.mp4'), 'the name is on the bar');
  await bar.locator('[data-viewer-info]').click(); await page.waitForTimeout(300);
  const info = await page.locator('[data-viewer-info-panel]').innerText().catch(() => '');
  check(/Name/.test(info) && /video\/mp4/.test(info), 'the info button tells you about the file', info.replace(/\n/g, ' · ').slice(0, 80));
  check(await bar.locator('[data-viewer-next]').count() === 1, 'the arrows walk the rest of the thread');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  check(await page.locator('[data-media-viewer]').count() === 0, 'Escape closes the viewer');
  check(await page.locator('.drawer-panel').count() === 1, 'and leaves the job window open');

  // A CAD file — Drive calls it an image; the name decides.
  await page.locator('[data-thread-toggle]').first().scrollIntoViewIfNeeded().catch(() => {});
  const cad = page.getByText('notes.dwg').first();
  if (await cad.count()) {
    await cad.click(); await page.waitForTimeout(600);
    const txt = await page.locator('[data-media-viewer]').innerText().catch(() => '');
    check(txt.includes('notes.dwg') && await page.locator('[data-viewer-video]').count() === 0,
      'a .dwg opens as a file card, never as a broken video (Drive calls it image/vnd.dwg)');
    await page.keyboard.press('Escape');
  } else check(false, 'the .dwg row is a pressable card');
  await ctx.close();
}

// ── B · crossing the current stage off moves the job on ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await openDrawer(page);
  await page.locator('[data-stage-picker]').first().click();
  await page.waitForTimeout(600);
  check(await page.locator('[data-stage-panel]').count() === 1, 'the stage list opens');
  // The box beside the CURRENT stage's row — a left press crosses it off.
  await page.locator('[data-stage-row="S2"] [data-stage-box]').first().click();
  await page.waitForTimeout(1200);
  const d = await store(page);
  const apt = (d.apartments || []).find(a => a.id === 'A1-7');
  check(apt?.stageMarks?.S2 === 'done', 'the stage is crossed off', JSON.stringify(apt?.stageMarks));
  check(apt?.currentStageId === 'S3', 'and the job moved to the next stage by itself', String(apt?.currentStageId));
  await ctx.close();
}

// ── C · a task the worker starts is stored in ENGLISH ──
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await seed(ctx);
  await ctx.route('**://drive.google.com/**', r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/c/tok-jo`); await page.waitForTimeout(2800);
  const map = page.locator('button').filter({ hasText: /Building Map|Карта здания|מפת/ }).first();
  await map.click(); await page.waitForTimeout(900);
  if (await page.locator('[data-map-square="wolfson"]').count()) {
    await page.locator('[data-map-square="wolfson"]').click(); await page.waitForTimeout(1200);
  }
  await page.locator('[data-apt-id="A1-7"]').first().click(); await page.waitForTimeout(800);
  await page.locator('[data-work-here]').click(); await page.waitForTimeout(1400);
  const d = await store(page);
  const made = (d.contractorAssignments || []).find(a => a.stageReport);
  check(!!made, 'the worker started a task');
  check(!!made && !/[Ѐ-ӿ]/.test(made.taskDescription),
    'and it is stored in English, not in his own language', made?.taskDescription ?? '-');
  check(!!made && /working here today/i.test(made.taskDescription),
    'the words are the plain English ones', made?.taskDescription ?? '-');
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall green');
process.exit(fails ? 1 : 0);
