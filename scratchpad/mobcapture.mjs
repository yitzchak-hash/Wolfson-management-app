// Captures the REAL rendered phone pages as self-contained static HTML.
// Not a mockup: the markup and compiled CSS are lifted from the running app,
// scripts stripped (unwired), images inlined as data URIs so the file stands
// alone. Three states: diagram, filters sheet open, apartment window open.
import { chromium, devices } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  userAgent: devices['iPhone 13'].userAgent,
});
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('whats_new_seen', '2026-08-16');
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'Architect Avi', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
  }));
});

async function capture(file) {
  const html = await page.evaluate(async () => {
    // Inline every image so the document needs no server.
    for (const img of Array.from(document.images)) {
      try {
        if (img.src.startsWith('data:') || !img.complete || !img.naturalWidth) continue;
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        img.src = c.toDataURL('image/png');
        img.srcset = '';
      } catch { /* leave it — a missing logo must not sink the capture */ }
    }
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script, link[rel="modulepreload"]').forEach(el => el.remove());
    return '<!doctype html>\n' + clone.outerHTML;
  });
  writeFileSync(file, html);
  console.log(`${file}: ${(html.length / 1024).toFixed(0)} KB`);
}

await page.goto('http://localhost:5173/project');
await page.waitForTimeout(1600);
await capture('scratchpad/cap-diagram.html');

await page.getByRole('button', { name: /Filters/ }).tap();
await page.waitForTimeout(500);
await capture('scratchpad/cap-sheet.html');

await page.keyboard.press('Escape');
await page.locator('div.fixed.inset-0.z-50').tap({ position: { x: 195, y: 60 } }).catch(() => {});
await page.waitForTimeout(400);
const cell = page.locator('[class*="cursor-pointer"]', { hasText: /^49/ }).first();
await cell.tap();
await page.waitForTimeout(900);
await capture('scratchpad/cap-drawer.html');

await browser.close();
console.log('done');
