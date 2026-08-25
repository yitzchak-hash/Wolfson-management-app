// The Arrange feature, live: right-click ANYWHERE with a selection brings the
// "N SELECTED" menu (Copy/Cut/Paste-here/Arrange with the hover animation);
// Arrange lays the selection into the approved grid centred where it stood
// and KEEPS the selection; cut/paste lands as the tidy block centred on the
// clicked spot; and inside a group Ctrl+A → right-click → Arrange grids the
// jobs on the group's surface.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const apt = (id, name, x, y, extra = {}) => ({
    id, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {}, canvasX: x, canvasY: y,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    ...extra,
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    apartments: [
      apt('G-a', 'Cohen', 60, 240), apt('G-b', 'Levi', 620, 260),
      apt('G-c', 'Artzi', 200, 460), apt('G-d', 'Mizrahi', 640, 470),
      apt('G-p', 'Peretz', 60, 60, { boardBin: 'done', binnedAt: '2026-08-01', binX: 30, binY: 300 }),
      apt('G-q', 'Dahan', 60, 60, { boardBin: 'done', binnedAt: '2026-08-01', binX: 620, binY: 40 }),
      apt('G-r', 'Biton', 60, 60, { boardBin: 'done', binnedAt: '2026-08-01', binX: 340, binY: 180 }),
    ],
    canvasElements: [{
      id: 'CE-note', type: 'note', x: 420, y: 300, w: 165, h: 150,
      text: 'rides along', color: '#fef9c3',
    }],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3200);
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));

// ── 1 · lasso five things, right-click on EMPTY board ───────────────────────
const boxOf = async id => await page.locator(`[data-node-id="${id}"]`).boundingBox();
const a0 = await boxOf('G-a'), d0 = await boxOf('G-d');
await page.keyboard.down('Control');
await page.mouse.move(a0.x - 30, a0.y - 30);
await page.mouse.down();
await page.mouse.move(d0.x + d0.width + 30, d0.y + d0.height + 30, { steps: 8 });
await page.mouse.up();
await page.keyboard.up('Control');
await page.waitForTimeout(400);
// Right-click a spot with NOTHING under it (between the top tiles).
await page.mouse.click(a0.x + 330, a0.y - 20, { button: 'right' });
await page.waitForTimeout(400);
const menuText = await page.evaluate(() =>
  [...document.querySelectorAll('.fixed.z-50')].map(d => d.innerText).join('\n'));
check(menuText.includes('5 SELECTED'), 'right-click on EMPTY board speaks for the selection', menuText.split('\n')[0]);
check(menuText.includes('Copy (5)') && menuText.includes('Cut (5)') && menuText.includes('Arrange (5)'),
  'with Copy, Cut and Arrange rows');

// The hover animation appears on the Arrange row.
await page.locator('[data-arrange-row]').hover();
await page.waitForTimeout(300);
check(await page.locator('.arr-anim').count() === 1, 'hovering Arrange shows the little consolidation animation');

// ── 2 · Arrange lays them into the approved grid, still selected ────────────
await page.locator('[data-arrange-row]').click();
await page.waitForTimeout(800);
let d = await data();
const spots = ['G-a', 'G-b', 'G-c', 'G-d'].map(id => {
  const j = d.apartments.find(x => x.id === id);
  return { x: j.canvasX, y: j.canvasY };
});
const note = d.canvasElements.find(e => e.id === 'CE-note');
// The exact shape depends on the mix (the approved arithmetic decides);
// assert its INVARIANTS: few compact row bands, and inside a row every
// horizontal gap is exactly the approved 18px.
const all = [
  ...spots.map(s => ({ ...s, w: 215 })),
  { x: note.x, y: note.y, w: note.w },
];
const bands = [];
for (const s of all.sort((q, w) => q.y - w.y)) {
  const band = bands.find(bd => Math.abs(bd.y - s.y) < 60);
  if (band) band.items.push(s); else bands.push({ y: s.y, items: [s] });
}
check(bands.length <= 3, 'a compact block of few rows', `${bands.length} rows`);
const gapsOk = bands.every(bd => {
  const row = bd.items.sort((q, w) => q.x - w.x);
  return row.every((it, i) => i === 0 || Math.abs((it.x - (row[i - 1].x + row[i - 1].w)) - 18) <= 2);
});
check(gapsOk, 'every horizontal gap inside a row is the approved 18px',
  JSON.stringify(bands.map(bd => bd.items.map(i => i.x))));
const selCount = await page.evaluate(() =>
  ['G-a', 'G-b', 'G-c', 'G-d'].filter(id => {
    const t = document.querySelector(`[data-node-id="${id}"]`);
    return t && getComputedStyle(t).borderColor.includes('74, 168, 216');
  }).length);
check(selCount === 4, 'everything is STILL selected after Arrange', `${selCount}/4`);
check(!!note && note.x > 0, 'the note is in the block too');

// ── 3 · cut, then paste-here lands the tidy block on the click ─────────────
await page.keyboard.press('Control+x');
await page.waitForTimeout(400);
// Right-click an empty spot — the selection was cut, so the SELECTION menu
// still stands (they stay selected while in the air); use its Paste here.
const vp = await page.locator('[data-board-viewport]').boundingBox();
const px = vp.x + vp.width - 320, py = vp.y + vp.height - 260;
await page.mouse.click(px, py, { button: 'right' });
await page.waitForTimeout(400);
await page.locator('button:has-text("Paste here")').click();
await page.waitForTimeout(800);
d = await data();
const pasted = ['G-a', 'G-b', 'G-c', 'G-d'].map(id => d.apartments.find(x => x.id === id));
const minX = Math.min(...pasted.map(j => j.canvasX));
const maxX = Math.max(...pasted.map(j => j.canvasX + 215));
check(maxX - minX <= 233 * 3 + 40, 'the cut selection landed as one compact block', `width ${Math.round(maxX - minX)}`);

// ── 4 · inside a group: Ctrl+A → right-click → Arrange ─────────────────────
await page.locator('button:has-text("100%")').first().click();
await page.waitForTimeout(600);
const binBox = await boxOf('CE-bin-done');
await page.mouse.click(binBox.x + binBox.width / 2, binBox.y + binBox.height / 2);
await page.waitForTimeout(900);
check(await page.locator('.bin-window-in [data-node-id="G-p"]').count() === 1, 'the group opens');
await page.keyboard.press('Control+a');
await page.waitForTimeout(300);
const gp = await page.locator('.bin-window-in [data-node-id="G-p"]').boundingBox();
await page.mouse.click(gp.x + gp.width / 2, gp.y + gp.height / 2, { button: 'right' });
await page.waitForTimeout(400);
await page.locator('button:has-text("Arrange (3)")').click();
await page.waitForTimeout(800);
d = await data();
const binYs = [...new Set(['G-p', 'G-q', 'G-r'].map(id => d.apartments.find(x => x.id === id).binY))];
check(binYs.length <= 2, 'the group jobs grid into tidy rows', JSON.stringify(binYs));

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
