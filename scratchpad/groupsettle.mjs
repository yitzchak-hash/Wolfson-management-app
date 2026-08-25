// A multi-selection lands as ONE RIGID PIECE: dragging a spread selection so
// its upper member crosses the chrome's keep-clear line used to clamp that
// member alone on mouse-up — the group tore, tiles "jumping there one by
// one". Now one shared correction moves the whole selection together and the
// members' relative offsets survive the drop exactly.
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
  const apt = (id, name, x, y) => ({
    id, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {}, canvasX: x, canvasY: y,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    // One high, one low — 300 world units apart vertically.
    apartments: [apt('G-hi', 'Cohen', 300, 260), apt('G-lo', 'Levi', 300, 560)],
    canvasElements: [{
      id: 'CE-note', type: 'note', x: 620, y: 300, w: 165, h: 150,
      text: 'note rides along', color: '#fef9c3',
    }],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3000);
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));

// Lasso all three (ctrl+drag is the lasso).
const vp = await page.locator('[data-board-viewport]').boundingBox();
const box = async id => await page.locator(`[data-node-id="${id}"]`).boundingBox();
const hi0 = await box('G-hi'), lo0 = await box('G-lo'), no0 = await box('CE-note');
await page.keyboard.down('Control');
await page.mouse.move(hi0.x - 40, hi0.y - 40);
await page.mouse.down();
await page.mouse.move(no0.x + no0.width + 40, lo0.y + lo0.height + 40, { steps: 8 });
await page.mouse.up();
await page.keyboard.up('Control');
await page.waitForTimeout(400);

// Drag the LOWER tile far UP, so the upper members cross the chrome band.
const from = { x: lo0.x + lo0.width / 2, y: lo0.y + lo0.height / 2 };
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(from.x + 40, from.y - 150, { steps: 6 });
// MID-DRAG: every carried member must be moving together, live.
const mid = { hi: await box('G-hi'), lo: await box('G-lo'), no: await box('CE-note') };
check(Math.abs((mid.lo.y - mid.hi.y) - (lo0.y - hi0.y)) < 3
  && Math.abs(mid.hi.y - hi0.y) > 80,
  'mid-drag: all carried members move together in real time',
  `hi moved ${Math.round(hi0.y - mid.hi.y)}px up`);
await page.mouse.move(from.x + 40, from.y - 320, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(700);

const d = await data();
const hi = d.apartments.find(a => a.id === 'G-hi');
const lo = d.apartments.find(a => a.id === 'G-lo');
const no = d.canvasElements.find(e => e.id === 'CE-note');
// The relative offsets survive EXACTLY (±1px of rounding): the chrome shoved
// the whole group down together instead of clamping the top member alone.
check(Math.abs((lo.canvasY - hi.canvasY) - 300) <= 2,
  'the two tiles keep their exact spacing through the clamped drop',
  `dy ${lo.canvasY - hi.canvasY}`);
check(Math.abs((no.y - hi.canvasY) - (300 - 260)) <= 2,
  'the note kept its offset too — jobs and nodes settle as one piece',
  `note-hi dy ${no.y - hi.canvasY}`);
// World y is measured below the pinned chrome line (the pan holds that band
// open), so the settle floor is the board MARGIN (28) — not a screen offset.
check(hi.canvasY >= 27, 'and the group rests on the settle floor, not past it', `hi y ${hi.canvasY}`);

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
