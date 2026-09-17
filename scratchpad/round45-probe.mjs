// Round 45 (2026-09-17): the tablet's plan opens BIG — a portrait sheet on a
// landscape screen no longer fits to the height and comes out a narrow strip
// (the owner's photo) — and every stage the worker reads is named in HIS
// language (en / he / ru).
import { chromium, devices } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const PLAN_ID = 'ROUND45PLAN';
const sheet = async (w, h) => {
  const d = await PDFDocument.create(); const p = d.addPage([w, h]);
  p.drawRectangle({ x: 30, y: 30, width: w - 60, height: h - 60, borderWidth: 3, borderColor: rgb(.1, .1, .2) });
  p.drawText('SHEET', { x: 80, y: h - 120, size: 60, color: rgb(.12, .23, .37) });
  return Buffer.from(await d.save());
};
const PORTRAIT = await sheet(1684, 2384);   // A1 upright — the owner's plan
const LANDSCAPE = await sheet(2384, 1684);  // A1 on its side

const USER = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
const STAGES = [
  { id: 'S1', name: 'Ready to start', nameHe: 'מוכן להתחלה', nameRu: 'Готово к началу', color: '#64748b', order: 1, active: true },
  { id: 'S2', name: 'Piping', nameHe: 'צנרת', nameRu: 'Трубопровод', color: '#3b82f6', order: 2, active: true },
  { id: 'S3', name: 'Concealed units', color: '#8b5cf6', order: 3, active: true },
];
const APT = { id: 'A1-7', buildingId: 'A1', floor: 3, apartmentNumber: '7', displayName: 'Artzi', isUnnamed: false, isDuplexApt: false,
  classification: 'standard', generalNotes: '', currentStageId: 'S2', stageDates: {}, plansPdfLink: `https://drive.google.com/file/d/${PLAN_ID}/view`,
  createdAt: '2026-01-01', updatedAt: '2026-01-01' };
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const TASK = { id: 'T-1', contractorId: 'C-ru', apartmentId: 'A1-7', buildingId: 'A1', taskDescription: 'Проверить трубы', stageId: 'S2',
  dueDate: day(0), priority: 'normal', createdAt: '2026-01-01T08:00:00.000Z', completedAt: null };
const WORKER = { id: 'C-ru', name: 'Sergey', category: 'ac', token: 'tok-ru', active: true, createdAt: '2026-01-01', lang: 'ru',
  perms: { seeDiagrams: true, seeAllApartments: true, workHere: true, selfAssign: true } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const seed = ctx => ctx.addInitScript(([user, stages, worker, apts, tasks]) => {
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('wolfson_app_data')) return;
  localStorage.setItem('wolfson_app_data', JSON.stringify({ currentUser: user, users: [user], stages, contractors: [worker], apartments: apts, contractorAssignments: tasks, contractorNotes: [] }));
}, [USER, STAGES, WORKER, [APT], [TASK]]);

const measure = page => page.evaluate(() => {
  const st = document.querySelector('[data-plan-surface="studio"]');
  const cs = [...st.querySelectorAll('canvas')]; const c = cs[cs.length - 1];
  const r = c.getBoundingClientRect();
  const stage = c.closest('[class*="overflow"]') || c.parentElement.parentElement;
  const sr = stage.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), sw: Math.round(sr.width), sh: Math.round(sr.height) };
});
async function studio(page) {
  await page.locator('[class*="cursor-pointer"]', { hasText: /^7/ }).first().tap();
  await page.waitForTimeout(1500);
  const planTab = page.locator('.drawer-panel button').filter({ hasText: /^Plan/ });
  if (await planTab.count()) { await planTab.first().tap(); await page.waitForTimeout(1200); }
  await page.locator('button').filter({ hasText: /Mark up/i }).first().tap();
  for (let i = 0; i < 45; i++) { if (await page.locator('[data-plan-surface="studio"] canvas').count() >= 3) break; await page.waitForTimeout(1500); }
  await page.waitForTimeout(2500);
}
async function tablet(bytes, W, H) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 2, userAgent: devices['Galaxy Tab S4'].userAgent });
  await seed(ctx);
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: bytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 10 });
  await page.goto('http://localhost:5173/project'); await page.waitForTimeout(2200);
  return { ctx, page };
}

// ── A · a PORTRAIT sheet on the tablet in landscape opens big ──
{
  const { ctx, page } = await tablet(PORTRAIT, 1152, 720);
  await studio(page);
  const m = await measure(page);
  // The whole page would be this wide; before the fix that is what you got.
  const wholeW = Math.round((m.sh - 32) / 2384 * 1684);
  check(m.w > wholeW * 1.4, 'portrait sheet opens well past the whole-page fit', `${m.w}px vs whole-page ${wholeW}px`);
  check(m.h >= m.sh * 0.95, 'it fills the stage top to bottom', `${m.h} in ${m.sh}`);
  check(m.h <= (m.sh - 32) / 0.58, 'and at least 60% of the sheet is still on screen', `${Math.round((m.sh - 32) / m.h * 100)}% visible`);
  check(m.w <= m.sw, 'never wider than the stage', `${m.w} in ${m.sw}`);
  // The fit CONTROL still shows every millimetre of the page.
  await page.locator('[data-plan-surface="studio"] [data-plan-fit]').first().click({ force: true });
  await page.waitForTimeout(1600);
  const f = await measure(page);
  check(f.h <= f.sh + 2 && f.w <= f.sw + 2, 'the fit control shows the whole page', `${f.w}x${f.h} in ${f.sw}x${f.sh}`);
  await ctx.close();
}
// ── B · a LANDSCAPE sheet is untouched: the whole page, as before ──
{
  const { ctx, page } = await tablet(LANDSCAPE, 1152, 720);
  await studio(page);
  const m = await measure(page);
  check(m.h <= m.sh + 2 && m.w <= m.sw + 2, 'a landscape sheet still opens as the whole page', `${m.w}x${m.h} in ${m.sw}x${m.sh}`);
  check(m.h >= (m.sh - 40) * 0.95, 'and fills the stage', `${m.h} of ${m.sh}`);
  await ctx.close();
}
// ── C · the phone is deliberately left alone ──
{
  const { ctx, page } = await tablet(LANDSCAPE, 390, 844);
  await studio(page);
  const m = await measure(page);
  check(m.w <= m.sw + 2 && m.h <= m.sh + 2, 'the phone still fits the whole sheet', `${m.w}x${m.h} in ${m.sw}x${m.sh}`);
  await ctx.close();
}
// ── D · the worker reads the stage in HIS language ──
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await seed(ctx);
  await ctx.route('**://drive.google.com/**', r => r.abort());
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/c/tok-ru'); await page.waitForTimeout(3000);
  const all = page.locator('button').filter({ hasText: /^All$|^Все$/ });
  if (await all.count()) await all.first().click().catch(() => {});
  await page.waitForTimeout(800);
  await page.getByText('Проверить трубы').first().click(); await page.waitForTimeout(1500);
  const txt = await page.locator('body').innerText();
  check(txt.includes('Трубопровод'), 'his task sheet names the stage in Russian');
  check(!/\bPiping\b/.test(txt), 'and never in English', txt.match(/.{0,30}Piping.{0,30}/)?.[0] ?? '');
  await ctx.close();
}
// ── E · the office can type the Russian name ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await seed(ctx);
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/settings'); await page.waitForTimeout(2500);
  const ru = page.locator('[data-stage-ru]');
  check(await ru.count() >= 3, 'every stage row has a Russian name box', `${await ru.count()} boxes`);
  await ru.nth(2).fill('Скрытые блоки');
  await page.locator('[data-stage-ru]').nth(2).press('Tab');
  await page.locator('[data-stage-save]').nth(2).click({ force: true });
  await page.waitForTimeout(1200);
  const stored = await page.evaluate(() => (JSON.parse(localStorage.getItem('wolfson_app_data') || '{}').stages || []).find(x => x.id === 'S3')?.nameRu);
  check(stored === 'Скрытые блоки', 'and it is stored on the stage', String(stored));
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall green');
process.exit(fails ? 1 : 0);
