// Undo and redo on the board.
//
// The rule the owner asked for, in his words: placements just undo, and
// anything sensitive — notebook entries, removals, filing a job away — must
// first say in plain English exactly what it is about to do and be approved.
//
// Every check reads the STORE. "The tile went back" and "the screen redrew"
// are two different claims, and only the first one is the feature.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`);
  if (!ok) fails++;
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const job = (i, extra) => ({
    id: `G-u${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
    displayName: `Undo job ${i}`, address: 'Somewhere 1',
    isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {},
    canvasX: 320 + i * 260, canvasY: 300,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    ...extra,
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [],
    apartments: [job(0), job(1, { inNotebook: 'CE-book' })],
    canvasElements: [
      { id: 'CE-note1', type: 'note', x: 320, y: 560, w: 200, h: 160,
        text: 'A note that says something', color: '#fef3c7' },
      { id: 'CE-book', type: 'widget', widget: 'rota',
        x: 900, y: 520, w: 520, h: 300, text: '', color: '#ffffff',
        data: {
          people: ['n:Moshe'], firstWeek: '2026-08-16', weekCount: 1, span: 5,
          cells: { 'n:Moshe|2026-08-17': [{ id: 'e-1', jobId: 'G-u1' }] },
        } },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3800);

/** The board, from the store — never from the screen. */
const state = () => page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  const els = d.canvasElements ?? [];
  const book = els.find(e => e.id === 'CE-book');
  const squares = Object.values(book?.data?.cells ?? {}).flat().length;
  return {
    jobs: Object.fromEntries((d.apartments ?? []).map(a =>
      [a.id, { x: a.canvasX, y: a.canvasY, bin: a.boardBin ?? null, book: a.inNotebook ?? null }])),
    elIds: els.map(e => e.id).sort(),
    noteText: els.find(e => e.id === 'CE-note1')?.text ?? null,
    squares,
  };
});

/** Is a confirm dialog up, and what does it say? */
const asking = () => page.evaluate(() => {
  const yes = [...document.querySelectorAll('button')]
    .find(b => /yes, do it/i.test(b.textContent ?? ''));
  if (!yes) return null;
  const panel = yes.closest('div.bg-white');
  return {
    title: (panel?.querySelector('h3')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    body: [...(panel?.querySelectorAll('p') ?? [])]
      .map(p => (p.textContent ?? '').replace(/\s+/g, ' ').trim()).join(' | '),
  };
});
const approve = async () => {
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find(b => /yes, do it/i.test(b.textContent ?? ''))?.click());
  await page.waitForTimeout(700);
};
const cancel = async () => {
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find(b => /leave it as it is/i.test(b.textContent ?? ''))?.click());
  await page.waitForTimeout(400);
};

const undo = async () => { await page.keyboard.press('Control+z'); await page.waitForTimeout(650); };
const redo = async () => { await page.keyboard.press('Control+y'); await page.waitForTimeout(650); };

/** Where a tile is ON SCREEN — the board's pan and zoom are already in it. */
const tileAt = id => page.evaluate(i => {
  const n = document.querySelector(`[data-node-id="${i}"]`);
  if (!n) return null;
  const r = n.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, id);

const start = await state();
console.log('       start:', JSON.stringify(start.jobs));

// ── 1. A drag is `arrange`: it undoes with no question at all ─────────────
{
  const at = await tileAt('G-u0');
  check(!!at, 'the first tile is on screen');
  // Grab the MIDDLE — the tile's top strip is buttons, and a press up there is
  // a button press, which reads as "dragging does nothing".
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 180, at.y + 40, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700);

  const moved = await state();
  check(moved.jobs['G-u0'].x !== start.jobs['G-u0'].x, 'the drag really moved it',
    `${start.jobs['G-u0'].x} → ${moved.jobs['G-u0'].x}`);

  await undo();
  const q = await asking();
  check(!q, 'moving a tile does NOT ask before undoing', JSON.stringify(q));
  const back = await state();
  check(back.jobs['G-u0'].x === start.jobs['G-u0'].x
     && back.jobs['G-u0'].y === start.jobs['G-u0'].y,
    'and the tile is exactly back where it started',
    `${back.jobs['G-u0'].x},${back.jobs['G-u0'].y}`);

  await redo();
  const again = await state();
  check(again.jobs['G-u0'].x === moved.jobs['G-u0'].x,
    'redo puts it back where the drag left it',
    `${again.jobs['G-u0'].x} vs ${moved.jobs['G-u0'].x}`);
  await undo();   // leave the board tidy for the next case
}

// ── 2. Removing a note is `content`: it asks, and says what comes back ────
{
  const before = await state();
  page.once('dialog', d => d.accept());     // the existing "you will lose…" confirm
  const removed = await page.evaluate(() => {
    const n = document.querySelector('[data-node-id="CE-note1"]');
    if (!n) return 'no note on the board';
    const x = [...n.querySelectorAll('button')]
      .find(b => /remove/i.test(b.getAttribute('title') ?? ''));
    if (!x) return 'no remove button';
    x.click();
    return 'pressed';
  });
  check(removed === 'pressed', 'the note has a remove button', removed);
  await page.waitForTimeout(700);
  const gone = await state();
  check(!gone.elIds.includes('CE-note1'), 'the note is gone', gone.elIds.join(','));

  await undo();
  const q = await asking();
  check(!!q, 'undoing a removal ASKS first', JSON.stringify(q));
  check(/note|Removed/i.test(q?.title ?? ''), 'the question names what it is about to undo', q?.title);
  check(/comes back onto the board/i.test(q?.body ?? ''),
    'and explains, in plain English, what will happen', q?.body);

  // Saying no must change nothing.
  await cancel();
  const still = await state();
  check(!still.elIds.includes('CE-note1'), 'saying no leaves it removed');

  await undo();
  await approve();
  const backNow = await state();
  check(backNow.elIds.includes('CE-note1'), 'saying yes brings the note back',
    backNow.elIds.join(','));
  check(backNow.noteText === before.noteText,
    'with the words that were on it', String(backNow.noteText));
}

// ── 3. The notebook: taking a card off asks, and names the person and day ─
{
  const before = await state();
  check(before.squares === 1, 'the notebook has one card', String(before.squares));

  const pressed = await page.evaluate(() => {
    const w = document.querySelector('[data-node-id="CE-book"]');
    const card = w?.querySelector('.planner-card');
    const x = card?.querySelector('[data-card-action]');
    if (!x) return 'no X on the card';
    const r = x.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (typeof pressed === 'string') { check(false, 'the card has an X', pressed); }
  else {
    await page.mouse.move(pressed.x, pressed.y);
    await page.waitForTimeout(120);
    await page.mouse.click(pressed.x, pressed.y);
    await page.waitForTimeout(600);
    // Its last square, so the notebook asks its own put-it-back question first.
    await page.evaluate(() => [...document.querySelectorAll('button')]
      .find(b => /take it off the notebook/i.test(b.textContent ?? ''))?.click());
    await page.waitForTimeout(700);

    const off = await state();
    check(off.squares === 0, 'the card is off the notebook', String(off.squares));

    await undo();
    const q = await asking();
    check(!!q, 'undoing that ASKS', JSON.stringify(q));
    check(/notebook/i.test(q?.body ?? ''), 'and says it is about the notebook', q?.body);
    await approve();
    const back = await state();
    check(back.squares === 1, 'the card goes back on the day it was on',
      String(back.squares));
    check(back.jobs['G-u1'].book === 'CE-book',
      'and the job is in the notebook again', String(back.jobs['G-u1'].book));
  }
}

// ── 4. Typing in a field keeps its OWN undo ───────────────────────────────
{
  const kept = await page.evaluate(() => {
    const i = document.createElement('input');
    i.value = 'hello';
    document.body.appendChild(i);
    i.focus();
    let stolen = false;
    const spy = (e) => { if (e.defaultPrevented) stolen = true; };
    window.addEventListener('keydown', spy);
    i.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z', ctrlKey: true, bubbles: true, cancelable: true,
    }));
    window.removeEventListener('keydown', spy);
    i.remove();
    return !stolen;
  });
  check(kept, 'Ctrl+Z inside a text field is left to the browser');
}

// ── 5. The buttons say what they would take back ──────────────────────────
{
  // Put two steps on the stack first: one that just undoes, and one that asks.
  // Reading the titles on an EMPTY stack answers "Nothing to undo", which is
  // correct and tells you nothing.
  const at = await tileAt('G-u0');
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 90, at.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);

  const arrangeTitles = await page.evaluate(() => [...document.querySelectorAll('button')]
    .map(b => b.getAttribute('title')).filter(t => /^(Undo|Redo|Nothing to)/.test(t ?? '')));
  console.log('       after a drag:', JSON.stringify(arrangeTitles));
  check(arrangeTitles.some(t => /^Undo: Moved /.test(t ?? '')),
    'the undo button names the step it would take back', arrangeTitles.join(' / '));

  // Now a content step, so the button can warn that it will ask.
  page.once('dialog', d => d.accept());
  await page.evaluate(() => {
    const n = document.querySelector('[data-node-id="CE-note1"]');
    [...(n?.querySelectorAll('button') ?? [])]
      .find(b => /remove/i.test(b.getAttribute('title') ?? ''))?.click();
  });
  await page.waitForTimeout(700);

  const titles = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
      .filter(b => /^(Undo|Redo|Nothing to)/.test(b.getAttribute('title') ?? ''));
    return btns.map(b => b.getAttribute('title'));
  });
  console.log('       buttons:', JSON.stringify(titles));
  check(titles.length >= 2, 'there are undo and redo buttons on the board', String(titles.length));
  check(titles.some(t => /asks first/.test(t ?? '')),
    'a content step says so on the button before you press it', titles.join(' / '));

  // And the button is the same door as the key: it must raise the question too.
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find(b => /^Undo: /.test(b.getAttribute('title') ?? ''))?.click());
  await page.waitForTimeout(500);
  const q = await asking();
  check(!!q, 'pressing the undo BUTTON asks the same question the key does', JSON.stringify(q));
  await cancel();
}

await page.screenshot({ path: 'scratchpad/undoredo.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
