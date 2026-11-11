// THE PLAN FINDER (owner's design, 2026-11-10, answers 1b 2b 3b 4b) on a FAKE job Drive.
// Dev server: VITE_DRIVE_API_KEY=harness-key npx vite --port 5183 --strictPort
// node scratchpad/planfinder.mjs   (PORT= SHOTS= dir)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { PDFDocument, rgb } from 'pdf-lib';

const PORT = process.env.PORT || '5183';
const BASE = `http://localhost:${PORT}`;
process.env.SEED_BASE = BASE + '/';
const { realisticWolfson, applySeed } = await import('./seed.mjs');
const { swapLayout } = await import('../src/data/planSearch.ts').catch(() => ({ swapLayout: null }));
const OUT = process.env.SHOTS || '/tmp/claude-0/-home-user/5aa05b05-0399-5fa1-9ab2-84b21f667c30/scratchpad/plansearch';

let fails = 0, n = 0;
const check = (ok, l, extra = '') => { n++; console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const F = 'application/vnd.google-apps.folder';
const at = days => new Date(Date.now() - days * 864e5).toISOString();
const pdf = (id, name, days) => ({ id, name, mimeType: 'application/pdf', modifiedTime: at(days) });
const file = (id, name, mimeType, days) => ({ id, name, mimeType, modifiedTime: at(days) });
const TREE = {
  JOBFOLDER1: [
    { id: 'EP', name: 'Engineered Plans', mimeType: F }, { id: 'AR', name: 'Architect', mimeType: F },
    { id: 'PH', name: 'Photos', mimeType: F }, { id: 'PR', name: 'Proposals', mimeType: F },
    { id: 'APR', name: 'Approvals', mimeType: F },
  ],
  EP: [
    pdf('P1', 'Levi - ground floor AC plan.pdf', 2), pdf('P2', 'Levi - first floor AC plan.pdf', 2.1),
    pdf('P3', 'Levi - roof units.pdf', 9), file('D1', 'Levi villa.dwg', 'application/acad', 9.5),
    pdf('P4', 'Levi villa — converted.pdf', 9.4), { id: 'AP', name: 'Annotated Plans', mimeType: F },
    file('X1', 'Levi equipment schedule.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 5),
    file('W1', 'Levi site notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 12),
    pdf('H1', 'תכנית קומת קרקע.pdf', 6),
  ],
  AP: [pdf('A1', 'Levi - ground floor AC plan — annotated version 3.0.pdf', 1), pdf('A2', 'Levi - ground floor AC plan — annotated version 2.0.pdf', 4)],
  AR: [pdf('R1', 'architect plans rev C.pdf', 20), pdf('R2', 'architect plans rev B.pdf', 40), file('J1', 'kitchen elevation.jpg', 'image/jpeg', 25)],
  PH: [{ id: 'BEF', name: 'Before works', mimeType: F }, file('Z1', 'all photos.zip', 'application/zip', 3)],
  BEF: [file('J2', 'before 1.jpg', 'image/jpeg', 30)],
  PR: [pdf('Q1', 'proposal v2.pdf', 30)],
  APR: [pdf('K1', 'Levi ground floor electrical approval.pdf', 15)],
};

const doc = await PDFDocument.create(); const pg = doc.addPage([1191, 842]);
pg.drawRectangle({ x: 40, y: 40, width: 1111, height: 762, borderWidth: 3, borderColor: rgb(.1, .1, .2) });
pg.drawRectangle({ x: 200, y: 200, width: 500, height: 400, borderWidth: 6, borderColor: rgb(.1, .1, .2) });
const planBytes = Buffer.from(await doc.save());

const browser = await chromium.launch();
// A plan's "picture" for the stubbed Drive thumbnail: a drawn floor plan.
const thumbPage = await browser.newPage({ viewport: { width: 400, height: 300 } });
await thumbPage.setContent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" style="background:#fff">
  <rect x="40" y="30" width="320" height="240" fill="none" stroke="#1e293b" stroke-width="8"/>
  <path d="M170 30v120h-130M240 150h120M240 150v120" fill="none" stroke="#1e293b" stroke-width="6"/>
  <rect x="270" y="50" width="50" height="18" fill="#93c5fd"/><rect x="70" y="200" width="50" height="18" fill="#93c5fd"/></svg>`);
const thumbPng = await thumbPage.screenshot();
await thumbPage.close();

const blob = await realisticWolfson(browser);
const seen = { picks: [], thumbs: new Set() };

async function newCtx(viewport, hebrew = false) {
  const ctx = await browser.newContext({ viewport });
  await applySeed(ctx, blob, { hebrew });
  await ctx.addInitScript(() => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw); if (d.__pf) return; d.__pf = 1;
    for (const a of d.apartments ?? []) if (a.id === 'A1-53') {
      a.plansPdfLink = 'https://drive.google.com/file/d/P1/view';
      a.driveLink = 'https://drive.google.com/drive/folders/JOBFOLDER1';
    }
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  });
  await ctx.route('**/api/**', async r => {
    const u = r.request().url(); const body = JSON.parse(r.request().postData() || '{}');
    if (u.includes('/api/drive-fetch')) { seen.picks.push(`${u} ${JSON.stringify(body)}`); return r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }); }
    if (u.includes('/api/drive-files')) return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(body.metaOnly ? { folder: { id: body.folderId, name: 'folder' } } : { files: TREE[body.folderId] ?? [] }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, files: [] }) });
  });
  await ctx.route('**://drive.google.com/**', r => r.abort());
  await ctx.route('**://drive.google.com/thumbnail**', r => {
    const id = new URL(r.request().url()).searchParams.get('id');
    seen.thumbs.add(id);
    return r.fulfill({ status: 200, contentType: 'image/png', body: thumbPng });
  });
  return ctx;
}

async function openFinder(p) {
  await p.goto(`${BASE}/project`); await p.waitForTimeout(2500);
  await p.locator('[data-view-switch] [data-view="board"]').first().click().catch(() => {}); await p.waitForTimeout(800);
  await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(3500);
  await openButton(p);
}
// The plan pane's Plans button; on a phone it lives in the ⋯ sheet.
async function openButton(p) {
  const btn = p.locator('[data-open-plans]').first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
  else {
    await p.locator('[data-plan-more]').first().click().catch(() => {});
    await p.waitForTimeout(500);
    await p.evaluate(() => { [...document.querySelectorAll('button')].find(b => /^Plans/.test(b.textContent?.trim() ?? '') && /drawings/.test(b.textContent ?? ''))?.click(); });
  }
  await p.waitForTimeout(400);
}
const rows = p => p.evaluate(() => [...document.querySelectorAll('[data-plan-picker] [data-plan-row]')].map(r => r.getAttribute('data-plan-row')));
const noSideways = p => p.evaluate(() => {
  const se = document.scrollingElement;
  const fin = document.querySelector('[data-plan-picker]');
  const over = [...(fin?.querySelectorAll('*') ?? [])].filter(e => {
    const r = e.getBoundingClientRect();
    return r.width && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('.no-bar');
  }).map(e => e.tagName + '.' + (e.className?.baseVal ?? e.className).toString().slice(0, 40));
  return { page: se.scrollWidth <= innerWidth, over };
});

// ── A COMPUTER ───────────────────────────────────────────────────────────
{
  const ctx = await newCtx({ width: 1440, height: 900 });
  const p = await ctx.newPage();
  await openFinder(p);
  check(await p.locator('[data-plan-finder]').count() === 1, 'the Plan Finder opens off the plan pane\'s button');
  check(await p.evaluate(() => document.activeElement?.hasAttribute('data-finder-search')), 'the search box has the cursor on open');
  const box = await p.locator('[data-plan-finder]').boundingBox();
  check(box && box.width >= 880 && box.height >= 600, 'a bigger window', `${Math.round(box?.width)}×${Math.round(box?.height)}`);
  check(await p.locator('[data-finder-folders]').isVisible(), 'the folders stand down the side');
  await p.waitForTimeout(2500);
  // Recording 2026-11-11 094048 (re-encoded): subfolders are collapsed; a folder with folders wears an arrow.
  const closed = await p.evaluate(() => [...document.querySelectorAll('[data-folder-row]')].map(b => b.getAttribute('data-folder-row')));
  check(JSON.stringify(closed) === JSON.stringify(['EP', 'AR', 'PH', 'PR', 'APR']), 'the side list opens with its subfolders collapsed', JSON.stringify(closed));
  check(await p.locator('[data-folder-toggle]').count() === 2, 'a folder that has folders wears an arrow');
  await p.locator('[data-folder-toggle="EP"]').click(); await p.locator('[data-folder-toggle="PH"]').click(); await p.waitForTimeout(300);
  check(await p.locator('[data-folder-row="EP"][data-folder-open="1"]').count() === 1, 'opening the arrow does not change the folder on screen');
  const fold = await p.evaluate(() => [...document.querySelectorAll('[data-folder-row]')].map(b => ({
    id: b.getAttribute('data-folder-row'), sub: b.getAttribute('data-folder-sub') === '1',
    n: b.querySelector('[data-folder-count]')?.textContent, open: b.getAttribute('data-folder-open') === '1',
    left: Math.round(b.querySelector('svg.lucide-folder').getBoundingClientRect().left) })));
  const ids = fold.map(f => f.id);
  check(JSON.stringify(ids) === JSON.stringify(['EP', 'AP', 'AR', 'PH', 'BEF', 'PR', 'APR']), 'every folder, each subfolder under its parent', JSON.stringify(ids));
  const ep = fold.find(f => f.id === 'EP'), ap = fold.find(f => f.id === 'AP');
  check(ap?.sub && ap.left > ep.left + 8, 'subfolders indented');
  check(ep?.open, 'the plans folder is the open one, lit');
  check(ep?.n === '8' && ap?.n === '2' && fold.find(f => f.id === 'PH')?.n === '1', 'with file counts', JSON.stringify(fold.map(f => `${f.id}:${f.n}`)));
  await p.screenshot({ path: `${OUT}/pf-1-open.png` });

  // The cards
  const view = await rows(p);
  const want = ['A1', 'P1', 'P2', 'A2', 'X1', 'H1', 'P3', 'D1', 'W1'];
  check(JSON.stringify(view) === JSON.stringify(want), 'newest first, the marked-up versions as their own cards, every file shown', JSON.stringify(view));
  check(!view.includes('P4'), 'the converted PDF is its DWG\'s card, not a second one');
  const card = id => p.evaluate(id => {
    const c = document.querySelector(`[data-plan-picker] [data-plan-row="${id}"]`);
    if (!c) return null;
    const name = c.querySelector('[data-card-name]');
    const img = c.querySelector('img[data-card-thumb]');
    return {
      title: c.getAttribute('title'),
      cardLeft: c.getBoundingClientRect().left,
      nameLeft: (() => { if (!name) return 0; const r = document.createRange(); r.selectNodeContents(name); return r.getBoundingClientRect().left; })(),
      name: name?.textContent, clipped: name ? name.scrollHeight > name.clientHeight + 2 : null,
      date: c.querySelector('[data-card-date]')?.textContent, badge: c.querySelector('[data-card-badge]')?.getAttribute('data-card-badge'),
      badgeColour: c.querySelector('[data-card-badge]') ? getComputedStyle(c.querySelector('[data-card-badge]')).color : '',
      thumb: img ? { src: img.getAttribute('src'), ok: img.complete && img.naturalWidth > 0 } : null,
      chip: c.querySelector('[data-annot-chip]')?.textContent, greyed: c.getAttribute('data-greyed') === '1',
      converted: !!c.querySelector('[data-card-converted]'), current: c.getAttribute('data-current') === '1',
      border: getComputedStyle(c).borderColor, star: c.querySelector('[data-tile-star]')?.getAttribute('data-starred'),
    };
  }, id);
  await p.waitForTimeout(800);
  const c1 = await card('P1');
  check(c1.thumb?.ok && /thumbnail\?id=P1&sz=w400/.test(c1.thumb.src), 'a card shows the file\'s own picture (w400)', c1.thumb?.src);
  check(c1.name === 'Levi - ground floor AC plan' && !c1.clipped && c1.title === 'Levi - ground floor AC plan.pdf',
    'the full name (the badge says the type; the whole file name on hover)', `${c1.name} / ${c1.title}`);
  check(c1.date === '2d ago', 'how long ago it changed', c1.date);
  check(c1.badge === 'PDF' && /rgb\(220, 38, 38\)/.test(c1.badgeColour), 'a red PDF badge', c1.badgeColour);
  check(c1.current && /74, 168, 216/.test(c1.border), 'the plan on screen wears the blue border', c1.border);
  check(c1.star === '1', 'and the job\'s star');
  const longName = await card('A1');
  check(longName.name === 'Levi - ground floor AC plan — annotated version 3.0' && !longName.clipped, 'a long name stays whole on two lines');
  check(longName.chip === 'Marked up · v3', 'a marked-up version wears "Marked up · v3"', longName.chip);
  check((await card('A2')).chip === 'Marked up · v2', 'and v2 its own');
  const ann = await p.evaluate(() => getComputedStyle(document.querySelector('[data-plan-row="A1"] [data-annot-chip]')).backgroundColor);
  check(/237, 233, 254/.test(ann), 'the chip is violet', ann);
  await p.locator('[data-plan-row="D1"]').scrollIntoViewIfNeeded(); await p.waitForTimeout(700);
  const d1 = await card('D1');
  check(d1.badge === 'DWG' && /29, 78, 216/.test(d1.badgeColour) && d1.converted && /id=P4/.test(d1.thumb?.src ?? '') && !d1.greyed,
    'a DWG: blue badge, "converted ✓", its converted PDF\'s picture', JSON.stringify(d1));
  const x1 = await card('X1');
  check(x1.greyed && x1.badge === 'XLSX' && !x1.thumb && x1.star == null, 'an Excel file is greyed out with its type, no star', JSON.stringify(x1));
  check((await card('W1')).greyed && (await card('W1')).badge === 'DOCX', 'a Word file too');
  const h1 = await card('H1');
  check(h1.name === 'תכנית קומת קרקע' && h1.nameLeft - h1.cardLeft < 16, 'a Hebrew name as it is, at the card\'s start in an English window', JSON.stringify(h1));
  check(seen.thumbs.has('P1') && !seen.thumbs.has('X1'), 'pictures asked only for what has one');

  // Greyed cannot be picked
  const picksBefore = seen.picks.length;
  await p.locator('[data-plan-row="X1"]').click({ force: true }); await p.waitForTimeout(500);
  check(await p.locator('[data-plan-finder]').count() === 1 && seen.picks.length === picksBefore, 'pressing a greyed file does nothing');

  // Chips
  const chips = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-finder-filter]')].map(b => [b.getAttribute('data-finder-filter'), +b.getAttribute('data-count')])));
  check(chips.all === 9 && chips.pdf === 6 && chips.dwg === 1 && chips.annot === 2 && !('img' in chips),
    'filter chips with counts (no empty Pictures chip here)', JSON.stringify(chips));
  await p.locator('[data-finder-filter="dwg"]').click(); await p.waitForTimeout(200);
  check(JSON.stringify(await rows(p)) === '["D1"]', 'Drawings (DWG) shows the drawing alone');
  await p.locator('[data-finder-filter="annot"]').click(); await p.waitForTimeout(200);
  check(JSON.stringify(await rows(p)) === '["A1","A2"]', 'Marked up shows the versions');
  await p.locator('[data-finder-filter="all"]').click();
  await p.locator('[data-finder-sort]').click(); await p.waitForTimeout(200);
  const az = await rows(p);
  check(az[0] === 'P2' && az[az.length - 1] === 'H1', 'A–Z is the other order', JSON.stringify(az));
  await p.locator('[data-finder-sort]').click();

  // Search
  await p.locator('[data-finder-search]').fill('grund flor'); await p.waitForTimeout(400);
  const hits = await rows(p);
  check(hits[0] === 'P1' && [...hits].sort().join() === 'A1,A2,K1,P1', '"grund flor" finds the ground-floor plans across folders, the plan first', JSON.stringify(hits));
  check(!hits.includes('P2') && !hits.includes('R1'), 'and nothing else', JSON.stringify(hits));
  const k1 = await p.evaluate(() => {
    const c = document.querySelector('[data-plan-row="K1"]');
    return { folder: c.querySelector('[data-card-folder]')?.textContent, marks: [...c.querySelectorAll('mark')].map(m => m.textContent) };
  });
  check(k1.folder === 'Approvals', 'a found card says the folder it lives in', k1.folder);
  check(JSON.stringify(k1.marks) === '["ground","floor"]', 'the matching words are lit', JSON.stringify(k1.marks));
  const a1f = await p.evaluate(() => document.querySelector('[data-plan-row="A1"] [data-card-folder]')?.textContent);
  check(a1f === 'Engineered Plans › Annotated Plans', 'a marked-up one says where too', a1f);
  check(await p.locator('[data-plan-picker] img[data-card-thumb]').count() >= 3, 'still cards with pictures while searching');
  await p.screenshot({ path: `${OUT}/pf-2-search.png` });

  const wrong = swapLayout ? swapLayout('roof units', 'he') : 'רםםכ וממןאד';
  await p.locator('[data-finder-search]').fill(wrong); await p.waitForTimeout(300);
  check((await rows(p))[0] === 'P3', `the wrong keyboard layout ("${wrong}") finds the roof plan`, JSON.stringify(await rows(p)));
  await p.locator('[data-finder-search]').fill(swapLayout ? swapLayout('קרקע', 'en') : 'ereg'); await p.waitForTimeout(300);
  check((await rows(p))[0] === 'H1', 'and the other way round finds the Hebrew plan', JSON.stringify(await rows(p)));
  await p.locator('[data-finder-search]').fill('zzq'); await p.waitForTimeout(300);
  check((await rows(p)).length === 0 && await p.locator('[data-finder-empty]').count() === 1, 'junk finds nothing and says so');

  // Keyboard
  await p.locator('[data-finder-search]').fill('architect'); await p.waitForTimeout(300);
  check(await p.locator('[data-plan-row="R1"][data-selected="1"]').count() === 1, 'the first hit is ready for Enter (newest first among equals)');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100);
  check(await p.locator('[data-plan-row="R2"][data-selected="1"]').count() === 1, 'an arrow moves to the next card');
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(100);
  // Enter opens the first — R1 lives in ANOTHER folder. The finder asks its
  // host to stay up (stayOpen, as the old chooser did), but the plan pane
  // re-mounts its editor on the new sheet (key = tab:file), which takes the
  // finder down with it — exactly what the old chooser did too.
  const before = seen.picks.length;
  await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  check(await p.locator('[data-finder-preview="R1"]').count() === 1 && await p.locator('[data-plan-finder]').count() === 1 && before >= 0, 'Enter LOOKS at the first hit full screen — it is not opened in the pane yet');
  check(await p.locator('[data-preview-star]').count() === 1 && await p.locator('[data-preview-open]').count() === 1, 'the preview has Star and Open on top');
  await p.screenshot({ path: `${OUT}/pf-6-preview.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check(await p.locator('[data-finder-preview]').count() === 0 && await p.locator('[data-plan-finder]').count() === 1, 'Escape closes the preview and leaves the finder up');
  await p.keyboard.press('Enter'); await p.waitForTimeout(800);
  await p.locator('[data-preview-open]').click(); await p.waitForTimeout(1500);
  check(seen.picks.some(u => u.includes('R1')), 'Open opens it, from another folder', seen.picks.slice(-2).join(' '));
  // Back in: the Architect folder is a press away, newest first.
  await openButton(p);
  await p.waitForTimeout(1200);
  await p.locator('[data-folder-row="AR"]').click(); await p.waitForTimeout(500);
  check(await p.locator('[data-folder-row="AR"][data-folder-open="1"]').count() === 1, 'a folder on the side opens with one press');
  check(await p.locator('[data-plan-row="R1"][data-current="1"]').count() === 1, 'the plan now on screen wears the blue border');
  const ar = await rows(p);
  check(JSON.stringify(ar) === '["R1","J1","R2"]', 'the Architect folder newest first, the picture among them', JSON.stringify(ar));
  // A card in the folder on screen opens and closes the finder.
  // the path and Back, like Windows Explorer
  const path = await p.locator('[data-finder-crumb]').allTextContents();
  check(path.length === 2 && path[1] === 'Architect', `the bar shows the path (${path.join(' › ')})`);
  check(await p.locator('[data-finder-back]').isEnabled(), 'Back is lit after stepping into a folder');
  await p.locator('[data-finder-back]').click(); await p.waitForTimeout(400);
  check(await p.locator('[data-folder-row="EP"][data-folder-open="1"]').count() === 1, 'Back goes one step back, to the folder we were in');
  // the folders of a folder stand as cards
  await p.locator('[data-folder-row="PH"]').click(); await p.waitForTimeout(500);
  check(await p.locator('[data-folder-card="BEF"]').count() === 1 && await p.locator('[data-finder-empty]').count() === 0, 'a folder that has folders shows them as cards');
  await p.locator('[data-folder-card="BEF"]').click(); await p.waitForTimeout(600);
  const deep = await p.locator('[data-finder-crumb]').allTextContents();
  check(deep.join('>') .endsWith('Photos>Before works'), `a folder card steps in, and the path follows (${deep.join(' › ')})`);
  await p.locator('[data-finder-crumb]').nth(deep.length - 2).click(); await p.waitForTimeout(400);
  check(await p.locator('[data-folder-row="PH"][data-folder-open="1"]').count() === 1, 'a press on the path goes to that folder');
  await p.locator('[data-folder-row="AR"]').click(); await p.waitForTimeout(500);
  // A card: look first, then Open opens it and closes the finder.
  await p.locator('[data-plan-row="R2"]').click(); await p.waitForTimeout(900);
  check(await p.locator('[data-finder-preview="R2"]').count() === 1 && await p.locator('[data-plan-finder]').count() === 1, 'a press on a card looks at it first');
  await p.locator('[data-preview-back]').click(); await p.waitForTimeout(300);
  await p.locator('[data-plan-row="R2"] [data-tile-preview]').click({ force: true }); await p.waitForTimeout(900);
  check(await p.locator('[data-finder-preview="R2"]').count() === 1, 'the expand arrow opens the same preview');
  await p.locator('[data-preview-open]').click(); await p.waitForTimeout(1200);
  check(await p.locator('[data-plan-finder]').count() === 0 && seen.picks.some(u => u.includes('R2')), 'Open opens it and closes the finder');

  // Opened recently
  await openButton(p);
  await p.waitForTimeout(800);
  const rec = await p.evaluate(() => [...document.querySelectorAll('[data-finder-recent]')].map(b => b.getAttribute('data-finder-recent')));
  check(rec[0] === 'R2' && rec.includes('R1'), 'Opened recently lists the last ones opened here', JSON.stringify(rec));
  await p.screenshot({ path: `${OUT}/pf-3-recent.png` });
  // Escape closes
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check(await p.locator('[data-plan-finder]').count() === 0, 'Escape closes');
  await ctx.close();
}

// ── HEBREW ───────────────────────────────────────────────────────────────
{
  const ctx = await newCtx({ width: 1440, height: 900 }, true);
  const p = await ctx.newPage();
  await openFinder(p);
  await p.waitForTimeout(2000);
  const he = await p.evaluate(() => ({
    dir: document.querySelector('[data-plan-finder]')?.getAttribute('dir'),
    ph: document.querySelector('[data-finder-search]')?.getAttribute('placeholder'),
    chip: document.querySelector('[data-plan-row="A1"] [data-annot-chip]')?.textContent,
  }));
  check(he.dir === 'rtl' && /חיפוש/.test(he.ph ?? '') && /v3/.test(he.chip ?? ''), 'in Hebrew: right to left, Hebrew words', JSON.stringify(he));
  const ns = await noSideways(p);
  check(ns.page && ns.over.length === 0, 'Hebrew: nothing past the screen', JSON.stringify(ns.over.slice(0, 5)));
  await p.screenshot({ path: `${OUT}/pf-5-hebrew.png` });
  await ctx.close();
}

// ── A PHONE ──────────────────────────────────────────────────────────────
{
  // The phone's board is a list without the desk's apartment cells, so the
  // job window is opened at desk width and the screen then becomes a phone's
  // before the finder opens (its layout follows the width live).
  const ctx = await newCtx({ width: 1440, height: 900 });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/project`); await p.waitForTimeout(2500);
  await p.locator('[data-view-switch] [data-view="board"]').first().click().catch(() => {}); await p.waitForTimeout(800);
  await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(3500);
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(1200);
  // On a phone the job window opens on Details; the plan is its own tab.
  await p.locator('button:visible', { hasText: /^Plan$/ }).first().click().catch(() => {});
  await p.waitForTimeout(3000);
  await openButton(p);
  await p.waitForTimeout(2500);
  if (!(await p.locator('[data-plan-finder]').count())) {
    await p.screenshot({ path: `${OUT}/pf-4-phone-nofinder.png` });
    console.log('phone buttons:', await p.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent)
      .map(b => `${(b.textContent || '').trim().slice(0, 20)}[${b.title}]`).join(' | ').slice(0, 1500)));
  }
  const box = await p.locator('[data-plan-finder]').boundingBox();
  check(box && box.x === 0 && box.y === 0 && box.width === 390 && box.height === 844, 'full screen on a phone', JSON.stringify(box));
  check(await p.locator('[data-finder-folders]').count() === 0 && await p.locator('[data-folder-select]').isVisible(), 'the folders are one dropdown above the cards');
  const cols = await p.evaluate(() => getComputedStyle(document.querySelector('[data-plan-picker] [data-tile-grid]')).gridTemplateColumns.split(' ').length);
  check(cols === 2, 'two cards across', String(cols));
  const ns = await noSideways(p);
  check(ns.page && ns.over.length === 0, 'nothing scrolls sideways', JSON.stringify(ns.over.slice(0, 5)));
  await p.screenshot({ path: `${OUT}/pf-4-phone.png` });
  await p.locator('[data-folder-select]').selectOption('AR'); await p.waitForTimeout(600);
  check(JSON.stringify(await rows(p)) === '["R1","J1","R2"]', 'the dropdown opens another folder', JSON.stringify(await rows(p)));
  await p.locator('[data-finder-search]').fill('grund flor'); await p.waitForTimeout(400);
  const ns2 = await noSideways(p);
  check((await rows(p)).includes('P1') && ns2.page && ns2.over.length === 0, 'search on a phone, still nothing sideways', JSON.stringify(ns2.over.slice(0, 5)));
  await p.screenshot({ path: `${OUT}/pf-4-phone-search.png` });
  await ctx.close();
}

console.log(fails ? `\n${fails} of ${n} FAILED` : `\nALL ${n} PASS`);
await browser.close();
process.exit(fails ? 1 : 0);
