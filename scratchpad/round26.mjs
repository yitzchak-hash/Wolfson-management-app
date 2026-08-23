// Round 26: the starting corner is top-left again (board.mjs holds that
// contract) · layout history gets a real PREVIEW and a ripple summary ·
// restoring is one undo step · undoing keeps the redo stack alive.
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
  localStorage.setItem('board_default_zoom_general', '1');
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    apartments: [{
      id: 'G-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Alpha',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 400, canvasY: 300,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [
      { id: 'CE-note', type: 'note', x: 700, y: 300, w: 165, h: 150, text: 'landmark', color: '#fef9c3' },
      { id: 'CE-bin-done', type: 'bin', binKind: 'done', x: 2100, y: 24, w: 180, h: 112, text: 'Done', color: '#16a34a' },
      { id: 'CE-bin-ready', type: 'bin', binKind: 'ready', x: 2100, y: 154, w: 180, h: 112, text: 'Ready', color: '#0ea5e9' },
      { id: 'CE-bin-archive', type: 'bin', binKind: 'archive', x: 2100, y: 284, w: 180, h: 112, text: 'Archive', color: '#64748b' },
      { id: 'CE-bin-trash', type: 'bin', binKind: 'trash', x: 2100, y: 414, w: 180, h: 112, text: 'Trash', color: '#dc2626' },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3000);

const storedX = () => page.evaluate(() =>
  JSON.parse(localStorage.getItem('general_app_data')).apartments[0].canvasX);
const tileScreenX = () => page.locator('[data-node-id="G-1"]').boundingBox().then(r => Math.round(r.x));

// ── 1 · save a layout, move a tile, read the ripple ─────────────────────────
await page.locator('button[title="Board settings"]').click();
await page.waitForTimeout(400);
await page.locator('button', { hasText: /Layout history/ }).click();
await page.waitForTimeout(400);
await page.locator('button', { hasText: /^Save this arrangement$/ }).click();
await page.waitForTimeout(700);

const v = await page.evaluate(() => {
  const w = document.querySelector('[data-board-world]');
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(w.parentElement.style.transform);
  const r = document.querySelector('[data-board-viewport]').getBoundingClientRect();
  return { x: +m[1], y: +m[2], z: +m[3], left: r.left, top: r.top };
});
await page.mouse.click(v.left + v.x + (400 + 107) * v.z, v.top + v.y + (300 + 66) * v.z);
await page.waitForTimeout(400);
await page.keyboard.press('Shift+ArrowRight');       // one entry, +10
await page.waitForTimeout(800);
check(await storedX() === 410, 'the tile moved after the snapshot', String(await storedX()));

const ripple = await page.locator('[data-layout-ripple]').first().textContent();
check(/Moves 1 thing back/.test(ripple ?? '') && /Alpha/.test(ripple ?? ''),
  'the snapshot card says what restoring would do, by name', (ripple ?? '').trim());

// ── 2 · preview: a look, never a write ──────────────────────────────────────
const xNow = await tileScreenX();
await page.locator('[data-layout-preview]').first().click();
await page.waitForTimeout(500);
const xPreview = await tileScreenX();
check(xPreview === xNow - Math.round(10 * v.z),
  'previewing draws the tile at the snapshot position', `${xNow} → ${xPreview}`);
check(await storedX() === 410, 'and writes NOTHING', String(await storedX()));
check(await page.evaluate(() => !!document.querySelector('[data-layout-preview-banner]')),
  'the banner says a preview is on');
await page.locator('[data-layout-banner-back]').click();
await page.waitForTimeout(500);
check(await tileScreenX() === xNow, '“Back to now” returns to the live board', String(await tileScreenX()));
check(await storedX() === 410, 'still with nothing written');

// ── 3 · restore from the banner, then undo AND redo it ──────────────────────
await page.locator('[data-layout-preview]').first().click();
await page.waitForTimeout(400);
await page.locator('[data-layout-banner-restore]').click();
await page.waitForTimeout(800);
check(await storedX() === 400, 'Restore writes the snapshot positions', String(await storedX()));
await page.keyboard.press('Control+z');
await page.waitForTimeout(600);
check(await storedX() === 410, 'restoring is ONE undo step — Ctrl+Z puts the move back', String(await storedX()));
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(600);
check(await storedX() === 400, 'and Ctrl+Shift+Z redoes the restore — redo survived the undo', String(await storedX()));

// ── 4 · five undos leave five redos ─────────────────────────────────────────
await page.keyboard.press('Control+z');              // back to 410 for a clean run
await page.waitForTimeout(500);
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(350);
}
check(await storedX() === 460, 'five nudges recorded', String(await storedX()));
for (let i = 0; i < 5; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(350); }
check(await storedX() === 410, 'five undos walk all the way back', String(await storedX()));
for (let i = 0; i < 5; i++) { await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(350); }
check(await storedX() === 460, 'and five redos still walk all the way forward', String(await storedX()));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
