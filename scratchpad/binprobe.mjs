import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2026-08-16');
});
const p = await ctx.newPage();
await p.goto('http://localhost:5173/jobs');
await p.waitForTimeout(2600);
console.log(await p.evaluate(() => {
  const out = [];
  for (const id of ['CE-bin-done', 'CE-bin-ready']) {
    const el = document.querySelector(`[data-node-id="${id}"]`);
    if (!el) { out.push({ id, missing: true }); continue; }
    const r = el.getBoundingClientRect();
    const px = r.left + 40, py = r.top + 100;
    const top = document.elementFromPoint(px, py);
    out.push({
      id, rect: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      inBin: el.contains(top),
      topTag: top && top.tagName, topCls: top && String(top.className).slice(0, 60),
    });
  }
  return out;
}));
await b.close();
