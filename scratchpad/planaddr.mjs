// The Drive-and-plan round: a blank family name heals itself from the folder
// title (drawer open AND a too-quick Add Job), the drawer says plainly when
// Drive refuses to list a folder instead of calling it empty, the address is
// read off the plan's own text with a cutout behind the eye and written only
// by Use, and the worker's address carries a Waze icon.
//
// Runs against the 5174 dev server (started WITH VITE_DRIVE_API_KEY — the
// sharewire precedent), with every backend route stubbed via page.route.
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const APP = 'http://localhost:5174';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

// ── A one-page "plan" whose title block carries the address as real text ────
async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const t = (s, x, y, size = 10) => page.drawText(s, { x, y, size, font, color: rgb(0.1, 0.13, 0.18) });
  t('TzviAir HVAC', 40, 560, 14);
  t('Project: Cohen residence', 40, 540);
  t('Scale 1:50', 40, 520);
  page.drawRectangle({ x: 540, y: 30, width: 270, height: 90, borderColor: rgb(0.2, 0.25, 0.3), borderWidth: 1 });
  t('Sheet 1 of 1', 552, 96);
  t('Address: 14 Sokolov St, Holon', 552, 72, 11);
  t('Drawn by: R. Levi', 552, 48);
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });

// ── The whole Drive backend, stubbed ────────────────────────────────────────
const FOLDER_MIME = 'application/vnd.google-apps.folder';
await ctx.route('**/api/drive-files', async route => {
  const body = route.request().postDataJSON();
  if (body.metaOnly) {
    return route.fulfill({ json: { folder: { id: body.folderId, name: 'Aaron, David - 5-555', mimeType: FOLDER_MIME }, files: [] } });
  }
  if (body.folderId === 'F-aaron') {
    return route.fulfill({ json: { files: [
      { id: 'F-plans', name: 'engineered plans', mimeType: FOLDER_MIME },
    ] } });
  }
  if (body.folderId === 'F-plans') {
    return route.fulfill({ json: { files: [
      { id: 'PDF1', name: 'plan.pdf', mimeType: 'application/pdf' },
    ] } });
  }
  if (body.folderId === 'F-walled') {
    return route.fulfill({ status: 500, json: { error: 'File not found: F-walled' } });
  }
  return route.fulfill({ json: { files: [] } });
});
await ctx.route('**/api/drive-fetch', route =>
  route.fulfill({ body: planBytes, contentType: 'application/pdf' }));
await ctx.route('**/api/share', route => route.fulfill({ json: { ok: true } }));
await ctx.route('**/api/folder', route => route.fulfill({ json: { folderId: 'F-photos' } }));
await ctx.route('**/api/drive-path', route => route.fulfill({ json: { path: [] } }));

await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const job = (id, name, x, extra = {}) => ({
    id, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {}, canvasX: x, canvasY: 190,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    ...extra,
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [],
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, photosOptional: true, createdAt: '2026-01-01' }],
    contractorAssignments: [{
      id: 'T-w', contractorId: 'C-jo', apartmentId: 'G-aaron', buildingId: 'G',
      taskDescription: 'Hang the unit', stageId: null, dueDate: '2026-08-24',
      priority: 'normal', completedAt: null, createdAt: '2026-08-01', createdBy: 'A', createdByName: 'A',
    }],
    apartments: [
      // Blank name + linked folder: the heal-on-open case.
      job('G-aaron', '', 300, { driveLink: 'https://drive.google.com/drive/folders/F-aaron' }),
      // A folder Drive refuses to list: the honest-error case.
      job('G-walled', 'Walled', 600, { driveLink: 'https://drive.google.com/drive/folders/F-walled' }),
    ],
    canvasElements: [],
  }));
});

const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });

// ── 1 · open the nameless job: name heals, plans found, address read ────────
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2800);
// The board's own gesture: double-click a tile opens its drawer.
await page.locator('[data-node-id="G-aaron"]').dblclick();
await page.waitForTimeout(2500);

const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));
let d = await store();
let aaron = d.apartments.find(a => a.id === 'G-aaron');
check(aaron.displayName === 'Aaron, David',
  'a blank name heals itself from the folder title on open', aaron.displayName);
check((await page.locator('text=Plans found').count()) >= 1,
  'the engineered plans folder is found and says so');

// The plan's own text: the suggestion appears (auto — the address is empty),
// the eye shows the cutout, Use writes the field.
await page.waitForSelector('[data-plan-address-use]', { timeout: 25000 });
const suggestion = await page.locator('[data-plan-address]').first().innerText();
check(suggestion.includes('14 Sokolov St, Holon') && !/Address:/i.test(suggestion.replace('On the plan', '')),
  'the address is read off the plan, label stripped', suggestion.replace(/\n/g, ' · '));
await page.locator('[data-plan-address-eye]').first().click();
await page.waitForTimeout(400);
const img = await page.locator('img[alt*="part of the plan"]').first();
const natural = await img.evaluate(el => ({ w: el.naturalWidth, h: el.naturalHeight }));
check(natural.w > 350 && natural.h > 40,
  'the eye opens a cutout rendered big enough to read', JSON.stringify(natural));
await page.locator('text=Use this address').last().click();
await page.waitForTimeout(700);
d = await store();
aaron = d.apartments.find(a => a.id === 'G-aaron');
check(aaron.address === '14 Sokolov St, Holon',
  'Use writes the address onto the job', aaron.address);

// ── 2 · a folder Drive refuses to list says so, not "no plans" ──────────────
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await page.locator('[data-node-id="G-walled"]').dblclick();
await page.waitForTimeout(2000);
check((await page.locator('text=Drive would not let the app read this folder').count()) >= 1,
  'an unreadable folder is reported as unreadable — never as empty');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// ── 3 · Add Job faster than the lookup: the name still arrives ──────────────
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2500);
await page.locator('button:has-text("Add")').first().click();
await page.waitForTimeout(400);
await page.fill('input[placeholder^="https://drive.google.com"]', 'https://drive.google.com/drive/folders/F-aaron');
// Submit IMMEDIATELY — well inside the 450ms lookup debounce.
await page.locator('form button[type="submit"], form button:has-text("Add")').last().click();
await page.waitForTimeout(1500);
d = await store();
const fresh = d.apartments.find(a => a.id !== 'G-aaron' && a.id !== 'G-walled');
check(!!fresh && fresh.displayName === 'Aaron, David',
  'a job added before the lookup finished still gets its name', fresh?.displayName ?? '(none)');

// ── 4 · the worker's address carries Waze ───────────────────────────────────
await page.goto(`${APP}/c/tok-jo`);
await page.waitForTimeout(2500);
// The task's seeded date is fixed and the portal's default filter is Today —
// the container clock walks on, so show All first (the standing date trap).
await page.locator('button', { hasText: /^All$/ }).first().click();
await page.waitForTimeout(500);
await page.locator('button:has-text("Hang the unit")').first().click();
await page.waitForTimeout(800);
const waze = page.locator('a[title="Waze"]');
check(await waze.count() >= 1, 'the address ends with a little Waze icon');
const href = await waze.first().getAttribute('href');
check(!!href && href.includes('waze.com/ul?q=') && href.includes(encodeURIComponent('14 Sokolov St, Holon')),
  'and it opens Waze aimed at the address', href ?? '');

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
