import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2026-08-16');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    canvasElements: [{ id: 'CE-b', type: 'note', x: 400, y: 200, w: 200, h: 160, text: 'B', color: '#dbeafe' }],
  }));
});
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGE ERROR:', e.message.slice(0, 160)));
await p.goto('http://localhost:5173/jobs');
await p.waitForTimeout(2600);
await p.locator('[data-node-id="CE-b"]').click({ position: { x: 40, y: 40 } });
await p.waitForTimeout(300);
const nb = await p.locator('[data-node-id="CE-b"]').boundingBox();
await p.mouse.move(nb.x + nb.width - 3, nb.y + nb.height - 3);
await p.mouse.down();
await p.mouse.move(nb.x + nb.width + 140, nb.y + nb.height + 100, { steps: 10 });
await p.waitForTimeout(300);
console.log(await p.evaluate(() => {
  const all = [...document.querySelectorAll('div')].filter(d => /press 0/.test(d.textContent || ''));
  return { hintNodes: all.length, sample: all[0]?.textContent?.slice(0, 70) ?? null };
}));
// does a window keydown even arrive?
await p.evaluate(() => { window.__k = []; window.addEventListener('keydown', e => window.__k.push(e.key)); });
await p.keyboard.press('0');
await p.waitForTimeout(400);
console.log('keys seen by window:', await p.evaluate(() => window.__k));
await p.mouse.up();
await b.close();
