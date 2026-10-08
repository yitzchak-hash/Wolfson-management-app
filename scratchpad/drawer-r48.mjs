// The apartment window, round 48 (owner's screen recording, 2026-10-08):
//
//  1. A CLOSED task in the Tasks tab reads as done — a green card (#ecfdf5 /
//     #a7f3d0), a bold "Done · <day> <date> · <time> · <who>" badge, the
//     stages it did as coloured pills (a half-done one marked), the words NOT
//     struck through, and the number of pictures. The closer comes from the
//     close's own history line (worker on the portal, office on a tick) and
//     falls back to the task's worker. Open tasks look as they always did.
//  2. The Photos tab draws each site photo ONCE — no "N new from the site"
//     block above the stage sections; an unreviewed photo wears NEW in place,
//     a Firebase-only one joins a section of its own, the header keeps
//     "Mark all reviewed (N)", and opening a new photo marks it reviewed.
//  3. The Drive folder and the Zoho link are sections that FOLD — one line
//     with a summary, remembered per machine — on the Job Board and on a
//     building unit alike.
//  4. The folder status never says "no plan PDF" beside a plan it is
//     showing, finds "photos" / "Engineered plans" whatever the case or
//     spacing, finds a PDF one folder down, and forgets itself when the link
//     changes. A folder that genuinely has nothing still says so.
//
// Runs against a KEYED dev server (the Drive block is dead without a key):
//   APP=http://localhost:5174 node scratchpad/drawer-r48.mjs
// Every /api route is stubbed — the catch-all FIRST, because Playwright
// consults routes newest-first — and drive.google.com is aborted.
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const APP = process.env.APP ?? 'http://localhost:5174';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan(title) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 30, y: 30, width: 782, height: 535, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  page.drawText(title, { x: 60, y: 520, size: 24, font, color: rgb(0.12, 0.23, 0.37) });
  return Buffer.from(await doc.save());
}
const PLAN = await makePlan('R48 SHEET');
// A 1×1 PNG — the Firebase-only site photo.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const FOLDER = 'application/vnd.google-apps.folder';
const PDF = 'application/pdf';
const JPG = 'image/jpeg';
// The folder titles exactly as the owner's Drive spells them — lowercase
// "photos" / "plans", a zero-width space in one, a double space in another.
const NAMES = {
  'F-job1': 'Probe Job One - 101', 'F-job2': 'Probe Job Two - 102', 'F-job3': 'Probe Job Three - 103',
  'F-wolf': 'Probe Unit, Family - 553',
};
const LISTING = {
  // Lowercase names; the PDF sits one folder DOWN inside the plans folder.
  'F-job1': [
    { id: 'F-j1-ph', name: 'photos', mimeType: FOLDER },
    { id: 'F-j1-ep', name: 'Engineered\u200bplans', mimeType: FOLDER },
    { id: 'F-j1-cad', name: 'AutoCAD', mimeType: FOLDER },
  ],
  'F-j1-ep': [{ id: 'F-j1-final', name: 'Final', mimeType: FOLDER }],
  'F-j1-final': [{ id: 'PDF-J1', name: 'sheet.pdf', mimeType: PDF }],
  // The owner's contradiction: an EMPTY plans folder, while the window shows
  // the starred plan that lives in AutoCAD.
  'F-job2': [
    { id: 'F-j2-ph', name: 'Photos', mimeType: FOLDER },
    { id: 'F-j2-ep', name: 'Engineered  plans', mimeType: FOLDER },
    { id: 'F-j2-cad', name: 'AutoCAD', mimeType: FOLDER },
  ],
  'F-j2-ep': [],
  'F-j2-cad': [{ id: 'PDF-J2', name: 'plan.pdf', mimeType: PDF }],
  // Nothing at all: the status must still say so.
  'F-job3': [{ id: 'F-j3-cad', name: 'AutoCAD', mimeType: FOLDER }],
  // The Wolfson unit's folder: photos/Drilling holds three pictures.
  'F-wolf': [
    { id: 'F-wph', name: 'photos', mimeType: FOLDER },
    { id: 'F-wep', name: 'Engineered plans', mimeType: FOLDER },
    { id: 'F-wcad', name: 'AutoCAD', mimeType: FOLDER },
  ],
  'F-wph': [{ id: 'F-wdrill', name: 'Drilling', mimeType: FOLDER }],
  'F-wdrill': [
    { id: 'IMG-1', name: 'drill-1.jpg', mimeType: JPG },
    { id: 'IMG-2', name: 'drill-2.jpg', mimeType: JPG },
    { id: 'IMG-3', name: 'drill-3.jpg', mimeType: JPG },
  ],
  'F-wep': [{ id: 'PDF-W', name: 'A1-53.pdf', mimeType: PDF }],
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function stubbed(viewport = { width: 1500, height: 950 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route('**/api/**', route => route.fulfill({ json: {} }));
  await ctx.route('**/api/drive-files', route => {
    const body = route.request().postDataJSON();
    if (body.metaOnly) {
      return route.fulfill({ json: { folder: { id: body.folderId, name: NAMES[body.folderId] ?? body.folderId, mimeType: FOLDER }, files: [] } });
    }
    return route.fulfill({ json: { files: LISTING[body.folderId] ?? [] } });
  });
  await ctx.route('**/api/drive-fetch', route => route.fulfill({ body: PLAN, contentType: 'application/pdf' }));
  await ctx.route('**/api/share', route => route.fulfill({ json: { ok: true } }));
  await ctx.route('**/api/folder', route => route.fulfill({ json: { folderId: 'F-made' } }));
  await ctx.route('**/api/drive-path', route => route.fulfill({ json: { path: [] } }));
  await ctx.route('**drive.google.com/**', route => route.abort());
  await ctx.route('**fonts.googleapis.com/**', route => route.abort());
  return ctx;
}
const waitFor = async (page, sel, ms = 12000) => {
  try { await page.locator(sel).first().waitFor({ state: 'visible', timeout: ms }); return true; }
  catch { return false; }
};
const closeDrawer = async page => {
  for (let i = 0; i < 5; i++) {
    if (await page.locator('.drawer-panel').count() === 0) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(450);
  }
};

// ══ A · the Job Board — asks 3 and 4 ═══════════════════════════════════════
{
  const ctx = await stubbed();
  await ctx.addInitScript(() => {
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    localStorage.setItem('board_default_zoom_general', '1');
    if (localStorage.getItem('general_app_data')) return;
    const job = (id, name, folder, x, extra = {}) => ({
      id, buildingId: 'G', floor: 0, apartmentNumber: '',
      displayName: name, isUnnamed: false, isDuplexApt: false,
      classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: x, canvasY: 200,
      driveLink: `https://drive.google.com/drive/folders/${folder}`,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
      ...extra,
    });
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser: { id: 'U-t', name: 'Office Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
      stages: [], contractors: [], contractorAssignments: [],
      apartments: [
        job('G-r48a', 'Probe Job One', 'F-job1', 300),
        job('G-r48b', 'Probe Job Two', 'F-job2', 560, { plansPdfLink: 'https://drive.google.com/file/d/PDF-J2/view' }),
        job('G-r48c', 'Probe Job Three', 'F-job3', 820),
      ],
      canvasElements: [],
    }));
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/localStorage/i.test(e.message)) { console.log('PAGE ERROR', e.message); fails++; } });
  await page.goto(`${APP}/jobs`);
  await page.waitForTimeout(2500);

  // ── 4a · the matchers, case- and spacing-insensitive ────────────────────
  // Guarded: a build without the helpers must FAIL these checks, not crash
  // the whole run (that is how the probe is proven non-vacuous).
  const m = await page.evaluate(async () => {
    const d = await import('/src/data/driveApi.ts');
    const F = 'application/vnd.google-apps.folder';
    const call = (fn, ...a) => (typeof d[fn] === 'function' ? d[fn](...a) : null);
    return {
      plans: ['Engineered Plans', 'Engineered plans', 'engineered plans ', 'Engineering Plans', 'EngineeredPlans',
        'Engineered_plans', 'Engineered\u200bplans', 'Engineered\u00a0Plans', '01 Engineered plans Final']
        .map(n => call('isEngineeredPlansFolder', n)),
      notPlans: ['AutoCAD', 'Plans old', 'Photos'].map(n => call('isEngineeredPlansFolder', n)),
      photos: ['Photos', 'photos', ' Photos ', 'PHOTO', 'Site photos', 'photos\u200b', '\u05ea\u05de\u05d5\u05e0\u05d5\u05ea']
        .map(n => call('isPhotosFolder', n)),
      notPhotos: ['Photography', 'AutoCAD', 'Engineered plans'].map(n => call('isPhotosFolder', n)),
      pick: call('pickPhotosFolder', [
        { id: 'old', name: 'Old photos', mimeType: F },
        { id: 'real', name: ' photos', mimeType: F },
        { id: 'file', name: 'photos', mimeType: 'image/jpeg' },
      ])?.id ?? null,
    };
  });
  check(m.plans.every(Boolean), 'every spelling of the plans folder matches (case, spacing, zero-width, underscore)', JSON.stringify(m.plans));
  check(!m.notPlans.some(Boolean), 'and AutoCAD / "Plans old" / Photos do not', JSON.stringify(m.notPlans));
  check(m.photos.every(Boolean), 'every spelling of the Photos folder matches', JSON.stringify(m.photos));
  check(!m.notPhotos.some(Boolean), 'and "Photography" does not', JSON.stringify(m.notPhotos));
  check(m.pick === 'real', 'the exact "photos" folder wins over "Old photos", and a FILE named photos is no folder', m.pick);

  // ── 4b · lowercase names, the PDF one folder down → complete ────────────
  await page.locator('[data-node-id="G-r48a"]').dblclick();
  check(await waitFor(page, '.drawer-panel [data-collapse-drive]'), 'the Job Board window draws the Drive section');
  const driveSum = async () => page.evaluate(() =>
    document.querySelector('.drawer-panel [data-link-section="drive"] [data-link-summary]')?.textContent?.trim() ?? '');
  await page.waitForTimeout(1200);
  check((await driveSum()).includes('Probe Job One - 101'), 'its folded line names the folder by its title', await driveSum());
  check(await page.locator('.drawer-panel [data-collapse-drive]').getAttribute('aria-expanded') === 'true',
    'open by default, so nothing changed for anybody who never folds it');
  const labelsShown = await page.evaluate(() =>
    [...document.querySelectorAll('.drawer-panel [data-link-section="drive"] label')]
      .filter(l => getComputedStyle(l).display !== 'none').length);
  check(labelsShown === 0, 'open, the field does not repeat the section\'s own label', `${labelsShown} shown`);
  await page.locator('.drawer-panel [data-folder-status-btn]').click();
  check(await waitFor(page, '.drawer-panel [data-folder-status]'), 'the Status button checks the folder');
  let status = await page.locator('.drawer-panel [data-folder-status]').first();
  check(await status.getAttribute('data-folder-status') === 'ok',
    '"photos" + "Engineered\u200bplans" + a PDF in Final → the folder is complete', (await status.textContent()).trim());

  // ── 4c · a changed link forgets the old answer ──────────────────────────
  await page.locator('.drawer-panel button[title="Change the google drive folder"]').click();
  const input = page.locator('.drawer-panel input[placeholder*="drive.google.com/drive/folders"]');
  await input.fill('https://drive.google.com/drive/folders/F-job3');
  await input.press('Enter');
  await page.waitForTimeout(900);
  check(await page.locator('.drawer-panel [data-folder-status]').count() === 0
    && await page.locator('.drawer-panel [data-folder-status-btn]').count() === 1,
    'a new Drive link drops the old folder\'s status — the button is back');
  await page.locator('.drawer-panel [data-folder-status-btn]').click();
  await waitFor(page, '.drawer-panel [data-folder-status]');
  status = page.locator('.drawer-panel [data-folder-status]').first();
  const t3 = (await status.textContent()).trim();
  check(await status.getAttribute('data-folder-status') === 'issues' && /no Photos folder/.test(t3) && /no Engineered Plans folder/.test(t3),
    'a folder that genuinely has nothing still says so', t3);
  await closeDrawer(page);

  // ── 4d · the owner's contradiction: an empty plans folder, a plan on screen ──
  await page.locator('[data-node-id="G-r48b"]').dblclick();
  await waitFor(page, '.drawer-panel [data-collapse-drive]');
  await page.waitForTimeout(1500);
  await page.locator('.drawer-panel [data-folder-status-btn]').click();
  await waitFor(page, '.drawer-panel [data-folder-status]');
  status = page.locator('.drawer-panel [data-folder-status]').first();
  const t2 = (await status.textContent()).trim();
  const hint = await page.evaluate(() =>
    document.querySelector('.drawer-panel [data-link-section="drive"]')?.textContent ?? '');
  check(/Plans found/.test(hint), 'the Drive row says the plan was found', hint.slice(0, 80));
  check(!/no plan PDF/i.test(t2) && !/no Engineered Plans/i.test(t2),
    'and the status never says "no plan PDF" beside the plan it is showing', t2);
  check(!/no Photos folder/i.test(t2), '"Photos" is found', t2);
  check(await status.getAttribute('data-folder-status') === 'ok', 'so the folder reads complete', t2);

  // ── 3 · Drive and Zoho fold, and stay folded on this machine ─────────────
  const zohoSum = await page.evaluate(() =>
    document.querySelector('.drawer-panel [data-link-section="zoho"] [data-link-summary]')?.textContent?.trim() ?? '');
  check(/not linked/.test(zohoSum), 'the Zoho section says "not linked" when there is none', zohoSum);
  await page.locator('.drawer-panel [data-collapse-drive]').click();
  await page.waitForTimeout(300);
  check(await page.locator('.drawer-panel [data-collapse-drive]').getAttribute('aria-expanded') === 'false'
    && await page.locator('.drawer-panel button[title="Change the google drive folder"]').count() === 0,
    'pressing the Drive line folds the field away');
  const openHref = await page.locator('.drawer-panel [data-link-open="drive"]').getAttribute('href').catch(() => null);
  check(!!openHref && openHref.includes('F-job2'), 'the folded line keeps a one-press way into the folder', openHref);
  await page.locator('.drawer-panel [data-collapse-zoho]').click();
  await page.waitForTimeout(300);
  check(await page.locator('.drawer-panel [data-collapse-zoho]').getAttribute('aria-expanded') === 'false',
    'the Zoho line folds too');
  check(await page.locator('.drawer-panel [data-link-open="zoho"]').count() === 0, 'with no open-arrow when nothing is linked');
  const stored = await page.evaluate(() => [localStorage.getItem('drawer_fold_drive'), localStorage.getItem('drawer_fold_zoho')]);
  check(stored[0] === '0' && stored[1] === '0', 'both choices are kept on this machine', JSON.stringify(stored));
  if (process.env.SHOTS) await page.locator('.drawer-panel').screenshot({ path: `${process.env.SHOTS}/r48-folded.png` });
  await closeDrawer(page);
  await page.locator('[data-node-id="G-r48a"]').dblclick();
  await waitFor(page, '.drawer-panel [data-collapse-drive]');
  // The window ignores presses for its first 400ms (they belong to the
  // gesture that opened it) — a press inside that settle reads as "folding
  // does nothing".
  await page.waitForTimeout(700);
  check(await page.locator('.drawer-panel [data-collapse-drive]').getAttribute('aria-expanded') === 'false'
    && await page.locator('.drawer-panel [data-collapse-zoho]').getAttribute('aria-expanded') === 'false',
    'another job opens with both still folded');
  await page.locator('.drawer-panel [data-collapse-drive]').click();
  await page.waitForTimeout(300);
  const back = await page.locator('.drawer-panel button[title="Change the google drive folder"]').count();
  const kept = await page.evaluate(() => localStorage.getItem('drawer_fold_drive'));
  check(back === 1 && kept === '1', 'pressing it again brings the field back, and that is kept too', `pencils ${back} · stored ${kept}`);
  await closeDrawer(page);
  await ctx.close();
}

// ══ B · a Wolfson unit — asks 1, 2, and 3 on a building ════════════════════
{
  // The apartments come from the app's own generator, through Vite.
  const boot = await browser.newContext();
  const bp = await boot.newPage();
  await bp.goto(`${APP}/`);
  const apts = await bp.evaluate(async () => (await import('/src/data/initialData.ts')).buildDefaultApartments());
  await boot.close();

  const at = (daysAgo, h, mi) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, mi, 0, 0); return d; };
  const doneAt = at(2, 14, 49);
  const officeAt = at(1, 9, 15);
  const oldAt = at(5, 11, 5);
  const iso = d => d.toISOString();
  const day = off => { const d = new Date(); d.setDate(d.getDate() + off); return d.toISOString().slice(0, 10); };

  const seed = {
    apartments: apts.map(a => a.id === 'A1-53' ? {
      ...a, displayName: 'Probe Unit, Family',
      driveLink: 'https://drive.google.com/drive/folders/F-wolf',
      plansPdfLink: 'https://drive.google.com/file/d/PDF-W/view',
    } : a),
    currentUser: { id: 'U-t', name: 'Office Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [
      { id: 's-drilling', name: 'Drilling', color: '#0891b2', order: 1, active: true, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      { id: 's2', name: 'Concealed Units Installed', color: '#0ea5e9', order: 2, active: true, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      { id: 's3', name: 'Inline Fans Installed', color: '#10b981', order: 3, active: true, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      { id: 's5', name: 'Outdoor Units Installed', color: '#ef4444', order: 5, active: true, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      { id: 's6', name: 'Thermostats & Haffala', color: '#8b5cf6', order: 6, active: true, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    ],
    contractors: [{ id: 'C-pw', name: 'Probe Worker', category: 'ac', token: 'R48ProbeWorkerToken00001', active: true, createdAt: '2026-01-01' }],
    contractorAssignments: [
      { id: 'T-DONE', contractorId: 'C-pw', apartmentId: 'A1-53', buildingId: 'A1',
        taskDescription: 'Drilling — working here today', stageId: 's-drilling', stageIds: ['s-drilling', 's2'],
        stageReport: true, stagesWorked: ['s-drilling', 's2'], stagesUnfinished: ['s2'], stagesFinished: false,
        dueDate: day(-2), completedAt: iso(doneAt), createdAt: iso(at(2, 8, 0)), createdBy: 'C-pw', createdByName: 'Probe Worker' },
      { id: 'T-OFFICE', contractorId: 'C-pw', apartmentId: 'A1-53', buildingId: 'A1',
        taskDescription: 'Fit the registers in the bedrooms', stageId: 's6',
        dueDate: day(-1), completedAt: iso(officeAt), createdAt: iso(at(3, 8, 0)), createdBy: 'U-t', createdByName: 'Office Probe' },
      { id: 'T-OLD', contractorId: 'C-pw', apartmentId: 'A1-53', buildingId: 'A1',
        taskDescription: 'Outdoor unit on the roof bracket', stageId: 's5',
        dueDate: day(-5), completedAt: iso(oldAt), createdAt: iso(at(6, 8, 0)), createdBy: 'U-t', createdByName: 'Office Probe' },
      { id: 'T-OPEN', contractorId: 'C-pw', apartmentId: 'A1-53', buildingId: 'A1',
        taskDescription: 'Pressure test the piping', stageId: 's3',
        dueDate: day(2), completedAt: null, createdAt: iso(at(1, 8, 0)), createdBy: 'U-t', createdByName: 'Office Probe' },
    ],
    contractorPhotos: [
      { id: 'P1', assignmentId: 'T-DONE', contractorId: 'C-pw', apartmentId: 'A1-53', filename: 'drill-1.jpg', fileType: 'image', mimeType: 'image/jpeg', driveFileId: 'IMG-1', dataUrl: '', uploadedAt: iso(at(2, 14, 40)) },
      { id: 'P2', assignmentId: 'T-DONE', contractorId: 'C-pw', apartmentId: 'A1-53', filename: 'drill-2.jpg', fileType: 'image', mimeType: 'image/jpeg', driveFileId: 'IMG-2', dataUrl: '', uploadedAt: iso(at(2, 14, 42)) },
      { id: 'P3', assignmentId: 'T-DONE', contractorId: 'C-pw', apartmentId: 'A1-53', filename: 'drill-3.jpg', fileType: 'image', mimeType: 'image/jpeg', driveFileId: 'IMG-3', dataUrl: '', uploadedAt: iso(at(2, 14, 44)), reviewedAt: iso(at(1, 8, 0)), reviewedBy: 'Office Probe' },
      // Firebase Storage only — never on the Drive listing.
      { id: 'P4', assignmentId: 'T-DONE', contractorId: 'C-pw', apartmentId: 'A1-53', filename: 'concealed.png', fileType: 'image', mimeType: 'image/png', storageUrl: PNG, stageId: 's2', dataUrl: '', uploadedAt: iso(at(2, 14, 46)) },
    ],
    activityLogs: [
      { id: 'L-1', userId: 'C-pw', userName: 'Probe Worker', buildingId: 'A1', apartmentId: 'A1-53', apartmentNumber: '53',
        actionType: 'contractor_complete', fieldChanged: 'completedAt', previousValue: '', newValue: 'Drilling — working here today',
        stageId: 's-drilling', createdAt: iso(new Date(doneAt.getTime() + 4000)) },
      { id: 'L-2', userId: 'U-t2', userName: 'Second Office', buildingId: 'A1', apartmentId: 'A1-53', apartmentNumber: '53',
        actionType: 'task_completed', fieldChanged: 'task', previousValue: '', newValue: 'Fit the registers in the bedrooms',
        stageId: 's6', createdAt: iso(new Date(officeAt.getTime() + 2000)) },
    ],
  };
  const ctx = await stubbed();
  await ctx.addInitScript(b => {
    localStorage.setItem('active_project', 'wolfson');
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    if (localStorage.getItem('wolfson_app_data')) return;
    localStorage.setItem('wolfson_app_data', b);
  }, JSON.stringify(seed));
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/localStorage/i.test(e.message)) { console.log('PAGE ERROR', e.message); fails++; } });
  await page.goto(`${APP}/project`);
  await page.waitForTimeout(3500);
  await page.locator('[data-apt-id="A1-53"]').first().click();
  check(await waitFor(page, '.drawer-panel'), 'the unit\'s window opens');
  await page.waitForTimeout(1500);

  // ── 3 on a building unit ─────────────────────────────────────────────────
  check(await page.locator('.drawer-panel [data-collapse-drive]').count() === 1
    && await page.locator('.drawer-panel [data-collapse-zoho]').count() === 1,
    'a building unit\'s window folds its Drive and Zoho sections too');

  // ── 1 · the Tasks tab ───────────────────────────────────────────────────
  await page.locator('.drawer-panel button:has-text("Tasks")').first().click();
  await page.waitForTimeout(900);
  const card = id => page.locator(`.drawer-panel [data-task-card="${id}"]`);
  const look = id => page.evaluate(id => {
    const el = document.querySelector(`.drawer-panel [data-task-card="${id}"]`);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const text = el.querySelector('[data-task-text]');
    return {
      done: el.getAttribute('data-task-done'),
      bg: cs.backgroundColor, border: cs.borderTopColor, opacity: cs.opacity,
      badge: el.querySelector('[data-task-done-badge]')?.textContent?.trim() ?? null,
      badgeWeight: el.querySelector('[data-task-done-badge]') ? getComputedStyle(el.querySelector('[data-task-done-badge]')).fontWeight : null,
      strike: text ? getComputedStyle(text).textDecorationLine : null,
      stages: [...el.querySelectorAll('[data-task-done-stage]')].map(p => ({ id: p.getAttribute('data-task-done-stage'), half: p.hasAttribute('data-half'), text: p.textContent.trim() })),
      photos: el.querySelector('[data-task-photo-count]')?.textContent?.trim() ?? null,
    };
  }, id);
  const wd = doneAt.toLocaleDateString('en-US', { weekday: 'short' });
  const mon = doneAt.toLocaleDateString('en-US', { month: 'short' });
  const wantDate = `${wd} ${doneAt.getDate()} ${mon} · 14:49`;
  const d1 = await look('T-DONE');
  check(!!d1 && d1.done === '1', 'the closed task is drawn as a DONE card');
  check(d1?.bg === 'rgb(236, 253, 245)' && d1?.border === 'rgb(167, 243, 208)',
    'a green card — the notebook\'s done colours', `${d1?.bg} / ${d1?.border}`);
  check(d1?.opacity === '1', 'not faded', d1?.opacity);
  check(!!d1?.badge && d1.badge.startsWith('Done') && d1.badge.includes(wantDate) && d1.badge.endsWith('Probe Worker'),
    `the badge says "Done · ${wantDate} · Probe Worker"`, d1?.badge);
  check(Number(d1?.badgeWeight) >= 700, 'in bold', d1?.badgeWeight);
  check(d1?.strike === 'none', 'the words are NOT struck through', d1?.strike);
  check(d1?.stages?.length === 2 && d1.stages[0].id === 's-drilling' && !d1.stages[0].half && /Drilling/.test(d1.stages[0].text),
    'the stage it finished is its own coloured pill', JSON.stringify(d1?.stages));
  check(d1?.stages?.[1]?.half === true, 'and the stage left half done is marked as such', JSON.stringify(d1?.stages?.[1]));
  check(d1?.photos === '4 photos', 'the card counts the pictures the task brought back', d1?.photos);
  const d2 = await look('T-OFFICE');
  check(!!d2?.badge && d2.badge.endsWith('Second Office'), 'a task ticked in the office names who ticked it', d2?.badge);
  const d3 = await look('T-OLD');
  check(!!d3?.badge && d3.badge.endsWith('Probe Worker'), 'a close older than the kept history falls back to the task\'s worker', d3?.badge);
  if (process.env.SHOTS) await page.locator('.drawer-panel').screenshot({ path: `${process.env.SHOTS}/r48-tasks.png` });
  const o = await look('T-OPEN');
  check(!!o && !o.done && !o.badge && o.bg === 'rgb(255, 255, 255)' && o.strike === 'none',
    'an open task looks exactly as before — white, no badge', JSON.stringify(o));
  check(await card('T-OPEN').locator('[data-stage-pill]').count() === 1, 'and keeps its stage chip');

  // ── 2 · the Photos tab: each picture once, NEW in place ────────────────
  await page.locator('.drawer-panel button:has-text("Photos")').first().click();
  check(await waitFor(page, '.drawer-panel [data-photo-section="Drilling"]'), 'the Drilling section draws');
  await page.waitForTimeout(500);
  const tab = () => page.evaluate(() => {
    const root = document.querySelector('.drawer-panel');
    const tiles = [...root.querySelectorAll('[data-photo-tile]')];
    const count = id => tiles.filter(t => t.getAttribute('data-photo-tile') === id).length;
    const drill = root.querySelector('[data-photo-section="Drilling"]');
    return {
      queueBlock: /new from the site/i.test(root.textContent),
      markAll: root.querySelector('[data-photos-mark-all]')?.textContent?.trim() ?? null,
      counts: { 'IMG-1': count('IMG-1'), 'IMG-2': count('IMG-2'), 'IMG-3': count('IMG-3'), P4: count('P4') },
      drillTiles: drill ? [...drill.querySelectorAll('[data-photo-tile]')].map(t => [t.getAttribute('data-photo-tile'), !!t.querySelector('[data-photo-new]')]) : [],
      p4Section: tiles.find(t => t.getAttribute('data-photo-tile') === 'P4')?.closest('[data-photo-section]')?.getAttribute('data-photo-section') ?? null,
      p4New: !!tiles.find(t => t.getAttribute('data-photo-tile') === 'P4')?.querySelector('[data-photo-new]'),
      newBadges: root.querySelectorAll('[data-photo-new]').length,
    };
  });
  let ph = await tab();
  check(!ph.queueBlock, 'the separate "N new from the site" block is gone');
  check(Object.values(ph.counts).every(n => n === 1), 'every picture is drawn exactly ONCE', JSON.stringify(ph.counts));
  check(JSON.stringify(ph.drillTiles) === JSON.stringify([['IMG-1', true], ['IMG-2', true], ['IMG-3', false]]),
    'inside Drilling, the two unreviewed ones wear NEW and the reviewed one does not', JSON.stringify(ph.drillTiles));
  check(ph.p4Section === 'Concealed Units Installed' && ph.p4New,
    'a site photo Drive does not carry sits in its stage\'s section, still NEW', `${ph.p4Section} new=${ph.p4New}`);
  check(ph.markAll === 'Mark all reviewed (3)', 'the header row keeps "Mark all reviewed (3)"', ph.markAll);
  if (process.env.SHOTS) await page.locator('.drawer-panel').screenshot({ path: `${process.env.SHOTS}/r48-photos.png` });
  const photoRec = id => page.evaluate(id => {
    const d = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
    return (d.contractorPhotos || []).find(p => p.id === id) ?? null;
  }, id);
  await page.locator('.drawer-panel [data-photo-tile="IMG-1"]').click();
  check(await waitFor(page, '[data-media-viewer]', 4000), 'pressing a new photo opens it in the viewer');
  await page.waitForTimeout(500);
  check(!!(await photoRec('P1'))?.reviewedAt, 'and opening it marks it reviewed');
  await page.locator('[data-viewer-close]').click();
  await page.waitForTimeout(400);
  check(await page.locator('.drawer-panel').count() === 1, 'closing the viewer leaves the window open');
  ph = await tab();
  check(ph.newBadges === 2 && ph.markAll === 'Mark all reviewed (2)', 'its NEW badge is gone and the count says 2', `${ph.newBadges} · ${ph.markAll}`);
  await page.locator('.drawer-panel [data-photos-mark-all]').click();
  await page.waitForTimeout(600);
  ph = await tab();
  check(ph.newBadges === 0 && ph.markAll === null, '"Mark all reviewed" clears every badge, and then is not offered', `${ph.newBadges} · ${ph.markAll}`);
  check(Object.values(ph.counts).every(n => n === 1),
    'and every picture is still there, once — reviewing a photo never makes it disappear', JSON.stringify(ph.counts));
  check(!!(await photoRec('P4'))?.reviewedAt && !!(await photoRec('P2'))?.reviewedAt, 'the records say so');
  await closeDrawer(page);
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
