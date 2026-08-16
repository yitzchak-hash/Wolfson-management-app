// Does anything paint OVER a dialog on a phone?
//
// The building name sat on top of the What's New window even though the window
// is z-[260] and the header was z-30 — so the numbers alone do not settle it,
// and only asking the browser what is actually on top does. elementFromPoint
// at a grid of points across the dialog is the test: every one of them must
// resolve to something inside the dialog.
import { chromium, devices } from 'playwright';
import { realisticWolfson, applySeed } from './seed.mjs';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);

async function check(label, url, dialogSel, open) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    userAgent: devices['iPhone 13'].userAgent,
  });
  await applySeed(ctx, blob, { whatsNewSeen: label !== 'whats-new' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173' + url);
  await page.waitForTimeout(1800);
  if (open) { try { await open(page); } catch (e) { console.log(`  open failed: ${e.message.split('\n')[0]}`); } }
  await page.screenshot({ path: `scratchpad/shot-z-${label}.png` });

  const res = await page.evaluate((sel) => {
    const dlg = document.querySelector(sel);
    if (!dlg) return { missing: true };
    const r = dlg.getBoundingClientRect();
    const bad = [];
    for (let i = 1; i <= 6; i++) {
      for (let j = 1; j <= 4; j++) {
        const x = r.left + (r.width * j) / 5;
        const y = r.top + (r.height * i) / 7;
        const top = document.elementFromPoint(x, y);
        if (!top) continue;
        if (!dlg.contains(top) && top !== dlg) {
          bad.push({
            x: Math.round(x), y: Math.round(y),
            tag: top.tagName,
            cls: (top.className || '').toString().slice(0, 50),
            text: (top.textContent || '').trim().slice(0, 20),
          });
        }
      }
    }
    return { rect: { t: Math.round(r.top), h: Math.round(r.height) }, bad };
  }, dialogSel);

  if (res.missing) console.log(`SKIP ${label} — dialog not found (${dialogSel})`);
  else if (!res.bad.length) console.log(`OK   ${label} — nothing paints over the dialog`);
  else {
    console.log(`FAIL ${label} — ${res.bad.length} point(s) covered by something outside it`);
    const seen = new Set();
    for (const b of res.bad) {
      const k = b.tag + b.cls + b.text;
      if (seen.has(k)) continue;
      seen.add(k);
      console.log(`       ${b.tag}.${b.cls} "${b.text}" at ${b.x},${b.y}`);
    }
  }
  await ctx.close();
}

// It does not auto-open — the sparkle in the header opens it, which is what
// the owner had done in the screenshot where the building name covered it.
await check('whats-new', '/project', '.fixed.z-\\[260\\] > div', async p => {
  await p.locator('button[title="What\'s new"]').tap();
  await p.waitForTimeout(700);
  // Step into the deck so a slide with real content is under the test points.
  for (let i = 0; i < 4; i++) {
    await p.getByRole('button', { name: /Next/ }).tap().catch(() => {});
    await p.waitForTimeout(180);
  }
});
await check('drawer', '/project', '.drawer-panel', async p => {
  await p.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().tap();
  await p.waitForTimeout(1000);
});
await check('filters', '/project', '.md\\:hidden.fixed.inset-0.z-50', async p => {
  await p.getByRole('button', { name: /Filters/ }).tap();
  await p.waitForTimeout(600);
});

await browser.close();
