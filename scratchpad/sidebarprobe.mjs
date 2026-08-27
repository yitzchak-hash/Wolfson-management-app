// What is covering the sidebar on the Job Board? elementFromPoint at every
// nav button's centre, plus a real click on Dashboard.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
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
      id: 'G-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Cohen',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 300, canvasY: 320,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [
      { id: 'CE-bin-done', type: 'bin', binKind: 'done', x: 2100, y: 24, w: 180, h: 112, text: 'Done', color: '#16a34a' },
      { id: 'CE-bin-ready', type: 'bin', binKind: 'ready', x: 2100, y: 154, w: 180, h: 112, text: 'Ready', color: '#0ea5e9' },
      { id: 'CE-bin-archive', type: 'bin', binKind: 'archive', x: 2100, y: 284, w: 180, h: 112, text: 'Archive', color: '#64748b' },
      { id: 'CE-bin-trash', type: 'bin', binKind: 'trash', x: 2100, y: 414, w: 180, h: 112, text: 'Trash', color: '#dc2626' },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);

const probe = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('aside a').forEach(a => {
    const r = a.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const at = document.elementFromPoint(cx, cy);
    const covered = at && !a.contains(at) && at !== a;
    let desc = '';
    if (covered) {
      let n = at;
      const chain = [];
      while (n && n !== document.body && chain.length < 6) {
        chain.push(n.tagName.toLowerCase()
          + (n.id ? '#' + n.id : '')
          + (n.dataset ? Object.keys(n.dataset).map(k => `[data-${k}]`).join('') : '')
          + '.' + String(n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className || '').split(' ').slice(0, 4).join('.'));
        n = n.parentElement;
      }
      desc = chain.join('  <<  ');
    }
    out.push({ href: a.getAttribute('href'), covered: !!covered, by: desc.slice(0, 300) });
  });
  return out;
});
probe.forEach(p => console.log(p.covered ? 'COVERED' : 'ok     ', p.href, p.by));

// And a real click on Dashboard.
await page.locator('aside a[href="/dashboard"]').click({ timeout: 3000 }).catch(e => console.log('CLICK FAILED:', e.message.split('\n')[0]));
await page.waitForTimeout(1200);
console.log('after click, path =', await page.evaluate(() => location.pathname));

await b.close();
