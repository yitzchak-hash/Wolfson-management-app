// The layout studio (owner-locked spec, 2026-09-15), end to end on a seeded
// Wolfson: the Buildings card opens the builder FULL SCREEN; every cell is the
// real unit (number, family, stage bar); the builder's floors are the project
// page's floors (no Ground/Commercial row, one "1 · Lobby" row); a number may
// be left blank and the cell shows the name; move-a-floor ASKS and keeps the
// number; merging three cells makes one spanning unit + two placeholders,
// drawn as one wide cell on the project page too; unmerge restores; the
// right-click menu carries the listed rows; a row height persists into
// boardSettings and reaches the diagram.
//
// Manner: seed through addInitScript ONLY when the key is absent (the app's
// flush-on-unload overwrites a patch), against the dev server on 5173.
import { chromium } from 'playwright';

const APP = process.env.APP ?? 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

function seed(ctx) {
  return ctx.addInitScript(() => {
    localStorage.setItem('active_project', 'wolfson');
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    if (localStorage.getItem('wolfson_app_data')) return;
    const user = { id: 'U-t', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
    const stages = [
      { id: 'st-ready', name: 'Ready to start', color: '#94a3b8', order: 0, active: true },
      { id: 'st-pipe', name: 'Piping', color: '#3b82f6', order: 1, active: true },
      { id: 'st-reg', name: 'Registers', color: '#10b981', order: 3, active: true },
    ];
    const apt = (id, bld, n, f, col, name, extra = {}) => ({
      id, buildingId: bld, floor: f, colPosition: col, colSpan: 1, apartmentNumber: String(n), displayName: name,
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'st-pipe',
      stageDates: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', ...extra,
    });
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      users: [user], currentUser: user, stages, contractors: [],
      buildings: [{ id: 'A1', name: 'Building A1', displayOrder: 1 }, { id: 'A2', name: 'Building A2', displayOrder: 2 }, { id: 'A3', name: 'Building A3', displayOrder: 3 }],
      apartments: [
        apt('A1-45', 'A1', 45, 13, 1, 'Weinstein'),
        apt('A1-46', 'A1', 46, 13, 2, 'Cohen', { currentStageId: 'st-reg' }),
        apt('A1-47', 'A1', 47, 13, 3, 'Aharonov', { currentStageId: null }),
        apt('A1-48', 'A1', 48, 13, 4, 'Levi'),
        apt('A1-51', 'A1', 51, 14, 3, 'Katz'),
        apt('A1-1', 'A1', 1, 2, 1, 'Rottenstreich'),
        apt('A1-81', 'A1', 81, 1, 1, '', { isUnnamed: true, currentStageId: null }),
        apt('A1-77', 'A1', 77, 0, 1, '', { isUnnamed: true, currentStageId: null }),
        apt('A1-57', 'A1', 57, -0.5, 1, '', { isUnnamed: true, currentStageId: null }),
        apt('A2-1', 'A2', 1, 2, 1, 'Levi'),
      ],
      boardSettings: {}, contractorAssignments: [], stageNotes: [], contractorNotes: [], contractorPhotos: [], canvasElements: [],
    }));
  });
}
const store = p => p.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')));
const attrs = (p, sel, name) => p.locator(sel).evaluateAll((els, n) => els.map(e => e.getAttribute(n)), name);
const box = async (p, sel) => p.locator(sel).first().boundingBox();

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await seed(ctx);
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));

// ── 1. The card opens the builder full screen ──
await page.goto(`${APP}/settings`);
await page.getByRole('button', { name: /^Buildings$/ }).first().click();
const studio = page.locator('[data-layout-studio]');
await studio.waitFor({ state: 'visible', timeout: 15000 });
const sb = await studio.boundingBox();
check(sb && Math.round(sb.width) === 1280 && Math.round(sb.height) === 900, '1 the builder opens FULL SCREEN from the Buildings card', JSON.stringify(sb));
const inBody = await studio.evaluate(el => el.parentElement === document.body);
check(inBody, '1b the studio is portalled to body');

// ── 2. Real cells: number, family, stage colour ──
const c45 = page.locator('[data-builder-cell="A1-45"]');
check(await c45.getAttribute('data-builder-num') === '45' && await c45.getAttribute('data-builder-name') === 'Weinstein', '2 cell 45 carries its number and family name');
const bar = await c45.evaluate(el => { const s = [...el.querySelectorAll('span')].at(-1); return getComputedStyle(s).backgroundColor; });
check(bar === 'rgb(59, 130, 246)', '2b the 4px stage bar is the stage colour', bar);
const c46bar = await page.locator('[data-builder-cell="A1-46"]').evaluate(el => getComputedStyle([...el.querySelectorAll('span')].at(-1)).backgroundColor);
check(c46bar === 'rgb(16, 185, 129)', '2c a different stage, a different bar', c46bar);
const cb = await c45.boundingBox();
check(cb && Math.abs(cb.width - 74) < 2 && Math.abs(cb.height - 58) < 2, '2d cells are about 74×58', `${cb?.width}×${cb?.height}`);
const blank81 = await page.locator('[data-builder-cell="A1-81"]').evaluate(el => getComputedStyle(el).borderStyle);
check(blank81 === 'dashed', '2e a blank slot draws dashed', blank81);

// ── 3. The floors ──
// Every building is on screen at once now — scope the row queries to A1.
const labels = await attrs(page, '[data-builder-building="A1"] [data-builder-floor-label]', 'data-builder-floor-label');
check(labels[0] === '15' && labels[1] === '14' && labels[2] === '13', '3 rows start 15 · 14 · 13', labels.slice(0, 4).join(','));
check(!labels.some(l => /ground|commercial/i.test(l)), '3b no Ground / Commercial row');
check(labels.includes('1 · Lobby'), '3c one "1 · Lobby" row', labels.join(','));
check(labels.indexOf('1 · Lobby') === labels.indexOf('1') + 1 && labels[labels.indexOf('1 · Lobby') + 1] === '-0.5', '3d lobby sits between floor 1 and the basements');
check(await page.locator('[data-builder-cell="A1-77"]').count() === 0, '3e the floor-0 record is not drawn anywhere');
const rowsH = await page.locator('[data-builder-building="A1"] [data-builder-row]').evaluateAll(els => els.map(e => e.getBoundingClientRect().height));
check(new Set(rowsH.map(Math.round)).size === 1, '3f every row is the same height (lobby and basement included)', [...new Set(rowsH.map(Math.round))].join(','));

// ── 4. A unit with a name and no number ──
await page.locator('[data-builder-cell="A1-1"]').click();
await page.locator('[data-number-btn]').click();
await page.locator('[data-number-input]').fill('');
await page.locator('[data-modal-apply]').click();
const c1 = page.locator('[data-builder-cell="A1-1"]');
check(await c1.getAttribute('data-builder-num') === '' && (await c1.innerText()).includes('Rottenstreich'), '4 a blank number is allowed and the cell shows the name alone');

// ── 5. Move a floor asks, and keeps the number ──
await page.locator('[data-builder-cell="A1-51"]').click();
await page.locator('[data-move-down]').click();
const mv = page.locator('[data-move-modal]');
await mv.waitFor({ state: 'visible' });
const mvText = await mv.innerText();
check(/Move 51 — Katz to floor 12\?/.test(mvText), '5 the move asks "Move 51 to floor 12?"', mvText.split('\n')[0]);
check(/Keep its number, 51/.test(mvText) && /Renumber floor 12 as .* and shift the rest/.test(mvText), '5b both answers are offered, keep first');
const keepChecked = await mv.locator('[data-move-keep] input').isChecked();
check(keepChecked, '5c keep-the-number is the default');
await page.locator('[data-move-confirm]').click();
await mv.waitFor({ state: 'hidden' });
const c51 = page.locator('[data-builder-cell="A1-51"]');
const c51row = await c51.evaluate(el => el.closest('[data-builder-row]').getAttribute('data-builder-row'));
check(c51row === '13' && await c51.getAttribute('data-builder-num') === '51', '5d 51 landed on the floor below with its number kept', c51row);
check(labels.length === (await page.locator('[data-builder-building="A1"] [data-builder-row]').count()), '5e no floor appeared or vanished');

// ── 6. Merge across the row ──
await page.locator('[data-builder-cell="A1-45"]').click();
await page.locator('[data-builder-cell="A1-47"]').click({ modifiers: ['Shift'] });
check(/3 selected/.test(await page.locator('[data-layout-studio]').innerText()), '6 shift+click selects the run 45..47');
await page.locator('[data-merge-btn]').click();
check(await c45.getAttribute('data-builder-span') === '3', '6b 45 spans three positions');
check(await page.locator('[data-builder-cell="A1-46"]').count() === 0 && await page.locator('[data-builder-cell="A1-47"]').count() === 0, '6c the covered positions are gone from the row');
const wide = await c45.boundingBox();
const c48 = await box(page, '[data-builder-cell="A1-48"]');
check(wide && c48 && wide.width > c48.width * 2.8, '6d the merged unit draws as ONE wide cell', `${wide?.width} vs ${c48?.width}`);

// ── 7. Unmerge restores the positions ──
await c45.click();
await page.locator('[data-unmerge-btn]').click();
check(await page.locator('[data-builder-cell="A1-46"]').count() === 1 && await page.locator('[data-builder-cell="A1-47"]').count() === 1, '7 unmerge brings the two positions back');
check(await page.locator('[data-builder-cell="A1-46"]').getAttribute('data-builder-num') === '', '7b …as blank slots');
// Merge again so the diagram can be checked after Save.
await c45.click();
await page.locator('[data-builder-cell="A1-47"]').click({ modifiers: ['Shift'] });
await page.locator('[data-merge-btn]').click();
check(await c45.getAttribute('data-builder-span') === '3', '7c merged again for the save');

// ── 8. The right-click menu ──
await page.locator('[data-builder-cell="A1-48"]').click({ button: 'right' });
const menu = page.locator('[data-builder-menu]');
await menu.waitFor({ state: 'visible' });
const items = await attrs(page, '[data-builder-menu] [data-menu-item]', 'data-menu-item');
const want = ['rename', 'number', 'move-up', 'move-down', 'merge', 'unmerge', 'renumber', 'add-position', 'remove-position'];
check(want.every(w => items.includes(w)), '8 the cell menu carries every listed row', items.join(','));
check(await menu.locator('[data-row-height]').count() === 3, '8b Row height ▸ normal · tall · short');
await page.keyboard.press('Escape');
check(await menu.count() === 0, '8c Escape closes the menu (and not the studio)');
check(await studio.isVisible(), '8d the studio is still open');

// ── 9. Row height from the floor label ──
await page.locator('[data-builder-building="A1"] [data-builder-floor-label="12"]').click({ button: 'right' });
await menu.waitFor({ state: 'visible' });
check(await menu.locator('[data-menu-item="renumber"]').count() === 1 && await menu.locator('[data-row-height]').count() === 3, '9 the floor label menu offers Row height and Renumber');
await menu.locator('[data-row-height="tall"]').click();
const h13 = await page.locator('[data-builder-building="A1"] [data-builder-row="13"]').evaluate(el => el.getBoundingClientRect().height);
const h14 = await page.locator('[data-builder-building="A1"] [data-builder-row="14"]').evaluate(el => el.getBoundingClientRect().height);
check(h13 > h14 * 1.3, '9b the tall row is taller', `${h13} vs ${h14}`);

// ── 10. Save: the change list, then the writes ──
await page.locator('[data-builder-save]').click();
const sv = page.locator('[data-save-modal]');
await sv.waitFor({ state: 'visible' });
const nChanges = await sv.locator('[data-save-change]').count();
check(nChanges >= 5, '10 the save previews the list of changes first', String(nChanges));
const svText = await sv.innerText();
check(/floor 13 → 12/.test(svText) && /now one unit over 3 positions/.test(svText) && /row heights/i.test(svText), '10b the list names the move, the merge and the heights');
await page.locator('[data-save-write]').click();
await sv.waitFor({ state: 'hidden' });
await page.waitForTimeout(700);
const st = await store(page);
const byId = Object.fromEntries(st.apartments.map(a => [a.id, a]));
check(byId['A1-45'].colSpan === 3 && byId['A1-45'].colPosition === 1, '10c 45 is written with colSpan 3');
check(byId['A1-46'].coveredBy === 'A1-45' && byId['A1-46'].isUnnamed === true && byId['A1-46'].apartmentNumber === '', '10d 46 is a covered placeholder, not deleted');
check(byId['A1-47'].coveredBy === 'A1-45', '10e 47 too');
check(byId['A1-51'].floor === 13 && byId['A1-51'].apartmentNumber === '51', '10f 51 moved a floor and kept its number');
check(byId['A1-1'].apartmentNumber === '' && byId['A1-1'].displayName === 'Rottenstreich' && byId['A1-1'].isUnnamed === false, '10g the nameless-number unit still counts');
check(st.boardSettings?.wolfson?.floorHeights?.A1?.['13'] === 'tall', '10h the row height rides boardSettings.floorHeights', JSON.stringify(st.boardSettings?.wolfson?.floorHeights));
const dirtyLabel = await page.locator('[data-builder-save]').innerText();
check(!/\(\d+\)/.test(dirtyLabel), '10i after the write the studio is clean');

// ── 11. Close, and the project page draws the same building ──
await page.locator('[data-builder-close]').click();
check(await studio.count() === 0, '11 X closes a clean studio without asking');
await page.goto(`${APP}/project`);
await page.locator('[data-apt-id="A1-45"]').waitFor({ state: 'visible', timeout: 15000 });
const dLabels = (await attrs(page, '[data-floor-label]', 'data-floor-label')).slice(0, 25);
check(!dLabels.some(l => /ground|commercial/i.test(l)) && dLabels.includes('1 · Lobby'), '11b the diagram has no Ground row and a "1 · Lobby" row', dLabels.join(','));
const a1Labels = await page.locator('[data-floor-label]').evaluateAll(els => els.map(e => e.getAttribute('data-floor-label')));
check(a1Labels.slice(0, labels.length).join('|') === labels.join('|'), '11c the diagram lists exactly the builder\'s floors', a1Labels.slice(0, labels.length).join(','));
const d45 = await page.locator('[data-apt-id="A1-45"]').evaluate(el => el.parentElement.getBoundingClientRect().width);
const d48 = await page.locator('[data-apt-id="A1-48"]').evaluate(el => el.parentElement.getBoundingClientRect().width);
check(d45 > d48 * 2.8, '11d the merged unit is ONE wide cell on the project page', `${d45} vs ${d48}`);
check(await page.locator('[data-apt-id="A1-46"]').count() === 0, '11e the covered position is not drawn');
const dh13 = await page.locator('[data-floor-row="13"]').first().evaluate(el => el.getBoundingClientRect().height);
const dh14 = await page.locator('[data-floor-row="14"]').first().evaluate(el => el.getBoundingClientRect().height);
check(Math.round(dh13) === 102 && Math.round(dh14) === 68, '11f the tall row height reaches the diagram (102 vs 68)', `${dh13} vs ${dh14}`);
const dLobby = await page.locator('[data-floor-row="1"]').first().evaluate(el => el.getBoundingClientRect().height);
check(Math.round(dLobby) === 68, '11g the lobby row is a normal row\'s height', String(dLobby));
check((await page.locator('[data-apt-id="A1-1"]').innerText()).includes('Rottenstreich'), '11h the nameless-number unit shows its name on the diagram');
const c51d = await page.locator('[data-apt-id="A1-51"]').evaluate(el => el.closest('[data-floor-row]').getAttribute('data-floor-row'));
check(c51d === '13', '11i 51 sits on its new floor on the diagram');

// ── 12. Escape asks before discarding ──
await page.goto(`${APP}/settings`);
await page.getByRole('button', { name: /^Buildings$/ }).first().click();
await studio.waitFor({ state: 'visible' });

// ── 13. All buildings at once; empty squares select and merge (owner, 2026-09-15) ──
check(await page.locator('[data-builder-building]').count() === 3, '13 all three buildings are on screen at once');
const a2Labels = await attrs(page, '[data-builder-building="A2"] [data-builder-floor-label]', 'data-builder-floor-label');
check(a2Labels.includes('-1') && a2Labels.includes('-4') && !a2Labels.includes('-0.5'),
  '13b A2 draws its basement rows with no records at all (and no -0.5, which is A1\'s)', a2Labels.slice(-5).join(','));
const e1 = page.locator('[data-builder-empty="E|A2|10|1"]'), e2 = page.locator('[data-builder-empty="E|A2|10|2"]');
check(await e1.count() === 1 && await e2.count() === 1, '13c empty positions stand on A2 floor 10');
await e1.click();
await e2.click({ modifiers: ['Control'] });
check(/2 selected/.test(await page.locator('[data-layout-studio]').innerText()), '13d two EMPTY squares select');
check(await page.locator('[data-merge-btn]').isEnabled(), '13e and Merge is offered for them');
await page.locator('[data-merge-btn]').click();
await page.waitForTimeout(200);
check(await page.locator('[data-builder-building="A2"] [data-builder-row="10"] [data-builder-cell][data-builder-span="2"]').count() === 1,
  '13f the merge made ONE unit spanning both squares');

await page.locator('[data-builder-cell="A1-48"]').click();
await page.locator('[data-rename-btn]').click();
// Key by key: a modal declared inside the render body remounts on every
// keystroke and drops focus after the first letter (the standing trap).
await page.locator('[data-rename-input]').fill('');
await page.locator('[data-rename-input]').pressSequentially('Levi & Sons', { delay: 20 });
check(await page.locator('[data-rename-input]').inputValue() === 'Levi & Sons' && await page.locator('[data-rename-input]').evaluate(el => el === document.activeElement), '12a the rename box keeps focus through typing');
await page.locator('[data-modal-apply]').click();
await page.keyboard.press('Escape');
check(await page.locator('[data-discard-modal]').count() === 1, '12 Escape on a dirty studio asks "discard unsaved changes?"');
await page.locator('[data-discard-yes]').click();
check(await studio.count() === 0, '12b Discard closes it');
await page.waitForTimeout(400);
check((await store(page)).apartments.find(a => a.id === 'A1-48').displayName === 'Levi', '12c …and nothing was written');

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
