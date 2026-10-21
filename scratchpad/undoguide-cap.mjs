// Screenshots for the worker's "undo a task I opened by mistake" guide (EN + RU).
// All names are made up.
import { chromium } from 'playwright';
const APP = process.env.APP || 'http://localhost:5173';
const OUT = process.env.OUT;
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(new Date());

function seed([T, lang]) {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('portal_push_asked_C-jo', '1');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  if (localStorage.getItem('wolfson_app_data')) return;
  const admin = { id: 'U-t', name: 'Dana', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const apt = (id, num, fam, marks) => ({ id, buildingId: 'A1', floor: 6, apartmentNumber: num, displayName: fam, isUnnamed: false,
    isDuplexApt: false, classification: 'shinui', generalNotes: '', currentStageId: 's1-piping', stageDates: {}, bubbles: true,
    stageMarks: marks, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
  const base = { buildingId: 'A1', contractorId: 'C-jo', dueDate: T, priority: 'normal', createdAt: new Date().toISOString(), createdByName: 'x' };
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: null, users: [admin],
    stages: [
      { id: 'skhtatb', name: 'Sold/Start', nameRu: 'Продано/Старт', color: '#64748b', order: 1, active: true, kind: 'work' },
      { id: 's1-piping', name: 'Piping', nameRu: 'Трубы', color: '#9ca3af', order: 3, active: true, kind: 'work' },
      { id: 's1-fans', name: 'Fans', nameRu: 'Вентиляторы', color: '#f0cf6a', order: 5, active: true, kind: 'work' },
      { id: 's4-wall', name: 'Wall Units', nameRu: 'Настенные блоки', color: '#f59e0b', order: 6, active: true, kind: 'work' },
    ],
    contractors: [{ id: 'C-jo', name: 'Sergei', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01', lang }],
    contractorAssignments: [
      { ...base, id: 'T-R', apartmentId: 'A1-22', taskDescription: 'Fans — working here today', stageId: 's1-fans',
        stageIds: ['s1-fans'], stagesWorked: ['s1-fans'], stageReport: true, createdBy: 'C-jo', completedAt: null,
        marksBefore: { skhtatb: 'done', 's1-piping': 'done' }, marksBeforeAt: new Date().toISOString() },
      { ...base, id: 'T-O', apartmentId: 'A1-23', taskDescription: 'Wall units, living room', stageId: 's4-wall', stageIds: ['s4-wall'], createdBy: 'U-t', completedAt: null },
    ],
    apartments: [
      apt('A1-22', '22', 'Levin', { skhtatb: 'done', 's1-piping': 'done', 's1-fans': 'doing' }),
      apt('A1-23', '23', 'Mor', { skhtatb: 'done' }),
    ],
  }));
}

const rects = {};
const r = (page, sel) => page.evaluate(q => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return [b.top, b.bottom]; }, sel);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const lang of ['en', 'ru']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: false });
  await ctx.addInitScript(seed, [TODAY, lang]);
  const page = await ctx.newPage();
  await page.goto(`${APP}/c/tok-jo`);
  await page.waitForTimeout(3000);
  // Close any banner that asks for notifications.
  for (const sel of ['[data-push-banner] button:last-child']) { const x = page.locator(sel).first(); if (await x.count()) await x.click().catch(() => {}); }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${lang}-1-list.png` });
  await page.locator('[data-task-card="T-R"]').first().click();
  await page.waitForTimeout(900);
  // Ring the undo icon so it is easy to find on paper.
  await page.evaluate(() => {
    const b = document.querySelector('[data-task-undo-own]');
    if (b) { b.style.boxShadow = '0 0 0 3px #fff, 0 0 0 6px #dc2626'; }
  });
  await page.screenshot({ path: `${OUT}/${lang}-2-sheet.png` });
  rects[`${lang}-2`] = [await r(page, '[data-sheet-head]'), await r(page, '[data-sheet-when-where]')];
  await page.evaluate(() => { const b = document.querySelector('[data-task-undo-own]'); if (b) b.style.boxShadow = ''; });
  await page.locator('[data-task-undo-own]').click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const a = document.querySelector('[data-task-delete-yes]');
    if (a) { a.style.boxShadow = '0 0 0 3px #fff, 0 0 0 6px #dc2626'; }
  });
  await page.screenshot({ path: `${OUT}/${lang}-3-ask.png` });
  rects[`${lang}-3`] = [await r(page, '[data-sheet-head]'), await r(page, '[data-task-delete-ask]')];
  await page.locator('[data-task-delete-yes]').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${lang}-4-after.png` });
  const marks = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')).apartments.find(a => a.id === 'A1-22').stageMarks);
  console.log(lang, 'gone:', !(await page.locator('[data-task-card="T-R"]').count()), 'marks after:', JSON.stringify(marks));
  await ctx.close();
}
await b.close();
(await import('node:fs')).writeFileSync(`${OUT}/rects.json`, JSON.stringify(rects));
