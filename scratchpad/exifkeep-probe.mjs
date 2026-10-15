// Photos keep their EXIF (owner's ask, 2026-10-15): a JPEG carrying GPS, the
// date taken, the camera and an orientation goes through the app's upload.
//   A · the file the Tasks page sends to Google Drive is the ORIGINAL, byte
//       for byte, and still carries its GPS.
//   B · the shrunk copy (the base64 fallback and the portal's previews) still
//       carries GPS / date taken / make / model, its orientation is written
//       as upright, and its pixels really are upright.
// Needs the keyed dev server on 5174 (VITE_DRIVE_API_KEY=test-key).
import { chromium } from 'playwright';
import piexif from 'piexifjs';

const APP = 'http://localhost:5174';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('wolfson_app_data')) return;
  const user = { id: 'U-t', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const apt = { id: 'A1-47', buildingId: 'A1', floor: 13, apartmentNumber: '47', displayName: '47', isUnnamed: false,
    isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {},
    driveLink: 'https://drive.google.com/drive/folders/JOBFOLDER123',
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' };
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    users: [user], currentUser: user, apartments: [apt],
    contractors: [{ id: 'C-ig', name: 'Igor', email: '', category: 'ac', token: 'tok-ig', active: true, createdAt: '2026-01-01' }],
    buildings: [{ id: 'A1', name: 'Building A1' }],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });

// ── The Drive backend, stubbed. The PUT body is the file that would reach Drive.
let sent = null, sessionAsk = null;
await page.route('**/api/**', async r => {
  const u = r.request().url();
  if (u.includes('/api/drive-session')) {
    sessionAsk = JSON.parse(r.request().postData() ?? '{}');
    return r.fulfill({ json: { uploadUrl: `${APP}/__fake_drive_upload` } });
  }
  if (u.includes('/api/folder')) return r.fulfill({ json: { id: 'TASKSFOLDER', folderId: 'TASKSFOLDER' } });
  return r.fulfill({ json: { ok: true } });
});
await page.route('**/__fake_drive_upload', async r => {
  sent = r.request().postDataBuffer();
  return r.fulfill({ json: { id: 'DRIVEFILE1', webViewLink: 'https://drive.google.com/file/d/DRIVEFILE1/view' } });
});

await page.goto(`${APP}/tasks`);
await page.waitForTimeout(2500);

// ── The test photo: 1600×1000 stored, Orientation 6 (shown 1000×1600), GPS, date, camera.
const plainB64 = await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 1600; c.height = 1000;
  const g = c.getContext('2d');
  g.fillStyle = '#3b82f6'; g.fillRect(0, 0, 1600, 1000);
  g.fillStyle = '#ef4444'; g.fillRect(0, 0, 400, 1000);  // a red band on the stored LEFT
  return c.toDataURL('image/jpeg', 0.9);
});
const exif = {
  '0th': { [piexif.ImageIFD.Make]: 'Samsung', [piexif.ImageIFD.Model]: 'Galaxy S25', [piexif.ImageIFD.Orientation]: 6 },
  Exif: { [piexif.ExifIFD.DateTimeOriginal]: '2026:10:14 09:41:07' },
  GPS: {
    [piexif.GPSIFD.GPSLatitudeRef]: 'N', [piexif.GPSIFD.GPSLatitude]: piexif.GPSHelper.degToDmsRational(31.7468),
    [piexif.GPSIFD.GPSLongitudeRef]: 'E', [piexif.GPSIFD.GPSLongitude]: piexif.GPSHelper.degToDmsRational(34.9886),
  },
};
const photoUrl = piexif.insert(piexif.dump(exif), plainB64);
const photo = Buffer.from(photoUrl.split(',')[1], 'base64');
const latOf = d => d?.GPS?.[piexif.GPSIFD.GPSLatitude] ? piexif.GPSHelper.dmsRationalToDeg(d.GPS[piexif.GPSIFD.GPSLatitude], d.GPS[piexif.GPSIFD.GPSLatitudeRef]) : null;

// ── A · the Tasks page's add form sends the original to Drive
{
  await page.locator('[data-add-task]').click();
  await page.waitForTimeout(400);
  const aptSel = page.locator('select:has(option[value="A1-47"])').first();
  await aptSel.selectOption('A1-47');
  await page.waitForTimeout(200);
  await page.locator('input[type=file][accept^="image/*,video/*,.pdf"]').first()
    .setInputFiles({ name: 'site-photo.jpg', mimeType: 'image/jpeg', buffer: photo });
  for (let i = 0; i < 40 && !sent; i++) await page.waitForTimeout(150);
  check(!!sent, 'the photo was sent to Drive');
  check(!!sent && Buffer.compare(sent, photo) === 0, 'what reached Drive is the original file, byte for byte', `${sent?.length} vs ${photo.length}`);
  let d = null;
  try { d = piexif.load('data:image/jpeg;base64,' + sent.toString('base64')); } catch {}
  check(Math.abs((latOf(d) ?? 0) - 31.7468) < 1e-3, 'the file sent to Drive still has its GPS', String(latOf(d)));
  check(d?.Exif?.[piexif.ExifIFD.DateTimeOriginal] === '2026:10:14 09:41:07', '…and its date taken');
  check(sessionAsk?.filename === 'site-photo.jpg' && sessionAsk?.mimeType === 'image/jpeg', 'Drive is told the original name and type', JSON.stringify(sessionAsk));
  await page.waitForTimeout(400);
  check(await page.locator('img[alt="site-photo.jpg"][src*="DRIVEFILE1"]').count() > 0, 'the attachments list shows it, as the Drive file under its original name');
}

// ── B · the shrunk copy keeps the metadata and stands upright
{
  const out = await page.evaluate(async b64 => {
    const m = await import('/src/data/imageMeta.ts');
    const bin = atob(b64.split(',')[1]); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const file = new File([u8], 'site-photo.jpg', { type: 'image/jpeg' });
    const url = await m.shrinkImageToDataUrl(file);
    const small = await m.shrinkImage(file);
    const img = new Image(); img.src = url; await img.decode();
    // Draw it raw: the red band (stored left) must now be on TOP — the pixels were turned.
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const top = g.getImageData(Math.floor(c.width / 2), 20, 1, 1).data;
    const bottom = g.getImageData(Math.floor(c.width / 2), c.height - 20, 1, 1).data;
    return { url, w: img.naturalWidth, h: img.naturalHeight, top: [...top], bottom: [...bottom], smallName: small.name, smallType: small.type, smallSize: small.size };
  }, photoUrl);
  let d = null;
  try { d = piexif.load(out.url); } catch {}
  check(Math.abs((latOf(d) ?? 0) - 31.7468) < 1e-3, 'the shrunk copy keeps the GPS', String(latOf(d)));
  check(d?.Exif?.[piexif.ExifIFD.DateTimeOriginal] === '2026:10:14 09:41:07', 'the shrunk copy keeps the date taken');
  check(d?.['0th']?.[piexif.ImageIFD.Make] === 'Samsung' && d?.['0th']?.[piexif.ImageIFD.Model] === 'Galaxy S25', 'the shrunk copy keeps make and model');
  check(d?.['0th']?.[piexif.ImageIFD.Orientation] === 1, 'its orientation is written as upright (the pixels are already turned)');
  check(out.w === 750 && out.h === 1200, 'the copy is shrunk to 1200 on the long side, standing up', `${out.w}×${out.h}`);
  check(out.top[0] > 180 && out.top[2] < 120 && out.bottom[2] > 180, 'its pixels really are upright (the red band is on top)', `${out.top} / ${out.bottom}`);
  check(out.smallName === 'site-photo.jpg' && out.smallType === 'image/jpeg' && out.smallSize < photo.length, 'shrinkImage gives a smaller .jpg file');
}

// ── C · an iPhone HEIC (the browser cannot draw it) goes through untouched
{
  const heicSame = await page.evaluate(async () => {
    const m = await import('/src/data/imageMeta.ts');
    const f = new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99])], 'IMG_0001.HEIC', { type: 'image/heic' });
    return (await m.shrinkImage(f)) === f;
  });
  check(heicSame, 'a HEIC the browser cannot draw is handed back as it is');
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
