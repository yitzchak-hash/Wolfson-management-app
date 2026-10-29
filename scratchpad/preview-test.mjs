// PROOF of the backup preview (previewMode.ts), on a real full-backup file passed as the argument
// (never committed). Needs the dev server on 5176. Run:
//   cd scratchpad && NODE_PATH=/opt/node-tools/node_modules node preview-test.mjs <backup.json.gz>
import { createRequire } from 'module';
import { readFileSync } from 'fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const gz = readFileSync(process.argv[2]);
import zlib from 'zlib';
const bk = JSON.parse(zlib.gunzipSync(gz).toString());
const WANT = { marks: bk.collections.apartments.filter(d => Object.keys(d.fields.stageMarks?.mapValue?.fields ?? {}).length).length,
  staged: bk.collections.apartments.filter(d => d.fields.currentStageId?.stringValue).length };
console.log('backup has', JSON.stringify(WANT));
let fails = 0; const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
const user = { id: 'U', name: 'Office', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
await ctx.addInitScript(u => { if (!localStorage.getItem('wolfson_app_data')) { localStorage.setItem('wolfson_app_data', JSON.stringify({ currentUser: u })); localStorage.setItem('wolfson_app_version', '3'); localStorage.setItem('mine', 'keep'); } }, user);
let cloudCalls = 0, blocked = 0;
await ctx.route('**/api/drive-fetch**', r => (r.request().url().includes('id=FILE123') ? r.fulfill({ status: 200, body: gz, headers: { 'content-type': 'application/gzip' } }) : r.fulfill({ status: 404, body: '' })));
ctx.on('request', r => { if (r.url().includes(':8085')) cloudCalls++; });
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', e => { if (/no supported source/.test(e.message)) { console.log('  (media, file not served in the test:', (e.stack || '').split('\n').slice(1, 3).join(' / ').slice(0, 200), ')'); return; } errs.push(e.message.slice(0, 150)); });
await p.goto('http://localhost:5176/?previewBackup=FILE123');
await p.waitForFunction(() => window.__store?.getState().currentUser, null, { timeout: 30000 });
await p.waitForTimeout(3000);
const bar = await p.textContent('body');
check(/Preview of the backup from/.test(bar), 'the preview bar is showing');
const g = await p.evaluate(() => { const s = window.__store.getState(); return { pid: s.currentProjectId, apts: s.apartments.length, els: s.canvasElements.length, url: location.pathname }; });
check(g.pid === 'general' && g.apts > 3000 && g.els > 50, 'the Job Board opened from the backup, whole', JSON.stringify(g));
await p.evaluate(() => window.__store.getState().setCurrentProject('wolfson'));
await p.waitForTimeout(1500);
const w = await p.evaluate(() => { const s = window.__store.getState(); return { pid: s.currentProjectId, apts: s.apartments.length, marks: s.apartments.filter(a => Object.keys(a.stageMarks ?? {}).length).length, staged: s.apartments.filter(a => a.currentStageId).length }; });
check(w.pid === 'wolfson' && w.apts >= 258 && w.marks === WANT.marks && w.staged === WANT.staged, 'Wolfson opened from the backup with its ticks', JSON.stringify(w));
await p.goto('http://localhost:5176/project'); await p.waitForTimeout(2500);
check(/Preview of the backup from/.test(await p.textContent('body')), 'after moving to another page and reloading, it is STILL a preview');
// try to change something: it must stay in the tab
await p.evaluate(() => { const s = window.__store.getState(); s.updateApartment(s.apartments[0].id, { generalNotes: 'PREVIEW EDIT' }, s.currentUser); });
await p.waitForTimeout(2000);
const tried = await p.evaluate(async () => (await fetch('/api/drive-upload', { method: 'POST', body: '{}' })).status);
check(tried === 403, 'a request that would change something on the server is refused', String(tried));
check(cloudCalls === 0, 'the preview never contacted the cloud database', String(cloudCalls));
const p2 = await ctx.newPage(); await p2.goto('http://localhost:5176/login'); await p2.waitForTimeout(1500);
const real = await p2.evaluate(() => ({ keys: Object.keys(localStorage).sort(), w: JSON.parse(localStorage.getItem('wolfson_app_data') || '{}') }));
check(!real.keys.includes('general_app_data') && !(real.w.apartments ?? []).some(a => a.generalNotes === 'PREVIEW EDIT') && real.keys.includes('mine'),
  'this computer\'s own saved copy was not touched', real.keys.join(','));
check(errs.length === 0, 'no page errors', errs.slice(0, 2).join(' | '));
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
