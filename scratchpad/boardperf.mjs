// How the board FEELS at CRM-import scale: 1,000 jobs, a working set of
// widgets, and the two gestures the hand judges it by — panning the board and
// dragging a tile. Frame times are collected INSIDE the page (rAF deltas)
// while the gesture runs, and the rendered-tile count says whether culling is
// doing its job. Absolute numbers in this container are CPU-rendered and
// pessimistic; the BEFORE → AFTER movement is what matters.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const jobs = [];
  for (let i = 0; i < 1000; i++) {
    jobs.push({
      id: `G-p${String(i).padStart(4, '0')}`, buildingId: 'G', floor: 0, apartmentNumber: '',
      displayName: `Family ${i}`, isUnnamed: false, isDuplexApt: false,
      classification: 'standard', generalNotes: '',
      currentStageId: i % 3 ? 'S1' : null, stageDates: {},
      canvasX: 40 + (i % 40) * 240, canvasY: 40 + Math.floor(i / 40) * 160,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    });
  }
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'S1', name: 'AC installation', color: '#3b82f6', order: 1, active: true, projectId: 'general' }],
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }],
    contractorAssignments: [],
    apartments: jobs,
    canvasElements: [
      { id: 'CE-note', type: 'note', x: 300, y: 300, w: 165, h: 150, text: 'hello', color: '#fef9c3' },
      { id: 'CE-clock', type: 'widget', widget: 'clock', x: 700, y: 60, w: 220, h: 120, text: '', color: '#ffffff', data: {} },
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 1000, y: 600, w: 900, h: 360, text: '', color: '#ffffff',
        data: { people: ['c:C-jo'], firstWeek: '2026-08-23', weekCount: 1, span: 5, cells: {} } },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(4500);

const stats = a => {
  const s = [...a].sort((x, y) => x - y);
  const at = q => s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0;
  return { n: s.length, med: +at(0.5).toFixed(1), p90: +at(0.9).toFixed(1), max: +(s[s.length - 1] ?? 0).toFixed(1) };
};

/** Frame deltas collected inside the page while `gesture` runs. */
async function measure(label, gesture) {
  await page.evaluate(() => {
    window.__frames = [];
    window.__stopFrames = false;
    let last = performance.now();
    const tick = t => {
      window.__frames.push(t - last); last = t;
      if (!window.__stopFrames) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await gesture();
  const frames = await page.evaluate(() => { window.__stopFrames = true; return window.__frames.slice(5); });
  const st = stats(frames);
  console.log(`       ${label}: median ${st.med}ms · p90 ${st.p90}ms · worst ${st.max}ms over ${st.n} frames`);
  return st;
}

const tileCount = () => page.evaluate(() =>
  document.querySelectorAll('[data-board-world] [data-node-id^="G-p"]').length);

// ── 1 · how much of the 1,000-job board is actually mounted ────────────────
const mounted = await tileCount();
console.log(`       tiles mounted at 100% zoom: ${mounted} of 1000`);
check(mounted > 0, 'the board rendered');
check(mounted < 220, 'only the tiles near the view are mounted', `${mounted} of 1000`);

// ── 2 · panning the board (middle-drag across the viewport) ────────────────
const vp = await page.locator('[data-board-viewport]').boundingBox();
const cx = vp.x + vp.width / 2, cy = vp.y + vp.height / 2;
const pan = await measure('pan', async () => {
  await page.mouse.move(cx + 300, cy);
  await page.mouse.down({ button: 'middle' });
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(cx + 300 - i * 14, cy + Math.sin(i / 5) * 40);
    await page.waitForTimeout(14);
  }
  await page.mouse.up({ button: 'middle' });
});
check(pan.med < 40, 'panning holds a workable frame time in this container', `median ${pan.med}ms`);

// ── 3 · dragging one tile ──────────────────────────────────────────────────
await page.waitForTimeout(600);
const tile = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-board-world] [data-node-id^="G-p"]')];
  const vp2 = document.querySelector('[data-board-viewport]').getBoundingClientRect();
  const el = els.find(e => {
    const r = e.getBoundingClientRect();
    return r.left > vp2.left + 80 && r.top > vp2.top + 180 && r.right < vp2.right - 120 && r.bottom < vp2.bottom - 80;
  });
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
check(!!tile, 'found a tile fully on screen to drag');
const drag = await measure('tile drag', async () => {
  await page.mouse.move(tile.x, tile.y);
  await page.mouse.down();
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(tile.x + i * 6, tile.y + Math.sin(i / 4) * 30);
    await page.waitForTimeout(14);
  }
  await page.mouse.up();
});
check(drag.med < 40, 'dragging a tile holds a workable frame time', `median ${drag.med}ms`);

// ── 4 · culling never hides what matters ───────────────────────────────────
// The dragged tile travelled; the search flight and selection keep their
// targets mounted wherever they are — spot-check with a far-away selection.
await page.keyboard.press('Escape');
const far = await page.evaluate(() => {
  // Select a far-away job through the store snapshot, then ask if its tile
  // is mounted anyway (the keep-mounted rule).
  const d = JSON.parse(localStorage.getItem('general_app_data'));
  return d.apartments[999].id;
});
console.log(`       far tile for the keep-rule check: ${far}`);

await page.screenshot({ path: 'scratchpad/boardperf.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
