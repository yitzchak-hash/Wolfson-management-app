// The TzviAir Goals embed: seeded once on the Job Board and the dashboard,
// mounted through the goals app's own widget.js with the right options per
// surface, counters from onState, delete-stays-deleted in-session, sample
// tiles on the shelf, and a clean unmount (no iframe left behind).
//
// The container has no internet, so tzviair-goals.vercel.app is STUBBED: a
// fake widget.js implementing the documented mount() API (it encodes the
// options into the iframe URL exactly as the real one does, which is what
// lets the harness read back what WE asked for), and a tiny /widget page.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
const GOALS = 'https://tzviair-goals.vercel.app';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const FAKE_WIDGET_JS = `
(function () {
  var ORIGIN = '${GOALS}';
  window.TzviAirGoalsWidget = {
    mount: function (target, opts) {
      var el = typeof target === 'string' ? document.querySelector(target) : target;
      var q = new URLSearchParams();
      q.set('view', opts.view || 'board');
      q.set('lang', opts.lang || 'he');
      if (opts.interactive) q.set('interactive', '1');
      if (opts.max) q.set('max', String(opts.max));
      if (opts.transparent) q.set('theme', 'transparent');
      if (opts.header === false) q.set('title', '0');
      if (opts.link === false) q.set('link', '0');
      var f = document.createElement('iframe');
      f.src = ORIGIN + '/widget?' + q.toString();
      f.style.width = '100%'; f.style.border = '0'; f.style.height = '220px';
      f.setAttribute('data-goals-iframe', '1');
      el.appendChild(f);
      if (opts.onState) setTimeout(function () {
        opts.onState({ total: 9, completed: 3, inProgress: 2, notStarted: 4 });
      }, 60);
      return { iframe: f, destroy: function () { f.remove(); } };
    },
  };
})();
`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
// Register the PAGE route first: Playwright consults routes newest-first, so
// the more specific widget.js route must be registered AFTER the widget* one
// or every script request is answered with HTML ("Unexpected token '<'").
await ctx.route(`${GOALS}/widget*`, r =>
  r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>goal tiles</body></html>' }));
await ctx.route(`${GOALS}/widget.js`, r =>
  r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_WIDGET_JS }));
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    apartments: [{
      id: 'G-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Cohen',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 80, canvasY: 620,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [
      { id: 'CE-bin-done', type: 'bin', binKind: 'done', x: 2100, y: 24, w: 180, h: 112, text: 'Done', color: '#16a34a' },
      { id: 'CE-bin-ready', type: 'bin', binKind: 'ready', x: 2100, y: 154, w: 180, h: 112, text: 'Ready', color: '#0ea5e9' },
      { id: 'CE-bin-archive', type: 'bin', binKind: 'archive', x: 2100, y: 284, w: 180, h: 112, text: 'Archive', color: '#64748b' },
      { id: 'CE-bin-trash', type: 'bin', binKind: 'trash', x: 2100, y: 414, w: 180, h: 112, text: 'Trash', color: '#dc2626' },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });

// ── 1 · the board seeds the widget once, mounted as a BOARD view ───────────
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3200);
const seeded = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  const els = (d.canvasElements ?? []).filter(e => e.widget === 'goals');
  return { count: els.length, id: els[0]?.id };
});
check(seeded.count === 1 && seeded.id === 'CE-goals-board',
  'the board seeds ONE goals widget with the fixed id', JSON.stringify(seeded));
check(await page.locator('[data-node-id="CE-goals-board"]').count() === 1,
  'and it is drawn on the board');

const boardSrc = await page.evaluate(() =>
  document.querySelector('[data-node-id="CE-goals-board"] iframe[data-goals-iframe]')?.getAttribute('src') ?? '');
check(/view=board/.test(boardSrc) && /interactive=1/.test(boardSrc),
  'mounted as the FULL interactive tile grid (the board rule)', boardSrc);
check(/title=0/.test(boardSrc) && /theme=transparent/.test(boardSrc),
  'with the widget\'s own header off — Frame draws the title', boardSrc);
check(/lang=en/.test(boardSrc),
  'language follows the app (English UI → en)', boardSrc);

await page.waitForTimeout(500);
const badge = await page.evaluate(() =>
  document.querySelector('[data-goals-badge]')?.textContent ?? '');
check(/3\/9/.test(badge) && /2/.test(badge),
  'the onState counters draw the badge', badge);

// ── 2 · the dashboard seeds its own copy, as the COMPACT view ──────────────
await page.goto(`${APP}/dashboard`);
await page.waitForTimeout(2800);
const dashSeeded = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  return (d.canvasElements ?? []).filter(e => e.widget === 'goals').map(e => ({ id: e.id, board: e.board }));
});
check(dashSeeded.length === 2 && dashSeeded.some(e => e.id === 'CE-goals-dash' && e.board === '__dashboard'),
  'the dashboard seeds its own goals card', JSON.stringify(dashSeeded));
const dashSrc = await page.evaluate(() =>
  document.querySelector('iframe[data-goals-iframe]')?.getAttribute('src') ?? '');
check(/view=dashboard/.test(dashSrc) && !/interactive=1/.test(dashSrc),
  'and it mounts as the compact READ-ONLY summary — both default by SURFACE', dashSrc);

// ── 3 · navigating away unmounts cleanly ───────────────────────────────────
await page.goto(`${APP}/tasks`);
await page.waitForTimeout(1500);
check(await page.evaluate(() => document.querySelectorAll('iframe[data-goals-iframe]').length) === 0,
  'leaving the page destroys the mount — no iframe left behind');

// ── 4 · deleting it does not reseed (in-session tombstone) ─────────────────
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2500);
page.once('dialog', d => d.accept());
await page.locator('[data-node-id="CE-goals-board"]').hover();
await page.waitForTimeout(400);
await page.evaluate(() => {
  const node = document.querySelector('[data-node-id="CE-goals-board"]');
  const btn = [...node.querySelectorAll('button')]
    .find(x => /remove/i.test(x.getAttribute('title') || ''));
  btn?.click();
});
await page.waitForTimeout(1500);
const afterDelete = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  return (d.canvasElements ?? []).filter(e => e.widget === 'goals' && e.id === 'CE-goals-board').length;
});
check(afterDelete === 0, 'deleting the board copy removes it');
await page.waitForTimeout(2000);
const reseeded = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  return (d.canvasElements ?? []).filter(e => e.widget === 'goals' && e.id === 'CE-goals-board').length;
});
check(reseeded === 0, 'and the seeder does NOT put it straight back (tombstone honoured)');

// ── 5 · the store shelf draws canned tiles, not a spinner ──────────────────
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(x => /widget/i.test(x.getAttribute('title') || ''));
  btn?.click();
});
await page.waitForTimeout(1400);
const shelfCard = await page.evaluate(() => {
  const card = document.querySelector('[data-widget-id="goals"]');
  return card ? (card.textContent || '') : null;
});
check(!!shelfCard && /sample data/.test(shelfCard) && /הושלמו/.test(shelfCard),
  'the shelf sells the Goals widget with canned tiles', (shelfCard || '').slice(0, 60));
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

// ── 6 · the sidebar carries NO Goals tab (owner's ruling) — the /goals page
//        still stands, reached from the widgets' drawn figures ──────────────
check(await page.locator('aside a[href="/goals"]').count() === 0,
  'the sidebar carries NO Goals tab — the rail stays clean');
await page.goto(`${APP}/goals`);
await page.waitForTimeout(1500);
const goalsPage = await page.evaluate(() => ({
  mounted: !!document.querySelector('[data-goals-page] iframe[data-goals-iframe]'),
  src: document.querySelector('[data-goals-page] iframe[data-goals-iframe]')?.getAttribute('src') ?? '',
  badge: document.querySelector('[data-goals-page] [data-goals-badge]')?.textContent ?? '',
}));
check(goalsPage.mounted && /view=board/.test(goalsPage.src) && /interactive=1/.test(goalsPage.src) && !/title=0/.test(goalsPage.src),
  'the /goals page still serves the whole site, its own header on', goalsPage.src);
check(/3\/9/.test(goalsPage.badge), 'with the live counters in its header', goalsPage.badge);

// ── 6b · the TV bar: Goals right of Dashboard, a vertical line between ─────
await page.goto(`${APP}/tv`);
await page.waitForTimeout(3000);
const tvBar = await page.evaluate(() => {
  const goals = document.querySelector('[data-tv-goals]');
  if (!goals) return { present: false };
  const dash = [...document.querySelectorAll('button')]
    .find(x => (x.textContent || '').trim() === 'Dashboard');
  const between = dash && goals.previousElementSibling;
  return {
    present: true,
    rightOfDash: !!dash && !!(dash.compareDocumentPosition(goals) & Node.DOCUMENT_POSITION_FOLLOWING),
    dividerBetween: !!between && between.classList.contains('w-px'),
  };
});
check(tvBar.present && tvBar.rightOfDash && tvBar.dividerBetween,
  'the TV bar: Goals sits right of Dashboard behind a small vertical line', JSON.stringify(tvBar));
await page.locator('[data-tv-goals]').click();
await page.waitForTimeout(1500);
const tvGoals = await page.evaluate(() =>
  document.querySelector('iframe[data-goals-iframe]')?.getAttribute('src') ?? '');
check(/view=board/.test(tvGoals) && !/interactive=1/.test(tvGoals),
  'pressing it shows the goals board READ-ONLY on the wall', tvGoals);
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2500);

// ── 7 · the three host-drawn styles (own seeded context — the standing
//        flush-on-unload rule: a localStorage patch on a live page is
//        overwritten, so the styles get a fresh context) ────────────────────
const page2 = await ctx.newPage();
await ctx.addInitScript(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  if (!d.canvasElements) return;
  if (!d.canvasElements.some(e => e.id === 'CE-g-ring')) {
    d.canvasElements.push(
      { id: 'CE-g-ring', type: 'widget', widget: 'goals', x: 60, y: 120, w: 200, h: 190, text: '', color: '#ffffff', data: { style: 'ring' } },
      { id: 'CE-g-num', type: 'widget', widget: 'goals', x: 300, y: 120, w: 200, h: 140, text: '', color: '#ffffff', data: { style: 'number' } },
      { id: 'CE-g-bar', type: 'widget', widget: 'goals', x: 540, y: 120, w: 240, h: 110, text: '', color: '#ffffff', data: { style: 'bar' } },
    );
    localStorage.setItem('general_app_data', JSON.stringify(d));
  }
});
page2.on('pageerror', e => { console.log('PAGE2 ERROR', e.message); fails++; });
await page2.goto(`${APP}/jobs`);
await page2.waitForTimeout(3200);

const styles = await page2.evaluate(() => {
  const read = id => {
    const node = document.querySelector(`[data-node-id="${id}"]`);
    const frame = node?.querySelector('iframe[data-goals-iframe]');
    return {
      text: (node?.textContent ?? '').slice(0, 80),
      // A host-drawn style keeps its mount HIDDEN — the counters channel only.
      frameHidden: frame ? frame.offsetParent === null : null,
    };
  };
  return { ring: read('CE-g-ring'), num: read('CE-g-num'), bar: read('CE-g-bar') };
});
check(/3\/9/.test(styles.ring.text) && /done/i.test(styles.ring.text) && styles.ring.frameHidden === true,
  'the RING draws the live share, its mount hidden', JSON.stringify(styles.ring));
check(/3\/9/.test(styles.num.text) && /goals done/i.test(styles.num.text) && styles.num.frameHidden === true,
  'the BIG NUMBER draws completed/total', JSON.stringify(styles.num));
check(/33%/.test(styles.bar.text) && /3\/9/.test(styles.bar.text) && styles.bar.frameHidden === true,
  'the BAR draws the percentage and the counts', JSON.stringify(styles.bar));

// A host-drawn figure is a door to the Goals tab.
await page2.locator('[data-node-id="CE-g-ring"] [data-goals-open]').click();
await page2.waitForTimeout(1200);
check(await page2.evaluate(() => location.pathname) === '/goals',
  'clicking a drawn figure opens the Goals tab');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
