// Screenshots of the real app at phone size, so the mobile view can be LOOKED at
// rather than reasoned about. Writes PNGs into scratchpad/shot-*.png.
import { chromium, devices } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
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

// Horizontal overflow + overlapping-control report for the current page.
async function audit(label) {
  return await page.evaluate((label) => {
    const out = { label, overflow: [], overlaps: [], tiny: [] };
    const vw = document.documentElement.clientWidth;
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      if (r.right > vw + 1.5 && r.width < vw * 3) {
        out.overflow.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 70), right: Math.round(r.right) });
      }
    }
    // Any element whose own text is clipped by its box.
    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (el.children.length) continue;
      const t = (el.textContent || '').trim();
      if (!t) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible') {
        out.tiny.push({ text: t.slice(0, 24), scroll: el.scrollWidth, client: el.clientWidth });
      }
    }
    return out;
  }, label);
}

async function shot(name, url, prep) {
  await page.goto('http://localhost:5173' + url);
  await page.waitForTimeout(1500);
  if (prep) { try { await prep(); } catch (e) { console.log(`  prep failed on ${name}: ${e.message.split('\n')[0]}`); } }
  await page.screenshot({ path: `scratchpad/shot-${name}.png` });
  const a = await audit(name);
  console.log(`\n== ${name} ==`);
  console.log(`  overflow past 390px: ${a.overflow.length}`);
  a.overflow.slice(0, 6).forEach(o => console.log(`    ${o.tag}.${o.cls} → right ${o.right}`));
  console.log(`  clipped text nodes: ${a.tiny.length}`);
  a.tiny.slice(0, 8).forEach(o => console.log(`    "${o.text}" ${o.scroll}>${o.client}`));
}

await shot('diagram', '/project');
await shot('diagram-scrolled', '/project', async () => {
  await page.evaluate(() => window.scrollTo(0, 420));
  await page.waitForTimeout(300);
});
await shot('drawer', '/project', async () => {
  const cell = page.locator('[class*="cursor-pointer"]', { hasText: /^49/ }).first();
  await cell.tap();
  await page.waitForTimeout(1000);
});
// Every drawer tab, since "everything on desktop must be on mobile" includes
// the four tabs behind Details.
for (const tab of ['Tasks', 'Notes', 'Photos', 'History']) {
  await shot(`drawer-${tab.toLowerCase()}`, '/project', async () => {
    await page.locator('[class*="cursor-pointer"]', { hasText: /^49/ }).first().tap();
    await page.waitForTimeout(900);
    await page.locator('.drawer-panel button', { hasText: new RegExp(`^${tab}`) }).first().tap();
    await page.waitForTimeout(700);
  });
}

await shot('dashboard', '/dashboard');
await shot('tasks', '/tasks');
await shot('pcalendar', '/project-calendar');
await shot('reports', '/reports');

await browser.close();
console.log('\ndone');
