// The plan viewer's two bars, checked in the RUNNING APP.
//
// Not a mockup. The markup and the compiled stylesheet are lifted straight out
// of the app with a real plan open, so what the approval page shows is the same
// pixels the drawer draws — the first version was hand-drawn and the owner
// rightly said it was too far off to judge.
//
// The arrangement the owner drew on the workbench:
//   BAR 1  navy      plan name · gap · copy folder path · Mark up
//   BAR 2  #2c4f78   pin · Plans · gap · Layers · Download · Print · full screen
// and both of them INSIDE the plan pane, never across the drawer's header.
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


let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };

const read = await page.evaluate(() => {
  const drawer = document.querySelector('.drawer-panel');
  if (!drawer) return null;
  const navy = (el) => getComputedStyle(el).backgroundColor;
  // The two bars are the only children painted in the two bar colours.
  const bars = [...drawer.querySelectorAll('div')].filter(d => {
    const c = navy(d);
    return (c === 'rgb(30, 58, 95)' || c === 'rgb(44, 79, 120)')
      && d.className.includes('flex items-center') && d.querySelector('button, span');
  });
  const label = (b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim();
  const header = [...drawer.querySelectorAll('div')]
    .find(d => navy(d) === 'rgb(30, 58, 95)' && /Worker status|Print/.test(d.textContent ?? ''));
  const pane = drawer.querySelector('canvas')?.closest('div[class*="flex-col"]');
  return {
    bars: bars.map(b => ({
      colour: navy(b),
      text: label(b),
      left: Math.round(b.getBoundingClientRect().left),
      width: Math.round(b.getBoundingClientRect().width),
    })),
    headerText: label(header ?? document.createElement('div')),
    paneLeft: pane ? Math.round(pane.getBoundingClientRect().left) : null,
    drawerLeft: Math.round(drawer.getBoundingClientRect().left),
  };
});
console.log(JSON.stringify(read, null, 1));

check(!!read, 'the drawer is open');
const bar1 = read.bars.find(b => b.colour === 'rgb(30, 58, 95)' && /Mark up/.test(b.text));
const bar2 = read.bars.find(b => b.colour === 'rgb(44, 79, 120)');

check(!!bar1, 'BAR 1 is there, in the app navy', bar1?.text);
check(!!bar2, 'BAR 2 is there, in the lighter navy', bar2?.text);

if (bar1) {
  check(/Frielich/.test(bar1.text), 'bar 1 carries the plan name', bar1.text);
  check(/Mark up/.test(bar1.text), 'and Mark up', bar1.text);
  check(!/Layers|Download|Print/.test(bar1.text), 'and NOT the second bar s buttons', bar1.text);
}
if (bar2) {
  check(/Plans/.test(bar2.text), 'bar 2 carries Plans', bar2.text);
  check(/Layers/.test(bar2.text), 'Layers', bar2.text);
  check(/Download/.test(bar2.text), 'Download', bar2.text);
  check(/Print/.test(bar2.text), 'Print', bar2.text);
}

// The whole point of the left edge: neither bar may reach into the details
// and worker-status column.
if (bar1 && read.paneLeft != null) {
  check(bar1.left >= read.paneLeft - 2,
    'bar 1 starts at the plan pane s edge, clear of the job details',
    `bar ${bar1.left} vs pane ${read.paneLeft} (drawer ${read.drawerLeft})`);
  check(bar1.left > read.drawerLeft + 100,
    'and nowhere near the drawer s own left edge',
    `${bar1.left} vs ${read.drawerLeft}`);
}

// The header must be back to being about the JOB.
check(!/Layers|Download|Mark up/.test(read.headerText),
  'the drawer header no longer carries the plan s controls', read.headerText);

// The folder picker and the standing bubble row are gone; Plans is the chooser.
const gone = await page.evaluate(() => {
  const d = document.querySelector('.drawer-panel');
  const t = (d?.textContent ?? '');
  return {
    chips: [...d.querySelectorAll('span')].filter(s => s.className.includes('edge-fade')).length,
    versions: [...d.querySelectorAll('button')]
      .filter(b => /Saved versions/i.test(b.getAttribute('title') ?? '')).length,
    plansBtn: [...d.querySelectorAll('button[data-open-plans]')].length,
  };
});
console.log('       ', JSON.stringify(gone));
check(gone.chips === 0, 'the standing row of plan bubbles is off the bar', String(gone.chips));
check(gone.versions === 0, 'Saved versions is off the bar — Plans reaches them', String(gone.versions));
check(gone.plansBtn === 1, 'and Plans is on it, exactly once', String(gone.plansBtn));

// What the old single-bar checks were guarding, kept: the pin belongs IN a
// bar rather than floating over the file name, and the bar has no X that
// closes nothing (the pane is a pane, not a window).
const chrome = await page.evaluate(() => {
  const d = document.querySelector('.drawer-panel');
  const txt = e => (e?.textContent ?? '').replace(/\s+/g, ' ');
  const bar2 = [...d.querySelectorAll('div')].find(x =>
    getComputedStyle(x).backgroundColor === 'rgb(44, 79, 120)' && /Plans/.test(txt(x)));
  return {
    pinInBar: /Pin/.test(txt(bar2)),
    floatingPin: !!d.querySelector('.absolute.top-2.left-2'),
    deadX: !!d.querySelector('[data-close-studio]'),
    // The white strip that used to sit above the sheet carrying Mark up.
    oldStrip: [...d.querySelectorAll('div')].some(x =>
      /Mark up/.test(txt(x))
      && getComputedStyle(x).backgroundColor === 'rgb(255, 255, 255)'
      && getComputedStyle(x).borderBottomWidth !== '0px'
      && x.querySelectorAll('div').length < 8),
  };
});
console.log('       ', JSON.stringify(chrome));
check(chrome.pinInBar, 'the Pin sits in bar 2, first');
check(!chrome.floatingPin, 'and never floats over the file name');
check(!chrome.deadX, 'no X on an embedded pane — it closes nothing');
check(!chrome.oldStrip, 'and the old white strip above the sheet is gone');

// Plans must actually open the chooser.
await page.evaluate(() => document.querySelector('button[data-open-plans]')?.click());
await page.waitForTimeout(1200);
const picker = await page.evaluate(() => {
  const t = document.body.innerText;
  return { open: /Frielich — risers|Annotated Plans|Choose/i.test(t) };
});
check(picker.open, 'pressing Plans opens the chooser', JSON.stringify(picker));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

await page.screenshot({ path: 'scratchpad/planbars-after.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await browser.close();
process.exit(fails ? 1 : 0);
