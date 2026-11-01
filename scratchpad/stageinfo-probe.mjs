// The (i) at the end of each line of the worker's "What are you doing here
// today?" list (owner, 2026-11-01): tapping it opens what goes in the stage —
// its bubbles in HIS language — and example photos in a grid; it never picks
// the stage. Plain server on 5173. All names made up.
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
const APP = process.env.APP || 'http://localhost:5173';
let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };
const TODAY = new Date().toISOString().slice(0, 10);
const STAGES = [
  { id: 'skhtatb', name: 'Sold', color: '#64748b', order: 1, active: true, kind: 'work' },
  { id: 's1-piping', name: 'Piping', nameRu: 'Трубы', color: '#9ca3af', order: 3, active: true, kind: 'work',
    includes: ['Soldering', 'Pipes'], includesTr: { Soldering: { en: 'Soldering', he: 'הלחמות', ru: 'Пайка' }, Pipes: { en: 'Pipes', he: 'צנרת', ru: 'Трубы' } }, exampleOf: { Soldering: 'FILE-A' } },
  { id: 's-drains', name: 'Drains', nameRu: 'Дренаж', color: '#38bdf8', order: 4, active: true, kind: 'work' },
];
const apt = (id, num) => ({ id, buildingId: 'A1', floor: 4, apartmentNumber: num, displayName: '', isUnnamed: false, isDuplexApt: false,
  classification: 'standard', generalNotes: '', currentStageId: 's1-piping', stageDates: {}, bubbles: true, stageMarks: { skhtatb: 'done' },
  createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
const admin = { id: 'U-o', name: 'Officer', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
const DATA = { currentUser: admin, users: [admin], stages: STAGES,
  contractors: [{ id: 'C-w', name: 'Worker', category: 'ac', token: 'tok-w', active: true, createdAt: '2026-01-01', lang: 'ru', perms: { workHere: true, seeDiagrams: true, seeAllApartments: true } }],
  apartments: [apt('A1-9', '9'), apt('A1-12', '12')],
  contractorAssignments: [{ id: 'T-1', contractorId: 'C-w', apartmentId: 'A1-9', buildingId: 'A1', taskDescription: 'Fit', stageId: 's1-piping', dueDate: TODAY, priority: 'normal', completedAt: null, createdAt: '2026-01-01T08:00:00', createdBy: 'U-o', createdByName: 'Officer' }] };
function seed(d) {
  localStorage.setItem('wolfson_app_version', '3'); localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  if (!localStorage.getItem('wolfson_app_data')) localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await ctx.route('**://fonts.googleapis.com/**', r => r.abort());
const asked = [];
await ctx.route('**://drive.google.com/thumbnail**', r => { asked.push(r.request().url()); r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40"><rect width="30" height="40" fill="#8a8"/></svg>' }); });
await ctx.addInitScript(seed, DATA);
const page = await ctx.newPage();
page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; } });
await page.goto(`${APP}/c/tok-w`);
await page.waitForTimeout(2500);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /Карта|Map/.test((x.textContent || '').trim()))?.click());
for (let i = 0; i < 60 && !(await page.locator('[data-apt-id="A1-12"]').count()); i++) await page.waitForTimeout(150);
if (!(await page.locator('[data-apt-id="A1-12"]').count())) { await page.screenshot({ path: (process.env.SHOTS ?? '/tmp') + '/stageinfo-where.png' }); console.log(await page.evaluate(() => document.body.innerText.slice(0, 600))); }
await page.locator('[data-apt-id="A1-12"]').first().click(); await page.waitForTimeout(500);
await page.locator('[data-work-here]').click(); await page.waitForTimeout(400);
if (await page.locator('[data-work-part-no]').count()) { await page.locator('[data-work-part-no]').click(); await page.waitForTimeout(300); }
// Since 2026-11-01 the stages are asked when he CLOSES: "What did you do here today?"
for (let i = 0; i < 30 && !(await page.locator('[data-close-job]').count()); i++) await page.waitForTimeout(150);
await page.locator('[data-close-job]').first().click(); await page.waitForTimeout(600);
check(await page.locator('[data-close-pick]').count() === 1, 'the "what did you do here today" list is open');
check(await page.locator('[data-stage-info="s1-piping"]').count() === 1, 'Piping has the (i)');
// Owner, 2026-11-01: every stage has its (i) — one with nothing yet shows an empty tile with its name.
check(await page.locator('[data-stage-info="s-drains"]').count() === 1, 'every stage has its (i), even one with no pictures yet');
const pos = await page.evaluate(() => { const i = document.querySelector('[data-stage-info="s1-piping"]').getBoundingClientRect(); const l = document.querySelector('[data-close-pick-stage="s1-piping"]').getBoundingClientRect(); return { right: i.left >= l.right - 1, row: Math.abs((i.top + i.bottom) / 2 - (l.top + l.bottom) / 2) < 6, fits: i.right <= innerWidth }; });
check(pos.right && pos.row && pos.fits, 'the (i) sits at the right end of the line, inside the screen', JSON.stringify(pos));
await page.locator('[data-stage-info="s1-piping"]').click(); await page.waitForTimeout(300);
const win = page.locator('[data-stage-info-window="s1-piping"]');
check(await win.count() === 1, 'tapping it opens the window');
const txt = (await win.innerText()) ?? '';
check(/Трубы/.test(txt) && /Пайка/.test(txt) && /Что сюда входит/.test(txt) && /Примеры фото/.test(txt), 'it reads in his language: name, bubbles, headings', txt.replace(/\s+/g, ' ').slice(0, 120));
check(await win.locator('[data-stage-info-tile]').count() === 2, 'one tile per thing the stage includes');
check(await win.locator('[data-stage-info-tile="Soldering"] img').count() === 1 && /Пайка/.test(await win.locator('[data-stage-info-tile="Soldering"]').innerText()), 'a tile with a photo carries its bubble, in his language');
check(await win.locator('[data-stage-info-tile="Pipes"][data-empty="1"]').count() === 1 && /Трубы/.test(await win.locator('[data-stage-info-tile="Pipes"]').innerText()), 'no photo yet: an empty tile with the words in the middle');
check(asked.some(u => u.includes('id=FILE-A')), 'the photos come from Drive by their file ids');
await win.locator('[data-stage-info-tile="Soldering"]').click(); await page.waitForTimeout(200);
check(await win.locator('[data-stage-info-grid]').count() === 0 && await win.locator('img').count() === 1, 'tapping a photo shows it big');
await page.screenshot({ path: (process.env.SHOTS ?? '/tmp') + '/stageinfo.png' });
await page.mouse.click(195, 20); await page.waitForTimeout(200);
check(await win.count() === 0, 'tapping outside closes it');
check(await page.locator('[data-close-pick-stage="s1-piping"][data-on="1"]').count() === 0, 'the (i) never picked the stage');
await page.locator('[data-close-pick-stage="s1-piping"]').click(); await page.waitForTimeout(150);
check(await page.locator('[data-close-pick-stage="s1-piping"][data-on="1"]').count() === 1, 'the line itself still picks it');
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
