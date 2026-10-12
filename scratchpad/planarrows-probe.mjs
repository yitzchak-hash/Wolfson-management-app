// Recording 12 Oct 14:40: the plan preview's arrows, two bars not three,
// and a double-click on a sheet tile. Setup borrowed from planbrowser-probe.
// The plan browser, live: a job with a Drive link and NO plans folder opens
// its pane on the browser at the job folder's root (folder tiles, file tiles,
// a type badge on the CAD file); stepping into a folder updates the
// breadcrumb and a crumb walks back up; the preview arrow opens the sheet in
// the pane with a Back that returns to the SAME folder at the SAME scroll and
// writes NO plansPdfLink; the star writes plansPdfLink and moves when another
// is starred (tile star and the preview strip's star alike); a job WITH plans
// opens on its sheet and the bar's browse button reaches the browser (plans
// folder, root one crumb up) with Back returning to the sheet; and the Plans
// chooser draws tiles wearing the star and the preview arrow.
//
// Runs against a keyed dev server on 5174 (the drawer's Drive block is rightly
// dead without a key). Every /api route is stubbed — the catch-all FIRST,
// because Playwright consults routes newest-first — and drive.google.com is
// aborted (the aspect probe's image decode must fail fast, not hang).
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const APP = process.env.APP ?? 'http://localhost:5174';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan(title) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 30, y: 30, width: 782, height: 535, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  page.drawText(title, { x: 60, y: 520, size: 24, font, color: rgb(0.12, 0.23, 0.37) });
  return Buffer.from(await doc.save());
}
const PLAN = await makePlan('PROBE SHEET');

const FOLDER = 'application/vnd.google-apps.folder';
const PDF = 'application/pdf';
const NAMES = {
  'F-root1': 'Noplan, Family - 1',
  'F-root2': 'Planned, Family - 2',
  'F-old': 'Old plans',
  'F-2024': '2024',
  'F-plans': 'Engineered Plans',
  'F-annot': 'Annotated Plans',
};
// Enough files in "Old plans" that the grid SCROLLS in the pane — the
// same-scroll-position claim needs somewhere to scroll to.
const OLD_FILES = [
  { id: 'PDF-A', name: 'ground.pdf', mimeType: PDF },
  { id: 'PDF-A2', name: 'roof.pdf', mimeType: PDF },
  ...Array.from({ length: 70 }, (_, i) => ({ id: `PDF-X${i}`, name: `sheet ${i + 1}.pdf`, mimeType: PDF })),
];
const LISTING = {
  'F-root1': [
    { id: 'F-old', name: 'Old plans', mimeType: FOLDER },
    { id: 'IMG1', name: 'site photo.jpg', mimeType: 'image/jpeg' },
    { id: 'DWG1', name: 'layout.dwg', mimeType: 'image/vnd.dwg' },
  ],
  'F-old': [{ id: 'F-2024', name: '2024', mimeType: FOLDER }, ...OLD_FILES],
  'F-2024': [{ id: 'PDF-B', name: 'riser.pdf', mimeType: PDF }],
  'F-root2': [{ id: 'F-plans', name: 'Engineered Plans', mimeType: FOLDER }],
  'F-plans': [
    { id: 'PDF1', name: 'Ground floor.pdf', mimeType: PDF },
    { id: 'PDF2', name: 'Electrical riser.pdf', mimeType: PDF },
    { id: 'F-annot', name: 'Annotated Plans', mimeType: FOLDER },
  ],
  'F-annot': [{ id: 'ANN-1', name: 'annotated version 1.0 — probe.pdf', mimeType: PDF }],
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });

// The catch-all FIRST (newest-first consultation), then the specific ones.
await ctx.route('**/api/**', route => route.fulfill({ json: {} }));
await ctx.route('**/api/drive-files', route => {
  const body = route.request().postDataJSON();
  if (body.metaOnly) {
    return route.fulfill({ json: { folder: { id: body.folderId, name: NAMES[body.folderId] ?? body.folderId, mimeType: FOLDER }, files: [] } });
  }
  return route.fulfill({ json: { files: LISTING[body.folderId] ?? [] } });
});
await ctx.route('**/api/drive-fetch', route => route.fulfill({ body: PLAN, contentType: 'application/pdf' }));
await ctx.route('**/api/share', route => route.fulfill({ json: { ok: true } }));
await ctx.route('**/api/folder', route => route.fulfill({ json: { folderId: 'F-photos' } }));
await ctx.route('**/api/drive-path', route => route.fulfill({ json: { path: [] } }));
await ctx.route('**drive.google.com/**', route => route.abort());
await ctx.route('**fonts.googleapis.com/**', route => route.abort());

await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const job = (id, name, folder, x, extra = {}) => ({
    id, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {}, canvasX: x, canvasY: 190,
    driveLink: `https://drive.google.com/drive/folders/${folder}`,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    ...extra,
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    apartments: [
      job('G-noplan', 'Noplan, Family', 'F-root1', 300),
      job('G-plan', 'Planned, Family', 'F-root2', 600, { plansPdfLink: 'https://drive.google.com/file/d/PDF1/view' }),
    ],
    canvasElements: [],
  }));
});

const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });

const storedLink = id => page.evaluate(id => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  return (d.apartments ?? []).find(a => a.id === id)?.plansPdfLink ?? null;
}, id);
const waitFor = async (sel, ms = 12000) => {
  try { await page.locator(sel).first().waitFor({ state: 'visible', timeout: ms }); return true; }
  catch { return false; }
};
const crumbs = () => page.evaluate(() =>
  [...document.querySelectorAll('[data-plan-browser] [data-crumb]')].map(b => b.textContent.trim()));
const closeDrawer = async () => {
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    if (await page.locator('.drawer-panel').count() === 0) return;
  }
};


// ── the recording of 12 Oct 14:40 ──────────────────────────────────────────
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2500);
await page.locator('[data-node-id="G-noplan"]').dblclick();
check(await waitFor('[data-plan-browser]'), 'the browser stands in the pane');
await page.waitForTimeout(600);
await page.locator('[data-folder-tile="F-old"]').click();
await page.waitForTimeout(900);
// A DOUBLE-click on a sheet tile — he hit a crash screen doing this once.
await page.locator('[data-file-tile="PDF-A"]').dblclick({ position: { x: 30, y: 30 } });
await page.waitForTimeout(1500);
check(await page.locator('[data-plan-preview]').count() === 1, 'a double-click on a sheet opens it (no crash)');
check(await page.locator('text=/Something went wrong|crashed/i').count() === 0, 'no crash screen');

// TWO bars, not three: back and the star ride the first bar.
await waitFor('[data-plan-preview] canvas');
await page.waitForTimeout(800);
const bars = await page.evaluate(() => {
  const pv = document.querySelector('[data-plan-preview]');
  const back = pv?.querySelector('[data-preview-back]');
  const star = pv?.querySelector('[data-preview-star]');
  // Rows of navy above the sheet: count distinct bar rows by their top.
  const rows = new Set([...pv.querySelectorAll('div')].filter(d => {
    const bg = getComputedStyle(d).backgroundColor;
    return (bg === 'rgb(30, 58, 95)' || bg === 'rgb(44, 79, 120)' || bg === 'rgb(22, 48, 79)') && d.getBoundingClientRect().height < 60 && d.getBoundingClientRect().height > 20;
  }).map(d => Math.round(d.getBoundingClientRect().top)));
  return {
    rows: rows.size,
    sameRow: back && star ? Math.abs(back.getBoundingClientRect().top - star.getBoundingClientRect().top) < 12 : false,
  };
});
check(bars.rows === 2, 'two bars over the sheet, not three', JSON.stringify(bars));
check(bars.sameRow, 'back-to-folder and "make this the main plan" share the first bar');

// The arrows walk the folder's sheets.
const name = () => page.evaluate(() => document.querySelector('[data-plan-preview]')?.getAttribute('data-plan-preview'));
const n0 = await name();
const pv = await page.locator('[data-plan-preview]').boundingBox();
await page.mouse.move(pv.x + pv.width / 2, pv.y + pv.height / 2);
await page.waitForTimeout(300);
const op = await page.evaluate(() => getComputedStyle(document.querySelector('[data-plan-next]')).opacity);
check(op === '1', 'hovering the sheet shows the arrows', op);
await page.locator('[data-plan-next]').click();
await page.waitForTimeout(900);
const n1 = await name();
check(n0 === 'PDF-A' && n1 === 'PDF-A2', 'the right arrow opens the next sheet in the folder', `${n0} → ${n1}`);
await page.locator('[data-plan-prev]').click();
await page.waitForTimeout(900);
check((await name()) === 'PDF-A', 'the left arrow goes back');
const count = await page.locator('[data-plan-sheet-count]').textContent();
check(/^1 \/ 72$/.test((count ?? '').trim()), 'it says which sheet of how many', count);
check(await page.locator('[data-plan-browser]').count() === 1, 'the folder is still there under the preview');
await page.locator('[data-preview-back]').click();
await page.waitForTimeout(600);
check(await page.locator('[data-plan-preview]').count() === 0, 'Back returns to the folder');

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
