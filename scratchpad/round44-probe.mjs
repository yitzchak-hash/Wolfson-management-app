// Round 44 (2026-09-17): the office's upfront desktop-alert ask; the
// self-task form says "Now: X" and asks "What will you be doing here?" with
// stage pills; a GENERAL job's sheet has no Close job — its button leads to
// the buildings with a hunt banner, "I'm going to work here" files the
// visit under it, and without the permission a pop-up says so.
import { chromium } from 'playwright';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const USER = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
const STAGES = [
  { id: 'S1', name: 'Ready to start', color: '#64748b', order: 1, active: true },
  { id: 'S2', name: 'Piping', color: '#3b82f6', order: 2, active: true },
  { id: 'S3', name: 'Concealed units', color: '#8b5cf6', order: 3, active: true },
];
const APT = { id: 'A1-7', buildingId: 'A1', floor: 3, apartmentNumber: '7', displayName: 'Artzi', isUnnamed: false, isDuplexApt: false,
  classification: 'standard', generalNotes: '', currentStageId: 'S2', stageDates: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
const APT2 = { ...APT, id: 'A2-3', buildingId: 'A2', apartmentNumber: '3', displayName: 'Baruch', currentStageId: 'S1' };
const GENERAL = { id: 'T-gen', contractorId: 'C-jo', apartmentId: '', buildingId: '', taskDescription: 'Install the risers in A2', general: { projectId: 'wolfson', buildingIds: ['A2'], buildingId: 'A2' },
  dueDate: day(0), priority: 'normal', createdAt: '2026-01-01T08:00:00.000Z', completedAt: null };
const worker = (perms) => ({ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01', lang: 'en',
  perms: { seeDiagrams: true, seeAllApartments: true, selfAssign: true, ...perms } });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const seed = (ctx, w) => ctx.addInitScript(([user, stages, worker, apts, tasks]) => {
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('wolfson_app_data')) return;
  localStorage.setItem('wolfson_app_data', JSON.stringify({ currentUser: user, users: [user], stages, contractors: [worker], apartments: apts, contractorAssignments: tasks, contractorNotes: [] }));
}, [USER, STAGES, w, [APT, APT2], [GENERAL]]);

// ── A · the office asks up front ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx, worker({}));
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(2500);
  check(await page.locator('[data-office-notif-ask]').count() === 1, 'a fresh office PC is asked to allow desktop alerts, before any message');
  check(await page.locator('[data-office-notif-on]').count() === 1 && await page.locator('[data-office-notif-later]').count() === 1, 'with Turn on and Not now');
  await page.locator('[data-office-notif-later]').click();
  await page.waitForTimeout(300);
  check(await page.locator('[data-office-notif-ask]').count() === 0, 'Not now puts it away');
  await page.reload(); await page.waitForTimeout(2000);
  check(await page.locator('[data-office-notif-ask]').count() === 0, 'and it stays away on this machine');
  await ctx.close();
}

// ── B · the self-task form ──
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await seed(ctx, worker({ workHere: false }));
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto('http://localhost:5173/c/tok-jo');
  await page.waitForTimeout(2500);
  await page.locator('button:has-text("A job for myself")').first().click();
  await page.waitForTimeout(300);
  check(await page.locator('select').filter({ hasText: 'Stage (optional)' }).count() === 0, 'no "Stage (optional)" dropdown');
  check(await page.locator('[data-self-stage-block]').count() === 0, 'nothing about stages until a job is picked');
  await page.locator('[data-self-search]').fill('Artzi');
  await page.waitForTimeout(500);
  await page.locator('[data-self-hit="A1-7"]').click();
  await page.waitForTimeout(300);
  const now = await page.locator('[data-self-stage-now]').innerText().catch(() => '');
  check(/Piping/.test(now), 'the picked job\'s CURRENT stage is shown, read-only', now);
  check(/What will you be doing here/.test(await page.locator('[data-self-stage-block]').innerText()), 'and the question is what he will be doing');
  check(await page.locator('[data-self-stage-pick]').count() === 3, 'the stages are pills');
  await page.locator('[data-self-stage-pick="S3"]').click();
  await page.locator('input[placeholder="What needs doing?"]').fill('Hang the concealed units');
  await page.locator('button:has-text("Add it")').click();
  await page.waitForTimeout(800);
  const made = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')).contractorAssignments.find(a => a.taskDescription === 'Hang the concealed units'));
  check(made && made.stageId === 'S3' && made.apartmentId === 'A1-7', 'the task carries the stage he tapped', JSON.stringify({ st: made?.stageId }));

  // ── C · a GENERAL job, no permission: the pop-up ──
  await page.locator('button:has-text("All")').first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByText('Install the risers in A2').first().click();
  await page.waitForTimeout(800);
  check(await page.locator('[data-close-job]').count() === 0, 'a general job has NO Close job button');
  check(await page.locator('[data-general-go]').count() === 1, 'it has "Choose the apartment you are working in"');
  await page.locator('[data-general-go]').click();
  await page.waitForTimeout(400);
  check(await page.locator('[data-no-perm-popup]').count() === 1, 'without the permission a pop-up says he cannot pick apartments');
  await page.locator('[data-no-perm-popup] button').click();
  await ctx.close();
}

// ── D · a GENERAL job with the permission: to the building, tap, work here → a visit ──
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await seed(ctx, worker({ workHere: true }));
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto('http://localhost:5173/c/tok-jo');
  await page.waitForTimeout(2500);
  await page.locator('button:has-text("All")').first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByText('Install the risers in A2').first().click();
  await page.waitForTimeout(800);
  await page.locator('[data-general-go]').click();
  await page.waitForTimeout(1200);
  check(await page.locator('[data-portal-map]').count() === 1, 'the button leads to the building map');
  check(await page.locator('[data-general-hunt]').count() === 1 && /Install the risers/.test(await page.locator('[data-general-hunt]').innerText()), 'with the banner asking which apartment, naming the job');
  check(await page.locator('[data-map-building="A2"]').evaluate(b => getComputedStyle(b).color).then(c => c.includes('255, 255, 255')), 'the job\'s own building (A2) is the one shown');
  check(await page.locator('[data-apt-id="A2-3"]').count() === 1 && await page.locator('[data-apt-id="A1-7"]').count() === 0, 'A2\'s apartments are on screen, A1\'s are not');
  await page.locator('[data-apt-id="A2-3"]').first().click();
  await page.waitForTimeout(700);
  check(await page.locator('[data-work-here]').count() === 1, 'tapping an apartment offers "I\'m going to work here"');
  await page.locator('[data-work-here]').click();
  await page.waitForTimeout(700);
  check(await page.locator('[data-work-part]').count() === 0, 'no "is this part of…?" ask — the hunt already says which job');
  // The set model (2026-09-22): the start asks what he is doing here first.
  if (await page.locator('[data-work-stage]').count()) await page.locator('[data-work-stage]').first().click();
  await page.locator('[data-work-start]').click();
  await page.waitForTimeout(1000);
  const d = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')));
  const gen = d.contractorAssignments.find(a => a.id === 'T-gen');
  const rep = d.contractorAssignments.find(a => a.stageReport && a.apartmentId === 'A2-3');
  check(!!rep && !rep.completedAt, 'an open report task was made on that apartment');
  check(gen && (gen.visits ?? []).some(v => v.apartmentId === 'A2-3' && v.reportTaskId === rep?.id), 'and filed as a VISIT under the general job', JSON.stringify(gen?.visits));
  check(!gen?.completedAt, 'the general job itself stays open');
  check(await page.locator('[data-general-hunt]').count() === 0, 'the banner is gone once he picked');
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
