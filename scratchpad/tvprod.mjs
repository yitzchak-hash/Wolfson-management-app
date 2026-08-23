import { chromium } from 'playwright';
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  proxy: proxy ? { server: proxy } : undefined,
  args: ['--ignore-certificate-errors'],
});
const page = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 400)));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
try {
  await page.goto('https://wolfson-management-app.vercel.app/tv', { timeout: 30000 });
  await page.waitForTimeout(8000);
  const out = await page.evaluate(() => ({
    kids: document.getElementById('root')?.children.length ?? 0,
    txt: (document.body.innerText || '').slice(0, 300).replace(/\n/g, ' | '),
  }));
  console.log('ROOT KIDS', out.kids);
  console.log('TEXT', out.txt || '(empty — white)');
  await page.screenshot({ path: 'scratchpad/tvprod.png' });
} catch (e) { console.log('NAV FAIL', e.message.slice(0, 200)); }
errs.slice(0, 10).forEach(e => console.log(e));
await b.close();
