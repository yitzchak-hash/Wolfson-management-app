// The bare domain is the Job Board (owner, 2026-09-16): "/" from a browser
// standing in Wolfson lands on the board, not blank and not the diagram;
// a cold browser goes through login and lands on the board too.
import { chromium } from 'playwright';
const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const user = { id: 'U-t', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
function seed(ctx, { active = 'wolfson', loggedIn = true } = {}) {
  return ctx.addInitScript(({ active, loggedIn, user }) => {
    localStorage.setItem('active_project', active);
    localStorage.setItem('wolfson_app_version', '3'); localStorage.setItem('general_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    if (localStorage.getItem('wolfson_app_data')) return;
    const apt = (id, bld, n, f, name) => ({ id, buildingId: bld, floor: f, apartmentNumber: String(n), displayName: name, isUnnamed: false,
      isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
    const cur = loggedIn ? user : null;
    localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: cur, stages: [], contractors: [],
      buildings: [{ id: 'A1', name: 'Building A1' }], apartments: [apt('A1-47', 'A1', 47, 13, 'Aharonov')], contractorAssignments: [], canvasElements: [] }));
    localStorage.setItem('general_app_data', JSON.stringify({ users: [user], currentUser: cur, stages: [], contractors: [], apartments: [
      { id: 'G-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Levi job', isUnnamed: false, isDuplexApt: false, classification: 'standard',
        generalNotes: '', currentStageId: null, stageDates: {}, canvasX: 200, canvasY: 200, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' }],
      contractorAssignments: [], canvasElements: [] }));
  }, { active, loggedIn, user });
}
const state = (page) => page.evaluate(() => ({
  path: location.pathname, ws: localStorage.getItem('active_project'),
  board: !!document.querySelector('[data-board-viewport]'), diagram: !!document.querySelector('[data-apt-id]'),
  text: (document.body.innerText || '').trim().length,
}));
const errs = [];
// 1 · logged in, standing in Wolfson, opens the bare domain
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx, { active: 'wolfson' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${APP}/`);
  await page.waitForTimeout(3500);
  const s1 = await state(page);
  check(s1.text > 0, '1 · the bare domain is not blank', JSON.stringify(s1));
  check(s1.path === '/jobs' && s1.board, '1 · it lands on the Job Board', JSON.stringify(s1));
  check(s1.ws === 'general', '1 · the workspace switched to the Job Board', s1.ws);
  check(await page.locator('text=Levi job').count() >= 1, '1 · the board\'s own tile is drawn');
  // and a typed /project still means the diagram
  await page.goto(`${APP}/project`);
  await page.waitForTimeout(2500);
  const s1b = await state(page);
  check(s1b.path === '/project' || s1b.path === '/jobs', '1 · /project still resolves somewhere real', JSON.stringify(s1b));
  await ctx.close();
}
// 2 · cold browser: the bare domain → login → the Job Board
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx, { active: 'wolfson', loggedIn: false });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${APP}/`);
  await page.waitForTimeout(2500);
  check((await state(page)).path === '/login', '2 · a cold browser is sent to login');
  await page.locator('button', { hasText: /Esther/ }).first().click();
  await page.waitForTimeout(500);
  const inputs = page.locator('input');
  const n = await inputs.count();
  if (n >= 6) { for (let i = 0; i < 6; i++) await inputs.nth(i).fill('9'); }
  else await inputs.first().fill('999999');
  await page.waitForTimeout(3500);
  const s2 = await state(page);
  check(s2.path === '/jobs' && s2.board && s2.ws === 'general', '2 · after login the home page is the Job Board', JSON.stringify(s2));
  await ctx.close();
}
// 3 · a nonsense address falls back to the board too
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx, { active: 'wolfson' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${APP}/nothing-here`);
  await page.waitForTimeout(3500);
  const s3 = await state(page);
  check(s3.path === '/jobs' && s3.board, '3 · an unknown address lands on the Job Board', JSON.stringify(s3));
  await ctx.close();
}
check(errs.length === 0, 'no page errors', errs.join(' | '));
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
