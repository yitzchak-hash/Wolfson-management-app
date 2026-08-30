// The task thread as a chat, in BOTH places the owner named: the worker's
// phone and the office's own drawer on a computer.
import { chromium, devices } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from '../seed.mjs';
import { THREAD_JS } from './chatthread.mjs';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(b);
const PLAN_ID = 'HARNESSPLAN1';
async function makePlan() {
  const d = await PDFDocument.create(); const p = d.addPage([1191, 842]);
  p.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(.1,.1,.2) });
  p.drawText('A1 / 1 — MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(.12,.23,.37) });
  return Buffer.from(await d.save());
}
const planBytes = await makePlan();

async function portal(w, h, phone) {
  const ctx = await b.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 2,
    isMobile: phone, hasTouch: phone, userAgent: phone ? devices['iPhone 13'].userAgent : undefined });
  await applySeed(ctx, blob);
  await ctx.addInitScript(id => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw);
    const want = new Set((d.contractorAssignments ?? []).map(a => a.apartmentId));
    for (const a of d.apartments ?? []) if (want.has(a.id)) a.plansPdfLink = `https://drive.google.com/file/d/${id}/view`;
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  }, PLAN_ID);
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  const page = await ctx.newPage();
  await page.goto(`http://localhost:5173/c/${PORTAL_TOKEN}`);
  await page.waitForTimeout(3000);
  await page.locator('button').filter({ hasText: /^(All|הכול|הכל)$/ }).first().click();
  await page.waitForTimeout(500);
  await page.locator('button, [role=button]').filter({ hasText: /concealed unit|registers|thermostats/i }).first().click();
  await page.waitForTimeout(1400);
  return { ctx, page };
}

/** Put the thread where the office block is, and tidy the rest as decided. */
const INSTALL = ([threadJs, closed, after]) => {
  const smallest = re => [...document.querySelectorAll('*')]
    .filter(el => re.test(el.textContent.trim()) && el.getBoundingClientRect().width > 0)
    .sort((a, z) => { const r = a.getBoundingClientRect(), s = z.getBoundingClientRect();
      return r.width * r.height - s.width * s.height; })[0];

  const mid = document.querySelector('[data-close-job]');
  if (mid) mid.remove();
  const urgent = smallest(/Urgent|דחוף/i);
  if (urgent) { urgent.style.background = 'transparent'; urgent.style.border = 'none'; urgent.style.padding = '0'; }
  const addFile = [...document.querySelectorAll('button')].find(x => /Add File/i.test(x.textContent));
  if (addFile) addFile.remove();

  const head = smallest(/^\s*FILES & PHOTOS/i) || smallest(/^\s*NOTES\s*$/i);
  if (!head) return 'no head';
  head.textContent = 'THIS TASK';
  const sect = head.closest('div');
  const thread = eval(threadJs)({ closed, after });
  sect.parentElement.insertBefore(thread, sect.nextSibling);

  // the old office-note list and the duplicate heading go
  const oldHead = smallest(/^\s*FROM OFFICE\s*$/i);
  if (oldHead) { const blk = oldHead.parentElement; if (blk) blk.style.display = 'none'; }
  const notesHead = smallest(/^\s*NOTES\s*$/i);
  if (notesHead && notesHead !== head) notesHead.style.display = 'none';
  [...document.querySelectorAll('*')].forEach(el => {
    if (el.children.length === 0 && /Esther/.test(el.textContent) && !thread.contains(el)) {
      const bub = el.closest('div[class*="rounded"]'); if (bub) bub.style.display = 'none';
    }
  });
  return 'ok';
};

async function shot(page, path) {
  const box = await page.evaluate(() => {
    const sh = [...document.querySelectorAll('div')].find(d => {
      const r = d.getBoundingClientRect();
      return r.width > 300 && r.height > 300 && /TASK|Close job/i.test(d.textContent)
        && getComputedStyle(d).overflowY === 'auto'; });
    if (sh) { sh.style.height = 'auto'; sh.style.maxHeight = 'none'; sh.style.overflow = 'visible'; }
    const p = sh ? sh.closest('div[class*="rounded"]') || sh : null;
    if (p) { p.style.height = 'auto'; p.style.maxHeight = 'none'; }
    const r = (p || document.body).getBoundingClientRect();
    return { x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(innerWidth, r.width), h: Math.min(2600, r.height) };
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path, clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
}

// 1 · the worker's phone, mid-job
{
  const { ctx, page } = await portal(402, 874, true);
  console.log('  phone:', await page.evaluate(INSTALL, [THREAD_JS, false]));
  await page.waitForTimeout(500);
  await shot(page, 'scratchpad/chat-phone.png');
  await ctx.close();
}
// 2 · the same thread after the job is closed — the comment and the photos
//     land as the last message, and a marker closes the conversation
{
  const { ctx, page } = await portal(402, 874, true);
  console.log('  closed:', await page.evaluate(INSTALL, [THREAD_JS, true]));
  await page.waitForTimeout(500);
  await shot(page, 'scratchpad/chat-closed.png');
  await ctx.close();
}

// 2b · the conversation carries on AFTER the close
{
  const { ctx, page } = await portal(402, 874, true);
  console.log('  after:', await page.evaluate(INSTALL, [THREAD_JS, true, true]));
  await page.waitForTimeout(500);
  await shot(page, 'scratchpad/chat-after.png');
  await ctx.close();
}

// 3 · the SAME thread in the office's own drawer, on a computer
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1.5 });
  await applySeed(ctx, blob);
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(2400);
  await page.locator('[class*="cursor-pointer"]', { hasText: /^53/ }).first().click();
  await page.waitForTimeout(1400);
  const tab = page.locator('.drawer-panel button', { hasText: /^(Tasks|משימות)/ }).first();
  if (await tab.count()) { await tab.click(); await page.waitForTimeout(1200); }
  const res = await page.evaluate(threadJs => {
    const panel = document.querySelector('.drawer-panel');
    if (!panel) return 'no panel';
    // hang the thread under the first task card in the drawer's Tasks tab
    const card = [...panel.querySelectorAll('div')].find(d => {
      const r = d.getBoundingClientRect();
      return r.height > 60 && r.height < 260 && r.width > 320 &&
        /concealed unit|registers|thermostats|Install/i.test(d.textContent); });
    const host = card || panel.querySelector('div');
    const box = document.createElement('div');
    box.style.cssText = 'margin:12px 0 4px;max-width:640px';
    const lab = document.createElement('div');
    lab.textContent = 'THIS TASK';
    lab.style.cssText = 'font:700 12px Figtree,sans-serif;letter-spacing:.07em;color:#6b7280;margin:0 0 8px';
    box.appendChild(lab);
    box.appendChild(eval(threadJs)({ closed: true }));
    host.parentElement.insertBefore(box, host.nextSibling);
    box.scrollIntoView({ block: 'center' });
    return 'ok';
  }, THREAD_JS);
  console.log('  desktop:', res);
  await page.waitForTimeout(700);
  // Apartment 53 carries no task, so the injection lands above the tab row —
  // clip to the THREAD itself rather than show it in a place it would never be.
  const b2 = await page.locator('[data-thread]').first().boundingBox();
  await page.screenshot({ path: 'scratchpad/chat-desk.png',
    clip: { x: b2.x - 14, y: b2.y - 34, width: b2.width + 28, height: b2.height + 48 } });
  await ctx.close();
}
await b.close();
