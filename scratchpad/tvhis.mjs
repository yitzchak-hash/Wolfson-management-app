// HIS data, the BUILT bundle, /tv — catch the white screen red-handed.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const payload = readFileSync('/tmp/claude-0/-home-user-Wolfson-management-app/1901dfb3-8942-57b1-ba4a-bb43e9f6b504/scratchpad/his-general.json', 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(p => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('general_app_data', p);
}, payload);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 500)));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 300)); });
await page.goto('http://localhost:4173/tv');
await page.waitForTimeout(5000);
const out = await page.evaluate(() => ({
  kids: document.getElementById('root')?.children.length ?? 0,
  txt: (document.body.innerText || '').slice(0, 200).replace(/\n/g, ' | '),
}));
console.log('ROOT KIDS', out.kids);
console.log('TEXT', out.txt || '(EMPTY — WHITE)');
errs.slice(0, 8).forEach(e => console.log(e));
await page.screenshot({ path: 'scratchpad/tvhis.png' });
await b.close();
