// Undo for EVERYTHING (owner, 2026-10-15: "Any action I do, I want to see an
// undo. If I move something from here to there, undo. If I add a task, undo.
// If I delete something, undo.").
//
// He added a task through the notebook's "+", then pressed the X on its tile
// and "Remove both" — and the undo arrow stayed grey. Every check here reads
// the STORE (localStorage), never the screen: "the bar came back" and "the
// task came back" are two different claims and only the second is the feature.
//
//   node scratchpad/undoall-probe.mjs            (dev server on 5181, or APP=…)
import { chromium } from 'playwright';

const APP = process.env.APP ?? 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const apt = (id, name, x) => ({
    id, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', currentStageId: 'S-pipe', stageDates: {}, bubbles: true,
    canvasX: x, canvasY: 190, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  const task = (id, aptId, cid, text, days, extra = {}) => ({
    id, apartmentId: aptId, buildingId: 'G', contractorId: cid, taskDescription: text,
    dueDate: days[days.length - 1], ...(days.length > 1 ? { days } : {}), stageId: 'S-pipe', completedAt: null,
    createdAt: '2026-09-01', createdBy: 'U-t', createdByName: 'A', ...extra,
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [
      { id: 'S-pipe', name: 'Piping', color: '#6366f1', order: 1, active: true, projectId: 'general' },
      { id: 'S-conc', name: 'Concealed units', color: '#0ea5e9', order: 2, active: true, projectId: 'general' },
    ],
    contractors: [
      { id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' },
      { id: 'C-mo', name: 'Moshe', category: 'general', token: 'tok-mo', active: true, createdAt: '2026-01-01' },
    ],
    contractorAssignments: [
      task('T-old', 'G-mead', 'C-jo', 'Two-day piping', ['2026-09-15', '2026-09-16']),
      task('T-one', 'G-mead', 'C-jo', 'One-day check', ['2026-09-14']),
      task('T-comp', 'G-orch', 'C-mo', 'Close me in the window', ['2026-09-20']),
      task('T-del', 'G-orch', 'C-mo', 'Delete me in the window', ['2026-09-21']),
    ],
    contractorNotes: [
      { id: 'N-1', assignmentId: 'T-one', apartmentId: 'G-mead', contractorId: 'C-jo', text: 'A message on the task',
        authorType: 'office', authorId: 'U-t', authorName: 'A', createdAt: '2026-09-02T10:00:00Z' },
    ],
    contractorPhotos: [
      { id: 'P-1', assignmentId: 'T-one', apartmentId: 'G-mead', contractorId: 'C-jo', dataUrl: '',
        filename: 'site.jpg', uploadedAt: '2026-09-02T10:00:00Z' },
    ],
    apartments: [apt('G-orch', 'Undo Orchard', 620), apt('G-mead', 'Undo Meadow', 900)],
    canvasElements: [
      // The seeded Goals fixture lands at the view centre unless parked away.
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 3200, y: 2400, w: 320, h: 220, text: '', color: '#ffffff', data: {} },
      {
        id: 'CE-rota', type: 'widget', widget: 'rota', x: 60, y: 420, w: 1100, h: 420, text: '', color: '#ffffff',
        data: { people: ['c:C-jo'], firstWeek: '2026-09-13', weekCount: 2, span: 5, askOnDrop: '1', cells: {} },
      },
    ],
  }));
  // Another workspace's snapshot — a task written THERE must undo too.
  if (!localStorage.getItem('netiv_app_data')) {
    localStorage.setItem('netiv_app_data', JSON.stringify({
      apartments: [{ id: 'B1-1', buildingId: 'B1', floor: 2, apartmentNumber: '1', displayName: '1', isUnnamed: false,
        isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {} }],
      contractorAssignments: [{ id: 'T-wf', apartmentId: 'B1-1', buildingId: 'B1', contractorId: 'C-jo',
        taskDescription: 'Foreign task', dueDate: '2026-09-22', completedAt: null, createdAt: '2026-09-01',
        createdBy: 'U-t', createdByName: 'A' }],
    }));
  }
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);

const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));
// persist() is debounced 250ms — read after it has had a chance to write.
const settle = (ms = 700) => page.waitForTimeout(ms);
const tasks = () => data().then(d => d.contractorAssignments);
const task = id => tasks().then(ts => ts.find(a => a.id === id) ?? null);
const cellCentre = (i) => page.evaluate(i => {
  const cell = document.querySelectorAll('[data-node-id="CE-rota"] .group\\/cell')[i];
  const r = cell.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
}, i);
const centre = async (sel) => { const bb = await page.locator(sel).first().boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, w: bb.width }; };
const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
};
/** The undo question, if one is up. */
const asking = () => page.evaluate(() => {
  const yes = [...document.querySelectorAll('button')].find(x => /yes, do it/i.test(x.textContent ?? ''));
  if (!yes) return null;
  const panel = yes.closest('div.bg-white');
  return {
    title: (panel?.querySelector('h3')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    body: [...(panel?.querySelectorAll('p') ?? [])].map(p => (p.textContent ?? '').replace(/\s+/g, ' ').trim()).join(' | '),
  };
});
/** Press a key with nothing focused — a focused field keeps its own text undo. */
const key = async (k) => {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
  await page.keyboard.press(k);
  await page.waitForTimeout(350);
};
/** Ctrl+Z (or redo), approve the question, and return what it said. */
const undo = async (redo = false) => {
  await key(redo ? 'Control+Shift+Z' : 'Control+z');
  const q = await asking();
  if (q) {
    await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /yes, do it/i.test(x.textContent ?? ''))?.click());
  }
  await settle();
  return q;
};

// ── 1 · the notebook "+" makes a task → undo takes it away → redo brings it back
let madeId = null;
{
  const thu = await cellCentre(4);
  await page.mouse.move(thu.x, thu.y);
  await page.waitForTimeout(300);
  await page.locator('[data-cell-plus]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-job-search]').fill('orch');
  await page.waitForTimeout(400);
  await page.locator('[data-job-hit="G-orch"]').click();
  await page.locator('[data-task-dialog] textarea').fill('Made through the plus');
  await page.locator('[data-add-the-job]').click();
  await settle(1200);
  const made = (await tasks()).filter(a => a.taskDescription === 'Made through the plus');
  check(made.length === 1, '1 · the plus made one task', String(made.length));
  madeId = made[0]?.id;
  const btn = await page.locator('button[title^="Undo"]').first().getAttribute('title');
  check(!/Nothing to undo/i.test(btn ?? ''), '1 · the undo arrow is live after adding a task', btn);
  const q = await undo();
  check(!!q, '1 · undoing a new task ASKS first', JSON.stringify(q));
  check(/Undo Orchard|Made through the plus/.test(q?.body ?? ''), '1 · and names the job and the task', q?.body);
  check(!(await task(madeId)), '1 · Ctrl+Z took the task away');
  const r = await undo(true);
  check(!!r, '1 · redo asks too');
  const back = await task(madeId);
  check(!!back && back.dueDate === '2026-09-17' && back.contractorId === 'C-jo',
    '1 · Ctrl+Shift+Z brought it back, same id, same day, same worker', JSON.stringify(back && { due: back.dueDate, cid: back.contractorId }));
}

// ── 2 · dragging a bar to another day → undo puts the days back ─────────────
{
  const from = await centre('[data-task-bar="T-old"]');
  const to = await cellCentre(4);
  await drag({ x: from.x - from.w / 4, y: from.y }, to);
  await settle(900);
  // A move confirmation may ask first (parallel round) — say yes if it does.
  const confirm = page.locator('[data-bar-move-yes], [data-move-confirm-yes]');
  if (await confirm.count()) { await confirm.first().click(); await settle(); }
  const moved = await task('T-old');
  check(JSON.stringify(moved.days) !== JSON.stringify(['2026-09-15', '2026-09-16']), '2 · the drag moved the task', JSON.stringify(moved.days));
  const q = await undo();
  check(!!q, '2 · undoing a bar move asks', q?.title);
  const t = await task('T-old');
  check(JSON.stringify(t.days) === JSON.stringify(['2026-09-15', '2026-09-16']) && t.dueDate === '2026-09-16',
    '2 · Ctrl+Z put the two days back', JSON.stringify({ days: t.days, due: t.dueDate }));
}

// ── 3 · the X on a bar, "Remove both" → undo restores the task with its days,
//       its message and its photo (the owner's own report) ─────────────────
{
  await page.locator('[data-task-bar="T-one"] [data-bar-remove]').evaluate(x => x.click());
  await page.waitForTimeout(500);
  await page.locator('button:has-text("Remove both")').click();
  await settle();
  const d0 = await data();
  check(!d0.contractorAssignments.some(a => a.id === 'T-one'), '3 · "Remove both" deleted the task');
  check(!d0.contractorNotes.some(n => n.id === 'N-1') && !d0.contractorPhotos.some(p => p.id === 'P-1'),
    '3 · (and its message and photo went with it)');
  const btn = await page.locator('button[title^="Undo"]').first().getAttribute('title');
  check(/Deleted a task/i.test(btn ?? ''), '3 · the undo arrow names the delete — no longer grey', btn);
  const q = await undo();
  check(/Brings back the task/.test(q?.body ?? '') && /photo/.test(q?.body ?? '') && /message/.test(q?.body ?? ''),
    '3 · the question says it brings the task back with its photo and message', q?.body);
  const d1 = await data();
  const t = d1.contractorAssignments.find(a => a.id === 'T-one');
  check(!!t && t.dueDate === '2026-09-14', '3 · Ctrl+Z restored the task with its day', JSON.stringify(t && t.dueDate));
  check(d1.contractorNotes.some(n => n.id === 'N-1') && d1.contractorPhotos.some(p => p.id === 'P-1'),
    '3 · and its message and photo');
  check(await page.locator('[data-task-bar="T-one"]').count() === 1, '3 · the bar is back on the notebook');
  await undo(true);
  check(!(await task('T-one')), '3 · redo deletes it again');
  await undo();
  check(!!(await task('T-one')), '3 · and undo brings it back once more');
}

// ── 4 · the apartment window: complete, delete, a stage mark ───────────────
{
  await page.locator('[data-node-id="G-orch"]').dblclick();
  await page.waitForTimeout(900);
  await page.locator('.drawer-panel button:has-text("Tasks")').first().click();
  await page.waitForTimeout(400);

  // complete
  await page.locator('[data-task-card="T-comp"] button[title="Mark complete"]').click();
  await settle();
  const done = await task('T-comp');
  const marksDone = (await data()).apartments.find(a => a.id === 'G-orch').stageMarks ?? {};
  check(!!done.completedAt && marksDone['S-pipe'] === 'done', '4 · marking complete closed it and ticked Piping off', JSON.stringify(marksDone));
  const q = await undo();
  check(/Opens the task/.test(q?.body ?? ''), '4 · undoing a completion asks, saying it opens the task again', q?.body);
  const open = await task('T-comp');
  const marksBack = (await data()).apartments.find(a => a.id === 'G-orch').stageMarks ?? {};
  check(!open.completedAt, '4 · Ctrl+Z re-opened the task', String(open.completedAt));
  check(marksBack['S-pipe'] !== 'done', '4 · and the stage it ticked off is back as it was', JSON.stringify(marksBack));

  // delete
  await page.locator('[data-task-delete="T-del"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('[data-task-delete-yes]').click();
  await settle();
  check(!(await task('T-del')), '4 · the window deleted the task');
  const q2 = await undo();
  check(!!q2, '4 · undoing the delete asks', q2?.title);
  check(!!(await task('T-del')), '4 · Ctrl+Z brought the deleted task back');

  // a stage mark
  await page.locator('.drawer-panel button:has-text("Details")').first().click();
  await page.waitForTimeout(300);
  const before = (await data()).apartments.find(a => a.id === 'G-orch').stageMarks?.['S-conc'] ?? 'todo';
  /* always open (28 Oct) */ await page.locator('[data-stage-section]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.locator('[data-stage-bubble="S-conc"]').click();
  await settle();
  const mid = (await data()).apartments.find(a => a.id === 'G-orch').stageMarks?.['S-conc'] ?? 'todo';
  check(mid !== before, '4 · a tap on a stage changed its mark', `${before} → ${mid}`);
  await page.keyboard.press('Escape');   // the panel
  await page.waitForTimeout(200);
  const q3 = await undo();
  check(/stages/.test(q3?.body ?? ''), '4 · undoing a stage tick asks, naming the stages', q3?.body);
  const after = (await data()).apartments.find(a => a.id === 'G-orch').stageMarks?.['S-conc'] ?? 'todo';
  check(after === before, '4 · Ctrl+Z put the stage mark back', `${mid} → ${after}`);
}

// ── 5 · a task in ANOTHER workspace undoes into that workspace ──────────────
{
  const ok = await page.evaluate(() => {
    const st = window.__store?.getState?.();
    if (!st) return false;
    st.updateAssignmentInProject('netiv', 'T-wf', { taskDescription: 'Foreign task, edited' });
    return true;
  });
  check(ok, '5 · (the dev store door is there)');
  await settle();
  const wf = () => page.evaluate(() => JSON.parse(localStorage.getItem('netiv_app_data')).contractorAssignments.find(a => a.id === 'T-wf'));
  check((await wf()).taskDescription === 'Foreign task, edited', '5 · the other workspace\'s task was edited');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const q = await undo();
  check(!!q, '5 · undoing it asks', q?.title);
  check((await wf()).taskDescription === 'Foreign task', '5 · Ctrl+Z put the other workspace\'s task back', (await wf()).taskDescription);
}

// ── 6 · the Tasks page: adding a task undoes ────────────────────────────────
{
  await page.goto(`${APP}/tasks`);
  await page.waitForTimeout(2200);
  const n0 = (await tasks()).length;
  await page.evaluate(() => {
    const st = window.__store.getState();
    st.addContractorAssignment({ apartmentId: 'G-mead', buildingId: 'G', contractorId: 'C-mo', taskDescription: 'From the store door',
      dueDate: '2026-09-23', completedAt: null, createdBy: 'U-t', createdByName: 'A' });
  });
  await settle();
  check((await tasks()).length === n0 + 1, '6 · a task added anywhere');
  const hdr = page.locator('[data-header-undo] button[title^="Undo"]');
  check(await hdr.count() === 1 && await hdr.isVisible(), '6 · the header shows an undo arrow on the Tasks page',
    String(await hdr.first().getAttribute('title').catch(() => 'none')));
  await undo();
  check((await tasks()).length === n0, '6 · is undone on the Tasks page too (the keys work on every page)', `${n0} vs ${(await tasks()).length}`);
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
