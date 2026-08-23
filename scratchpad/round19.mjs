// Round 19: a job dragged out of a LIST lands on the board · the de-expanded
// board rests clear of the tool rail · the TikTok reel's play + sound buttons.
//
// Every claim is read from the STORE or from real rects — "the row went
// see-through" is not the claim the office cares about.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const job = (i, extra) => ({
    id: `G-r${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: `Drop job ${i}`, address: 'Somewhere 1',
    isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {},
    canvasX: 170, canvasY: 150 + i * 145,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    ...extra,
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [],
    apartments: [
      job(0),                                   // on the board — the drag repositions it
      job(1, { inNotebook: 'CE-book' }),        // living in the notebook — the drag brings it out
    ],
    canvasElements: [
      { id: 'CE-book', type: 'widget', widget: 'rota',
        x: 620, y: 120, w: 700, h: 300, text: '', color: '#ffffff',
        data: {
          people: ['n:Moshe'],
          firstWeek: '2026-08-16', weekCount: 1, span: 5,
          cells: { 'n:Moshe|2026-08-17': [{ id: 'e-1', jobId: 'G-r1' }] },
        } },
      { id: 'CE-list', type: 'widget', widget: 'job-list',
        x: 170, y: 470, w: 235, h: 200, text: '', color: '#ffffff', data: {} },
      { id: 'CE-tt', type: 'widget', widget: 'tiktok',
        x: 1020, y: 500, w: 260, h: 330, text: '', color: '#ffffff',
        data: { links: 'https://www.tiktok.com/@scout2015/video/6718335390845095173' } },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);

const store = () => page.evaluate(() => {
  const st = window.__store?.getState?.();
  if (!st) return null;
  return Object.fromEntries(st.apartments.map(a =>
    [a.id, { x: a.canvasX, y: a.canvasY, book: a.inNotebook ?? null }]));
});

// The store hook — exposed the way the other harnesses do it.
await page.evaluate(() => {}); // settle
const hasHook = await page.evaluate(() => !!window.__store);
if (!hasHook) {
  // Fall back to reading localStorage after the debounced persist.
  console.log('  (no window.__store — reading persisted state instead)');
}
const read = async () => {
  if (await page.evaluate(() => !!window.__store)) return store();
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
    return Object.fromEntries((d.apartments ?? []).map(a =>
      [a.id, { x: a.canvasX, y: a.canvasY, book: a.inNotebook ?? null }]));
  });
};

// ── 1 · a row dragged out of the Job list lands on the board ────────────────
const row0 = page.locator('button', { hasText: 'Drop job 0' }).last();
await row0.waitFor({ state: 'visible', timeout: 8000 });
const r0 = await row0.boundingBox();
check(!!r0, 'the Job list widget draws the job as a row');

const drop1 = { x: 560, y: 800 };
await page.mouse.move(r0.x + r0.width / 2, r0.y + r0.height / 2);
await page.mouse.down();
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(
    r0.x + r0.width / 2 + (drop1.x - r0.x - r0.width / 2) * (i / 8),
    r0.y + r0.height / 2 + (drop1.y - r0.y - r0.height / 2) * (i / 8));
  await page.waitForTimeout(30);
}
await page.mouse.up();
await page.waitForTimeout(700);

let s = await read();
console.log('       after drop 1:', JSON.stringify(s));
check(s && s['G-r0'] && Math.abs(s['G-r0'].x - (drop1.x - 28 - 107)) < 60
  && s['G-r0'].x !== 170,
  'the job moved to where it was let go', `x ${s?.['G-r0']?.x}`);
check(!(await page.locator('.drawer-panel').count()), 'and the drop did not open the drawer');

// ── 2 · a notebook job dragged out of the list comes OUT of the notebook ────
const row1 = page.locator('button', { hasText: 'Drop job 1' }).last();
const r1 = await row1.boundingBox();
check(!!r1, 'the notebook job is still listed in the widget');
const drop2 = { x: 750, y: 800 };
await page.mouse.move(r1.x + r1.width / 2, r1.y + r1.height / 2);
await page.mouse.down();
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(
    r1.x + r1.width / 2 + (drop2.x - r1.x - r1.width / 2) * (i / 8),
    r1.y + r1.height / 2 + (drop2.y - r1.y - r1.height / 2) * (i / 8));
  await page.waitForTimeout(30);
}
await page.mouse.up();
await page.waitForTimeout(700);

s = await read();
console.log('       after drop 2:', JSON.stringify(s));
check(s && s['G-r1'] && s['G-r1'].book === null,
  'the job is out of the notebook (inNotebook cleared)', String(s?.['G-r1']?.book));
check(s && Math.abs(s['G-r1'].x - (drop2.x - 28 - 107)) < 60,
  'and its tile sits where it was let go', `x ${s?.['G-r1']?.x}`);
const tile1 = await page.locator('text=Drop job 1').count();
check(tile1 >= 2, 'its tile is drawn on the board (name appears beyond the lists)', String(tile1));

// ── 3 · a release over a WIDGET places nothing ──────────────────────────────
const before3 = await read();
const rr0 = await page.locator('button', { hasText: 'Drop job 0' }).last().boundingBox();
const bookBox = await page.evaluate(() => {
  // Screen rect of the TikTok widget — a node that is NOT a notebook square.
  const el = [...document.querySelectorAll('iframe')].find(f => (f.src || '').includes('tiktok'));
  const r = (el?.closest('[class*="group"]') ?? el)?.getBoundingClientRect();
  return r ? { x: r.x + r.width / 2, y: r.y + 30 } : null;
});
if (rr0 && bookBox) {
  await page.mouse.move(rr0.x + rr0.width / 2, rr0.y + rr0.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(
      rr0.x + rr0.width / 2 + (bookBox.x - rr0.x - rr0.width / 2) * (i / 6),
      rr0.y + rr0.height / 2 + (bookBox.y - rr0.y - rr0.height / 2) * (i / 6));
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
  const after3 = await read();
  check(after3?.['G-r0']?.x === before3?.['G-r0']?.x,
    'released over a widget, the job stays where it was',
    `${before3?.['G-r0']?.x} → ${after3?.['G-r0']?.x}`);
} else {
  check(false, 'could not stage the over-a-widget drop', JSON.stringify({ rr0: !!rr0, bookBox }));
}

// ── 4 · the board rests clear of the tool rail after a shove right ──────────
await page.mouse.move(700, 750);
await page.mouse.down({ button: 'middle' });
await page.mouse.move(100, 750, { steps: 8 });
await page.mouse.up({ button: 'middle' });
await page.waitForTimeout(500);
const rects = await page.evaluate(() => {
  const world = document.querySelector('[data-board-world]')?.getBoundingClientRect();
  const rail = document.querySelector('[data-board-toolrail]')?.getBoundingClientRect();
  return { worldRight: world?.right, railLeft: rail?.left };
});
console.log('       rail clamp:', JSON.stringify(rects));
check(Number.isFinite(rects.worldRight) && Number.isFinite(rects.railLeft)
  && rects.worldRight <= rects.railLeft + 2,
  'shoved hard left, the world\'s right edge stops at the rail', JSON.stringify(rects));
check(rects.worldRight >= rects.railLeft - 40,
  'and it really is resting against it, not somewhere short of it');

// ── 5 · the TikTok reel: play, and a sound button beside it ─────────────────
const frameSrc = () => page.evaluate(() =>
  [...document.querySelectorAll('iframe')].map(f => f.src).find(s => s.includes('tiktok')) ?? '');
const src1 = await frameSrc();
console.log('       tiktok src:', src1);
check(src1.includes('/player/v1/'), 'the frame is TikTok\'s controllable player, not the old embed page');
check(src1.includes('muted=1'), 'it starts silent — the only start a browser allows without a press');
check(await page.locator('button[title="Play this one"]').count() > 0
  || await page.locator('button[title="Pause"]').count() > 0,
  'the bottom play button is there');
const sound = page.locator('button[title="Turn the sound on"]');
check(await sound.count() > 0, 'and a sound button sits beside it');
await sound.click();
await page.waitForTimeout(400);
const src2 = await frameSrc();
check(src2.includes('muted=0'), 'pressing it turns the sound on', src2);
check(await page.locator('button[title="Turn the sound off"]').count() > 0,
  'and the button now offers to turn it off');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
