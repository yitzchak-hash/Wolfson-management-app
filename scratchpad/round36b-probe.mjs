// The mid-round trio: the TikTok volume slider (honest — mute/unmute is all
// the player takes from outside), the full-screen controls scaling up on a
// big screen, and the wall clock pinned to Israel time on a panel that
// thinks it is somewhere else.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
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
    apartments: [],
    canvasElements: [
      { id: 'CE-tk', type: 'widget', widget: 'tiktok', x: 400, y: 360, w: 280, h: 420, text: '', color: '#ffffff',
        data: { links: 'https://www.tiktok.com/@a/video/7000000000000000001', autoplay: '', auto: false } },
      { id: 'CE-clk', type: 'widget', widget: 'clock', x: 760, y: 360, w: 190, h: 110, text: '', color: '#ffffff', data: {} },
      { id: 'CE-bin-done', type: 'bin', binKind: 'done', x: 2100, y: 24, w: 180, h: 112, text: 'Done', color: '#16a34a' },
      { id: 'CE-bin-ready', type: 'bin', binKind: 'ready', x: 2100, y: 154, w: 180, h: 112, text: 'Ready', color: '#0ea5e9' },
      { id: 'CE-bin-archive', type: 'bin', binKind: 'archive', x: 2100, y: 284, w: 180, h: 112, text: 'Archive', color: '#64748b' },
      { id: 'CE-bin-trash', type: 'bin', binKind: 'trash', x: 2100, y: 414, w: 180, h: 112, text: 'Trash', color: '#dc2626' },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => {
  if (/localStorage.*Access is denied/.test(e.message)) return;   // the proxy's error page inside the player iframe
  console.log('PAGE ERROR', e.message); fails++;
});
await page.route('**/api/tiktok', route => route.fulfill({ json: {
  videoId: '7000000000000000001', url: 'x', title: 'Clip', author: 'crew', thumbnail: PNG,
} }));

// The panel THINKS it is in New York — the clock must still show Israel.
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' });

await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3200);

// ── the clock ─────────────────────────────────────────────────────────────
const clockText = await page.evaluate(() =>
  document.querySelector('[data-node-id="CE-clk"]')?.textContent ?? '');
const m = /(\d{1,2}):(\d{2})(?:\s*([AP]M))?/i.exec(clockText);
let shownMin = null;
if (m) {
  let h = +m[1] % 12;
  if (m[3]?.toUpperCase() === 'PM') h += 12;
  if (!m[3]) h = +m[1];
  shownMin = h * 60 + +m[2];
}
const il = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false });
const ilMin = +il.slice(0, 2) * 60 + +il.slice(3, 5);
const ny = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
const diff = shownMin == null ? 9999 : Math.min(Math.abs(shownMin - ilMin), 1440 - Math.abs(shownMin - ilMin));
check(diff <= 2, 'the clock shows ISRAEL time on a panel that thinks it is in New York',
  `shows ${m?.[0] ?? '??'} · Israel ${il} · the panel's own zone says ${ny}`);

// ── the volume slider ─────────────────────────────────────────────────────
const tk = page.locator('[data-node-id="CE-tk"]');
check(await tk.locator('[data-tiktok-volume]').count() === 1, 'the pill carries a volume slider');
const setVol = v => page.evaluate(val => {
  const el = document.querySelector('[data-tiktok-volume]');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
}, v);
const soundColor = () => page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Turn the sound/.test(x.title));
  return b ? getComputedStyle(b).color : null;
});
await setVol(60);
await page.waitForTimeout(300);
check(await soundColor() === 'rgb(236, 72, 153)', 'sliding above 0 turns the sound ON (pink)', `${await soundColor()}`);
await setVol(0);
await page.waitForTimeout(300);
check(await soundColor() === 'rgb(148, 163, 184)', 'sliding to 0 silences (grey)', `${await soundColor()}`);
await setVol(45);
await page.waitForTimeout(700);
const kept = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  return (d.canvasElements ?? []).find(e => e.id === 'CE-tk')?.data?.volume;
});
check(kept === 45, 'the number is remembered on the node', `${kept}`);

// ── full screen: the controls scale up ────────────────────────────────────
await tk.locator('[data-tiktok-fullscreen]').click();
await page.waitForTimeout(900);
const inFull = await page.evaluate(() => !!document.fullscreenElement?.matches('[data-tiktok-root]'));
check(inFull, 'the reel goes full screen');
if (inFull) {
  const exitZoom = await page.evaluate(() =>
    +getComputedStyle(document.querySelector('[data-tiktok-exit]')).zoom || 1);
  // 1440×900 viewport → min(1440,900)/420 ≈ 2.14
  check(Math.abs(exitZoom - 900 / 420) < 0.08, 'the exit × scales to the screen', `zoom ${exitZoom.toFixed(2)}`);
  await page.locator('[data-tiktok-tap]').click();   // first tap: bring the pill back
  await page.waitForTimeout(500);
  const pillZoom = await page.evaluate(() => {
    const el = document.querySelector('[data-tiktok-controls]');
    return el ? +getComputedStyle(el).zoom || 1 : null;
  });
  check(pillZoom != null && Math.abs(pillZoom - 900 / 420) < 0.08,
    'the floating pill scales with it', `zoom ${pillZoom?.toFixed(2)}`);
  check(await page.locator('[data-tiktok-controls] [data-tiktok-volume]').count() === 1,
    'and the volume slider rides in it');
  await page.locator('[data-tiktok-exit]').click();
  await page.waitForTimeout(700);
  check(await page.evaluate(() => !document.fullscreenElement), 'the scaled × still exits');
}

await b.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
