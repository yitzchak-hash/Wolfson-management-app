// The tablet studio (2026-11-09, "The Studio on the Tablet" built): opens the
// markup studio on A1-53 with a made-up PDF served on /api/drive-fetch, at
// tablet, PC and phone sizes, and measures what the plan page promised.
// Usage: node scratchpad/tabletstudio.mjs <outDir> [port]
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
const apt = (id, num, floor, extra = {}) => ({
  id, buildingId: 'A1', floor, apartmentNumber: num, displayName: '', isUnnamed: false, isDuplexApt: false,
  classification: 'standard', generalNotes: '', currentStageId: 's-drilling', stageDates: {}, bubbles: true, stageMarks: {},
  createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', ...extra,
});
const seedData = planId => ({
  wolfson_app_data: {
    currentUser: { id: 'U-o', name: 'Officer', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    users: [{ id: 'U-o', name: 'Officer', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' }],
    stages: [{ id: 's-drilling', name: 'Drilling', color: '#0891b2', order: 2, active: true, kind: 'work' }],
    contractors: [{ id: 'C-w', name: 'Worker', category: 'ac', token: 'tok-w', active: true, createdAt: '2026-01-01', lang: 'en',
      perms: { seeAnyPlan: true, markUpPlans: true } }],
    apartments: [apt('A1-12', '12', 4, { plansPdfLink: `https://drive.google.com/file/d/${planId}/view` })],
    contractorAssignments: [],
  },
});
function seed(d) {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  for (const [k, v] of Object.entries(d)) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v));
}

const OUT = process.argv[2] || '/tmp';
const PORT = process.argv[3] || '5173';
const PLAN_ID = 'HARNESSPLAN1';

async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  for (let i = 1; i < 6; i++) page.drawLine({ start: { x: 30 + i * 188, y: 30 }, end: { x: 30 + i * 188, y: 812 }, thickness: 0.8, color: rgb(0.6, 0.66, 0.75) });
  for (let j = 1; j < 4; j++) page.drawLine({ start: { x: 30, y: 30 + j * 195 }, end: { x: 1161, y: 30 + j * 195 }, thickness: 0.8, color: rgb(0.6, 0.66, 0.75) });
  page.drawText('A1 / 53 - MECHANICAL LAYOUT (TEST SHEET)', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  doc.addPage([1191, 842]).drawText('PAGE 2', { x: 56, y: 770, size: 26 });
  return Buffer.from(await doc.save());
}

const SIZES = [
  // tag, w, h, touch
  ['ipad-port', 1024, 1366, true],
  ['ipad-land', 1366, 1024, true],
  ['tab-land', 1152, 720, true],
  ['tab-port', 720, 1152, true],
  ['pc', 1440, 900, false],
  ['phone', 390, 844, true],
];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;

const planBytes = await makePlan();
const browser = await chromium.launch();
const report = {};

const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };

for (const [tag, W, H, touch] of SIZES) {
  if (only && !only.includes(tag)) continue;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
  // The editable studio is the worker portal's (the office drawer opens it
  // read-only and marks up in the Sketcher). Made-up data, local storage only.
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  await ctx.route('**://fonts.googleapis.com/**', r => r.abort());
  await ctx.addInitScript(seed, seedData(PLAN_ID));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => { if (!/localStorage/.test(e.message)) errors.push(String(e)); });
  const tap = async loc => (touch ? loc.tap() : loc.click());
  await page.goto(`http://localhost:${PORT}/c/tok-w`); await page.waitForTimeout(2200);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /Building Map|^Map$/.test((x.textContent || '').trim()))?.click());
  await page.waitForTimeout(600);
  const pickW = page.locator('text=Wolfson Residence');
  if (await pickW.count()) { await pickW.first().click(); }
  for (let i = 0; i < 60 && !(await page.locator('[data-apt-id="A1-12"]').count()); i++) await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/ts-${tag}-portal.png` });
  await page.locator('[data-apt-id="A1-12"]').first().click(); await page.waitForTimeout(600);
  await page.locator('[data-work-plan] [data-plan-toggle]').click(); await page.waitForTimeout(1500);
  await page.locator('[data-work-plan] [data-plan-markup]').first().click();
  for (let i = 0; i < 40; i++) { if (await page.locator('[data-plan-surface="studio"] canvas').count() >= 3) break; await page.waitForTimeout(1000); }
  await page.waitForTimeout(2500);
  const r = { errors };
  r.rest = await page.evaluate(() => {
    const st = document.querySelector('[data-plan-surface="studio"]');
    if (!st) return { noStudio: true };
    const R = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
    const btns = [...st.querySelectorAll('button')].filter(b => { const q = b.getBoundingClientRect(); return q.width > 0 && q.height > 0; })
      .map(b => ({ t: (b.getAttribute('title') || b.textContent || '').trim().slice(0, 22), ...R(b) }));
    const small = btns.filter(b => b.w < 48 || b.h < 48);
    const stage = st.querySelector('[data-plan-stage]');
    return {
      bar: R(st.querySelector('[data-studio-bar]')),
      tabletBar: !!st.querySelector('[data-studio-bar="tablet"]'),
      rail: R(st.querySelector('[data-studio-rail]')),
      railTiles: [...st.querySelectorAll('[data-studio-rail] > button')].slice(0, 4).map(R),
      dock: st.querySelector('[data-ink-dock]')?.getAttribute('data-ink-dock') ?? null,
      dockR: R(st.querySelector('[data-ink-dock]')),
      pill: R(st.querySelector('[data-ink-pill]')),
      zoom: R(st.querySelector('[data-plan-zoombar]')),
      stage: R(stage),
      stageShareH: stage ? +(stage.getBoundingClientRect().height / innerHeight).toFixed(3) : null,
      buttons: btns.length, smallCount: small.length, small: small.slice(0, 12),
      hint: /Turn the phone/.test(st.textContent || ''),
    };
  });
  await page.screenshot({ path: `${OUT}/ts-${tag}-rest.png` });

  if (r.rest.tabletBar) {
    // The pen tray, docked: arm the pen (already armed), press again.
    const ink = page.locator('[data-ink-tile]');
    await tap(ink.first()); await page.waitForTimeout(300);
    if (!(await page.locator('[data-pen-tray-docked]').count())) { await tap(ink.first()); await page.waitForTimeout(500); }
    r.tray = await page.evaluate(() => {
      const t = document.querySelector('[data-pen-tray-docked]');
      const s = document.querySelector('[data-plan-surface="studio"] [data-plan-stage]');
      if (!t || !s) return { open: !!t };
      const a = t.getBoundingClientRect(), b = s.getBoundingClientRect();
      const overlap = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      return { open: true, overlapsSheet: overlap, tray: [Math.round(a.left), Math.round(a.top), Math.round(a.width), Math.round(a.height)], stage: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)], floating: !!document.querySelector('[data-pen-tray]:not([data-pen-tray-docked])') };
    });
    await page.screenshot({ path: `${OUT}/ts-${tag}-tray.png` });
    await tap(page.locator('[data-pen-tray-done]').first()); await page.waitForTimeout(300);
    r.trayClosed = !(await page.locator('[data-pen-tray-docked]').count());
    // Landscape: the ink pill opens the side tray beside the sheet.
    if (await page.locator('[data-ink-pill]').count()) {
      const before = await page.evaluate(() => document.querySelector('[data-plan-surface="studio"] [data-plan-stage]').getBoundingClientRect().width);
      await tap(page.locator('[data-ink-pill]')); await page.waitForTimeout(400);
      r.side = await page.evaluate(w0 => {
        const d = document.querySelector('[data-ink-dock="side"]'); const s = document.querySelector('[data-plan-surface="studio"] [data-plan-stage]');
        if (!d) return { open: false };
        const a = d.getBoundingClientRect(), b = s.getBoundingClientRect();
        return { open: true, stageW: [Math.round(w0), Math.round(b.width)], overlap: !(a.right <= b.left || b.right <= a.left), chips: document.querySelectorAll('[data-ink-chip]').length, chip: Math.round(document.querySelector('[data-ink-chip]')?.getBoundingClientRect().width ?? 0) };
      }, before);
      await page.screenshot({ path: `${OUT}/ts-${tag}-side.png` });
      await tap(page.locator('[data-ink-side-close]')); await page.waitForTimeout(300);
    }
    // Full bleed: Pan, tap the sheet → bar and rail gone, zoom pill stays; tap → back.
    await tap(page.locator('[data-plan-surface="studio"] button', { hasText: /^Pan$/ }).first()); await page.waitForTimeout(300);
    const sheet = page.locator('[data-plan-surface="studio"] [data-plan-stage] canvas').first();
    const bb = await sheet.boundingBox();
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.waitForTimeout(400);
    r.bleed = await page.evaluate(() => ({ bar: !!document.querySelector('[data-studio-bar]'), rail: !!document.querySelector('[data-studio-rail]'), zoom: !!document.querySelector('[data-plan-zoombar]') }));
    await page.screenshot({ path: `${OUT}/ts-${tag}-bleed.png` });
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.waitForTimeout(400);
    r.bleedBack = await page.evaluate(() => !!document.querySelector('[data-studio-bar]'));

    // Pen draws, finger moves. Back to the pen; a real pen stroke via CDP, then a real finger drag.
    await tap(page.locator('[data-ink-tile]').first()); await page.waitForTimeout(300);
    const cdp = await ctx.newCDPSession(page);
    const box = await page.locator('[data-plan-surface="studio"] [data-plan-stage] canvas').nth(2).boundingBox();
    const inkPx = () => page.evaluate(() => {
      const c = document.querySelectorAll('[data-plan-surface="studio"] [data-plan-stage] canvas')[1];
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n;
    });
    const px0 = await inkPx();
    const cx = box.x + box.width * 0.3, cy = box.y + box.height * 0.4;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: 0.5 });
    for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + i * 12, y: cy + i * 4, button: 'left', buttons: 1, pointerType: 'pen', force: 0.5 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + 144, y: cy + 48, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
    await page.waitForTimeout(1200);
    const px1 = await inkPx();
    const penSeen = await page.evaluate(() => localStorage.getItem('studio_pen_seen'));
    const scroll0 = await page.evaluate(() => { const s = document.querySelector('[data-plan-surface="studio"] [data-plan-stage]'); return [s.scrollLeft, s.scrollTop]; });
    const fx = box.x + box.width * 0.6, fy = box.y + box.height * 0.6;
    await page.waitForTimeout(900);   // past the palm window
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fx, y: fy }] });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fx - i * 10, y: fy - i * 6 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1200);
    const px2 = await inkPx();
    r.pen = { penInk: px1 - px0, penSeen, fingerInkAfterPen: px2 - px1 };
    // Finger draws too (Settings): the same drag now draws.
    await page.evaluate(() => { localStorage.setItem('studio_finger_draws', '1'); window.dispatchEvent(new Event('studio-tablet-prefs')); });
    await page.waitForTimeout(300);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fx, y: fy + 30 }] });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fx - i * 10, y: fy + 30 - i * 3 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1200);
    r.pen.fingerInkWithSwitch = (await inkPx()) - px2;
    r.pen.scrollMoved = scroll0;
    // Left-handed: the rail moves to the right.
    await page.evaluate(() => { localStorage.setItem('studio_drawing_hand', 'left'); window.dispatchEvent(new Event('studio-tablet-prefs')); });
    await page.waitForTimeout(400);
    r.leftHand = await page.evaluate(() => { const rl = document.querySelector('[data-studio-rail]'); return rl ? Math.round(rl.getBoundingClientRect().left) : 'row'; });
    await page.screenshot({ path: `${OUT}/ts-${tag}-lefthand.png` });
  }
  report[tag] = r;
  await ctx.close();
}
console.log(JSON.stringify(report, null, 1));
await browser.close();
