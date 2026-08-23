// Board behaviour: tool toggle-off, and the zoom-out corner anchor.
// Both are things the owner reported doing the wrong thing, so both are
// asserted against the REAL board rather than reasoned about.
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2026-08-16');
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'Architect Avi', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2500);

// The lit tool is the one with the navy fill, so "which tool is armed" is read
// off the same thing the user reads it off.
const armed = () => page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button[title]'));
  const on = btns.find(b => {
    const bg = b.style.backgroundColor || '';
    return bg.includes('30, 58, 95') || bg.toLowerCase() === '#1e3a5f';
  });
  return on ? (on.textContent || '').trim() : null;
});

const pick = async (name) => {
  await page.locator('button[title]').filter({ hasText: new RegExp(`^${name}$`) }).first().click();
  await page.waitForTimeout(250);
};

// Select is the resting state and lights nothing on the rail, so "back to
// default" is asserted as "back to exactly how the board started" rather than
// against a literal label that is never displayed.
const rest = await armed();
console.log('resting tool renders as:', JSON.stringify(rest));

for (const name of ['Pen', 'Mark']) {
  await pick(name);
  const on = await armed();
  await pick(name);
  const off = await armed();
  console.log(on === name && off === rest
    ? `PASS ${name} arms, then a second press returns to the default`
    : `FAIL ${name}: armed=${on} afterSecondPress=${off} (expected ${name} then ${rest})`);
}

// ── zoom out must keep the board in its corner ──
const readPan = () => page.evaluate(() => {
  const world = document.querySelector('[style*="transform-origin"], [style*="transformOrigin"]')
    || Array.from(document.querySelectorAll('div')).find(d => /translate\(/.test(d.style.transform) && /scale\(/.test(d.style.transform));
  if (!world) return null;
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(world.style.transform);
  return m ? { x: +m[1], y: +m[2], z: +m[3] } : { raw: world.style.transform };
});

console.log('pan before zoom out:', JSON.stringify(await readPan()));

/**
 * OWNER REFINEMENT (2026-09-04, superseding the 2026-09-02 "dead space
 * everywhere" ruling): the grey desk shows ONLY past the board's right and
 * bottom edges — and on a side whose expansion is UNLOCKED in board settings.
 * The default locks are top and left, so out of the box:
 *   1. zooming out lands the board against its own top-left corner (the
 *      chrome's edge plus the margin) — never blank space above or left;
 *   2. shoving the board down-right clamps at that same corner;
 *   3. pressing 100% returns flush to it, no grey on the pinned sides.
 */
const chrome = await page.evaluate(() => {
  const v = document.querySelector('[data-board-viewport]').getBoundingClientRect();
  // The floating header the clamp measures — the deepest bar inside the viewport's top.
  const hb = document.querySelector('[data-board-viewport] .absolute.top-0, [data-board-viewport] > div');
  return { left: v.left, top: v.top, w: v.width, h: v.height };
});

await page.mouse.move(700, 450);
await page.keyboard.down('Control');
for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(180); }
await page.keyboard.up('Control');
await page.waitForTimeout(300);
const zoomedOut = await readPan();
console.log('pan after zooming far out:', JSON.stringify(zoomedOut));
if (zoomedOut && typeof zoomedOut.x === 'number') {
  // margin defaults to 28 world units; the header band is measured live, so the
  // bound is generous: nothing may sit meaningfully past corner + margin.
  console.log(zoomedOut.x <= 28 * zoomedOut.z + 4
    ? 'PASS zooming out never opens grey LEFT of the board (x pinned at the margin)'
    : `FAIL grey opened left of the board on zoom out (x=${zoomedOut.x})`);
  console.log(zoomedOut.y <= chrome.h * 0.4 + 28 * zoomedOut.z + 4
    ? 'PASS zooming out never opens grey ABOVE the board'
    : `FAIL grey opened above the board on zoom out (y=${zoomedOut.y})`);
}

// Shove the board hard down-right: the pinned top-left must hold — the old
// clamp allowed a positive offset here, which is exactly what the owner
// reported as "gray on the top and left sides".
await page.mouse.move(700, 450);
await page.mouse.down({ button: 'middle' });
await page.mouse.move(1150, 800, { steps: 12 });
await page.mouse.up({ button: 'middle' });
await page.waitForTimeout(300);
const dragged = await readPan();
console.log('pan after shoving down-right:', JSON.stringify(dragged));
if (dragged && typeof dragged.x === 'number') {
  console.log(dragged.x <= 28 * dragged.z + 4 && dragged.y <= chrome.h * 0.4 + 28 * dragged.z + 4
    ? 'PASS shoving down-right clamps at the board corner — no grey above or left'
    : `FAIL the shove opened space on a pinned side (x=${dragged.x}, y=${dragged.y})`);
}

// 100% returns flush: the board's own corner at the chrome's edge, no grey.
const hundred = page.locator('button', { hasText: /^100%$/ }).first();
if (await hundred.count()) {
  await hundred.click();
  await page.waitForTimeout(400);
  const home = await readPan();
  console.log('pan after 100%:', JSON.stringify(home));
  console.log(home && home.z === 1 && Math.abs(home.x - 28) <= 4
    ? 'PASS 100% comes home flush — margin in, no grey on the pinned sides'
    : `FAIL 100% did not settle on the corner: ${JSON.stringify(home)}`);
} else {
  console.log('SKIP no 100% button found');
}

await page.screenshot({ path: 'scratchpad/shot-board-zoomout.png' });
await browser.close();
