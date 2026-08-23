// Does undoing eat the redo stack? Three nudges, three undos, count the redos.
import { chromium } from 'playwright';
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
      id: 'G-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Mover',
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: null, stageDates: {}, canvasX: 400, canvasY: 300,
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
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(3000);

// Select the tile, nudge three times (three distinct entries — no repeats).
const v = await page.evaluate(() => {
  const w = document.querySelector('[data-board-world]');
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(w.parentElement.style.transform);
  const r = document.querySelector('[data-board-viewport]').getBoundingClientRect();
  return { x: +m[1], y: +m[2], z: +m[3], left: r.left, top: r.top };
});
await page.mouse.click(v.left + v.x + (400 + 107) * v.z, v.top + v.y + (300 + 66) * v.z);
await page.waitForTimeout(400);
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(350);   // > repeat window — three separate entries
}
const counts = () => page.evaluate(() => {
  const btns = [...document.querySelectorAll('button[title]')];
  const undoBtn = btns.find(b => /^(Undo|Nothing to undo)/.test(b.title));
  const redoBtn = btns.find(b => /^(Redo|Nothing to redo)/.test(b.title));
  return { undo: undoBtn?.title, redo: redoBtn?.title };
});
console.log('after 3 nudges:', JSON.stringify(await counts()));
for (let i = 1; i <= 3; i++) {
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  console.log(`after undo ${i}:`, JSON.stringify(await counts()));
}
// Open the history list and count the redo rows.
await page.locator('[data-undo-history]').click();
await page.waitForTimeout(400);
const hist = await page.evaluate(() => (document.body.innerText.match(/Undone — can be put back/) ? 'redo section shown' : 'NO redo section'));
console.log(hist);
const rows = await page.evaluate(() => {
  const menu = [...document.querySelectorAll('.fixed.z-\\[100\\]')].pop();
  return menu ? (menu.textContent.match(/Moved/g) || []).length : -1;
});
console.log('rows mentioning Moved:', rows);
// And can we actually redo three times?
await page.keyboard.press('Escape');
for (let i = 1; i <= 3; i++) {
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(500);
}
const x = await page.evaluate(() => JSON.parse(localStorage.getItem('general_app_data')).apartments[0].canvasX);
console.log('canvasX after 3 redos (expect 403):', x);
await b.close();
