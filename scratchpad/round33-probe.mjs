// Probe: the portal follows OPEN work across workspaces, the notification
// bell + its admin scope, the map naming its project, the days-range chip,
// and centred notebook cards.
import { chromium } from 'playwright';

const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const day = n => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const sunday = day(-new Date().getDay());
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });

const user = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
const maxC = { id: 'C-max', name: 'Max', category: 'general', token: 'tmax', active: true, createdAt: '2026-01-01',
  perms: { seeDiagrams: true, seeAllApartments: true } };
const wolfApt = { id: 'W-27', buildingId: 'A1', apartmentNumber: '27', floor: 7, displayName: 'Machfoda',
  classification: 'standard', isUnnamed: false, createdAt: '2026-01-01' };
const millerJob = { id: 'G-miller', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Miller',
  classification: 'standard', isUnnamed: false, createdAt: '2026-01-01', canvasX: 420, canvasY: 260 };
const doneTask = (id, when) => ({ id, apartmentId: 'W-27', buildingId: 'A1', contractorId: 'C-max',
  taskDescription: 'thermostats', dueDate: when, completedAt: `${when}T10:00:00Z`, createdAt: '2026-08-01T09:00:00Z', priority: 'normal' });
const gevesTask = { id: 'T-geves', apartmentId: 'G-miller', buildingId: 'G', contractorId: 'C-max',
  taskDescription: 'geves work', dueDate: day(2), days: [day(1), day(2)],
  completedAt: null, createdAt: new Date().toISOString(), priority: 'normal' };

// ── A: a done task must not hide tomorrow's real work ──
{
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await ctx.addInitScript(([wolfA, genA, wTask, gTask, c]) => {
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('active_project', 'wolfson');
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      users: [], contractors: [c], apartments: [wolfA], contractorAssignments: [wTask] }));
    localStorage.setItem('general_app_data', JSON.stringify({
      users: [], contractors: [c], apartments: [genA], contractorAssignments: [gTask] }));
  }, [wolfApt, millerJob, doneTask('T-done', day(0)), gevesTask, maxC]);
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/c/tmax');
  await page.waitForTimeout(3500);
  const ws = await page.evaluate(() => localStorage.getItem('active_project'));
  check(ws === 'general', `the portal walked to the workspace with his OPEN work (${ws})`);
  check(await page.getByText('geves work').count() > 0, "tomorrow's task is on his list");

  // The bell: dot, panel, the tomorrow item, and tapping opens the task.
  check(await page.locator('[data-portal-bell]').count() === 1, 'the header carries the bell');
  check(await page.locator('[data-bell-dot]').count() === 1, 'with a red dot for the unseen update');
  await page.locator('[data-portal-bell]').click();
  await page.waitForTimeout(400);
  const item = page.locator('[data-bell-item]', { hasText: 'geves work' });
  check(await item.count() === 1, 'the panel lists the tomorrow task');
  await item.click();
  await page.waitForTimeout(800);
  check(await page.locator('[data-closing-panel], [data-close-job], .fixed', { hasText: 'geves work' }).count() > 0
    || await page.getByText('geves work').count() > 1,
  'tapping the update opens the task');
  // Opening marked it seen — reload keeps the dot off until something changes.
  await page.reload(); await page.waitForTimeout(2500);
  check(await page.locator('[data-bell-dot]').count() === 0, 'the dot stays off once seen');
  await ctx.close();
}

// ── B: open work HERE holds; a foreign update wears its workspace and travels ──
{
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await ctx.addInitScript(([wolfA, genA, wTask, gTask, c]) => {
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('active_project', 'wolfson');
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      users: [], contractors: [c], apartments: [wolfA], contractorAssignments: [wTask] }));
    localStorage.setItem('general_app_data', JSON.stringify({
      users: [], contractors: [c], apartments: [genA], contractorAssignments: [gTask] }));
  }, [wolfApt, millerJob,
    { ...doneTask('T-open', day(0)), completedAt: null }, gevesTask, maxC]);
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/c/tmax');
  await page.waitForTimeout(3200);
  check((await page.evaluate(() => localStorage.getItem('active_project'))) === 'wolfson',
    'open work in the open workspace still holds him there');

  // The map names its project and building out loud.
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('button')].find(b => /Building Map|מפת הבניין/i.test(b.textContent || ''));
    tab?.click();
  });
  await page.waitForTimeout(700);
  const mapLabel = await page.locator('[data-map-project]').textContent().catch(() => null);
  check(!!mapLabel && /Wolfson/i.test(mapLabel) && /A1/.test(mapLabel),
    `the map says whose building it is (${(mapLabel || 'none').trim()})`);
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('button')].find(b => /My Tasks|המשימות/i.test(b.textContent || ''));
    tab?.click();
  });
  await page.waitForTimeout(400);

  await page.locator('[data-portal-bell]').click();
  await page.waitForTimeout(400);
  const foreign = page.locator('[data-bell-item]', { hasText: 'geves work' });
  check(await foreign.count() === 1 && /Job Board|General/i.test(await foreign.innerText()),
    'the foreign update wears its workspace name');
  await foreign.click();
  await page.waitForTimeout(2000);
  check((await page.evaluate(() => localStorage.getItem('active_project'))) === 'general',
    'tapping it travels to that workspace');

  await ctx.close();
}

// ── C: admin — days-range chip, centred notebook card, the scope setting ──
{
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(([genA, gTask, c, u, sun]) => {
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [u], currentUser: u, contractors: [c] }));
    localStorage.setItem('general_app_data', JSON.stringify({
      users: [u], currentUser: u, contractors: [c], apartments: [genA], contractorAssignments: [gTask],
      canvasElements: [
        { id: 'CE-rota', type: 'widget', widget: 'rota', x: 720, y: 160, w: 620, h: 320,
          text: '', color: '#ffffff',
          data: { people: ['c:C-max'], firstWeek: sun, weekCount: 1,
                  cells: { [`c:C-max|${sun}`]: [{ id: 'EN-1', jobId: 'G-miller' }] } } },
      ],
    }));
  }, [millerJob, gevesTask, maxC, user, sunday]);
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/jobs');
  await page.waitForTimeout(3000);

  // Centred notebook card.
  const align = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.planner-card')].find(x => /Miller/.test(x.textContent || ''));
    const name = card && [...card.querySelectorAll('span')].find(x => /Miller/.test(x.textContent || '') && x.children.length === 0);
    return name ? getComputedStyle(name).textAlign : null;
  });
  check(align === 'center', `the notebook card's text is centred (${align})`);

  // The days chip on the drawer's task card: "Sep 1–2 · 2 days", no bare date.
  const tile = await page.locator('[data-node-id="G-miller"]').boundingBox();
  await page.mouse.dblclick(tile.x + tile.width / 2, tile.y + tile.height / 2);
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('button')].find(b => /^Tasks/.test((b.textContent || '').trim()));
    t?.click();
  });
  await page.waitForTimeout(600);
  const chip = await page.locator('[data-task-days-chip]').textContent();
  check(/–/.test(chip || '') && /2\s*(days|ימים)/.test(chip || ''),
    `the chip says the range and the length (${(chip || '').trim()})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  // The admin scope select writes the contractor record.
  await page.goto('http://localhost:5173/app-settings');
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('button')].find(b => /^(Workers|Contractors)$/i.test((b.textContent || '').trim()));
    t?.click();
  });
  await page.waitForTimeout(600);
  const sel = page.locator('[data-notify-scope]').first();
  check(await sel.count() === 1, 'the workers row carries the bell-scope select');
  await sel.selectOption('off');
  await page.waitForTimeout(700);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('general_app_data')).contractors.find(c => c.id === 'C-max')?.notifyScope);
  check(stored === 'off', `the choice lands on the worker's record (${stored})`);
  await page.screenshot({ path: `${SCRATCH}/round33.png` });
  await ctx.close();
}

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
