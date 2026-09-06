// A Russian worker's phone, four screens — to LOOK at, and to assert that no
// English day/month word survives on the task list, the calendar or the planner.
import { chromium } from 'playwright';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from './seed.mjs';
const OUT = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await applySeed(ctx, blob);
await ctx.addInitScript(() => {
  const d = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
  for (const c of d.contractors || []) { c.lang = 'ru'; c.perms = { ...(c.perms || {}), seeSchedule: true, seePlanner: true, seeDiagrams: true }; }
  // A notebook with the worker on it, so the planner tab has days to name.
  const sun = new Date(); sun.setDate(sun.getDate() - sun.getDay());
  const iso = new Date(sun.getTime() - sun.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  d.canvasElements = [...(d.canvasElements || []).filter(e => e.widget !== 'rota'), {
    id: 'CE-rota-ru', type: 'widget', widget: 'rota', x: 40, y: 40, w: 700, h: 320, z: 5,
    data: { people: (d.contractors || []).map(c => c.id), firstWeek: iso, weekCount: 1, cells: {} },
  }];
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', String(e).split('\n')[0]));
await page.goto(`http://localhost:5173/c/${PORTAL_TOKEN}`);
await page.waitForTimeout(3500);
await page.locator('[data-show-all-days]').click().catch(() => {});
await page.waitForTimeout(600);
const ENGLISH = /(?<![А-яЁё])\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|September|Today|Tomorrow|Overdue|Planner|Weekly|Monthly|Close job|Apt)\b/;
const body = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
let t = await body();
check(!ENGLISH.test(t), 'the task list carries no English day, month or label word', (t.match(ENGLISH) || [])[0]);
await page.screenshot({ path: `${OUT}/ru-list.png` });
await page.locator('button', { hasText: /Календарь|календарь/ }).first().click().catch(async () => {
  await page.locator('nav button, [data-portal-tab]').nth(1).click().catch(() => {});
});
await page.waitForTimeout(800);
await page.locator('[data-cal-mode="month"]').click().catch(() => {});
await page.waitForTimeout(600);
t = await body();
check(/Пн|Вт|Ср/i.test(t) && !ENGLISH.test(t), 'the month grid is in Russian (weekday row, month title)', (t.match(ENGLISH) || [])[0] || t.slice(0, 100));
await page.screenshot({ path: `${OUT}/ru-calendar.png` });
await page.locator('[data-cal-mode="week"]').click().catch(() => {});
await page.waitForTimeout(600);
t = await body();
check(/понедельник|вторник|среда|четверг|пятница|суббота|воскресенье/i.test(t), 'the weekly list names the days in Russian', t.slice(0, 120));
await page.screenshot({ path: `${OUT}/ru-week.png` });
// a task sheet
await page.locator('button', { hasText: /Задачи|задачи/ }).first().click().catch(() => {});
await page.waitForTimeout(600);
await page.locator('[data-show-all-days]').click().catch(() => {});
await page.waitForTimeout(400);
const cards = page.locator('main [data-task-card], main button.w-full, main .rounded-2xl');
await page.getByText(/Кв\.|Работа/).first().click({ timeout: 4000 }).catch(() => {});
await page.waitForTimeout(900);
t = await body();
check(!ENGLISH.test(t), 'the open task sheet carries no English word', (t.match(ENGLISH) || [])[0]);
await page.screenshot({ path: `${OUT}/ru-sheet.png` });
// the notebook
await page.keyboard.press('Escape').catch(() => {});
await page.mouse.click(20, 400).catch(() => {});
await page.waitForTimeout(400);
await page.locator('button', { hasText: /Расписание/ }).first().click().catch(() => {});
await page.waitForTimeout(1200);
t = await body();
check(/Пн|Вт|Ср|Чт/i.test(t) && !/\b(Mon|Tue|Wed|Thu|Sun)\b/.test(t), 'the notebook names its days in Russian', (t.match(/\b(Mon|Tue|Wed|Thu|Sun)\b/) || [])[0] || t.slice(-160));
await page.screenshot({ path: `${OUT}/ru-planner.png` });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await browser.close();
