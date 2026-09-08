// Galaxy Tab S10 FE with its S Pen: the pen draws in the markup studio, a
// palm landing right behind the nib is turned away, a finger still draws once
// the pen is gone, and on the board the pen ARRANGES like a mouse while a
// finger PANS. Both orientations (DPR 2: 1152×720 / 720×1152).
import { chromium, devices } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

const PLAN_ID = 'HARNESSPLAN1';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  for (let i = 1; i < 6; i++) page.drawLine({ start: { x: 30 + i * 188, y: 30 }, end: { x: 30 + i * 188, y: 812 }, thickness: 0.8, color: rgb(0.6, 0.66, 0.75) });
  page.drawText('A1 / 53 — MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);

const inkPixels = () => page.evaluate(() => {
  const list = [...document.querySelectorAll('canvas')];
  const c = list[list.length - 2];
  if (!c) return -1;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n;
});
/** A stroke with the given pointer: pen = mouse events with pointerType pen; finger = touch events. */
async function stroke(cdp, pts, kind) {
  if (kind === 'pen') {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0].x, y: pts[0].y, button: 'left', clickCount: 1, pointerType: 'pen', force: 0.6 });
    for (const p of pts.slice(1)) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 1, pointerType: 'pen', force: 0.6 }); await page.waitForTimeout(12); }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts.at(-1).x, y: pts.at(-1).y, button: 'left', clickCount: 1, pointerType: 'pen' });
  } else {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
    for (const p of pts.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] }); await page.waitForTimeout(12); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
}
const wave = (x0, y0, w, n = 14) => Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w / (n - 1)), y: y0 + Math.sin(i / 2) * 26 }));

let page;
for (const [tag, W, H] of [['landscape', 1152, 720], ['portrait', 720, 1152]]) {
  console.log(`\n── Tab S10 FE · ${tag} ${W}×${H} ──`);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: devices['Galaxy Tab S4'].userAgent });
  await applySeed(ctx, blob);
  await ctx.addInitScript(planId => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw); const link = `https://drive.google.com/file/d/${planId}/view`;
    for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.plansPdfLink = link;
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
    // One job on the Job Board for the pen-versus-finger drag (seeded only when absent).
    localStorage.setItem('general_app_version', '3');
    if (!localStorage.getItem('general_app_data')) {
      localStorage.setItem('general_app_data', JSON.stringify({
        currentUser: d.currentUser, users: d.users, stages: [],
        apartments: [{ id: 'G-pen1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Pen test job', isUnnamed: false, isDuplexApt: false,
          classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, canvasX: 260, canvasY: 360, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
        canvasElements: [],
      }));
    }
  }, PLAN_ID);
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 10 });

  // ── the studio ──
  await page.goto('http://localhost:5173/project'); await page.waitForTimeout(2000);
  await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().tap(); await page.waitForTimeout(1400);
  const planTab = page.locator('.drawer-panel button').filter({ hasText: /^Plan/ });
  if (await planTab.count()) { await planTab.first().tap(); await page.waitForTimeout(1200); }
  const markup = page.locator('button').filter({ hasText: /Mark up/i });
  check(await markup.count() > 0, 'the plan pane offers Mark up');
  await markup.first().tap();
  // A cold dev server compiles pdf.js on the first studio open: poll for the
  // studio's own canvases rather than trusting a fixed beat (the plantabs lesson).
  for (let i = 0; i < 45; i++) { if (await page.locator('[data-plan-surface="studio"] canvas').count() >= 3) break; await page.waitForTimeout(2000); }
  await page.waitForTimeout(2500);
  const studio = page.locator('[data-plan-surface="studio"]').last();
  await page.screenshot({ path: `scratchpad/gal-tabs10-${tag}-studio.jpg`, type: 'jpeg', quality: 82 });
  // Arm the pen (closing the tray it may open), then draw with the S PEN.
  const penBtn = page.locator('[data-plan-surface="studio"] button[title]').filter({ hasText: /^Pen$/ });
  if (await penBtn.count()) { await penBtn.first().tap(); await page.waitForTimeout(400); }
  if (await page.locator('[data-pen-tray]').count()) {
    await page.waitForTimeout(1200);   // let the studio re-render behind the tray (the listener-order race)
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    check(await page.locator('[data-pen-tray]').count() === 0 && await page.locator('[data-plan-surface="studio"]').count() === 1,
      'Escape on the pen tray closes the tray and NOTHING behind it (the studio and the job window stand)');
  }
  const canvases = page.locator('canvas'); const n = await canvases.count();
  const cbox = await canvases.nth(n - 1).boundingBox();
  const ink0 = await inkPixels();
  await stroke(cdp, wave(cbox.x + cbox.width * 0.25, cbox.y + cbox.height * 0.5, cbox.width * 0.4), 'pen');
  await page.waitForTimeout(700);
  const ink1 = await inkPixels();
  check(ink1 > ink0 + 300, 'the S Pen draws a stroke that commits as ink', `${ink0} → ${ink1}`);
  // A palm right behind the nib: a finger touch within the pen window must draw nothing.
  await stroke(cdp, wave(cbox.x + cbox.width * 0.25, cbox.y + cbox.height * 0.7, cbox.width * 0.4), 'pen');
  await stroke(cdp, wave(cbox.x + cbox.width * 0.3, cbox.y + cbox.height * 0.3, cbox.width * 0.3), 'finger');
  await page.waitForTimeout(700);
  const ink2 = await inkPixels();
  const penOnly = ink2 - ink1;
  // The second pen stroke adds ink; the palm must add none: compare against the first stroke's size.
  check(penOnly > 300 && penOnly < (ink1 - ink0) * 1.6, 'a palm landing right behind the pen is turned away (only the pen stroke\'s worth of ink was added)', `+${penOnly} vs first stroke ${ink1 - ink0}`);
  await page.waitForTimeout(900);   // past PEN_WINDOW (700ms)
  await stroke(cdp, wave(cbox.x + cbox.width * 0.3, cbox.y + cbox.height * 0.35, cbox.width * 0.3), 'finger');
  await page.waitForTimeout(700);
  const ink3 = await inkPixels();
  check(ink3 > ink2 + 300, 'once the pen is away, a finger draws again', `${ink2} → ${ink3}`);
  const touchAction = await page.evaluate(() => { const l = [...document.querySelectorAll('canvas')]; return getComputedStyle(l[l.length - 1]).touchAction; });
  check(touchAction === 'none', 'the live canvas refuses to let the tablet pan under a stroke', touchAction);
  await page.screenshot({ path: `scratchpad/gal-tabs10-${tag}-studio-ink.jpg`, type: 'jpeg', quality: 82 });
  // Every tool button of the studio sits inside the screen.
  const off = await page.evaluate(([W, H]) => [...document.querySelectorAll('[data-plan-surface="studio"] button')].filter(b => b.offsetParent).map(b => ({ r: b.getBoundingClientRect(), t: b.getAttribute('title') || b.textContent.trim().slice(0, 20), inScroller: !!b.closest('.overflow-x-auto, .edge-fade, [class*="overflow-x"]') })).filter(({ r }) => r.right > W + 1 || r.bottom > H + 1 || r.left < -1).map(({ r, t, inScroller }) => `${t} @${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}${inScroller ? ' (in a sideways scroller)' : ''}`), [W, H]);
  // A button inside a SIDEWAYS SCROLLER (the version rail, the tool rail) is
  // reachable by scrolling — the standing detector exemption, not a fault.
  const offReal = off.filter(t => !/in a sideways scroller/.test(t));
  check(offReal.length === 0, 'every studio button is on screen or in a sideways scroller', off.join(' · '));
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  // ── the board: pen arranges, finger pans ──
  await page.evaluate(() => localStorage.setItem('active_project', 'general'));
  await page.goto('http://localhost:5173/jobs'); await page.waitForTimeout(3000);
  // Switch to the Job Board through the real header picker if we are not there.
  if (!(await page.locator('[data-board-viewport]').count())) {
    await page.locator('button').filter({ hasText: /Wolfson|Job Board|Netiv/ }).first().tap().catch(() => {});
    await page.waitForTimeout(600);
    await page.locator('button, [role="menuitem"]').filter({ hasText: /Job Board/ }).first().tap().catch(() => {});
    await page.waitForTimeout(2500);
  }
  const board = await page.locator('[data-board-viewport]').count();
  check(board === 1, 'the Job Board is on screen');
  if (board) {
    const addBtn = page.locator('button').filter({ hasText: /^Add job$/i });
    if (!(await page.locator('[data-node-id^="G-"]').count()) && await addBtn.count()) {
      await addBtn.first().tap(); await page.waitForTimeout(500);
      const nameBox = page.locator('input[placeholder*="amily" i], input[placeholder*="ame" i]').first();
      if (await nameBox.count()) await nameBox.fill('Pen test job');
      await page.locator('button').filter({ hasText: /^(Add|Create|Save)/i }).first().tap().catch(() => {});
      await page.waitForTimeout(1200);
    }
    const tile = page.locator('[data-node-id^="G-"]').first();
    if (await tile.count()) {
      const tileId = await tile.getAttribute('data-node-id');
      const stored = () => page.evaluate(id => { const d = JSON.parse(localStorage.getItem('general_app_data') || '{}'); const a = (d.apartments ?? []).find(x => x.id === id); return a ? [a.canvasX, a.canvasY] : null; }, tileId);
      const b0 = await tile.boundingBox(); const p0 = await stored();
      // Finger drag from the tile: the BOARD pans, the job stays where it is stored.
      const cx = b0.x + b0.width / 2, cy = b0.y + b0.height / 2 + 20;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
      for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + i * 12, y: cy + i * 8 }] }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(700);
      const p1 = await stored();
      check(p0 && p1 && p0[0] === p1[0] && p0[1] === p1[1], 'a FINGER drag from a tile pans the board and leaves the job in place', `${p0} → ${p1}`);
      // Pen drag from the tile: the job MOVES, like a mouse.
      const b1 = await tile.boundingBox();
      const px = b1.x + b1.width / 2, py = b1.y + b1.height / 2 + 20;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1, pointerType: 'pen' });
      for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px + i * 10, y: py + i * 6, button: 'left', buttons: 1, pointerType: 'pen' }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px + 120, y: py + 72, button: 'left', clickCount: 1, pointerType: 'pen' });
      await page.waitForTimeout(900);
      const p2 = await stored();
      check(p2 && (p2[0] !== p1[0] || p2[1] !== p1[1]), 'the S PEN drags the tile itself — it arranges like a mouse', `${p1} → ${p2}`);
    } else console.log('       (no job tile to drag)');
    await page.screenshot({ path: `scratchpad/gal-tabs10-${tag}-board-pen.jpg`, type: 'jpeg', quality: 82 });
  }
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
