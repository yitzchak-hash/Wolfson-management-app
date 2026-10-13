// "Search with AI" in the header search (keyed server on 5174; /api/geocode stubbed).
import { chromium } from 'playwright';
const APP = 'http://localhost:5174';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const seed = () => {
  localStorage.setItem('active_project', 'general'); localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01'); localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const job = (id, name, x) => ({ id, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: name, isUnnamed: false,
    isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, canvasX: x, canvasY: 300,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [job('G-k', 'Kitchen VRF job', 80), job('G-r', 'Roof units', 340)],
    canvasElements: [{ id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 3000, y: 3000, w: 200, h: 120, text: '', color: '#fff', data: {} }],
  }));
};
async function run(status) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(seed);
  let asked = 0, sent = null;
  await ctx.route('**/api/geocode', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.searchAi) {
      asked++; sent = { body: body.searchAi, key: route.request().headers()['x-api-key'] };
      if (status !== 200) return route.fulfill({ status, contentType: 'application/json', body: '{"error":"no key"}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ terms: ['Kitchen VRF', 'VRF'] }) });
    }
    return route.fulfill({ status: 501, contentType: 'application/json', body: '{}' });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/jobs`);
  await page.waitForTimeout(3500);
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  await page.keyboard.type('zzqx refit');
  await page.waitForTimeout(500);
  return { page, ctx, asked: () => asked, sent: () => sent };
}
{
  const { page, ctx, asked, sent } = await run(200);
  const btn = page.locator('[data-search-ai]');
  check(await btn.count() === 1, 'the Search-with-AI row shows for a question the index cannot answer');
  const dlg = page.locator('div.max-w-xl');
  check(!(await dlg.locator('text=Kitchen VRF job').count()), 'the local index alone finds nothing');
  await btn.click();
  await page.waitForTimeout(900);
  check(asked() === 1 && sent()?.body?.q === 'zzqx refit' && sent()?.key === 'test-key', 'one call, the typed words only, with the app key', JSON.stringify(sent()));
  check(await dlg.locator('text=Kitchen VRF job').count() >= 1, 'the AI spelling finds the job through the same index');
  const why = await page.locator('[data-search-why]').first().textContent().catch(() => '');
  check(/AI found it as/.test(why ?? ''), 'the row says the AI found it', why);
  check(/Kitchen VRF/.test(await page.locator('[data-search-ai-terms]').textContent()), 'the other spellings are shown');
  check(await btn.count() === 0, 'the button goes once used for this question');
  await page.keyboard.press('Backspace'); await page.keyboard.type('t');
  await page.waitForTimeout(400);
  check(await page.locator('[data-search-ai]').count() === 0 && await dlg.locator('text=Kitchen VRF job').count() >= 1, 'typing back to the same words keeps the AI finds');
  await page.keyboard.type('x');
  await page.waitForTimeout(400);
  { const bc = await page.locator('[data-search-ai]').count(), fc = await dlg.locator('text=Kitchen VRF job').count(), v = await page.locator('div.max-w-xl input').inputValue(); check(bc === 1 && !fc, 'new words drop the old AI finds and offer the button again', `${bc} ${fc} ${v}`); }
  await ctx.close();
}
{
  const { page, ctx } = await run(501);
  await page.locator('[data-search-ai]').click();
  await page.waitForTimeout(700);
  check(await page.locator('[data-search-ai]').count() === 0, 'without a key on the server the button stands down for the visit');
  await ctx.close();
}
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
