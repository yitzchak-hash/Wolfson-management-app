// "Not finished today" (owner, 2026-10-11, "build it"): the worker's button
// beside Close job (Russian phone), the three questions, the days and stage
// marks it writes, the message to the office; the morning question (No → the
// sheet, Yes → the closing screen); "I don't know yet" → "needs a new day" on
// the card and on the office's notebook tile; the office's own button in the
// apartment window. Run: node scratchpad/notfinished-probe.mjs
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const nextWorking = () => { const d = new Date(); do { d.setDate(d.getDate() + 1); } while (d.getDay() === 5 || d.getDay() === 6); return iso(d); };
const sunday = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return iso(d); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const STAGES = [
  { id: 'skhtatb', name: 'Sold/Start', nameRu: 'Продано/Старт', color: '#64748b', order: 1, active: true, kind: 'work' },
  { id: 's1-piping', name: 'Piping', nameRu: 'Трубы', color: '#3b82f6', order: 3, active: true, kind: 'work' },
  { id: 's1-concealed', name: 'Concealed Units', nameRu: 'Скрытые блоки', color: '#8b5cf6', order: 4, active: true, kind: 'work' },
  { id: 'g-install', name: 'AC installation', color: '#ea6b13', order: 1, active: true, projectId: 'general' },
];
const ESTHER = { id: 'U-esther', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
const IGOR = { id: 'C-igor', name: 'Igor', category: 'ac', token: 'tok-igor', active: true, createdAt: '2026-01-01', lang: 'ru' };
const apt = (id, b, num, floor) => ({
  id, buildingId: b, floor, apartmentNumber: num, displayName: '', isUnnamed: false, isDuplexApt: false, colPosition: ((+num - 1) % 4) + 1,
  classification: 'standard', generalNotes: '', currentStageId: 's1-piping', stageDates: {},
  bubbles: true, stageMarks: { skhtatb: 'done' }, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
});
const task = (id, aptId, text, due, extra = {}) => ({
  id, contractorId: 'C-igor', apartmentId: aptId, buildingId: aptId.split('-')[0], taskDescription: text, stageId: 's1-piping',
  dueDate: due, priority: 'normal', completedAt: null, createdAt: `${day(-5)}T08:00:00`, createdBy: 'U-esther', createdByName: 'Esther', ...extra,
});
function data(extraTasks = []) {
  return {
    wolfson_app_data: {
      currentUser: ESTHER, users: [ESTHER], stages: STAGES, contractors: [IGOR],
      apartments: [apt('A3-12', 'A3', '12', 5), apt('A3-11', 'A3', '11', 5), apt('A3-10', 'A3', '10', 5)],
      contractorAssignments: [
        task('T-now', 'A3-12', 'Piping and concealed units', day(0), { stageIds: ['s1-piping', 's1-concealed'] }),
        task('T-yest', 'A3-11', 'Piping', day(-1)),
        task('T-yest2', 'A3-10', 'Piping', day(-1)),
        ...extraTasks,
      ],
    },
    general_app_data: {
      currentUser: ESTHER, users: [ESTHER], stages: STAGES, contractors: [IGOR], apartments: [], contractorAssignments: [],
      canvasElements: [
        { id: 'CE-rota', type: 'widget', widget: 'rota', x: 160, y: 120, w: 1100, h: 600, text: '', color: '#ffffff',
          data: { people: ['c:C-igor'], firstWeek: sunday(), weekCount: 2, span: 5, cells: {} } },
        { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 40, y: 2400, w: 300, h: 200, text: '', color: '#ffffff', data: {} },
      ],
    },
  };
}
function seed([d, active]) {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('office_notif_asked', '1');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', active);
  for (const [k, v] of Object.entries(d)) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v));
}
async function ctxFor(d, active, viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  await ctx.route('**://fonts.googleapis.com/**', r => r.abort());
  await ctx.addInitScript(seed, [d, active]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (/localStorage/.test(e.message)) return; console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; });
  return { ctx, page };
}
const store = (page, key = 'wolfson_app_data') => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), key);
const T = (s, id) => s.contractorAssignments.find(a => a.id === id);
const latin = t => /[A-Za-z]{3,}/.test(t.replace(/A3|\d+/g, ''));

// ── 1 · the worker's phone, in Russian ───────────────────────────────────────
{
  const { ctx, page } = await ctxFor(data(), 'wolfson', { width: 390, height: 844 });
  await page.goto(`${APP}/c/tok-igor`);
  await page.waitForTimeout(2500);
  const asks = await page.locator('[data-morning-ask]').allTextContents();
  check(asks.length === 2, 'the morning question asks about both of yesterday\'s jobs', String(asks.length));
  check(asks.every(t => /вчера/.test(t) && /Ты закончил A3 1/.test(t)), 'in Russian: "Ты закончил … вчера?"', asks[0]);
  check(!(await page.locator('[data-morning-ask="T-now"]').count()), 'today\'s job is not asked about');

  // Today's job: the button beside Close job.
  await page.locator('button:has-text("All"), button:has-text("Все")').first().click().catch(() => {});
  await page.getByText('Piping and concealed units').first().click();
  await page.waitForTimeout(500);
  const btn = page.locator('[data-not-finished-btn]');
  check(await btn.count() === 1, 'the sheet carries "Not finished today" beside Close job');
  check(await page.locator('[data-close-job]').count() >= 1, 'Close job is still there');
  check(/Сегодня не закончил/.test(await btn.textContent()), 'the button is in his language', await btn.textContent());
  await btn.click();
  await page.waitForTimeout(300);
  check(await page.locator('[data-not-finished]').count() === 1, 'the not-finished screen opens');
  check(await page.locator('[data-nf-stage]').count() === 2, 'two stages → "what did you finish today?" asks');
  const send = page.locator('[data-nf-send]');
  check(await send.isDisabled(), 'Send waits for "when are you coming back"');
  const sheetText = await page.locator('[data-not-finished]').innerText();
  check(!/\b(What|When|Tomorrow|Send)\b/.test(sheetText), 'no English on his screen', sheetText.slice(0, 80));
  await page.locator('[data-nf-stage="s1-piping"]').click();
  await page.locator('[data-nf-message] textarea, [data-nf-message]').first().fill('Осталось подключить блоки').catch(async () => {
    await page.locator('[data-not-finished] textarea').first().fill('Осталось подключить блоки');
  });
  await page.locator('[data-nf-when="tomorrow"]').click();
  check(!(await send.isDisabled()), 'picking a day unlocks Send');
  await send.click();
  await page.waitForTimeout(900);
  check(await page.locator('[data-not-finished]').count() === 0, 'the screen closes');
  let s = await store(page);
  const now = T(s, 'T-now');
  check(JSON.stringify(now.days) === JSON.stringify([day(0), nextWorking()]) && now.dueDate === nextWorking(),
    'today and the come-back day are on the task, due the come-back day', JSON.stringify(now.days));
  check(!now.completedAt, 'the job stays open');
  const a12 = s.apartments.find(a => a.id === 'A3-12');
  check(a12.stageMarks['s1-piping'] === 'done' && a12.stageMarks['s1-concealed'] === 'pending',
    'piping crossed off, concealed units half done', JSON.stringify(a12.stageMarks));
  const note = (s.contractorNotes ?? []).find(n => n.assignmentId === 'T-now');
  check(!!note && note.authorType === 'contractor' && /^Not finished today\. Coming back/.test(note.text) && /Finished today: Piping/.test(note.text)
    && /Осталось подключить блоки/.test(note.text), 'the office gets a message: English line + his own words', note?.text);
  check(now.unfinished?.length === 1 && now.unfinished[0].by === 'Igor', 'the report is kept on the task');

  // Morning question: "No, not finished" → straight onto the three questions.
  await page.keyboard.press('Escape').catch(() => {});
  await page.goto(`${APP}/c/tok-igor`);
  await page.waitForTimeout(2200);
  await page.locator('[data-morning-ask="T-yest"] [data-morning-no]').click();
  await page.waitForTimeout(700);
  check(await page.locator('[data-not-finished]').count() === 1, '"No, not finished" opens the not-finished screen');
  check(await page.locator('[data-nf-stage]').count() === 0, 'one stage → no "what did you finish" question');
  await page.locator('[data-nf-when="unknown"]').click();
  await page.locator('[data-nf-send]').click();
  await page.waitForTimeout(900);
  s = await store(page);
  const y = T(s, 'T-yest');
  check(y.unfinished?.[0]?.next === null && JSON.stringify(y.days) === JSON.stringify([day(-1), day(0)]),
    '"I don\'t know yet": today is added, no come-back day', JSON.stringify(y.days));
  await page.goto(`${APP}/c/tok-igor`);
  await page.waitForTimeout(2200);
  check(!(await page.locator('[data-morning-ask="T-yest"]').count()), 'the answered question is gone');
  await page.locator('button:has-text("Все")').first().click().catch(() => {});
  await page.waitForTimeout(300);
  const tags = await page.locator('[data-task-unfinished]').allTextContents();
  check(tags.some(t => /нужен новый день/.test(t)), 'the card says "needs a new day"', JSON.stringify(tags));

  // Morning question: "Yes, close it" → the closing screen.
  await page.locator('[data-morning-ask="T-yest2"] [data-morning-yes]').click();
  await page.waitForTimeout(700);
  check(await page.locator('[data-closing-panel]').count() === 1, '"Yes, close it" opens the closing screen');
  await ctx.close();
}

// ── 2 · the office's notebook: "needs a new day" on the tile ────────────────
{
  const extra = [task('T-nd', 'A3-10', 'Wall units', day(0), { id: 'T-nd', unfinished: [{ at: `${day(0)}T15:00:00`, by: 'Igor', day: day(0), next: null }] })];
  const d = data(extra);
  d.wolfson_app_data.contractorAssignments = d.wolfson_app_data.contractorAssignments.filter(a => a.id !== 'T-yest2');
  const { ctx, page } = await ctxFor(d, 'general', { width: 1440, height: 1000 });
  await page.goto(`${APP}/jobs`);
  await page.waitForSelector('[data-task-bar="T-nd"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  check(await page.locator('[data-task-bar="T-nd"] [data-bar-needs-day]').count() === 1, 'the notebook tile wears "needs a new day"',
    await page.locator('[data-task-bar="T-nd"]').textContent().catch(() => 'no tile'));
  await ctx.close();
}

// ── 3 · the office's own button in the apartment window ────────────────────
{
  const { ctx, page } = await ctxFor(data(), 'wolfson', { width: 1440, height: 1000 });
  await page.goto(`${APP}/project`);
  await page.waitForTimeout(2000);
  await page.locator('[data-apt-id="A3-12"]').first().click();
  await page.waitForTimeout(600);
  await page.locator('.drawer-panel button:has-text("Tasks")').first().click();
  await page.waitForTimeout(400);
  const ob = page.locator('[data-office-not-finished="T-now"]');
  check(await ob.count() === 1, 'the task card carries the office\'s "Not finished"');
  await ob.click();
  await page.waitForTimeout(300);
  const t = await page.locator('[data-not-finished]').innerText();
  check(/When is he coming back\?/.test(t), 'the office reads "When is he coming back?"');
  await page.locator('[data-nf-when="pick"]').click();
  await page.locator('[data-nf-date]').fill(day(3));
  await page.locator('[data-nf-send]').click();
  await page.waitForTimeout(800);
  check(await page.locator('.drawer-panel').count() >= 1, 'the apartment window is still open');
  const s = await store(page);
  const now = T(s, 'T-now');
  check(now.dueDate === day(3) && now.days.includes(day(0)) && now.unfinished?.[0]?.by === 'Esther', 'the picked day lands on the task', JSON.stringify(now.days));
  const n = (s.contractorNotes ?? []).find(x => x.assignmentId === 'T-now');
  check(n?.authorType === 'office' && /^Not finished today/.test(n.text), 'an office message tells the worker', n?.text);
  check(await page.locator('[data-task-card="T-now"] [data-task-unfinished]').count() === 1, 'the card wears the amber tag');
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
