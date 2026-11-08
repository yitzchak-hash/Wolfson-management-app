// Every buzz the owner chose (2026-11-08, "all"): opening an apartment, a stage done, a task closed, sending a
// message, a warning on a refusal, and pressing-and-holding a flat on the building (a peek: lit, not opened).
// navigator.vibrate is replaced by a recorder. Dev server on 5173. SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
await applySeed(ctx, blob);
await ctx.addInitScript(() => {
  window.__buzz = [];
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: p => { window.__buzz.push(JSON.stringify(p)); return true; } });
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw); if (d.__hp) return; d.__hp = 1;
  const at = new Date().toISOString();
  d.contractorAssignments = [...(d.contractorAssignments ?? []), { id: 'T-HP', contractorId: d.contractors?.[0]?.id ?? 'C1', apartmentId: 'A1-53', taskDescription: 'Fit the unit', dueDate: at.slice(0, 10), completed: false, completedAt: null, priority: 'normal', createdAt: at, updatedAt: at }];
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});
const p = await ctx.newPage();
const buzz = () => p.evaluate(() => window.__buzz.splice(0));
const TICK = '8', TAP = '14', SUCCESS = '[12,60,18]';
await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2500);
await buzz();

// 1. press and hold a flat on the building
// A flat really under the finger: one whose middle is itself on top (a lower floor sits behind the stage).
const found = await p.evaluate(() => {
  for (const e of document.querySelectorAll('[data-apt], [data-card]')) {
    const r = e.getBoundingClientRect(); if (r.width < 10 || r.height < 10) continue;
    const x = r.left + r.width / 2, y = r.top + r.height / 2; if (y < 0 || y > innerHeight) continue;
    const top = document.elementFromPoint(x, y); if (top && (top === e || e.contains(top))) return { id: e.getAttribute('data-apt') ?? e.getAttribute('data-card'), x, y };
  }
  return null;
});
T(!!found, 'a flat is on screen to hold');
const id = found?.id; const pt = { x: found?.x ?? 0, y: found?.y ?? 0 };
const cdp = await ctx.newCDPSession(p);
if (0) console.log('hold on', id, await p.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + ' ' + [...e.attributes].map(a => a.name + '=' + a.value).join(' ').slice(0, 120) : 'none'; }, pt));
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
await p.waitForTimeout(700);
const lit = await p.evaluate(i => !!document.querySelector(`[data-apt="${i}"][data-on="1"], [data-card="${i}"][data-on="1"]`), id);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await p.waitForTimeout(800);
const b1 = await buzz();
T(b1.includes(TAP), `holding a flat buzzes (${b1.join(' ')})`);
T(lit, 'and lights it up');
T(await p.locator('[data-stage-bubble]').count() === 0, 'and does not open it (a peek)');

// 2. opening an apartment
await p.locator('[data-view-switch-narrow] [data-view="board"], [data-view-switch] [data-view="board"]').first().click().catch(() => {});
await p.waitForTimeout(1000); await buzz();
await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1500);
const b2 = await buzz();
T(b2.includes(TICK), `opening an apartment ticks (${b2.join(' ')})`);

// 3. a stage done
const bubble = p.locator('[data-stage-bubble]').first();
let got = [];
for (let i = 0; i < 3; i++) { await bubble.click(); await p.waitForTimeout(350); got.push(...await buzz()); if ((await bubble.getAttribute('data-stage-state')) === 'done') break; }
T(got.filter(x => x === SUCCESS).length === 1, `marking a stage done buzzes once, and only on done (${got.join(' ')})`);

// 4. a task closed
await p.getByRole('button', { name: /^Tasks/ }).first().click(); await p.waitForTimeout(800); await buzz();
const card = p.locator('[data-task-card="T-HP"]');
await card.locator('button').first().click(); await p.waitForTimeout(500);
const b4 = await buzz();
T(await card.getAttribute('data-task-done') === '1' && b4.includes(SUCCESS), `closing a task buzzes (${b4.join(' ')})`);

// 5. sending a message (any send box)
const ta = p.locator('[data-composer-send]').first();
const box5 = p.locator('textarea:visible').first();
if (await box5.count()) {
  await box5.fill('Checked on site');
  await p.waitForTimeout(200);
  if (await ta.count() && await ta.isVisible()) { await ta.click(); await p.waitForTimeout(300); const b5 = await buzz(); T(b5.includes(TAP), `sending a message taps (${b5.join(' ')})`); }
  else T(false, 'no send button found next to the box');
} else T(false, 'no message box on the Tasks tab');

// 6. a warning buzz on an error toast
await p.evaluate(() => window.__buzz.splice(0));
await p.goto('http://localhost:5173/tasks'); await p.waitForTimeout(1800);
await p.evaluate(() => { window.open = () => null; });
const printBtn = p.locator('button:has(svg.lucide-printer)').first();
if (await printBtn.count()) { await printBtn.click().catch(() => {}); await p.waitForTimeout(600); }
const b6 = await buzz();
T(b6.includes('[30,50,30]'), `a refusal gives the warning buzz (${b6.join(' ')})`);
await p.screenshot({ path: `${OUT}/haptics-end.png` });
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
