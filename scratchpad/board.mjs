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
for (let i = 0; i < 5; i++) {
  await page.locator('button[title*="Zoom out"], button[title*="zoom out"]').first().click().catch(() => {});
  await page.waitForTimeout(200);
}
const after = await readPan();
console.log('pan after zoom out :', JSON.stringify(after));
if (after && typeof after.x === 'number') {
  console.log(after.x <= 0.5 && after.y <= 0.5
    ? 'PASS board stays in its corner when zoomed out'
    : `FAIL board drifted to x=${after.x} y=${after.y} — blank room above/left`);
}

// Zooming out alone can leave pan at 0 without the clamp ever being asked a
// hard question, which would make the check above pass for the wrong reason.
// Push the board hard down-right with a middle-drag: THAT is the gesture the
// old clamp allowed, opening blank room above and to the left.
await page.mouse.move(700, 450);
await page.mouse.down({ button: 'middle' });
await page.mouse.move(1150, 800, { steps: 12 });
await page.mouse.up({ button: 'middle' });
await page.waitForTimeout(300);
const dragged = await readPan();
console.log('pan after shoving down-right:', JSON.stringify(dragged));
if (dragged && typeof dragged.x === 'number') {
  console.log(dragged.x <= 0.5 && dragged.y <= 0.5
    ? 'PASS cannot be shoved off the corner into empty space'
    : `FAIL shoved to x=${dragged.x} y=${dragged.y} — blank room above/left`);
}

await page.screenshot({ path: 'scratchpad/shot-board-zoomout.png' });
await browser.close();
