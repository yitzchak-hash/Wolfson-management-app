// Recording 2026-10-18 14:28 (the worker's phone):
//   1 · a task whose day has gone by asks "When did you finish?" — Yesterday
//       keeps its days, Today adds today to them;
//   2 · one stage + "No" never asks "Which didn't you finish?";
//   3 · the stage he left unfinished gets its own one-picture step;
//   4 · Take photo / Record video / Choose files live INSIDE the picture step,
//       never on the question screens;
//   5 · Sold/Start is never offered under "Is it one of these?";
//   6 · the sheet's first row: "Building 1 · Apartment 16 - family", Standard,
//       the icons and the X together; the word TASK big;
//   7 · the delete permission and its "office tasks too" sub-switch.
// All names are made up.
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date();
const TODAY = iso(now);
const Y = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pic = n => ({ name: `site-${n}.png`, mimeType: 'image/png', buffer: PNG });

function seed([T, YD, perms]) {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  if (localStorage.getItem('wolfson_app_data')) return;
  const admin = { id: 'U-t', name: 'Dana', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const stages = [
    { id: 'skhtatb', name: 'Sold/Start', color: '#64748b', order: 1, active: true, kind: 'work' },
    { id: 'S2', name: 'Fans', color: '#0ea5e9', order: 2, active: true, kind: 'work' },
    { id: 'S3', name: 'Wall units', color: '#f59e0b', order: 3, active: true, kind: 'work' },
  ];
  const apt = (id, num, fam) => ({ id, buildingId: 'A1', floor: 4, apartmentNumber: num, displayName: fam, isUnnamed: false,
    isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'S2', stageDates: {}, bubbles: true,
    stageMarks: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
  const task = (id, a, due, by, desc) => ({ id, apartmentId: a, buildingId: 'A1', contractorId: 'C-jo', taskDescription: desc,
    dueDate: due, stageId: 'S2', stageIds: ['S2'], completedAt: null, createdAt: '2026-01-01', createdBy: by, createdByName: 'x' });
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: admin, users: [admin], stages,
    contractors: [{ id: 'C-jo', name: 'Yaakov', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01', lang: 'en', perms }],
    contractorAssignments: [
      task('T-1', 'A1-16', YD, 'U-t', 'Fit the fans one'),
      task('T-2', 'A1-17', YD, 'U-t', 'Fit the fans two'),
      task('T-3', 'A1-18', T, 'C-jo', 'My own job'),
    ],
    apartments: [apt('A1-16', '16', 'Lerner'), apt('A1-17', '17', 'Peretz'), apt('A1-18', '18', 'Mizrahi')],
  }));
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function phone(perms) {
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  await ctx.addInitScript(seed, [TODAY, Y, perms]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message); fails++; } });
  await page.goto(`${APP}/c/tok-jo`);
  await page.waitForTimeout(2500);
  if (await page.locator('[data-done-line]').count() || true) {
    const all = page.locator('button:has-text("All")').first();
    if (await all.count()) await all.click().catch(() => {});
  }
  await page.waitForTimeout(300);
  return { ctx, page };
}
const wolf = p => p.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')));
const media = 'input[type="file"][accept*="video"][accept*=".zip"]';
const openCard = async (page, id) => { await page.locator(`[data-task-card="${id}"]`).first().click(); await page.waitForTimeout(600); };

// ══ A · the sheet's head row, TASK, and the close for a day gone by ══
{
  const { ctx, page } = await phone({ deleteOwnTasks: true });
  await openCard(page, 'T-1');
  const head = await page.locator('[data-sheet-head]').innerText().catch(() => '');
  check(/Building 1 · Apartment 16 - Lerner/.test(head), '6 · the title says the building and apartment in words, with a plain dash', head.replace(/\n/g, ' | '));
  check(!/—/.test(await page.locator('[data-sheet-where]').innerText()), '6 · no long dash in the title');
  const tops = await page.evaluate(() => ['[data-sheet-where]', '[data-sheet-standard]'].map(sel => {
    const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? Math.round(r.top + r.height / 2) : null;
  }));
  check(tops[1] !== null && Math.abs(tops[0] - tops[1]) <= 6, '6 · Standard sits on the top row with the title', JSON.stringify(tops));
  check(await page.locator('[data-sheet-when-where] [data-sheet-stage]').count() === 1, '6 · the stage rides the second row with the date');
  const tw = await page.locator('[data-task-word]').evaluate(e => parseFloat(getComputedStyle(e).fontSize));
  check(tw >= 20, '6 · the word TASK is big', `${tw}px`);
  check(await page.locator('[data-task-delete]').count() === 0, '7 · an office task: no bin without the sub-switch');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/cw-sheet.png` });

  await page.locator('[data-close-job]').first().click(); await page.waitForTimeout(700);
  check(await page.locator('[data-close-when]').count() === 1, '1 · a task whose day went by asks "When did you finish?"');
  check(await page.locator('[data-close-finished]').count() === 0, '1 · nothing else is asked before that');
  check(await page.locator('[data-add-photo-camera]').count() === 0, '4 · no camera buttons on a question screen');
  await page.locator('[data-close-when-pick="today"]').click(); await page.waitForTimeout(250);
  check(await page.locator('[data-close-finished]').count() === 1, '1 · then "Did you finish doing Fans?"');
  await page.locator('[data-close-finished-pick="no"]').click(); await page.waitForTimeout(250);
  check(await page.locator('[data-close-unfinished]').count() === 0, '2 · one stage + No — no "Which didn\'t you finish?"');
  check(await page.locator('[data-close-more]').count() === 1, '2 · straight on to "anything else?"');
  check(await page.locator('[data-add-photo-camera]').count() === 0, '4 · still no camera buttons');
  await page.locator('[data-close-more-pick="yes"]').click(); await page.waitForTimeout(250);
  const offered = await page.$$eval('[data-close-extra]', ns => ns.map(n => n.getAttribute('data-close-extra')));
  check(!offered.includes('skhtatb') && offered.includes('S3'), '5 · Sold/Start is not offered', JSON.stringify(offered));
  await page.locator('[data-close-more-pick="no"]').click(); await page.waitForTimeout(300);
  const step = page.locator('[data-close-photo-step="S2"]');
  check(await step.count() === 1, '3 · the unfinished Fans gets its own picture step');
  check(await step.locator('[data-add-photo-camera]').count() === 1 && await step.locator('[data-add-files]').count() === 1,
    '4 · Take photo · Record video · Choose files sit INSIDE the step');
  check(await page.locator('[data-add-photo-camera]').count() === 1, '4 · and nowhere else');
  check(await step.getAttribute('data-step-need') === '1', '3 · one picture is enough for it');
  if (process.env.SHOTS) { await step.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOTS}/cw-step.png` }); }
  check(await page.locator('[data-close-now]').isDisabled(), '3 · Send waits for that picture');
  await page.locator(media).setInputFiles([pic(1)]); await page.waitForTimeout(900);
  check(!(await page.locator('[data-close-now]').isDisabled()), '3 · with it, Send unlocks');
  await page.locator('[data-close-now]').click(); await page.waitForTimeout(900);
  const t1 = (await wolf(page)).contractorAssignments.find(x => x.id === 'T-1');
  check(!!t1.completedAt && JSON.stringify(t1.days) === JSON.stringify([Y, TODAY]) && t1.dueDate === TODAY,
    '1 · finished today: today joins the task', JSON.stringify({ d: t1.days, due: t1.dueDate }));
  const m = (await wolf(page)).apartments.find(x => x.id === 'A1-16').stageMarks;
  check(m.S2 === 'pending', '3 · and Fans is left half done', JSON.stringify(m));
  await page.mouse.click(200, 30).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(600);
  // Yesterday: the task keeps its own day.
  await page.reload(); await page.waitForTimeout(2200);
  const all = page.locator('button:has-text("All")').first(); if (await all.count()) await all.click().catch(() => {});
  await openCard(page, 'T-2');
  await page.locator('[data-close-job]').first().click(); await page.waitForTimeout(700);
  check(/Yesterday/.test(await page.locator('[data-close-when-pick="past"]').innerText()), '1 · the past choice says Yesterday');
  await page.locator('[data-close-when-pick="past"]').click();
  await page.locator('[data-close-finished-pick="yes"]').click();
  await page.locator('[data-close-more-pick="no"]').click(); await page.waitForTimeout(300);
  await page.locator(media).setInputFiles([pic(2)]); await page.waitForTimeout(900);
  await page.locator('[data-close-now]').click(); await page.waitForTimeout(900);
  const t2 = (await wolf(page)).contractorAssignments.find(x => x.id === 'T-2');
  check(!!t2.completedAt && t2.dueDate === Y && !(t2.days ?? []).includes(TODAY),
    '1 · finished yesterday: the task keeps its day', JSON.stringify({ d: t2.days, due: t2.dueDate }));
  await ctx.close();
}

// ══ B · delete: his own task with the switch ══
{
  const { ctx, page } = await phone({ deleteOwnTasks: true });
  await openCard(page, 'T-3');
  check(await page.locator('[data-close-when]').count() === 0, '1 · a task for today does not ask when');
  check(await page.locator('[data-task-delete="T-3"]').count() === 1, '7 · his own task wears the bin');
  await page.locator('[data-task-delete="T-3"]').click();
  check(await page.locator('[data-task-delete-ask]').count() === 1, '7 · it asks first');
  await page.locator('[data-task-delete-yes]').click(); await page.waitForTimeout(700);
  const ids = (await wolf(page)).contractorAssignments.map(x => x.id);
  check(!ids.includes('T-3') && ids.includes('T-1'), '7 · the task is gone, the others stay', JSON.stringify(ids));
  await ctx.close();
}
// ══ C · the sub-switch: the office's tasks too ══
{
  const { ctx, page } = await phone({ deleteOwnTasks: true, deleteOfficeTasks: true });
  await openCard(page, 'T-1');
  check(await page.locator('[data-task-delete="T-1"]').count() === 1, '7 · with the sub-switch, an office task wears the bin too');
  await ctx.close();
}
// ══ D · no switch: no bin anywhere ══
{
  const { ctx, page } = await phone(undefined);
  await openCard(page, 'T-3');
  check(await page.locator('[data-task-delete]').count() === 0, '7 · the shipped Contractor level has no bin');
  await ctx.close();
}

await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
