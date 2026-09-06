// Problems, Tipus and Notes — the approved round (2026-09-06), end to end:
// the one message box on every input; tipus between the number and the name
// and printed everywhere; a problem raised from the stage picker (and in
// bulk), the three states on the diagram and in the window, Approve / Send
// back, the office bell; the worker's red cards on every day, the deadline
// banner, Close → waiting, "Is this the fix for…?"; the Problems report; the
// notes tab as crossed-off stages with bullets and the box at the bottom.
import { chromium } from 'playwright';
import { memoDataUrl } from './wav.mjs';

const APP = 'http://localhost:5174';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = iso(new Date());
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const files = n => Array.from({ length: n }, (_, i) => ({ name: `site-${i + 1}.png`, mimeType: 'image/png', buffer: PNG }));
const MEMO = memoDataUrl(3, 5);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

function seed(ctx, extraTasks = []) {
  return ctx.addInitScript(({ today, extraTasks, memo }) => {
    localStorage.setItem('active_project', 'wolfson');
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    if (localStorage.getItem('wolfson_app_data')) return;
    const user = { id: 'U-t', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
    const igor = { id: 'C-ig', name: 'Igor', email: '', category: 'ac', token: 'tok-ig', active: true,
      createdAt: '2026-01-01', lang: 'en', perms: { seeDiagrams: true, seeAllApartments: true, seeSchedule: true } };
    const stages = [
      { id: 'st-ready', name: 'Ready to start', color: '#94a3b8', order: 0, active: true },
      { id: 'st-pipe', name: 'Piping', color: '#3b82f6', order: 1, active: true },
      { id: 'st-drain', name: 'Drainage', color: '#0ea5e9', order: 2, active: true },
      { id: 'st-reg', name: 'Registers', color: '#10b981', order: 3, active: true },
    ];
    const apt = (id, bld, n, f, name, extra = {}) => ({
      id, buildingId: bld, floor: f, apartmentNumber: String(n), displayName: name, isUnnamed: false,
      isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'st-pipe', stageDates: {},
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', ...extra,
    });
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      users: [user], currentUser: user, stages, contractors: [igor],
      buildings: [{ id: 'A1', name: 'Building A1' }, { id: 'A2', name: 'Building A2' }, { id: 'A3', name: 'Building A3' }],
      apartments: [
        apt('A1-45', 'A1', 45, 13, 'Weinstein'), apt('A1-47', 'A1', 47, 13, 'Aharonov'),
        apt('A2-1', 'A2', 1, 2, 'Levi'), apt('A3-1', 'A3', 1, 2, 'Katz', { tipus: 'B1' }),
      ],
      boardSettings: { wolfson: { tipusim: ['A1', 'A2', 'B1'] } },
      contractorAssignments: [
        { id: 'T-47', contractorId: 'C-ig', apartmentId: 'A1-47', buildingId: 'A1', taskDescription: 'Take out old wall unit',
          stageId: 'st-pipe', dueDate: today, priority: 'normal', completedAt: null, createdAt: '2026-08-01', createdBy: 'U-t', createdByName: 'Esther' },
        ...extraTasks,
      ],
      stageNotes: [
        { id: 'SN-1', apartmentId: 'A1-47', stageId: 'st-ready', noteText: 'Keys with the guard', updatedAt: '2026-08-20T09:00:00.000Z', updatedBy: 'U-t', updatedByName: 'Esther' },
        { id: 'SN-2', apartmentId: 'A1-45', stageId: 'st-pipe', noteText: '', updatedAt: '2026-09-01T09:00:00.000Z', updatedBy: 'U-t', updatedByName: 'Esther',
          entries: [{ id: 'E-memo', text: '', at: '2026-09-01T09:00:00.000Z', by: 'U-t', byName: 'Esther',
            attachments: [{ id: 'M-1', filename: 'voice-memo.wav', mimeType: 'audio/wav', dataUrl: memo, transcript: 'Riser access is behind the kitchen cabinet' }] }] },
      ],
      contractorNotes: [], contractorPhotos: [], canvasElements: [],
    }));
  }, { today, extraTasks, memo: MEMO });
}
const stubs = async ctx => {
  await ctx.route('**/api/geocode', async route => {
    const body = route.request().postDataJSON();
    if (body?.transcribe) return route.fulfill({ json: { text: 'The drain in the second bedroom is leaking' } });
    if (body?.translate) return route.fulfill({ json: { items: body.translate.items.map(it => ({ id: it.id, text: it.text })) } });
    return route.fulfill({ json: { found: false } });
  });
  await ctx.route('**/api/drive-files', r => r.fulfill({ json: { files: [] } }));
  await ctx.route('**/api/share', r => r.fulfill({ json: { ok: true } }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
};
const store = p => p.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')));
/** A focused field eats the first Escape (the drawer's guard blurs instead of closing) — press until the window is gone. */
const closeDrawer = async p => { for (let i = 0; i < 3 && await p.locator('.drawer-panel').count(); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(400); } };
const bg = (p, sel) => p.locator(sel).first().evaluate(el => getComputedStyle(el).backgroundColor);
const problemTask = (contractorId, aptId, bld, desc, extra = {}) => ({
  id: `P-${aptId}-${desc.length}`, contractorId, apartmentId: aptId, buildingId: bld, taskDescription: desc,
  stageId: 'st-pipe', dueDate: today, priority: 'urgent', completedAt: null, createdAt: '2026-09-01', createdBy: 'U-t', createdByName: 'Esther',
  problem: { photosRequired: true, status: 'open', stageBefore: 'st-pipe' }, ...extra,
});

// ── 1 · THE OFFICE: tipus, the box, a problem raised, the drawings, approve / send back, notes, reports ──
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx, [
    problemTask('C-ig', 'A2-1', 'A2', 'Filter rattles', { id: 'P-wait', problem: { photosRequired: false, status: 'waiting', stageBefore: 'st-pipe', closedAt: new Date().toISOString() } }),
  ]);
  await stubs(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/project`);
  await page.waitForTimeout(2800);

  // tipus on the diagram cell (seeded on A3-1)
  check((await page.locator('[data-apt-id="A3-1"]').first().innerText()).includes('1 — B1'), 'the desktop cell prints "1 — B1" for a seeded tipus');
  check(await page.locator('[data-tipus-filter]').count() === 1, "the filter bar has a Tipus group when the workspace keeps a list");

  await page.locator('[data-apt-id="A1-47"]').first().click();
  await page.waitForTimeout(900);
  check(await page.locator('[data-tipus-select]').count() === 1, 'the window has the Tipus dropdown between the number and the family');
  await page.locator('[data-tipus-select]').selectOption('A2');
  await page.waitForTimeout(500);
  check((await page.locator('[data-tipus-chip]').innerText()).includes('47 — A2'), 'the title wears "47 — A2"');
  check(await page.locator('[data-general-notes-box] [data-composer-input]').count() === 1 && await page.locator('[data-general-notes-box] [data-big-mic]').count() === 1,
    'the general notes are the message box with the big mic');
  // General notes are BULLETS now (owner, 2026-09-06): Send appends a line with
  // who and when, the flat text follows, and a hover trash takes a line out.
  await page.locator('[data-general-notes-box] [data-composer-input]').fill('Gate code 4321');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.locator('[data-general-notes-box] [data-composer-input]').fill('Dog in the yard — call first');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  const gnBullets = await page.locator('[data-general-bullets] [data-general-bullet]').allInnerTexts();
  check(gnBullets.length === 2 && gnBullets[0].includes('Gate code 4321') && /Esther|Avi|·/.test(gnBullets[0]),
    'two sent lines stand as two bullets with a sign-off', gnBullets.join(' | '));
  check(await page.locator('[data-general-notes-box] [data-composer-input]').inputValue() === '', 'the box clears after Send');
  let gnApt = (await store(page)).apartments.find(a => a.id === 'A1-47');
  check(gnApt?.noteEntries?.length === 2 && gnApt.generalNotes === 'Gate code 4321\nDog in the yard — call first',
    'the record carries the entries AND the flat text (search and reports keep reading it)', gnApt?.generalNotes);
  await page.locator('[data-general-bullet]').first().locator('[data-note-remove]').evaluate(b => b.click());
  await page.waitForTimeout(500);
  gnApt = (await store(page)).apartments.find(a => a.id === 'A1-47');
  check(await page.locator('[data-general-bullet]').count() === 1 && gnApt?.generalNotes === 'Dog in the yard — call first',
    'the trash on a bullet takes that line out of both', gnApt?.generalNotes);

  // report a problem from the stage picker
  await page.locator('[data-stage-picker]').click();
  await page.waitForTimeout(400);
  check(await page.locator('[data-report-problem]').count() === 1, 'the stage list has a red "Report a problem" under it');
  await page.locator('[data-report-problem]').click();
  await page.waitForTimeout(500);
  check(await page.locator('[data-problem-form]').count() === 1, 'pressing it opens the problem form');
  const dl = await page.locator('[data-problem-deadline]').inputValue();
  const dlDate = new Date(dl);
  check(dl > today && dlDate.getDay() !== 5 && dlDate.getDay() !== 6, 'the deadline pre-fills a working day ahead (Friday and Saturday skipped)', dl);
  check(await page.locator('[data-problem-thread] [data-thread] [data-problem-box] [data-composer-input]').count() === 1,
    'the "what is wrong" is the task thread with the message box inside its panel');
  await page.locator('[data-problem-who]').selectOption('C-ig');
  await page.locator('[data-problem-box] [data-composer-input]').fill('Drain leak in bedroom 2');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const pbTexts = await page.locator('[data-problem-thread] [data-thread-text]').allInnerTexts();
  check(pbTexts.length === 1 && pbTexts[0] === 'Drain leak in bedroom 2' && await page.locator('[data-problem-box] [data-composer-input]').inputValue() === '',
    'Enter sends the line as a white office bubble and clears the box', pbTexts.join('|'));
  await page.locator('[data-problem-box] [data-composer-input]').fill('Tenant is home after 4pm');
  await page.locator('[data-problem-photos="yes"]').click();
  await page.locator('[data-problem-save]').click();
  await page.waitForTimeout(900);
  let d = await store(page);
  const prob = d.contractorAssignments.find(a => a.problem && a.apartmentId === 'A1-47');
  const probNotes = d.contractorNotes.filter(n => n.assignmentId === prob?.id);
  check(prob?.taskDescription === 'Drain leak in bedroom 2' && probNotes.length === 1 && probNotes[0].text === 'Tenant is home after 4pm' && probNotes[0].authorType === 'office',
    'the first bubble is the task, the line left in the box is its first office message', `${prob?.taskDescription} | ${probNotes.map(n => n.text).join(',')}`);
  check(!!prob && prob.problem.status === 'open' && prob.problem.stageBefore === 'st-pipe' && prob.problem.photosRequired && prob.dueDate === dl && prob.contractorId === 'C-ig',
    'a problem task is stored: open, remembers the stage, photos required, the deadline, the worker', JSON.stringify(prob?.problem));
  check(d.apartments.find(a => a.id === 'A1-47').currentStageId === 'st-pipe', 'the apartment\'s real stage is untouched');
  check(await page.locator('[data-problem-band][data-problem-status="open"]').count() === 1 && await page.locator('[data-problem-approve]').count() === 1,
    'the window wears the red band with Approve (an admin)');
  check((await page.locator('[data-stage-picker]').innerText()).includes('PROBLEM') && (await page.locator('[data-stage-picker]').innerText()).includes('Piping'),
    'the stage field reads PROBLEM · was Piping');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const cellBg = await bg(page, '[data-apt-id="A1-47"]');
  check(cellBg === 'rgb(220, 38, 38)' && await page.locator('[data-apt-id="A1-47"] [data-problem-bang]').count() === 1,
    'the diagram cell is RED with a big "!"', cellBg);
  check((await page.locator('[data-apt-id="A1-47"]').first().innerText()).includes('PROBLEM'), 'and its stage line reads PROBLEM · was Piping');
  check(await page.locator('[data-pending-bell] [data-bell-problem-glyph]').count() === 1, 'the header bell wears the red glyph');
  await page.locator('[data-pending-bell]').click();
  await page.waitForTimeout(400);
  check(await page.locator('[data-problem-row]').count() === 2 && (await page.locator('[data-pending-menu]').innerText()).includes('Drain leak'),
    'the bell lists the open problem and the one waiting for approval');
  await page.keyboard.press('Escape'); await page.mouse.click(700, 850); await page.waitForTimeout(300);

  // bulk: pick two, one line per apartment
  await page.locator('button', { hasText: /Bulk Update/ }).click();
  await page.waitForTimeout(400);
  await page.locator('[data-apt-id="A1-45"]').first().click();
  await page.locator('[data-apt-id="A3-1"]').first().click();
  await page.waitForTimeout(300);
  check(await page.locator('[data-bulk-tipus]').count() === 1 && await page.locator('[data-bulk-problem]').count() === 1, 'the bulk bar has Tipus and Report a problem');
  await page.locator('[data-bulk-problem]').click();
  await page.waitForTimeout(500);
  check(await page.locator('[data-problem-line]').count() === 2, 'the bulk form lists one line per picked apartment');
  await page.locator('[data-problem-who]').selectOption('C-ig');
  await page.locator('[data-problem-box] [data-composer-input]').fill('Thermostat dead');
  await page.locator('[data-problem-line="A3-1"]').fill('Thermostat dead, also the bathroom');
  await page.locator('[data-problem-photos="no"]').click();
  await page.locator('[data-problem-save]').click();
  await page.waitForTimeout(900);
  d = await store(page);
  const p2 = d.contractorAssignments.find(a => a.problem && a.apartmentId === 'A1-45');
  const p3 = d.contractorAssignments.find(a => a.problem && a.apartmentId === 'A3-1');
  check(!!p2 && p2.taskDescription === 'Thermostat dead' && !!p3 && p3.taskDescription === 'Thermostat dead, also the bathroom' && !p3.problem.photosRequired,
    'two problems, the shared line and the changed one, pictures not required', `${p2?.taskDescription} | ${p3?.taskDescription}`);

  // approve the seeded WAITING one, send another back
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.locator('button', { hasText: /Cancel/ }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  const roseBg = await bg(page, '[data-apt-id="A2-1"]');
  check(roseBg === 'rgb(251, 113, 133)', 'a problem waiting for approval draws the cell ROSE', roseBg);
  await page.locator('[data-apt-id="A2-1"]').first().click();
  await page.waitForTimeout(900);
  check(await page.locator('[data-problem-band][data-problem-status="waiting"]').count() === 1, 'the window says Waiting for approval');
  await page.locator('[data-problem-approve]').click();
  await page.waitForTimeout(700);
  d = await store(page);
  const approved = d.contractorAssignments.find(a => a.apartmentId === 'A2-1' && a.problem);
  check(!!approved.completedAt && approved.problem.status === 'solved' && approved.problem.approvedBy === 'Esther', 'Approve completes the task as solved, by Esther');
  check(await page.locator('[data-problem-band][data-problem-status="solved"]').count() === 1, 'the band turns green: Problem solved');
  check(d.apartments.find(a => a.id === 'A2-1').currentStageId === 'st-pipe', 'the apartment is simply on its stage again');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  check(await bg(page, '[data-apt-id="A2-1"]') !== 'rgb(251, 113, 133)', 'and the cell is back to its stage colour');
  // send back the A3-1 one
  await page.locator('[data-apt-id="A3-1"]').first().click();
  await page.waitForTimeout(900);
  await page.locator('[data-problem-sendback]').click();
  await page.locator('[data-problem-return] input').fill('The bathroom is still not done');
  await page.locator('[data-problem-return-send]').click();
  await page.waitForTimeout(700);
  d = await store(page);
  const returned = d.contractorAssignments.find(a => a.apartmentId === 'A3-1' && a.problem);
  check(returned.problem.status === 'returned' && returned.problem.returnNote === 'The bathroom is still not done' && !returned.completedAt,
    'Send back marks it returned with the note');
  check(d.contractorNotes.some(n => n.assignmentId === returned.id && n.text === 'The bathroom is still not done' && n.authorType === 'office'),
    'and the note lands in the thread for the worker');

  // the notes tab
  await page.locator('button', { hasText: /^Notes$/ }).first().click();
  await page.waitForTimeout(500);
  check(await page.locator('[data-notes-stage="st-pipe"][data-notes-state="current"]').count() === 1, 'the current stage is marked current');
  check(await page.locator('[data-notes-stage="st-ready"][data-notes-state="done"]').count() === 1, 'a passed stage is crossed off');
  const readyOpen = await page.locator('[data-notes-stage="st-ready"] [data-stage-note-box]').count();
  const pipeOpen = await page.locator('[data-notes-stage="st-pipe"] [data-stage-note-box]').count();
  check(readyOpen === 0 && pipeOpen === 1, 'the done stage is folded, the current one open with its box at the bottom');
  await page.locator('[data-notes-stage="st-pipe"] [data-stage-note-box] [data-composer-input]').fill('Riser access is behind the kitchen cabinet');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  const bullets = await page.locator('[data-notes-stage="st-pipe"] [data-notes-bullet]').allInnerTexts();
  check(bullets.length === 1 && bullets[0].includes('Riser access') && bullets[0].includes('Esther'), 'Send puts the note above as a bullet, signed small', bullets.join(' | '));
  check((await page.locator('[data-notes-stage="st-pipe"] [data-stage-note-box] [data-composer-input]').inputValue()) === '', 'and nothing stays in the field');
  d = await store(page);
  const sn = d.stageNotes.find(n => n.apartmentId === 'A3-1' && n.stageId === 'st-pipe');
  check(!!sn && sn.entries?.length === 1 && sn.noteText.includes('Riser access'), 'the bullet is stored as an entry, the flat text kept in step');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  await closeDrawer(page);
  // the memo card: forty real bars from the bytes, a knob, the words, a sign-off; the worker pill beside CURRENT
  await page.locator('[data-apt-id="A1-45"]').first().click();
  await page.waitForTimeout(900);
  await page.locator('button', { hasText: /^Notes$/ }).first().click();
  await page.waitForTimeout(1500);
  const bars = await page.locator('[data-notes-stage="st-pipe"] [data-memo-bars] > span:not([data-memo-knob])').evaluateAll(els => els.map(e => e.getBoundingClientRect().height));
  check(bars.length === 40 && new Set(bars.map(h => Math.round(h))).size >= 6, 'a stored memo draws forty bars read off its own audio (a real waveform, not flat stubs)', `${bars.length} bars, ${new Set(bars.map(h => Math.round(h))).size} heights`);
  check(await page.locator('[data-notes-stage="st-pipe"] [data-memo-knob]').count() === 1 && (await page.locator('[data-notes-stage="st-pipe"] [data-memo-time]').innerText()).startsWith('0:03'),
    'the card carries a scrub knob and the true length');
  const card = await page.locator('[data-notes-stage="st-pipe"] [data-memo]').first().innerText();
  check(card.includes('Riser access') && card.includes('Esther'), 'the words and the sign-off sit inside the memo card', card.replace(/\n/g, ' · ').slice(0, 80));
  check(await page.locator('[data-notes-stage="st-pipe"] [data-stage-worker]').count() === 1 && await page.locator('[data-notes-stage="st-pipe"] select.w-full').count() === 0,
    'the worker is a small pill in the stage row, not a full-width field');
  check(await page.locator('[data-notes-stage="st-pipe"] [data-stage-note-box] [data-composer-input]').getAttribute('placeholder').then(v => /Add notes for/.test(v ?? '')),
    'the "add notes for" words are the grey placeholder, not a label');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  // reports: the Problems subject
  await page.goto(`${APP}/reports`);
  await page.waitForTimeout(2000);
  await page.locator('button', { hasText: /^Problems$/ }).click();
  await page.waitForTimeout(600);
  check(await page.locator('[data-report-pictures]').count() === 1, 'the Problems subject offers "with pictures"');
  const body = await page.locator('table').first().innerText().catch(() => '');
  check(body.includes('Drain leak') && body.includes('Thermostat dead'), 'the report lists the problems', body.replace(/\n/g, ' · ').slice(0, 120));

  // settings: the Tipusim card
  await page.goto(`${APP}/settings`);
  await page.waitForTimeout(1800);
  check(await page.locator('[data-tipusim-card]').count() === 1 && await page.locator('[data-tipus-chip="A2"]').count() === 1, 'project settings has the Tipusim list');
  await page.locator('[data-tipus-new]').fill('C3');
  await page.locator('[data-tipus-add]').click();
  await page.waitForTimeout(400);
  check(await page.locator('[data-tipus-chip="C3"]').count() === 1, 'adding a tipus puts a chip on the list');
  await ctx.close();
}

// ── 2 · THE WORKER: red cards on every day, the banner, Close → waiting, the fix-for ask ──
{
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await seed(ctx, [
    problemTask('C-ig', 'A1-47', 'A1', 'Drain leak in bedroom 2', { id: 'P-late', dueDate: daysAgo(2) }),
    problemTask('C-ig', 'A1-45', 'A1', 'Thermostat dead in the living room', { id: 'P-open', dueDate: daysAgo(-3) }),
    problemTask('C-ig', 'A2-1', 'A2', 'Filter rattles', { id: 'P-wait', problem: { photosRequired: false, status: 'waiting', stageBefore: 'st-pipe', closedAt: new Date().toISOString() } }),
  ]);
  await stubs(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/c/tok-ig`);
  await page.waitForTimeout(3200);
  check(await page.locator('[data-problem-banner]').count() === 1 && (await page.locator('[data-problem-banner]').innerText()).includes('1'),
    'a red banner pins to the top: 1 past the deadline');
  const cards = await page.locator('[data-task-card]').evaluateAll(els => els.map(e => e.getAttribute('data-problem-card') ?? 'task'));
  check(cards[0] === 'open' && cards[1] === 'open' && cards[2] === 'waiting', 'problems come first on the Today filter though they carry no day, waiting after open', cards.join(','));
  check((await page.locator('[data-task-card="P-late"] [data-problem-deadline]').innerText()).includes('2 days late'), 'the late card says how late it is');
  check(await page.locator('[data-task-card="P-wait"] [data-problem-waiting]').count() === 1, 'the waiting card says the office is checking');
  await page.locator('[data-portal-bell]').click();
  await page.waitForTimeout(400);
  check((await page.locator('[data-bell-panel]').innerText()).includes('Problem'), 'the bell carries the problem');
  await page.mouse.click(10, 880); await page.waitForTimeout(300);

  // Close the late problem → waiting (3 pictures, per the office's answer)
  await page.locator('[data-task-card="P-late"]').click();
  await page.waitForTimeout(800);
  check((await page.locator('[data-close-job]').innerText()).includes('Close problem'), 'the sheet offers Close problem');
  await page.locator('[data-close-job]').click();
  await page.waitForTimeout(500);
  check(await page.locator('[data-closing-panel]').count() === 1 && await page.locator('[data-close-now]').isDisabled(), 'the closing screen waits for the pictures the office asked for');
  await page.locator('input[type="file"][accept*="video"][accept*=".zip"]').setInputFiles(files(3));
  await page.waitForTimeout(2500);
  check(await page.locator('[data-closing-comment] [data-composer-input]').count() === 1, 'the closing comment is the message box');
  await page.locator('[data-close-now]').click();
  await page.waitForTimeout(1200);
  let d = await store(page);
  const late = d.contractorAssignments.find(a => a.id === 'P-late');
  check(late.problem.status === 'waiting' && !!late.problem.closedAt && !late.completedAt, 'closing a problem sets WAITING, never completed');
  check(await page.locator('[data-problem-waiting-footer]').count() === 1, 'the sheet now says Waiting for approval');
  await page.mouse.click(10, 30); await page.waitForTimeout(500);
  check(await page.locator('[data-task-card="P-late"][data-problem-card="waiting"]').count() === 1, 'and the card turned rose');

  // the month: Saturday is a slim grey column
  await page.locator('button', { hasText: /Calendar/ }).first().click();
  await page.waitForTimeout(800);
  const cols = await page.locator('[data-calendar-fill] > div').nth(1).evaluate(el => {
    const kids = [...el.children].slice(0, 7);
    return kids.map(k => k.getBoundingClientRect().width);
  }).catch(() => []);
  check(cols.length === 7 && cols[6] < cols[5] * 0.7, 'Saturday is a slim column', cols.map(c => Math.round(c)).join(','));
  await page.locator('button', { hasText: /My Tasks/ }).first().click();
  await page.waitForTimeout(500);

  // the map: a red apartment offers the fix first
  await page.locator('button', { hasText: /Building Map/ }).click();
  await page.waitForTimeout(800);
  const sq = page.locator('[data-map-square="wolfson"]');
  if (await sq.count()) { await sq.click(); await page.waitForTimeout(1200); }
  const mapBg = await bg(page, '[data-apt-id="A1-45"]');
  check(mapBg === 'rgb(220, 38, 38)', "the worker's map paints the problem apartment red", mapBg);
  await page.locator('[data-apt-id="A1-45"]').first().click();
  await page.waitForTimeout(700);
  check(await page.locator('[data-fix-for="P-open"]').count() === 1, '"I did work here" on a red apartment asks: Is this the fix for…?');
  await page.locator('[data-fix-for="P-open"]').click();
  await page.waitForTimeout(900);
  check(await page.locator('[data-closing-panel]').count() === 1, 'yes lands straight on the closing screen');
  await ctx.close();
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
