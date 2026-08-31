import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs';
const visual = s => [...s].reverse().join('')
  .replace(/[0-9A-Za-z][0-9A-Za-z ./-]*[0-9A-Za-z]|[0-9A-Za-z]/g, run => [...run].reverse().join(''));
const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const heb = await doc.embedFont(fs.readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), { subset: true });
const page1 = doc.addPage([842, 595]);
page1.drawText(visual('מגיני הגוש 48'), { x: 680, y: 405, size: 12, font: heb, color: rgb(0, 0, 0) });
const bytes = Buffer.from(await doc.save());
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const page = await browser.newPage();
await page.route('**/api/drive-fetch', r => r.fulfill({ body: bytes, contentType: 'application/pdf' }));
await page.goto('http://localhost:5173/login');
const runs = await page.evaluate(async () => {
  const m = await import('/src/data/planAddress.ts');
  return await m.debugRuns('X');
});
console.log(JSON.stringify(runs));
await browser.close();
