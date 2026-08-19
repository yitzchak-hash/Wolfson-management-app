// The wall lays out at its real size instead of stretching a picture, and a
// SELECTED widget owns the wheel.
import { chromium } from 'playwright';
const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [{ id: 'gst1', name: 'AC installation', color: '#0ea5e9', order: 1, active: true,
               projectId: 'general', description: '', createdAt: '', updatedAt: '' }],
    apartments: Array.from({ length: 24 }, (_, i) => ({
      id: `G-w${i}`, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: `Job number ${i}`,
      isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
      currentStageId: 'gst1', stageDates: {}, canvasX: 40 + (i % 2) * 230, canvasY: 40 + Math.floor(i / 2) * 150,
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    })),
    canvasElements: [
      // A list widget with more rows than fit, sitting where the pointer can reach it.
      { id: 'CE-list', type: 'widget', widget: 'job-list', x: 560, y: 120, w: 300, h: 150,
        text: '', color: '#ffffff', data: {} },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });

// ── 1. the wall lays out, it does not stretch ──────────────────────────────
await page.goto(`${APP}/tv?view=general&scale=1.3`);
await page.waitForTimeout(3000);
{
  const m = await page.evaluate(() => {
    const scaled = [...document.querySelectorAll('div')].filter(d => {
      const z = getComputedStyle(d).zoom;
      return z && z !== '1' && z !== 'normal';
    });
    const stretched = [...document.querySelectorAll('div')].filter(d =>
      /matrix\(([\d.]+)/.test(getComputedStyle(d).transform)
      && parseFloat(RegExp.$1) !== 1
      && d.querySelectorAll('[data-node-id], .planner-card, button').length > 3);
    return { zoomed: scaled.length, stretched: stretched.length,
             zoomVals: scaled.slice(0, 3).map(d => getComputedStyle(d).zoom) };
  });
  check(m.zoomed > 0, 'the wall scales by LAYOUT (zoom), not by stretching a bitmap',
    `zoom on ${m.zoomed} container(s): ${m.zoomVals.join(', ')}`);
  check(m.stretched === 0, 'no big subtree is left on a scale() transform',
    `${m.stretched} still transformed`);
}

// Non-vacuous: the wall really drew the board.
{
  const drew = await page.evaluate(() =>
    document.body.innerText.includes('Job number') || document.querySelectorAll('[data-node-id]').length > 0);
  check(drew, 'the wall actually drew the board');
}

// ── 2. a selected widget owns the wheel ────────────────────────────────────
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(2800);
{
  const zoomNow = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('[data-board-viewport] div')]
      .find(d => /matrix|translate/.test(d.style.transform) && d.style.transformOrigin.startsWith('0px'));
    return +new DOMMatrix(getComputedStyle(el).transform).a.toFixed(3);
  });
  const node = await page.$('[data-node-id="CE-list"]');
  check(!!node, 'the list widget is on the board');
  if (node) {
    const box = await node.boundingBox();
    // The HEADING, not the list — the exact spot that used to zoom the board.
    const hx = box.x + box.width / 2, hy = box.y + 12;
    const onNode = await page.evaluate(([x, y]) => {
      const n = document.querySelector('[data-node-id="CE-list"]');
      return n.contains(document.elementFromPoint(x, y));
    }, [hx, hy]);
    check(onNode, 'the point being wheeled is on the widget’s header');

    // Not selected yet: the board is allowed to zoom there.
    const z0 = await zoomNow();
    await page.mouse.move(hx, hy);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(250);
    const z1 = await zoomNow();
    check(z1 !== z0, 'unselected, the wheel over the header still zooms the board', `${z0} → ${z1}`);

    // Re-measure: the zoom just moved everything. Clicking at the old
    // coordinates lands on whatever slid under them — which on the first run
    // opened a job's drawer and made this read as "selecting does nothing".
    const box2 = await node.boundingBox();
    const sx = box2.x + box2.width / 2, sy = box2.y + 10;
    await page.mouse.click(sx, sy);
    await page.waitForTimeout(350);
    const picked = await page.evaluate(() => {
      const n = document.querySelector('[data-node-id="CE-list"]');
      // The selection is drawn as the node's BORDER in the app's accent blue.
      return getComputedStyle(n).borderTopColor === 'rgb(74, 168, 216)';
    });
    check(picked, 'clicking the widget selects it');
    await page.mouse.move(sx, sy);
    const scrollBefore = await page.evaluate(() => {
      const n = document.querySelector('[data-node-id="CE-list"]');
      const s = [...n.querySelectorAll('*')].find(e => {
        const st = getComputedStyle(e);
        return (st.overflowY === 'auto' || st.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 4;
      });
      return s ? s.scrollTop : -1;
    });
    check(scrollBefore === 0, 'the widget has a list with room to scroll', `scrollTop ${scrollBefore}`);

    const z2 = await zoomNow();
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(250);
    const z3 = await zoomNow();
    check(z3 === z2, 'selected, the wheel over the header leaves the board alone', `${z2} → ${z3}`);
    const scrollAfter = await page.evaluate(() => {
      const n = document.querySelector('[data-node-id="CE-list"]');
      const s = [...n.querySelectorAll('*')].find(e => {
        const st = getComputedStyle(e);
        return (st.overflowY === 'auto' || st.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 4;
      });
      return s ? s.scrollTop : -1;
    });
    check(scrollAfter > 0, 'and scrolls the widget instead', `scrollTop ${scrollBefore} → ${scrollAfter}`);
  }
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
