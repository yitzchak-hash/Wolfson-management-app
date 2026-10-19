// Owner, 2026-10-19: "add an option for contractors to be able to delete jobs
// that they opened for themselves … where they pressed I work here, I did work
// here, add an option for them to undo that if they did it by mistake."
//   1 · a task he opened himself wears an Undo icon with NO delete switch on;
//   2 · an office task for him shows nothing without the switches;
//   3 · Undo asks first, in plain words, then the task, its photos and its
//       messages go;
//   4 · the apartment's stages go back to how they were before he started
//       (half done stays half done), and a stage another task stands behind stays;
//   5 · the general job he filed it under forgets the visit;
//   6 · one history line, in the worker's name;
//   7 · a CLOSED report ("I did work here") undoes the same way.
// All names are made up.
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(new Date());

function seed([T]) {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  if (localStorage.getItem('wolfson_app_data')) return;
  const admin = { id: 'U-t', name: 'Dana', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const stages = [
    { id: 'skhtatb', name: 'Sold/Start', color: '#64748b', order: 1, active: true, kind: 'work' },
    { id: 'S2', name: 'Fans', color: '#0ea5e9', order: 2, active: true, kind: 'work' },
    { id: 'S3', name: 'Wall units', color: '#f59e0b', order: 3, active: true, kind: 'work' },
    { id: 'S4', name: 'Registers', color: '#84cc16', order: 4, active: true, kind: 'work' },
  ];
  const apt = (id, num, fam, marks) => ({ id, buildingId: 'A1', floor: 4, apartmentNumber: num, displayName: fam, isUnnamed: false,
    isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'S2', stageDates: {}, bubbles: true,
    stageMarks: marks, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
  const base = { buildingId: 'A1', contractorId: 'C-jo', dueDate: T, priority: 'normal', createdAt: '2026-01-01', createdByName: 'x' };
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: admin, users: [admin], stages,
    contractors: [{ id: 'C-jo', name: 'Yaakov', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01', lang: 'en', perms: {} }],
    contractorAssignments: [
      // Open "I'm going to work here" on A1-16: Fans was half done before, he set Fans + Wall units doing.
      { ...base, id: 'T-R', apartmentId: 'A1-16', taskDescription: 'Fans + Wall units — working here today', stageId: 'S2',
        stageIds: ['S2', 'S3'], stagesWorked: ['S2', 'S3'], stageReport: true, createdBy: 'C-jo', completedAt: null,
        marksBefore: { skhtatb: 'done', S2: 'pending' }, marksBeforeAt: '2026-10-19T06:00:00.000Z' },
      // Another (office) task on A1-16 stands behind Wall units.
      { ...base, id: 'T-W', apartmentId: 'A1-16', taskDescription: 'Wall units by the office', stageId: 'S3', stageIds: ['S3'],
        stageReport: true, stagesWorked: ['S3'], createdBy: 'U-t', completedAt: null },
      // A closed "I did work here" on A1-17: Registers ticked done.
      { ...base, id: 'T-C', apartmentId: 'A1-17', taskDescription: 'Registers — working here today', stageId: 'S4', stageIds: ['S4'],
        stagesWorked: ['S4'], stageReport: true, createdBy: 'C-jo', completedAt: '2026-10-19T09:00:00.000Z',
        marksBefore: { skhtatb: 'done' }, marksBeforeAt: '2026-10-19T06:00:00.000Z' },
      // An office task for him on A1-18 — no switch, no bin.
      { ...base, id: 'T-O', apartmentId: 'A1-18', taskDescription: 'Office job', stageId: 'S2', stageIds: ['S2'], createdBy: 'U-t', completedAt: null },
      // A general job carrying T-R as one of its visits.
      { ...base, id: 'T-G', apartmentId: '', taskDescription: 'All the fans', stageId: null, createdBy: 'U-t', completedAt: null,
        general: { projectId: 'wolfson' }, visits: [{ apartmentId: 'A1-16', at: '2026-10-19T06:00:00.000Z', stageId: 'S2', reportTaskId: 'T-R' }] },
    ],
    contractorNotes: [{ id: 'N-1', assignmentId: 'T-R', apartmentId: 'A1-16', contractorId: 'C-jo', authorType: 'contractor', authorName: 'Yaakov', text: 'here', createdAt: '2026-10-19T07:00:00.000Z' }],
    contractorPhotos: [{ id: 'P-1', assignmentId: 'T-R', apartmentId: 'A1-16', contractorId: 'C-jo', filename: 'a.png', mimeType: 'image/png', dataUrl: '', uploadedAt: '2026-10-19T07:00:00.000Z' }],
    apartments: [
      apt('A1-16', '16', 'Lerner', { skhtatb: 'done', S2: 'doing', S3: 'doing' }),
      apt('A1-17', '17', 'Peretz', { skhtatb: 'done', S4: 'done' }),
      apt('A1-18', '18', 'Mizrahi', {}),
    ],
  }));
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
await ctx.addInitScript(seed, [TODAY]);
const page = await ctx.newPage();
page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message); fails++; } });
await page.goto(`${APP}/c/tok-jo`);
await page.waitForTimeout(2500);
const all = page.locator('button:has-text("All")').first();
if (await all.count()) await all.click().catch(() => {});
await page.waitForTimeout(300);
const wolf = () => page.evaluate(() => new Promise(r => setTimeout(() => r(JSON.parse(localStorage.getItem('wolfson_app_data'))), 400)));
const openCard = async id => { await page.locator(`[data-task-card="${id}"]`).first().click(); await page.waitForTimeout(600); };
const closeSheet = async () => { await page.mouse.click(200, 30); await page.waitForTimeout(400); };

// ── 2 · office task: no bin
await openCard('T-O');
check(await page.locator('[data-task-delete="T-O"]').count() === 0, '2 · an office task shows no bin without the switches');
await closeSheet();

// ── 1, 3 · the self-started open report
await openCard('T-R');
const btn = page.locator('[data-task-delete="T-R"]');
check(await btn.count() === 1, '1 · his own start wears the undo icon with no delete switch on');
check(await btn.getAttribute('data-task-undo-own') !== null, '1 · it is the UNDO kind');
check(/Undo/.test(await btn.getAttribute('title') ?? ''), '1 · its title says Undo', await btn.getAttribute('title'));
await btn.click(); await page.waitForTimeout(300);
const ask = await page.locator('[data-task-delete-ask]').innerText().catch(() => '');
check(/by mistake/.test(ask) && /before you started/.test(ask), '3 · it asks first, in plain words', ask.replace(/\n/g, ' | '));
check(/Undo/.test(await page.locator('[data-task-delete-yes]').innerText()), '3 · the button says Undo');
await page.locator('[data-task-delete-yes]').click();
await page.waitForTimeout(500);
let d = await wolf();
check(!d.contractorAssignments.some(a => a.id === 'T-R'), '3 · the task is gone');
check(!d.contractorNotes.some(n => n.assignmentId === 'T-R') && !d.contractorPhotos.some(p => p.assignmentId === 'T-R'), '3 · its photos and messages went with it');
const m16 = d.apartments.find(a => a.id === 'A1-16').stageMarks ?? {};
check(m16.S2 === 'pending', '4 · Fans is half done again, as it was before he started', JSON.stringify(m16));
check(m16.S3 === 'doing', '4 · Wall units stays — another task stands behind it', JSON.stringify(m16));
check(m16.skhtatb === 'done', '4 · Sold/Start untouched');
const g = d.contractorAssignments.find(a => a.id === 'T-G');
check(g && !(g.visits ?? []).some(v => v.reportTaskId === 'T-R'), '5 · the general job forgot the visit');
const logs = (d.activityLogs ?? []).filter(l => l.actionType === 'task_deleted');
check(logs.length === 1 && logs[0].userName === 'Yaakov', '6 · one history line, in the worker\'s name', JSON.stringify(logs.map(l => l.userName)));
check(await page.locator('[data-task-card="T-R"]').count() === 0, '3 · the card is off his list');

// ── 7 · a closed report
await openCard('T-C');
check(await page.locator('[data-task-delete="T-C"][data-task-undo-own]').count() === 1, '7 · a closed "I did work here" can be undone too');
await page.locator('[data-task-delete="T-C"]').click(); await page.waitForTimeout(250);
await page.locator('[data-task-delete-yes]').click(); await page.waitForTimeout(500);
d = await wolf();
const m17 = d.apartments.find(a => a.id === 'A1-17').stageMarks ?? {};
check(!d.contractorAssignments.some(a => a.id === 'T-C'), '7 · the closed report is gone');
check(m17.S4 === undefined || m17.S4 === 'todo', '7 · Registers is no longer ticked done', JSON.stringify(m17));
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/undoown.png` });

await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
