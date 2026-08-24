// The seven-item round (owner, 2026-08-24 after first real use):
//  1. a job found in SEARCH drags onto a notebook square
//  2. and onto the open board — where it leaves its group
//  3. the search crosshair follows a job INTO its group window
//  4. the notebook card: whole name on top, its tasks one per row inside,
//     counters/links bottom-right, no separate dashed chip for a carded job
//  5. board setting: the wheel scrolls instead of zooming
//  6. zoom-out frames the WORK below the floating chrome while the PAPER
//     still runs up to the top bar (the bleed)
//  7. a section box with a stored NEGATIVE z (pre-floor send-to-back) is
//     clickable again
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; console.log(`FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
};

// addInitScript SERIALIZES the function — a closure loses its captured
// variables silently, and the seed never runs. The patch travels as the ARG.
function seedFn(patch) {
  {
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('whats_new_seen', '2026-09-12');
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser: { id: 'U-test', name: 'Architect Avi', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
      apartments: [
        { id: 'G-free', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Perlstein',
          classification: 'standard', isUnnamed: false, generalNotes: '', canvasX: 320, canvasY: 320,
          createdAt: '2026-08-01', updatedAt: '2026-08-01' },
        { id: 'G-grp', buildingId: 'G', apartmentNumber: '', floor: 0, displayName: 'Katzenstein',
          classification: 'standard', isUnnamed: false, generalNotes: '', canvasX: 560, canvasY: 320,
          boardBin: 'done', binnedAt: '2026-08-10', createdAt: '2026-08-01', updatedAt: '2026-08-01' },
      ],
      contractors: [{ id: 'C-1', name: 'Moshe', category: 'ac', token: 'tok1', active: true, createdAt: '2026-01-01' }],
      contractorAssignments: [
        { id: 'A-1', contractorId: 'C-1', apartmentId: 'G-free', taskDescription: 'Hang the indoor units',
          stageId: null, dueDate: '2026-08-25', completed: false, createdAt: '2026-08-01' },
        { id: 'A-2', contractorId: 'C-1', apartmentId: 'G-free', taskDescription: 'Run the drain line',
          stageId: null, dueDate: '2026-08-26', completed: false, createdAt: '2026-08-01' },
      ],
      stages: [],
      canvasElements: [
        { id: 'CE-bin-done', type: 'bin', binKind: 'done', x: 2100, y: 60, w: 170, h: 110, text: '', color: '#16a34a', addedAt: '2026-08-01' },
        { id: 'CE-book', type: 'widget', widget: 'rota', x: 60, y: 560, w: 780, h: 320, text: '', color: '#ffffff',
          addedAt: '2026-08-01',
          data: { people: ['n:Moshe', 'n:Dovid'], firstWeek: '2026-08-23', weekCount: 1, span: 5, cells: {} } },
        { id: 'CE-negbox', type: 'box', x: 900, y: 320, w: 320, h: 200, z: -1, text: 'Stuck section', color: '#fdba74', addedAt: '2026-08-01' },
      ],
      ...patch,
    }));
  }
}

async function boot(patch = {}) {
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript(seedFn, patch);
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/jobs');
  await page.waitForTimeout(2600);
  return { ctx, page };
}

const readData = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));
const flush = (page) => page.waitForTimeout(700);   // persist is debounced 250ms

// ═══ Context A: negative box, zoom-out/bleed, wheel default, crosshair, search drags ═══
{
  const { ctx, page } = await boot();

  // 7 · the negative-z section
  const neg = await page.evaluate(() => {
    const n = document.querySelector('[data-node-id="CE-negbox"]');
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { z: getComputedStyle(n).zIndex, over: document.elementFromPoint(r.left + 30, r.top + r.height - 30)
      ?.closest('[data-node-id]')?.getAttribute('data-node-id') ?? null };
  });
  ok(neg && Number(neg.z) >= 0, `a stored z:-1 box renders at z ${neg?.z} (not behind the world)`);
  ok(neg?.over === 'CE-negbox', 'and takes the click on its body');

  // 6 · zoom out to the floor: work below the chrome, paper up to the top
  for (let i = 0; i < 10; i++) { await page.locator('button[title="Zoom out"]').click(); await page.waitForTimeout(120); }
  await page.waitForTimeout(400);
  const frame = await page.evaluate(() => {
    const vp = document.querySelector('[data-board-viewport]').getBoundingClientRect();
    const world = document.querySelector('[data-board-world]').getBoundingClientRect();
    const paper = document.querySelector('[data-board-paper]').getBoundingClientRect();
    const hb = [...document.querySelectorAll('div')].find(d =>
      d.className?.includes?.('absolute') && d.querySelector?.('button[title="Zoom out"]'));
    return { vpTop: vp.top, worldTop: world.top, paperTop: paper.top,
             chromeBottom: hb ? hb.getBoundingClientRect().bottom : vp.top };
  });
  ok(frame.worldTop >= frame.chromeBottom - 4,
    `zoomed out, the WORK sits below the floating buttons (world ${Math.round(frame.worldTop)} vs chrome ${Math.round(frame.chromeBottom)})`);
  ok(frame.paperTop <= frame.vpTop + 3,
    `while the PAPER runs up to the top bar (paper ${Math.round(frame.paperTop)} vs viewport ${Math.round(frame.vpTop)})`);
  await page.locator('button', { hasText: /^100%$/ }).first().click();
  await page.waitForTimeout(400);

  // 5 · wheel zooms by default
  const zoomOf = () => page.evaluate(() => {
    const m = /scale\(([\d.]+)\)/.exec(document.querySelector('[data-board-world]').parentElement.style.transform);
    return m ? +m[1] : 1;
  });
  const z0 = await zoomOf();
  await page.mouse.move(700, 480);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(300);
  const z1 = await zoomOf();
  ok(z1 !== z0, `with the setting off the wheel zooms (${z0} → ${z1})`);

  // 3 · the crosshair follows a grouped job into its group window
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
  await page.keyboard.type('Katzenstein');
  await page.waitForTimeout(600);
  const cross = page.locator('button[title="Show it on the board"]').first();
  ok(await cross.count() > 0, 'the search offers the crosshair on the grouped job');
  await cross.click();
  await page.waitForTimeout(900);
  const inWindow = await page.evaluate(() =>
    !!document.querySelector('.bin-window-in [data-node-id="G-grp"]'));
  ok(inWindow, 'pressing it opens the group window WITH that job in view');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // 1 · drag a searched job onto a notebook square
  const cell = await page.evaluate(() => {
    // Second row (Dovid), second day — any empty square inside the notebook.
    const book = document.querySelector('[data-node-id="CE-book"]');
    const r = book.getBoundingClientRect();
    return { x: r.left + r.width * 0.45, y: r.top + r.height * 0.55 };
  });
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
  await page.keyboard.type('Perlstein');
  await page.waitForTimeout(600);
  const row = page.locator('div[role="button"]', { hasText: 'Perlstein' }).first();
  const rb = await row.boundingBox();
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cell.x, cell.y, { steps: 14 });
  await page.mouse.up();
  await flush(page);
  const afterPlan = await readData(page);
  const cells = afterPlan.canvasElements.find(e => e.id === 'CE-book')?.data?.cells ?? {};
  const planned = Object.values(cells).flat().some(e => e.jobId === 'G-free');
  ok(planned, 'dragging a search result onto a notebook square plans the job',
    JSON.stringify(Object.keys(cells)));

  // 4 · the card: whole name, tasks one per row, links bottom-right
  const card = await page.evaluate(() => {
    const c = document.querySelector('.planner-card');
    if (!c) return null;
    return { text: c.innerText, hasEllipsisName: /Perlst…|Perlste…/.test(c.innerText) };
  });
  ok(card && card.text.includes('Perlstein') && !card.hasEllipsisName, 'the card shows the whole name');
  ok(card && card.text.includes('Hang the indoor units') && card.text.includes('Run the drain line'),
    'and lists the job\'s tasks one per row inside the card', card?.text?.slice(0, 120));

  // 2 · drag the GROUPED job from search onto the open board — it leaves the group
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
  await page.keyboard.type('Katzenstein');
  await page.waitForTimeout(600);
  const row2 = page.locator('div[role="button"]', { hasText: 'Katzenstein' }).first();
  const rb2 = await row2.boundingBox();
  await page.mouse.move(rb2.x + rb2.width / 2, rb2.y + rb2.height / 2);
  await page.mouse.down();
  await page.mouse.move(1150, 430, { steps: 14 });   // empty board, clear of nodes
  await page.mouse.up();
  await flush(page);
  const afterBoard = await readData(page);
  const grp = afterBoard.apartments.find(a => a.id === 'G-grp');
  ok(grp && !grp.boardBin, 'dragging a grouped job from search onto the board takes it OUT of the group',
    JSON.stringify({ boardBin: grp?.boardBin }));
  ok(typeof grp?.canvasX === 'number' && grp.canvasX > 600,
    'and lands it where the hand let go', JSON.stringify({ x: grp?.canvasX, y: grp?.canvasY }));

  await ctx.close();
}

// ═══ Context B: the wheel-scrolls setting ═══
{
  const { ctx, page } = await boot({
    boardSettings: { general: { wheelScrolls: true } },
  });
  const state = () => page.evaluate(() => {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/
      .exec(document.querySelector('[data-board-world]').parentElement.style.transform);
    return { x: +m[1], y: +m[2], z: +m[3] };
  });
  const s0 = await state();
  await page.mouse.move(700, 480);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(300);
  const s1 = await state();
  ok(s1.z === s0.z, `with the setting ON the wheel does not zoom (${s0.z} → ${s1.z})`);
  ok(s1.y < s0.y, `it scrolls the board down instead (y ${Math.round(s0.y)} → ${Math.round(s1.y)})`);
  await ctx.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
