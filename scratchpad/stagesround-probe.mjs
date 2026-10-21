// The stages round (owner, 2026-10-21):
//   A · the worker's "What are you doing here today?" list reads every stage in
//       HIS language (Russian) and shows what each stage INCLUDES;
//   B · "I don't see what I did here" sends one or two words to the office;
//   C · Settings → Stages: the words arrive, are filed under a stage and become
//       one of its "Includes" chips; chips can be added and taken off by hand;
//   D · the plan studio's speech bubble has a tiny mic bottom-right — talking
//       fills the bubble with the words (the transcriber stubbed here).
// Plain server on 5173 for A–C, keyed 5174 for D. All names made up.
import { chromium } from 'playwright';
import { PDFDocument, rgb } from 'pdf-lib';

const APP = process.env.APP || 'http://localhost:5173';
const KEYED = process.env.APP_KEYED || 'http://localhost:5174';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(new Date());

const STAGES = [
  { id: 'skhtatb', name: 'Sold/Start', nameRu: 'Продано / Старт', color: '#64748b', order: 1, active: true, kind: 'work' },
  { id: 's1-piping', name: 'Piping', nameHe: 'צנרת', nameRu: 'Трубы', color: '#9ca3af', order: 3, active: true, kind: 'work', includes: ['Soldering', 'Connections'] },
  { id: 's-drains', name: 'Drains', nameHe: 'ניקוזים', nameRu: 'Дренаж', color: '#38bdf8', order: 4, active: true, kind: 'work' },
  { id: 's1-concealed', name: 'Concealed Units', nameRu: 'Канальные блоки', color: '#c9b95c', order: 5, active: true, kind: 'work' },
];
const apt = (id, num) => ({ id, buildingId: 'A1', floor: 4, apartmentNumber: num, displayName: '', isUnnamed: false, isDuplexApt: false,
  classification: 'standard', generalNotes: '', currentStageId: 's1-piping', stageDates: {}, bubbles: true, stageMarks: { skhtatb: 'done' },
  createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
const admin = { id: 'U-o', name: 'Officer', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
const DATA = extra => ({
  currentUser: admin, users: [admin], stages: STAGES,
  contractors: [{ id: 'C-w', name: 'Worker', category: 'ac', token: 'tok-w', active: true, createdAt: '2026-01-01', lang: 'ru',
    perms: { workHere: true, seeDiagrams: true, seeAllApartments: true } }],
  apartments: [apt('A1-9', '9'), apt('A1-12', '12')],
  contractorAssignments: [{ id: 'T-1', contractorId: 'C-w', apartmentId: 'A1-9', buildingId: 'A1', taskDescription: 'Fit', stageId: 's1-piping',
    dueDate: TODAY, priority: 'normal', completedAt: null, createdAt: '2026-01-01T08:00:00', createdBy: 'U-o', createdByName: 'Officer' }],
  ...extra,
});
function seed(d) {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  if (!localStorage.getItem('wolfson_app_data')) localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}
const wolf = page => page.evaluate(() => new Promise(r => setTimeout(() => r(JSON.parse(localStorage.getItem('wolfson_app_data'))), 500)));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });

// ══ A + B · the worker ══
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('**://fonts.googleapis.com/**', r => r.abort());
  await ctx.addInitScript(seed, DATA({}));
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; } });
  await page.goto(`${APP}/c/tok-w`);
  await page.waitForTimeout(2500);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /Карта|Map/.test((x.textContent || '').trim()))?.click());
  for (let i = 0; i < 60 && !(await page.locator('[data-apt-id="A1-12"]').count()); i++) await page.waitForTimeout(150);
  await page.locator('[data-apt-id="A1-12"]').first().click();
  await page.waitForTimeout(500);
  await page.locator('[data-work-here]').click();
  await page.waitForTimeout(400);
  if (await page.locator('[data-work-part-no]').count()) { await page.locator('[data-work-part-no]').click(); await page.waitForTimeout(300); }
  check(await page.locator('[data-work-pick]').count() === 1, 'A · the "what are you doing today" list is open');
  const names = await page.locator('[data-work-stage]').allInnerTexts();
  check(names.some(t => t.includes('Трубы')) && names.some(t => t.includes('Дренаж')) && names.some(t => t.includes('Канальные блоки')),
    'A · every stage reads in Russian', JSON.stringify(names));
  check(!names.some(t => /Piping|Drains|Concealed/.test(t)), 'A · no English stage name is left');
  const inc = await page.locator('[data-work-stage="s1-piping"] [data-work-stage-includes]').innerText().catch(() => '');
  check(/Soldering/.test(inc) && /Connections/.test(inc), 'A · Piping shows what it includes', inc);
  check(await page.locator('[data-work-stage="s-drains"] [data-work-stage-includes]').count() === 0, 'A · a stage with no words shows no chips');
  // B
  await page.locator('[data-not-listed]').click();
  await page.waitForTimeout(200);
  check(await page.locator('[data-not-listed-box]').count() === 1, 'B · "I don\'t see what I did here" opens a small box');
  check(await page.locator('[data-not-listed-send]').isDisabled(), 'B · Send waits for words');
  await page.locator('[data-not-listed-input]').fill('сварка труб на крыше и ещё много слов');
  check((await page.locator('[data-not-listed-input]').inputValue()).split(/\s+/).length <= 4, 'B · the box keeps it to a few words');
  await page.locator('[data-not-listed-send]').click();
  await page.waitForTimeout(300);
  check(await page.locator('[data-not-listed-sent]').count() === 1, 'B · it says it was sent to the office');
  const d = await wolf(page);
  const sg = (d.stageSuggestions ?? [])[0];
  check(sg && sg.status === 'open' && /сварка/.test(sg.text) && sg.apartmentId === 'A1-12' && sg.contractorId === 'C-w',
    'B · the words are kept for the office, with the worker and the apartment', JSON.stringify(sg));
  check(await page.locator('[data-work-start]').count() === 1, 'B · he can still pick a stage and start');
  await ctx.close();
}

// ══ C · the office ══
{
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.route('**://fonts.googleapis.com/**', r => r.abort());
  await ctx.addInitScript(seed, DATA({ stageSuggestions: [
    { id: 'sg-1', text: 'Soldering roof', projectId: 'wolfson', apartmentId: 'A1-12', contractorId: 'C-w', by: 'Worker', at: '2026-10-21T08:00:00.000Z', status: 'open' },
    { id: 'sg-2', text: 'Noise', projectId: 'wolfson', by: 'Worker', at: '2026-10-21T07:00:00.000Z', status: 'open' },
    { id: 'sg-3', text: 'Old', projectId: 'wolfson', by: 'Worker', at: '2026-10-20T07:00:00.000Z', status: 'applied', stageId: 's1-piping' },
    { id: 'sg-4', text: 'Board job', projectId: 'general', by: 'Worker', at: '2026-10-20T07:00:00.000Z', status: 'open' },
  ] }));
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; } });
  await page.goto(`${APP}/settings`);
  await page.waitForTimeout(2500);
  const rows = await page.locator('[data-worker-word]').count();
  check(rows === 2, 'C · the open words from this workspace\'s workers wait in Stages settings', `${rows}`);
  check(/Worker/.test(await page.locator('[data-worker-word="sg-1"]').innerText()), 'C · each says who sent it');
  check(await page.locator('[data-stage-includes="s1-piping"] [data-stage-include-chip]').count() === 2, 'C · Piping shows its two Includes words');
  await page.locator('[data-worker-word="sg-1"] [data-worker-word-stage]').selectOption('s1-piping');
  await page.waitForTimeout(400);
  let d = await wolf(page);
  check((d.stages.find(s => s.id === 's1-piping').includes ?? []).includes('Soldering roof'), 'C · filing it adds the words to the stage');
  check(d.stageSuggestions.find(x => x.id === 'sg-1').status === 'applied', 'C · …and the words leave the waiting list');
  check(await page.locator('[data-stage-includes="s1-piping"] [data-stage-include-chip="Soldering roof"]').count() === 1, 'C · the new chip shows on the stage line');
  await page.locator('[data-worker-word="sg-2"] [data-worker-word-dismiss]').click();
  await page.waitForTimeout(300);
  check(await page.locator('[data-worker-words]').count() === 0, 'C · putting the last one aside closes the box');
  await page.locator('[data-stage-includes="s-drains"] [data-stage-include-add]').fill('Drain pipe');
  await page.locator('[data-stage-includes="s-drains"] [data-stage-include-add]').press('Enter');
  await page.waitForTimeout(400);
  d = await wolf(page);
  check((d.stages.find(s => s.id === 's-drains').includes ?? []).join() === 'Drain pipe', 'C · a word typed by hand is added');
  await page.locator('[data-stage-includes="s1-piping"] [data-stage-include-remove="Connections"]').click();
  await page.waitForTimeout(400);
  d = await wolf(page);
  check(!(d.stages.find(s => s.id === 's1-piping').includes ?? []).includes('Connections'), 'C · × takes a word off');
  await ctx.close();
}

// ══ D · the speech bubble's mic ══
{
  const doc = await PDFDocument.create();
  const pg = doc.addPage([1191, 842]);
  pg.drawRectangle({ x: 20, y: 20, width: 1151, height: 802, borderWidth: 2, borderColor: rgb(0.1, 0.1, 0.2) });
  const planBytes = Buffer.from(await doc.save());
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, permissions: ['microphone'] });
  await ctx.route('**://fonts.googleapis.com/**', r => r.abort());
  await ctx.route('**://drive.google.com/**', r => r.abort());
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('**/api/drive-fetch', r => r.fulfill({ status: 200, contentType: 'application/pdf', body: planBytes }));
  let tsCalls = 0;
  await ctx.route('**/api/geocode', r => {
    const body = JSON.parse(r.request().postData() || '{}');
    if (body.transcribe) { tsCalls++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'Check the drain here' }) }); }
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await ctx.addInitScript(seed, DATA({ apartments: [{ ...apt('A1-9', '9'), plansPdfLink: 'https://drive.google.com/file/d/PLANX/view' }, apt('A1-12', '12')] }));
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; } });
  await page.goto(`${KEYED}/project`);
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelector('[data-apt-id="A1-9"]')?.click());
  await page.waitForTimeout(4000);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /^Mark up/.test((x.textContent ?? '').trim()) || x.title === 'Mark up')?.click());
  let box = null;
  await page.waitForTimeout(1500);
  for (let i = 0; i < 80 && !box; i++) {
    await page.waitForTimeout(150);
    box = await page.evaluate(() => {
      const c = [...document.querySelectorAll('canvas')].filter(x => x.getBoundingClientRect().width > 600).pop();
      if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
  }
  check(!!box, 'D · the studio drew the sheet');
  await page.keyboard.press('b');
  await page.waitForTimeout(200);
  const x0 = box.x + box.w * 0.3, y0 = box.y + box.h * 0.3;
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + i * 12, y0 + i * 6);
  await page.mouse.up();
  await page.waitForTimeout(500);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  check(await page.evaluate(() => document.activeElement?.tagName) === 'TEXTAREA', 'D · a new bubble opens for its words');
  const mic = page.locator('[data-bubble-mic]');
  check(await mic.count() === 1, 'D · the open bubble has a tiny mic');
  const geo = await page.evaluate(() => {
    const m = document.querySelector('[data-bubble-mic]').getBoundingClientRect();
    const t = document.querySelector('[data-bubble-mic]').parentElement.getBoundingClientRect();
    return { w: m.width, right: Math.abs(m.right - t.right), bottom: Math.abs(m.bottom - t.bottom) };
  });
  check(geo.w <= 26 && geo.right < 12 && geo.bottom < 12, 'D · it sits small in the bubble\'s bottom-right corner', JSON.stringify(geo));
  await mic.click();
  await page.waitForTimeout(400);
  check(await page.locator('[data-bubble-mic][data-state="recording"]').count() === 1, 'D · pressing it records');
  await page.waitForTimeout(3200);
  const live = await page.evaluate(() => document.querySelector('[data-bubble-mic]')?.parentElement.querySelector('textarea')?.value ?? document.activeElement?.value ?? '');
  check(/Check the drain here/.test(live), 'D · the words fill the bubble while he talks', live);
  await page.locator('[data-bubble-mic]').click();
  for (let i = 0; i < 40 && (await page.locator('[data-bubble-mic][data-state="idle"]').count()) === 0; i++) await page.waitForTimeout(150);
  const fin = await page.evaluate(() => document.querySelector('[data-bubble-mic]')?.parentElement.querySelector('textarea')?.value ?? document.activeElement?.value ?? '');
  check(fin === 'Check the drain here' && tsCalls >= 2, 'D · stopping writes the finished words once (no repeats)', `${JSON.stringify(fin)} calls=${tsCalls}`);
  check(await page.evaluate(() => document.activeElement?.tagName) === 'TEXTAREA', 'D · the bubble keeps its text box (nothing was committed by the press)');
  await ctx.close();
}

await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
