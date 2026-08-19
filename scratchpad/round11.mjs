// This round: the wheel over a scrollable widget, the overview's true board
// shape + its grip, zooming out walking home, node text growing with the box,
// margins on locked edges, and Enter committing a field.
import { chromium } from 'playwright';
const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1300, height: 860 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('general_app_data')) {
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
      stages: [{ id: 'gst1', name: 'AC installation', color: '#0ea5e9', order: 1, active: true,
                 projectId: 'general', description: '', createdAt: '', updatedAt: '' }],
      apartments: Array.from({ length: 14 }, (_, i) => ({
        id: `G-j${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
        displayName: `Job ${i}`, isUnnamed: false, isDuplexApt: false, classification: 'standard',
        generalNotes: '', currentStageId: 'gst1', stageDates: {},
        canvasX: 60 + (i % 2) * 240, canvasY: 60 + Math.floor(i / 2) * 150,
        createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
      })),
      canvasElements: [
        // A big note, to prove its text grows with the box.
        { id: 'CE-note', type: 'note', x: 1000, y: 120, w: 260, h: 240, text: 'A long note', color: '#fef9c3' },
        // A job-list widget: it scrolls, so the wheel over it must not zoom.
        { id: 'CE-list', type: 'widget', widget: 'job-list', x: 620, y: 120, w: 300, h: 130, text: '', color: '#fff', data: {} },
        // The map: it owns its wheel outright.
        { id: 'CE-map', type: 'widget', widget: 'job-map', x: 620, y: 300, w: 380, h: 260, text: '', color: '#fff', data: {} },
        // Something far away so the board is bigger than the screen.
        { id: 'CE-far', type: 'note', x: 3200, y: 2400, w: 180, h: 140, text: 'Far', color: '#fef9c3' },
      ],
    }));
  }
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2800);

const state = () => page.evaluate(() => {
  const w = document.querySelector('[data-board-viewport] > div[style*="matrix"], [data-board-viewport] > div[style*="translate"]');
  const el = [...document.querySelectorAll('[data-board-viewport] div')].find(d => /matrix|translate/.test(d.style.transform) && d.style.transformOrigin.startsWith('0px'));
  const m = new DOMMatrix(getComputedStyle(el || w).transform);
  return { x: m.e, y: m.f, z: m.a };
});

// ── 1. the overview draws the board's real shape, with grey around it ───────
const mini = await page.evaluate(() => {
  const panel = [...document.querySelectorAll('div[title^="Board overview"]')][0];
  if (!panel) return null;
  const r = panel.getBoundingClientRect();
  const white = panel.querySelector('div.bg-white');
  const wr = white?.getBoundingClientRect();
  return {
    panelW: Math.round(r.width), panelH: Math.round(r.height),
    boardW: wr ? Math.round(wr.width) : 0, boardH: wr ? Math.round(wr.height) : 0,
    grip: !!panel.querySelector('[title="Move the overview"]'),
  };
});
check(!!mini, 'the board overview is on screen');
if (mini) {
  check(mini.boardW > 0 && mini.boardH > 0, 'the overview paints the board as its own rectangle',
    `${mini.boardW}x${mini.boardH} inside ${mini.panelW}x${mini.panelH}`);
  check(mini.boardW <= mini.panelW + 1 && mini.boardH <= mini.panelH + 1,
    'the board rectangle fits inside the panel');
  check(mini.boardW < mini.panelW - 2 || mini.boardH < mini.panelH - 2,
    'a non-square board leaves grey on one side');
  check(mini.grip, 'the overview has a move grip');
}

// ── 2. the overview moves, and 0 puts it back ──────────────────────────────
{
  const before = await page.evaluate(() => {
    const p = document.querySelector('div[title^="Board overview"]');
    const r = p.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) };
  });
  const grip = await page.$('[title="Move the overview"]');
  const gb = await grip.boundingBox();
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(gb.x - 200, gb.y - 150, { steps: 8 });
  const hint = await page.evaluate(() =>
    [...document.querySelectorAll('div')].some(d => d.textContent === 'press 0 to put it back'));
  check(hint, 'the move hint says 0 puts it back');
  const moved = await page.evaluate(() => {
    const p = document.querySelector('div[title^="Board overview"]');
    const r = p.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) };
  });
  check(Math.abs(moved.x - before.x) > 100, 'dragging the grip moves the overview',
    `${before.x} → ${moved.x}`);
  await page.keyboard.press('0');
  await page.mouse.up();
  await page.waitForTimeout(150);
  const back = await page.evaluate(() => {
    const p = document.querySelector('div[title^="Board overview"]');
    const r = p.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) };
  });
  check(Math.abs(back.x - before.x) < 3 && Math.abs(back.y - before.y) < 3,
    '0 puts the overview back on its dock', `${moved.x} → ${back.x} (was ${before.x})`);
}

// ── 3. the wheel over a scrolling widget scrolls it, not the board ──────────
{
  const box = await page.evaluate(() => {
    const el = document.querySelector('[data-node-id="CE-list"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const p = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    return { ...p, hit: el.contains(document.elementFromPoint(p.x, p.y)) };
  });
  if (!box) { check(false, 'the job-list widget rendered'); }
  else {
    check(box.hit, 'the point being wheeled is really on the job list');
    const z0 = (await state()).z;
    // Non-vacuous: the widget must have somewhere to scroll in the first place,
    // or "the board did not zoom" would pass on an empty widget.
    const room = await page.evaluate(() => {
      const n = document.querySelector('[data-node-id="CE-list"]');
      const s = [...n.querySelectorAll('*')].find(e => { const st = getComputedStyle(e); return (st.overflowY === 'auto' || st.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 4; });
      return s ? { room: s.scrollHeight - s.clientHeight, top: s.scrollTop } : null;
    });
    check(!!room && room.room > 1, 'the job list really has more rows than fit',
      room ? `${room.room}px of travel` : 'nothing scrolls');
    await page.mouse.move(box.x, box.y);
    await page.mouse.wheel(0, 220);
    await page.waitForTimeout(250);
    const z1 = (await state()).z;
    check(Math.abs(z1 - z0) < 0.001, 'the wheel over a scrolling widget leaves the board zoom alone',
      `${z0} → ${z1}`);
    const after = await page.evaluate(() => {
      const n = document.querySelector('[data-node-id="CE-list"]');
      const s = [...n.querySelectorAll('*')].find(e => { const st = getComputedStyle(e); return (st.overflowY === 'auto' || st.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 4; });
      return s ? s.scrollTop : -1;
    });
    check(after > 0, 'and the widget itself scrolled', `scrollTop=${after}`);
  }
}

// ── 4. the wheel over the map never zooms the board ─────────────────────────
{
  const box = await page.evaluate(() => {
    const el = document.querySelector('[data-node-id="CE-map"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const p = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    return { ...p, hit: el.contains(document.elementFromPoint(p.x, p.y)) };
  });
  if (!box) check(false, 'the map widget rendered');
  else {
    check(box.hit, 'the point being wheeled is really on the map');
    const z0 = (await state()).z;
    await page.mouse.move(box.x, box.y);
    await page.mouse.wheel(0, 220);
    await page.waitForTimeout(250);
    const z1 = (await state()).z;
    check(Math.abs(z1 - z0) < 0.001, 'the wheel over the map leaves the board zoom alone', `${z0} → ${z1}`);
  }
}

// ── 5. zooming out walks back to the corner ────────────────────────────────
{
  // Zoom IN hard at the far bottom-right, then come back out.
  await page.mouse.move(1100, 700);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
  const inState = await state();
  check(inState.z > 1, 'zoomed in', `z=${inState.z}`);
  // Non-vacuous: zooming in must actually have carried the view off the corner,
  // or "it came back to the corner" would pass without the walk-home doing a thing.
  check(inState.x < -300 || inState.y < -300, 'zooming in carried the view off the corner',
    `pan=${Math.round(inState.x)},${Math.round(inState.y)}`);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(120); }
  const outState = await state();
  check(outState.z <= inState.z, 'zoomed back out', `z=${outState.z}`);
  // Home is the pinned corner: pan.x is the margin, pan.y the chrome + margin.
  check(outState.x < 60, 'zooming out lands back on the left edge', `pan.x=${Math.round(outState.x)}`);
  check(outState.y < 200, 'zooming out lands back at the top', `pan.y=${Math.round(outState.y)}`);
}

// ── 6. a note's words grow with the box ────────────────────────────────────
{
  const sizes = await page.evaluate(() => {
    const big = document.querySelector('[data-node-id="CE-note"]');
    const small = document.querySelector('[data-node-id="CE-far"]');
    const read = n => {
      const t = n?.querySelector('div.whitespace-pre-wrap');
      return t ? parseFloat(getComputedStyle(t).fontSize) : 0;
    };
    return { big: read(big), small: read(small) };
  });
  check(sizes.big > sizes.small, 'a bigger note carries bigger words',
    `${sizes.small}px → ${sizes.big}px`);
}

// ── 7. Enter takes the focus off a single-line field, which is what saves ──
{
  await page.keyboard.press('Escape');
  const ok = await page.evaluate(() => {
    const i = document.createElement('input');
    i.type = 'text';
    document.body.appendChild(i);
    i.focus();
    let blurred = false;
    i.addEventListener('blur', () => { blurred = true; });
    i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const r = blurred;
    i.remove();
    return r;
  });
  check(ok, 'Enter blurs a single-line field, running its save');
}

await page.screenshot({ path: 'scratchpad/round11.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
