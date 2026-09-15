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
// Runs against a keyed dev server on 5176 (the drawer's Drive block is rightly
// dead without a key). Every /api route is stubbed — the catch-all FIRST,
// because Playwright consults routes newest-first — and drive.google.com is
// aborted (the aspect probe's image decode must fail fast, not hang).
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const APP = 'http://localhost:5176';
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

// ── 1 · no plans folder → the browser at the job root ─────────────────────
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2500);
await page.locator('[data-node-id="G-noplan"]').dblclick();
check(await waitFor('[data-plan-browser]'), 'a job with no plans folder shows the browser in the pane');
await page.waitForTimeout(800);
check((await crumbs()).length === 1 && (await crumbs())[0] === 'Noplan, Family - 1',
  'one crumb: the job folder\'s own title', JSON.stringify(await crumbs()));
check(await page.locator('[data-folder-tile="F-old"]').count() === 1, 'a folder tile for "Old plans"');
check(await page.locator('[data-file-tile="IMG1"] [data-tile-star]').count() === 1
  && await page.locator('[data-file-tile="IMG1"] [data-tile-preview]').count() === 1,
  'a picture tile carries the star and the preview arrow');
check(await page.locator('[data-file-tile="DWG1"] [data-tile-badge]').count() === 1
  && (await page.locator('[data-file-tile="DWG1"] [data-tile-badge]').textContent()) === 'DWG'
  && await page.locator('[data-file-tile="DWG1"] [data-tile-star]').count() === 0
  && await page.locator('[data-file-tile="DWG1"] [data-tile-preview]').count() === 0,
  'the .dwg wears a DWG badge and has no star and no preview');
check(await page.locator('[data-plan-browser] [data-browser-back]').count() === 0,
  'no "Back to the plan" when there is no plan to go back to');
const starBox = await page.locator('[data-file-tile="IMG1"] [data-tile-star]').boundingBox();
check(starBox && starBox.width >= 28 && starBox.height >= 28, 'the star is a ≥28px target', `${starBox?.width}×${starBox?.height}`);

// ── 2 · stepping in, and a crumb back up ──────────────────────────────────
await page.locator('[data-folder-tile="F-old"]').click();
await page.waitForTimeout(900);
check(JSON.stringify(await crumbs()) === JSON.stringify(['Noplan, Family - 1', 'Old plans']),
  'stepping in adds a crumb', JSON.stringify(await crumbs()));
check(await page.locator('[data-folder-tile="F-2024"]').count() === 1
  && await page.locator('[data-file-tile="PDF-A"]').count() === 1,
  'the folder\'s own folders and files draw as tiles');
await page.locator('[data-folder-tile="F-2024"]').click();
await page.waitForTimeout(900);
check((await crumbs()).length === 3 && await page.locator('[data-file-tile="PDF-B"]').count() === 1,
  'a second step: three crumbs, the deeper file');
await page.locator('[data-crumb="F-old"]').click();
await page.waitForTimeout(600);
check((await crumbs()).length === 2 && await page.locator('[data-file-tile="PDF-A"]').count() === 1,
  'a crumb walks back up to that folder');

// ── 3 · the preview arrow: a look, never a choice ─────────────────────────
// Scroll the grid first, so "same scroll position" is a real claim.
const scroller = page.locator('[data-plan-browser] .overflow-y-auto').first();
await scroller.evaluate(el => { el.scrollTop = 220; });
await page.waitForTimeout(200);
const before = await scroller.evaluate(el => el.scrollTop);
check(before > 100, 'the grid scrolls (enough tiles to test the scroll claim)', `scrollTop ${before}`);
// Preview a tile that is IN VIEW at this scroll. Playwright's click scrolls
// its target into view first, so aiming at a top-row tile (scrolled out of
// sight) resets the scroller to 0 before the app hears a thing — and the
// same-scroll check then blames the product for the harness's own scroll.
const inView = await page.evaluate(() => {
  const sc = document.querySelector('[data-plan-browser] .overflow-y-auto');
  const r = sc.getBoundingClientRect();
  const t = [...sc.querySelectorAll('[data-file-tile]')].find(el => {
    const b = el.getBoundingClientRect(); return b.top >= r.top + 4 && b.bottom <= r.bottom - 4;
  });
  return t?.getAttribute('data-file-tile') ?? null;
});
check(!!inView, 'a tile is fully in view at that scroll', inView ?? 'none');
await page.locator(`[data-file-tile="${inView}"] [data-tile-preview]`).click();
check(await waitFor(`[data-plan-preview="${inView}"]`), 'the arrow opens that sheet in the pane');
check(await waitFor(`[data-plan-preview="${inView}"] canvas`, 20000), 'the sheet renders (pdf.js drew a canvas)');
check((await page.locator('[data-preview-back]').textContent()).includes('Old plans'),
  'the preview bar says "Back to Old plans"');
check(await page.locator('[data-plan-preview] button:has-text("Mark up")').count() === 1,
  'Mark up stands on the preview bar');
check(await page.locator('[data-plan-preview] [data-plan-browse]').count() === 0,
  'the browse button steps aside while a preview is up');
check(await page.locator('[data-preview-star][data-starred="0"]').count() === 1,
  'the preview strip offers "Make this the main plan", unstarred');
await page.waitForTimeout(600);
check((await storedLink('G-noplan')) === null, 'a preview writes NO plansPdfLink');
await page.locator('[data-preview-back]').click();
await page.waitForTimeout(500);
check(await page.locator('[data-plan-preview]').count() === 0 && await page.locator('[data-plan-browser]').isVisible(),
  'Back returns to the browser');
check((await crumbs()).length === 2 && (await crumbs())[1] === 'Old plans', 'at the SAME folder');
const after = await scroller.evaluate(el => el.scrollTop);
check(Math.abs(after - before) <= 2, 'at the SAME scroll position', `${before} → ${after}`);

// ── 4 · the star writes plansPdfLink, and moves ───────────────────────────
await page.locator('[data-file-tile="PDF-A"] [data-tile-star]').click();
await page.waitForTimeout(700);
check((await storedLink('G-noplan')) === 'https://drive.google.com/file/d/PDF-A/view',
  'the star writes plansPdfLink', await storedLink('G-noplan'));
check(await page.locator('[data-tile-star="PDF-A"][data-starred="1"]').count() === 1, 'the tile wears the star');
await page.locator('[data-file-tile="PDF-A2"] [data-tile-star]').click();
await page.waitForTimeout(700);
check((await storedLink('G-noplan')) === 'https://drive.google.com/file/d/PDF-A2/view'
  && await page.locator('[data-tile-star="PDF-A"][data-starred="0"]').count() === 1
  && await page.locator('[data-tile-star="PDF-A2"][data-starred="1"]').count() === 1,
  'starring another MOVES the star (exactly one starred file)');
check(await page.locator('[data-plan-browser]').isVisible() && (await crumbs()).length === 2,
  'starring does nothing else — the browser stays where it was');
// The preview strip's star, from a deeper folder (any file, any folder).
await page.locator('[data-folder-tile="F-2024"]').click();
await page.waitForTimeout(700);
await page.locator('[data-file-tile="PDF-B"] [data-tile-preview]').click();
await waitFor('[data-plan-preview="PDF-B"]');
await page.locator('[data-preview-star]').click();
await page.waitForTimeout(700);
check((await storedLink('G-noplan')) === 'https://drive.google.com/file/d/PDF-B/view'
  && await page.locator('[data-preview-star][data-starred="1"]').count() === 1,
  'the preview strip\'s star writes plansPdfLink too, from a deeper folder');
await page.locator('[data-preview-back]').click();
await page.waitForTimeout(400);
await closeDrawer();
check(await page.locator('.drawer-panel').count() === 0, 'the drawer closed');

// ── 5 · a job WITH plans: the sheet, then the browse button ───────────────
await page.locator('[data-node-id="G-plan"]').dblclick();
check(await waitFor('[data-plan-browse]', 15000), 'a job with plans opens on its sheet, with a browse button on the bar');
check(await page.locator('[data-plan-browser]').count() === 0, 'no browser drawn for a job with a plan');
await page.locator('[data-plan-browse]').click();
check(await waitFor('[data-plan-browser]'), 'the browse button reaches the browser');
await page.waitForTimeout(900);
check(JSON.stringify(await crumbs()) === JSON.stringify(['Planned, Family - 2', 'Engineered Plans']),
  'it starts at the plans folder with the job root one crumb up', JSON.stringify(await crumbs()));
check(await page.locator('[data-tile-star="PDF1"][data-starred="1"]').count() === 1,
  'the contractor\'s plan wears the star in the browser');
check(await page.locator('[data-browser-back]').count() === 1, 'a "Back to the plan" button is offered');
await page.locator('[data-browser-back]').click();
await page.waitForTimeout(600);
check(await page.locator('[data-plan-browser]').count() === 0 && await page.locator('[data-plan-browse]').count() === 1,
  'Back returns to the sheet');

// ── 6 · the Plans chooser: tiles, the star, the arrow ─────────────────────
await page.locator('[data-open-plans]').first().click();
check(await waitFor('[data-plan-picker]'), 'the Plans chooser opens');
await page.waitForTimeout(1200);
check(await page.locator('[data-plan-picker] [data-plan-row="PDF1"]').count() === 1
  && await page.locator('[data-plan-picker] [data-plan-row="PDF2"]').count() === 1,
  'the chooser lists the plans as tiles');
check(await page.locator('[data-plan-picker] [data-tile-star="PDF1"][data-starred="1"]').count() === 1
  && await page.locator('[data-plan-picker] [data-tile-star="PDF2"][data-starred="0"]').count() === 1,
  'the chooser\'s tiles carry the star, the contractor\'s plan lit');
check(await page.locator('[data-plan-picker] [data-tile-preview="PDF2"]').count() === 1,
  'the chooser\'s tiles carry the preview arrow');
// The arrow is a look: the pane shows PDF2 and plansPdfLink stays on PDF1.
await page.locator('[data-plan-picker] [data-tile-preview="PDF2"]').click();
await page.waitForTimeout(1200);
check(await page.locator('[data-plan-picker]').count() === 0, 'the arrow closes the chooser');
check((await storedLink('G-plan')) === 'https://drive.google.com/file/d/PDF1/view',
  'the chooser\'s arrow writes NO plansPdfLink');
// The star from the chooser writes it.
await page.locator('[data-open-plans]').first().click();
await waitFor('[data-plan-picker]');
await page.waitForTimeout(800);
await page.locator('[data-plan-picker] [data-tile-star="PDF2"]').click();
await page.waitForTimeout(700);
check((await storedLink('G-plan')) === 'https://drive.google.com/file/d/PDF2/view'
  && await page.locator('[data-plan-picker] [data-tile-star="PDF2"][data-starred="1"]').count() === 1
  && await page.locator('[data-plan-picker] [data-tile-star="PDF1"][data-starred="0"]').count() === 1,
  'the chooser\'s star writes plansPdfLink and moves the star');
// Close by the picker's OWN X (the standing manner).
await page.evaluate(() => {
  const picker = document.querySelector('[data-plan-picker]');
  [...(picker?.querySelectorAll('button') ?? [])].find(b => b.querySelector('svg.lucide-x'))?.click();
});
await page.waitForTimeout(400);
check(await page.locator('[data-plan-picker]').count() === 0, 'the chooser closes by its X');

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
