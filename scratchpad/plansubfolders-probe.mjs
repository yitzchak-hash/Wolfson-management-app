// The Plans picker's folder dropdown: folders, THEN their subfolders — each
// child slotted in under its parent, indented, choosable.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const TREE = {
  JOBFOLDER1: [
    { id: 'EP', name: 'Engineered Plans', mimeType: FOLDER_MIME },
    { id: 'PH', name: 'Photos', mimeType: FOLDER_MIME },
  ],
  EP: [
    { id: 'PLANPDF1', name: 'ground floor.pdf', mimeType: 'application/pdf' },
    { id: 'AP', name: 'Annotated Plans', mimeType: FOLDER_MIME },
  ],
  PH: [{ id: 'BEF', name: 'Before works', mimeType: FOLDER_MIME }],
  AP: [], BEF: [],
};

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
    a.plansPdfLink = 'https://drive.google.com/file/d/PLANPDF1/view';
    a.driveLink = 'https://drive.google.com/drive/folders/JOBFOLDER1';
  }
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});
await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx.route('**/api/drive-files', r => {
  const body = JSON.parse(r.request().postData() || '{}');
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ files: TREE[body.folderId] ?? [] }) });
});
await ctx.route('**/api/share', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
await ctx.route('**://drive.google.com/**', r => r.abort());

const page = await ctx.newPage();
await page.goto('http://localhost:5174/project');
await page.waitForTimeout(3000);
await page.evaluate(() => document.querySelector('[data-apt-id="A1-53"]')?.click());
await page.waitForTimeout(6000);

// Open the picker off the plan pane's Plans button, then the folder dropdown.
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => /Choose a plan/.test(b.title))?.click();
});
await page.waitForTimeout(1200);
check(await page.locator('[data-plan-picker]').count() === 1, 'the picker opened');
await page.locator('[data-folder-button]').click();
await page.waitForTimeout(2500);

const rows = await page.evaluate(() =>
  [...document.querySelectorAll('[data-folder-row]')].map(b => ({
    id: b.getAttribute('data-folder-row'),
    sub: b.getAttribute('data-folder-sub') === '1',
    left: Math.round(b.querySelector('svg').getBoundingClientRect().left),
    name: b.textContent?.trim(),
  })));
check(rows.length === 4, `folders AND subfolders are listed (${rows.length})`, JSON.stringify(rows.map(r => r.name)));
const ep = rows.findIndex(r => r.id === 'EP');
const ap = rows.findIndex(r => r.id === 'AP');
const ph = rows.findIndex(r => r.id === 'PH');
const bef = rows.findIndex(r => r.id === 'BEF');
check(ep >= 0 && ap === ep + 1, 'Annotated Plans sits directly under Engineered Plans');
check(ph >= 0 && bef === ph + 1, 'Before works sits directly under Photos');
check(rows[ap]?.sub && rows[bef]?.sub && !rows[ep]?.sub, 'children are marked as children');
check(rows[ap] && rows[ep] && rows[ap].left > rows[ep].left + 8, `and drawn indented (${rows[ep]?.left} -> ${rows[ap]?.left})`);

// A subfolder is choosable like any folder.
await page.locator('[data-folder-row="AP"]').click();
await page.waitForTimeout(1200);
const head = await page.locator('[data-folder-button]').textContent();
check(/Annotated Plans/.test(head ?? ''), 'choosing a subfolder opens it', head?.trim());

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
