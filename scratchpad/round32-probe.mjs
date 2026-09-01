// Probe for the controls round: right-drag lasso, right-click+scroll zoom,
// the quick-assign drop box, the typed default zoom, and the tutorial.
import { chromium } from 'playwright';

const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const day = n => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const sunday = day(-new Date().getDay());

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(([sun]) => {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('active_project', 'general');
  const user = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const contractors = [
    { id: 'C-a', name: 'Motti', category: 'general', token: 't1', active: true, createdAt: '2026-01-01' },
  ];
  const jobs = [
    { id: 'G-r1', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Artzi',
      classification: 'standard', isUnnamed: false, createdAt: '2026-01-01', canvasX: 500, canvasY: 300 },
    { id: 'G-r2', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Goldman',
      classification: 'standard', isUnnamed: false, createdAt: '2026-01-01', canvasX: 700, canvasY: 300 },
  ];
  localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user, contractors }));
  localStorage.setItem('general_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors, apartments: jobs,
    canvasElements: [
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 1050, y: 560, w: 420, h: 260,
        text: '', color: '#ffffff',
        data: { people: ['c:C-a'], firstWeek: sun, weekCount: 1, cells: {} } },
    ],
  }));
}, [sunday]);

const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(3000);

// ── 1. Right-drag lasso ──
// Find empty canvas near the two tiles (they sit at world 500/700,300; home view
// is flush top-left, so screen ≈ world + header offset).
const t1 = await page.locator('[data-node-id="G-r1"]').boundingBox();
const t2 = await page.locator('[data-node-id="G-r2"]').boundingBox();
check(!!t1 && !!t2, 'both tiles are on screen');
const sx = t1.x - 40, sy = t1.y - 30;
const ex = t2.x + t2.width + 30, ey = t2.y + t2.height + 30;
await page.mouse.move(sx, sy);
await page.mouse.down({ button: 'right' });
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(sx + ((ex - sx) * i) / 8, sy + ((ey - sy) * i) / 8);
  await page.waitForTimeout(16);
}
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(400);
// No context menu after the lasso release…
const menuAfterLasso = await page.evaluate(() =>
  [...document.querySelectorAll('button')].some(b => /SELECTED|Add job here|Paste/.test(b.textContent || '')
    && b.closest('[class*="fixed"]')));
check(!menuAfterLasso, 'right-drag lasso raises no context menu');
// …and a motionless right-click now speaks for the selection. The lasso can
// legitimately also catch the seeded Goals widget fixture (it lands at the
// view centre since the goals round), so the count is 2 OR 3 — what matters
// is that BOTH tiles are in it.
await page.mouse.click(t1.x - 60, t1.y - 60, { button: 'right' });
await page.waitForTimeout(300);
const selHeader = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div,span')].find(x =>
    /^[23] SELECTED$/i.test((x.textContent || '').trim()) && x.children.length === 0);
  return el ? el.textContent.trim() : null;
});
check(!!selHeader, `right-drag selected the tiles (menu says ${selHeader ?? 'nothing'})`);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// ── 2. Right-click + scroll zooms ──
const zoomBefore = await page.evaluate(() => {
  const w = document.querySelector('[data-board-world]');
  return w ? getComputedStyle(w.parentElement).transform : '';
});
await page.mouse.move(t1.x - 80, t1.y - 80);
await page.mouse.down({ button: 'right' });
await page.mouse.wheel(0, -240);
await page.waitForTimeout(300);
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(400);
const zoomAfter = await page.evaluate(() => {
  const w = document.querySelector('[data-board-world]');
  return w ? getComputedStyle(w.parentElement).transform : '';
});
check(zoomBefore !== zoomAfter, 'right-click + scroll zooms the board');
const menuAfterWheel = await page.evaluate(() =>
  [...document.querySelectorAll('button')].some(b => /Add job here|Paste/.test(b.textContent || '')));
check(!menuAfterWheel, 'the wheel-zoom release raises no menu');
// A plain motionless right-click on empty board still opens the canvas menu.
await page.mouse.click(t1.x - 100, t1.y + 200, { button: 'right' });
await page.waitForTimeout(300);
const canvasMenu = await page.evaluate(() =>
  [...document.querySelectorAll('button')].some(b => /Add job here|Note here|Paste/i.test(b.textContent || '')));
check(canvasMenu, 'a motionless right-click still opens the canvas menu');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
// Back to 100% for stable coordinates below.
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^100%$/.test(x.textContent || ''));
  b?.click();
});
await page.waitForTimeout(400);

// ── 3. The quick-assign drop box ──
const tile = await page.locator('[data-node-id="G-r1"]').boundingBox();
await page.mouse.move(tile.x + tile.width / 2, tile.y + tile.height / 2);
await page.mouse.down();
for (let i = 1; i <= 6; i++) {
  await page.mouse.move(tile.x + tile.width / 2 + i * 10, tile.y + tile.height / 2 - i * 6);
  await page.waitForTimeout(20);
}
const boxVisible = await page.locator('[data-quick-box]').count();
check(boxVisible === 1, 'the drop box appears mid-drag at the top of the screen');
const boxRect = await page.locator('[data-quick-box]').boundingBox();
// Carry the job onto it and let go.
await page.mouse.move(boxRect.x + boxRect.width / 2, boxRect.y + boxRect.height / 2, { steps: 8 });
await page.waitForTimeout(150);
await page.mouse.up();
await page.waitForTimeout(500);
check(await page.locator('[data-quick-assign]').count() === 1, 'dropping on the box asks who + which day');
const jobStill = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('general_app_data')).apartments.find(a => a.id === 'G-r1').canvasX);
check(jobStill === 500, `the job itself did not move (canvasX ${jobStill})`);
// Pick a day 30 days out, press Next.
const far = day(30);
await page.locator('[data-quick-day]').fill(far);
await page.locator('[data-quick-next]').click();
await page.waitForTimeout(600);
const taskDialog = await page.evaluate(() =>
  [...document.querySelectorAll('button')].some(b => /Just put it on the planner/.test(b.textContent || '')));
check(taskDialog, 'Next opens the standing task dialog');
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Just put it on the planner/.test(x.textContent || ''));
  b?.click();
});
await page.waitForTimeout(800);
const rota = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('general_app_data')).canvasElements.find(e => e.id === 'CE-rota').data);
const cellKey = `c:C-a|${far}`;
check((rota.cells?.[cellKey] ?? []).some(e => e.jobId === 'G-r1'),
  'the card landed on that person and day');
check((rota.weekCount ?? 1) > 4, `the notebook run extended to cover the far week (weekCount ${rota.weekCount})`);

// ── 4. Typed default zoom ──
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.title === 'Board settings');
  b?.click();
});
await page.waitForTimeout(400);
const zoomField = page.locator('[data-default-zoom]');
check(await zoomField.count() === 1, 'board settings carry the typed default-zoom field');
await zoomField.fill('150');
await zoomField.blur();
await page.waitForTimeout(400);
const stored = await page.evaluate(() => localStorage.getItem('board_default_zoom_general'));
check(stored === '1.5', `typing 150 stores 1.5 (${stored})`);

// ── 5. The tutorial ──
await page.locator('[data-tutorial-button]').click();
await page.waitForTimeout(400);
check(await page.locator('[data-tutorial]').count() === 1, 'the help button opens the tutorial');
// PORTALLED to body — rendered inline in the header it was capped at z-30
// and the board's floating chrome painted over it (the owner's screenshot),
// which also made the X unpressable.
check(await page.evaluate(() => document.querySelector('[data-tutorial]')?.parentElement === document.body),
  'the tutorial rides on body, above every board chrome');
check(await page.evaluate(() => {
  const x = document.querySelector('[data-tutorial-close]');
  if (!x) return false;
  const r = x.getBoundingClientRect();
  return x.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
}), 'and its X really takes the click');
// The step card floats mid-screen with its emoji face and bounce class.
check(await page.evaluate(() => {
  const c = document.querySelector('[data-tutorial-step]');
  if (!c) return false;
  const r = c.getBoundingClientRect();
  const centred = Math.abs((r.left + r.width / 2) - window.innerWidth / 2) < window.innerWidth * 0.2;
  return centred && c.className.includes('tut-pop') && /\p{Extended_Pictographic}/u.test(c.textContent ?? '');
}), 'the instructions float centre-stage, emoji and all');
await page.locator('[data-tutorial-next]').click(); // welcome → click step
await page.waitForTimeout(300);
// Step 2: click a mini tile.
const mini = await page.locator('[data-mini-tile="t1"]').boundingBox();
await page.mouse.click(mini.x + mini.width / 2, mini.y + mini.height / 2);
await page.waitForTimeout(400);
check(await page.locator('[data-tutorial-done]').count() === 1, 'the click step celebrates');
await page.waitForTimeout(900); // auto-advance
// Step 3: drag the tile.
const mini2 = await page.locator('[data-mini-tile="t1"]').boundingBox();
await page.mouse.move(mini2.x + 20, mini2.y + 20);
await page.mouse.down();
for (let i = 1; i <= 6; i++) { await page.mouse.move(mini2.x + 20 + i * 15, mini2.y + 20 + i * 8); await page.waitForTimeout(16); }
await page.mouse.up();
await page.waitForTimeout(1300);
const prog = await page.locator('[data-tutorial-progress]').textContent();
check(/4/.test(prog || ''), `the drag step advanced the lesson (${(prog || '').trim()})`);
// Walk to the print step by skipping the remaining do-steps.
for (let i = 0; i < 12; i++) {
  const skip = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-tutorial] button')].find(x =>
      /^(Skip|Next)$/.test((x.textContent || '').trim()));
    if (b) { b.click(); return true; }
    return false;
  });
  if (!skip) break;
  await page.waitForTimeout(250);
}
check(await page.locator('[data-tutorial-print]').count() === 1, 'the lesson ends at the print step');
// Print opens the themed sheet.
const [pop] = await Promise.all([
  page.context().waitForEvent('page'),
  page.locator('[data-tutorial-print-btn]').click(),
]);
await page.waitForTimeout(800);
const popHtml = await pop.content();
check(/tzviair-logo\.png/.test(popHtml) && /controls/i.test(popHtml),
  'the printed sheet is TzviAir-themed and lists the controls');
check(/100mm 100mm/.test(popHtml), 'the sticky-note size drives the page size');
await pop.close();
await page.locator('[data-tutorial-finish]').click();
await page.waitForTimeout(300);
check(await page.locator('[data-tutorial]').count() === 0, 'Finish closes the tutorial');

await page.screenshot({ path: `${SCRATCH}/round32.png` });
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
