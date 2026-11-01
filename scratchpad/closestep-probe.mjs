// The close's pictures in ONE step — the default since 2026-11-01 (owner: "only then
// ask him for pictures of the work he did that day … instead of asking him for
// each individual … AI … sort them in the right folders. But don't make him wait").
//   · after he picks what he did and presses Next: ONE step, "Pictures of today's work",
//     naming every stage; no per-stage Next;
//   · the close minimum is asked once; Send unlocks;
//   · pressing Send hands the untagged pictures and the close's stages to the server
//     (mode 'sort-photos') without waiting for it.
// Keyed server (5174, VITE_DRIVE_API_KEY set); every /api call is stubbed. All names made up.
import { chromium } from 'playwright';
const APP = process.env.APP_KEYED || 'http://localhost:5174';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date();
const TODAY = iso(now);
const SUN = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pic = n => ({ name: `site-${n}.png`, mimeType: 'image/png', buffer: PNG });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
await ctx.addInitScript(([T, S]) => {
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  if (localStorage.getItem('wolfson_app_data')) return;
  const admin = { id: 'U-t', name: 'Dana', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const stages = [
    { id: 'S1', name: 'Ready to start', color: '#64748b', order: 1, active: true, kind: 'marker' },
    { id: 'S2', name: 'Fans', color: '#0ea5e9', order: 2, active: true, kind: 'work' },
    { id: 'S3', name: 'Concealed units', color: '#8b5cf6', order: 3, active: true, kind: 'work' },
    { id: 'S4', name: 'Wall units', color: '#f59e0b', order: 4, active: true, kind: 'work' },
    { id: 'S5', name: 'Outdoor units', color: '#22c55e', order: 5, active: true, kind: 'work' },
    { id: 'S6', name: 'Registers', color: '#ef4444', order: 6, active: true, kind: 'work' },
  ];
  const apt = (id, num, fam) => ({ id, buildingId: 'A1', floor: 4, apartmentNumber: num, displayName: fam, isUnnamed: false,
    isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'S2', stageDates: {}, bubbles: true, driveLink: 'https://drive.google.com/drive/folders/FLATFOLDER01',
    stageMarks: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
  const task = (id, a, ids) => ({ id, apartmentId: a, buildingId: 'A1', contractorId: 'C-jo', taskDescription: 'Install',
    dueDate: T, stageId: ids[0], stageIds: ids, completedAt: null, createdAt: '2026-01-01', createdBy: 'U-t', createdByName: 'Dana' });
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: admin, users: [admin], stages,
    contractors: [{ id: 'C-jo', name: 'Yaakov', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01', lang: 'en' }],
    contractorAssignments: [task('T-1', 'A1-16', ['S2', 'S3']), task('T-2', 'A1-17', ['S2'])],
    apartments: [apt('A1-16', '16', 'Lerner'), apt('A1-17', '17', 'Peretz')],
  }));
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: admin, users: [admin], stages, apartments: [],
    contractors: [{ id: 'C-jo', name: 'Yaakov', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }],
    canvasElements: [
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 60, y: 260, w: 1100, h: 320, text: '', color: '#ffffff',
        data: { people: ['c:C-jo'], firstWeek: S, weekCount: 1, span: 5, cells: {} } },
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 6000, y: 6000, w: 200, h: 200, text: '', color: '#fff', data: {} },
    ],
  }));
}, [TODAY, SUN]);

const sorts = []; let n = 0;
await ctx.route('**/api/**', async r => {
  let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch {}
  if (b.mode === 'sort-photos') { sorts.push(b); return r.fulfill({ json: { ok: true } }); }
  n++; r.fulfill({ json: { uploadUrl: `${APP}/__fakeupload/${n}`, folderId: 'FOLDER-' + n, fileId: 'FILEID-' + String(n).padStart(4, '0'), id: 'FILEID-' + String(n).padStart(4, '0'), webViewLink: 'https://drive.google.com/file/d/x/view', files: [], ok: true } });
});
// The browser's PUT straight to "Drive" (the resumable session's address) answers with the new file.
await ctx.route('**/__fakeupload/**', r => { n++; r.fulfill({ json: { id: 'FILEID-' + String(n).padStart(4, '0'), webViewLink: 'https://drive.google.com/file/d/x/view' } }); });
let page = await ctx.newPage();
page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message); fails++; } });
await page.goto(`${APP}/c/tok-jo`);
await page.waitForTimeout(3000);
if (await page.locator('button:has-text("All")').count()) await page.locator('button:has-text("All")').first().click().catch(() => {});
await page.waitForTimeout(400);
await page.locator('text=Lerner').first().click(); await page.waitForTimeout(800);
await page.locator('[data-close-job]').first().click(); await page.waitForTimeout(700);
await page.locator('[data-close-finished-pick="yes"]').click(); await page.waitForTimeout(250);
await page.locator('[data-close-more-pick="yes"]').click(); await page.waitForTimeout(250);
await page.locator('[data-close-extra="S4"]').click(); await page.waitForTimeout(200);
await page.locator('[data-close-more-next]').click(); await page.waitForTimeout(300);
const steps = page.locator('[data-close-photo-step]');
check(await steps.count() === 1 && await page.locator('[data-close-photo-all]').count() === 1, 'after Next: ONE picture step for the whole day');
const head = (await steps.innerText()).replace(/\s+/g, ' ');
check(/Pictures of today's work/.test(head) && /Fans/.test(head) && /Concealed units/.test(head) && /Wall units/.test(head), 'it says "Pictures of today\'s work" and names every stage he did', head.slice(0, 120));
check(await page.locator('[data-close-photo-next]').count() === 0, 'no per-stage Next →');
check(await steps.getAttribute('data-step-need') === '1', 'the close minimum (1) is asked once');
check(await page.locator('[data-close-now]').isDisabled(), 'Send waits for the pictures');
await page.locator('input[type="file"][accept*="video"][accept*=".zip"]').first().setInputFiles([pic(1), pic(2)]);
for (let i = 0; i < 40 && await page.locator('[data-close-now]').isDisabled(); i++) await page.waitForTimeout(250);
check(!(await page.locator('[data-close-now]').isDisabled()), 'with the pictures in, Send unlocks', (await steps.innerText()).replace(/\s+/g, ' ').slice(0, 300));
await page.locator('[data-close-now]').click(); await page.waitForTimeout(1500);
const d = await page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')));
check(!!d.contractorAssignments.find(a => a.id === 'T-1').completedAt, 'the job is closed at once');
const s = sorts[0];
check(sorts.length === 1 && s.col === 'contractorPhotos', 'the server is asked to sort the pictures', JSON.stringify(sorts.map(x => x.col)));
check(s && s.photos.length === 2 && s.photos.every(p => /^FILEID-/.test(p.driveFileId)), 'it gets both pictures, by their Drive file', JSON.stringify(s?.photos));
check(s && JSON.stringify(s.stages.map(x => x.id).sort()) === '["S2","S3","S4"]', 'and the stages of this close to choose from', JSON.stringify(s?.stages?.map(x => x.id)));
const photos = (d.contractorPhotos ?? []).filter(p => p.assignmentId === 'T-1');
check(photos.length === 2 && photos.every(p => !p.stageId), 'the pictures went up untagged (the AI tags them afterwards)', JSON.stringify(photos.map(p => p.stageId ?? null)));
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
