// Drive activity feeds the Active-jobs widget (owner, 2026-09-07): hourly,
// every file changed in Drive is pinned to the job whose folder it lives in.
import { chromium } from 'playwright';
const APP = 'http://localhost:5174';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
let recentCalls = [];
const ago = d => new Date(Date.now() - d * 86400000).toISOString();
await ctx.route('**/api/drive-files', async route => {
  const body = route.request().postDataJSON();
  if (body.recent) {
    recentCalls.push(body.recent);
    return route.fulfill({ json: { files: [
      // a photo inside Job A's Photos folder, two days ago
      { id: 'ph1', name: 'kitchen.jpg', mimeType: 'image/jpeg', modifiedTime: ago(2), ancestors: ['F-photosA', 'F-jobA', 'F-pot'] },
      // a plan straight in Job B's folder, yesterday
      { id: 'pl1', name: 'plan-v2.pdf', mimeType: 'application/pdf', modifiedTime: ago(1), createdTime: ago(1), who: 'Moshe', ancestors: ['F-jobB', 'F-pot'] },
      // a proposal taken OUT of the grouped job's folder, two and a half days ago
      { id: 'rm1', name: 'old-quote.pdf', mimeType: 'application/pdf', modifiedTime: ago(2.5), who: 'Moshe', removed: true, jobFolder: 'F-jobD', ancestors: [] },
      // a file in a folder no job owns
      { id: 'x1', name: 'stray.pdf', mimeType: 'application/pdf', modifiedTime: ago(1), ancestors: ['F-nobody'] },
      // a proposal in a job the import filed into a GROUP — the server settled it (jobFolder), no ancestors needed
      { id: 'pr1', name: 'proposal.docx', mimeType: 'application/vnd.google-apps.document', modifiedTime: ago(3), ancestors: [], jobFolder: 'F-jobD' },
      // a file in a TRASHED job's folder — never shown
      { id: 'tr1', name: 'old.pdf', mimeType: 'application/pdf', modifiedTime: ago(1), ancestors: ['F-jobE'] },
    ] } });
  }
  return route.fulfill({ json: { files: [] } });
});
await ctx.route('**/api/geocode**', route => route.fulfill({ status: 501, json: {} }));
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  // Only on the FIRST load — an init script runs on every navigation, and
  // wiping the cache on the reload would blame the app for asking again.
  if (localStorage.getItem('general_app_data')) return;
  localStorage.removeItem('drive_activity');
  const user = { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const old = new Date(Date.now() - 200 * 86400000).toISOString();
  const job = (id, name, x, link) => ({ id, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, canvasX: x, canvasY: 500,
    createdAt: old, updatedAt: old, contentUpdatedAt: old, updatedBy: 'U', updatedByName: 'U', driveLink: `https://drive.google.com/drive/folders/${link}` });
  localStorage.setItem('general_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors: [], stages: [], contractorAssignments: [], contractorNotes: [], contractorPhotos: [], activityLogs: [],
    apartments: [job('G-a', 'Alpha job', 60, 'F-jobA'), job('G-b', 'Beta job', 320, 'F-jobB'), job('G-c', 'Quiet job', 580, 'F-jobC'),
      // filed into a hand-made group by the import (copied in — its own timestamp is not activity)
      { ...job('G-imp-1-d', 'Grouped job', 0, 'F-jobD'), boardBin: 'CE-bin-old', binnedAt: old, contentUpdatedAt: new Date().toISOString(), createdAt: new Date().toISOString() },
      { ...job('G-e', 'Binned job', 0, 'F-jobE'), boardBin: 'trash', binnedAt: old },
      // the sweep copied this one in TODAY and nothing moved in its folder: not activity
      { ...job('G-auto-F-jobF', 'Swept job', 0, 'F-jobF'), boardBin: 'CE-bin-newjobs', binnedAt: new Date().toISOString(), contentUpdatedAt: new Date().toISOString(), createdAt: new Date().toISOString() }],
    canvasElements: [{ id: 'CE-act', type: 'widget', widget: 'active-jobs', x: 40, y: 40, w: 300, h: 260, z: 5, data: { days: 30 } },
      { id: 'CE-bin-old', type: 'bin', x: 700, y: 60, w: 178, h: 92, text: 'Old clients', color: '#64748b' },
      { id: 'CE-bin-newjobs', type: 'bin', x: 900, y: 60, w: 178, h: 92, text: 'New Jobs Came In', color: '#0ea5e9' }],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
// The refresher fires 20s after arrival with the sweep's clock; wait for it.
await page.waitForFunction(() => !!localStorage.getItem('drive_activity'), null, { timeout: 40000 }).catch(() => {});
await page.waitForTimeout(800);
const act = await page.evaluate(() => JSON.parse(localStorage.getItem('drive_activity') || 'null'));
check(recentCalls.length >= 1 && /^\d{4}-/.test(recentCalls[0].since), 'the app asked Drive for everything changed since a date', JSON.stringify(recentCalls[0]));
check(act && act.byFolder['F-jobA']?.name === 'kitchen.jpg' && act.byFolder['F-jobB']?.name === 'plan-v2.pdf' && !act.byFolder['F-nobody'],
  'each change is pinned to the JOB folder above it — a photo in Job A/Photos counts for Job A; a stray file counts for nobody', JSON.stringify(act?.byFolder));
check(Array.isArray(recentCalls[0]?.folders) && recentCalls[0].folders.includes('F-jobA') && recentCalls[0].folders.includes('F-jobD'),
  'the app tells the server which folders are jobs, so the server can stop climbing early', `${recentCalls[0]?.folders?.length} folders sent`);
check(act?.byFolder['F-jobD']?.name === 'old-quote.pdf' && act.byFolder['F-jobD'].removed === true && (act.byFolder['F-jobD'].touches ?? []).some(t => t.name === 'proposal.docx'),
  'changes the server settled itself (jobFolder) are pinned too — the removal is the newest, the older proposal kept beneath it', JSON.stringify(act?.byFolder['F-jobD']));
const node = page.locator('[data-node-id="CE-act"]');
const txt = (await node.innerText()).replace(/\s+/g, ' ');
check(/\b3\b/.test(await node.locator('[data-active-count]').innerText()), 'the widget counts the three jobs that moved in Drive — the grouped one included', await node.locator('[data-active-count]').innerText());
check(/Beta job.*Moshe · Drive · added plan-v2\.pdf/.test(txt) && /Alpha job.*Drive · changed kitchen\.jpg/.test(txt) && !/Quiet job/.test(txt),
  'rows say what moved in Drive, newest first; the quiet job stays off', txt.slice(0, 200));
check(/Grouped job.*Old clients · Moshe · Drive · removed old-quote\.pdf/.test(txt), 'a job filed in a group appears, labelled with its group — and a proposal REMOVED from its folder is its newest touch', txt.slice(0, 300));
check(!/Binned job/.test(txt), 'a job in Trash never appears, whatever moved in its folder');
check(!/Swept job/.test(txt), 'a job the sweep merely copied in today is not "activity"');
check(txt.indexOf('Beta job') < txt.indexOf('Alpha job'), 'yesterday\'s plan outranks the two-day-old photo');
// A second visit within the hour asks nothing new.
await page.reload();
await page.waitForTimeout(25000);
check(recentCalls.length === 1, 'within the hour the app does not ask Drive again', `${recentCalls.length} calls`);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
