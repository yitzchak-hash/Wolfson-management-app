// Recon: what the building project actually looks like on a phone today.
// iPhone 14-ish profile with touch, seeded logged-in user + REAL default
// Wolfson data (no apartments override, so the full 168-unit diagram renders).
import { chromium, devices } from 'playwright';

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

const shots = [
  ['/project', 'mob-project-top'],
  ['/dashboard', 'mob-dashboard'],
  ['/tasks', 'mob-tasks'],
];
for (const [route, name] of shots) {
  await page.goto('http://localhost:5173' + route);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `scratchpad/${name}.png` });
  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${route}: horizontal overflow ${over}px`);
}

// Scroll into the diagram body and open an apartment to see the drawer.
await page.goto('http://localhost:5173/project');
await page.waitForTimeout(1400);
await page.mouse.wheel(0, 500);
await page.waitForTimeout(400);
await page.screenshot({ path: 'scratchpad/mob-project-mid.png' });

// Measure a diagram cell's real size on screen.
const cell = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[class*="cursor-pointer"]')];
  const c = els.find(e => /^\s*1\s*$/m.test(e.textContent ?? '') && e.getBoundingClientRect().width < 200);
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
});
console.log('sample apartment cell size:', JSON.stringify(cell));

await browser.close();
