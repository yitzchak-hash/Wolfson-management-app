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
await box.screenshot({ path: (process.env.SHOTS ?? '/tmp') + '/includes3.png' });
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
