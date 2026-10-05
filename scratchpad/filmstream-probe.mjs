// A Drive film STREAMS (owner, 2026-10-05: a 51-second site film sat black for
// nine seconds in the viewer — "it takes forever"). The viewer must play a
// Drive-only film straight from GET /api/drive-fetch?id=…&k=… with Range
// requests — no whole-file POST download first — and fall back to that
// download only when the stream is refused.
//
// Runs against a KEYED dev server on 5174 (the Drive block is dead without a
// key): VITE_DRIVE_API_KEY=testkey npx vite --port 5174. The film is a real
// WebM made with ffmpeg (Playwright's Chromium has no H.264). Every /api route
// is stubbed — the catch-all FIRST, because Playwright consults routes
// newest-first.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = process.env.APP ?? 'http://localhost:5174';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const dir = mkdtempSync(join(tmpdir(), 'film-'));
const file = join(dir, 'film.webm');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=6:size=320x240:rate=24',
  '-c:v', 'libvpx', '-b:v', '600k', file]);
const FILM = readFileSync(file);

const FOLDER = 'application/vnd.google-apps.folder';
const LISTING = {
  'F-root': [
    { id: 'VID1', name: 'site film.webm', mimeType: 'video/webm' },
    { id: 'VID2', name: 'second film.webm', mimeType: 'video/webm' },
  ],
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const seen = [];
await ctx.route('**/api/**', route => route.fulfill({ json: {} }));
await ctx.route('**/api/drive-files', route => {
  const body = route.request().postDataJSON();
  if (body.metaOnly) return route.fulfill({ json: { folder: { id: body.folderId, name: 'Film, Family - 1', mimeType: FOLDER }, files: [] } });
  return route.fulfill({ json: { files: LISTING[body.folderId] ?? [] } });
});
await ctx.route('**/api/drive-fetch**', route => {
  const req = route.request();
  const url = new URL(req.url());
  const range = req.headers()['range'] ?? '';
  seen.push({ method: req.method(), id: url.searchParams.get('id') ?? req.postDataJSON?.()?.fileId, key: url.searchParams.get('k'), range });
  if (req.method() === 'GET') {
    // The second film's stream is refused — the viewer must fall back to the download.
    if (url.searchParams.get('id') === 'VID2') return route.fulfill({ status: 500, json: { error: 'refused' } });
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    if (m) {
      const a = Number(m[1]); const z = m[2] ? Math.min(Number(m[2]), FILM.length - 1) : FILM.length - 1;
      return route.fulfill({ status: 206, body: FILM.subarray(a, z + 1), headers: {
        'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${a}-${z}/${FILM.length}`, 'Content-Length': String(z - a + 1) } });
    }
    return route.fulfill({ status: 200, body: FILM, headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes' } });
  }
  return route.fulfill({ status: 200, body: FILM, headers: { 'Content-Type': 'video/webm' } });
});
await ctx.route('**/api/share', route => route.fulfill({ json: { ok: true } }));
await ctx.route('**drive.google.com/**', route => route.abort());
await ctx.route('**fonts.googleapis.com/**', route => route.abort());

await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    apartments: [{
      id: 'G-film', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Film, Family',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 300, canvasY: 190,
      driveLink: 'https://drive.google.com/drive/folders/F-root',
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [],
  }));
});

const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2500);
await page.locator('[data-node-id="G-film"]').dblclick();
await page.locator('[data-file-tile="VID1"]').waitFor({ state: 'visible', timeout: 15000 });
// The window ignores presses for its first 400 ms (the gesture that opened it).
await page.waitForTimeout(900);

// ── 1 · the film plays from the stream, no whole-file download ───────────
const t0 = Date.now();
await page.locator('[data-file-tile="VID1"]').click({ position: { x: 20, y: 30 } });
await page.locator('[data-viewer-video]').waitFor({ state: 'attached', timeout: 8000 });
const src = await page.locator('[data-viewer-video]').getAttribute('src');
check(src?.startsWith('/api/drive-fetch?id=VID1&k=testkey'), 'the viewer plays the film from the stream address', src ?? '');
const ready = await page.waitForFunction(() => {
  const v = document.querySelector('[data-viewer-video]');
  return v && v.readyState >= 2;
}, null, { timeout: 10000 }).then(() => true, () => false);
check(ready, 'the film has frames to show', `${Date.now() - t0} ms`);
check(seen.some(r => r.method === 'GET' && r.id === 'VID1' && r.range), 'it asked for a RANGE of the file', JSON.stringify(seen.filter(r => r.id === 'VID1')));
check(!seen.some(r => r.method === 'POST'), 'and never downloaded the whole file first');

// ── 2 · a refused stream falls back to the download ───────────────────────
// The browser sorts by name, so "second film" sits BEFORE "site film".
await page.keyboard.press('ArrowLeft');
const fell = await page.waitForFunction(() => {
  const v = document.querySelector('[data-viewer-video]');
  return v && (v.getAttribute('src') || '').startsWith('blob:') && v.readyState >= 1;
}, null, { timeout: 15000 }).then(() => true, () => false);
check(fell, 'a refused stream falls back to the whole-file download, and still plays');
check(seen.some(r => r.method === 'POST'), 'the fallback is the old POST download');

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
