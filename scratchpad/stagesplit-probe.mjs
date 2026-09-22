// THE WOLFSON STAGE SPLIT (owner, 2026-09-22): the three combined global
// stages become eight on the ramp, each apartment's mark copied onto the
// children, tasks and notes re-pointed, the parents retired — and running it
// again changes nothing. Seeds the LIVE stage list as production has it.
import { chromium } from 'playwright';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  if (localStorage.getItem('wolfson_app_data')) return;
  const T = '2024-01-01T00:00:00Z';
  const st = (id, name, nameHe, color, order, kind = 'work') => ({ id, name, nameHe, color, order, active: true, kind, createdAt: T, updatedAt: T });
  const apt = (id, n, extra) => ({ id, buildingId: 'A1', floor: 2, apartmentNumber: String(n), displayName: `Fam ${n}`, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', stageDates: {}, bubbles: true, createdAt: T, updatedAt: T, updatedBy: 'U', updatedByName: 'U', ...extra });
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: { id: 'U', name: 'Office', code: '999999', role: 'admin', active: true, createdAt: T },
    stages: [
      st('skhtatb', 'Sold/Start', 'נמכר/התחלה', '#64748b', 1),
      st('s1', 'Piping, Concealed Units & Fans', 'צנרת, יחידות נסתרות & ומפוחים', '#f0cf6a', 2),
      st('s4', 'Wall Units & Outdoor Units', 'מעבים + עיליים', '#f59e0b', 6),
      st('s7', 'Registers,Access Panels & Thermostats', 'פתחים,תריסים & תרמוסטטים', '#84cc16', 8),
    ],
    buildings: [{ id: 'A1', name: 'A1' }],
    apartments: [
      apt('A1-1', 1, { currentStageId: 's4', stageMarks: { skhtatb: 'done', s1: 'done', s4: 'doing' } }),
      apt('A1-2', 2, { currentStageId: 's1' }),
      apt('A1-3', 3, { currentStageId: 's7', stageMarks: { s7: 'pending' } }),
      apt('A1-4', 4, { currentStageId: null }),
    ],
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: T }],
    contractorAssignments: [
      { id: 'T-1', apartmentId: 'A1-1', buildingId: 'A1', contractorId: 'C-jo', taskDescription: 'Run the pipes', stageId: 's1', stageIds: ['s1'],
        stageWhenDone: 's4', dueDate: '2026-10-01', priority: 'normal', createdAt: T, createdBy: 'U', createdByName: 'Office', completedAt: null },
    ],
    stageNotes: [{ id: 'N-1', apartmentId: 'A1-1', stageId: 's1', noteText: 'copper 5/8', updatedAt: T, updatedBy: 'U', updatedByName: 'U' }],
  }));
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
await page.goto('http://localhost:5173/project');
await page.waitForTimeout(3200);   // the migration runs 1.6s after the workspace lands
const read = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
  const stages = d.stages || [];
  return {
    active: stages.filter(s => s.active).map(s => `${s.order}:${s.id}`).sort((a, b) => parseFloat(a) - parseFloat(b)),
    retired: stages.filter(s => !s.active).map(s => s.id).sort(),
    count: stages.length,
    colors: Object.fromEntries(stages.map(s => [s.id, s.color])),
    apts: Object.fromEntries((d.apartments || []).map(a => [a.id, { cur: a.currentStageId, marks: a.stageMarks }])),
    task: (d.contractorAssignments || []).find(t => t.id === 'T-1'),
    note: (d.stageNotes || []).find(n => n.id === 'N-1'),
  };
});
const r = await read();
check(r.count === 12, 'twelve stage records: the four that were, plus eight children', String(r.count));
check(JSON.stringify(r.retired) === JSON.stringify(['s1', 's4', 's7']), 'the three combined stages are retired, not deleted', JSON.stringify(r.retired));
check(JSON.stringify(r.active) === JSON.stringify(['1:skhtatb', '2:s1-piping', '3:s1-concealed', '4:s1-fans', '5:s4-wall', '6:s4-outdoor', '7:s7-registers', '8:s7-panels', '9:s7-thermostats']),
  'nine active stages in the owner’s order', JSON.stringify(r.active));
check(r.colors['s1-piping'] === '#9ca3af' && r.colors['s7-thermostats'] === '#65a30d' && r.colors['s4-outdoor'] === '#f97316', 'the ramp runs grey → yellow → orange → green');
const a1 = r.apts['A1-1'];
check(a1.marks['s1-piping'] === 'done' && a1.marks['s1-concealed'] === 'done' && a1.marks['s1-fans'] === 'done', 'a DONE combined stage is done on all three children', JSON.stringify(a1.marks));
check(a1.marks['s4-wall'] === 'doing' && a1.marks['s4-outdoor'] === 'doing' && !('s1' in a1.marks) && !('s4' in a1.marks), 'a half-done pair is doing on both, and the parents’ marks are gone');
check(a1.cur === 's4-wall', 'the headline is the first child that is happening now', String(a1.cur));
check(r.apts['A1-2'].cur === 's1-piping' && !r.apts['A1-2'].marks, 'an apartment that merely STOOD on a combined stage stands on its first child', JSON.stringify(r.apts['A1-2']));
check(r.apts['A1-3'].marks['s7-registers'] === 'pending' && r.apts['A1-3'].marks['s7-thermostats'] === 'pending' && r.apts['A1-3'].cur === 's7-registers', 'a pending combined stage is pending on every child', JSON.stringify(r.apts['A1-3']));
check(r.apts['A1-4'].cur === null && !r.apts['A1-4'].marks, 'an untouched apartment is untouched');
check(r.task.stageId === 's1-piping' && JSON.stringify(r.task.stageIds) === JSON.stringify(['s1-piping', 's1-concealed', 's1-fans']) && r.task.stageWhenDone === 's4-wall',
  'a task on the combined stage is on all three children, its when-done on the first of its pair', JSON.stringify([r.task.stageId, r.task.stageIds, r.task.stageWhenDone]));
check(r.note.stageId === 's1-piping', 'a stage note filed on the parent moves to its first child', r.note.stageId);

// The picker draws the children, not the parents.
await page.locator('[data-apt-id="A1-1"]').first().click();
await page.waitForTimeout(900);
await page.locator('[data-stage-fraction]').first().click().catch(() => {});
await page.waitForTimeout(600);
const bubbles = await page.evaluate(() => [...document.querySelectorAll('[data-stage-bubble]')].map(b => b.getAttribute('data-stage-bubble')));
check(bubbles.length >= 8 && !bubbles.includes('s1') && bubbles.includes('s7-thermostats'), 'the apartment’s board draws the eight children and no combined stage', bubbles.join(','));
await page.keyboard.press('Escape');

// Idempotent: the same again changes nothing.
await page.reload();
await page.waitForTimeout(3200);
const r2 = await read();
check(r2.count === 12 && JSON.stringify(r2.apts) === JSON.stringify(r.apts) && JSON.stringify(r2.task) === JSON.stringify(r.task), 'running the migration again changes nothing');
check(errs.length === 0, 'no page errors', errs[0] || '');
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
