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

// ── The consolidated ink tile ─────────────────────────────────────────────
const rail = await page.evaluate(() => {
  const labels = [...document.querySelectorAll('button span')].map(s => s.textContent?.trim());
  return {
    inkTiles: document.querySelectorAll('[data-ink-tile]').length,
    pencilTile: labels.filter(l => l === 'Pencil').length,
    markerTile: labels.filter(l => l === 'Marker').length,
    highTile: labels.filter(l => l === 'Highlighter').length,
    eraser: labels.filter(l => l === 'Eraser').length,
  };
});
check(rail.inkTiles === 1, 'ONE ink tile on the rail');
check(rail.pencilTile === 0 && rail.markerTile === 0 && rail.highTile === 0,
  'pencil / marker / highlighter tiles are gone', JSON.stringify(rail));
check(rail.eraser === 1, 'the eraser keeps its own tile');

// The pen is the studio's opening tool, so the tile is already armed — a
// press on the tool in the hand opens the DRAWER (pressing an unarmed tile
// would arm it instead).
await page.evaluate(() => document.querySelector('[data-ink-tile]')?.click());
await page.waitForTimeout(500);
check(await page.locator('[data-pen-tray]').count() === 1, 'pressing the armed ink tile opens the pen drawer');
check(await page.locator('[data-pen-tray] [data-pen]').count() === 9,
  'ALL NINE writing tools stand in ONE row', `${await page.locator('[data-pen-tray] [data-pen]').count()}`);
check(await page.evaluate(() => {
  const t = document.querySelector('[data-pen-tray]');
  return t && getComputedStyle(t).backdropFilter.includes('blur');
}), 'the drawer is frosted glass');

// The chosen pen is LIFTED; picking another lifts that one while the tray
// stays — and the scribble REDRAWS in the new pen's handwriting.
const liftOf = id => page.evaluate(pid => {
  const pen = document.querySelector(`[data-pen="${pid}"] span`);
  return pen ? new DOMMatrix(getComputedStyle(pen).transform === 'none' ? '' : getComputedStyle(pen).transform).f : null;
}, id);
const scribbleOf = () => page.evaluate(() =>
  document.querySelector('[data-tray-scribble]')?.toDataURL() ?? '');
check((await liftOf('pen')) < -6, `the pen in the hand is lifted (${await liftOf('pen')})`);
const scribPen = await scribbleOf();
await page.evaluate(() => document.querySelector('[data-pen="marker"]')?.click());
await page.waitForTimeout(700);
check(await page.locator('[data-pen-tray]').count() === 1, 'the tray stays open so the change is seen');
check((await liftOf('marker')) < -6 && (await liftOf('pen')) > -2,
  `the marker rises and the pen settles (${await liftOf('marker')} / ${await liftOf('pen')})`);
const scribMarker = await scribbleOf();
check(scribPen.length > 300 && scribMarker.length > 300 && scribPen !== scribMarker,
  'the scribble redrew in the marker\'s own hand');
const tileLabel = await page.evaluate(() =>
  document.querySelector('[data-ink-tile]')?.textContent?.trim());
check(tileLabel === 'Marker', `the tile now wears the marker (${tileLabel})`);

// The drawer carries size and colour, Samsung's manner — and a highlighter
// swaps the chips to the HIGHLIGHT shades.
check(await page.locator('[data-tray-size]').count() === 1, 'the size slider lives in the drawer');
const inkChips = await page.locator('[data-tray-color]').count();
await page.evaluate(() => document.querySelector('[data-pen="highlighter"]')?.click());
await page.waitForTimeout(500);
const hiChips = await page.locator('[data-tray-color]').count();
check(inkChips === 11 && hiChips === 6,
  `a highlighter swaps to the highlight shades (${inkChips} -> ${hiChips})`);

// Arm the DIRECTIONAL nib and close the tray WITHOUT drawing — the sheet has
// to stay blank for the connector section's first check, so the calligraphy
// widths proof rides that section's own first stroke instead.
await page.evaluate(() => document.querySelector('[data-pen="calligraphy"]')?.click());
await page.waitForTimeout(400);
// Escape closes the tray and nothing behind it.
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check(await page.locator('[data-pen-tray]').count() === 0
  && await page.locator('[data-top-undo]').count() === 1, 'Escape closes the tray, the studio stands');

// ── The connector line ────────────────────────────────────────────────────
check(await page.locator('[data-version-link]').count() === 0, 'a blank sheet is connected to nothing');
// draw one stroke → version 1 begins → the line appears at its button. It is
// a ZIGZAG in the calligraphy hand, so the same stroke proves the directional
// nib wrote varying per-point widths into the record (what makes the PDF
// match) — a straight line holds one direction and one width.
const stage = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width > 300);
  const r = cs[cs.length - 1].getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
await page.mouse.move(stage.x + stage.w * 0.3, stage.y + stage.h * 0.3);
await page.mouse.down();
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(stage.x + stage.w * (0.3 + i * 0.03), stage.y + stage.h * (0.3 + (i % 2 ? 0.03 : -0.02)));
  await page.waitForTimeout(25);
}
await page.mouse.up();
await page.waitForTimeout(1000);
check(await page.locator('[data-version-link] path').count() === 1, 'drawing connects the sheet to v1');
const calli = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('wolfson_app_data') ?? '{}');
  const st = (d.planAnnotations ?? []).flatMap(a => a.strokes ?? []).find(s => s.tool === 'calligraphy');
  if (!st) return null;
  const ws = [];
  for (let i = 2; i < st.pts.length; i += 3) ws.push(st.pts[i]);
  return { min: Math.min(...ws), max: Math.max(...ws) };
});
check(!!calli && calli.max > calli.min * 1.5,
  `the calligraphy nib shaped the stroke (widths ${calli?.min?.toFixed(2)}..${calli?.max?.toFixed(2)})`);
// A SCRIBBLE, not plumbing: curves only, no straight L segments (the
// owner's "not ninety degree angles" ask).
const linkD = await page.evaluate(() =>
  document.querySelector('[data-version-link] path')?.getAttribute('d') ?? '');
check(linkD.includes('C') && !/ L /.test(linkD), 'and the line is a curvy scribble, no right angles');
check(await page.evaluate(() =>
  document.querySelector('[data-version-active]')?.textContent?.includes('v1') ?? false),
  'and v1\'s rail button is the marked one');

// Save (locks v1) → draw again (v2) → the line re-keys to v2's button.
const saveBtn = page.locator('button', { hasText: /^Save v\d/ }).last();
await saveBtn.click();
await page.waitForTimeout(1200);
await page.mouse.move(stage.x + stage.w * 0.4, stage.y + stage.h * 0.5);
await page.mouse.down();
await page.mouse.move(stage.x + stage.w * 0.5, stage.y + stage.h * 0.52);
await page.mouse.up();
await page.waitForTimeout(900);
const activeV = await page.evaluate(() => document.querySelector('[data-version-active]')?.getAttribute('data-version-btn'));
check(activeV === '2', `after the seal, the next mark connects to v2 (${activeV})`);
// Clicking v1 moves the line back — and mints NOTHING: looking at a version
// is looking (dirty stays down, so the autosave cannot spawn a copy record
// and push a Drive file for a mere click-through).
const recordsBefore = await page.evaluate(() =>
  document.querySelectorAll('[data-version-btn]').length);
await page.evaluate(() => document.querySelector('[data-version-btn="1"]')?.click());
await page.waitForTimeout(700);
check(await page.evaluate(() => document.querySelector('[data-version-active]')?.getAttribute('data-version-btn')) === '1',
  'clicking v1 moves the connector to v1');
check(await page.evaluate(() => document.querySelectorAll('[data-version-btn]').length) === recordsBefore,
  'and viewing it mints no new version');

// ── The honest dot ────────────────────────────────────────────────────────
// v1 is filed (green in this session) — but Drive's listing (stubbed empty)
// says its file is gone. Reopen the studio: the check runs fresh, and v1's
// dot must be GREY.
await page.evaluate(() => document.querySelector('[data-close-studio]')?.click());
await page.waitForTimeout(600);
// v2's marks have not reached Drive — the leave-ask stands; close anyway.
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => /close anyway/i.test(b.textContent ?? ''))?.click();
});
await page.waitForTimeout(800);
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(x => /^Mark up/.test((x.textContent ?? '').trim()) || x.title === 'Mark up')?.click();
});
await page.waitForTimeout(3000);
const dot = await page.evaluate(() => {
  const btn = document.querySelector('[data-version-btn="1"]');
  const d = btn?.querySelector('[data-version-dot]');
  return { title: btn?.title ?? '', color: d ? getComputedStyle(d).backgroundColor : '' };
});
check(!/74, 222, 128/.test(dot.color), `a deleted file's dot is not green (${dot.color})`);
check(/deleted/.test(dot.title), 'and the title says the Drive file was deleted');

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
