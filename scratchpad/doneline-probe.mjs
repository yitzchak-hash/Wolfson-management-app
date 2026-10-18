// The Done line on the worker's phone (owner, 2026-10-18 — "The Done Line",
// look C: one small "Latest ▾" button on the line opening a menu; Latest ·
// Today · This week first; opens on Latest, newest closed first; the line
// folds with a tiny arrow at its edge, remembered on this phone; words in his
// language). Igor reads Russian; a 390×844 phone. Dates from the real clock.
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const now = new Date();
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOff = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const minsAgo = m => new Date(Date.now() - m * 60_000).toISOString();
const sun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
const lastWeekDay = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() - 3, 12);
const thisWeekNotToday = now.getDay() > 0 ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12) : null;

const STAGES = [{ id: 's-drilling', name: 'Drilling', nameRu: 'Сверление', color: '#0891b2', order: 2, active: true, kind: 'work' }];
const apt = (id, b, num) => ({ id, buildingId: b, floor: 3, apartmentNumber: num, displayName: '', isUnnamed: false, isDuplexApt: false,
  classification: 'standard', generalNotes: '', currentStageId: 's-drilling', stageDates: {}, bubbles: true, stageMarks: {},
  createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
const task = (id, aptId, b, text, due, closed) => ({ id, contractorId: 'C-igor', apartmentId: aptId, buildingId: b, taskDescription: text,
  stageId: 's-drilling', dueDate: due, priority: 'normal', completedAt: closed ?? null, createdAt: '2026-01-01T08:00:00',
  createdBy: 'U-o', createdByName: 'Officer' });
const done = [
  task('DT1', 'A1-1', 'A1', 'Closed twenty minutes ago', ymd(now), minsAgo(20)),
  task('DT2', 'A2-1', 'A2', 'Closed an hour ago', ymd(now), minsAgo(60)),
  task('DL', 'A1-2', 'A1', 'Closed last week', ymd(lastWeekDay), lastWeekDay.toISOString()),
  task('DO', 'A2-2', 'A2', 'Closed a month ago', ymd(dayOff(-30)), dayOff(-30).toISOString()),
  ...(thisWeekNotToday ? [task('DW', 'A1-2', 'A1', 'Closed earlier this week', ymd(thisWeekNotToday), thisWeekNotToday.toISOString())] : []),
];
const data = {
  wolfson_app_data: {
    currentUser: { id: 'U-o', name: 'Officer', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    users: [{ id: 'U-o', name: 'Officer', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' }],
    stages: STAGES,
    contractors: [{ id: 'C-igor', name: 'Igor', category: 'ac', token: 'tok-igor', active: true, createdAt: '2026-01-01', lang: 'ru' }],
    apartments: [apt('A1-1', 'A1', '1'), apt('A1-2', 'A1', '2'), apt('A2-1', 'A2', '1'), apt('A2-2', 'A2', '2')],
    contractorAssignments: [task('OPEN1', 'A1-1', 'A1', 'Open job today', ymd(now)), ...done],
  },
};
function seed(d) {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  for (const [k, v] of Object.entries(d)) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v));
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(seed, data);
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/c/tok-igor`);
await page.waitForSelector('[data-done-line]', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(600);
const doneIds = () => page.$$eval('[data-task-card][data-task-done]', ns => ns.map(n => n.getAttribute('data-task-card')));
const lineText = () => page.locator('[data-done-line]').innerText();

// 1 · the line, its button, its arrow
{
  check(await page.locator('[data-done-line]').count() === 1, '1 · one Done line');
  const sortTxt = await page.locator('[data-done-sort]').innerText();
  check(sortTxt.includes('Последние') && sortTxt.includes('▾'), '1 · the button reads "Latest ▾" in his Russian', sortTxt);
  const last = await page.locator('[data-done-line] > *').last().getAttribute('data-done-fold');
  check(last !== null, '1 · the fold arrow sits at the line\'s edge');
  const ids = await doneIds();
  const expect = ['DT1', 'DT2', ...(thisWeekNotToday ? ['DW'] : []), 'DL', 'DO'];
  check(ids.join() === expect.join(), '1 · opens on Latest: the most recently closed first', ids.join());
  check((await lineText()).includes(`· ${expect.length}`), '1 · the line counts them', await lineText());
  // Open work stays above the line.
  const openY = (await page.locator('[data-task-card="OPEN1"]').boundingBox()).y;
  const lineY = (await page.locator('[data-done-line]').boundingBox()).y;
  check(openY < lineY, '1 · open work sits above the line');
}

// 2 · the menu: Latest · Today · This week first, then the rest
{
  await page.locator('[data-done-sort]').click();
  const picks = await page.$$eval('[data-done-sort-pick]', ns => ns.map(n => n.getAttribute('data-done-sort-pick')));
  check(picks.join() === 'latest,today,week,oldest,lastweek,building,ws', '2 · Latest, Today, This week first', picks.join());
  const words = await page.locator('[data-done-sort-menu]').innerText();
  check(words.includes('Сегодня') && words.includes('Эта неделя') && !/Today|This week/.test(words), '2 · every choice in Russian');
  check(await page.locator('[data-done-sort-pick="latest"][data-on]').count() === 1, '2 · Latest is ticked');
  await page.locator('[data-done-sort-pick="today"]').click();
  await page.waitForTimeout(200);
  check((await doneIds()).join() === 'DT1,DT2', '2 · Today: only what closed today', (await doneIds()).join());
  check((await lineText()).includes('· 2'), '2 · the count follows the choice');
  check(await page.locator('[data-done-sort-menu]').count() === 0, '2 · the menu closes on a pick');
  await page.locator('[data-done-sort]').click();
  await page.locator('[data-done-sort-pick="week"]').click(); await page.waitForTimeout(200);
  check((await doneIds()).join() === ['DT1', 'DT2', ...(thisWeekNotToday ? ['DW'] : [])].join(), '2 · This week: since Sunday', (await doneIds()).join());
  await page.locator('[data-done-sort]').click();
  await page.locator('[data-done-sort-pick="lastweek"]').click(); await page.waitForTimeout(200);
  check((await doneIds()).join() === 'DL', '2 · Last week', (await doneIds()).join());
  await page.locator('[data-done-sort]').click();
  await page.locator('[data-done-sort-pick="oldest"]').click(); await page.waitForTimeout(200);
  check((await doneIds())[0] === 'DO', '2 · Oldest: the oldest first', (await doneIds()).join());
  await page.locator('[data-done-sort]').click();
  await page.locator('[data-done-sort-pick="building"]').click(); await page.waitForTimeout(200);
  const groups = await page.$$eval('[data-done-group]', ns => ns.map(n => n.getAttribute('data-done-group')));
  check(groups.join() === 'A1,A2', '2 · By building: a heading per building', groups.join());
}

// 3 · the fold, remembered on this phone
{
  await page.locator('[data-done-sort]').click();
  await page.locator('[data-done-sort-pick="latest"]').click(); await page.waitForTimeout(150);
  await page.locator('[data-done-fold]').click(); await page.waitForTimeout(200);
  check((await doneIds()).length === 0, '3 · the arrow folds the done jobs away');
  check(await page.locator('[data-done-sort]').count() === 0, '3 · folded, only the line and its count stay');
  check((await lineText()).includes(`· ${done.length}`), '3 · the folded line still says how many', await lineText());
  check(await page.locator('[data-task-card="OPEN1"]').count() === 1, '3 · open work untouched');
  await page.reload(); await page.waitForSelector('[data-done-line]'); await page.waitForTimeout(500);
  check((await doneIds()).length === 0, '3 · still folded after a reload');
  await page.locator('[data-done-fold]').click(); await page.waitForTimeout(200);
  check((await doneIds()).length === done.length, '3 · the arrow opens it again');
  await page.locator('[data-done-sort]').click();
  await page.locator('[data-done-sort-pick="today"]').click();
  await page.reload(); await page.waitForSelector('[data-done-line]'); await page.waitForTimeout(500);
  check((await page.locator('[data-done-sort]').innerText()).includes('Сегодня'), '3 · his choice is remembered too');
  const stored = await page.evaluate(() => localStorage.getItem('portal_done_tok-igor'));
  check(stored === JSON.stringify({ open: true, sort: 'today' }), '3 · kept on this phone only', stored);
}
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/doneline.png`, fullPage: true });
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
