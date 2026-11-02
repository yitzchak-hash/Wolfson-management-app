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

const today = await page.evaluate(() => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); });
await page.goto(`${APP}/c/tok-w`); await page.waitForTimeout(2500);
await openFlat();
const btn = page.locator('[data-work-here]');
check(/I started working here/.test(await btn.innerText()), '1 · the button says "I started working here"');
await btn.click(); await page.waitForTimeout(600);
let d = await data(); let t = d.contractorAssignments[0];
check(t && t.stageReport && t.pickAtClose && !t.completedAt, '1 · the task is open, with no stages yet');
for (let i = 0; i < 30 && !(await page.locator('[data-close-job]').count()); i++) await page.waitForTimeout(150);
check(await page.locator('[data-not-finished-btn]').count() === 0, '1 · no "Not finished today" button on a building job');
await page.locator('[data-close-job]').first().click(); await page.waitForTimeout(700);
const screen = async () => (await page.locator('[data-close-next]').count()) ? await page.locator('[data-close-next]').getAttribute('data-close-next') : ((await page.locator('[data-close-now]').count()) ? 'send' : 'auto');
const progress = async () => page.locator('[data-close-progress]').getAttribute('data-close-progress');
// Screen 1
check(/What did you do here today\?/.test(await page.locator('[data-close-pick]').innerText()), 'S1 · "What did you do here today?"');
check(await page.locator('[data-close-now]').count() === 0 && await page.locator('[data-closing-ask-office]').count() === 0, 'S1 · no Send, no office box here');
check(await page.locator('[data-close-next="pick"]').isDisabled(), 'S1 · Next waits for a pick');
check(/^1\//.test(await progress()), 'S1 · progress bar on step 1', await progress());
await page.locator('[data-close-pick-stage="s-drilling"]').click();
await page.locator('[data-close-pick-stage="s1-piping"]').click();
await page.locator('[data-close-pick-stage="s1-concealed"]').click();
await page.locator('[data-close-next="pick"]').click(); await page.waitForTimeout(300);
// Screen 2
check(await page.locator('[data-close-pick]').count() === 0, 'S2 · the pick screen is gone');
check(/Did you finish all of these\?/.test(await page.locator('[data-close-finished-q]').innerText()), 'S2 · "Did you finish all of these?"');
check(await page.locator('[data-close-next]').count() === 0 && await page.locator('[data-close-now]').count() === 0, 'S2 · no Next and no Send — tapping answers');
// back arrow keeps the picks
await page.locator('[data-close-back-arrow]').click(); await page.waitForTimeout(250);
const lit = await page.locator('[data-close-pick-stage][data-on="1"]').evaluateAll(bs => bs.map(x => x.getAttribute('data-close-pick-stage')).sort().join());
check(lit === 's-drilling,s1-concealed,s1-piping', 'S2 · back arrow returns to screen 1 with his picks kept', lit);
await page.locator('[data-close-next="pick"]').click(); await page.waitForTimeout(300);
await page.locator('[data-close-finished-pick="no"]').click(); await page.waitForTimeout(300);
// Screen 3
check(/Which ones did you finish\?/.test(await page.locator('[data-close-unfinished]').innerText()), 'S3 · No → "Which ones did you finish?" on its own screen');
check(await page.locator('[data-close-finished]').count() === 0, 'S3 · the yes/no is gone from this screen');
check(await page.locator('[data-close-unfinished-pick][data-on="1"]').count() === 0, 'S3 · none lit until he taps');
await page.locator('[data-close-unfinished-pick="s-drilling"]').click(); await page.waitForTimeout(150);
check(/Piping, Concealed Units stays half done/.test(await page.locator('[data-close-stays-half]').innerText()), 'S3 · says what stays half done', await page.locator('[data-close-stays-half]').innerText());
await page.locator('[data-close-next="which"]').click(); await page.waitForTimeout(300);
// Screen 4
check(await page.locator('[data-close-left]').count() === 1 && /What.s left\?/.test(await page.locator('[data-close-left]').innerText()) && /When are you coming back\?/.test(await page.locator('[data-close-left]').innerText()), 'S4 · "What\'s left?" and "When are you coming back?"');
check(await page.locator('[data-close-next="left"]').isDisabled(), 'S4 · Next waits for the day (what\'s left is optional)');
await page.locator('[data-close-back="pick"]').click(); await page.waitForTimeout(150);
check(await page.locator('[data-close-back-date]').count() === 1 && await page.locator('[data-close-next="left"]').isDisabled(), 'S4 · Pick a day shows a date, Next still waits');
await page.locator('[data-close-back="tomorrow"]').click(); await page.waitForTimeout(150);
check(!(await page.locator('[data-close-next="left"]').isDisabled()), 'S4 · a day given → Next (nothing typed in What\'s left)');
await page.locator('[data-close-left] textarea').fill('two units still to hang');
await page.locator('[data-close-next="left"]').click(); await page.waitForTimeout(300);
// Screen 5
check(await page.locator('[data-close-photo-step]').count() === 1, 'S5 · one picture screen');
check(await page.locator('[data-close-now]').count() === 0 && await page.locator('[data-closing-ask-office]').count() === 0, 'S5 · no Send, no office box');
const pnext = page.locator('[data-close-next^="photo:"]');
check(await pnext.isDisabled(), 'S5 · Next waits for the pictures');
await page.locator('input[type="file"][accept*="video"][accept*=".zip"]').first().setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: PNG }, { name: 'b.png', mimeType: 'image/png', buffer: PNG }]);
for (let i = 0; i < 40 && await pnext.isDisabled(); i++) await page.waitForTimeout(250);
check(!(await pnext.isDisabled()), 'S5 · Next unlocks with the pictures');
// back to S4 keeps the day
await page.locator('[data-close-back-arrow]').click(); await page.waitForTimeout(250);
check(await page.locator('[data-close-back="tomorrow"][data-on="1"]').count() === 1, 'S5 · back arrow to S4 keeps the day');
await page.locator('[data-close-next="left"]').click(); await page.waitForTimeout(300);
await pnext.click(); await page.waitForTimeout(300);
// Screen 6
const prog = await progress(); const [i6, n6] = prog.split('/');
check(i6 === n6, 'S6 · last screen, bar full', prog);
const sum = await page.locator('[data-close-summary]').innerText();
check(/Drilling — finished/.test(sum) && /Piping — stays half done/.test(sum) && /Concealed Units — stays half done/.test(sum) && /two units still to hang/.test(sum) && /Coming back/.test(sum) && /2 pictures/.test(sum), 'S6 · the summary says what he is sending', sum.replace(/\n/g, ' | '));
check(await page.locator('[data-closing-ask-office]').count() === 1, 'S6 · the office box is here');
check(!(await page.locator('[data-close-now]').isDisabled()), 'S6 · "Send and close the job" is here, ready');
await page.locator('[data-close-now]').click(); await page.waitForTimeout(1500);
d = await data(); t = d.contractorAssignments.find(x => x.id === t.id);
const a = d.apartments.find(x => x.id === 'A1-12');
check(!!t.completedAt, 'After · the task is closed today');
check(a.stageMarks['s-drilling'] === 'done' && a.stageMarks['s1-piping'] === 'pending' && a.stageMarks['s1-concealed'] === 'pending', 'After · Drilling done, the rest half done', JSON.stringify(a.stageMarks));
const back = await page.evaluate(t0 => { const d = new Date(t0 + 'T12:00:00'); do { d.setDate(d.getDate() + 1); } while (d.getDay() === 5 || d.getDay() === 6); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }, today);
const fu = d.contractorAssignments.filter(x => x.id !== t.id);
check(fu.length === 1 && fu[0].dueDate === back && fu[0].pickAtClose && fu[0].stageReport && !fu[0].completedAt && fu[0].apartmentId === 'A1-12' && fu[0].contractorId === 'C-w',
  'After · the flat is on his list on the day he is back', JSON.stringify(fu.map(x => ({ due: x.dueDate, d: x.taskDescription }))) + ' want ' + back);
const notes = (d.contractorNotes || []).filter(x => x.assignmentId === t.id).map(x => x.text).join(' || ');
check(/Not finished: Piping, Concealed Units/.test(notes) && /What's left: two units still to hang/.test(notes) && /Coming back /.test(notes), 'After · the office hears what is left and when', notes);
check(sorts.length === 1, 'After · the AI sorts the pictures');

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
