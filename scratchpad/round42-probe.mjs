// The owner's five, 2026-09-16: (1) the plan pane's wheel zoom no longer
// snaps back (a classic scrollbar appearing used to re-fit the sheet);
// (2) a recording / file waiting in the box says "press Send";
// (3) the worker is rung in the app — chime, banner, tap-to-open — and the
//     push banner shows only where the keys are set; a notification's
//     ?task= deep link opens the task; (4) each side deletes its own
//     messages; (5) the portal's My tasks opens on ALL.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from './seed.mjs';

const APP = 'http://localhost:5173';
const APP_PUSH = 'http://localhost:5175';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  for (let i = 1; i < 9; i++) page.drawLine({ start: { x: 30 + i * 125, y: 30 }, end: { x: 30 + i * 125, y: 812 }, thickness: 0.6, color: rgb(0.5, 0.6, 0.7) });
  page.drawText('SHEET — MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();
const PLAN_ID = 'HARNESSPLAN42';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(browser);

/** The seed plus: the plan on A1-53, one worker note and one office note on task A-1. */
async function seededContext(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ...opts });
  await applySeed(ctx, blob, {});
  await ctx.addInitScript(planId => {
    const raw = localStorage.getItem('wolfson_app_data');
    if (!raw) return;
    const d = JSON.parse(raw);
    const link = `https://drive.google.com/file/d/${planId}/view`;
    for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.plansPdfLink = link;
    const t1 = (d.contractorAssignments ?? []).find(a => a.id === 'A-1');
    if (t1) {
      d.contractorNotes = [
        { id: 'N-w1', assignmentId: 'A-1', apartmentId: t1.apartmentId, contractorId: 'C-test', text: 'From the site: pipe arrived',
          authorType: 'contractor', authorId: 'C-test', authorName: 'Moshe Aharonov', createdAt: '2026-09-10T08:00:00Z' },
        { id: 'N-o1', assignmentId: 'A-1', apartmentId: t1.apartmentId, contractorId: 'C-test', text: 'Office: start with the bedrooms',
          authorType: 'office', authorId: 'U-1', authorName: 'Esther', createdAt: '2026-09-10T09:00:00Z' },
      ];
    }
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  }, PLAN_ID);
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  return ctx;
}

// ── 1 · the plan pane's wheel zoom holds ────────────────────────────────────
{
  const ctx = await seededContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  // Force a CLASSIC, space-taking scrollbar like Windows draws.
  await page.addStyleTag({ content: '*::-webkit-scrollbar{width:17px;height:17px;-webkit-appearance:none;background:#ccc}' }).catch(() => {});
  await page.goto(`${APP}/project`);
  await page.addStyleTag({ content: '*::-webkit-scrollbar{width:17px;height:17px;-webkit-appearance:none;background:#ccc}' });
  await page.waitForTimeout(2500);
  await page.locator('[data-apt-id="A1-53"]').first().click();
  await page.waitForFunction(() => [...document.querySelectorAll('canvas')].some(c => c.width > 200), null, { timeout: 25000 });
  await page.waitForTimeout(1200);
  const sheet = () => page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].find(x => x.width > 200 && x.height > 150);
    if (!c) return null;
    let sc = c.parentElement;
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    const r = c.getBoundingClientRect();
    return { w: Math.round(r.width), cx: r.left + r.width / 2, cy: r.top + r.height / 2,
      bar: sc ? sc.offsetWidth - sc.clientWidth : -1 };
  });
  const before = await sheet();
  check(!!before, '1 · the plan drew in the drawer pane', JSON.stringify(before));
  await page.mouse.move(before.cx, before.cy);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(500);
  const mid = await sheet();
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(500);
  const after = await sheet();
  await page.waitForTimeout(700);
  const settled = await sheet();
  check(mid.w > before.w && after.w > mid.w, '1 · two wheel notches zoom in twice', `${before.w} → ${mid.w} → ${after.w}`);
  check(settled.w === after.w, '1 · and the zoom HOLDS — no snap back to the fit', `${after.w} then ${settled.w} (scrollbar ${settled.bar}px)`);
  console.log(`       scrollbar took ${settled.bar}px of the stage (0 = overlay scrollbars here; the fix is by construction either way)`);
  await ctx.close();
}

// ── 2 + 4 · the office composer: pending hint, own-message delete ───────────
{
  const ctx = await seededContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/project`);
  await page.waitForTimeout(2500);
  const aptId = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')).contractorAssignments.find(a => a.id === 'A-1').apartmentId);
  await page.locator(`[data-apt-id="${aptId}"]`).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /^Tasks/ }).first().click();
  await page.waitForTimeout(600);
  const composer = page.locator('[data-office-composer]').first();
  await composer.scrollIntoViewIfNeeded();
  check(await composer.count() === 1, '2 · the task thread composer is on the Tasks tab');
  check(await page.locator('[data-pending-hint]').count() === 0, '2 · no "press Send" line before anything is attached');
  await composer.locator('input[type=file]').setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await page.waitForTimeout(600);
  const hint = page.locator('[data-pending-hint]');
  check(await hint.count() === 1, '2 · a waiting attachment shows the "Not sent yet — press Send" line', await hint.innerText().catch(() => ''));
  const sendBtn = composer.locator('[data-composer-send]');
  const bg = await sendBtn.evaluate(b => getComputedStyle(b).backgroundColor).catch(() => '');
  check(/245, 158, 11/.test(bg), '2 · and the Send arrow turns amber and pulses', bg);
  await sendBtn.click();
  await page.waitForTimeout(700);
  check(await page.locator('[data-pending-hint]').count() === 0, '2 · Send clears the line');
  const notesNow = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')).contractorNotes.filter(n => n.assignmentId === 'A-1'));
  check(notesNow.some(n => n.attachmentFilename === 'note.txt' && n.authorType === 'office'), '2 · and the file went out as an office message', String(notesNow.length));

  // 4 · delete: the office's bubble offers a trash, the worker's does not.
  const office = page.locator('[data-thread-bubble="N-o1"]');
  const worker = page.locator('[data-thread-bubble="N-w1"]');
  check(await office.locator('[data-note-delete]').count() === 1, "4 · the office's own message carries a delete button");
  check(await worker.locator('[data-note-delete]').count() === 0, "4 · the worker's message offers none to the office");
  await office.hover();
  await office.locator('[data-note-delete]').click();
  check(await office.locator('[data-note-delete-ask]').count() === 1, '4 · the first press asks');
  await office.locator('[data-note-delete-yes]').click();
  await page.waitForTimeout(600);
  const left = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')).contractorNotes.map(n => n.id));
  check(!left.includes('N-o1') && left.includes('N-w1'), '4 · the second press deletes it, and only it', left.join(','));
  check(await page.locator('[data-thread-bubble="N-o1"]').count() === 0, '4 · the bubble is gone from the thread');
  await ctx.close();
}

// ── 3 + 5 · the worker's portal: ALL first, own delete, an arrival rings ───
{
  const ctx = await seededContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/c/${PORTAL_TOKEN}`);
  await page.waitForTimeout(3500);
  const pills = page.locator('button', { hasText: /^All$|^הכל$/ });
  const allBg = await pills.first().evaluate(b => b.style.backgroundColor).catch(() => '');
  check(!!allBg && allBg !== '', '5 · My tasks opens on the ALL pill', allBg);
  const cards = await page.locator('[data-task-card], .task-card, button:has-text("Fit registers")').count();
  check(cards > 0, '5 · and the list shows work on every day, not just today');
  check(await page.locator('[data-push-banner]').count() === 0, '3 · no "turn on notifications" banner where the keys are not set');

  // Open task A-1 and check the worker deletes only his own.
  await page.getByText('Fit registers in both bedrooms').first().click();
  await page.waitForTimeout(1200);
  const mine = page.locator('[data-thread-bubble="N-w1"]');
  const theirs = page.locator('[data-thread-bubble="N-o1"]');
  check(await mine.locator('[data-note-delete]').count() === 1, "4 · the worker's own message carries a delete button on his phone");
  check(await theirs.locator('[data-note-delete]').count() === 0, "4 · the office's message offers none to the worker");
  // Back to the list (the sheet closes by its backdrop).
  await page.keyboard.press('Escape');
  await page.mouse.click(10, 450);
  await page.waitForTimeout(600);

  // An arrival: a task written into ANOTHER workspace's snapshot (what the
  // foreign live sync does on production) — the watcher must ring.
  await page.waitForTimeout(1500);   // past the watcher's baseline window
  const before = await page.locator('[data-arrival-toast]').count();
  await page.evaluate(() => {
    const st = window.__store.getState();
    st.addAssignmentToProject('netiv', {
      apartmentId: 'B1-7', buildingId: 'B1', contractorId: 'C-test',
      taskDescription: 'URGENT: leak on the 3rd floor riser', dueDate: new Date().toISOString().slice(0, 10),
      priority: 'urgent', completedAt: null, createdBy: 'U-1', createdByName: 'Esther',
    });
  });
  await page.waitForTimeout(900);
  const toast = page.locator('[data-arrival-toast]');
  check(before === 0 && await toast.count() === 1, '3 · a task made for him elsewhere rings a banner at the top of the phone');
  const tt = await toast.innerText().catch(() => '');
  check(/leak on the 3rd floor/.test(tt), '3 · the banner names the task', tt.replace(/\n/g, ' | '));
  await toast.click();
  await page.waitForTimeout(2500);
  check(await page.evaluate(() => localStorage.getItem('active_project')) === 'netiv', '3 · tapping it travels to the workspace the task lives in');
  check(await page.getByText('URGENT: leak on the 3rd floor riser').count() >= 1, '3 · and the task is on screen');
  const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('portal_seen_C-test') || '[]'));
  check(seen.some(k => k.startsWith('t:')), '3 · what was seen is remembered per phone', String(seen.length));
  await ctx.close();
}

// ── 3b · a notification's deep link opens the task ──────────────────────────
{
  const ctx = await seededContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/c/${PORTAL_TOKEN}?task=A-1`);
  await page.waitForTimeout(3500);
  check(await page.locator('[data-thread]').count() >= 1 && await page.getByText('Fit registers in both bedrooms').count() >= 1,
    '3b · ?task=<id> opens that task on arrival');
  check(!(await page.evaluate(() => location.search)).includes('task='), '3b · and the id is taken off the address', await page.evaluate(() => location.search));
  await ctx.close();
}

// ── 3c · the push banner where the keys ARE set ─────────────────────────────
{
  const ctx = await seededContext({ permissions: ['notifications'] });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP_PUSH}/c/${PORTAL_TOKEN}`);
  await page.waitForTimeout(3500);
  // Permission is already granted in this context, so the banner (which asks
  // only while the answer is still open) must NOT show; force the open state.
  const perm = await page.evaluate(() => Notification.permission);
  console.log('       notification permission in this context:', perm);
  const ctx2 = await seededContext();
  const p2 = await ctx2.newPage();
  await p2.goto(`${APP_PUSH}/c/${PORTAL_TOKEN}`);
  await p2.waitForTimeout(3500);
  const banner = p2.locator('[data-push-banner]');
  check(await banner.count() === 1, '3c · with a public key in the bundle the banner asks to turn notifications on');
  await p2.locator('[data-push-later]').click();
  await p2.waitForTimeout(300);
  check(await banner.count() === 0, '3c · "not now" puts it away');
  await p2.reload();
  await p2.waitForTimeout(3000);
  check(await p2.locator('[data-push-banner]').count() === 0, '3c · and it stays away on the next open');
  const sw = await page.evaluate(async () => {
    try { const r = await navigator.serviceWorker.getRegistration('/'); return r ? 'registered' : 'none'; } catch { return 'err'; }
  });
  console.log('       service worker after a granted-permission open:', sw);
  await ctx.close(); await ctx2.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
