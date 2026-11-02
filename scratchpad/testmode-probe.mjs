// "Test as him" (owner, 2026-11-01): /c/<token>?test=1 — his real portal with
// the real data (read from the cloud), and NOTHING saved: start a task, close
// it, add a picture, Send — the cloud has no new task, no picture, no mark.
// Needs the Firestore emulator on 8085 and the emulator-wired server on 5176.
import { chromium } from 'playwright';
import { sendLocked, sendReady, waitReady } from './wiz.mjs';
import { encodeValue } from '../lib/fullRestore.js';
const APP = process.env.APP_EMU || 'http://localhost:5176';
const BASE = 'http://127.0.0.1:8085/v1/projects/demo-patch/databases/(default)/documents';
let fails = 0;
const check = (ok, l, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${x ? ' — ' + x : ''}`); if (!ok) fails++; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-patch/databases/(default)/documents', { method: 'DELETE' });
const put = (path, obj) => ({ update: { name: `projects/demo-patch/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, encodeValue(v)])) } });
const at = '2026-01-01T00:00:00Z';
const writes = [
  put('stages/skhtatb', { id: 'skhtatb', name: 'Sold', color: '#64748b', order: 1, active: true, kind: 'work', createdAt: at, updatedAt: at }),
  put('stages/s-drilling', { id: 's-drilling', name: 'Drilling & Piping', color: '#0891b2', order: 2, active: true, kind: 'work', trade: 'ac', createdAt: at, updatedAt: at }),
  put('stages/s1-fans', { id: 's1-fans', name: 'Fans', color: '#eab308', order: 6, active: true, kind: 'work', trade: 'ac', createdAt: at, updatedAt: at }),
  put('contractors/C-w', { id: 'C-w', name: 'Worker', category: 'ac', token: 'tok-test', active: true, createdAt: at, lang: 'en', perms: { workHere: true, seeDiagrams: true, seeAllApartments: true } }),
  put('apartments/A1-12', { id: 'A1-12', buildingId: 'A1', floor: 4, apartmentNumber: '12', displayName: 'Lerner', isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, bubbles: true, stageMarks: { skhtatb: 'done' }, driveLink: 'https://drive.google.com/drive/folders/FLATFOLDER01', createdAt: at, updatedAt: at, updatedBy: 'U', updatedByName: 'U' }),
];
const r0 = await fetch(`${BASE}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ writes }) });
check(r0.ok, 'the cloud has the worker and the flat', String(r0.status));
const count = async c => ((await (await fetch(`${BASE}/${c}`, { headers: { Authorization: 'Bearer owner' } })).json()).documents ?? []).length;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const api = [];
await ctx.route('**/api/**', r => { api.push(r.request().url().replace(/^.*\/api\//, '/api/')); r.fulfill({ json: {} }); });
const page = await ctx.newPage();
page.on('pageerror', e => { if (!/localStorage/.test(e.message)) { console.log('PAGE ERROR', e.message.slice(0, 200)); fails++; } });
await page.goto(`${APP}/c/tok-test?test=1`); await page.waitForTimeout(4000);
check(await page.locator('[data-test-bar]').count() === 1 && /Nothing you do here is saved/.test(await page.locator('[data-test-bar]').innerText()), 'the test bar says nothing is saved');
for (let i = 0; i < 30 && !/Worker/.test(await page.evaluate(() => document.body.innerText)); i++) await page.waitForTimeout(200);
check(/Worker/.test(await page.evaluate(() => document.body.innerText)), 'his own portal opens, read from the cloud');
await page.evaluate(() => [...document.querySelectorAll('button')].find(x => /Map/.test((x.textContent || '').trim()))?.click());
await page.waitForTimeout(500);
for (let i = 0; i < 30 && !(await page.locator('button:has-text("Wolfson Residence")').count()); i++) await page.waitForTimeout(150);
await page.locator('button:has-text("Wolfson Residence")').first().click();
for (let i = 0; i < 60 && !(await page.locator('[data-apt-id="A1-12"]').count()); i++) await page.waitForTimeout(150);
await page.locator('[data-apt-id="A1-12"]').first().click(); await page.waitForTimeout(500);
await page.locator('[data-work-here]').click(); await page.waitForTimeout(800);
for (let i = 0; i < 30 && !(await page.locator('[data-close-job]').count()); i++) await page.waitForTimeout(150);
check(await page.locator('[data-close-job]').count() >= 1, 'he can start work — the task opens on screen');
await page.locator('[data-close-job]').first().click(); await page.waitForTimeout(600);
await page.locator('[data-close-pick-stage="s-drilling"]').click();
await page.locator('[data-close-next="pick"]').click(); await page.waitForTimeout(300);
// "No" → coming back tomorrow: that books the flat on a new day — which test mode must not save either.
await page.locator('[data-close-finished-pick="no"]').click(); await page.waitForTimeout(300);
await page.locator('[data-close-back="tomorrow"]').click();
await page.locator('[data-close-next="left"]').click(); await page.waitForTimeout(300);
await page.locator('input[type="file"][accept*="video"][accept*=".zip"]').first().setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: PNG }]);
check(await waitReady(page), 'the picture goes in and Send unlocks');
await page.locator('[data-close-now]').click(); await page.waitForTimeout(2500);
check(await count('contractorAssignments') === 0, 'the cloud has NO task');
check(await count('contractorPhotos') === 0, 'and NO picture');
const apt = await (await fetch(`${BASE}/apartments/A1-12`, { headers: { Authorization: 'Bearer owner' } })).json();
check(!apt.fields.stageMarks.mapValue.fields['s-drilling'], 'and the flat\'s stages are untouched');
check(!api.some(u => /drive-upload|drive-session|folder/.test(u)), 'nothing was sent to Drive', JSON.stringify(api));
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
