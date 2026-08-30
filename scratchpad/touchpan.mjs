// The finger rule on the board: touch NAVIGATES, it never arranges.
//
// A single finger dragged from a tile, a note, or a resize corner must pan the
// board and leave the node exactly where it was stored; a motionless tap still
// opens (job → drawer, group → its window); two fingers pinch-zoom. Driven
// with raw CDP touch sequences — a drag is a press that MOVES, and tap() can
// never produce one.
import { chromium, devices } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  userAgent: devices['iPhone 13'].userAgent,
});
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2026-08-16');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [{
      id: 'G-j1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Touch Job',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 60, canvasY: 240,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U-test', updatedByName: 'A',
    }],
    canvasElements: [
      { id: 'CE-t', type: 'note', x: 60, y: 430, w: 180, h: 140, text: 'TouchNote', color: '#fef9c3' },
    ],
  }));
});
const page = await ctx.newPage();
page.on('console', m => { if (m.text().startsWith('[pinch]')) console.log('   ', m.text()); });
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(3000);

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) fails++; };
const box = id => page.locator(`[data-node-id="${id}"]`).boundingBox();
const stored = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  return {
    job: d.apartments?.find(a => a.id === 'G-j1'),
    note: d.canvasElements?.find(e => e.id === 'CE-t'),
  };
});

const cdp = await ctx.newCDPSession(page);
async function fingerDrag(x0, y0, dx, dy) {
  const pts = Array.from({ length: 10 }, (_, i) => ({
    x: x0 + (dx * (i + 1)) / 10, y: y0 + (dy * (i + 1)) / 10 }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (const p of pts) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function fingerTap(x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// ── 1. a finger dragged from the TILE pans the board, not the tile ──
{
  const j0 = await box('G-j1');
  await fingerDrag(j0.x + 100, j0.y + 60, -90, -60);
  await page.waitForTimeout(700);
  const j1 = await box('G-j1');
  const moved = { x: Math.round(j1.x - j0.x), y: Math.round(j1.y - j0.y) };
  const st = await stored();
  console.log(`   tile screen moved ${moved.x},${moved.y} — stored at ${st.job.canvasX},${st.job.canvasY}`);
  check(moved.x < -60 && st.job.canvasX === 60 && st.job.canvasY === 240,
    'finger drag from a tile panned the board and left the job in place');
}

// ── 2. same from a NOTE ──
{
  const n0 = await box('CE-t');
  await fingerDrag(n0.x + 90, n0.y + 70, 80, 50);
  await page.waitForTimeout(700);
  const st = await stored();
  check(st.note.x === 60 && st.note.y === 430, 'finger drag from a note left the note in place');
}

// ── 3. a motionless tap on the tile still OPENS the job ──
{
  const j = await box('G-j1');
  await fingerTap(j.x + 100, j.y + 40);
  await page.waitForTimeout(1200);
  const open = await page.locator('.drawer-panel').count();
  check(open > 0, 'tap on the tile opened the job');
  if (open) { await page.keyboard.press('Escape'); await page.waitForTimeout(600); }
}

// ── 4. a tap on a GROUP opens its window ──
{
  // Frame the board, then pan the bins into view with a background drag —
  // at the phone's 50% zoom floor the world is wider than the screen and the
  // groups live on its right side.
  await page.getByRole('button', { name: 'Fit' }).first().tap();
  await page.waitForTimeout(700);
  let done = await box('CE-bin-done');
  if (done && (done.x + done.width / 2 > 370 || done.y + done.height / 2 < 150)) {
    await fingerDrag(300, 700, -240, 150);
    await page.waitForTimeout(500);
    done = await box('CE-bin-done');
  }
  if (!done) { check(false, 'Done group not on the board'); }
  else {
    const cx = done.x + done.width / 2, cy = done.y + done.height / 2;
    const at = await page.evaluate(([x, y]) => {
      const n = document.elementFromPoint(x, y);
      return n ? `${n.tagName}.${(n.className || '').toString().slice(0, 50)}` : 'none';
    }, [cx, cy]);
    console.log(`   bin centre ${Math.round(cx)},${Math.round(cy)} — under it: ${at}`);
    await fingerTap(cx, cy);
    await page.waitForTimeout(900);
    // The group window's own chrome, not the board's: its search field.
    const opened = await page.locator('input[placeholder*="Search inside"]').count();
    if (!opened) await page.screenshot({ path: 'scratchpad/touch-bin-fail.png' });
    check(opened > 0, 'tap on the Done group opened its window');
    // Escape backs out ONE thing at a time (the documented rule) — inside
    // the window it may first put down a tool or clear a selection. Press
    // until the window is really gone, or its overlay swallows the pinch.
    for (let i = 0; i < 4; i++) {
      if (!(await page.locator('input[placeholder*="Search inside"]').count())) break;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
    check((await page.locator('input[placeholder*="Search inside"]').count()) === 0,
      'and the group window really closed');
  }
}

// ── 5. two fingers pinch-zoom ──
{
  // The transform lives on the world div's PARENT (the grouplock lesson —
  // "find the world by [data-board-world].parentElement").
  const zoomOf = () => page.evaluate(() => {
    const w = document.querySelector('[data-board-world]').parentElement;
    const m = new DOMMatrixReadOnly(getComputedStyle(w).transform);
    return m.a;
  });
  const z0 = await zoomOf();
  const cx = 195, cy = 450;
  const two = (d) => ([{ x: cx - d, y: cy }, { x: cx + d, y: cy }]);
  // The standing rule: a press aimed at the board must first be shown to
  // LAND on the board — an overlay left standing makes the pinch a no-op
  // and blames the feature.
  const under = await page.evaluate(([x, y]) => {
    const n = document.elementFromPoint(x, y);
    return !!(n && n.closest('[data-board-viewport]'));
  }, [cx, cy]);
  console.log('   under fingers:', await page.evaluate(([l, r, y]) => [l, r].map(x => {
    const n = document.elementFromPoint(x, y);
    return (n?.closest('[data-node-id]')?.getAttribute('data-node-id')) ?? n?.tagName ?? 'none';
  }).join(' | '), [cx - 40, cx + 40, cy]));
  check(under, 'the pinch point is really on the board');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: two(40) });
  for (let d = 48; d <= 120; d += 8) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: two(d) });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(700);
  // Read the world transform, not a tile's box — a strong zoom-in CULLS the
  // seeded tile right off the screen, which is the feature working.
  const z1 = await zoomOf();
  console.log(`   zoom ${z0.toFixed(2)} -> ${z1.toFixed(2)}`);
  check(z1 > z0 * 1.3, 'pinch zoomed the board in');
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
await b.close();
process.exit(fails ? 1 : 0);
