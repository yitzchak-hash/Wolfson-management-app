// A workspace made in settings (settings/app.customProjects, a dashed id) must
// be seen beyond the calendar too (map C19 follow-up): the worker's phone lists
// his task there, and the office's "a worker closed a task" toast rings for it.
// Before, those callers read only the built-in three workspaces.
// Needs the dev server on 5173 (no Firebase: local data). Invented names only.
// Run: node scratchpad/custom-ws-everywhere-probe.mjs
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');

const APP = process.env.APP || 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const b = await chromium.launch();

const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const D1 = iso(new Date(Date.now() + 86400000));

const seed = ([D1]) => {
  if (localStorage.getItem('seeded_cws')) return;
  localStorage.setItem('seeded_cws', '1');
  localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  const stages = [{ id: 'W-dr', name: 'Drilling', color: '#0891b2', order: 1, active: true }];
  const contractors = [{ id: 'C-ig', name: 'Igor', category: 'ac', token: 'tok-ig', active: true, createdAt: '2026-01-01', lang: 'en' }];
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
    currentUser, users: [currentUser], contractors, stages, customProjects: [custom],
    buildings: [{ id: 'A2', name: 'A2' }],
    apartments: [apt('A2-1', 'A2', 'Quenby')],
    contractorAssignments: [task('T-wolf', 'A2-1', 'A2', D1)],
  }));
  localStorage.setItem('my-new-site_app_data', JSON.stringify({
    currentUser, contractors, stages, buildings: [{ id: 'H1', name: 'H1' }],
    apartments: [apt('H1-1', 'H1', 'Trelawn')],
    contractorAssignments: [task('T-custom', 'H1-1', 'H1', D1)],
  }));
};

async function open(path, viewport) {
  const ctx = await b.newContext({ viewport });
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('**://fonts.googleapis.com/**', r => r.abort());
  await ctx.addInitScript(seed, [D1]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (/localStorage/.test(e.message)) return; console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; });
  await page.goto(`${APP}${path}`);
  await page.waitForTimeout(4000); // past the office alerts' 2.5s baseline
  return { ctx, page };
}

// ── 1 · the worker's phone lists his task in the settings-made workspace ──
{
  const { ctx, page } = await open('/c/tok-ig', { width: 390, height: 844 });
  const ids = await page.evaluate(() => window.__store?.getState().projects.map(p => p.id));
  check(ids?.includes('my-new-site'), 'the phone knows the settings-made workspace', JSON.stringify(ids));
  const cards = await page.locator('[data-task-card]').evaluateAll(n => n.map(x => x.getAttribute('data-task-card')));
  check(cards.includes('T-wolf'), 'the open workspace\'s task is on his list', cards.join(' '));
  check(cards.includes('T-custom'), 'the settings-made workspace\'s task is on his list', cards.join(' '));
  await ctx.close();
}

// ── 2 · the office's toast rings when he closes a task there ──
{
  const { ctx, page } = await open('/project', { width: 1500, height: 1000 });
  check(await page.locator('[data-office-toast]').count() === 0, 'no toast on arrival (the baseline)');  await page.evaluate(() => {
    const k = 'my-new-site_app_data';
    const d = JSON.parse(localStorage.getItem(k));
    d.contractorAssignments[0].completedAt = new Date().toISOString();
    localStorage.setItem(k, JSON.stringify(d));
    const st = window.__store;
    st.setState({ snapshotTick: (st.getState().snapshotTick || 0) + 1 });
  });
  for (let i = 0; i < 40 && !(await page.locator('[data-office-toast]').count()); i++) await page.waitForTimeout(100);
  const toast = page.locator('[data-office-toast]');
  check(await toast.count() === 1, 'the office toast rings for a task closed in the settings-made workspace');
  const text = (await toast.textContent().catch(() => '')) || '';
  check(/Harbour/.test(text), 'the toast names that workspace', text.slice(0, 120));
  await ctx.close();
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
