// The two audit leftovers: the Keys panel must be draggable like every other
// floating panel, and a pinned title must be movable at all.
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
    canvasElements: [
      { id: 'CE-title-1', type: 'title', pinned: true, x: 300, pinTop: 90,
        y: 0, w: 200, h: 40, text: 'Pinned Title', color: '#0f172a', fontSize: 30, fontWeight: 800 },
      { id: 'CE-note-1', type: 'note', x: 200, y: 300, w: 165, h: 150, text: 'A note', color: '#fef9c3' },
    ],
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2600);

// ── the Keys panel ──
await page.locator('button[title]').filter({ hasText: /^Keys$/ }).first().click().catch(() => {});
await page.waitForTimeout(600);
const keys = page.locator('text=CONTROLS').first();
if (await keys.count()) {
  const panel = keys.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  const before = await panel.boundingBox();
  const grip = panel.locator('[style*="touch-action"], .cursor-grab').first();
  const gb = await grip.boundingBox().catch(() => null);
  if (gb) {
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await page.mouse.down();
    await page.mouse.move(gb.x - 220, gb.y + 160, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const after = await panel.boundingBox();
    const moved = Math.abs(after.x - before.x) > 80 || Math.abs(after.y - before.y) > 60;
    console.log(`Keys panel: ${Math.round(before.x)},${Math.round(before.y)} -> ${Math.round(after.x)},${Math.round(after.y)}  ${moved ? 'PASS draggable' : 'FAIL did not move'}`);
  } else console.log('Keys panel: FAIL no grip found');
} else console.log('Keys panel: FAIL panel did not open');

// ── the pinned title ──
const title = page.locator('text=Pinned Title').first();
const tb = await title.boundingBox();
console.log('pinned title at:', tb && `${Math.round(tb.x)},${Math.round(tb.y)}`);
await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
await page.mouse.down();
await page.mouse.move(tb.x + tb.width / 2 + 150, tb.y + tb.height / 2 + 70, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(600);
const tb2 = await page.locator('text=Pinned Title').first().boundingBox();
console.log('pinned title now:', tb2 && `${Math.round(tb2.x)},${Math.round(tb2.y)}`);
const tmoved = tb2 && Math.abs(tb2.x - tb.x) > 100 && Math.abs(tb2.y - tb.y) > 50;
console.log(tmoved ? 'PASS pinned title moves in both axes' : 'FAIL pinned title did not move');

// ...and it must STILL be pinned: panning the board moves it sideways only.
const yBefore = (await page.locator('text=Pinned Title').first().boundingBox()).y;
await page.mouse.move(900, 500);
await page.mouse.down({ button: 'middle' });
await page.mouse.move(760, 380, { steps: 10 });
await page.mouse.up({ button: 'middle' });
await page.waitForTimeout(400);
const after = await page.locator('text=Pinned Title').first().boundingBox();
console.log(Math.abs(after.y - yBefore) < 2
  ? 'PASS still pinned — panning does not move it vertically'
  : `FAIL pinning broke (y ${Math.round(yBefore)} -> ${Math.round(after.y)})`);

// ── a note takes a voice memo ──
const mics = await page.locator('[data-node-id="CE-note-1"] svg.lucide-mic, [data-node-id="CE-note-1"] svg[class*="mic"]').count();
console.log(`note mic control: ${mics}  ${mics >= 1 ? 'PASS' : 'FAIL'}`);
await b.close();
