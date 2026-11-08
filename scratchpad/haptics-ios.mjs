// The iPhone's tick (owner, 2026-11-08: "why don't the vibrations work on iPhone?" → "a"). An iPhone has no
// navigator.vibrate; the app toggles a hidden switch, and iOS only ticks while it is handling the finger's own event.
// So every tick is recorded with the event being handled at that instant (window.event): it must be the tap's own
// (click / pointerup / touchend / keydown), never none. Dev server on 5173. SHOTS= dir.
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'] });
await applySeed(ctx, blob);
await ctx.addInitScript(() => {
  delete Navigator.prototype.vibrate;
  window.__tick = [];
  const click = HTMLElement.prototype.click;
  HTMLElement.prototype.click = function () {
    if (this.tagName === 'LABEL' && this.getAttribute('aria-hidden') === 'true' && this.querySelector('input[switch]')) window.__tick.push(window.event?.type ?? 'none');
    return click.call(this);
  };
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw); if (d.__hi) return; d.__hi = 1;
  const at = new Date().toISOString();
  d.contractorAssignments = [...(d.contractorAssignments ?? []), { id: 'T-HI', contractorId: d.contractors?.[0]?.id ?? 'C1', apartmentId: 'A1-53', taskDescription: 'Fit the unit', dueDate: at.slice(0, 10), completed: false, completedAt: null, priority: 'normal', createdAt: at, updatedAt: at }];
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});
const p = await ctx.newPage();
const ticks = () => p.evaluate(() => window.__tick.splice(0));
const IN_TAP = /^(click|pointerup|touchend|keydown|mouseup|contextmenu)$/;
const allInTap = a => a.length > 0 && a.every(x => IN_TAP.test(x));
await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2500);
T(await p.evaluate(() => typeof navigator.vibrate) === 'undefined', 'no vibrate command, as on an iPhone');
await ticks();
const cdp = await ctx.newCDPSession(p);
const touch = async (x, y, ms) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await p.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const flatAt = () => p.evaluate(() => {
  for (const e of document.querySelectorAll('[data-apt], [data-card]')) {
    const r = e.getBoundingClientRect(); if (r.width < 10 || r.height < 10) continue;
    const x = r.left + r.width / 2, y = r.top + r.height / 2; if (y < 0 || y > innerHeight) continue;
    const top = document.elementFromPoint(x, y); if (top && (top === e || e.contains(top))) return { x, y };
  }
  return null;
});

// 1. a floor swipe: one tick, at the lift
const stage = await p.locator('.bv-stage').first().boundingBox();
if (stage) {
  const x = stage.x + stage.width / 2, y = stage.y + stage.height / 2;
  const cur = () => p.evaluate(() => document.querySelector('.bv-stage')?.getAttribute('aria-label'));
  const before = await cur();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 25 }] }); await p.waitForTimeout(30); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(900);
  const t1 = await ticks();
  console.log('floor', before, '->', await cur(), 'stages', await p.locator('.bv-stage').count(), 'compact?', await p.evaluate(() => [...document.querySelectorAll('.bv-stage')].map(e => getComputedStyle(e).touchAction).join()));
  T(t1.some(x => IN_TAP.test(x)), `a floor swipe ticks at the lift (${t1.join(' ')})`);
} else T(false, 'no building on screen');

// 2. hold a flat: the tick at the lift
const f = await flatAt();
await touch(f.x, f.y, 700); await p.waitForTimeout(500);
const t2 = await ticks();
T(t2.some(x => IN_TAP.test(x)), `holding a flat ticks at the lift (${t2.join(' ')})`);

// 3. open an apartment from the board: the tick inside the tap
await p.locator('[data-view-switch-narrow] [data-view="board"], [data-view-switch] [data-view="board"]').first().click().catch(() => {});
await p.waitForTimeout(900); await ticks();
await p.locator('[data-apt-id="A1-53"]').first().tap(); await p.waitForTimeout(1500);
const t3 = await ticks();
T(allInTap(t3), `opening an apartment ticks inside the tap (${t3.join(' ')})`);

// 4. a stage done
const bubble = p.locator('[data-stage-bubble]').first();
let got = [];
for (let i = 0; i < 3; i++) { await bubble.tap(); await p.waitForTimeout(350); got.push(...await ticks()); if ((await bubble.getAttribute('data-stage-state')) === 'done') break; }
T(allInTap(got), `a stage done ticks inside the tap (${got.join(' ')})`);

// 5. a task closed
await p.getByRole('button', { name: /^Tasks/ }).first().tap(); await p.waitForTimeout(800); await ticks();
await p.locator('[data-task-card="T-HI"] button').first().tap(); await p.waitForTimeout(500);
const t5 = await ticks();
T(allInTap(t5), `closing a task ticks inside the tap (${t5.join(' ')})`);

// 6. sending a message
const box = p.locator('textarea:visible').first();
await box.fill('Checked on site'); await p.waitForTimeout(200);
await p.locator('[data-composer-send]').first().tap(); await p.waitForTimeout(400);
const t6 = await ticks();
T(allInTap(t6), `sending a message ticks inside the tap (${t6.join(' ')})`);
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
