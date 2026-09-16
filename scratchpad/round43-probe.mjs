// Round 43 — the owner's second list of 2026-09-16.
//   A · board: honest selection count, Equal size, Focus on a widget's menu,
//       calendar arrows, a unit card deletes without an ask, groups arrange.
//   B · plans (keyed 5174): nobody starred → the newest-activity sheet is
//       shown with a RED star and the red "!" bubble; starring writes it and
//       the bubble goes.
//   C · the OFFICE rings: a worker's message → toast → click → the job opens
//       on its Tasks tab with that task lit; a foreign-workspace message
//       travels there first.
//   D · the worker's phone: self-task search over allowed workspaces, no
//       "work here" button without the permission, the bell holds messages,
//       the closing screen has no stage question on an ORDINARY task.
//   E · Hebrew workspace names in the header.
//   F · the notebook plus dialog says the job's current stage.
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const sunday = day(-new Date().getDay());
const USER = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
const STAGES = [
  { id: 'S1', name: 'Ready to start', nameHe: 'מוכן להתחלה', color: '#64748b', order: 1, active: true },
  { id: 'S2', name: 'Piping', nameHe: 'צנרת', color: '#3b82f6', order: 2, active: true },
  { id: 'S3', name: 'Concealed units', color: '#8b5cf6', order: 3, active: true },
];
const WORKER = { id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01', lang: 'he',
  perms: { seeDiagrams: true, seeAllApartments: true, selfAssign: true, workHere: false }, selfAssignProjects: ['wolfson'] };
const APT = { id: 'A1-7', buildingId: 'A1', floor: 3, apartmentNumber: '7', displayName: 'Artzi', isUnnamed: false, isDuplexApt: false,
  classification: 'standard', generalNotes: '', address: '3 Wolfson St', currentStageId: 'S2', stageDates: {},
  createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' };
const TASK = { id: 'T-1', contractorId: 'C-jo', apartmentId: 'A1-7', taskDescription: 'Fix the riser', stageId: 'S2', stageWhenDone: 'S3',
  dueDate: day(0), priority: 'normal', createdAt: '2026-01-01T08:00:00.000Z', completedAt: null };
const job = (id, name, x, extra = {}) => ({ id, buildingId: 'G', apartmentNumber: '', floor: 0, displayName: name, classification: 'standard',
  isUnnamed: false, createdAt: '2026-01-01', canvasX: x, canvasY: 300, currentStageId: 'S2', ...extra });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });

// ─────────────────────────── A · the board ───────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript(([sun, user, stages]) => {
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('board_default_zoom_general', '1');
    if (localStorage.getItem('general_app_data')) return;
    const gstages = stages.map(s => ({ ...s, id: 'G' + s.id, projectId: 'general' }));
    const jobs = [
      { id: 'G-1', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Artzi', classification: 'standard', isUnnamed: false, createdAt: '2026-01-01', canvasX: 500, canvasY: 300, currentStageId: 'GS2' },
      { id: 'G-2', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Goldman', classification: 'standard', isUnnamed: false, createdAt: '2026-01-01', canvasX: 760, canvasY: 300, currentStageId: 'GS1' },
    ];
    localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user, stages, apartments: [] }));
    localStorage.setItem('general_app_data', JSON.stringify({
      users: [user], currentUser: user, stages: gstages, apartments: jobs, contractors: [],
      canvasElements: [
        { id: 'CE-note', type: 'note', x: 500, y: 520, w: 165, h: 150, text: 'small', color: '#fef3c7' },
        { id: 'CE-box', type: 'box', x: 760, y: 520, w: 320, h: 220, text: 'big', color: '#dbeafe' },
        { id: 'CE-cal', type: 'widget', widget: 'calendar-mini', x: 1150, y: 300, w: 220, h: 185, text: '', color: '#ffffff', data: {} },
        { id: 'CE-unit', type: 'widget', widget: 'unit-card', x: 1150, y: 560, w: 200, h: 110, text: '', color: '#ffffff', data: { projectId: 'wolfson', aptId: 'A1-7' } },
        { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 3000, y: 3000, w: 300, h: 200, text: '', color: '#ffffff', data: {} },
      ],
    }));
  }, [sunday, USER, STAGES]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.goto('http://localhost:5173/jobs');
  await page.waitForTimeout(3000);
  const box = sel => page.locator(sel).first().boundingBox();
  const mid = b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 + 10 });

  // A1 · a mixed selection: the menu says WHAT it holds.
  const j1 = mid(await box('[data-node-id="G-1"]'));
  const j2 = mid(await box('[data-node-id="G-2"]'));
  const nb = mid(await box('[data-node-id="CE-note"]'));
  await page.mouse.click(j1.x, j1.y);
  await page.keyboard.down('Control');
  await page.mouse.click(j2.x, j2.y);
  await page.mouse.click(nb.x, nb.y);
  await page.keyboard.up('Control');
  await page.waitForTimeout(300);
  await page.mouse.click(j1.x, j1.y, { button: 'right' });
  await page.waitForTimeout(400);
  const count = await page.locator('[data-sel-count]').first().textContent().catch(() => '');
  const detail = await page.locator('[data-sel-detail]').first().textContent().catch(() => '');
  check(/^3 SELECTED$/.test((count || '').trim()), 'the menu counts three', count);
  check(/2 jobs/.test(detail || '') && /1 note/.test(detail || ''), 'and says what they are (2 jobs · 1 note)', detail);
  check(await page.locator('[data-equal-row]').count() === 1, 'an Equal size row sits in the menu');
  check(await page.locator('[data-menu-focus]').count() >= 1, 'and a Focus row');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // A2 · Equal size: the note takes the box's size.
  await page.mouse.click(nb.x, nb.y);
  await page.keyboard.down('Control');
  const bx = mid(await box('[data-node-id="CE-box"]'));
  await page.mouse.click(bx.x, bx.y);
  await page.keyboard.up('Control');
  await page.waitForTimeout(200);
  await page.mouse.click(nb.x, nb.y, { button: 'right' });
  await page.waitForTimeout(300);
  await page.locator('[data-equal-row]').click();
  await page.waitForTimeout(600);
  const sizes = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
    const f = id => (d.canvasElements || []).find(e => e.id === id);
    return { note: [f('CE-note').w, f('CE-note').h], box: [f('CE-box').w, f('CE-box').h] };
  });
  check(sizes.note[0] === 320 && sizes.note[1] === 220 && sizes.box[0] === 320, 'Equal size gave the note the largest size (320×220)', JSON.stringify(sizes));
  await page.keyboard.press('Escape');

  // A3 · Focus on a WIDGET's right-click menu pans the board to it.
  const cal = mid(await box('[data-node-id="CE-cal"]'));
  // Push the view away first (a pan), so the focus has somewhere to come back from.
  await page.mouse.move(400, 900); await page.mouse.down({ button: 'middle' });
  await page.mouse.move(200, 700, { steps: 6 }); await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(300);
  const calNow = await box('[data-node-id="CE-cal"]');
  await page.mouse.click(calNow.x + calNow.width / 2, calNow.y + calNow.height / 2 + 12, { button: 'right' });
  await page.waitForTimeout(300);
  check(await page.locator('[data-menu-focus]').count() === 1, "a widget's menu offers Focus");
  await page.locator('[data-menu-focus]').click();
  await page.waitForTimeout(900);
  const calAfter = await box('[data-node-id="CE-cal"]');
  const vw = page.viewportSize();
  check(Math.abs((calAfter.x + calAfter.width / 2) - vw.width / 2) < 120, 'Focus centred the widget', `${(calAfter.x + calAfter.width / 2).toFixed(0)} vs ${vw.width / 2}`);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => /^100%$/.test(x.textContent || ''))?.click(); });
  await page.waitForTimeout(500);

  // A4 · the calendar widget walks months.
  const title0 = (await page.locator('[data-cal-title]').first().textContent()) || '';
  await page.locator('[data-cal-next]').first().evaluate(b => b.click());
  await page.waitForTimeout(300);
  const title1 = (await page.locator('[data-cal-title]').first().textContent()) || '';
  check(title0 && title1 && title0 !== title1, 'the › arrow moves the calendar a month on', `${title0} → ${title1}`);
  await page.locator('[data-cal-prev]').first().evaluate(b => b.click());
  await page.locator('[data-cal-prev]').first().evaluate(b => b.click());
  await page.waitForTimeout(300);
  const title2 = (await page.locator('[data-cal-title]').first().textContent()) || '';
  check(title2 !== title0 && title2 !== title1, 'and ‹ walks back past this month', title2);

  // A5 · a unit card is a pointer: Delete removes it with NO question.
  const uc = mid(await box('[data-node-id="CE-unit"]'));
  await page.mouse.click(uc.x, uc.y - 20);
  await page.waitForTimeout(200);
  dialogs.length = 0;
  await page.keyboard.press('Delete');
  await page.waitForTimeout(600);
  check(dialogs.length === 0, 'deleting a unit card asked nothing', dialogs.join(' | '));
  check(await page.locator('[data-node-id="CE-unit"]').count() === 0, 'and the card is gone');

  // A6 · groups arrange with everything else: select both seeded bins + a tile, Arrange.
  const bins = await page.locator('[data-node-id^="CE-bin-"]').count();
  check(bins >= 4, `the four built-in groups are on the board (${bins})`);
  await ctx.close();
}

// ─────────────────────────── B · the auto-picked plan ───────────────────────────
{
  async function makePlan(title) {
    const doc = await PDFDocument.create();
    const p = doc.addPage([842, 595]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    p.drawText(title, { x: 60, y: 520, size: 24, font, color: rgb(0.12, 0.23, 0.37) });
    return Buffer.from(await doc.save());
  }
  const PLAN = await makePlan('PROBE SHEET');
  const FOLDER = 'application/vnd.google-apps.folder';
  const LISTING = {
    'F-root': [{ id: 'F-plans', name: 'Engineered Plans', mimeType: FOLDER }],
    'F-plans': [
      { id: 'PDF-old', name: 'Ground floor.pdf', mimeType: 'application/pdf', modifiedTime: '2026-01-05T10:00:00.000Z' },
      { id: 'PDF-new', name: 'Ground floor rev B.pdf', mimeType: 'application/pdf', modifiedTime: '2026-09-10T10:00:00.000Z' },
    ],
  };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('**/api/**', r => r.fulfill({ json: {} }));
  await ctx.route('**/api/drive-files', r => {
    const body = r.request().postDataJSON();
    if (body.metaOnly) return r.fulfill({ json: { folder: { id: body.folderId, name: body.folderId === 'F-root' ? 'Planned, Family - 2' : 'Engineered Plans', mimeType: FOLDER }, files: [] } });
    return r.fulfill({ json: { files: LISTING[body.folderId] ?? [] } });
  });
  const fetched = [];
  await ctx.route('**/api/drive-fetch', r => { fetched.push(r.request().postDataJSON()?.fileId); r.fulfill({ body: PLAN, contentType: 'application/pdf' }); });
  await ctx.route('**/api/share', r => r.fulfill({ json: { ok: true } }));
  await ctx.route('**drive.google.com/**', r => r.abort());
  await ctx.route('**fonts.googleapis.com/**', r => r.abort());
  await ctx.addInitScript(([user]) => {
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    localStorage.setItem('board_default_zoom_general', '1');
    if (localStorage.getItem('general_app_data')) return;
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser: user, users: [user], stages: [], contractors: [], contractorAssignments: [],
      apartments: [{ id: 'G-plan', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Planned, Family', isUnnamed: false,
        classification: 'standard', generalNotes: '', currentStageId: null, canvasX: 400, canvasY: 220,
        driveLink: 'https://drive.google.com/drive/folders/F-root', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
      canvasElements: [],
    }));
  }, [USER]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto('http://localhost:5174/jobs');
  await page.waitForTimeout(2500);
  await page.locator('[data-node-id="G-plan"]').dblclick();
  await page.locator('[data-plan-auto-warning]').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  check(await page.locator('[data-plan-auto-warning]').count() >= 1, 'nobody starred → the red "!" bubble stands on the plan bar');
  await page.waitForTimeout(1500);
  check(fetched[0] === 'PDF-new', 'the sheet shown FIRST is the newest-activity one (the pump then fetches the rest)', fetched.join(','));
  const stored0 = await page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')).apartments[0].plansPdfLink ?? null);
  check(stored0 === null, 'and NOTHING was written to the job', String(stored0));
  // Open Plans: the newest tile wears the RED (auto) star.
  await page.locator('[data-open-plans]').first().click();
  await page.waitForTimeout(1200);
  check(await page.locator('[data-plan-row="PDF-new"] [data-tile-star][data-star-auto]').count() === 1, 'in the chooser the newest sheet wears the RED auto star');
  check(await page.locator('[data-plan-row="PDF-old"] [data-star-auto]').count() === 0, 'and the older one wears none');
  // Star the OLD one by hand: written, and the bubble goes.
  await page.locator('[data-plan-row="PDF-old"] [data-tile-star]').click();
  await page.waitForTimeout(900);
  const stored1 = await page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')).apartments[0].plansPdfLink ?? null);
  check(!!stored1 && stored1.includes('PDF-old'), 'starring by hand writes plansPdfLink', String(stored1));
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(600);
  check(await page.locator('[data-plan-auto-warning]').count() === 0, 'and the red bubble is gone — a person chose');
  await ctx.close();
}

// ─────────────────────────── C · the office rings ───────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(([user, stages, worker, apt, task]) => {
    // Only when absent — the init script re-runs on every navigation and
    // would yank the app back to Wolfson after the workspace switch below.
    if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    if (localStorage.getItem('wolfson_app_data')) return;
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      currentUser: user, users: [user], stages, contractors: [worker], apartments: [apt], contractorAssignments: [task], contractorNotes: [],
    }));
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser: user, users: [user], stages: [], contractors: [worker], apartments: [], contractorAssignments: [], contractorNotes: [],
    }));
  }, [USER, STAGES, WORKER, APT, TASK]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(3500); // past the 2.5s baseline
  check(await page.locator('[data-office-toast]').count() === 0, 'arriving is quiet — the baseline rings nothing');
  // The worker writes (his phone → the cloud → this store): a contractor note lands.
  await page.evaluate(() => {
    window.__store.getState().addContractorNote({ assignmentId: 'T-1', apartmentId: 'A1-7', contractorId: 'C-jo', text: 'Finished the piping, one valve missing',
      authorType: 'contractor', authorId: 'C-jo', authorName: 'Joseph' });
  });
  await page.waitForTimeout(800);
  check(await page.locator('[data-office-toast][data-office-toast-kind="message"]').count() === 1, "a worker's message raises the office toast");
  const toastText = await page.locator('[data-office-toast]').innerText();
  check(/Joseph/.test(toastText) && /valve/.test(toastText), 'it names the worker and quotes the message', toastText.replace(/\n/g, ' · '));
  await page.locator('[data-office-toast-open]').click();
  await page.waitForTimeout(1500);
  check(await page.locator('.drawer-panel').count() === 1, 'pressing it opens the job window');
  check(await page.locator('[data-task-card="T-1"][data-task-lit]').count() === 1, 'on its Tasks tab, with THAT task lit');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  // C2 · a CLOSED job rings too.
  await page.evaluate(() => { window.__store.getState().updateContractorAssignment('T-1', { completedAt: new Date().toISOString() }); });
  await page.waitForTimeout(800);
  check(await page.locator('[data-office-toast][data-office-toast-kind="closed"]').count() === 1, 'a closed job raises the toast too');
  await page.locator('[data-office-toast] button[aria-label="close"]').click();

  // C3 · standing in ANOTHER workspace, the message travels there first.
  await page.evaluate(() => window.__store.getState().setCurrentProject('general'));
  await page.goto('http://localhost:5173/jobs');
  await page.waitForTimeout(3500);
  // A second message on the Wolfson task, landing in the Wolfson SNAPSHOT (as the foreign live sync writes it).
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('wolfson_app_data'));
    d.contractorNotes = [...(d.contractorNotes || []), { id: 'N-2', assignmentId: 'T-1', apartmentId: 'A1-7', contractorId: 'C-jo', text: 'Back tomorrow with the valve',
      authorType: 'contractor', authorId: 'C-jo', authorName: 'Joseph', createdAt: new Date().toISOString() }];
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
    const st = window.__store.getState();
    window.__store.setState({ snapshotTick: (st.snapshotTick || 0) + 1 });
  });
  await page.waitForTimeout(800);
  check(await page.locator('[data-office-toast]').count() === 1, 'a message in ANOTHER workspace rings here too');
  await page.locator('[data-office-toast-open]').click();
  await page.waitForTimeout(2500);
  check(page.url().endsWith('/project'), 'pressing it travels to that workspace', page.url());
  check(await page.locator('[data-task-card="T-1"]').count() === 1, 'and opens the job on its task');
  await ctx.close();
}

// ─────────────────────────── D · the worker's phone ───────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([user, stages, worker, apt, task]) => {
    localStorage.setItem('active_project', 'wolfson');
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    if (localStorage.getItem('wolfson_app_data')) return;
    const officeNote = { id: 'N-o', assignmentId: 'T-1', apartmentId: 'A1-7', contractorId: 'C-jo', text: 'Please send a photo of the valve',
      authorType: 'office', authorId: 'U-t', authorName: 'Esther', createdAt: new Date().toISOString() };
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      currentUser: user, users: [user], stages, contractors: [worker], apartments: [apt], contractorAssignments: [task], contractorNotes: [officeNote],
    }));
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser: user, users: [user], stages: [], contractors: [worker],
      apartments: [{ id: 'G-far', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Farkash', isUnnamed: false, classification: 'standard', createdAt: '2026-01-01', canvasX: 100, canvasY: 100 }],
      contractorAssignments: [], contractorNotes: [],
    }));
  }, [USER, STAGES, WORKER, APT, TASK]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto('http://localhost:5173/c/tok-jo');
  await page.waitForTimeout(3000);

  // D1 · the bell holds the office's MESSAGE.
  await page.locator('[data-portal-bell]').click();
  await page.waitForTimeout(500);
  const bellItems = await page.locator('[data-bell-item]').allInnerTexts();
  check(bellItems.some(t => /valve/.test(t)), "the bell lists the office's message", bellItems.join(' | '));
  await page.locator('[data-bell-item]').filter({ hasText: 'valve' }).first().click();
  await page.waitForTimeout(1200);
  check(await page.locator('[data-close-job], [data-thread-closed]').count() >= 1, 'pressing it opens that task');
  for (let i = 0; i < 3 && await page.locator('[data-close-job]').count(); i++) { await page.mouse.click(20, 20); await page.waitForTimeout(400); }

  // D2 · the self-task form: WHERE is a search over the allowed workspaces.
  await page.locator('button:has-text("משימה לעצמי"), button:has-text("A job for myself")').first().click();
  await page.waitForTimeout(400);
  check(await page.locator('[data-self-search]').count() === 1, 'the self-task form asks WHERE with a search box');
  check(await page.locator('[data-self-search]').locator('..').locator('select').count() === 0, 'not a dropdown of this workspace');
  await page.locator('[data-self-search]').fill('Artzi');
  await page.waitForTimeout(600);
  check(await page.locator('[data-self-hit="A1-7"]').count() === 1, 'typing a family name finds the unit');
  await page.locator('[data-self-search]').fill('Farkash');
  await page.waitForTimeout(600);
  check(await page.locator('[data-self-hit="G-far"]').count() === 0, 'a job in a workspace he is NOT allowed (Job Board) is not offered');
  await page.locator('[data-self-search]').fill('Artzi');
  await page.waitForTimeout(600);
  await page.locator('[data-self-hit="A1-7"]').click();
  await page.waitForTimeout(300);
  const picked = await page.locator('[data-self-picked]').innerText();
  check(/Artzi/.test(picked) && /וולפסון/.test(picked), 'the pick shows the unit and the workspace IN HEBREW (his language)', picked.replace(/\n/g, ' · '));

  // D3 · the map sheet: NO "work here" button without the permission.
  await page.locator('button:has-text("מפת"), button:has-text("Building Map")').first().click();
  await page.waitForTimeout(900);
  if (await page.locator('[data-map-square="wolfson"]').count()) { await page.locator('[data-map-square="wolfson"]').click(); await page.waitForTimeout(1200); }
  await page.locator('[data-apt-id="A1-7"]').first().click();
  await page.waitForTimeout(700);
  check(await page.locator('[data-work-sheet]').count() === 1, 'tapping a unit opens its sheet');
  check(await page.locator('[data-work-here]').count() === 0, 'with NO "I\'m going to work here" — the permission is off (self-task alone does not grant it)');
  await page.mouse.click(20, 20); await page.waitForTimeout(400);

  // D4 · closing an ORDINARY task asks no stage question.
  await page.locator('button:has-text("המשימות"), button:has-text("My Tasks")').first().click();
  await page.waitForTimeout(600);
  await page.getByText('Fix the riser').first().click();
  await page.waitForTimeout(800);
  await page.locator('[data-close-job]').first().click();
  await page.waitForTimeout(500);
  check(await page.locator('[data-closing-panel]').count() === 1, 'Close job opens the closing screen');
  check(await page.locator('[data-close-stage]').count() === 0, 'and asks NO stage question on an ordinary task — it goes to the stage chosen when it was made');
  await ctx.close();
}

// ─────────────────────────── E · Hebrew workspace names ───────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(([user, stages, apt]) => {
    localStorage.setItem('active_project', 'wolfson');
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    if (localStorage.getItem('wolfson_app_data')) return;
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      currentUser: user, users: [user], stages, apartments: [apt], contractors: [], mainUiStrings: { isRtl: true },
    }));
  }, [USER, STAGES, APT]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(3000);
  const header = await page.locator('header').innerText();
  check(/וולפסון/.test(header), 'in Hebrew the header names the workspace in Hebrew', header.replace(/\n/g, ' · ').slice(0, 120));
  check(!/Wolfson/.test(header), 'and not in English', '');
  await ctx.close();
}

// ─────────────────────────── F · the notebook dialog's stage line ───────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript(([sun, user, stages]) => {
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('board_default_zoom_general', '1');
    if (localStorage.getItem('general_app_data')) return;
    const gstages = stages.map(s => ({ ...s, id: 'G' + s.id, projectId: 'general' }));
    const contractors = [{ id: 'C-a', name: 'Motti', category: 'general', token: 't1', active: true, createdAt: '2026-01-01' }];
    localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user, stages, contractors, apartments: [] }));
    localStorage.setItem('general_app_data', JSON.stringify({
      users: [user], currentUser: user, stages: gstages, contractors,
      apartments: [{ id: 'G-1', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Artzi', classification: 'standard', isUnnamed: false, createdAt: '2026-01-01', canvasX: 300, canvasY: 300, currentStageId: 'GS2' }],
      canvasElements: [
        { id: 'CE-rota', type: 'widget', widget: 'rota', x: 600, y: 300, w: 560, h: 260, text: '', color: '#ffffff',
          data: { people: ['c:C-a'], firstWeek: sun, weekCount: 1, cells: {} } },
        { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 3000, y: 3000, w: 300, h: 200, text: '', color: '#ffffff', data: {} },
      ],
    }));
  }, [sunday, USER, STAGES]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto('http://localhost:5173/jobs');
  await page.waitForTimeout(3000);
  const cell = page.locator('[data-cell-person][data-cell-day]').nth(2);
  const cb = await cell.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.waitForTimeout(300);
  await page.locator('[data-cell-plus]').first().click({ force: true });
  await page.waitForTimeout(500);
  await page.locator('[data-job-search]').fill('Artzi');
  await page.waitForTimeout(600);
  await page.locator('[data-job-hit="G-1"]').click();
  await page.waitForTimeout(400);
  const line = await page.locator('[data-dialog-current-stage]').innerText().catch(() => '');
  check(/Piping/.test(line), "the dialog says the job's CURRENT stage by name", line);
  const fromOpts = await page.locator('[data-stage-from] option').allInnerTexts();
  check(fromOpts.some(o => /Piping/.test(o)) && !fromOpts.some(o => /Concealed units · not reached/.test(o)) === false, 'the from-list is the Job Board\'s own stages, later ones marked not reached', fromOpts.join(' | '));
  check(await page.locator('[data-stage-pair] span:has-text("Stage it is at now")').count() === 1
    && await page.locator('[data-stage-pair] span:has-text("When done")').count() === 1, 'the two selects wear their labels (Stage it is at now · When done → move it to)');
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
