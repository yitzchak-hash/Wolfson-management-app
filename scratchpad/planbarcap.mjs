// The plan viewer's bars, captured from the RUNNING APP.
//
// Not a mockup. The markup and the compiled stylesheet are lifted straight out
// of the app with a real plan open, so what the approval page shows is the same
// pixels the drawer draws — the first version was hand-drawn and the owner
// rightly said it was too far off to judge.
//
// It emits two captures from the same live DOM:
//   · "now"      — exactly as the app arranges the bar today
//   · "proposed" — the SAME nodes, moved into the arrangement he asked for
// Doing the rearrangement as DOM surgery on the real elements is the point: a
// button in the proposal is the real button, with its real classes.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { writeFileSync } from 'fs';
// The same seed every plan harness uses. Without it the app opens on the LOGIN
// page — there is no user — and every query for an apartment finds nothing,
// which is what "could not find apartment 53" was.
import { realisticWolfson, applySeed } from './seed.mjs';

// The KEYED dev server. Without VITE_DRIVE_API_KEY the app never calls the
// Drive backend at all, so the folder picker and the chips are never rendered
// and the captured bar is missing exactly the controls this is about.
const APP = 'http://localhost:5174';
const PLAN_ID = 'PLAN-MAIN';

// ── A real sheet, so the pane renders and the bar is in its live state ─────
async function makePlan() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([1191, 842]);
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(.1, .1, .2) });
  page.drawText('FRIELICH — MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(.12, .23, .37) });
  page.drawRectangle({ x: 80, y: 120, width: 1000, height: 300, color: rgb(.85, .9, .96) });
  return Buffer.from(await pdf.save());
}
const planBytes = await makePlan();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
await applySeed(ctx, blob);

/**
 * Drive, stubbed so the bar is FULL.
 *
 * A bar with one chip and no subfolders is not the bar he is trying to judge —
 * the whole question is where things sit when the folder picker, several
 * bubbles and every button are all present at once.
 */
const FOLDER = 'application/vnd.google-apps.folder';
await ctx.route('**/api/drive-files', async r => {
  const body = JSON.parse(r.request().postData() ?? '{}');
  const id = body.folderId;
  const files = {
    JOBFOLDER: [
      { id: 'PLANSFOLDER', name: 'Engineered Plans', mimeType: FOLDER },
      { id: 'PHOTOS', name: 'Photos', mimeType: FOLDER },
    ],
    PLANSFOLDER: [
      { id: PLAN_ID, name: 'Frielich.pdf', mimeType: 'application/pdf' },
      { id: 'PLAN-N', name: 'Frielich — north wing.pdf', mimeType: 'application/pdf' },
      { id: 'PLAN-R', name: 'Frielich — risers.pdf', mimeType: 'application/pdf' },
      { id: 'ANNOT', name: 'Annotated Plans', mimeType: FOLDER },
      { id: 'CAD1', name: 'Frielich לאדריכלית.dwg', mimeType: 'image/vnd.dwg' },
    ],
    ANNOT: [
      { id: 'ANN-3', name: 'annotated version 3 — 28 Aug 14:10 — Esther.pdf', mimeType: 'application/pdf' },
    ],
  }[id] ?? [];
  await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files }) });
});
await ctx.route('**/api/drive-fetch', r =>
  r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx.route('**/api/share', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await ctx.route('**://drive.google.com/**', r => r.abort());

// Give one apartment the Drive folder and the plan, in the SAME init script
// idiom the other plan harnesses use — patching after load races the app's own
// flush-on-unload, which is the documented trap.
await ctx.addInitScript(planId => {
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('drive_desktop_root', 'G:');
  const raw = localStorage.getItem('wolfson_app_data');
  if (!raw) return;
  const d = JSON.parse(raw);
  for (const a of d.apartments ?? []) {
    if (a.id === 'A1-53') {
      a.displayName = 'Frielich, Yaakov';
      a.driveLink = 'https://drive.google.com/drive/folders/JOBFOLDER';
      a.plansPdfLink = `https://drive.google.com/file/d/${planId}/view`;
    }
  }
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}, PLAN_ID);

const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
await page.goto(`${APP}/project`);
await page.waitForTimeout(2600);

const cell = await page.$('[data-apt-id="A1-53"]') ?? await page.$('text=53');
if (!cell) { console.log('could not find apartment 53'); await browser.close(); process.exit(1); }
await cell.click();
await page.waitForTimeout(8000);          // pdf.js, the chips and the folders

const found = await page.evaluate(() => ({
  drawer: !!document.querySelector('.drawer-panel'),
  canvases: document.querySelectorAll('.drawer-panel canvas').length,
  chips: document.body.innerText.match(/Frielich[^\n]*/g)?.slice(0, 4) ?? [],
}));
console.log('opened:', JSON.stringify(found));

/**
 * The header bar, plus the compiled stylesheet, straight out of the page.
 *
 * `document.styleSheets` is read rather than the <style> tags copied: Vite
 * injects styles in dev through several tags and one of them is the whole
 * Tailwind build, so serialising the live rules is both simpler and exact.
 */
const cap = await page.evaluate(() => {
  const css = [...document.styleSheets].map(s => {
    try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch { return ''; }
  }).join('\n');

  const drawer = document.querySelector('.drawer-panel');
  // The navy header is the bar this is all about.
  const header = [...drawer.querySelectorAll('div')].find(d =>
    getComputedStyle(d).backgroundColor === 'rgb(30, 58, 95)' && d.querySelector('button'));

  const strip = (node) => {
    const c = node.cloneNode(true);
    c.querySelectorAll('script').forEach(x => x.remove());
    return c;
  };

  // ── NOW: the header exactly as it stands ────────────────────────────────
  const now = strip(header).outerHTML;

  /**
   * PROPOSED: the same nodes, rearranged.
   *
   * Everything below moves REAL elements — the buttons keep their own classes,
   * sizes and icons, so the proposal cannot flatter itself with styling the
   * app does not have.
   */
  const h = strip(header);
  const byText = (root, re) => [...root.querySelectorAll('button')]
    .find(b => re.test((b.textContent ?? '').replace(/\s+/g, ' ').trim())
      || re.test(b.getAttribute('title') ?? ''));

  const folderBtn = byText(h, /Engineered Plans|Choose a folder/);
  const chipsRow  = [...h.querySelectorAll('span')].find(s => s.className.includes('edge-fade'));
  const markUp    = byText(h, /^Mark up$/);
  const plansBtn  = byText(h, /^Plans$/);
  const layersBtn = byText(h, /^Layers ?\d*$/);
  const download  = byText(h, /^Download$/);
  const printBtn  = [...h.querySelectorAll('button')].filter(b => /^Print$/.test((b.textContent ?? '').trim())).pop();
  const versions  = byText(h, /Saved versions/);
  const pinBtn    = byText(h, /Pin/);
  // Full screen has NO title and no text — it is an icon inside a <Tooltip>
  // wrapper, so it has to be found by the icon lucide actually renders.
  const fullBtn   = h.querySelector('.lucide-maximize-2')?.closest('button') ?? null;
  const pathBtn   = byText(h, /path|AutoCAD|Explorer|Finder/i);
  const nameEl    = [...h.querySelectorAll('div')].find(d =>
    /Frielich\.pdf|Frielich/.test(d.textContent ?? '') && d.children.length === 0);

  // The Plans button is deleted outright: the folder picker and the bubbles
  // already are the chooser.
  plansBtn?.remove();

  // Second bar, built from the real controls that move down to it.
  const second = document.createElement('div');
  second.setAttribute('data-proposed-second-bar', '1');
  second.className = 'flex items-center gap-1.5 px-3 py-1.5';
  second.style.backgroundColor = '#2c4f78';
  for (const el of [layersBtn, pinBtn, nameEl]) if (el) second.appendChild(el);
  const grow = document.createElement('span');
  grow.className = 'flex-1';
  second.appendChild(grow);
  if (versions) second.appendChild(versions);

  // Top bar: folder picker first, then the bubbles, then the right-hand group.
  const rightGroup = document.createElement('span');
  rightGroup.className = 'flex items-center gap-1.5 flex-shrink-0';
  for (const el of [markUp, pathBtn, printBtn, download, fullBtn]) if (el) rightGroup.appendChild(el);

  const planSide = document.createElement('span');
  planSide.setAttribute('data-proposed-plan-side', '1');
  planSide.className = 'flex items-center gap-1.5 min-w-0 flex-1 ps-2';
  planSide.style.borderInlineStart = '1px dashed rgba(255,255,255,.35)';
  if (folderBtn) planSide.appendChild(folderBtn);
  if (chipsRow) planSide.appendChild(chipsRow);
  const grow2 = document.createElement('span');
  grow2.className = 'flex-1';
  planSide.appendChild(grow2);
  planSide.appendChild(rightGroup);
  h.appendChild(planSide);

  const wrapper = document.createElement('div');
  wrapper.appendChild(h);
  wrapper.appendChild(second);

  return {
    css,
    now,
    proposed: wrapper.innerHTML,
    missing: {
      folderBtn: !folderBtn, chipsRow: !chipsRow, markUp: !markUp, plansBtn: !plansBtn,
      layersBtn: !layersBtn, download: !download, printBtn: !printBtn,
      versions: !versions, pinBtn: !pinBtn, fullBtn: !fullBtn, pathBtn: !pathBtn, nameEl: !nameEl,
    },
  };
});

console.log('missing from the capture:', JSON.stringify(cap.missing));
writeFileSync('scratchpad/planbar-capture.json', JSON.stringify(cap));
console.log(`captured — css ${(cap.css.length / 1024).toFixed(0)} KB, now ${(cap.now.length / 1024).toFixed(1)} KB`);

await page.screenshot({ path: 'scratchpad/planbarcap.png' });
await browser.close();
