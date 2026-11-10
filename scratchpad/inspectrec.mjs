// The inspection camera's Video, recorded IN THE PAGE (owner, 2026-11-10: full quality with real sound), in real
// Google Chrome with its fake camera (a moving picture and a beep). Records ~4 s, stops, presses Done with Drive stubbed,
// and saves the bytes that would have gone up to OUT. Check the file with ffmpeg afterwards.
// Dev server: VITE_DRIVE_API_KEY=harness-key npx vite --port 5182 --strictPort.  PORT= OUT= dir.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { realisticWolfson, applySeed } from './seed.mjs';
const PORT = process.env.PORT || '5182';
const OUT = process.env.OUT || '/tmp/inspectrec';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
let ok = 0, bad = 0; const T = (c, m) => { c ? ok++ : bad++; console.log((c ? 'ok  ' : 'BAD ') + m); };
// seed.mjs reads the app's own generator from 5173 — send that to this harness's server.
const viaPort = {
  newContext: async o => {
    const c = await browser.newContext(o);
    await c.route(/^http:\/\/localhost:5173\//, r => r.continue({ url: r.request().url().replace('localhost:5173', `localhost:${PORT}`) }));
    return c;
  },
};
const blob = await realisticWolfson(viaPort);

const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, permissions: ['camera', 'microphone'] });
await applySeed(ctx, blob);
await ctx.addInitScript(() => {
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw); if (d.__rec) return; d.__rec = 1;
  d.currentUser = { ...(d.currentUser ?? {}), name: 'Tzvi' };
  d.backupDriveFolderLink = 'https://drive.google.com/drive/folders/GENERALFOLDER01';
  for (const a of d.apartments ?? []) if (a.id === 'A1-53') { a.driveLink = ''; a.inspections = []; }
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});
const uploaded = [];
let seq = 0;
await ctx.route('**/api/**', async r => {
  const u = r.request().url(); const b = r.request().postDataJSON?.() ?? {};
  if (u.includes('/api/drive-session')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ uploadUrl: `https://upload.harness.test/put?name=${encodeURIComponent(b.filename ?? b.name ?? 'film')}` }) });
  if (u.includes('/api/drive-upload') && b.data) {
    uploaded.push({ name: b.filename, type: b.mimeType, bytes: Buffer.from(b.data, 'base64') }); seq++;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: `V${seq}`, fileId: `V${seq}`, webViewLink: `https://drive.google.com/file/d/V${seq}/view` }) });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'F-x', folderId: 'F-x', files: [], ok: true }) });
});
await ctx.route('https://upload.harness.test/**', async r => {
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'PUT', 'access-control-allow-headers': '*' } });
  uploaded.push({ name: new URL(r.request().url()).searchParams.get('name'), type: r.request().headers()['content-type'], bytes: r.request().postDataBuffer() }); seq++;
  await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: `V${seq}`, webViewLink: `https://drive.google.com/file/d/V${seq}/view` }) });
});
const p = await ctx.newPage();
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto(`http://localhost:${PORT}/project`); await p.waitForTimeout(2500);
await p.locator('[data-view-switch-narrow] [data-view="board"], [data-view-switch] [data-view="board"]').first().click().catch(() => {}); await p.waitForTimeout(900);
await p.locator('[data-apt-id="A1-53"]').first().click(); await p.waitForTimeout(1500);
await p.locator('[data-inspect]').scrollIntoViewIfNeeded(); await p.locator('[data-inspect]').click(); await p.waitForTimeout(1200);
const cam = p.locator('[data-inspect-camera]');
T(await cam.count() === 1, 'the inspection camera opens');
await cam.locator('[data-camera-mode="video"]').click(); await p.waitForTimeout(1800);
const live = await p.evaluate(() => {
  const s = document.querySelector('[data-camera-view]')?.srcObject;
  return s ? { audio: s.getAudioTracks().map(t => t.getSettings()), video: s.getVideoTracks().map(t => { const x = t.getSettings(); return { width: x.width, height: x.height, frameRate: x.frameRate }; }) } : null;
});
console.log('stream:', JSON.stringify(live));
T(!!live && live.audio.length === 1, 'Video asks for the microphone with the camera');
T(!!live && live.audio[0] && live.audio[0].echoCancellation === false && live.audio[0].noiseSuppression === false && live.audio[0].autoGainControl === false, 'the microphone runs raw (no echo cancelling, noise suppression or auto gain)');

// The shutter must RECORD here, not open the phone's picker.
let chooser = false; p.on('filechooser', () => { chooser = true; });
await cam.locator('[data-camera-shutter]').click();
await p.waitForTimeout(600);
T(!chooser, 'the shutter records in the page (no file box opened)');
T(/●\s*0:0/.test(await cam.innerText()), 'the red recording badge with the seconds shows');
await p.waitForTimeout(4000);
T(await cam.locator('[data-camera-done]').isDisabled(), 'Done waits while recording');
await cam.locator('[data-camera-shutter]').click();
for (let i = 0; i < 40 && !(await cam.locator('[data-camera-strip] > div').count()); i++) await p.waitForTimeout(150);
T(await cam.locator('[data-camera-strip] > div').count() === 1, 'the film lands in the strip');
await cam.locator('[data-camera-done]').click();
for (let i = 0; i < 80 && !uploaded.length; i++) await p.waitForTimeout(200);
T(uploaded.length === 1, `one film went up (${uploaded.length})`);
for (const f of uploaded) {
  const path = `${OUT}/${f.name || 'film.bin'}`;
  writeFileSync(path, f.bytes);
  console.log('saved', path, f.type, f.bytes.length, 'bytes');
  T(/^video-.*\.(mp4|webm)$/.test(f.name ?? ''), `named video-<time>.mp4/webm (${f.name})`);
}
await ctx.close();

// The fallback: a browser that refuses the microphone still films — the shutter opens the phone's own camera.
const ctx2 = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, permissions: ['camera'] });
await applySeed(ctx2, blob);
await ctx2.addInitScript(() => {
  const raw = localStorage.getItem('wolfson_app_data'); if (!raw) return;
  const d = JSON.parse(raw); if (d.__rec) return; d.__rec = 1;
  d.currentUser = { ...(d.currentUser ?? {}), name: 'Tzvi' };
  localStorage.setItem('wolfson_app_data', JSON.stringify(d));
});
await ctx2.addInitScript(() => {
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = c => (c && c.audio ? Promise.reject(new DOMException('no mic', 'NotAllowedError')) : real(c));
});
await ctx2.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"files":[],"ok":true}' }));
const p2 = await ctx2.newPage();
await p2.goto(`http://localhost:${PORT}/project`); await p2.waitForTimeout(2500);
await p2.locator('[data-view-switch-narrow] [data-view="board"], [data-view-switch] [data-view="board"]').first().click().catch(() => {}); await p2.waitForTimeout(900);
await p2.locator('[data-apt-id="A1-53"]').first().click(); await p2.waitForTimeout(1500);
await p2.locator('[data-inspect]').scrollIntoViewIfNeeded(); await p2.locator('[data-inspect]').click(); await p2.waitForTimeout(1200);
const cam2 = p2.locator('[data-inspect-camera]');
await cam2.locator('[data-camera-mode="video"]').click(); await p2.waitForTimeout(1500);
T(!(await cam2.locator('[data-camera-failed]').count()), 'without the microphone the viewfinder still runs');
const [ch] = await Promise.all([p2.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null), cam2.locator('[data-camera-shutter]').click()]);
T(!!ch && await ch.element().evaluate(e => e.getAttribute('accept') === 'video/*'), "without the microphone the shutter opens the phone's own video camera");
await ctx2.close();
console.log(`\n${ok} ok · ${bad} bad`);
await browser.close();
