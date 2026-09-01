// Probe: a widget added from the store must land VISIBLE and ON THE FRONT —
// above brought-to-front nodes, inside the current view even when the centre
// is crowded, and selected so the eye finds it.
import { chromium } from 'playwright';

const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('active_project', 'general');
  const user = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user, contractors: [] }));
  // A big NOTE brought far to the front, parked over the view centre, plus a
  // crowd of notes so the clash-nudge genuinely runs.
  const notes = [];
  for (let i = 0; i < 12; i++) {
    notes.push({ id: `CE-n${i}`, type: 'note', x: 200 + (i % 4) * 240, y: 120 + Math.floor(i / 4) * 210,
      w: 230, h: 200, text: `note ${i}`, color: '#fef9c3', z: i === 0 ? 50 : 5 });
  }
  localStorage.setItem('general_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors: [], apartments: [], canvasElements: notes,
  }));
});

const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(3000);

// Open the widget store and add a wall clock.
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /store/i.test(x.textContent || '') && x.closest('[data-board-toolrail]'));
  b?.click();
});
await page.waitForTimeout(900);
const added = await page.evaluate(() => {
  // The whole card IS the button (role=button, onClick=onPick).
  const card = document.querySelector('[data-widget-id="clock"]');
  if (!card) return 'no card';
  card.click();
  return 'ok';
});
check(added === 'ok', `the store's Add was pressed (${added})`);
await page.waitForTimeout(900);
// Close the store by its BACKDROP — the board's Escape also clears the
// selection, and the selection is exactly what the last check proves.
await page.mouse.click(8, 500);
await page.waitForTimeout(500);

const el = await page.evaluate(() => {
  const els = JSON.parse(localStorage.getItem('general_app_data')).canvasElements;
  return els.find(e => e.widget === 'clock') ?? null;
});
check(!!el, 'the clock landed on the board');
check((el?.z ?? 0) > 50, `on the FRONT — above the z:50 note (z ${el?.z})`);

// Visible: its rendered box sits inside the window.
const box = await page.locator(`[data-node-id="${el.id}"]`).boundingBox();
check(!!box && box.x >= 0 && box.y >= 0
  && box.x + box.width <= 1500 && box.y + box.height <= 950,
`and fully on screen (${box && [Math.round(box.x), Math.round(box.y)].join(',')})`);

// On the front for real: the point at its centre hits the clock, not the note.
const onTop = await page.evaluate(([id]) => {
  const n = document.querySelector(`[data-node-id="${id}"]`);
  if (!n) return false;
  const r = n.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && n.contains(hit);
}, [el.id]);
check(onTop, 'a click at its centre lands on the newcomer, not what was under it');

// Selected on arrival — Delete sweeps it, which only works on the selection.
// The sweep asks with a NATIVE confirm (whatIsLost); accept it.
page.once('dialog', d => void d.accept());
await page.keyboard.press('Delete');
await page.waitForTimeout(900);
const gone = await page.evaluate(([id]) =>
  !JSON.parse(localStorage.getItem('general_app_data')).canvasElements.some(e => e.id === id), [el.id]);
check(gone, 'it arrived selected (Delete removed it straight away)');

await page.screenshot({ path: `${SCRATCH}/round35.png` });
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
