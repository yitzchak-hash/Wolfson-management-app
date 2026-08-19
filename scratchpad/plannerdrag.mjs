// Planning a job from wherever you happen to notice it, and being told what a
// drag of an existing card meant.
//
// The weekly notebook's widget id is `rota`. `week-planner` is a different
// thing entirely — seven free-text columns — and seeding that one draws a row
// of day names with no people and no squares, which reads as a broken planner.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'gs1', name: 'AC installation', color: '#0ea5e9', order: 1, active: true,
               projectId: 'general', description: '', createdAt: '', updatedAt: '' }],
    apartments: Array.from({ length: 4 }, (_, i) => ({
      id: `G-p${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
      displayName: `Planner job ${i}`, address: 'Somewhere 1',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: 'gs1', stageDates: {},
      canvasX: 30, canvasY: 30 + i * 150,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    })),
    canvasElements: [
      {
        id: 'CE-book', type: 'widget', widget: 'rota',
        x: 560, y: 30, w: 760, h: 420, text: '', color: '#ffffff',
        data: {
          people: ['n:Moshe', 'n:Dovid'],
          firstWeek: '2026-08-16', weekCount: 1, span: 5,
          // One job already planned, so the move/copy question has something
          // to be asked about.
          cells: { 'n:Moshe|2026-08-17': [{ id: 'e1', jobId: 'G-p0' }] },
        },
      },
      {
        id: 'CE-list', type: 'widget', widget: 'job-list',
        x: 560, y: 480, w: 320, h: 220, text: '', color: '#ffffff', data: {},
      },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
page.on('console', m => { if (/DBG/.test(m.text())) console.log('       [page]', m.text()); });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(4000);

const cellsNow = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  const el = (d.canvasElements ?? []).find(e => e.id === 'CE-book');
  const out = {};
  for (const [k, list] of Object.entries(el?.data?.cells ?? {})) {
    out[k] = (list ?? []).map(e => e.jobId ?? `"${e.text ?? ''}"`);
  }
  return out;
});

const planner = await page.$('[data-node-id="CE-book"]');
check(!!planner, 'the notebook is on the board');
const list = await page.$('[data-node-id="CE-list"]');
check(!!list, 'the job list widget is on the board');
if (!planner || !list) { console.log('CANNOT CONTINUE'); await b.close(); process.exit(1); }

console.log('       cells at the start:', JSON.stringify(await cellsNow()));

// ── 1. A row in a widget drags onto a day ─────────────────────────────────
{
  // Find a row for a job NOT already planned.
  const row = await page.evaluate(() => {
    const w = document.querySelector('[data-node-id="CE-list"]');
    const btns = [...w.querySelectorAll('button')];
    const hit = btns.find(x => /Planner job 2/.test(x.textContent ?? ''));
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  check(!!row, 'the list shows the job', row ? '' : 'no row for "Planner job 2"');

  // An empty square: Dovid, Tuesday.
  const target = await page.evaluate(() => {
    const w = document.querySelector('[data-node-id="CE-book"]');
    const cells = [...w.querySelectorAll('div')].filter(d => d.className.includes('group/cell'));
    const c = cells[7] ?? cells[cells.length - 1];
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  check(!!target, 'the notebook has squares to drop on');

  if (row && target) {
    await page.mouse.move(row.x, row.y);
    await page.mouse.down();
    await page.mouse.move(row.x + 30, row.y - 20, { steps: 5 });
    await page.mouse.move(target.x, target.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(1200);
    const after = await cellsNow();
    console.log('       after dragging a list row:', JSON.stringify(after));
    const landed = Object.values(after).some(v => v.includes('G-p2'));
    check(landed, 'a job dragged out of a widget lands on the notebook');
  }
}

// ── 2. Dragging an existing card asks what it meant ───────────────────────
/**
 * Aim at a square by what is IN it, not by an index.
 *
 * Picking `cells[3]` landed back on the card's own square about half the time,
 * where a move is a no-op by design — so the copy "did nothing" and the harness
 * blamed the product. The square holding "Planner job 2" is a known, different
 * one.
 */
const pointOn = (sel, text) => page.evaluate(([s2, t]) => {
  const w = document.querySelector('[data-node-id="CE-book"]');
  const hit = [...w.querySelectorAll(s2)].find(x => new RegExp(t).test(x.textContent ?? ''));
  if (!hit) return null;
  const r = hit.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
}, [sel, text]);

const dialogOpen = () => page.evaluate(() =>
  /Move it here|Take it off the notebook/.test(document.body.innerText));

{
  const card = await pointOn('.planner-card', 'Planner job 0');
  const other = await pointOn('.group\\/cell', 'Planner job 2');
  check(!!card, 'the already-planned card is on the sheet');
  check(!!other, 'and there is a different square to aim at');

  if (card && other) {
    await page.mouse.move(card.x, card.y);
    await page.mouse.down();
    await page.mouse.move(card.x + 20, card.y + 10, { steps: 4 });
    await page.mouse.move(other.x, other.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(900);

    const asked = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        move: /Move it here/.test(t),
        copy: /Put a copy here/.test(t),
        off: /Take it off the notebook/.test(t),
      };
    });
    console.log('       the question:', JSON.stringify(asked));
    check(asked.move && asked.copy && asked.off,
      'it asks: move it, copy it, or take it off');

    const before = await cellsNow();
    check(Object.values(before).some(v => v.includes('G-p0')),
      'and has written nothing while it waits for an answer');
    /**
     * A REAL click, not a dispatched one.
     *
     * `.click()` in JS goes straight to the handler and would have hidden the
     * fault this found: the dialog is portalled from inside a board node, and a
     * React portal propagates up the REACT tree — so the board node captured
     * the pointer and the button received `pointerdown` and nothing else. No
     * mouseup, no click, a dialog that ignored every press while doing exactly
     * what it was told.
     */
    await page.click('button:has-text("Put a copy here")');
    await page.waitForTimeout(1000);
    check(!(await dialogOpen()), 'answering closes the question');
    const after = await cellsNow();
    console.log('       after choosing copy:', JSON.stringify(after));
    const squares = Object.entries(after).filter(([, v]) => v.includes('G-p0'));
    check(squares.length === 2, 'a copy puts the job on BOTH days',
      `${squares.length} square(s): ${squares.map(([k]) => k).join(', ')}`);
  }
}

// ── 3. Dragging a card off the notebook asks too ──────────────────────────
{
  check(!(await dialogOpen()), 'nothing is left open before the next drag');
  const card = await pointOn('.planner-card', 'Planner job 0');
  if (card) {
    await page.mouse.move(card.x, card.y);
    await page.mouse.down();
    await page.mouse.move(card.x - 60, card.y + 40, { steps: 5 });
    // Well clear of the notebook: bottom-left of the window.
    await page.mouse.move(80, 900, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    const asked = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        off: /Take it off the notebook/.test(t),
        leave: /Leave it where it was/.test(t),
        nothingDeleted: /Nothing is deleted either way/.test(t),
        move: /Move it here/.test(t),
      };
    });
    console.log('       dropped outside:', JSON.stringify(asked));
    check(asked.off && asked.leave && !asked.move,
      'letting go outside the notebook asks rather than just removing it');
    check(asked.nothingDeleted, 'and says plainly that nothing is deleted');

    const before = await cellsNow();
    await page.click('button:has-text("Leave it where it was")');
    await page.waitForTimeout(800);
    const after = await cellsNow();
    check(JSON.stringify(before) === JSON.stringify(after),
      'choosing to leave it changes nothing');
  }
}

await page.screenshot({ path: 'scratchpad/plannerdrag.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
