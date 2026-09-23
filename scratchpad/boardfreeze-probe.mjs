// "Chrome freezes on the job board, sometimes the whole computer." A LONG
// session on the production bundle (vite preview 4173) over the big-board
// seed: repeated wheel-pan + ctrl-wheel zoom cycles, sampling heap (after a
// forced GC), DOM nodes, listeners, compositor layers (count + painted
// bytes), long tasks and the worst frame gap. Nothing is asserted — the
// numbers are the answer. Run: APP=http://localhost:4173 node scratchpad/boardfreeze-probe.mjs
import { chromium } from 'playwright';
const APP = process.env.APP || 'http://localhost:4173';
const CYCLES = +(process.env.CYCLES || 6);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--enable-precise-memory-info'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  const now = Date.now();
  const iso = d => new Date(now - d * 86400000).toISOString();
  const jobs = []; const groups = [['CE-bin-newjobs', 500], ['done', 550], ['trash', 345], ['archive', 150]];
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
    { id: 'CE-clock2', type: 'widget', widget: 'world-clocks', x: 2850, y: 200, w: 220, h: 200, text: '', color: '#fff', data: {} },
    { id: 'CE-cd', type: 'widget', widget: 'countdown', x: 3100, y: 60, w: 220, h: 120, text: '', color: '#fff', data: { target: new Date(now + 5 * 86400000).toISOString() } },
    { id: 'CE-rota', type: 'widget', widget: 'rota', x: 2500, y: 540, w: 900, h: 360, text: '', color: '#fff', data: { people: ['c:C-jo'], firstWeek: iso(7).slice(0, 10), weekCount: 3, span: 5, cells: {} } },
    { id: 'CE-cal', type: 'widget', widget: 'calendar-mini', x: 3450, y: 540, w: 260, h: 260, text: '', color: '#fff', data: {} },
    { id: 'CE-due', type: 'widget', widget: 'due-today', x: 3450, y: 60, w: 260, h: 200, text: '', color: '#fff', data: {} },
    { id: 'CE-late', type: 'widget', widget: 'overdue-list', x: 3450, y: 280, w: 260, h: 220, text: '', color: '#fff', data: {} },
  ];
  for (let i = 0; i < 15; i++) els.push({ id: `CE-n${i}`, type: 'note', x: 1100 + (i % 5) * 200, y: 60 + Math.floor(i / 5) * 170, w: 165, h: 150, text: 'note ' + i, color: '#fef9c3' });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'S1', name: 'AC installation', color: '#3b82f6', order: 1, active: true, projectId: 'general' }],
    contractors: [{ id: 'C-jo', name: 'Joseph', category: 'ac', token: 'tok-jo', active: true, createdAt: '2026-01-01' }],
    contractorAssignments: tasks, activityLogs: logs, contractorNotes: notes, apartments: jobs, canvasElements: els,
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('HeapProfiler.enable');
await cdp.send('LayerTree.enable');
let layers = [];
cdp.on('LayerTree.layerTreeDidChange', e => { if (e.layers) layers = e.layers; });
const metric = async () => { const { metrics } = await cdp.send('Performance.getMetrics'); const g = n => metrics.find(m => m.name === n)?.value ?? 0; return { script: g('ScriptDuration'), layout: g('LayoutDuration'), recalc: g('RecalcStyleDuration'), heap: g('JSHeapUsedSize'), nodes: g('Nodes'), listeners: g('JSEventListeners'), layoutObjects: g('LayoutObjects') }; };
const MB = x => (x / 1048576).toFixed(1);
const layerStats = () => { const painted = layers.filter(l => l.drawsContent); return { n: layers.length, painted: painted.length, bytes: painted.reduce((a, l) => a + l.width * l.height * 4, 0) }; };
async function sample(label) {
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(300);
  const m = await metric();
  const dom = await page.evaluate(() => ({ all: document.querySelectorAll('*').length, tiles: document.querySelectorAll('[data-board-world] [data-node-id]').length, transforms: [...document.querySelectorAll('*')].filter(e => { const t = getComputedStyle(e).transform; return t && t !== 'none'; }).length, zoom: document.querySelector('[data-board-world]')?.parentElement?.style.transform }));
  const L = layerStats();
  console.log(`${label.padEnd(26)} heap ${MB(m.heap)}MB · DOM ${dom.all} nodes (${m.nodes} live) · tiles ${dom.tiles} · listeners ${m.listeners} · transforms ${dom.transforms} · layers ${L.n} (${L.painted} painted, ${MB(L.bytes)}MB) · ${dom.zoom}`);
  return { ...m, ...dom, ...L };
}
await page.evaluate(() => {}).catch(() => {});
const t0 = Date.now();
await page.goto(`${APP}/jobs`);
await page.waitForSelector('[data-node-id="CE-bin-newjobs"]', { timeout: 60000 });
console.log(`load → board drawn: ${Date.now() - t0}ms`);
await page.waitForTimeout(3000);
// Long tasks + frame gaps, recorded for the whole session.
await page.evaluate(() => {
  window.__long = []; window.__gaps = []; window.__stop = false;
  new PerformanceObserver(list => { for (const e of list.getEntries()) window.__long.push({ at: e.startTime, ms: e.duration }); }).observe({ entryTypes: ['longtask'] });
  let last = performance.now(); const tick = t => { window.__gaps.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
});
const vp = await page.locator('[data-board-viewport]').boundingBox();
const cx = vp.x + vp.width / 2, cy = vp.y + vp.height / 2 + 60;
const first = await sample('after load');
const mark = async () => { const g = await page.evaluate(() => { const a = window.__gaps.splice(0); const l = window.__long.splice(0); return { worst: Math.max(0, ...a), over100: a.filter(x => x > 100).length, over500: a.filter(x => x > 500).length, long: l.length, longMax: Math.max(0, ...l.map(x => x.ms)), longSum: l.reduce((s, x) => s + x.ms, 0) }; }); return g; };
await mark();
const fmt = (g, secs, m0, m1) => `worst frame ${g.worst.toFixed(0)}ms · frames>100ms ${g.over100} · >500ms ${g.over500} · long tasks ${g.long} (max ${g.longMax.toFixed(0)}ms, ${g.longSum.toFixed(0)}ms total) · script ${((m1.script - m0.script) * 1000 / secs).toFixed(0)}ms/s · layout ${((m1.layout - m0.layout) * 1000 / secs).toFixed(0)}ms/s · style ${((m1.recalc - m0.recalc) * 1000 / secs).toFixed(0)}ms/s`;
async function cycle(i) {
  // 1. plain wheel: zoom out to the floor, then back in (cursor-anchored, the default binding)
  let m0 = await metric(); let s0 = Date.now();
  await page.mouse.move(cx, cy);
  for (let k = 0; k < 14; k++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(40); }
  await page.waitForTimeout(400);
  const zoomedOut = await sample(`cycle ${i} zoomed out`);
  let g = await mark(); let m1 = await metric();
  console.log(`   zoom out (14 ticks): ${fmt(g, (Date.now() - s0) / 1000, m0, m1)}`);
  m0 = await metric(); s0 = Date.now();
  for (let k = 0; k < 14; k++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(40); }
  await page.waitForTimeout(400);
  g = await mark(); m1 = await metric();
  console.log(`   zoom in  (14 ticks): ${fmt(g, (Date.now() - s0) / 1000, m0, m1)}`);
  // 2. shift+wheel sideways and middle-drag panning around the board
  m0 = await metric(); s0 = Date.now();
  await page.keyboard.down('Shift');
  for (let k = 0; k < 30; k++) { await page.mouse.wheel(0, k < 15 ? 200 : -200); await page.waitForTimeout(30); }
  await page.keyboard.up('Shift');
  await page.mouse.move(cx + 300, cy + 100); await page.mouse.down({ button: 'middle' });
  for (let k = 0; k < 60; k++) { await page.mouse.move(cx + 300 - k * 12, cy + 100 + Math.sin(k / 5) * 60); await page.waitForTimeout(16); }
  await page.mouse.up({ button: 'middle' });
  await page.mouse.move(cx - 300, cy + 100); await page.mouse.down({ button: 'middle' });
  for (let k = 0; k < 60; k++) { await page.mouse.move(cx - 300 + k * 12, cy + 100 - Math.sin(k / 5) * 60); await page.waitForTimeout(16); }
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(600);
  g = await mark(); m1 = await metric();
  console.log(`   pan (30 shift-wheel + 120 drag moves): ${fmt(g, (Date.now() - s0) / 1000, m0, m1)}`);
  return zoomedOut;
}
const zo = [];
for (let i = 1; i <= CYCLES; i++) zo.push(await cycle(i));
await page.waitForTimeout(1500);
const last = await sample('end of session');
// 3. idle 10s at the end — does it still burn CPU?
{ const m0 = await metric(); await page.waitForTimeout(10000); const m1 = await metric(); const g = await mark(); console.log(`idle 10s at the end: ${fmt(g, 10, m0, m1)}`); }
console.log('\n— growth over the session —');
console.log(`heap after GC: ${MB(first.heap)}MB → ${MB(last.heap)}MB  (zoomed-out samples: ${zo.map(z => MB(z.heap)).join(' → ')})`);
console.log(`DOM nodes: ${first.all} → ${last.all} (live ${first.nodes} → ${last.nodes}) · listeners ${first.listeners} → ${last.listeners}`);
console.log(`layers: ${first.n}/${MB(first.bytes)}MB → ${last.n}/${MB(last.bytes)}MB · zoomed-out layers ${zo.map(z => `${z.n}/${MB(z.bytes)}MB`).join(' · ')}`);
console.log('persist cost ms:', await page.evaluate(() => { const s = localStorage.getItem('general_app_data'); const t = performance.now(); JSON.stringify(JSON.parse(s)); return +(performance.now() - t).toFixed(1); }), '· stored KB:', await page.evaluate(() => Math.round((localStorage.getItem('general_app_data') || '').length / 1024)));
await page.evaluate(() => { window.__stop = true; });
await b.close();
