// Option 2's wiring: every plan the app SHOWS becomes link-shared.
//
// The share route is stubbed and its calls captured — what is asserted is the
// app's own behaviour: the drawer shares the plan it displays, the portal
// shares the plan AND the stamped markup the worker is handed a link to, and
// the per-machine done-list stops the same file being shared on every render.
import { chromium } from 'playwright';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from './seed.mjs';

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) fails++; };

// A second dev server on 5174 runs with VITE_DRIVE_API_KEY set — the share
// helper (rightly) does nothing without the key, and giving the MAIN server
// a key would change upload behaviour under every other harness.
const APP = 'http://localhost:5174';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await applySeed(ctx, blob);
// A1-53 carries one plan; the worker's task apartments carry ANOTHER, plus a
// stamped markup — different ids, so each surface's share call is its own.
await ctx.addInitScript(() => {
  const raw = localStorage.getItem('wolfson_app_data');
  if (!raw) return;
  const d = JSON.parse(raw);
  if (d.__planShareSeeded) return;
  d.__planShareSeeded = true;
  const workerApts = new Set((d.contractorAssignments ?? []).map(a => a.apartmentId));
  for (const a of d.apartments ?? []) {
    if (a.id === 'A1-53') {
      a.plansPdfLink = 'https://drive.google.com/file/d/OFFICEPLAN1/view';
      // A job folder too, so the Photos tab has something to list.
      a.driveLink = 'https://drive.google.com/drive/folders/MAINFOLDER53';
    } else if (workerApts.has(a.id)) a.plansPdfLink = 'https://drive.google.com/file/d/WORKERPLAN2/view';
  }
  // One markup per worker apartment — the harness opens whichever task card
  // matches first, and the stamped-share effect keys on THAT apartment.
  d.planAnnotations = [...workerApts].map((aptId, i) => ({
    id: `PA-${i}`, apartmentId: aptId, planFileId: 'WORKERPLAN2',
    version: 1, strokes: [], pageCount: 1,
    createdAt: '2026-08-01T00:00:00Z', createdBy: 'Office',
    driveFileId: 'STAMPED3', driveUrl: 'https://drive.google.com/file/d/STAMPED3/view',
  }));
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});

const shared = [];
await ctx.route('**/api/drive-files', async r => {
  const folderId = r.request().postDataJSON()?.folderId;
  const files = folderId === 'MAINFOLDER53'
    ? [{ id: 'PHOTOSSUB7', name: 'Photos', mimeType: 'application/vnd.google-apps.folder' }]
    : folderId === 'PHOTOSSUB7'
      ? [{ id: 'PIC8', name: 'site.jpg', mimeType: 'image/jpeg' }]
      : [];
  await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files }) });
});
await ctx.route('**/api/share', async r => {
  const body = r.request().postDataJSON();
  shared.push(body.fileId);
  await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
});
// The preview iframes go nowhere in this container.
await ctx.route('**://drive.google.com/**', r => r.abort());

const page = await ctx.newPage();

// ── the office drawer shares the plan it shows ──
await page.goto(`${APP}/project`);
await page.waitForTimeout(1600);
await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().click();
await page.waitForTimeout(1400);
check(shared.includes('OFFICEPLAN1'), `drawer shared the plan it displays (calls: ${shared.join(',') || 'none'})`);

// Reopen: the done-list must stop a second call for the same file.
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const before = shared.filter(x => x === 'OFFICEPLAN1').length;
await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().click();
await page.waitForTimeout(1200);
const after = shared.filter(x => x === 'OFFICEPLAN1').length;
check(after === before, `reopening does not re-share (${before} -> ${after})`);

// The Photos tab shares the job's Photos FOLDER — one call that covers every
// picture inside it, future uploads included.
await page.locator('.drawer-panel button').filter({ hasText: /^Photos/ }).first().click();
await page.waitForTimeout(1200);
check(shared.includes('PHOTOSSUB7'), 'opening the Photos tab shared the Photos folder');
await page.keyboard.press('Escape');

// ── the worker portal shares the plan AND the stamped markup ──
await page.goto(`${APP}/c/${PORTAL_TOKEN}`);
await page.waitForTimeout(1800);
// The period filter can hide every seeded task depending on the clock — All
// shows them regardless.
await page.getByRole('button', { name: /^All$|^הכל$/ }).first().click().catch(() => {});
await page.waitForTimeout(500);
await page.locator('button, [role=button]').filter({ hasText: /concealed unit|registers|thermostats/i }).first().click();
await page.waitForTimeout(1500);
check(shared.includes('WORKERPLAN2'), 'portal shared the plan the worker is shown');
check(shared.includes('STAMPED3'), 'portal shared the stamped markup it links to');

// ── the one-press bulk share catches everything nobody has opened yet ──
// A fresh context: its localStorage carries no done-list, so every file in
// the workspace is fair game for the button.
{
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await applySeed(ctx2, blob);
  await ctx2.addInitScript(() => {
    const raw = localStorage.getItem('wolfson_app_data');
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.__planShareSeeded) return;
    d.__planShareSeeded = true;
    const workerApts = new Set((d.contractorAssignments ?? []).map(a => a.apartmentId));
    for (const a of d.apartments ?? []) {
      if (a.id === 'A1-53') a.plansPdfLink = 'https://drive.google.com/file/d/OFFICEPLAN1/view';
      else if (workerApts.has(a.id)) a.plansPdfLink = 'https://drive.google.com/file/d/WORKERPLAN2/view';
    }
    d.planAnnotations = [{
      id: 'PA-bulk', apartmentId: 'A1-53', planFileId: 'OFFICEPLAN1',
      version: 1, strokes: [], pageCount: 1,
      createdAt: '2026-08-01T00:00:00Z', createdBy: 'Office',
      driveFileId: 'STAMPED3', driveUrl: 'https://drive.google.com/file/d/STAMPED3/view',
    }];
    // The other Drive-carrying records the bulk button must reach.
    d.contractorPhotos = [...(d.contractorPhotos ?? []), {
      id: 'CP-bulk', assignmentId: 'X', apartmentId: 'A1-53', dataUrl: '',
      driveFileId: 'PHOTO4', driveUrl: 'https://drive.google.com/file/d/PHOTO4/view',
      uploadedAt: '2026-08-01T00:00:00Z', uploadedBy: 'w',
    }];
    d.stageNotes = [...(d.stageNotes ?? []), {
      id: 'SN-bulk', apartmentId: 'A1-53', stageId: 's1', noteText: 'x',
      attachments: [{ id: 'AT1', filename: 'f.pdf', mimeType: 'application/pdf', driveFileId: 'ATTACH5' }],
      createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', updatedBy: 'u', updatedByName: 'U',
    }];
    d.canvasElements = [...(d.canvasElements ?? []), {
      id: 'CE-memo', type: 'note', x: 40, y: 40, w: 165, h: 150, text: 'memo', color: '#fef9c3',
      audioUrl: 'https://drive.google.com/file/d/MEMO6/view',
    }];
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  });
  const bulkShared = [];
  await ctx2.route('**/api/share', async r => {
    bulkShared.push(r.request().postDataJSON().fileId);
    await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  const p2 = await ctx2.newPage();
  await p2.goto(`${APP}/app-settings`);
  await p2.waitForTimeout(1400);
  await p2.getByRole('button', { name: /^App$/ }).click().catch(() => {});
  await p2.waitForTimeout(600);
  const btn = p2.getByRole('button', { name: /Share everything now/ });
  check(await btn.count() > 0, 'the bulk card is in App settings');
  await btn.click();
  await p2.waitForTimeout(1500);
  const want = ['OFFICEPLAN1', 'WORKERPLAN2', 'STAMPED3', 'PHOTO4', 'ATTACH5', 'MEMO6'];
  const missing = want.filter(id => !bulkShared.includes(id));
  check(missing.length === 0,
    `one press shared plans, markups, photos, attachments and memos (${bulkShared.length} calls${missing.length ? ', missing ' + missing.join(',') : ''})`);
  await ctx2.close();
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`);
await browser.close();
process.exit(fails ? 1 : 0);
