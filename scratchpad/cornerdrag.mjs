// "Dragging to a corner makes the site crash" — reproduce on HIS board:
// pick up a tile and carry it into each corner of the viewport, DWELLING
// there so the edge auto-pan runs, then release. Watch for the crash.
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
  crashed.push(e.message.slice(0, 500));
  console.log('PAGE ERROR:', e.message.slice(0, 500));
});

async function alive(tag) {
  const r = await page.evaluate(() => ({
    kids: document.getElementById('root')?.children.length ?? 0,
    board: !!document.querySelector('[data-board-viewport], [data-board-world]'),
  }));
  console.log(`${tag}: root kids ${r.kids}, board ${r.board ? 'up' : 'GONE'}${crashed.length ? ' — CRASHED' : ''}`);
  return r.board && !crashed.length;
}

async function reload() {
  crashed = [];
  await page.goto('http://localhost:5173/jobs');
  await page.waitForTimeout(3500);
}

await reload();
await alive('baseline');

// Bring the content on screen: the zoom field's Fit button.
async function fit() {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'Fit');
    btn?.click();
  });
  await page.waitForTimeout(900);
}
await fit();

const corners = [
  ['top-left', 30, 30], ['top-right', 1470, 30],
  ['bottom-left', 30, 920], ['bottom-right', 1470, 920],
];

for (const [name, cx, cy] of corners) {
  // Fresh grab each time: find a visible tile mid-screen.
  const tile = await page.evaluate(() => {
    for (const n of document.querySelectorAll('[data-node-id^="G-"]')) {
      const r = n.getBoundingClientRect();
      if (r.left > 250 && r.right < 1250 && r.top > 200 && r.bottom < 750 && r.width > 14) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: n.getAttribute('data-node-id') };
      }
    }
    return null;
  });
  if (!tile) { console.log(`${name}: no tile mid-screen — pan first`); continue; }
  await page.mouse.move(tile.x, tile.y);
  await page.mouse.down();
  // Carry to the corner in steps, then DWELL so edge auto-pan runs.
  await page.mouse.move(cx, cy, { steps: 12 });
  await page.waitForTimeout(1600);
  // A little jiggle in the corner — pointermoves keep arriving during auto-pan.
  await page.mouse.move(cx + 4, cy + 4);
  await page.waitForTimeout(800);
  await page.mouse.up();
  await page.waitForTimeout(900);
  const ok = await alive(`drag ${tile.id} to ${name}`);
  if (!ok) {
    await page.screenshot({ path: `/tmp/claude-0/-home-user-Wolfson-management-app/99bdbf4a-e40f-5735-845d-1466af88b019/scratchpad/crash-${name}.png` });
    await reload();
    await fit();
  }
}

// Also a WIDGET/node to the corners — a different drag path.
for (const [name, cx, cy] of corners) {
  const el = await page.evaluate(() => {
    for (const n of document.querySelectorAll('[data-node-id^="CE-"]')) {
      const r = n.getBoundingClientRect();
      if (r.left > 250 && r.right < 1250 && r.top > 200 && r.bottom < 750) {
        return { x: r.left + r.width / 2, y: Math.max(r.top + 8, r.top + 4), id: n.getAttribute('data-node-id') };
      }
    }
    return null;
  });
  if (!el) { console.log(`node→${name}: no node mid-screen`); continue; }
  await page.mouse.move(el.x, el.y);
  await page.mouse.down();
  await page.mouse.move(cx, cy, { steps: 12 });
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await page.waitForTimeout(800);
  const ok = await alive(`node ${el.id} to ${name}`);
  if (!ok) {
    await page.screenshot({ path: `/tmp/claude-0/-home-user-Wolfson-management-app/99bdbf4a-e40f-5735-845d-1466af88b019/scratchpad/crash-node-${name}.png` });
    await reload();
  }
}

console.log(crashed.length ? 'CRASH REPRODUCED' : 'no crash in this run');

// ── round 2: the TV frame's grips, corner RESIZES, and a multi-drag ────────
const page2 = await ctx.newPage();
page2.on('pageerror', e => {
  if (/localStorage/.test(e.message)) return;
  crashed.push(e.message.slice(0, 500));
  console.log('PAGE2 ERROR:', e.message.slice(0, 500));
});
const alive2 = async tag => {
  const r = await page2.evaluate(() => ({
    kids: document.getElementById('root')?.children.length ?? 0,
    board: !!document.querySelector('[data-board-world]'),
  }));
  console.log(`${tag}: root kids ${r.kids}, board ${r.board ? 'up' : 'GONE'}${crashed.length ? ' — CRASHED' : ''}`);
  if (crashed.length) crashed = [];
};
await page2.goto('http://localhost:5173/jobs');
await page2.waitForTimeout(3500);

// TV frame ON.
await page2.locator('[data-show-tv]').first().click();
await page2.waitForTimeout(600);
await page2.locator('[data-tv-menu-row="default"]').click().catch(() => {});
await page2.waitForTimeout(800);
console.log('frame on:', await page2.locator('[data-tv-frame]').count());

for (const [name, cx, cy] of [['top-left', 20, 20], ['bottom-right', 1480, 930], ['top-right', 1480, 20], ['bottom-left', 20, 930]]) {
  const grip = await page2.locator('[data-tv-frame-move]').boundingBox().catch(() => null);
  if (!grip) { console.log('no move grip'); break; }
  await page2.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page2.mouse.down();
  await page2.mouse.move(cx, cy, { steps: 10 });
  await page2.waitForTimeout(1200);
  await page2.mouse.up();
  await page2.waitForTimeout(600);
  await alive2(`TV frame grip to ${name}`);
}
for (const [name, cx, cy] of [['top-left', 20, 20], ['bottom-right', 1480, 930]]) {
  const h = await page2.locator('[data-tv-frame-handle]').boundingBox().catch(() => null);
  if (!h) { console.log('no resize handle'); break; }
  await page2.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page2.mouse.down();
  await page2.mouse.move(cx, cy, { steps: 10 });
  await page2.waitForTimeout(1200);
  await page2.mouse.up();
  await page2.waitForTimeout(600);
  await alive2(`TV frame CORNER to ${name}`);
}

// A widget's own corner resize dragged into a viewport corner, with dwell.
const rz = await page2.evaluate(() => {
  for (const n of document.querySelectorAll('[data-node-id^="CE-"]')) {
    const r = n.getBoundingClientRect();
    if (r.left > 300 && r.right < 1200 && r.top > 200 && r.bottom < 700) {
      const h = n.querySelector('[data-resize]');
      if (h) { const hr = h.getBoundingClientRect(); return { x: hr.x + hr.width / 2, y: hr.y + hr.height / 2, id: n.getAttribute('data-node-id') }; }
    }
  }
  return null;
});
if (rz) {
  await page2.mouse.move(rz.x, rz.y);
  await page2.mouse.down();
  await page2.mouse.move(1480, 930, { steps: 10 });
  await page2.waitForTimeout(1500);
  await page2.mouse.up();
  await page2.waitForTimeout(600);
  await alive2(`widget ${rz.id} corner-resize to bottom-right`);
} else console.log('no resizable node visible (hover-gated handles?)');

// Multi-select (ctrl-lasso) then drag the group to a corner.
await page2.keyboard.down('Control');
await page2.mouse.move(500, 400);
await page2.mouse.down();
await page2.mouse.move(1100, 800, { steps: 8 });
await page2.mouse.up();
await page2.keyboard.up('Control');
await page2.waitForTimeout(500);
const sel = await page2.evaluate(() => {
  for (const n of document.querySelectorAll('[data-node-id]')) {
    const r = n.getBoundingClientRect();
    if (r.left > 500 && r.right < 1100 && r.top > 400 && r.bottom < 800 && r.width > 14) {
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
  }
  return null;
});
if (sel) {
  await page2.mouse.move(sel.x, sel.y);
  await page2.mouse.down();
  await page2.mouse.move(25, 25, { steps: 12 });
  await page2.waitForTimeout(1600);
  await page2.mouse.up();
  await page2.waitForTimeout(800);
  await alive2('selection drag to top-left');
}

console.log('round 2 done');
await b.close();
