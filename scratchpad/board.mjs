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
 * OWNER FINAL RULING (2026-09-07): the STARTING corner — top-left — is
 * locked to the viewport; the desk shows past the RIGHT and BOTTOM edges.
 * Zooming out continues until the WHOLE board is on screen, landing it
 * against the top-left corner with desk right and below.
 */
const geom = () => page.evaluate(() => {
  const v = document.querySelector('[data-board-viewport]').getBoundingClientRect();
  const w = document.querySelector('[data-board-world]').getBoundingClientRect();
  const hb = document.querySelector('[data-board-viewport] [class*="absolute"]');
  return {
    vp: { left: v.left, top: v.top, right: v.right, bottom: v.bottom },
    world: { left: w.left, top: w.top, right: w.right, bottom: w.bottom },
  };
});

await page.mouse.move(700, 450);
await page.keyboard.down('Control');
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(180); }
await page.keyboard.up('Control');
await page.waitForTimeout(400);
const zo = await geom();
const zoPan = await readPan();
console.log('zoomed out:', JSON.stringify({ pan: zoPan, world: zo.world }));
console.log(Math.abs(zo.world.left - zo.vp.left) <= 3
  ? 'PASS zoomed out, the board is flush LEFT — no grey strip there'
  : `FAIL grey opened left of the board (world.left=${zo.world.left} vp.left=${zo.vp.left})`);
console.log(zo.world.right <= zo.vp.right + 3 && zo.world.bottom <= zo.vp.bottom + 3
  ? 'PASS the WHOLE board is on screen, desk showing right and below'
  : `FAIL the board does not fully fit at the ladder floor: ${JSON.stringify(zo.world)}`);
console.log(zo.world.top >= zo.vp.top - 3
  ? 'PASS and no grey above the board'
  : `FAIL the board slid above the viewport (top=${zo.world.top})`);

// Shove the board down-right: the pinned LEFT edge holds (no grey opens
// left), and the min-visibility clamp keeps a bite of board on screen.
await page.mouse.move(700, 450);
await page.mouse.down({ button: 'middle' });
await page.mouse.move(1150, 800, { steps: 12 });
await page.mouse.up({ button: 'middle' });
await page.waitForTimeout(300);
const dragged = await geom();
console.log('after shoving down-right:', JSON.stringify(dragged.world));
console.log(dragged.world.left <= dragged.vp.left + 3
  ? 'PASS the pinned left edge holds — no grey opens left of the board'
  : `FAIL the shove opened grey left of the board (left=${dragged.world.left})`);

// 100% returns flush: the world's own corner at the chrome's edge — x at 0,
// no desk strip held open on the pinned top.
const hundred = page.locator('button', { hasText: /^100%$/ }).first();
if (await hundred.count()) {
  await hundred.click();
  await page.waitForTimeout(400);
  const home = await readPan();
  console.log('pan after 100%:', JSON.stringify(home));
  console.log(home && home.z === 1 && Math.abs(home.x) <= 3
    ? 'PASS 100% comes home flush to the corner'
    : `FAIL 100% did not settle on the corner: ${JSON.stringify(home)}`);
} else {
  console.log('SKIP no 100% button found');
}

await page.screenshot({ path: 'scratchpad/shot-board-zoomout.png' });
await browser.close();
