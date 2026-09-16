// The worker's map chooser wears the projects' LOGOS (owner, 2026-09-16):
// big, centred in each button, the name small underneath — for a worker who
// cannot read the little English name.
import { chromium } from 'playwright';
const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const today = new Date().toISOString().slice(0, 10);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(({ today }) => {
  localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('wolfson_app_data')) return;
  const user = { id: 'U-t', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const igor = { id: 'C-ig', name: 'Igor', email: '', category: 'ac', token: 'tok-ig', active: true, createdAt: '2026-01-01', lang: 'en',
    perms: { seeDiagrams: true, seeAllApartments: true } };
  const stages = [{ id: 'st-pipe', name: 'Piping', color: '#3b82f6', order: 1, active: true }];
  const apt = (id, bld, n, f, name) => ({ id, buildingId: bld, floor: f, apartmentNumber: String(n), displayName: name, isUnnamed: false,
    isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'st-pipe', stageDates: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' });
  const task = (id, aptId, bld) => ({ id, contractorId: 'C-ig', apartmentId: aptId, buildingId: bld, taskDescription: 'Work', stageId: 'st-pipe', dueDate: today, priority: 'normal', completedAt: null, createdAt: '2026-08-01', createdBy: 'U-t', createdByName: 'Esther' });
  localStorage.setItem('wolfson_app_data', JSON.stringify({ users: [user], currentUser: user, stages, contractors: [igor],
    buildings: [{ id: 'A1', name: 'Building A1' }], apartments: [apt('A1-47', 'A1', 47, 13, 'Aharonov')], contractorAssignments: [task('T-47', 'A1-47', 'A1')],
    contractorNotes: [], contractorPhotos: [], canvasElements: [] }));
  localStorage.setItem('netiv_app_data', JSON.stringify({ users: [user], currentUser: user, stages, contractors: [igor],
    buildings: [{ id: 'B1', name: 'B1' }], apartments: [apt('B1-3', 'B1', 3, 2, 'Mizrahi')], contractorAssignments: [task('T-B3', 'B1-3', 'B1')],
    contractorNotes: [], contractorPhotos: [], canvasElements: [] }));
}, { today });
await ctx.route('**/api/**', r => r.fulfill({ json: {} }));
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/c/tok-ig`);
await page.waitForTimeout(3000);
await page.locator('button', { hasText: /Building Map/ }).click();
await page.waitForTimeout(1200);
check(await page.locator('[data-map-chooser]').count() === 1, 'the chooser is up');
for (const pid of ['wolfson', 'netiv']) {
  const m = await page.evaluate((pid) => {
    const btn = document.querySelector(`[data-map-square="${pid}"]`);
    const img = btn?.querySelector('[data-map-square-logo] img');
    if (!btn || !img) return null;
    const b = btn.getBoundingClientRect(), i = img.getBoundingClientRect();
    const name = [...btn.querySelectorAll('span')].find(s => /Wolfson Residence|Netiv Neve Shamir/.test(s.textContent || ''));
    const n = name?.getBoundingClientRect();
    return { src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0, iw: i.width, ih: i.height, bw: b.width, bh: b.height,
      centreOff: Math.abs((i.left + i.width / 2) - (b.left + b.width / 2)), nameBelow: n ? n.top >= i.bottom - 2 : false,
      nameSize: name ? parseFloat(getComputedStyle(name).fontSize) : 0 };
  }, pid);
  check(!!m, `${pid}: a logo image sits in the button`);
  if (!m) continue;
  const expect = pid === 'wolfson' ? '/wolfson-building.png' : '/netiv-logo.png';
  check(m.src === expect, `${pid}: it is the header's own logo`, m.src);
  check(m.loaded, `${pid}: the picture actually loaded`);
  check(m.ih >= 90 && m.iw >= 90, `${pid}: the logo is BIG`, `${Math.round(m.iw)}x${Math.round(m.ih)} in ${Math.round(m.bw)}x${Math.round(m.bh)}`);
  check(m.centreOff < 4, `${pid}: centred in the button`, `off by ${m.centreOff.toFixed(1)}`);
  check(m.nameBelow && m.nameSize <= 18, `${pid}: the name sits underneath, smaller`, `${m.nameSize}px`);
}
const fits = await page.evaluate(() => {
  const sq = [...document.querySelectorAll('[data-map-square]')].map(e => e.getBoundingClientRect());
  return sq.every(r => r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1);
});
check(fits, 'both squares fit on the phone without scrolling');
await page.screenshot({ path: 'scratchpad/maplogos.png' });
await page.locator('[data-map-square="wolfson"]').click();
await page.waitForTimeout(1200);
check(await page.locator('[data-map-bar]').count() === 1, 'pressing the logo still opens the map');
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL GREEN');
process.exit(fails ? 1 : 0);
