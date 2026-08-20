// The four items, checked one by one against the running app.
//
// Written because the owner reported none of them as done. The point is not to
// re-run the harnesses that already pass — it is to check the specific claims
// none of them covered: the drag-off question, a move that leaves a duplicate,
// Duplicate producing a live mirror, the wall staying read-only under the pen,
// and the reel's autoplay and crop.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

function seed(ctx, extraEls = [], extraJobs = []) {
  return ctx.addInitScript(([els, jobs]) => {
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    localStorage.setItem('board_default_zoom_general', '1');
    if (localStorage.getItem('general_app_data')) return;
    const job = (i, extra) => ({
      id: `G-a${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
      displayName: `Audit job ${i}`, address: 'Somewhere 1',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 200, canvasY: 260 + i * 150,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
      ...extra,
    });
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
      stages: [],
      apartments: [job(0, { inNotebook: 'CE-book' }), job(1, { inNotebook: 'CE-book' })].concat(jobs),
      canvasElements: [
        { id: 'CE-book', type: 'widget', widget: 'rota',
          x: 560, y: 60, w: 900, h: 380, text: '', color: '#ffffff',
          data: {
            people: ['n:Moshe', 'n:Dovid'], firstWeek: '2026-08-16', weekCount: 1, span: 5,
            cells: {
              'n:Moshe|2026-08-17': [{ id: 'e-a', jobId: 'G-a0' }],
              'n:Moshe|2026-08-18': [{ id: 'e-b', jobId: 'G-a1' }],
            },
          } },
      ].concat(els),
    }));
  }, [extraEls, extraJobs]);
}

const store = page => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  const els = d.canvasElements ?? [];
  const books = els.filter(e => e.widget === 'rota');
  const cellsOf = e => {
    const o = {};
    for (const [k, v] of Object.entries(e?.data?.cells ?? {})) o[k] = (v ?? []).map(x => x.jobId ?? '"note"');
    return o;
  };
  return {
    books: books.map(e => ({ id: e.id, role: e.data?.role ?? 'main', cells: cellsOf(e) })),
    squares: books.length ? Object.values(cellsOf(books[0])).flat().length : 0,
    flags: Object.fromEntries((d.apartments ?? []).map(a => [a.id, a.inNotebook ?? null])),
  };
});

// ══ 1d · Dragging a card off the notebook asks the same question ═══════
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
  await seed(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/jobs`);
  await page.waitForTimeout(3600);

  const card = await page.evaluate(() => {
    const c = document.querySelector('[data-node-id="CE-book"] .planner-card');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  check(!!card, '1d · there is a card on the notebook');
  if (card) {
    // Drag it well clear of the notebook and let go.
    await page.mouse.move(card.x, card.y);
    await page.mouse.down();
    await page.mouse.move(card.x - 300, card.y + 320, { steps: 16 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const q = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].map(x => (x.textContent ?? '').replace(/\s+/g, ' ').trim());
      return {
        off: btns.some(t => /take it off the notebook/i.test(t)),
        stay: btns.some(t => /leave it where it was/i.test(t)),
      };
    });
    check(q.off && q.stay, '1d · dragging a card off asks the SAME question the X asks', JSON.stringify(q));
  }
  await ctx.close();
}

// ══ 1f · "Move it here" must MOVE, never leave a duplicate ═════════════
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
  await seed(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/jobs`);
  await page.waitForTimeout(3600);

  const before = await store(page);
  check(before.squares === 2, '1f · two cards to begin with', String(before.squares));

  // Drag Moshe's Monday card onto Dovid's Wednesday square.
  // A cell is tracked by a REF keyed `person|day`, not by a DOM attribute, so
  // it has to be found by its class. `group/cell` is a literal class name.
  const pts = await page.evaluate(() => {
    const w = document.querySelector('[data-node-id="CE-book"]');
    const card = w.querySelector('.planner-card');
    const a = card.getBoundingClientRect();
    const cells = [...w.querySelectorAll('[class*="group/cell"]')]
      .filter(c => !c.querySelector('.planner-card'));     // land on an EMPTY square
    if (!cells.length) return null;
    const t = cells[Math.floor(cells.length / 2)].getBoundingClientRect();
    return { fx: a.x + a.width / 2, fy: a.y + a.height / 2,
             tx: t.x + t.width / 2, ty: t.y + t.height / 2 };
  });
  if (!pts) { check(false, '1f · found an empty square to drop on'); }
  else {
  await page.mouse.move(pts.fx, pts.fy);
  await page.mouse.down();
  await page.mouse.move(pts.tx, pts.ty, { steps: 18 });
  await page.mouse.up();
  await page.waitForTimeout(700);

  const asked = await page.evaluate(() => [...document.querySelectorAll('button')]
    .some(x => /move it here/i.test(x.textContent ?? '')));
  check(asked, '1f · dropping on another square asks move / copy / take off');
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find(x => /move it here/i.test(x.textContent ?? ''))?.click());
  await page.waitForTimeout(800);

  const after = await store(page);
  console.log('       cells:', JSON.stringify(after.books[0]?.cells));
  check(after.squares === before.squares,
    '1f · "move it here" MOVES — the count is unchanged, no duplicate left behind',
    `${before.squares} → ${after.squares}`);
  }
  await ctx.close();
}

// ══ 1g · Duplicate makes a live mirror, not an independent notebook ════
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
  await seed(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/jobs`);
  await page.waitForTimeout(3600);

  // Right-click the notebook's own frame, well clear of its cards.
  const at = await page.evaluate(() => {
    const n = document.querySelector('[data-node-id="CE-book"]');
    const r = n.getBoundingClientRect();
    return { x: r.x + 8, y: r.y + r.height - 8 };
  });
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.waitForTimeout(400);
  const dup = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(x => /^duplicate/i.test((x.textContent ?? '').trim()));
    if (!btn) return false;
    btn.click();
    return true;
  });
  check(dup, '1g · the notebook has a Duplicate in its menu');
  await page.waitForTimeout(800);

  const st = await store(page);
  console.log('       notebooks:', JSON.stringify(st.books.map(x => ({ id: x.id, role: x.role }))));
  check(st.books.length === 2, '1g · there are now two notebooks', String(st.books.length));
  const proj = st.books.filter(x => x.role === 'projection');
  check(proj.length === 1, '1g · the copy is a PROJECTION, not an independent second notebook',
    JSON.stringify(st.books.map(x => x.role)));

  // A live mirror shows the main one's cards, not its own.
  const drawn = await page.evaluate(() => {
    const books = [...document.querySelectorAll('[data-node-id^="CE-"]')]
      .filter(n => n.querySelector('.planner-card') || /rota/.test(n.dataset.widget ?? ''));
    return books.map(n => n.querySelectorAll('.planner-card').length);
  });
  console.log('       cards drawn per notebook:', JSON.stringify(drawn));
  check(drawn.length >= 2 && drawn[0] === drawn[1] && drawn[0] > 0,
    '1g · the copy draws the SAME cards as the original', JSON.stringify(drawn));
  await ctx.close();
}

// ══ 1h · The wall stays read-only even with its pen on ═════════════════
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
  await seed(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/tv`);
  await page.waitForTimeout(4200);

  const before = await page.evaluate(() => ({
    cards: document.querySelectorAll('.planner-card').length,
    xs: document.querySelectorAll('.planner-card [data-card-action]').length,
  }));
  console.log('       wall, pen off:', JSON.stringify(before));
  check(before.cards > 0, '1h · the wall draws the notebook', JSON.stringify(before));
  check(before.xs === 0, '1h · no card has an X on the wall', String(before.xs));

  // Turn the wall's pen on — it unlocks the wall's own furniture.
  const pen = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(x => /pen|edit|unlock/i.test(x.getAttribute('title') ?? ''));
    if (!btn) return null;
    btn.click();
    return btn.getAttribute('title');
  });
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({
    xs: document.querySelectorAll('.planner-card [data-card-action]').length,
  }));
  console.log('       wall, pen', pen ? `"${pen}"` : 'not found', JSON.stringify(after));
  check(after.xs === 0,
    '1h · the notebook stays read-only on the wall even with the pen on', String(after.xs));
  await ctx.close();
}

// ══ 2 · The reel autoplays and shows only the video ════════════════════
{
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
  // With no link the widget draws its empty state, which is correct and
  // proves nothing about autoplay or the crop — the first version of this
  // check landed there and passed for the wrong reason.
  await seed(ctx, [{
    id: 'CE-reel', type: 'widget', widget: 'tiktok',
    x: 200, y: 60, w: 320, h: 520, text: '', color: '#ffffff',
    data: { links: 'https://www.tiktok.com/@someone/video/6807491984882765062' },
  }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await ctx.route('**://*.tiktok.com/**', r =>
    r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>stub</h1>' }));
  await page.goto(`${APP}/jobs`);
  await page.waitForTimeout(3600);

  const reel = await page.evaluate(() => {
    const n = document.querySelector('[data-node-id="CE-reel"]');
    if (!n) return null;
    const f = n.querySelector('iframe');
    if (!f) return { noFrame: true, text: (n.textContent ?? '').slice(0, 80) };
    const box = f.parentElement;
    return {
      src: f.getAttribute('src') ?? '',
      scrolling: f.getAttribute('scrolling'),
      clipped: getComputedStyle(box).overflow,
      frameH: Math.round(f.getBoundingClientRect().height),
      boxH: Math.round(box.getBoundingClientRect().height),
    };
  });
  console.log('       reel:', JSON.stringify(reel));
  if (!reel) check(false, '2 · the reel widget is on the board');
  else if (reel.noFrame) {
    check(false, '2 · the reel drew no frame even with a link on it', reel.text);
  } else {
    check(/autoplay=1/.test(reel.src), '2 · a newly placed reel asks for autoplay', reel.src);
    check(reel.scrolling === 'no', '2 · the frame has no scrollbar', String(reel.scrolling));
    check(reel.clipped === 'hidden', '2 · and it is clipped to the video', reel.clipped);
    check(reel.frameH > reel.boxH, '2 · the frame is oversized so the description is cut off',
      `${reel.frameH} vs ${reel.boxH}`);
  }
  await ctx.close();
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
