// Round 48 — the worker's phone, from the owner's recording of Igor's portal
// (2026-10-07). Igor reads Russian; every check runs on a 390×844 phone.
//   1 · the task list: open first — problems, today, past due (most recently
//       due first), the future (soonest first), dateless — then a line
//       "Done · N", then the done work newest-closed first;
//   2 · the building map never lands on (or offers) the Job Board, a stored
//       pick of a building-less workspace is ignored, and only apartments
//       with OPEN work are lit;
//   3 · "I'm going to work here": never Sold/Start, "What are you doing here
//       today?", then "Are you sure…" reading his picks back (Back keeps
//       them, Yes starts), and the task remembers the apartment's marks
//       from before he touched them (marksBefore);
//   4 · a report he started himself can be moved WITHOUT the moveOwnWork
//       switch, and the confirm says the apartment he leaves goes back;
//       an office task still needs the switch;
//   5 · the task sheet: "Task: …" on one line, the day and the address +
//       Waze on one line, no Mark up in the plans row, the opened plan with
//       no navy bar, fitted to the width, Mark up (blue) + Download on its
//       corner, pins still on the sheet; the messages smaller with a plain
//       "Send a note or message to the office" button;
//   6 · the calendar: open work one by one, DONE folded into one chip per
//       workspace per day (month → a sheet listing them, each a door; week →
//       a collapsible "N done in Wolfson" row);
//   7 · a phone whose worker record lands AFTER the page opened no longer
//       crashes (the hooks-after-early-return fault).
// Run: node scratchpad/portal-r48.mjs   (APP=http://localhost:5181 to point elsewhere)
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';

const APP = process.env.APP || 'http://localhost:5173';
const PLAN_ID = 'R48PLAN01';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const at = (n, hh) => `${day(n)}T${String(hh).padStart(2, '0')}:00:00`;

async function makePlan() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([1191, 842]);
  page.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  page.drawText('SHEET 1 — MECHANICAL LAYOUT', { x: 56, y: 770, size: 26, color: rgb(0.12, 0.23, 0.37) });
  return Buffer.from(await doc.save());
}
const planBytes = await makePlan();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ── the seed ─────────────────────────────────────────────────────────────────
const STAGES = [
  { id: 'skhtatb', name: 'Sold/Start', nameRu: 'Продано/Старт', color: '#64748b', order: 1, active: true, kind: 'work' },
  { id: 's-drilling', name: 'Drilling', nameRu: 'Сверление', color: '#0891b2', order: 2, active: true, kind: 'work' },
  { id: 's1-piping', name: 'Piping', nameRu: 'Трубы', color: '#3b82f6', order: 3, active: true, kind: 'work' },
  { id: 's1-concealed', name: 'Concealed Units', nameRu: 'Скрытые блоки', color: '#8b5cf6', order: 4, active: true, kind: 'work' },
  { id: 's4-wall', name: 'Wall Units', nameRu: 'Настенные блоки', color: '#f59e0b', order: 6, active: true, kind: 'work' },
  { id: 's4-outdoor', name: 'Outdoor Units', nameRu: 'Наружные блоки', color: '#84cc16', order: 7, active: true, kind: 'work' },
  { id: 'g-install', name: 'AC installation', color: '#ea6b13', order: 1, active: true, projectId: 'general' },
];
const IGOR = (perms) => ({ id: 'C-igor', name: 'Igor', category: 'ac', token: 'tok-igor', active: true, createdAt: '2026-01-01', lang: 'ru', perms });
const apt = (id, b, num, floor, name, extra = {}) => ({
  id, buildingId: b, floor, apartmentNumber: num, displayName: name, isUnnamed: false, isDuplexApt: false,
  classification: 'standard', generalNotes: '', currentStageId: 's-drilling', stageDates: {},
  bubbles: true, stageMarks: { skhtatb: 'done' },
  createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U', ...extra,
});
const task = (id, aptId, b, text, due, extra = {}) => ({
  id, contractorId: 'C-igor', apartmentId: aptId, buildingId: b, taskDescription: text, stageId: 's-drilling',
  dueDate: due, priority: 'normal', completedAt: null, createdAt: at(-10, 8), createdBy: 'U-esther', createdByName: 'Esther', ...extra,
});
const report = (id, aptId, b, text, d, hh) => task(id, aptId, b, text, day(d), {
  stageReport: true, createdBy: 'C-igor', createdByName: 'Igor', completedAt: at(d, hh), stageIds: ['s-drilling'], stagesWorked: ['s-drilling'],
});

function seed([data, opts]) {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', opts.active);
  if (opts.mapPick && !localStorage.getItem('portal_map_tok-igor')) localStorage.setItem('portal_map_tok-igor', opts.mapPick);
  for (const [k, v] of Object.entries(data)) if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v));
}
function seedData(perms, { netivWork = false } = {}) {
  const common = {
    currentUser: { id: 'U-esther', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    users: [{ id: 'U-esther', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' }],
    stages: STAGES,
    contractors: [IGOR(perms)],
  };
  const wolfson = {
    ...common,
    apartments: [
      apt('A1-9', 'A1', '9', 4, 'Levanon', { address: '12 Hazayit St, Beit Shemesh', plansPdfLink: `https://drive.google.com/file/d/${PLAN_ID}/view` }),
      apt('A1-10', 'A1', '10', 4, 'Tamir'),
      apt('A1-11', 'A1', '11', 4, 'Oren'),
      apt('A1-12', 'A1', '12', 4, 'Sela'),
      apt('A2-5', 'A2', '5', 3, 'Gefen'),
      apt('A2-6', 'A2', '6', 3, 'Nahar'),
      apt('A3-9', 'A3', '9', 4, 'Shaked'),
      apt('A3-10', 'A3', '10', 4, 'Dekel'),
    ],
    contractorAssignments: [
      task('T-today', 'A1-9', 'A1', 'AC installation', day(0)),
      task('T-over1', 'A1-10', 'A1', 'Fix the drain', day(-1)),
      task('T-over4', 'A2-5', 'A2', 'Check the pipes', day(-4)),
      task('T-fut2', 'A3-9', 'A3', 'Hang the outdoor unit', day(2)),
      task('T-fut6', 'A3-10', 'A3', 'Fit the thermostat', day(6)),
      task('T-multi', 'A1-11', 'A1', 'Three-day piping', day(1), { days: [day(-1), day(0), day(1)] }),
      task('T-nodate', 'A1-10', 'A1', 'Grille whenever', null),
      task('T-prob', 'A2-5', 'A2', 'Leak under the unit', day(3), { problem: { status: 'open', photosRequired: true, stageBefore: null } }),
      task('SR-own', 'A1-12', 'A1', 'Drilling — working here today', day(0), {
        stageReport: true, createdBy: 'C-igor', createdByName: 'Igor', stageIds: ['s-drilling'], stagesWorked: ['s-drilling'],
        marksBefore: { skhtatb: 'done' }, marksBeforeAt: at(0, 7),
      }),
      report('D-1', 'A1-10', 'A1', 'Drilling — working here today', -2, 9),
      report('D-2', 'A1-11', 'A1', 'Drilling — working here today', -2, 10),
      report('D-3', 'A3-9', 'A3', 'Drilling — working here today', -2, 11),
      report('D-4', 'A3-10', 'A3', 'Drilling — working here today', -2, 12),
      report('D-5', 'A1-12', 'A1', 'Drilling — working here today', -2, 13),
      task('D-6', 'A2-6', 'A2', 'Office job, finished', day(-2), { completedAt: at(-2, 15) }),
    ],
    contractorNotes: [{
      id: 'N-1', assignmentId: 'T-today', apartmentId: 'A1-9', contractorId: 'C-igor', authorType: 'office',
      authorId: 'U-esther', authorName: 'Esther', text: 'The unit is in the storeroom', createdAt: at(-1, 9),
    }],
    planPins: [{ id: 'PIN-1', apartmentId: 'A1-9', xPct: 30, yPct: 40, text: 'Duct here', createdAt: at(-1, 9), createdBy: 'Office' }],
  };
  const general = {
    ...common,
    apartments: [{ id: 'G-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Harel office', isUnnamed: false,
      classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    contractorAssignments: [
      { ...task('G-job', 'G-1', 'G', 'Survey the office', day(1)), stageId: null },
      { ...task('G-done', 'G-1', 'G', 'Measured the office', day(-2)), stageId: null, completedAt: at(-2, 16) },
    ],
  };
  const out = { wolfson_app_data: wolfson, general_app_data: general };
  if (netivWork) {
    out.netiv_app_data = {
      ...common,
      apartments: [{ ...apt('B1-8', 'B1', '8', 3, 'Rimon') }],
      contractorAssignments: [task('N-job', 'B1-8', 'B1', 'Netiv job', day(1))],
    };
  }
  return out;
}

async function routes(ctx) {
  // Newest route wins — the catch-all goes first.
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  await ctx.route('**://fonts.googleapis.com/**', r => r.abort());
}
async function phone(perms, opts, dataOpts) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await routes(ctx);
  await ctx.addInitScript(seed, [seedData(perms, dataOpts), opts]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (/localStorage/.test(e.message)) return; console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; });
  await page.goto(`${APP}/c/tok-igor`);
  await page.waitForTimeout(2600);
  return { ctx, page };
}
const store = (page, key = 'wolfson_app_data') => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), key);
const waitFor = async (page, sel, tries = 60) => { for (let i = 0; i < tries; i++) { if (await page.locator(sel).count()) return true; await page.waitForTimeout(150); } return false; };
const waitSheet = async (page, scope) => {
  for (let i = 0; i < 120; i++) {
    const ok = await page.evaluate(sel => {
      const root = document.querySelector(sel);
      return !!root && [...root.querySelectorAll('canvas')].some(c => c.width > 50);
    }, scope);
    if (ok) return true;
    await page.waitForTimeout(250);
  }
  return false;
};
const tab = (page, re) => page.evaluate(src => {
  const r = new RegExp(src);
  [...document.querySelectorAll('button')].find(b => r.test((b.textContent || '').trim()))?.click();
}, re.source);
const closeSheet = page => page.mouse.click(195, 30);
/** SHOTS=<dir> saves a picture at each step, for eyes. */
const shot = (page, name) => process.env.SHOTS ? page.screenshot({ path: `${process.env.SHOTS}/r48-${name}.png` }) : null;

const BASE = { seeSchedule: true, markUpPlans: true };

// ══ A · Igor's phone, opened standing on the Job Board, his map pick stored as the Job Board ══
{
  const { ctx, page } = await phone(BASE, { active: 'general', mapPick: 'general' });

  // ── 1 · the list ──────────────────────────────────────────────────────────
  const order = await page.evaluate(() => [...document.querySelectorAll('[data-task-card], [data-list-divider]')]
    .map(el => el.hasAttribute('data-list-divider') ? '|' : el.getAttribute('data-task-card')));
  const want = ['T-prob', 'T-today', 'T-multi', 'SR-own', 'T-over1', 'T-over4', 'G-job', 'T-fut2', 'T-fut6', 'T-nodate',
    '|', 'G-done', 'D-6', 'D-5', 'D-4', 'D-3', 'D-2', 'D-1'];
  check(JSON.stringify(order) === JSON.stringify(want),
    'the list: problem · today (incl. the multi-day task covering today) · past due (most recently due first) · future (soonest first, every workspace) · dateless · LINE · done newest first',
    order.join(' '));
  await page.locator('[data-list-divider]').scrollIntoViewIfNeeded(); await shot(page, '1-list');
  const divider = (await page.locator('[data-list-divider]').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  check(/Готово · 7/.test(divider), 'the line reads "Готово · 7" in his language', divider);
  await tab(page, /^Сегодня$/);
  await page.waitForTimeout(400);
  check(await page.locator('[data-list-divider]').count() === 0, 'a day filter holds no done work, so no line');
  await tab(page, /^Все$/);
  await page.waitForTimeout(300);

  // ── 2 · the map ───────────────────────────────────────────────────────────
  await tab(page, /Карта здания|Building Map/);
  await waitFor(page, '[data-apt-id="A1-9"]', 80);
  const pid = await page.evaluate(() => localStorage.getItem('active_project'));
  const barName = (await page.locator('[data-map-project-btn]').innerText().catch(() => '')).trim();
  check(pid === 'wolfson' && /Wolfson/.test(barName) && !/Job Board/.test(barName),
    'the map left the Job Board for Wolfson — a stored pick of a workspace with no buildings is ignored', `${pid} · "${barName}"`);
  check(await page.locator('[data-map-chooser]').count() === 0 && await page.locator('[data-apt-id="A1-9"]').count() > 0,
    'his only building workspace with open work opens straight in, cells drawn');
  // A phone draws ONE building at a time — read A1, then switch to A2.
  const litOf = ids => page.evaluate(list => Object.fromEntries(list.map(id => {
    const c = document.querySelector(`[data-apt-id="${id}"]`);
    return [id, !c ? 'absent' : /245, 158, 11/.test(getComputedStyle(c).boxShadow) ? 'lit' : 'dim'];
  })), ids);
  const litA1 = await litOf(['A1-9', 'A1-12']);
  await page.locator('[data-map-building="A2"]').click();
  await page.waitForTimeout(500);
  const litA2 = await litOf(['A2-5', 'A2-6']);
  const lit = { ...litA1, ...litA2 };
  check(lit['A1-9'] === 'lit' && lit['A1-12'] === 'lit' && lit['A2-5'] === 'lit' && lit['A2-6'] === 'dim',
    'only apartments with OPEN work are lit (A2-6 holds only finished work and is not)', JSON.stringify(lit));
  await page.locator('[data-map-building="A1"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-map-project-btn]').click();
  await page.waitForTimeout(400);
  await shot(page, '2-map');
  const offered = await page.locator('[data-map-project-pick]').evaluateAll(els => els.map(e => e.getAttribute('data-map-project-pick')));
  check(!offered.includes('general') && offered.includes('wolfson'), 'the project sheet never offers the Job Board', offered.join(','));
  await page.mouse.click(195, 100);
  await page.waitForTimeout(300);

  // ── 3 · "I'm going to work here" ───────────────────────────────────────────
  await page.locator('[data-apt-id="A1-9"]').first().click();
  await page.waitForTimeout(500);
  await page.locator('[data-work-here]').click();
  await page.waitForTimeout(400);
  const pickText = await page.locator('[data-work-pick]').innerText();
  check(/Что вы делаете здесь сегодня\?/.test(pickText), 'the question is about TODAY, in Russian', pickText.split('\n')[0]);
  check(await page.locator('[data-work-stage="skhtatb"]').count() === 0, 'Sold/Start is never offered');
  check(await page.locator('[data-work-stage="s-drilling"]').count() === 1 && await page.locator('[data-work-stage="s1-piping"]').count() === 1,
    'the real work stages are (Drilling, Piping, …)');
  await page.locator('[data-work-stage="s-drilling"]').click();
  await page.locator('[data-work-stage="s1-piping"]').click();
  await page.locator('[data-work-start]').click();
  await page.waitForTimeout(300);
  await shot(page, '3-confirm');
  check(await page.locator('[data-work-confirm]').count() === 1, 'Start ASKS before anything is written');
  const conf = await page.locator('[data-work-confirm]').innerText();
  check(/Вы уверены/.test(conf) && /Сверление/.test(conf) && /Трубы/.test(conf) && /9/.test(conf),
    '"Вы уверены…" reads his two picks back in Russian, with the apartment', conf.replace(/\s+/g, ' ').slice(0, 120));
  let d = await store(page);
  check(!d.contractorAssignments.some(a => a.stageReport && a.apartmentId === 'A1-9'), 'nothing was created by Start alone');
  await page.locator('[data-work-confirm-back]').click();
  await page.waitForTimeout(250);
  check(await page.locator('[data-work-pick]').count() === 1 && await page.locator('[data-work-stage="s-drilling"][data-on]').count() === 1
    && await page.locator('[data-work-stage="s1-piping"][data-on]').count() === 1, 'Back returns to the picks, both still ticked');
  await page.locator('[data-work-start]').click();
  await page.waitForTimeout(250);
  await page.locator('[data-work-confirm-yes]').click();
  await page.waitForTimeout(1000);
  d = await store(page);
  const rep = d.contractorAssignments.find(a => a.stageReport && a.apartmentId === 'A1-9' && !a.completedAt);
  check(!!rep && JSON.stringify(rep.marksBefore) === JSON.stringify({ skhtatb: 'done' }) && !!rep.marksBeforeAt,
    'Yes starts the work, and the task remembers the apartment\'s marks from BEFORE', JSON.stringify(rep?.marksBefore));
  const a19 = d.apartments.find(a => a.id === 'A1-9');
  check(a19.stageMarks['s-drilling'] === 'doing' && a19.stageMarks['s1-piping'] === 'doing', 'both picks are HAPPENING NOW on the apartment', JSON.stringify(a19.stageMarks));
  check(!(rep?.stageIds ?? []).includes('skhtatb'), 'and Sold/Start is not among the task\'s stages');

  // ── 4 · he moves his OWN started work, no permission needed ────────────────
  check(await page.locator(`[data-task-move="${rep?.id}"]`).count() === 1,
    'his own started report shows "Wrong apartment? Move it" WITHOUT the moveOwnWork switch');
  await page.locator(`[data-task-move="${rep?.id}"]`).click();
  await waitFor(page, '[data-move-dialog]');
  await page.locator('[data-move-pick="A1-10"]').click();
  await page.waitForTimeout(300);
  const note = (await page.locator('[data-move-note]').innerText().catch(() => '')).trim();
  check(/вернётся/.test(note), 'the confirm says, in Russian, the apartment he leaves goes back to how it was', note);
  await page.locator('[data-move-confirm]').click();
  await page.waitForTimeout(800);
  d = await store(page);
  check(d.contractorAssignments.find(a => a.id === rep?.id)?.apartmentId === 'A1-10', 'and the move goes through');
  await closeSheet(page);
  await page.waitForTimeout(400);
  await ctx.close();
}

// ══ B · the task sheet and the calendar (opened in Wolfson) ══
{
  const { ctx, page } = await phone(BASE, { active: 'wolfson' });
  await page.locator('[data-task-card="T-today"]').click();
  await waitFor(page, '[data-task-line]');
  await page.waitForTimeout(500);

  // ── 4b · an office task keeps the switch ──────────────────────────────────
  check(await page.locator('[data-task-move="T-today"]').count() === 0, 'a task the office gave him still needs the switch to move');

  // ── 5 · the sheet ─────────────────────────────────────────────────────────
  await shot(page, '5a-sheet');
  const line = (await page.locator('[data-task-line]').innerText()).replace(/\s+/g, ' ').trim();
  check(/^Задача: /.test(line), 'the task reads on ONE line: "Задача: …"', line.slice(0, 60));
  const ww = await page.evaluate(() => {
    const when = document.querySelector('[data-sheet-when]')?.getBoundingClientRect();
    const where = document.querySelector('[data-sheet-where-line]')?.getBoundingClientRect();
    const waze = document.querySelector('[data-sheet-where-line] a[href*="waze"]');
    return when && where ? { dy: Math.abs(when.top - where.top), waze: !!waze } : null;
  });
  check(!!ww && ww.dy < 4 && ww.waze, 'the day (with its badge) and the address + Waze share ONE line', JSON.stringify(ww));
  const headHas = await page.evaluate(() => {
    const h = document.querySelector('[data-plan-head]');
    return { markup: !!h?.querySelector('[data-portal-markup]'), download: /Скачать|Download/.test(h?.textContent || '') };
  });
  check(!headHas.markup && !headHas.download, 'the plans row carries no Mark up (and no Download) — only the title and View', JSON.stringify(headHas));
  await page.locator('[data-plan-toggle]').click();
  check(await waitSheet(page, '[data-plan-view="open"]'), 'View draws the sheet');
  await page.waitForTimeout(900);
  await page.locator('[data-plan-view="open"]').scrollIntoViewIfNeeded(); await shot(page, '5b-plan');
  const view = await page.evaluate(() => {
    const box = document.querySelector('[data-plan-view="open"]');
    const r = box.getBoundingClientRect();
    const pdf = [...box.querySelectorAll('canvas')].find(c => c.width > 50);
    const pr = pdf.getBoundingClientRect();
    const navy = [...box.querySelectorAll('*')].some(el => {
      const cs = getComputedStyle(el); const rr = el.getBoundingClientRect();
      return cs.backgroundColor === 'rgb(30, 58, 95)' && rr.width > r.width * 0.6 && rr.height > 20;
    });
    const mk = box.querySelector('[data-plan-markup]');
    const dl = box.querySelector('[data-plan-download]');
    return { w: r.width, h: r.height, pdfW: pr.width, navy, mk: mk ? getComputedStyle(mk).backgroundColor : null, dl: !!dl,
      sinkKids: document.querySelector('[aria-hidden="true"][style*="display: none"]')?.childElementCount ?? 0 };
  });
  check(!view.navy, 'no navy title bar over the plan — the viewer\'s bar is sent away', JSON.stringify(view));
  check(view.h < 330 && view.h > 190 && Math.abs(view.w / view.h - 1191 / 842) < 0.12,
    'the box takes the sheet\'s own shape at the phone\'s width (was a 520px tower)', `${Math.round(view.w)}×${Math.round(view.h)}`);
  check(view.pdfW > view.w * 0.8, 'the plan fills the width', `${Math.round(view.pdfW)} of ${Math.round(view.w)}px`);
  check(view.mk === 'rgb(74, 168, 216)' && view.dl, 'a small blue Mark up and Download sit on the plan\'s corner');
  const pin = await page.evaluate(() => {
    const box = document.querySelector('[data-plan-view="open"]');
    const wrap = [...box.querySelectorAll('canvas')].map(c => c.parentElement).find(w => w && w.querySelectorAll('canvas').length >= 3);
    const pdf = wrap?.querySelector('canvas'); const p = wrap?.querySelector('.absolute.-translate-y-full');
    if (!pdf || !p) return null;
    const c = pdf.getBoundingClientRect(), q = p.getBoundingClientRect();
    return { fx: (q.left + q.width / 2 - c.left) / c.width, fy: (q.bottom - c.top) / c.height };
  });
  check(!!pin && Math.abs(pin.fx - 0.3) < 0.03 && Math.abs(pin.fy - 0.4) < 0.03, 'the pin still rides the sheet at 30% / 40%', JSON.stringify(pin));
  await page.locator('[data-plan-markup]').click();
  check(await waitSheet(page, '[data-plan-surface="studio"]'), 'Mark up opens the studio');
  await page.evaluate(() => [...document.querySelectorAll('[data-plan-surface="studio"] button')].find(b => /Close|Закрыть/.test(b.title || ''))?.click());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);

  // the messages
  check(await page.locator('[data-thread-toggle]').count() === 0, 'the collapsible "Task messages" header is gone from the phone');
  const sendBtn = (await page.locator('[data-send-office]').innerText().catch(() => '')).trim();
  check(/Отправить заметку или сообщение в офис/.test(sendBtn), 'a plain button: "Отправить заметку или сообщение в офис"', sendBtn);
  const fs = await page.evaluate(() => {
    const b = document.querySelector('[data-portal-thread] [data-thread-bubble]');
    return b ? parseFloat(getComputedStyle(b).fontSize) : null;
  });
  check(fs !== null && fs <= 13.1, 'the office\'s message is shown, in a smaller font', String(fs));
  check(await page.locator('[data-portal-thread] [data-composer]').count() === 0, 'the message box waits for the press');
  await page.locator('[data-send-office]').scrollIntoViewIfNeeded(); await shot(page, '5c-messages');
  await page.locator('[data-send-office]').click();
  await page.waitForTimeout(300);
  await shot(page, '5d-composer');
  check(await page.locator('[data-portal-thread] [data-composer]').count() === 1 && await page.locator('[data-send-office]').count() === 0,
    'the press opens the box under the messages');
  await closeSheet(page);
  await page.waitForTimeout(500);

  // ── 6 · the calendar ──────────────────────────────────────────────────────
  await tab(page, /^Календарь$|^Calendar$/);
  await page.waitForTimeout(800);
  const target = day(-2);
  const now = new Date();
  if (Number(target.slice(5, 7)) !== now.getMonth() + 1) {
    await page.locator('[data-calendar-fill] button').first().click();
    await page.waitForTimeout(400);
  }
  const titles = await page.locator('[data-calendar-fill] button[title]').evaluateAll(els => els.map(e => e.getAttribute('title')));
  check(!titles.some(t => /Office job, finished|Measured the office/.test(t)),
    'no finished task is drawn on its own in the month', titles.filter(t => /finished|Measured/.test(t)).join(' | '));
  const chip = titles.find(t => /Wolfson — ✓ 6 выполнено/.test(t));
  check(!!chip && titles.some(t => /Job Board — ✓ 1 выполнено/.test(t)),
    'the done work is ONE chip per workspace per day: "✓ 6 выполнено · Wolfson" and "✓ 1 выполнено · Job Board"', titles.filter(t => /✓/.test(t)).join(' | '));
  check(titles.some(t => /AC installation/.test(t)), 'open work still stands on its own');
  await shot(page, '6a-month');
  await page.locator(`[data-calendar-fill] button[title="${chip}"]`).click();
  await page.waitForTimeout(400);
  await page.waitForTimeout(200); await shot(page, '6b-daysheet');
  const rows = await page.locator('[data-done-day-sheet] [data-done-row]').evaluateAll(els => els.map(e => e.getAttribute('data-done-row')));
  check(JSON.stringify(rows) === JSON.stringify(['D-6', 'D-5', 'D-4', 'D-3', 'D-2', 'D-1']),
    'the chip opens the day\'s list, newest closed first', rows.join(' '));
  const rowText = (await page.locator('[data-done-row="D-5"]').innerText()).replace(/\s+/g, ' ');
  check(/12/.test(rowText) && /Сверление/.test(rowText) && /13:00/.test(rowText), 'each row: unit · stage (Russian) · time', rowText);
  await page.locator('[data-done-row="D-5"]').click();
  await waitFor(page, '[data-task-line]');
  check(/Drilling — working here today|Сверление/.test(await page.locator('[data-task-line]').innerText()) && await page.locator('[data-done-day-sheet]').count() === 0,
    'a row opens that task');
  await closeSheet(page);
  await page.waitForTimeout(400);
  await page.locator('[data-cal-mode="week"]').click();
  await page.waitForTimeout(300);
  const ws0 = new Date(); ws0.setDate(ws0.getDate() - ws0.getDay());
  const wsIso = `${ws0.getFullYear()}-${String(ws0.getMonth() + 1).padStart(2, '0')}-${String(ws0.getDate()).padStart(2, '0')}`;
  if (target < wsIso) { await page.locator('[data-cal-week] button[aria-label="Previous week"]').click(); await page.waitForTimeout(300); }
  const fold = page.locator(`[data-week-done-fold="wolfson:${target}"]`);
  check(await fold.count() === 1 && /6 выполнено · Wolfson/.test(await fold.innerText()), 'the week folds the day\'s done work: "6 выполнено · Wolfson ▸"',
    (await fold.innerText().catch(() => '')).trim());
  check(await page.locator(`[data-week-done-list="wolfson:${target}"]`).count() === 0, 'folded until pressed');
  await fold.click();
  await page.waitForTimeout(250);
  await shot(page, '6c-week');
  check(await page.locator(`[data-week-done-list="wolfson:${target}"] [data-done-row]`).count() === 6, 'pressed, it opens the six');
  const todayOrder = await page.evaluate(t => {
    const fold = document.querySelector(`[data-week-done-fold^="wolfson:${t}"]`);
    return !!fold;
  }, day(0));
  check(!todayOrder, 'a day with only open work has no done row');
  await ctx.close();
}

// ══ C · open work in two building workspaces, no pick stored → the squares, never the Job Board ══
{
  const { ctx, page } = await phone(BASE, { active: 'general' }, { netivWork: true });
  await tab(page, /Карта здания|Building Map/);
  await waitFor(page, '[data-map-chooser]');
  const squares = await page.locator('[data-map-square]').evaluateAll(els => els.map(e => e.getAttribute('data-map-square')));
  check(squares.length === 2 && squares.includes('wolfson') && squares.includes('netiv') && !squares.includes('general'),
    'two maps with his work → the chooser, never a Job Board square', squares.join(','));
  await ctx.close();
}

// ══ D · a phone that opens the link before the worker's record has landed ══
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await routes(ctx);
  await ctx.addInitScript(() => { localStorage.setItem('whats_new_seen', '2099-01-01'); });
  const page = await ctx.newPage();
  let crashed = false;
  page.on('console', m => { if (/Rendered more hooks|APP CRASH/.test(m.text())) crashed = true; });
  await page.goto(`${APP}/c/late-tok`);
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const st = window.__store.getState();
    window.__store.setState({ contractors: [...st.contractors, { id: 'C-late', name: 'Latecomer', category: 'ac', token: 'late-tok', active: true, createdAt: '2026-01-01' }] });
  });
  await page.waitForTimeout(1200);
  const body = await page.locator('body').innerText();
  check(!crashed && /Latecomer/.test(body), 'the worker\'s record landing after the page opened draws his portal — no crash', crashed ? 'crashed' : body.slice(0, 40).replace(/\s+/g, ' '));
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
