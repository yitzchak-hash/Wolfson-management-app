// PROOF: an OLD one-workspace backup file opens in the preview on its own workspace, the Restore
// question names exactly what it does, and the press sends the restore and shows the result.
// Run: cd scratchpad && NODE_PATH=/opt/node-tools/node_modules node preview-oldfile-test.mjs <old-backup.json> (never committed)
import { createRequire } from 'module'; import { readFileSync } from 'fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const body = readFileSync(process.argv[2]);
const b = await chromium.launch(); const ctx = await b.newContext();
await ctx.addInitScript(() => { if (!localStorage.getItem('wolfson_app_data')) localStorage.setItem('wolfson_app_data', JSON.stringify({ currentUser: { id: 'U', name: 'Tzvi', role: 'Boss', active: true } })); });
await ctx.route('**/api/drive-fetch**', r => r.fulfill({ status: 200, body, headers: { 'content-type': 'application/json' } }));
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 100)));
await p.goto('http://localhost:5176/?previewBackup=OLDFILE1'); await p.waitForFunction(() => !!window.__store?.getState().currentUser, null, { timeout: 30000 }); await p.waitForTimeout(3000);
const st = await p.evaluate(() => { const s = window.__store.getState(); return { pid: s.currentProjectId, apts: s.apartments.length, staged: s.apartments.filter(a => a.currentStageId).length }; });
const bar = (await p.textContent('body')).match(/Preview of the backup from[^·]*· [^·]+·/)?.[0];
await p.click('text=Restore this backup'); await p.waitForTimeout(500);
const ask = (await p.textContent('[role=dialog]')).replace(/\s+/g, ' ').slice(0, 260);
let sent = null;
await ctx.route('**/api/drive-upload', async r => { sent = JSON.parse(r.request().postData() || '{}'); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, put: 983, removed: 3, safetyBackup: 'tzviair-full-backup-2026-10-29T15-00-00Z.json.gz' }) }); });
await p.click('text=Restore Wolfson only'); await p.waitForTimeout(1500);
const done = (await p.textContent('[role=dialog]')).replace(/\s+/g, ' ');
console.log(JSON.stringify(st), '|', bar, '\n', ask, '\n sent:', JSON.stringify({ mode: sent?.mode, fileId: sent?.fileId }), '\n after:', done.slice(0, 220), '\n errors:', errs.length);
await b.close();
