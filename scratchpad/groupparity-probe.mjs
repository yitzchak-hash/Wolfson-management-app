// The group window has the board's controls, and the group-totals widget
// lists every group — including the ones made by hand or by the Drive sweep.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 960 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  const job = (i, extra) => ({
    id: `G-b${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: `Weinstein, Steven ${i}`, address: 'Mekor Chaim 39/6, Jerusalem',
    isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
    currentStageId: 'gs1', stageDates: {}, contentUpdatedAt: '2026-08-10T09:00:00.000Z',
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', ...extra,
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'gs1', name: 'AC installation', color: '#0ea5e9', order: 1, active: true,
               projectId: 'general', description: '', createdAt: '', updatedAt: '' }],
    apartments: [
      // Five far down the group's surface, in a row across; one at the top.
      ...[0, 1, 2, 3, 4].map(i => job(i, { boardBin: 'CE-bin-mine', binnedAt: '2026-01-01', binX: 20 + i * 270, binY: 600 })),
      job(5, { boardBin: 'CE-bin-mine', binnedAt: '2026-01-01', binX: 20, binY: 60 }),
      job(6, { boardBin: 'done', binnedAt: '2026-01-01' }),
      job(7, { boardBin: 'done', binnedAt: '2026-01-01' }),
      job(8, { canvasX: 40, canvasY: 700 }),
    ],
    canvasElements: [
      { id: 'CE-bin-mine', type: 'bin', x: 420, y: 60, w: 178, h: 92, text: 'Currently in AC', color: '#f97316' },
      { id: 'CE-w-bins', type: 'widget', widget: 'bin-counter', x: 40, y: 260, w: 260, h: 150, text: '', color: '#ffffff', data: {} },
      { id: 'CE-w-bins-dash', type: 'widget', widget: 'bin-counter', board: '__dashboard', x: 0, y: 0, w: 400, h: 150, text: '', color: '#ffffff', data: {}, z: 1 },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3600);

const readRows = (root) => page.evaluate((root) => {
  const w = document.querySelector(root + ' [data-bin-totals]');
  if (!w) return null;
  return [...w.querySelectorAll('[data-bin-total]')].map(r => ({
    key: r.getAttribute('data-bin-total'), n: +r.querySelector('button,span').textContent.trim(),
    label: r.querySelector('[title]')?.getAttribute('title') ?? '',
  }));
}, root);

// ── 1 · the widget on the board lists the hand-made group ────────────────
{
  const rows = await readRows('[data-node-id="CE-w-bins"]');
  console.log('       rows:', JSON.stringify(rows));
  const mine = rows?.find(r => r.key === 'CE-bin-mine');
  check(!!mine && mine.n === 6 && mine.label === 'Currently in AC', 'the group-totals widget lists the hand-made group with its count and name');
  check(rows?.find(r => r.key === 'done')?.n === 2, 'and the built-in Done with its count');
  check(rows?.length === 5, 'five rows: the four built-ins plus the one made by hand', String(rows?.length));
  // The number opens its list.
  // A DOM click, the standing manner for a button inside a board node — the
  // synthetic pointer sequence tangles with the node's pointer capture.
  await page.locator('[data-node-id="CE-w-bins"] [data-bin-total="CE-bin-mine"] button').evaluate(b => b.click());
  await page.waitForTimeout(500);
  const popup = await page.evaluate(() => {
    const box = document.querySelector('.fixed.inset-0.z-\\[210\\]');
    return box ? box.textContent : 'NO POPUP';
  });
  console.log('       popup:', popup.slice(0, 160));
  check(/Currently in AC/.test(popup) && /6/.test(popup) && /Weinstein/.test(popup), 'pressing the number opens the group’s list');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// ── 2 · the dashboard copy says the same numbers ─────────────────────────
{
  await page.goto(`${APP}/dashboard`);
  await page.waitForTimeout(2500);
  const rows = await page.evaluate(() => {
    const w = document.querySelector('[data-bin-totals]');
    return w ? [...w.querySelectorAll('[data-bin-total]')].map(r => ({ key: r.getAttribute('data-bin-total'), n: +r.querySelector('button,span').textContent.trim() })) : null;
  });
  console.log('       dashboard rows:', JSON.stringify(rows));
  check(rows?.find(r => r.key === 'CE-bin-mine')?.n === 6 && rows?.find(r => r.key === 'done')?.n === 2,
    'the dashboard’s copy counts the filed jobs too (its context hands widgets only the live ones)');
  await page.goto(`${APP}/jobs`);
  await page.waitForTimeout(3000);
}

// ── 3 · the group window frames its content: no empty band above ─────────
const binNode = await page.$('[data-node-id="CE-bin-mine"]');
const bb = await binNode.boundingBox();
await page.mouse.dblclick(bb.x + bb.width / 2, bb.y + bb.height / 2);
await page.waitForTimeout(900);
const scroller = () => page.evaluate(() => {
  const sc = [...document.querySelectorAll('div')].find(d =>
    getComputedStyle(d).overflow === 'auto' && d.querySelector('[data-bin-world]'));
  const r = sc.getBoundingClientRect();
  return { top: r.top, left: r.left, w: sc.clientWidth, h: sc.clientHeight, scrollTop: sc.scrollTop, scrollLeft: sc.scrollLeft, travel: sc.scrollHeight - sc.clientHeight };
});
const tileTop = (id) => page.evaluate(id => document.querySelector(`[data-node-id="${id}"]`)?.getBoundingClientRect(), id);
{
  const sc = await scroller();
  const t5 = await tileTop('G-b5'); const t0 = await tileTop('G-b0');
  console.log('       scroller', JSON.stringify(sc), 'top tile at', Math.round(t5.top - sc.top), 'far row at', Math.round(t0.top - sc.top));
  check(Math.abs((t5.top - sc.top) - 20) < 3, 'the top tile sits 20px from the window’s top (stored y 60 → framed)', String(t5.top - sc.top));
  check(Math.round(t0.top - t5.top) === 540, 'the far row keeps its distance below it', String(t0.top - t5.top));

  // Carry the top tile down beside the others. On release the frame follows.
  await page.mouse.move(t5.x + t5.width / 2, t5.y + t5.height / 2);
  await page.mouse.down();
  await page.mouse.move(t5.x + t5.width / 2 + 5, t5.y + t5.height / 2 + 5);
  await page.mouse.move(t5.x + t5.width / 2 + 675, t5.y + t5.height / 2 + 540, { steps: 14 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(700);
  const sc2 = await scroller();
  const t0b = await tileTop('G-b0');
  console.log('       after the carry: far row at', Math.round(t0b.top - sc2.top), 'scrollTop', sc2.scrollTop, 'travel', sc2.travel);
  check(Math.abs((t0b.top - sc2.top) - 20) < 3, 'DE-EXPAND: once the last tile leaves the top, the empty band above closes and the row sits at the top', String(t0b.top - sc2.top));
  const stored = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
    return (d.apartments ?? []).filter(a => a.boardBin === 'CE-bin-mine').map(a => [a.id, a.binX, a.binY]);
  });
  console.log('       stored:', JSON.stringify(stored));
  check(stored.every(([id, x, y]) => id === 'G-b5' ? y > 500 : y === 600), 'the frame is a view: stored positions of the others did not move');
}

// ── 4 · right-drag lassoes, motionless right-click still menus ───────────
const selectedCount = () => page.evaluate(() =>
  [...document.querySelectorAll('.bin-window-in [data-node-id^="G-b"]')].filter(t => (t.style.border || '').includes('rgb(74, 168, 216)')).length);
{
  const sc = await scroller();
  const t0 = await tileTop('G-b0'); const t2 = await tileTop('G-b2');
  // Start above-left of the first tile on EMPTY surface, sweep over three.
  const sx = t0.x - 8, sy = t0.y - 8;
  await page.mouse.move(sx, sy);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(sx + 10, sy + 10);
  await page.mouse.move(t2.x + 40, t2.y + 40, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(500);
  const n = await selectedCount();
  console.log('       selected ids:', await page.evaluate(() => [...document.querySelectorAll('.bin-window-in [data-node-id^="G-b"]')].filter(t => (t.style.border || '').includes('rgb(74, 168, 216)')).map(t => t.getAttribute('data-node-id'))),
    'start point on:', await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e?.tagName + '.' + (e?.className || '').toString().slice(0, 30) + ' bin-surface=' + e?.dataset?.binSurface; }, [sx, sy]));
  check(n === 3, 'a RIGHT-drag on empty surface lassoes the tiles it crosses', `${n} selected`);
  const menuUp = await page.evaluate(() => /Put back on the board|Sticky note/.test(document.body.innerText) && !!document.querySelector('.fixed.inset-0.z-\\[88\\]'));
  check(!menuUp, 'and no menu is left standing after the lasso');
  // Motionless right-click on empty surface: the menu, as before.
  await page.mouse.click(sx, sy, { button: 'right' });
  await page.waitForTimeout(400);
  const menu = await page.evaluate(() => /Sticky note/.test(document.body.innerText) && !!document.querySelector('.fixed.inset-0.z-\\[88\\]'));
  if (!menu) console.log('       body tail:', await page.evaluate(() => document.body.innerText.split('\n').filter(Boolean).slice(-6).join(' · ')));
  check(menu, 'a motionless right-click still opens the surface menu');
  await page.evaluate(() => document.querySelector('.fixed.inset-0.z-\\[88\\]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(300);
  void sc;
}

// ── 5 · arrows nudge the selection ───────────────────────────────────────
{
  const t1 = await tileTop('G-b1');
  await page.mouse.click(t1.x + t1.width / 2, t1.y + t1.height / 2);
  await page.waitForTimeout(300);
  check((await selectedCount()) === 1, 'a click picks one tile');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(600);
  const pos = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
    const a = (d.apartments ?? []).find(a => a.id === 'G-b1'); return [a.binX, a.binY];
  });
  check(pos[0] === 290 + 11 && pos[1] === 601, 'arrow keys nudge it 1px, Shift 10px, and the move is stored', JSON.stringify(pos));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

// ── 6 · right button held + wheel zooms; ctrl+wheel zooms to the pointer ─
const readZoom = () => page.evaluate(() => {
  const w = document.querySelector('[data-bin-world]');
  return +new DOMMatrix(getComputedStyle(w).transform).a.toFixed(3);
});
{
  const t0 = await tileTop('G-b0');
  const px = t0.x - 8, py = t0.y - 8;
  await page.mouse.move(px, py);
  await page.mouse.down({ button: 'right' });
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(300);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(400);
  const z = await readZoom();
  check(z === 1.25, 'right button held + wheel zooms the group', String(z));
  const menuUp = await page.evaluate(() => !!document.querySelector('.fixed.inset-0.z-\\[88\\]'));
  check(!menuUp, 'without leaving a menu behind');
  // Back to 100%, then ctrl+wheel over the far-right tile: it stays under the pointer.
  await page.locator('.bin-window-in button[title="Back to 100%"]').click({ force: true });
  await page.waitForTimeout(400);
  const t4 = await tileTop('G-b3');
  const ax = t4.x + t4.width / 2, ay = t4.y + t4.height / 2;
  await page.mouse.move(ax, ay);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(250);
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await page.waitForTimeout(500);
  const z2 = await readZoom();
  const t4b = await tileTop('G-b3');
  const cx = t4b.x + t4b.width / 2, cy = t4b.y + t4b.height / 2;
  console.log('       ctrl+wheel: zoom', z2, 'tile centre drift', Math.round(cx - ax), Math.round(cy - ay));
  check(z2 === 1.5, 'ctrl+wheel zooms two steps', String(z2));
  check(Math.abs(cx - ax) < 8 && Math.abs(cy - ay) < 8, 'and the point under the pointer stays under it', `${Math.round(cx - ax)},${Math.round(cy - ay)}`);
}

await page.screenshot({ path: 'scratchpad/groupparity.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
