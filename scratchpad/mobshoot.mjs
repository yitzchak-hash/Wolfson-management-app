// Full-page phone renders of every screen, for the preview page.
//
// Why images and not live iframes: a captured page is ~650KB with a 110KB
// inline stylesheet, and an iframe holding one lays out correctly and then
// never paints — verified against a trivial srcdoc that paints fine, so it is
// the document, not the technique. An image of a fullPage render is
// pixel-exact, always draws, and dropped into a fixed-height frame with
// overflow-y:auto it SCROLLS exactly like the phone does. The editable HTML
// ships beside it.
import { chromium, devices } from 'playwright';
import { writeFileSync } from 'fs';
import { realisticWolfson, applySeed } from './seed.mjs';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);

const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  userAgent: devices['iPhone 13'].userAgent,
});
await ctx.route('**://drive.google.com/**', r => r.abort());
await applySeed(ctx, blob);
const page = await ctx.newPage();

async function go(route, ms = 1700) {
  await page.goto('http://localhost:5173' + route);
  await page.waitForTimeout(ms);
}
/**
 * A long screenshot — the whole page, not the first screen.
 *
 * The app is a fixed 100dvh frame that scrolls INSIDE `main`, so the document
 * never grows and `fullPage` returns exactly one viewport. Lifting the height
 * constraint for the shot lets the real content lay out at its natural height;
 * the width, which is what a phone layout actually depends on, is untouched.
 * `full: false` keeps the single-screen shot for overlays (a sheet, a modal),
 * which have nothing to unroll.
 */
async function shoot(name, opts = {}) {
  const long = opts.full !== false;
  if (long) {
    await page.evaluate(() => {
      const root = document.querySelector('#root > div');
      if (root) { root.style.height = 'auto'; root.style.maxHeight = 'none'; root.style.minHeight = '0'; }
      document.querySelectorAll('main, main > div').forEach(el => {
        el.style.overflow = 'visible';
        el.style.maxHeight = 'none';
      });
    });
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `scratchpad/pv-${name}.png`, fullPage: long });
  console.log(`pv-${name}.png`);
}

await go('/project');           await shoot('diagram');
await page.getByRole('button', { name: /Filters/ }).tap();
await page.waitForTimeout(600);  await shoot('filters', { full: false });
await page.keyboard.press('Escape');

await go('/project');
await page.locator('[class*="cursor-pointer"]').filter({ hasText: /Cohen|Topper|Nahon/ }).first().tap();
await page.waitForTimeout(1100); await shoot('apartment', { full: false });

await go('/dashboard');         await shoot('dashboard');
await go('/tasks');             await shoot('tasks');
await go('/project-calendar');  await shoot('calendar');
await go('/reports');           await shoot('reports', { full: false });
await go('/activity');          await shoot('activity');

await go('/settings');          await shoot('settings');

await browser.close();
console.log('done');
