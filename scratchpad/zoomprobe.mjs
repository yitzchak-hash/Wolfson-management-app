// What actually happens to the world when the header − is pressed at 100%?
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: Array.from({ length: 12 }, (_, i) => ({
      id: `G-z${i}`, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: `Job ${i}`,
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 30 + (i % 4) * 240, canvasY: 80 + Math.floor(i / 4) * 160,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    })),
    canvasElements: [],
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2500);

const state = () => page.evaluate(() => {
  const vp = document.querySelector('[data-board-viewport]');
  // The world div is whichever child carries the pan/zoom matrix.
  const world = [...(vp?.querySelectorAll('div') ?? [])]
    .find(n => /matrix/.test(getComputedStyle(n).transform)
      && n.parentElement === vp);
  const t1 = document.querySelector('[data-node-id="G-z0"]')?.getBoundingClientRect();
  const vr = vp?.getBoundingClientRect();
  return {
    transform: world ? getComputedStyle(world).transform : 'none',
    vpTop: vr?.top, vpHeight: Math.round(vr?.height ?? 0),
    tile0: t1 ? { x: Math.round(t1.x), y: Math.round(t1.y) } : null,
    // Where the world's own origin lands on screen — the number that must
    // not move when the corner is pinned.
    worldOrigin: world ? (() => {
      const m = new DOMMatrix(getComputedStyle(world).transform);
      return { x: Math.round(m.e), y: Math.round(m.f), z: +m.a.toFixed(3) };
    })() : null,
  };
});

console.log('at 100%:', JSON.stringify(await state()));
await page.locator('button[title="Zoom out"]').click();
await page.waitForTimeout(400);
console.log('after −:', JSON.stringify(await state()));
await page.locator('button[title="Zoom out"]').click();
await page.waitForTimeout(400);
console.log('after − −:', JSON.stringify(await state()));
await b.close();
