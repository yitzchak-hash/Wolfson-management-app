// The notebook's bars and cards name the UNIT first (the workspace is a small
// tag after it) and wear the set model's strip along the bottom — the owner's
// 2026-09-22 ask: two Wolfson bars on one day read "Wolfson …" twice with no
// apartment number, and "the little lines on the bottom" belong in the
// notebook too.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  const stages = [
    { id: 'W-a', name: 'Piping', color: '#9ca3af', order: 1, active: true },
    { id: 'W-b', name: 'Concealed Units', color: '#c9b95c', order: 2, active: true },
    { id: 'W-c', name: 'Wall Units', color: '#f59e0b', order: 3, active: true },
    { id: 'W-d', name: 'Thermostats', color: '#65a30d', order: 4, active: true },
    { id: 'S-pipe', name: 'Piping', color: '#6366f1', order: 1, active: true, projectId: 'general' },
    { id: 'S-conc', name: 'Concealed units', color: '#0ea5e9', order: 2, active: true, projectId: 'general' },
  ];
  const d = new Date(); d.setDate(d.getDate() - d.getDay());
  const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const sunday = iso(d);
  const thu = new Date(d); thu.setDate(thu.getDate() + 4);
  const thuIso = iso(thu);
  const wapt = (id, n, name, marks) => ({
    id, buildingId: 'A1', floor: 2, apartmentNumber: n, displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', currentStageId: 'W-c', stageDates: {}, bubbles: true, stageMarks: marks,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  const task = (id, apt, desc, st) => ({
    id, apartmentId: apt, contractorId: 'C-ig', taskDescription: desc, stageId: st, dueDate: thuIso,
    createdAt: '2026-01-01', createdBy: 'U', isCompleted: false,
  });
  if (!localStorage.getItem('wolfson_app_data')) {
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      stages, buildings: [{ id: 'A1', name: 'A1' }],
      apartments: [
        wapt('A1-9', '9', 'Aharonov', { 'W-a': 'done', 'W-b': 'done', 'W-c': 'doing' }),
        wapt('A1-12', '12', 'Weinstein', { 'W-a': 'done' }),
      ],
      contractorAssignments: [
        task('T-9', 'A1-9', 'Hang the wall units', 'W-c'),
        task('T-12', 'A1-12', 'Piping second bathroom', 'W-a'),
      ],
    }));
  }
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages,
    contractors: [{ id: 'C-ig', name: 'Igor', category: 'ac', token: 'tok-ig', active: true, createdAt: '2026-01-01' }],
    contractorAssignments: [],
    apartments: [{
      id: 'G-cohen', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Cohen', isUnnamed: false,
      isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'S-pipe', stageDates: {},
      bubbles: true, stageMarks: { 'S-pipe': 'done' },
      canvasX: 60, canvasY: 720, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 300, y: 130, w: 960, h: 460, text: '', color: '#ffffff',
        data: { people: ['c:C-ig'], firstWeek: sunday, weekCount: 1, span: 5, cells: {
          [`c:C-ig|${sunday}`]: [{ id: 'EN-1', jobId: 'G-cohen', at: '2026-09-01T10:00:00Z' }],
        } } },
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 40, y: 1500, w: 300, h: 200, text: '', color: '#ffffff', data: {} },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForSelector('[data-task-bar]', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(800);

// ── 1 · two Wolfson bars on Thursday name their UNITS ────────────────────────
{
  const bars = await page.evaluate(() => [...document.querySelectorAll('[data-task-bar]')].map(el => ({
    id: el.getAttribute('data-task-bar'),
    label: el.querySelector('[data-bar-label]')?.textContent ?? '',
    labelClipped: (() => { const l = el.querySelector('[data-bar-label]'); return l ? l.scrollWidth > l.clientWidth + 1 : null; })(),
    ws: (el.querySelector('[data-bar-workspace]')?.textContent ?? '').replace(/\s*·\s*$/, ''),
    segs: [...el.querySelectorAll('[data-bar-strip-seg]')].map(s => s.getAttribute('data-bar-strip-seg')),
    fraction: el.querySelector('[data-bar-fraction]')?.textContent ?? '',
    stripInside: (() => {
      const s = el.querySelector('[data-bar-strip]'); if (!s) return false;
      const a = el.getBoundingClientRect(), r = s.getBoundingClientRect();
      return r.bottom <= a.bottom + 0.5 && r.top >= a.top;
    })(),
  })));
  check(bars.length === 2, '1 · two bars drawn', JSON.stringify(bars.map(b => b.id)));
  const b9 = bars.find(b => b.id === 'T-9'), b12 = bars.find(b => b.id === 'T-12');
  check(!!b9 && b9.label.startsWith('9') && /Aharonov/.test(b9.label), '1 · bar 1 leads with the apartment number and family', b9?.label);
  check(!!b12 && b12.label.startsWith('12') && /Weinstein/.test(b12.label), '1 · bar 2 leads with ITS number and family', b12?.label);
  check(b9 && b12 && b9.label !== b12.label, '1 · the two bars no longer read the same');
  check(b9?.ws === 'Wolfson' && b12?.ws === 'Wolfson', '1 · the workspace is a tag AFTER the unit', `${b9?.ws}/${b12?.ws}`);
  check(b9?.labelClipped === false && b12?.labelClipped === false, '1 · neither unit name is cut off', JSON.stringify([b9?.labelClipped, b12?.labelClipped]));
  check(b9?.segs.length === 4 && b9.segs.join(',') === 'done,done,doing,todo', "1 · bar 1's strip is the set: done,done,doing,todo", b9?.segs.join(','));
  check(b9?.fraction === '2/4', '1 · with the fraction 2/4', b9?.fraction);
  check(b12?.segs.join(',') === 'done,todo,todo,todo' && b12.fraction === '1/4', "1 · bar 2's strip reads 1/4", `${b12?.segs.join(',')} ${b12?.fraction}`);
  check(b9?.stripInside && b12?.stripInside, '1 · the strip sits inside the bar, along its bottom');
}

// ── 2 · a parked card wears the strip too ───────────────────────────────────
{
  const card = await page.evaluate(() => {
    const el = document.querySelector('[data-node-id="CE-rota"] .planner-card');
    if (!el) return null;
    return {
      segs: [...el.querySelectorAll('[data-card-strip-seg]')].map(s => s.getAttribute('data-card-strip-seg')),
      fraction: el.querySelector('[data-card-fraction]')?.textContent ?? '',
      text: el.textContent,
    };
  });
  check(!!card, '2 · the parked Cohen card is drawn');
  check(card?.segs.join(',') === 'done,todo' && card.fraction === '1/2', "2 · its strip is the Job Board set: done,todo · 1/2", `${card?.segs.join(',')} ${card?.fraction}`);
}

await page.screenshot({ path: "scratchpad/notebooklabel-tiles.png" });
// ── 3 · strips mode keeps the lines, drops the fraction ─────────────────────
{
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('general_app_data'));
    const r = d.canvasElements.find(e => e.id === 'CE-rota');
    r.data.cardStyle = 'strips';
    localStorage.setItem('general_app_data', JSON.stringify(d));
  });
  // Written through the store so the app's own flush cannot overwrite it.
  await page.evaluate(() => window.__store?.getState().updateCanvasElement('CE-rota', { data: { ...window.__store.getState().canvasElements.find(e => e.id === 'CE-rota').data, cardStyle: 'strips' } }));
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const el = document.querySelector('[data-task-bar="T-9"]');
    const h = el?.getBoundingClientRect().height ?? 0;
    return { h, segs: el?.querySelectorAll('[data-bar-strip-seg]').length ?? 0, fraction: el?.querySelector('[data-bar-fraction]') ? 1 : 0,
      label: el?.querySelector('[data-bar-label]')?.textContent ?? '' };
  });
  check(r.segs === 4 && r.fraction === 0, '3 · a strip-mode bar keeps the four lines and drops the fraction', JSON.stringify(r));
  check(r.h > 0 && r.h < 30, '3 · and stays slim', `${r.h}px`);
  check(r.label.startsWith('9'), '3 · unit still first', r.label);
}

await page.screenshot({ path: 'scratchpad/notebooklabel.png' });
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
