// The four-ask round (2026-09-03): messages and tasks translated into the
// reader's language with a Show-original toggle (the office reads a worker's
// Russian in English; the Russian worker reads the office's English in
// Russian; nothing already in the reader's language is touched), Russian as a
// portal language settable from either end, and the building-map project
// bubbles that come with the diagrams permission itself — including from the
// Job Board, where there are no buildings to stand on.
//
// Runs on the 5174 server (VITE_DRIVE_API_KEY set — the translator rightly
// does nothing without a key). The translate route is STUBBED: it tags every
// text with the target, which is enough to prove what was sent and what was
// not.
import { chromium } from 'playwright';

const APP = 'http://localhost:5174';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const today = new Date().toISOString().slice(0, 10);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

function seed(ctx) {
  return ctx.addInitScript(({ today }) => {
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    localStorage.setItem('board_default_zoom_general', '1');
    if (localStorage.getItem('general_app_data')) return;
    const user = { id: 'U-t', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
    const ivan = { id: 'C-iv', name: 'Ivan', email: '', category: 'ac', token: 'tok-iv', active: true,
      photosOptional: true, createdAt: '2026-01-01', lang: 'ru',
      perms: { seeDiagrams: true, seeAllApartments: true } };
    const job = (id, name, x) => ({
      id, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: name, isUnnamed: false,
      isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null,
      stageDates: {}, canvasX: x, canvasY: 190,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    });
    localStorage.setItem('general_app_data', JSON.stringify({
      users: [user], currentUser: user, stages: [], contractors: [ivan],
      apartments: [job('G-1', 'Levi', 300)],
      contractorAssignments: [{
        id: 'T-ru', contractorId: 'C-iv', apartmentId: 'G-1', buildingId: 'G',
        taskDescription: 'Hang the unit in the bedroom', stageId: null, dueDate: today,
        priority: 'normal', completedAt: null, createdAt: '2026-08-01', createdBy: 'U-t', createdByName: 'Esther',
      }],
      contractorNotes: [
        { id: 'N-off', assignmentId: 'T-ru', apartmentId: 'G-1', contractorId: 'C-iv',
          text: 'Please finish by Friday', authorType: 'office', authorName: 'Esther', createdAt: '2026-09-01T09:00:00.000Z' },
        { id: 'N-ru', assignmentId: 'T-ru', apartmentId: 'G-1', contractorId: 'C-iv',
          text: 'Готово, установил блок в спальне', authorType: 'contractor', authorName: 'Ivan', createdAt: '2026-09-01T10:00:00.000Z' },
      ],
      contractorPhotos: [], canvasElements: [],
    }));
    // A Wolfson snapshot with two buildings, so the map has somewhere to go.
    const apt = (id, b, n, f) => ({
      id, buildingId: b, floor: f, apartmentNumber: String(n), displayName: '', isUnnamed: false,
      isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {},
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    });
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      users: [user], currentUser: user, stages: [], contractors: [ivan],
      buildings: [{ id: 'A1', name: 'Building A1' }, { id: 'A2', name: 'Building A2' }, { id: 'A3', name: 'Building A3' }],
      apartments: [apt('A1-1', 'A1', 1, 2), apt('A1-2', 'A1', 2, 2), apt('A2-1', 'A2', 1, 2), apt('A2-2', 'A2', 2, 2)],
      contractorAssignments: [], contractorNotes: [], contractorPhotos: [], canvasElements: [],
    }));
  }, { today });
}

/** The translator, stubbed: tags with the target so the wire is legible. */
let calls = [];
async function stubTranslate(ctx, mode = 'ok') {
  await ctx.route('**/api/geocode', async route => {
    const body = route.request().postDataJSON();
    if (!body?.translate) return route.fulfill({ json: { found: false } });
    calls.push({ target: body.translate.target, n: body.translate.items.length, key: route.request().headers()['x-api-key'] });
    if (mode === 'off') return route.fulfill({ status: 501, json: { error: 'not configured' } });
    return route.fulfill({ json: { items: body.translate.items.map(it => ({ id: it.id, text: `[${body.translate.target}] ${it.text}` })) } });
  });
}
const stubRest = async ctx => {
  await ctx.route('**/api/drive-files', r => r.fulfill({ json: { files: [] } }));
  await ctx.route('**/api/share', r => r.fulfill({ json: { ok: true } }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
};

// ── 1 · the OFFICE reads Ivan's Russian in English ──────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx); await stubTranslate(ctx); await stubRest(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/jobs`);
  await page.waitForTimeout(2800);
  await page.locator('[data-node-id="G-1"]').dblclick();
  await page.waitForTimeout(1200);
  await page.locator('button', { hasText: /^Tasks/ }).first().click();
  await page.waitForTimeout(1500);
  const texts = page.locator('[data-thread-text]');
  check(await texts.count() === 2, 'the thread shows both messages', String(await texts.count()));
  const ru = texts.filter({ hasText: /Готово|\[en\]/ }).first();
  check((await ru.innerText()).includes('[en] Готово'), 'the worker\'s Russian arrives translated for the office', await ru.innerText());
  check(await ru.locator('[data-translate-toggle]').count() === 1, 'with a Show-original link', );
  check((await ru.locator('[data-translate-toggle]').innerText()).includes('Show original'), 'in the office\'s own words');
  await ru.locator('[data-translate-toggle]').click();
  await page.waitForTimeout(200);
  const orig = await ru.innerText();
  check(orig.includes('Готово, установил') && !orig.includes('[en]'), 'the link shows the original', orig);
  check((await ru.locator('[data-translate-toggle]').innerText()).includes('Show translation'), 'and offers the translation back');
  const en = texts.filter({ hasText: 'Please finish' }).first();
  check(await en.locator('[data-translate-toggle]').count() === 0, 'an English message in the English office is left alone');
  const taskText = await page.locator('[data-task-text]').first().innerText();
  check(taskText.includes('Hang the unit') && !taskText.includes('[en]'), 'an English task is not sent for translation', taskText);
  check(calls.every(c => c.target === 'en') && calls.every(c => c.key === 'testkey'),
    'every request asks for English and carries the app key', JSON.stringify(calls));
  check(calls.length === 1, 'and the thread cost ONE round trip', String(calls.length));
  // Cached: reopening asks nothing.
  const before = calls.length;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.locator('[data-node-id="G-1"]').dblclick();
  await page.waitForTimeout(1000);
  await page.locator('button', { hasText: /^Tasks/ }).first().click();
  await page.waitForTimeout(800);
  check(calls.length === before, 'reopening the thread reads the cache — no new request', `${calls.length - before} new`);
  await ctx.close();
}

// ── 2 · IVAN reads the office in Russian; the map's project bubbles ─────────
{
  calls = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await seed(ctx); await stubTranslate(ctx); await stubRest(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/c/tok-iv`);
  await page.waitForTimeout(3000);
  check((await page.locator('text=Мои задачи').count()) >= 1, 'the portal opens in Russian for a worker set to it');
  await page.locator('button', { hasText: /^Все$/ }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  const row = page.locator('button:has-text("[ru] Hang the unit")');
  check(await row.count() >= 1, 'the English task reads in Russian on his list');
  await row.first().click();
  await page.waitForTimeout(1500);
  const tt = page.locator('[data-task-text]').first();
  check((await tt.innerText()).includes('[ru] Hang the unit') && await tt.locator('[data-translate-toggle]').count() === 1,
    'the task sheet shows the translation with its toggle', await tt.innerText());
  check((await tt.locator('[data-translate-toggle]').innerText()).includes('Показать оригинал'), 'the toggle speaks Russian');
  const off = page.locator('[data-thread-text]', { hasText: /Please finish|\[ru\]/ }).first();
  check((await off.innerText()).includes('[ru] Please finish'), 'the office\'s English message reads in Russian', await off.innerText());
  const own = page.locator('[data-thread-text]', { hasText: 'Готово' }).first();
  check(await own.locator('[data-translate-toggle]').count() === 0, 'his own Russian is left exactly as he wrote it');
  check(calls.every(c => c.target === 'ru'), 'every request asks for Russian', JSON.stringify(calls));

  // The map: no buildings on the Job Board, but the project bubbles stand.
  await page.locator('button:has-text("Карта здания")').first().click().catch(async () => {
    // The sheet may still be open — close it by its backdrop first.
    await page.mouse.click(10, 10); await page.waitForTimeout(400);
    await page.locator('button:has-text("Карта здания")').first().click();
  });
  await page.waitForTimeout(800);
  check(await page.locator('[data-map-project-pick="wolfson"]').count() === 1
    && await page.locator('[data-map-project-pick="netiv"]').count() === 1,
    'the building projects are offered on the Job Board, with no switch-workspace permission');
  check((await page.locator('text=Выберите проект').count()) >= 1, 'and the empty map says to pick one');
  await page.locator('[data-map-project-pick="wolfson"]').click();
  await page.waitForTimeout(2500);
  check(await page.locator('[data-map-building="A1"]').count() === 1 && await page.locator('[data-map-building="A2"]').count() === 1,
    'picking Wolfson shows its buildings as pills');
  check(await page.locator('[data-map-building="all"]').count() === 1, 'plus an All pill');
  const label = await page.locator('[data-map-project]').innerText();
  check(label.includes('Wolfson') && label.includes('A1'), 'the header names the project and the building', label.replace(/\n/g, ' '));
  await page.locator('[data-map-building="A2"]').click();
  await page.waitForTimeout(400);
  check((await page.locator('[data-map-project]').innerText()).includes('A2'), 'a building pill switches the building');
  await page.locator('[data-map-building="all"]').click();
  await page.waitForTimeout(400);
  check((await page.locator('[data-map-project]').innerText()).includes('Все здания'), 'All shows every building');

  // The gear: pick Hebrew, and the choice lands on the worker record.
  await page.locator('button[title="Text size"], button[title="גודל טקסט"]').first().click().catch(() => {});
  await page.waitForTimeout(300);
  check(await page.locator('[data-portal-lang="ru"]').count() === 1, 'the gear offers all three languages');
  await page.locator('[data-portal-lang="he"]').click();
  await page.waitForTimeout(800);
  check((await page.locator('text=המשימות שלי').count()) >= 1, 'picking Hebrew switches the portal at once');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')).contractors.find(c => c.id === 'C-iv').lang);
  check(stored === 'he', 'and the choice is written onto the worker', String(stored));
  await ctx.close();
}

// ── 3 · no key on the server: originals, quietly, one request ───────────────
{
  calls = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx); await stubTranslate(ctx, 'off'); await stubRest(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/jobs`);
  await page.waitForTimeout(2800);
  await page.locator('[data-node-id="G-1"]').dblclick();
  await page.waitForTimeout(1200);
  await page.locator('button', { hasText: /^Tasks/ }).first().click();
  await page.waitForTimeout(1500);
  const ru = page.locator('[data-thread-text]', { hasText: 'Готово' }).first();
  check((await ru.innerText()).includes('Готово, установил') && await ru.locator('[data-translate-toggle]').count() === 0,
    'with no key on the server the original shows with no toggle');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.locator('[data-node-id="G-1"]').dblclick();
  await page.waitForTimeout(1000);
  await page.locator('button', { hasText: /^Tasks/ }).first().click();
  await page.waitForTimeout(800);
  check(calls.length === 1, 'and the app stops asking after the first refusal', String(calls.length));
  await ctx.close();
}

// ── 4 · the office's worker list offers Russian ─────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx); await stubTranslate(ctx); await stubRest(ctx);
  const page = await ctx.newPage();
  await page.goto(`${APP}/app-settings`);
  await page.waitForTimeout(2000);
  await page.locator('button', { hasText: /^Workers$/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const opts = await page.locator('[data-worker-lang] option').allTextContents();
  check(opts.some(o => o.includes('Русский')), 'Settings → Workers offers Русский', opts.join(' | '));
  await ctx.close();
}

await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
