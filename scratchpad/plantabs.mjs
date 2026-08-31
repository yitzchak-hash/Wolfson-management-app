// Plan tabs, live: the strip in the viewer and the studio (boxed by its two
// upright lines), open-in-new-tab from the Plans chooser, background download
// with per-plan indicators, instant switching off the cache, + duplicating
// the current plan, red-×/green-✓ clouds, the unsaved-close ask running the
// real Drive pipeline, tabs surviving a reload, and the picked tab scrolling
// into view instead of hiding under the +.
//
// Runs against the 5174 dev server (started WITH VITE_DRIVE_API_KEY — the
// sharewire precedent), every backend route stubbed via ctx.route.
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const APP = 'http://localhost:5174';
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
const PLANS = {
  PDF1: await makePlan('GROUND FLOOR'),
  PDF2: await makePlan('ELECTRICAL RISER'),
  PDF3: await makePlan('ROOF DUCTWORK'),
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });

const FOLDER_MIME = 'application/vnd.google-apps.folder';
let stamped = 0;
await ctx.route('**/api/drive-files', async route => {
  const body = route.request().postDataJSON();
  if (body.metaOnly) {
    return route.fulfill({ json: { folder: { id: body.folderId, name: 'Aaron, David - 5-555', mimeType: FOLDER_MIME }, files: [] } });
  }
  if (body.folderId === 'F-aaron') {
    return route.fulfill({ json: { files: [{ id: 'F-plans', name: 'engineered plans', mimeType: FOLDER_MIME }] } });
  }
  if (body.folderId === 'F-plans') {
    return route.fulfill({ json: { files: [
      { id: 'PDF1', name: 'Ground floor.pdf', mimeType: 'application/pdf' },
      { id: 'PDF2', name: 'Electrical riser.pdf', mimeType: 'application/pdf' },
      { id: 'PDF3', name: 'Roof ductwork.pdf', mimeType: 'application/pdf' },
    ] } });
  }
  return route.fulfill({ json: { files: [] } });
});
let pdf3Slow = true;
await ctx.route('**/api/drive-fetch', async route => {
  const { fileId } = route.request().postDataJSON();
  // The roof plan is SLOW — once, and slow enough to survive the walk
  // through the pane AND into the studio (the strip lives only there now,
  // per decision 2) so the indicators can be seen. After the reload it
  // loads normally, or section 5 draws on a sheet that never arrives.
  if (fileId === 'PDF3' && pdf3Slow) { pdf3Slow = false; await new Promise(r => setTimeout(r, 22000)); }
  try {
    return await route.fulfill({ body: PLANS[fileId] ?? PLANS.PDF1, contentType: 'application/pdf' });
  } catch { /* the page reloaded out from under the slow response */ }
});
await ctx.route('**/api/plan-annotate', route => {
  stamped++;
  return route.fulfill({ json: {
    fileId: `ANN-${stamped}`, name: `annotated version ${stamped} — probe`,
    webViewLink: 'https://drive.google.com/file/d/ANN/view',
  } });
});
await ctx.route('**/api/share', route => route.fulfill({ json: { ok: true } }));
await ctx.route('**/api/folder', route => route.fulfill({ json: { folderId: 'F-photos' } }));
await ctx.route('**/api/drive-path', route => route.fulfill({ json: { path: [] } }));

await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    apartments: [{
      id: 'G-aaron', buildingId: 'G', floor: 0, apartmentNumber: '',
      displayName: 'Aaron, David', isUnnamed: false, isDuplexApt: false,
      classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 300, canvasY: 190,
      driveLink: 'https://drive.google.com/drive/folders/F-aaron',
      plansPdfLink: 'https://drive.google.com/file/d/PDF1/view',
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [],
  }));
});

const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });

// ── 1 · the viewer pane is a PREVIEW: no tab strip anywhere on it ──────────
// (Owner's decision 2, sealed 2026-08-30: the strip is gone from every
// preview — drawer pane, phone Plan tab, wallboard, portal — and stays
// exactly as it is inside Mark up.)
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2800);
await page.locator('[data-node-id="G-aaron"]').dblclick();
await page.waitForTimeout(3500);

check(await page.locator('[data-plan-tabs]').count() === 0,
  'no tab strip on the viewer pane — a preview never draws it (decision 2)');

// The pane's Plans chooser still lists and still shows the download
// indicators — but with no strip there is no open-in-new-tab door either.
await page.locator('[data-open-plans]').first().click();
await page.waitForTimeout(1200);
check(await page.locator('[data-plan-row]').count() >= 3, 'three plans listed in the pane chooser');
check(await page.locator('[data-open-new-tab]').count() === 0,
  'no open-in-new-tab rows where there is no strip');
check(await page.locator('[data-plan-ready]').count() >= 1,
  'a background-downloaded plan says READY', `${await page.locator('[data-plan-ready]').count()} ready`);
check(await page.locator('[data-plan-downloading]').count() >= 1,
  'the slow one shows downloading…');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// ── 2 · the studio keeps the tabs: new tab from ITS chooser ────────────────
await page.locator('button:has-text("Mark up")').first().click();
await page.waitForTimeout(3500);
check(await page.locator('[data-plan-tabs]').count() === 1, 'the studio has the tab strip');
check(await page.locator('[data-plan-tab]').count() === 1, 'one tab for the open plan');

await page.locator('[data-open-plans]').last().click();
await page.waitForTimeout(1200);
check(await page.locator('[data-open-new-tab]').count() >= 3,
  'in the studio each chooser row offers open-in-new-tab');
// New tab on the SLOW plan — its tab wears the spinner, then the sheet lands.
await page.locator('[data-open-new-tab="PDF3"]').click();
await page.waitForTimeout(500);
check(await page.locator('[data-plan-tab]').count() === 2, 'a second tab opened');
const spinning = await page.evaluate(() =>
  !!document.querySelector('[data-plan-tab][data-active] .animate-spin'));
check(spinning, 'the new tab shows its download spinner while the plan is still arriving');
await page.waitForTimeout(4500);

// ── 3 · switching back is instant (cached bytes) ───────────────────────────
const tabIds = await page.evaluate(() =>
  [...document.querySelectorAll('[data-plan-tab]')].map(e => e.getAttribute('data-plan-tab')));
await page.locator(`[data-plan-tab="${tabIds[0]}"]`).click();
await page.waitForTimeout(1800);
const inked = await page.evaluate(() => {
  // Only the STUDIO's canvases — the pane below draws the same sheet and
  // would pass the check for the wrong surface.
  const root = document.querySelector('div.z-\\[150\\]') ?? document;
  const cs = [...root.querySelectorAll('canvas')].filter(x => x.width > 200);
  let best = 0;
  for (const c of cs) {
    const d = c.getContext('2d').getImageData(0, 0, Math.min(c.width, 400), Math.min(c.height, 300)).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 240) n++;
    best = Math.max(best, n);
  }
  return best;
});
check(inked > 300, 'switching back lands the cached sheet quickly (no re-download)',
  `${inked} inked px in 1.8s`);

// ── 4 · + opens the CHOOSER; the same file again is a deliberate copy ──────
await page.locator('[data-plan-tab-new]').click();
await page.waitForTimeout(800);
check(await page.locator('[data-plan-picker]').count() === 1, 'the + opens the file chooser');
await page.locator('[data-plan-picker] [data-plan-row]').first().click();
await page.waitForTimeout(700);
check(await page.locator('[data-plan-tab]').count() === 3,
  'picking a file already open makes a copy in a fresh tab');
check((await page.locator('[data-plan-tab]').allInnerTexts()).some(t => /copy/i.test(t)),
  'the copy tab says so on its label');
await page.reload();
await page.waitForTimeout(2800);
await page.locator('[data-node-id="G-aaron"]').dblclick();
await page.waitForTimeout(3500);
check(await page.locator('[data-plan-tabs]').count() === 0,
  'after a reload the pane is still a preview — no strip');
await page.locator('button:has-text("Mark up")').first().click();
await page.waitForTimeout(3500);
check(await page.locator('[data-plan-tab]').count() === 3, 'the tabs come back after a reload');

// ── 5 · the studio: strip boxed in the bar, clouds, the unsaved ask ────────
const barShape = await page.evaluate(() => {
  const strips = [...document.querySelectorAll('[data-plan-tabs]')];
  const strip = strips[strips.length - 1];
  const holder = strip?.parentElement;               // flex-1 wrapper in the bar
  if (!holder) return null;
  const before = holder.previousElementSibling, after = holder.nextElementSibling;
  const isSep = el => !!el && el.tagName === 'SPAN' && el.getAttribute('aria-hidden') !== null
    && el.offsetWidth === 1;
  return { seps: isSep(before) && isSep(after), inBar: !!holder.closest('div')?.className };
});
check(!!barShape && barShape.seps, 'the studio bar boxes the tab section with two upright lines');

// The DRAWER is itself position:fixed, so anything scoped `.fixed …` finds
// the PANE's strip first — every studio query goes through the LAST strip.
const studioEval = (fn, arg) => page.evaluate(([src, a]) => {
  const strips = [...document.querySelectorAll('[data-plan-tabs]')];
  const strip = strips[strips.length - 1];
  // eslint-disable-next-line no-eval
  return eval(src)(strip, a);
}, [fn.toString(), arg]);

const cloudColor = () => studioEval(strip => {
  const t = strip?.querySelector('[data-plan-tab][data-active]');
  if (t?.querySelector('path[stroke="#22c55e"]')) return 'green';
  // The red × strokes its GROUP, not the lines inside it.
  if (t?.querySelector('g[stroke="#ef4444"]')) return 'red';
  return 'none';
});
const studioTabCount = () => studioEval(strip => strip?.querySelectorAll('[data-plan-tab]').length ?? 0);
const closeActiveStudioTab = () => studioEval(strip => {
  strip.querySelector('[data-plan-tab][data-active] [data-plan-tab-close]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
check(await cloudColor() === 'green', 'a clean tab wears the green ✓ cloud');

// Draw one stroke on the sheet.
const sheet = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('.fixed canvas')];
  const c = cs[cs.length - 1];
  const r = c.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.move(sheet.x - 80, sheet.y);
await page.mouse.down();
await page.mouse.move(sheet.x + 80, sheet.y + 40, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(800);
check(await cloudColor() === 'red', 'drawing turns the cloud into the big red ×');

// Close the marked tab: the ask, then Close-without-saving discards.
const tabsBefore = await studioTabCount();
await closeActiveStudioTab();
await page.waitForTimeout(500);
check(await page.locator('[data-tab-ask]').count() === 1, 'closing with unsaved marks asks the question');
check((await page.locator('[data-tab-ask]').innerText()).includes('isn’t saved'),
  'in exactly the promised words');
await page.locator('[data-tab-ask-discard]').click();
await page.waitForTimeout(600);
check(await page.locator('[data-tab-ask]').count() === 0
  && await studioTabCount() === tabsBefore - 1 && stamped === 0,
  'No closes the tab and nothing was stamped');
await page.waitForTimeout(2000);   // let the neighbouring tab's sheet land

// Draw again on the now-active tab, close, and SAVE this time.
const sheet2 = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('.fixed canvas')];
  const c = cs[cs.length - 1];
  const r = c.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.move(sheet2.x - 60, sheet2.y - 30);
await page.mouse.down();
await page.mouse.move(sheet2.x + 60, sheet2.y + 30, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(800);
check(await cloudColor() === 'red', 'the neighbouring tab takes marks of its own');
await closeActiveStudioTab();
await page.waitForTimeout(400);
await page.locator('[data-tab-ask-save]').click();
await page.waitForTimeout(1500);
check(stamped === 1, 'Save files it through the real Annotated Plans pipeline', `${stamped} stamp calls`);
check(await page.locator('[data-tab-ask]').count() === 0, 'and the ask closes with the tab');

// ── 5b · the version saved a moment ago is IN the chooser ──────────────────
await page.locator('[data-plan-tab-new]').click();
await page.waitForTimeout(800);
check(await page.locator('[data-plan-picker] [data-plan-row="ANN-1"]').count() === 1,
  'the markup saved a moment ago is listed in the chooser');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// ── 6 · too many tabs: the picked one scrolls into view ────────────────────
for (let i = 0; i < 6; i++) {
  await studioEval(strip => {
    strip.parentElement.querySelector('[data-plan-tab-new]').click();
  });
  await page.waitForTimeout(450);
  await page.evaluate(() => {
    const row = document.querySelector('[data-plan-picker] [data-plan-row]');
    row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(300);
}
const first = await studioEval(strip =>
  strip.querySelector('[data-plan-tab]').getAttribute('data-plan-tab'));
const overflowed = await studioEval((strip, id) => {
  const el = strip.querySelector(`[data-plan-tab="${id}"]`);
  const box = el.closest('.overflow-x-auto');
  return box.scrollWidth > box.clientWidth + 4;
}, first);
check(overflowed, 'seven tabs genuinely overflow the strip');
await studioEval((strip, id) => {
  strip.querySelector(`[data-plan-tab="${id}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}, first);
await page.waitForTimeout(500);
const visible = await studioEval((strip, id) => {
  const el = strip.querySelector(`[data-plan-tab="${id}"]`);
  const box = el.closest('.overflow-x-auto').getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return r.left >= box.left - 2 && r.right <= box.right + 2;
}, first);
check(visible, 'the picked tab is scrolled INTO view — it never hides under the +');

await page.screenshot({ path: 'scratchpad/plantabs.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
