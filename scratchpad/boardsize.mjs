// The board's own size, its margins, edge-panning in all four directions, and
// the Building Progress widget's clickable, labelled cells.
import { chromium } from 'playwright';
const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}`); if (!ok) fails++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1300, height: 860 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('general_app_data')) {
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
      apartments: [{ id: 'G-b1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Corner Job',
        isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
        currentStageId: null, stageDates: {}, canvasX: 2400, canvasY: 1800,
        createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' }],
      canvasElements: [
        { id: 'CE-b1', type: 'note', x: 150, y: 300, w: 180, h: 140, text: 'Pusher', color: '#fef9c3' },
        { id: 'CE-bp', type: 'widget', widget: 'project-mini', x: 700, y: 250, w: 320, h: 220,
          text: '', color: '#ffffff', data: { projectId: 'wolfson' } },
      ],
    }));
  }
  if (!localStorage.getItem('wolfson_app_data')) {
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
      stages: [{ id: 'st1', name: 'Piping', color: '#0ea5e9', order: 1, active: true,
                 description: '', createdAt: '', updatedAt: '' }],
      buildings: [{ id: 'A1', name: 'A1', floors: 4 }],
      apartments: Array.from({ length: 12 }, (_, i) => ({
        id: `A1-${i + 1}`, buildingId: 'A1', floor: 2 + Math.floor(i / 4),
        apartmentNumber: String(i + 1), displayName: i % 3 === 0 ? 'Cohen' : '',
        isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
        currentStageId: i % 2 ? 'st1' : null, stageDates: {}, colPosition: 1, colSpan: 1,
        createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
      })),
      canvasElements: [],
    }));
  }
});
const page = await ctx.newPage();
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2600);

const world = () => page.evaluate(() => {
  const vp = document.querySelector('[data-board-viewport]');
  const w = [...(vp?.querySelectorAll('div') ?? [])]
    .find(n => /matrix/.test(getComputedStyle(n).transform) && n.parentElement === vp);
  const m = new DOMMatrix(getComputedStyle(w).transform);
  const inner = w?.querySelector('div');
  return { panX: Math.round(m.e), panY: Math.round(m.f),
           w: Math.round(w?.getBoundingClientRect().width ?? 0) };
});

// ── The board gives space back when the far tile comes in ──
const big = await world();
const tile = page.locator('[data-node-id="G-b1"]');
// Fit so the far tile is reachable, then drag it back toward the origin.
await page.locator('button[title="Zoom to fit"], button', { hasText: /^Fit$/ }).first().click().catch(() => {});
await page.waitForTimeout(600);
const tb = await tile.boundingBox();
if (tb) {
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x - 200, tb.y - 150, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(800);
}
const small = await world();
check(small.w < big.w, `the board shrank when the far tile came in (${big.w} → ${small.w})`);

// ── Edge auto-pan travels LEFT as well as right ──
await page.locator('button[title="Zoom in"]').click();
await page.waitForTimeout(300);
const vpb = await page.locator('[data-board-viewport]').boundingBox();
const note = page.locator('[data-node-id="CE-b1"]');
let nb = await note.boundingBox();
// First push right so there is somewhere to come back from.
await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
await page.mouse.down();
await page.mouse.move(vpb.x + vpb.width - 10, nb.y + nb.height / 2, { steps: 10 });
await page.waitForTimeout(900);
const atRight = await world();
// Now carry it to the LEFT edge and hold.
await page.mouse.move(vpb.x + 10, nb.y + nb.height / 2, { steps: 14 });
await page.waitForTimeout(1100);
const atLeft = await world();
await page.mouse.up();
await page.waitForTimeout(300);
check(atRight.panX < 0, `holding at the right edge panned the board (x=${atRight.panX})`);
check(atLeft.panX > atRight.panX, `holding at the LEFT edge panned it back (${atRight.panX} → ${atLeft.panX})`);

// ── Building Progress: text in the cells, and a click that travels ──
const cells = await page.evaluate(() => {
  const node = document.querySelector('[data-node-id="CE-bp"]');
  const btns = [...(node?.querySelectorAll('button[title]') ?? [])]
    .filter(b => /·/.test(b.getAttribute('title') ?? ''));
  return { n: btns.length, text: btns.slice(0, 4).map(b => b.textContent?.trim()) };
});
check(cells.n === 12, `a cell per apartment (${cells.n})`);
check(cells.text.every(t => t && /\d/.test(t)), `every cell carries its number (${JSON.stringify(cells.text)})`);
check(cells.text.some(t => /Cohen/.test(t ?? '')), 'and the family name where there is one');

// Clicking a cell switches workspace and opens that unit.
await page.locator('[data-node-id="CE-bp"] button[title*="·"]').first().click();
await page.waitForTimeout(2200);
check(page.url().includes('/project'), `the click landed on the building workspace (${new URL(page.url()).pathname})`);
const diag = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('wolfson_app_data') ?? '{}');
  return {
    drawers: document.querySelectorAll('.drawer-panel').length,
    aptIds: (d.apartments ?? []).slice(0, 3).map(a => a.id),
    aptCount: (d.apartments ?? []).length,
    active: localStorage.getItem('active_project'),
  };
});
console.log('  diagnostic:', JSON.stringify(diag));
check(diag.drawers > 0, 'and opened that apartment');

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
await b.close();
process.exit(fails ? 1 : 0);
