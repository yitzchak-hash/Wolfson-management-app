// The group outline: invisible at rest, the whole group outlined the moment
// one member is picked.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  const job = (n, x, y, g) => ({
    id: `G-s${n}`, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: `Wolfson, Job ${n}`,
    address: `${n} Herzl`, isUnnamed: false, isDuplexApt: false, classification: 'standard',
    generalNotes: '', currentStageId: null, stageDates: {}, canvasX: x, canvasY: y,
    ...(g ? { boardGroup: g } : {}),
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    apartments: [job(1, 60, 200, 'GRP-x'), job(2, 320, 200, 'GRP-x'), job(3, 60, 380, 'GRP-x'), job(4, 620, 200, null)],
    canvasElements: [
      { id: 'CE-s1', type: 'note', x: 320, y: 380, w: 180, h: 132, text: 'Same crew', color: '#fef9c3', boardGroup: 'GRP-x' },
    ],
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2600);
const dir = '/tmp/claude-0/-home-user-Wolfson-management-app/abdf9b8b-90ff-58aa-abde-c84b697bcb19/scratchpad';
await page.screenshot({ path: `${dir}/group-rest.png` });
const r = await page.locator('[data-node-id="G-s1"]').boundingBox();
await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
await page.waitForTimeout(500);
await page.screenshot({ path: `${dir}/group-selected.png` });
console.log('shots done');
await b.close();
