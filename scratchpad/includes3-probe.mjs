// A stage's "includes" in three languages (owner, 2026-10-28): Settings → Stages
// gives each word an English, Hebrew and Russian box; the words are kept in
// `Stage.includesTr`; an existing word keeps its first-typed text in its own box.
import { chromium } from 'playwright';
const APP = process.env.APP ?? 'http://localhost:5173';
let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'wolfson'); localStorage.setItem('wolfson_app_version', '3'); localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('wolfson_app_data')) {
    const at = '2026-01-01T00:00:00Z', u = { id: 'U-t', name: 'Tester', code: '999999', role: 'Admin', active: true, createdAt: at };
    localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [u], currentUser: u, stages: [
      { id: 's1-piping', name: 'Piping', color: '#6366f1', order: 1, active: true, includes: ['Soldering'], createdAt: at, updatedAt: at },
    ] }));
  }
});
// The translator is stubbed (build with VITE_DRIVE_API_KEY set, or the AI button is rightly hidden).
const DICT = { 'en|צנרת': 'Piping', 'ru|צנרת': 'Трубы', 'he|Insulation': 'בידוד', 'ru|Insulation': 'Изоляция' };
await ctx.route('**/api/geocode', async r => {
  const body = JSON.parse(r.request().postData() || '{}').translate;
  await new Promise(res => setTimeout(res, 300));
  r.fulfill({ json: { items: body.items.map(it => ({ id: it.id, text: DICT[body.target + '|' + it.text] ?? null })) } });
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/settings`);
await page.waitForTimeout(2500);
if (!(await page.locator('[data-stage-includes="s1-piping"]').count())) {
  for (const t of ['Stages']) { const x = page.getByRole('button', { name: t }).first(); if (await x.count()) { await x.click(); await page.waitForTimeout(600); } }
}
const box = page.locator('[data-stage-includes="s1-piping"]');
check(await box.count() === 1, 'settings: the stage has its includes editor');
const heads = (await box.textContent()) ?? '';
check(/English/.test(heads) && /עברית/.test(heads) && /Русский/.test(heads), 'settings: three language columns');
check(await box.locator('[data-stage-include-word="Soldering"][data-lang="en"]').inputValue() === 'Soldering', 'an old word sits in its own language box');
await box.locator('[data-stage-include-word="Soldering"][data-lang="he"]').fill('הלחמה');
await box.locator('[data-stage-include-word="Soldering"][data-lang="he"]').press('Enter');
await box.locator('[data-stage-include-word="Soldering"][data-lang="ru"]').fill('Пайка');
await box.locator('[data-stage-include-word="Soldering"][data-lang="ru"]').press('Enter');
await box.locator('[data-stage-include-new="en"]').fill('Connections');
await box.locator('[data-stage-include-new="he"]').fill('חיבורים');
await box.locator('[data-stage-include-new="ru"]').fill('Соединения');
await box.locator('[data-stage-include-go]').click();
await page.waitForTimeout(600);
const st = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data') || '{}').stages.find(s => s.id === 's1-piping'));
check(JSON.stringify(st.includes) === '["Soldering","Connections"]', 'the words are kept in order', JSON.stringify(st.includes));
check(st.includesTr?.Soldering?.he === 'הלחמה' && st.includesTr?.Soldering?.ru === 'Пайка', 'an old word gets its Hebrew and Russian', JSON.stringify(st.includesTr?.Soldering));
check(st.includesTr?.Connections?.en === 'Connections' && st.includesTr?.Connections?.he === 'חיבורים' && st.includesTr?.Connections?.ru === 'Соединения', 'a new word is kept in all three', JSON.stringify(st.includesTr?.Connections));
await box.locator('[data-stage-include-remove="Soldering"]').click();
await page.waitForTimeout(400);
const st2 = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data') || '{}').stages.find(s => s.id === 's1-piping'));
check(JSON.stringify(st2.includes) === '["Connections"]' && !st2.includesTr?.Soldering, 'removing a word takes its translations too');
// The AI buttons (owner, 2026-10-28): type one language, the other two fill themselves on a press.
check(await box.locator('[data-ai-fill]').count() === 0, 'ai: no AI button where every box is filled');
await box.locator('[data-stage-include-new="he"]').fill('צנרת');
check(await box.locator('[data-ai-fill="en"]').count() === 1 && await box.locator('[data-ai-fill="ru"]').count() === 1
  && await box.locator('[data-ai-fill="he"]').count() === 0, 'ai: the two empty boxes of the new word show the AI button');
const inside = await box.evaluate(el => { const btn = el.querySelector('[data-ai-fill="en"]').getBoundingClientRect(); const inp = el.querySelector('[data-stage-include-new="en"]').getBoundingClientRect();
  return btn.left >= inp.left && btn.right <= inp.right && btn.top >= inp.top && btn.bottom <= inp.bottom; });
check(inside, 'ai: the button sits INSIDE its box');
await box.locator('[data-ai-fill="en"]').click();
check(await box.locator('[data-ai-fill="en"][data-ai-busy="1"]').count() === 1, 'ai: it spins while the translation is on its way');
await page.waitForTimeout(800);
check(await box.locator('[data-stage-include-new="en"]').inputValue() === 'Piping', 'ai: the English box filled itself',
  await box.locator('[data-stage-include-new="en"]').inputValue());
await box.locator('[data-ai-fill="ru"]').click();
await page.waitForTimeout(800);
check(await box.locator('[data-stage-include-new="ru"]').inputValue() === 'Трубы', 'ai: the Russian box filled itself');
await box.locator('[data-stage-include-go]').click();
await page.waitForTimeout(500);
await box.locator('[data-stage-include-new="en"]').fill('Insulation');
await box.locator('[data-stage-include-go]').click();
await page.waitForTimeout(500);
await box.locator('[data-stage-include-word="Insulation"] ~ [data-ai-fill="he"], [data-ai-fill="he"]').first().click();
await page.waitForTimeout(800);
const st3 = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data') || '{}').stages.find(s => s.id === 's1-piping'));
check(st3.includesTr?.['Piping']?.he === 'צנרת' && st3.includesTr?.['Piping']?.ru === 'Трубы', 'ai: the new word is saved in all three', JSON.stringify(st3.includesTr?.Piping));
check(st3.includesTr?.Insulation?.he === 'בידוד', 'ai: an existing word\'s empty Hebrew box filled and SAVED', JSON.stringify(st3.includesTr?.Insulation));
check(await box.locator('[data-stage-include-word="Insulation"][data-lang="he"]').inputValue() === 'בידוד', 'ai: and it shows in the box');
await box.screenshot({ path: (process.env.SHOTS ?? '/tmp') + '/includes3.png' });
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
