// The owner's 2026-09-17 list, end to end.
//
//  - a FLOOR can be renamed (right-click its label) and the name reaches the
//    project page's own diagram;
//  - the four POSITIONS across a building can be named;
//  - FLOORS can be added above/below and removed (refused while a unit sits
//    there);
//  - MERGING THE WHOLE ROW is one press — his "it's not letting me merge" was
//    a row of empty squares that could only be merged by selecting each one —
//    and a merge that would blank a real apartment ASKS first;
//  - a square can carry a NAME and no number (the pool, the gym);
//  - Save shows a BEFORE and AFTER picture of every building with the changed
//    squares ringed;
//  - a stage NOTE is what the worker reads on site, unless the office keeps it
//    to itself.
//
// Manner: seed through addInitScript ONLY when the key is absent (the app's
// flush-on-unload overwrites a patch). One live page at a time.
import { chromium } from 'playwright';

const APP = process.env.APP ?? 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const TOKEN = 'tok-layout-round';

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
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      users: [user], currentUser: user, stages,
      contractors: [{ id: 'C-1', name: 'Moshe', token: 'tok-layout-round', category: 'ac', active: true, createdAt: '2026-01-01', levelId: 'lvl-contractor' }],
      buildings: [{ id: 'A1', name: 'Building A1', displayOrder: 1 }, { id: 'A2', name: 'Building A2', displayOrder: 2 }],
      apartments: [
        apt('A1-45', 'A1', 45, 13, 1, 'Weinstein'),
        apt('A1-46', 'A1', 46, 13, 2, 'Cohen', { currentStageId: 'st-reg' }),
        apt('A1-47', 'A1', 47, 13, 3, 'Aharonov'),
        apt('A1-48', 'A1', 48, 13, 4, 'Levi'),
        // ONE apartment on minus two, the rest of the row empty — his case.
        apt('A1-B2', 'A1', 61, -2, 1, 'Storage'),
        apt('A2-1', 'A2', 1, 2, 1, 'Levi'),
      ],
      boardSettings: {},
      contractorAssignments: [{
        id: 'T-1', contractorId: 'C-1', apartmentId: 'A1-45', buildingId: 'A1',
        taskDescription: 'Run the piping', dueDate: today, days: [today], stageId: 'st-pipe',
        completedAt: null, createdAt: '2026-01-01', createdBy: 'U-t', createdByName: 'Esther',
      }],
      stageNotes: [{
        id: 'SN-1', apartmentId: 'A1-45', stageId: 'st-pipe', noteText: 'Riser is on the north wall',
        entries: [
          { id: 'E-1', text: 'Riser is on the north wall', at: '2026-09-01T09:00:00.000Z', by: 'U-t', byName: 'Esther' },
          { id: 'E-2', text: 'Owner still owes the deposit', at: '2026-09-02T09:00:00.000Z', by: 'U-t', byName: 'Esther', officeOnly: true },
        ],
        updatedAt: '2026-09-02T09:00:00.000Z', updatedBy: 'U-t', updatedByName: 'Esther',
      }],
      contractorNotes: [], contractorPhotos: [], canvasElements: [],
    }));
  });
}
const store = p => p.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')));
const attrs = (p, sel, name) => p.locator(sel).evaluateAll((els, n) => els.map(e => e.getAttribute(n)), name);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ═══ A. The studio ═══════════════════════════════════════════════════════════
{
const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
await seed(ctx);
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`${APP}/settings`);
await page.getByRole('button', { name: /^Buildings$/ }).first().click();
const studio = page.locator('[data-layout-studio]');
await studio.waitFor({ state: 'visible', timeout: 20000 });

const a1 = '[data-builder-building="A1"]';
const rowOf = sel => page.locator(sel).first().evaluate(el => el.closest('[data-builder-row]')?.getAttribute('data-builder-row'));
const floorLabels = () => attrs(page, `${a1} [data-builder-floor-label]`, 'data-builder-floor-label');
const openFloorMenu = async label => {
  await page.locator(`${a1} [data-builder-floor-label="${label}"]`).first().click({ button: 'right' });
  await page.locator('[data-builder-menu]').waitFor({ state: 'visible' });
};

// ── 1. Rename a floor ──
await openFloorMenu('-2');
await page.locator('[data-menu-item="floor-name"]').click();
await page.locator('[data-floorname-modal]').waitFor({ state: 'visible' });
const seeded = await page.locator('[data-floorname-input]').inputValue();
check(seeded === '-2', '1 the rename box opens seeded with what the row says now', seeded);
await page.locator('[data-floorname-input]').fill('-2 · Pool level');
await page.locator('[data-modal-apply]').click();
await page.locator('[data-floorname-modal]').waitFor({ state: 'hidden' });
const labs = await floorLabels();
check(labs.includes('-2 · Pool level'), '1b the row wears the name the office typed', labs.slice(-5).join(' | '));

// ── 2. Name the four positions ──
await openFloorMenu('13');
await page.locator('[data-menu-item="pos-names"]').click();
await page.locator('[data-posnames-modal]').waitFor({ state: 'visible' });
const posCount = await page.locator('[data-posnames-modal] input').count();
check(posCount >= 4, '2 the positions box offers a name per square', String(posCount));
for (const [i, n] of [['1', 'Front left'], ['2', 'Front right'], ['3', 'Back left'], ['4', 'Back right']])
  await page.locator(`[data-pos-name-${i}]`).fill(n);
await page.locator('[data-posnames-modal] [data-modal-apply]').click();
await page.locator('[data-posnames-modal]').waitFor({ state: 'hidden' });

// ── 3. Add a floor, and refuse to remove one that still has an apartment ──
const before = (await floorLabels()).length;
await openFloorMenu('15');
await page.locator('[data-menu-item="floor-above"]').click();
const after = (await floorLabels()).length;
check(after === before + 1, '3 a floor can be added above the top one', `${before} → ${after}`);
// NOTE: a row's LABEL is not its record floor — Wolfson's towers print one
// lower. The seeded apartments sit on record floor 13, which the row calls 12.
await openFloorMenu('12');
await page.locator('[data-menu-item="floor-remove"]').click();
const refused = await page.locator('text=/still has an apartment/i').count();
check(refused > 0, '3b removing a floor that still holds an apartment is refused');
check((await floorLabels()).length === after, '3c and nothing was removed');
await openFloorMenu('-3');
await page.locator('[data-menu-item="floor-remove"]').click();
check((await floorLabels()).length === after - 1, '3d an empty floor is removed');

// ── 4. Merge the WHOLE ROW in one press (his minus-two case) ──
const b2 = page.locator('[data-builder-cell="A1-B2"]');
await b2.click({ button: 'right' });
await page.locator('[data-builder-menu]').waitFor({ state: 'visible' });
await page.locator('[data-menu-item="merge-row"]').click();
const span = await b2.getAttribute('data-builder-span');
check(Number(span) >= 4, '4 one press merges the whole row into one wide square', `span=${span}`);
const rowCells = await page.locator(`${a1} [data-builder-row="-2"] [data-builder-cell], ${a1} [data-builder-row="-2"] [data-builder-empty]`).count();
check(rowCells === 1, '4b the row is one square now', String(rowCells));

// ── 5. A merge that would blank a real apartment asks first ──
await page.locator('[data-builder-cell="A1-45"]').click();
await page.locator('[data-builder-cell="A1-46"]').click({ modifiers: ['Control'] });
await page.locator('[data-merge-btn]').click();
const warn = page.locator('[data-mergewarn-modal]');
await warn.waitFor({ state: 'visible' });
const lose = await page.locator('[data-merge-lose]').allInnerTexts();
check(lose.some(t => /Cohen/.test(t)), '5 the warning names the apartment that would lose its number and name', lose.join(','));
await page.locator('[data-merge-go]').click();
await warn.waitFor({ state: 'hidden' });
check(Number(await page.locator('[data-builder-cell="A1-45"]').getAttribute('data-builder-span')) === 2, '5b answering yes merges them');

// ── 6. A square with a name and no number ──
const emptyCell = page.locator(`${a1} [data-builder-empty]`).first();
const emptyKey = await emptyCell.getAttribute('data-builder-empty');
await emptyCell.click({ button: 'right' });
await page.locator('[data-builder-menu]').waitFor({ state: 'visible' });
await page.locator('[data-menu-item="name-square"]').click();
await page.locator('[data-rename-modal]').waitFor({ state: 'visible' });
await page.locator('[data-rename-input]').fill('Gym');
await page.locator('[data-modal-apply]').click();
await page.locator('[data-rename-modal]').waitFor({ state: 'hidden' });
const named = page.locator(`${a1} [data-builder-name="Gym"]`);
check(await named.count() === 1, '6 an empty square takes a NAME with no number', emptyKey ?? '');
check(await named.first().getAttribute('data-builder-num') === '', '6b and carries no number');

// ── 7. Save shows a before and after PICTURE ──
await page.locator('[data-builder-save]').click();
const save = page.locator('[data-save-modal]');
await save.waitFor({ state: 'visible' });
check(await page.locator('[data-save-side="before"]').count() === 1 && await page.locator('[data-save-side="after"]').count() === 1,
  '7 the save screen shows NOW and AFTER SAVING side by side');
const beforeB = await page.locator('[data-save-side="before"] [data-mini-building]').count();
const afterB = await page.locator('[data-save-side="after"] [data-mini-building]').count();
check(beforeB === 2 && afterB === 2, '7b every building is drawn on both sides', `${beforeB} / ${afterB}`);
const marked = await page.locator('[data-save-side="after"] [data-mini-mark]').count();
check(marked > 0, '7c the squares that changed are ringed', String(marked));
const newMark = await page.locator('[data-save-side="after"] [data-mini-mark="new"]').count();
check(newMark > 0, '7d the new square (the gym) is ringed as new');
const listHidden = await page.locator('[data-save-change]').first().isVisible().catch(() => false);
check(!listHidden, '7e the written list is folded away behind its own button');
await page.locator('[data-save-list-toggle]').click();
check(await page.locator('[data-save-change]').first().isVisible(), '7f and opens when pressed');
await page.locator('[data-save-write]').click();
await save.waitFor({ state: 'hidden' });
await page.waitForTimeout(700);   // persist() is debounced 250ms

// ── 8. It all reached the records ──
const st = await store(page);
const lay = st.boardSettings?.wolfson?.buildingLayout?.A1 ?? {};
check(lay.floorNames?.['-2'] === '-2 · Pool level', '8 the floor name is saved', JSON.stringify(lay.floorNames));
check((lay.colNames ?? [])[0] === 'Front left', '8b the position names are saved', JSON.stringify(lay.colNames));
check((lay.addFloors ?? []).length === 1, '8c the added floor is saved', JSON.stringify(lay.addFloors));
const gym = st.apartments.find(a => a.displayName === 'Gym');
check(!!gym && gym.apartmentNumber === '' && !gym.isUnnamed, '8d the gym is a real unit with a name and no number');
const b2rec = st.apartments.find(a => a.id === 'A1-B2');
check((b2rec?.colSpan ?? 1) >= 4, '8e the merged basement row is one unit spanning the row', String(b2rec?.colSpan));

// ── 9. The project page draws the names ──
await page.locator('[data-builder-close]').click();
await page.goto(`${APP}/project`);
await page.locator('[data-floor-row]').first().waitFor({ state: 'visible', timeout: 15000 });
const diagLabels = await attrs(page, '[data-floor-label]', 'data-floor-label');
check(diagLabels.includes('-2 · Pool level'), '9 the buildings page shows the floor by its new name', diagLabels.filter(l => l.startsWith('-')).join(' | '));
const posNames = await page.locator('[data-position-names]').first().innerText().catch(() => '');
check(/Front left/.test(posNames), '9b and names the positions across the top', posNames.replace(/\n/g, ' '));

await page.close();
await ctx.close();
}

// ═══ B. The notes tab decides who reads a note ═══════════════════════════════
{
const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
await seed(ctx);
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`${APP}/project`);
await page.locator('[data-apt-id="A1-45"]').first().click();
await page.locator('.drawer-panel').waitFor({ state: 'visible', timeout: 15000 });
await page.getByRole('button', { name: /Stages|Notes|שלבים/i }).first().click();
const bullet = page.locator('[data-note-audience="E-1"]');
await bullet.waitFor({ state: 'visible', timeout: 10000 });
check(await bullet.getAttribute('data-office-only') === null, '10 a note reaches the worker by default');
check(/worker sees/i.test(await bullet.innerText()), '10b and says so on the line', await bullet.innerText());
const kept = page.locator('[data-note-audience="E-2"]');
check(await kept.getAttribute('data-office-only') === '1', '10c the one the office kept back is marked office only');
await bullet.click();
await page.waitForTimeout(400);
const st2 = await store(page);
const e1 = st2.stageNotes[0].entries.find(e => e.id === 'E-1');
check(e1?.officeOnly === true, '10d pressing it keeps that note in the office');
await page.close();
await ctx.close();
}

// ═══ C. The worker reads the office's note on site ═══════════════════════════
{
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await seed(ctx);
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`${APP}/c/${TOKEN}`);
await page.waitForTimeout(2500);
const all = page.locator('[data-filter-all], button:has-text("All")').first();
if (await all.count()) await all.click().catch(() => {});
await page.getByText('Run the piping').first().click();
const notes = page.locator('[data-site-notes]');
await notes.waitFor({ state: 'visible', timeout: 10000 });
const txt = await notes.innerText();
check(/Riser is on the north wall/.test(txt), '11 the worker reads the office note for this stage on site', txt.replace(/\n/g, ' ').slice(0, 90));
check(!/deposit/i.test(txt), '11b and never the one the office kept to itself');
check(/Piping/.test(txt), '11c the block names the stage it belongs to');
await page.close();
await ctx.close();
}

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
