// Inside a group must be the same application as outside it: the board's own
// job tile, its right-click, its lock, its zoom and a drag that pans.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'gs1', name: 'AC installation', color: '#0ea5e9', order: 1, active: true,
               projectId: 'general', description: '', createdAt: '', updatedAt: '' }],
    // Enough jobs that the group's surface is bigger than its window, so
    // panning has somewhere to go.
    apartments: Array.from({ length: 14 }, (_, i) => ({
      id: `G-b${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
      displayName: `Weinstein, Steven ${i}`, address: 'Mekor Chaim 39/6, Jerusalem',
      driveLink: 'https://drive.google.com/drive/folders/FAKE' + i,
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: 'gs1', stageDates: {}, boardBin: 'CE-bin-mine', binnedAt: '2026-01-01',
      contentUpdatedAt: '2026-08-10T09:00:00.000Z',
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    })),
    canvasElements: [
      { id: 'CE-bin-mine', type: 'bin', x: 420, y: 60, w: 178, h: 92,
        text: 'Currently in AC', color: '#64748b' },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3600);

// Open the group.
const binNode = await page.$('[data-node-id="CE-bin-mine"]');
check(!!binNode, 'the group is on the board');
if (!binNode) { console.log('CANNOT CONTINUE'); await b.close(); process.exit(1); }
const bb = await binNode.boundingBox();
await page.mouse.dblclick(bb.x + bb.width / 2, bb.y + bb.height / 2);
await page.waitForTimeout(900);

// ── The tile is the BOARD's tile ──────────────────────────────────────────
const tile = await page.$('[data-node-id="G-b0"]');
check(!!tile, 'a job inside the group is drawn as a board tile', tile ? '' : 'no [data-node-id] tile');
if (tile) {
  const box = await tile.boundingBox();
  check(Math.round(box.width) === 215 && Math.round(box.height) === 132,
    'at the board’s own size, not a smaller one of its own',
    `${Math.round(box.width)}x${Math.round(box.height)}`);

  const has = await page.evaluate(() => {
    const t = document.querySelector('[data-node-id="G-b0"]');
    const titles = [...t.querySelectorAll('button,a')].map(e => e.getAttribute('title') ?? '');
    return {
      lock: titles.some(x => /lock in place|locked in place/i.test(x)),
      tv: titles.some(x => /TV/i.test(x)),
      drive: !!t.querySelector('a[href*="drive.google.com"]'),
      stage: /AC installation/.test(t.textContent ?? ''),
      edited: /ago|just now/i.test(t.textContent ?? ''),
    };
  });
  console.log('       tile carries:', JSON.stringify(has));
  check(has.lock, 'with the lock button');
  check(has.tv, 'the wallboard switch');
  check(has.drive, 'the Drive link');
  check(has.stage, 'and its stage');

  // Right-click, in the tile's own middle — the top strip is buttons.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.waitForTimeout(600);
  const menu = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      open: /Put back on the board/.test(t) && /Open the job/.test(t),
      sample: t.split('\n').filter(Boolean).slice(-8).join(' · ').slice(0, 120),
    };
  });
  check(menu.open, 'right-clicking a job inside a group opens its menu', menu.sample);
  // Dismiss on the menu's OWN backdrop. Escape and a click out in the page both
  // close the whole group window, which made every later check fail for a
  // reason that had nothing to do with what it was testing.
  await page.evaluate(() => {
    const back = document.querySelector('.fixed.inset-0.z-\\[88\\]');
    back?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(300);
}

// ── Lock ──────────────────────────────────────────────────────────────────
{
  const lock = await page.$('[data-node-id="G-b0"] button[title*="Lock in place"]');
  check(!!lock, 'the lock is reachable');
  if (lock) {
    await lock.click({ force: true });
    await page.waitForTimeout(700);
    const locked = await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
      return (d.apartments ?? []).find(a => a.id === 'G-b0')?.boardLocked === true;
    });
    check(locked, 'and it really locks the job');
  }
}

// ── Zoom ──────────────────────────────────────────────────────────────────
{
  const readZoom = () => page.evaluate(() => {
    const w = document.querySelector('[data-bin-world]');
    if (!w) return null;
    const m = new DOMMatrix(getComputedStyle(w).transform);
    return +m.a.toFixed(3);
  });
  const z0 = await readZoom();
  check(z0 === 1, 'the group opens at 100%', String(z0));
  /**
   * Scoped to the GROUP WINDOW.
   *
   * The board's own header carries a zoom group with the same button titles,
   * and it is earlier in the document — so a bare `button[title="Bigger"]`
   * reached for the board's control. The + happened to look right because the
   * group was still zooming from an earlier press, and the reset then set the
   * BOARD back to 100% while the group sat at 150%: the harness testing the
   * wrong window and reporting it as a product fault.
   */
  const win = page.locator('.bin-window-in');
  const bigger = win.locator('button[title="Bigger"]');
  check(await bigger.count() === 1, 'the group window has a zoom control of its own');
  {
    await bigger.click({ force: true });
    await page.waitForTimeout(400);
    const z1 = await readZoom();
    check(z1 > z0, 'and + really zooms it', `${z0} → ${z1}`);

    // A tile must still be where the pointer says it is at a zoom that is not 100%.
    const t = await page.$('[data-node-id="G-b1"]');
    const tb = await t.boundingBox();
    const onIt = await page.evaluate(([x, y]) => {
      const n = document.querySelector('[data-node-id="G-b1"]');
      return n.contains(document.elementFromPoint(x, y));
    }, [tb.x + tb.width / 2, tb.y + tb.height / 2]);
    check(onIt, 'and hit-testing still lands on the tile it looks like');

    const back = win.locator('button[title="Back to 100%"]');
    check(await back.count() === 1, 'the percentage between them is a button');
    check((await back.textContent())?.trim() === '125%',
      'and it reads the GROUP’s zoom', (await back.textContent())?.trim());
    await back.click({ force: true });
    await page.waitForTimeout(400);
    check((await readZoom()) === 1, 'pressing the percentage goes back to 100%',
      String(await readZoom()));
  }
}

// ── Drag to pan ───────────────────────────────────────────────────────────
{
  // Zoom in first, so there is genuinely more content than window. At 100% a
  // small test group fits entirely and "it did not pan" would pass for the
  // wrong reason — there was nowhere to pan to.
  const win2 = page.locator('.bin-window-in');
  await win2.locator('button[title="Bigger"]').click({ force: true });
  await win2.locator('button[title="Bigger"]').click({ force: true });
  await page.waitForTimeout(500);

  const before = await page.evaluate(() => {
    const sc = [...document.querySelectorAll('div')].find(d =>
      getComputedStyle(d).overflow === 'auto' && d.querySelector('[data-bin-world]'));
    return sc ? { top: sc.scrollTop, max: sc.scrollHeight - sc.clientHeight } : null;
  });
  console.log('       group scroller:', JSON.stringify(before));
  check(!!before && before.max > 20, 'the group has more content than fits, so panning means something',
    `${before?.max}px of travel`);
  if (before && before.max > 20) {
    // Middle-drag, the board's own pan binding.
    await page.mouse.move(700, 500);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(700, 380, { steps: 8 });
    await page.mouse.up({ button: 'middle' });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => {
      const sc = [...document.querySelectorAll('div')].find(d =>
        getComputedStyle(d).overflow === 'auto' && d.querySelector('[data-bin-world]'));
      return sc ? sc.scrollTop : null;
    });
    check(after > before.top, 'a middle-drag pans the group', `${before.top} → ${after}`);
  }
}

await page.screenshot({ path: 'scratchpad/groupboard.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
