// "This Week First" (owner, 2026-10-18): the week chips on top, the chosen
// week and the next one drawn right under them, the run topped up to three
// weeks ahead, a pick remembered per copy per computer for the week it was
// made in, a drag HELD over a chip turning the notebook to that week (board
// tiles and task bars alike), the TV showing the same chips, and the
// Dashboard's compact "This week" card. Dates from the real clock.
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const iso = d => { const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return t.toISOString().slice(0, 10); };
const plus = (d, n) => { const o = new Date(d); o.setDate(o.getDate() + n); return o; };
const now = new Date();
const sun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
const W = n => iso(plus(sun, n * 7));
const day = (wk, i) => iso(plus(new Date(`${wk}T00:00:00`), i));
const THIS = W(0), LAST = W(-1), NEXT = W(1), PLUS2 = W(2);

const seed = ({ THIS, LAST, NEXT, firstWeek, lastTue, thisMon, nextWed }) => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const apt = (id, name, x, y) => ({
    id, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', currentStageId: 'S-pipe', stageDates: {}, canvasX: x, canvasY: y,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  const t = (id, apt, d, done) => ({ id, apartmentId: apt, buildingId: 'G', contractorId: 'C-jo', taskDescription: id,
    dueDate: d, stageId: 'S-pipe', completedAt: done ? `${d}T12:00:00Z` : null,
    createdAt: '2026-09-01', createdBy: 'U-t', createdByName: 'A' });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    users: [{ id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' }],
    stages: [{ id: 'S-pipe', name: 'Piping', color: '#6366f1', order: 1, active: true, projectId: 'general' }],
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }],
    contractorAssignments: [t('T-last', 'G-a', lastTue, true), t('T-this', 'G-b', thisMon, false), t('T-next', 'G-c', nextWed, false)],
    apartments: [apt('G-a', 'Alef', 40, 2400), apt('G-b', 'Bet', 40, 2600), apt('G-c', 'Gimel', 40, 2800), apt('G-new', 'Newjob', 1220, 200)],
    canvasElements: [
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 40, y: 330, w: 1080, h: 470, text: '', color: '#ffffff',
        data: { people: ['c:C-jo'], firstWeek, weekCount: 2, span: 5 } },
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 3000, y: 3000, w: 300, h: 300, text: '', color: '#fff', data: {} },
    ],
  }));
};
const args = { THIS, LAST, NEXT, firstWeek: W(-2), lastTue: day(LAST, 2), thisMon: day(THIS, 1), nextWed: day(NEXT, 3) };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(seed, args);
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForSelector('[data-week-ribbon]', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1200);

const N = '[data-node-id="CE-rota"]';
const drawnWeeks = () => page.$$eval(`${N} [data-week]:not([data-ghost-week])`, ns => ns.map(n => n.getAttribute('data-week')));
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')));
const rota = async () => (await data()).canvasElements.find(e => e.id === 'CE-rota').data;
const centre = async sel => { const bb = await page.locator(sel).first().boundingBox(); return bb && { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };

// ── 1 · it opens on this week, with next week under it ──────────────────────
{
  check(await page.locator(`${N} [data-week-ribbon]`).count() === 1, '1 · the week chips sit on top of the notebook');
  const chips = await page.$$eval(`${N} [data-week-chip]`, ns => ns.map(n => n.getAttribute('data-week-chip')));
  check(chips.join() === [W(-2), LAST, THIS, NEXT, PLUS2, W(3)].join(), '1 · two back, this week, three ahead', chips.join());
  const on = await page.locator(`${N} [data-week-chip][data-on]`).getAttribute('data-week-chip');
  check(on === THIS, '1 · this week is the lit chip', on);
  check((await drawnWeeks()).join() === [THIS, NEXT].join(), '1 · the notebook draws this week then next', (await drawnWeeks()).join());
  const ribTop = (await page.locator(`${N} [data-week-ribbon]`).boundingBox()).y;
  const wkTop = (await page.locator(`${N} [data-week="${THIS}"]`).boundingBox()).y;
  check(wkTop - ribTop < 90, '1 · this week starts right under the chips', `${Math.round(wkTop - ribTop)}px`);
  check(await page.locator(`${N} [data-task-bar="T-this"]`).count() === 1 && await page.locator(`${N} [data-task-bar="T-next"]`).count() === 1
    && await page.locator(`${N} [data-task-bar="T-last"]`).count() === 0, '1 · this and next week\'s tasks show, last week\'s does not');
  const thisCount = await page.locator(`${N} [data-week-chip="${THIS}"] [data-week-chip-count]`).innerText();
  const lastCount = await page.locator(`${N} [data-week-chip="${LAST}"] [data-week-chip-count]`).innerText();
  check(thisCount.includes('1 · 0✓') && lastCount.includes('1 · 1✓'), '1 · each chip counts its tasks and how many are done', `${thisCount} / ${lastCount}`);
  check(await page.locator(`${N} [data-week-today]`).count() === 0, '1 · no Today button while on this week');
  check(await page.locator(`${N} [data-week-older]`).count() === 1, '1 · Older… is there');
  const r = await rota();
  check(r.weekCount >= 6, '1 · the run topped itself up to three weeks ahead', String(r.weekCount));
  check(await page.locator(`${N} [title^="Put this week away"]`).count() === 0, '1 · no put-away eyes in this view');
}

if (process.env.SHOTS) await page.locator(N).screenshot({ path: `${process.env.SHOTS}/rib-board.png` });
// ── 2 · a chip turns the page; the pick is remembered for this week only ─────
{
  await page.locator(`${N} [data-week-chip="${LAST}"]`).click();
  await page.waitForTimeout(300);
  check((await drawnWeeks()).join() === [LAST, THIS].join(), '2 · Last week draws last week then this', (await drawnWeeks()).join());
  check(await page.locator(`${N} [data-task-bar="T-last"]`).count() === 1, '2 · last week\'s task is there');
  check(await page.locator(`${N} [data-week-today]`).count() === 1, '2 · Today appears');
  await page.reload(); await page.waitForSelector('[data-week-ribbon]'); await page.waitForTimeout(800);
  check((await drawnWeeks())[0] === LAST, '2 · a reload stays on the picked week (this computer, this week)', (await drawnWeeks()).join());
  await page.locator(`${N} [data-week-today]`).click();
  await page.waitForTimeout(300);
  check((await drawnWeeks())[0] === THIS, '2 · Today comes back to this week');
  // A pick made LAST week does not count any more — Sunday turned the page.
  await page.evaluate(([k, LAST]) => localStorage.setItem(k, JSON.stringify({ week: LAST, at: LAST })), ['nb_week_CE-rota', LAST]);
  await page.reload(); await page.waitForSelector('[data-week-ribbon]'); await page.waitForTimeout(800);
  check((await drawnWeeks())[0] === THIS, '2 · a pick from an earlier week is forgotten — it opens on this week');
  await page.locator(`${N} [data-week-older]`).click();
  check(await page.locator('[data-week-older-list] [data-week-older-pick]').count() > 3, '2 · Older… lists earlier weeks');
  await page.keyboard.press('Escape');
}

// ── 3 · a board tile HELD over "Last week" turns the page, then drops there ──
{
  const tile = await centre('[data-node-id="G-new"]');
  const chip = await centre(`${N} [data-week-chip="${LAST}"]`);
  await page.mouse.move(tile.x, tile.y + 20);
  await page.mouse.down();
  await page.mouse.move(tile.x - 60, tile.y + 60, { steps: 5 });
  await page.mouse.move(chip.x, chip.y, { steps: 10 });
  await page.waitForTimeout(250);
  check(await page.locator(`${N} [data-week-chip="${LAST}"][data-holding]`).count() === 1, '3 · the chip fills while the drag waits on it');
  await page.waitForTimeout(600);
  check((await drawnWeeks())[0] === LAST, '3 · holding a job over Last week turns the notebook to last week', (await drawnWeeks()).join());
  const target = await centre(`${N} [data-cell-person="c:C-jo"][data-cell-day="${day(LAST, 3)}"]`);
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(700);
  const cells = (await rota()).cells ?? {};
  const landed = (cells[`c:C-jo|${day(LAST, 3)}`] ?? []).some(e => e.jobId === 'G-new');
  check(landed, '3 · and it lands on last Wednesday', JSON.stringify(cells));
}

// ── 4 · a task bar carried to a chip two weeks out, dropped on a day there ───
{
  await page.locator(`${N} [data-week-today]`).click().catch(() => {});
  await page.waitForTimeout(300);
  const bar = await centre(`${N} [data-task-bar="T-this"]`);
  const chip = await centre(`${N} [data-week-chip="${PLUS2}"]`);
  await page.mouse.move(bar.x, bar.y);
  await page.mouse.down();
  await page.mouse.move(bar.x + 20, bar.y - 20, { steps: 4 });
  await page.mouse.move(chip.x, chip.y, { steps: 10 });
  await page.waitForTimeout(900);
  check((await drawnWeeks())[0] === PLUS2, '4 · a task bar held over a chip turns the page too', (await drawnWeeks()).join());
  check(await page.locator(`${N} [data-ghost-week]`).count() >= 1, '4 · the week the bar came from stays mounted, unseen, under the hand');
  const target = await centre(`${N} [data-cell-person="c:C-jo"][data-cell-day="${day(PLUS2, 1)}"]`);
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(500);
  const yes = page.locator('[data-move-confirm-yes]');
  check(await yes.count() === 1, '4 · the drop asks the usual move question');
  await yes.click().catch(() => {});
  await page.waitForTimeout(500);
  const t = (await data()).contractorAssignments.find(a => a.id === 'T-this');
  check(t.dueDate === day(PLUS2, 1), '4 · and the task moved to that Monday', t.dueDate);
  check(await page.locator(`${N} [data-ghost-week]`).count() === 0, '4 · the hidden week is let go once the hand comes off');
}

// ── 5 · the old long scroll is still a setting ──────────────────────────────
{
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('general_app_data'));
    const r = d.canvasElements.find(e => e.id === 'CE-rota');
    r.data.weekView = 'all';
    window.__store?.getState().updateCanvasElement('CE-rota', { data: r.data });
  });
  await page.waitForTimeout(400);
  const n = (await drawnWeeks()).length;
  check(await page.locator(`${N} [data-week-ribbon]`).count() === 0 && n >= 6, '5 · "Every week" brings back the old long scroll', `${n} weeks`);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('general_app_data'));
    const r = d.canvasElements.find(e => e.id === 'CE-rota');
    delete r.data.weekView;
    window.__store?.getState().updateCanvasElement('CE-rota', { data: r.data });
  });
  await page.waitForTimeout(400);
}

// ── 6 · the TV has the same chips ───────────────────────────────────────────
{
  await page.goto(`${APP}/tv`);
  await page.waitForTimeout(3500);
  const rib = page.locator('[data-week-ribbon]');
  check(await rib.count() >= 1, '6 · the wall shows the week chips', String(await rib.count()));
  if (await rib.count()) {
    await page.locator(`[data-week-chip="${NEXT}"]`).first().click();
    await page.waitForTimeout(300);
    const first = await page.$$eval('[data-week]:not([data-ghost-week])', ns => ns.map(n => n.getAttribute('data-week')));
    check(first[0] === NEXT, '6 · and a press on the wall turns its page (read-only — nothing written)', first.join());
  }
}

// ── 7 · the Dashboard's compact "This week" card ────────────────────────────
{
  await page.goto(`${APP}/dashboard`);
  await page.waitForTimeout(3000);
  const card = page.locator('[data-week-card]');
  check(await card.count() === 1, '7 · the Dashboard carries the This week card');
  check(await card.locator('[data-week-ribbon]').count() === 1, '7 · with the week chips');
  const wks = await card.locator('[data-week]:not([data-ghost-week])').evaluateAll(ns => ns.map(n => n.getAttribute('data-week')));
  check(wks.join() === THIS, '7 · one week — this week', wks.join());
  if (process.env.SHOTS) await card.screenshot({ path: `${process.env.SHOTS}/rib-dash.png` });
  await card.locator('[data-week-card-open]').click();
  await page.waitForTimeout(800);
  check(page.url().endsWith('/jobs'), '7 · Open the full notebook goes to the Job Board', page.url());
}

console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
await b.close();
process.exit(fails ? 1 : 0);
