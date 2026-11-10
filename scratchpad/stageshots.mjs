// Reference pictures of Settings → Stages and a job window's stages, for the stage-types preview (2026-11-10).
// Dev server on 5173. SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await applySeed(ctx, blob);
await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"files":[]}' }));
const p = await ctx.newPage();
await p.goto('http://localhost:5173/settings?cat=stages'); await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/ref-settings.png` });
await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2500);
await p.locator('[data-view-switch] [data-view="board"]').first().click().catch(() => {}); await p.waitForTimeout(900);
await p.screenshot({ path: `${OUT}/ref-board.png` });
await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1500);
await p.locator('[data-stage-section]').scrollIntoViewIfNeeded().catch(() => {});
await p.screenshot({ path: `${OUT}/ref-job.png` });
await browser.close();
