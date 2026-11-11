// The worker's My Tasks and sheet after recording 2026-11-11 122535 (Igor's link):
//   the day filter is ONE bubble (opens, folds, a Dates choice with from/to), the Done line folded by default with a
//   bigger ✓, "No new tasks" when nothing open is left, the flat he is working in shows in My Tasks, and the
//   apartment sheet has the plan above and the green button in its foot (no View button on the thumbnail).
// Dev server on 5173 (APP=). Every /api call stubbed; names made up.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const APP = process.env.APP || 'http://localhost:5173';
let fails = 0, passes = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); ok ? passes++ : fails++; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const STAGES = [
  { id: 'skhtatb', name: 'Sold', color: '#64748b', order: 1, active: true, kind: 'work' },
  { id: 's-framing', name: 'Framing', color: '#f59e0b', order: 2, active: true, kind: 'work', trade: 'ac', how: 'site' },
];
const apt = (id, num, floor, name, extra = {}) => ({ id, buildingId: 'A1', floor, apartmentNumber: num, displayName: name, isUnnamed: false, isDuplexApt: false,
  classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, bubbles: true, stageMarks: { skhtatb: 'done' },
  createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', ...extra });
const admin = { id: 'U-o', name: 'Officer', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
const task = (id, aptId, due, done) => ({ id, contractorId: 'C-w', apartmentId: aptId, buildingId: 'A1', taskDescription: `Task ${id}`,
  dueDate: due, stageId: null, priority: 'normal', completedAt: done ? new Date().toISOString() : null, createdAt: '2026-01-01' });
const DATA = { currentUser: admin, users: [admin], stages: STAGES,
  contractors: [{ id: 'C-w', name: 'Yaakov Test', category: 'ac', token: 'tok-site', active: true, createdAt: '2026-01-01', lang: 'en',
    perms: { workHere: true, seeDiagrams: true, seeAllApartments: true, seeAnyPlan: true } }],
  apartments: [
    apt('A1-23', '23', 6, 'Cohen', { plansPdfLink: 'https://drive.google.com/file/d/PLANFILE0001/view' }),
    apt('A1-24', '24', 6, 'Levi', { siteVisits: [{ id: 'v1', byId: 'C-w', byName: 'Yaakov Test', startedAt: new Date().toISOString(), status: 'working' }] }),
  ],
  contractorAssignments: [task('T-open', 'A1-23', day(3), false), task('T-done', 'A1-23', day(-1), true)] };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
await ctx.route('**/api/**', r => r.fulfill({ json: { ok: true, files: [] } }));
await ctx.route(/drive\.google\.com\/thumbnail/, r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await ctx.route('**://fonts.googleapis.com/**', r => r.abort());
await ctx.addInitScript(d => {
  localStorage.setItem('wolfson_app_version', '3'); localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  if (!localStorage.getItem('wolfson_app_data')) localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}, DATA);
const page = await ctx.newPage();
page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; } });
const waitFor = async (sel, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await page.locator(sel).count()) return true; await page.waitForTimeout(100); } return false; };

await page.goto(`${APP}/c/tok-site`); await page.waitForTimeout(2500);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /My Tasks/.test((x.textContent || '').trim()))?.click());
await page.waitForTimeout(500);

// the flat he is working in shows in My Tasks
check(await page.locator('[data-tasks-working] [data-working-bar="A1-24"]').count() === 1, 'the flat he is working in shows in My Tasks');
// the filter: one bubble, folded
check(await page.locator('[data-day-filter-bubble]').count() === 1 && await page.locator('[data-day-filter]').count() === 0, 'the day filter is one folded bubble');
check(/All/.test(await page.locator('[data-day-filter-summary]').innerText()), 'the bubble says "All"');
await page.locator('[data-day-filter-bubble]').click(); await page.waitForTimeout(200);
const chips = await page.locator('[data-day-filter]').evaluateAll(es => es.map(e => e.getAttribute('data-day-filter')));
check(chips.join(',') === 'all,yesterday,today,tomorrow,week,dates', 'opened: All · Yesterday · Today · Tomorrow · This Week · Dates', chips.join(','));
await page.locator('[data-day-filter="today"]').click(); await page.waitForTimeout(300);
check(await page.locator('[data-day-filter]').count() === 0 && /Today/.test(await page.locator('[data-day-filter-summary]').innerText()), 'picking Today folds it and the bubble says "Today"');
check(await page.locator('[data-list-empty]').count() === 1, 'nothing today (the open task is in 3 days)');
// specific dates
await page.locator('[data-day-filter-bubble]').click(); await page.waitForTimeout(200);
await page.locator('[data-day-filter="dates"]').click(); await page.waitForTimeout(200);
check(await page.locator('[data-day-range]').count() === 1, 'Dates opens the From / To boxes and stays open');
await page.locator('[data-day-to]').fill(day(5)); await page.waitForTimeout(400);
const rowsNow = await page.locator('main').innerText();
check(/Task T-open/.test(rowsNow), 'today → in 5 days shows the task in 3 days');
await page.locator('[data-day-to]').fill(day(1)); await page.waitForTimeout(400);
check(!/Task T-open/.test(await page.locator('main').innerText()), 'today → tomorrow leaves it out');
const sum = await page.locator('[data-day-filter-summary]').innerText();
check(/–/.test(sum), 'the bubble says the range', sum);
await page.locator('[data-day-filter-bubble]').click(); await page.waitForTimeout(200);
await page.locator('[data-day-filter-bubble]').click(); await page.waitForTimeout(200);
await page.locator('[data-day-filter="all"]').click(); await page.waitForTimeout(400);

// the Done line: folded by default, a bigger check
check(await page.locator('[data-done-fold][aria-expanded="false"]').count() === 1, 'Done is folded by default');
check(!/Task T-done/.test(await page.locator('main').innerText()), 'the done task is hidden while folded');
const ck = await page.locator('[data-done-line] svg').first().evaluate(e => e.getBoundingClientRect().width);
if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/tasks.png' });
check(ck >= 20, 'the Done check mark is bigger', String(ck));
check(await page.locator('[data-no-new-tasks]').count() === 0, 'no "No new tasks" while a task is open');
await page.evaluate(() => window.__store?.getState().updateContractorAssignment('T-open', { completedAt: new Date().toISOString() }));
await page.waitForTimeout(500);
check(await waitFor('[data-no-new-tasks]', 3000) && /No new tasks/.test(await page.locator('[data-no-new-tasks]').innerText()), 'nothing open → "No new tasks"');

// the sheet: plan first, the button in the foot, no View on the thumbnail
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /Map/.test((x.textContent || '').trim()))?.click());
await page.waitForTimeout(500);
const pick = page.locator('button:has-text("Wolfson Residence")'); if (await pick.count()) await pick.first().click();
await waitFor('[data-apt-id="A1-23"]');
await page.locator('[data-apt-id="A1-23"]').first().click(); await waitFor('[data-work-sheet]'); await page.waitForTimeout(500);
const planY = await page.locator('[data-work-plan]').boundingBox();
const footY = await page.locator('[data-work-foot]').boundingBox();
if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/sheet.png' });
check(!!planY && !!footY && planY.y < footY.y, 'the plan stands above the green button', `${planY?.y} < ${footY?.y}`);
check(await page.locator('[data-plan-view="thumb"]').count() === 1 && await page.locator('[data-plan-toggle]').count() === 0, 'no View button — the picture opens itself');
await page.locator('[data-plan-view="thumb"]').click(); await page.waitForTimeout(400);
check(await page.locator('[data-plan-view="open"]').count() === 1 && await page.locator('[data-plan-toggle]').count() === 1, 'tapped, the plan opens and Hide stands');
const wide = await page.evaluate(() => document.documentElement.scrollWidth);
check(wide <= 402, 'the phone is never scrolled sideways', String(wide));
console.log(`\n${passes} pass · ${fails} fail`);
await b.close();
process.exit(fails ? 1 : 0);
