// Reproduce the production white /tv: several storage states against the BUILT bundle.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function probe(name, init) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });
  await page.goto('http://localhost:4173/tv');
  await page.waitForTimeout(3500);
  const out = await page.evaluate(() => {
    const rootKids = document.getElementById('root')?.children.length ?? 0;
    const txt = (document.body.innerText || '').slice(0, 120).replace(/\n/g, ' | ');
    // Sample the page: how much of it is pure white?
    return { rootKids, txt, title: document.title };
  });
  const shot = `scratchpad/tvwhite-${name}.png`;
  await page.screenshot({ path: shot });
  console.log(`── ${name}: rootKids=${out.rootKids} text="${out.txt}"`);
  errs.slice(0, 6).forEach(e => console.log('   ', e));
  await ctx.close();
}

await probe('empty', null);
await probe('wolfson-active', () => { localStorage.setItem('active_project', 'wolfson'); localStorage.setItem('wolfson_app_version', '3'); });
await probe('general-empty-board', () => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('general_app_data', JSON.stringify({ apartments: [], canvasElements: [] }));
});
await b.close();
