// "More Than the Task Said", section D (owner, 2026-10-18): every stage says
// WHO DOES IT, and a notebook bar dropped on a worker of another trade offers
// three choices — a NEW task for him on the job's next stage of his trade
// (the default), the task as it is, or cancel. A same-trade drop keeps the
// plain Yes / No.
//
//   APP=http://localhost:5190 node scratchpad/crosstrade-probe.mjs
import { chromium } from 'playwright';

const APP = process.env.APP ?? 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date();
const sun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
const day = n => iso(new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + n));
const SEED = { first: day(0), mon: day(1), tue: day(2) };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript((S) => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const st = (id, name, order, trade) => ({ id, name, color: '#6366f1', order, active: true, kind: 'work',
    projectId: 'general', ...(trade ? { trade } : {}), createdAt: '2026-01-01', updatedAt: '2026-01-01' });
  const apt = (id, name, x, extra = {}) => ({
    id, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', currentStageId: 'S-pipe', stageDates: {}, canvasX: x, canvasY: 3000,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', ...extra,
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'Office', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [
      st('S-pipe', 'Piping', 1, 'ac'),
      st('S-board', 'Ceiling boards', 2, 'drywall'),
      st('S-close', 'Closing walls', 3, 'drywall'),
      st('S-fin', 'Final check', 4),
    ],
    contractors: [
      { id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' },
      { id: 'C-av', name: 'Worker B', category: 'ac', token: 'tok-av', active: true, createdAt: '2026-01-01' },
      { id: 'C-mx', name: 'Max', category: 'drywall', token: 'tok-mx', active: true, createdAt: '2026-01-01' },
      { id: 'C-zz', name: 'Zalman', category: 'general', token: 'tok-zz', active: true, createdAt: '2026-01-01' },
    ],
    contractorAssignments: [
      { id: 'T-1', apartmentId: 'G-a', buildingId: 'G', contractorId: 'C-jo', taskDescription: 'Two days',
        dueDate: S.tue, days: [S.mon, S.tue], stageId: 'S-pipe', completedAt: null, priority: 'normal',
        createdAt: '2025-01-01', createdBy: 'U-t', createdByName: 'Office' },
    ],
    // Ceiling boards is already done, so the job's NEXT drywall stage is Closing walls.
    apartments: [apt('G-a', 'Alpha', 200, { bubbles: true, stageMarks: { 'S-board': 'done' } })],
    canvasElements: [
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 60, y: 260, w: 1100, h: 380, text: '', color: '#ffffff',
        data: { people: ['c:C-jo', 'c:C-av', 'c:C-mx', 'c:C-zz'], firstWeek: S.first, weekCount: 1, span: 5, cells: {} } },
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 6000, y: 6000, w: 200, h: 200, text: '', color: '#fff', data: {} },
    ],
  }));
}, SEED);
const page = await ctx.newPage();
page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message); fails++; } });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);
await page.locator('button:has-text("100%")').first().click().catch(() => {});
await page.waitForTimeout(600);

const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));
const tasks = async () => (await data()).contractorAssignments;
const centre = async (sel) => { const bb = await page.locator(sel).first().boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, w: bb.width }; };
const cellOf = (person, d) => page.evaluate(([p, dd]) => {
  const c = document.querySelector(`[data-node-id="CE-rota"] [data-cell-person="${p}"][data-cell-day="${dd}"]`);
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, [person, d]);
const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
};
// Empty rows are thin strips that PUFF OPEN under a hovering drag, so the
// target square moves while the hand travels — re-measure it before letting go.
const dragT1 = async (person, d) => {
  const from = await centre('[data-task-bar="T-1"]');
  await page.mouse.move(from.x - from.w / 4, from.y);
  await page.mouse.down();
  for (let i = 0; i < 3; i++) {
    const to = await cellOf(person, d);
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.waitForTimeout(250);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
};
const t1Before = JSON.stringify({ days: [SEED.mon, SEED.tue], c: 'C-jo' });
const t1Now = async () => { const t = (await tasks()).find(a => a.id === 'T-1'); return JSON.stringify({ days: t.days, c: t.contractorId }); };

// ── 1 · AC task onto a DRYWALL worker: three choices, the new task first ────
{
  await dragT1('c:C-mx', day(3));
  const choices =await page.locator('[data-move-confirm-choices] > button').evaluateAll(bs =>
    bs.map(b => b.hasAttribute('data-move-confirm-new') ? 'new' : b.hasAttribute('data-move-confirm-yes') ? 'yes' : '?'));
  check(JSON.stringify(choices) === '["new","yes"]', '1 · two choices in the list, the NEW task first', JSON.stringify(choices));
  check(await page.locator('[data-move-confirm-no]').count() === 1, '1 · and a Cancel');
  const newTxt = (await page.locator('[data-move-confirm-new]').innerText()).replace(/\s+/g, ' ');
  check(/New Drywall task for Max on Wednesday/.test(newTxt), '1 · "New Drywall task for Max on Wednesday …"', newTxt);
  check(/Stage: Closing walls \(the job’s next Drywall stage\)/.test(newTxt), '1 · names the job\'s NEXT drywall stage (Ceiling boards is done)', newTxt);
  check(/Joseph’s AC task stays where it is/.test(newTxt), '1 · says Joseph\'s AC task stays', newTxt);
  const yesTxt = (await page.locator('[data-move-confirm-yes]').innerText()).replace(/\s+/g, ' ');
  check(/Give this task to Max as it is/.test(yesTxt), '1 · "Give this task to Max as it is"', yesTxt);
  const lit = await page.locator('[data-move-confirm-new]').evaluate(b => getComputedStyle(b).borderTopWidth);
  check(lit === '2px', '1 · the new-task choice is the highlighted one', lit);

  await page.locator('[data-move-confirm-new]').click();
  await page.waitForTimeout(800);
  const all = await tasks();
  const made = all.filter(a => a.id !== 'T-1');
  check(made.length === 1, '1 · pressing it makes ONE new task', String(made.length));
  const n = made[0] ?? {};
  check(n.contractorId === 'C-mx' && n.apartmentId === 'G-a', '1 · for Max, on the same job', `${n.contractorId} · ${n.apartmentId}`);
  check(n.dueDate === day(3) && !n.days, '1 · on the dropped day alone (no days list)', `${n.dueDate} · ${JSON.stringify(n.days)}`);
  check(n.stageId === 'S-close' && JSON.stringify(n.stageIds) === '["S-close"]', '1 · on Closing walls', `${n.stageId} · ${JSON.stringify(n.stageIds)}`);
  check(n.taskDescription === 'Drywall work', '1 · described in English as "Drywall work"', n.taskDescription);
  check(await t1Now() === t1Before, '1 · the original task keeps its days and worker', await t1Now());
  check(await page.locator(`[data-task-bar="${n.id}"]`).count() >= 1, '1 · its bar draws on the notebook');
  check(await page.locator('[data-ask-keep], [data-ask-remove]').count() === 0, '1 · no "already has work" question stands over the board');

  // One undo step takes the new task away and leaves the original alone.
  await page.mouse.click(700, 820);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  const yes = page.locator('button:has-text("Yes, do it")');
  if (await yes.count()) await yes.first().click();
  await page.waitForTimeout(700);
  const after = await tasks();
  check(after.length === 1 && after[0].id === 'T-1', '1 · Undo takes the new task away (one step)', String(after.length));
  check(await t1Now() === t1Before, '1 · and the original is still as it was', await t1Now());
}

// ── 1b · on a day the original ALSO covers: two trades one day, no overlap ask
{
  await dragT1('c:C-mx', day(1));
  await page.locator('[data-move-confirm-new]').click();
  await page.waitForTimeout(800);
  const made = (await tasks()).filter(a => a.id !== 'T-1');
  check(made.length === 1 && made[0].dueDate === day(1), '1b · the new task lands on Monday beside the original', made.map(a => a.dueDate).join());
  check(await page.locator('[data-ask-keep], [data-ask-remove]').count() === 0, '1b · the "already has work" ask is answered for the office');
  await page.mouse.click(700, 820);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  const yes = page.locator('button:has-text("Yes, do it")');
  if (await yes.count()) await yes.first().click();
  await page.waitForTimeout(700);
  check((await tasks()).length === 1, '1b · undone');
}

// ── 2 · Cancel leaves everything ────────────────────────────────────────────
{
  await dragT1('c:C-mx', day(3));
  await page.locator('[data-move-confirm-no]').click();
  await page.waitForTimeout(500);
  check((await tasks()).length === 1 && await t1Now() === t1Before, '2 · Cancel makes and moves nothing');
}

// ── 3 · onto a trade with NO stage set as that trade: the line says so ──────
{
  await dragT1('c:C-zz', day(3));
  const txt = (await page.locator('[data-move-confirm-new-stage]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/No stage is set as General yet — set it in Settings → Stages\./.test(txt), '3 · "No stage is set as General yet …"', txt);
  await page.locator('[data-move-confirm-no]').click();
  await page.waitForTimeout(400);
}

// ── 4 · SAME trade (AC → AC): the old two-button ask ────────────────────────
{
  await dragT1('c:C-av', day(3));
  check(await page.locator('[data-move-confirm-new]').count() === 0, '4 · no new-task choice for a same-trade worker');
  const yesTxt = (await page.locator('[data-move-confirm-yes]').innerText().catch(() => '')).trim();
  const noTxt = (await page.locator('[data-move-confirm-no]').innerText().catch(() => '')).trim();
  check(yesTxt === 'Yes, move it' && noTxt === 'No', '4 · the plain Yes / No', `${yesTxt} / ${noTxt}`);
  check(await page.locator('[data-move-confirm-trade]').count() === 0, '4 · and no other-trade line');
  await page.locator('[data-move-confirm-no]').click();
  await page.waitForTimeout(400);
}

// ── 5 · "as it is" moves the task the old way ───────────────────────────────
{
  await dragT1('c:C-mx', day(3));
  await page.locator('[data-move-confirm-yes]').click();
  await page.waitForTimeout(800);
  const all = await tasks();
  const t = all.find(a => a.id === 'T-1');
  check(all.length === 1, '5 · "as it is" makes no new task', String(all.length));
  check(t.contractorId === 'C-mx' && t.days?.[0] === day(3) && t.stageId === 'S-pipe',
    '5 · the task goes to Max on Wednesday, its stage unchanged', `${t.contractorId} · ${JSON.stringify(t.days)} · ${t.stageId}`);
}

// ── 6 · Settings → Stages: "Who does it" saves `trade` on the stage ─────────
{
  await page.goto(`${APP}/settings`);
  await page.waitForTimeout(2500);
  const stagesTab = page.locator('button:has-text("Stages")').first();
  if (await stagesTab.count()) await stagesTab.click().catch(() => {});
  await page.waitForTimeout(600);
  const row = page.locator('[data-stage-trade="S-fin"]');
  check(await row.count() === 1, '6 · every work stage row has the "Who does it" control');
  const label = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/Who does it: AC Drywall General/.test(label), '6 · in plain words', label);
  const lit = await page.locator('[data-stage-trade="S-pipe"] [data-stage-trade-pick="ac"]').getAttribute('data-on');
  check(lit !== null, '6 · a stage already set as AC shows AC lit');
  await row.locator('[data-stage-trade-pick="general"]').click();
  await page.waitForTimeout(600);
  const fin = () => data().then(d => d.stages.find(s => s.id === 'S-fin'));
  check((await fin()).trade === 'general', '6 · pressing General saves trade on the stage', String((await fin()).trade));
  const tick = await page.locator('[data-stage-saved="S-fin"]').evaluate(e => getComputedStyle(e).opacity);
  check(tick === '1', '6 · and the Saved tick answers', tick);
  await row.locator('[data-stage-trade-pick="general"]').click();
  await page.waitForTimeout(600);
  check((await fin()).trade === undefined, '6 · pressing the lit choice again clears it', String((await fin()).trade));
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
