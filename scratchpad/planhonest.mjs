// The honest plan reader (owner, 2026-10-05): "Where is it getting this
// from? I'm not seeing the box … If there's no phone number and there's no
// address, it should be empty."
//
// A suggestion appears ONLY when the app can show where on the sheet it was
// read. Cases, driven through the real drawer AND the reader directly:
//  (a) an A1-12-like sheet with no customer address or phone, and a model
//      that answers an invented address and 054-1234567 → NO rows;
//      the office's own lines from the same model → refused, even printed;
//  (b) a sheet whose text has a real address and a mobile → both rows, and
//      the eye shows a cutout with the value boxed, plus the whole sheet
//      with a SMALL box at the printed spot;
//  (c) model values the local reader cannot find but that ARE printed →
//      shown, boxed where the text layer has them; a wrong house number or
//      digit → dropped; a family name not printed → not kept;
//  (d) a scan (image only): model value + box → shown at that box; no box →
//      hidden; a box over blank paper → hidden;
//  (e) the sample number 050-1234567, printed AND read back by the model →
//      refused; the real address beside it still shows.
//
// Runs against the keyed dev server (VITE_DRIVE_API_KEY set — the AI reader
// only runs with the app's key), every backend route stubbed with page.route.
//   APP=http://localhost:5193 node scratchpad/planhonest.mjs
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs';

const APP = process.env.APP ?? 'http://localhost:5174';
/** SHOTS=<dir> saves the eye's popup for (b) and (d) — to look at, not to assert. */
const SHOTS = process.env.SHOTS ?? '';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

// Visual storage the way CAD exports do it: the line reversed, digit and
// Latin runs kept forwards — so the PICTURE of the sheet reads right.
const vis = s => [...s].reverse().join('')
  .replace(/[0-9A-Za-z][0-9A-Za-z ./-]*[0-9A-Za-z]|[0-9A-Za-z]/g, run => [...run].reverse().join(''));

const PW = 842, PH = 595;
const FONT = fs.readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');

/** Where a drawn string sits on the page, as fractions (x across, y DOWN). */
const spots = {};
async function sheet(name, draw) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(FONT, { subset: true });
  const page = doc.addPage([PW, PH]);
  const t = (s, x, y, size = 10, key) => {
    page.drawText(s, { x, y, size, font, color: rgb(0.1, 0.13, 0.18) });
    if (key) {
      const w = font.widthOfTextAtSize(s, size);
      spots[`${name}.${key}`] = { x0: x / PW, x1: (x + w) / PW, y0: (PH - (y + size)) / PH, y1: (PH - y) / PH };
    }
  };
  draw(t, page);
  return Buffer.from(await doc.save());
}
/** Every sheet carries TzviAir's two office blocks, the way the real title block does. */
function officeStrip(t) {
  t('Beit Shemesh 02-628-8282', 40, 60, 9);
  t('9 Nachal Kidron RBSA', 40, 48, 9);
  t('Tel Aviv 03-720-8000', 260, 60, 9);
  t('Azrieli Sarona Tower', 260, 48, 9);
  t('121 Derech Menachem Begin', 260, 36, 9);
}
/** The drawing itself — dimension text and equipment tags. */
function drawing(t, page) {
  page.drawRectangle({ x: 120, y: 150, width: 420, height: 300, borderColor: rgb(0.3, 0.3, 0.35), borderWidth: 1 });
  t('AC-1', 300, 300, 9); t('12 m', 420, 330, 8); t('Supply 400x200', 200, 250, 8);
  t(vis('מזגן מיני מרכזי'), 350, 280, 8);
}

// (a) A1-12: the title block names the TYPE, building, floor and flat — no
// customer address, no customer phone.
const A = await sheet('A', (t, page) => {
  page.drawRectangle({ x: 640, y: 360, width: 190, height: 200, borderColor: rgb(0.2, 0.25, 0.3), borderWidth: 1 });
  t('W RESIDENCE', 660, 540, 14);
  t(vis('טיפוס C2-בלי קיר'), 670, 515);
  t(vis('בנין 1'), 700, 495); t(vis('קומה 3'), 700, 477); t(vis('דירה 12'), 700, 459);
  t(vis('תוכנית מיזוג'), 680, 435); t(vis('שרטוט רבקה'), 685, 415);
  t('29/04/2026', 690, 395); t('Job # 01112', 690, 377);
  officeStrip(t); drawing(t, page);
});
// (b) A labelled address and a labelled mobile — the local reader's own case.
const B = await sheet('B', (t, page) => {
  t('Family Name:', 690, 520, 9); t('Ben-David', 700, 502, 14);
  t(vis('כתובת: רחוב הנביאים 24, בית שמש'), 640, 470, 10, 'addr');
  t(vis('נייד: 052-748-3916'), 680, 450, 10, 'phone');
  t(vis('קומה 3 דירה 12'), 700, 430);
  officeStrip(t); drawing(t, page);
});
// (c) Printed, but in shapes the local reader cannot catch: no label and no
// street word on the address, and a bracketed number.
const C = await sheet('C', (t, page) => {
  t('Family Name:', 690, 520, 9); t('Cohen', 700, 502, 14);
  t(vis('הגפן 7, אפרת'), 690, 470, 11, 'addr');
  t('(052) 748-3916', 690, 450, 11, 'phone');
  t(vis('קומה 2'), 705, 430);
  officeStrip(t); drawing(t, page);
});
// (e) A real address, and a template's sample number left in the block.
const E = await sheet('E', (t, page) => {
  t(vis('כתובת: רחוב הנביאים 24, בית שמש'), 640, 470, 10, 'addr');
  t('Tel: 050-1234567', 690, 450, 11, 'phone');
  officeStrip(t); drawing(t, page);
});

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

// (d) A SCAN: the title block is a picture — no text layer at all.
const D = await (async () => {
  const p = await browser.newPage({ viewport: { width: 1684, height: 1190 } });
  await p.setContent(`<html><body style="margin:0;background:#fff;font-family:'DejaVu Sans'">
    <svg width="1684" height="1190" style="position:absolute;left:0;top:0">
      <rect x="240" y="280" width="840" height="600" fill="none" stroke="#555" stroke-width="2"/>
      <rect x="1280" y="80" width="380" height="420" fill="none" stroke="#333" stroke-width="2"/>
      <line x1="300" y1="500" x2="1000" y2="500" stroke="#888" stroke-width="2"/>
    </svg>
    <div style="position:absolute;left:1300px;top:120px;font-size:30px;font-weight:700">Family: Peretz</div>
    <div dir="rtl" style="position:absolute;right:60px;top:200px;font-size:26px">כתובת: <span id="addr">הגפן 7, אפרת</span></div>
    <div dir="rtl" style="position:absolute;right:60px;top:260px;font-size:26px">נייד: <span id="phone" dir="ltr">052-748-3916</span></div>
  </body></html>`);
  for (const id of ['addr', 'phone']) {
    const r = await p.locator(`#${id}`).boundingBox();
    spots[`D.${id}`] = { x0: r.x / 1684, x1: (r.x + r.width) / 1684, y0: r.y / 1190, y1: (r.y + r.height) / 1190 };
  }
  const png = await p.screenshot({ type: 'png' });
  await p.close();
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(png);
  doc.addPage([PW, PH]).drawImage(img, { x: 0, y: 0, width: PW, height: PH });
  return Buffer.from(await doc.save());
})();

const pad = (f, k = 0.004) => ({ x0: f.x0 - k, y0: f.y0 - k, x1: f.x1 + k, y1: f.y1 + k });

// ── What the stubbed model answers, per case (the SERVER's output shape) ────
const AI = {
  a: { address: 'נחלת יצחק 12, בית שמש', phone: '054-1234567', family: 'Navon',
       addressBox: { x0: 0.80, y0: 0.20, x1: 0.97, y1: 0.24 }, phoneBox: { x0: 0.80, y0: 0.25, x1: 0.95, y1: 0.28 } },
  aOffice: { address: '9 Nachal Kidron, Beit Shemesh', phone: '02-628-8282', family: '', addressBox: null, phoneBox: null },
  aRegion: { address: 'Beit Shemesh 9', phone: '03-720-8000', family: '', addressBox: null, phoneBox: null },
  aFlat: { address: 'נחלת יצחק 12, בית שמש', phone: '054-1234567', family: 'Navon' },   // the old answer shape
  b: { address: '', phone: '', family: '', addressBox: null, phoneBox: null },
  c: { address: 'הגפן 7, אפרת', phone: '052-748-3916', family: 'Levi',
       addressBox: pad(spots['C.addr']), phoneBox: pad(spots['C.phone']) },
  cWrong: { address: 'הגפן 9, אפרת', phone: '052-748-3917', family: '', addressBox: null, phoneBox: null },
  cNoBox: { address: 'הגפן 7, אפרת', phone: '052-748-3916', family: '', addressBox: null, phoneBox: null },
  d1: { address: 'הגפן 7, אפרת', phone: '052-748-3916', family: '', addressBox: pad(spots['D.addr']), phoneBox: pad(spots['D.phone']) },
  d2: { address: 'הגפן 7, אפרת', phone: '052-748-3916', family: '', addressBox: null, phoneBox: null },
  d3: { address: 'הגפן 7, אפרת', phone: '052-748-3916', family: '',
        addressBox: { x0: 0.02, y0: 0.90, x1: 0.20, y1: 0.95 }, phoneBox: { x0: 0.30, y0: 0.02, x1: 0.45, y1: 0.05 } },
  e: { address: 'רחוב הנביאים 24, בית שמש', phone: '050-1234567', family: '',
       addressBox: pad(spots['E.addr']), phoneBox: pad(spots['E.phone']) },
};
let currentAi = 'a';
const aiCalls = {};

const SHEETS = { a: A, b: B, c: C, d1: D, d2: D, e: E };
const bytesFor = id => {
  const k = String(id).replace(/^PDF-/, '');
  if (SHEETS[k]) return SHEETS[k];
  if (k.startsWith('a')) return A;
  if (k.startsWith('c')) return C;
  if (k.startsWith('d')) return D;
  return B;
};

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const FOLDER_MIME = 'application/vnd.google-apps.folder';
await ctx.route('**/api/drive-files', route => {
  const body = route.request().postDataJSON();
  if (body.metaOnly) {
    return route.fulfill({ json: { folder: { id: body.folderId, name: `Case ${body.folderId} - 5555`, mimeType: FOLDER_MIME }, files: [] } });
  }
  const m = /^F-([a-z0-9]+)(-plans)?$/.exec(body.folderId ?? '');
  if (m && !m[2]) return route.fulfill({ json: { files: [{ id: `F-${m[1]}-plans`, name: 'Engineered Plans', mimeType: FOLDER_MIME }] } });
  if (m && m[2]) return route.fulfill({ json: { files: [{ id: `PDF-${m[1]}`, name: 'plan.pdf', mimeType: 'application/pdf' }] } });
  return route.fulfill({ json: { files: [] } });
});
await ctx.route('**/api/drive-fetch', route => {
  const { fileId } = route.request().postDataJSON();
  return route.fulfill({ body: bytesFor(fileId), contentType: 'application/pdf' });
});
await ctx.route('**/api/geocode', route => {
  const body = route.request().postDataJSON() ?? {};
  if (body.planRead) {
    aiCalls[currentAi] = (aiCalls[currentAi] ?? 0) + 1;
    return route.fulfill({ json: AI[currentAi] });
  }
  return route.fulfill({ status: 501, json: { error: 'not configured' } });
});
await ctx.route('**/api/share', route => route.fulfill({ json: { ok: true } }));
await ctx.route('**/api/folder', route => route.fulfill({ json: { folderId: 'F-x' } }));
await ctx.route('**/api/drive-path', route => route.fulfill({ json: { path: [] } }));
// No internet here: anything off-site is refused rather than left to hang.
await ctx.route(/drive\.google\.com|tzviair-goals\.vercel\.app|googleusercontent/, route => route.abort());

const UI = ['a', 'b', 'c', 'd1', 'd2', 'e'];
await ctx.addInitScript(cases => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const job = (c, i) => ({
    id: `G-${c}`, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: `Case ${c.toUpperCase()}`, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {},
    canvasX: 300 + (i % 3) * 260, canvasY: 190 + Math.floor(i / 3) * 190,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    driveLink: `https://drive.google.com/drive/folders/F-${c}`,
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    apartments: cases.map(job),
    // The Goals fixture parked out of the way, or it lands over the tiles.
    canvasElements: [{ id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 40, y: 1500, w: 300, h: 200, text: '', color: '#ffffff', data: {} }],
  }));
}, UI);

const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2800);

// ── The pure rules, through the real module ─────────────────────────────────
const rules = await page.evaluate(async () => {
  const m = await import('/src/data/planAddress.ts');
  const P = ['054-1234567', '050-1234567', '050-0000000', '000-0000', '123-4567', '+972-54-123-4567', '052-765-4321'];
  const R = ['054-566-4688', '052-748-3916', '03-6161616', '050-312-3456'];
  const O = ['9 Nachal Kidron RBSA', 'נחל קדרון 9, בית שמש', 'Azrieli Sarona Tower', '121 Derech Menachem Begin', 'דרך מנחם בגין 121, תל אביב'];
  const N = ['רחוב הנביאים 24, בית שמש', '14 Sokolov St, Holon', 'הגפן 7, אפרת', 'נחל קדרון 14, בית שמש', '132 Derech Menachem Begin, Tel Aviv'];
  return {
    placeholders: P.filter(p => !m.isPlaceholderPhone(p)),
    reals: R.filter(p => m.isPlaceholderPhone(p)),
    office: O.filter(s => !m.isOfficeAddress(s)),
    customer: N.filter(s => m.isOfficeAddress(s)),
    bracket: m.phoneCandidates('(052) 748-3916').has('0527483916'),
    glued: m.phoneCandidates('02-628-8282 9 Nachal Kidron').has('026288282'),
    reversed: m.phoneCandidates('6193-847-250').has('0527483916'),
  };
}).catch(e => ({ error: String(e).split('\n')[0] }));
if (rules.error) check(false, 'the pure rules load', rules.error);
else {
  check(rules.placeholders.length === 0, 'every sample number is recognised as one', JSON.stringify(rules.placeholders));
  check(rules.reals.length === 0, 'real numbers are not mistaken for samples', JSON.stringify(rules.reals));
  check(rules.office.length === 0 && rules.customer.length === 0, 'the office lines are known; customer addresses are not office lines',
    JSON.stringify({ missed: rules.office, wrong: rules.customer }));
  check(rules.bracket && rules.glued && !rules.reversed, 'a number is found exactly — bracketed, glued to the next line, never reversed');
}

/** Ask the reader directly — the summary only (the pictures are big). */
async function read(fileId, aiCase) {
  currentAi = aiCase;
  return page.evaluate(async id => {
    const m = await import('/src/data/planAddress.ts');
    const r = await m.readPlanAddress(id);
    return {
      address: r.address, phone: r.phone, family: r.family, problem: r.problem, ai: r.ai,
      addressFrom: r.addressFrom, phoneFrom: r.phoneFrom,
      addressBox: r.addressBox, phoneBox: r.phoneBox, cutoutBox: r.cutoutBox,
      cutout: !!r.cutout, phoneCutout: !!r.phoneCutout, sheet: !!r.sheet,
    };
  }, fileId);
}
const inside = (pt, b) => !!b && pt.x >= b.x0 && pt.x <= b.x1 && pt.y >= b.y0 && pt.y <= b.y1;
const mid = f => ({ x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 });
const fmt = b => b ? `[${[b.x0, b.y0, b.x1, b.y1].map(v => v.toFixed(3)).join(', ')}]` : '(none)';

/** Open a job's drawer and let its plan read finish. */
async function openJob(c) {
  currentAi = c;
  await page.locator(`[data-node-id="G-${c}"]`).dblclick();
  await page.waitForSelector('text=Plans found', { timeout: 20_000 });
}
async function closeJob() {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  if (await page.locator('[data-plan-source-popup]').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  if (await page.locator('text=Plans found').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
}
/** The reader asked the model, and then NO row stood — held for a moment, not caught mid-read. */
async function noRowsAfterRead(c) {
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    if ((aiCalls[c] ?? 0) >= 1 && await page.locator('[data-plan-address]').count() === 0) {
      await page.waitForTimeout(1500);
      return await page.locator('[data-plan-address]').count() === 0;
    }
    await page.waitForTimeout(250);
  }
  return false;
}

// ── (a) A1-12: nothing printed, the model invents — NO rows ─────────────────
await openJob('a');
check(await noRowsAfterRead('a'), '(a) the model was asked, and no "On the plan" row stands', `calls ${aiCalls.a ?? 0}`);
check(await page.locator('text=נחלת יצחק').count() === 0 && await page.locator('text=054-1234567').count() === 0,
  '(a) the invented address and the sample number appear nowhere');
await closeJob();
let r = await read('PDF-a', 'a');
check(!r.address && !r.phone && r.ai === true && r.problem === 'no-address',
  '(a) the reader: the model answered, both values dropped as not printed', JSON.stringify({ a: r.address, p: r.phone, problem: r.problem }));
r = await read('PDF-a-flat', 'aFlat');
check(!r.address && !r.phone, '(a) the same invention in the OLD answer shape (no boxes) — dropped too');
r = await read('PDF-a-office', 'aOffice');
check(!r.address && !r.phone, '(a) the office address and office number — printed, but never the customer\'s');
r = await read('PDF-a-region', 'aRegion');
check(!r.address && !r.phone, '(a) "Beit Shemesh 9", found only in the office block — refused');

// ── (b) a real address and mobile in the text — rows, framed ────────────────
await openJob('b');
await page.waitForSelector('[data-plan-read="phone"] [data-plan-address-eye]', { timeout: 30_000 });
await page.waitForSelector('[data-plan-read="address"] [data-plan-address-eye]', { timeout: 30_000 });
const rowA = await page.locator('[data-plan-read="address"]').innerText();
const rowP = await page.locator('[data-plan-read="phone"]').innerText();
check(rowA.includes('רחוב הנביאים 24, בית שמש'), '(b) the address row', rowA.replace(/\n/g, ' '));
check(rowP.includes('052-748-3916'), '(b) the phone row', rowP.replace(/\n/g, ' '));
r = await read('PDF-b', 'b');
check(r.addressFrom === 'text' && r.phoneFrom === 'text', '(b) both read from the sheet\'s own text');
check(inside(mid(spots['B.addr']), r.addressBox) && (r.addressBox.x1 - r.addressBox.x0) < 0.4 && (r.addressBox.y1 - r.addressBox.y0) < 0.08,
  '(b) the address box is the printed spot, and small', `${fmt(r.addressBox)} printed ${fmt(spots['B.addr'])}`);
check(inside(mid(spots['B.phone']), r.phoneBox) && (r.phoneBox.x1 - r.phoneBox.x0) < 0.3 && (r.phoneBox.y1 - r.phoneBox.y0) < 0.08,
  '(b) the phone box is the printed spot, and small', `${fmt(r.phoneBox)} printed ${fmt(spots['B.phone'])}`);

// The eye: the cutout with the value boxed, and the sheet with the spot boxed.
await page.locator('[data-plan-read="address"] [data-plan-address-eye]').click();
await page.waitForSelector('[data-plan-source-popup]');
await page.waitForTimeout(400);
const pop = await page.evaluate(() => {
  const rect = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const cut = document.querySelector('[data-plan-source-cutout]');
  const cutBox = document.querySelector('[data-plan-source-box]');
  const sh = document.querySelector('[data-plan-sheet]');
  const shBox = document.querySelector('[data-plan-sheet-box]');
  return {
    natural: cut ? { w: cut.naturalWidth, h: cut.naturalHeight } : null,
    cut: cut && rect(cut), cutBox: cutBox && rect(cutBox),
    sheet: sh && rect(sh), sheetBox: shBox && rect(shBox),
    data: shBox?.getAttribute('data-box') ?? '',
  };
});
check(!!pop.natural && pop.natural.w >= 350 && pop.natural.h >= 40, '(b) the eye opens a cutout big enough to read', JSON.stringify(pop.natural));
const within = (a, b) => !!a && !!b && a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;
check(!!pop.cutBox && within(pop.cutBox, pop.cut) && pop.cutBox.w < pop.cut.w && pop.cutBox.w > 20,
  '(b) a box is drawn round the value INSIDE the cutout', JSON.stringify({ box: pop.cutBox, cut: pop.cut }));
check(!!pop.sheetBox && within(pop.sheetBox, pop.sheet) && pop.sheetBox.w < pop.sheet.w * 0.45 && pop.sheetBox.h < pop.sheet.h * 0.12,
  '(b) the whole sheet is shown with a SMALL box at the spot — not the page as the "box"', JSON.stringify({ box: pop.sheetBox, sheet: pop.sheet }));
const db = pop.data.split(',').map(Number);
check(db.length === 4 && inside(mid(spots['B.addr']), { x0: db[0], y0: db[1], x1: db[2], y1: db[3] }),
  '(b) the sheet\'s box sits where the address is printed', pop.data);
if (SHOTS) await page.locator('[data-plan-source-popup]').screenshot({ path: `${SHOTS}/planhonest-b.png` });
// Escape backs out of the popup alone; the job window stays.
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check(await page.locator('[data-plan-source-popup]').count() === 0 && await page.locator('text=Plans found').count() >= 1,
  '(b) Escape closes the popup and leaves the job window open');

/** Draw a box on the picker's sheet round a page-fraction spot; wait for the model to answer. */
async function pickOn(spot, aiCase) {
  await page.waitForSelector('[data-addr-pick-stage] img', { timeout: 30_000 });
  await page.waitForTimeout(500);
  const before = aiCalls[aiCase] ?? 0;
  currentAi = aiCase;
  const st = await page.locator('[data-addr-pick-stage]').boundingBox();
  await page.mouse.move(st.x + st.width * (spot.x0 - 0.01), st.y + st.height * (spot.y0 - 0.006));
  await page.mouse.down();
  await page.mouse.move(st.x + st.width * (spot.x1 + 0.01), st.y + st.height * (spot.y1 + 0.006), { steps: 6 });
  await page.mouse.up();
  const until = Date.now() + 15_000;
  while ((aiCalls[aiCase] ?? 0) === before && Date.now() < until) await page.waitForTimeout(150);
  await page.waitForTimeout(500);
  return (await page.locator('[data-addr-pick-read]').textContent().catch(() => null)) ?? '';
}
// The picker's model answer is filtered too: a sample number from the model
// never replaces the text under the box (the stub answers 054-1234567).
await page.locator('[data-plan-read="phone"] [data-plan-address-eye]').click();
await page.waitForSelector('[data-plan-source-popup]');
await page.locator('[data-addr-pick]').click();
const picked = await pickOn(spots['B.phone'], 'a');
check(picked.includes('052-748-3916') && !picked.includes('1234567'),
  '(b) in the picker, the model\'s sample number is refused and the text under the box stands', picked);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await closeJob();

// ── (c) printed, but only the model can see it — shown, boxed from the text ─
r = await read('PDF-c0', 'b');
check(!r.address && !r.phone, '(c) the local reader alone finds neither (so what follows is the model, verified)');
await openJob('c');
await page.waitForSelector('[data-plan-read="phone"] [data-plan-address-eye]', { timeout: 30_000 });
await page.waitForSelector('[data-plan-read="address"] [data-plan-address-eye]', { timeout: 30_000 });
check((await page.locator('[data-plan-read="address"]').innerText()).includes('הגפן 7, אפרת'), '(c) the model\'s address, verified, is offered');
check((await page.locator('[data-plan-read="phone"]').innerText()).includes('052-748-3916'), '(c) the model\'s phone, verified, is offered');
await closeJob();
r = await read('PDF-c', 'c');
check(r.addressFrom === 'ai' && inside(mid(spots['C.addr']), r.addressBox),
  '(c) the address is boxed where the text layer has it', `${fmt(r.addressBox)} printed ${fmt(spots['C.addr'])}`);
check(r.phoneFrom === 'ai' && inside(mid(spots['C.phone']), r.phoneBox),
  '(c) the phone is boxed where the text layer has it', `${fmt(r.phoneBox)} printed ${fmt(spots['C.phone'])}`);
check(r.family === undefined, '(c) a family name that is not printed ("Levi") is not kept', String(r.family));
r = await read('PDF-cnobox', 'cNoBox');
check(r.address === 'הגפן 7, אפרת' && inside(mid(spots['C.addr']), r.addressBox),
  '(c) the model need not point on a text page — the text layer IS the box', fmt(r.addressBox));
r = await read('PDF-cwrong', 'cWrong');
check(!r.address && !r.phone, '(c) a wrong house number, a wrong digit — not printed, dropped', JSON.stringify({ a: r.address, p: r.phone }));

// ── (d) a scan: the box is the proof ────────────────────────────────────────
await openJob('d1');
await page.waitForSelector('[data-plan-read="address"] [data-plan-address-eye]', { timeout: 30_000 });
check((await page.locator('[data-plan-read="address"]').innerText()).includes('הגפן 7, אפרת'), '(d) on a scan, a value WITH a box is offered');
await page.locator('[data-plan-read="address"] [data-plan-address-eye]').click();
await page.waitForSelector('[data-plan-source-popup]');
await page.waitForTimeout(300);
check(await page.locator('[data-plan-source-box]').count() === 1 && await page.locator('[data-plan-sheet-box]').count() === 1,
  '(d) and its eye frames the spot, close up and on the sheet');
if (SHOTS) await page.locator('[data-plan-source-popup]').screenshot({ path: `${SHOTS}/planhonest-d.png` });
// "Not right? Pick it on the plan" on a scan: there is no text to read, so
// the model reads the drawn box — and Use writes what it read.
await page.locator('[data-addr-pick]').click();
const scanPick = await pickOn(spots['D.addr'], 'd1');
check(scanPick.includes('הגפן 7, אפרת'), '(d) on a scan the picker works — the model reads the drawn box', scanPick || '(nothing)');
await page.locator('[data-addr-pick-use]').click();
await page.waitForTimeout(700);
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')).apartments.find(a => a.id === 'G-d1').address);
check(stored === 'הגפן 7, אפרת', '(d) and Use writes it onto the job', String(stored));
await closeJob();
r = await read('PDF-d1', 'd1');
const near = (a, b) => !!a && Math.abs(a.x0 - b.x0) < 0.01 && Math.abs(a.y0 - b.y0) < 0.01 && Math.abs(a.x1 - b.x1) < 0.01 && Math.abs(a.y1 - b.y1) < 0.01;
check(r.addressFrom === 'ai' && near(r.addressBox, pad(spots['D.addr'])) && r.cutout,
  '(d) the scan\'s box is the model\'s box, with a cutout of it', fmt(r.addressBox));
await openJob('d2');
check(await noRowsAfterRead('d2'), '(d) a value WITHOUT a box on a scan — no row', `calls ${aiCalls.d2 ?? 0}`);
await closeJob();
r = await read('PDF-d3', 'd3');
check(!r.address && !r.phone && r.problem === 'no-text', '(d) a box over blank paper points at nothing — hidden', JSON.stringify({ a: r.address, p: r.phone, problem: r.problem }));

// ── (e) the sample number, printed and read back — refused ──────────────────
await openJob('e');
await page.waitForSelector('[data-plan-read="address"] [data-plan-address-eye]', { timeout: 30_000 });
await page.waitForTimeout(800);
check(await page.locator('[data-plan-read="phone"]').count() === 0, '(e) 050-1234567, printed AND read by the model, gets no row');
check((await page.locator('[data-plan-read="address"]').innerText()).includes('רחוב הנביאים 24'), '(e) the real address beside it still shows');
await closeJob();

console.log(`\nmodel calls: ${JSON.stringify(aiCalls)}`);
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
