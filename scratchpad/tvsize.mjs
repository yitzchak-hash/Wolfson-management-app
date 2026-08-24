// The TV Size Plan's standing proof (sealed plan, B6).
//
// The probe that exposed the dead red button (tvboostprobe.mjs) becomes the
// test: at the owner's own geometry — a 2560-wide frame, where autoScale is
// 1.6 and the old per-element caps were already saturated — the display size
// must now move the picture IN PROPORTION. Plus the rest of the sealed
// contract: a stale ?scale= in the address bar loses to the saved per-panel
// size, the wall answers a size change with the old → new chip, the ceiling
// holds at 300%, and the test pattern draws.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok ${name}`); }
  else { fail++; console.log(`FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
};

function seed(sc) {
  return (s) => {
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('tv_screen_id', 'TVS-probe1');
    localStorage.setItem('general_app_data', JSON.stringify({
      apartments: [], stages: [], contractors: [], contractorAssignments: [],
      canvasElements: [
        { id: 'CE-d1', type: 'widget', widget: 'count-by-stage', board: '__tvdash', x: 0, y: 0, w: 400, h: 300, z: 1, text: '', color: '#ffffff', data: {} },
        { id: 'CE-d2', type: 'widget', widget: 'clock', board: '__tvdash', x: 0, y: 0, w: 400, h: 300, z: 2, text: '', color: '#ffffff', data: {} },
      ],
      boardSettings: { __tv: { tvScreens: { 'TVS-probe1': { scale: s } } } },
    }));
  };
}

async function measure(scaleSetting, { url = 'http://localhost:5173/tv?view=dashboard' } = {}) {
  const ctx = await b.newContext({ viewport: { width: 2560, height: 1240 } });
  await ctx.addInitScript(seed(scaleSetting), scaleSetting);
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForTimeout(3000);
  const out = await page.evaluate(() => {
    // The card grid is inside the zoom wrapper; measure a card's VISUAL box —
    // getBoundingClientRect folds the layout zoom in.
    const cards = [...document.querySelectorAll('div.relative.group.bg-white.rounded-2xl')];
    const card = cards[0] ?? null;
    const label = card?.querySelector('div,span');
    return {
      pct: (document.body.innerText.match(/(\d+)%/) || [])[1],
      cardH: card ? Math.round(card.getBoundingClientRect().height) : null,
      cardW: card ? Math.round(card.getBoundingClientRect().width) : null,
      labelH: label ? Math.round(label.getBoundingClientRect().height * 10) / 10 : null,
      cards: cards.length,
    };
  });
  await ctx.close();
  return out;
}

// ── 1 · Proportionality at the dead-button geometry ──
// 0.9 → 1.8 must double the drawn card, not add 11% and freeze.
const at09 = await measure(0.9);
const at18 = await measure(1.8);
console.log('at 0.9:', JSON.stringify(at09));
console.log('at 1.8:', JSON.stringify(at18));
ok(at09.cardH != null && at18.cardH != null, 'cards drawn at both sizes');
if (at09.cardH && at18.cardH) {
  const ratio = at18.cardH / at09.cardH;
  ok(Math.abs(ratio - 2) < 0.1, `doubling the size doubles the card (ratio ${ratio.toFixed(2)})`);
}

// ── 2 · A stale ?scale= loses to the saved per-panel size ──
const stale = await measure(1.8, { url: 'http://localhost:5173/tv?view=dashboard&scale=0.7' });
ok(at18.cardH && stale.cardH && Math.abs(stale.cardH - at18.cardH) < 4,
  `saved size beats a stale ?scale= (card ${stale.cardH} vs ${at18.cardH})`);

// ── 3 · The ceiling holds at 300% ──
const over = await measure(9);
ok(over.pct === '300', `a saved 900% clamps to the 300% ceiling (bar shows ${over.pct}%)`);

// ── 4 · The chip, the test pattern, and the + ceiling, live on one panel ──
{
  const ctx = await b.newContext({ viewport: { width: 2560, height: 1240 } });
  await ctx.addInitScript(seed(1), 1);
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/tv?view=dashboard');
  await page.waitForTimeout(3000);

  ok(await page.locator('[data-size-note]').count() === 0, 'no chip on first load');

  // Press + : the size changes and the wall answers.
  await page.locator('button[title*="Bigger"], button[title="Bigger"]').first().click();
  await page.waitForTimeout(400);
  const chip = page.locator('[data-size-note]');
  ok(await chip.count() === 1, 'chip appears on a size change');
  if (await chip.count()) {
    const words = await chip.innerText();
    ok(/100%\s*→\s*110%/.test(words.replace(/\s+/g, ' ')), `chip says old → new (${words.trim()})`);
  }
  await page.waitForTimeout(4800);
  ok(await chip.count() === 0, 'chip goes by itself');

  // The + button ceiling: from 290% one press lands on 300 and stays.
  await page.evaluate(() => { /* nothing — the next presses walk it up */ });
  for (let i = 0; i < 25; i++) {
    await page.locator('button[title*="Bigger"], button[title="Bigger"]').first().click();
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(500);
  const barPct = await page.evaluate(() =>
    (document.body.innerText.match(/(\d+)%/) || [])[1]);
  ok(barPct === '300', `holding + stops at the 300% ceiling (shows ${barPct}%)`);

  // The test pattern: the PX button draws it; a tap dismisses it.
  await page.locator('button:has-text("PX")').first().click();
  await page.waitForTimeout(300);
  ok(await page.locator('[data-test-pattern]').count() === 1, 'test pattern draws');
  ok((await page.locator('[data-test-pattern]').innerText()).includes('16 px'),
    'test pattern carries the 16px sample row');
  await page.locator('[data-test-pattern]').click();
  await page.waitForTimeout(300);
  ok(await page.locator('[data-test-pattern]').count() === 0, 'a tap dismisses the pattern');

  await ctx.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
