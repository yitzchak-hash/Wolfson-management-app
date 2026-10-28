// The 28 Oct recording, built: taller Wolfson tiles (number + name on one
// line, the tipus, a bigger "U", no "0/12", "Not sold"), the four sale
// filters and the stage drop-down, buildings 1 · 2 · 3, the apartment window
// in his order with the stages as their own section, Add notes folded,
// custom project buttons, Drive / Zoho / a small trash can in Settings, and
// Wolfson's tipus filled by the approved rule. Names are FAKE.
import { chromium } from 'playwright';

const APP = process.env.APP ?? 'http://localhost:5173';
const SHOTS = process.env.SHOTS;
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('wolfson_app_data')) {
    const user = { id: 'U-t', name: 'Tester', code: '999999', role: 'Admin', active: true, createdAt: '2026-01-01' };
    localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user }));
  }
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/project`);
await page.waitForTimeout(3500);

// Seed on top of the default building: stages with a start stage, names, upgrades.
// Seeded from a page where the app is NOT running (its own save on leaving
// would write its state back over the seed).
await page.goto(`${APP}/wolfson-building.png`);
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
  const at = '2026-01-01T00:00:00Z';
  raw.currentUser = { id: 'U-t', name: 'Tester', code: '999999', role: 'Admin', active: true, createdAt: at };
  raw.users = [raw.currentUser, { id: 'U-e', name: 'Efrat', code: '111111', role: 'Office', active: true, createdAt: at },
    { id: 'U-i', name: 'Igal', code: '222222', role: 'Office', active: true, createdAt: at }];
  raw.stages = [
    { id: 'skhtatb', name: 'Sold/Start', color: '#64748b', order: 0, active: true, createdAt: at, updatedAt: at },
    { id: 's-drilling', name: 'Drilling', color: '#0d9488', order: 1, active: true, createdAt: at, updatedAt: at },
    { id: 's1-piping', name: 'Piping', color: '#6366f1', order: 2, active: true, includes: ['Soldering', 'Connections', 'Pipes'], createdAt: at, updatedAt: at },
    { id: 's-drains', name: 'Drains', color: '#0ea5e9', order: 3, active: true, createdAt: at, updatedAt: at },
    { id: 's-fans', name: 'Fans', color: '#f59e0b', order: 4, active: true, createdAt: at, updatedAt: at },
  ];
  const fake = ['Levi, Dana', 'Mizrahi, Avi', 'Katz, Noa', 'Peretz, Ron', 'Biton, Eli', 'Shalom, Tali'];
  let i = 0;
  raw.apartments = (raw.apartments || []).map(a => {
    if (a.buildingId !== 'A2' || a.isUnnamed) return a;
    const n = Number(a.apartmentNumber);
    if (n >= 45 && n <= 52 && n % 2 === 0) return { ...a, displayName: fake[i++ % fake.length], currentStageId: 'skhtatb', classification: n % 4 === 0 ? 'shinui' : 'standard' };
    if (n === 49) return { ...a, displayName: 'Building 2/49' };
    if (n === 47) return { ...a, displayName: 'Mizrahi, Avi', currentStageId: 's-drilling', stageMarks: { 's-drilling': 'done', 's1-piping': 'doing' }, bubbles: true };
    return a;
  });
  raw.contractors = [{ id: 'C-igor', name: 'Igor', token: 't1', active: true, createdAt: at }];
  const apt47 = raw.apartments.find(a => a.buildingId === 'A2' && a.apartmentNumber === '47');
  raw.contractorAssignments = apt47 ? [{
    id: 'T-1', contractorId: 'C-igor', apartmentId: apt47.id, buildingId: 'A2', taskDescription: 'Drilling',
    stageId: 's-drilling', dueDate: '2026-10-12', completedAt: '2026-10-12T10:00:00Z', createdAt: '2026-10-12T08:00:00Z',
    createdBy: 'U-t', createdByName: 'Tester', priority: 'normal', stagesWorked: ['s-drilling'], stagesFinished: true,
  }] : [];
  raw.boardSettings = { ...(raw.boardSettings || {}), wolfson: { ...((raw.boardSettings || {}).wolfson || {}), customButtons: [{ id: 'CB-wall', name: 'Wall' }] } };
  localStorage.setItem('wolfson_app_data', JSON.stringify(raw));
});
await page.goto(`${APP}/project`);
await page.waitForTimeout(4000);

// ════ 1 · the tipus filled by the rule ═══════════════════════════════════
const tipusOf = async n => page.evaluate(num => {
  const raw = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
  return (raw.apartments || []).find(a => a.buildingId === 'A2' && a.apartmentNumber === String(num))?.tipus ?? null;
}, n);
check(await tipusOf(45) === 'A', 'tipus: 45 is A', String(await tipusOf(45)));
check(await tipusOf(30) === 'B', 'tipus: 30 is B', String(await tipusOf(30)));
check(await tipusOf(47) === 'C1', 'tipus: 47 is C1', String(await tipusOf(47)));
check(await tipusOf(40) === 'C2', 'tipus: 40 is C2', String(await tipusOf(40)));
const list = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data') || '{}').boardSettings?.wolfson?.tipusim);
check(JSON.stringify(list) === '["A","B","C1","C2"]', 'tipus: Wolfson list is A · B · C1 · C2', JSON.stringify(list));
const stageName = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data') || '{}').stages?.find(s => s.id === 'skhtatb')?.name);
check(stageName === 'Sold', 'the start stage is called Sold', String(stageName));

// ════ 2 · the board ═════════════════════════════════════════════════════
const cell = n => page.locator(`[data-apt-id]`).filter({ hasText: new RegExp(`^${n}`) }).first();
const a2 = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('wolfson_app_data') || '{}');
  const m = {}; for (const a of raw.apartments) if (a.buildingId === 'A2') m[a.apartmentNumber] = a.id; return m;
});
const box = async n => page.locator(`[data-apt-id="${a2[n]}"]`).boundingBox();
const h = (await box('46'))?.height ?? 0;
check(h >= 100, 'board: a Wolfson floor is much taller', `${Math.round(h)} px`);
// His saved layout (Wolfson Tile Layout page): number top-left, tipus centred on top, name in the middle.
const geo = async (n, sel) => page.locator(`[data-apt-id="${a2[n]}"] ${sel}`).boundingBox();
const cellB = await box('46'), numB = await geo('46', '[data-cell-number]'), tipB = await geo('46', '[data-tipus-line]'), nameB = await geo('46', '[data-cell-name]');
check(numB && numB.x - cellB.x < 12 && numB.y - cellB.y < 12, 'board: the number sits top-left');
check(tipB && Math.abs((tipB.x + tipB.width / 2) - (cellB.x + cellB.width / 2)) < 2 && tipB.y - cellB.y < 12, 'board: the tipus is centred on top');
check(nameB && nameB.y > numB.y + 15, 'board: the name has its own place under them');
// Nothing on a tile is cut: every text fits its own box.
const cut = await page.evaluate(() => [...document.querySelectorAll('[data-cell-number],[data-tipus-line],[data-cell-name]')]
  .filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map(e => e.textContent));
check(cut.length === 0, 'board: no number, tipus or name is cut', cut.slice(0, 5).join(' | '));
check(await page.locator('[data-cell-fraction]').count() === 0, 'board: no "0/12" anywhere');
const unsold = (await page.locator(`[data-apt-id="${a2['49']}"]`).textContent()) ?? '';
check(/Not sold/.test(unsold) && !/Building 2\/49/.test(unsold) && !/Not Started/i.test(unsold), 'board: a flat with no name reads "Not sold"', unsold);
const sold = (await page.locator(`[data-apt-id="${a2['46']}"]`).textContent()) ?? '';
check(/Sold/.test(sold) && !/Sold\/Start/.test(sold), 'board: the start stage reads "Sold"', sold);
const tip = await page.locator(`[data-apt-id="${a2['46']}"] [data-tipus-line]`).textContent();
check(tip === 'B', 'board: the tipus on the tile', String(tip));
const badge = page.locator(`[data-apt-id="${a2['48']}"] [data-upgraded-badge]`);
const bb = await badge.boundingBox();
check((await badge.textContent()) === 'U' && (bb?.width ?? 0) >= 18, 'board: the upgrade badge is a bigger "U"', `${bb?.width}px`);

// ════ 3 · the filter bar ════════════════════════════════════════════════
const sale = await page.locator('[data-sale-filter]:visible [data-sale]').allTextContents();
check(sale.join('|') === 'All|Sold|Not sold|Upgraded|Not upgraded', 'filters: the four sale buttons + All', sale.join('|'));
const bar = await page.locator('.diag\\:block').first().textContent();
check(!/Standard|Changes/.test(bar ?? ''), 'filters: no Standard · Changes toggle, no Changes button', '');
const bld = await page.locator('.diag\\:block button').allTextContents();
check(bld.slice(0, 4).join('|') === 'All|3|2|1', 'filters: buildings read 1 · 2 · 3', bld.slice(0, 4).join('|'));
check(/Bulk Update/.test(bar ?? '') && /Print/.test(bar ?? ''), 'filters: Bulk Update and Print stay');
await page.locator('[data-sale="unsold"]:visible').click();
await page.waitForTimeout(300);
const dim = async n => page.locator(`[data-apt-id="${a2[n]}"]`).evaluate(el => getComputedStyle(el).backgroundColor);
check((await dim('46')) === 'rgb(229, 231, 235)' && (await dim('49')) !== 'rgb(229, 231, 235)', 'filters: Not sold greys out the sold flats');
await page.locator('[data-sale="all"]:visible').click();
await page.locator('[data-stage-filter-btn]').click();
check(await page.locator('[data-stage-filter-panel]').isVisible(), 'filters: the stages open from one small drop-down');
if (SHOTS) await page.screenshot({ path: `${SHOTS}/board.png` });
await page.keyboard.press('Escape');

// ════ 4 · the apartment window ══════════════════════════════════════════
await page.locator(`[data-apt-id="${a2['47']}"]`).click();
await page.waitForTimeout(1200);
const head = await page.locator('[data-drawer-building]').textContent();
check(head === 'Building 2', 'window: the title says Building 2', head);
check(/47/.test((await page.locator('[data-drawer-aptno]').textContent()) ?? ''), 'window: the title carries the apartment number');
const order = await page.locator('[data-details-row1] > div label').allTextContents();
check(order.join('|').replace(/\s+/g, ' ') === 'Building|Floor|Tipus|Apt #|Family Name', 'window: Building · Floor · Tipus · Apt # · Name', order.join('|'));
check(await page.locator('[data-details-row2]').count() === 1, 'window: Standard / Upgraded on its own row');
check(/Upgraded/.test((await page.locator('[data-details-row2]').textContent()) ?? ''), 'window: "Upgraded", not "Chg"');
check(await page.locator('[data-stage-picker]').count() === 0, 'window: no "Current stage" field');
const rows = await page.locator('[data-stage-row]').count();
check(rows === 4, 'window: every stage shows (Sold is not one)', `${rows}`);
check(/Soldering/.test((await page.locator('[data-stage-row="s1-piping"]').textContent()) ?? ''), 'window: a stage shows its parts');
check(/Igor finished it on/.test((await page.locator('[data-stage-row="s-drilling"] [data-stage-who]').textContent()) ?? ''), 'window: who finished a stage and when');
await page.locator('[data-stage-row="s-drains"] [data-stage-bubble]').click();
await page.waitForTimeout(400);
check((await page.locator('[data-stage-row="s-drains"]').getAttribute('data-stage-state')) === 'doing', 'window: tapping a stage moves it on');
const y = async sel => (await page.locator(sel).first().boundingBox())?.y ?? 0;
check(await y('[data-general-notes]') < await y('[data-stage-section]'), 'window: Add notes sits above the stages');
check(await page.locator('[data-general-notes-box]').count() === 0, 'window: Add notes starts folded');
check(await y('[data-custom-buttons]') > await y('[data-stage-section]') && await y('[data-details-settings]') > await y('[data-custom-buttons]'), 'window: custom buttons, then Settings, at the bottom');
await page.locator('[data-custom-button="CB-wall"] [data-custom-answer="yes"]').click();
await page.waitForTimeout(400);
const ans = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data') || '{}').apartments.find(a => a.buildingId === 'A2' && a.apartmentNumber === '47')?.customAnswers);
check(ans?.['CB-wall'] === 'yes', 'window: a custom button answer is kept', JSON.stringify(ans));
check(await page.locator('[data-delete-apartment]').count() === 0, 'window: no big delete button outside Settings');
await page.locator('[data-details-settings] > button').click();
await page.waitForTimeout(300);
check(await page.locator('[data-details-settings] [data-delete-apartment]').count() === 1, 'window: the trash can is in Settings');
const settingsText = (await page.locator('[data-details-settings]').textContent()) ?? '';
check(/Drive/i.test(settingsText) && /Zoho/i.test(settingsText), 'window: Drive and Zoho live in Settings');
const chips = await page.locator('[data-title-chip]').evaluateAll(els => els.filter(e => e.offsetParent).map(e => `${Math.round(e.getBoundingClientRect().height)}|${getComputedStyle(e).fontSize}`));
check(new Set(chips).size === 1, 'window: the title buttons are one size and style', chips.join(' '));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/window.png` });
// The Zoho dot (owner, 2026-10-28): red with no link, green with one.
const zdot = async () => page.locator('[data-title-chip="zoho"]:visible [data-zoho-dot]').first().evaluate(e => getComputedStyle(e).backgroundColor);
check(await page.locator('[data-title-chip="zoho"]:visible').count() === 1 && await zdot() === 'rgb(239, 68, 68)', 'window: no Zoho link → the Zoho chip is there with a RED dot', await zdot());

// Who may change a custom button (owner, 2026-10-28).
await page.goto(`${APP}/settings`);
await page.waitForTimeout(2500);
const ed = page.locator('[data-custom-editors="CB-wall"]');
if (!(await ed.count())) { const x = page.getByRole('button', { name: /Stages|Board/ }).first(); if (await x.count()) { await x.click(); await page.waitForTimeout(600); } }
check(await ed.count() === 1 && /Everyone/.test((await ed.textContent()) ?? ''), 'permissions: each custom button has a who-can drop-down, Everyone by default');
await ed.click();
const panel = page.locator('[data-custom-editors-panel="CB-wall"]');
const ptext = (await panel.textContent()) ?? '';
check(/Everyone/.test(ptext) && /Efrat/.test(ptext) && /Igal/.test(ptext) && /Tester/.test(ptext), 'permissions: the list shows Everyone and every name', ptext);
const editorsNow = () => page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data') || '{}').boardSettings?.wolfson?.customButtons?.find(b => b.id === 'CB-wall')?.editors ?? null);
await panel.locator('[data-custom-editor="U-e"]').click(); await page.waitForTimeout(300);
check(JSON.stringify(await editorsNow()) === '["U-e"]', 'permissions: one person picked', JSON.stringify(await editorsNow()));
await panel.locator('[data-custom-editor="U-i"]').click(); await page.waitForTimeout(300);
check(JSON.stringify(await editorsNow()) === '["U-e","U-i"]', 'permissions: several people picked', JSON.stringify(await editorsNow()));
check(/Efrat, Igal/.test((await ed.textContent()) ?? ''), 'permissions: the drop-down shows the names', await ed.textContent());
await panel.locator('[data-custom-editor="all"]').click(); await page.waitForTimeout(300);
check(await editorsNow() === null, 'permissions: Everyone goes back to all');
await panel.locator('[data-custom-editor="U-e"]').click(); await page.waitForTimeout(300);
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
check(await panel.count() === 0, 'permissions: Escape closes the drop-down');
if (SHOTS) { await ed.click(); const cb = await page.locator('[data-custom-buttons-card]').boundingBox(); await page.screenshot({ path: `${SHOTS}/permissions.png`, clip: { x: cb.x, y: cb.y, width: cb.width, height: cb.height + 200 } }); await page.keyboard.press('Escape'); }
await page.goto(`${APP}/project`);
await page.waitForTimeout(3000);
await page.locator(`[data-apt-id="${a2['47']}"]`).click();
await page.waitForTimeout(900);
check(await page.locator('[data-custom-button="CB-wall"][data-custom-locked="1"]').count() === 1
  && await page.locator('[data-custom-button="CB-wall"] [data-custom-answer="no"]').isDisabled(), 'permissions: a user not picked cannot change the answer');

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
