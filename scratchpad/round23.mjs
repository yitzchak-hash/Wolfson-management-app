// Round 23: arrow keys nudge the selection · a multi-drag draws snap guides
// and lands aligned · Send to back keeps a node clickable · the board
// remembers its view across a reload · the mic is the note's, not the box's ·
// the TV shape buttons save, the picker box spans the whole board, and the
// wall fits the content when no region is set · a foreign unit opens as a
// PEEK that stays on the job board.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const seed = () => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (!localStorage.getItem('wolfson_app_data')) {
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      stages: [{ id: 'S-pipe', name: 'Piping', color: '#0ea5e9', order: 1 }],
      apartments: [
        { id: 'A1-9', buildingId: 'A1', floor: 3, apartmentNumber: '9', displayName: 'Katz',
          isUnnamed: false, isDuplexApt: false, classification: 'standard',
          generalNotes: 'Buyer wants the VRF moved.', address: '12 Herzl St', phone: '0501234567',
          currentStageId: 'S-pipe', stageDates: {},
          createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' },
      ],
      contractorAssignments: [
        { id: 'T-w1', contractorId: 'C-jo', apartmentId: 'A1-9',
          taskDescription: 'Fix the VRF', stageId: null, dueDate: '2026-08-25',
          priority: 'normal', completedAt: null, createdAt: '2026-08-01' },
      ],
      buildings: [{ id: 'A1', name: 'A1' }],
    }));
  }
  if (localStorage.getItem('general_app_data')) return;
  const job = (id, name, x, y) => ({
    id, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {}, canvasX: x, canvasY: y,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  const bin = (kind, i) => ({
    id: `CE-bin-${kind}`, type: 'bin', binKind: kind,
    x: 2100, y: 24 + i * 130, w: 180, h: 112, text: kind, color: '#64748b',
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [],
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }],
    contractorAssignments: [],
    apartments: [
      job('G-anchor', 'Anchor', 600, 200),
      job('G-bravo', 'Bravo', 200, 430),
      job('G-charlie', 'Charlie', 430, 430),
    ],
    canvasElements: [
      { id: 'CE-note', type: 'note', x: 700, y: 560, w: 165, h: 150, text: 'a note', color: '#fef9c3' },
      { id: 'CE-box', type: 'box', x: 900, y: 560, w: 320, h: 220, text: 'a section', color: 'rgba(148,163,184,.2)' },
      { id: 'CE-z1', type: 'note', x: 950, y: 180, w: 165, h: 150, text: 'front note', color: '#fde68a' },
      { id: 'CE-z2', type: 'note', x: 985, y: 215, w: 165, h: 150, text: 'back note', color: '#bbf7d0' },
      { id: 'CE-unit', type: 'widget', widget: 'unit-card', x: 200, y: 620, w: 220, h: 96,
        text: '', color: '#ffffff', data: { projectId: 'wolfson', aptId: 'A1-9' } },
      bin('done', 0), bin('ready', 1), bin('archive', 2), bin('trash', 3),
    ],
  }));
};

// ════ Context 1: the board ══════════════════════════════════════════════════
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(seed);
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3000);

const view = () => page.evaluate(() => {
  const world = document.querySelector('[data-board-world]');
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/
    .exec(world.parentElement.style.transform);
  const vr = document.querySelector('[data-board-viewport]').getBoundingClientRect();
  return { x: +m[1], y: +m[2], z: +m[3], left: vr.left, top: vr.top };
});
const screenOf = async (wx, wy) => {
  const v = await view();
  return { x: v.left + v.x + wx * v.z, y: v.top + v.y + wy * v.z };
};
const stored = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  return {
    jobs: Object.fromEntries((d.apartments ?? []).map(a => [a.id, { x: a.canvasX, y: a.canvasY }])),
    els: Object.fromEntries((d.canvasElements ?? []).map(e => [e.id, { x: e.x, y: e.y, z: e.z ?? 0 }])),
  };
});

// ── 1 · arrow keys nudge the selection ─────────────────────────────────────
let at = await screenOf(200 + 107, 430 + 66);       // Bravo's centre
await page.mouse.click(at.x, at.y);
await page.waitForTimeout(400);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
await page.keyboard.press('Shift+ArrowUp');
await page.waitForTimeout(800);
let st = await stored();
check(st.jobs['G-bravo'].x === 201 && st.jobs['G-bravo'].y === 420,
  'arrow keys nudge a selected tile (1px, Shift = 10px)', JSON.stringify(st.jobs['G-bravo']));

// ── 2 · a multi-drag snaps as a UNION and draws the guides ─────────────────
at = await screenOf(430 + 107, 430 + 66);           // Ctrl+click adds Charlie
await page.keyboard.down('Control');
await page.mouse.click(at.x, at.y);
await page.keyboard.up('Control');
await page.waitForTimeout(300);
// Drag Bravo (and Charlie with it) up until the union's top is 3px shy of
// Anchor's top — the union snap must close that gap on release.
const from = await screenOf(201 + 107, 420 + 66);
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(from.x, from.y - 217, { steps: 10 });
await page.waitForTimeout(200);
const guides = await page.evaluate(() => document.querySelectorAll('[data-snap-guide]').length);
await page.mouse.up();
await page.waitForTimeout(800);
st = await stored();
check(guides > 0, 'guides are drawn while a MULTI-selection drags', `${guides} guides`);
// The union's TOP is Bravo (nudged to 420 above, Charlie at 430): the union
// snaps that top to Anchor's 200 and the whole selection moves by ONE delta,
// so Charlie keeps its 10px offset. Both moving together is the point.
check(st.jobs['G-bravo'].y === 200 && st.jobs['G-charlie'].y === 210,
  'the union snapped to the neighbour and the selection moved as one',
  JSON.stringify({ bravo: st.jobs['G-bravo'], charlie: st.jobs['G-charlie'] }));
await page.keyboard.press('Escape');

// ── 3 · Send to back keeps the node clickable ──────────────────────────────
at = await screenOf(985 + 140, 215 + 130);          // CE-z2's exposed corner
await page.mouse.click(at.x, at.y, { button: 'right' });
await page.waitForTimeout(400);
await page.locator('button', { hasText: 'Send to back' }).first().click();
await page.waitForTimeout(700);
st = await stored();
check(st.els['CE-z2'].z >= 0, 'Send to back never goes below z 0', `z=${st.els['CE-z2'].z}`);
const under = await page.evaluate(([px, py]) => {
  const el = document.elementFromPoint(px, py);
  return el?.closest('[data-node-id]')?.getAttribute('data-node-id') ?? el?.tagName ?? 'nothing';
}, [at.x, at.y]);
check(under === 'CE-z2', 'the sent-back node still takes the click', String(under));

// ── 4 · the board remembers where you left it ──────────────────────────────
await page.mouse.move(700, 450);
await page.keyboard.down('Control');
await page.mouse.wheel(0, 120);
await page.waitForTimeout(250);
await page.keyboard.up('Control');
await page.mouse.move(700, 450);
await page.mouse.down({ button: 'middle' });
await page.mouse.move(520, 330, { steps: 8 });
await page.mouse.up({ button: 'middle' });
await page.waitForTimeout(900);                      // save debounce
const before = await view();
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2500);
const after = await view();
check(Math.abs(after.x - before.x) < 2 && Math.abs(after.y - before.y) < 2 && after.z === before.z,
  'reloading returns to the same pan and zoom',
  JSON.stringify({ before: { x: before.x, y: before.y, z: before.z }, after: { x: after.x, y: after.y, z: after.z } }));

// ── 5 · the mic belongs to the note, not the section box ───────────────────
const mics = await page.evaluate(() => {
  const on = id => !!document.querySelector(`[data-node-id="${id}"] button[title*="voice memo"]`);
  return { note: on('CE-note'), box: on('CE-box') };
});
check(mics.note, 'a note offers the voice-memo mic');
check(!mics.box, 'a section box does NOT offer the mic');

// ── 6 · a foreign unit opens as a PEEK and the board stays put ─────────────
// `button.w-full` is the card's own face — a bare `button` first-matches the
// node's floating action strip, which renders before the widget's content.
await page.locator('[data-node-id="CE-unit"] button.w-full').first().evaluate(el => el.click());
await page.waitForTimeout(600);
const peek = await page.evaluate(() => {
  const p = document.querySelector('[data-unit-peek]');
  return {
    open: !!p, path: location.pathname,
    text: p ? p.textContent : '',
  };
});
check(peek.open && peek.path === '/jobs', 'clicking the unit card opens a peek ON the job board', peek.path);
check(/Katz/.test(peek.text) && /Piping/.test(peek.text) && /Fix the VRF/.test(peek.text),
  'the peek shows the unit: name, stage and its open task', peek.text.slice(0, 80));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const closed = await page.evaluate(() => ({
  gone: !document.querySelector('[data-unit-peek]'), path: location.pathname,
}));
check(closed.gone && closed.path === '/jobs', 'Escape closes the peek and you are still on the board');
// The one button that DOES travel.
await page.locator('[data-node-id="CE-unit"] button.w-full').first().evaluate(el => el.click());
await page.waitForTimeout(500);
await page.locator('[data-peek-open-full]').click();
await page.waitForTimeout(1500);
const travelled = await page.evaluate(() => ({
  path: location.pathname, pid: localStorage.getItem('active_project'),
}));
check(travelled.path === '/project' && travelled.pid === 'wolfson',
  '"Open in Wolfson" travels there on purpose', JSON.stringify(travelled));
await ctx.close();

// ════ Context 2: TV settings — the shape buttons and the picker ════════════
const ctx2 = await b.newContext({ viewport: { width: 1440, height: 950 } });
await ctx2.addInitScript(seed);
const p2 = await ctx2.newPage();
p2.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await p2.goto(`${APP}/app-settings`);
await p2.waitForTimeout(2000);
await p2.locator('button', { hasText: /^TV$/ }).first().click();
await p2.waitForTimeout(800);

const shapes = await p2.evaluate(() =>
  [...document.querySelectorAll('[data-tv-shape]')].map(el => el.getAttribute('data-tv-shape')));
check(shapes.length >= 5 && shapes.includes('21:9') && shapes.includes('9:16'),
  'the What-the-TV-shows section has aspect ratio buttons', shapes.join(' '));
await p2.locator('[data-tv-shape="21:9"]').click();
await p2.waitForTimeout(800);
const saved = await p2.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  return d.boardSettings?.__tv?.tvShape ?? null;
});
check(saved === '21:9', 'pressing a shape button SAVES the TV shape', String(saved));

const strings = await p2.evaluate(() => document.body.textContent || '');
check(!/ON THE TV/.test(strings) && !/Drag the box to aim/.test(strings)
  && !/covers the whole board, so there is nowhere/.test(strings),
  'the standing hardcoded hint texts are gone');
check(/Show the whole board/.test(strings), 'the whole-board reset button remains');

// Drag the region box — it must move (the old clamp froze a full-board box)
// and what lands in tvView must be the SCREEN's shape.
const box = p2.locator('[data-region-fits]');
const r0 = await box.boundingBox();
await p2.mouse.move(r0.x + r0.width / 2, r0.y + r0.height / 2);
await p2.mouse.down();
await p2.mouse.move(r0.x + r0.width / 2 + 40, r0.y + r0.height / 2 + 18, { steps: 6 });
await p2.mouse.up();
await p2.waitForTimeout(800);
const tvView = await p2.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  return d.boardSettings?.__tv?.tvView ?? null;
});
check(!!tvView && tvView.w > 0, 'dragging the box writes the region', JSON.stringify(tvView));
check(!!tvView && Math.abs(tvView.w / tvView.h - 21 / 9) < 0.03,
  'the region is locked to the chosen screen shape', tvView ? (tvView.w / tvView.h).toFixed(3) : '');
// The default box takes in the WHOLE board — for a 21:9 screen over a roughly
// 3:2 world that is only possible by reaching past the board's edges into the
// apron, which is the owner's "span across the whole screen" ask.
const spans = await p2.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  const v = d.boardSettings?.__tv?.tvView;
  return v ? v.x < 0 || v.w > 2400 : false;   // world here is ~2280 wide (bins at 2100+180)
});
check(spans, 'the box can span the whole board even though the board is not TV-shaped');
await ctx2.close();

// ════ Context 3: the wall fits the content when no region is set ═══════════
const ctx3 = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx3.addInitScript(seed);
// Content sits AWAY from the origin — the old wall showed the fixed top-left
// corner and drew nothing, which was the production "nothing shows" report.
await ctx3.addInitScript(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  (d.apartments ?? []).forEach(a => { a.canvasX += 1600; a.canvasY += 700; });
  (d.canvasElements ?? []).forEach(e => { e.x += 1600; e.y += 700; });
  localStorage.setItem('general_app_data', JSON.stringify(d));
});
const p3 = await ctx3.newPage();
p3.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await p3.goto(`${APP}/tv`);
await p3.waitForTimeout(3000);
const wall = await p3.evaluate(() => {
  const tile = [...document.querySelectorAll('div,button,span')]
    .find(el => (el.textContent || '').trim() === 'Anchor');
  if (!tile) return { found: false };
  const r = tile.getBoundingClientRect();
  return {
    found: true,
    visible: r.width > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight,
    rect: { l: Math.round(r.left), t: Math.round(r.top) },
  };
});
check(wall.found && wall.visible,
  'with no region set the wall FITS the content — a far-from-origin board still shows',
  JSON.stringify(wall));
await ctx3.close();

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
