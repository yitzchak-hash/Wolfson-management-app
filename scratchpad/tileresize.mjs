// A job tile must resize like every other node, and the new size must SURVIVE
// a reload — the whole point of putting it on the record rather than in state.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
// addInitScript runs on EVERY navigation, reloads included. Seeding
// unconditionally overwrites whatever the app just saved, so the reload check
// would always fail and blame the app for the harness's own doing.
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2026-08-16');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'Architect Avi', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [{
      id: 'G-tile-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Resize Me',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 120, canvasY: 120,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U-test', updatedByName: 'Architect Avi',
    }],
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2600);

const tile = page.locator('[data-node-id="G-tile-1"]');
const before = await tile.boundingBox();
console.log('before:', before && `${Math.round(before.width)}x${Math.round(before.height)}`);

// Select it first — the handles are revealed by selection, same as any node.
await tile.click({ position: { x: 60, y: 40 } });
await page.waitForTimeout(400);
const handles = await page.locator('[data-node-id="G-tile-1"] [data-resize]').count();
console.log(`resize handles on the tile: ${handles}  ${handles >= 1 ? 'PASS' : 'FAIL'}`);

const box = await tile.boundingBox();
const corner = { x: box.x + box.width - 4, y: box.y + box.height - 4 };
await page.mouse.move(corner.x, corner.y);
await page.mouse.down();
await page.mouse.move(corner.x + 90, corner.y + 60, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(700);

const after = await tile.boundingBox();
console.log('after :', after && `${Math.round(after.width)}x${Math.round(after.height)}`);
const grew = after.width > before.width + 40 && after.height > before.height + 30;
console.log(grew ? 'PASS tile grew with the drag' : 'FAIL tile did not resize');

// What actually reached the store / localStorage?
const stored = await page.evaluate(() => {
  const raw = localStorage.getItem('general_app_data');
  if (!raw) return 'NO general_app_data';
  const d = JSON.parse(raw);
  const a = (d.apartments || []).find(x => x.id === 'G-tile-1');
  return a ? { tileW: a.tileW, tileH: a.tileH, keys: Object.keys(a).length } : 'apartment not in stored data';
});
console.log('stored record:', JSON.stringify(stored));

// And it must still be that size after a reload.
await page.reload();
await page.waitForTimeout(2400);
const afterReloadStore = await page.evaluate(() => {
  const raw = localStorage.getItem('general_app_data');
  const d = raw ? JSON.parse(raw) : {};
  const a = (d.apartments || []).find(x => x.id === 'G-tile-1');
  return { inStorage: a ? { tileW: a.tileW, tileH: a.tileH } : 'missing',
           version: localStorage.getItem('general_app_version') };
});
console.log('after reload, storage says:', JSON.stringify(afterReloadStore));
const persisted = await page.locator('[data-node-id="G-tile-1"]').boundingBox();
console.log('after reload:', persisted && `${Math.round(persisted.width)}x${Math.round(persisted.height)}`);
console.log(persisted && Math.abs(persisted.width - after.width) < 3
  ? 'PASS size survived a reload' : 'FAIL size was lost on reload');
await b.close();
