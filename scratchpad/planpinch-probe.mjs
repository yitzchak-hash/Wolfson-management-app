// Probe: pinching the plan in the job window is ABSOLUTE — the sheet point
// under the first-touch centre stays under the fingers, no jumping.
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('PLAN', { x: 380, y: 300, size: 40, font, color: rgb(0.1, 0.13, 0.18) });
  page.drawRectangle({ x: 20, y: 20, width: 802, height: 555, borderColor: rgb(0.2, 0.25, 0.3), borderWidth: 2 });
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();

const APP = 'http://localhost:5174';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
await ctx.route('**/api/drive-files', async route => {
  const body = route.request().postDataJSON();
  if (body.metaOnly) return route.fulfill({ json: { folder: { id: body.folderId, name: 'Probe - 1' } } });
  if (body.folderId === 'F-j') return route.fulfill({ json: { files: [{ id: 'F-p', name: 'Engineered Plans', mimeType: FOLDER_MIME }] } });
  if (body.folderId === 'F-p') return route.fulfill({ json: { files: [{ id: 'PDF-1', name: 'plan.pdf', mimeType: 'application/pdf' }] } });
  return route.fulfill({ json: { files: [] } });
});
await ctx.route('**/api/drive-fetch', route => route.fulfill({ body: planBytes, contentType: 'application/pdf' }));
await ctx.route('**/api/share', route => route.fulfill({ json: { ok: true } }));
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('general_app_data', JSON.stringify({
    apartments: [{
      id: 'G-p', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Pinch',
      classification: 'standard', isUnnamed: false, createdAt: '2026-01-01', canvasX: 300, canvasY: 200,
      driveLink: 'https://drive.google.com/drive/folders/F-j',
      plansPdfLink: 'https://drive.google.com/file/d/PDF-1/view',
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
await page.locator('[data-node-id="G-p"]').dblclick();
await page.waitForTimeout(4000);

// The sheet canvas in the drawer's plan pane.
const sheet = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')];
  const c = cs.find(x => x.getBoundingClientRect().width > 150);
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
check(!!sheet, 'plan sheet rendered in the drawer pane', JSON.stringify(sheet));
if (!sheet) { await b.close(); process.exit(1); }

// The sheet FRACTION under the pinch centre, before the gesture.
const cx = sheet.x + sheet.w * 0.5, cy = sheet.y + sheet.h * 0.5;
const frac = { fx: 0.5, fy: 0.5 };

const cdp = await ctx.newCDPSession(page);
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
  type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i })),
});

// Two fingers 120px apart around the centre; spread to 300px over 20 frames,
// while the midpoint also travels 60px right.
const frames = 20;
await touch('touchStart', [{ x: cx - 60, y: cy }, { x: cx + 60, y: cy }]);
let maxDrift = 0;
for (let i = 1; i <= frames; i++) {
  const half = 60 + (90 * i) / frames;
  const mx = cx + (60 * i) / frames;
  await touch('touchMove', [{ x: mx - half, y: cy }, { x: mx + half, y: cy }]);
  await page.waitForTimeout(30);
  // Where is the anchored sheet point now, and how far from the fingers' mid?
  const drift = await page.evaluate(([fx, fy, mx2, my2]) => {
    const cs = [...document.querySelectorAll('canvas')];
    const c = cs.find(x => x.getBoundingClientRect().width > 150);
    if (!c) return 9999;
    const r = c.getBoundingClientRect();
    const px = r.x + r.width * fx, py = r.y + r.height * fy;
    return Math.hypot(px - mx2, py - my2);
  }, [frac.fx, frac.fy, mx, cy]);
  maxDrift = Math.max(maxDrift, drift);
}
await touch('touchEnd', []);
await page.waitForTimeout(500);

const finalW = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')];
  const c = cs.find(x => x.getBoundingClientRect().width > 150);
  return c ? c.getBoundingClientRect().width : 0;
});
check(finalW > sheet.w * 2.2, `pinch out grew the sheet ~2.5x (${Math.round(sheet.w)} → ${Math.round(finalW)})`);
check(maxDrift < 30, `anchored point stays under the fingers (max drift ${Math.round(maxDrift)}px)`);

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
