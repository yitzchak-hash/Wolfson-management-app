// The four recordings of 2026-10-11 (feedback doc docs/feedback/2026-10-11-*.md).
//  1 · the bundle window: stage bubbles ticked or not, up to three pictures
//      (the last "+N"), a plain "Finished X · doing Y" line, no app words;
//  2 · the bundle tile: the workspace on top, each building with how many
//      apartments, stage names wrapped — never cut off;
//  3 · a notebook tile: the day count on its own line, the Hebrew address in
//      its own direction;
//  4 · the apartment window: the done card says who and what in a sentence;
//      editing a FINISHED task's stage moves its photos and ticks; general
//      notes newest first; Drive folded by default; a new task starts on the
//      next stage still to do;
//  5 · the Tasks page: bubbles, no arrows, a plain sentence; the calendar
//      shows every workspace and a day's "+" opens the add form on that day.
// Dates are offsets from the real clock. No real client family names.
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const sun = new Date(); sun.setDate(sun.getDate() - sun.getDay());
const dayOf = n => { const d = new Date(sun); d.setDate(d.getDate() + n); return iso(d); };
const SUN = dayOf(0), MON = dayOf(1), WED = dayOf(3), THU = dayOf(4);
const PIX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const STAGES = [
  { id: 'skhtatb', name: 'Sold/Start', color: '#64748b', order: 1, active: true, kind: 'work' },
  { id: 's-drilling', name: 'Drilling', color: '#0891b2', order: 2, active: true, kind: 'work' },
  { id: 's1-piping', name: 'Piping', color: '#3b82f6', order: 3, active: true, kind: 'work' },
  { id: 's1-concealed', name: 'Concealed Units', color: '#8b5cf6', order: 4, active: true, kind: 'work' },
  { id: 's1-fans', name: 'Fans', color: '#eab308', order: 5, active: true, kind: 'work' },
  { id: 's4-wall', name: 'Wall Units', color: '#f59e0b', order: 6, active: true, kind: 'work' },
  { id: 's7-registers', name: 'Registers', color: '#ef4444', order: 8, active: true, kind: 'work' },
  { id: 'g-inst', name: 'Installation', color: '#0ea5e9', order: 1, active: true, projectId: 'general' },
];
const U = { id: 'U-es', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
const IG = { id: 'C-ig', name: 'Igor', category: 'ac', token: 'tok-ig', active: true, createdAt: '2026-01-01' };
const apt = (b, n, floor, marks, extra = {}) => ({
  id: `${b}-${n}`, buildingId: b, floor, colPosition: ((n - 1) % 4) + 1, apartmentNumber: String(n), displayName: '',
  isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 's-drilling',
  stageDates: {}, bubbles: true, stageMarks: marks, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', ...extra,
});
const DRILLED = { skhtatb: 'done', 's-drilling': 'done' };
const tk = (id, aptId, due, extra = {}) => ({
  id, contractorId: 'C-ig', apartmentId: aptId, buildingId: aptId.split('-')[0], taskDescription: 'please do piping and concealed units',
  stageId: 's1-piping', stageIds: ['s1-piping', 's1-concealed', 's1-fans'], dueDate: due, completedAt: null,
  createdAt: '2026-01-01', createdBy: 'U-es', createdByName: 'Esther', ...extra,
});
const ph = (id, task, aptId, stageId) => ({ id, assignmentId: task, apartmentId: aptId, contractorId: 'C-ig', dataUrl: PIX, filename: `${id}.jpg`, mimeType: 'image/jpeg', fileType: 'image', uploadedAt: `${MON}T10:0${id.slice(-1)}:00`, stageId });

const W = {
  currentUser: U, users: [U], stages: STAGES, contractors: [IG],
  buildings: [{ id: 'A2', name: 'A2' }, { id: 'A3', name: 'A3' }],
  apartments: [
    apt('A3', 13, 5, DRILLED), apt('A3', 14, 5, DRILLED), apt('A3', 15, 5, DRILLED), apt('A2', 16, 5, DRILLED),
    apt('A2', 9, 3, { skhtatb: 'done', 's-drilling': 'done', 's1-piping': 'done', 's1-concealed': 'done', 's1-fans': 'done', 's7-registers': 'done' }, {
      driveLink: 'https://drive.google.com/drive/folders/FOLDER29',
      noteEntries: [
        { id: 'n-old', text: 'OLDER NOTE', at: '2026-08-05T09:00:00Z', by: 'U', byName: 'Esther' },
        { id: 'n-new', text: 'NEWER NOTE', at: '2026-09-14T09:00:00Z', by: 'U', byName: 'Esther' },
      ],
    }),
    apt('A2', 10, 3, DRILLED, { address: 'שרה אהרנסון 15\\4' }),
  ],
  contractorAssignments: [
    tk('T13', 'A3-13', SUN), tk('T14', 'A3-14', SUN), tk('T15', 'A3-15', SUN), tk('T16', 'A2-16', SUN),
    tk('SR9', 'A2-9', MON, { stageReport: true, taskDescription: 'Registers — working here today', stageId: 's1-concealed',
      stageIds: ['s1-concealed', 's1-fans'], stagesWorked: ['s7-registers'], stagesFinished: true, stagesUnfinished: [],
      completedAt: `${MON}T13:29:00.000Z` }),
    tk('T2D', 'A2-10', THU, { days: [WED, THU], taskDescription: 'two day job' }),
  ],
  contractorPhotos: [
    ph('p1', 'T13', 'A3-13', 's1-piping'), ph('p2', 'T13', 'A3-13', 's1-piping'), ph('p3', 'T13', 'A3-13', 's1-piping'),
    ph('p4', 'T13', 'A3-13', 's1-piping'), ph('p5', 'T13', 'A3-13', 's1-piping'),
    ph('q1', 'SR9', 'A2-9', 's7-registers'), ph('q2', 'SR9', 'A2-9', 's7-registers'), ph('q3', 'SR9', 'A2-9', 's7-registers'), ph('q4', 'SR9', 'A2-9', 's7-registers'),
  ],
};
const G = {
  currentUser: U, users: [U], stages: STAGES, contractors: [IG], apartments: [], contractorAssignments: [],
  canvasElements: [
    { id: 'CE-rota', type: 'widget', widget: 'rota', x: 160, y: 120, w: 1150, h: 760, text: '', color: '#ffffff',
      data: { people: ['c:C-ig'], firstWeek: SUN, weekCount: 1, span: 5, cells: {} } },
    { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 40, y: 2600, w: 300, h: 200, text: '', color: '#ffffff', data: {} },
  ],
};
function seed([w, g]) {
  localStorage.setItem('wolfson_app_version', '3'); localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01'); localStorage.setItem('office_notif_asked', '1');
  localStorage.setItem('board_default_zoom_general', '1');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'general');
  if (!localStorage.getItem('wolfson_app_data')) localStorage.setItem('wolfson_app_data', JSON.stringify(w));
  if (!localStorage.getItem('general_app_data')) localStorage.setItem('general_app_data', JSON.stringify(g));
}
async function fresh(active = 'general') {
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  await ctx.route('**://fonts.googleapis.com/**', r => r.abort());
  await ctx.addInitScript(seed, [W, G]);
  await ctx.addInitScript(a => { if (!localStorage.getItem('__probe_ws')) { localStorage.setItem('active_project', a); localStorage.setItem('__probe_ws', '1'); } }, active);
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (/localStorage/.test(e.message)) return; console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; });
  return { ctx, page };
}
const store = (page, k = 'wolfson_app_data') => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);

// ── 1–3 · the notebook ───────────────────────────────────────────────────────
{
  const { ctx, page } = await fresh('general');
  await page.goto(`${APP}/jobs`);
  await page.waitForSelector('[data-task-bundle]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const bld = await page.locator('[data-bundle-bld]').allTextContents();
  check(bld.some(t => /A3.*3 apartments/.test(t)) && bld.some(t => /A2 · 1 apartment$/.test(t)), 'the tile names each building with its apartment count', JSON.stringify(bld));
  const wsFirst = await page.evaluate(() => {
    const ws = document.querySelector('[data-bundle-ws-name]'); const b1 = document.querySelector('[data-bundle-bld]');
    return !!ws && !!b1 && (ws.compareDocumentPosition(b1) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  check(wsFirst, 'the workspace sits above the buildings');
  const cut = await page.evaluate(() => [...document.querySelectorAll('[data-task-bundle] [data-bundle-stage]')].filter(p => p.scrollWidth > p.clientWidth + 1).length);
  check(cut === 0, 'no stage name in the tile is cut off', String(cut));
  const counts = await page.locator('[data-task-bundle] [data-bundle-stage]').allTextContents();
  check(counts.some(t => /Fans\s*4/.test(t)), 'every stage of every task is counted (Fans 4, not just the first)', JSON.stringify(counts));
  check(await page.locator('[data-task-bar="T2D"] [data-bar-days-count="2"]').count() === 1, 'the two-day tile says "2 days" on its own line');
  const bdi = await page.evaluate(() => !!document.querySelector('[data-task-bar="T2D"] bdi[dir="auto"]'));
  check(bdi, 'the Hebrew address keeps its own direction');

  await page.locator('[data-task-bundle]').first().click();
  await page.waitForSelector('[data-bundle-popup]');
  const row = page.locator('[data-bundle-row="T13"]');
  check(await row.locator('[data-bundle-stage]').count() === 3, 'the row shows the task\'s three stages as bubbles');
  const plain = await row.locator('[data-bundle-row-plain]').textContent();
  check(/Finished Drilling/.test(plain) && /doing Piping, Concealed Units and Fans/.test(plain), 'in plain words: finished Drilling · doing Piping, Concealed Units and Fans', plain);
  check(await row.locator('[data-bundle-thumb]').count() === 2 && await row.locator('[data-bundle-thumb-more="3"]').count() === 1, 'five pictures: two shown and "+3"');
  check(!/working here today/.test(await page.locator('[data-bundle-popup]').textContent()), 'no app words in the window');
  await row.locator('[data-bundle-thumb]').first().click();
  check(await page.locator('[data-media-viewer]').count() === 1, 'a picture opens the viewer');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(await page.locator('[data-media-viewer]').count() === 0, 'Escape closes the viewer');
  await ctx.close();
}

// ── 4 · the apartment window ────────────────────────────────────────────────
{
  const { ctx, page } = await fresh('wolfson');
  await page.goto(`${APP}/project`);
  await page.waitForTimeout(1800);
  await page.locator('[data-apt-id="A2-9"]').first().click();
  await page.waitForTimeout(700);
  const bullets = await page.locator('[data-general-bullet]').allTextContents();
  check(/NEWER/.test(bullets[0] ?? '') && /OLDER/.test(bullets[1] ?? ''), 'general notes: newest on top', JSON.stringify(bullets));
  check(await page.locator('[data-link-section="drive"][data-open="0"]').count() === 1, 'the Drive folder is folded by default');
  await page.locator('.drawer-panel button:has-text("Tasks")').first().click();
  await page.waitForTimeout(400);
  const who = await page.locator('[data-task-card="SR9"] [data-task-done-who]').textContent().catch(() => '');
  const sent = await page.locator('[data-task-card="SR9"] [data-task-done-sentence]').textContent().catch(() => '');
  check(who === 'Igor', 'the done card leads with the worker', who);
  check(/^Igor finished Registers on .+ and sent 4 photos\.$/.test(sent), 'and one plain sentence', sent);
  await page.locator('[data-task-card="SR9"] button[title="Edit task"]').click();
  await page.waitForTimeout(300);
  check(await page.locator('[data-task-edit-stages] [data-stage-pick="s7-registers"][data-on]').count() === 1, 'the editor starts on the stage the close names (Registers)');
  await page.locator('[data-task-edit-stages] [data-stage-pick="s4-wall"]').click();
  await page.locator('[data-task-edit-stages] [data-stage-pick="s7-registers"]').click();
  await page.locator('[data-task-edit-save]').first().click();
  await page.waitForTimeout(700);
  const s = await store(page);
  const sr = s.contractorAssignments.find(a => a.id === 'SR9');
  const pics = s.contractorPhotos.filter(p => p.assignmentId === 'SR9').map(p => p.stageId);
  const marks = s.apartments.find(a => a.id === 'A2-9').stageMarks;
  check(JSON.stringify(sr.stagesWorked) === '["s4-wall"]', 'the close now names Wall Units', JSON.stringify(sr.stagesWorked));
  check(pics.length === 4 && pics.every(x => x === 's4-wall'), 'the four photos moved to Wall Units', JSON.stringify(pics));
  check(marks['s4-wall'] === 'done' && marks['s7-registers'] === 'todo', 'the ticks moved too', JSON.stringify(marks));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.locator('[data-apt-id="A3-14"]').first().click();
  await page.waitForTimeout(600);
  await page.locator('.drawer-panel button:has-text("Tasks")').first().click();
  await page.waitForTimeout(300);
  await page.locator('[data-drawer-add-task]').click();
  await page.waitForTimeout(700);
  const on = await page.locator('[data-stage-pick][data-on]').evaluateAll(els => els.map(e => e.getAttribute('data-stage-pick')));
  check(JSON.stringify(on) === '["s1-piping"]', 'a new task starts on the next stage still to do (Piping), not finished Drilling', JSON.stringify(on));
  await ctx.close();
}

// ── 5 · the Tasks page and the calendar ─────────────────────────────────────
{
  const { ctx, page } = await fresh('wolfson');
  await page.goto(`${APP}/tasks`);
  await page.waitForTimeout(1500);
  const plain = await page.locator('[data-task-plain]').allTextContents();
  check(plain.some(t => /^Igor is doing Piping, Concealed Units and Fans — due /.test(t)), 'a plain sentence on each row', plain[0]);
  check(await page.locator('[data-stage-pill] [data-stage-bubble]').count() > 0, 'stages as bubbles');
  check(await page.evaluate(() => [...document.querySelectorAll('[data-stage-pill] svg')].every(svg => !svg.classList.contains('lucide-arrow-right'))), 'no arrows');

  await page.evaluate(() => localStorage.setItem('active_project', 'general'));
  await page.goto(`${APP}/project-calendar`);
  await page.waitForTimeout(1500);
  check(await page.locator('[data-calendar-scope="all"]').count() === 1, 'the calendar opens on every workspace');
  check(await page.locator('[data-cal-ws="wolfson"]').count() > 0, 'Wolfson\'s work is on the Job Board\'s calendar');
  await page.locator(`[data-cal-plus="${THU}"]`).first().click({ force: true });
  await page.waitForTimeout(600);
  // The + opens the notebook's own task form now (owner, 2026-10-12, "all stars").
  check(await page.locator('[data-task-dialog]').count() === 1, 'the day\'s "+" opens the notebook\'s task form');
  const date = await page.locator('[data-start-day]').first().inputValue().catch(() => '');
  check(date === THU, 'starting on that day', date);
  await ctx.close();
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
