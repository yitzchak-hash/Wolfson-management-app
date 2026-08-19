// The map's new pins and hover card, and a resized job tile.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 840 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  const job = (n, name, addr) => ({
    id: `G-m${n}`, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: name,
    address: addr, isUnnamed: false, isDuplexApt: false, classification: 'standard',
    generalNotes: '', currentStageId: 'st1', stageDates: {},
    canvasX: 60 + (n % 3) * 240, canvasY: 700 + Math.floor(n / 3) * 160,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'st1', name: 'Piping', color: '#0ea5e9', order: 1, active: true,
               projectId: 'general', description: '', createdAt: '', updatedAt: '' }],
    contractors: [{ id: 'k1', name: 'Moshe AC', category: 'ac', token: 't1', active: true, email: '', createdAt: '' }],
    contractorAssignments: [
      { id: 'as1', apartmentId: 'G-m1', contractorId: 'k1', taskDescription: 'Hang units',
        dueDate: null, createdAt: '2026-08-01', stageId: 'st1' },
    ],
    apartments: [job(1, 'Artzi, Avital', '14 Ben Gurion, Jerusalem'), job(2, 'Cohen, Miriam', ''), job(3, 'Levi, Yosef', '')],
    canvasElements: [
      { id: 'CE-map', type: 'widget', widget: 'job-map', x: 60, y: 240, w: 460, h: 340,
        text: '', color: '#ffffff', data: {} },
    ],
  }));
});
const page = await ctx.newPage();
// The container cannot reach tile servers; stub them so the map draws.
await ctx.route('**/tile.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'image/png',
  body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }));
await ctx.route('**/api/geocode**', r => r.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ lat: 31.78, lon: 35.21 }) }));
await page.goto('http://localhost:5173/jobs');

await page.waitForTimeout(3200);
const dir = '/tmp/claude-0/-home-user-Wolfson-management-app/abdf9b8b-90ff-58aa-abde-c84b697bcb19/scratchpad';
const node = page.locator('[data-node-id="CE-map"]');
// Hover a pin so the card shows.
const pin = node.locator('button.group\\/pin').first();
if (await pin.count()) { await pin.hover(); await page.waitForTimeout(600); }
await node.screenshot({ path: `${dir}/map-pins.png` });
console.log('done');
await b.close();
