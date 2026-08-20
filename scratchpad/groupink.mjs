// Drawing inside a group window — the last of "the controls in the board must
// work the same way the board outside does".
//
// It asserts the RECORD, not the pixels: a stroke is one `CanvasElement` per
// stroke carrying `board: <group key>`, which is the only thing keeping it in
// the group. Reading the store is also the only way to tell "the eraser cut the
// stroke in two" from "the eraser deleted it", which look identical on screen.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'gs1', name: 'AC installation', color: '#0ea5e9', order: 1, active: true,
               projectId: 'general', description: '', createdAt: '', updatedAt: '' }],
    apartments: Array.from({ length: 4 }, (_, i) => ({
      id: `G-b${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
      displayName: `Weinstein, Steven ${i}`, address: 'Mekor Chaim 39/6, Jerusalem',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: 'gs1', stageDates: {}, boardBin: 'CE-bin-mine', binnedAt: '2026-01-01',
      contentUpdatedAt: '2026-08-10T09:00:00.000Z',
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    })),
    canvasElements: [
      { id: 'CE-bin-mine', type: 'bin', x: 420, y: 60, w: 178, h: 92,
        text: 'Currently in AC', color: '#64748b' },
    ],
  }));
});
await ctx.addInitScript(() => {
  // An armed tool is LIT — measured by what is painted, never by the class
  // list: `hover:bg-white/15` contains "bg-white", so a regex over className
  // calls every button lit and the assertion passes whatever the truth is.
  window.lit = btn => {
    const bg = getComputedStyle(btn).backgroundColor;
    const m = bg.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const [r, g, b, a = '1'] = m[1].split(',').map(v => parseFloat(v));
    return Number(a) > 0.5 && r > 240 && g > 240 && b > 240;
  };
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3600);

const binNode = await page.$('[data-node-id="CE-bin-mine"]');
check(!!binNode, 'the group is on the board');
if (!binNode) { console.log('CANNOT CONTINUE'); await b.close(); process.exit(1); }
const bb = await binNode.boundingBox();
await page.mouse.dblclick(bb.x + bb.width / 2, bb.y + bb.height / 2);
await page.waitForTimeout(900);

/** Every stroke record the group holds, read straight out of the store. */
const inkIn = () => page.evaluate(() => {
  const raw = localStorage.getItem('general_app_data');
  const els = raw ? (JSON.parse(raw).canvasElements ?? []) : [];
  return els.filter(e => e.type === 'stroke' && e.board === 'CE-bin-mine')
    .map(e => ({ id: e.id, color: e.color, w: e.strokeWidth, art: e.art,
                 own: !!e.data?.own, n: (e.points ?? '').trim().split(/\s+/).length }));
});

// Scope EVERY query to the group's own window: the board's header carries
// buttons with the same titles and sits earlier in the document, so a bare
// `button[title="Pen"]` drives the board while the test believes it is reading
// the group.
const WIN = '.bin-window-in';
const winBtn = t => page.$(`${WIN} button[title="${t}"]`);

// ── The tools are there at all ────────────────────────────────────────────
for (const t of ['Pen', 'Highlighter', 'Eraser']) {
  check(!!(await winBtn(t)), `the group's toolbar carries ${t}`);
}

/** The scroller — where a stroke has to be drawn. */
const surfaceBox = async () => page.evaluate(() => {
  const w = document.querySelector('[data-bin-world]');
  const r = w.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});

/** Draw a stroke across the group, in screen coordinates. */
async function stroke(x0, y0, x1, y1, steps = 14) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(450);
}

// ── The pen draws, and one stroke is one record ───────────────────────────
{
  const before = await inkIn();
  await (await winBtn('Pen')).click();
  await page.waitForTimeout(300);

  const armed = await page.evaluate(() => {
    const w = document.querySelector('.bin-window-in');
    const btn = [...w.querySelectorAll('button')].find(x => x.getAttribute('title') === 'Pen');
    return { lit: lit(btn), strip: /Pen/.test(w.innerText) && /Width/.test(w.innerText) };
  });
  check(armed.lit, 'picking the pen lights its button');
  check(armed.strip, 'and opens the colour and width strip');

  // Pick a colour that is not the default, so the record proves the strip works.
  await page.click(`${WIN} button[title="#dc2626"]`);
  await page.waitForTimeout(200);

  const sb = await surfaceBox();
  await stroke(sb.x + 60, sb.y + 320, sb.x + 300, sb.y + 380);

  const after = await inkIn();
  console.log('       after one pen stroke:', JSON.stringify(after));
  check(after.length === before.length + 1, 'a pen stroke becomes exactly ONE record',
    `${before.length} → ${after.length}`);
  const s = after[after.length - 1];
  check(!!s && s.board !== 'x' && s.own, 'and it is a node of its own (data.own)');
  check(!!s && s.color === '#dc2626', 'in the colour that was picked', s?.color);
  check(!!s && s.n > 3, 'holding the whole path, not one point per record', `${s?.n} points`);
}

// ── Drawing across a tile is drawing, not dragging ────────────────────────
{
  const posBefore = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('general_app_data'));
    const a = raw.apartments.find(x => x.id === 'G-b0');
    return { x: a.binX ?? null, y: a.binY ?? null };
  });
  const before = await inkIn();
  const tile = await page.$(`${WIN} [data-node-id="G-b0"]`);
  check(!!tile, 'there is a tile to draw across');
  if (tile) {
    const t = await tile.boundingBox();
    await stroke(t.x + 12, t.y + t.height / 2, t.x + t.width - 12, t.y + t.height / 2, 10);
    const after = await inkIn();
    const posAfter = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('general_app_data'));
      const a = raw.apartments.find(x => x.id === 'G-b0');
      return { x: a.binX ?? null, y: a.binY ?? null };
    });
    check(after.length === before.length + 1,
      'a press ON A TILE with the pen armed starts a stroke', `${before.length} → ${after.length}`);
    check(posAfter.x === posBefore.x && posAfter.y === posBefore.y,
      'and the tile does not move', `${JSON.stringify(posBefore)} → ${JSON.stringify(posAfter)}`);
  }
}

// ── The highlighter is its own tool ───────────────────────────────────────
{
  await (await winBtn('Highlighter')).click();
  await page.waitForTimeout(300);
  const penOff = await page.evaluate(() => {
    const w = document.querySelector('.bin-window-in');
    const pen = [...w.querySelectorAll('button')].find(x => x.getAttribute('title') === 'Pen');
    return !lit(pen);
  });
  check(penOff, 'arming the highlighter puts the pen down');

  const before = await inkIn();
  const sb = await surfaceBox();
  await stroke(sb.x + 60, sb.y + 430, sb.x + 320, sb.y + 430);
  const after = await inkIn();
  const s = after[after.length - 1];
  check(after.length === before.length + 1, 'the highlighter draws too');
  check(!!s && s.art === 'marker', 'and is stored as marker ink, not as pen ink', s?.art);
  check(!!s && s.w >= 6, 'at the highlighter’s own width', `${s?.w}`);
}

// ── Pressing the armed tool puts it down ──────────────────────────────────
{
  await (await winBtn('Highlighter')).click();
  await page.waitForTimeout(300);
  const down = await page.evaluate(() => {
    const w = document.querySelector('.bin-window-in');
    const h = [...w.querySelectorAll('button')].find(x => x.getAttribute('title') === 'Highlighter');
    return { lit: lit(h), strip: /Width/.test(w.innerText) };
  });
  check(!down.lit && !down.strip, 'pressing the armed tool again puts it down');

  // And with nothing armed, a drag on empty surface is not a stroke.
  const before = await inkIn();
  const sb = await surfaceBox();
  await stroke(sb.x + 400, sb.y + 300, sb.x + 520, sb.y + 340, 8);
  const after = await inkIn();
  check(after.length === before.length, 'with no tool armed, a drag draws nothing',
    `${before.length} → ${after.length}`);
}

// ── The eraser cuts, and the whole-mark eraser lifts ──────────────────────
{
  // A fresh, long, known stroke to rub out.
  await (await winBtn('Pen')).click();
  await page.waitForTimeout(300);
  const sb = await surfaceBox();
  const y = sb.y + 250;
  await stroke(sb.x + 60, y, sb.x + 560, y, 24);
  const drawn = await inkIn();
  const target = drawn[drawn.length - 1];
  check(!!target && target.n > 6, 'a long stroke to rub out', `${target?.n} points`);

  await (await winBtn('Eraser')).click();
  await page.waitForTimeout(300);
  const eraserUi = await page.evaluate(() => {
    const w = document.querySelector('.bin-window-in');
    return { rub: /Rub out/.test(w.innerText), whole: /Whole mark/.test(w.innerText),
             size: /Size/.test(w.innerText),
             cursor: !!document.querySelector('.fixed .rounded-full') };
  });
  check(eraserUi.rub && eraserUi.whole && eraserUi.size,
    'the eraser offers rub-out, whole-mark and a size');

  // Rub through the MIDDLE of it — the point taken from the RECORD and
  // converted through the world div, so a tool strip that changed height
  // cannot silently move the target out from under the press.
  const mid = await page.evaluate(id => {
    const els = JSON.parse(localStorage.getItem('general_app_data')).canvasElements ?? [];
    const el = els.find(e => e.id === id);
    const pts = el.points.trim().split(/\s+/).map(p => p.split(',').map(Number));
    const m = pts[Math.floor(pts.length / 2)];
    const r = document.querySelector('[data-bin-world]').getBoundingClientRect();
    return { x: r.x + m[0], y: r.y + m[1] };
  }, target.id);
  console.log('       rubbing at', JSON.stringify(mid));
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, mid.y + 2);
  await page.mouse.up();
  await page.waitForTimeout(600);

  const cut = await inkIn();
  console.log('       after one rub in the middle:', cut.length, 'records');
  check(!cut.some(s => s.id === target.id), 'the stroke that was rubbed is gone');
  check(cut.length === drawn.length + 1,
    'and comes back as TWO pieces, one record each', `${drawn.length} → ${cut.length}`);
  check(cut.every(s => s.own), 'both pieces are nodes, so they can be erased again');

  // Whole-mark: one touch lifts a mark entirely.
  await page.click(`${WIN} button:has-text("Whole mark")`);
  await page.waitForTimeout(250);
  const beforeWhole = await inkIn();
  const anyInk = await page.evaluate(() => {
    const els = JSON.parse(localStorage.getItem('general_app_data')).canvasElements ?? [];
    const el = els.filter(e => e.type === 'stroke' && e.board === 'CE-bin-mine')[0];
    const pts = el.points.trim().split(/\s+/).map(p => p.split(',').map(Number));
    const m = pts[Math.floor(pts.length / 2)];
    const r = document.querySelector('[data-bin-world]').getBoundingClientRect();
    return { x: r.x + m[0], y: r.y + m[1] };
  });
  await page.mouse.move(anyInk.x, anyInk.y);
  await page.mouse.down();
  await page.mouse.move(anyInk.x + 2, anyInk.y + 1);
  await page.mouse.up();
  await page.waitForTimeout(600);
  const afterWhole = await inkIn();
  check(afterWhole.length === beforeWhole.length - 1,
    'whole-mark lifts the whole mark in one touch', `${beforeWhole.length} → ${afterWhole.length}`);
}

// ── Escape puts the tool down; it does not close the group ────────────────
{
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => {
    const w = document.querySelector('.bin-window-in');
    return { open: !!w, strip: w ? /Rub out/.test(w.innerText) : false };
  });
  check(state.open, 'Escape with a tool armed leaves the group open');
  check(!state.strip, 'and puts the tool down');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const closed = await page.evaluate(() => !document.querySelector('.bin-window-in'));
  check(closed, 'a second Escape closes the group');
}

// ── The ink stayed in the GROUP, not on the board ─────────────────────────
{
  const where = await page.evaluate(() => {
    const els = JSON.parse(localStorage.getItem('general_app_data')).canvasElements ?? [];
    const strokes = els.filter(e => e.type === 'stroke');
    return {
      inGroup: strokes.filter(e => e.board === 'CE-bin-mine').length,
      onBoard: strokes.filter(e => !e.board).length,
    };
  });
  console.log('       ink:', JSON.stringify(where));
  check(where.inGroup > 0 && where.onBoard === 0,
    'every stroke stayed inside the group', JSON.stringify(where));
}

// ── The same rule on the MAIN board ───────────────────────────────────────
// A straight stroke's box is one pixel tall, so its own edge resize handles
// sit on top of the whole of its ink. Before the guard in `beginResize` those
// handles swallowed every press aimed at it and a straight line simply could
// not be rubbed out — anywhere. The group is where it was found; the board is
// where it lived.
{
  await page.waitForTimeout(500);
  // The rail's tiles are titled by what they DO, not by their name — reading
  // the product's own strings rather than guessing at them.
  const pen = await page.$('button[title^="Draw"]');
  check(!!pen, 'the board has its pen');
  if (pen) {
    await pen.click();
    await page.waitForTimeout(400);
    const vp = await page.evaluate(() => {
      const r = document.querySelector('[data-board-viewport]').getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const y = vp.y + vp.h - 150;
    await stroke(vp.x + 160, y, vp.x + 660, y, 24);
    const drawn = await page.evaluate(() => (JSON.parse(localStorage.getItem('general_app_data'))
      .canvasElements ?? []).filter(e => e.type === 'stroke' && !e.board));
    check(drawn.length === 1, 'a straight stroke on the board', `${drawn.length}`);
    check(!!drawn[0] && drawn[0].h <= 2, 'whose box really is a sliver', `h=${drawn[0]?.h}`);

    const eraser = await page.$('button[title^="Rub out"]');
    check(!!eraser, 'and its eraser');
    if (eraser && drawn.length === 1) {
      await eraser.click();
      await page.waitForTimeout(400);
      // Press on the NODE's own rendered box — no coordinate maths to get
      // wrong, and for a 500x1 stroke its centre is squarely on the ink.
      const node = await page.$(`[data-node-id="${drawn[0].id}"]`);
      check(!!node, 'the stroke drew a node');
      if (node) {
        const nb = await node.boundingBox();
        const mx = nb.x + nb.width / 2, my = nb.y + nb.height / 2;
        await page.mouse.move(mx, my);
        await page.mouse.down();
        await page.mouse.move(mx, my + 2);
        await page.mouse.up();
        await page.waitForTimeout(800);
        const after = await page.evaluate(() => (JSON.parse(localStorage.getItem('general_app_data'))
          .canvasElements ?? []).filter(e => e.type === 'stroke' && !e.board));
        check(!after.some(e => e.id === drawn[0].id),
          'a straight stroke on the BOARD can be rubbed out too',
          `${drawn.length} → ${after.length}`);
      }
    }
  }
}

await page.screenshot({ path: 'scratchpad/groupink.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
