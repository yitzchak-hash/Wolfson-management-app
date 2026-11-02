// The worker's new day (owner, 2026-11-01):
//   1 · tap the flat → "I started working here" → the task opens, nothing asked;
//   2 · close → "What did you do here today?" — every stage, half done first,
//       finished ones last (to add work to), each with its (i); "I don't see
//       what I did here" → explain by voice or typing;
//   3 · Next → "Did you finish all of these?" → No → "Which ones did you
//       finish?" → the rest stay half done;
//   4 · ONE picture step → Send → closed today; the next day the button says
//       "Continue working here".
// Keyed server (5174); every /api call stubbed. All names made up.
import { chromium } from 'playwright';
const APP = process.env.APP_KEYED || 'http://localhost:5174';
let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const STAGES = [
  { id: 'skhtatb', name: 'Sold', color: '#64748b', order: 1, active: true, kind: 'work' },
  { id: 's-drilling', name: 'Drilling', color: '#0891b2', order: 2, active: true, kind: 'work', trade: 'ac' },
  { id: 's1-piping', name: 'Piping', color: '#9ca3af', order: 3, active: true, kind: 'work', trade: 'ac' },
  { id: 's1-concealed', name: 'Concealed Units', color: '#c9b95c', order: 5, active: true, kind: 'work', trade: 'ac', includes: ['Ducting'] },
  { id: 's1-fans', name: 'Fans', color: '#eab308', order: 6, active: true, kind: 'work', trade: 'ac' },
];
const apt = (id, num, marks) => ({ id, buildingId: 'A1', floor: 4, apartmentNumber: num, displayName: 'Lerner', isUnnamed: false, isDuplexApt: false,
  classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, bubbles: true, stageMarks: marks,
  driveLink: 'https://drive.google.com/drive/folders/FLATFOLDER01', createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
const admin = { id: 'U-o', name: 'Officer', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
const DATA = { currentUser: admin, users: [admin], stages: STAGES,
  contractors: [{ id: 'C-w', name: 'Worker', category: 'ac', token: 'tok-w', active: true, createdAt: '2026-01-01', lang: 'en', perms: { workHere: true, seeDiagrams: true, seeAllApartments: true } }],
  apartments: [apt('A1-12', '12', { skhtatb: 'done', 's1-fans': 'done', 's1-piping': 'pending' })], contractorAssignments: [] };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
let n = 0; const sorts = [];
await ctx.route('**/api/**', async r => {
  let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch {}
  if (body.mode === 'sort-photos') { sorts.push(body); return r.fulfill({ json: { ok: true } }); }
  n++; r.fulfill({ json: { uploadUrl: `${APP}/__fakeupload/${n}`, folderId: 'FOLDER-' + n, fileId: 'FILEID-' + String(n).padStart(4, '0'), webViewLink: 'https://drive.google.com/file/d/x/view', files: [], ok: true } });
});
await ctx.route('**/__fakeupload/**', r => { n++; r.fulfill({ json: { id: 'FILEID-' + String(n).padStart(4, '0') } }); });
await ctx.route('**://fonts.googleapis.com/**', r => r.abort());
await ctx.addInitScript(d => {
  localStorage.setItem('wolfson_app_version', '3'); localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  if (!localStorage.getItem('wolfson_app_data')) localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}, DATA);
const page = await ctx.newPage();
page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; } });
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')));
const openFlat = async () => {
  await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /Map/.test((x.textContent || '').trim()))?.click());
  await page.waitForTimeout(400);
  const pick = page.locator('button:has-text("Wolfson Residence")'); if (await pick.count()) { await pick.first().click(); }
  for (let i = 0; i < 60 && !(await page.locator('[data-apt-id="A1-12"]').count()); i++) await page.waitForTimeout(150);
  if (!(await page.locator('[data-apt-id="A1-12"]').count())) { console.log('DBG', (await page.evaluate(() => document.body.innerText)).slice(0, 500).replace(/\n/g, ' | ')); await page.screenshot({ path: '/tmp/claude-0/-home-user-Wolfson-management-app/87b4a77c-e92b-5b56-a1f6-77d2e74949a5/scratchpad/nf.png' }); }
  await page.locator('[data-apt-id="A1-12"]').first().click(); await page.waitForTimeout(500);
};
await page.goto(`${APP}/c/tok-w`); await page.waitForTimeout(2500);
await openFlat();
const btn = page.locator('[data-work-here]');
check(/I started working here/.test(await btn.innerText()), '1 · the button says "I started working here"', await btn.innerText());
await btn.click(); await page.waitForTimeout(600);
check(await page.locator('[data-work-pick]').count() === 0, '1 · nothing is asked at the start');
let d = await data(); let t = d.contractorAssignments[0];
check(t && t.stageReport && t.pickAtClose && !t.stageIds?.length && !t.completedAt, '1 · the task is open, with no stages yet', JSON.stringify(t && { pac: t.pickAtClose, ids: t.stageIds }));
// close
for (let i = 0; i < 30 && !(await page.locator('[data-close-job]').count()); i++) await page.waitForTimeout(150);
await page.locator('[data-close-job]').first().click(); await page.waitForTimeout(700);
check(/What did you do here today\?/.test(await page.locator('[data-close-pick]').innerText()), '2 · closing asks "What did you do here today?"');
const order = await page.locator('[data-close-pick-stage]').evaluateAll(bs => bs.map(x => x.getAttribute('data-close-pick-stage')));
check(order[0] === 's1-piping' && order[order.length - 1] === 's1-fans' && !order.includes('skhtatb'), '2 · half done first, finished last, never Sold', JSON.stringify(order));
check(await page.locator('[data-close-pick] [data-stage-info]').count() === order.length, '2 · every line has its (i)');
check(await page.locator('[data-close-now]').count() === 0, '2 · no Send on this screen');
await page.locator('[data-close-pick-stage="s-drilling"]').click();
await page.locator('[data-close-pick-stage="s1-piping"]').click();
await page.locator('[data-close-pick-stage="s1-fans"]').click();
await page.locator('[data-close-pick-explain]').click();
check(/Explain to us what you did here today/.test(await page.locator('[data-close-explain]').innerText()), '2 · "I don\'t see what I did here" asks him to explain');
await page.locator('[data-close-explain] textarea').fill('fixed a leak in the bathroom ceiling');
await page.locator('[data-close-next="pick"]').click(); await page.waitForTimeout(300);
check(/Did you finish all of these\?/.test(await page.locator('[data-close-finished-q]').innerText()) && /Drilling/.test(await page.locator('[data-close-picked]').innerText()) && /Piping/.test(await page.locator('[data-close-picked]').innerText()),
  '3 · "Did you finish all of these?" with what he picked', await page.locator('[data-close-picked]').innerText());
await page.locator('[data-close-finished-pick="no"]').click(); await page.waitForTimeout(200);
check(/Which ones did you finish\?/.test(await page.locator('[data-close-unfinished]').innerText()), '3 · No → "Which ones did you finish?"');
check(await page.locator('[data-close-unfinished-pick][data-on="1"]').count() === 0, '3 · none lit until he taps');
await page.locator('[data-close-unfinished-pick="s-drilling"]').click(); await page.waitForTimeout(150);
await page.locator('[data-close-next="which"]').click(); await page.waitForTimeout(300);
check(await page.locator('[data-close-more]').count() === 0, '3 · no "anything else?" question after that');
// 3b · what's left / when back — "I don't know yet"
await page.locator('[data-close-back="unknown"]').click(); await page.waitForTimeout(150);
await page.locator('[data-close-next="left"]').click(); await page.waitForTimeout(300);
const steps = page.locator('[data-close-photo-step]');
check(await steps.count() === 1, '4 · one picture step', String(await steps.count()));
await page.locator('input[type="file"][accept*="video"][accept*=".zip"]').first().setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: PNG }, { name: 'b.png', mimeType: 'image/png', buffer: PNG }]);
const pn = page.locator('[data-close-next^="photo:"]');
for (let i = 0; i < 40 && await pn.isDisabled(); i++) await page.waitForTimeout(250);
check(!(await pn.isDisabled()), '4 · Next unlocks with the pictures');
await pn.click(); await page.waitForTimeout(300);
check(/The office will set the day/.test(await page.locator('[data-close-summary]').innerText()), '4 · the summary says the office sets the day');
await page.locator('[data-close-now]').click(); await page.waitForTimeout(1500);
d = await data(); t = d.contractorAssignments.find(x => x.id === t.id);
const a = d.apartments.find(x => x.id === 'A1-12');
check(!!t.completedAt, '4 · the task is closed today');
check(a.stageMarks['s-drilling'] === 'done' && a.stageMarks['s1-piping'] === 'pending' && a.stageMarks['s1-fans'] === 'done', '4 · Drilling done, Piping stays half done, Fans stays done', JSON.stringify(a.stageMarks));
check(t.offList?.[0]?.text?.startsWith('fixed a leak'), '4 · his explanation reaches the office', JSON.stringify(t.offList));
check(d.contractorAssignments.length === 1, '4 · "I don\'t know yet" books no day', String(d.contractorAssignments.length));
check((d.contractorNotes || []).some(x => /Coming back: not known yet\. Please set the day\./.test(x.text)), '4 · the office is asked to set the day');
check(sorts.length === 1 && sorts[0].stages.map(x => x.id).sort().join() === 's-drilling,s1-fans,s1-piping', '4 · the AI sorts the pictures among what he did', JSON.stringify(sorts[0]?.stages?.map(x => x.id)));
// the next visit (a fresh page, the same phone)
await page.close();
const p2 = await ctx.newPage();
await p2.goto(`${APP}/c/tok-w`); await p2.waitForTimeout(2500);
await p2.evaluate(() => [...document.querySelectorAll('button')].find(x => /Map/.test((x.textContent || '').trim()))?.click());
await p2.waitForTimeout(400);
for (let i = 0; i < 20 && !(await p2.locator('[data-map-project-pick="wolfson"]').count()); i++) await p2.waitForTimeout(150);
if (await p2.locator('[data-map-project-pick="wolfson"]').count()) await p2.locator('[data-map-project-pick="wolfson"]').click();
for (let i = 0; i < 60 && !(await p2.locator('[data-apt-id="A1-12"]').count()); i++) await p2.waitForTimeout(150);
await p2.locator('[data-apt-id="A1-12"]').first().click(); await p2.waitForTimeout(500);
check(/Continue working here/.test(await p2.locator('[data-work-here]').innerText()), '5 · the next time: "Continue working here"');
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
