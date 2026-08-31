// Probe for the widget round: the rebuilt Timeline (bars, overdue red, today,
// clusters), the search tile's themes, the unit card's tile gestures, and the
// strip card's stage dot.
import { chromium } from 'playwright';

const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const day = n => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const sunday = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return day(-new Date().getDay()); })();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1800, height: 1100 } });
await ctx.addInitScript(([sun, d0, d1, d2, d3, dm3, dm2]) => {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('active_project', 'general');
  const user = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const contractors = [
    { id: 'C-a', name: 'Motti', category: 'general', token: 't1', active: true, createdAt: '2026-01-01' },
    { id: 'C-b', name: 'Sasha', category: 'general', token: 't2', active: true, createdAt: '2026-01-01' },
  ];
  const stages = [
    { id: 'sg1', name: 'Piping', color: '#0ea5e9', order: 1, active: true, projectId: 'general' },
    { id: 'sg2', name: 'Geves', color: '#8b5cf6', order: 2, active: true, projectId: 'general' },
  ];
  const jobs = ['Artzi', 'Goldman', 'Liff', 'Klein', 'Rosen', 'Buchnik'].map((n, i) => ({
    id: `G-t${i}`, buildingId: 'G', apartmentNumber: '', floor: 0, displayName: n,
    classification: 'standard', isUnnamed: false, createdAt: '2026-01-01',
    canvasX: 1400, canvasY: 200 + i * 140, currentStageId: i % 2 ? 'sg2' : 'sg1',
  }));
  const mk = (id, apt, who, due, days, extra = {}) => ({
    id, apartmentId: apt, buildingId: 'G', contractorId: who,
    taskDescription: `Task ${id}`, dueDate: due, ...(days ? { days } : {}),
    completedAt: null, createdAt: '2026-08-01T09:00:00Z', priority: 'normal', ...extra,
  });
  const assignments = [
    mk('T1', 'G-t0', 'C-a', d2, [d0, d1, d2]),
    mk('T2', 'G-t1', 'C-b', d1, null, { priority: 'urgent' }),
    mk('T3', 'G-t2', 'C-a', dm2, null),                       // overdue
    mk('T4', 'G-t3', 'C-b', dm3, null, { completedAt: `${dm3}T10:00:00Z` }),
    mk('T5', 'G-t4', 'C-a', d3, [d1, d2, d3]),
    mk('T6', 'G-t5', 'C-b', d1, null),
    mk('T7', 'G-t0', 'C-b', d1, null),
    mk('T8', 'G-t1', 'C-a', d2, null),
    mk('T9', 'G-t2', 'C-b', d3, null),
  ];
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors,
    apartments: [{
      id: 'W-1', buildingId: 'A1', apartmentNumber: '37', floor: 10, displayName: 'Cohen',
      classification: 'standard', isUnnamed: false, createdAt: '2026-01-01', currentStageId: 's2',
    }],
  }));
  localStorage.setItem('general_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors, stages,
    apartments: jobs, contractorAssignments: assignments,
    canvasElements: [
      { id: 'CE-tl', type: 'widget', widget: 'timeline', x: 60, y: 130, w: 560, h: 220,
        text: '', color: '#ffffff', data: { showDone: '1', window: 'month' } },
      { id: 'CE-s1', type: 'widget', widget: 'search-tile', x: 60, y: 400, w: 210, h: 210,
        text: '', color: '#ffffff', data: {} },
      { id: 'CE-s2', type: 'widget', widget: 'search-tile', x: 290, y: 400, w: 210, h: 210,
        text: '', color: '#ffffff', data: { theme: 'light' } },
      { id: 'CE-s3', type: 'widget', widget: 'search-tile', x: 520, y: 400, w: 210, h: 210,
        text: '', color: '#ffffff', data: { theme: 'sky' } },
      { id: 'CE-s4', type: 'widget', widget: 'search-tile', x: 750, y: 400, w: 210, h: 210,
        text: '', color: '#ffffff', data: { theme: 'minimal' } },
      { id: 'CE-unit', type: 'widget', widget: 'unit-card', x: 60, y: 650, w: 230, h: 110,
        text: '', color: '#ffffff', data: { projectId: 'wolfson', aptId: 'W-1' } },
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 660, y: 120, w: 700, h: 300,
        text: '', color: '#ffffff',
        data: { people: ['c:C-a'], firstWeek: sun, weekCount: 1, cardStyle: 'strips',
                cells: { [`c:C-a|${sun}`]: [{ id: 'EN-1', jobId: 'G-t0' }] } } },
    ],
  }));
}, [sunday, day(0), day(1), day(2), day(3), day(-3), day(-2)]);

const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(3500);
await page.screenshot({ path: `${SCRATCH}/round31.png` });

// ── Timeline ──
const marks = await page.locator('[data-tl-mark]').count();
check(marks >= 6, `timeline draws bars and diamonds (${marks})`);
check(await page.locator('[data-tl-today]').count() === 1, 'timeline has the Today control');
const overdueBar = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-tl-mark]')];
  return els.some(e => (getComputedStyle(e).borderColor || '').includes('220, 38, 38')
    || (getComputedStyle(e).backgroundColor || '').includes('220, 38, 38'));
});
check(overdueBar, 'an overdue task wears red');

// ── Search tile themes ──
const tileBgs = await page.evaluate(() =>
  ['CE-s1', 'CE-s2', 'CE-s3', 'CE-s4'].map(id => {
    const t = document.querySelector(`[data-node-id="${id}"] [data-search-tile]`);
    if (!t) return null;
    const cs = getComputedStyle(t);
    return [cs.backgroundImage, cs.backgroundColor, cs.border].join('|');
  }));
check(tileBgs.every(Boolean) && new Set(tileBgs).size === 4,
  'four search-tile themes draw four different grounds');

// ── Unit card: click selects, drag moves, double-click travels ──
const cardBox = await page.locator('[data-node-id="CE-unit"]').boundingBox();
await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
await page.waitForTimeout(500);
check((await page.evaluate(() => localStorage.getItem('active_project'))) === 'general',
  'one click does NOT travel');
// Drag it 120px right.
await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(cardBox.x + cardBox.width / 2 + i * 12, cardBox.y + cardBox.height / 2);
  await page.waitForTimeout(20);
}
await page.mouse.up();
await page.waitForTimeout(800);
const movedX = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('general_app_data')).canvasElements
    .find(e => e.id === 'CE-unit').x);
check(movedX > 100, `one click+drag MOVES the card (x 60 → ${Math.round(movedX)})`);
// Double-click travels and opens.
const cardBox2 = await page.locator('[data-node-id="CE-unit"]').boundingBox();
await page.mouse.dblclick(cardBox2.x + cardBox2.width / 2, cardBox2.y + cardBox2.height / 2);
await page.waitForTimeout(2500);
check((await page.evaluate(() => localStorage.getItem('active_project'))) === 'wolfson',
  'double-click travels to Wolfson');
check(await page.locator('.drawer-panel').count() > 0, 'and opens the job window');
await page.keyboard.press('Escape');
await page.waitForTimeout(1200);

// ── Strip stage dot ──
check((await page.evaluate(() => localStorage.getItem('active_project'))) === 'general',
  'the return ticket brought us back');
const dot = await page.evaluate(() => {
  const card = [...document.querySelectorAll('.planner-card')].find(x => /Artzi/.test(x.textContent || ''));
  if (!card) return null;
  const spans = [...card.querySelectorAll('span')];
  const d = spans.find(x => getComputedStyle(x).borderRadius.includes('999')
    || getComputedStyle(x).borderRadius === '50%');
  return d ? getComputedStyle(d).backgroundColor : null;
});
check(dot === 'rgb(14, 165, 233)', `strip card wears the stage dot (${dot})`);

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
