// Moving a task to another apartment (owner, 2026-10-05): a worker recorded a
// day's work — a closed stage report with photos and a closing message — on
// A1 floor 3 when he was in A3 floor 3. This drives the real UI end to end:
//
//   OFFICE (the apartment window's Tasks tab)
//   - the delete is the app's own dialog naming what goes with the task, and
//     its "move it instead" opens the move flow; Escape closes that and the
//     job window behind stays open;
//   - the move: building tab, search, pick, the confirm sentence naming the
//     task, the photos, the message, both apartments and the stage tick;
//   - after it, in localStorage: the task, its 3 photos and its note carry
//     A3-10; Registers DONE is off A1-10 and on A3-10; Piping (another task's
//     tick) is untouched; one history line on EACH apartment, drawn in words;
//   - the dialog's Delete really deletes, and the Tasks page carries both;
//   - no native browser dialog appears anywhere.
//   WORKER (his phone)
//   - without the switch there is no move button;
//   - with a personal override he moves his own task, in Russian, and the
//     records follow, written in his name.
//
// Run with the app served from THIS checkout: APP=http://localhost:5194 node scratchpad/movetask.mjs
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://localhost:5173';
// SHOTS=<dir> saves a picture of each dialog there (never into the repo).
const SHOTS = process.env.SHOTS;
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/movetask-${name}.png` }); };
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ── the seed ────────────────────────────────────────────────────────────────
// The apartments come from the app's own generator, read through Vite from a
// page that is then CLOSED (its flush-on-unload would put the unpatched data
// straight back over ours — the standing trap).
const gen = await browser.newContext();
const genPage = await gen.newPage();
await genPage.goto(`${APP}/`);
const APTS = await genPage.evaluate(async () => (await import('/src/data/initialData.ts')).buildDefaultApartments());
await gen.close();

const day = off => { const d = new Date(); d.setDate(d.getDate() + off); return d.toISOString().slice(0, 10); };
const YESTERDAY = day(-1);
const NOW = new Date().toISOString();
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const stage = (id, name, order, kind) => ({ id, name, order, kind, active: true, color: '#64748b', createdAt: '2026-01-01', updatedAt: '2026-01-01' });
const STAGES = [
  stage('st-ready', 'Ready to start', 0, 'marker'),
  stage('s1-piping', 'Piping', 2, 'work'),
  stage('s4-wall', 'Wall Units', 5, 'work'),
  stage('s7-registers', 'Registers', 7, 'work'),
  stage('s7-panels', 'Access Panels', 8, 'work'),
  stage('st-done', 'Job completed', 20, 'marker'),
];
const apartments = APTS.map(a => {
  if (a.id === 'A1-10') return { ...a, displayName: 'Rottenstreich', bubbles: true, currentStageId: 's7-panels',
    stageMarks: { 's1-piping': 'done', 's4-wall': 'done', 's7-registers': 'done' } };
  if (a.id === 'A3-10') return { ...a, displayName: 'Aharonov', bubbles: true, currentStageId: 's7-registers',
    stageMarks: { 's1-piping': 'done', 's4-wall': 'done' } };
  return a;
});
const task = (id, extra) => ({
  id, contractorId: 'C-igor', apartmentId: 'A1-10', buildingId: 'A1', dueDate: YESTERDAY, priority: 'normal',
  createdAt: `${YESTERDAY}T06:00:00Z`, createdBy: 'C-igor', createdByName: 'Igor', completedAt: null, stageId: null, ...extra,
});
const photo = (id, assignmentId, filename, extra = {}) => ({
  id, assignmentId, apartmentId: 'A1-10', contractorId: 'C-igor', dataUrl: PNG, filename,
  fileType: 'image', uploadedAt: `${YESTERDAY}T14:00:00Z`, ...extra,
});
const note = (id, assignmentId, text) => ({
  id, assignmentId, apartmentId: 'A1-10', contractorId: 'C-igor', text, authorType: 'contractor',
  authorId: 'C-igor', authorName: 'Igor', createdAt: `${YESTERDAY}T15:00:00Z`,
});
const blob = ({ office, workerPerms, workerLang, hebrew }) => JSON.stringify({
  apartments,
  // The office in Hebrew is a whole-store flag (mergeFreshMainUi fills the rest).
  ...(hebrew ? { mainUiStrings: { isRtl: true } } : {}),
  stages: STAGES,
  ...(office ? { currentUser: { id: 'U-yitz', name: 'Yitzchak', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' } } : {}),
  contractors: [{
    id: 'C-igor', name: 'Igor', category: 'ac', token: 'tok-igor', active: true, createdAt: '2026-01-01',
    ...(workerLang ? { lang: workerLang } : {}),
    ...(workerPerms ? { perms: workerPerms } : {}),
  }],
  contractorAssignments: [
    // The day's work, recorded on the wrong apartment: a closed stage report.
    task('T-REG', { taskDescription: 'Registers — working here today', stageReport: true,
      stageId: 's7-registers', stageIds: ['s7-registers'], stagesWorked: ['s7-registers'],
      stagesUnfinished: [], stagesFinished: true, completedAt: `${YESTERDAY}T15:05:00Z` }),
    // Somebody else's earlier work on A1-10 — its Piping tick must not move.
    task('T-PIPE', { taskDescription: 'Piping run to the riser', contractorId: 'C-other', createdByName: 'Office',
      stageId: 's1-piping', stageIds: ['s1-piping'], completedAt: '2026-09-01T10:00:00Z' }),
    // An old open task, for the delete dialog.
    task('T-DEL', { taskDescription: 'Fix the condensate drain', dueDate: day(3) }),
  ],
  contractorPhotos: [
    photo('P-1', 'T-REG', 'reg-1.jpg'), photo('P-2', 'T-REG', 'reg-2.jpg'), photo('P-3', 'T-REG', 'reg-3.jpg'),
    photo('P-D1', 'T-DEL', 'drain-1.jpg', { driveFileId: 'DRV-1', driveUrl: 'https://drive.google.com/file/d/DRV-1/view', dataUrl: '' }),
    photo('P-D2', 'T-DEL', 'drain-2.jpg'),
    photo('P-D3', 'T-DEL', 'walkround.mp4', { fileType: 'video', mimeType: 'video/mp4', dataUrl: '' }),
  ],
  contractorNotes: [
    note('N-1', 'T-REG', 'Registers done in all rooms'),
    note('N-D1', 'T-DEL', 'Drain is blocked'), note('N-D2', 'T-DEL', 'Back tomorrow'),
    note('N-D3', 'T-DEL', 'Needs a longer pipe'), note('N-D4', 'T-DEL', 'Office: ok'),
  ],
  activityLogs: [],
});

async function seeded(viewport, data) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(b => {
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
    // Only when absent — this re-runs on every navigation, and an
    // unconditional write would wipe what the app just saved.
    if (!localStorage.getItem('wolfson_app_data')) localStorage.setItem('wolfson_app_data', b);
  }, data);
  return ctx;
}
const read = page => page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data') || '{}'));

// ═══ OFFICE ═════════════════════════════════════════════════════════════════
{
  const ctx = await seeded({ width: 1500, height: 950 }, blob({ office: true }));
  const page = await ctx.newPage();
  const errs = [];
  let native = 0;
  page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  page.on('dialog', d => { native++; d.dismiss().catch(() => {}); });
  await page.goto(`${APP}/project`);
  await page.waitForTimeout(3000);
  await page.locator('[data-apt-id="A1-10"]').first().click();
  await page.waitForTimeout(1200);
  await page.locator('.drawer-panel button:has-text("Tasks")').first().click();
  await page.waitForTimeout(800);

  check(await page.locator('[data-task-move="T-REG"]').count() === 1, 'every task card in the Tasks tab carries a move button');

  // ── the delete dialog says what goes with the task ─────────────────────────
  await page.locator('[data-task-delete="T-DEL"]').click();
  await page.waitForTimeout(400);
  const delText = (await page.locator('[data-task-delete-dialog]').textContent().catch(() => '')) ?? '';
  check(native === 0 && delText.length > 0, 'the trash opens the app\'s own dialog, not the browser\'s', `native=${native}`);
  check(/2 photos, 1 film and 4 messages/.test(delText),
    'it names what goes with the task: 2 photos, 1 film and 4 messages', delText.replace(/\s+/g, ' ').slice(0, 140));
  check(/files stay in Google Drive/.test(delText), 'and says the files themselves stay in Google Drive');
  await shot(page, 'office-delete');
  await page.locator('[data-task-delete-move]').click();
  await page.waitForTimeout(400);
  check(await page.locator('[data-task-delete-dialog]').count() === 0 && await page.locator('[data-move-dialog]').count() === 1,
    '"Move it to another apartment instead" opens the move flow in its place');
  check(/Fix the condensate drain/.test(await page.locator('[data-move-dialog]').textContent()),
    'for the same task');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(await page.locator('[data-move-dialog]').count() === 0, 'Escape closes the move dialog');
  check(await page.locator('.drawer-panel').count() === 1 && await page.locator('.drawer-panel').isVisible(),
    '…and the apartment window behind it stays open');

  // ── the move ───────────────────────────────────────────────────────────────
  await page.locator('[data-task-move="T-REG"]').click();
  await page.waitForTimeout(400);
  check(await page.locator('[data-move-dialog]').count() === 1, 'the move dialog opens');
  check(await page.locator('[data-move-pick="A1-10"]').count() === 0, 'the apartment it is on is not offered');
  check(await page.locator('[data-move-pick]').count() > 100, 'every real unit of the workspace is', String(await page.locator('[data-move-pick]').count()));
  check(await page.locator('[data-move-pick="A1-57"]').count() === 0, 'a blank basement slot is not');
  await page.locator('[data-move-building="A3"]').click();
  await page.waitForTimeout(200);
  const ids = await page.locator('[data-move-pick]').evaluateAll(els => els.map(e => e.getAttribute('data-move-pick')));
  check(ids.length > 0 && ids.every(i => i.startsWith('A3-')), 'the A3 tab shows only A3', `${ids.length} rows`);
  await page.locator('[data-move-search]').fill('10');
  await page.waitForTimeout(300);
  await shot(page, 'office-pick');
  const first = await page.locator('[data-move-pick]').first().getAttribute('data-move-pick');
  check(first === 'A3-10', 'searching "10" puts A3 10 first', first);
  const rowText = await page.locator('[data-move-pick="A3-10"]').textContent();
  check(/Aharonov/.test(rowText) && /Floor 3/.test(rowText), 'the row says the family and the floor', rowText.replace(/\s+/g, ' '));
  await page.locator('[data-move-pick="A3-10"]').click();
  await page.waitForTimeout(300);
  const sentence = (await page.locator('[data-move-sentence]').textContent())?.replace(/\s+/g, ' ') ?? '';
  check(sentence === "The task 'Registers — working here today', 3 photos and 1 message move from A1 10 to A3 10.",
    'the confirm says exactly what moves', sentence);
  const marks = (await page.locator('[data-move-marks-line]').allTextContents()).join(' | ');
  check(marks === 'Registers done comes off A1 10 and goes onto A3 10.', 'and what happens to the stage tick', marks);
  check(await page.locator('[data-move-marks]').isChecked(), 'moving the ticks is on by default');
  await shot(page, 'office-confirm');
  await page.locator('[data-move-confirm]').click();
  await page.waitForTimeout(1200);

  const d = await read(page);
  const t = d.contractorAssignments.find(x => x.id === 'T-REG');
  check(t?.apartmentId === 'A3-10' && t?.buildingId === 'A3', 'the task now sits on A3-10 (building too)', `${t?.apartmentId} ${t?.buildingId}`);
  const ph = d.contractorPhotos.filter(x => x.assignmentId === 'T-REG');
  check(ph.length === 3 && ph.every(x => x.apartmentId === 'A3-10'), 'its 3 photos carry A3-10', ph.map(x => x.apartmentId).join(','));
  const nt = d.contractorNotes.filter(x => x.assignmentId === 'T-REG');
  check(nt.length === 1 && nt[0].apartmentId === 'A3-10', 'its message carries A3-10');
  const a1 = d.apartments.find(x => x.id === 'A1-10');
  const a3 = d.apartments.find(x => x.id === 'A3-10');
  check(a1.stageMarks?.['s7-registers'] !== 'done', 'Registers DONE is gone from A1-10', JSON.stringify(a1.stageMarks));
  check(a1.stageMarks?.['s1-piping'] === 'done', 'Piping — another task\'s tick — is untouched on A1-10');
  check(a1.currentStageId === 's7-registers', 'A1-10\'s headline walks back to Registers (next to do)', a1.currentStageId);
  check(a3.stageMarks?.['s7-registers'] === 'done', 'Registers DONE is on A3-10', JSON.stringify(a3.stageMarks));
  check(a3.currentStageId === 's7-panels', 'A3-10\'s headline walks on to Access Panels', a3.currentStageId);
  const out = d.activityLogs.find(l => l.actionType === 'task_moved_out');
  const inn = d.activityLogs.find(l => l.actionType === 'task_moved_in');
  check(out?.apartmentId === 'A1-10' && inn?.apartmentId === 'A3-10', 'one history line on EACH apartment');
  check([out, inn].every(l => l?.userName === 'Yitzchak' && l?.workerName === 'Igor' && l?.taskText === 'Registers — working here today'),
    'both name who moved it, whose task it is, and the task');

  const hist = async () => {
    await page.locator('.drawer-panel button:has-text("History")').first().click();
    await page.waitForTimeout(600);
    return ((await page.locator('.drawer-panel').textContent()) ?? '').replace(/\s+/g, ' ');
  };
  check(await page.locator('[data-task-card="T-REG"]').count() === 0, 'the task has left A1-10\'s Tasks tab');
  // The words come from the activity log's one sentence builder (activityWords):
  // the sentence names the worker and the place; the task's words ride the
  // small line under it ("Registers", from "Registers — working here today").
  const OUT = "Yitzchak moved Igor's task to A3 10";
  const IN = "Yitzchak moved Igor's task here from A1 10";
  const h1 = await hist();
  check(h1.includes(OUT), 'A1-10\'s history says it in words', h1.includes(OUT) ? OUT : h1.slice(0, 160));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.locator('[data-apt-id="A3-10"]').first().click();
  await page.waitForTimeout(1200);
  const h3 = await hist();
  check(h3.includes(IN), 'A3-10\'s history says it in words', h3.includes(IN) ? IN : h3.slice(0, 160));
  await page.locator('.drawer-panel button:has-text("Tasks")').first().click();
  await page.waitForTimeout(500);
  check(await page.locator('[data-task-card="T-REG"]').count() === 1, 'and the task is in A3-10\'s Tasks tab');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  // ── the dialog's Delete really deletes ─────────────────────────────────────
  await page.locator('[data-apt-id="A1-10"]').first().click();
  await page.waitForTimeout(1200);
  await page.locator('.drawer-panel button:has-text("Tasks")').first().click();
  await page.waitForTimeout(500);
  await page.locator('[data-task-delete="T-DEL"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-task-delete-yes]').click();
  await page.waitForTimeout(900);
  const d2 = await read(page);
  check(!d2.contractorAssignments.some(x => x.id === 'T-DEL')
    && !d2.contractorPhotos.some(x => x.assignmentId === 'T-DEL') && !d2.contractorNotes.some(x => x.assignmentId === 'T-DEL'),
    'Delete removes the task with its photos and messages, as it said it would');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // ── the Tasks page carries both ────────────────────────────────────────────
  await page.goto(`${APP}/tasks`);
  await page.waitForTimeout(2000);
  check(await page.locator('[data-task-move="T-PIPE"]').count() === 1, 'the Tasks page rows carry the move button');
  await page.locator('[data-task-delete="T-PIPE"]').click();
  await page.waitForTimeout(400);
  check(await page.locator('[data-task-delete-dialog]').count() === 1, 'and its trash opens the same dialog');
  await page.locator('[data-task-delete-move]').click();
  await page.waitForTimeout(400);
  check(await page.locator('[data-move-dialog]').count() === 1, 'whose move button opens the move flow there too');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ── Settings → Workers: the new switch, and the override rule ──────────────
  await page.goto(`${APP}/app-settings`);
  await page.waitForTimeout(1800);
  await page.locator('button:has-text("Workers")').first().click();
  await page.waitForTimeout(600);
  await page.locator('button:has-text("change one just for them")').first().click();
  await page.waitForTimeout(400);
  const sw = page.locator('label', { hasText: 'Move their own work to another apartment' }).locator('input[type=checkbox]');
  check(await sw.count() === 1, 'Settings → Workers lists "Move their own work to another apartment"');
  check(!(await sw.isChecked()), 'off for a worker on the Contractor level');
  await sw.click();
  await page.waitForTimeout(600);
  let igor = (await read(page)).contractors.find(c => c.id === 'C-igor');
  check(igor.perms?.moveOwnWork === true, 'switching it on writes a personal override', JSON.stringify(igor.perms));
  await sw.click();
  await page.waitForTimeout(600);
  igor = (await read(page)).contractors.find(c => c.id === 'C-igor');
  check(igor.perms?.moveOwnWork === undefined, 'switching it back to the level\'s answer REMOVES the override', JSON.stringify(igor.perms));

  check(native === 0, 'no native browser dialog appeared anywhere', String(native));
  check(!errs.length, 'no page errors (office)', errs[0] || '');
  await ctx.close();
}

// ═══ OFFICE, in Hebrew — the same sentence, Hebrew's "and" a prefix ═══════════
{
  const ctx = await seeded({ width: 1500, height: 950 }, blob({ office: true, hebrew: true }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  await page.goto(`${APP}/project`);
  await page.waitForTimeout(3000);
  await page.locator('[data-apt-id="A1-10"]').first().click();
  await page.waitForTimeout(1200);
  await page.locator('.drawer-panel button:has-text("משימות")').first().click();
  await page.waitForTimeout(600);
  check(await page.locator('[data-task-move="T-REG"]').getAttribute('title') === 'העברה לדירה אחרת…', 'the move button speaks Hebrew');
  await page.locator('[data-task-move="T-REG"]').click();
  await page.waitForTimeout(400);
  check(await page.locator('[data-move-dialog]').getAttribute('dir') === 'rtl', 'the dialog runs right to left');
  await page.locator('[data-move-building="A3"]').click();
  await page.locator('[data-move-search]').fill('10');
  await page.waitForTimeout(300);
  await page.locator('[data-move-pick="A3-10"]').click();
  await page.waitForTimeout(300);
  await shot(page, 'office-hebrew');
  const sentence = (await page.locator('[data-move-sentence]').textContent())?.replace(/\s+/g, ' ') ?? '';
  check(sentence === "המשימה 'Registers — working here today', 3 תמונות והודעה אחת עוברים מ-A1 10 ל-A3 10.",
    'the confirm in Hebrew: "…3 תמונות והודעה אחת עוברים…"', sentence);
  const marks = (await page.locator('[data-move-marks-line]').allTextContents()).join(' | ');
  check(marks === 'Registers (גמור) יורד מ-A1 10 ועובר ל-A3 10.', 'and the tick, in Hebrew', marks);
  await page.locator('[data-move-confirm]').click();
  await page.waitForTimeout(1000);
  const d = await read(page);
  check(d.contractorAssignments.find(x => x.id === 'T-REG')?.apartmentId === 'A3-10', 'and it moves');
  await page.locator('.drawer-panel button:has-text("היסטוריה")').first().click();
  await page.waitForTimeout(600);
  await shot(page, 'office-hebrew-history');
  // The quoted task is wrapped in Unicode isolates (FSI…PDI) in a right-to-left
  // UI; they are invisible, so the words are compared with them taken out.
  const h = ((await page.locator('.drawer-panel').textContent()) ?? '').replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ');
  const HE = "Yitzchak העביר את המשימה של Igor ל־A3 10";
  check(h.includes(HE), 'the history line in Hebrew', h.includes(HE) ? HE : h.slice(0, 160));
  check(!errs.length, 'no page errors (office, Hebrew)', errs[0] || '');
  await ctx.close();
}

// ═══ WORKER — without the switch ════════════════════════════════════════════
{
  const ctx = await seeded({ width: 390, height: 844 }, blob({ office: false }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  await page.goto(`${APP}/c/tok-igor`);
  await page.waitForTimeout(3000);
  await page.getByText('Registers — working here today').first().click();
  await page.waitForTimeout(800);
  check(await page.locator('[data-sheet-where]').count() === 1, 'the worker\'s task sheet is open');
  // Round 48 (owner, 2026-10-07: "a way for a worker himself to change an
  // apartment he's working on by mistake"): a report he STARTED himself is
  // his to move with no switch; any other task still needs it.
  check(await page.locator('[data-task-move="T-REG"]').count() === 1,
    'a worker WITHOUT the switch can move a report he started himself');
  await page.mouse.click(195, 30);
  await page.waitForTimeout(500);
  await page.getByText('Fix the condensate drain').first().click();
  await page.waitForTimeout(800);
  check(await page.locator('[data-sheet-where]').count() === 1 && await page.locator('[data-task-move]').count() === 0,
    'but sees no move button on a task that is not his own started report');
  check(!errs.length, 'no page errors (worker, no switch)', errs[0] || '');
  await ctx.close();
}

// ═══ WORKER — with a personal override, reading Russian ═════════════════════
{
  const ctx = await seeded({ width: 390, height: 844 }, blob({ office: false, workerPerms: { moveOwnWork: true }, workerLang: 'ru' }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  await page.goto(`${APP}/c/tok-igor`);
  await page.waitForTimeout(3000);
  await page.getByText('Registers — working here today').first().click();
  await page.waitForTimeout(800);
  const btn = page.locator('[data-task-move="T-REG"]');
  check(await btn.count() === 1, 'WITH the switch his own task carries the move button');
  check(/Не та квартира\? Перенести/.test(await btn.textContent()), 'in his own language', await btn.textContent());
  // The portal lists only HIS tasks (allTasks is not read there), so somebody
  // else's task is never on his phone to be moved; the sheet's own guard
  // (contractorId === his) is belt and braces behind that.
  check(await page.getByText('Piping run to the riser').count() === 0, 'somebody else\'s task is not on his phone at all');
  await btn.click();
  await page.waitForTimeout(400);
  check(/Перенести в нужную квартиру/.test(await page.locator('[data-move-dialog]').textContent()), 'the dialog speaks Russian');
  await shot(page, 'worker-pick');
  await page.locator('[data-move-building="A3"]').click();
  await page.locator('[data-move-search]').fill('10');
  await page.waitForTimeout(300);
  await page.locator('[data-move-pick="A3-10"]').click();
  await page.waitForTimeout(300);
  const sentence = (await page.locator('[data-move-sentence]').textContent())?.replace(/\s+/g, ' ') ?? '';
  check(/3 фото и 1 сообщение переносятся с A1 10 на A3 10/.test(sentence), 'the confirm counts in Russian (3 фото, 1 сообщение)', sentence);
  const marks = (await page.locator('[data-move-marks-line]').allTextContents()).join(' | ');
  check(marks === 'Registers (готово) снимается с A1 10 и переносится на A3 10.', 'and names the tick', marks);
  await shot(page, 'worker-confirm');
  await page.locator('[data-move-confirm]').click();
  await page.waitForTimeout(1200);
  const d = await read(page);
  const t = d.contractorAssignments.find(x => x.id === 'T-REG');
  check(t?.apartmentId === 'A3-10', 'the worker moved his own task to A3-10');
  check(d.contractorPhotos.filter(x => x.assignmentId === 'T-REG').every(x => x.apartmentId === 'A3-10')
    && d.contractorNotes.filter(x => x.assignmentId === 'T-REG').every(x => x.apartmentId === 'A3-10'),
    'its photos and message followed');
  check(d.apartments.find(x => x.id === 'A3-10').stageMarks?.['s7-registers'] === 'done'
    && d.apartments.find(x => x.id === 'A1-10').stageMarks?.['s7-registers'] !== 'done', 'and the tick moved with it');
  const lines = d.activityLogs.filter(l => l.actionType.startsWith('task_moved'));
  check(lines.length === 2 && lines.every(l => l.userName === 'Igor'), 'both history lines are written in HIS name', lines.map(l => l.userName).join(','));
  check(await page.locator('[data-portal-moved]').count() === 1, 'the sheet says where it went');
  await shot(page, 'worker-after');
  const where = ((await page.locator('[data-sheet-where]').locator('..').textContent()) ?? '').replace(/\s+/g, ' ');
  check(/A3/.test(where), 'and the open sheet now reads the new apartment', where);
  check(!errs.length, 'no page errors (worker, with the switch)', errs[0] || '');
  await ctx.close();
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
