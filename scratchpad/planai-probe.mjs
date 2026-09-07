// The AI plan reader (owner, 2026-09-07): with a key on the server, the address
// and phone under the fields come from a vision model; the draw-a-box picker
// shows the WHOLE sheet, reads only what is inside the box, and hands the
// crop to the model. The model is stubbed — this container has no internet.
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
const APP = 'http://localhost:5174';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const t = (s, x, y, size = 10) => page.drawText(s, { x, y, size, font, color: rgb(0.1, 0.13, 0.18) });
  t('TzviAir HVAC', 40, 560, 14);
  page.drawRectangle({ x: 540, y: 30, width: 270, height: 110, borderColor: rgb(0.2, 0.25, 0.3), borderWidth: 1 });
  t('Family: Cohen', 552, 116);
  t('Address: 14 Sokolov St, Holon', 552, 92, 11);
  t('Floor: 4', 552, 70);
  t('Tel: 050-123-4567', 552, 48);
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const FOLDER_MIME = 'application/vnd.google-apps.folder';
let aiCalls = [];
await ctx.route('**/api/drive-files', async route => {
  const body = route.request().postDataJSON();
  if (body.metaOnly) return route.fulfill({ json: { folder: { id: body.folderId, name: 'Cohen, David - 5-555', mimeType: FOLDER_MIME }, files: [] } });
  if (body.folderId === 'F-job') return route.fulfill({ json: { files: [{ id: 'F-plans', name: 'engineered plans', mimeType: FOLDER_MIME }] } });
  if (body.folderId === 'F-plans') return route.fulfill({ json: { files: [{ id: 'PDF1', name: 'plan.pdf', mimeType: 'application/pdf' }] } });
  return route.fulfill({ json: { files: [] } });
});
await ctx.route('**/api/drive-fetch', route => route.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx.route('**/api/share', route => route.fulfill({ json: { ok: true } }));
await ctx.route('**/api/folder', route => route.fulfill({ json: { folderId: 'F-photos' } }));
await ctx.route('**/api/drive-path', route => route.fulfill({ json: { path: [] } }));
await ctx.route('**/api/geocode**', async route => {
  const req = route.request();
  if (req.method() === 'GET') return route.fulfill({ json: { ok: true, hasAiKey: true, clientEmail: 'sa@probe.iam' } });
  const body = req.postDataJSON();
  if (body.planRead) {
    aiCalls.push({ crop: !!body.planRead.crop, want: body.planRead.want, bytes: body.planRead.image.length });
    if (body.planRead.crop) return route.fulfill({ json: { address: 'Crop Road 9, Yerushalayim', phone: '052-999-8888', family: 'Crop' } });
    return route.fulfill({ json: { address: 'AI Street 5, Beit Shemesh', phone: '050-111-2222', family: 'Cohen' } });
  }
  return route.fulfill({ status: 501, json: { error: 'no' } });
});
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
      id: 'G-cohen', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Cohen', isUnnamed: false, isDuplexApt: false,
      classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, canvasX: 300, canvasY: 190,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
      driveLink: 'https://drive.google.com/drive/folders/F-job',
    }],
    canvasElements: [],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2800);
await page.locator('[data-node-id="G-cohen"]').dblclick();
await page.waitForTimeout(2500);
await page.waitForSelector('[data-plan-address-use]', { timeout: 30000 });
await page.waitForTimeout(800);
const addrRow = await page.locator('[data-plan-read="address"]').innerText();
const phoneRow = await page.locator('[data-plan-read="phone"]').innerText().catch(() => '');
check(addrRow.includes('AI Street 5, Beit Shemesh'), 'the address row shows the MODEL\'s reading, not the text layer\'s', addrRow.replace(/\n/g, ' · '));
check(phoneRow.includes('050-111-2222'), 'the phone row shows the model\'s reading', phoneRow.replace(/\n/g, ' · '));
check(aiCalls.length === 1 && !aiCalls[0].crop && aiCalls[0].bytes > 20000, `one whole-page call was made (${JSON.stringify(aiCalls)})`);

// the eye → picker
await page.locator('[data-plan-read="address"] [data-plan-address-eye]').click();
await page.waitForTimeout(500);
await page.locator('[data-addr-pick]').click();
await page.waitForSelector('[data-addr-pick-stage] img', { timeout: 20000 });
await page.waitForTimeout(600);
const img = page.locator('[data-addr-pick-stage] img');
const ib = await img.boundingBox();
const dlg = await page.locator('[data-addr-picker]').boundingBox();
const nat = await img.evaluate(i => ({ w: i.naturalWidth, h: i.naturalHeight }));
check(ib.height <= dlg.height && ib.width <= dlg.width && Math.abs(ib.width / ib.height - nat.w / nat.h) < 0.02,
  `the WHOLE sheet fits the dialog, shape kept (${Math.round(ib.width)}×${Math.round(ib.height)} in ${Math.round(dlg.width)}×${Math.round(dlg.height)})`);
// A box around the address line ONLY (title block: x 540-810 of 842, the line at y≈92 from the bottom → 0.845 down)
const fx = x => ib.x + ib.width * x, fy = y => ib.y + ib.height * y;
await page.mouse.move(fx(0.645), fy(0.83));
await page.mouse.down();
await page.mouse.move(fx(0.96), fy(0.858), { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(900);
const readTxt = await page.locator('[data-addr-pick-read]').innerText();
check(readTxt.includes('Crop Road 9, Yerushalayim'), 'the box goes to the model as a CROP and its answer is what reads', readTxt);
check(aiCalls.length === 2 && aiCalls[1].crop && aiCalls[1].want === 'address', `the crop call carried crop:true and the kind (${JSON.stringify(aiCalls[1])})`);
await page.locator('[data-addr-pick-use]').click();
await page.waitForTimeout(600);
const field = await page.locator('.drawer-panel input[placeholder="Address"], .drawer-panel input[data-address], .drawer-panel input').evaluateAll(els => els.map(e => e.value).find(v => /Crop Road/.test(v)) ?? '');
check(field === 'Crop Road 9, Yerushalayim', 'Use writes the model\'s reading into the field, nothing trailing', JSON.stringify(field));

// ── the local reader alone (no key): the strict box, no bleed ─────────────
const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 } });
for (const r of ['drive-files', 'drive-fetch', 'share', 'folder', 'drive-path']) { /* same stubs */ }
await ctx2.route('**/api/drive-files', async route => {
  const body = route.request().postDataJSON();
  if (body.metaOnly) return route.fulfill({ json: { folder: { id: body.folderId, name: 'Cohen, David - 5-555', mimeType: FOLDER_MIME }, files: [] } });
  if (body.folderId === 'F-job') return route.fulfill({ json: { files: [{ id: 'F-plans', name: 'engineered plans', mimeType: FOLDER_MIME }] } });
  if (body.folderId === 'F-plans') return route.fulfill({ json: { files: [{ id: 'PDF1', name: 'plan.pdf', mimeType: 'application/pdf' }] } });
  return route.fulfill({ json: { files: [] } });
});
await ctx2.route('**/api/drive-fetch', route => route.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx2.route('**/api/share', route => route.fulfill({ json: { ok: true } }));
await ctx2.route('**/api/folder', route => route.fulfill({ json: { folderId: 'F-photos' } }));
await ctx2.route('**/api/drive-path', route => route.fulfill({ json: { path: [] } }));
await ctx2.route('**/api/geocode**', route => route.request().method() === 'GET'
  ? route.fulfill({ json: { ok: true, hasAiKey: false } })
  : route.fulfill({ status: 501, json: { error: 'no key' } }));
await ctx2.addInitScript(() => {
  localStorage.setItem('active_project', 'general'); localStorage.setItem('general_app_version', '3'); localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    apartments: [{ id: 'G-cohen', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Cohen', isUnnamed: false, isDuplexApt: false,
      classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, canvasX: 300, canvasY: 190,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', driveLink: 'https://drive.google.com/drive/folders/F-job' }],
    canvasElements: [],
  }));
});
const p2 = await ctx2.newPage();
p2.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await p2.goto(`${APP}/jobs`);
await p2.waitForTimeout(2800);
await p2.locator('[data-node-id="G-cohen"]').dblclick();
await p2.waitForSelector('[data-plan-address-use]', { timeout: 30000 });
await p2.locator('[data-plan-read="address"] [data-plan-address-eye]').click();
await p2.waitForTimeout(400);
await p2.locator('[data-addr-pick]').click();
await p2.waitForSelector('[data-addr-pick-stage] img', { timeout: 20000 });
await p2.waitForTimeout(500);
const ib2 = await p2.locator('[data-addr-pick-stage] img').boundingBox();
const gx = x => ib2.x + ib2.width * x, gy = y => ib2.y + ib2.height * y;
// The box grazes the line ABOVE ("Family") and the line BELOW ("Floor") by a
// hair — the old any-overlap rule dragged both in.
await p2.mouse.move(gx(0.645), gy(0.826));
await p2.mouse.down();
await p2.mouse.move(gx(0.96), gy(0.862), { steps: 8 });
await p2.mouse.up();
await p2.waitForTimeout(700);
const local = await p2.locator('[data-addr-pick-read]').innerText();
check(/14 Sokolov St, Holon/.test(local) && !/Floor|Family|:$/.test(local.replace(/^Reads:\s*/, '')),
  'without a key the text layer reads ONLY the line inside the box — no "Floor:", no "Family", no trailing colon', local);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
