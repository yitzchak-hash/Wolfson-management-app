// Video 13 (the Plan Sketcher's owner video, 2026-10-29, 6:15–7:05): "bring back the markup studio the way it was … and in the
// markup studio another button that says Open in Plan Maker … on a phone or a tablet I do not want this to come up". Proven on
// the dev server (port 5173): Mark up opens the BUILT-IN studio; inside it "Open in Plan Maker" stands on a computer and opens the
// plan in the sketcher in a new tab inside the job; a tablet (touch, coarse pointer) gets the studio without it; the file tray's
// Mark up opens the studio too.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';
import { realisticWolfson, applySeed } from './seed.mjs';

const PLAN_ID = 'HARNESSPLAN1';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const doc = await PDFDocument.create(); const pg = doc.addPage([1191, 842]);
pg.drawRectangle({ x: 30, y: 30, width: 1131, height: 782, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
const planBytes = Buffer.from(await doc.save());
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const blob = await realisticWolfson(browser);
async function ctxOf(extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ...extra });
  await applySeed(ctx, blob);
  await ctx.addInitScript(planId => {
    const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
    const d = JSON.parse(raw);
    for (const a of d.apartments ?? []) if (a.id === 'A1-53') a.plansPdfLink = `https://drive.google.com/file/d/${planId}/view`;
    localStorage.setItem('wolfson_app_data', JSON.stringify(d));
  }, PLAN_ID);
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  await ctx.route('**://drive.google.com/**', r => r.abort());
  return ctx;
}
async function openJob(page) {
  await page.goto('http://localhost:5173/project'); await page.waitForTimeout(2500);
  const cell = await page.$('[data-apt-id="A1-53"]') ?? await page.$('text=53');
  await cell.click(); await page.waitForTimeout(3500);
}
// a computer
{
  const ctx = await ctxOf(); const page = await ctx.newPage();
  await openJob(page);
  check((await page.locator('[data-open-sketcher]').count()) === 0, 'the job window has no "Open in Sketcher" any more');
  const mk = page.locator('[data-markup]');
  check((await mk.count()) === 1 && /Mark up/.test(await mk.textContent()), 'the job window\'s plan bar says Mark up');
  await mk.click(); await page.waitForTimeout(3500);
  const door = page.locator('[data-open-plan-maker]');
  check((await page.locator('[data-plan-print]').count()) > 0, 'Mark up opens the built-in markup studio (its Print is there)');
  check((await door.count()) === 1 && /Open in Plan Maker/.test(await door.textContent()), 'on a computer the studio carries "Open in Plan Maker"', await door.count());
  const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null), door.click()]);
  const url = pop ? pop.url() : '';
  check(/tzvi-air-plan-sketcher\.vercel\.app\/sketch\/HARNESSPLAN1/.test(url) && /job=A1-53/.test(url), 'it opens this plan in the Plan Maker, in a new tab, inside the job', url);
  await ctx.close();
}
// a tablet: touch, coarse pointer
{
  const ctx = await ctxOf({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await openJob(page);
  const mk = page.locator('[data-markup]');
  if (await mk.count()) { await mk.click(); await page.waitForTimeout(3500); }
  check((await page.locator('[data-plan-print]').count()) > 0, 'a tablet\'s Mark up opens the same markup studio');
  check((await page.locator('[data-open-plan-maker]').count()) === 0, 'a tablet gets no "Open in Plan Maker"');
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
