// The owner's "press Add Task on a job that's on the calendar and it just
// exits the window and takes me back to the job board". A Wolfson unit
// reached from the Job Board carries a RETURN TICKET, and the drawer's Add
// Task used to close the drawer through the host's onClose — which redeems
// the ticket — before the task panel could mount. Now: Add Task hands over
// without closing through the host, the panel opens on the Wolfson page, and
// the ticket is redeemed when the PANEL closes.
import { chromium } from 'playwright';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => {
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('active_project', 'general');
  const user = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const contractors = [{ id: 'C-a', name: 'Motti', category: 'general', token: 't1', active: true, createdAt: '2026-01-01' }];
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors, stages: [],
    apartments: [{
      id: 'W-1', buildingId: 'A1', floor: 2, apartmentNumber: '5', displayName: 'Artzi', isUnnamed: false,
      classification: 'standard', createdAt: '2026-01-01', currentStageId: null,
      driveLink: 'https://drive.google.com/drive/folders/1abcDEF',
    }],
    contractorAssignments: [],
  }));
  localStorage.setItem('general_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors, stages: [],
    apartments: [], contractorAssignments: [],
    canvasElements: [
      { id: 'CE-unit', type: 'widget', widget: 'unit-card', x: 80, y: 200, w: 230, h: 110,
        text: '', color: '#ffffff', data: { projectId: 'wolfson', aptId: 'W-1' } },
    ],
  }));
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
// No Drive backend here — every route answers nothing.
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(3500);

// Travel: double-click the unit card → Wolfson, drawer open.
const card = await page.locator('[data-node-id="CE-unit"]').boundingBox();
check(!!card, 'the unit card is on the board');
await page.mouse.dblclick(card.x + card.width / 2, card.y + card.height / 2);
await page.waitForTimeout(2500);
check(page.url().endsWith('/project') && (await page.locator('.drawer-panel').count()) > 0,
  'the card travels to Wolfson and opens the job window', page.url());

// Tasks tab → Add Task.
await page.locator('.drawer-panel button:has-text("Tasks")').first().click();
await page.waitForTimeout(800);
await page.locator('.drawer-panel [data-drawer-add-task]').click();
await page.waitForTimeout(1200);
const after = {
  url: page.url(),
  // The task panel wears .drawer-panel too — read the DRAWER by its own button.
  drawer: await page.locator('[data-drawer-add-task]').count(),
  panel: await page.locator('[data-create-task]').count(),
  ws: await page.evaluate(() => localStorage.getItem('active_project')),
};
check(after.url.endsWith('/project') && after.ws === 'wolfson', 'Add Task keeps you in Wolfson', `${after.url} / ${after.ws}`);
check(after.drawer === 0, 'the job window closed to make room for the task panel');
check(after.panel > 0, 'and the task panel is open', `create buttons ${after.panel}`);

// Close the panel (its backdrop — the panel has no Escape) → home to the
// Job Board: the ticket, redeemed after the task, not before.
await page.locator('.drawer-overlay').last().click({ position: { x: 8, y: 8 } });
await page.waitForTimeout(1500);
const home = { url: page.url(), ws: await page.evaluate(() => localStorage.getItem('active_project')) };
check(home.url.endsWith('/jobs') && home.ws === 'general', 'closing the task panel goes back to the Job Board', `${home.url} / ${home.ws}`);

// And an ordinary Wolfson visit (no ticket) — Add Task, then closing the
// panel stays on Wolfson.
await page.goto('http://localhost:5173/project');
await page.waitForTimeout(2500);
await page.evaluate(() => { localStorage.setItem('active_project', 'wolfson'); });
await page.goto('http://localhost:5173/project');
await page.waitForTimeout(3000);
await page.locator('[data-apt-id="W-1"]').first().click();
await page.waitForTimeout(1500);
await page.locator('.drawer-panel button:has-text("Tasks")').first().click();
await page.waitForTimeout(600);
await page.locator('.drawer-panel [data-drawer-add-task]').click();
await page.waitForTimeout(1000);
check((await page.locator('[data-create-task]').count()) > 0, 'a plain Wolfson visit opens the task panel too');
await page.locator('.drawer-overlay').last().click({ position: { x: 8, y: 8 } });
await page.waitForTimeout(1000);
check(page.url().endsWith('/project'), 'and closing it stays on Wolfson (no ticket, no journey)', page.url());
check(errs.length === 0, 'no page errors', errs[0] || '');

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
