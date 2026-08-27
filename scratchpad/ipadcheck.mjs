// The iPad: DESKTOP layout driven by a FINGER.
//
// An iPad (768px and up) gets the desktop layout, so the phone sweeps never
// cover it — and a desktop layout under touch has its own failure modes: a
// control that only appears on hover does not exist, a double-click gesture
// does not exist, and a tap that captures wrongly opens nothing. This harness
// runs the app at iPad sizes with GENUINE touch emulation
// (Emulation.setTouchEmulationEnabled + setEmitTouchEventsForMouse, the
// markupfixes lesson — setEmulatedMedia feature overrides do NOT reach
// matchMedia in this Chromium) and asserts the touch rules are live.
//
// Lessons already paid for elsewhere, kept here:
// - arm the touch profile AFTER navigation, or Playwright's own synthetic
//   clicks hang;
// - wait before measuring a hover-revealed control's opacity — several carry
//   transition-all and an immediate read returns the FROM value;
// - a tap is a CDP touch sequence, never page.click — click() is a mouse.
import { chromium, devices } from 'playwright';
import { realisticWolfson, applySeed } from './seed.mjs';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fails = 0;
const check = (ok, label, extra = '') =>
  { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? '  (' + extra + ')' : ''}`); if (!ok) fails++; };

async function touchPage(ctx, url) {
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173' + url);
  await page.waitForTimeout(2200);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(70);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const drag = async (x0, y0, dx, dy) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
        touchPoints: [{ x: x0 + (dx * i) / 10, y: y0 + (dy * i) / 10 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  return { page, tap, drag };
}

// ── A. Wolfson at iPad landscape: the diagram under a finger ──
{
  const ctx = await b.newContext({
    viewport: { width: 1024, height: 768 },
    isMobile: false, hasTouch: true, deviceScaleFactor: 2,
    userAgent: devices['iPad Pro 11'] ? devices['iPad Pro 11'].userAgent : devices['iPhone 13'].userAgent,
  });
  const blob = await realisticWolfson(b, {});
  await applySeed(ctx, blob, {});
  const { page, tap } = await touchPage(ctx, '/project');

  check(await page.evaluate(() => matchMedia('(any-hover: none)').matches),
    'iPad: the touch profile is live (any-hover: none)');
  check(await page.evaluate(() => !!document.querySelector('aside, nav.hidden.md\\:flex, [class*="md:flex"]')) &&
        await page.locator('text=Dashboard').first().isVisible(),
    'iPad: desktop sidebar is on screen');
  const threeBuildings = await page.evaluate(() =>
    ['A1', 'A2', 'A3'].every(bn => [...document.querySelectorAll('*')]
      .some(el => el.children.length === 0 && el.textContent.trim() === bn)));
  check(threeBuildings, 'iPad: all three buildings drawn (desktop diagram, not phone tabs)');

  // tap an apartment cell → the drawer opens as the centred DESKTOP modal
  const cell = await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().boundingBox();
  await tap(cell.x + cell.width / 2, cell.y + cell.height / 2);
  await page.waitForTimeout(1200);
  const drawer = await page.locator('.drawer-panel').first().boundingBox().catch(() => null);
  check(!!drawer, 'iPad: a finger tap on an apartment opens the drawer');
  if (drawer) {
    check(drawer.width > 700, 'iPad: the drawer is the desktop modal, not the phone sheet',
      `width=${Math.round(drawer.width)}`);
    // its close X must be a real tap target
    const x = await page.locator('.drawer-panel button', { has: page.locator('svg') }).first().boundingBox();
    check(!!x && x.width >= 24 && x.height >= 24, 'iPad: the drawer close button is tappable',
      x ? `${Math.round(x.width)}x${Math.round(x.height)}` : 'missing');
  }
  await ctx.close();
}

// ── B. the Job Board at iPad landscape: touch navigates, controls exist ──
{
  const ctx = await b.newContext({
    viewport: { width: 1024, height: 768 },
    isMobile: false, hasTouch: true, deviceScaleFactor: 2,
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('whats_new_seen', '2026-08-16');
    if (localStorage.getItem('general_app_data')) return;
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
      apartments: [{
        id: 'G-j1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Touch Job',
        isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
        currentStageId: null, stageDates: {}, canvasX: 120, canvasY: 320,
        createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U-test', updatedByName: 'A',
      }],
      canvasElements: [
        { id: 'CE-t', type: 'note', x: 120, y: 520, w: 180, h: 140, text: 'TouchNote', color: '#fef9c3' },
      ],
    }));
  });
  const { page, tap, drag } = await touchPage(ctx, '/jobs');
  await page.waitForTimeout(1200);

  const box = id => page.locator(`[data-node-id="${id}"]`).first().boundingBox();
  const stored = () => page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
    return { job: d.apartments?.find(a => a.id === 'G-j1'), note: d.canvasElements?.find(e => e.id === 'CE-t') };
  });

  // hover-only controls exist at rest on a touch screen (wait out transitions)
  const tile = await box('G-j1');
  check(!!tile, 'iPad board: the job tile rendered');
  if (tile) {
    await page.waitForTimeout(900);
    const revealed = await page.evaluate(() => {
      const el = document.querySelector('[data-node-id="G-j1"]');
      const gated = el ? [...el.querySelectorAll('*')].filter(n => {
        const cl = (n.className || '').toString();
        return cl.includes('group-hover') && cl.includes('opacity-100');
      }) : [];
      return { count: gated.length, visible: gated.filter(n => Number(getComputedStyle(n).opacity) > 0.5).length };
    });
    check(revealed.count === 0 || revealed.visible > 0,
      'iPad board: hover-revealed tile controls are visible at rest',
      `${revealed.visible}/${revealed.count}`);

    // a finger drag from the tile PANS; the stored position must not move
    await drag(tile.x + tile.width / 2, tile.y + tile.height / 2, -120, -60);
    await page.waitForTimeout(700);
    const st = await stored();
    check(st.job.canvasX === 120 && st.job.canvasY === 320,
      'iPad board: finger drag from a tile pans the board, the job stays put');

    // tapping the tile opens the job (first or second tap — pick-then-open is fine)
    // tap the MIDDLE of the tile — the top strip is buttons (the grouplock
    // lesson), and under any-hover:none they are always visible, so a press
    // up there is a button press.
    let t = await box('G-j1');
    await tap(t.x + t.width / 2, t.y + t.height / 2);
    await page.waitForTimeout(900);
    if (!(await page.locator('.drawer-panel').count())) {
      t = await box('G-j1');
      await tap(t.x + t.width / 2, t.y + t.height / 2);
      await page.waitForTimeout(1200);
    }
    check((await page.locator('.drawer-panel').count()) > 0,
      'iPad board: a finger can open a job');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  }

  // the note: hover-gated node action strip is reachable by a finger
  const note = await box('CE-t');
  if (note) {
    await tap(note.x + note.width / 2, note.y + note.height / 2);
    await page.waitForTimeout(800);
    const strip = await page.evaluate(() => {
      const el = document.querySelector('[data-node-id="CE-t"]');
      if (!el) return null;
      const btns = [...el.querySelectorAll('button')].filter(n => n.offsetWidth > 0);
      return btns.filter(n => Number(getComputedStyle(n).opacity) > 0.5).length;
    });
    check(strip === null || strip > 0, 'iPad board: a picked note shows its action buttons', `visible=${strip}`);
  }
  await ctx.close();
}

// ── C. iPad portrait 768x1024 — exactly ON the md line ──
{
  const ctx = await b.newContext({
    viewport: { width: 768, height: 1024 },
    isMobile: false, hasTouch: true, deviceScaleFactor: 2,
  });
  const blob = await realisticWolfson(b, {});
  await applySeed(ctx, blob, {});
  const { page } = await touchPage(ctx, '/project');
  const side = await page.locator('text=Dashboard').first().isVisible().catch(() => false);
  const mobileNav = await page.evaluate(() => {
    // the phone bottom bar is md:hidden — at 768 it must be gone
    const els = [...document.querySelectorAll('nav, div')].filter(el =>
      (el.className || '').toString().includes('md:hidden') && el.offsetHeight > 0 &&
      el.getBoundingClientRect().bottom > innerHeight - 90 && el.querySelector('a,button'));
    return els.length;
  });
  check(side, 'iPad portrait 768: desktop sidebar shows (768 is past the md line)');
  check(mobileNav === 0, 'iPad portrait 768: the phone bottom bar is gone', `found=${mobileNav}`);
  await ctx.close();
}

console.log(fails ? `\n${fails} FAILED` : '\nall good');
await b.close();
process.exit(fails ? 1 : 0);
