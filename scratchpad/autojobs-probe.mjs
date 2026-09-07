// The Drive sweep (owner, 2026-09-07): watched intake folders → every
// subfolder no job is linked to becomes a Job Board job in "New Jobs Came In".
import { chromium } from 'playwright';
const APP = 'http://localhost:5174';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
let listed = [];
await ctx.route('**/api/drive-files', async route => {
  const body = route.request().postDataJSON();
  listed.push(body.folderId);
  if (body.folderId === 'F-pot') return route.fulfill({ json: { files: [
    { id: 'F-c1', name: 'Cohen, David - 5555 - notes', mimeType: FOLDER_MIME },
    { id: 'F-c2', name: 'Levi, Sara - 777', mimeType: FOLDER_MIME },
    { id: 'F-linked', name: 'Already, Linked - 1', mimeType: FOLDER_MIME },
    { id: 'X-file', name: 'notes.pdf', mimeType: 'application/pdf' },
  ] } });
  if (body.folderId === 'F-in') return route.fulfill({ json: { files: [{ id: 'F-c3', name: 'Katz', mimeType: FOLDER_MIME }] } });
  return route.fulfill({ json: { files: [] } });
});
await ctx.route('**/api/share', route => route.fulfill({ json: { ok: true } }));
await ctx.route('**/api/folder', route => route.fulfill({ json: { folderId: 'F-x' } }));
await ctx.route('**/api/geocode**', route => route.request().method() === 'GET'
  ? route.fulfill({ json: { ok: true, clientEmail: 'sa@probe.iam.gserviceaccount.com' } })
  : route.fulfill({ status: 501, json: { error: 'no' } }));
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  const user = { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  // Wolfson already has a job linked to F-linked — the cross-workspace guard.
  localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user, contractors: [], apartments: [
    { id: 'A1-53', buildingId: 'A1', apartmentNumber: '53', displayName: 'Linked', floor: 15, colPosition: 1, colSpan: 2, isDuplexApt: false,
      currentStageId: null, classification: 'standard', shinuiDetails: null, generalNotes: '', isUnnamed: false,
      driveLink: 'https://drive.google.com/drive/folders/F-linked', createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' },
  ] }));
  localStorage.setItem('general_app_data', JSON.stringify({ users: [user], currentUser: user, contractors: [], stages: [], apartments: [], canvasElements: [] }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/settings`);
await page.waitForTimeout(2500);
const card = page.locator('[data-autojobs-card]');
check(await card.count() === 1, 'the Automatic-jobs card is on the Job Board\'s project settings');
check((await card.innerText()).includes('sa@probe.iam.gserviceaccount.com'), 'it says which account to share the folders with');
await card.locator('[data-autojobs-folders]').fill('https://drive.google.com/drive/folders/F-pot\nhttps://drive.google.com/drive/folders/F-in\n');
await card.locator('[data-autojobs-folders]').blur();
await card.locator('[data-autojobs-on]').check();
await page.waitForTimeout(300);
await card.locator('[data-autojobs-run]').click();
await page.waitForTimeout(2500);
const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data') || '{}'));
let d = await store();
const auto = (d.apartments ?? []).filter(a => a.id.startsWith('G-auto-'));
check(auto.length === 3 && ['G-auto-F-c1', 'G-auto-F-c2', 'G-auto-F-c3'].every(id => auto.some(a => a.id === id)),
  'three new folders became three jobs, ids from the folder ids', auto.map(a => a.id).join(','));
check(!auto.some(a => a.id === 'G-auto-F-linked') && !auto.some(a => a.id === 'G-auto-X-file'),
  'a folder Wolfson already has a job for is skipped, and a file is not a folder');
const c1 = auto.find(a => a.id === 'G-auto-F-c1');
check(c1?.displayName === 'Cohen, David' && c1.driveLink === 'https://drive.google.com/drive/folders/F-c1',
  'the family comes from the folder title, the folder is the Drive link', `${c1?.displayName} ${c1?.driveLink}`);
const group = (d.canvasElements ?? []).find(e => e.id === 'CE-bin-newjobs');
check(!!group && group.type === 'bin' && group.text === 'New Jobs Came In', 'the "New Jobs Came In" group was minted once under its fixed id');
check(auto.every(a => a.boardBin === 'CE-bin-newjobs'), 'every new job sits in that group');
check(listed.includes('F-pot') && listed.includes('F-in'), 'both watched folders were listed', listed.join(','));
const status = await card.locator('[data-autojobs-status]').innerText();
check(/Last checked/.test(status) && /3 new jobs/.test(status), 'the card records the sweep', status);
check(d.boardSettings?.general?.autoJobs?.on === true && d.boardSettings.general.autoJobs.folders.length === 2 && !!d.boardSettings.general.autoJobs.lastRunAt,
  'the setting (on, folders, lastRunAt) is in boardSettings — synced, no new key');
// a second sweep creates nothing
listed = [];
await card.locator('[data-autojobs-run]').click();
await page.waitForTimeout(2000);
d = await store();
check((d.apartments ?? []).filter(a => a.id.startsWith('G-auto-')).length === 3 && (d.canvasElements ?? []).filter(e => e.id === 'CE-bin-newjobs').length === 1,
  'a second sweep adds nothing — the same folders, the same jobs, one group');
// the board shows the group with its count
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2500);
const binText = await page.locator('[data-node-id="CE-bin-newjobs"]').innerText().catch(() => '');
check(/New Jobs Came In/i.test(binText) && /3/.test(binText), 'the board draws the group with its three jobs', binText.replace(/\n/g, ' '));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
