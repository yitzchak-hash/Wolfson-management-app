// The job tile resizes from its corner, remembers its size, shows the hint,
// and 0 puts it back. Plus: only ONE Drive icon per tile, and the margin
// keeps a dropped tile off the edge.
import { chromium } from 'playwright';
const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}`); if (!ok) fails++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [
      { id: 'G-r1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Resize Me',
        driveLink: 'https://drive.google.com/drive/folders/abc',
        isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
        currentStageId: null, stageDates: {}, canvasX: 120, canvasY: 260,
        createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' },
    ],
    canvasElements: [],
  }));
});
const page = await ctx.newPage();
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2500);

const tile = page.locator('[data-node-id="G-r1"]');
const stored = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  const a = (d.apartments ?? []).find(x => x.id === 'G-r1');
  return { w: a?.tileW ?? null, h: a?.tileH ?? null, x: a?.canvasX, y: a?.canvasY };
});

// One Drive icon, not two.
const drives = await tile.locator('svg').evaluateAll(ns => ns.length);
const driveLinks = await tile.locator('a[title]').count();
check(driveLinks === 1, `one Drive link on the tile (${driveLinks} link buttons)`);

// The corner handle exists and resizes.
await tile.hover();
await page.waitForTimeout(300);
const handle = tile.locator('[data-resize]');
check(await handle.count() === 1, 'the tile has a corner resize handle');
const box0 = await tile.boundingBox();
await page.mouse.move(box0.x + box0.width - 4, box0.y + box0.height - 4);
await page.mouse.down();
await page.mouse.move(box0.x + box0.width + 90, box0.y + box0.height + 50, { steps: 10 });
await page.waitForTimeout(200);
const hint = await page.getByText(/press 0 to reset/).count();
check(hint > 0, 'the resize hint says press 0 to reset');
await page.mouse.up();
await page.waitForTimeout(500);
const after = await stored();
check((after.w ?? 0) > 260 && (after.h ?? 0) > 160, `the new size is stored (${after.w}×${after.h})`);
const box1 = await tile.boundingBox();
check(Math.abs(box1.width - after.w) < 3, 'the tile draws at its stored size');

// 0 mid-gesture puts it back.
await tile.hover();
await page.waitForTimeout(250);
const box2 = await tile.boundingBox();
await page.mouse.move(box2.x + box2.width - 4, box2.y + box2.height - 4);
await page.mouse.down();
await page.mouse.move(box2.x + box2.width + 40, box2.y + box2.height + 40, { steps: 6 });
await page.keyboard.press('0');
await page.waitForTimeout(300);
await page.mouse.up();
await page.waitForTimeout(500);
const reset = await stored();
check(reset.w === null && reset.h === null, `0 puts the tile back to the default (${reset.w}×${reset.h})`);

// The margin keeps a dropped tile off the very edge.
const b3 = await tile.boundingBox();
await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2);
await page.mouse.down();
await page.mouse.move(b3.x - 400, b3.y - 400, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(600);
const pushed = await stored();
check(pushed.x >= 28 && pushed.y >= 28, `the margin holds it off the edge (${pushed.x},${pushed.y})`);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
await b.close();
process.exit(fails ? 1 : 0);
