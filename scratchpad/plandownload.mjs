// The plan download: two questions, then a file that actually arrives.
//
// The old Download was broken in a way no harness could have caught, because
// there wasn't one: the PDF button opened a Drive link that only existed once
// somebody had SAVED a markup, so on an ordinary plan it did nothing. This
// drives all FOUR answers — with/without the markings × PDF/pictures — and
// asserts a real file lands each time, with real bytes of the right kind.
//
// A real 2-page PDF is made with pdf-lib and served on /api/drive-fetch, the
// route the app truly asks, so pdf.js renders for real (the planphone
// precedent).
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { realisticWolfson, applySeed } from './seed.mjs';

const PLAN_ID = 'DLPLAN1';
const OUT = '/tmp/claude-0/-home-user-Wolfson-management-app/99bdbf4a-e40f-5735-845d-1466af88b019/scratchpad/dl';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan() {
  const doc = await PDFDocument.create();
  for (const n of [1, 2]) {
    const page = doc.addPage([1191, 842]);
    page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
    page.drawText(`SHEET ${n} — MECHANICAL LAYOUT`, { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  }
  return Buffer.from(await doc.save());
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const planBytes = await makePlan();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
await applySeed(ctx, blob);
// A plan on A1-53, plus two snag pins on it — one open, one closed.
await ctx.addInitScript(planId => {
  const raw = localStorage.getItem('wolfson_app_data');
  if (!raw) return;
  const d = JSON.parse(raw);
  const link = `https://drive.google.com/file/d/${planId}/view`;
  for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.plansPdfLink = link;
  d.planPins = [
    { id: 'PIN-1', apartmentId: 'A1-53', xPct: 30, yPct: 40, text: 'Duct clashes here',
      createdAt: '2026-08-01', createdBy: 'Office' },
    { id: 'PIN-2', apartmentId: 'A1-53', xPct: 70, yPct: 65, text: 'Grille moved',
      createdAt: '2026-08-01', createdBy: 'Office', resolvedAt: '2026-08-02', resolvedBy: 'Office' },
  ];
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}, PLAN_ID);
await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx.route('**://drive.google.com/**', r => r.abort());

const page = await ctx.newPage();
await page.addInitScript(() => {
  window.__dlNames = [];
  const proto = HTMLAnchorElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'download');
  Object.defineProperty(proto, 'download', {
    get() { return desc.get.call(this); },
    set(v) { window.__dlNames.push(String(v)); desc.set.call(this, v); },
  });
});
page.on('pageerror', e => { console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; });
await page.goto('http://localhost:5173/project');
await page.waitForTimeout(3000);

// Open A1-53's drawer, where the plan pane and its bar live.
await page.locator('[data-apt-id="A1-53"]').first().click();
await page.waitForTimeout(3500);
const btn = page.locator('[data-plan-download]');
check(await btn.count() >= 1, 'the Download button is on the plan bar');
if (!await btn.count()) { console.log('\nCANNOT CONTINUE'); await browser.close(); process.exit(1); }

async function grab(steps, tag) {
  await page.evaluate(() => { window.__dlNames = []; });
  await page.locator('[data-plan-download]').first().click();
  await page.waitForTimeout(500);
  const sheet = page.locator('[data-plan-download-sheet]');
  if (!await sheet.count()) return { ok: false, why: 'the sheet did not open' };
  for (let i = 0; i < steps.length; i++) {
    // The waiter must be armed BEFORE the last press: the clean PDF is handed
    // over in a millisecond, and a waiter registered afterwards misses it —
    // which reads as "no file arrived" when the file arrived perfectly.
    if (i === steps.length - 1) {
      const waiting = page.waitForEvent('download', { timeout: 45000 }).catch(() => null);
      await sheet.locator(steps[i]).click();
      var dl = await waiting;
    } else {
      await sheet.locator(steps[i]).click();
      await page.waitForTimeout(400);
    }
  }
  if (!dl) return { ok: false, why: 'no file arrived' };
  const path = `${OUT}/${tag}-${dl.suggestedFilename()}`;
  await dl.saveAs(path);
  const head = readFileSync(path).subarray(0, 8);
  const asked = await page.evaluate(() => window.__dlNames.slice());
  return {
    ok: true, name: asked[0] ?? dl.suggestedFilename(), asked, size: readFileSync(path).length,
    isPdf: head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46,
    isPng: head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47,
  };
}

// ── step 1 asks what goes in, step 2 asks the kind ─────────────────────────
await page.locator('[data-plan-download]').first().click();
await page.waitForTimeout(500);
const q1 = await page.evaluate(() => {
  const s = document.querySelector('[data-plan-download-sheet]');
  return s ? {
    markup: !!s.querySelector('[data-dl-markup]'), clean: !!s.querySelector('[data-dl-clean]'),
    pdfYet: !!s.querySelector('[data-dl-pdf]'), text: s.textContent.slice(0, 120),
  } : null;
});
check(q1 && q1.markup && q1.clean && !q1.pdfYet,
  'it asks about the MARKINGS first, and does not offer a format yet', q1 ? q1.text : 'no sheet');
await page.locator('[data-dl-markup]').click();
await page.waitForTimeout(400);
const q2 = await page.evaluate(() => {
  const s = document.querySelector('[data-plan-download-sheet]');
  return s ? { pdf: !!s.querySelector('[data-dl-pdf]'), img: !!s.querySelector('[data-dl-images]'),
               back: !!s.querySelector('[data-dl-back]') } : null;
});
check(q2 && q2.pdf && q2.img && q2.back, 'and only THEN offers PDF or pictures, with a way back');
await page.locator('[data-dl-back]').click();
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check(await page.locator('[data-plan-download-sheet]').count() === 0, 'Escape closes the sheet');
// One press backs out ONE thing — the standing rule. If the drawer went with
// it, Escape is closing two panels at a time.
check(await page.locator('.drawer-panel').count() > 0,
  'and the plan stays open behind it — Escape backs out one thing at a time');
if (await page.locator('[data-plan-download]').count() === 0) {
  await page.locator('[data-apt-id="A1-53"]').first().click();
  await page.waitForTimeout(3500);
}

// ── the four answers ───────────────────────────────────────────────────────
const marked = await grab(['[data-dl-markup]', '[data-dl-pdf]'], 'marked');
check(marked.ok && marked.isPdf && marked.size > 5000,
  'WITH the markings → a real PDF arrives', marked.ok ? `${marked.name} ${marked.size}b` : marked.why);

const cleanPdf = await grab(['[data-dl-clean]', '[data-dl-pdf]'], 'clean');
check(cleanPdf.ok && cleanPdf.isPdf, 'CLEAN → a PDF arrives', cleanPdf.ok ? `${cleanPdf.name} ${cleanPdf.size}b` : cleanPdf.why);
check(cleanPdf.ok && cleanPdf.size === planBytes.length,
  'and the clean PDF is the ORIGINAL file byte for byte, not a re-render',
  cleanPdf.ok ? `${cleanPdf.size} vs original ${planBytes.length}` : '');
check(marked.ok && cleanPdf.ok && marked.size !== cleanPdf.size,
  'the marked-up PDF is a different file from the clean one');

check(marked.ok && /\.pdf$/.test(marked.name) && marked.name.length > 8 && !/^download/.test(marked.name),
  'the file is named after the job and the plan', marked.name);

const markedImg = await grab(['[data-dl-markup]', '[data-dl-images]'], 'markedimg');
check(markedImg.ok && markedImg.isPng, 'WITH the markings → pictures arrive as PNG',
  markedImg.ok ? `${markedImg.name} ${markedImg.size}b` : markedImg.why);

const cleanImg = await grab(['[data-dl-clean]', '[data-dl-images]'], 'cleanimg');
check(cleanImg.ok && cleanImg.isPng, 'CLEAN → pictures arrive as PNG',
  cleanImg.ok ? `${cleanImg.name} ${cleanImg.size}b` : cleanImg.why);
// The pins and ink make the marked page heavier than the bare sheet: proof
// the "with the markings" answer really put something in the file.
check(markedImg.ok && cleanImg.ok && markedImg.size > cleanImg.size,
  'and the marked picture carries more than the clean one (the pins landed)',
  markedImg.ok && cleanImg.ok ? `${markedImg.size} vs ${cleanImg.size}` : '');

// ── no hardcoded English: the sheet speaks Hebrew when the app does ────────
const he = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
await applySeed(he, blob);
await he.addInitScript(planId => {
  const raw = localStorage.getItem('wolfson_app_data');
  if (!raw) return;
  const d = JSON.parse(raw);
  for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.plansPdfLink = `https://drive.google.com/file/d/${planId}/view`;
  d.settings = { ...(d.settings ?? {}), isRtl: true };
  d.mainUiStrings = { isRtl: true };
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}, PLAN_ID);
await he.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await he.route('**://drive.google.com/**', r => r.abort());
const hp = await he.newPage();
await hp.goto('http://localhost:5173/project');
await hp.waitForTimeout(3000);
await hp.locator('[data-apt-id="A1-53"]').first().click();
await hp.waitForTimeout(3500);
if (await hp.locator('[data-plan-download]').count()) {
  await hp.locator('[data-plan-download]').first().click();
  await hp.waitForTimeout(600);
  const txt = await hp.evaluate(() =>
    document.querySelector('[data-plan-download-sheet]')?.textContent ?? '');
  check(/[֐-׿]/.test(txt) && !/With the markings/i.test(txt),
    'in Hebrew the sheet is Hebrew — no hardcoded English left', txt.slice(0, 70));
} else console.log('SKIP Hebrew sheet (drawer did not open)');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
