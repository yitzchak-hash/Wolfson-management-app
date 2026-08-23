// Does raising the per-screen scale visibly change the TV? Owner says no.
// Reproduce at his geometry: a 2560-wide frame (autoScale 1.6), dashboard view,
// boost 0.9 vs 1.6 — measure a card's real height and font.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function measure(scaleSetting) {
  const ctx = await b.newContext({ viewport: { width: 2560, height: 1240 } });
  await ctx.addInitScript(sc => {
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('tv_screen_id', 'TVS-probe1');
    localStorage.setItem('general_app_data', JSON.stringify({
      apartments: [], stages: [], contractors: [], contractorAssignments: [],
      canvasElements: [
        { id: 'CE-d1', type: 'widget', widget: 'count-by-stage', board: '__tvdash', x: 0, y: 0, w: 400, h: 300, z: 1, text: '', color: '#ffffff', data: {} },
        { id: 'CE-d2', type: 'widget', widget: 'clock', board: '__tvdash', x: 0, y: 0, w: 400, h: 300, z: 2, text: '', color: '#ffffff', data: {} },
      ],
      boardSettings: { __tv: { tvScreens: { 'TVS-probe1': { scale: sc } } } },
    }));
  }, scaleSetting);
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/tv?view=dashboard');
  await page.waitForTimeout(3000);
  const out = await page.evaluate(() => {
    const grid = document.querySelector('[class*="grid"]');
    const card = grid?.querySelector('[class*="rounded-2xl"]');
    return {
      pct: (document.body.innerText.match(/(\d+)%/) || [])[1],
      gridFont: grid ? getComputedStyle(grid).fontSize : null,
      cardH: card ? Math.round(card.getBoundingClientRect().height) : null,
    };
  });
  await ctx.close();
  return out;
}

// The TV_DASH_BOARD id — check the real constant first.
console.log('at scale 0.9:', JSON.stringify(await measure(0.9)));
console.log('at scale 1.6:', JSON.stringify(await measure(1.6)));
await b.close();
