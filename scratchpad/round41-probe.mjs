// The touchscreen round: pins ride the SHEET (office pane and worker preview),
// the permitted worker gets Mark up, the pen's barrel button erases, the
// version connector draws on an upright tablet, and a finger scrolls a
// widget's list on the board instead of panning it.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';

const PLAN_ID = 'R41PLAN01';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  page.drawText('SHEET 1 — MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const seedWolfson = ([today, planId, perms]) => {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('wolfson_app_data')) return;
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    users: [{ id: 'U-test', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' }],
    contractors: [{ id: 'C-a', name: 'Motti', category: 'general', token: 't1', active: true, createdAt: '2026-01-01', perms }],
    apartments: [{
      id: 'W-1', buildingId: 'A1', apartmentNumber: '37', floor: 10, displayName: 'Cohen',
      classification: 'standard', isUnnamed: false, createdAt: '2026-01-01',
      plansPdfLink: `https://drive.google.com/file/d/${planId}/view`,
    }],
    contractorAssignments: [{
      id: 'T-1', apartmentId: 'W-1', buildingId: 'A1', contractorId: 'C-a',
      taskDescription: 'Fix the duct', dueDate: today, completedAt: null,
      createdAt: '2026-08-01T09:00:00Z', priority: 'normal',
    }],
    planPins: [{ id: 'PIN-1', apartmentId: 'W-1', xPct: 30, yPct: 40, text: 'Duct clashes here',
      createdAt: '2026-08-01T09:00:00Z', createdBy: 'Office' }],
  }));
};
async function routes(ctx) {
  // Newest route wins in Playwright (the goalswidget lesson) — the catch-all
  // goes FIRST so the PDF route registered after it is the one that answers.
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  await ctx.route('**://fonts.googleapis.com/**', r => r.abort());
}
/** The pin's POINT (the marker is translated so its bottom-centre is the spot)
 *  against the pdf canvas it should sit on, in fractions. */
const pinFractions = (page, scope) => page.evaluate(sel => {
  const root = sel ? document.querySelector(sel) : document;
  const wrap = [...root.querySelectorAll('canvas')].map(c => c.parentElement).find(w => w && w.querySelectorAll('canvas').length >= 3);
  const pdf = wrap?.querySelector('canvas');
  const pin = wrap?.querySelector('.absolute.-translate-y-full');
  if (!pdf || !pin) return null;
  const c = pdf.getBoundingClientRect(), p = pin.getBoundingClientRect();
  return { fx: (p.left + p.width / 2 - c.left) / c.width, fy: (p.bottom - c.top) / c.height, cw: c.width, inside: wrap.contains(pin) };
}, scope);
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
const waitSheet = async (page, scope = '') => {
  for (let i = 0; i < 120; i++) {
    const ok = await page.evaluate(sel => {
      const root = sel ? document.querySelector(sel) : document;
      return !!root && [...root.querySelectorAll('canvas')].some(c => c.width > 50);
    }, scope);
    if (ok) return true;
    await page.waitForTimeout(250);
  }
  return false;
};

// ── 1. the office: the pin rides the sheet, through a zoom ─────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await routes(ctx);
  await ctx.addInitScript(seedWolfson, [day(0), PLAN_ID, {}]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message.slice(0, 160)); fails++; });
  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(2500);
  await page.locator('[data-apt-id="W-1"]').first().click();
  await page.waitForTimeout(1000);
  check(await waitSheet(page, '[data-plan-surface="pane"]'), 'the office pane drew the sheet');
  await page.waitForTimeout(800);
  const a = await pinFractions(page, '[data-plan-surface="pane"]');
  check(!!a && a.inside, 'the pin is INSIDE the sheet wrapper (the annotator\'s slot)');
  check(!!a && near(a.fx, 0.30) && near(a.fy, 0.40), 'the pin sits at 30% / 40% of the SHEET', a ? `${a.fx.toFixed(3)} / ${a.fy.toFixed(3)}` : 'no pin');
  await page.locator('[data-plan-surface="pane"] button[title="Zoom in"]').first().click();
  await page.locator('[data-plan-surface="pane"] button[title="Zoom in"]').first().click();
  await page.waitForTimeout(700);
  const b = await pinFractions(page, '[data-plan-surface="pane"]');
  check(!!b && b.cw > (a?.cw ?? 0) * 1.2, 'the pane zoomed in', b ? `${Math.round(a.cw)} → ${Math.round(b.cw)}px` : '');
  check(!!b && near(b.fx, 0.30) && near(b.fy, 0.40), 'after zooming the pin still sits at 30% / 40% of the sheet', b ? `${b.fx.toFixed(3)} / ${b.fy.toFixed(3)}` : 'no pin');
  await ctx.close();
}

// ── 2. the worker: the preview is the sheet with the pin on it; Mark up for the permitted; the barrel erases ──
{
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await routes(ctx);
  await ctx.addInitScript(seedWolfson, [day(0), PLAN_ID, { markUpPlans: true, seeSnags: true }]);
  const page = await ctx.newPage();
  // The collapsed Drive iframe's own script throws a localStorage error in
  // this sandbox — third-party noise, the round30 filter.
  page.on('pageerror', e => { if (/localStorage/.test(e.message)) return; console.log('PAGE ERROR', e.message.slice(0, 160)); fails++; });
  await page.goto('http://localhost:5173/c/t1');
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const all = [...document.querySelectorAll('button')].find(b => /^(All|הכל|הכול)$/.test((b.textContent || '').trim()));
    all?.click();
  });
  await page.waitForTimeout(400);
  await page.getByText('Fix the duct').first().click();
  await page.waitForTimeout(1200);
  check(await page.locator('[data-portal-markup]').count() === 1, 'a worker with the markUpPlans permission sees Mark up');
  // View → the app's own renderer, not Google's frame
  await page.evaluate(() => {
    const f = document.querySelector('iframe[title="Engineering Plans"]');
    f?.parentElement?.click();
  });
  check(await waitSheet(page, '[data-plan-surface="pane"]'), 'the worker\'s expanded preview draws the sheet itself');
  await page.waitForTimeout(800);
  check(await page.locator('iframe[title="Engineering Plans"]').count() === 0, 'no Drive iframe while expanded');
  const c = await pinFractions(page, '[data-plan-surface="pane"]');
  check(!!c && near(c.fx, 0.30) && near(c.fy, 0.40), 'the worker sees the pin at 30% / 40% of the SHEET', c ? `${c.fx.toFixed(3)} / ${c.fy.toFixed(3)}` : 'no pin');

  // Mark up → the studio
  await page.locator('[data-portal-markup]').click();
  check(await waitSheet(page, '[data-plan-surface="studio"]'), 'Mark up opens the studio on the worker\'s phone');
  await page.waitForTimeout(1200);
  const cdp = await ctx.newCDPSession(page);
  const ink = () => page.evaluate(() => {
    const st = document.querySelector('[data-plan-surface="studio"]');
    const list = [...st.querySelectorAll('canvas')];
    const c = list[list.length - 2];
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  const cb = await page.locator('[data-plan-surface="studio"] canvas').last().boundingBox();
  const penStroke = async (pts, barrel) => {
    const button = barrel ? 'right' : 'left', buttons = barrel ? 2 : 1;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0].x, y: pts[0].y, button, buttons, clickCount: 1, pointerType: 'pen', force: 0.6 });
    for (const p of pts.slice(1)) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button, buttons, pointerType: 'pen', force: 0.6 }); await page.waitForTimeout(12); }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts.at(-1).x, y: pts.at(-1).y, button, buttons: 0, clickCount: 1, pointerType: 'pen' });
  };
  // arm the pen (the p hotkey), then draw a line across the sheet
  await page.keyboard.press('p');
  await page.waitForTimeout(200);
  const y = cb.y + cb.height * 0.5;
  await penStroke(Array.from({ length: 16 }, (_, i) => ({ x: cb.x + cb.width * (0.2 + 0.6 * i / 15), y })), false);
  await page.waitForTimeout(600);
  const ink1 = await ink();
  check(ink1 > 200, 'a pen stroke drew ink', `${ink1}px`);
  // now the SAME pen, side button held, across the middle of that line
  await penStroke(Array.from({ length: 12 }, (_, i) => ({ x: cb.x + cb.width * 0.5, y: y - 40 + 80 * i / 11 })), true);
  await page.waitForTimeout(600);
  const ink2 = await ink();
  check(ink2 < ink1 - 50, 'the pen\'s side button RUBBED OUT where it crossed', `${ink1} → ${ink2}px`);
  const toolStill = await page.evaluate(() => !!document.querySelector('[data-plan-surface="studio"] [data-ink-tile][aria-pressed="true"], [data-plan-surface="studio"] [data-ink-tile].bg-white\\/15'));
  console.log(`     (ink tile still armed: ${toolStill})`);
  await ctx.close();
}

// ── 3. an upright tablet: the version connector is drawn from the bottom rail ──
{
  const ctx = await browser.newContext({ viewport: { width: 720, height: 1152 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await routes(ctx);
  await ctx.addInitScript(seedWolfson, [day(0), PLAN_ID, {}]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message.slice(0, 160)); fails++; });
  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(2500);
  await page.locator('[data-apt-id="W-1"]').first().tap();
  await page.waitForTimeout(1200);
  const planTab = page.locator('.drawer-panel button').filter({ hasText: /^Plan/ });
  if (await planTab.count()) { await planTab.first().tap(); await page.waitForTimeout(1200); }
  const markup = page.locator('button').filter({ hasText: /Mark up/i }).first();
  await markup.tap();
  check(await waitSheet(page, '[data-plan-surface="studio"]'), 'the studio opened on the upright tablet');
  await page.waitForTimeout(1200);
  const rowRail = await page.evaluate(() => {
    const btn = document.querySelector('[data-plan-surface="studio"] [data-ink-tile]');
    const r = btn?.getBoundingClientRect();
    return r ? r.top > window.innerHeight * 0.6 : null;
  });
  check(rowRail === true, 'the tool rail runs along the BOTTOM (portrait)');
  const cdp = await ctx.newCDPSession(page);
  const cb = await page.locator('[data-plan-surface="studio"] canvas').last().boundingBox();
  const pts = Array.from({ length: 14 }, (_, i) => ({ x: cb.x + cb.width * (0.25 + 0.5 * i / 13), y: cb.y + cb.height * 0.5 }));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0].x, y: pts[0].y, button: 'left', clickCount: 1, pointerType: 'pen', force: 0.6 });
  for (const p of pts.slice(1)) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 1, pointerType: 'pen', force: 0.6 }); await page.waitForTimeout(12); }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts.at(-1).x, y: pts.at(-1).y, button: 'left', clickCount: 1, pointerType: 'pen' });
  await page.waitForTimeout(1800);
  const link = await page.evaluate(() => {
    const svg = document.querySelector('[data-plan-surface="studio"] [data-version-link]');
    const p = svg?.querySelector('path')?.getAttribute('d') ?? '';
    const tab = document.querySelector('[data-plan-surface="studio"] [data-version-active]');
    const tr = tab?.getBoundingClientRect();
    return { has: !!svg, len: p.length, tabTop: tr ? Math.round(tr.top) : null, h: window.innerHeight };
  });
  check(link.has && link.len > 40, 'the green connector is drawn on the upright tablet', `tab at y=${link.tabTop} of ${link.h}`);
  await ctx.close();
}

// ── 4. the board: a finger scrolls the widget's list; the board pans only where nothing scrolls ──
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    if (localStorage.getItem('general_app_data')) return;
    const apartments = Array.from({ length: 40 }, (_, i) => ({
      id: `G-j${i}`, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: `Job number ${i + 1}`,
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 900 + (i % 5) * 240, canvasY: 900 + Math.floor(i / 5) * 160,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U-test', updatedByName: 'A',
    }));
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
      apartments,
      canvasElements: [
        { id: 'CE-list', type: 'widget', widget: 'job-list', x: 40, y: 260, w: 300, h: 320, text: '', color: '#ffffff', data: {} },
      ],
    }));
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message.slice(0, 160)); fails++; });
  await page.goto('http://localhost:5173/jobs');
  await page.waitForTimeout(3500);
  const cdp = await ctx.newCDPSession(page);
  async function fingerDrag(x0, y0, dx, dy) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + dx * i / 10, y: y0 + dy * i / 10 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const state = () => page.evaluate(() => {
    const node = document.querySelector('[data-node-id="CE-list"]');
    const sc = node && [...node.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY));
    const world = document.querySelector('[data-board-world]')?.parentElement;
    return { scrollTop: sc ? sc.scrollTop : null, transform: world ? getComputedStyle(world).transform : '', node: node?.getBoundingClientRect() };
  });
  const s0 = await state();
  check(s0.scrollTop === 0 && !!s0.node, 'the list widget is on screen with a scroller', s0.node ? `at ${Math.round(s0.node.x)},${Math.round(s0.node.y)}` : 'no node');
  // a finger dragged UP inside the list — over its rows, which are buttons
  const sc0 = await page.evaluate(() => {
    const node = document.querySelector('[data-node-id="CE-list"]');
    const sc = [...node.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY));
    const r = sc.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.7 };
  });
  await fingerDrag(sc0.x, sc0.y, 0, -120);
  await page.waitForTimeout(500);
  const s1 = await state();
  check((s1.scrollTop ?? 0) > 60, 'a finger dragged up inside the list SCROLLED the list', `scrollTop ${s1.scrollTop}`);
  check(s1.transform === s0.transform, 'and the board did not pan', `${s0.transform} → ${s1.transform}`);
  check(await page.locator('.drawer-panel').count() === 0, 'and no job opened from the row under the finger');
  // a finger on the widget's TITLE row (nothing to scroll there) pans the board
  const title = await page.evaluate(() => {
    const node = document.querySelector('[data-node-id="CE-list"]');
    const r = node.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 14 };
  });
  await fingerDrag(title.x, title.y, -80, -60);
  await page.waitForTimeout(700);
  const s2 = await state();
  check(s2.transform !== s1.transform, 'a finger dragged from the widget\'s heading panned the board', `${s1.transform} → ${s2.transform}`);
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
