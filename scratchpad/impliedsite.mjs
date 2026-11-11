// Only SITE work is ticked by itself (owner's silent recording 2026-11-11 121720, 2:15: ticking Framing marked
// Inspection 1 "Approved" and "Sent plans back to contractor" "Sent"). A later site stage still ticks the earlier
// site stages of its trade; an inspection and an office task between them stay as they were. Dev server on 5173.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await applySeed(ctx, blob);
await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"files":[]}' }));
const p = await ctx.newPage();
await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2500);
await p.waitForFunction(() => !!window.__store);
await p.locator('[data-view-switch] [data-view="board"]').first().click().catch(() => {}); await p.waitForTimeout(800);
await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1500);
// the apartment's own stages, in order: make the 2nd an inspection, the 3rd an office task; tick the 5th
const ids = await p.locator('[data-stage-bubble]').evaluateAll(es => es.map(e => e.getAttribute('data-stage-bubble')));
const [s1, insp, office, s4, s5] = ids;
await p.evaluate(([insp, office, all]) => {
  const st = window.__store.getState();
  st.updateStage(insp, { how: 'inspection', name: 'Inspection 1', trade: undefined });
  st.updateStage(office, { how: 'office', name: 'Sent plans back to contractor', trade: undefined });
  for (const id of all) if (id !== insp && id !== office) st.updateStage(id, { how: 'site', trade: undefined });
  const a = st.apartments.find(x => x.id === 'A1-53');
  const marks = { ...(a.stageMarks ?? {}) }; for (const id of all) marks[id] = 'todo';
  st.setApartmentMarks('A1-53', marks, st.currentUser);
}, [insp, office, ids]);
await p.waitForTimeout(800);
const bub = p.locator(`[data-stage-bubble="${s5}"]`);
await bub.scrollIntoViewIfNeeded(); await bub.click(); await p.waitForTimeout(300); await bub.click(); await p.waitForTimeout(800);
const m = await p.evaluate(() => JSON.parse(JSON.stringify(window.__store.getState().apartments.find(x => x.id === 'A1-53').stageMarks)));
T(m[s5] === 'done', `the tapped stage is done (${m[s5]})`);
T(m[s1] === 'done' && m[s4] === 'done', `the earlier SITE stages are ticked with it (${m[s1]}, ${m[s4]})`);
T(m[insp] !== 'done', `the inspection between them is NOT approved by itself (${m[insp]})`);
T(m[office] !== 'done', `the office task is NOT ticked by itself (${m[office]})`);
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
