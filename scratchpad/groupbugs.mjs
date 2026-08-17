// The three reported board bugs, reproduced before they are theorised about:
// 1. a multi-selection cannot be DRAGGED (only resized);
// 2. the four bins, multi-selected, cannot be resized at all;
// 3. a scribble on clear canvas does not become its own node.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2026-08-16');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [{
      id: 'G-j1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Mixed Drag Job',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 150, canvasY: 560,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U-test', updatedByName: 'A',
    }],
    canvasElements: [
      { id: 'CE-a', type: 'note', x: 150, y: 320, w: 180, h: 140, text: 'A', color: '#fef9c3' },
      { id: 'CE-b', type: 'note', x: 400, y: 320, w: 180, h: 140, text: 'B', color: '#dbeafe' },
    ],
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2600);
const box = async id => page.locator(`[data-node-id="${id}"]`).boundingBox();

// ── 1. drag a multi-selection by one member's body ──
await page.locator('[data-node-id="CE-a"]').click({ position: { x: 60, y: 60 } });
await page.keyboard.down('Control');
await page.locator('[data-node-id="CE-b"]').click({ position: { x: 60, y: 60 } });
await page.keyboard.up('Control');
await page.waitForTimeout(400);
const A0 = await box('CE-a'), B0 = await box('CE-b');
await page.mouse.move(A0.x + 90, A0.y + 70);
await page.mouse.down();
await page.mouse.move(A0.x + 90 + 120, A0.y + 70 + 80, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(600);
const A1 = await box('CE-a'), B1 = await box('CE-b');
const dA = { x: Math.round(A1.x - A0.x), y: Math.round(A1.y - A0.y) };
const dB = { x: Math.round(B1.x - B0.x), y: Math.round(B1.y - B0.y) };
console.log(`group drag: A moved ${dA.x},${dA.y}  B moved ${dB.x},${dB.y}`);
console.log(dA.x > 80 && Math.abs(dB.x - dA.x) < 5
  ? 'PASS both members dragged together'
  : 'FAIL group drag broken');

// ── 2. multi-select two bins, look for any resize handle ──
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const doneBin = page.locator('[data-node-id="CE-bin-done"]');
if (await doneBin.count()) {
  // A plain click OPENS a bin, so selecting is ctrl+click from the first one.
  await page.keyboard.down('Control');
  await doneBin.click();
  await page.locator('[data-node-id="CE-bin-ready"]').click();
  await page.keyboard.up('Control');
  await page.waitForTimeout(500);
  const groupGrip = await page.locator('[data-group-resize]').count();
  console.log(`bins multi-selected — group handle: ${groupGrip}  ${groupGrip === 1 ? 'PASS' : 'FAIL no way to resize'}`);
} else console.log('SKIP bins not found');

// ── 1b. a job + a note dragged together ──
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

{
  const J0 = await box('G-j1'), N0 = await box('CE-a');
  await page.locator('[data-node-id="G-j1"]').click({ position: { x: 60, y: 60 } });
  await page.keyboard.down('Control');
  await page.locator('[data-node-id="CE-a"]').click({ position: { x: 60, y: 60 } });
  await page.keyboard.up('Control');
  await page.waitForTimeout(400);
  await page.mouse.move(J0.x + 90, J0.y + 70);
  await page.mouse.down();
  await page.mouse.move(J0.x + 90 + 110, J0.y + 70 - 60, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const J1 = await box('G-j1'), N1 = await box('CE-a');
  const dj = { x: Math.round(J1.x - J0.x), y: Math.round(J1.y - J0.y) };
  const dn = { x: Math.round(N1.x - N0.x), y: Math.round(N1.y - N0.y) };
  console.log(`mixed drag by the JOB: job moved ${dj.x},${dj.y}  note moved ${dn.x},${dn.y}`);
  console.log(dj.x > 70 && Math.abs(dn.x - dj.x) < 5
    ? 'PASS a mixed selection drags together'
    : 'FAIL mixed selection did not drag together');
}

// ── 3. a scribble on clear canvas becomes its own node ──
await page.keyboard.press('Escape');
const before = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('general_app_data')).canvasElements.length);
await page.locator('button[title]').filter({ hasText: /^Pen$/ }).first().click();
await page.waitForTimeout(300);
// Clear space, far from notes and bins.
await page.mouse.move(760, 700);
await page.mouse.down();
for (let i = 1; i <= 14; i++) {
  await page.mouse.move(760 + i * 12, 700 + Math.sin(i / 2) * 40, { steps: 1 });
  await page.waitForTimeout(14);
}
await page.mouse.up();
await page.waitForTimeout(900);
const after = await page.evaluate(() => {
  const els = JSON.parse(localStorage.getItem('general_app_data')).canvasElements;
  const strokes = els.filter(e => e.type === 'stroke');
  return { count: els.length, strokes: strokes.length, own: strokes.filter(s => s.data && s.data.own).length };
});
console.log(`after scribble: +${after.count - before} elements, strokes=${after.strokes}, own-node strokes=${after.own}`);
console.log(after.own >= 1 ? 'PASS the drawing became its own node'
  : after.strokes >= 1 ? 'FAIL stroke saved but NOT an own node'
  : 'FAIL no stroke was saved at all');
// ── 3b. the same, with the HIGHLIGHTER, and 3c. zoomed far out ──
// The owner's screenshot showed scribbles at 25% zoom; a coordinate bug that
// only bites away from 100% is this codebase's most repeated trap.
await page.keyboard.press('Escape');
await page.locator('button[title]').filter({ hasText: /^Mark$/ }).first().click();
await page.waitForTimeout(300);
await page.mouse.move(760, 480);
await page.mouse.down();
for (let i = 1; i <= 12; i++) { await page.mouse.move(760 + i * 14, 480 + (i % 3) * 12, { steps: 1 }); await page.waitForTimeout(14); }
await page.mouse.up();
await page.waitForTimeout(800);
const mk = await page.evaluate(() => {
  const els = JSON.parse(localStorage.getItem('general_app_data')).canvasElements;
  const st = els.filter(e => e.type === 'stroke');
  return { strokes: st.length, own: st.filter(x => x.data && x.data.own).length };
});
console.log(`highlighter: strokes=${mk.strokes} own=${mk.own}  ${mk.own === mk.strokes ? 'PASS every stroke is a node' : 'FAIL marker stroke not a node'}`);

// zoom far out and draw — the board reads its per-machine default zoom from
// localStorage at mount, which is steadier than aiming at the '−' button.
await page.evaluate(() => localStorage.setItem('board_default_zoom_general', '0.25'));
await page.reload();
await page.waitForTimeout(2400);
const beforeZoomDraw = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('general_app_data')).canvasElements.filter(e => e.type === 'stroke').length);
await page.locator('button[title]').filter({ hasText: /^Pen$/ }).first().click();
await page.waitForTimeout(300);
// At 25% this SMALL test board occupies only the top-left corner of the
// screen — a press outside the shrunken world div never reaches the canvas.
// (The owner's real board fills the screen at 25%; the test's does not.)
await page.mouse.move(150, 250);
await page.mouse.down();
for (let i = 1; i <= 12; i++) { await page.mouse.move(150 + i * 8, 250 + (i % 2) * 6, { steps: 1 }); await page.waitForTimeout(14); }
await page.mouse.up();
await page.waitForTimeout(800);
const zm = await page.evaluate(() => {
  const els = JSON.parse(localStorage.getItem('general_app_data')).canvasElements;
  const st = els.filter(e => e.type === 'stroke');
  return { strokes: st.length, own: st.filter(x => x.data && x.data.own).length };
});
console.log(`zoomed out: strokes ${beforeZoomDraw} -> ${zm.strokes}, own=${zm.own}  ${
  zm.strokes > beforeZoomDraw && zm.own === zm.strokes ? 'PASS drawn and a node at 25%' : 'FAIL at low zoom'}`);
await page.locator('button[title]').filter({ hasText: /^Pen$/ }).first().click();
await page.evaluate(() => localStorage.setItem('board_default_zoom_general', '1'));
await page.reload();
await page.waitForTimeout(2400);

// ── 3d. ink across a TILE must not block the tile ──
// The reason the old only-if-clear rule existed. With every stroke a node, the
// tile has to stay clickable THROUGH the drawing's box.
await page.keyboard.press('Escape');
await page.locator('button[title]').filter({ hasText: /^Pen$/ }).first().click();
await page.waitForTimeout(250);
const jb = await box('G-j1');
await page.mouse.move(jb.x - 30, jb.y + 40);
await page.mouse.down();
for (let i = 1; i <= 10; i++) { await page.mouse.move(jb.x - 30 + i * ((jb.width + 60) / 10), jb.y + 40 + (i % 2) * 10, { steps: 1 }); await page.waitForTimeout(14); }
await page.mouse.up();
await page.waitForTimeout(700);
await page.locator('button[title]').filter({ hasText: /^Pen$/ }).first().click();  // put the pen down
await page.waitForTimeout(250);
await page.locator('[data-node-id="G-j1"]').click({ position: { x: 60, y: 40 }, force: false });
await page.waitForTimeout(400);
const tileSelected = await page.evaluate(() => {
  const t = document.querySelector('[data-node-id="G-j1"]');
  return t ? getComputedStyle(t).borderColor.includes('74, 168, 216') || (t.getAttribute('style') || '').includes('74a8d8') || (t.getAttribute('style') || '').includes('#4aa8d8') : false;
});
console.log(tileSelected
  ? 'PASS a tile under a drawing still takes the click'
  : 'FAIL the drawing blocks the tile beneath it');
await b.close();
