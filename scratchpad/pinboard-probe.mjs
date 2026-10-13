// The pin board (owner, 2026-10-13): a cork board with a handwritten title;
// jobs dragged onto it are PINNED there, move about inside it, come off onto
// the board again, and handwritten notes can be pinned beside them.
// No real client family names.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
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
  const job = (i, x, y) => ({
    id: `G-p${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: `Pin test job ${i}`, address: 'Somewhere 1',
    isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
    currentStageId: 'gs1', stageDates: {}, canvasX: x, canvasY: y,
    contentUpdatedAt: '2026-08-10T09:00:00.000Z',
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'gs1', name: 'AC installation', color: '#0ea5e9', order: 1, active: true, projectId: 'general', description: '', createdAt: '', updatedAt: '' }],
    apartments: [job(1, 60, 260), job(2, 60, 460), job(3, 60, 660)],
    canvasElements: [
      { id: 'CE-pins', type: 'widget', widget: 'pin-board', x: 520, y: 220, w: 520, h: 360, text: '', color: '#fff', data: {} },
      { id: 'CE-list', type: 'widget', widget: 'job-list', x: 1120, y: 220, w: 235, h: 300, text: '', color: '#fff', data: {} },
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
  return {
    pins: pb?.data?.pins ?? [], title: pb?.data?.title,
    jobs: Object.fromEntries((d.apartments ?? []).map(a => [a.id, { held: a.inNotebook ?? null, x: a.canvasX, y: a.canvasY }])),
  };
});
const cork = page.locator('[data-pin-cork]');
const boxOf = async loc => { const r = await loc.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, r }; };
const drag = async (from, to, steps = 14) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(500);
};

// ── 1 · the board stands, title in handwriting ─────────────────────────
{
  check(await cork.count() === 1, 'the pin board is on the board');
  const font = await page.locator('[data-pin-title]').evaluate(n => getComputedStyle(n).fontFamily);
  check(/Caveat/.test(font), 'its title is in a handwriting face', font);
  check(/Drag jobs here/.test(await cork.textContent()), 'an empty board says what it is for');
}

// ── 2 · a tile dragged onto the cork is pinned there ───────────────────
{
  const t = await boxOf(page.locator('[data-node-id="G-p1"]'));
  const c = await boxOf(cork);
  await drag(t, { x: c.x - 80, y: c.y + 20 });
  const s = await stored();
  check(s.pins.length === 1 && s.pins[0].jobId === 'G-p1', 'the job is pinned', JSON.stringify(s.pins));
  check(s.jobs['G-p1'].held === 'CE-pins', 'the board holds it (it left the main board)');
  check(await page.locator('[data-node-id="G-p1"]').count() === 0, 'its tile is gone from the board');
  const card = page.locator('[data-pin-card="G-p1"]');
  check(await card.count() === 1, 'a pinned card shows on the cork');
  check(/Pin test job 1/.test(await card.textContent()), 'the card names the job');
  const cb = await card.boundingBox();
  check(Math.abs(cb.x + cb.width / 2 - (c.x - 80)) < 40, 'pinned where the hand let go', `${Math.round(cb.x + cb.width / 2)} vs ${Math.round(c.x - 80)}`);
}

// ── 3 · moving a pin about inside the cork ─────────────────────────────
{
  const before = (await stored()).pins[0];
  const p = await boxOf(page.locator('[data-pin-card="G-p1"]'));
  await drag({ x: p.x, y: p.y + 10 }, { x: p.x + 140, y: p.y + 50 });
  const after = (await stored()).pins[0];
  check(after.x > before.x + 0.15 && after.y > before.y, 'the pin moved inside the board', `${before.x.toFixed(2)},${before.y.toFixed(2)} → ${after.x.toFixed(2)},${after.y.toFixed(2)}`);
  check((await stored()).jobs['G-p1'].held === 'CE-pins', 'and is still pinned');
}

// ── 4 · a press without moving opens the job ───────────────────────────
{
  const p = await boxOf(page.locator('[data-pin-card="G-p1"]'));
  await page.mouse.click(p.x, p.y + 10);
  await page.waitForTimeout(700);
  check(await page.locator('.drawer-panel').count() >= 1, 'a click on a pinned card opens the job');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}

// ── 5 · dragged off the cork, it lands back on the board ───────────────
{
  const p = await boxOf(page.locator('[data-pin-card="G-p1"]'));
  await drag({ x: p.x, y: p.y + 10 }, { x: 260, y: 860 });
  const s = await stored();
  check(s.pins.length === 0, 'the pin is gone from the board', JSON.stringify(s.pins));
  check(s.jobs['G-p1'].held === null, 'the job is not held any more');
  check(await page.locator('[data-node-id="G-p1"]').count() === 1, 'its tile is back on the board');
}

// ── 6 · a list row pins too, and the × takes it off ────────────────────
{
  const row = page.locator('[data-node-id="CE-list"] button', { hasText: 'Pin test job 2' }).first();
  check(await row.count() === 1, 'the job list shows job 2');
  const r = await boxOf(row);
  const c = await boxOf(cork);
  await drag(r, { x: c.x + 60, y: c.y });
  let s = await stored();
  check(s.pins.some(p => p.jobId === 'G-p2') && s.jobs['G-p2'].held === 'CE-pins', 'a list row dropped on the cork is pinned', JSON.stringify(s.pins));
  const card = page.locator('[data-pin-card="G-p2"]');
  await card.hover();
  await page.waitForTimeout(250);
  await card.locator('[data-pin-remove]').click();
  await page.waitForTimeout(500);
  s = await stored();
  check(!s.pins.some(p => p.jobId === 'G-p2') && s.jobs['G-p2'].held === null, 'the × takes it off and frees the job');
}

// ── 7 · a handwritten note, and the title ──────────────────────────────
{
  await page.locator('[data-pin-add-note]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-pin-note-input]').fill('Waiting for the permit');
  await page.locator('[data-pin-title]').dblclick().catch(() => {});
  await page.waitForTimeout(400);
  let s = await stored();
  check(s.pins.some(p => p.text === 'Waiting for the permit'), 'a note is pinned with its words', JSON.stringify(s.pins));
  const nf = await page.locator('[data-pin-note-text]').first().evaluate(n => getComputedStyle(n).fontFamily);
  check(/Caveat/.test(nf), 'the note is in handwriting');
  const ti = page.locator('[data-pin-title-input]');
  if (!(await ti.count())) { await page.locator('[data-pin-title]').dblclick(); await page.waitForTimeout(300); }
  await page.locator('[data-pin-title-input]').fill('Waiting on the client');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  s = await stored();
  check(s.title === 'Waiting on the client', 'the title is written by double-click', String(s.title));
  check(/Waiting on the client/.test(await page.locator('[data-pin-title]').textContent()), 'and shows in handwriting');
}

// ── 8 · removing the board lets its jobs go ────────────────────────────
{
  const t = await boxOf(page.locator('[data-node-id="G-p3"]'));
  const c = await boxOf(cork);
  await drag(t, { x: c.x + 100, y: c.y + 60 });
  check((await stored()).jobs['G-p3'].held === 'CE-pins', 'job 3 pinned');
  const node = page.locator('[data-node-id="CE-pins"]');
  const nb = await node.boundingBox();
  await page.mouse.move(nb.x + 12, nb.y + 4);
  await page.waitForTimeout(400);
  const removed = await page.evaluate(() => {
    const n = document.querySelector('[data-node-id="CE-pins"]');
    const btn = [...(n?.querySelectorAll('button') ?? [])].find(b => /remove/i.test(b.getAttribute('title') ?? ''));
    btn?.click(); return !!btn;
  });
  await page.waitForTimeout(600);
  check(removed, 'the board has a remove button');
  const s = await stored();
  check(s.jobs['G-p3'].held === null, 'removing the pin board puts its jobs back on the board');
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
