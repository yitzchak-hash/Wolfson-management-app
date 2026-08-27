// The widget dedupe: every RETIRED id still draws — as its survivor, with its
// old settings translated (widgetAliases.ts) — the store shelf sells none of
// them, and the survivors' new pencil switches really switch.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const tomorrow = (() => {
  const t = new Date(Date.now() + 86_400_000);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
})();

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript((tom) => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [
      { id: 'S-1', name: 'Piping', color: '#0ea5e9', order: 1, active: true, projectId: 'general' },
      { id: 'S-2', name: 'Wiring', color: '#f43f5e', order: 2, active: true, projectId: 'general' },
    ],
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }],
    contractorAssignments: [{
      id: 'T-1', apartmentId: 'G-1', buildingId: 'G', contractorId: 'C-jo',
      taskDescription: 'Hang units', stageId: null, dueDate: tom, priority: 'normal',
      createdAt: '2026-01-01', completedAt: null,
    }],
    apartments: [{
      id: 'G-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Cohen',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: 'S-1', stageDates: {}, canvasX: 60, canvasY: 200,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [
      // A weekly notebook, so the planner-sourced merges have something to read.
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 60, y: 700, w: 800, h: 260, text: '', color: '#ffffff',
        data: { people: ['c:C-jo'], firstWeek: '2026-08-23', weekCount: 4, span: 5,
          cells: { [`c:C-jo|${tom}`]: [{ id: 'R-1', text: 'Pardes 8am' }] } } },
      // RETIRED ids, exactly as an old board would still carry them.
      { id: 'CE-tom', type: 'widget', widget: 'tv-tomorrow', x: 320, y: 180, w: 300, h: 180, text: '', color: '#ffffff', data: {} },
      { id: 'CE-week', type: 'widget', widget: 'week-ahead', x: 660, y: 180, w: 300, h: 140, text: '', color: '#ffffff', data: {} },
      { id: 'CE-ring', type: 'widget', widget: 'progress-ring', x: 1000, y: 180, w: 160, h: 160, text: '', color: '#ffffff',
        data: { stageId: 'S-1' } },
      { id: 'CE-funnel', type: 'widget', widget: 'stage-funnel', x: 1200, y: 180, w: 260, h: 180, text: '', color: '#ffffff', data: {} },
      { id: 'CE-clock', type: 'widget', widget: 'tv-clock', x: 320, y: 400, w: 320, h: 200, text: '', color: '#ffffff', data: {} },
      { id: 'CE-pct', type: 'widget', widget: 'progress-bar', x: 680, y: 420, w: 215, h: 95, text: '', color: '#ffffff',
        data: { title: 'First fix', pct: 65 } },
      { id: 'CE-find', type: 'widget', widget: 'job-search', x: 940, y: 400, w: 340, h: 300, text: '', color: '#ffffff', data: {} },
      { id: 'CE-load', type: 'widget', widget: 'contractor-load', x: 1320, y: 420, w: 220, h: 130, text: '', color: '#ffffff',
        data: { contractorId: 'C-jo' } },
      // A SURVIVOR using a new switch directly.
      { id: 'CE-due', type: 'widget', widget: 'due-today', x: 60, y: 420, w: 230, h: 165, text: '', color: '#ffffff',
        data: { window: 'tomorrow' } },
    ],
  }));
}, tomorrow);
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3200);

const textOf = id => page.evaluate(i =>
  document.querySelector(`[data-node-id="${i}"]`)?.textContent ?? '', id);

// ── the retired ids, drawing their survivors ────────────────────────────────
check((await textOf('CE-tom')).includes('TOMORROW') && (await textOf('CE-tom')).includes('Joseph'),
  'tv-tomorrow draws the notebook\'s tomorrow, with the person on it',
  (await textOf('CE-tom')).slice(0, 60));
check(/week ahead/i.test(await textOf('CE-week')),
  'week-ahead draws Coming up\'s seven-day strip');
check(/\d+%/.test(await textOf('CE-ring')),
  'progress-ring draws One stage\'s ring, with its percentage', (await textOf('CE-ring')).slice(0, 30));
check(/spread by stage/i.test(await textOf('CE-funnel')) && (await textOf('CE-funnel')).includes('Piping'),
  'stage-funnel draws Stages as bars');
check(/[֐-׿]/.test(await textOf('CE-clock')),
  'tv-clock draws the wall clock with the Hebrew date');
check((await textOf('CE-pct')).includes('65%') && /first fix/i.test(await textOf('CE-pct')),
  'progress-bar draws Target\'s percentage slider at its old value');
check(await page.locator('[data-node-id="CE-find"] input[data-job-find]').count() === 1,
  'job-search draws the forgiving Find a job');
check((await textOf('CE-load')).toUpperCase().includes('JOSEPH') && /1/.test(await textOf('CE-load')),
  'contractor-load draws Workers\' load, one worker, with his open count',
  (await textOf('CE-load')).slice(0, 40));

// ── a survivor's new switch, used directly ──────────────────────────────────
check(/due tomorrow/i.test(await textOf('CE-due')) && (await textOf('CE-due')).includes('Hang units'),
  'Coming up\'s tomorrow window lists tomorrow\'s task', (await textOf('CE-due')).slice(0, 60));

// ── the pencil on a retired id shows the survivor's switches, translated ────
await page.evaluate(() => {
  const node = document.querySelector('[data-node-id="CE-week"]');
  // The action strip is a CHILD of the node, floating above its top edge.
  const btn = [...node.querySelectorAll('button')]
    .find(x => (x.getAttribute('title') || '').toLowerCase().includes('setting'));
  btn?.click();
});
await page.waitForTimeout(600);
const windowSel = await page.evaluate(() => {
  const sels = [...document.querySelectorAll('select')];
  const s = sels.find(x => [...x.options].some(o => o.value === 'week' && /week ahead/i.test(o.label)));
  return s ? s.value : null;
});
check(windowSel === 'week',
  'the old Week ahead\'s pencil opens Coming up\'s Window select, already on the week', String(windowSel));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// ── the shelf sells no retired ids, and no name twice ───────────────────────
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(x => /widget/i.test(x.getAttribute('title') || ''));
  btn?.click();
});
await page.waitForTimeout(1200);
const shelf = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('[data-widget-id]')];
  const ids = cards.map(c => c.getAttribute('data-widget-id'));
  const retired = ['job-search', 'tv-late', 'tv-new', 'tv-feed', 'tv-clock', 'week-ahead',
    'tv-tomorrow', 'tv-out-today', 'tv-week-done', 'contractor-load', 'stage-funnel',
    'tv-stage-spread', 'progress-ring', 'tv-photo', 'tv-photo-wall', 'tv-month',
    'tv-waiting', 'tv-drive', 'progress-bar', 'tv-workspace'];
  return {
    cards: ids.length,
    retiredOnShelf: ids.filter(i => retired.includes(i)),
    findAJob: ids.filter(i => i === 'job-find' || i === 'job-search').length,
  };
});
check(shelf.cards > 0 && shelf.retiredOnShelf.length === 0,
  'the store shelf sells none of the twenty retired ids', JSON.stringify(shelf.retiredOnShelf));
check(shelf.findAJob === 1, 'exactly ONE "Find a job" remains', String(shelf.findAJob));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
