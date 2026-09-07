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
      { id: 'pl1', name: 'plan-v2.pdf', mimeType: 'application/pdf', modifiedTime: ago(1), ancestors: ['F-jobB', 'F-pot'] },
      // a file in a folder no job owns
      { id: 'x1', name: 'stray.pdf', mimeType: 'application/pdf', modifiedTime: ago(1), ancestors: ['F-nobody'] },
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
    apartments: [job('G-a', 'Alpha job', 60, 'F-jobA'), job('G-b', 'Beta job', 320, 'F-jobB'), job('G-c', 'Quiet job', 580, 'F-jobC')],
    canvasElements: [{ id: 'CE-act', type: 'widget', widget: 'active-jobs', x: 40, y: 40, w: 300, h: 260, z: 5, data: { days: 30 } }],
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
const node = page.locator('[data-node-id="CE-act"]');
const txt = (await node.innerText()).replace(/\s+/g, ' ');
check(/\b2\b/.test(await node.locator('[data-active-count]').innerText()), 'the widget counts the two jobs that moved in Drive', await node.locator('[data-active-count]').innerText());
check(/Beta job.*Drive · plan-v2\.pdf/.test(txt) && /Alpha job.*Drive · kitchen\.jpg/.test(txt) && !/Quiet job/.test(txt),
  'rows say what moved in Drive, newest first; the quiet job stays off', txt.slice(0, 200));
check(txt.indexOf('Beta job') < txt.indexOf('Alpha job'), 'yesterday\'s plan outranks the two-day-old photo');
// A second visit within the hour asks nothing new.
await page.reload();
await page.waitForTimeout(25000);
check(recentCalls.length === 1, 'within the hour the app does not ask Drive again', `${recentCalls.length} calls`);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
