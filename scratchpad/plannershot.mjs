// The notebook's new week controls: no PUT AWAY strip, tiny add/hide icons
// beside each week's label, bigger month rules.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [],
    canvasElements: [
      { id: 'CE-book', type: 'widget', widget: 'rota', x: 30, y: 120, w: 1180, h: 700,
        text: '', color: '#ffffff',
        data: { title: 'The season', people: ['n:Yaakov', 'n:Igor', 'n:Daniel'],
                firstWeek: '2026-08-16', weekCount: 4,
                cells: { 'n:Yaakov|2026-08-18': [{ id: 'e1', text: 'Pardes 8 am' }],
                         'n:Igor|2026-08-19': [{ id: 'e2', text: 'Goodhardt' }] } } },
    ],
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2800);
const node = page.locator('[data-node-id="CE-book"]');
await node.hover();
await page.waitForTimeout(500);
await node.screenshot({ path: '/tmp/claude-0/-home-user-Wolfson-management-app/abdf9b8b-90ff-58aa-abde-c84b697bcb19/scratchpad/planner-weeks.png' });
console.log('shot done');
await b.close();
