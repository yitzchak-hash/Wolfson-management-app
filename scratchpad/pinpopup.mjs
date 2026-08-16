// Pin popup round: Save keeps the bubble open, Mark-as-done records who,
// Reopen clears it, delete asks twice.
//
// Seeds a logged-in admin ("Architect Avi") and one Wolfson apartment carrying
// a plansPdfLink BEFORE first load (addInitScript — set after boot it would be
// overwritten by the app's own flush-on-unload). The Drive iframe is aborted:
// no internet here, and the overlay draws above it either way.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let failures = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!cond) failures++;
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
await ctx.route('**://drive.google.com/**', r => r.abort());
await ctx.route('**://*.googleusercontent.com/**', r => r.abort());

const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'Architect Avi', code: '999999', role: 'admin' },
    users: [{ id: 'U-test', name: 'Architect Avi', code: '999999', role: 'admin' }],
    apartments: [{
      id: 'A1-1', buildingId: 'A1', apartmentNumber: '1', displayName: 'Pin Test',
      floor: 2, isUnnamed: false, isDuplexApt: false, classification: 'standard',
      currentStageId: null, generalNotes: '',
      plansPdfLink: 'https://drive.google.com/file/d/FAKEPDF12345/view',
    }],
  }));
});

await page.goto(APP + '/project');
await page.waitForTimeout(1200);

// Open the seeded apartment. The diagram draws the number bold in the cell.
await page.locator('[class*="cursor-pointer"]', { hasText: 'Pin Test' }).first().click()
  .catch(async () => { await page.getByText('Pin Test', { exact: false }).first().click(); });
await page.waitForTimeout(900);

const pinBtn = page.getByRole('button', { name: 'Pin', exact: true });
ok('plan pane mounts with the pin controls', await pinBtn.count() > 0);

// Drop a pin in the middle of the plan.
await pinBtn.click();
const plane = page.locator('div.relative.flex-1.min-h-0').last();
const box = await plane.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(400);

const textarea = page.locator('textarea[placeholder="What needs doing here?"]');
ok('popup opens with the note box', await textarea.count() === 1);

// 1 — Save keeps it open.
await textarea.fill('Leaking valve by the riser');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(250);
ok('Save keeps the popup open', await textarea.isVisible());
ok('Save flashes Saved', await page.getByRole('button', { name: 'Saved' }).count() === 1);
await page.waitForTimeout(600);   // let the debounced persist land
const savedText = await page.evaluate(() =>
  (JSON.parse(localStorage.getItem('wolfson_app_data')).planPins ?? [])[0]?.text);
ok('note text persisted', savedText === 'Leaking valve by the riser', String(savedText));

// 2 — Mark as done records who.
await page.getByRole('button', { name: 'Mark as done' }).click();
await page.waitForTimeout(300);
const closedLine = page.getByText(/Closed by Architect Avi/);
ok('Closed by <name> appears', await closedLine.count() >= 1);
const resolvedBy = await page.evaluate(() =>
  (JSON.parse(localStorage.getItem('wolfson_app_data')).planPins ?? [])[0]?.resolvedBy);
ok('resolvedBy persisted', resolvedBy === 'Architect Avi', String(resolvedBy));

// 3 — Reopen clears it.
await page.getByRole('button', { name: 'Reopen' }).click();
await page.waitForTimeout(300);
ok('Reopen clears the closed-by line', await closedLine.count() === 0);
ok('Mark as done is back', await page.getByRole('button', { name: 'Mark as done' }).count() === 1);

// 4 — Delete asks twice.
await page.locator('button[title="Remove this pin"]').click();
await page.waitForTimeout(200);
const stillThere = await page.evaluate(() =>
  (JSON.parse(localStorage.getItem('wolfson_app_data')).planPins ?? []).length);
ok('first tap arms, nothing deleted yet', await page.getByRole('button', { name: 'Delete?' }).count() === 1);
await page.getByRole('button', { name: 'Delete?' }).click();
await page.waitForTimeout(600);
const left = await page.evaluate(() =>
  (JSON.parse(localStorage.getItem('wolfson_app_data')).planPins ?? []).length);
ok('second tap deletes the pin', left === 0, `before=${stillThere} after=${left}`);
ok('popup closed after delete', await textarea.count() === 0);

await page.screenshot({ path: 'scratchpad/pinpopup.png' });
await browser.close();
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
