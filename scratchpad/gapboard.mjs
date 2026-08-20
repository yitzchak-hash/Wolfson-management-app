// Spacing snapping, on the real board and inside a real group.
//
// `gapsnap.mjs` proves the arithmetic offline; this proves the arithmetic is
// WIRED — that the board asks for it, draws the bars, and writes the snapped
// position rather than the raw one. Both are needed: the module was correct
// and unreachable for as long as nothing passed the flag.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });

// Three notes in a row, 200 wide with gaps of exactly 60, and a fourth well
// clear of them. Notes rather than jobs so the boxes are known exactly.
const ROW_Y = 520;
await ctx.addInitScript(y => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  const note = (id, x) => ({
    id, type: 'note', x, y, w: 200, h: 140, text: id, color: '#fef9c3',
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], apartments: [],
    canvasElements: [
      note('CE-a', 100), note('CE-b', 360), note('CE-c', 620),
      // Parked ABOVE the row, not below it: below put it off the bottom of the
      // window, where the mouse never reached it and "the drag did nothing"
      // was the harness's own fault.
      note('CE-loose', 200),
    ].map((n, i) => (i === 3 ? { ...n, y: y - 300 } : n)).concat([
      // A group, with a row of its own inside it: gaps of 40 this time, so a
      // number carried over from the outer board could not pass for the
      // group's own answer.
      // Parked where none of its edges or its centre can line up with where
      // the dragged note is going. At x 1000 its centre was 1089 — exactly the
      // right edge of the landing spot — so plain edge alignment claimed the
      // axis and the spacing test failed with the harness's own scenery as the
      // cause. And well up the board: the floating header pushes the world
      // down about 170px, so world y 700 renders past the bottom of a 900px
      // window and the double-click that opens the group lands on nothing.
      { id: 'CE-bin-mine', type: 'bin', x: 500, y: 250, w: 178, h: 92,
        text: 'Currently in AC', color: '#64748b' },
      { ...note('CE-ga', 20), y: 40, board: 'CE-bin-mine' },
      { ...note('CE-gb', 260), y: 40, board: 'CE-bin-mine' },
      { ...note('CE-gc', 500), y: 40, board: 'CE-bin-mine' },
      { ...note('CE-gloose', 20), y: 400, board: 'CE-bin-mine' },
    ]),
  }));
}, ROW_Y);

const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3200);

/** Where a node's box is, straight from the store. */
const boxOf = id => page.evaluate(i => {
  const el = (JSON.parse(localStorage.getItem('general_app_data')).canvasElements ?? [])
    .find(e => e.id === i);
  return el ? { x: el.x, y: el.y, w: el.w, h: el.h } : null;
}, id);

/** Board point → screen point, through the node's own rendered rect. */
const toScreen = (id, ox, oy) => page.evaluate(([i, dx, dy]) => {
  const n = document.querySelector(`[data-node-id="${i}"]`);
  const r = n.getBoundingClientRect();
  const k = r.width / n.offsetWidth;
  return { x: r.x + dx * k, y: r.y + dy * k, k };
}, [id, ox, oy]);

const start = await boxOf('CE-loose');
check(!!start, 'the board seeded', JSON.stringify(start));

// Grab the loose note by its middle and carry it to the end of the row, three
// pixels short of where the row's own 60px gap would put it (x = 820 + 60).
const grab = await toScreen('CE-loose', 100, 70);
const target = await toScreen('CE-a', 100, 70);     // same offset within the box
const WANT_X = 880;
const dropX = target.x + (WANT_X - 100) * target.k + 3 * target.k;
const dropY = target.y;

await page.mouse.move(grab.x, grab.y);
await page.mouse.down();
await page.mouse.move(grab.x + 40, grab.y - 40);
await page.waitForTimeout(80);
await page.mouse.move(dropX, dropY, { steps: 12 });
await page.waitForTimeout(260);

// ── The bars are on screen WHILE the drag is live ─────────────────────────
const live = await page.evaluate(() => {
  const bars = [...document.querySelectorAll('[data-snap-gap]')];
  return {
    n: bars.length,
    labels: bars.map(x => x.textContent.trim()),
    plainLines: document.querySelectorAll('[data-snap-guide]:not([data-snap-gap])').length,
  };
});
console.log('       while held:', JSON.stringify(live));
check(live.n === 2, 'two spacing bars are drawn while the note is held', `${live.n}`);
check(live.labels.every(l => l === '60'),
  'each printing the gap it measures', JSON.stringify(live.labels));

await page.mouse.up();
await page.waitForTimeout(700);

// ── …and gone the moment it lands ─────────────────────────────────────────
const after = await page.evaluate(() => document.querySelectorAll('[data-snap-guide]').length);
check(after === 0, 'and cleared on release', `${after} left`);

// ── The note landed on the snap, not where the hand let go ────────────────
const landed = await boxOf('CE-loose');
console.log('       landed:', JSON.stringify(landed));
check(Math.abs(landed.x - WANT_X) <= 1,
  'the note took the row’s own gap rather than where it was dropped',
  `x ${landed.x}, wanted ${WANT_X}`);
check(Math.abs(landed.y - ROW_Y) <= 1,
  'and lined its top up with the row at the same time', `y ${landed.y}`);

// ── The same, inside a group ──────────────────────────────────────────────
// A group is a board, so it lines things up the same way — through the same
// pure module, drawing the same bars.
{
  const bin = await page.$('[data-node-id="CE-bin-mine"]');
  check(!!bin, 'the group is on the board');
  if (bin) {
    const bb = await bin.boundingBox();
    // The board's chrome floats OVER the world — the tool rail down the left,
    // the header across the top, the overview bottom-right. A press aimed at
    // world coordinates that happen to sit under one of them hits the chrome,
    // and the group simply never opens.
    console.log('       bin box:', JSON.stringify(bb));
    const onTop = await page.evaluate(([x2, y2]) => {
      const at = document.elementFromPoint(x2, y2);
      return at?.closest('[data-node-id="CE-bin-mine"]') ? 'bin' : (at?.className ?? at?.tagName ?? '?');
    }, [bb.x + bb.width / 2, bb.y + bb.height / 2]);
    check(onTop === 'bin', 'the group is not under the board’s chrome', String(onTop).slice(0, 80));
    await page.mouse.dblclick(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(1200);
    const opened = await page.evaluate(() => ({
      win: !!document.querySelector('.bin-window-in'),
      nodes: [...document.querySelectorAll('.bin-window-in [data-node-id]')].map(n => n.dataset.nodeId),
    }));
    console.log('       group window:', JSON.stringify(opened));
    check(opened.win && opened.nodes.includes('CE-gloose'),
      'the group opened with its own notes in it', JSON.stringify(opened));
    if (!opened.win) { console.log('CANNOT CONTINUE'); await b.close(); process.exit(1); }

    const WANT = 740;                       // 700 + the group's own 40 gap
    const g = await toScreen('CE-gloose', 100, 70);
    const t = await toScreen('CE-ga', 100, 70);
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(g.x + 40, g.y - 40);
    await page.waitForTimeout(80);
    await page.mouse.move(t.x + (WANT - 20) * t.k + 3 * t.k, t.y, { steps: 12 });
    await page.waitForTimeout(280);

    const inGroup = await page.evaluate(() => {
      const w = document.querySelector('.bin-window-in');
      const bars = [...w.querySelectorAll('[data-snap-gap]')];
      return { n: bars.length, labels: bars.map(x => x.textContent.trim()) };
    });
    console.log('       inside the group:', JSON.stringify(inGroup));
    check(inGroup.n === 2, 'a group draws spacing bars too', `${inGroup.n}`);
    check(inGroup.labels.every(l => l === '40'),
      'measuring the GROUP’s own gap, not the board’s', JSON.stringify(inGroup.labels));

    await page.mouse.up();
    await page.waitForTimeout(700);
    const landed2 = await boxOf('CE-gloose');
    console.log('       landed in group:', JSON.stringify(landed2));
    check(Math.abs(landed2.x - WANT) <= 1,
      'and the note takes that gap', `x ${landed2.x}, wanted ${WANT}`);
    check(Math.abs(landed2.y - 40) <= 1, 'and lines up with the row', `y ${landed2.y}`);

    // TWICE: Escape inside a group backs out one thing at a time, and the note
    // that was just dropped is still the selection. One press clears that and
    // leaves the window standing — which then swallows every later click.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    check(await page.evaluate(() => !document.querySelector('.bin-window-in')),
      'and the group closes again');
  }
}

// ── Off means off ─────────────────────────────────────────────────────────
{
  const gear = await page.$('button[title*="Board settings"], button[title*="board settings"]');
  check(!!gear, 'board settings is reachable');
  if (gear) {
    await gear.click();
    await page.waitForTimeout(600);
    const toggled = await page.evaluate(() => {
      const l = [...document.querySelectorAll('label')]
        .find(x => /Match sizes and spacing/.test(x.textContent ?? ''));
      if (!l) return null;
      const cb = l.querySelector('input[type="checkbox"]');
      const was = cb.checked;
      cb.click();
      return { was, now: cb.checked };
    });
    console.log('       setting:', JSON.stringify(toggled));
    check(!!toggled, 'the spacing setting is in board settings by name');
    check(toggled?.was === true && toggled?.now === false,
      'it was on, and pressing it turns it off', JSON.stringify(toggled));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // The note is sitting exactly on the snap now, so nudging it 3px off is a
    // gesture spacing WOULD claim. With the setting off it must be left alone.
    const g2 = await toScreen('CE-loose', 100, 70);
    await page.mouse.move(g2.x, g2.y);
    await page.mouse.down();
    await page.mouse.move(g2.x + 40, g2.y + 40);
    await page.waitForTimeout(80);
    await page.mouse.move(g2.x + 3 * target.k, g2.y, { steps: 8 });
    await page.waitForTimeout(250);
    const barsOff = await page.evaluate(() => document.querySelectorAll('[data-snap-gap]').length);
    await page.mouse.up();
    await page.waitForTimeout(700);
    const rested = await boxOf('CE-loose');
    check(barsOff === 0, 'with the setting off no spacing bar is drawn', `${barsOff}`);
    check(Math.abs(rested.x - WANT_X) >= 2,
      'and the note is left where the hand put it', `x ${rested.x}`);
  }
}

await page.screenshot({ path: 'scratchpad/gapboard.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
