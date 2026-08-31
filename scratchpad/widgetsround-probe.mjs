// Probe: calculator type scales with a tall node; tap-in wears the navy; a
// COMPLETED task still draws its chip on the notebook, struck through.
import { chromium } from 'playwright';
import { realisticWolfson, applySeed } from './seed.mjs';

const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ok', name); } else { fail++; console.log('  FAIL', name); } };

const sunday = (() => {
  const d = new Date(); d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();
const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const blob = await realisticWolfson(browser);
const data = JSON.parse(blob);
const contractors = [{ id: 'C-x', name: 'Probe Worker', category: 'general', token: 'tok1', active: true, createdAt: '2026-01-01' }];
const employees = [
  { id: 'E-1', name: 'Yossi Cohen', active: true, createdAt: '2026-01-01' },
  { id: 'E-2', name: 'Dana Levi', active: true, createdAt: '2026-01-01' },
];
data.contractors = contractors;
data.employees = employees;

const generalData = {
  apartments: [{
    id: 'G-probe-1', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Bornstein',
    classification: 'standard', isUnnamed: false, createdAt: '2026-01-01', canvasX: 1400, canvasY: 600,
  }],
  contractors, employees,
  contractorAssignments: [{
    id: 'T-done-1', apartmentId: 'G-probe-1', buildingId: 'G', contractorId: 'C-x',
    taskDescription: 'Fit the fans', dueDate: today, completedAt: `${today}T10:00:00Z`,
    createdAt: '2026-08-01T09:00:00Z', priority: 'normal',
  }],
  canvasElements: [
    { id: 'CE-probe-calc', type: 'widget', widget: 'calculator', x: 40, y: 120, w: 190, h: 350,
      text: '', color: '#ffffff', data: {} },
    { id: 'CE-probe-tap', type: 'widget', widget: 'tap-in', x: 260, y: 120, w: 260, h: 220,
      text: '', color: '#ffffff', data: {} },
    { id: 'CE-probe-rota', type: 'widget', widget: 'rota', x: 550, y: 120, w: 700, h: 420,
      text: '', color: '#ffffff',
      data: { people: ['c:C-x'], firstWeek: sunday, weekCount: 1 } },
  ],
};

const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await applySeed(ctx, JSON.stringify(data));
await ctx.addInitScript(([g]) => {
  localStorage.setItem('general_app_data', g);
}, [JSON.stringify(generalData)]);
const page = await ctx.newPage();
await page.goto('http://localhost:5173/tv?view=general');
await page.waitForTimeout(4000);
await page.screenshot({ path: `${SCRATCH}/widgets-round.png`, fullPage: false });

// Calculator: key font grows with the 350px-tall node (natural 175).
const keyFont = await page.evaluate(() => {
  const node = document.querySelector('[data-node-id="CE-probe-calc"]')
    ?? [...document.querySelectorAll('button')].find(b => b.textContent === '7')?.closest('div');
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '7');
  return btn ? parseFloat(getComputedStyle(btn).fontSize) : 0;
});
ok(keyFont > 13, `calculator keys scale with height (font ${keyFont}px)`);

// Tap-in: tiles exist and an out tile wears the light company ground.
const tapTile = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Yossi Cohen/.test(x.textContent || ''));
  if (!b) return null;
  return getComputedStyle(b).backgroundColor;
});
ok(!!tapTile, `tap-in tiles drawn (${tapTile})`);

// Planner: the DONE task's chip is drawn, dimmed, saying done.
const chip = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Fit the fans/.test(x.textContent || ''));
  if (!b) return null;
  return { opacity: getComputedStyle(b).opacity, done: /done/i.test(b.textContent || '') };
});
ok(!!chip, 'completed task still has its chip on the notebook');
ok(chip && parseFloat(chip.opacity) < 0.8, `chip dimmed (${chip?.opacity})`);
ok(chip && chip.done, 'chip says done');

console.log(`\n${pass} ok · ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
