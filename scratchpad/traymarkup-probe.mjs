// The File Tray's plan flow: the eye on a PDF opens the MARKUP STUDIO
// directly, nothing reaches Drive until "where should this be saved?" is
// answered, and the answered save (and every push after) files into the
// chosen job's plans folder.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 20, y: 20, width: 1151, height: 802, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();
const FOLDER_MIME = 'application/vnd.google-apps.folder';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  if (localStorage.getItem('general_app_data')) return;   // seed only when absent
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('active_project', 'general');
  const user = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user, contractors: [] }));
  localStorage.setItem('general_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors: [],
    apartments: [{
      id: 'G-77', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Levi',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 900, canvasY: 600,
      driveLink: 'https://drive.google.com/drive/folders/JOB1',
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [
      { id: 'CE-tray', type: 'widget', widget: 'file-tray', x: 320, y: 200, w: 300, h: 260,
        text: '', color: '#ffffff',
        data: {
          folderId: 'TRAYFOLD',
          files: [{
            id: 'TF-1', name: 'site plan.pdf', mime: 'application/pdf', size: 20000,
            at: new Date().toISOString(), by: 'Esther',
            url: 'https://drive.google.com/file/d/TRAYPDF1/view', fileId: 'TRAYPDF1',
          }],
        } },
    ],
  }));
});

const stamps = [];
await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx.route('**/api/plan-annotate', r => {
  stamps.push(JSON.parse(r.request().postData() || '{}'));
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    fileId: `TM${stamps.length}`, name: 'annotated version 1.pdf',
    webViewLink: 'https://drive.google.com/file/d/TM/view', folderId: 'AF', version: 1, sizeBytes: 9,
  }) });
});
await ctx.route('**/api/drive-files', r => {
  const body = JSON.parse(r.request().postData() || '{}');
  const TREE = {
    JOB1: [{ id: 'EP1', name: 'Engineered Plans', mimeType: FOLDER_MIME }],
    EP1: [],
    TRAYFOLD: [],
  };
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(body.metaOnly
      ? { folder: { id: body.folderId, name: 'folder' } }
      : { files: TREE[body.folderId] ?? [] }) });
});
await ctx.route('**/api/share', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
await ctx.route('**://drive.google.com/**', r => r.abort());

const page = await ctx.newPage();
await page.goto('http://localhost:5174/jobs');
await page.waitForTimeout(3200);

// ── the eye opens the PREVIEW (owner correction), Mark up sits top right ──
check(await page.locator('[data-tray-file]').count() === 1, 'the tray shows the plan');
await page.locator('[data-tray-preview]').click();
await page.waitForTimeout(2500);
check(await page.locator('[data-tray-overlay]').count() === 1
  && await page.locator('[data-plan-surface="studio"]').count() === 0,
  'the eye opens the PREVIEW screen, exactly as before');
const barPos = await page.evaluate(() => {
  const b = document.querySelector('[data-tray-markup]');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { right: r.right > window.innerWidth * 0.6, top: r.top < 80 };
});
check(!!barPos && barPos.right && barPos.top, 'and Mark up stands at the TOP RIGHT of it', JSON.stringify(barPos));

// pressing it swaps to the full studio
await page.locator('[data-tray-markup]').click();
// A cold dev server compiles pdf.js on this first open — wait for the sheet,
// not a fixed beat.
await page.waitForFunction(() =>
  [...document.querySelectorAll('[data-plan-surface="studio"] canvas')]
    .some(c => c.getBoundingClientRect().width > 300), null, { timeout: 60_000 });
await page.waitForTimeout(800);
check(await page.locator('[data-plan-surface="studio"]').count() === 1
  && await page.locator('[data-tray-overlay]').count() === 0,
  'Mark up opens the full studio');

// ── draw, then prove nothing reaches Drive before the question ────────────
async function draw(y0) {
  const cs = await page.evaluate(() => {
    const arr = [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width > 300);
    const r = arr[arr.length - 1].getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await page.mouse.move(cs.x + cs.w * 0.25, cs.y + cs.h * y0);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(cs.x + cs.w * (0.25 + i * 0.03), cs.y + cs.h * (y0 + (i % 2 ? 0.03 : -0.02)));
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(800);
}
await draw(0.35);
// past the 9s Drive idle — a sketch with no chosen home pushes NOWHERE
await page.waitForTimeout(11_000);
check(stamps.length === 0, 'nothing reaches Drive before "where?" is answered', `${stamps.length} stamps`);

// ── Save asks WHERE ───────────────────────────────────────────────────────
await page.evaluate(() => {
  [...document.querySelectorAll('button')].filter(b => /^Save v\d/.test((b.textContent ?? '').trim())).pop()?.click();
});
await page.waitForTimeout(800);
check(await page.locator('[data-save-where]').count() === 1, 'pressing Save opens the where-to dialog');
check(await page.locator('[data-save-tray]').count() === 1, 'the File Tray folder is one answer');
check(await page.locator('[data-save-job="G-77"]').count() === 1, 'the workspace\'s jobs are the other');

// search narrows it
await page.fill('[data-save-search]', 'zzz');
await page.waitForTimeout(300);
check(await page.locator('[data-save-job]').count() === 0, 'the search narrows the job list');
await page.fill('[data-save-search]', 'lev');
await page.waitForTimeout(300);
check(await page.locator('[data-save-job="G-77"]').count() === 1, 'and finds Levi');

// ── picking the job files into ITS plans folder, and keeps doing so ───────
await page.locator('[data-save-job="G-77"]').click();
await page.waitForTimeout(2500);
check(stamps.length === 1 && stamps[0].parentFolderId === 'EP1',
  'the answered save files into the job\'s Engineered Plans folder', JSON.stringify(stamps.map(s => s.parentFolderId)));
check(await page.locator('[data-save-where]').count() === 0, 'and the dialog closes');

await draw(0.6);
await page.waitForTimeout(11_000);
check(stamps.length >= 2 && stamps[stamps.length - 1].parentFolderId === 'EP1',
  'the idle autosave now files to the same chosen home', JSON.stringify(stamps.map(s => s.parentFolderId)));

await browser.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
