// The section-box click trap (owner report, 2026-08-24 screenshot round):
// a section brought to the front painted over the calculator inside it, and
// because a box's body takes the pointer, the calculator became unclickable —
// clicks silently selected the near-invisible box instead. The rule now: a
// box is FURNITURE and renders under the content band whatever its stored z
// says (capped at 3; widgets/bins sit at 4+), while staying selectable on its
// own uncovered surface.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2026-09-10');
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'Architect Avi', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [], stages: [], contractors: [], contractorAssignments: [],
    canvasElements: [
      // The section, brought-to-front at some point (explicit big z), spanning wide.
      { id: 'CE-sec', type: 'box', x: 200, y: 220, w: 900, h: 500, z: 9, text: 'MANAGMENT', color: '#fdba74', addedAt: '2026-08-01' },
      // The calculator inside it, default z (absent).
      { id: 'CE-calc', type: 'widget', widget: 'calculator', x: 500, y: 320, w: 190, h: 175, text: '', color: '#ffffff', addedAt: '2026-08-02', data: {} },
    ],
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2500);

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; console.log(`FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
};

const probe = await page.evaluate(() => {
  const calc = document.querySelector('[data-node-id="CE-calc"]');
  const sec = document.querySelector('[data-node-id="CE-sec"]');
  const cr = calc?.getBoundingClientRect(), sr = sec?.getBoundingClientRect();
  const atCalc = cr ? document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2) : null;
  const atSecBody = sr ? document.elementFromPoint(sr.left + 40, sr.top + sr.height - 40) : null;
  const owner = (n) => n ? (n.closest('[data-node-id]')?.getAttribute('data-node-id') ?? n.tagName) : 'null';
  return { calcZ: calc && getComputedStyle(calc).zIndex, secZ: sec && getComputedStyle(sec).zIndex,
           overCalc: owner(atCalc), overSecBody: owner(atSecBody) };
});
console.log(JSON.stringify(probe));
ok(Number(probe.calcZ) > Number(probe.secZ),
  `the calculator renders ABOVE the front-ed section (${probe.calcZ} vs ${probe.secZ})`);
ok(probe.overCalc === 'CE-calc', 'a click aimed at the calculator reaches the calculator');
ok(probe.overSecBody === 'CE-sec', 'the section still takes clicks on its own uncovered body');

const selected = () => page.evaluate(() => [...document.querySelectorAll('[data-node-id]')]
  .filter(n => n.style.outline?.includes('rgba(74'))
  .map(n => n.getAttribute('data-node-id')));

// Clicking the calculator's drag strip area selects the calculator, not the box.
const cr = await page.locator('[data-node-id="CE-calc"]').boundingBox();
await page.mouse.click(cr.x + cr.width / 2, cr.y + 6);
await page.waitForTimeout(300);
ok(JSON.stringify(await selected()) === '["CE-calc"]', 'clicking the calculator selects the calculator');

// Its buttons genuinely work — press 7 and the display shows it.
await page.mouse.click(cr.x + cr.width * 0.18, cr.y + cr.height * 0.42);
await page.waitForTimeout(250);
const shows7 = await page.evaluate(() =>
  document.querySelector('[data-node-id="CE-calc"]').innerText.includes('7'));
ok(shows7, 'and its keys actually press');

// The section's own body still selects the section.
const sr = await page.locator('[data-node-id="CE-sec"]').boundingBox();
await page.mouse.click(sr.x + 40, sr.y + sr.height - 40);
await page.waitForTimeout(300);
ok(JSON.stringify(await selected()) === '["CE-sec"]', 'clicking the section body selects the section');

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
