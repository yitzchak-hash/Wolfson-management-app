// The 26 Oct recording, studio half: the workspace gutter, the page arrows,
// the string that always lands on the workspace edge, the Saved chip and the
// Save-and-start button.
// The studio's new furniture: ONE ink tile with the Samsung pen tray, the
// green version-to-plan connector following the open version, and a version
// dot that greys when its Drive file is really gone.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan() {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 2; i++) {
    const page = doc.addPage([1191, 842]);
    page.drawRectangle({ x: 20, y: 20, width: 1151, height: 802, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
    page.drawRectangle({ x: 100 + i * 500, y: 300, width: 300, height: 200, color: i ? rgb(0.9, 0.8, 0.1) : rgb(0.8, 0.1, 0.1) });
  }
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
    a.plansPdfLink = 'https://drive.google.com/file/d/MARKUP2PLAN/view';
    a.driveLink = 'https://drive.google.com/drive/folders/JOBFOLDER1';
  }
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});
const stampBodies = [];
await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx.route('**/api/plan-annotate', r => {
  stampBodies.push(JSON.parse(r.request().postData() || '{}'));
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    fileId: `MK${stampBodies.length}`, name: 'x.pdf',
    webViewLink: 'https://drive.google.com/file/d/MK/view', folderId: 'AF', version: 1, sizeBytes: 9,
  }) });
});
// A real plans-folder tree — the honest-dot check only runs when the plans
// folder is KNOWN — whose listing never contains the stamped files, so every
// filed version's file reads as "deleted from Drive" on the next open.
const TREE = {
  JOBFOLDER1: [{ id: 'EP', name: 'Engineered Plans', mimeType: 'application/vnd.google-apps.folder' }],
  EP: [{ id: 'MARKUP2PLAN', name: 'layout.pdf', mimeType: 'application/pdf' }],
};
await ctx.route('**/api/drive-files', r => {
  const body = JSON.parse(r.request().postData() || '{}');
  r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(body.metaOnly
      ? { folder: { id: body.folderId, name: 'folder' } }
      : { files: TREE[body.folderId] ?? [] }) });
});
await ctx.route('**/api/share', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
await ctx.route('**://drive.google.com/**', r => r.abort());

const page = await ctx.newPage();
await page.goto('http://localhost:5174/project');
await page.waitForTimeout(3000);
await page.evaluate(() => document.querySelector('[data-apt-id="A1-53"]')?.click());
await page.waitForTimeout(6000);
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => /^Mark up/.test((x.textContent ?? '').trim()) || x.title === 'Mark up')?.click();
});
await page.waitForTimeout(3000);

// ── The 26 Oct studio asks ───────────────────────────────────────────────
const ws = page.locator('[data-plan-workspace]');
check(await ws.count() === 1, 'the sheet sits in a framed workspace with a gutter');
const wsBox = await ws.boundingBox();
check(await page.locator('[data-studio-page]').count() === 2, 'two page arrows on the sides of a two-page plan');
const prevDisabled = await page.evaluate(() => document.querySelector('[data-studio-page="prev"]')?.disabled);
check(prevDisabled === true, 'on page 1 the left arrow is out of play');
const nb = await page.locator('[data-studio-page="next"]').boundingBox();
check(nb && nb.x >= wsBox.x + wsBox.width - 2, 'the right arrow sits in the gutter, not over the sheet',
  `${Math.round(nb?.x)} vs ${Math.round(wsBox.x + wsBox.width)}`);
await page.evaluate(() => document.querySelector('[data-studio-page="next"]')?.click());
await page.waitForTimeout(1500);
const pager = await page.evaluate(() => [...document.body.innerText.matchAll(/(\d) \/ 2/g)].map(m => m[1]).join(','));
check(/2$/.test(pager), 'the right arrow turns to page 2 (the studio\'s own pager, last on the page)', `${pager}`);
await page.evaluate(() => document.querySelector('[data-studio-page="prev"]')?.click());
await page.waitForTimeout(1500);

// One stroke → a version → the string. Then zoom far in and scroll to the
// bottom-right: the sheet's own 20% line is far above the workspace, and the
// string must end on the workspace's edge, never over the toolbars.
const st = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width > 300);
  const r = cs[cs.length - 1].getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
await page.mouse.move(st.x + st.w * 0.4, st.y + st.h * 0.4);
await page.mouse.down();
for (let i = 1; i <= 6; i++) { await page.mouse.move(st.x + st.w * (0.4 + i * 0.03), st.y + st.h * 0.42); await page.waitForTimeout(25); }
await page.mouse.up();
await page.waitForTimeout(1200);
for (let i = 0; i < 6; i++) { await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.title === 'Zoom in').pop()?.click()); await page.waitForTimeout(150); }
await page.waitForTimeout(800);
await page.evaluate(() => { const s = document.querySelector('[data-plan-stage]'); s.scrollTop = s.scrollHeight; s.scrollLeft = s.scrollWidth; });
await page.waitForTimeout(1600);
const end = await page.evaluate(() => {
  const c = document.querySelector('[data-version-link] circle');
  const svg = document.querySelector('[data-version-link]');
  if (!c || !svg) return null;
  const o = svg.getBoundingClientRect();
  return { x: o.left + Number(c.getAttribute('cx')), y: o.top + Number(c.getAttribute('cy')) };
});
const wsNow = await ws.boundingBox();
check(!!end && end.y >= wsNow.y && end.y <= wsNow.y + wsNow.height && end.x >= wsNow.x - 1,
  'zoomed in, the string still lands on the workspace edge', JSON.stringify({ end, ws: wsNow }));

// The save controls in words: a Saved chip once the version is in Drive,
// and the button says it saves this one and starts the next.
const lbl = await page.evaluate(() => document.querySelector('[data-save-lock]')?.textContent?.trim());
check(/^Save v1 & start v2$/.test(lbl ?? ''), 'the button reads "Save v1 & start v2"', lbl);
await page.evaluate(() => document.querySelector('[data-save-now]')?.click());
await page.waitForTimeout(2000);
const chip = await page.evaluate(() => document.querySelector('[data-save-state="sent"]')?.textContent?.trim());
check(chip === 'Saved', 'once it is in Drive the chip simply says Saved', chip);
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/studio53.png` });

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
