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
 * OWNER REVERSAL (2026-09-02): dead space is ALLOWED on every side, so zooming
 * out can hold the point under the cursor all the way down. The old checks
 * here asserted the corner pin — the exact behaviour the owner asked to
 * remove — so they now assert the new contract instead:
 *   1. a wheel zoom-out keeps the world point under the cursor;
 *   2. shoving the board down-right IS allowed to open dead space;
 *   3. but the min-visibility clamp keeps a bite of board on screen.
 */
const at = { x: 700, y: 450 };
const worldAt = async () => {
  const p = await readPan();
  // Through the viewport's own rect — the board's pan is measured from the
  // viewport's corner, not the window's.
  const r = await page.evaluate(() => {
    const v = document.querySelector('[data-board-viewport]').getBoundingClientRect();
    return { left: v.left, top: v.top };
  });
  return { x: (at.x - r.left - p.x) / p.z, y: (at.y - r.top - p.y) / p.z, z: p.z };
};
await page.mouse.move(at.x, at.y);
const w0 = await worldAt();
await page.keyboard.down('Control');
await page.mouse.wheel(0, 120);
await page.waitForTimeout(250);
await page.mouse.wheel(0, 120);
await page.waitForTimeout(250);
await page.keyboard.up('Control');
const w1 = await worldAt();
console.log('world under cursor:', JSON.stringify({ before: w0, after: w1 }));
console.log(w1.z < w0.z && Math.abs(w1.x - w0.x) * w1.z < 3 && Math.abs(w1.y - w0.y) * w1.z < 3
  ? 'PASS zooming out holds the point under the cursor'
  : `FAIL zoom-out drifted: ${JSON.stringify(w0)} -> ${JSON.stringify(w1)}`);

// Shove the board hard down-right: dead space must OPEN (the new ruling) and
// the min-visibility clamp must still keep a bite of the board on screen.
const vpW = await page.evaluate(() => document.querySelector('[data-board-viewport]').clientWidth);
await page.mouse.move(700, 450);
await page.mouse.down({ button: 'middle' });
await page.mouse.move(1150, 800, { steps: 12 });
await page.mouse.up({ button: 'middle' });
await page.waitForTimeout(300);
const dragged = await readPan();
console.log('pan after shoving down-right:', JSON.stringify(dragged), 'vpW', vpW);
if (dragged && typeof dragged.x === 'number') {
  console.log(dragged.x > 60
    ? 'PASS dead space opens above-left when the board is shoved — the grey desk shows'
    : `FAIL the board is still pinned to its corner (x=${dragged.x})`);
  console.log(dragged.x <= vpW - 100
    ? 'PASS and the min-visibility clamp keeps the board on screen'
    : `FAIL the board can be flung fully off screen (x=${dragged.x})`);
}

await page.screenshot({ path: 'scratchpad/shot-board-zoomout.png' });
await browser.close();
