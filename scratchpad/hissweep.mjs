// HIS board: perform each interaction, CLEAN UP fully, then test whether the
// sidebar still answers — the layer that survives its own close gesture is
// the bug. The first version of this sweep left a drawer standing and blamed
// every later step for it.
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
page.on('pageerror', e => {
  if (/localStorage/.test(e.message)) return;   // third-party iframe noise
  console.log('PAGE ERROR', e.message.slice(0, 200));
});

async function cleanup() {
  for (let i = 0; i < 4; i++) {
    const open = await page.evaluate(() => !!document.querySelector('.drawer-panel, .drawer-overlay'));
    if (!open) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      document.querySelector('.drawer-overlay')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(400);
  }
}

async function sidebarAlive(tag) {
  const r = await page.evaluate(() => {
    const a = document.querySelector('aside a[href="/dashboard"]');
    if (!a) return { present: false };
    const rr = a.getBoundingClientRect();
    const at = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2);
    return { present: true, clear: !!(at && (a === at || a.contains(at))), top: at ? at.tagName + '.' + String(at.className).split(' ').slice(0, 4).join('.') : 'null' };
  });
  if (!r.present) { console.log(`${tag}: SIDEBAR GONE`); return false; }
  if (!r.clear) { console.log(`${tag}: COVERED by ${r.top}`); return false; }
  await page.locator('aside a[href="/dashboard"]').click({ timeout: 2000, force: true }).catch(() => {});
  await page.waitForTimeout(700);
  const path = await page.evaluate(() => location.pathname);
  const ok = path === '/dashboard';
  console.log(`${tag}: ${ok ? 'ALIVE' : 'DEAD (still ' + path + ')'}`);
  await page.goto('http://localhost:5173/jobs');
  await page.waitForTimeout(2500);
  return ok;
}

await page.goto('http://localhost:5173/jobs');
await page.waitForTimeout(4500);
await sidebarAlive('baseline');

const steps = [
  ['tile select + drawer + close', async () => {
    const tile = page.locator('[data-node-id^="G-"]').first();
    await tile.click().catch(() => {});
    await page.waitForTimeout(300);
    await tile.dblclick().catch(() => {});
    await page.waitForTimeout(1200);
  }],
  ['TV menu open + outside close', async () => {
    await page.locator('[data-show-tv]').first().click().catch(() => {});
    await page.waitForTimeout(600);
    await page.mouse.click(760, 820);   // empty-ish board, outside the menu
    await page.waitForTimeout(400);
  }],
  ['TV menu: pick default, frame on, hide again', async () => {
    await page.locator('[data-show-tv]').first().click().catch(() => {});
    await page.waitForTimeout(600);
    await page.locator('[data-tv-menu-row="default"]').click().catch(() => {});
    await page.waitForTimeout(600);
    await page.locator('[data-show-tv]').first().click().catch(() => {});
    await page.waitForTimeout(400);
    await page.locator('[data-tv-menu-hide]').click().catch(() => {});
    await page.waitForTimeout(400);
  }],
  ['widget store open + Escape', async () => {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(x => /widget/i.test(x.getAttribute('title') || ''));
      btn?.click();
    });
    await page.waitForTimeout(900);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }],
  ['undo history open + outside close', async () => {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(x => /history/i.test(x.getAttribute('title') || ''));
      btn?.click();
    });
    await page.waitForTimeout(500);
    await page.mouse.click(760, 820);
    await page.waitForTimeout(400);
  }],
  ['workspace picker open + close', async () => {
    await page.locator('header button').first().click().catch(() => {});
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.mouse.click(760, 820);
    await page.waitForTimeout(400);
  }],
  ['goals widget press', async () => {
    await page.locator('[data-goals-widget]').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
  }],
  ['board pan + lasso + zoom out', async () => {
    await page.mouse.move(900, 780); await page.mouse.down();
    await page.mouse.move(700, 640, { steps: 5 }); await page.mouse.up();
    await page.keyboard.down('Control');
    await page.mouse.move(800, 700); await page.mouse.down();
    await page.mouse.move(1000, 820, { steps: 5 }); await page.mouse.up();
    await page.keyboard.up('Control');
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, 300);
      await page.keyboard.up('Control');
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(400);
  }],
];

for (const [name, act] of steps) {
  await act();
  await cleanup();
  await sidebarAlive(`after ${name}`);
}

await page.screenshot({ path: '/tmp/claude-0/-home-user-Wolfson-management-app/99bdbf4a-e40f-5735-845d-1466af88b019/scratchpad/hissweep2.png' });
await b.close();
