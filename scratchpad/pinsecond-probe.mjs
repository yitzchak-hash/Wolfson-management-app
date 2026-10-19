// A job's second tile (no "ghost" wording anywhere) and a tile carried to a
// pin board that sits ABOVE it in z — owner, 2026-10-19. No real names.
import { chromium } from 'playwright';
const APP = process.env.APP ?? 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const sun = new Date(); sun.setHours(0, 0, 0, 0); sun.setDate(sun.getDate() - sun.getDay());
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const job = (i, x, y, extra = {}) => ({
    id: `G-s${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: `Second test ${i}`, address: 'Somewhere 1',
    isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
    currentStageId: 'gs1', stageDates: {}, canvasX: x, canvasY: y,
    contentUpdatedAt: '2026-08-10T09:00:00.000Z',
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', ...extra,
  });
  const people = Array.from({ length: 9 }, (_, i) => `c:C-${i}`);
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    contractors: people.map((p, i) => ({ id: p.slice(2), name: `Worker ${i}`, category: 'ac', token: `t${i}`, active: true, createdAt: '2026-01-01' })),
    stages: [{ id: 'gs1', name: 'AC installation', color: '#0ea5e9', order: 1, active: true, projectId: 'general', description: '', createdAt: '', updatedAt: '' }],
    apartments: [job(1, 60, 300), job(2, 60, 520, { ghosts: [{ x: 60, y: 720 }] })],
    canvasElements: [
      // A short notebook whose lower rows scroll out of sight — straight onto
      // the pin board drawn beneath it.
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 420, y: 200, w: 900, h: 260, text: '', color: '#fff',
        z: 6, data: { people, firstWeek: iso(sun), weekCount: 1, span: 5, weekView: 'all' } },
      // Placed later than everything, so its z climbs past the old 20.
      { id: 'CE-pins', type: 'widget', widget: 'pin-board', x: 420, y: 480, w: 620, h: 380, text: '', color: '#fff', z: 60, data: {} },
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 3000, y: 3000, w: 200, h: 120, text: '', color: '#fff', data: {} },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
page.on('dialog', d => d.accept());
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3600);
const stored = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  const pb = (d.canvasElements ?? []).find(e => e.id === 'CE-pins');
  return { pins: pb?.data?.pins ?? [], jobs: Object.fromEntries((d.apartments ?? []).map(a => [a.id, { held: a.inNotebook ?? null, ghosts: a.ghosts ?? [] }])) };
});
const mid = async loc => { const r = await loc.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const carry = async (from, to, during) => {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 14 });
  await page.waitForTimeout(150);
  if (during) await during(to);
  await page.mouse.up(); await page.waitForTimeout(600);
};

// 1 · no "ghost" word on the second tile
{
  const second = page.locator('[data-node-id="G-s2"][data-ghost]');
  check(await second.count() === 1, 'the job has its second tile on the board');
  check(!/ghost/i.test(await second.innerText()), 'the second tile carries no "ghost" word');
}
// 2 · the plain tile, carried over the pin board, is drawn ON TOP and pins
{
  const cork = page.locator('[data-pin-cork]');
  const c = await mid(cork);
  // A point on the cork BELOW the notebook (which is hidden notebook rows' territory).
  const target = { x: c.x - 120, y: c.y + 60 };
  await carry(await mid(page.locator('[data-node-id="G-s1"]:not([data-ghost])')), target, async to => {
    const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-node-id]')?.getAttribute('data-node-id'), to);
    check(top === 'G-s1', 'a tile in the hand is drawn over the pin board', String(top));
  });
  const s = await stored();
  check(s.pins.some(p => p.jobId === 'G-s1'), 'the plain tile is pinned', JSON.stringify(s.pins));
  check(s.jobs['G-s1'].held === 'CE-pins', 'and the board holds it');
  check(await page.locator('[data-task-dialog], [data-planner-task-dialog]').count() === 0, 'no notebook dialog opened from a hidden square');
}
// 3 · the SECOND tile, carried over, pins too — the job's own tile stays
{
  const cork = page.locator('[data-pin-cork]');
  const c = await mid(cork);
  await carry(await mid(page.locator('[data-node-id="G-s2"][data-ghost]')), { x: c.x + 140, y: c.y + 40 });
  const s = await stored();
  check(s.pins.some(p => p.jobId === 'G-s2'), 'the second tile is pinned', JSON.stringify(s.pins.map(p => p.jobId)));
  check(s.jobs['G-s2'].ghosts.length === 0, 'the carried tile left the board');
  check(s.jobs['G-s2'].held === null, 'the job is not taken off the board');
  check(await page.locator('[data-node-id="G-s2"]:not([data-ghost])').count() === 1, "the job's own tile is still on the board");
  check(await page.locator('[data-pin-card="G-s2"]').count() === 1, 'the pin is drawn on the cork');
}
// 4 · Add existing says nothing about ghosts
{
  await page.getByRole('button', { name: /add job/i }).first().click();
  await page.waitForTimeout(400);
  const pick = page.locator('[data-add-mode-pick="existing"]');
  if (await pick.count()) { await pick.click(); await page.waitForTimeout(300); }
  await page.locator('[data-add-existing-search]').fill('Second');
  await page.waitForTimeout(400);
  const txt = await page.locator('[data-add-existing]').innerText();
  check(!/ghost/i.test(txt), 'Add existing never says "ghost"');
  check(await page.locator('[data-add-existing] svg.lucide-ghost').count() === 0, 'and wears no ghost icon');
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
