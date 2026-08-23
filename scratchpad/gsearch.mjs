// The header search: every workspace, recent searches, and the reveal button.
//
// It searched only whichever workspace happened to be open, because it read
// the live store and nothing else. Seeded with a job in EACH workspace whose
// name only exists there, so a result appearing at all proves the search
// crossed a boundary rather than getting lucky.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });

await ctx.addInitScript(() => {
  const user = { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const base = (id, extra) => ({
    id, buildingId: 'G', floor: 0, apartmentNumber: '',
    isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
    currentStageId: null, stageDates: {}, canvasX: 200, canvasY: 300,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', ...extra,
  });
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('netiv_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.removeItem('search_recent');

  if (!localStorage.getItem('general_app_data')) {
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser: user, stages: [],
      apartments: [base('G-s1', { displayName: 'Zambini Boardjob' })],
      canvasElements: [],
    }));
  }
  // A unit whose family name exists ONLY in Wolfson, and one only in Netiv.
  if (!localStorage.getItem('wolfson_app_data')) {
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      currentUser: user, stages: [],
      apartments: [base('A1-9', { buildingId: 'A1', floor: 3, apartmentNumber: '9',
        displayName: 'Zambini Wolfsonfamily' })],
      buildings: [{ id: 'A1', name: 'A1' }],
      canvasElements: [],
    }));
  }
  if (!localStorage.getItem('netiv_app_data')) {
    localStorage.setItem('netiv_app_data', JSON.stringify({
      currentUser: user, stages: [],
      apartments: [base('B1-4', { buildingId: 'B1', floor: 2, apartmentNumber: '4',
        displayName: 'Zambini Netivfamily' })],
      buildings: [{ id: 'B1', name: 'B1' }],
      canvasElements: [],
    }));
  }
});

const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3800);

/** Open the header search and type. */
async function search(q) {
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(500);
  if (q) {
    await page.keyboard.type(q, { delay: 25 });
    await page.waitForTimeout(900);
  }
}
const rows = () => page.evaluate(() => {
  const panel = [...document.querySelectorAll('div')]
    .find(d => d.className.includes('max-h-80') && d.className.includes('overflow-y-auto'));
  if (!panel) return [];
  return [...panel.children].map(r => ({
    text: (r.textContent ?? '').replace(/\s+/g, ' ').trim(),
    reveal: !!r.querySelector('button[title]'),
  }));
});
const close = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); };

// ── 1. It reaches every workspace ────────────────────────────────────────
{
  await search('Zambini');
  const r = await rows();
  console.log('       rows:', JSON.stringify(r.map(x => x.text.slice(0, 70)), null, 0));
  check(r.length >= 3, 'a name in all three workspaces returns three rows', String(r.length));
  check(r.some(x => /Boardjob/.test(x.text)), 'the Job Board one is there');
  check(r.some(x => /Wolfsonfamily/.test(x.text)), 'the WOLFSON one is there — a different workspace');
  check(r.some(x => /Netivfamily/.test(x.text)), 'and the NETIV one');
  check(r.some(x => /Wolfson/.test(x.text) && /Building A1/.test(x.text)),
    'and each row says which workspace and building it is in',
    r.find(x => /Wolfsonfamily/.test(x.text))?.text ?? '');
}

// ── 2. The reveal button is offered outside the Job Board ────────────────
{
  const r = await rows();
  const wolf = r.find(x => /Wolfsonfamily/.test(x.text));
  check(!!wolf?.reveal, 'the "show me where it is" button is on a result from another workspace',
    JSON.stringify(wolf));
  await close();
}

// ── 3. Recent searches ───────────────────────────────────────────────────
{
  await search('Zambini');
  // Choosing a row is what records the search.
  await page.evaluate(() => {
    const panel = [...document.querySelectorAll('div')]
      .find(d => d.className.includes('max-h-80'));
    panel?.firstElementChild?.click();
  });
  await page.waitForTimeout(1200);

  await search('');
  const recent = await page.evaluate(() => {
    const t = document.body.innerText;
    const stored = JSON.parse(localStorage.getItem('search_recent') ?? '[]');
    return { shown: /Recent searches/i.test(t) && /Zambini/.test(t), stored };
  });
  console.log('       recent:', JSON.stringify(recent));
  check(recent.stored.includes('Zambini'), 'the search is remembered on this machine',
    JSON.stringify(recent.stored));
  check(recent.shown, 'and an empty box shows it back');

  // Pressing one puts it in the box.
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find(x => (x.textContent ?? '').trim() === 'Zambini')?.click());
  await page.waitForTimeout(800);
  const back = await rows();
  check(back.length >= 3, 'and pressing it runs the search again', String(back.length));
  await close();
}

// ── 4. Choosing another workspace's unit switches workspace ──────────────
{
  await search('Wolfsonfamily');
  const r = await rows();
  check(r.length >= 1, 'the Wolfson unit is found from the Job Board', String(r.length));
  await page.evaluate(() => {
    const panel = [...document.querySelectorAll('div')].find(d => d.className.includes('max-h-80'));
    panel?.firstElementChild?.click();
  });
  await page.waitForTimeout(2500);
  const landed = await page.evaluate(() => ({
    path: location.pathname,
    project: localStorage.getItem('active_project'),
    drawer: !!document.querySelector('.drawer-panel'),
  }));
  console.log('       landed:', JSON.stringify(landed));
  check(landed.project === 'wolfson', 'choosing it switches to that workspace', String(landed.project));
  check(landed.path === '/project', 'and lands on the building diagram, not the board', landed.path);
  check(landed.drawer, 'with the unit open');
}

// ── 5. The crosshair SHOWS it without opening it ─────────────────────────
{
  await page.keyboard.press('Escape');            // close the drawer we just opened
  await page.waitForTimeout(400);
  await search('Wolfsonfamily');
  const pressed = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('div')].find(d => d.className.includes('max-h-80'));
    const btn = panel?.firstElementChild?.querySelector('button[title]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  check(pressed, '5 · the crosshair is pressable');
  await page.waitForTimeout(2200);
  const after = await page.evaluate(() => ({
    drawer: !!document.querySelector('.drawer-panel'),
    // The revealed cell is the one the diagram is highlighting.
    lifted: [...document.querySelectorAll('[data-apt-id]')]
      .filter(el => el.className.includes('scale-')).map(el => el.dataset.aptId),
  }));
  console.log('       reveal:', JSON.stringify(after));
  check(!after.drawer, '5 · it does NOT open the drawer — it shows where the unit is');
  check(after.lifted.includes('A1-9'), '5 · and the cell itself is picked out',
    JSON.stringify(after.lifted));
}

await page.screenshot({ path: 'scratchpad/gsearch.png' });
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
