// Adding work to a stage already finished (owner, 2026-10-18): "if he already
// finished the stage and he clicks it, it should be grayed out, but still
// allow him to click it and add work to it. And the pictures that he adds to
// it, adds it to … the folder of the closed stage. So it doesn't reopen the
// stage or do anything. It just adds the pictures … and marks that we added
// work to that stage."
//   1 · "Is it one of these?" shows the finished stage greyed, still pressable;
//   2 · picking it asks for one picture, filed into THAT stage's folder;
//   3 · the stage stays done, it is not in stagesWorked, the task says
//       addedStages (+ his words), the office reads it in plain English;
//   4 · the office's done card says "work added";
//   5 · a Job Board job on his list reads its own name, no "Apt" in front.
// Runs against the KEYED server (Drive backend on, every route stubbed).
// All names are made up.
import { chromium } from 'playwright';

const APP = process.env.APP || 'http://localhost:5174';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(new Date());
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pic = n => ({ name: `site-${n}.png`, mimeType: 'image/png', buffer: PNG });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
await ctx.addInitScript(([T]) => {
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
  ];
  const apt = { id: 'A1-16', buildingId: 'A1', floor: 4, apartmentNumber: '16', displayName: 'Lerner', isUnnamed: false,
    isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'S3', stageDates: {}, bubbles: true,
    stageMarks: { S3: 'done' }, driveLink: 'https://drive.google.com/drive/folders/JOBFOLDER1',
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' };
  const task = { id: 'T-1', apartmentId: 'A1-16', buildingId: 'A1', contractorId: 'C-jo', taskDescription: 'Install',
    dueDate: T, stageId: 'S2', stageIds: ['S2'], completedAt: null, createdAt: '2026-01-01', createdBy: 'U-t', createdByName: 'Dana' };
  const worker = { id: 'C-jo', name: 'Yaakov', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01', lang: 'en' };
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    currentUser: admin, users: [admin], stages, contractors: [worker],
    contractorAssignments: [task], apartments: [apt],
  }));
  // A Job Board job of his — its list row must read the job's own name.
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: admin, users: [admin], stages, contractors: [worker],
    apartments: [{ id: 'G-9', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Shamir villa', isUnnamed: false,
      isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {},
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' }],
    contractorAssignments: [{ id: 'T-G', apartmentId: 'G-9', buildingId: 'G', contractorId: 'C-jo', taskDescription: 'Service',
      dueDate: T, stageId: null, completedAt: null, createdAt: '2026-01-01', createdBy: 'U-t', createdByName: 'Dana' }],
    canvasElements: [{ id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 6000, y: 6000, w: 200, h: 200, text: '', color: '#fff', data: {} }],
  }));
}, [TODAY]);

const folders = [];
let page = await ctx.newPage();
page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message); fails++; } });
let ses = 0;
await page.route('**/api/**', async route => {
  const url = route.request().url();
  if (url.includes('/api/folder')) {
    const { name } = route.request().postDataJSON();
    folders.push(name);
    return route.fulfill({ json: { folderId: 'F-' + name.replace(/\W/g, '') } });
  }
  if (url.includes('/api/drive-session')) { ses++; return route.fulfill({ json: { uploadUrl: `${APP}/__upload/${ses}` } }); }
  if (url.includes('/api/share')) return route.fulfill({ json: { ok: true } });
  return route.fulfill({ json: { files: [] } });
});
await page.route('**/__upload/**', route => {
  const n = route.request().url().split('/').pop();
  return route.fulfill({ json: { id: 'fid-' + n, webViewLink: `https://drive.google.com/file/d/fid-${n}/view` } });
});
await page.route('**/drive.google.com/**', r => r.abort());
const wolf = () => page.evaluate(() => JSON.parse(localStorage.getItem('wolfson_app_data')));
const media = 'input[type="file"][accept*="video"][accept*=".zip"]';

await page.goto(`${APP}/c/tok-jo`);
await page.waitForTimeout(3500);
if (await page.locator('button:has-text("All")').count()) await page.locator('button:has-text("All")').first().click().catch(() => {});
await page.waitForTimeout(500);

// ── 5 · the Job Board job's row ──────────────────────────────────────────────
const listText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
check(/Shamir villa/.test(listText), '5 · the Job Board job is on his list', '');
check(!/Apt Shamir villa/.test(listText), '5 · and it reads its own name, no "Apt" in front');

// ── 1–3 · the close ──────────────────────────────────────────────────────────
await page.locator('text=Lerner').first().click();
await page.waitForTimeout(900);
await page.locator('[data-close-job]').first().click();
await page.waitForTimeout(700);
await page.locator('[data-close-finished-pick="yes"]').click();
await page.locator('[data-close-more-pick="yes"]').click();
await page.waitForTimeout(300);
const done = page.locator('[data-close-done-stage="S3"]');
check(await done.count() === 1, '1 · the finished stage is offered');
check(await page.locator('[data-close-done-stage]').count() === 1, '1 · only the finished one (open stages stay in the main row)');
const bg = await done.evaluate(e => getComputedStyle(e).backgroundColor);
check(bg === 'rgb(241, 245, 249)', '1 · greyed', bg);
check(!(await done.isDisabled()), '1 · still pressable');
const openChips = await page.locator('[data-close-extras] > .flex-wrap > button').evaluateAll(bs => bs.map(b => b.getAttribute('data-close-extra') || 'OFF'));
check(JSON.stringify(openChips) === '["OFF","S4","S5"]', '1 · the open stages are unchanged', JSON.stringify(openChips));
await done.click();
await page.waitForTimeout(200);
check(await page.locator('[data-close-added-row="S3"]').count() === 1, '2 · picking it says it stays finished');
check(/stays finished/i.test(await page.locator('[data-close-added-row="S3"]').innerText()), '2 · in words');
check(await page.locator('[data-close-extra-part="S3"]').count() === 0, '2 · no All of it / Part of it for a finished stage');
check(!(await page.locator('[data-close-more-next]').isDisabled()), '2 · his words are optional — Next is open');
await page.locator('[data-close-added-row="S3"] textarea').fill('fixed a leak on one unit');
await page.locator('[data-close-more-next]').click();
await page.waitForTimeout(300);
await page.locator(media).first().setInputFiles([pic(1)]);
await page.waitForTimeout(2500);
await page.locator('[data-close-photo-next]').click();
await page.waitForTimeout(300);
const st = page.locator('[data-close-photo-step="S3"]');
check(await st.count() === 1 && await st.getAttribute('data-step-need') === '1', '2 · a picture step of its own, one picture');
check(/work added to a finished stage/i.test(await st.innerText()), '2 · named for what it is');
check(await page.locator('[data-close-now]').isDisabled(), '2 · Send waits for that picture');
const before = folders.length;
await page.locator(media).first().setInputFiles([pic(2)]);
await page.waitForTimeout(2500);
check(folders.slice(before).includes('Concealed units'), "2 · the picture goes into the finished stage's own folder", JSON.stringify(folders));
check(!(await page.locator('[data-close-now]').isDisabled()), '2 · Send unlocks');
await page.locator('[data-close-now]').click();
await page.waitForTimeout(2000);
const d = await wolf();
const t1 = d.contractorAssignments.find(a => a.id === 'T-1');
check(!!t1.completedAt, '3 · the task closes');
check(JSON.stringify(t1.addedStages) === '["S3"]' && t1.addedWords?.S3 === 'fixed a leak on one unit', '3 · it records the work added and his words', JSON.stringify({ a: t1.addedStages, w: t1.addedWords }));
check(!(t1.stagesWorked ?? []).includes('S3') && !(t1.stagesUnfinished ?? []).includes('S3') && !(t1.extraStages ?? []).includes('S3'),
  '3 · the finished stage is not counted as work done again', JSON.stringify({ w: t1.stagesWorked, u: t1.stagesUnfinished }));
const a16 = d.apartments.find(a => a.id === 'A1-16');
check(a16.stageMarks.S3 === 'done' && a16.stageMarks.S2 === 'done', '3 · the stage stays done (nothing reopened)', JSON.stringify(a16.stageMarks));
const photo = d.contractorPhotos.find(p => p.assignmentId === 'T-1' && p.stageId === 'S3');
check(!!photo, '3 · the picture is tagged to the finished stage');
const note = d.contractorNotes.find(n => n.assignmentId === 'T-1');
check(/Added work to stages already finished: Concealed units \(fixed a leak on one unit\)/.test(note?.text ?? ''), '3 · the office reads it in plain English', note?.text);
await page.close();

// ── 4 · the office's done card ───────────────────────────────────────────────
page = await ctx.newPage();
page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message); fails++; } });
await page.route('**/api/**', r => r.fulfill({ json: { files: [] } }));
await page.route('**/drive.google.com/**', r => r.abort());
await page.goto(`${APP}/project`);
await page.waitForTimeout(3000);
await page.locator('[data-apt-id="A1-16"]').first().click();
await page.waitForTimeout(1200);
await page.locator('button:has-text("Tasks")').first().click();
await page.waitForTimeout(800);
const added = page.locator('[data-task-added-stage="S3"]');
check(await added.count() === 1, '4 · the done card says work was added');
check(/Concealed units · work added \(it was already finished\): fixed a leak/.test((await added.innerText().catch(() => '')).replace(/\s+/g, ' ')), '4 · in words', await added.innerText().catch(() => ''));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
