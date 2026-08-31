// Probe for the approved Notebook Strips build:
//  1. a worker with nothing this week is a thin strip, a busy one a full row;
//  2. dragging a card over the strip puffs it open, dropping fills the row —
//     and the emptied row squishes down in its place;
//  3. the Cards=Strips setting slims every card to name+task and shortens the week.
import { chromium } from 'playwright';

const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const sunday = (() => {
  const d = new Date(); d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1700, height: 1000 } });
await ctx.addInitScript(([sun]) => {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('active_project', 'general');
  const user = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const contractors = [
    { id: 'C-busy', name: 'Motti', category: 'general', token: 't1', active: true, createdAt: '2026-01-01' },
    { id: 'C-idle', name: 'Sasha', category: 'general', token: 't2', active: true, createdAt: '2026-01-01' },
  ];
  localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user, contractors }));
  localStorage.setItem('general_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors,
    apartments: [{
      id: 'G-job1', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Artzi, Avital',
      classification: 'standard', isUnnamed: false, createdAt: '2026-01-01', canvasX: 1500, canvasY: 700,
      inNotebook: 'CE-probe-rota',
    }],
    canvasElements: [{
      id: 'CE-probe-rota', type: 'widget', widget: 'rota', x: 60, y: 140, w: 900, h: 420,
      text: '', color: '#ffffff',
      data: {
        people: ['c:C-busy', 'c:C-idle'],
        firstWeek: sun, weekCount: 1,
        cells: { [`c:C-busy|${sun}`]: [{ id: 'EN-1', jobId: 'G-job1' }] },
      },
    }],
  }));
}, [sunday]);
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(3500);
await page.screenshot({ path: `${SCRATCH}/strips-live-1.png` });

// The busy row's Sunday cell holds the card; the idle row is a strip.
const heights = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.planner-card')];
  const card = cards.find(c => /Artzi/.test(c.textContent || ''));
  const busyCell = card?.closest('div[class*="group/cell"]');
  // The idle row: the cell grid row after — find by the name cell "Sasha".
  const names = [...document.querySelectorAll('span')].filter(s => s.textContent === 'Sasha');
  const nameCell = names[0]?.closest('div');
  const idleRow = nameCell?.parentElement;   // the grid row div
  const idleCell = idleRow ? idleRow.children[1] : null;
  return {
    busy: busyCell ? busyCell.getBoundingClientRect().height : 0,
    idle: idleCell ? idleCell.getBoundingClientRect().height : 0,
  };
});
check(heights.busy > 45, `busy row is a full row (${Math.round(heights.busy)}px)`);
check(heights.idle > 0 && heights.idle < 22, `idle row is a thin strip (${Math.round(heights.idle)}px)`);

// Drag Artzi's card over Sasha's Monday square: the strip must puff open
// mid-drag; drop and answer "Move it here".
const cardBox = await page.evaluate(() => {
  const c = [...document.querySelectorAll('.planner-card')].find(x => /Artzi/.test(x.textContent || ''));
  const r = c.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const idleTarget = await page.evaluate(() => {
  const names = [...document.querySelectorAll('span')].filter(s => s.textContent === 'Sasha');
  const row = names[0]?.closest('div')?.parentElement;
  const cell = row.children[2];   // Monday
  const r = cell.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(cardBox.x, cardBox.y);
await page.mouse.down();
for (let i = 1; i <= 14; i++) {
  await page.mouse.move(
    cardBox.x + (idleTarget.x - cardBox.x) * i / 14,
    cardBox.y + (idleTarget.y - cardBox.y) * i / 14);
  await page.waitForTimeout(30);
}
await page.waitForTimeout(300);
const midDrag = await page.evaluate(() => {
  const names = [...document.querySelectorAll('span')].filter(s => s.textContent === 'Sasha');
  const row = names[0]?.closest('div')?.parentElement;
  return row ? row.children[2].getBoundingClientRect().height : 0;
});
check(midDrag > 45, `strip puffs open under the hovering drag (${Math.round(midDrag)}px)`);
await page.screenshot({ path: `${SCRATCH}/strips-live-2-middrag.png` });
await page.mouse.up();
await page.waitForTimeout(600);
// The plain drag asks — move it.
const moveBtn = page.getByText('Move it here').first();
if (await moveBtn.count()) await moveBtn.click();
await page.waitForTimeout(800);
const after = await page.evaluate(() => {
  const names = [...document.querySelectorAll('span')];
  const sasha = names.filter(s => s.textContent === 'Sasha')[0]?.closest('div')?.parentElement;
  const motti = names.filter(s => s.textContent === 'Motti')[0]?.closest('div')?.parentElement;
  return {
    sashaCell: sasha ? sasha.children[2].getBoundingClientRect().height : 0,
    mottiCell: motti ? motti.children[1].getBoundingClientRect().height : 0,
    sashaHasCard: !!sasha?.querySelector('.planner-card'),
  };
});
check(after.sashaHasCard, 'the drop landed in the strip');
check(after.sashaCell > 45, `the filled row is a full row now (${Math.round(after.sashaCell)}px)`);
check(after.mottiCell < 22, `the emptied row squished down (${Math.round(after.mottiCell)}px)`);
await page.screenshot({ path: `${SCRATCH}/strips-live-3-dropped.png` });

// Strips mode: flip the setting through the app's own store module.
const weeksBefore = await page.evaluate(async () => {
  const { useStore } = await import('/src/data/store.ts');
  const el = useStore.getState().canvasElements.find(e => e.id === 'CE-probe-rota');
  const h = document.querySelector('[data-node-id="CE-probe-rota"]')?.getBoundingClientRect().height ?? 0;
  useStore.getState().updateCanvasElement('CE-probe-rota', { data: { ...el.data, cardStyle: 'strips' } });
  return h;
});
await page.waitForTimeout(800);
const stripsFacts = await page.evaluate(() => {
  const card = [...document.querySelectorAll('.planner-card')].find(x => /Artzi/.test(x.textContent || ''));
  const names = [...document.querySelectorAll('span')].filter(s => s.textContent === 'Sasha');
  const row = names[0]?.closest('div')?.parentElement;
  return {
    cardH: card ? card.getBoundingClientRect().height : 0,
    cardText: card ? card.textContent : '',
    cellH: row ? row.children[2].getBoundingClientRect().height : 0,
  };
});
check(stripsFacts.cardH > 0 && stripsFacts.cardH < 34, `strips: the card is one slim line (${Math.round(stripsFacts.cardH)}px)`);
check(stripsFacts.cellH < 48, `strips: full rows slim down too (${Math.round(stripsFacts.cellH)}px)`);
await page.screenshot({ path: `${SCRATCH}/strips-live-4-strips.png` });

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
