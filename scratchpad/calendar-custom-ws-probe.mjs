// The ONE calendar, All workspaces, must show a workspace made in settings
// (settings/app.customProjects, a dashed id) — its tasks and their days — as
// well as the built-in ones (map C19). This workspace still shows only its own.
// Needs the dev server on 5173 (no Firebase: local data). Invented names only.
// Run: node scratchpad/calendar-custom-ws-probe.mjs
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const b = await chromium.launch();

const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const now = new Date();
const dayOf = n => iso(new Date(now.getFullYear(), now.getMonth(), n));
const D10 = dayOf(10), D11 = dayOf(11), D12 = dayOf(12);

const seed = ([D10, D11, D12]) => {
  if (localStorage.getItem('seeded_c19')) return;
  localStorage.setItem('seeded_c19', '1');
  localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('calendar_scope', 'all');
  const stages = [{ id: 'W-dr', name: 'Drilling', color: '#0891b2', order: 1, active: true }];
  const contractors = [{ id: 'C-ig', name: 'Igor', category: 'ac', token: 'tok-ig', active: true, createdAt: '2026-01-01' }];
  const currentUser = { id: 'U-t', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const apt = (id, bld, name) => ({
    id, buildingId: bld, floor: 2, colPosition: 1, apartmentNumber: '1', displayName: name, isUnnamed: false,
    isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'W-dr', stageDates: {},
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  const task = (id, aptId, bld, day, extra = {}) => ({
    id, apartmentId: aptId, buildingId: bld, contractorId: 'C-ig', taskDescription: 'Drill the sleeves',
    stageId: 'W-dr', dueDate: day, completedAt: null, createdAt: '2026-01-01', createdBy: 'U', createdByName: 'Office', ...extra,
  });
  const custom = { id: 'my-new-site', name: 'Harbour Tower', shortName: 'Harbour', logoPath: '', type: 'building', color: '#7c3aed' };
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser, contractors, stages, customProjects: [custom],
    buildings: [{ id: 'A2', name: 'A2' }],
    apartments: [apt('A2-1', 'A2', 'Quenby')],
    contractorAssignments: [task('T-wolf', 'A2-1', 'A2', D10)],
  }));
  localStorage.setItem('netiv_app_data', JSON.stringify({
    currentUser, contractors, stages, buildings: [{ id: 'B1', name: 'B1' }],
    apartments: [apt('B1-1', 'B1', 'Ostrander')],
    contractorAssignments: [task('T-netiv', 'B1-1', 'B1', D10)],
  }));
  localStorage.setItem('my-new-site_app_data', JSON.stringify({
    currentUser, contractors, stages, buildings: [{ id: 'H1', name: 'H1' }],
    apartments: [apt('H1-1', 'H1', 'Trelawn')],
    contractorAssignments: [task('T-custom', 'H1-1', 'H1', D12, { days: [D11, D12] })],
  }));
};

const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addInitScript(seed, [D10, D11, D12]);
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/calendar`);
await page.waitForSelector('[data-calendar-page]', { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(800);

const projects = await page.evaluate(() => window.__store?.getState().projects.map(p => p.id));
check(projects?.includes('my-new-site'), 'the settings-made workspace is in the app\'s list', JSON.stringify(projects));
check(await page.locator('[data-calendar-scope="all"]').count() === 1, 'the calendar opens on All workspaces');
const tiles = async () => page.locator('[data-cal-task]').evaluateAll(n => n.map(x => `${x.getAttribute('data-cal-ws')}:${x.getAttribute('data-cal-task')}:${x.getAttribute('data-cal-days')}`));
let all = await tiles();
check(all.some(t => t.startsWith('wolfson:T-wolf')), 'the open workspace\'s task is there', all.join(' '));
check(all.some(t => t.startsWith('netiv:T-netiv')), 'a built-in other workspace\'s task is there');
// (two days may fall either side of a week's edge: count the days, not the bars)
const customDays = all.filter(t => t.startsWith('my-new-site:T-custom:')).reduce((n, t) => n + Number(t.split(':')[2]), 0);
check(customDays === 2,'the settings-made workspace\'s task is there, across both its days', all.join(' '));
const onD11 = await page.locator(`[data-cal-day="${D11}"]`).count();
check(onD11 >= 1, 'its first day is on the month grid');

await page.locator('[data-calendar-scope-pick="here"]').click();
await page.waitForTimeout(300);
all = await tiles();
check(all.length === 1 && all[0].startsWith('wolfson:T-wolf'), 'This workspace shows only its own', all.join(' '));
await page.locator('[data-calendar-scope-pick="all"]').click();

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
