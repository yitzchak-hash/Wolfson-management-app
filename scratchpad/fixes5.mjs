// The five-fix round: opening a job writes WHO OPENED IT into its history
// (throttled); the header zoom buttons anchor the MIDDLE of the view; a
// ctrl+wheel zoom in the outer ~7% of the board pins that visible edge; the
// tile's stage name auto-fits one line and the family name steps down when it
// wraps; and Ctrl+A inside a group window selects all its jobs.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const apt = (id, name, x, y, extra = {}) => ({
    id, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '',
    currentStageId: 'S-long', stageDates: {}, canvasX: x, canvasY: y,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    ...extra,
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'Dana', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'S-long', name: 'Thermostats & concealed piping inspection', color: '#3b82f6', order: 1, active: true, projectId: 'general' }],
    contractors: [],
    contractorAssignments: [],
    apartments: [
      apt('G-mid', 'Cohen', 420, 260),
      apt('G-long', 'Weinstein-Rosenblatt Family', 700, 260),
      apt('G-a', 'Levi', 60, 60, { boardBin: 'done', binnedAt: '2026-08-01' }),
      apt('G-b', 'Mizrahi', 60, 60, { boardBin: 'done', binnedAt: '2026-08-01' }),
      apt('G-c', 'Peretz', 60, 60, { boardBin: 'done', binnedAt: '2026-08-01' }),
    ],
    canvasElements: [],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3200);
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));

// ── 1 · opening a job writes WHO OPENED IT ──────────────────────────────────
await page.locator('[data-node-id="G-mid"]').dblclick();
await page.waitForTimeout(900);
let d = await data();
let opens = (d.activityLogs ?? []).filter(l => l.actionType === 'opened' && l.apartmentId === 'G-mid');
check(opens.length === 1 && opens[0].userName === 'Dana',
  'opening a job logs who opened it', JSON.stringify(opens[0] ?? null));
// The history tab shows it.
await page.locator('.drawer-panel button:has-text("History")').first().click();
await page.waitForTimeout(400);
const hist = await page.locator('.drawer-panel').innerText();
check(hist.includes('Dana') && hist.includes('opened'),
  "and the job's History tab says so", hist.split('\n').find(l => l.includes('opened')) ?? '');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
// Re-opening within the hour is ONE visit, not a stream.
await page.locator('[data-node-id="G-mid"]').dblclick();
await page.waitForTimeout(700);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
d = await data();
opens = (d.activityLogs ?? []).filter(l => l.actionType === 'opened' && l.apartmentId === 'G-mid');
check(opens.length === 1, 'a re-open within the hour adds no second entry', String(opens.length));

// ── 2 · the header zoom buttons anchor the MIDDLE of the view ───────────────
const vp = page.locator('[data-board-viewport]');
const vpBox = await vp.boundingBox();
const midX = vpBox.x + vpBox.width / 2, midY = vpBox.y + vpBox.height / 2;
const worldAtMid = await page.evaluate(([mx, my]) => {
  const w = document.querySelector('[data-board-world]');
  const r = w.getBoundingClientRect();
  const zoom = r.width / w.offsetWidth;
  return { x: (mx - r.left) / zoom, y: (my - r.top) / zoom };
}, [midX, midY]);
await page.locator('button[title="Zoom in"]').click();
await page.waitForTimeout(500);
const midAfter = await page.evaluate(([wx, wy]) => {
  const w = document.querySelector('[data-board-world]');
  const r = w.getBoundingClientRect();
  const zoom = r.width / w.offsetWidth;
  return { x: r.left + wx * zoom, y: r.top + wy * zoom };
}, [worldAtMid.x, worldAtMid.y]);
// The world point that WAS at the middle should still be near it (the clamp
// may bite a little near the pinned corner; middle of a roomy board is free).
const drift = Math.hypot(midAfter.x - midX, midAfter.y - midY);
check(drift < 60, 'zoom-in holds the middle of the screen', `drift ${Math.round(drift)}px`);
await page.locator('button[title="Zoom out"]').click();
await page.waitForTimeout(400);

// ── 3 · ctrl+wheel near the board's right edge PINS the edge ────────────────
// Bring the world's right edge on screen: zoom out once so the whole board shows.
await page.locator('button[title="Fit the whole board on screen"], button:has-text("Fit")').first().click().catch(() => {});
await page.waitForTimeout(600);
const edgeBefore = await page.evaluate(() => {
  const w = document.querySelector('[data-board-world]');
  return w.getBoundingClientRect().right;
});
// A point inside the outer 7% of the world's width, on the sheet.
const probe = await page.evaluate(() => {
  const w = document.querySelector('[data-board-world]');
  const r = w.getBoundingClientRect();
  return { x: r.right - r.width * 0.03, y: r.top + r.height / 2 };
});
await page.mouse.move(probe.x, probe.y);
await page.keyboard.down('Control');
await page.mouse.wheel(0, -120);
await page.keyboard.up('Control');
await page.waitForTimeout(500);
const edgeAfter = await page.evaluate(() => {
  const w = document.querySelector('[data-board-world]');
  return w.getBoundingClientRect().right;
});
check(Math.abs(edgeAfter - edgeBefore) < 8,
  'zooming near the right edge keeps the edge where it is',
  `edge ${Math.round(edgeBefore)} -> ${Math.round(edgeAfter)}`);

// ── 4 · tile text auto-fits ─────────────────────────────────────────────────
const fit = await page.evaluate(() => {
  const read = (id) => {
    const t = document.querySelector(`[data-node-id="${id}"]`);
    const badge = [...t.querySelectorAll('span')].find(x => x.textContent.includes('Thermostats'));
    const h3 = t.querySelector('h3');
    return {
      badgeFs: badge ? parseFloat(getComputedStyle(badge).fontSize) : null,
      badgeFits: badge ? badge.scrollWidth <= badge.clientWidth + 1 : null,
      nameFs: parseFloat(getComputedStyle(h3).fontSize),
    };
  };
  return { mid: read('G-mid'), long: read('G-long') };
});
check(fit.mid.badgeFs !== null && fit.mid.badgeFs < 10 && fit.mid.badgeFits,
  'a long stage name shrinks to fit ONE line in the tile', JSON.stringify(fit.mid));
check(fit.mid.nameFs === 14, 'a short family name keeps its full size', String(fit.mid.nameFs));
check(fit.long.nameFs === 12.5, 'a two-row family name steps down a size', String(fit.long.nameFs));

// ── 5 · Ctrl+A inside a group selects all its jobs ──────────────────────────
// A fresh arrival — the zoom/wheel state from steps 2-3 is not this part's
// concern, and the bins sit at their home spots at 100%.
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2500);
// The board's view memory restored step 2's zoom, which parks the bins under
// the floating header — come home to 100% before aiming at one.
await page.locator('button:has-text("100%")').first().click();
await page.waitForTimeout(600);
// A built-in group opens on a single CLICK (a bin is a fixture — click
// opens; double-click is the custom-group rename path).
const binBox = await page.locator('[data-node-id="CE-bin-done"]').boundingBox();
await page.mouse.click(binBox.x + binBox.width / 2, binBox.y + binBox.height / 2);
await page.waitForTimeout(900);
check(await page.locator('.bin-window-in [data-node-id="G-a"]').count() === 1,
  'the Done group opens with its jobs');
await page.keyboard.press('Control+a');
await page.waitForTimeout(400);
const selCount = await page.evaluate(() => {
  const win = document.querySelector('.bin-window-in');
  return ['G-a', 'G-b', 'G-c'].filter(id => {
    const t = win.querySelector(`[data-node-id="${id}"]`);
    return t && getComputedStyle(t).borderColor.includes('74, 168, 216');
  }).length;
});
check(selCount === 3, 'Ctrl+A selects every job in the group', `${selCount}/3 selected`);
const boardSel = await page.evaluate(() => {
  const t = document.querySelector('[data-node-id="G-mid"]');
  return getComputedStyle(t).borderColor.includes('74, 168, 216');
});
check(!boardSel, 'and the board behind the window is untouched');

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
