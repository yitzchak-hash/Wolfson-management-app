// Round 24: the search widget's results FLOAT over the neighbours · world
// clocks grow their type with the box · a link tile wears the site's logo ·
// a resize that loses its pointerup ends itself instead of chasing the mouse.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
// The favicon service is unreachable from this container — serve a green
// pixel so the logo path can be asserted rather than its fallback.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/p+FdogAAAABJRU5ErkJggg==', 'base64');
await ctx.route('**/s2/favicons*', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const job = (id, name, x, y) => ({
    id, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {}, canvasX: x, canvasY: y,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    apartments: [
      job('G-a', 'Weissman', 60, 640),
      job('G-b', 'Weinberg', 300, 640),
      job('G-c', 'Katz', 540, 640),
      // Enough matches that the dropdown is TALLER than the widget — the
      // overlap over the neighbour has to be real, not vacuous.
      job('G-d', 'Weinstein', 60, 800),
      job('G-e', 'Weil', 300, 800),
      job('G-f', 'Weiss', 540, 800),
      job('G-g', 'Weinreb', 780, 800),
      job('G-h', 'Weinfeld', 1020, 800),
    ],
    canvasElements: [
      { id: 'CE-find', type: 'widget', widget: 'job-find', x: 60, y: 120, w: 340, h: 180,
        text: '', color: '#ffffff', data: {} },
      // A NEIGHBOUR directly under the search widget — the dropdown must draw
      // OVER it, which is the whole point of the round.
      { id: 'CE-under', type: 'note', x: 60, y: 320, w: 340, h: 200, text: 'underneath', color: '#fef9c3' },
      { id: 'CE-wc1', type: 'widget', widget: 'world-clocks', x: 470, y: 120, w: 210, h: 165,
        text: '', color: '#ffffff', data: { cities: ['il', 'ny', 'lon', 'sha'] } },
      { id: 'CE-wc2', type: 'widget', widget: 'world-clocks', x: 720, y: 120, w: 210, h: 430,
        text: '', color: '#ffffff', data: { cities: ['il', 'ny', 'lon', 'sha'] } },
      { id: 'CE-link', type: 'widget', widget: 'link', x: 980, y: 120, w: 185, h: 90,
        text: '', color: '#ffffff', data: { label: 'Deals board', url: 'https://crm.zoho.com/x' } },
      { id: 'CE-nb', type: 'widget', widget: 'notes-board', x: 980, y: 260, w: 300, h: 260,
        text: '', color: '#ffffff', data: {} },
      { id: 'CE-bin-done', type: 'bin', binKind: 'done', x: 2100, y: 24, w: 180, h: 112, text: 'Done', color: '#16a34a' },
      { id: 'CE-bin-ready', type: 'bin', binKind: 'ready', x: 2100, y: 154, w: 180, h: 112, text: 'Ready', color: '#0ea5e9' },
      { id: 'CE-bin-archive', type: 'bin', binKind: 'archive', x: 2100, y: 284, w: 180, h: 112, text: 'Archive', color: '#64748b' },
      { id: 'CE-bin-trash', type: 'bin', binKind: 'trash', x: 2100, y: 414, w: 180, h: 112, text: 'Trash', color: '#dc2626' },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3000);

// ── 1 · the search results float over the widget below ─────────────────────
await page.locator('[data-node-id="CE-find"] input[data-job-find]').click();
await page.locator('[data-node-id="CE-find"] input[data-job-find]').type('wei', { delay: 40 });
await page.waitForTimeout(500);
const overlay = await page.evaluate(() => {
  const o = document.querySelector('[data-search-overlay]');
  if (!o) return { open: false };
  const r = o.getBoundingClientRect();
  const w = document.querySelector('[data-node-id="CE-find"]').getBoundingClientRect();
  const under = document.querySelector('[data-node-id="CE-under"]').getBoundingClientRect();
  // The point where the dropdown crosses the neighbour: whoever elementFromPoint
  // answers there is who is really on top.
  const px = r.left + r.width / 2, py = Math.min(r.bottom - 10, under.top + 20);
  const at = document.elementFromPoint(px, py);
  return {
    open: true,
    inBody: o.parentElement === document.body,
    belowInput: r.top >= w.top,
    pastWidget: r.bottom > w.bottom,
    overNeighbour: !!(at && o.contains(at)),
    rows: o.querySelectorAll('button, [data-mini-job]').length,
    text: (o.textContent || '').slice(0, 60),
  };
});
check(overlay.open && overlay.inBody, 'the results render as a floating panel on <body>');
check(overlay.pastWidget, 'the panel extends past the widget’s own box');
check(overlay.overNeighbour, 'and it sits ON TOP of the widget underneath', JSON.stringify(overlay));
check(/Weissman/.test(overlay.text) && /Weinberg/.test(overlay.text),
  'with the matching jobs in it', overlay.text);

// A result click opens the job.
await page.locator('[data-search-overlay] >> text=Weissman').first().click();
await page.waitForTimeout(800);
const drawerOpen = await page.evaluate(() => document.querySelectorAll('.drawer-panel').length);
check(drawerOpen > 0, 'clicking a result opens the job');
// The search input kept focus through the click (by design), and a focused
// field eats the first Escape — blur, then close, then make sure it closed.
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.evaluate(() => {
  document.querySelector('.drawer-overlay')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(600);
check(await page.evaluate(() => !document.querySelector('.drawer-panel')),
  'the drawer closes again');
// Escape in the input clears and closes.
await page.locator('[data-node-id="CE-find"] input[data-job-find]').click();
await page.locator('[data-node-id="CE-find"] input[data-job-find]').type('wei');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check(await page.evaluate(() => !document.querySelector('[data-search-overlay]')),
  'Escape clears the search and takes the panel down');

// ── 2 · world clocks: taller widget, bigger type ───────────────────────────
const clockFonts = await page.evaluate(() => {
  const size = id => {
    const node = document.querySelector(`[data-node-id="${id}"]`);
    const span = [...node.querySelectorAll('span')].find(s => (s.textContent || '').trim() === 'Israel');
    return span ? parseFloat(getComputedStyle(span).fontSize) : 0;
  };
  return { natural: size('CE-wc1'), tall: size('CE-wc2') };
});
check(clockFonts.natural > 0 && clockFonts.tall > clockFonts.natural * 1.5,
  'the taller clock widget draws its cities in bigger type', JSON.stringify(clockFonts));
const clockFits = await page.evaluate(() => {
  const node = document.querySelector('[data-node-id="CE-wc2"]');
  const r = node.getBoundingClientRect();
  const span = [...node.querySelectorAll('span')].find(s => (s.textContent || '').trim() === 'Israel');
  const sr = span.getBoundingClientRect();
  return sr.bottom <= r.bottom + 1 && sr.right <= r.right + 1;
});
check(clockFits, 'and the bigger type still fits inside the widget');

// ── 3 · the link tile wears the site’s logo ────────────────────────────────
const logo = await page.evaluate(() => {
  const img = document.querySelector('[data-node-id="CE-link"] img');
  return img ? { src: img.getAttribute('src'), w: img.getBoundingClientRect().width } : null;
});
check(!!logo && /favicons\?domain=crm\.zoho\.com/.test(logo.src) && logo.w > 10,
  'the link tile shows the website’s own logo', JSON.stringify(logo));

// ── 4 · a resize that loses its release ends itself ────────────────────────
const nb = page.locator('[data-node-id="CE-nb"]');
await nb.hover();
await page.waitForTimeout(300);
const corner = nb.locator('[data-resize][title="Drag to resize"]');
const cb = await corner.boundingBox();
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
await page.mouse.down();
await page.mouse.move(cb.x + 60, cb.y + 50, { steps: 6 });
await page.waitForTimeout(150);
// Simulate the lost release: a pointermove with NO buttons arriving at the
// handle — exactly what the browser sends after a missed pointerup.
await page.evaluate(() => {
  const h = document.querySelector('[data-node-id="CE-nb"] [data-resize][title="Drag to resize"]')
    ?? document.querySelector('[data-node-id="CE-nb"] [data-resize]');
  h.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true, buttons: 0, clientX: 900, clientY: 700, pointerId: 99,
  }));
});
await page.waitForTimeout(700);
const sizeAfterHeal = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  const el = (d.canvasElements ?? []).find(e => e.id === 'CE-nb');
  return { w: el.w, h: el.h };
});
check(sizeAfterHeal.w > 300 && sizeAfterHeal.w < 420,
  'the buttonless move COMMITS the size instead of being ignored', JSON.stringify(sizeAfterHeal));
// The mouse is still "down" and moving — but the gesture is over, so nothing
// may keep resizing ("it sticks to the mouse and keeps resizing").
await page.mouse.move(cb.x + 300, cb.y + 260, { steps: 8 });
await page.waitForTimeout(600);
await page.mouse.up();
await page.waitForTimeout(600);
const sizeAfterWander = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') || '{}');
  const el = (d.canvasElements ?? []).find(e => e.id === 'CE-nb');
  return { w: el.w, h: el.h };
});
check(sizeAfterWander.w === sizeAfterHeal.w && sizeAfterWander.h === sizeAfterHeal.h,
  'and wandering the mouse afterwards resizes NOTHING', JSON.stringify(sizeAfterWander));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
