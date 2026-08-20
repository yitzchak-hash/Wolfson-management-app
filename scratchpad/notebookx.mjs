// The X on a notebook card, and what a drag off the notebook means.
//
// The rule the office asked for:
//   · X on a job's LAST square      → ask: put it back on the board, or leave it
//   · X on one of SEVERAL squares   → just remove that square, no question
//   · drag off + "take it off"      → the same question as the first case
//
// Every check reads the STORE. "The card disappeared" and "the job went back to
// the board" are two different claims and only one of them was the complaint.
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
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const job = (i, extra) => ({
    id: `G-n${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: `Notebook job ${i}`, address: 'Somewhere 1',
    isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {},
    canvasX: 170, canvasY: 40 + i * 145,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    ...extra,
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [],
    apartments: [
      // ONE square only — the X on this must ask.
      job(0, { inNotebook: 'CE-book' }),
      // TWO squares — the X on either must NOT ask.
      job(1, { inNotebook: 'CE-book' }),
    ],
    canvasElements: [
      { id: 'CE-book', type: 'widget', widget: 'rota',
        x: 620, y: 40, w: 820, h: 420, text: '', color: '#ffffff',
        data: {
          people: ['n:Moshe', 'n:Dovid'],
          firstWeek: '2026-08-16', weekCount: 1, span: 5,
          cells: {
            'n:Moshe|2026-08-17': [{ id: 'e-solo', jobId: 'G-n0' }],
            'n:Moshe|2026-08-18': [{ id: 'e-twin-a', jobId: 'G-n1' }],
            'n:Dovid|2026-08-19': [{ id: 'e-twin-b', jobId: 'G-n1' }],
          },
        } },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3800);

/** The notebook's cells and each job's inNotebook flag, from the store. */
const state = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  const el = (d.canvasElements ?? []).find(e => e.id === 'CE-book');
  const cells = {};
  for (const [k, list] of Object.entries(el?.data?.cells ?? {})) {
    cells[k] = (list ?? []).map(e => e.jobId ?? `"${e.text ?? ''}"`);
  }
  const flags = {};
  for (const a of d.apartments ?? []) flags[a.id] = a.inNotebook ?? null;
  return { cells, flags, squares: Object.values(cells).flat().length };
});

/** The X on the card holding `jobId`, if the notebook is drawing one. */
async function pressX(jobId) {
  const hit = await page.evaluate(id => {
    const w = document.querySelector('[data-node-id="CE-book"]');
    for (const card of w.querySelectorAll('.planner-card')) {
      if (!new RegExp(id.replace('G-n', 'Notebook job ')).test(card.textContent ?? '')) continue;
      const x = card.querySelector('[data-card-action]');
      if (!x) return 'no X on the card';
      // Hover-revealed: the button is there but transparent until the pointer
      // is on the card, and a click through Playwright would be refused.
      const r = x.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return 'no card for that job';
  }, jobId);
  if (typeof hit === 'string') return hit;
  await page.mouse.move(hit.x, hit.y);
  await page.waitForTimeout(120);
  await page.mouse.click(hit.x, hit.y);
  await page.waitForTimeout(600);
  return 'pressed';
}

/**
 * Is a real DIALOG on screen — not the toast.
 *
 * The first version matched the words "Back on the board", which is also what
 * the toast says, so a removal that asked NOTHING read as a question having
 * been asked. A dialog is a modal with the two choices as buttons.
 */
const dialog = () => page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
    .map(b => (b.textContent ?? '').replace(/\s+/g, ' ').trim());
  const off = btns.find(t => /take it off the notebook/i.test(t));
  const stay = btns.find(t => /leave it where it was/i.test(t));
  return { asking: !!off && !!stay, off: off ?? '', stay: stay ?? '' };
});

const start = await state();
console.log('       start:', JSON.stringify(start));
check(start.squares === 3, 'three squares to begin with', `${start.squares}`);

// ── 1. The X on one of SEVERAL squares: no question, just goes ────────────
{
  const before = await state();
  const r = await pressX('G-n1');
  check(r === 'pressed', 'the twin card has an X', r);
  const dlg = await dialog();
  const after = await state();
  console.log('       after X on a twin:', JSON.stringify(after), JSON.stringify(dlg));
  check(!dlg.asking, 'it does NOT ask — the job is still in the notebook elsewhere', JSON.stringify(dlg));
  check(after.squares === before.squares - 1, 'and the square really goes',
    `${before.squares} → ${after.squares}`);
  check(after.flags['G-n1'] === 'CE-book', 'the job stays IN the notebook', String(after.flags['G-n1']));
}

// ── 2. The X on a job's LAST square: it asks ──────────────────────────────
{
  const before = await state();
  const r = await pressX('G-n0');
  check(r === 'pressed', 'the solo card has an X', r);
  const dlg = await dialog();
  const mid = await state();
  console.log('       after X on the last square:', JSON.stringify(mid), JSON.stringify(dlg));
  check(dlg.asking, 'it ASKS before taking the job off the notebook', JSON.stringify(dlg));
  check(mid.squares === before.squares, 'and nothing has changed yet', `${before.squares} → ${mid.squares}`);

  // Choosing "put it back on the board" must do BOTH things.
  const pressed = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(x => /take it off the notebook/i.test(x.textContent ?? ''));
    if (!btn) return false;
    btn.click();
    return true;
  });
  check(pressed, 'there is a "take it off the notebook" choice');
  await page.waitForTimeout(800);
  const after = await state();
  console.log('       after choosing put-it-back:', JSON.stringify(after));
  check(after.squares === before.squares - 1, 'the square goes', `${before.squares} → ${after.squares}`);
  check(after.flags['G-n0'] === null, 'and the job is back on the board (inNotebook cleared)',
    String(after.flags['G-n0']));
  const onBoard = await page.$('[data-node-id="G-n0"]');
  check(!!onBoard, 'its tile is drawn on the board again');
}

// ── 3. The toast does not outstay its welcome ─────────────────────────────
{
  const gone = await page.evaluate(async () => {
    const seen = !!document.querySelector('.toast');
    await new Promise(r => setTimeout(r, 1800));
    return { seen, after1800: !!document.querySelector('.toast') };
  });
  console.log('       toast:', JSON.stringify(gone));
  check(!gone.after1800, 'the toast is gone well inside two seconds', JSON.stringify(gone));
}

await page.screenshot({ path: 'scratchpad/notebookx.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
