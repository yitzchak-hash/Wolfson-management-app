// Probe: the Active jobs widget — every job something happened on in the
// window, newest first, saying what; a look ("opened") is not activity; a
// thing outside the window is not listed; the count is a button.
import { chromium } from 'playwright';

const SCRATCH = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(() => {
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('active_project', 'general');
  const user = { id: 'U-t', name: 'Probe', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const worker = { id: 'C-w', name: 'Moshe', category: 'ac', token: 'tok', active: true, createdAt: '2026-01-01' };
  const ago = n => new Date(Date.now() - n * 86_400_000).toISOString();
  const job = (id, name, extra = {}) => ({
    id, buildingId: 'G', apartmentNumber: '', displayName: name, floor: 0, colPosition: 1, colSpan: 1,
    isDuplexApt: false, currentStageId: null, classification: 'standard', shinuiDetails: null, generalNotes: '',
    isUnnamed: false, canvasX: 40, canvasY: 300, createdAt: ago(200), ...extra,
  });
  const apartments = [
    job('G-edit', 'Edited job', { contentUpdatedAt: ago(3) }),
    job('G-task', 'Tasked job'),
    job('G-note', 'Messaged job'),
    job('G-look', 'Only looked at'),
    job('G-old', 'Old photo job'),
    job('G-quiet', 'Quiet job'),
  ];
  const contractorAssignments = [
    { id: 'T-1', apartmentId: 'G-task', buildingId: 'G', contractorId: 'C-w', taskDescription: 'Fit the units', dueDate: null, completedAt: null, createdAt: ago(10), createdBy: 'U-t', createdByName: 'Probe' },
    { id: 'T-2', apartmentId: 'G-note', buildingId: 'G', contractorId: 'C-w', taskDescription: 'Pipes', dueDate: null, completedAt: null, createdAt: ago(60), createdBy: 'U-t', createdByName: 'Probe' },
    { id: 'T-3', apartmentId: 'G-old', buildingId: 'G', contractorId: 'C-w', taskDescription: 'Gas', dueDate: null, completedAt: null, createdAt: ago(70), createdBy: 'U-t', createdByName: 'Probe' },
  ];
  const contractorNotes = [
    { id: 'N-1', assignmentId: 'T-2', apartmentId: 'G-note', contractorId: 'C-w', text: 'Done the first floor', authorType: 'contractor', authorId: 'C-w', authorName: 'Moshe', createdAt: ago(1) },
  ];
  const contractorPhotos = [
    { id: 'P-1', assignmentId: 'T-3', apartmentId: 'G-old', contractorId: 'C-w', filename: 'a.jpg', mimeType: 'image/jpeg', dataUrl: '', uploadedAt: ago(40), fileType: 'image' },
  ];
  const activityLogs = [
    { id: 'L-1', userId: 'U-t', userName: 'Probe', buildingId: 'G', apartmentId: 'G-look', apartmentNumber: 'Only looked at', actionType: 'opened', fieldChanged: 'viewed', previousValue: '', newValue: '', stageId: '', createdAt: ago(2) },
  ];
  localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user, contractors: [worker] }));
  localStorage.setItem('general_app_data', JSON.stringify({
    users: [user], currentUser: user, contractors: [worker], apartments, contractorAssignments, contractorNotes, contractorPhotos, activityLogs, canvasElements: [],
  }));
});

const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(3000);

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /store/i.test(x.textContent || '') && x.closest('[data-board-toolrail]'));
  b?.click();
});
await page.waitForTimeout(1200);
const card = page.locator('[data-widget-id="active-jobs"]');
check(await card.count() === 1, 'the store sells an Active jobs card');
const previewCount = await card.locator('[data-active-count]').innerText().catch(() => '');
check(Number(previewCount) > 0, `the shelf preview shows sample activity (${previewCount})`);
await card.screenshot({ path: `${SCRATCH}/activejobs-card.png` });
await card.evaluate(c => c.click());
await page.waitForTimeout(900);
await page.mouse.click(8, 500);
await page.waitForTimeout(600);

const node = page.locator('[data-node-id]').filter({ has: page.locator('[data-active-count]') }).first();
check(await node.count() === 1, 'the widget landed on the board');
const count = await node.locator('[data-active-count]').innerText();
check(count === '3', `three jobs had activity in the last 30 days (${count})`);
const rows = await node.locator('[data-mini-job], [data-minijob]').allInnerTexts().catch(() => []);
const text = (await node.innerText()).replace(/\s+/g, ' ');
check(text.indexOf('Messaged job') < text.indexOf('Edited job') && text.indexOf('Edited job') < text.indexOf('Tasked job'),
  'newest first: the message (1d), the edit (3d), the task (10d)', text.slice(0, 200));
check(/message from site/.test(text) && /edited/.test(text) && /new task/.test(text), 'each row says what its last activity was');
check(!/Only looked at/.test(text), 'merely opening a job is not activity');
check(!/Old photo job/.test(text) && !/Quiet job/.test(text), 'a photo from 40 days ago is outside the window; a quiet job is not listed');
await node.screenshot({ path: `${SCRATCH}/activejobs-node.png` });
void rows;

// The count opens the list.
await node.locator('button[data-active-count]').evaluate(b => b.click());
await page.waitForTimeout(600);
const popup = await page.locator('[data-widget-list], [data-list-popup]').count();
const popupText = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
check(popup > 0 || /Active · last 30 days/.test(popupText), 'the count opens the list popup');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await browser.close();
