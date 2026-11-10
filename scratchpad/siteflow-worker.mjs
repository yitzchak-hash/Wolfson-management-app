// THE SITE FLOW, the worker's side (owner, 2026-11-10 — the approved Site Flow Preview, "Worker · his phone" 1–6c):
//   1 · tap a flat → "I'm working here" → a working visit on the apartment, nothing else asked;
//   2 · a green bar on top of the map, one per open visit — two flats at once;
//   3 · "I'm done here" → pictures and videos → Send (one batch card) → "Did you do Framing?" →
//       Yes: Framing done, stageDone in his name, the visit 'done', the Done screen with what he sent;
//       Select + Delete one → Drive's trash is asked, the visit keeps 2;
//   4 · the second flat → No → the visit is a 'question', "Sent to the office".
// Dev server with VITE_DRIVE_API_KEY on 5181 (APP=). Every /api call stubbed; names made up. SHOTS= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const APP = process.env.APP || 'http://localhost:5181';
const OUT = process.env.SHOTS || '/tmp';
let fails = 0, passes = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); ok ? passes++ : fails++; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const STAGES = [
  { id: 'skhtatb', name: 'Sold', color: '#64748b', order: 1, active: true, kind: 'work' },
  { id: 's-framing', name: 'Framing', color: '#f59e0b', order: 2, active: true, kind: 'work', trade: 'ac', how: 'site' },
  { id: 's-insp1', name: 'Inspection 1', color: '#7c3aed', order: 3, active: true, kind: 'work', how: 'inspection' },
  { id: 's-piping', name: 'Piping', color: '#9ca3af', order: 4, active: true, kind: 'work', trade: 'ac', how: 'site' },
];
const apt = (id, num, floor, name) => ({ id, buildingId: 'A1', floor, apartmentNumber: num, displayName: name, isUnnamed: false, isDuplexApt: false,
  classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, bubbles: true, stageMarks: { skhtatb: 'done' },
  driveLink: 'https://drive.google.com/drive/folders/FLATFOLDER01', createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
const admin = { id: 'U-o', name: 'Officer', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
const DATA = { currentUser: admin, users: [admin], stages: STAGES,
  contractors: [{ id: 'C-w', name: 'Yaakov Test', category: 'ac', token: 'tok-site', active: true, createdAt: '2026-01-01', lang: 'en', perms: { workHere: true, seeDiagrams: true, seeAllApartments: true } }],
  apartments: [apt('A1-23', '23', 6, 'Cohen'), apt('A1-24', '24', 6, 'Levi')], contractorAssignments: [] };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
let up = 0; const trashCalls = []; const folders = []; const sessions = [];
await ctx.route('**/api/**', async r => {
  const u = r.request().url();
  let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch {}
  if (u.includes('/api/folder')) { folders.push(body.name); return r.fulfill({ json: { folderId: 'FOLDER-' + String(body.name).replace(/\W/g, '') } }); }
  if (u.includes('/api/drive-session')) { sessions.push(body); return r.fulfill({ json: { uploadUrl: `${APP}/__fakeupload/${sessions.length}` } }); }
  if (body.mode === 'trash-files') { trashCalls.push(body.fileIds); return r.fulfill({ json: { results: body.fileIds.map(id => ({ id, trashed: true })) } }); }
  return r.fulfill({ json: { ok: true, files: [] } });
});
await ctx.route('**/__fakeupload/**', async r => { await new Promise(res => setTimeout(res, 700)); up++; r.fulfill({ json: { id: 'DRV-' + up, webViewLink: `https://drive.google.com/file/d/DRV-${up}/view` } }); });
await ctx.route(/drive\.google\.com\/thumbnail/, r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await ctx.route('**://fonts.googleapis.com/**', r => r.abort());
await ctx.addInitScript(d => {
  localStorage.setItem('wolfson_app_version', '3'); localStorage.setItem('whats_new_seen', '2099-01-01');
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
  if (!localStorage.getItem('wolfson_app_data')) localStorage.setItem('wolfson_app_data', JSON.stringify(d));
}, DATA);
const page = await ctx.newPage();
page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; } });
const aptOf = id => page.evaluate(i => (JSON.parse(localStorage.getItem('wolfson_app_data')).apartments ?? []).find(a => a.id === i), id);
// A tile's click scrolls the page itself; the bars live at the top of the map, so bring the page back first.
const shot = async n => { await page.evaluate(() => { window.scrollTo(0, 0); document.scrollingElement && (document.scrollingElement.scrollTop = 0); }); await page.waitForTimeout(100); await page.screenshot({ path: `${OUT}/worker-${n}.png` }); };
const waitFor = async (sel, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await page.locator(sel).count()) return true; await page.waitForTimeout(100); } return false; };

await page.goto(`${APP}/c/tok-site`); await page.waitForTimeout(2500);
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /Map/.test((x.textContent || '').trim()))?.click());
await page.waitForTimeout(400);
const pick = page.locator('button:has-text("Wolfson Residence")'); if (await pick.count()) await pick.first().click();
check(await waitFor('[data-apt-id="A1-23"]'), 'the map shows the building');
const tapFlat = async id => { await page.locator(`[data-apt-id="${id}"]`).first().click(); await waitFor('[data-work-sheet]'); await page.waitForTimeout(300); };

// 1 · the sheet and "I'm working here"
await tapFlat('A1-23');
const start = page.locator('[data-site-start]');
check(await start.count() === 1 && /I'm working here/.test(await start.innerText()), '1 · the sheet has one big "I\'m working here"');
check(await page.locator('[data-site-cancel]').count() === 1, '1 · and Cancel');
const bg = await start.evaluate(e => getComputedStyle(e).backgroundColor);
check(bg === 'rgb(5, 150, 105)', '1 · the button is green', bg);
check(await page.locator('[data-work-here]').count() === 0, '1 · the old "I started working here" is gone (owner, 2026-11-10: "remove the old one")');
await shot('1-sheet');
await start.click(); await page.waitForTimeout(600);
let a23 = await aptOf('A1-23');
const v1 = (a23.siteVisits ?? [])[0];
check(a23.siteVisits?.length === 1 && v1.status === 'working' && v1.byId === 'C-w' && v1.byName === 'Yaakov Test' && !!v1.startedAt, '1 · a working visit is written on the apartment', JSON.stringify(v1));
check(JSON.stringify(a23.stageMarks) === JSON.stringify({ skhtatb: 'done' }), '1 · no stage is touched at the start');
check(await page.locator('[data-work-sheet]').count() === 0, '1 · the sheet closes');

// 2 · the bar on top, the glow, and a second flat at once
check(await page.locator('[data-working-bar="A1-23"]').count() === 1, '2 · a green bar on top of the map');
const barText = await page.locator('[data-working-bar="A1-23"]').innerText();
check(/Working in Apt 23 · since \d\d:\d\d/.test(barText), '2 · it says where and since when', barText);
check(await page.locator('[data-apt-id="A1-23"].apt-signal-work').count() >= 1, '2 · the tile glows');
await shot('2-bar');
await tapFlat('A1-24');
await page.locator('[data-site-start]').click(); await page.waitForTimeout(600);
check(await page.locator('[data-working-bar]').count() === 2, '2 · two flats at once → two bars');
const a24 = await aptOf('A1-24');
check(a24.siteVisits?.[0]?.status === 'working' && (await aptOf('A1-23')).siteVisits?.[0]?.status === 'working', '2 · both visits are working');
await shot('2b-two-bars');
// a second tap on a working flat offers I'm done here / Still working, never a second visit
await tapFlat('A1-23');
check(await page.locator('[data-site-here="working"] [data-site-done-here]').count() === 1 && await page.locator('[data-site-still]').count() === 1, '2 · a working flat offers "I\'m done here" and "Still working"');
await shot('3-sheet-working');
await page.locator('[data-site-still]').click(); await page.waitForTimeout(300);
check((await aptOf('A1-23')).siteVisits.length === 1, '2 · "Still working" changes nothing');

// 3 · the bar → I'm done here → pictures and videos
await page.locator('[data-working-bar="A1-23"]').click(); await page.waitForTimeout(400);
check(await page.locator('[data-site-flow="ask"]').count() === 1, '3 · the bar opens "I\'m done here"');
await shot('3-done-ask');
await page.locator('[data-site-flow] [data-site-done-here]').click(); await page.waitForTimeout(300);
check(await page.locator('[data-site-flow="media"]').count() === 1, '4 · the pictures and videos screen');
check(await page.locator('[data-site-send]').isDisabled(), '4 · Send is shut with nothing picked');
await page.locator('[data-site-gallery-input]').setInputFiles([
  { name: 'IMG_1.png', mimeType: 'image/png', buffer: PNG },
  { name: 'IMG_2.png', mimeType: 'image/png', buffer: PNG },
  { name: 'VID_3.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not really a film') },
]);
await page.waitForTimeout(400);
check(await page.locator('[data-site-pending-thumb]').count() === 3, '4 · three thumbnails, each with ×', String(await page.locator('[data-site-thumb-remove]').count()));
check(!(await page.locator('[data-site-send]').isDisabled()), '4 · Send opens');
await shot('4-media');
await page.locator('[data-site-send]').click();
let cards = 0, count = null;
for (let i = 0; i < 40; i++) { await page.waitForTimeout(100); cards = await page.locator('[data-upload-toast]').count(); if (cards) { count = await page.locator('[data-upload-toast]').first().getAttribute('data-upload-count'); break; } }
check(cards === 1 && count === '3', '4 · ONE batch card for the three', `${cards} card(s), count ${count}`);
await shot('4b-uploading');
check(await waitFor('[data-site-flow="question"]', 15000), '5 · the question comes after the upload');
check(sessions.length === 3 && folders.includes('Photos') && folders.includes('Site visits'), '4 · three files to Drive › Photos › Site visits', `${sessions.length} · ${folders.join(',')}`);
const qText = await page.locator('[data-site-question]').innerText();
check(/The next stage open here is/.test(qText) && /Did you do Framing here\?/.test(qText), '5 · "The next stage open here is Framing"', qText.replace(/\s+/g, ' '));
check(await page.locator('[data-site-yes]').innerText() === 'Yes, Framing' && /No, something else/.test(await page.locator('[data-site-no]').innerText()), '5 · Yes, Framing / No, something else');
await shot('5-question');
await page.locator('[data-site-yes]').click(); await page.waitForTimeout(700);
a23 = await aptOf('A1-23');
check(a23.stageMarks?.['s-framing'] === 'done', '5 · Yes marks Framing done');
check(a23.stageDone?.['s-framing']?.by === 'Yaakov Test' && !!a23.stageDone['s-framing'].at, '5 · stageDone in his name', JSON.stringify(a23.stageDone));
const vd = a23.siteVisits[0];
check(vd.status === 'done' && vd.stageId === 's-framing' && vd.askedStageId === 's-framing' && !!vd.endedAt && vd.files?.length === 3, '5 · the visit is done, with its 3 files', JSON.stringify({ ...vd, files: vd.files?.length }));
check(vd.files.every(f => /^DRV-/.test(f.driveFileId)), '5 · every file carries its Drive id');
check(await page.locator('[data-site-flow="done"]').count() === 1 && /Done\. Framing is finished/.test(await page.locator('[data-site-done-title]').innerText()), '6 · "Done. Framing is finished"');
check(await page.locator('[data-site-sent-thumb]').count() === 3 && /What you sent · 3/.test(await page.locator('[data-site-sent]').innerText()), '6 · "What you sent · 3" with three thumbnails');
const nx = await page.locator('[data-site-next]').innerText().catch(() => '');
check(/NEXT HERE/.test(nx) && /Waiting for Inspection 1/.test(nx), '6 · next here: waiting for Inspection 1', nx.replace(/\s+/g, ' '));
await shot('6-done');
// a tap on the film plays it in the viewer
await page.locator('[data-site-sent-thumb="2"] button').first().click(); await page.waitForTimeout(500);
check(await page.locator('video').count() >= 1 || await page.locator('iframe').count() >= 1, '6 · a tapped video opens in the viewer');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
if (await page.locator('[aria-label="Close"], button:has(svg.lucide-x)').count() && await page.locator('video').count()) await page.locator('button:has(svg.lucide-x)').first().click().catch(() => {});
await page.waitForTimeout(300);

// 6b · Select + Delete one
await page.locator('[data-site-select]').click(); await page.waitForTimeout(200);
await page.locator('[data-site-sent-thumb="1"] button').first().click(); await page.waitForTimeout(200);
check(await page.locator('[data-site-sent-thumb="1"][data-picked="1"]').count() === 1 && /1 selected/.test(await page.locator('[data-site-sent]').innerText()), '6b · ticked: red outline, "1 selected"');
await page.locator('[data-site-delete]').click(); await page.waitForTimeout(200);
check(/Delete 1 picture\?/.test(await page.locator('[data-site-delete-ask]').innerText()), '6b · it asks once');
await shot('6b-select');
await page.locator('[data-site-delete-yes]').click(); await page.waitForTimeout(800);
check(trashCalls.length === 1 && trashCalls[0].length === 1 && trashCalls[0][0] === vd.files[1].driveFileId, '6b · Drive\'s trash is asked for that one file', JSON.stringify(trashCalls));
a23 = await aptOf('A1-23');
check(a23.siteVisits[0].files.length === 2 && !a23.siteVisits[0].files.some(f => f.driveFileId === vd.files[1].driveFileId), '6b · the visit keeps 2 files');
check(await page.locator('[data-site-sent-thumb]').count() === 2, '6b · two thumbnails left');
await page.locator('[data-site-back]').click(); await page.waitForTimeout(500);
check(await page.locator('[data-working-bar]').count() === 1 && await page.locator('[data-working-bar="A1-24"]').count() === 1, '6 · back to the building: only flat 24 still glows in the bar');

// 6c · the second flat → No
await page.locator('[data-working-bar="A1-24"]').click(); await page.waitForTimeout(300);
await page.locator('[data-site-flow] [data-site-done-here]').click(); await page.waitForTimeout(300);
await page.locator('[data-site-gallery-input]').setInputFiles([{ name: 'IMG_9.png', mimeType: 'image/png', buffer: PNG }]);
await page.waitForTimeout(300);
await page.locator('[data-site-send]').click();
check(await waitFor('[data-site-flow="question"]', 10000), '6c · the question again');
await page.locator('[data-site-no]').click(); await page.waitForTimeout(600);
const v24 = (await aptOf('A1-24')).siteVisits[0];
check(v24.status === 'question' && v24.askedStageId === 's-framing' && !!v24.endedAt && v24.files?.length === 1, '6c · the visit is a question for the office', JSON.stringify({ ...v24, files: v24.files?.length }));
check((await aptOf('A1-24')).stageMarks?.['s-framing'] !== 'done', '6c · nothing marked done');
const off = await page.locator('[data-site-flow="office"]').innerText().catch(() => '');
check(/Sent to the office/.test(off) && /They will be in touch with you\./.test(off) && /What you sent · 1/.test(off), '6c · "Sent to the office" with what he sent', off.replace(/\s+/g, ' '));
check(await page.locator('[data-site-select]').count() === 1 && await page.locator('[data-site-back]').count() === 1, '6c · Select and Back to the building');
await shot('6c-office');
await page.locator('[data-site-back]').click(); await page.waitForTimeout(400);
check(await page.locator('[data-working-bar]').count() === 0, '6c · no bars left');
check(await page.locator('[data-apt-id="A1-24"].apt-signal-ask').count() >= 1, '6c · flat 24 flashes for the office');
await shot('7-map-after');

// the page never runs wider than the phone
const wide = await page.evaluate(() => document.documentElement.scrollWidth);
check(wide <= 402, 'the phone is never scrolled sideways', String(wide));
console.log(`\n${passes} pass · ${fails} fail`);
await b.close();
process.exit(fails ? 1 : 0);
