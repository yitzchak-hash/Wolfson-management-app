// Area C: the worker's task sheet and the Close job flow, on the RUNNING app
// at phone width — the worker's real device.
import { chromium, devices } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed, PORTAL_TOKEN } from '../seed.mjs';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(b);
const PLAN_ID = 'HARNESSPLAN1';
async function makePlan() {
  const doc = await PDFDocument.create();
  const pg = doc.addPage([1191, 842]);
  pg.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(.1,.1,.2) });
  for (let i = 1; i < 6; i++) pg.drawLine({ start:{x:30+i*188,y:30}, end:{x:30+i*188,y:812}, thickness:.8, color: rgb(.6,.66,.75) });
  for (let i = 1; i < 4; i++) pg.drawLine({ start:{x:30,y:30+i*195}, end:{x:1161,y:30+i*195}, thickness:.8, color: rgb(.6,.66,.75) });
  pg.drawText('A1 / 1 — MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(.12,.23,.37) });
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();

async function openTask() {
  const ctx = await b.newContext({
    viewport: { width: 402, height: 874 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent,
  });
  await applySeed(ctx, blob);
  // Seed a plan on EVERY apartment the worker has a task on — the portal only
  // draws its plan section when the job has one (the planphone lesson).
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
  await page.locator('button, [role=button]')
    .filter({ hasText: /concealed unit|registers|thermostats/i }).first().click();
  await page.waitForTimeout(1400);
  return { ctx, page };
}

/** The sheet scrolls — capture the whole thing, not just the fold. */
async function fullSheet(page, path) {
  const box = await page.evaluate(() => {
    const sheet = [...document.querySelectorAll('div')].find(d => {
      const r = d.getBoundingClientRect();
      return r.width > 300 && r.height > 300 && /TASK|Close job/i.test(d.textContent)
        && getComputedStyle(d).overflowY === 'auto';
    });
    if (sheet) { sheet.style.height = 'auto'; sheet.style.maxHeight = 'none'; sheet.style.overflow = 'visible'; }
    const panel = sheet ? sheet.closest('div[class*="rounded"]') || sheet : null;
    if (panel) { panel.style.height = 'auto'; panel.style.maxHeight = 'none'; }
    const r = (panel || document.body).getBoundingClientRect();
    return { x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(402, r.width), h: Math.min(2400, r.height) };
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path, clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
}

// ── NOW ──
{
  const { ctx, page } = await openTask();
  await fullSheet(page, 'scratchpad/c-now.png');
  const map = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('*')].filter(el =>
      el.children.length === 0 && el.getBoundingClientRect().width > 0
      && /^(TASK|FILES & PHOTOS|NOTES|Close job|Add File|Engineering Plans)/i.test(el.textContent.trim()));
    return labels.map(el => ({ t: el.textContent.trim().slice(0, 24), y: Math.round(el.getBoundingClientRect().top) }));
  });
  console.log('now sections:', JSON.stringify(map));
  await ctx.close(); console.log('c-now ok');
}

// ── PROPOSED screen 1: reordered, one Close job ──
{
  const { ctx, page } = await openTask();
  await page.evaluate(() => {
    const leaf = re => [...document.querySelectorAll('*')].find(el =>
      el.children.length === 0 && re.test(el.textContent.trim()) && el.getBoundingClientRect().width > 0);
    // 1 · the plan moves ABOVE the task. Found through the two headings'
    //     nearest COMMON ancestor, then the branch each one sits in — a fixed
    //     number of parentElement hops lands on a shared wrapper and moves
    //     nothing, which is what a looser version of this did.
    const chain = el => { const out = []; for (let n = el; n; n = n.parentElement) out.push(n); return out; };
    const planHead = leaf(/^ENGINEERING PLANS$/i);
    const taskHead = leaf(/^TASK$/i);
    if (planHead && taskHead) {
      const up = chain(planHead), set = new Set(chain(taskHead));
      const root = up.find(n => set.has(n));
      if (root) {
        const tUp = chain(taskHead);
        const planBranch = up[up.indexOf(root) - 1];
        const taskBranch = tUp[tUp.indexOf(root) - 1];
        if (planBranch && taskBranch) root.insertBefore(planBranch, taskBranch);
      }
    }
    // 2 · the big middle Close job button goes; the footer one stays
    const mid = document.querySelector('[data-close-job]');
    if (mid) {
      const empty = document.createElement('button');
      empty.style.cssText = 'width:100%;border:2px dashed #e5e7eb;border-radius:12px;padding:22px 0;'
        + 'display:flex;flex-direction:column;align-items:center;gap:6px;color:#9ca3af;background:#fff;font:500 14px Figtree,sans-serif';
      const t = document.createElement('span');
      t.textContent = 'Nothing from the office yet';
      empty.appendChild(t);
      mid.replaceWith(empty);
    }
    // 3 · the files section is the OFFICE's files, and says so
    const files = leaf(/^FILES & PHOTOS/i);
    if (files) files.textContent = 'FROM THE OFFICE';
    // 4 · the note box says what it is for
    const inp = [...document.querySelectorAll('input,textarea')].find(x => /note/i.test(x.placeholder || ''));
    if (inp) inp.placeholder = 'Add a note while you work…';
  });
  await page.waitForTimeout(600);
  await fullSheet(page, 'scratchpad/c-prop1.png');
  await ctx.close(); console.log('c-prop1 ok');
}

// ── NOW screen 2: today's closing panel, inside the same sheet ──
{
  const { ctx, page } = await openTask();
  await page.locator('[data-close-job]').first().click();
  await page.waitForTimeout(900);
  await fullSheet(page, 'scratchpad/c-now2.png');
  await ctx.close(); console.log('c-now2 ok');
}

// ── PROPOSED screen 2: a screen of its own ──
{
  const { ctx, page } = await openTask();
  await page.locator('[data-close-job]').first().click();
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const panel = document.querySelector('[data-closing-panel]');
    if (!panel) return;
    // lift the REAL closing controls onto a screen of their own
    const screen = document.createElement('div');
    screen.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff;display:flex;flex-direction:column';
    screen.innerHTML =
      '<div style="background:#1e3a5f;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px;flex:0 0 auto">'
      + '<span style="font-size:22px;line-height:1">\u2190</span>'
      + '<div><div style="font:800 17px Figtree,sans-serif">Closing the job</div>'
      + '<div style="font-size:12.5px;opacity:.7">Apt 1 &mdash; Topper, Avraham</div></div></div>'
      + '<div id="cbody" style="flex:1;overflow-y:auto;padding:16px"></div>'
      + '<div style="flex:0 0 auto;padding:12px 16px;border-top:1px solid #e5e7eb">'
      + '<button style="width:100%;border:0;border-radius:12px;padding:16px;color:#fff;font:800 17px Figtree,sans-serif;'
      + 'background:linear-gradient(135deg,#22c55e,#16a34a);display:flex;align-items:center;justify-content:center;gap:8px">'
      + '\u2713 Send and close the job</button></div>';
    document.body.appendChild(screen);
    const body = screen.querySelector('#cbody');
    const sect = (title, hint) => {
      const d = document.createElement('div');
      d.style.cssText = 'margin-bottom:18px';
      d.innerHTML = `<div style="font:700 12px Figtree,sans-serif;letter-spacing:.07em;color:#6b7280;margin-bottom:7px">${title}</div>`
        + (hint ? `<div style="font-size:13px;color:#9ca3af;margin:-3px 0 8px">${hint}</div>` : '');
      body.appendChild(d); return d;
    };
    // the pictures — the app's OWN add-media button and its own 0/3 badge,
    // cloned rather than redrawn, so the icons are the real ones
    const pics = sect('PICTURES', 'At least 3 before the job can be closed');
    const realAdd = panel.querySelector('button');
    const count = panel.querySelector('[data-close-count]');
    const wrap = document.createElement('div');
    wrap.style.cssText = 'border:2px dashed #cbd5e1;border-radius:14px;padding:20px 14px;background:#f8fafc;'
      + 'display:flex;flex-direction:column;align-items:center;gap:10px';
    if (realAdd) {
      const c = realAdd.cloneNode(true);
      c.style.width = '100%';
      c.style.justifyContent = 'center';
      wrap.appendChild(c);
    }
    if (count) wrap.appendChild(count.cloneNode(true));
    pics.appendChild(wrap);

    // a comment, with the app's own paperclip and microphone
    const note = sect('A COMMENT', 'Anything the office should know');
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:flex-start';
    const clip = panel.querySelector('button svg')?.closest('button');
    const realBtns = [...panel.querySelectorAll('button')].filter(x => x.querySelector('svg') && x.offsetWidth < 60);
    const ta = document.createElement('textarea');
    ta.placeholder = 'Type what you did\u2026';
    ta.style.cssText = 'flex:1;min-height:84px;border:1px solid #e5e7eb;border-radius:12px;padding:10px;'
      + 'font:15px Figtree,sans-serif;resize:vertical';
    row.appendChild(ta);
    const side = document.createElement('div');
    side.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    realBtns.slice(0, 2).forEach(x => side.appendChild(x.cloneNode(true)));
    row.appendChild(side);
    note.appendChild(row);
    // files
    const files = sect('A FILE', 'A delivery note, a photo of a label — anything');
    const fbtn = document.createElement('button');
    fbtn.style.cssText = 'width:100%;border:1px dashed #cbd5e1;border-radius:12px;padding:13px;background:#fff;'
      + 'color:#475569;font:600 14.5px Figtree,sans-serif';
    const clipIcon = realBtns[0] ? realBtns[0].querySelector('svg') : null;
    fbtn.style.display = 'flex'; fbtn.style.alignItems = 'center';
    fbtn.style.justifyContent = 'center'; fbtn.style.gap = '8px';
    if (clipIcon) fbtn.appendChild(clipIcon.cloneNode(true));
    fbtn.appendChild(document.createTextNode('Attach a file'));
    files.appendChild(fbtn);
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'scratchpad/c-prop2.png' });
  await ctx.close(); console.log('c-prop2 ok');
}

await b.close();
