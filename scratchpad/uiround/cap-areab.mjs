// Area B options, built on the RUNNING app at iPad-upright width (768).
// Every option is DOM surgery on the live page: the pills, tabs, counts and
// colours are the app's own, so what he approves is what ships.
import { chromium } from 'playwright';
import { realisticWolfson, applySeed } from '../seed.mjs';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const blob = await realisticWolfson(b);

async function open768() {
  const ctx = await b.newContext({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1.5 });
  await applySeed(ctx, blob);
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/project');
  await page.waitForTimeout(2600);
  return { ctx, page };
}
/** Clip from the real bottom of the app header, measured — guessing the
 *  height cut the first row of every option's chrome in half. */
async function report(page, label) {
  const m = await page.evaluate(() => {
    const hdr = document.querySelector('header').getBoundingClientRect().bottom;
    const bar = [...document.querySelectorAll('div.tracking-widest')].find(d => d.getBoundingClientRect().width > 0);
    const cell = [...document.querySelectorAll('*')].find(el =>
      /Vizgen, Chaim|Cohen, David/.test(el.textContent) && el.children.length === 0);
    const box = cell ? cell.closest('div').getBoundingClientRect() : null;
    return { chrome: bar ? Math.round(bar.getBoundingClientRect().top - hdr) : null,
             cell: box ? Math.round(box.width) : null };
  });
  console.log(`   ${label}: chrome ${m.chrome}px · cell ${m.cell}px wide`);
}
async function shotBelowHeader(page, path) {
  const top = await page.evaluate(() => {
    const h = document.querySelector('header');
    return h ? Math.round(h.getBoundingClientRect().bottom) : 96;
  });
  await page.screenshot({ path, clip: { x: 0, y: top, width: 768, height: 800 } });
}

/** Shared by every option: one building, taking the whole width.
 *  The column is found through its navy name bar (BuildingNameBar carries
 *  `tracking-widest` and holds the lock button, so the id is a text NODE
 *  beside a child — never a leaf). The bar's parent IS the column. */
const ONE_BUILDING = () => {
  const byId = {};
  for (const bar of document.querySelectorAll('div.tracking-widest')) {
    if (bar.getBoundingClientRect().width === 0) continue;
    byId[bar.textContent.trim()] = bar.parentElement;
  }
  for (const id of ['A2', 'A3']) if (byId[id]) byId[id].style.display = 'none';
  const c = byId['A1'];
  if (c) { c.style.flex = '1 1 100%'; c.style.maxWidth = 'none'; c.style.width = 'auto'; }
};

/** The parts of the top chrome, found once. */
const PARTS = () => {
  const q = sel => [...document.querySelectorAll(sel)];
  const phoneBar = q('div').find(d => (d.className || '').toString().startsWith('md:hidden bg-white border-b'));
  const deskBar = q('div').find(d => { const c = (d.className || '').toString();
    return c.includes('hidden') && c.includes('md:block') && c.includes('bg-white') && c.includes('border-b'); });
  const strip = q('div').find(d => { const c = (d.className || '').toString();
    return c.includes('hidden') && c.includes('md:flex') && c.includes('bg-gray-50') && /\d/.test(d.textContent); });
  const pillRow = (() => { const p = q('button').find(x => x.textContent.trim() === 'Piping');
    return p ? p.parentElement : null; })();
  return { phoneBar, deskBar, strip, pillRow };
};

// ── NOW ────────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await open768();
  await shotBelowHeader(page, 'scratchpad/b-now.png');
  await report(page, 'now');
  await ctx.close(); console.log('now ok');
}

// ── OPTION 1 · the phone's own answer, one size up ─────────────────────────
{
  const { ctx, page } = await open768();
  await page.evaluate(ONE_BUILDING);
  await page.evaluate(`(${PARTS.toString()})`);
  await page.evaluate(partsSrc => {
    const P = eval(`(${partsSrc})`)();
    if (P.deskBar) P.deskBar.style.display = 'none';
    if (P.strip) P.strip.style.display = 'none';
    if (P.phoneBar) {
      P.phoneBar.style.display = 'flex';
      // it is built for a 390px screen — give it the tablet's room
      P.phoneBar.style.padding = '10px 16px';
      P.phoneBar.querySelectorAll('button').forEach(x => { x.style.fontSize = '15px'; x.style.paddingTop = '7px'; x.style.paddingBottom = '7px'; });
      P.phoneBar.querySelectorAll('input').forEach(x => { x.style.fontSize = '15px'; x.style.padding = '9px 12px 9px 34px'; });
    }
  }, PARTS.toString());
  await page.waitForTimeout(700);
  await shotBelowHeader(page, 'scratchpad/b-opt1.png');
  await report(page, 'opt1');
  await ctx.close(); console.log('opt1 ok');
}

// ── OPTION 2 · the stage bar ───────────────────────────────────────────────
{
  const { ctx, page } = await open768();
  await page.evaluate(ONE_BUILDING);
  await page.evaluate(partsSrc => {
    const P = eval(`(${partsSrc})`)();
    // read the REAL stages: name, colour and count, off the app's own chrome
    const pills = P.pillRow ? [...P.pillRow.children] : [];
    const stages = pills.map(p => {
      const dot = p.querySelector('span');
      return { name: p.textContent.trim(), color: dot ? getComputedStyle(dot).backgroundColor : '#999' };
    });
    const counts = P.strip ? [...P.strip.children].map(c => parseInt(c.textContent.trim(), 10)).filter(n => !isNaN(n)) : [];
    stages.forEach((s, i) => { s.n = counts[i] ?? 0; });
    const total = stages.reduce((a, s) => a + s.n, 0) || 1;

    // one bar in place of the two rows
    const bar = document.createElement('div');
    bar.style.cssText = 'padding:10px 20px 12px;background:#fff;border-bottom:1px solid #e5e7eb';
    bar.innerHTML =
      '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:7px">'
      + '<span style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b7280">Stages · tap to filter</span>'
      + `<span style="font-size:13px;color:#6b7280"><b style="color:#111827">${total}</b> units</span></div>`
      + '<div id="sbar" style="display:flex;height:34px;border-radius:9px;overflow:hidden;gap:2px"></div>'
      + '<div id="slab" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px"></div>';
    const host = bar.querySelector('#sbar');
    stages.forEach(s => {
      const seg = document.createElement('button');
      seg.style.cssText = `flex:${s.n} 1 0;background:${s.color};border:0;color:#fff;font:700 12px/1 Figtree,sans-serif;`
        + 'display:flex;align-items:center;justify-content:center;cursor:pointer';
      seg.textContent = s.n >= 12 ? s.n : '';
      host.appendChild(seg);
    });
    const lab = bar.querySelector('#slab');
    stages.forEach(s => {
      const t = document.createElement('span');
      t.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11.5px;color:#4b5563';
      t.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${s.color};flex:0 0 auto"></span>${s.name}`;
      lab.appendChild(t);
    });
    // The bar REPLACES the old chrome rather than stacking on it: the search
    // + Filters button carry the tools (option 1's lean top), and the room
    // that frees is what the stage picture is spent on.
    if (P.strip) { P.strip.parentElement.insertBefore(bar, P.strip); P.strip.style.display = 'none'; }
    if (P.deskBar) P.deskBar.style.display = 'none';
    if (P.phoneBar) {
      P.phoneBar.style.display = 'flex';
      P.phoneBar.style.padding = '10px 16px';
      P.phoneBar.querySelectorAll('button').forEach(x => { x.style.fontSize = '15px'; x.style.paddingTop = '7px'; x.style.paddingBottom = '7px'; });
      P.phoneBar.querySelectorAll('input').forEach(x => { x.style.fontSize = '15px'; x.style.padding = '9px 12px 9px 34px'; });
    }
  }, PARTS.toString());
  await page.waitForTimeout(700);
  await shotBelowHeader(page, 'scratchpad/b-opt2.png');
  await report(page, 'opt2');
  await ctx.close(); console.log('opt2 ok');
}

// ── OPTION 3 · one line that scrolls, counts inside the bubbles ────────────
{
  const { ctx, page } = await open768();
  await page.evaluate(ONE_BUILDING);
  await page.evaluate(partsSrc => {
    const P = eval(`(${partsSrc})`)();
    const counts = P.strip ? [...P.strip.children].map(c => parseInt(c.textContent.trim(), 10)).filter(n => !isNaN(n)) : [];
    if (P.pillRow) {
      P.pillRow.style.cssText = 'display:flex;flex-wrap:nowrap;gap:8px;overflow-x:auto;padding-bottom:2px;'
        + '-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 26px),transparent);'
        + 'mask-image:linear-gradient(to right,#000 calc(100% - 26px),transparent)';
      [...P.pillRow.children].forEach((p, i) => {
        p.style.flex = '0 0 auto';
        const n = counts[i];
        if (n === undefined) return;
        const badge = document.createElement('span');
        badge.textContent = n;
        badge.style.cssText = 'margin-left:6px;font-weight:800;opacity:.72;font-variant-numeric:tabular-nums';
        p.appendChild(badge);
      });
    }
    if (P.strip) P.strip.style.display = 'none';
    if (P.phoneBar && P.deskBar) {
      const tabs = [...P.phoneBar.children].find(c =>
        [...c.querySelectorAll('button')].some(x => /^A\d$/.test(x.textContent.trim())));
      if (tabs) {
        const row = tabs.cloneNode(true);
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:9px 20px 3px;background:#fff';
        row.querySelectorAll('button').forEach(x => { x.style.fontSize = '15px'; x.style.padding = '8px 0'; });
        P.deskBar.parentElement.insertBefore(row, P.deskBar);
      }
    }
  }, PARTS.toString());
  await page.waitForTimeout(700);
  await shotBelowHeader(page, 'scratchpad/b-opt3.png');
  await report(page, 'opt3');
  await ctx.close(); console.log('opt3 ok');
}
await b.close();
