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
  // Office notes — one plain, one carrying a file — so the section the owner
  // asked for has REAL content rather than a drawn stand-in.
  await ctx.addInitScript(() => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw);
    const a = (d.contractorAssignments ?? [])[0]; if (!a) return;
    d.contractorNotes = [
      { id: 'N-off-1', assignmentId: a.id, apartmentId: a.apartmentId, contractorId: a.contractorId,
        text: 'Riser is on the north wall — Shimon has the key to the shaft.',
        authorType: 'office', authorId: 'U-1', authorName: 'Esther',
        createdAt: new Date(Date.now() - 36e5 * 5).toISOString() },
      { id: 'N-off-2', assignmentId: a.id, apartmentId: a.apartmentId, contractorId: a.contractorId,
        text: 'Updated drain detail from the engineer:',
        authorType: 'office', authorId: 'U-1', authorName: 'Esther',
        createdAt: new Date(Date.now() - 36e5 * 2).toISOString(),
        attachmentFilename: 'drain-detail-rev-C.pdf', attachmentMimeType: 'application/pdf',
        attachmentDataUrl: 'data:application/pdf;base64,JVBERi0xLjQK' },
    ];
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  });
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

// ── PROPOSED screen 1 ──
{
  const { ctx, page } = await openTask();
  await page.evaluate(() => {
    const leaf = re => [...document.querySelectorAll('*')].find(el =>
      el.children.length === 0 && re.test(el.textContent.trim()) && el.getBoundingClientRect().width > 0);
    // A pill that holds a coloured dot has ONE child, so it is not a leaf —
    // the same trap the building name bar set. Allow a single child.
    const nearLeaf = re => [...document.querySelectorAll('*')].find(el =>
      el.children.length <= 1 && re.test(el.textContent.trim()) && el.getBoundingClientRect().width > 0);

    // the middle Close job button goes — one close, in the footer
    const mid = document.querySelector('[data-close-job]');
    if (mid) mid.remove();

    // Urgent loses its box — walk up to whatever is actually PAINTING the
    // pill (a fixed hop lands on a plain wrapper and strips nothing)
    // The pill's exact text and child count are not dependable (a dot span,
    // an icon, a translated label) — take the SMALLEST element that says it.
    const smallest = re => [...document.querySelectorAll('*')]
      .filter(el => re.test(el.textContent.trim()) && el.getBoundingClientRect().width > 0)
      .sort((a, z) => { const r = a.getBoundingClientRect(), s2 = z.getBoundingClientRect();
        return r.width * r.height - s2.width * s2.height; })[0];
    // The pill's text is "\uD83D\uDD34 Urgent" — the dot is an EMOJI inside the
    // same leaf, so an exact-text match finds nothing. Take the smallest
    // element that mentions it.
    const urgent = smallest(/Urgent|\u05d3\u05d7\u05d5\u05e3/i);
    if (urgent) {
      for (let n = urgent, i = 0; n && i < 3; n = n.parentElement, i++) {
        const cs = getComputedStyle(n);
        const painted = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
        const bordered = cs.borderTopWidth !== '0px';
        if (painted || bordered) {
          n.style.background = 'transparent'; n.style.border = 'none';
          n.style.padding = '0'; n.style.boxShadow = 'none';
          break;
        }
      }
    }

    // the section is the OFFICE's — its label says so, its own Add File goes
    // (the worker's paperclip lives in the note box and in the closing
    // screen), and the office's NOTES move up into it, beside its files
    const files = leaf(/^FILES & PHOTOS/i);
    if (files) files.textContent = 'FROM THE OFFICE';
    const addFile = [...document.querySelectorAll('button')].find(b => /Add File/i.test(b.textContent));
    if (addFile) addFile.remove();

    const officeHead = leaf(/^FROM OFFICE$/i);
    if (officeHead && files) {
      const chain = el => { const o = []; for (let n = el; n; n = n.parentElement) o.push(n); return o; };
      const up = chain(officeHead), set = new Set(chain(files));
      const root = up.find(n => set.has(n));
      if (root) {
        const fUp = chain(files);
        const officeBranch = up[up.indexOf(root) - 1];
        const filesBranch = fUp[fUp.indexOf(root) - 1];
        if (officeBranch && filesBranch && filesBranch.nextSibling !== officeBranch) {
          root.insertBefore(officeBranch, filesBranch.nextSibling);
        }
        officeHead.textContent = '';           // the section heading already says it
        officeHead.style.display = 'none';
      }
      // the NOTES heading carries a speech-bubble icon, so it is not a leaf
      const notesHead = smallest(/^\s*NOTES\s*$/i);
      if (notesHead) notesHead.style.display = 'none';
      const inputRow = [...document.querySelectorAll('input,textarea')]
        .find(x => /note/i.test(x.placeholder || ''));
      if (inputRow) {
        const row = inputRow.closest('div');
        const lab = document.createElement('div');
        lab.textContent = 'YOUR NOTE';
        lab.style.cssText = 'font:700 12px Figtree,sans-serif;letter-spacing:.07em;color:#6b7280;margin:16px 0 7px';
        if (row && row.parentElement) row.parentElement.insertBefore(lab, row);
      }
      // whatever empty-state placeholder is left in the files block goes
      const empty = [...document.querySelectorAll('*')].find(el =>
        /Nothing from the office yet|Tap to add photos/i.test(el.textContent) && el.children.length === 0);
      if (empty) { const b = empty.closest('button,div'); if (b) b.remove(); }
    }

    const inp = [...document.querySelectorAll('input,textarea')].find(x => /note/i.test(x.placeholder || ''));
    if (inp) inp.placeholder = 'Add a note while you work…';
  });
  await page.waitForTimeout(700);
  await fullSheet(page, 'scratchpad/c-prop1.png');
  await ctx.close(); console.log('c-prop1 ok');
}

// ── NOW screen 2 ──
{
  const { ctx, page } = await openTask();
  await page.locator('[data-close-job]').first().click();
  await page.waitForTimeout(900);
  await fullSheet(page, 'scratchpad/c-now2.png');
  await ctx.close(); console.log('c-now2 ok');
}

// ── PROPOSED screen 2 — the owner's revision ──
{
  const { ctx, page } = await openTask();
  await page.locator('[data-close-job]').first().click();
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const panel = document.querySelector('[data-closing-panel]');
    if (!panel) return;
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
    const sect = (title, hint, hintTag) => {
      const d = document.createElement('div');
      d.style.cssText = 'margin-bottom:20px';
      d.innerHTML = `<div style="font:700 12px Figtree,sans-serif;letter-spacing:.07em;color:#6b7280;margin-bottom:7px">${title}</div>`
        + (hint ? `<div style="font-size:13px;color:#9ca3af;margin:-3px 0 ${hintTag ? '6px' : '9px'}">${hint}</div>` : '')
        + (hintTag ? `<div style="margin:0 0 9px"><span style="display:inline-block;font:700 10.5px Figtree,sans-serif;letter-spacing:.05em;color:#c2560f;background:#fdf1e7;border:1px solid #f0c9a8;border-radius:999px;padding:2px 9px">${hintTag}</span></div>` : '');
      body.appendChild(d); return d;
    };

    // 1 · the app's OWN add-media button at the top, with its own 0/3 badge
    const pics = sect('PICTURES', 'At least 3 before the job can be closed', 'follows the worker&rsquo;s permission');
    const realAdd = panel.querySelector('button');
    const count = panel.querySelector('[data-close-count]');
    if (realAdd) { const c = realAdd.cloneNode(true); c.style.width = '100%'; c.style.justifyContent = 'center'; pics.appendChild(c); }
    if (count) { const w = document.createElement('div');
      w.style.cssText = 'display:flex;justify-content:center;margin-top:9px';
      w.appendChild(count.cloneNode(true)); pics.appendChild(w); }

    // 2 · one comment box, with the paperclip and the microphone INSIDE it
    const note = sect('A COMMENT', 'Anything the office should know');
    const box = document.createElement('div');
    box.style.cssText = 'position:relative;border:1px solid #e5e7eb;border-radius:12px;background:#fff';
    const ta = document.createElement('textarea');
    ta.placeholder = 'Type what you did\u2026';
    ta.style.cssText = 'width:100%;min-height:104px;border:0;outline:none;border-radius:12px;padding:11px 11px 40px;'
      + 'font:15px Figtree,sans-serif;resize:vertical;background:transparent';
    box.appendChild(ta);
    const corner = document.createElement('div');
    corner.style.cssText = 'position:absolute;right:9px;bottom:8px;display:flex;gap:6px;align-items:center';
    const realIcons = [...panel.querySelectorAll('button')].filter(x => x.querySelector('svg') && x.offsetWidth < 60);
    realIcons.slice(0, 2).forEach(x => {
      const c = x.cloneNode(true);
      c.style.border = 'none'; c.style.background = 'transparent'; c.style.padding = '2px';
      corner.appendChild(c);
    });
    box.appendChild(corner);
    note.appendChild(box);
    // NOTE: no separate file section — the owner cut it as repetitive; the
    // add-media button at the top already takes files.
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'scratchpad/c-prop2.png' });
  await ctx.close(); console.log('c-prop2 ok');
}

await b.close();
