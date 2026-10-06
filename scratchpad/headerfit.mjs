// The header's buttons never sit on top of each other, phone to wide desktop
// (found 2026-10-06: at 1024–1280 the right side — LIVE ticker, the alerts
// pill — slid over the workspace picker, Calendar, What's New and the "?";
// on a phone the "?" sat on the Calendar button). Every visible button in the
// header must have its own room, and nothing may run past the screen's edge.
// Dev server: APP (default 5173). Widths: WS=360,390,… · Hebrew: HE=1
import { chromium } from 'playwright';
const APP = process.env.APP || 'http://localhost:5173';
const WIDTHS = (process.env.WS || '360,390,412,720,768,900,1024,1152,1280,1366,1440,1920').split(',').map(Number);
let fail = 0;
function seed([now, he]) {
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2000-01-01'); // the red dot showing — the widest the sparkle gets
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'general');
  if (localStorage.getItem('general_app_data')) return;
  const user = { id: 'U-y', name: 'Yitzchak', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: user, ...(he ? { mainUiStrings: { isRtl: true } } : {}), apartments: [{ id: 'G-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'A long job name for the ticker', isUnnamed: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    canvasElements: [],
    activityLogs: [{ id: 'l1', userId: 'c', userName: 'Igor', buildingId: 'G', apartmentId: 'G-1', apartmentNumber: 'A long job name for the ticker', actionType: 'contractor_upload', fieldChanged: 'photo_uploaded', newValue: 'a.jpg', createdAt: new Date(now - 60000).toISOString() }],
  }));
}
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const w of WIDTHS) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 }, ...(w < 768 ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addInitScript(seed, [Date.now(), !!process.env.HE]);
  const p = await ctx.newPage(); await p.route(/fonts\.g/, r => r.abort());
  await p.goto(`${APP}/activity`);
  await p.waitForSelector('header button', { timeout: 30000 }); await p.waitForTimeout(600);
  const res = await p.evaluate(() => {
    const els = [...document.querySelector('header').querySelectorAll('button, a')]
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map(e => { const r = e.getBoundingClientRect(); return { t: (e.getAttribute('title') || e.textContent || '').trim().slice(0, 24), l: r.left, r: r.right, top: r.top, bot: r.bottom }; });
    const over = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i], c = els[j];
      if (a.l < c.r - 2 && c.l < a.r - 2 && a.top < c.bot - 2 && c.top < a.bot - 2) over.push(`${a.t} × ${c.t}`);
    }
    const past = [...document.querySelectorAll('header *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1; }).length;
    return { over, past, n: els.length };
  });
  const good = res.over.length === 0 && res.past === 0;
  if (!good) fail++;
  console.log(`  ${good ? '✓' : '✗'} ${w}px — ${res.n} buttons${res.over.length ? ', overlapping: ' + res.over.slice(0, 4).join(' | ') : ''}${res.past ? `, ${res.past} past the edge` : ''}`);
  await ctx.close();
}
await b.close();
console.log(fail ? `\n${fail} widths FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
