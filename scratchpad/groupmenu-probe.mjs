// Inside a group: Ctrl/Shift-click builds a selection, and right-clicking a
// job brings the FULL menu — move straight to another group (its stage set
// too), move to Trash, lock, wallboard, put back — without the board first.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 960 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const job = (i, extra) => ({
    id: `G-g${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: `Test job ${i}`, address: 'Somewhere 1',
    isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
    currentStageId: 'gs1', stageDates: {}, contentUpdatedAt: '2026-08-10T09:00:00.000Z',
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', ...extra,
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [
      { id: 'gs1', name: 'AC installation', color: '#0ea5e9', order: 1, active: true, projectId: 'general', description: '', createdAt: '', updatedAt: '' },
      { id: 'gs2', name: 'Ready to start', color: '#22c55e', order: 2, active: true, projectId: 'general', description: '', createdAt: '', updatedAt: '' },
    ],
    apartments: [0, 1, 2, 3, 4].map(i => job(i, { boardBin: 'CE-bin-mine', binnedAt: '2026-01-01', binX: 20 + (i % 3) * 260, binY: 40 + Math.floor(i / 3) * 170 })),
    canvasElements: [
      { id: 'CE-bin-mine', type: 'bin', x: 420, y: 260, w: 178, h: 92, text: 'Currently in AC', color: '#f97316' },
      { id: 'CE-bin-geves', type: 'bin', x: 640, y: 260, w: 178, h: 92, text: 'Currently in Geves', color: '#8b5cf6', stageId: 'gs2' },
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 3000, y: 3000, w: 200, h: 120, text: '', color: '#fff', data: {} },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
page.on('dialog', d => d.accept());
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3600);

const stored = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  return Object.fromEntries((d.apartments ?? []).map(a => [a.id, { bin: a.boardBin ?? null, stage: a.currentStageId, lock: !!a.boardLocked, tv: a.showOnTv }]));
});
const tile = id => page.locator(`.bin-window-in [data-node-id="${id}"]`);
const mid = async id => { const r = await tile(id).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 + 10 }; };

// Open the hand-made group.
{
  const bb = await page.locator('[data-node-id="CE-bin-mine"]').boundingBox();
  await page.mouse.dblclick(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForTimeout(1000);
  check(await tile('G-g0').count() === 1, 'the group window opens with its jobs');
}

// ── 1 · Ctrl / Shift click builds a selection ───────────────────────────
const isPicked = id => page.evaluate(id => (document.querySelector(`.bin-window-in [data-node-id="${id}"]`)?.style.border || '').includes('rgb(74, 168, 216)'), id);
{
  let p = await mid('G-g0'); await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(150);
  p = await mid('G-g1'); await page.keyboard.down('Control'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Control');
  await page.waitForTimeout(150);
  p = await mid('G-g2'); await page.keyboard.down('Shift'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Shift');
  await page.waitForTimeout(250);
  const picks = [await isPicked('G-g0'), await isPicked('G-g1'), await isPicked('G-g2'), await isPicked('G-g3')];
  check(picks.join() === 'true,true,true,false', 'click, Ctrl+click and Shift+click pick three jobs', picks.join());
  p = await mid('G-g1'); await page.keyboard.down('Control'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Control');
  await page.waitForTimeout(200);
  check(!(await isPicked('G-g1')) && await isPicked('G-g0'), 'Ctrl+click on a picked job takes only that one out');
  p = await mid('G-g1'); await page.keyboard.down('Control'); await page.mouse.click(p.x, p.y); await page.keyboard.up('Control');
  await page.waitForTimeout(200);
}

// ── 2 · right-click a picked job: the full menu, the selection kept ─────
{
  const p = await mid('G-g1');
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.waitForTimeout(350);
  const menu = page.locator('[data-group-menu="job"]');
  check(await menu.count() === 1, 'right-click on a job opens the job menu');
  const txt = (await menu.textContent()) ?? '';
  console.log('       menu:', txt.replace(/\s+/g, ' ').slice(0, 260));
  check(/3 selected/i.test(txt), 'it says 3 selected (the selection survived the right-click)');
  check(await menu.locator('[data-group-move-to="CE-bin-geves"]').count() === 1, 'it lists the other hand-made group');
  check(await menu.locator('[data-group-move-to="CE-bin-mine"]').count() === 0, 'and not the group you are in');
  check(/Move to Trash \(3\)/.test(txt), 'Move to Trash for all three');
  check(/Lock in place/.test(txt) && /wallboard/.test(txt) && /Put back on the board/.test(txt) && /Arrange/.test(txt), 'lock, wallboard, put back and arrange are there');
  const r = await menu.boundingBox();
  check(r.y >= 0 && r.y + r.height <= 960 && r.x + r.width <= 1440, 'the menu fits on the screen', JSON.stringify(r));
  await menu.locator('[data-group-move-to="CE-bin-geves"]').click();
  await page.waitForTimeout(500);
  const s = await stored();
  check(['G-g0', 'G-g1', 'G-g2'].every(id => s[id].bin === 'CE-bin-geves'), 'the three moved straight into the other group', JSON.stringify(s));
  check(['G-g0', 'G-g1', 'G-g2'].every(id => s[id].stage === 'gs2'), 'that group stands for a stage, so they took its stage');
  check(s['G-g3'].bin === 'CE-bin-mine', 'the job that was not picked stayed');
  check(await tile('G-g0').count() === 0, 'they left this group window');
  const note = await page.locator('[data-group-filed]').textContent().catch(() => '');
  check(/Moved 3 things to Currently in Geves · stage set to Ready to start/.test(note ?? ''), 'a note says where they went', note);
}

// ── 3 · Ctrl+Z puts them back in this group ─────────────────────────────
{
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(600);
  // Undoing a CONTENT step asks first — and quotes what will happen.
  const said = await page.evaluate(() => {
    const yes = [...document.querySelectorAll('button')].find(b => /yes, do it/i.test(b.textContent ?? ''));
    const t = yes?.closest('div.bg-white')?.textContent ?? '';
    yes?.click();
    return t.replace(/\s+/g, ' ');
  });
  console.log('       undo asked:', said.slice(0, 200));
  check(/go back from Currently in Geves into Currently in AC/.test(said), 'the undo question says where they go back to');
  await page.waitForTimeout(700);
  const s = await stored();
  check(['G-g0', 'G-g1', 'G-g2'].every(id => s[id].bin === 'CE-bin-mine'), 'undo puts them back into this group', JSON.stringify(Object.values(s).map(x => x.bin)));
}

// ── 4 · one job straight to Trash, and lock / wallboard ─────────────────
{
  await page.waitForTimeout(400);
  let p = await mid('G-g3');
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.waitForTimeout(300);
  let menu = page.locator('[data-group-menu="job"]');
  check(!/selected/i.test((await menu.textContent()) ?? ''), 'a single job shows no count header');
  await menu.locator('text=Lock in place').click();
  await page.waitForTimeout(300);
  check((await stored())['G-g3'].lock, 'Lock in place locks it');
  p = await mid('G-g3');
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.waitForTimeout(300);
  menu = page.locator('[data-group-menu="job"]');
  check(/Unlock/.test((await menu.textContent()) ?? ''), 'and the menu then offers Unlock');
  await menu.locator('text=Hide from the wallboard').click();
  await page.waitForTimeout(300);
  check((await stored())['G-g3'].tv === false, 'Hide from the wallboard hides it');
  p = await mid('G-g4');
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.waitForTimeout(300);
  await page.locator('[data-group-menu="job"] [data-group-move-trash]').click();
  await page.waitForTimeout(400);
  const s = await stored();
  check(s['G-g4'].bin === 'trash', 'Move to Trash files it into Trash (nothing deleted)', JSON.stringify(s['G-g4']));
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')).apartments.length) === 5, 'all five jobs still exist');
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
