// The photo widgets draw a Drive photo through Drive's THUMBNAIL, never the
// web view link (owner, 2026-09-06: "why is the photo widget not showing
// photos that get uploaded when we close a problem or do a task").
import { chromium } from 'playwright';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => {
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('active_project', 'general');
  const user = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const worker = { id: 'C-w', name: 'Moshe', category: 'ac', token: 'tok', active: true, createdAt: '2026-01-01' };
  localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user, contractors: [worker] }));
  const now = Date.now();
  const at = m => new Date(now - m * 60000).toISOString();
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  localStorage.setItem('general_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors: [worker],
    apartments: [{ id: 'G-1', buildingId: 'G', apartmentNumber: '', displayName: 'Cohen', floor: 0, colPosition: 1, colSpan: 1, isDuplexApt: false, currentStageId: null, classification: 'standard', shinuiDetails: null, generalNotes: '', isUnnamed: false, canvasX: 60, canvasY: 400 }],
    contractorAssignments: [{ id: 'T-1', apartmentId: 'G-1', buildingId: 'G', contractorId: 'C-w', taskDescription: 'Fix', dueDate: null, completedAt: at(5), createdAt: at(60) }],
    contractorPhotos: [
      // The closing-screen path with a Drive backend: file id + view link, no bytes.
      { id: 'P-drive', assignmentId: 'T-1', apartmentId: 'G-1', contractorId: 'C-w', dataUrl: '', filename: 'site1.jpg', mimeType: 'image/jpeg', fileType: 'image', driveFileId: 'DRIVEFILE1', driveUrl: 'https://drive.google.com/file/d/DRIVEFILE1/view', uploadedAt: at(4) },
      // The Firebase Storage path.
      { id: 'P-store', assignmentId: 'T-1', apartmentId: 'G-1', contractorId: 'C-w', dataUrl: '', filename: 'site2.jpg', mimeType: 'image/jpeg', fileType: 'image', storageUrl: png, uploadedAt: at(3) },
      // A video must NOT be in a photo widget.
      { id: 'P-vid', assignmentId: 'T-1', apartmentId: 'G-1', contractorId: 'C-w', dataUrl: '', filename: 'clip.webm', mimeType: 'video/webm', fileType: 'video', driveFileId: 'DRIVEVID', driveUrl: 'https://drive.google.com/file/d/DRIVEVID/view', uploadedAt: at(2) },
    ],
    canvasElements: [
      { id: 'CE-photos', type: 'widget', widget: 'recent-photos', x: 400, y: 60, w: 300, h: 220, z: 5, data: {} },
      { id: 'CE-one', type: 'widget', widget: 'recent-photos', x: 760, y: 60, w: 300, h: 220, z: 5, data: { look: 'one' } },
    ],
  }));
});
await ctx.route('**://drive.google.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') }));
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; });
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(3500);
const grid = page.locator('[data-node-id="CE-photos"] img');
const srcs = await grid.evaluateAll(els => els.map(e => e.getAttribute('src') || ''));
check(srcs.length === 2, `the grid shows the two PICTURES, not the video (${srcs.length})`);
check(srcs.some(s => /thumbnail|DRIVEFILE1/.test(s) && !/\/view$/.test(s)), 'the Drive photo is drawn through its thumbnail address, not the view link', srcs.find(s => /DRIVEFILE1/.test(s)));
check(srcs.some(s => s.startsWith('data:image/png')), 'the Storage photo is drawn straight');
const one = await page.locator('[data-node-id="CE-one"] img').evaluateAll(els => els.map(e => e.getAttribute('src') || ''));
check(one.length >= 1 && !one.some(s => /\/view$/.test(s)), 'the one-at-a-time look draws a real image too', one[0]);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await browser.close();
