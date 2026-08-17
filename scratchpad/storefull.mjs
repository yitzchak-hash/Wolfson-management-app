// Every card in the widget store must SHOW the widget doing its job.
// A preview that draws "Nothing yet" is indistinguishable from a broken one.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2026-08-16');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'Architect Avi', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
  }));
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(2600);
await page.locator('button[title]').filter({ hasText: /^Store$/ }).first().click();
await page.waitForTimeout(1500);
// Show everything, not just one shelf.
await page.locator('button', { hasText: /^All$/ }).first().click().catch(() => {});
await page.waitForTimeout(1200);

await page.evaluate(() => { window.__dump = true; });
page.on('console', m => console.log('  [preview]', m.text()));
const report = await page.evaluate(() => {
  const EMPTY = /nothing|no data|none yet|not set|no jobs|no tasks|no one|empty|add one|nobody|—\s*$|^-$|choose|pick a|select a/i;
  const cards = Array.from(document.querySelectorAll('[data-widget-id]'));
  const out = [];
  for (const c of cards) {
    const id = c.getAttribute('data-widget-id') || '?';
    // ONLY the preview. The card also carries the widget's NAME and BLURB, and
    // those blurbs are full of the very words an empty state uses — "nobody
    // wants", "so nothing is left implied", "if a day goes by empty". Reading
    // the whole card reported nine healthy previews as broken, which is the
    // test blaming the product.
    // The blurb overlay lives INSIDE the preview subtree, and those blurbs use
    // the very words an empty state uses ("nobody wants", "goes by empty").
    // Strip it before judging, or the harness reports healthy cards as broken.
    const pv = c.firstElementChild;
    const clone = pv ? pv.cloneNode(true) : null;
    if (clone) clone.querySelectorAll('[data-widget-blurb], .opacity-0, [class*="group-hover"]').forEach(n => n.remove());
    const t = ((clone && clone.textContent) || '').replace(/\s+/g, ' ').trim();
    const r = c.getBoundingClientRect();
    out.push({ id, empty: EMPTY.test(t), chars: t.length, h: Math.round(r.height), text: t.slice(0, 80) });
  }
  return { total: cards.length, out };
});
if (!report.total) {
  console.log('No cards matched — dumping candidate attributes:');
  console.log(await page.evaluate(() => {
    const s = new Set();
    document.querySelectorAll('*').forEach(e => [...e.attributes].forEach(a => {
      if (a.name.startsWith('data-') && /widget|card/.test(a.name)) s.add(a.name);
    }));
    return [...s];
  }));
} else {
  const bad = report.out.filter(x => x.empty);
  console.log(`cards: ${report.total}   drawing an empty state: ${bad.length}`);
  bad.slice(0, 40).forEach(x => console.log(`   ${x.id} :: ${x.text}`));
}
await b.close();
