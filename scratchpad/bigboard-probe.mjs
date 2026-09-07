// The board after the import: ~1,650 jobs, most of them filed into groups.
// Measures load, pan, drag, idle CPU, opening a 500-job group, and profiles
// the pan to name the hot functions.
import { chromium } from 'playwright';
const APP = process.env.APP || 'http://localhost:5173';
const NOWIDGETS = !!process.env.NOWIDGETS; const FEW = !!process.env.FEW;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(({ NOWIDGETS, FEW }) => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const now = Date.now();
  const iso = d => new Date(now - d * 86400000).toISOString();
  const jobs = []; const groups = FEW ? [['CE-bin-newjobs', 5]] : [['CE-bin-newjobs', 500], ['done', 550], ['trash', 345], ['archive', 150]];
  let n = 0;
  for (let i = 0; i < 100; i++, n++) jobs.push({ id: `G-on${i}`, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: `Family ${n}`, address: `${i} Herzl, Jerusalem`, isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: 'note '.repeat(20), currentStageId: i % 3 ? 'S1' : null, stageDates: {}, canvasX: 40 + (i % 10) * 240, canvasY: 300 + Math.floor(i / 10) * 160, driveLink: `https://drive.google.com/drive/folders/F${n}`, createdAt: iso(200), updatedAt: iso(3), contentUpdatedAt: iso(3), updatedBy: 'U', updatedByName: 'U' });
  for (const [bin, count] of groups) for (let i = 0; i < count; i++, n++) jobs.push({ id: `G-imp-x-${n}`, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: `Family ${n}`, address: `${n} Jaffa, Jerusalem`, isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: 'Deal: something\nAccount: x', currentStageId: 'S1', stageDates: {}, boardBin: bin, binnedAt: iso(30), canvasX: 40 + (n % 40) * 240, canvasY: 40 + Math.floor(n / 40) * 160, phone: '0501234567', driveLink: `https://drive.google.com/drive/folders/F${n}`, createdAt: iso(10), updatedAt: iso(10), contentUpdatedAt: iso(10), updatedBy: 'U', updatedByName: 'U' });
  const tasks = []; for (let i = 0; i < 600; i++) tasks.push({ id: `T${i}`, contractorId: 'C-jo', apartmentId: jobs[i % jobs.length].id, taskDescription: `Task ${i} do the thing`, dueDate: iso(-(i % 20)).slice(0, 10), completed: i % 4 === 0, priority: 'normal', createdAt: iso(5), updatedAt: iso(5) });
  const logs = []; for (let i = 0; i < 200; i++) logs.push({ id: `L${i}`, apartmentId: jobs[i % jobs.length].id, userId: 'U-t', userName: 'A', actionType: 'update', fieldChanged: 'currentStageId', oldValue: null, newValue: 'S1', createdAt: iso(i % 30) });
  const notes = []; for (let i = 0; i < 300; i++) notes.push({ id: `N${i}`, assignmentId: `T${i % 600}`, apartmentId: jobs[i % jobs.length].id, contractorId: 'C-jo', authorType: 'contractor', text: 'hello there', createdAt: iso(i % 30) });
  const els = [
    { id: 'CE-bin-done', type: 'bin', binKind: 'done', x: 40, y: 40, w: 178, h: 92, text: '', color: '#16a34a' },
    { id: 'CE-bin-ready', type: 'bin', binKind: 'ready', x: 240, y: 40, w: 178, h: 92, text: '', color: '#0ea5e9' },
    { id: 'CE-bin-archive', type: 'bin', binKind: 'archive', x: 440, y: 40, w: 178, h: 92, text: '', color: '#64748b' },
    { id: 'CE-bin-trash', type: 'bin', binKind: 'trash', x: 640, y: 40, w: 178, h: 92, text: '', color: '#dc2626' },
    { id: 'CE-bin-newjobs', type: 'bin', x: 840, y: 40, w: 178, h: 92, text: 'New Jobs Came In', color: '#0ea5e9' },
    { id: 'CE-bins', type: 'widget', widget: 'bin-counter', x: 2500, y: 60, w: 260, h: 150, text: '', color: '#fff', data: {} },
    { id: 'CE-act', type: 'widget', widget: 'active-jobs', x: 2500, y: 240, w: 300, h: 260, text: '', color: '#fff', data: { days: 30 } },
    { id: 'CE-clock', type: 'widget', widget: 'clock', x: 2850, y: 60, w: 220, h: 120, text: '', color: '#fff', data: {} },
    { id: 'CE-rota', type: 'widget', widget: 'rota', x: 2500, y: 540, w: 900, h: 360, text: '', color: '#fff', data: { people: ['c:C-jo'], firstWeek: iso(7).slice(0, 10), weekCount: 3, span: 5, cells: {} } },
  ];
  if (NOWIDGETS) els.splice(5, 4);
  for (let i = 0; i < 15; i++) els.push({ id: `CE-n${i}`, type: 'note', x: 1100 + (i % 5) * 200, y: 60 + Math.floor(i / 5) * 170, w: 165, h: 150, text: 'note ' + i, color: '#fef9c3' });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'S1', name: 'AC installation', color: '#3b82f6', order: 1, active: true, projectId: 'general' }],
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }],
    contractorAssignments: tasks, activityLogs: logs, contractorNotes: notes, apartments: jobs, canvasElements: els,
  }));
}, { NOWIDGETS, FEW });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
const metric = async () => { const { metrics } = await cdp.send('Performance.getMetrics'); const g = n => metrics.find(m => m.name === n)?.value ?? 0; return { script: g('ScriptDuration'), layout: g('LayoutDuration'), recalc: g('RecalcStyleDuration'), heap: g('JSHeapUsedSize') }; };
const t0 = Date.now();
await page.goto(`${APP}/jobs`);
await page.waitForSelector('[data-node-id="CE-bin-newjobs"]', { timeout: 60000 });
console.log(`load → board drawn: ${Date.now() - t0}ms`);
await page.waitForTimeout(3000);
console.log('stored size KB:', await page.evaluate(() => Math.round((localStorage.getItem('general_app_data') || '').length / 1024)));
console.log('persist cost ms:', await page.evaluate(() => { const s = localStorage.getItem('general_app_data'); const t = performance.now(); JSON.parse(s); const j = JSON.stringify(JSON.parse(s)); return +(performance.now() - t).toFixed(1); }));
console.log('mounted tiles:', await page.evaluate(() => document.querySelectorAll('[data-board-world] [data-node-id^="G-"]').length));

const stats = a => { const s = [...a].sort((x, y) => x - y); const at = q => s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0; return { n: s.length, med: +at(0.5).toFixed(1), p90: +at(0.9).toFixed(1), max: +(s[s.length - 1] ?? 0).toFixed(1) }; };
async function measure(label, gesture, profile = false) {
  await page.evaluate(() => { window.__frames = []; window.__stop = false; let last = performance.now(); const tick = t => { window.__frames.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const m0 = await metric();
  if (profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
  const s0 = Date.now();
  await gesture();
  const secs = (Date.now() - s0) / 1000;
  let prof = null;
  if (profile) { prof = (await cdp.send('Profiler.stop')).profile; await cdp.send('Profiler.disable'); }
  const m1 = await metric();
  const frames = await page.evaluate(() => { window.__stop = true; return window.__frames.slice(3); });
  const st = stats(frames);
  console.log(`${label}: frames median ${st.med}ms · p90 ${st.p90}ms · worst ${st.max}ms · script ${((m1.script - m0.script) * 1000 / secs).toFixed(0)}ms/s · layout ${((m1.layout - m0.layout) * 1000 / secs).toFixed(0)}ms/s · style ${((m1.recalc - m0.recalc) * 1000 / secs).toFixed(0)}ms/s`);
  if (prof) {
    // Self time per function (top 12).
    const self = new Map(); const byId = new Map(prof.nodes.map(n => [n.id, n]));
    const dt = prof.timeDeltas; const samples = prof.samples;
    for (let i = 0; i < samples.length; i++) { const n = byId.get(samples[i]); const k = `${n.callFrame.functionName || '(anon)'} ${(n.callFrame.url || '').split('/').slice(-1)[0].split('?')[0]}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); }
    const total = [...self.values()].reduce((a, b) => a + b, 0);
    console.log('  top self-time:');
    [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).forEach(([k, v]) => console.log(`    ${(v / total * 100).toFixed(1).padStart(5)}%  ${k}`));
  }
  return st;
}
const vp = await page.locator('[data-board-viewport]').boundingBox();
const cx = vp.x + vp.width / 2, cy = vp.y + vp.height / 2;
await measure('idle 5s', () => page.waitForTimeout(5000));
await measure('pan', async () => { await page.mouse.move(cx + 300, cy + 100); await page.mouse.down({ button: 'middle' }); for (let i = 0; i < 40; i++) { await page.mouse.move(cx + 300 - i * 14, cy + 100 + Math.sin(i / 5) * 40); await page.waitForTimeout(14); } await page.mouse.up({ button: 'middle' }); }, true);
await page.waitForTimeout(500);
const tile = await page.evaluate(() => { const vp2 = document.querySelector('[data-board-viewport]').getBoundingClientRect(); const el = [...document.querySelectorAll('[data-board-world] [data-node-id^="G-on"]')].find(e => { const r = e.getBoundingClientRect(); return r.left > vp2.left + 80 && r.top > vp2.top + 200 && r.right < vp2.right - 120 && r.bottom < vp2.bottom - 80; }); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
if (tile) await measure('tile drag', async () => { await page.mouse.move(tile.x, tile.y); await page.mouse.down(); for (let i = 0; i < 40; i++) { await page.mouse.move(tile.x + i * 6, tile.y + Math.sin(i / 4) * 30); await page.waitForTimeout(14); } await page.mouse.up(); }, true);
else console.log('no tile on screen to drag');
await page.waitForTimeout(800);
// Open the 500-job group.
await page.locator('.bin-window-in').count();
const g = await page.$('[data-node-id="CE-bin-newjobs"]');
const gb = await g.boundingBox();
const o0 = Date.now();
await page.mouse.dblclick(gb.x + gb.width / 2, gb.y + gb.height / 2);
await page.waitForSelector('.bin-window-in', { timeout: 30000 });
await page.waitForTimeout(300);
console.log(`open 500-job group: ${Date.now() - o0}ms · tiles mounted in it: ${await page.evaluate(() => document.querySelectorAll('[data-bin-world] [data-node-id]').length)}`);
await measure('pan inside group', async () => { await page.mouse.move(cx, cy + 150); await page.mouse.down(); for (let i = 0; i < 40; i++) { await page.mouse.move(cx - i * 8, cy + 150 - i * 8); await page.waitForTimeout(14); } await page.mouse.up(); }, true);
await b.close();
