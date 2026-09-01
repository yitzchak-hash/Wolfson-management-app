// The punch list files ITSELF: add a pin in the drawer's preview, wait out
// the (shortened) idle clock, and a "punch list" PDF lands in
// Annotated Plans/Pins with no button pressed — one file, updated in place
// on the next change, with the tiny Drive flash on the plan.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 20, y: 20, width: 1151, height: 802, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  return Buffer.from(await doc.save());
}

const planBytes = await makePlan();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true });
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await applySeed(ctx, blob);
await ctx.addInitScript(() => {
  localStorage.setItem('pin_push_idle_ms', '2500');   // a minute in real life
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw);
  for (const a of d.apartments ?? []) if (a.id === 'A1-53') {
    a.plansPdfLink = 'https://drive.google.com/file/d/PINAUTOPLAN/view';
    a.driveLink = 'https://drive.google.com/drive/folders/JOBFOLDER1';
  }
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});

const stampBodies = [];
await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx.route('**/api/plan-annotate', r => {
  stampBodies.push(JSON.parse(r.request().postData() || '{}'));
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    fileId: `PINSFILE${stampBodies.length}`, name: 'punch.pdf',
    webViewLink: 'https://drive.google.com/file/d/PINSFILE/view', folderId: 'PF', version: 1, sizeBytes: 9,
  }) });
});
await ctx.route('**/api/drive-files', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) }));
await ctx.route('**/api/share', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
await ctx.route('**://drive.google.com/**', r => r.abort());

const page = await ctx.newPage();
await page.goto('http://localhost:5174/project');
await page.waitForTimeout(3000);
await page.evaluate(() => document.querySelector('[data-apt-id="A1-53"]')?.click());
await page.waitForTimeout(6000);

// Add a pin from the PREVIEW: arm the Pin button, click the sheet, save the note.
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => /punch-list pin/i.test(b.title))?.click();
});
await page.waitForTimeout(400);
const sheet = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('.drawer-panel canvas')].map(c => c.getBoundingClientRect());
  const r = cs.sort((a, b) => b.width - a.width)[0];
  return r ? { x: r.x + r.width * 0.4, y: r.y + r.height * 0.35 } : null;
});
check(!!sheet, 'the sheet is on screen to pin');
await page.mouse.click(sheet.x, sheet.y);
await page.waitForTimeout(600);
const bubble = page.locator('textarea, input[type="text"]').last();
await page.keyboard.type('leaking joint');
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === 'Save' && b.closest('[class*="fixed"], [class*="absolute"]'))?.click();
});
await page.waitForTimeout(1200);
check(stampBodies.length === 0, 'nothing files straight away — the clock is running');

// The idle clock runs out: the punch list files itself — and the tiny Drive
// flash shows the moment it lands (it fades in ~3s, so catch it live).
const chipShown = await page.waitForSelector('[data-pins-filed-chip]', { timeout: 7000 })
  .then(() => true).catch(() => false);
check(chipShown, 'the tiny Drive flash showed on the plan');
await page.waitForTimeout(500);
check(stampBodies.length === 1, `the punch list filed by itself (${stampBodies.length})`);
const b1 = stampBodies[0] ?? {};
check(b1.nameTag === 'punch list', 'named "punch list", not an annotated version');
check(b1.folderName === 'Annotated Plans/Pins', 'into the Pins folder INSIDE Annotated Plans');
check(!b1.updateFileId, 'the first filing creates');
check((b1.strokes ?? []).some(s => s.tool === 'ellipse'), 'and it carries the pin marks');

// The file id is remembered ON THE APARTMENT, so the next change UPDATES it.
const remembered = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('wolfson_app_data') ?? '{}')
    .apartments?.find(a => a.id === 'A1-53')?.pinsDriveFileId ?? null);
check(remembered === 'PINSFILE1', `the one file's id rides the apartment (${remembered})`);

// Resolve the pin (a change) → one more filing, an UPDATE of the same file.
// The bubble is still open from the add (Save keeps it open) — clicking the
// pin again would CLOSE it, this probe's own first trap.
await page.evaluate(() => {
  const done = [...document.querySelectorAll('button')].find(b => /mark as done/i.test(b.textContent ?? ''));
  if (done) { done.click(); return; }
  document.querySelector('[data-plan-pin]')?.click();
});
await page.waitForTimeout(400);
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => /mark as done/i.test(b.textContent ?? ''))?.click();
});
await page.waitForTimeout(4500);
check(stampBodies.length === 2, `resolving the pin filed again (${stampBodies.length})`);
check(stampBodies[1]?.updateFileId === 'PINSFILE1', '…as an UPDATE of the same punch-list file');

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
