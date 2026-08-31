// Probe for this round's TV fixes:
//  1. the overdue pill opens its list on the DIAGRAM view (it used to render
//     nothing there), and closing it stays on that view;
//  2. a unit-card tap on the board view travels to Wolfson, opens the job
//     window, and CLOSING it returns to the board view (the return ticket).
import { chromium } from 'playwright';
import { realisticWolfson, applySeed } from './seed.mjs';

const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ok', name); } else { fail++; console.log('  FAIL', name); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const blob = await realisticWolfson(browser);
const data = JSON.parse(blob);
// An overdue task so the pill exists.
const apt = data.apartments.find(a => a.apartmentNumber === '5' && a.buildingId === 'A1') ?? data.apartments[10];
data.contractorAssignments = [{
  id: 'T-over-1', apartmentId: apt.id, buildingId: apt.buildingId, contractorId: 'C-x',
  taskDescription: 'Overdue probe task', dueDate: '2026-08-01', completedAt: null,
  createdAt: '2026-07-01T09:00:00Z', priority: 'normal',
}];

const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await applySeed(ctx, JSON.stringify(data));
// A general workspace holding one unit-card pointing at the Wolfson apartment.
await ctx.addInitScript(([aptId]) => {
  localStorage.setItem('general_app_data', JSON.stringify({
    apartments: [],
    canvasElements: [{
      id: 'CE-probe-unit', type: 'widget', widget: 'unit-card',
      x: 300, y: 300, w: 230, h: 120, text: '', color: '#ffffff',
      data: { projectId: 'wolfson', aptId },
    }],
  }));
}, [apt.id]);
const page = await ctx.newPage();

// ── 1. Overdue pill on the diagram view ──
await page.goto('http://localhost:5173/tv?view=wolfson');
await page.waitForTimeout(3500);
const pill = page.locator('[data-tv-overdue]');
ok(await pill.count() === 1, 'overdue pill on diagram view');
await pill.click();
await page.waitForTimeout(600);
ok(await page.getByText('Overdue here').count() > 0, 'overdue list opened on diagram view');
await page.screenshot({ path: `${SCRATCH}/tv-overdue-diagram.png` });
// Close it — the wall must stay on the diagram.
await page.keyboard.press('Escape').catch(() => {});
const closeBtn = page.locator('div.fixed.z-\\[210\\] button').first();
if (await page.getByText('Overdue here').count()) await closeBtn.click();
await page.waitForTimeout(400);
ok((await page.url()).includes('view=wolfson'), 'still on the diagram view after closing');

// ── 2. Unit card travel + return ticket on the board view ──
await page.goto('http://localhost:5173/tv?view=general');
await page.waitForTimeout(3500);
await page.screenshot({ path: `${SCRATCH}/tv-board-unitcard.png` });
const card = page.locator('[data-node-id="CE-probe-unit"] button.w-full').first();
const cardAny = (await card.count()) ? card : page.getByText(apt.displayName || apt.apartmentNumber).first();
ok(await cardAny.count() > 0, 'unit card drawn on TV board');
await cardAny.click();
await page.waitForTimeout(2500);
ok((await page.url()).includes('view=wolfson'), 'travelled to wolfson view');
const drawer = page.locator('.drawer-panel');
ok(await drawer.count() > 0, 'job window opened over the wall');
await page.screenshot({ path: `${SCRATCH}/tv-travel-drawer.png` });
// Close with the X (first button in the drawer header area with title Close?)
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
ok(await drawer.count() === 0 || !(await drawer.first().isVisible().catch(() => false)), 'job window closed');
ok((await page.url()).includes('view=general'), 'returned to the Job Board view after closing');
await page.screenshot({ path: `${SCRATCH}/tv-returned.png` });

console.log(`\n${pass} ok · ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
