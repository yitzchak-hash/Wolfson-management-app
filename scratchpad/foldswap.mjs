// The Fold's own gesture: the screen CHANGES SIZE under the running app.
//
// Folding/unfolding (and rotating the big screen) crosses the md line while
// every page is mounted — usePhone and the md: classes must swap the chrome
// live, with nothing crashing and no stale layout left behind. A phone or an
// iPad never does this; only a foldable does.
import { chromium, devices } from 'playwright';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from './seed.mjs';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(b, {});
let fails = 0;
const check = (ok, label, extra = '') =>
  { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? '  (' + extra + ')' : ''}`); if (!ok) fails++; };

const ctx = await b.newContext({
  viewport: { width: 344, height: 882 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  userAgent: devices['iPhone 13'].userAgent,
});
await applySeed(ctx, blob, {});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

const phoneChrome = () => page.evaluate(() => {
  const bars = [...document.querySelectorAll('nav')].filter(n => n.offsetHeight > 0 &&
    n.getBoundingClientRect().bottom > innerHeight - 90);
  const sidebar = [...document.querySelectorAll('*')].some(el =>
    el.children.length === 0 && el.textContent.trim() === 'Dashboard' &&
    el.getBoundingClientRect().left < 160 && el.offsetHeight > 0 &&
    el.getBoundingClientRect().top < innerHeight - 120);
  return { bottomBar: bars.length > 0, sidebar };
});

// closed: the cover screen is a phone
await page.goto('http://localhost:5173/project');
await page.waitForTimeout(2500);
let c = await phoneChrome();
check(c.bottomBar && !c.sidebar, 'closed (344 wide): phone chrome — bottom bar, no sidebar', JSON.stringify(c));

// unfold: 690 wide is STILL the phone layout, just roomier
await page.setViewportSize({ width: 690, height: 829 });
await page.waitForTimeout(1200);
c = await phoneChrome();
check(c.bottomBar && !c.sidebar, 'unfolded (690 wide): still phone chrome', JSON.stringify(c));

// turn the open Fold sideways: 829 wide crosses the md line → desktop chrome
await page.setViewportSize({ width: 829, height: 690 });
await page.waitForTimeout(1200);
c = await phoneChrome();
check(!c.bottomBar && c.sidebar, 'sideways (829 wide): desktop chrome — sidebar, no bottom bar', JSON.stringify(c));

// and back to closed, mid-session, with the drawer OPEN across the change
await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().click();
await page.waitForTimeout(1000);
const wide = await page.locator('.drawer-panel').first().boundingBox();
check(!!wide && wide.width > 700, 'sideways: the apartment opens as the desktop modal', wide ? `w=${Math.round(wide.width)}` : '');
await page.setViewportSize({ width: 344, height: 882 });
await page.waitForTimeout(1200);
const narrow = await page.locator('.drawer-panel').first().boundingBox();
check(!!narrow && narrow.width <= 346, 'fold it closed mid-look: the same window becomes the full-screen phone sheet',
  narrow ? `w=${Math.round(narrow.width)}` : 'gone');

// the worker's portal across an unfold
await page.goto(`http://localhost:5173/c/${PORTAL_TOKEN}`);
await page.waitForTimeout(2500);
await page.setViewportSize({ width: 690, height: 829 });
await page.waitForTimeout(1000);
const portalOk = await page.evaluate(() => document.body.innerText.includes('tasks'));
check(portalOk, 'the worker portal survives unfolding mid-look');

check(errors.length === 0, 'no page errors across all five size changes', errors.slice(0, 2).join(' | '));

console.log(fails ? `\n${fails} FAILED` : '\nall good');
await b.close();
process.exit(fails ? 1 : 0);
