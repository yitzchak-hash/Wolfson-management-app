// Round 3 of the corner-crash hunt: the DASHBOARD's cards (the goals card is
// new today), and the board's hover-revealed corner-resize handles.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const payload = readFileSync('/tmp/claude-0/-home-user-Wolfson-management-app/99bdbf4a-e40f-5735-845d-1466af88b019/scratchpad/his-general.json', 'utf8');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.addInitScript(p => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('general_app_data', p);
}, payload);
const page = await ctx.newPage();
let crashed = [];
page.on('pageerror', e => {
  if (/localStorage/.test(e.message)) return;
  crashed.push(e.message.slice(0, 600));
  console.log('PAGE ERROR:', e.message.slice(0, 600));
});
const alive = async tag => {
  const r = await page.evaluate(() => ({
    kids: document.getElementById('root')?.children.length ?? 0,
    body: (document.body.innerText || '').length,
  }));
  console.log(`${tag}: kids ${r.kids}, text ${r.body}${crashed.length ? ' — CRASHED' : ''}`);
  crashed = [];
};

// ── the DASHBOARD: drag the goals card (and any card) to the corners ───────
await page.goto('http://localhost:5173/dashboard');
await page.waitForTimeout(3500);
const goalsCard = await page.evaluate(() => {
  const el = document.querySelector('[data-goals-widget]');
  const card = el?.closest('[data-node-id], [data-dash-card], div');
  if (!el) return null;
  const r = (card ?? el).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, left: r.left };
});
console.log('dashboard goals card:', JSON.stringify(goalsCard));
if (goalsCard) {
  // Hover to reveal the move handle (top-left of the card).
  await page.mouse.move(goalsCard.x, goalsCard.y);
  await page.waitForTimeout(500);
  const handle = await page.evaluate(() => {
    const el = document.querySelector('[data-goals-widget]');
    let n = el;
    while (n && n !== document.body) {
      const grip = n.parentElement?.querySelector('[title*="ove"], [data-dash-move]');
      if (grip) { const r = grip.getBoundingClientRect(); if (r.width) return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
      n = n.parentElement;
    }
    return null;
  });
  const from = handle ?? goalsCard;
  for (const [name, cx, cy] of [['top-left', 80, 120], ['bottom-right', 1480, 930], ['top-right', 1480, 120], ['bottom-left', 80, 930]]) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(cx, cy, { steps: 12 });
    await page.waitForTimeout(900);
    await page.mouse.up();
    await page.waitForTimeout(700);
    await alive(`dashboard card drag to ${name}`);
  }
}

// ── the BOARD: hover-revealed corner-resize dragged into the corner ────────
await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(3500);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'Fit');
  btn?.click();
});
await page.waitForTimeout(900);
for (const [name, cx, cy] of [['bottom-right', 1480, 930], ['top-left', 20, 20]]) {
  const target = await page.evaluate(() => {
    for (const n of document.querySelectorAll('[data-node-id^="CE-"]')) {
      const r = n.getBoundingClientRect();
      if (r.left > 300 && r.right < 1200 && r.top > 200 && r.bottom < 750 && r.width > 30) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: n.getAttribute('data-node-id') };
      }
    }
    return null;
  });
  if (!target) { console.log('no node to resize'); break; }
  await page.mouse.move(target.x, target.y);
  await page.waitForTimeout(500);   // hover reveals the handle
  const h = await page.evaluate(id => {
    const n = document.querySelector(`[data-node-id="${id}"]`);
    const grip = n?.querySelector('[data-resize]');
    if (!grip) return null;
    const r = grip.getBoundingClientRect();
    return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  }, target.id);
  if (!h) { console.log(`no handle revealed on ${target.id}`); continue; }
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(cx, cy, { steps: 12 });
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await page.waitForTimeout(700);
  await alive(`resize ${target.id} into ${name}`);
}

// ── tile released INSIDE the pinned top-left corner at 100% ────────────────
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === '100%');
  btn?.click();
});
await page.waitForTimeout(900);
const t = await page.evaluate(() => {
  for (const n of document.querySelectorAll('[data-node-id^="G-"]')) {
    const r = n.getBoundingClientRect();
    if (r.left > 250 && r.right < 1250 && r.top > 250 && r.bottom < 800 && r.width > 40) {
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: n.getAttribute('data-node-id') };
    }
  }
  return null;
});
if (t) {
  await page.mouse.move(t.x, t.y);
  await page.mouse.down();
  await page.mouse.move(90, 100, { steps: 10 });
  await page.waitForTimeout(2500);        // long dwell — full auto-pan run
  await page.mouse.up();
  await page.waitForTimeout(900);
  await alive(`tile ${t.id} released in pinned corner at 100%`);
} else console.log('no tile at 100% view');

console.log('done');
await b.close();
