// The Miller title block, reproduced: an English "Address:" label with the
// Hebrew value stored VISUALLY (characters reversed, the CAD-export way) on
// the next line, plus drawing text at the same height in the middle of the
// sheet — the merged-band trap. Drives readPlanAddress directly.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
// Visual storage the way CAD exports do it: the line reversed, but digit and
// Latin runs kept forwards (the involution fixVisual expects).
const visual = s => [...s].reverse().join('')
  .replace(/[0-9A-Za-z][0-9A-Za-z ./-]*[0-9A-Za-z]|[0-9A-Za-z]/g, run => [...run].reverse().join(''));

async function makePlan() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const heb = await doc.embedFont(fs.readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), { subset: true });
  const page = doc.addPage([842, 595]);
  const t = (s, x, y, size = 10) => page.drawText(s, { x, y, size, font: heb, color: rgb(0.1, 0.13, 0.18) });

  // The title block, right-hand column (x 660..820), like the real sheet.
  page.drawRectangle({ x: 650, y: 60, width: 180, height: 480, borderColor: rgb(0.2, 0.25, 0.3), borderWidth: 1 });
  t('Family Name:', 690, 520, 9);
  t('Miller', 715, 500, 16);
  t('Contact Info:', 692, 470, 9);
  t('054-566-4688', 690, 452, 12);
  t('Address:', 705, 425, 9);
  // The value, stored visually — the text layer carries the reversed characters.
  t(visual('מגיני הגוש 48'), 680, 405, 12);
  t('Floor:', 712, 380, 9);
  t('Floor 1', 705, 362, 12);
  t('Project Name/ City:', 680, 330, 9);
  t('Gush Etzion', 695, 312, 12);
  // The office's own number + a fax, lower in the block.
  t('Beit Shemesh 02-628-8282', 660, 120, 8);
  t('Fax: 02-628-8283', 672, 104, 8);

  // Drawing text in the MIDDLE of the sheet at the same height as the address
  // value — visually-stored junk that merges into the value's y-band.
  t(visual('פתח שירות'), 320, 407, 8);
  t(visual('לשל תיאהש'), 180, 404, 8);
  t('12 m', 420, 406, 8);

  // Some body so it does not read as a scan.
  t('TzviAir HVAC plan', 60, 560, 12);
  t('Scale 1:50', 60, 540, 9);
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const page = await browser.newPage();
await page.route('**/api/drive-fetch', r => r.fulfill({ body: planBytes, contentType: 'application/pdf' }));
await page.goto('http://localhost:5173/login');
const res = await page.evaluate(async () => {
  const m = await import('/src/data/planAddress.ts');
  return await m.readPlanAddress('TEST-MILLER');
});
console.log('read:', JSON.stringify({ address: res.address, phone: res.phone, problem: res.problem }));

check(res.address === 'מגיני הגוש 48', `the address reads right (${res.address})`);
check(res.phone ? res.phone.replace(/\D/g, '').endsWith('545664688') : false,
  `the phone is the customer's mobile (${res.phone})`);
check(!!res.cutout, 'the address cutout rendered');

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
