// Widgets in Hebrew draw from the node's own left edge (2026-10-08).
// Under dir="rtl" the scaled inner surface used to start at the RIGHT edge
// and its scale (origin 0 0) pushed the drawing off the card — every widget
// in Hebrew showed half its width.
import { chromium } from 'playwright';
const APP = process.env.APP || 'http://localhost:5173';
let fails = 0;
const check = (ok, what, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3'); localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01'); localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const user = { id: 'U-t', name: 'Office', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const w = (id, widget, x, y, ww, h) => ({ id, type: 'widget', widget, x, y, w: ww, h, text: '', color: '#ffffff', data: {} });
  const bins = ['done', 'ready', 'archive', 'trash'].map((k, i) => ({ id: `CE-bin-${k}`, type: 'bin', binKind: k, x: 1500 + i * 200, y: 1400, w: 178, h: 92, text: '', color: '#64748b' }));
  const blob = { users: [user], currentUser: user, contractors: [], apartments: [], contractorAssignments: [],
    mainUiStrings: { isRtl: true },
    canvasElements: [...bins, { id: 'CE-goals-board', type: 'note', x: 2400, y: 1800, w: 100, h: 100, text: '', color: '#fff' },
      w('CE-r1', 'clock', 60, 200, 360, 240), w('CE-r2', 'calc', 460, 200, 300, 380),
      w('CE-r3', 'stage-legend', 800, 200, 360, 260), w('CE-r4', 'who-did-what', 60, 480, 520, 360)] };
  localStorage.setItem('general_app_data', JSON.stringify(blob));
  localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user, mainUiStrings: { isRtl: true } }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);
check(await page.evaluate(() => !!document.querySelector('[dir="rtl"]')), 'the app runs right-to-left');
for (const id of ['CE-r1', 'CE-r2', 'CE-r3', 'CE-r4']) {
  const r = await page.evaluate(id => {
    const node = document.querySelector(`[data-node-id="${id}"]`);
    if (!node) return null;
    const outer = node.querySelector('.relative.w-full.h-full.overflow-hidden');
    const inner = outer?.firstElementChild;
    if (!outer || !inner) return { missing: true };
    const o = outer.getBoundingClientRect(), i = inner.getBoundingClientRect();
    return { oL: Math.round(o.left), oR: Math.round(o.right), iL: Math.round(i.left), iR: Math.round(i.right) };
  }, id);
  check(!!r && !r.missing && Math.abs(r.iL - r.oL) <= 2 && r.iR <= r.oR + 2,
    `${id} draws from its own left edge and fits its card`, JSON.stringify(r));
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
