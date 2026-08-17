// Shift locks the shape; a multi-selection gets ONE handle that scales the
// whole arrangement; and a job tile is no longer resizable at all.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2026-08-16');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'Architect Avi', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [{
      id: 'G-tile-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'A Job',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 700, canvasY: 500,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U-test', updatedByName: 'Architect Avi',
    }],
    canvasElements: [
      { id: 'CE-a', type: 'note', x: 150, y: 150, w: 200, h: 160, text: 'A', color: '#fef9c3' },
      { id: 'CE-b', type: 'note', x: 400, y: 150, w: 200, h: 160, text: 'B', color: '#dbeafe' },
    ],
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2600);
const box = async id => page.locator(`[data-node-id="${id}"]`).boundingBox();

// ── 1. job tiles are NOT resizable any more ──
await page.locator('[data-node-id="G-tile-1"]').click({ position: { x: 60, y: 40 } });
await page.waitForTimeout(400);
const jobHandles = await page.locator('[data-node-id="G-tile-1"] [data-resize]').count();
console.log(`job tile resize handles: ${jobHandles}  ${jobHandles === 0 ? 'PASS (dropped)' : 'FAIL still resizable'}`);

// ── 2. shift locks the aspect ratio of a single node ──
await page.locator('[data-node-id="CE-a"]').click({ position: { x: 40, y: 40 } });
await page.waitForTimeout(300);
const a0 = await box('CE-a');
const r0 = a0.width / a0.height;
const c = { x: a0.x + a0.width - 3, y: a0.y + a0.height - 3 };
await page.mouse.move(c.x, c.y);
await page.mouse.down();
await page.keyboard.down('Shift');
await page.mouse.move(c.x + 200, c.y + 20, { steps: 14 });   // mostly sideways
await page.mouse.up();
await page.keyboard.up('Shift');
await page.waitForTimeout(600);
const a1 = await box('CE-a');
const r1 = a1.width / a1.height;
console.log(`ratio ${r0.toFixed(3)} -> ${r1.toFixed(3)}, grew ${Math.round(a1.width - a0.width)}px wide`);
console.log(Math.abs(r1 - r0) < 0.06 && a1.width > a0.width + 80
  ? 'PASS shift kept the shape while growing' : 'FAIL shift did not lock the ratio');

// ── 3. one handle for a multi-selection, scaling the whole arrangement ──
await page.locator('[data-node-id="CE-a"]').click({ position: { x: 40, y: 40 } });
await page.keyboard.down('Control');
await page.locator('[data-node-id="CE-b"]').click({ position: { x: 40, y: 40 } });
await page.keyboard.up('Control');
await page.waitForTimeout(500);
// The GROUP handle specifically — a node's own corner also carries
// cursor-se-resize, so counting that selector counts the wrong thing.
const grips = await page.locator('[data-group-resize]').count();
const perNode = await page.locator('[data-node-id="CE-a"] [data-resize]').count();
console.log(`per-node handles while grouped: ${perNode}  ${perNode === 0 ? 'PASS hidden' : 'FAIL still shown'}`);
console.log(`group handles visible: ${grips}  ${grips === 1 ? 'PASS exactly one' : 'FAIL'}`);

await page.screenshot({ path: 'scratchpad/shot-group-sel.png' });
const A0 = await box('CE-a'), B0 = await box('CE-b');
const gapBefore = B0.x - (A0.x + A0.width);
const grip = await page.locator('[data-group-resize]').first().boundingBox();
await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
await page.mouse.down();
await page.mouse.move(grip.x + 180, grip.y + 120, { steps: 16 });
await page.mouse.up();
await page.waitForTimeout(700);
const A1 = await box('CE-a'), B1 = await box('CE-b');
const gapAfter = B1.x - (A1.x + A1.width);
console.log(`A ${Math.round(A0.width)}->${Math.round(A1.width)}  B ${Math.round(B0.width)}->${Math.round(B1.width)}  gap ${Math.round(gapBefore)}->${Math.round(gapAfter)}`);
// The SPACING must scale with them, not stay put — that is what makes it one
// object rather than two things that happened to grow. Compare the distance
// between their left edges, which is positive whatever the overlap.
const spanBefore = B0.x - A0.x, spanAfter = B1.x - A1.x;
console.log(`left-edge span ${Math.round(spanBefore)} -> ${Math.round(spanAfter)}`);
console.log(A1.width > A0.width + 20 && B1.width > B0.width + 20 && spanAfter > spanBefore + 20
  ? 'PASS both grew and the arrangement scaled with them'
  : 'FAIL group resize did not scale both');
// ── the hint, and 0 resetting to the shipped size ──
// Clear the group selection FIRST. Left over from the previous step, CE-b is
// still part of a group, so its own handles are hidden and the corner grab
// lands on the node and moves it — which reads as "resize is broken".
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const N0 = await box('CE-b');
await page.locator('[data-node-id="CE-b"]').click({ position: { x: 40, y: 40 } });
await page.waitForTimeout(300);
const nb = await box('CE-b');
await page.mouse.move(nb.x + nb.width - 3, nb.y + nb.height - 3);
await page.mouse.down();
await page.mouse.move(nb.x + nb.width + 160, nb.y + nb.height + 120, { steps: 12 });
await page.waitForTimeout(250);
// getByText with a substring — a regex text engine matched nothing here.
const hint = await page.getByText('press 0 for the default size', { exact: false }).count();
console.log(`resize hint shown while dragging: ${hint}  ${hint >= 1 ? 'PASS' : 'FAIL'}`);
await page.screenshot({ path: 'scratchpad/shot-resize-hint.png' });
await page.keyboard.press('0');
await page.waitForTimeout(600);
await page.mouse.up();
await page.waitForTimeout(500);
const N1 = await box('CE-b');
console.log(`after pressing 0: ${Math.round(N1.width)}x${Math.round(N1.height)} (note default is 165x150)`);
console.log(Math.abs(N1.width - 165) < 6 && Math.abs(N1.height - 150) < 6
  ? 'PASS 0 reset it to the shipped size' : 'FAIL 0 did not reset');

await b.close();
