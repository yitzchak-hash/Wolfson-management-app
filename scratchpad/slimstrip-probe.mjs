// Probe: nodes in a multi-selection wear only TINY lock/focus/TV; a single
// selection keeps the full strip.
import { chromium } from 'playwright';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => {
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('active_project', 'general');
  const user = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user, contractors: [] }));
  localStorage.setItem('general_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors: [], apartments: [],
    canvasElements: [0, 1, 2].map(i => ({
      id: `CE-s${i}`, type: 'note', x: 260 + i * 260, y: 320, w: 200, h: 160,
      text: `note ${i}`, color: '#fef9c3',
    })),
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(3000);

const stripInfo = id => page.evaluate(([nid]) => {
  const n = document.querySelector(`[data-node-id="${nid}"]`);
  const strip = n && [...n.children].find(c => c.querySelector && c.querySelector('button[title*="Centre"]'));
  if (!strip) return null;
  const btns = [...strip.querySelectorAll('button')];
  return { count: btns.length, w: Math.round(btns[0].getBoundingClientRect().width) };
}, [id]);

// Single selection: full strip (focus/lock/tv/settings/remove + mic on a note).
const one = await page.locator('[data-node-id="CE-s0"]').boundingBox();
await page.mouse.click(one.x + one.width / 2, one.y + one.height / 2);
await page.waitForTimeout(400);
const single = await stripInfo('CE-s0');
check(!!single && single.count >= 5, `a single selection keeps the full strip (${single?.count} buttons)`);

// Lasso all three (ctrl+drag across them).
await page.keyboard.down('Control');
await page.mouse.move(200, 260);
await page.mouse.down();
for (let i = 1; i <= 8; i++) { await page.mouse.move(200 + i * 110, 260 + i * 40); await page.waitForTimeout(16); }
await page.mouse.up();
await page.keyboard.up('Control');
await page.waitForTimeout(500);
const multi = await Promise.all(['CE-s0', 'CE-s1', 'CE-s2'].map(stripInfo));
check(multi.every(m => m && m.count === 3), `every multi-selected node slims to 3 buttons (${multi.map(m => m?.count)})`);
check(multi.every(m => m && m.w <= 22), `and they are tiny (${multi.map(m => m?.w)}px)`);

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
