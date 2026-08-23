// The per-TV setup, as far as this container can prove it (no Firebase here):
// the settings TV tab renders the live-TVs section without crashing and says
// honestly that no TV has reported; the /tv page mints a PERMANENT screen id;
// the wall's section box wears the board's header-bar look.
import { chromium } from 'playwright';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('general_app_data')) {
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
      apartments: [], stages: [], contractors: [], contractorAssignments: [],
      canvasElements: [
        { id: 'CE-orange', type: 'box', x: 300, y: 120, w: 900, h: 600, text: 'TV area', color: '#f97316' },
      ],
    }));
  }
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });

// ── the wall: box header bar, and a stable screen id ────────────────────────
await page.goto('http://localhost:5173/tv');
await page.waitForTimeout(3000);
const wall = await page.evaluate(() => {
  const header = [...document.querySelectorAll('div')].find(d =>
    (d.textContent || '').trim() === 'TV area' && /rounded-t-xl/.test(d.className));
  const bg = header ? getComputedStyle(header).backgroundColor : '';
  return { header: !!header, bg, id1: localStorage.getItem('tv_screen_id') };
});
check(wall.header && /rgba/.test(wall.bg),
  'the section box wears the board’s tinted header BAR on the wall', wall.bg);
check(!!wall.id1 && /^TVS-/.test(wall.id1), 'the panel minted itself a screen id', String(wall.id1));
await page.reload();
await page.waitForTimeout(2000);
const id2 = await page.evaluate(() => localStorage.getItem('tv_screen_id'));
check(id2 === wall.id1, 'and the id survives a reload — this panel is always this panel');

// ── settings: the live-TVs section stands, honest with no Firebase ──────────
await page.goto('http://localhost:5173/app-settings');
await page.waitForTimeout(1500);
await page.locator('button', { hasText: /^TV$/ }).first().click();
await page.waitForTimeout(800);
const text = await page.evaluate(() => document.body.textContent || '');
check(/Your TVs, live/.test(text), 'the TV tab has the live-TVs section');
check(/What the TV shows \(default\)/.test(text), 'and the old picker is labelled as the default');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
