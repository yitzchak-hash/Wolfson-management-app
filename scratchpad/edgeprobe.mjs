// Does dragging a NOTE (and a multi-selection) against the screen edge pan?
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [{ id: 'G-e1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Edge Job',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 200, canvasY: 300,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' }],
    canvasElements: [
      { id: 'CE-e1', type: 'note', x: 200, y: 500, w: 180, h: 140, text: 'Push me', color: '#fef9c3' },
    ],
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2500);
const panOf = () => page.evaluate(() => {
  const vp = document.querySelector('[data-board-viewport]');
  const world = [...(vp?.querySelectorAll('div') ?? [])]
    .find(n => /matrix/.test(getComputedStyle(n).transform) && n.parentElement === vp);
  const m = new DOMMatrix(getComputedStyle(world).transform);
  return { x: Math.round(m.e), y: Math.round(m.f) };
});
const vpBox = await page.locator('[data-board-viewport]').boundingBox();
const nb = await page.locator('[data-node-id="CE-e1"]').boundingBox();
console.log('pan before:', JSON.stringify(await panOf()));
// Drag the note and HOLD it at the right edge for a moment.
await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
await page.mouse.down();
await page.mouse.move(vpBox.x + vpBox.width - 12, nb.y + nb.height / 2, { steps: 12 });
await page.waitForTimeout(1200);          // dwell at the edge
const held = await panOf();
await page.mouse.up();
await page.waitForTimeout(300);
console.log('pan while held at right edge:', JSON.stringify(held));
console.log('pan after release:', JSON.stringify(await panOf()));
await b.close();
