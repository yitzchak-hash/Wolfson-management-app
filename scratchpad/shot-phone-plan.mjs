import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1180, height: 1000 } });
p.on('pageerror', e => console.log('PAGE ERROR', e.message));
await p.goto('file:///tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad/phone-plan.html');
await p.waitForTimeout(1500);
const h = await p.evaluate(() => document.body.scrollHeight);
for (let i = 0; i * 1000 < h; i++) {
  await p.evaluate(y => window.scrollTo(0, y), i * 1000);
  await p.waitForTimeout(150);
  await p.screenshot({ path: `/tmp/plan-part${i}.png` });
}
console.log('height', h, 'parts', Math.ceil(h / 1000));
await b.close();
