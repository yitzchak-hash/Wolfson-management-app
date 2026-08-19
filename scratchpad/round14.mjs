// Round 14, part one: the building name stays on top, groups made by hand
// open and count, and a deleted job leaves the notebook.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// ── 1. The building name is pinned, and the padlock switches it ────────────
for (const [project, key, version] of [
  ['wolfson', 'wolfson_app_data', 'wolfson_app_version'],
  ['netiv', 'netiv_app_data', 'netiv_app_version'],
]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 760 } });
  await ctx.addInitScript(([p, k, v]) => {
    localStorage.setItem('active_project', p);
    localStorage.setItem(v, '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    if (!localStorage.getItem(k)) {
      localStorage.setItem(k, JSON.stringify({
        currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
      }));
    }
  }, [project, key, version]);
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/project`);
  await page.waitForTimeout(3200);

  const drew = await page.evaluate(() => document.querySelectorAll('[data-apt-id], [data-apartment-id]').length
    || /\b(A1|A2|A3|B1|B2)\b/.test(document.body.innerText));
  check(!!drew, `${project}: the diagram drew`);

  // Scroll with the WHEEL over the diagram, so whatever the real scrolling
  // ancestor is gets scrolled — the bar sticks to that, not to the window.
  const readBar = () => page.evaluate(() => {
    const bar = [...document.querySelectorAll('div')].find(d => {
      const st = getComputedStyle(d);
      return st.position === 'sticky' && st.backgroundColor === 'rgb(30, 58, 95)';
    });
    // The thing that actually scrolls is whatever the bar sticks TO — walk up
    // and find it, rather than guessing at a cell. The first version picked the
    // first div whose text was digits, which was a count in the filter bar,
    // sitting ABOVE the building bar and never moving: the harness measuring
    // the wrong element and calling it a product fault.
    let sc = bar?.parentElement ?? null;
    while (sc && sc !== document.body) {
      const st = getComputedStyle(sc);
      if ((st.overflowY === 'auto' || st.overflowY === 'scroll')
        && sc.scrollHeight > sc.clientHeight + 4) break;
      sc = sc.parentElement;
    }
    const scrolled = sc && sc !== document.body
      ? sc.scrollTop
      : (window.scrollY || document.documentElement.scrollTop);
    return {
      bar: bar ? Math.round(bar.getBoundingClientRect().top) : null,
      scrolled: Math.round(scrolled),
    };
  });
  /**
   * Two SMALL scrolls, both after pinning has begun.
   *
   * Measuring from a standstill compares the bar's resting place with its
   * pinned one and always differs by the gap it had to travel; and one big
   * wheel lands Netiv's shorter columns on the bottom, where a second wheel
   * moves nothing and reads as "it did not scroll". Small, and already moving.
   */
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(400);
  const at1 = await readBar();
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(400);
  const at2 = await readBar();
  console.log(`       ${project} scroll:`, JSON.stringify({ at1, at2 }));
  check(at2.scrolled > at1.scrolled,
    `${project}: the diagram really scrolled`, `${at1.scrolled} → ${at2.scrolled}`);
  check(at1.bar !== null && at1.bar === at2.bar,
    `${project}: the building name holds its place while it does`, `bar ${at1.bar} → ${at2.bar}`);

  const pinned = await page.evaluate(() => {
    const bars = [...document.querySelectorAll('div')].filter(d => {
      const st = getComputedStyle(d);
      return st.position === 'sticky' && st.backgroundColor === 'rgb(30, 58, 95)';
    });
    if (!bars.length) return { found: 0 };
    const bar = bars[0];
    const r = bar.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      found: bars.length,
      z: getComputedStyle(bar).zIndex,
      top: Math.round(r.top),
      onTop: bar.contains(hit) || hit === bar,
      hitTag: hit ? `${hit.tagName}.${(hit.className || '').toString().slice(0, 30)}` : null,
    };
  });
  console.log(`       ${project} bar:`, JSON.stringify(pinned));
  check(pinned.found > 0, `${project}: the building bar is sticky`);
  check(pinned.z === '20', `${project}: it sits above the cells it scrolls over`, `z-index ${pinned.z}`);
  check(pinned.onTop === true, `${project}: nothing is painted over it`, pinned.hitTag ?? '');

  // The padlock lets it go.
  const lock = await page.$('button[title*="stays on top"]');
  check(!!lock, `${project}: the bar carries a padlock`);
  if (lock) {
    await lock.click({ force: true });
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => {
      const bar = [...document.querySelectorAll('div')].find(d =>
        getComputedStyle(d).backgroundColor === 'rgb(30, 58, 95)'
        && /^(A1|A2|A3|B1|B2)/.test((d.textContent ?? '').trim()));
      return bar ? getComputedStyle(bar).position : null;
    });
    check(after === 'relative', `${project}: unlocking lets the name scroll away`, `position ${after}`);
    // And the choice sticks for the workspace.
    const saved = await page.evaluate(k => {
      const d = JSON.parse(localStorage.getItem(k) ?? '{}');
      const bs = d.boardSettings ?? {};
      return Object.values(bs).some(v => v && v.stickyBuildingName === false);
    }, key);
    check(saved, `${project}: and the choice is remembered`);
  }
  await ctx.close();
}

// ── 2. A group made by hand opens, and counts ─────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    if (localStorage.getItem('general_app_data')) return;
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
      stages: [{ id: 'gs1', name: 'AC installation', color: '#0ea5e9', order: 1, active: true,
                 projectId: 'general', description: '', createdAt: '', updatedAt: '' }],
      apartments: [
        // Three filed into a group that has NO binKind — exactly what the
        // import and the "new group" button make.
        ...Array.from({ length: 3 }, (_, i) => ({
          id: `G-in-${i}`, buildingId: 'G', floor: 0, apartmentNumber: '',
          displayName: `In AC job ${i}`, isUnnamed: false, isDuplexApt: false,
          classification: 'standard', generalNotes: '', currentStageId: 'gs1', stageDates: {},
          boardBin: 'CE-bin-custom', binnedAt: '2026-01-01',
          canvasX: 40, canvasY: 40,
          createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
        })),
        { id: 'G-open', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'On the board',
          isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
          currentStageId: 'gs1', stageDates: {}, canvasX: 40, canvasY: 260,
          createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' },
      ],
      canvasElements: [
        { id: 'CE-bin-custom', type: 'bin', x: 420, y: 60, w: 178, h: 92,
          text: 'Currently in AC', color: '#64748b' },
      ],
    }));
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/jobs`);
  await page.waitForTimeout(3600);

  const node = await page.$('[data-node-id="CE-bin-custom"]');
  check(!!node, 'the hand-made group is on the board');
  if (node) {
    const txt = await node.innerText();
    check(/Currently in AC/.test(txt), 'it is drawn with its own name', txt.replace(/\n/g, ' · ').slice(0, 50));
    check(/\b3\b/.test(txt), 'and shows the 3 jobs filed in it — not 0',
      txt.replace(/\n/g, ' · ').slice(0, 50));

    const box = await node.boundingBox();
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(900);
    const opened = await page.evaluate(() => {
      const t = document.body.innerText;
      // The group window lists its jobs; a rename would put the name in an input.
      const editing = [...document.querySelectorAll('input, textarea')]
        .some(i => (i.value ?? '').includes('Currently in AC'));
      return { listed: (t.match(/In AC job \d/g) ?? []).length, editing };
    });
    console.log('       after double-click:', JSON.stringify(opened));
    check(!opened.editing, 'double-click does NOT drop into a rename');
    check(opened.listed >= 3, 'it opens the group and shows what is inside', `${opened.listed} jobs listed`);
  }
  await ctx.close();
}

// ── 3. A job that no longer exists leaves the notebook ────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('general_app_version', '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    if (localStorage.getItem('general_app_data')) return;
    localStorage.setItem('general_app_data', JSON.stringify({
      currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
      stages: [],
      apartments: [
        { id: 'G-alive', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Still here',
          isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
          currentStageId: null, stageDates: {}, canvasX: 40, canvasY: 40,
          createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U' },
      ],
      canvasElements: [
        {
          id: 'CE-book', type: 'widget', widget: 'rota', x: 340, y: 40, w: 520, h: 360,
          text: '', color: '#ffffff',
          data: {
            people: ['n:Moshe'],
            cells: {
              'n:Moshe|2026-08-17': [
                { id: 'e1', jobId: 'G-alive' },
                { id: 'e2', jobId: 'G-DELETED-1' },
                { id: 'e3', text: 'Pardes 8 am' },
              ],
              'n:Moshe|2026-08-18': [{ id: 'e4', jobId: 'G-DELETED-2' }],
            },
            offKept: {
              'n:Moshe': { 'n:Moshe|2026-08-10': [{ id: 'e5', jobId: 'G-DELETED-1' }] },
            },
          },
        },
      ],
    }));
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.goto(`${APP}/jobs`);
  // The sweep waits for the workspace to settle before deciding anything is
  // missing — that wait is the point, so give it room.
  await page.waitForTimeout(6000);

  const after = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
    const el = (d.canvasElements ?? []).find(e => e.id === 'CE-book');
    const cells = el?.data?.cells ?? {};
    const all = Object.values(cells).flat();
    const off = Object.values(el?.data?.offKept ?? {}).flatMap(c => Object.values(c).flat());
    return {
      jobIds: all.map(e => e.jobId).filter(Boolean),
      texts: all.map(e => e.text).filter(Boolean),
      offIds: off.map(e => e.jobId).filter(Boolean),
      onScreen: (document.body.innerText.match(/\(job removed\)/g) ?? []).length,
    };
  });
  console.log('       notebook after the sweep:', JSON.stringify(after));
  check(!after.jobIds.includes('G-DELETED-1') && !after.jobIds.includes('G-DELETED-2'),
    'entries for deleted jobs are gone', after.jobIds.join(', ') || 'none left');
  check(after.jobIds.includes('G-alive'), 'the live job is untouched');
  check(after.texts.includes('Pardes 8 am'), 'and so are the free-text entries');
  check(!after.offIds.includes('G-DELETED-1'),
    'including the ones held for somebody taken off the notebook', after.offIds.join(', ') || 'none left');
  check(after.onScreen === 0, 'nothing on screen still says "(job removed)"', `${after.onScreen} left`);
  await ctx.close();
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
