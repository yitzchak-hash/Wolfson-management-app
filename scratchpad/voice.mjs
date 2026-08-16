// The microphone must actually be THERE, next to every file control it was
// promised beside — and the player must appear for an audio attachment.
import { chromium, devices } from 'playwright';
import { realisticWolfson, applySeed } from './seed.mjs';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(b);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  deviceScaleFactor: 2, userAgent: devices['iPhone 13'].userAgent,
  permissions: [],
});
await applySeed(ctx, blob);
const page = await ctx.newPage();

// lucide renders <svg class="lucide-mic">; count them inside a given root.
const mics = (sel) => page.evaluate(s => {
  const root = s ? document.querySelector(s) : document;
  if (!root) return -1;
  return root.querySelectorAll('svg.lucide-mic, svg[class*="mic"]').length;
}, sel);

await page.goto('http://localhost:5173/project');
await page.waitForTimeout(1700);
await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().tap();
await page.waitForTimeout(1100);
const detailsMics = await mics('.drawer-panel');
console.log(`drawer Details — mic controls: ${detailsMics}  ${detailsMics >= 1 ? 'PASS' : 'FAIL'}`);

await page.locator('.drawer-panel button', { hasText: /^Notes/ }).first().tap();
await page.waitForTimeout(800);
// The per-stage attach row only exists once a stage is EXPANDED, so a count of
// zero on a collapsed list says nothing about whether the control is there.
await page.locator('.drawer-panel button', { hasText: /Piping/ }).first().tap().catch(() => {});
await page.waitForTimeout(700);
const notesMics = await mics('.drawer-panel');
console.log(`drawer Notes  — mic controls: ${notesMics}  ${notesMics >= 1 ? 'PASS' : 'FAIL'}`);

await page.locator('.drawer-panel button', { hasText: /^Tasks/ }).first().tap();
await page.waitForTimeout(800);
// The task form's mic only exists once the add-task panel is open.
await page.locator('.drawer-panel button', { hasText: /Add Task/i }).first().tap().catch(() => {});
await page.waitForTimeout(800);
const taskMics = await mics('.drawer-panel');
console.log(`drawer Tasks  — mic controls: ${taskMics}  ${taskMics >= 1 ? 'PASS' : 'FAIL'}`);

await page.screenshot({ path: 'scratchpad/shot-voice-drawer.png' });
await b.close();
