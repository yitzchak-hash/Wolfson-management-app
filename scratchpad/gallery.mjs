// The device gallery: the owner's seven screens (the notes tab, a memo in the
// details, a memo on a new task, the problem form, the worker's problem
// thread, the closing screen, the month) plus the drawer with a real plan,
// the diagram, the board and the worker portal — captured at every device
// shape the owner carries. The source pictures for the "Device Gallery"
// artifact (build-gallery.mjs assembles the page).
//
// Memos are RECORDED for real: Chromium's fake microphone
// (--use-fake-device-for-media-stream) feeds MediaRecorder a tone, so the
// player draws a genuine waveform. Stored memos are seeded as WAV data URLs
// (wav.mjs) with their transcript on the record, since the container has no
// transcription key.
import { chromium, devices } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from './seed.mjs';
import fs from 'node:fs';
import { memoDataUrl } from './wav.mjs';

const PLAN_ID = 'HARNESSPLAN1';
async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]); // A3 landscape
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  for (let i = 1; i < 6; i++) page.drawLine({ start: { x: 30 + i * 188, y: 30 }, end: { x: 30 + i * 188, y: 812 }, thickness: 0.8, color: rgb(0.6, 0.66, 0.75) });
  for (let i = 1; i < 4; i++) page.drawLine({ start: { x: 30, y: 30 + i * 195 }, end: { x: 1161, y: 30 + i * 195 }, thickness: 0.8, color: rgb(0.6, 0.66, 0.75) });
  page.drawText('A1 / 53 — MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();
// The fake microphone plays a speech-shaped WAV (wav.mjs), so a memo
// recorded in the harness draws a waveform that looks like talking rather
// than the flat tone Chromium's default fake device produces.
const FAKE_MIC = '/tmp/gallery-fake-mic.wav';
fs.writeFileSync(FAKE_MIC, Buffer.from(memoDataUrl(12, 11, 16000).split(',')[1], 'base64'));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${FAKE_MIC}`],
});
const blob = await realisticWolfson(browser);
const MEMO_A = memoDataUrl(4, 7);
const MEMO_B = memoDataUrl(3, 3);

const PROFILES = [
  ['iphone',      402, 874,  true],   // iPhone 17 Pro
  ['galaxy',      384, 832,  true],   // Galaxy S25 Ultra
  ['flip',        344, 882,  true],
  ['fold-open',   690, 829,  true],
  ['fold-side',   829, 690,  false],
  ['fold-big',   1129, 847,  false],
  ['ipad-port',   768, 1024, false],
  ['ipad-land',  1024, 768,  false],
  ['ipadpro11',   834, 1194, false],
  ['ipadpro13', 1366, 1024,  false],
  ['pc',         1920, 1080, false],  // the office computer
];

// `node gallery.mjs iphone galaxy pc` re-captures only those profiles.
const only = process.argv.slice(2);
for (const [tag, W, H, phone] of PROFILES) {
  if (only.length && !only.includes(tag)) continue;
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    isMobile: phone, hasTouch: true, deviceScaleFactor: phone ? 2 : W >= 1600 ? 1 : 1.5,
    userAgent: devices['iPhone 13'].userAgent,
    permissions: ['microphone'],
  });
  await applySeed(ctx, blob);
  await ctx.addInitScript(({ planId, memoA, memoB }) => {
    const raw = localStorage.getItem('wolfson_app_data');
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.__galleryPatched) return;
    d.__galleryPatched = true;
    const dayIso = off => { const x = new Date(); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };
    for (const a of d.apartments ?? []) {
      if (a.id === 'A1-53') { a.plansPdfLink = `https://drive.google.com/file/d/${planId}/view`; a.tipus = 'A2'; }
    }
    for (const c of d.contractors ?? []) c.perms = { ...(c.perms ?? {}), seeSchedule: true };
    d.boardSettings = { ...(d.boardSettings ?? {}), wolfson: { ...((d.boardSettings ?? {}).wolfson ?? {}), tipusim: ['A1', 'A2', 'B1', 'C3'] } };
    const first = (d.contractorAssignments ?? [])[0];
    const apt53 = (d.apartments ?? []).find(a => a.id === 'A1-53');
    // The office's notes on 53's current stage: a line, then a memo with its words.
    if (apt53?.currentStageId) {
      d.stageNotes = (d.stageNotes ?? []).filter(n => !(n.apartmentId === 'A1-53' && n.stageId === apt53.currentStageId));
      d.stageNotes.push({
        id: 'SN-gal', apartmentId: 'A1-53', stageId: apt53.currentStageId,
        noteText: 'Riser access is behind the kitchen cabinet — Shimon has the key.\nThe drain in the second bedroom is leaking onto the ceiling below.',
        updatedAt: new Date(Date.now() - 36e5 * 30).toISOString(), updatedBy: 'U-1', updatedByName: 'Esther',
        entries: [
          { id: 'E1', text: 'Riser access is behind the kitchen cabinet — Shimon has the key.', at: new Date(Date.now() - 36e5 * 30).toISOString(), by: 'U-1', byName: 'Esther' },
          { id: 'E2', text: '', at: new Date(Date.now() - 36e5 * 5).toISOString(), by: 'U-1', byName: 'Esther',
            attachments: [{ id: 'M1', filename: 'voice-memo.wav', mimeType: 'audio/wav', dataUrl: memoA,
              transcript: 'The drain in the second bedroom is leaking onto the ceiling below — the tenant says it started yesterday.' }] },
        ],
      });
    }
    // A PROBLEM on the first task's apartment, raised with a memo and a picture note.
    if (first) {
      d.contractorAssignments.push({
        id: 'P-gal', contractorId: first.contractorId, apartmentId: first.apartmentId, buildingId: first.buildingId,
        taskDescription: 'Drain leak in bedroom 2 — water on the ceiling below', stageId: first.stageId ?? null,
        dueDate: dayIso(-2), priority: 'urgent', completedAt: null, createdAt: new Date(Date.now() - 36e5 * 26).toISOString(),
        createdBy: 'U-1', createdByName: 'Esther',
        problem: { photosRequired: true, status: 'open', stageBefore: first.stageId ?? null },
      });
      d.contractorNotes = [
        ...(d.contractorNotes ?? []),
        { id: 'N-gal-p1', assignmentId: 'P-gal', apartmentId: first.apartmentId, contractorId: first.contractorId,
          text: '', authorType: 'office', authorId: 'U-1', authorName: 'Tzvi',
          attachmentFilename: 'voice-memo.wav', attachmentMimeType: 'audio/wav', attachmentDataUrl: memoB,
          transcript: 'Igor, the tenant says the second bedroom ceiling is wet since yesterday — please look at the drain today.',
          createdAt: new Date(Date.now() - 36e5 * 26).toISOString() },
        { id: 'N-gal-p2', assignmentId: 'P-gal', apartmentId: first.apartmentId, contractorId: first.contractorId,
          text: 'On my way there after Rabinovich.',
          authorType: 'contractor', authorId: first.contractorId, authorName: 'Moshe Aharonov',
          createdAt: new Date(Date.now() - 36e5 * 3).toISOString() },
      ];
    }
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  }, { planId: PLAN_ID, memoA: MEMO_A, memoB: MEMO_B });
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  // A word each way on the first task, so the portal shot shows the task's
  // CONVERSATION (the UI round's decision 8) rather than an empty box.
  await ctx.addInitScript(() => {
    const raw = localStorage.getItem('wolfson_app_data');
    if (!raw) return;
    const d = JSON.parse(raw);
    const a = (d.contractorAssignments ?? [])[0];
    if (!a || (d.contractorNotes ?? []).some(n => n.id === 'N-gal-1')) return;
    d.contractorNotes = [
      { id: 'N-gal-1', assignmentId: a.id, apartmentId: a.apartmentId, contractorId: a.contractorId,
        text: 'Riser is on the north wall — Shimon has the key to the shaft.',
        authorType: 'office', authorId: 'U-1', authorName: 'Esther',
        createdAt: new Date(Date.now() - 36e5 * 5).toISOString() },
      { id: 'N-gal-2', assignmentId: a.id, apartmentId: a.apartmentId, contractorId: a.contractorId,
        text: 'Got it. Starting on the riser now.',
        authorType: 'contractor', authorId: a.contractorId, authorName: 'Moshe Aharonov',
        createdAt: new Date(Date.now() - 36e5 * 2).toISOString() },
      ...(d.contractorNotes ?? []),
    ];
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log(`  ${tag}: PAGE ERROR ${e.message}`));
  const snap = name => page.screenshot({ path: `scratchpad/gal-${tag}-${name}.jpg`, type: 'jpeg', quality: 82 });
  /** Record a memo through the given box's big mic — a real MediaRecorder run on the fake device. */
  const record = async (scope, ms = 2600) => {
    const mic = page.locator(`${scope} [data-big-mic]`).first();
    if (!(await mic.count())) { console.log(`  ${tag}: no mic in ${scope}`); return false; }
    await mic.click();
    await page.waitForTimeout(ms);
    const send = page.locator(`${scope} [data-recording-strip] button[title="Send"]`).first();
    if (!(await send.count())) { console.log(`  ${tag}: no recording strip in ${scope}`); return false; }
    await send.click();
    await page.waitForTimeout(1800);
    return true;
  };
  const inDrawer = sel => `.drawer-panel ${sel}`;

  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(2200);
  await snap('diagram');

  // the drawer, plan showing: 800px of screen decides (the UI round's
  // decision 1) — at 800+ the plan sits beside the details, below it the
  // window carries a Plan tab, whatever kind of device it is.
  await page.locator('[data-apt-id="A1-53"]').first().click();
  await page.waitForTimeout(W >= 800 ? 6000 : 1500);
  if (W < 800) {
    await page.locator('.drawer-panel button', { hasText: /^(Plan|תוכנית)/ }).first().click();
    await page.waitForTimeout(5000);
    await snap('drawer');
    await page.locator('.drawer-panel button', { hasText: /^(Details|פרטים)/ }).first().click();
    await page.waitForTimeout(600);
  } else {
    await snap('drawer');
  }

  // 1 · a memo recorded into General Notes
  try {
    if (await record(inDrawer('[data-general-notes-box]'))) {
      await page.locator(inDrawer('[data-general-notes-box]')).scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }
  } catch (e) { console.log(`  ${tag}: general-notes memo failed: ${e.message.split('\n')[0]}`); }
  await snap('details-memo');

  // 2 · the notes tab
  await page.locator('.drawer-panel button', { hasText: /^(Notes|הערות)$/ }).first().click();
  await page.waitForTimeout(900);
  await snap('notes');

  // 4 · Report a problem, with a memo
  await page.locator('.drawer-panel button', { hasText: /^(Details|פרטים)/ }).first().click();
  await page.waitForTimeout(500);
  try {
    await page.locator(inDrawer('[data-stage-picker]')).first().click();
    await page.waitForTimeout(400);
    await page.locator('[data-report-problem]').click();
    await page.waitForTimeout(600);
    await page.locator('[data-problem-who]').selectOption({ index: 1 });
    await page.locator('[data-problem-box] [data-composer-input]').fill('Water on the ceiling under bedroom 2 — check the drain');
    // The form is a THREAD now: Enter sends the line as a bubble, which also
    // hands the composer's big mic back (typed text turns it into Send).
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    await record('[data-problem-box]');
    await page.waitForTimeout(300);
  } catch (e) { console.log(`  ${tag}: problem form failed: ${e.message.split('\n')[0]}`); }
  await snap('problem');
  await page.keyboard.press('Escape');   // the form
  await page.waitForTimeout(400);

  // 3 · a new task with a memo as its description
  await page.locator('.drawer-panel button', { hasText: /^(Tasks|משימות)/ }).first().click();
  await page.waitForTimeout(600);
  try {
    await page.locator('.drawer-panel button', { hasText: /Add Task|הוסף משימה/ }).first().click();
    await page.waitForTimeout(700);
    await record('[data-quick-add-box]');
    await page.locator('[data-quick-add-box]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  } catch (e) { console.log(`  ${tag}: task memo failed: ${e.message.split('\n')[0]}`); }
  await snap('task-memo');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // the board, through the real header dropdown (the standing localStorage trap)
  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(1800);
  try {
    await page.locator('header button', { hasText: /Wolfson/ }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole('menu').getByText(/Job Board/).first().click();
    await page.waitForTimeout(2400);
    if (await page.locator('[data-board-viewport]').count()) await snap('board');
  } catch { console.log(`  ${tag}: board switch failed`); }

  // the worker portal — the auto-switch walks it back to Wolfson's tasks
  await page.goto(`http://localhost:5173/c/${PORTAL_TOKEN}`);
  await page.waitForTimeout(5500);
  // 5 · the problem's sheet: the office's memo with its words, the worker's reply
  try {
    await page.locator('[data-task-card="P-gal"]').first().click({ timeout: 8000 });
    await page.waitForTimeout(1200);
    const thread = page.locator('[data-thread-composer]').first();
    if (await thread.count()) await thread.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  } catch { console.log(`  ${tag}: problem card tap failed`); }
  await snap('worker-task');
  // 6 · the closing screen
  try {
    await page.locator('[data-close-job]').first().click({ timeout: 5000 });
    await page.waitForTimeout(700);
  } catch { console.log(`  ${tag}: close problem failed`); }
  await snap('closing');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.locator('[data-closing-panel] button').first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.mouse.click(10, 30);
  await page.waitForTimeout(500);
  // 7 · the month
  try {
    await page.locator('button', { hasText: /Calendar|יומן/ }).first().click();
    await page.waitForTimeout(900);
  } catch { console.log(`  ${tag}: calendar tab failed`); }
  await snap('calendar');
  // the worker's page with an ordinary task open (the standing shot)
  try {
    await page.locator('button', { hasText: /My Tasks|המשימות שלי/ }).first().click();
    await page.waitForTimeout(500);
    await page.locator('button').filter({ hasText: /^(All|הכול|הכל)$/ }).first().click();
    await page.waitForTimeout(400);
    await page.locator('button, [role=button]').filter({ hasText: /concealed unit|registers|thermostats/i }).first().click({ timeout: 8000 });
    await page.waitForTimeout(1000);
  } catch { console.log(`  ${tag}: portal card tap failed`); }
  await snap('portal');

  console.log(`${tag} done`);
  await ctx.close();
}
await browser.close();
console.log('GALLERY_DONE');
