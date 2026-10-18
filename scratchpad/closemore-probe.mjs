// "More Than the Task Said", built (owner, 2026-10-18: "all starred, build it"):
//   1 · the worker's close: "Did you finish doing Fans and Concealed units?"
//       → "Did you do anything else here today?" → "Is it one of these?"
//       (the stages still open here, "Not on this list…" first) → Part of it
//       needs his words and one picture → three pictures OR one picture and
//       one video → the task records it all, the apartment's marks follow;
//   2 · the "part of it needs one picture" setting switched off;
//   3 · the office: the task GLOWS on the notebook for whoever answers that
//       kind of question, not for anybody else; pressing it asks in plain
//       English; "It was one of the stages" ticks it done on the apartment;
//       "Make it a task of its own" makes a closed task.
// All names are made up.
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date();
const TODAY = iso(now);
const SUN = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pic = n => ({ name: `site-${n}.png`, mimeType: 'image/png', buffer: PNG });
const film = { name: 'site-film.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(2048, 1) };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
await ctx.addInitScript(([T, S]) => {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  if (localStorage.getItem('wolfson_app_data')) return;
  const admin = { id: 'U-t', name: 'Dana', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const stages = [
    { id: 'S1', name: 'Ready to start', color: '#64748b', order: 1, active: true, kind: 'marker' },
    { id: 'S2', name: 'Fans', color: '#0ea5e9', order: 2, active: true, kind: 'work' },
    { id: 'S3', name: 'Concealed units', color: '#8b5cf6', order: 3, active: true, kind: 'work' },
    { id: 'S4', name: 'Wall units', color: '#f59e0b', order: 4, active: true, kind: 'work' },
    { id: 'S5', name: 'Outdoor units', color: '#22c55e', order: 5, active: true, kind: 'work' },
    { id: 'S6', name: 'Registers', color: '#ef4444', order: 6, active: true, kind: 'work' },
  ];
  const apt = (id, num, fam) => ({ id, buildingId: 'A1', floor: 4, apartmentNumber: num, displayName: fam, isUnnamed: false,
    isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'S2', stageDates: {}, bubbles: true,
    stageMarks: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
  const task = (id, a, ids) => ({ id, apartmentId: a, buildingId: 'A1', contractorId: 'C-jo', taskDescription: 'Install',
    dueDate: T, stageId: ids[0], stageIds: ids, completedAt: null, createdAt: '2026-01-01', createdBy: 'U-t', createdByName: 'Dana' });
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: admin, users: [admin], stages,
    contractors: [{ id: 'C-jo', name: 'Yaakov', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01', lang: 'en' }],
    contractorAssignments: [task('T-1', 'A1-16', ['S2', 'S3']), task('T-2', 'A1-17', ['S2'])],
    apartments: [apt('A1-16', '16', 'Lerner'), apt('A1-17', '17', 'Peretz')],
  }));
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: admin, users: [admin], stages, apartments: [],
    contractors: [{ id: 'C-jo', name: 'Yaakov', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }],
    canvasElements: [
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 60, y: 260, w: 1100, h: 320, text: '', color: '#ffffff',
        data: { people: ['c:C-jo'], firstWeek: S, weekCount: 1, span: 5, cells: {} } },
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 6000, y: 6000, w: 200, h: 200, text: '', color: '#fff', data: {} },
    ],
  }));
}, [TODAY, SUN]);
const wolf = p => p.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')));

let page = await ctx.newPage();
page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message); fails++; } });
await page.goto(`${APP}/c/tok-jo`);
await page.waitForTimeout(3000);
const openTask = async (id) => {
  if (await page.locator('button:has-text("All")').count()) await page.locator('button:has-text("All")').first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.locator(`text=${id === 'T-1' ? 'Lerner' : 'Peretz'}`).first().click();
  await page.waitForTimeout(800);
  await page.locator('[data-close-job]').first().click();
  await page.waitForTimeout(700);
};
const media = 'input[type="file"][accept*="video"][accept*=".zip"]';

// ── 1 · THE CLOSE ────────────────────────────────────────────────────────────
await openTask('T-1');
const q = (await page.locator('[data-close-finished-q]').innerText().catch(() => '')).replace(/\s+/g, ' ');
check(/Did you finish doing Fans and Concealed units\?/.test(q), '1 · the close names the task\'s own stages', q);
check(await page.locator('[data-close-more]').count() === 0, '1 · "anything else" waits for that answer');
await page.locator('[data-close-finished-pick="yes"]').click();
await page.waitForTimeout(250);
check(/anything else here today/i.test(await page.locator('[data-close-more]').innerText()), '1 · then "Did you do anything else here today?"');
check(await page.locator('[data-close-now]').isDisabled(), '1 · Send waits for it');
await page.locator('[data-close-more-pick="yes"]').click();
await page.waitForTimeout(250);
const chips = await page.locator('[data-close-extras] .flex-wrap > button').evaluateAll(bs => bs.map(b => b.getAttribute('data-close-extra') || (b.hasAttribute('data-close-offlist') ? 'OFF' : '?')));
check(JSON.stringify(chips) === JSON.stringify(['OFF', 'S4', 'S5', 'S6']), '1 · "Is it one of these?" — Not on this list first, then only the stages still open (not the task\'s own)', JSON.stringify(chips));
await page.locator('[data-close-extra="S4"]').click();
await page.locator('[data-close-extra-part="S4"]').click();
await page.waitForTimeout(200);
check(await page.locator('[data-close-more-next]').isDisabled(), '1 · Part of it cannot go on without his words');
await page.locator('[data-close-part-words="S4"] textarea').fill('hung the brackets only');
await page.locator('[data-close-offlist]').click();
await page.waitForTimeout(200);
check(await page.locator('[data-close-more-next]').isDisabled(), '1 · Not on this list cannot go on empty either');
await page.locator('[data-close-offlist-box] textarea').fill('took out garbage, there was a lot of it');
check(!(await page.locator('[data-close-more-next]').isDisabled()), '1 · with both written, Next unlocks');
await page.locator('[data-close-more-next]').click();
await page.waitForTimeout(300);
const step1 = await page.locator('[data-close-photo-step]').getAttribute('data-step-need');
check(step1 === '3', '1 · the job\'s own step needs three', step1);
await page.locator(media).first().setInputFiles([pic(1), film]);
await page.waitForTimeout(2500);
check((await page.locator('[data-close-count]').innerText()).trim() === '✓', '1 · one picture and one video are enough', await page.locator('[data-close-count]').innerText());
await page.locator('[data-close-photo-next]').click();
await page.waitForTimeout(300);
check(await page.locator('[data-close-photo-step="S4"]').getAttribute('data-step-need') === '1', '1 · the part-of-it stage asks for ONE picture');
check(await page.locator('[data-close-now]').isDisabled(), '1 · Send still locked');
await page.locator(media).first().setInputFiles([pic(2)]);
await page.waitForTimeout(2000);
check(!(await page.locator('[data-close-now]').isDisabled()), '1 · Send unlocks');
await page.locator('[data-close-now]').click();
await page.waitForTimeout(1800);
let d = await wolf(page);
let t1 = d.contractorAssignments.find(a => a.id === 'T-1');
check(!!t1.completedAt && JSON.stringify(t1.stagesWorked) === '["S2","S3","S4"]' && JSON.stringify(t1.stagesUnfinished) === '["S4"]',
  '1 · the task records its own stages and the extra one, the extra half done', JSON.stringify({ w: t1.stagesWorked, u: t1.stagesUnfinished }));
check(t1.partWords?.S4 === 'hung the brackets only' && JSON.stringify(t1.extraStages) === '["S4"]', '1 · and his words for the part', JSON.stringify(t1.partWords));
check(t1.offList?.length === 1 && t1.offList[0].text.startsWith('took out garbage') && !t1.offList[0].answer, '1 · the not-on-the-list work waits for an answer', JSON.stringify(t1.offList));
const a16 = d.apartments.find(a => a.id === 'A1-16');
check(a16.stageMarks.S2 === 'done' && a16.stageMarks.S3 === 'done' && a16.stageMarks.S4 === 'pending' && !a16.stageMarks.S5,
  '1 · the apartment: Fans + Concealed done, Wall units half done, nothing else ticked', JSON.stringify(a16.stageMarks));
const note = d.contractorNotes.find(n => n.assignmentId === 'T-1');
check(/Also did today: Wall units \(part of it — hung the brackets only\)/.test(note?.text ?? '') && /Work that wasn't on the list: took out garbage/.test(note?.text ?? ''),
  '1 · the office gets it in a message, in plain English', note?.text);

// ── 2 · the setting off: part of it needs no picture ─────────────────────────
await page.evaluate(() => window.__store.getState().setTvSetting('partNeedsPicture', false));
await page.waitForTimeout(300);
await page.locator('[data-closing-panel] button[title]').first().click().catch(() => {});
await page.keyboard.press('Escape');
await page.goto(`${APP}/c/tok-jo`);
await page.waitForTimeout(2500);
await openTask('T-2');
await page.locator('[data-close-finished-pick="yes"]').click();
await page.locator('[data-close-more-pick="yes"]').click();
await page.locator('[data-close-extra="S3"]').click();
await page.locator('[data-close-extra-part="S3"]').click();
await page.locator('[data-close-part-words="S3"] textarea').fill('connections only');
await page.locator('[data-close-offlist]').click();
await page.locator('[data-close-offlist-box] textarea').fill('swept the stairs');
await page.locator('[data-close-more-next]').click();
await page.waitForTimeout(300);
await page.locator(media).first().setInputFiles([pic(3), pic(4), pic(5)]);
await page.waitForTimeout(2500);
check(await page.locator('[data-close-photo-next]').count() === 0 && await page.locator('[data-close-photo-step="S3"]').count() === 0,
  '2 · with the setting off, the part stage asks for no picture');
check(!(await page.locator('[data-close-now]').isDisabled()), '2 · three pictures of the job are enough to close');
await page.locator('[data-close-now]').click();
await page.waitForTimeout(1800);
await page.close();

// ── 3 · THE OFFICE ───────────────────────────────────────────────────────────
page = await ctx.newPage();
page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message); fails++; } });
await page.goto(`${APP}/project`);
await page.waitForTimeout(2500);
await page.evaluate(() => { localStorage.setItem('active_project', 'general'); });
await page.evaluate(() => window.__store.getState().setCurrentProject('general'));
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);
await page.locator('button:has-text("100%")').first().click().catch(() => {});
await page.waitForTimeout(800);
const glow = () => page.locator('[data-node-id="CE-rota"] [data-bar-question]').count();
check(await glow() === 2, '3 · both tasks glow on the notebook for the admin', String(await glow()));
check(/needs an answer/.test(await page.locator('[data-bar-question-tag]').first().innerText().catch(() => '')), '3 · and say "needs an answer"');
await page.evaluate(() => { const s = window.__store.getState(); window.__store.setState({ currentUser: { ...s.currentUser, role: 'office' } }); });
await page.waitForTimeout(400);
check(await glow() === 0, '3 · somebody who does not answer these questions sees no glow');
await page.evaluate(() => { const s = window.__store.getState(); window.__store.setState({ currentUser: { ...s.currentUser, answers: ['offList'] } }); });
await page.waitForTimeout(400);
check(await glow() === 2, '3 · ticking "work that wasn\'t on the list" for them brings it back');
await page.locator('[data-node-id="CE-rota"] [data-task-bar="T-1"]').click();
await page.waitForTimeout(600);
const title = (await page.locator('[data-offlist-title]').innerText().catch(() => '')).trim();
check(title === "Yaakov did work that wasn't on the list", '3 · pressing it asks, in plain English', title);
check(/took out garbage/.test(await page.locator('[data-offlist-words]').innerText()), '3 · with what he wrote');
check(await page.locator('.drawer-panel').count() === 0, '3 · and does not open the job window');
await page.locator('[data-offlist-answer="stage"]').click();
await page.locator('[data-offlist-stage="S5"]').click();
await page.waitForTimeout(800);
d = await wolf(page);
t1 = d.contractorAssignments.find(a => a.id === 'T-1');
check(t1.offList[0].answer?.kind === 'stage' && t1.offList[0].answer.stageId === 'S5', '3 · "It was one of the stages" is recorded', JSON.stringify(t1.offList[0].answer));
check(d.apartments.find(a => a.id === 'A1-16').stageMarks.S5 === 'done', '3 · and Outdoor units is ticked done on that apartment (another workspace)');
check(await glow() === 1, '3 · that task stops glowing');
await page.locator('[data-node-id="CE-rota"] [data-task-bar="T-2"]').click();
await page.waitForTimeout(600);
await page.locator('[data-offlist-answer="task"]').click();
await page.waitForTimeout(900);
d = await wolf(page);
const t2 = d.contractorAssignments.find(a => a.id === 'T-2');
const made = d.contractorAssignments.find(a => a.id === t2.offList[0].answer?.taskId);
check(!!made && made.completedAt && made.taskDescription === 'swept the stairs' && made.contractorId === 'C-jo' && made.apartmentId === 'A1-17',
  '3 · "Make it a task of its own" makes a closed task for him on that apartment', JSON.stringify(made && { d: made.taskDescription, c: made.completedAt }));
check(await glow() === 0, '3 · nothing glows any more');

// ── 4 · the two settings, on their own pages ─────────────────────────────────
await page.goto(`${APP}/app-settings`);
await page.waitForTimeout(2000);
await page.locator('button:has-text("Users")').first().click();
await page.waitForTimeout(500);
const chip = page.locator('[data-user-answers="U-t"] [data-user-answers-kind="offList"]');
check(await chip.count() === 1, '4 · Settings → Users: each person says which questions they answer');
const before = await chip.getAttribute('data-on');
await chip.click();
await page.waitForTimeout(500);
const users = await page.evaluate(() => window.__store.getState().users);
check(before === '1' && JSON.stringify(users.find(u => u.id === 'U-t')?.answers) === '[]', '4 · pressing it takes the kind away from them', JSON.stringify(users.find(u => u.id === 'U-t')?.answers));
await page.locator('button:has-text("Workers")').first().click();
await page.waitForTimeout(500);
const box = page.locator('[data-part-needs-picture] input');
check(await box.count() === 1 && !(await box.isChecked()), '4 · Settings → Workers: "A stage done in part needs one picture" (off from section 2)');
await box.check();
await page.waitForTimeout(400);
check(await page.evaluate(() => window.__store.getState().boardSettings.__tv?.partNeedsPicture !== false), '4 · ticking it puts the picture back');

console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
await b.close();
process.exit(fails ? 1 : 0);
