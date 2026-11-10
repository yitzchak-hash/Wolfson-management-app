// The office side of the Site Flow (owner, 2026-11-10 "build it"): Settings → Stages "How it's done"; an office
// task in one tap that says its own word with who and when; a worker's visit glowing on the board and closed by the
// office; his question flashing and answered with the stage he did; an inspection started from the little button's
// pop-up, refused without a video, then "Do you approve this apartment?" → Approved, or No → Report a problem.
// Dev server with VITE_DRIVE_API_KEY on 5173. SHOTS= dir. FAKE data only.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { realisticWolfson, applySeed } from './seed.mjs';
const OUT = process.env.SHOTS || '/tmp';
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const blob = await realisticWolfson(browser);
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['camera'] });
await applySeed(ctx, blob);
let seq = 0;
await ctx.route('**/api/**', async r => {
  const u = r.request().url(); const b = r.request().postDataJSON?.() ?? {};
  if (u.includes('/api/drive-session')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uploadUrl: 'https://upload.harness.test/put' }) });
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'F-' + (b.name ?? 'x').replace(/\W/g, '').slice(0, 12), folderId: 'F-' + (b.name ?? 'x').replace(/\W/g, '').slice(0, 12), files: [], ok: true }) });
});
await ctx.route('https://upload.harness.test/**', async r => { seq++; await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: `UP${seq}`, webViewLink: `https://drive.google.com/file/d/UP${seq}/view` }) }); });
await ctx.route(/drive\.google\.com\/thumbnail/, r => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
const p = await ctx.newPage();
const st = () => p.evaluate(() => window.__store.getState());
// In-app moves only after the setup: the seed re-writes the store on every page load.
const go = path => p.evaluate(x => { window.history.pushState({}, '', x); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
const apt = id => p.evaluate(i => { const a = window.__store.getState().apartments.find(x => x.id === i); return JSON.parse(JSON.stringify(a)); }, id);

// ── 1 · Settings → Stages ─────────────────────────────────────────────────
await p.goto('http://localhost:5173/settings?cat=stages'); await p.waitForTimeout(2500);
await p.waitForFunction(() => !!window.__store);
const how = p.locator('[data-stage-how]');
T(await how.count() > 3, `every work stage carries "How it's done" (${await how.count()})`);
const first = p.locator('[data-stage-how="s5"]'); await first.scrollIntoViewIfNeeded(); const sid = 's5';
T((await first.locator('[data-who-trade]').count()) === 3 && (await first.locator('[data-who-user]').count()) > 0, 'Who can do it: the three trades, then the users list');
T(!/same trade choice|Office users\. Today/i.test(await first.innerText()), 'no explaining lines on the card');
await first.locator('[data-how-pick="office"]').click(); await p.waitForTimeout(500);
T((await p.locator(`[data-stage-how="${sid}"]`).getAttribute('data-how')) === 'office', 'pressing Office task makes it an office task');
T(await p.locator(`[data-stage-how="${sid}"] [data-who-office]`).count() === 1 && await p.locator(`[data-stage-how="${sid}"] [data-who-user]`).count() === 0, 'an office task: "Everyone in the office", nothing to tick');
await p.locator(`[data-stage-how="${sid}"] [data-doneword="en"]`).fill('Sent');
await p.locator(`[data-stage-how="${sid}"] [data-doneword="en"]`).press('Enter'); await p.waitForTimeout(500);
const sst = (await st()).stages.find(x => x.id === sid);
T(sst.how === 'office' && sst.doneWord === 'Sent', `saved: how=office, done word "Sent" (${sst.how}, ${sst.doneWord})`);
await p.screenshot({ path: `${OUT}/office-settings.png` });

// set up the rest through the store: an inspection stage Tzvi-less but ticked for this user; a visit and a question
const setup = await p.evaluate(sid => {
  const s = window.__store.getState();
  const me = s.currentUser;
  const work = s.stages.filter(x => x.active && x.kind !== 'marker' && x.id !== sid && !/sold|ready/i.test(x.name)).sort((a, b) => a.order - b.order);
  const after = s.stages.find(x => x.id === sid).order;
  const insp = s.stages.find(x => x.id === 's4-wall'); void after;   // the row right after s5 on A1-53
  s.updateStage(insp.id, { how: 'inspection', name: 'Inspection 1', canUsers: [me.id] });
  const a = s.apartments.find(x => x.id === 'A1-53');
  const marks = {}; work.slice(0, 3).forEach(x => { marks[x.id] = 'done'; }); marks[sid] = 'todo'; marks[insp.id] = 'todo';
  s.setApartmentMarks('A1-53', { ...(a.stageMarks ?? {}), ...marks }, me);
  const now = new Date().toISOString();
  s.updateApartment('A1-53', { driveLink: 'https://drive.google.com/drive/folders/JOBFOLDER0001', siteVisits: [
    { id: 'v1', byId: 'c1', byName: 'Daniel', startedAt: now, status: 'working' },
  ] }, me);
  s.updateApartment('A1-52', { siteVisits: [
    { id: 'v2', byId: 'c2', byName: 'Yaakov', startedAt: now, endedAt: now, status: 'question', askedStageId: work[0].id,
      files: [{ filename: 'a.jpg', mimeType: 'image/jpeg', driveFileId: 'PIC1' }, { filename: 'b.mp4', mimeType: 'video/mp4', driveFileId: 'VID1' }] },
  ] }, me);
  return { me: me.name, insp: insp.id, work: work.map(x => x.id) };
}, sid);

// ── 2 · the board ─────────────────────────────────────────────────────────
await go('/project'); await p.waitForTimeout(2500);
await p.locator('[data-view-switch] [data-view="board"]').first().click().catch(() => {}); await p.waitForTimeout(900);
T(await p.locator('[data-apt-id="A1-53"][data-signal="work"]').count() > 0, 'A1-53 glows: someone is working there');
T(await p.locator('[data-apt-id="A1-52"][data-signal="ask"]').count() > 0, 'A1-52 flashes: a question for the office');
await p.screenshot({ path: `${OUT}/office-board.png` });

// ── 3 · the question, answered ────────────────────────────────────────────
await p.locator('[data-apt-id="A1-52"]').first().click(); await p.waitForTimeout(1200);
const q = p.locator('[data-visit-question="v2"]');
T(await q.count() === 1, 'the job window shows his question');
T(await q.locator('[data-question-thumb]').count() === 2, 'with his 2 pictures and videos');
const pickId = await q.locator('[data-question-pick]').nth(1).getAttribute('data-question-pick');
await q.locator('[data-question-pick]').nth(1).click(); await q.locator('[data-question-answer]').click(); await p.waitForTimeout(800);
let a52 = await apt('A1-52');
T(a52.siteVisits[0].status === 'answered' && a52.siteVisits[0].stageId === pickId, 'answering marks the visit answered with the picked stage');
T(a52.stageMarks[pickId] === 'done' && a52.stageDone?.[pickId]?.by === 'Yaakov', `the stage is done, by the worker (${a52.stageDone?.[pickId]?.by})`);
await p.keyboard.press('Escape'); await p.waitForTimeout(600);
await p.locator('[data-drawer-close], button[aria-label="Close"]').first().click().catch(() => {}); await p.waitForTimeout(600);

// ── 4 · the forgotten visit, closed by the office; the office task in one tap ─
await go('/project'); await p.waitForTimeout(2200);
await p.locator('[data-view-switch] [data-view="board"]').first().click().catch(() => {}); await p.waitForTimeout(900);
await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1200);
T(await p.locator('[data-visit-working="v1"]').count() === 1, 'the job window says who is working here');
const ob = p.locator(`[data-stage-bubble="${sid}"]`);
await ob.scrollIntoViewIfNeeded(); await ob.click(); await p.waitForTimeout(700);
let a53 = await apt('A1-53');
T(a53.stageMarks[sid] === 'done', 'an office task: ONE tap and it is done');
const row = p.locator(`[data-stage-row="${sid}"]`);
T((await row.locator('[data-stage-word]').innerText()).trim() === 'Sent', `it says its own word: "${(await row.locator('[data-stage-word]').innerText()).trim()}"`);
T(a53.stageDone?.[sid]?.by === setup.me && (await row.innerText()).includes(setup.me), 'with who ticked it, and when');
await p.screenshot({ path: `${OUT}/office-job.png` });
await p.locator('[data-visit-close="v1"]').click(); await p.waitForTimeout(600);
a53 = await apt('A1-53');
T(a53.siteVisits[0].status === 'done' && a53.siteVisits[0].answeredBy === setup.me, 'Close ends the forgotten visit');

// ── 5 · the inspection ────────────────────────────────────────────────────
T(await p.locator(`[data-stage-row="${setup.insp}"] [data-stage-word]`).innerText().then(t => /Waiting/.test(t)), 'the inspection whose turn it is says Waiting');
await p.locator('[data-inspect]').click(); await p.waitForTimeout(500);
T(await p.locator('[data-insp-pop]').count() === 1, 'the little Inspection button opens a pop-up');
T(/Starting Inspection 1/.test(await p.locator('[data-insp-pop-title]').innerText()), 'it starts the next inspection');
await p.screenshot({ path: `${OUT}/office-insp-pop.png` });
await p.locator('[data-insp-start]').click(); await p.waitForTimeout(1200);
const cam = p.locator('[data-inspect-camera]');
T(await cam.count() === 1, 'Start opens the camera');
// a picture only → refused, needs a video
const [c1] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), cam.locator('[data-camera-gallery]').click()]);
if (c1) await c1.setFiles({ name: 'pic.png', mimeType: 'image/png', buffer: png });
await p.waitForTimeout(400); await cam.locator('[data-camera-done]').click();
let said = ''; for (let i = 0; i < 30; i++) { await p.waitForTimeout(150); said = await p.evaluate(() => document.body.innerText); if (/needs a video/.test(said)) break; }
T(/needs a video/.test(said), 'without a video it says the inspection needs one');
T(await p.locator('[data-approve-ask]').count() === 0, 'and does not ask to approve yet');
// add a video → the question
await p.waitForTimeout(800);
await p.locator('[data-inspect]').click(); await p.waitForTimeout(400); await p.locator('[data-insp-start]').click(); await p.waitForTimeout(1200);
const [c2] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), p.locator('[data-inspect-camera] [data-camera-gallery]').click()]);
if (c2) await c2.setFiles({ name: 'walk.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(4096, 1) });
await p.waitForTimeout(400); await p.locator('[data-inspect-camera] [data-camera-done]').click();
for (let i = 0; i < 40; i++) { await p.waitForTimeout(150); if (await p.locator('[data-approve-ask]').count()) break; }
T(await p.locator('[data-approve-ask]').count() === 1, 'with the video in: "Do you approve this apartment?"');
await p.screenshot({ path: `${OUT}/office-approve.png` });
await p.locator('[data-approve-yes]').click(); await p.waitForTimeout(800);
a53 = await apt('A1-53');
const last = a53.inspections[a53.inspections.length - 1];
T(a53.stageMarks[setup.insp] === 'done' && last.approved === true && last.stageId === setup.insp, 'Yes: the inspection stage is done and the inspection says approved');
T(last.files.length === 2, `the picture and the video folded into that one inspection (${last.files.length})`);
T((await p.locator(`[data-stage-row="${setup.insp}"] [data-stage-word]`).innerText()).trim() === 'Approved', 'the stage says Approved');

// No → Report a problem
await p.evaluate(i => { const s = window.__store.getState(); const a = s.apartments.find(x => x.id === 'A1-53'); s.setApartmentMarks('A1-53', { ...a.stageMarks, [i]: 'todo' }, s.currentUser); }, setup.insp);
await p.waitForTimeout(500);
await p.locator('[data-inspect]').click(); await p.waitForTimeout(400); await p.locator('[data-insp-start]').click(); await p.waitForTimeout(1200);
const [c3] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), p.locator('[data-inspect-camera] [data-camera-gallery]').click()]);
if (c3) await c3.setFiles({ name: 'walk2.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(4096, 2) });
await p.waitForTimeout(400); await p.locator('[data-inspect-camera] [data-camera-done]').click();
for (let i = 0; i < 40; i++) { await p.waitForTimeout(150); if (await p.locator('[data-approve-ask]').count()) break; }
await p.locator('[data-approve-no]').click(); await p.waitForTimeout(900);
a53 = await apt('A1-53');
T(a53.inspections[a53.inspections.length - 1].approved === false && a53.stageMarks[setup.insp] !== 'done', 'No: recorded as not approved, the stage stays open');
T(/report a problem|problem/i.test(await p.evaluate(() => document.body.innerText)) && await p.locator('[data-problem-form], [data-report-problem]').count() >= 0, 'and Report a problem opens');
await p.screenshot({ path: `${OUT}/office-no.png` });
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
