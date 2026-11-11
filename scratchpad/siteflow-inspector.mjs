// THE INSPECTOR'S LINK (owner, 2026-11-11): a worker with the `inspect` permission sees the whole building map; a flat's
// sheet has a violet "Inspect here"; pictures + the video → Send → "Do you approve this apartment?" → Yes finishes the
// inspection stage in his name, No keeps it open with his words for the office. Dev server on 5173. Names made up.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const APP = process.env.APP || 'http://localhost:5173';
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
  classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, bubbles: true, stageMarks: { skhtatb: 'done', 's-framing': 'done' },
  driveLink: 'https://drive.google.com/drive/folders/FLATFOLDER01', createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
const admin = { id: 'U-o', name: 'Officer', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
const DATA = { currentUser: admin, users: [admin], stages: STAGES,
  contractors: [{ id: 'C-w', name: 'Tzvi Test', category: 'ac', token: 'tok-site', active: true, createdAt: '2026-01-01', lang: 'en', perms: { inspect: true, workHere: false, seeDiagrams: true, seeAllApartments: true } }],
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
check(await waitFor('[data-apt-id="A1-23"]'), 'the inspector sees the building map');
check(await page.locator('[data-apt-id="A1-23"].apt-signal-wait').count() >= 1, 'a flat waiting for an inspection is lit and dashed violet for him');
const tapFlat = async id => { await page.locator(`[data-apt-id="${id}"]`).first().click(); await waitFor('[data-work-sheet]'); await page.waitForTimeout(300); };
await tapFlat('A1-23');
const btn = page.locator('[data-work-foot] [data-site-inspect]');
check(await btn.count() === 1 && /Inspect here · Inspection 1/.test(await btn.innerText()), 'the sheet has "Inspect here · Inspection 1"', await btn.innerText().catch(() => ''));
check(await page.locator('[data-site-start]').count() === 0, 'and no "I\'m working here" (he has no work permission)');
await shot('insp-1-sheet');
await btn.click(); await page.waitForTimeout(400);
check(await page.locator('[data-inspect-flow="media"]').count() === 1 && await page.locator('[data-insp-send]').isDisabled(), 'the inspection screen opens, Send shut');
await page.locator('[data-insp-gallery-input]').setInputFiles([{ name: 'IMG_1.png', mimeType: 'image/png', buffer: PNG }]);
await page.waitForTimeout(300);
check(await page.locator('[data-insp-send]').isDisabled() && await page.locator('[data-insp-need]').count() === 1, 'a picture alone is not enough: "a video is needed"');
await page.locator('[data-insp-gallery-input]').setInputFiles([{ name: 'VID_2.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not really a film') }]);
await page.waitForTimeout(300);
check(!(await page.locator('[data-insp-send]').isDisabled()), 'with the video, Send opens');
await page.locator('[data-insp-send]').click();
check(await waitFor('[data-inspect-flow="approve"]', 15000), '"Do you approve this apartment?" comes after the upload');
check(sessions.length === 2 && folders.includes('Photos') && folders.includes('Inspections'), 'two files to Drive › Photos › Inspections', `${sessions.length} · ${folders.join(',')}`);
await shot('insp-2-approve');
await page.locator('[data-insp-yes]').click(); await page.waitForTimeout(700);
let a23 = await aptOf('A1-23');
const ins = (a23.inspections ?? [])[0];
check(a23.stageMarks?.['s-insp1'] === 'done' && a23.stageDone?.['s-insp1']?.by === 'Tzvi Test', 'Yes: Inspection 1 is done in his name', JSON.stringify(a23.stageDone));
check(!!ins && ins.approved === true && ins.stageId === 's-insp1' && ins.byName === 'Tzvi Test' && ins.files.length === 2, 'the inspection is on the record, approved, with its 2 files', JSON.stringify({ ...ins, files: ins?.files?.length }));
check(/Inspection 1: approved/.test(await page.locator('[data-insp-done-title]').innerText()), '"Inspection 1: approved"');
await shot('insp-3-done');
await page.locator('[data-insp-back]').click(); await page.waitForTimeout(400);

// the second flat → No, with his words
await tapFlat('A1-24');
await page.locator('[data-site-inspect]').click(); await page.waitForTimeout(300);
await page.locator('[data-insp-gallery-input]').setInputFiles([{ name: 'VID_9.mp4', mimeType: 'video/mp4', buffer: Buffer.from('film') }]);
await page.waitForTimeout(300);
await page.locator('[data-insp-send]').click();
check(await waitFor('[data-inspect-flow="approve"]', 10000), 'the question again');
await page.locator('[data-insp-no]').click(); await page.waitForTimeout(400);
await page.locator('[data-insp-wrong]').fill('Drain slope is wrong');
await page.locator('[data-insp-wrong-save]').click(); await page.waitForTimeout(600);
const a24 = await aptOf('A1-24');
check(a24.stageMarks?.['s-insp1'] !== 'done' && a24.inspections?.[0]?.approved === false && a24.inspections[0].note === 'Drain slope is wrong', 'No: the stage stays open, with his words for the office', JSON.stringify(a24.inspections?.[0] && { ...a24.inspections[0], files: 1 }));
check(await page.locator('[data-inspect-flow]').count() === 0, 'and he is back on the building');
const wide = await page.evaluate(() => document.documentElement.scrollWidth);
check(wide <= 402, 'the phone is never scrolled sideways', String(wide));
console.log(`\n${passes} pass · ${fails} fail`);
await b.close();
process.exit(fails ? 1 : 0);
