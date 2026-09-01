// The save story, end to end on the keyed server: the countdown sits BESIDE
// the arrow, the Save button wears the Drive mark, the first press files, a
// press with nothing new SAYS so (and sends nothing), a press after a change
// says "updated" and carries updateFileId so the server updates the same
// file — and the pins ride in the stamp payload.
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
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw);
  for (const a of d.apartments ?? []) if (a.id === 'A1-53') {
    a.plansPdfLink = 'https://drive.google.com/file/d/DRIVESAVE1/view';
    a.driveLink = 'https://drive.google.com/drive/folders/JOBFOLDER1';
  }
  // One open punch-list pin on the apartment, so the stamp payload carries it.
  d.planPins = [{ id: 'PP1', apartmentId: 'A1-53', xPct: 25, yPct: 35, text: 'probe pin',
    createdAt: '2026-01-01', createdBy: 'Probe' }];
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});

const stampBodies = [];
await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx.route('**/api/plan-annotate', r => {
  stampBodies.push(JSON.parse(r.request().postData() || '{}'));
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    fileId: `STAMPED${stampBodies.length}`, name: 'stamped.pdf',
    webViewLink: 'https://drive.google.com/file/d/STAMPED/view', folderId: 'AF', version: 1, sizeBytes: 9,
  }) });
});
await ctx.route('**/api/drive-files', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) }));
await ctx.route('**/api/folder', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'F' }) }));
await ctx.route('**/api/share', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
await ctx.route('**://drive.google.com/**', r => r.abort());

const page = await ctx.newPage();
await page.goto('http://localhost:5174/project');
await page.waitForTimeout(3000);
await page.evaluate(() => document.querySelector('[data-apt-id="A1-53"]')?.click());
await page.waitForTimeout(6000);

// Into the studio.
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent ?? '').trim() === 'Mark up' || x.title === 'Mark up');
  b?.click();
});
await page.waitForTimeout(3000);

// The Save button wears the Drive mark.
const saveBtn = page.locator('button', { hasText: /^Save v\d/ }).last();
check(await saveBtn.count() === 1, 'the Save button is on the studio bar');
check(await saveBtn.evaluate(b => !!b.querySelector('path[fill="#ffc107"]')),
  'and it wears the little Drive mark');
const label0 = (await saveBtn.textContent())?.trim();

// Draw one stroke on the live canvas (the studio's default pen).
const stage = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width > 300);
  const r = cs[cs.length - 1].getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
await page.mouse.move(stage.x + stage.w * 0.3, stage.y + stage.h * 0.3);
await page.mouse.down();
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(stage.x + stage.w * (0.3 + i * 0.04), stage.y + stage.h * (0.3 + i * 0.02));
  await page.waitForTimeout(25);
}
await page.mouse.up();
await page.waitForTimeout(1200);

// The SaveTrip appears with the countdown BESIDE the arrow, never over it.
const trip = page.locator('[data-save-state]').last();
check(await trip.count() === 1, 'the save-trip chip appeared after the stroke');
const layout = await page.evaluate(() => {
  const chip = [...document.querySelectorAll('[data-save-state]')].pop();
  const count = chip?.querySelector('[data-save-count]');
  const arrow = count?.parentElement?.querySelector('.save-fly, span > svg') ? count.parentElement.querySelector('svg') : null;
  if (!count) return { count: false };
  const cr = count.getBoundingClientRect();
  const svgs = [...(count.parentElement?.querySelectorAll('svg') ?? [])];
  const ar = svgs.length ? svgs[0].getBoundingClientRect() : null;
  return { count: true, text: count.textContent, gap: ar ? Math.round(cr.left - ar.right) : null };
});
check(layout.count && /^\d+s$/.test(layout.text ?? ''), `the countdown shows seconds (${layout.text})`);
check(layout.gap != null && layout.gap >= 0, `and sits beside the arrow, not over it (gap ${layout.gap}px)`);

// First manual save: files in Drive, no updateFileId, pins in the payload.
await saveBtn.click();
await page.waitForTimeout(1500);
check(stampBodies.length === 1, 'the first Save sent one stamp request');
const b1 = stampBodies[0] ?? {};
check(!b1.updateFileId, 'the first filing creates (no updateFileId)');
check((b1.strokes ?? []).some(s => s.tool === 'ellipse') && (b1.strokes ?? []).some(s => s.tool === 'text' && s.text === '1'),
  'the punch-list pin rides in the stamp payload');
let text = await page.evaluate(() => document.body.innerText);
check(/filed in Drive/i.test(text), 'the toast says it was filed');

// Nothing new: Save says so and sends nothing.
await page.waitForTimeout(2600);
await saveBtn.click();
await page.waitForTimeout(900);
text = await page.evaluate(() => document.body.innerText);
check(/already in Drive/i.test(text), 'a press with nothing new says "already in Drive"');
check(stampBodies.length === 1, 'and no second upload went out');
check((await saveBtn.textContent())?.trim() === label0,
  `the button still wears the sketch's own version (${label0})`);

// A change, then Save: UPDATES the same file.
await page.mouse.move(stage.x + stage.w * 0.5, stage.y + stage.h * 0.6);
await page.mouse.down();
await page.mouse.move(stage.x + stage.w * 0.6, stage.y + stage.h * 0.62);
await page.mouse.move(stage.x + stage.w * 0.7, stage.y + stage.h * 0.64);
await page.mouse.up();
await page.waitForTimeout(600);
await saveBtn.click();
await page.waitForTimeout(1500);
check(stampBodies.length === 2, 'the changed sketch went up again');
check(stampBodies[1]?.updateFileId === 'STAMPED1', '…as an UPDATE of the same Drive file');
text = await page.evaluate(() => document.body.innerText);
check(/updated in Drive/i.test(text), 'and the toast says "updated"');

// The idle autosave also updates in place — wait out the 9s clock.
await page.mouse.move(stage.x + stage.w * 0.3, stage.y + stage.h * 0.7);
await page.mouse.down();
await page.mouse.move(stage.x + stage.w * 0.4, stage.y + stage.h * 0.72);
await page.mouse.up();
await page.waitForTimeout(11000);
check(stampBodies.length === 3, 'the idle autosave pushed by itself');
check(stampBodies[2]?.updateFileId === 'STAMPED2', 'and it too updates the sketch\'s one file');

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
