// Plans on the worker's building map (owner, 2026-10-18): "Open the engineered
// plans" now means the units he works in — on his task AND on the map sheet of a
// unit he has a task in; a new switch "Open any engineered plan from the building
// diagram" shows the plan on ANY apartment's map sheet ("I'm going to work here"),
// opening big like usual; the sheet carries the unit's info; and a standard
// apartment wears a small Standard bubble. 390px phone.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';

const APP = process.env.APP || 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const doc = await PDFDocument.create();
const pg = doc.addPage([1191, 842]);
pg.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
pg.drawText('SHEET 1', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
const planBytes = Buffer.from(await doc.save());

const STAGES = [{ id: 's-drilling', name: 'Drilling', color: '#0891b2', order: 2, active: true, kind: 'work' }];
const apt = (id, num, floor, cls, extra = {}) => ({
  id, buildingId: 'A1', floor, apartmentNumber: num, displayName: '', isUnnamed: false, isDuplexApt: false,
  classification: cls, generalNotes: '', currentStageId: 's-drilling', stageDates: {}, bubbles: true, stageMarks: {},
  createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', ...extra,
});
const data = perms => ({
  wolfson_app_data: {
    currentUser: { id: 'U-o', name: 'Officer', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    users: [{ id: 'U-o', name: 'Officer', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' }],
    stages: STAGES,
    contractors: [{ id: 'C-w', name: 'Worker', category: 'ac', token: 'tok-w', active: true, createdAt: '2026-01-01', lang: 'en', perms }],
    apartments: [
      apt('A1-9', '9', 4, 'standard', { plansPdfLink: 'https://drive.google.com/file/d/PLAN-MINE/view', tipus: 'B2' }),
      apt('A1-12', '12', 4, 'shinui', { plansPdfLink: 'https://drive.google.com/file/d/PLAN-OTHER/view' }),
    ],
    contractorAssignments: [{
      id: 'T-1', contractorId: 'C-w', apartmentId: 'A1-9', buildingId: 'A1', taskDescription: 'Fit the unit', stageId: 's-drilling',
      dueDate: day(0), priority: 'normal', completedAt: null, createdAt: '2026-01-01T08:00:00', createdBy: 'U-o', createdByName: 'Officer',
    }],
  },
});
function seed(d) {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  for (const [k, v] of Object.entries(d)) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v));
}
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function phone(perms) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  await ctx.route('**://fonts.googleapis.com/**', r => r.abort());
  await ctx.addInitScript(seed, data(perms));
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (/localStorage/.test(e.message)) return; console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; });
  await page.goto(`${APP}/c/tok-w`);
  await page.waitForTimeout(2200);
  return { ctx, page };
}
const tab = (page, re) => page.evaluate(src => {
  const r = new RegExp(src);
  [...document.querySelectorAll('button')].find(x => r.test((x.textContent || '').trim()))?.click();
}, re.source);
const openUnit = async (page, id) => {
  await page.keyboard.press('Escape').catch(() => {});
  if (await page.locator('[data-work-sheet]').count()) { await page.mouse.click(195, 30); await page.waitForTimeout(300); }
  await page.locator(`[data-apt-id="${id}"]`).first().click();
  await page.waitForTimeout(500);
};
const toMap = async page => {
  await tab(page, /Building Map|^Map$/);
  for (let i = 0; i < 60 && !(await page.locator('[data-apt-id="A1-9"]').count()); i++) await page.waitForTimeout(150);
};

// ══ A · the Contractor level as shipped (his plans only) ══
{
  const { ctx, page } = await phone(undefined);
  await toMap(page);
  await openUnit(page, 'A1-12');
  check(await page.locator('[data-work-sheet]').count() === 1, 'A · tapping a unit opens its sheet');
  check(await page.locator('[data-work-plan]').count() === 0, 'A · a unit he has no task in shows NO plan without the new switch');
  check(await page.locator('[data-work-standard]').count() === 0, 'A · a Changes apartment wears no Standard bubble');
  await openUnit(page, 'A1-9');
  check(await page.locator('[data-work-plan]').count() === 1, 'A · a unit he has a task in shows its plan on the map sheet');
  const info = await page.locator('[data-work-info]').innerText().catch(() => '');
  check(/Floor/.test(info) && /B2/.test(info), 'A · the sheet shows the floor and the type', info);
  check(await page.locator('[data-work-standard]').count() === 1, 'A · a standard apartment wears the Standard bubble on the sheet');
  check(await page.locator('[data-work-plan] [data-plan-standard]').count() === 1, 'A · …and on its plan');
  check(await page.locator('[data-work-here]').count() === 1, "A · \"I'm going to work here\" is still there");
  await ctx.close();
}

// ══ B · the new switch: any plan from the diagram ══
{
  const { ctx, page } = await phone({ seeAnyPlan: true, markUpPlans: true });
  await toMap(page);
  await openUnit(page, 'A1-12');
  check(await page.locator('[data-work-plan]').count() === 1, 'B · with the new switch ANY unit shows its plan');
  await page.locator('[data-work-plan] [data-plan-toggle]').click();
  let drawn = false;
  for (let i = 0; i < 80 && !drawn; i++) {
    drawn = await page.evaluate(() => [...document.querySelectorAll('[data-work-plan] canvas')].some(c => c.width > 50));
    if (!drawn) await page.waitForTimeout(250);
  }
  check(await page.locator('[data-work-plan] [data-plan-view="open"]').count() === 1 && drawn, 'B · it opens big and the sheet is drawn');
  check(await page.locator('[data-work-plan] [data-plan-download]').count() === 1, 'B · Download is on it, like usual');
  check(await page.locator('[data-work-plan] [data-plan-markup]').count() === 1, 'B · Mark up is on it for a worker allowed to draw');
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/workerplan.png` });
  await ctx.close();
}

// ══ C · both plan switches off: no plan anywhere ══
{
  const { ctx, page } = await phone({ seePlans: false, seeAnyPlan: false });
  await page.locator('[data-task-card="T-1"]').first().click().catch(() => {});
  await page.waitForTimeout(600);
  check(await page.locator('[data-plan-head]').count() === 0, 'C · with plans switched off the task sheet shows no plan');
  await ctx.close();
}

// ══ D · the task sheet still shows his plan, with the bubble ══
{
  const { ctx, page } = await phone(undefined);
  await page.locator('[data-task-card="T-1"]').first().click();
  await page.waitForTimeout(600);
  check(await page.locator('[data-plan-head]').count() === 1, 'D · his task sheet shows the plan');
  check(await page.locator('[data-plan-standard]').count() === 1, 'D · with the Standard bubble on a standard apartment');
  await ctx.close();
}

await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
