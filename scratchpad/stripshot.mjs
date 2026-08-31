import { chromium } from 'playwright';
const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const p = await (await b.newContext({ viewport: { width: 1100, height: 1400 } })).newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(`file://${SCRATCH}/notebook-strips.html`);
await p.waitForTimeout(1200);
await p.screenshot({ path: `${SCRATCH}/strips-top.png`, fullPage: false });
// Toggle strips mode and shoot section 3.
await p.click('#btn-strips');
await p.waitForTimeout(500);
const meter = await p.locator('#hmeter').innerText();
await p.locator('#modewk').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${SCRATCH}/strips-mode.png` });
// Drag the card onto Sasha's Monday strip.
const card = await p.locator('#dragme').boundingBox();
const strip = await p.locator('[data-strip]').nth(1).boundingBox();
await p.locator('#squishwk').scrollIntoViewIfNeeded();
const c2 = await p.locator('#dragme').boundingBox();
const s2 = await p.locator('[data-strip]').nth(1).boundingBox();
await p.mouse.move(c2.x + 40, c2.y + 10);
await p.mouse.down();
for (let i = 1; i <= 12; i++) {
  await p.mouse.move(c2.x + 40 + ((s2.x + s2.width / 2) - (c2.x + 40)) * i / 12,
                     c2.y + 10 + ((s2.y + s2.height / 2) - (c2.y + 10)) * i / 12);
  await p.waitForTimeout(25);
}
await p.mouse.up();
await p.waitForTimeout(400);
const landed = await p.locator('[data-strip] .pcard').count();
await p.screenshot({ path: `${SCRATCH}/strips-dropped.png` });
console.log('meter:', meter, '| card landed in strip:', landed, '| page errors:', errs);
await b.close();
