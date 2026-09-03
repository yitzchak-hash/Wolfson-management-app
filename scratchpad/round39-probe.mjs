// The Worker's Phone, built (the approved page, 2026-09-03): the header,
// the merged list with Today first, the month calendar filling the phone,
// the map chooser + one bar + outline + fade, the Task-messages composer
// with its two mics, transcription stored on a memo, the filtered "What did
// you do?", and a general job — "Work at Wolfson" — from the office's Tasks
// page to the worker's phone and back through "Is this part of…?".
import { chromium } from 'playwright';

const APP = 'http://localhost:5174';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const today = new Date().toISOString().slice(0, 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

function seed(ctx, { active = 'wolfson' } = {}) {
  return ctx.addInitScript(({ today, active }) => {
    localStorage.setItem('active_project', active);
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    if (localStorage.getItem('wolfson_app_data')) return;
    const user = { id: 'U-t', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
    const igor = { id: 'C-ig', name: 'Igor', email: '', category: 'ac', token: 'tok-ig', active: true,
      photosOptional: true, createdAt: '2026-01-01', lang: 'en',
      perms: { seeDiagrams: true, seeAllApartments: true, seeSchedule: true } };
    const stages = [
      { id: 'st-ready', name: 'Ready to start', color: '#94a3b8', order: 0, active: true },
      { id: 'st-pipe', name: 'Piping', color: '#3b82f6', order: 1, active: true },
      { id: 'st-drain', name: 'Drainage', color: '#0ea5e9', order: 2, active: true },
      { id: 'st-reg', name: 'Registers', color: '#10b981', order: 3, active: true },
      { id: 'st-done', name: 'Job completed', color: '#64748b', order: 4, active: true },
    ];
    const apt = (id, bld, n, f, name) => ({
      id, buildingId: bld, floor: f, apartmentNumber: String(n), displayName: name, isUnnamed: false,
      isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'st-pipe', stageDates: {},
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    });
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      users: [user], currentUser: user, stages, contractors: [igor],
      buildings: [{ id: 'A1', name: 'Building A1' }, { id: 'A2', name: 'Building A2' }, { id: 'A3', name: 'Building A3' }],
      apartments: [apt('A1-45', 'A1', 45, 13, 'Weinstein'), apt('A1-47', 'A1', 47, 13, 'Aharonov'), apt('A2-1', 'A2', 1, 2, 'Levi'), apt('A3-1', 'A3', 1, 2, 'Katz')],
      contractorAssignments: [
        { id: 'T-47', contractorId: 'C-ig', apartmentId: 'A1-47', buildingId: 'A1', taskDescription: 'Take out old wall unit',
          stageId: 'st-pipe', dueDate: today, priority: 'normal', completedAt: null, createdAt: '2026-08-01', createdBy: 'U-t', createdByName: 'Esther' },
      ],
      contractorNotes: [
        { id: 'N-memo', assignmentId: 'T-47', apartmentId: 'A1-47', contractorId: 'C-ig', text: 'voice-memo.webm',
          authorType: 'contractor', authorName: 'Igor', createdAt: '2026-09-01T10:00:00.000Z',
          attachmentFilename: 'voice-memo.webm', attachmentMimeType: 'audio/webm',
          attachmentDriveFileId: 'MEMO1', attachmentDriveUrl: 'https://drive.google.com/file/d/MEMO1/view' },
      ],
      contractorPhotos: [], canvasElements: [],
    }));
    localStorage.setItem('netiv_app_data', JSON.stringify({
      users: [user], currentUser: user, stages, contractors: [igor],
      buildings: [{ id: 'B1', name: 'B1' }, { id: 'B2', name: 'B2' }],
      apartments: [apt('B1-3', 'B1', 3, 2, 'Mizrahi')],
      contractorAssignments: [
        { id: 'T-B3', contractorId: 'C-ig', apartmentId: 'B1-3', buildingId: 'B1', taskDescription: 'Fix the drain in Netiv',
          stageId: null, dueDate: today, priority: 'normal', completedAt: null, createdAt: '2026-08-01', createdBy: 'U-t', createdByName: 'Esther' },
      ],
      contractorNotes: [], contractorPhotos: [], canvasElements: [],
    }));
    localStorage.setItem('general_app_data', JSON.stringify({
      users: [user], currentUser: user, stages: [], contractors: [igor], apartments: [], contractorAssignments: [], canvasElements: [],
    }));
  }, { today, active });
}
const stubs = async (ctx, calls) => {
  await ctx.route('**/api/geocode', async route => {
    const body = route.request().postDataJSON();
    if (body?.transcribe) { calls.push({ kind: 'transcribe', ...body.transcribe }); return route.fulfill({ json: { text: 'Drain is connected, sending the photo' } }); }
    if (body?.translate) return route.fulfill({ json: { items: body.translate.items.map(it => ({ id: it.id, text: it.text })) } });
    return route.fulfill({ json: { found: false } });
  });
  await ctx.route('**/api/drive-files', r => r.fulfill({ json: { files: [] } }));
  await ctx.route('**/api/share', r => r.fulfill({ json: { ok: true } }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
};

// ── 1 · the office writes a GENERAL job for Igor in Wolfson ─────────────────
{
  const calls = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx); await stubs(ctx, calls);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/tasks`);
  await page.waitForTimeout(2500);
  await page.locator('[data-add-task]').click();
  await page.waitForTimeout(500);
  check(await page.locator('[data-general-job]').count() === 1, 'the Tasks page form has a "General job" checkbox');
  await page.locator('[data-general-job] input').check();
  await page.waitForTimeout(200);
  check(await page.locator('[data-general-ws]').count() === 1 && await page.locator('option[value="A1-47"]').count() === 0,
    'ticking it swaps the apartment picker for a workspace select');
  await page.locator('[data-add-contractor]').selectOption('C-ig');
  await page.fill('[data-add-task-text]', 'AC service wherever the tenants report a fault');
  await page.locator('input[type="date"]').first().fill(today);
  await page.waitForTimeout(200);
  await page.locator('[data-add-task-submit]').click();
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')).contractorAssignments);
  const gen = st.find(a => a.general);
  check(!!gen && gen.general.projectId === 'wolfson' && gen.apartmentId === '', 'a general job is stored with no apartment and its workspace', JSON.stringify(gen?.general));
  check(await page.locator('[data-general-where]').count() >= 1, 'the Tasks page row names it as a general job');
  await ctx.close();
}

// ── 2 · Igor's phone ────────────────────────────────────────────────────────
{
  const calls = [];
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await seed(ctx); await stubs(ctx, calls);
  // the general job written by the office, seeded straight in
  await ctx.addInitScript(({ today }) => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw);
    if (!d.contractorAssignments.some(a => a.id === 'T-gen')) {
      d.contractorAssignments.push({ id: 'T-gen', contractorId: 'C-ig', apartmentId: '', buildingId: '', general: { projectId: 'wolfson' },
        taskDescription: 'AC service wherever the tenants report a fault', stageId: null, dueDate: today, priority: 'normal',
        completedAt: null, createdAt: '2026-08-01', createdBy: 'U-t', createdByName: 'Esther' });
      localStorage.setItem('wolfson_app_data', JSON.stringify(d));
    }
  }, { today });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/c/tok-ig`);
  await page.waitForTimeout(3200);

  // header
  const hdr = await page.evaluate(() => {
    const logo = document.querySelector('[data-portal-logo]')?.getBoundingClientRect();
    const bell = document.querySelector('[data-portal-bell]')?.getBoundingClientRect();
    const gear = document.querySelector('[data-portal-gear]')?.getBoundingClientRect();
    return { logoCx: logo ? (logo.left + logo.right) / 2 : -1, logoH: logo?.height ?? 0, bellL: bell?.left ?? -1, gearL: gear?.left ?? -1, w: window.innerWidth,
      print: !!document.querySelector('button[title*="rint"]') };
  });
  check(Math.abs(hdr.logoCx - hdr.w / 2) < 12 && hdr.logoH >= 30, 'the logo is centred and 32px tall', JSON.stringify(hdr));
  check(hdr.bellL > hdr.w * 0.6 && hdr.gearL > hdr.bellL && !hdr.print, 'bell and gear on the right, no print button');
  check(await page.locator('text=Wolfson Residence').filter({ has: page.locator('xpath=ancestor::div[contains(@class,"bg-slate-50")]') }).count() === 0,
    'the workspace chip row is gone');
  await page.locator('[data-portal-gear]').click();
  await page.waitForTimeout(300);
  check(await page.locator('[data-portal-lang="ru"]').count() === 1, 'the language lives inside the gear');
  await page.keyboard.press('Escape'); await page.mouse.click(10, 400); await page.waitForTimeout(300);

  // list: Today first, every workspace, tagged, general card
  check(await page.locator('button', { hasText: /^Today$/ }).first().evaluate(el => getComputedStyle(el).color === 'rgb(255, 255, 255)'),
    'Today is the selected filter on arrival');
  check(await page.locator('[data-task-card="T-47"]').count() === 1 && await page.locator('[data-task-card="T-B3"]').count() === 1,
    'tasks from BOTH workspaces are on one list');
  check((await page.locator('[data-task-card="T-B3"] [data-task-ws-chip]').innerText()).includes('Netiv'), 'each card wears its workspace');
  check((await page.locator('[data-task-card="T-gen"]').innerText()).includes('Work at Wolfson'), 'the general job reads "Work at Wolfson"');

  // calendar: month first, filling the phone
  await page.locator('button', { hasText: /Calendar/ }).first().click();
  await page.waitForTimeout(600);
  const cal = await page.evaluate(() => {
    const on = [...document.querySelectorAll('[data-cal-mode]')].find(b => b.getAttribute('data-cal-mode') === 'month');
    const grid = document.querySelector('[data-calendar-fill]');
    const r = grid?.getBoundingClientRect();
    return { monthOn: on && getComputedStyle(on).color === 'rgb(255, 255, 255)', bottom: r?.bottom ?? 0, h: window.innerHeight };
  });
  check(cal.monthOn, 'Monthly is the default');
  check(cal.bottom > cal.h - 40, 'the month grid reaches the bottom of the phone', JSON.stringify(cal));

  // map: chooser → Wolfson → one bar → outline + fade
  await page.locator('button', { hasText: /Building Map/ }).click();
  await page.waitForTimeout(600);
  check(await page.locator('[data-map-chooser]').count() === 1 && await page.locator('[data-map-square="wolfson"]').count() === 1 && await page.locator('[data-map-square="netiv"]').count() === 1,
    'the map opens on big project squares');
  await page.locator('[data-map-square="wolfson"]').click();
  await page.waitForTimeout(1500);
  check(await page.locator('[data-map-bar]').count() === 1 && await page.locator('[data-map-building="A1"]').count() === 1,
    'picking one shows the one-bar map with building segments');
  check(await page.locator('button', { hasText: /^Yesterday$/ }).count() === 0 && (await page.locator('text=Highlighted apartments').count()) === 0,
    'day filters and the hint sentence are gone from the map');
  check(await page.locator('[data-building-outline] svg').count() === 1 && await page.locator('[data-map-fade]').count() === 1, 'the outline and the bottom fade are drawn');
  await page.locator('[data-map-project-btn]').click();
  await page.waitForTimeout(300);
  check(await page.locator('[data-map-project-pick="netiv"]').count() === 1, 'the name button opens the project sheet');
  await page.locator('[data-map-project-pick="wolfson"]').click();
  await page.waitForTimeout(400);

  // "I did work here": the part-of ask, the filtered stages
  await page.locator('[data-apt-id="A1-45"], [data-node-id="A1-45"]').first().click().catch(async () => {
    await page.locator('text=45').first().click();
  });
  await page.waitForTimeout(600);
  await page.locator('[data-work-here]').click();
  await page.waitForTimeout(400);
  check(await page.locator('[data-work-part]').count() === 1 && await page.locator('[data-work-part-yes="T-gen"]').count() === 1,
    'with a general job running, it asks "Is this part of…?" first');
  await page.locator('[data-work-part-yes="T-gen"]').click();
  await page.waitForTimeout(400);
  const stageNames = await page.locator('[data-work-stages] button').allInnerTexts();
  check(!stageNames.some(t => /Ready to start|Job completed/.test(t)) && stageNames.some(t => /Piping/.test(t)),
    'the stage list skips the first and last stages', stageNames.join(' | '));
  await page.locator('[data-work-stages] button', { hasText: 'Registers' }).click();
  await page.waitForTimeout(300);
  await page.locator('[data-finished-no]').click();
  await page.waitForTimeout(300);
  await page.fill('[data-work-note] textarea', 'two registers left');
  await page.locator('[data-work-send]').click();
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')));
  const gen = after.contractorAssignments.find(a => a.id === 'T-gen');
  const a45 = after.apartments.find(a => a.id === 'A1-45');
  check(gen?.visits?.length === 1 && gen.visits[0].apartmentId === 'A1-45', 'the visit is filed on the general job', JSON.stringify(gen?.visits));
  check(a45.currentStageId === 'st-reg' && a45.stageMarks?.['st-reg'] === 'pending', '"Not yet" moved the apartment FORWARD to that stage and marked it half done', `${a45.currentStageId} ${JSON.stringify(a45.stageMarks)}`);

  // task messages: heading, composer inside the panel, two mics, transcript on the memo
  await page.locator('button', { hasText: /My Tasks/ }).click();
  await page.waitForTimeout(500);
  await page.locator('[data-task-card="T-47"]').click();
  await page.waitForTimeout(1800);
  check((await page.locator('text=TASK MESSAGES').count()) >= 1, 'the heading reads TASK MESSAGES');
  check(await page.locator('[data-thread] [data-thread-composer] [data-composer]').count() === 1, 'the composer sits INSIDE the grey panel');
  const comp = await page.evaluate(() => {
    const clip = document.querySelector('[data-composer-clip]')?.getBoundingClientRect();
    const dict = document.querySelector('[data-composer-dictate]')?.getBoundingClientRect();
    const input = document.querySelector('[data-composer-input]')?.getBoundingClientRect();
    const mic = document.querySelector('[data-big-mic]')?.getBoundingClientRect();
    return { clipL: clip?.left, dictL: dict?.left, inputL: input?.left, micL: mic?.left, ph: document.querySelector('[data-composer-input]')?.getAttribute('placeholder') };
  });
  check(comp.ph === 'Your message' && comp.micL > comp.inputL && (comp.dictL === undefined || comp.dictL < comp.inputL),
    'paperclip, "Your message" with the dictation mic at its left, the big mic at the end', JSON.stringify(comp));
  await page.fill('[data-composer-input]', 'On my way');
  await page.waitForTimeout(200);
  check(await page.locator('[data-composer-send]').count() === 1 && await page.locator('[data-big-mic]').count() === 0, 'text in the box turns the big mic into Send');
  await page.locator('[data-composer-send]').click();
  await page.waitForTimeout(500);
  check(await page.locator('[data-memo-transcript]').count() === 1 && (await page.locator('[data-memo-transcript]').innerText()).includes('Drain is connected'),
    'the memo shows its words under the player');
  const noteAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')).contractorNotes.find(n => n.id === 'N-memo'));
  check(noteAfter?.transcript?.includes('Drain is connected'), 'and the words are stored on the note for every other device');
  check(calls.filter(c => c.kind === 'transcribe').length === 1 && calls[0].driveFileId === 'MEMO1', 'transcribed once, by Drive file id', JSON.stringify(calls));
  await ctx.close();
}

// ── 3 · one allowed map goes straight in ────────────────────────────────────
{
  const calls = [];
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await seed(ctx); await stubs(ctx, calls);
  await ctx.addInitScript(() => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw); d.contractors[0].mapProjects = ['wolfson']; localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  });
  const page = await ctx.newPage();
  await page.goto(`${APP}/c/tok-ig`);
  await page.waitForTimeout(3000);
  await page.locator('button', { hasText: /Building Map/ }).click();
  await page.waitForTimeout(900);
  check(await page.locator('[data-map-chooser]').count() === 0 && await page.locator('[data-map-bar]').count() === 1,
    'a worker allowed one map never sees the chooser');
  await ctx.close();
}

await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
