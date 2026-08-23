// Round 21: a Building Progress square drags onto the board as a UNIT CARD ·
// the drag shows a ghost under the hand · the card travels to its workspace.
// (The cloud-merge root cause is proven separately in mergeproof.mjs, against
// the Firestore emulator — it cannot be seen from a browser harness.)
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (!localStorage.getItem('wolfson_app_data')) {
    // A little Wolfson snapshot, so Building Progress has units to draw and
    // the unit card has something to resolve.
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      stages: [{ id: 'ST-p', name: 'Piping', color: '#0ea5e9', order: 1, active: true }],
      apartments: [
        { id: 'A1-1', buildingId: 'A1', floor: 2, apartmentNumber: '1', displayName: 'Artzi',
          isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
          currentStageId: 'ST-p', stageDates: {}, address: 'Wolfson 1',
          createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' },
        { id: 'A1-2', buildingId: 'A1', floor: 2, apartmentNumber: '2', displayName: 'Levi',
          isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
          currentStageId: null, stageDates: {},
          createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' },
      ],
      buildings: [{ id: 'A1', name: 'A1' }],
    }));
  }
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [],
    apartments: [
      { id: 'G-b0', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Board job',
        isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
        currentStageId: null, stageDates: {}, canvasX: 170, canvasY: 150,
        createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' },
    ],
    canvasElements: [
      // Building Progress, pointed at Wolfson.
      { id: 'CE-bp', type: 'widget', widget: 'project-mini',
        x: 170, y: 360, w: 300, h: 260, text: '', color: '#ffffff',
        data: { projectId: 'wolfson' } },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);

// ── 1 · the widget draws Wolfson's units ────────────────────────────────────
const cell = page.locator('[data-node-id="CE-bp"] button', { hasText: 'Artzi' }).first();
await cell.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
const cb = await cell.boundingBox();
check(!!cb, 'Building Progress draws the Wolfson unit');

// ── 2 · dragging it out shows a GHOST under the hand ────────────────────────
const drop = { x: 800, y: 700 };
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
await page.mouse.down();
let ghostSeen = '';
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(
    cb.x + cb.width / 2 + (drop.x - cb.x - cb.width / 2) * (i / 8),
    cb.y + cb.height / 2 + (drop.y - cb.y - cb.height / 2) * (i / 8));
  await page.waitForTimeout(35);
  if (i === 4) {
    ghostSeen = await page.evaluate(() => {
      const g = [...document.querySelectorAll('div')].find(d =>
        d.style.position === 'fixed' && d.style.pointerEvents === 'none'
        && d.style.zIndex === '9999' && d.textContent);
      return g ? g.textContent : '';
    });
  }
}
check(!!ghostSeen, 'a ghost card follows the hand during the drag', ghostSeen);
await page.mouse.up();
await page.waitForTimeout(800);
check(await page.evaluate(() =>
  ![...document.querySelectorAll('div')].some(d => d.style.zIndex === '9999' && d.style.position === 'fixed')),
  'and it is gone after the release');

// ── 3 · a UNIT CARD landed on the board ─────────────────────────────────────
const stored = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  return (d.canvasElements ?? []).filter(e => e.widget === 'unit-card')
    .map(e => ({ id: e.id, x: e.x, y: e.y, data: e.data }));
});
console.log('       unit cards:', JSON.stringify(stored));
check(stored.length === 1, 'the drop created exactly one unit card', String(stored.length));
check(stored[0]?.data?.projectId === 'wolfson' && stored[0]?.data?.aptId === 'A1-1',
  'and it points at the dragged unit', JSON.stringify(stored[0]?.data));
// By the stored card's OWN id — a loose text match found the Building
// Progress widget first, whose text also says WOLFSON and Artzi.
const cardText = await page.evaluate(id => {
  const el = document.querySelector(`[data-node-id="${id}"]`);
  return el ? (el.textContent || '').slice(0, 80) : '';
}, stored[0]?.id ?? 'none');
check(!!cardText, 'the card is drawn: workspace, name, stage', cardText);
check(/Piping/.test(cardText), 'including the unit\'s stage from the snapshot');

// ── 4 · clicking the card travels to Wolfson and opens the unit ─────────────
const card = page.locator('[data-node-id] button', { hasText: 'Artzi' }).last();
await card.click();
await page.waitForTimeout(2500);
const where = await page.evaluate(() => ({
  path: location.pathname,
  active: localStorage.getItem('active_project'),
  drawer: document.querySelectorAll('.drawer-panel').length,
}));
console.log('       after click:', JSON.stringify(where));
check(where.path === '/project' && where.active === 'wolfson',
  'clicking it switches to the unit\'s own workspace', JSON.stringify(where));
check(where.drawer > 0, 'and opens that unit');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
