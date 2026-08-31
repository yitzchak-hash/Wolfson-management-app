// Probe: the plan reader also finds the PHONE number (label preferred, fax
// refused), the drawer draws the two quiet rows, and fixVisual un-garbles a
// visually-stored Hebrew line with its digits kept forwards.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

// ── fixVisual, offline through vite (the taskdays idiom) ────────────────────
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { fixVisual } = await vite.ssrLoadModule('/src/data/planAddress.ts');
// A visually-stored Hebrew line: the logical "רחוב הרצל 12 חולון" reversed,
// with the "12" kept forwards inside the visual string (as PDFs store it).
const logical = 'רחוב הרצל 12 חולון';
const visual = [...logical].reverse().join('').replace('21', '12');
check(fixVisual(visual) === logical, 'fixVisual restores a visual Hebrew line, digits forwards',
  fixVisual(visual));
await vite.close();

// ── The sheet: address AND phone in the title block, plus a fax decoy ───────
async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const t = (s, x, y, size = 10) => page.drawText(s, { x, y, size, font, color: rgb(0.1, 0.13, 0.18) });
  t('TzviAir HVAC', 40, 560, 14);
  t('Project: Bornstein residence', 40, 540);
  page.drawRectangle({ x: 520, y: 20, width: 300, height: 110, borderColor: rgb(0.2, 0.25, 0.3), borderWidth: 1 });
  t('Address: 8 Weizmann St, Bnei Brak', 532, 104, 11);
  t('Fax: 03-6161616', 532, 84);
  t('Tel: 052-123-4567', 532, 64, 11);
  t('Drawn by: R. Levi', 532, 40);
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();

const APP = 'http://localhost:5174';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });

const FOLDER_MIME = 'application/vnd.google-apps.folder';
await ctx.route('**/api/drive-files', async route => {
  const body = route.request().postDataJSON();
  if (body.metaOnly) {
    return route.fulfill({ json: { folder: { id: body.folderId, name: 'Bornstein, Ari - 555' } } });
  }
  if (body.folderId === 'F-born') {
    return route.fulfill({ json: { files: [
      { id: 'F-born-plans', name: 'Engineered Plans', mimeType: FOLDER_MIME },
    ] } });
  }
  if (body.folderId === 'F-born-plans') {
    return route.fulfill({ json: { files: [
      { id: 'PDF-born', name: 'ac-plan.pdf', mimeType: 'application/pdf' },
    ] } });
  }
  return route.fulfill({ json: { files: [] } });
});
await ctx.route('**/api/drive-fetch', route =>
  route.fulfill({ body: planBytes, contentType: 'application/pdf' }));
await ctx.route('**/api/share', route => route.fulfill({ json: { ok: true } }));
await ctx.route('**/api/folder', route => route.fulfill({ json: { id: 'X' } }));

await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('general_app_data', JSON.stringify({
    apartments: [{
      id: 'G-born', buildingId: 'G', apartmentNumber: '', floor: 0,
      displayName: 'Bornstein', classification: 'standard', isUnnamed: false,
      createdAt: '2026-01-01', canvasX: 300, canvasY: 200,
      driveLink: 'https://drive.google.com/drive/folders/F-born',
    }],
    currentUser: { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
  }));
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
  }));
});
const page = await ctx.newPage();
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2800);
await page.locator('[data-node-id="G-born"]').dblclick();
await page.waitForTimeout(2500);
await page.waitForSelector('[data-plan-read="phone"] [data-plan-address-use]', { timeout: 25000 });

const addrRow = await page.locator('[data-plan-read="address"]').innerText();
check(addrRow.includes('8 Weizmann St, Bnei Brak'), 'address row reads the address', addrRow);
const phoneRow = await page.locator('[data-plan-read="phone"]').innerText();
check(phoneRow.includes('052-123-4567'), 'phone row prefers the labelled Tel over the fax', phoneRow);
check(!(await page.locator('text=Read the address from the plan').count()),
  'no standing read button — the rows are quiet and automatic');

// The plus writes the phone.
await page.locator('[data-plan-read="phone"] [data-plan-address-use]').click();
await page.waitForTimeout(700);
const d = await page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));
check(d.apartments[0].phone === '052-123-4567', 'the blue plus writes the phone onto the job',
  d.apartments[0].phone ?? '(none)');

// The eye on the phone row opens its own cutout.
await page.locator('[data-plan-read="phone"] [data-plan-address-eye]').click();
await page.waitForTimeout(500);
const img = page.locator('img[alt*="part of the plan"]').first();
const nat = await img.evaluate(el => ({ w: el.naturalWidth, h: el.naturalHeight }));
check(nat.w > 300 && nat.h > 30, 'phone eye opens a readable cutout', JSON.stringify(nat));

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
