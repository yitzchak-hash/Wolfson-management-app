import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [],
    apartments: [{ id: 'G-t1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'TV job',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 200, canvasY: 200,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' }],
    canvasElements: [],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') console.log('CONS-ERR', m.text().slice(0, 200)); });
for (const path of ['/tv', '/tv-view']) {
  await page.goto('http://localhost:5173' + path).catch(e => console.log('nav fail', e.message));
  await page.waitForTimeout(3500);
  const info = await page.evaluate(() => ({
    bodyChildren: document.body.children.length,
    rootHtmlLen: (document.getElementById('root')?.innerHTML || '').length,
    text: (document.body.innerText || '').slice(0, 200).replace(/\s+/g, ' '),
  }));
  console.log(path, JSON.stringify(info));
}
await b.close();
