// A pin board that lost its cards (owner, 2026-10-29: the secretary's board
// "just disappeared", and undo said nothing). Built from pinboard-probe's seed.
// Was: The pin board (owner, 2026-10-13): a cork board with a handwritten title;
// jobs dragged onto it are PINNED there, move about inside it, come off onto
// the board again, and handwritten notes can be pinned beside them.
// No real client family names.
import { chromium } from 'playwright';

const APP = process.env.APP ?? 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const job = (i, x, y) => ({
    id: `G-p${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: `Pin test job ${i}`, address: 'Somewhere 1',
    isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
    currentStageId: 'gs1', stageDates: {}, canvasX: x, canvasY: y,
    contentUpdatedAt: '2026-08-10T09:00:00.000Z',
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  localStorage.setItem('pin_board_versions', JSON.stringify({ 'CE-pins': [{ at: '2026-10-28T09:00:00.000Z', pins: [
    { id: 'PN-a', jobId: 'G-p1', x: 0.3, y: 0.4, rot: 1 }, { id: 'PN-b', jobId: 'G-p2', x: 0.5, y: 0.4, rot: -1 },
    { id: 'PN-c', jobId: 'G-p3', x: 0.7, y: 0.5, rot: 2 }, { id: 'PN-n', text: 'Call the gypsum guy', x: 0.6, y: 0.75, rot: -2 },
  ] }] }));
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'gs1', name: 'AC installation', color: '#0ea5e9', order: 1, active: true, projectId: 'general', description: '', createdAt: '', updatedAt: '' }],
    apartments: [{ ...job(1, 60, 260), inNotebook: 'CE-pins' }, { ...job(2, 60, 460), inNotebook: 'CE-pins' }, job(3, 60, 660)],
    canvasElements: [
      { id: 'CE-pins', type: 'widget', widget: 'pin-board', x: 520, y: 220, w: 520, h: 360, text: '', color: '#fff', data: {} },
      { id: 'CE-list', type: 'widget', widget: 'job-list', x: 1120, y: 220, w: 235, h: 300, text: '', color: '#fff', data: {} },
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 3000, y: 3000, w: 200, h: 120, text: '', color: '#fff', data: {} },
    ],
  }));
});

const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(5000);
const stored = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  const pb = (d.canvasElements ?? []).find(e => e.id === 'CE-pins');
  return { pins: pb?.data?.pins ?? [], held: Object.fromEntries((d.apartments ?? []).map(a => [a.id, a.inNotebook ?? null])) };
});
let s = await stored();
const jobsOn = s.pins.filter(p => p.jobId).map(p => p.jobId).sort().join(',');
check(jobsOn === 'G-p1,G-p2', 'jobs the board was holding with no card are put back on it', jobsOn);
check(await page.locator('[data-pin-card="G-p1"]').count() === 1 && await page.locator('[data-pin-card="G-p2"]').count() === 1, 'and they show on the cork');
check(await page.locator('[data-pin-card="G-p3"]').count() === 0, 'a job the board never held is left on the main board');

// The undo list now has the repair in it.
await page.locator('[data-undo-history]').first().click();
await page.waitForTimeout(300);
const hist = (await page.locator('body').textContent()) ?? '';
check(/Put 2 jobs back on the pin board/.test(hist), 'the undo list names the repair');
await page.keyboard.press('Escape'); await page.mouse.click(5, 500); await page.waitForTimeout(200);

// The history button: an earlier version kept on this computer brings back the rest.
check(await page.locator('[data-pin-history]').count() === 1, 'the board shows its history button (an earlier version has more on it)');
await page.locator('[data-pin-history]').click();
await page.waitForTimeout(300);
const ptxt = (await page.locator('[data-pin-history-panel]').textContent()) ?? '';
check(/1 job/.test(ptxt) && /1 note/.test(ptxt), 'the version says what it would bring back', ptxt);
await page.locator('[data-pin-version-restore]').first().click();
await page.waitForTimeout(800);
s = await stored();
check(s.pins.some(p => p.jobId === 'G-p3' && Math.abs(p.x - 0.7) < 0.01), 'the missing job comes back where it was', JSON.stringify(s.pins.find(p => p.jobId === 'G-p3')));
check(s.pins.some(p => p.text === 'Call the gypsum guy'), 'the lost note comes back');
check(s.held['G-p3'] === 'CE-pins' && await page.locator('[data-node-id="G-p3"]').count() === 0, 'the restored job leaves the main board, as a pin does');
check(s.pins.filter(p => p.jobId === 'G-p1').length === 1, 'nothing is doubled');
check(await page.locator('[data-pin-history]').count() === 0, 'with nothing left to bring back, the history button goes');

// Undo takes the bring-back off again.
await page.keyboard.press('Control+z');
await page.waitForTimeout(600);
// A bring-back puts content back, so its undo asks first (the undo layer's rule).
const askBox = page.locator('div.fixed.inset-0.z-\\[250\\]');
check(await askBox.count() === 1, 'the undo asks first, naming what it does', ((await askBox.textContent().catch(() => '')) ?? '').slice(0, 90));
await askBox.locator('button').last().click();
await page.waitForTimeout(700);
s = await stored();
check(!s.pins.some(p => p.text === 'Call the gypsum guy'), 'Ctrl+Z takes the bring-back off again', JSON.stringify(s.pins.map(p => p.jobId || p.text)));

// A reload keeps the version history on this computer.
await page.reload(); await page.waitForTimeout(4500);
check(await page.locator('[data-pin-history]').count() === 1, 'after a reload the earlier version is still offered');
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
