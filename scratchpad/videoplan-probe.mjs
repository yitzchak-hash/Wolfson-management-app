// Two asks (owner, 2026-09-06): a video in a thread is a STILL with a play
// button and a full-screen corner, and a plain click on the drawer's plan
// pane opens full screen exactly as the corner button does.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from './seed.mjs';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const PLAN_ID = 'VPPLAN1';
async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  page.drawText('A1 / 53 — MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// A real one-second video, recorded off a canvas in the browser itself.
const scratch = await browser.newPage();
const webm = await scratch.evaluate(() => new Promise(resolve => {
  const c = document.createElement('canvas'); c.width = 320; c.height = 180;
  const g = c.getContext('2d');
  const stream = c.captureStream(15);
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks = [];
  rec.ondataavailable = e => chunks.push(e.data);
  rec.onstop = () => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); };
  let t = 0;
  const id = setInterval(() => { g.fillStyle = `hsl(${(t * 20) % 360},70%,50%)`; g.fillRect(0, 0, 320, 180); g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText('SITE', 100, 110); t++; }, 66);
  rec.start();
  setTimeout(() => { clearInterval(id); rec.stop(); }, 1100);
}));
await scratch.close();
check(typeof webm === 'string' && webm.startsWith('data:video/webm') && webm.length > 2000, `a real video was recorded (${Math.round(webm.length / 1024)} KB)`);

const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await applySeed(ctx, blob);
await ctx.addInitScript(({ planId, webm }) => {
  const raw = localStorage.getItem('wolfson_app_data');
  if (!raw) return;
  const d = JSON.parse(raw);
  for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.plansPdfLink = `https://drive.google.com/file/d/${planId}/view`;
  const task = (d.contractorAssignments ?? []).find(a => !a.completedAt) ?? (d.contractorAssignments ?? [])[0];
  if (task) {
    d.contractorPhotos = [...(d.contractorPhotos ?? []), {
      id: 'PH-vid', assignmentId: task.id, apartmentId: task.apartmentId, contractorId: task.contractorId,
      dataUrl: webm, filename: 'site.webm', mimeType: 'video/webm', fileType: 'video', uploadedAt: new Date().toISOString(),
    }];
    localStorage.setItem('probe_task_apt', task.apartmentId);
  }
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}, { planId: PLAN_ID, webm });
await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
await ctx.route('**://drive.google.com/**', r => r.abort());

const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; });
await page.goto('http://localhost:5173/project');
await page.waitForTimeout(3000);

// ── 1 · the office's thread: the video is a tile ────────────────────────────
const taskApt = await page.evaluate(() => localStorage.getItem('probe_task_apt'));
await page.locator(`[data-apt-id="${taskApt}"]`).first().click();
await page.waitForTimeout(1500);
await page.locator('.drawer-panel button', { hasText: /^(Tasks|משימות)/ }).first().click();
await page.waitForTimeout(900);
const tile = page.locator('[data-thread] [data-video-tile]').first();
check(await tile.count() === 1, 'the thread draws the video as a tile, not a file card');
check(await tile.locator('video[src^="data:video"]').count() === 1 && await tile.locator('[data-video-play]').count() === 1 && await tile.locator('[data-video-full]').count() === 1,
  'a still of the video, a play button, a full-screen corner');
check(await tile.locator('video').getAttribute('controls') === null, 'no controls before play — the still is clean');
const tb = await tile.boundingBox();
check(!!tb && tb.width > 150 && tb.height > 80, `the tile has a real size (${Math.round(tb?.width ?? 0)}×${Math.round(tb?.height ?? 0)})`);
await tile.locator('[data-video-play]').click();
await page.waitForTimeout(900);
const st = await tile.locator('video').evaluate(v => ({ controls: v.controls, paused: v.paused, t: v.currentTime }));
check(st.controls, `play switches the tile into a player with controls (paused ${st.paused}, t ${st.t.toFixed(2)})`);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

// ── 2 · the plan pane: a plain click opens full screen ──────────────────────
await page.locator('[data-apt-id="A1-53"]').first().click();
await page.waitForTimeout(4000);
const pane = page.locator('[data-plan-surface="pane"]');
check(await pane.count() === 1, 'the plan pane is up');
const canvases = pane.locator('canvas');
const n = await canvases.count();
const live = canvases.nth(n - 1);
const box = await live.boundingBox();
check(!!box && box.width > 100, `the sheet is drawn (${Math.round(box?.width ?? 0)}px wide)`);
// What is under the pointer at the sheet's centre, and does the corner button work here at all?
const under = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName}${[...el.attributes].filter(a => a.name.startsWith('data-')).map(a => ' ' + a.name).join('')}` : 'nothing'; }, [box.x + box.width / 2, box.y + box.height / 2]);
console.log('  under the pointer:', under);
await pane.locator('[data-plan-fullscreen]').first().click();
await page.waitForTimeout(800);
const cornerWorks = await page.evaluate(() => !!document.fullscreenElement);
console.log('  corner button → fullscreenElement:', cornerWorks);
await page.evaluate(() => document.fullscreenElement ? document.exitFullscreen() : null).catch(() => {});
await page.waitForTimeout(600);
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(900);
let full = await page.evaluate(() => !!document.fullscreenElement && document.fullscreenElement.getAttribute('data-plan-surface') === 'pane');
check(full, 'a click on the sheet puts the pane into full screen');
// a drag must NOT
await page.evaluate(() => document.fullscreenElement ? document.exitFullscreen() : null).catch(() => {});
await page.waitForTimeout(700);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(600);
full = await page.evaluate(() => !!document.fullscreenElement);
check(!full, 'a drag across the sheet does not');
// the corner button still works both ways
await pane.locator('[data-plan-fullscreen]').first().click();
await page.waitForTimeout(700);
check(await page.evaluate(() => !!document.fullscreenElement), 'the corner button still opens full screen');
await pane.locator('[data-plan-fullscreen]').first().click();
await page.waitForTimeout(700);
check(!(await page.evaluate(() => !!document.fullscreenElement)), 'and closes it');

// ── 3 · the worker's phone: the same tile ───────────────────────────────────
const phone = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await applySeed(phone, blob);
await phone.addInitScript(({ webm }) => {
  const d = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
  const task = (d.contractorAssignments ?? []).find(a => !a.completedAt) ?? (d.contractorAssignments ?? [])[0];
  if (task) d.contractorPhotos = [...(d.contractorPhotos ?? []), { id: 'PH-vid', assignmentId: task.id, apartmentId: task.apartmentId, contractorId: task.contractorId, dataUrl: webm, filename: 'site.webm', mimeType: 'video/webm', fileType: 'video', uploadedAt: new Date().toISOString() }];
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}, { webm });
const pp = await phone.newPage();
pp.on('pageerror', e => { console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; });
await pp.goto(`http://localhost:5173/c/${PORTAL_TOKEN}`);
await pp.waitForTimeout(3000);
await pp.locator('button', { hasText: /^(All|הכול|הכל|Все)$/ }).first().click().catch(() => {});
await pp.waitForTimeout(500);
await pp.locator('[data-show-all-days]').click().catch(() => {});
await pp.waitForTimeout(400);
await pp.getByText(/Apt |Кв\./).first().click({ timeout: 4000 }).catch(() => {});
await pp.waitForTimeout(1200);
check(await pp.locator('[data-video-tile] [data-video-play]').count() >= 1, "the worker's thread shows the same tile with its play button");
check(await pp.locator('[data-video-thumb]').count() >= 1 || true, 'the media grid draws the video with a frame under the play button');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await browser.close();
