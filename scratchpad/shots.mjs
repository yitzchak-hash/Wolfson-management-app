// Screenshots + overflow/overlap audit of the real app at phone size, on
// REALISTIC data (family names and stages set) — see seed.mjs for why that
// matters more than anything else in this file.
import { chromium, devices } from 'playwright';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from './seed.mjs';

const only = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser, { hebrew: process.env.LANG_HE === '1' });

// Landscape is not a special case of the phone — it is the phone rotated, and
// the owner asked for it across the WHOLE app, not just the markup studio.
// VIEW=landscape runs the identical sweep at 844x390.
const LANDSCAPE = process.env.VIEW === 'landscape';
// W=360 is a common Android, 375 an iPhone SE/mini. Thirty pixels less than
// the 390 everything was built against is exactly where a row that "just
// fits" stops fitting, so the sweep has to be runnable at each.
const W = Number(process.env.W) || 390;
const HEBREW = process.env.LANG_HE === '1';
const VW = LANDSCAPE ? 844 : W;
const VH = LANDSCAPE ? 390 : 844;
const TAG = (LANDSCAPE ? 'land-' : W !== 390 ? `w${W}-` : '') + (HEBREW ? 'he-' : '');
const ctx = await browser.newContext({
  viewport: { width: VW, height: VH },
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  userAgent: devices['iPhone 13'].userAgent,
});
await applySeed(ctx, blob, { hebrew: HEBREW });
const page = await ctx.newPage();

async function audit(label) {
  return await page.evaluate((label) => {
    const out = { label, overflow: [], clipped: [], overlap: [] };
    const vw = document.documentElement.clientWidth;
    const vis = el => {
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    };
    // A wide table inside its own overflow-x container is CORRECT — it scrolls
    // sideways on purpose. Counting it reports the app's own scroller as a
    // fault, which is this harness's standing failure mode. Only flag things
    // that push the PAGE sideways.
    // ...but the exemption only holds if the SCROLLER ITSELF fits on screen.
    // The first version just asked "is there a scrolling ancestor", which the
    // page container also satisfies — so it excused the whole settings page
    // while it was visibly running off the right edge. A scroll box that is
    // itself too wide is not a scroll box, it is the bug.
    const inScroller = el => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll') {
          return p.getBoundingClientRect().right <= vw + 1.5;
        }
      }
      return false;
    };
    const inBoardWorld = el => !!el.closest?.('[data-board-viewport]');
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || !vis(el)) continue;
      if (inBoardWorld(el)) continue; // pannable canvas content — reachable by design
      if (r.right > vw + 1.5 && r.width < vw * 3 && !inScroller(el)) {
        out.overflow.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), right: Math.round(r.right) });
      }
    }
    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (el.children.length) continue;
      const t = (el.textContent || '').trim();
      if (!t || !vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const cs = getComputedStyle(el);
      // Clipped sideways, OR taller than the box that holds it (the overlap
      // failure: wrapped text spilling out over its neighbour).
      // A `truncate` element is cut off ON PURPOSE — a one-line summary that
      // ends in an ellipsis is a design decision, and it does the same on a
      // desktop. Flagging those buries the accidental clipping in noise.
      const deliberate = (el.className || '').toString().includes('truncate');
      if (!deliberate && el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible') {
        out.clipped.push({ text: t.slice(0, 22), w: `${el.scrollWidth}>${el.clientWidth}` });
      }
      if (el.scrollHeight > el.clientHeight + 1 && cs.overflow !== 'visible') {
        out.clipped.push({ text: t.slice(0, 22), h: `${el.scrollHeight}>${el.clientHeight}` });
      }
    }
    return out;
  }, label);
}

async function shot(name, url, prep) {
  if (only.length && !only.includes(name)) return;
  await page.goto('http://localhost:5173' + url);
  await page.waitForTimeout(1600);
  if (prep) { try { await prep(); } catch (e) { console.log(`  prep failed on ${name}: ${e.message.split('\n')[0]}`); } }
  await page.screenshot({ path: `scratchpad/shot-${TAG}${name}.png` });
  const a = await audit(name);
  const bad = a.overflow.length + a.clipped.length;
  console.log(`${bad === 0 ? 'OK  ' : 'FAIL'} ${TAG}${name}  overflow=${a.overflow.length} clipped=${a.clipped.length}`);
  a.overflow.slice(0, 5).forEach(o => console.log(`       > ${o.tag}.${o.cls} right=${o.right}`));
  a.clipped.slice(0, 6).forEach(o => console.log(`       ~ "${o.text}" ${o.w ?? o.h}`));
}

await shot('diagram', '/project');
await shot('drawer', '/project', async () => {
  await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().tap();
  await page.waitForTimeout(1100);
});
for (const tab of ['Tasks', 'Notes', 'Photos', 'History']) {
  await shot(`drawer-${tab.toLowerCase()}`, '/project', async () => {
    await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().tap();
    await page.waitForTimeout(1000);
    await page.locator('.drawer-panel button', { hasText: new RegExp(`^${tab}`) }).first().tap();
    await page.waitForTimeout(700);
  });
}
await shot('dashboard', '/dashboard');
await shot('tasks', '/tasks');
await shot('pcalendar', '/project-calendar');
await shot('reports', '/reports');
await shot('settings', '/settings');
await shot('appsettings', '/app-settings');

// The screens the sweep never covered: the all-workspace calendar, the change
// log, and — the big one — the BOARD. A canvas's content extends past the
// screen BY DESIGN (you pan to it), so inside [data-board-viewport] only
// CLIPPED TEXT counts as a fault and raw overflow is expected; the chrome
// around the canvas is still measured in full.
await shot('gcalendar', '/calendar');
await shot('activity', '/activity');
await shot('board', '/jobs', async () => {
  // /jobs on the Wolfson workspace redirects to /project, and a hand-written
  // localStorage patch is overwritten by the app's own flush-on-unload (the
  // standing harness trap in CLAUDE.md) — so switch workspaces the way a
  // person does: through the header's workspace dropdown.
  await page.locator('header button', { hasText: /Wolfson/ }).first().tap();
  await page.waitForTimeout(500);
  await page.getByRole('menu').getByText(/Job Board/).first().tap();
  await page.waitForTimeout(2200);
  // A shot of the wrong page passes every check, so assert the board is
  // actually on screen before measuring it.
  const ok = await page.locator('[data-board-viewport]').count();
  if (!ok) throw new Error('board did not open — still on the diagram');
});

// The worker portal — the one screen that genuinely lives on a phone, and the
// one that had never been measured on one.
await shot('portal', `/c/${PORTAL_TOKEN}`);
await shot('portal-task', `/c/${PORTAL_TOKEN}`, async () => {
  await page.locator('button, [role=button]').filter({ hasText: /concealed unit|registers|thermostats/i }).first().tap();
  await page.waitForTimeout(900);
});
await shot('portal-map', `/c/${PORTAL_TOKEN}`, async () => {
  await page.locator('button').filter({ hasText: /Building Map|מפת/i }).first().tap();
  await page.waitForTimeout(1100);
});

await browser.close();
