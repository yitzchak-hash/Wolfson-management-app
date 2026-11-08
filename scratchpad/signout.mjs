// Sign out always asks first (owner, 2026-11-08: "Sign out should always say first, are you sure, all over the
// place"). On a phone and a computer: the exit icon opens the question; Cancel and Escape keep you in; the red Sign
// out signs out. SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
for (const [tag, vp, mobile] of [['phone', { width: 402, height: 874 }, true], ['pc', { width: 1440, height: 900 }, false]]) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile });
  await applySeed(ctx, blob);
  const p = await ctx.newPage();
  await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2200);
  await p.locator('[data-sign-out]').click(); await p.waitForTimeout(300);
  T(await p.locator('[data-sign-out-ask]').isVisible(), `${tag}: the exit icon asks "Sign out?" first`);
  await p.screenshot({ path: `${OUT}/signout-${tag}.png` });
  await p.locator('[data-sign-out-cancel]').click(); await p.waitForTimeout(300);
  T(!(await p.locator('[data-sign-out-ask]').count()) && await p.locator('[data-sign-out]').isVisible(), `${tag}: Cancel keeps you signed in`);
  await p.locator('[data-sign-out]').click(); await p.waitForTimeout(200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  T(!(await p.locator('[data-sign-out-ask]').count()) && await p.locator('[data-sign-out]').isVisible(), `${tag}: Escape keeps you signed in`);
  await p.locator('[data-sign-out]').click(); await p.waitForTimeout(200);
  await p.locator('[data-sign-out-confirm]').click(); await p.waitForTimeout(1500);
  T(!(await p.locator('[data-sign-out]').count()), `${tag}: the red Sign out signs out`);
  await ctx.close();
}
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
