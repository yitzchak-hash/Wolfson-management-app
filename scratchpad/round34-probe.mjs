// Probe: a card already ON the notebook drags onto the quick-assign box —
// who + which day, then the notebook's own move machinery, run extended.
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
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(([sun]) => {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('active_project', 'general');
  const user = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const contractors = [{ id: 'C-a', name: 'Motti', category: 'general', token: 't1', active: true, createdAt: '2026-01-01' }];
  localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user, contractors }));
  localStorage.setItem('general_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors,
    apartments: [{
      id: 'G-r1', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Artzi',
      classification: 'standard', isUnnamed: false, createdAt: '2026-01-01',
      canvasX: 200, canvasY: 700, inNotebook: 'CE-rota',
    }],
    canvasElements: [
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 260, y: 200, w: 700, h: 340,
        text: '', color: '#ffffff',
        data: { people: ['c:C-a'], firstWeek: sun, weekCount: 1,
                cells: { [`c:C-a|${sun}`]: [{ id: 'EN-1', jobId: 'G-r1' }] } } },
    ],
  }));
}, [sunday]);

const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(3000);

// Drag the notebook card upward and watch the box appear.
const card = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.planner-card')].find(x => /Artzi/.test(x.textContent || ''));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
check(!!card, 'the notebook card is on screen');
await page.mouse.move(card.x, card.y);
await page.mouse.down();
for (let i = 1; i <= 6; i++) {
  await page.mouse.move(card.x + i * 6, card.y - i * 10);
  await page.waitForTimeout(25);
}
const boxVisible = await page.locator('[data-quick-box]').count();
check(boxVisible === 1, 'the drop box appears for a notebook card drag');
const box = await page.locator('[data-quick-box]').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
await page.waitForTimeout(200);
const hot = await page.evaluate(() => {
  const b = document.querySelector('[data-quick-box]');
  return b ? getComputedStyle(b).borderColor : '';
});
check(/22, 163, 74/.test(hot), `the box lights up under the card (${hot})`);
await page.mouse.up();
await page.waitForTimeout(500);

check(await page.locator('[data-quick-assign]').count() === 1, 'dropping the card asks who + which day');
const far = day(21);
await page.locator('[data-quick-day]').fill(far);
await page.locator('[data-quick-next]').click();
await page.waitForTimeout(500);

// The standing plain-drag ask, aimed at the chosen square.
const moveBtn = page.locator('button', { hasText: 'Move it here' }).first();
check(await moveBtn.count() === 1, "Next hands over to the notebook's own move question");
await moveBtn.click();
await page.waitForTimeout(800);

const data = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('general_app_data')).canvasElements.find(e => e.id === 'CE-rota').data);
const landed = (data.cells?.[`c:C-a|${far}`] ?? []).some(e => e.jobId === 'G-r1');
const left = (data.cells?.[`c:C-a|${sunday}`] ?? []).some(e => e.jobId === 'G-r1');
check(landed, 'the card landed on the chosen far day');
check(!left, 'and came off its old square');
check((data.weekCount ?? 1) >= 4, `the drawn run extended to show it (weekCount ${data.weekCount})`);

await page.screenshot({ path: `${SCRATCH}/round34.png` });
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
