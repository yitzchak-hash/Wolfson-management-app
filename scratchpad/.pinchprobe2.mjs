import { chromium, devices } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: devices['iPhone 13'].userAgent });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2026-08-16');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [{ id: 'G-j1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Touch Job', isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: null, stageDates: {}, canvasX: 60, canvasY: 240, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U-test', updatedByName: 'A' }],
    canvasElements: [],
  }));
});
const page = await ctx.newPage();
page.on('console', m => { if (m.text().startsWith('[pinch]')) console.log(m.text()); });
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(4000);
const cdp = await ctx.newCDPSession(page);
const cx = 195, cy = 450;
const two = d => ([{ x: cx - d, y: cy }, { x: cx + d, y: cy }]);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: two(40) });
for (let d = 48; d <= 120; d += 8) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: two(d) }); await page.waitForTimeout(16); }
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(500);
const w = await page.evaluate(() => document.querySelector('[data-node-id="G-j1"]')?.getBoundingClientRect().width);
console.log('tile width now', Math.round(w ?? 0));
await b.close();
