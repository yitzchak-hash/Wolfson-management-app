// The job window after the owner's recording 2026-11-11 123621 (the redo, with voice):
//   the contractor is typed freely (and read off the worker who finished Installation in the app, with a sparkle),
//   an AC company dropdown stands beside it (the Hisense / Mitsubishi buttons and "Inspected by Tzvi" are not drawn),
//   Standard / Upgraded sits beside the family name, loose "Inspected by Tzvi" rows stand under Inspection 1,
//   Framing is one tap, and the building view shows the contractor and the company on the flat.
// Dev server on 5173. Names made up.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
const browser = await chromium.launch();
const blob = await realisticWolfson(browser);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await applySeed(ctx, blob);
await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"files":[]}' }));
const p = await ctx.newPage();
p.on('pageerror', e => { console.log('PAGE ERROR', e.message.slice(0, 200)); bad++; });
await p.goto('http://localhost:5173/project'); await p.waitForTimeout(2500);
await p.waitForFunction(() => !!window.__store);
await p.locator('[data-view-switch] [data-view="board"]').first().click().catch(() => {}); await p.waitForTimeout(800);

// the workspace's buttons as he has them live, and a flat with the old answers + an old stage-less inspection
await p.evaluate(() => {
  const st = window.__store.getState();
  st.setBoardSetting('customButtons', [
    { id: 'CB-wall', name: 'Wall Yes/No' }, { id: 'CB-insp', name: 'Inspected by Tzvi' },
    { id: 'CB-his', name: 'Hisense' }, { id: 'CB-mit', name: 'Mitsubishi' }]);
  st.updateApartment('A1-53', { customAnswers: { 'CB-wall': 'yes', 'CB-his': 'yes', 'CB-insp': 'yes' }, crew: undefined, acCompany: undefined }, st.currentUser);
});
await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1500);
const ids = await p.locator('[data-stage-bubble]').evaluateAll(es => es.map(e => e.getAttribute('data-stage-bubble')));
const [sInst, sInsp, sOff, sFrame] = ids;
await p.evaluate(([sInst, sInsp, sOff, sFrame, all]) => {
  const st = window.__store.getState();
  st.updateStage(sInst, { how: 'site', name: 'Installation', trade: undefined });
  st.updateStage(sInsp, { how: 'inspection', name: 'Inspection 1', trade: undefined });
  st.updateStage(sOff, { how: 'office', name: 'Sent plans back to contractor', trade: undefined });
  st.updateStage(sFrame, { how: 'site', name: 'Framing', trade: undefined });
  const marks = {}; for (const id of all) marks[id] = 'todo'; marks[sInst] = 'done';
  st.setApartmentMarks('A1-53', marks, st.currentUser);
  st.updateApartment('A1-53', {
    siteVisits: [{ id: 'v1', byId: 'C-x', byName: 'Igor Test', startedAt: '2026-11-10T08:00:00Z', endedAt: '2026-11-10T12:00:00Z', status: 'done', stageId: sInst }],
    inspections: [
      { id: 'i1', at: '2026-11-08T10:00:00Z', byId: 'U1', byName: 'Tzvi', afterStageId: null, files: [{ filename: 'a.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }] },
      { id: 'i2', at: '2026-11-08T11:00:00Z', byId: 'U1', byName: 'Tzvi', afterStageId: sInst, files: [{ filename: 'b.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }] },
    ],
  }, st.currentUser);
}, [sInst, sInsp, sOff, sFrame, ids]);
await p.waitForTimeout(900);

// 1 · contractor: read off the worker, with the sparkle; typed freely
const crew = p.locator('[data-crew-select]');
T(await crew.getAttribute('data-crew-auto') === '1' && await crew.getAttribute('placeholder') === 'Igor Test' && await p.locator('[data-crew-ai]').count() === 1,
  'the contractor shows the worker who finished Installation in the app, with the little icon');
const stored = await p.evaluate(() => window.__store.getState().apartments.find(a => a.id === 'A1-53').crew);
T(!stored, 'nothing is written for it');
await p.locator('[data-crew-select]').fill('Moshe the Plumber'); await p.locator('[data-crew-select]').blur(); await p.waitForTimeout(500);
T(await p.evaluate(() => window.__store.getState().apartments.find(a => a.id === 'A1-53').crew) === 'Moshe the Plumber', 'any name can be typed');
T(await p.locator('[data-crew-ai]').count() === 0, 'a typed name has no icon');

// 2 · AC company
const co = p.locator('[data-ac-company]');
T(await co.inputValue() === 'Hisense', 'the AC company reads the old Hisense = Yes');
const opts = await co.locator('option').allTextContents();
T(opts.includes('Mitsubishi') && opts.includes('Electra') && opts.length >= 8, 'the dropdown lists the AC companies', opts.join(','));
await co.selectOption('Mitsubishi'); await p.waitForTimeout(400);
T(await p.evaluate(() => window.__store.getState().apartments.find(a => a.id === 'A1-53').acCompany) === 'Mitsubishi', 'choosing one saves it');

// 2b · LG is the default (owner, 2026-11-11: "make the default AC company LG unless changed")
T(await p.evaluate(() => { const st = window.__store.getState(); return !st.apartments.find(a => a.id === 'A1-54').acCompany; }), 'another flat has no company chosen');
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await p.locator('[data-apt-id="A1-54"]').first().click(); await p.waitForTimeout(1200);
T(await p.locator('[data-ac-company]').inputValue() === 'LG', 'its AC company reads LG by default');
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1200);

// 3 · buttons
const names = await p.locator('[data-custom-button]').allInnerTexts();
T(names.length === 1 && /Wall/.test(names[0]), 'only Wall is left as a button (no Hisense, Mitsubishi, Inspected by Tzvi)', names.join(' | ').replace(/\s+/g, ' '));

// 4 · Standard / Upgraded beside the family name
const fam = await p.locator('[data-family-name]').boundingBox();
const cls = await p.locator('[data-details-row2]').boundingBox();
T(!!fam && !!cls && Math.abs((fam.y + fam.height / 2) - (cls.y + cls.height / 2)) < 12 && cls.x > fam.x + fam.width - 2, 'Standard / Upgraded stands to the right of the family name', `${JSON.stringify(fam)} ${JSON.stringify(cls)}`);

// 5 · the loose inspections stand under Inspection 1
const order = await p.evaluate(() => [...document.querySelectorAll('[data-stage-bubble], [data-inspection]')].map(e => e.getAttribute('data-inspection') ? 'insp:' + e.getAttribute('data-inspection') : 'st:' + e.getAttribute('data-stage-bubble')));
const iInsp = order.indexOf('st:' + sInsp);
T(order[0].startsWith('st:') && order[iInsp + 1] === 'insp:i1' && order[iInsp + 2] === 'insp:i2', 'both old "Inspected by Tzvi" rows stand under Inspection 1, none on top', order.slice(0, 6).join(' '));

if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/details0.png' });
// 6 · Framing is one tap, and ticks nothing else
const fr = p.locator(`[data-stage-bubble="${sFrame}"]`);
await fr.scrollIntoViewIfNeeded(); await fr.click(); await p.waitForTimeout(700);
const m = await p.evaluate(() => JSON.parse(JSON.stringify(window.__store.getState().apartments.find(x => x.id === 'A1-53').stageMarks)));
T(m[sFrame] === 'done', `one tap finishes Framing (${m[sFrame]})`);
T(m[sInsp] !== 'done' && m[sOff] !== 'done', `and nothing else moves (${m[sInsp]}, ${m[sOff]})`);
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/details.png' });

// 7 · the building view: the flat says the contractor and the company, and its colour is strong
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
await p.locator('[data-view-switch] [data-view="building"]').first().click().catch(() => {}); await p.waitForTimeout(1500);
const facts = await p.locator('[data-flat-fact]').allTextContents();
T(facts.includes('Moshe the Plumber') && facts.includes('Mitsubishi'), 'the building view shows the contractor and the AC company on the flat', facts.join(' | '));
T(!(await p.locator('[data-flat-answer]').allTextContents()).some(t => /Hisense|Mitsubishi/.test(t)), 'and no Hisense / Mitsubishi yes-no chip');
// 8 · the wall is drawn on the plan, lit green, where Wall is Yes (he marked it on the Wolfson Wall Marker page)
await p.evaluate(() => { const st = window.__store.getState();
  st.updateApartment('A1-45', { customAnswers: { 'CB-wall': 'yes' } }, st.currentUser);
  st.updateApartment('A1-46', { customAnswers: { 'CB-wall': 'no' } }, st.currentUser); });
await p.waitForTimeout(600);
await p.locator('[data-rail-floor="12"]').first().click().catch(() => {});
await p.waitForTimeout(1200);
await p.waitForTimeout(400);
T(await p.locator('[data-flat-wall="A1-45"]').count() >= 1, 'a flat answered Wall: Yes has its wall drawn on the plan');
T(await p.locator('[data-flat-wall="A1-46"]').count() === 0, 'a flat answered No has none');
const wallCss = await p.locator('[data-flat-wall="A1-45"]').first().evaluate(e => getComputedStyle(e).stroke);
T(wallCss === 'rgb(16, 185, 129)', `the wall is green (${wallCss})`);
T(!(await p.locator('[data-flat-answer]').allTextContents()).some(t => /Wall/.test(t)), 'and there is no "Wall: Yes / No" chip any more');
// 9 · a flat with no buyer is coloured by its stage once work is done in it (owner's recording 2026-11-11 12:31)
const unsoldBefore = await p.locator('[data-apt="A1-49"]').first().getAttribute('data-unsold');
await p.evaluate(([sInst]) => { const st = window.__store.getState();
  const a = st.apartments.find(x => x.id === 'A1-49');
  st.setApartmentMarks('A1-49', { ...(a.stageMarks ?? {}), [sInst]: 'done' }, st.currentUser); }, [sInst]);
await p.waitForTimeout(600);
const unsoldAfter = await p.locator('[data-apt="A1-49"]').first().getAttribute('data-unsold');
T(unsoldBefore === '1' && unsoldAfter === '0', `a "Not sold" flat is white until work is done in it, then takes its stage's colour (${unsoldBefore} → ${unsoldAfter})`);
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/building.png' });
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
