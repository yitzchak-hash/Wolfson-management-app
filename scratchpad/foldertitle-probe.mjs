// The Drive folder TITLE reaches every search door: Add Job writes it at
// submit (both the settled and the raced path), Find-a-job reads it, and the
// wall's group window reads it.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; console.log(`FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
};
const TITLE = 'Goldberg, Chaim - 4412 - installed 2024';

function seedFn() {
  if (localStorage.getItem('general_app_data')) return; // seed only when absent (the standing rule)
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2026-12-30');
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'Architect Avi', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [
      { id: 'G-pot', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Levi',
        driveFolderName: 'Levi, Shimon - Quixotic Lane 7', classification: 'standard', isUnnamed: false,
        generalNotes: '', canvasX: 900, canvasY: 300, createdAt: '2026-08-01', updatedAt: '2026-08-01' },
      { id: 'G-grp', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Katz',
        driveFolderName: 'Katz, Rivka - Zebrawood 3', classification: 'standard', isUnnamed: false,
        generalNotes: '', canvasX: 900, canvasY: 500, boardBin: 'done', binnedAt: '2026-08-10',
        createdAt: '2026-08-01', updatedAt: '2026-08-01' },
    ],
    stages: [],
    canvasElements: [
      { id: 'CE-bin-done', type: 'bin', binKind: 'done', x: 60, y: 560, w: 170, h: 110, text: '', color: '#16a34a', addedAt: '2026-08-01' },
      { id: 'CE-find', type: 'widget', widget: 'job-find', x: 60, y: 260, w: 300, h: 220, text: '', color: '#ffffff', data: {} },
    ],
  }));
}

const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(seedFn);
const page = await ctx.newPage();
await page.route('**/api/drive-files', route => route.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify({ folder: { name: TITLE } }),
}));
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2600);

const jobs = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data') || '{}').apartments || []);

// ── 1. Add Job, lookup settled before submit ──
await page.locator('button', { hasText: /Add Job/ }).first().click();
await page.waitForTimeout(400);
await page.locator('form input').first().fill('https://drive.google.com/drive/folders/1AbCdEfGh123456789');
await page.waitForTimeout(1200);
await page.locator('form button[type="submit"]').click();
await page.waitForTimeout(900);
let j = (await jobs()).find(a => a.displayName === 'Goldberg, Chaim');
ok(!!j, 'the job is created with the family name');
ok(j && j.driveFolderName === TITLE, 'and carries the folder TITLE at submit', JSON.stringify(j?.driveFolderName));

// ── 2. Add Job, the RACE: paste and press before the lookup answers ──
await page.locator('button', { hasText: /Add Job/ }).first().click();
await page.waitForTimeout(400);
await page.locator('form input').first().fill('https://drive.google.com/drive/folders/1RaceRaceRace000');
await page.locator('form input').nth(1).fill('Typed Name');
await page.locator('form button[type="submit"]').click();
await page.waitForTimeout(1500);
j = (await jobs()).find(a => a.displayName === 'Typed Name');
ok(!!j, 'a job submitted before the lookup answered exists');
ok(j && j.driveFolderName === TITLE, 'and the heal writes the folder title afterwards', JSON.stringify(j?.driveFolderName));
ok(j && j.displayName === 'Typed Name', 'without touching the typed name');

// ── 3. Find-a-job reads the title ──
const find = page.locator('[data-node-id="CE-find"] input').first();
await find.click({ force: true });
await find.fill('Quixotic');
await page.waitForTimeout(600);
// The tile itself says "Levi" once; a result row is a SECOND mention.
const mentions = async () => (await page.locator('body').innerText()).split('Levi').length - 1;
ok(await mentions() >= 2, 'Find-a-job finds a job by a word that lives only in its folder title', `mentions=${await mentions()}`);
await find.fill('Nonesuchword');
await page.waitForTimeout(600);
ok((await page.locator('body').innerText()).includes('Nothing close') && await mentions() === 1, 'and says so when nothing matches');
await page.keyboard.press('Escape');

// ── 4. The wall's group window reads the title ──
await page.goto('http://localhost:5173/tv?view=general');
await page.waitForTimeout(3000);
const binBtn = page.locator('button', { hasText: /Done/ }).first();
await binBtn.click({ force: true });
await page.waitForTimeout(700);
const q = page.locator('input[placeholder*="Search this group"]');
ok(await q.count() > 0, 'the wall group window opened with its search');
await q.fill('Zebrawood');
await page.waitForTimeout(500);
let txt = await page.locator('.fixed', { has: q }).last().innerText().catch(() => '');
ok(txt.includes('Katz'), 'the wall group search finds the job by its folder title', txt.slice(0, 80));
await q.fill('Nonesuchword');
await page.waitForTimeout(500);
txt = await page.locator('.fixed', { has: q }).last().innerText().catch(() => '');
ok(!txt.includes('Katz'), 'and hides it when the word is not there');

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
