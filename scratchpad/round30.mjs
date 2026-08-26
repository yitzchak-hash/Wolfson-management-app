// Round 30 — the 15-18 prompt round's build:
//   TikTok: full screen with a tap ladder, sound that never restarts the
//   video, and a big manager popup with preview tiles + hide/remove.
//   Google Photos album widget: cover picture, Photos mark, honest unshared.
//   Layout history: automatic snapshots in their own slots, ⓘ tooltips
//   instead of standing paragraphs, make-room undoable, touch exit-fullscreen.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

// A 1x1 green PNG for stubbed thumbnails/covers.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [],
    apartments: [{
      id: 'G-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Alpha',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 400, canvasY: 360,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [
      { id: 'CE-tk', type: 'widget', widget: 'tiktok', x: 400, y: 560, w: 280, h: 420, text: '', color: '#ffffff',
        data: { links: 'https://www.tiktok.com/@a/video/7000000000000000001\nhttps://www.tiktok.com/@b/video/7000000000000000002', autoplay: '', auto: false } },
      { id: 'CE-ph', type: 'widget', widget: 'photos-album', x: 760, y: 560, w: 250, h: 200, text: '', color: '#ffffff',
        data: { album: 'https://photos.app.goo.gl/shared1' } },
      { id: 'CE-ph2', type: 'widget', widget: 'photos-album', x: 1060, y: 560, w: 250, h: 200, text: '', color: '#ffffff',
        data: { album: 'https://photos.app.goo.gl/nope' } },
      { id: 'CE-bin-done', type: 'bin', binKind: 'done', x: 2100, y: 24, w: 180, h: 112, text: 'Done', color: '#16a34a' },
      { id: 'CE-bin-ready', type: 'bin', binKind: 'ready', x: 2100, y: 154, w: 180, h: 112, text: 'Ready', color: '#0ea5e9' },
      { id: 'CE-bin-archive', type: 'bin', binKind: 'archive', x: 2100, y: 284, w: 180, h: 112, text: 'Archive', color: '#64748b' },
      { id: 'CE-bin-trash', type: 'bin', binKind: 'trash', x: 2100, y: 414, w: 180, h: 112, text: 'Trash', color: '#dc2626' },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => {
  // The container has no internet, so the tiktok.com player iframe is served
  // the egress proxy's error page — whose own script trips on localStorage in
  // the sandboxed frame. Third-party noise, not the app; everything else counts.
  if (/localStorage.*Access is denied/.test(e.message)) return;
  console.log('PAGE ERROR', e.message); fails++;
});

await page.route('**/api/tiktok', route => {
  const req = JSON.parse(route.request().postData() || '{}');
  route.fulfill({ json: {
    videoId: '700000000000000000' + (req.url.at(-1) || '9'),
    url: req.url, title: 'Clip ' + (req.url.at(-1) || '?'), author: 'crew', thumbnail: PNG,
  } });
});
await page.route('**/api/photos-cover', route => {
  const req = JSON.parse(route.request().postData() || '{}');
  if (/nope/.test(req.url)) route.fulfill({ json: { shared: false } });
  else route.fulfill({ json: { shared: true, cover: PNG, title: 'Roof photos' } });
});

await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3200);

const tk = page.locator('[data-node-id="CE-tk"]');

// ── 1 · TikTok: the frame survives the sound button (no more restart) ───────
check(await tk.locator('[data-tiktok-fullscreen]').count() === 1, 'the TikTok widget has a full-screen button');
await page.evaluate(() => {
  const f = document.querySelector('[data-node-id="CE-tk"] iframe');
  if (f) f.__mark = 'alive';
});
await tk.locator('button[title="Turn the sound on"]').click();
await page.waitForTimeout(600);
const soundKept = await page.evaluate(() => {
  const f = document.querySelector('[data-node-id="CE-tk"] iframe');
  return f ? f.__mark === 'alive' : 'no-frame';
});
check(soundKept === true, 'turning the sound on does NOT remount the player frame', String(soundKept));

// ── 2 · the big manager popup ───────────────────────────────────────────────
await tk.locator('[data-tiktok-manage]').click();
await page.waitForTimeout(1200);
check(await page.locator('[data-tiktok-manager]').count() === 1, 'the sliders button opens the big manager');
const mgrBox = await page.locator('[data-tiktok-manager] > div:last-child').boundingBox();
check(mgrBox && mgrBox.width > 1000 && mgrBox.height > 700,
  'the manager covers most of the screen', mgrBox ? `${Math.round(mgrBox.width)}×${Math.round(mgrBox.height)}` : 'none');
check(await page.locator('[data-tiktok-tile]').count() === 2, 'one tile per pasted link');
check(await page.locator('[data-tiktok-tile] img').count() === 2, 'every tile wears its preview picture');

// Hide the first — the link stays, the reel skips it.
await page.locator('[data-tiktok-tile-hide]').first().click();
await page.waitForTimeout(700);
check((await page.locator('[data-tiktok-tile]').first().textContent() || '').includes('hidden'),
  'a hidden tile says so and stays in the list');
// Remove the second outright.
await page.locator('[data-tiktok-tile-remove]').nth(1).click();
await page.waitForTimeout(700);
check(await page.locator('[data-tiktok-tile]').count() === 1, 'remove takes the link out');
// Paste a third through the manager.
await page.locator('[data-tiktok-manager-paste]').fill('https://www.tiktok.com/@c/video/7000000000000000003');
await page.locator('[data-tiktok-manager-add]').click();
await page.waitForTimeout(700);
check(await page.locator('[data-tiktok-tile]').count() === 2, 'pasting in the manager adds a tile');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
check(await page.locator('[data-tiktok-manager]').count() === 0, 'Escape closes the manager (and only it)');
// The reel's count reflects hidden: 2 links live, 1 hidden → “…/1”.
const tkTitle = await tk.textContent();
check(/\/\s*1/.test((tkTitle || '').replace(/\s+/g, ' ')), 'the reel skips the hidden video', (tkTitle || '').slice(0, 40));

// ── 3 · full screen + the tap ladder ────────────────────────────────────────
await tk.locator('[data-tiktok-fullscreen]').click();
await page.waitForTimeout(900);
const fsNow = await page.evaluate(() => !!document.fullscreenElement
  && !!document.fullscreenElement.matches('[data-tiktok-root]'));
check(fsNow, 'the button really goes full screen, on the reel\'s own root');
if (fsNow) {
  check(await page.locator('[data-tiktok-controls]').count() === 0, 'in full screen the chrome starts hidden');
  check(await page.locator('[data-tiktok-exit]').count() === 1, 'the way out is always visible');
  await page.locator('[data-tiktok-tap]').click({ position: { x: 200, y: 300 } });
  await page.waitForTimeout(500);
  check(await page.locator('[data-tiktok-controls]').count() === 1, 'first tap brings the controls back');
  await page.locator('[data-tiktok-exit]').click();
  await page.waitForTimeout(700);
  check(await page.evaluate(() => !document.fullscreenElement), 'the × leaves full screen');
}

// ── 4 · Google Photos ───────────────────────────────────────────────────────
const ph = page.locator('[data-node-id="CE-ph"]');
await page.waitForTimeout(800);
check(await ph.locator('[data-photos-cover] img').count() === 1, 'a shared album wears its cover picture');
check(await ph.locator('[data-photos-mark]').count() === 1, 'with the Photos mark on it');
check((await ph.locator('[data-photos-cover]').getAttribute('href')) === 'https://photos.app.goo.gl/shared1',
  'and the picture is a link to the album');
check((await ph.textContent() || '').includes('Roof photos'), 'the album\'s own name is on it');
const ph2 = page.locator('[data-node-id="CE-ph2"]');
check(await ph2.locator('[data-photos-unshared]').count() === 1
  && (await ph2.textContent() || '').includes("isn't shared"),
  'an unshared album says so in words, with what to press');

// ── 5 · board settings: tooltips, not paragraphs ────────────────────────────
await page.locator('button[title="Board settings"]').click();
await page.waitForTimeout(500);
const settingsText = await page.evaluate(() => {
  const p = document.querySelector('[data-panel-id="board-controls"]') ||
    [...document.querySelectorAll('div')].find(d => d.textContent?.includes('Let the board grow') && d.querySelector('input[type="checkbox"]'));
  return p ? p.textContent : '';
});
check(!/scrolls up and down like an ordinary page/.test(settingsText)
  && !/margins on a page/.test(settingsText),
  'the settings panel no longer carries its explainers as standing text');
check(await page.locator('.cursor-help').count() >= 4, 'the explanations moved into ⓘ tooltips',
  String(await page.locator('.cursor-help').count()));

// ── 6 · make room is undoable ───────────────────────────────────────────────
const storedY = () => page.evaluate(() =>
  JSON.parse(localStorage.getItem('general_app_data')).apartments[0].canvasY);
const yBefore = await storedY();
await page.locator('button', { hasText: /^Room above$/ }).click();
await page.waitForTimeout(900);
const yAfter = await storedY();
check(yAfter > yBefore, 'Room above moves the work down', `${yBefore} → ${yAfter}`);
await page.keyboard.press('Control+z');
await page.waitForTimeout(800);
check(await storedY() === yBefore, 'and Ctrl+Z closes the room back up', String(await storedY()));

// ── 7 · automatic layout snapshots ──────────────────────────────────────────
await page.locator('button', { hasText: /Layout history/ }).click();
await page.waitForTimeout(500);
const histText = await page.evaluate(() => {
  const t = [...document.querySelectorAll('span')].find(s => s.textContent === 'LAYOUT HISTORY');
  return t ? t.closest('[class*="rounded-xl"]').textContent : '';
});
check(!/Snapshots record where things sit/.test(histText),
  'the layout panel\'s paragraph became a tooltip too');
await page.locator('[data-auto-layout]').selectOption('hourly');
await page.waitForTimeout(1200);
check(await page.locator('[data-layout-auto-tag]').count() === 1,
  'switching on hourly takes the first snapshot at once, tagged auto');
await page.locator('button', { hasText: /^Save this arrangement$/ }).click();
await page.waitForTimeout(700);
const layouts = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('general_app_data')).boardLayouts?.general ?? []);
check(layouts.filter(l => l.auto).length === 1 && layouts.filter(l => !l.auto).length === 1,
  'the clock\'s snapshot and the hand\'s live side by side, in separate counts',
  `${layouts.filter(l => l.auto).length} auto / ${layouts.filter(l => !l.auto).length} manual`);

// ── 8 · touch screens keep a visible way out of full screen ─────────────────
const exitBtnHidden = await page.evaluate(() => {
  const probe = document.createElement('div');
  probe.className = 'touch-show';
  document.body.appendChild(probe);
  const d = getComputedStyle(probe).display;
  probe.remove();
  return d;
});
check(exitBtnHidden === 'none', 'with a mouse present the touch exit stays hidden', exitBtnHidden);
await page.locator('button[title="Board full screen"]').click();
await page.waitForTimeout(800);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await page.waitForTimeout(600);
const touchExit = await page.evaluate(() => {
  const btn = document.querySelector('[data-touch-exit-fullscreen]');
  return btn ? getComputedStyle(btn).display : 'missing';
});
check(touchExit === 'flex', 'on a touch screen the exit-full-screen button is always visible', touchExit);
await page.evaluate(() => { const b = document.querySelector('[data-touch-exit-fullscreen]'); b && b.click(); });
await page.waitForTimeout(700);
check(await page.evaluate(() => !document.fullscreenElement), 'and pressing it leaves full screen');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await b.close();
process.exit(fails ? 1 : 0);
