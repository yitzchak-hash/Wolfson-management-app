// THE SMOULDER SWEEP — idle CPU on every screen, with everything mounted.
//
// A self-feeding render loop does not crash first; it SMOULDERS — the
// Building-progress miniature burnt 854ms of script per second while the
// board just sat there, which slowed the machine enough for the router
// starvation to bite, and only threw React #185 when a pinch made React
// flush effects synchronously. The static loopaudit catches the known
// patterns; this sweep catches the pattern nobody has invented yet, by
// measuring the only thing every loop has in common: work while idle.
//
// It seeds ONE OF EVERY WIDGET (tvcrash's id list) with REAL data behind
// them — the ProjectMini lesson: a loop keyed to a data branch never engages
// on an empty seed, so cross-workspace widgets get a Wolfson snapshot and
// tasks/photos/stages exist. Then every major screen is opened and CDP
// Performance metrics are read across five idle seconds.
//
// The verdict reads SCRIPT TIME first — that is a render loop's true
// signature (the real one burnt 830+ms/s; healthy screens run 0-90ms/s of
// tickers). Style recalcs alone are NOT: a widget's decorative infinite CSS
// pulse recalculates style every frame (~60/s) at ~2ms/s of script, which
// is bounded and harmless — the TV board measures exactly that. So recalc
// only CORROBORATES: it fails a screen only alongside elevated script.
// A FAIL here means something new is measuring itself in circles — go find
// it with the bisect manner tvcrash uses.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
const SCRIPT_BUDGET = 300;   // ms of script per idle second — the loop line
const SCRIPT_WARM = 80;      // above this, recalc corroboration counts
const RECALC_BUDGET = 40;    // style recalcs per idle second

const IDS = `activity-feed add-bin address backlog-trend banner before-after bin-counter board-mini btu-hp bubble-wrap calculator calendar-mini celebrate checklist clock contact contractor-links contractor-load converter count-by-stage crew-race divider due-today duplicates floor-by-floor gone-quiet handover job-find job-list job-map kpi legend lined-note link milestones multi-timer no-date no-plan nobody-booked notes-board open-snags order-list overdue-list photo photo-review progress-bar progress-ring project-glance project-mini quote recent-jobs recent-photos rota shabbat-clock skipped-stage spin-wheel split-flap stage-legend sticky-pad streak-flame table tally tap-in tiktok timeline unit-card w-countdown w-stopwatch w-title weather week-planner weekly-goal world-clocks`.trim().split(/\s+/);

let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
await ctx.addInitScript(list => {
  const today = new Date();
  const iso = d => d.toISOString().slice(0, 10);
  const plus = n => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  // The other workspace, cached — what cross-workspace widgets read. Without
  // it their empty branch renders and a data-gated loop never engages.
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    apartments: Array.from({ length: 24 }, (_, i) => ({
      id: `A1-${i + 1}`, buildingId: i < 12 ? 'A1' : 'A2', floor: 2 + Math.floor((i % 12) / 4),
      apartmentNumber: String(i + 1), displayName: `Fam ${i}`, isUnnamed: false,
      isDuplexApt: false, classification: 'standard',
      currentStageId: i % 3 ? 'S-1' : null,
      createdAt: '2026-01-01', updatedAt: '2026-01-01' })),
    stages: [{ id: 'S-1', name: 'Piping', color: '#4aa8d8', order: 1, active: true }],
    contractorAssignments: [],
  }));
  const els = list.map((w, i) => ({
    id: `CE-${w}`, type: 'widget', widget: w,
    x: 40 + (i % 10) * 300, y: 40 + Math.floor(i / 10) * 260,
    w: 260, h: 200, text: '', color: '#ffffff',
    data: w === 'project-mini' || w === 'project-glance' || w === 'board-mini'
      ? { projectId: 'wolfson' }
      : w === 'unit-card' ? { projectId: 'wolfson', aptId: 'A1-1' }
      : w === 'rota' ? { people: ['c:C-jo'], firstWeek: iso(plus(-7 - today.getDay())), weekCount: 3, span: 5,
          cells: { [`c:C-jo|${iso(plus(1))}`]: [{ id: 'E-1', jobId: 'G-1' }] } }
      : {},
  }));
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    users: [{ id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' }],
    stages: [{ id: 'S-g', name: 'AC installation', color: '#4aa8d8', order: 1, active: true, projectId: 'general' }],
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }],
    contractorAssignments: [
      { id: 'T-1', contractorId: 'C-jo', apartmentId: 'G-1', taskDescription: 'Fit units',
        stageId: 'S-g', dueDate: iso(plus(-2)), priority: 'urgent', createdAt: '2026-01-01' },
      { id: 'T-2', contractorId: 'C-jo', apartmentId: 'G-2', taskDescription: 'Pipe run',
        stageId: 'S-g', dueDate: iso(plus(0)), priority: 'normal', createdAt: '2026-01-01' },
    ],
    apartments: Array.from({ length: 8 }, (_, i) => ({
      id: `G-${i + 1}`, buildingId: 'G', apartmentNumber: '', floor: 0, isUnnamed: false,
      displayName: `Job ${i + 1}`, classification: 'standard', isDuplexApt: false,
      currentStageId: 'S-g', canvasX: 3200 + (i % 4) * 240, canvasY: 40 + Math.floor(i / 4) * 160,
      address: 'Herzl 12', createdAt: '2026-01-01', updatedAt: '2026-01-01' })),
    canvasElements: els,
  }));
}, IDS);

const page = await ctx.newPage();
const errors = [];
// The TikTok player iframe throws a third-party localStorage error in this
// container (documented, round 30) — noise, not the app.
page.on('pageerror', e => { if (!/localStorage/.test(e.message)) errors.push(e.message); });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
const grab = async () => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const g = n => metrics.find(m => m.name === n)?.value ?? 0;
  return { script: g('ScriptDuration'), recalc: g('RecalcStyleCount') };
};

const SCREENS = [
  ['board, every widget mounted', '/jobs', 6000],
  ['dashboard', '/dashboard', 3000],
  ['diagram (Wolfson)', '/project', 3000],
  ['tasks', '/tasks', 2500],
  ['global calendar', '/calendar', 2500],
  ['job list', '/list', 2500],
  ['reports', '/reports', 2500],
  ['project settings', '/settings', 2500],
  ['app settings', '/app-settings', 2500],
  ['TV board', '/tv?view=general', 6000],
  ['TV dashboard', '/tv?view=dashboard', 3000],
  ['TV diagram', '/tv?view=wolfson', 3000],
  ['worker portal', '/c/tok-jo', 3000],
];

for (const [name, path, settle] of SCREENS) {
  // The diagram route needs the Wolfson workspace open; everything else
  // stands in general. Switch through storage before the visit.
  if (path === '/project') {
    await page.evaluate(() => localStorage.setItem('active_project', 'wolfson'));
  }
  await page.goto(APP + path);
  await page.waitForTimeout(settle);
  const a = await grab();
  await page.waitForTimeout(5000);
  const c = await grab();
  const scriptMsPerSec = Math.round((c.script - a.script) / 5 * 1000);
  const recalcPerSec = Math.round((c.recalc - a.recalc) / 5 * 10) / 10;
  const looping = scriptMsPerSec >= SCRIPT_BUDGET
    || (scriptMsPerSec >= SCRIPT_WARM && recalcPerSec >= RECALC_BUDGET);
  check(!looping,
    `${name} idles quietly`, `script ${scriptMsPerSec}ms/s · recalc ${recalcPerSec}/s`);
  if (path === '/project') {
    await page.evaluate(() => localStorage.setItem('active_project', 'general'));
  }
}
check(errors.length === 0, 'no page errors across the sweep', errors[0]?.slice(0, 140) ?? '');

console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
await b.close();
process.exit(fails ? 1 : 0);
