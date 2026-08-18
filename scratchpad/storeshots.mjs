// Eyeball run: screenshots of the rebuilt store — categories mode, the flat
// "One list" mode, and close-ups of the cards the owner's PDF flagged.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2600);
await page.locator('button[title]').filter({ hasText: /^Store$/ }).first().click();
await page.waitForTimeout(1800);

const shot = (n) => `/tmp/claude-0/-home-user-Wolfson-management-app/abdf9b8b-90ff-58aa-abde-c84b697bcb19/scratchpad/${n}.png`;
await page.screenshot({ path: shot('store-cats-top') });

// The cards his PDF showed empty — scroll each into view and snap it.
for (const id of ['due-today', 'timeline', 'job-find', 'gone-quiet', 'board-mini']) {
  const card = page.locator(`[data-widget-id="${id}"]`).first();
  if (await card.count()) {
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await card.screenshot({ path: shot(`store-${id}`) });
  }
}
// The workspace cards at the bottom.
await page.locator('h3', { hasText: /From your other workspaces/i }).first()
  .scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: shot('store-workspaces') });

// Flat mode.
await page.locator('button', { hasText: /^One list$/ }).first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: shot('store-flat') });

console.log('done');
await b.close();
