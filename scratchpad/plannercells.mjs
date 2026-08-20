// Which notebook squares actually accept a job — every one of them, one by one.
//
// The report was "I'm not able to drag jobs onto the first one", and guessing
// which "first" was meant would have cost more than measuring. This drags a
// board tile onto EVERY square in turn and prints the grid of results, so the
// pattern names itself.
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
    // Tiles laid out so NONE of them overlaps another.
    //
    // The first version stacked them 40px apart — a tile is 132 tall, so the
    // press aimed at one tile's centre landed on whichever tile was drawn on
    // top of it, and the harness reported the app refusing squares when it was
    // in fact planning the wrong job every other go.
    // Clear of the rail on the left and of the floating header on top, too.
    apartments: Array.from({ length: 10 }, (_, i) => ({
      id: `G-p${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
      displayName: `Planner job ${i}`, address: 'Somewhere 1',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: 'gs1', stageDates: {},
      canvasX: 170 + (i % 2) * 230, canvasY: 40 + Math.floor(i / 2) * 145,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    })),
    canvasElements: [
      { id: 'CE-book', type: 'widget', widget: 'rota',
        x: 640, y: 40, w: 800, h: 460, text: '', color: '#ffffff',
        data: { people: ['n:Moshe', 'n:Dovid'],
                firstWeek: '2026-08-16', weekCount: 1, span: 5, cells: {} } },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
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

/** Every square the notebook is drawing, in document order, with its centre. */
const grid = () => page.evaluate(() => {
  const w = document.querySelector('[data-node-id="CE-book"]');
  const cells = [...w.querySelectorAll('div')].filter(d => String(d.className).includes('group/cell'));
  return cells.map((c, i) => {
    const r = c.getBoundingClientRect();
    return { i, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
             w: Math.round(r.width), h: Math.round(r.height) };
  });
});

const cells = await grid();
console.log(`       the notebook draws ${cells.length} squares`);
check(cells.length === 10, 'two people × five days', `${cells.length}`);
console.log('       square rects:', JSON.stringify(cells.slice(0, 6)));

/** Drag a board tile onto a point and say whether anything landed. */
async function dropOn(jobId, pt) {
  const from = await page.evaluate(id => {
    const t = document.querySelector(`[data-node-id="${id}"]`);
    if (!t) {
      // Say WHICH tiles are on the board — "no tile" on its own cannot tell
      // "the app hid it" from "the harness asked for the wrong id".
      window.__tiles = [...document.querySelectorAll('[data-node-id]')].map(n => n.dataset.nodeId);
      return null;
    }
    const r = t.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, jobId);
  if (!from) {
    const seen = await page.evaluate(() => window.__tiles ?? []);
    console.log(`       no tile for ${jobId}; board has:`, JSON.stringify(seen));
    return 'no tile';
  }
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y - 20);
  await page.waitForTimeout(50);
  await page.mouse.move(pt.x, pt.y, { steps: 10 });
  await page.waitForTimeout(120);
  const lit = await page.evaluate(() => !!document.querySelector('[data-node-id="CE-book"] [style*="rgb(219, 234, 254)"]'));
  await page.mouse.up();
  await page.waitForTimeout(450);
  return lit ? 'lit' : 'not lit';
}

// ── Every square in turn ──────────────────────────────────────────────────
const results = [];
for (let i = 0; i < cells.length; i++) {
  const before = await cellsNow();
  const beforeN = Object.values(before).flat().length;
  const hover = await dropOn(`G-p${i}`, cells[i]);
  const after = await cellsNow();
  const afterN = Object.values(after).flat().length;
  results.push({ i, hover, landed: afterN > beforeN });
}
const failed = results.filter(r => !r.landed);
console.log('       per square:', results.map(r => (r.landed ? '.' : 'X')).join(''));
if (failed.length) console.log('       refused:', JSON.stringify(failed));
check(failed.length === 0, 'every square accepts a job dragged onto it',
  `${failed.length} of ${cells.length} refused`);

console.log('       cells now:', JSON.stringify(await cellsNow()));

// ── Moving a card from one square to the next asks move / copy / off ──────
{
  const filled = await page.evaluate(() => {
    const w = document.querySelector('[data-node-id="CE-book"]');
    const card = w.querySelector('.planner-card');
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  check(!!filled, 'there is a card to move');
  if (filled) {
    const empties = (await grid()).filter(c =>
      Math.hypot(c.x - filled.x, c.y - filled.y) > 40);
    // Six moves in a row: the report was that it stops offering the copy after
    // a few goes, so once is not a test.
    for (let n = 0; n < 6 && n < empties.length; n++) {
      const src = await page.evaluate(() => {
        const c = document.querySelector('[data-node-id="CE-book"] .planner-card');
        if (!c) return null;
        const r = c.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (!src) break;
      const dst = empties[n];
      await page.mouse.move(src.x, src.y);
      await page.mouse.down();
      await page.mouse.move(src.x + 12, src.y + 6);
      await page.waitForTimeout(60);
      await page.mouse.move(dst.x, dst.y, { steps: 10 });
      await page.waitForTimeout(120);
      await page.mouse.up();
      await page.waitForTimeout(600);
      const dlg = await page.evaluate(() => {
        const t = document.body.innerText;
        return {
          copy: /copy/i.test(t),
          move: /move it here|Move it/i.test(t),
          off: /take it off|Take it off/i.test(t),
        };
      });
      console.log(`       move ${n + 1}:`, JSON.stringify(dlg));
      check(dlg.copy && dlg.move,
        `move ${n + 1} offers move AND copy`, JSON.stringify(dlg));
      // Choose "move it here" so the next round has somewhere to go.
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')]
          .find(x => /move it here/i.test(x.textContent ?? ''));
        btn?.click();
      });
      await page.waitForTimeout(500);
    }
  }
}

await page.screenshot({ path: 'scratchpad/plannercells.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
