// Round 15, part one: settings that show what is in use, a search that says
// something, a Show-on-board button, and a name column that fits the names.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'gs1', name: 'AC installation', color: '#0ea5e9', order: 1, active: true,
               projectId: 'general', description: '', createdAt: '', updatedAt: '' }],
    apartments: [
      { id: 'G-w1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Weinstein, Steven',
        address: 'Mekor Chaim 39/6', isUnnamed: false, isDuplexApt: false, classification: 'standard',
        generalNotes: '', currentStageId: 'gs1', stageDates: {}, canvasX: 40, canvasY: 40,
        createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' },
      { id: 'G-w2', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Weinberg, Ruth',
        isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
        currentStageId: 'gs1', stageDates: {}, boardBin: 'done', binnedAt: '2026-01-01',
        canvasX: 40, canvasY: 220,
        createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' },
    ],
    canvasElements: [
      { id: 'CE-note', type: 'note', x: 340, y: 40, w: 165, h: 150, text: 'A note', color: '#fef9c3' },
      { id: 'CE-kpi', type: 'widget', widget: 'kpi', x: 560, y: 40, w: 190, h: 120,
        text: '', color: '#ffffff', data: {} },
      { id: 'CE-book', type: 'widget', widget: 'rota', x: 560, y: 220, w: 820, h: 380,
        text: '', color: '#ffffff',
        data: { people: ['n:Max', 'n:Vlad 1'], firstWeek: '2026-08-16', weekCount: 1, span: 5, cells: {} } },
      // Building Progress, pointed at ANOTHER workspace.
      { id: 'CE-prog', type: 'widget', widget: 'project-mini', x: 60, y: 640, w: 300, h: 220,
        text: '', color: '#ffffff', data: { projectId: 'wolfson' } },
    ],
  }));
  // The other workspace's last snapshot, which is what a cross-workspace card
  // reads — only the open workspace is live.
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    apartments: [
      { id: 'A1-53', buildingId: 'A1', floor: 15, apartmentNumber: '53', displayName: 'Artzi, Avital',
        isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
        currentStageId: null, stageDates: {},
        createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' },
    ],
    buildings: [{ id: 'A1', name: 'A1' }],
    stages: [],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(4000);

// ── 1. Widget settings show the value in USE ──────────────────────────────
async function openSettings(nodeId) {
  const node = await page.$(`[data-node-id="${nodeId}"]`);
  if (!node) return false;
  await node.hover();
  await page.waitForTimeout(300);
  const gear = await page.$(`[data-node-id="${nodeId}"] button[title*="ettings"], [data-node-id="${nodeId}"] button[title*="Settings"]`);
  if (!gear) return false;
  await gear.click({ force: true });
  await page.waitForTimeout(700);
  return true;
}
/**
 * Read the panel by VALUE, not by label.
 *
 * The first version took each control's parent's textContent as its label,
 * which came back as one squashed blob ("NoteA noteText sizeiWeightNo") and
 * matched nothing — so a panel that was filling every field correctly reported
 * four failures. The complaint being tested is "a lot of these are empty", and
 * that is answered by the values themselves.
 */
const readPanel = () => page.evaluate(() => {
  const panel = [...document.querySelectorAll('div')].find(d =>
    d.className.includes('rounded-2xl') && /Text size/.test(d.textContent ?? ''));
  if (!panel) return null;
  return [...panel.querySelectorAll('input, select')].map(el => ({
    tag: el.tagName,
    type: el.getAttribute('type') ?? '',
    ph: el.getAttribute('placeholder') ?? '',
    value: el.value ?? '',
  }));
});

for (const [id, what, wantWeight] of [['CE-note', 'a note', '400'], ['CE-kpi', 'a widget', '400']]) {
  const opened = await openSettings(id);
  check(opened, `the settings panel opens for ${what}`);
  if (opened) {
    const rows = await readPanel();
    console.log(`       ${what}:`, JSON.stringify(rows?.map(r => r.value)));
    const vals = (rows ?? []).map(r => r.value);
    check(vals.includes('14'), `${what}: text size is filled with its default`, vals.join(' '));
    check(vals.includes(wantWeight), `${what}: weight is filled`, vals.join(' '));
    check(vals.includes('left'), `${what}: alignment is filled`);
    check(vals.includes('#64748b'), `${what}: outline colour is filled`);
    check(vals.includes('3'), `${what}: outline thickness is filled`);

    // The complaint itself: no empty boxes, except ones that say blank is a
    // real choice.
    const blank = (rows ?? []).filter(r =>
      r.value === '' && !/leave blank|blank shows/i.test(r.ph));
    check(blank.length === 0, `${what}: nothing in the panel is left blank`,
      blank.map(r => r.ph || r.tag).join(', ') || 'none');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}
{
  // A widget's heading defaults to the widget's own name rather than nothing.
  const opened = await openSettings('CE-kpi');
  if (opened) {
    const rows = await readPanel();
    const head = rows?.find(r => r.tag === 'INPUT' && r.type !== 'color' && r.value && !/^\d+$/.test(r.value));
    check(!!head, 'a widget heading shows its own name, not a blank', head?.value ?? 'missing');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
}

// ── 2. The board search offers Find in board ──────────────────────────────
// Its own wording: this search only ever covers the board, so "on the board"
// would be labouring the obvious. The all-app search below keeps "Show it on
// the board", and each is asserted by the name it actually wears.
{
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(600);
  await page.keyboard.type('Weinstein');
  await page.waitForTimeout(700);
  const has = await page.evaluate(() =>
    [...document.querySelectorAll('button[title="Find in board"]')].length);
  check(has > 0, 'every board-search result carries a Find-in-board button', `${has} found`);
  // And pressing it travels without opening the drawer.
  if (has > 0) {
    await page.click('button[title="Find in board"]');
    await page.waitForTimeout(1600);
    const st = await page.evaluate(() => ({
      drawer: !!document.querySelector('.drawer-panel'),
      lit: !!document.querySelector('.search-hit'),
    }));
    console.log('       after Show on board:', JSON.stringify(st));
    check(!st.drawer, 'it shows the job on the board instead of opening it');
    check(st.lit, 'and highlights it');
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// ── 3. The app-wide search says something meaningful ──────────────────────
{
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(600);
  await page.keyboard.type('Weinberg');
  await page.waitForTimeout(900);
  const rows = await page.evaluate(() => {
    const out = [];
    for (const r of document.querySelectorAll('[role="button"]')) {
      const t = (r.textContent ?? '').trim();
      if (/Weinberg/.test(t)) out.push(t.replace(/\s+/g, ' ').slice(0, 90));
    }
    return out;
  });
  console.log('       search rows:', JSON.stringify(rows));
  check(rows.length > 0, 'the app-wide search found it');
  check(!rows.some(t => /\bG · Apt\b/.test(t)), 'no result reads "G · Apt"',
    rows.find(t => /G · Apt/.test(t)) ?? '');
  check(rows.some(t => /Job Board/.test(t)), 'it says which workspace instead',
    rows[0] ?? '');
  check(rows.some(t => /In Done/.test(t)), 'and which group it is filed in');
  const reveal = await page.evaluate(() =>
    document.querySelectorAll('button[title="Show it on the board"]').length);
  check(reveal > 0, 'and offers Show on board', `${reveal} found`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

// ── 4. The notebook's name column fits the names ──────────────────────────
{
  const w = await page.evaluate(() => {
    const book = document.querySelector('[data-node-id="CE-book"]');
    const grid = [...book.querySelectorAll('div')].find(d =>
      getComputedStyle(d).gridTemplateColumns.split(' ').length >= 6);
    if (!grid) return null;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').map(parseFloat);
    return { first: Math.round(cols[0]), day: Math.round(cols[1]), all: cols.map(Math.round) };
  });
  console.log('       notebook columns:', JSON.stringify(w));
  check(!!w, 'the notebook drew its grid');
  if (w) {
    check(w.first < w.day, 'the name column is narrower than a day column',
      `names ${w.first}px vs day ${w.day}px`);
    check(w.first >= 40 && w.first <= 130, 'and is sized to the names, not to a share of the sheet',
      `${w.first}px for "Vlad 1"`);
  }
}

// ── 5. A job from ANOTHER workspace goes on the notebook ──────────────────
{
  const cellPt = await page.evaluate(() => {
    const w = document.querySelector('[data-node-id="CE-prog"]');
    if (!w) return null;
    const btn = [...w.querySelectorAll('button')].find(b2 => /53|Artzi/.test(b2.textContent ?? ''));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  check(!!cellPt, 'the Building Progress widget drew another workspace’s unit',
    cellPt ? '' : 'no cell found');

  const target = await page.evaluate(() => {
    const w = document.querySelector('[data-node-id="CE-book"]');
    const cells = [...w.querySelectorAll('div')].filter(d => String(d.className).includes('group/cell'));
    const c = cells[2];
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });

  if (cellPt && target) {
    await page.mouse.move(cellPt.x, cellPt.y);
    await page.mouse.down();
    await page.mouse.move(cellPt.x + 20, cellPt.y - 20, { steps: 5 });
    await page.mouse.move(target.x, target.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(1400);

    const wrote = await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
      const el = (d.canvasElements ?? []).find(e => e.id === 'CE-book');
      const all = Object.values(el?.data?.cells ?? {}).flat();
      return all.map(e => ({ jobId: e.jobId, projectId: e.projectId }));
    });
    console.log('       notebook now holds:', JSON.stringify(wrote));
    check(wrote.some(e => e.jobId === 'A1-53' && e.projectId === 'wolfson'),
      'the square remembers the job AND which workspace it came from');

    // It STAYS PUT: nothing is written back into the other workspace.
    const untouched = await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('wolfson_app_data') ?? '{}');
      const a2 = (d.apartments ?? []).find(x => x.id === 'A1-53');
      return { exists: !!a2, inNotebook: a2?.inNotebook ?? null };
    });
    console.log('       the unit back in Wolfson:', JSON.stringify(untouched));
    check(untouched.exists && !untouched.inNotebook,
      'and the unit stays exactly where it was in its own workspace');

    // The card says which workspace, and does not read "(job removed)".
    const card = await page.evaluate(() => {
      const w = document.querySelector('[data-node-id="CE-book"]');
      const c = [...w.querySelectorAll('.planner-card')]
        .find(x => /Artzi|Wolfson/.test(x.textContent ?? ''));
      return c ? (c.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 70) : null;
    });
    console.log('       the card reads:', JSON.stringify(card));
    check(!!card && /Wolfson/.test(card), 'the card is tagged with its workspace', card ?? 'no card');
    check(!!card && !/job removed/.test(card), 'and does not read "(job removed)"');
  }
}

await page.screenshot({ path: 'scratchpad/round15.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
