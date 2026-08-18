// The import WIZARD, driven through the real settings card: download-template
// columns, blank family names filled from Drive folder titles, stage and
// group routing from the file's own columns, the cross-workspace guard, the
// re-upload dedup, and the one-press removal of a previous import that
// touches nothing made by hand.
//
// Runs against the 5174 dev server (VITE_DRIVE_API_KEY set) because the
// folder-name enrichment rightly does nothing without the backend key.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { realisticWolfson, applySeed } from './seed.mjs';

const APP = 'http://localhost:5174';

const CSV = `Drive folder link,Family name,Address,Phone,Zoho link,Stage,Group,General notes
https://drive.google.com/drive/folders/IMPfolder001,"Testberg, Aaron",Herzl 12,527000001,https://zoho.example/1,AC installation,,New VRF install
https://drive.google.com/drive/folders/IMPfolder002,,,,,,"Done",finished last spring
https://drive.google.com/drive/folders/IMPfolder003,"Fakelov, Chaim",,050-1234567,,,New Crew,
,"Samplestein, Dov",Emek 4,+15550001111,,,Ready to Start,deposit paid
https://drive.google.com/file/d/NOTAFOLDER/view,"Broken, Link",,,,,,
https://drive.google.com/drive/folders/WOLFfolder99,"Crossed, Ida",,,,,,
`;
writeFileSync('scratchpad/import-test.csv', CSV);

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) fails++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await applySeed(ctx, blob);
// One WOLFSON apartment owns the folder the guard must recognise, and one
// HAND-MADE board job must survive the previous-import cleanup.
await ctx.addInitScript(() => {
  const raw = localStorage.getItem('wolfson_app_data');
  if (raw) {
    const d = JSON.parse(raw);
    const apt = (d.apartments ?? []).find(a => a.id === 'A1-1');
    if (apt && !apt.driveLink) {
      apt.driveLink = 'https://drive.google.com/drive/folders/WOLFfolder99';
      localStorage.setItem('wolfson_app_data', JSON.stringify(d));
    }
  }
  if (!localStorage.getItem('general_app_data')) {
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('general_app_data', JSON.stringify({
      apartments: [{
        id: 'G-handmade-1', buildingId: 'G', floor: 0, apartmentNumber: '',
        displayName: 'Handmade Job', isUnnamed: false, isDuplexApt: false,
        classification: 'standard', generalNotes: '', currentStageId: null,
        canvasX: 40, canvasY: 40, colPosition: 1, colSpan: 1, shinuiDetails: null,
        createdAt: '2026-08-01', updatedAt: '2026-08-01', updatedBy: 'u', updatedByName: 'U',
      }],
      canvasElements: [],
    }));
  }
});
// The folder-title fetches the enrichment makes.
await ctx.route('**/api/drive-files', async r => {
  const body = r.request().postDataJSON() ?? {};
  if (body.metaOnly) {
    const names = { IMPfolder002: 'Mockstein, Bella - 4470 - install' };
    await r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ folder: { id: body.folderId, name: names[body.folderId] ?? 'Unknown, Folder - x' } }) });
    return;
  }
  await r.fulfill({ status: 200, contentType: 'application/json', body: '{"files":[]}' });
});
await ctx.route('**/api/share', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));

const page = await ctx.newPage();
await page.goto(`${APP}/project`);
await page.waitForTimeout(1500);
await page.locator('header button', { hasText: /Wolfson/ }).first().click();
await page.waitForTimeout(400);
await page.getByRole('menu').getByText(/Job Board/).first().click();
await page.waitForTimeout(2000);

await page.goto(`${APP}/settings`);
await page.waitForTimeout(1200);
check(await page.getByText('Import jobs', { exact: true }).count() > 0, 'wizard card is in Job Board settings');

// ── the template downloads ──
const dl = page.waitForEvent('download');
await page.getByRole('button', { name: /Template/ }).click();
const file = await dl;
check((await file.suggestedFilename()).includes('template'), 'template downloads');

// ── upload the filled template ──
await page.locator('input[type="file"][accept*="csv"]').setInputFiles('scratchpad/import-test.csv');
await page.waitForTimeout(2500);

const chip = await page.getByText(/\d+ will be imported/).first().textContent();
check(chip?.trim() === '4 will be imported', `preview plans 4 (${chip?.trim()})`);
await page.getByRole('button', { name: /\d+ skipped/ }).click();
await page.waitForTimeout(300);
check(await page.getByText(/Drive folder belongs to Wolfson/).count() > 0, 'cross-workspace folder skipped, named');
check(await page.getByText(/not a Drive FOLDER link/).count() > 0, 'a file link is refused as not a folder');
check(await page.getByText(/Apply will also create/).count() > 0, 'preview names the stage and group it will create');
// Rows live inside collapsed sections — open the Done group's to see them.
await page.getByRole('button', { name: /Done group/ }).first().click();
await page.waitForTimeout(300);
check(await page.getByText('Mockstein', { exact: false }).count() > 0, 'blank family name filled from the Drive folder title');

// ── apply, then read what actually landed ──
await page.getByRole('button', { name: /^Import 4 jobs$/ }).click();
await page.waitForTimeout(1500);
check(await page.getByText(/4 jobs imported/).count() > 0, 'apply reports 4 imported');

const state = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  const jobs = (d.apartments ?? []).filter(a => a.id.startsWith('G-imp-'));
  const stages = (d.stages ?? []).filter(s => s.projectId === 'general');
  const bins = (d.canvasElements ?? []).filter(e => e.type === 'bin');
  return {
    jobs: jobs.map(j => ({ name: j.displayName, bin: j.boardBin ?? '', phone: j.phone ?? '', stageId: j.currentStageId, notes: j.generalNotes, zoho: j.zohoLink ?? '', address: j.address ?? '' })),
    stageById: Object.fromEntries((d.stages ?? []).map(s => [s.id, s.name])),
    customBins: bins.filter(b => !b.binKind).map(b => b.text),
    handmade: (d.apartments ?? []).some(a => a.id === 'G-handmade-1'),
  };
});
const byName = Object.fromEntries(state.jobs.map(j => [j.name, j]));
check(state.jobs.length === 4, `4 jobs in the store (${state.jobs.length})`);
check(state.stageById[byName['Testberg, Aaron']?.stageId] === 'AC installation' && byName['Testberg, Aaron']?.bin === '',
  'stage column routed to a created stage, open board');
check(byName['Testberg, Aaron']?.phone === '0527000001', 'Israeli phone got its zero');
check(byName['Mockstein, Bella']?.bin === 'done', 'Done group label matched the built-in bin');
check(!!byName['Fakelov, Chaim'] && byName['Fakelov, Chaim'].bin.startsWith('CE-bin-'), 'unknown group label created a real group');
check(state.customBins.includes('New Crew'), 'the New Crew group exists');
check(byName['Samplestein, Dov']?.phone === '+15550001111', 'American phone untouched, driveless row imported');

// ── re-upload: dedup plans only the driveless row (no folder to match) ──
await page.locator('input[type="file"][accept*="csv"]').setInputFiles('scratchpad/import-test.csv');
await page.waitForTimeout(2500);
const again = await page.getByText(/\d+ will be imported/).first().textContent();
check(again?.trim() === '1 will be imported', `re-upload dedupes the Drive rows (${again?.trim()})`);
await page.getByRole('button', { name: /Cancel/ }).click();
await page.waitForTimeout(400);

// ── clear the previous import — the handmade job must survive ──
check(await page.getByText(/A previous import left 4 jobs/).count() > 0, 'previous-import strip counts 4');
await page.getByRole('button', { name: /Remove previous import/ }).click();
await page.getByRole('button', { name: /Yes, remove 4/ }).click();
await page.waitForTimeout(1200);
const after = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  return {
    imported: (d.apartments ?? []).filter(a => a.id.startsWith('G-imp-')).length,
    handmade: (d.apartments ?? []).some(a => a.id === 'G-handmade-1'),
  };
});
check(after.imported === 0, 'previous import removed');
check(after.handmade, 'the handmade job survived the cleanup');

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
await browser.close();
process.exit(fails ? 1 : 0);
