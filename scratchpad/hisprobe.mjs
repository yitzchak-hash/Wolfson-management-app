// HIS board, the sidebar probe: what does elementFromPoint answer over every
// nav button, and does a real click land?
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const payload = readFileSync('/tmp/claude-0/-home-user-Wolfson-management-app/99bdbf4a-e40f-5735-845d-1466af88b019/scratchpad/his-general.json', 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(p => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('general_app_data', p);
}, payload);
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 300)));
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(5000);

const probe = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('aside a').forEach(a => {
    const r = a.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const covered = at && !a.contains(at) && at !== a;
    let desc = '';
    if (covered) {
      let n = at; const chain = [];
      while (n && n !== document.body && chain.length < 7) {
        const cls = String(n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className || '');
        chain.push(n.tagName.toLowerCase()
          + (n.id ? '#' + n.id : '')
          + Object.keys(n.dataset || {}).map(k => `[data-${k}]`).join('')
          + (cls ? '.' + cls.split(' ').slice(0, 5).join('.') : ''));
        n = n.parentElement;
      }
      desc = chain.join('  <<  ');
    }
    out.push({ href: a.getAttribute('href'), covered: !!covered, by: desc.slice(0, 400) });
  });
  return out;
});
probe.forEach(p => console.log(p.covered ? 'COVERED' : 'ok     ', p.href, '\n   ', p.by));

await page.locator('aside a[href="/dashboard"]').click({ timeout: 3000 })
  .catch(e => console.log('CLICK FAILED:', e.message.split('\n')[0]));
await page.waitForTimeout(1500);
console.log('after click, path =', await page.evaluate(() => location.pathname));
await page.screenshot({ path: '/tmp/claude-0/-home-user-Wolfson-management-app/99bdbf4a-e40f-5735-845d-1466af88b019/scratchpad/hisboard.png' });
await b.close();
