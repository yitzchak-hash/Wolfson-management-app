// Installation in one tap closes the job window (owner, 2026-11-09), every other stage still steps to do → working →
// done; and the Contractor selector (Yaakov · Daniel · Igor) on a Wolfson job. Dev server on 5173. SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await applySeed(ctx, blob);
await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"files":[]}' }));
const p = await ctx.newPage();
const marks = () => p.evaluate(() => { const d = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}'); const a = d.apartments.find(x => x.id === 'A1-53'); return { m: a.stageMarks ?? {}, crew: a.crew, other: localStorage.getItem('ot_other'), inst: localStorage.getItem('ot_inst') }; });
const open = async () => { await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1200); };
await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2500);
await p.locator('[data-view-switch] [data-view="board"]').first().click().catch(() => {}); await p.waitForTimeout(900);
await open();
await p.waitForFunction(() => !!window.__store);
const ids = await p.locator('[data-stage-bubble]').evaluateAll(es => es.map(e => e.getAttribute('data-stage-bubble')));
await p.evaluate(([inst, other]) => {
  const st = window.__store.getState();
  st.updateStage(inst, { name: 'Installation', nameHe: 'התקנה' });
  const a = st.apartments.find(x => x.id === 'A1-53');
  st.setApartmentMarks('A1-53', { ...(a.stageMarks ?? {}), [inst]: 'todo', [other]: 'todo' }, st.currentUser);
  localStorage.setItem('ot_inst', inst); localStorage.setItem('ot_other', other);
}, [ids[0], ids[1]]);
await p.waitForTimeout(800);

// the contractor selector
const sel = p.locator('[data-crew-select]');
T(await sel.count() === 1, 'the job shows a Contractor selector');
// Re-encoded (owner, recording 2026-11-11 123621 — "I should be able to type in a random name"): a typed box, the three as suggestions.
const opts = await p.locator('#crew-names option').evaluateAll(es => es.map(e => e.value));
T(JSON.stringify(opts) === '["Yaakov","Daniel","Igor"]', `its suggestions are Yaakov · Daniel · Igor (${opts.join(', ')})`);
await sel.fill('Daniel'); await sel.blur(); await p.waitForTimeout(1500);
T((await marks()).crew === 'Daniel', 'choosing Daniel is saved on the job');
await p.screenshot({ path: `${OUT}/crew.png`, clip: { x: 0, y: 0, width: 1280, height: 420 } });

// another stage still takes two taps
const { other, inst } = await marks();
const ob = p.locator(`[data-stage-bubble="${other}"]`);
await ob.scrollIntoViewIfNeeded(); await ob.click(); await p.waitForTimeout(600);
T((await marks()).m[other] === 'doing', `another stage: the first tap is "working" (${(await marks()).m[other]})`);
T(await p.locator(`[data-stage-bubble="${inst}"]`).count() === 1, 'the window stays open after it');

// Installation: one tap → done and the window closes
const ib = p.locator(`[data-stage-bubble="${inst}"]`);
await ib.scrollIntoViewIfNeeded(); await ib.click(); await p.waitForTimeout(1200);
T((await marks()).m[inst] === 'done', `Installation: one tap marks it done (${(await marks()).m[inst]})`);
T(await p.locator('[data-stage-bubble]').count() === 0, 'and the job window closed by itself');
const said = await p.evaluate(() => document.body.innerText);
T(/Installation marked done/.test(said), 'it says "Installation marked done"');

// a tap on a done Installation takes it back, and does not close
await open();
const ib2 = p.locator(`[data-stage-bubble="${inst}"]`);
await ib2.scrollIntoViewIfNeeded(); await ib2.click(); await p.waitForTimeout(900);
T((await marks()).m[inst] !== 'done', `a tap on a done Installation takes it back (${(await marks()).m[inst]})`);
T(await p.locator(`[data-stage-bubble="${inst}"]`).count() === 1, 'taking it back leaves the window open');
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
