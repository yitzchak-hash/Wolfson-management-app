// Round 25: the section box is TINTED on the wall, not a solid slab · a wide
// board zooms out past 25% until all of it is on screen, flush top-right ·
// "Room above" adds a little space and the view does not move.
import { chromium } from 'playwright';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const seed = () => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    apartments: [{
      id: 'G-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Near',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 60, canvasY: 200,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [
      // A solid-hex ORANGE box — the exact record that painted the wall solid.
      { id: 'CE-orange', type: 'box', x: 300, y: 120, w: 900, h: 600, text: 'TV area', color: '#f97316' },
      { id: 'CE-note', type: 'note', x: 380, y: 200, w: 165, h: 150, text: 'inside', color: '#fef9c3' },
      // Far content: makes the world ~6300 wide, unfittable at 25%.
      { id: 'CE-far', type: 'note', x: 6000, y: 900, w: 165, h: 150, text: 'far', color: '#bbf7d0' },
      { id: 'CE-bin-done', type: 'bin', binKind: 'done', x: 2100, y: 24, w: 180, h: 112, text: 'Done', color: '#16a34a' },
      { id: 'CE-bin-ready', type: 'bin', binKind: 'ready', x: 2100, y: 154, w: 180, h: 112, text: 'Ready', color: '#0ea5e9' },
      { id: 'CE-bin-archive', type: 'bin', binKind: 'archive', x: 2100, y: 284, w: 180, h: 112, text: 'Archive', color: '#64748b' },
      { id: 'CE-bin-trash', type: 'bin', binKind: 'trash', x: 2100, y: 414, w: 180, h: 112, text: 'Trash', color: '#dc2626' },
    ],
  }));
};

// ── 1 · the wall tints the box ──────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(seed);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto('http://localhost:5173/tv');
  await page.waitForTimeout(3000);
  const box = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('div')];
    const el = nodes.find(n => n.style && /absolute/.test(n.className) && (n.textContent || '').trim() === 'TV area'
      && n.style.left && parseFloat(n.style.width) > 400);
    if (!el) return null;
    const bg = getComputedStyle(el).backgroundColor;
    const m = /rgba?\(([^)]+)\)/.exec(bg);
    const parts = m ? m[1].split(',').map(v => parseFloat(v)) : [];
    return { bg, alpha: parts.length === 4 ? parts[3] : 1 };
  });
  check(!!box && box.alpha < 0.7,
    'the wall draws a solid-coloured section box TINTED, not as a slab', JSON.stringify(box));
  await ctx.close();
}

// ── 2 + 3 · the board: zoom-out to full fit, and gentle make-room ───────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(seed);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto('http://localhost:5173/jobs');
  await page.waitForTimeout(3000);

  const geom = () => page.evaluate(() => {
    const v = document.querySelector('[data-board-viewport]').getBoundingClientRect();
    const w = document.querySelector('[data-board-world]').getBoundingClientRect();
    const m = /scale\(([\d.]+)\)/.exec(document.querySelector('[data-board-world]').parentElement.style.transform);
    return { vp: { l: v.left, t: v.top, r: v.right, b: v.bottom }, world: { l: w.left, t: w.top, r: w.right, b: w.bottom }, z: m ? +m[1] : 1 };
  });

  await page.mouse.move(700, 450);
  await page.keyboard.down('Control');
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(140); }
  await page.keyboard.up('Control');
  await page.waitForTimeout(400);
  const zo = await geom();
  console.log('       fully zoomed out:', JSON.stringify(zo));
  check(zo.z < 0.25, 'the ladder steps BELOW 25% on a board too wide for it', `z=${zo.z}`);
  check(zo.world.l >= zo.vp.l - 3 && zo.world.b <= zo.vp.b + 3 && zo.world.t >= zo.vp.t - 3
    && zo.world.r <= zo.vp.r + 3,
    'the ENTIRE board is on screen — desk on the left and below only', JSON.stringify(zo.world));
  check(Math.abs(zo.world.r - zo.vp.r) <= 3, 'and the board lands flush right', `right=${zo.world.r} vs ${zo.vp.r}`);

  // Back to 100% for a stable make-room measurement.
  await page.locator('button', { hasText: /^100%$/ }).first().click();
  await page.waitForTimeout(500);

  const noteAt = () => page.evaluate(() => {
    const el = document.querySelector('[data-node-id="CE-note"]');
    const r = el.getBoundingClientRect();
    const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
    const rec = (d.canvasElements ?? []).find(e => e.id === 'CE-note');
    return { screen: { x: Math.round(r.left), y: Math.round(r.top) }, stored: { x: rec.x, y: rec.y } };
  });
  const before = await noteAt();
  await page.locator('button[title="Board settings"]').click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: /^Room above$/ }).click();
  await page.waitForTimeout(900);
  const after = await noteAt();
  console.log('       make-room:', JSON.stringify({ before, after }));
  check(after.stored.y === before.stored.y + 300,
    'Room above adds a LITTLE space (300), not a screenful', `${before.stored.y} → ${after.stored.y}`);
  check(Math.abs(after.screen.x - before.screen.x) <= 2 && Math.abs(after.screen.y - before.screen.y) <= 2,
    'and nothing on screen appears to move — the board just gained space',
    JSON.stringify({ before: before.screen, after: after.screen }));
  await ctx.close();
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
