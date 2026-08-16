// Captures every phone screen as self-contained static HTML.
//
// Not a mockup: the markup and the compiled CSS are lifted out of the running
// app, scripts stripped so nothing is wired, images inlined as data URIs so
// each file stands alone with no server. On the REALISTIC seed (see seed.mjs)
// — family names and stages set — because the whole failure mode of a phone
// layout is content longer than its box, and the bare seed has none.
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

async function grab(file) {
  const html = await page.evaluate(async () => {
    for (const img of Array.from(document.images)) {
      try {
        if (img.src.startsWith('data:') || !img.complete || !img.naturalWidth) continue;
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        img.src = c.toDataURL('image/png');
        img.srcset = '';
      } catch { /* a logo that will not inline must not sink the capture */ }
    }
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script, link[rel="modulepreload"]').forEach(el => el.remove());
    return '<!doctype html>\n' + clone.outerHTML;
  });
  writeFileSync(`scratchpad/cap-${file}.html`, html);
  console.log(`cap-${file}.html  ${(html.length / 1024).toFixed(0)} KB`);
}

async function go(route, ms = 1600) {
  await page.goto('http://localhost:5173' + route);
  await page.waitForTimeout(ms);
}

await go('/project');       await grab('diagram');
await page.getByRole('button', { name: /Filters/ }).tap();
await page.waitForTimeout(500);                    await grab('filters');
await page.keyboard.press('Escape');
await go('/project');
await page.locator('[class*="cursor-pointer"]').filter({ hasText: /Cohen|Topper|Nahon/ }).first().tap();
await page.waitForTimeout(1000);                   await grab('apartment');
await go('/dashboard');     await grab('dashboard');
await go('/tasks');         await grab('tasks');
await go('/project-calendar'); await grab('calendar');
await go('/reports');       await grab('reports');
await go('/activity');      await grab('activity');
await go('/jobs', 2200);    await grab('board');
await go('/settings');      await grab('settings');

await browser.close();
console.log('done');
