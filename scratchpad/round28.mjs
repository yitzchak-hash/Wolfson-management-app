// New arrivals land in the MIDDLE and GLOW until selected; Add Job leads
// with the Drive link and fills the family name from the folder title.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; console.log(`FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
};

function seedFn() {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2026-09-12');
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'Architect Avi', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [
      { id: 'G-grp', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Katzenstein',
        classification: 'standard', isUnnamed: false, generalNotes: '', canvasX: 3200, canvasY: 2400,
        boardBin: 'done', binnedAt: '2026-08-10', createdAt: '2026-08-01', updatedAt: '2026-08-01' },
    ],
    stages: [],
    canvasElements: [
      { id: 'CE-bin-done', type: 'bin', binKind: 'done', x: 600, y: 300, w: 170, h: 110, text: '', color: '#16a34a', addedAt: '2026-08-01' },
    ],
  }));
}

const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(seedFn);
const page = await ctx.newPage();
// The Drive backend, canned: the folder's own title, the office naming scheme.
await page.route('**/api/drive-files', route => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ folder: { name: 'Goldberg, Chaim - 4412 - installed 2024' } }),
}));
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2600);

const centreDist = (r) => {
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  return Math.hypot(cx - 750, cy - 475);
};

// ── Add Job: Drive first, name autofilled, lands centre, glows ──
await page.locator('button', { hasText: /Add Job/ }).first().click();
await page.waitForTimeout(400);
const firstField = page.locator('form input').first();
ok((await firstField.getAttribute('placeholder') ?? '').includes('drive.google.com'),
  'the Add Job form leads with the Drive link');
await firstField.fill('https://drive.google.com/drive/folders/1AbCdEfGh123456789');
await page.waitForTimeout(1200);
const nameVal = await page.locator('form input').nth(1).inputValue();
ok(nameVal === 'Goldberg, Chaim',
  'pasting the link fills the family name from the folder title', JSON.stringify(nameVal));
await page.locator('form button[type="submit"]').click();
await page.waitForTimeout(700);

const tile = page.locator('[data-node-id]', { hasText: 'Goldberg, Chaim' }).first();
ok(await tile.count() > 0, 'the job is created');
const tb = await tile.boundingBox();
ok(tb && centreDist(tb) < 260,
  `and lands near the middle of the screen (${tb && Math.round(centreDist(tb))}px from centre)`);
ok(await tile.evaluate(n => n.classList.contains('fresh-job')), 'it GLOWS as new');

// Selecting it puts the glow out.
await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
await page.waitForTimeout(400);
// deselect (click empty board far from everything) — the glow must STAY off.
await page.mouse.click(1350, 850);
await page.waitForTimeout(400);
ok(!(await tile.evaluate(n => n.classList.contains('fresh-job'))),
  'selecting it once puts the glow out for good');

// ── A typed name is never overwritten by the autofill ──
await page.locator('button', { hasText: /Add Job/ }).first().click();
await page.waitForTimeout(400);
await page.locator('form input').nth(1).fill('My Own Name');
await page.locator('form input').first().fill('https://drive.google.com/drive/folders/1ZzYyXx987654321');
await page.waitForTimeout(1200);
ok(await page.locator('form input').nth(1).inputValue() === 'My Own Name',
  'a hand-typed name survives pasting a link');
await page.keyboard.press('Escape');
await page.locator('button', { hasText: /Cancel/ }).first().click().catch(() => {});
await page.waitForTimeout(400);

// ── Taking a job out of a group brings it to the middle, glowing ──
// The job's stored position is far off-screen (3200,2400): the restore must
// NOT send it back there.
await page.locator('[data-node-id="CE-bin-done"]').dblclick();
await page.waitForTimeout(900);
const inTile = page.locator('.bin-window-in [data-node-id="G-grp"]').first();
const ib = await inTile.boundingBox();
ok(!!ib, 'the group window shows the filed job');
// Drag it OUT of the window (to the far left edge of the screen).
await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2);
await page.mouse.down();
await page.mouse.move(40, 480, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(900);
const back = page.locator('[data-node-id="G-grp"]').first();
ok(await back.count() > 0, 'the job is back on the board');
const bb = await back.boundingBox();
// Near the centre — but the spot NUDGES off anything already there (the tile
// from the first test holds the exact centre), so the bound is "fully on
// screen, centre-ish", not a bullseye. Its old stored spot was (3200,2400) —
// thousands of pixels away.
ok(bb && centreDist(bb) < 700 && bb.x > 0 && bb.y > 60
   && bb.x + bb.width < 1500 && bb.y + bb.height < 950,
  `in the middle of the view, not at its old far-off spot (${bb && Math.round(centreDist(bb))}px from centre)`);
ok(await back.evaluate(n => n.classList.contains('fresh-job')), 'and it glows until selected');

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
