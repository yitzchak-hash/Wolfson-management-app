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
const YDAY = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
const DATA = { currentUser: admin, users: [admin], stages: STAGES,
  contractors: [{ id: 'C-w', name: 'Worker', category: 'ac', token: 'tok-w', active: true, createdAt: '2026-01-01', lang: 'en', perms: { workHere: true, seeDiagrams: true, seeAllApartments: true } }],
  apartments: [apt('A1-12', '12', { skhtatb: 'done', 's1-fans': 'done', 's1-piping': 'pending' })], contractorAssignments: [{ id: 'T-y', contractorId: 'C-w', apartmentId: 'A1-12', buildingId: 'A1', taskDescription: 'Fans', dueDate: YDAY, stageId: 's1-concealed', stageIds: ['s1-concealed'], completedAt: null, priority: 'normal', createdAt: '2026-01-01', createdBy: 'U-o', createdByName: 'Officer' }] };
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
check(await page.locator('[data-morning-no]').count() === 1, 'the morning question asks about yesterday');
await page.locator('[data-morning-no]').click(); await page.waitForTimeout(900);
check(await page.locator('[data-closing-panel]').count() === 1 && await page.locator('[data-not-finished]').count() === 0, '"No" opens the close, not the old not-finished sheet');
check(await page.locator('[data-close-when]').count() === 1 && await page.locator('[data-close-finished]').count() === 0, 'its first screen: when did you finish (one question)');
await page.locator('[data-close-when-pick="past"]').click(); await page.waitForTimeout(300);
await page.locator('[data-close-finished-pick="no"]').click(); await page.waitForTimeout(300);
check(await page.locator('[data-close-left]').count() === 1, 'one stage + "No" goes straight to what\'s left / when back');
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
