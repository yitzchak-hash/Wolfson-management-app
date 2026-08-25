// Building Progress cells scale to fit: the family name is legible at any
// widget size (auto-sized, wrapping to two rows when one is tight), the
// number steps smaller to make the room, a TALLER widget grows the cells
// themselves, and a tall cell earns the address line — address, number,
// name, in the owner's order.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  if (!localStorage.getItem('wolfson_app_data')) {
    const apt = (n, name, addr) => ({
      id: `A1-${n}`, buildingId: 'A1', floor: Math.ceil(n / 4) + 1, apartmentNumber: String(n),
      displayName: name, isUnnamed: false, isDuplexApt: false,
      classification: 'standard', generalNotes: '', address: addr,
      currentStageId: 'S1', stageDates: {},
      createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    });
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      apartments: [
        apt(1, 'Weinstein-Rosenblatt', '12 Wolfson St'),
        apt(2, 'Levi', '12 Wolfson St'),
        apt(3, 'Cohen', ''), apt(4, 'Artzi', ''),
        apt(5, 'Mizrahi', ''), apt(6, 'Peretz', ''), apt(7, 'Dahan', ''), apt(8, 'Biton', ''),
      ],
      stages: [{ id: 'S1', name: 'Piping', color: '#3b82f6', order: 1, active: true }],
      contractorAssignments: [],
    }));
  }
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    stages: [], contractors: [], contractorAssignments: [], apartments: [],
    canvasElements: [
      // The same workspace at two sizes: the board's default card, and a TALL one.
      { id: 'CE-small', type: 'widget', widget: 'project-mini', x: 40,  y: 240, w: 250, h: 165,
        text: '', color: '#ffffff', data: { projectId: 'wolfson' } },
      { id: 'CE-tall',  type: 'widget', widget: 'project-mini', x: 360, y: 240, w: 420, h: 620,
        text: '', color: '#ffffff', data: { projectId: 'wolfson' } },
      { id: 'CE-short', type: 'widget', widget: 'project-mini', x: 830, y: 240, w: 250, h: 100,
        text: '', color: '#ffffff', data: { projectId: 'wolfson' } },
    ],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(3500);

const readCell = (widgetId, aptId) => page.evaluate(([wid, aid]) => {
  const w = document.querySelector(`[data-node-id="${wid}"]`);
  const cell = w?.querySelector(`button[title^="1 —"], button[title*="${aid}"]`);
  return null;
}, [widgetId, aptId]);

const probe = await page.evaluate(() => {
  const read = (wid) => {
    const w = document.querySelector(`[data-node-id="${wid}"]`);
    if (!w) return null;
    // The long-named unit's cell: find the button whose title carries the name.
    const cells = [...w.querySelectorAll('button[title]')]
      .filter(x => (x.getAttribute('title') || '').includes('Weinstein'));
    const cell = cells[0];
    if (!cell) return { found: false };
    const r = cell.getBoundingClientRect();
    const spans = [...cell.querySelectorAll('span')];
    const name = spans.find(s => s.textContent.includes('Weinstein'));
    const num = spans.find(s => s.textContent.trim() === '1');
    const addr = spans.find(s => s.textContent.includes('Wolfson St'));
    const nr = name?.getBoundingClientRect();
    // WidgetSurface SCALES the widget's natural drawing, and computed
    // font-size stays in local px under a transform (the ScreenReport
    // lesson) — so real, on-screen sizes are local × the render scale.
    const scale = cell.getBoundingClientRect().height / cell.offsetHeight;
    const fsOf = el => el ? parseFloat(getComputedStyle(el).fontSize) * scale : 0;
    return {
      found: true,
      cellH: Math.round(r.height), cellW: Math.round(r.width),
      nameFs: Math.round(fsOf(name) * 10) / 10,
      nameLines: name ? Math.round(nr.height / (fsOf(name) * 1.12)) : 0,
      nameVisible: !!name && nr.height > 4 && nr.width > 4,
      numFs: Math.round(fsOf(num) * 10) / 10,
      hasAddr: !!addr,
      nameInside: !!name && nr.bottom <= r.bottom + 1.5 && nr.top >= r.top - 1.5,
    };
  };
  return { small: read('CE-small'), tall: read('CE-tall'), short: read('CE-short') };
});

check(!!probe.small?.found && !!probe.tall?.found, 'both widgets draw the Wolfson units',
  JSON.stringify({ s: probe.small?.found, t: probe.tall?.found }));
check(probe.small.nameVisible && probe.small.nameFs >= 4.5,
  'the long family name is VISIBLE and readable in the default-size card',
  `fs ${probe.small.nameFs}, lines ${probe.small.nameLines}`);
check(probe.small.nameInside, 'and it stays inside its cell');
check(probe.tall.cellH > probe.small.cellH + 8,
  'a TALLER widget grows the apartment cells themselves',
  `cell h ${probe.small.cellH} -> ${probe.tall.cellH}`);
check(probe.tall.nameFs >= 11,
  'a tall cell SPENDS its height on a big wrapped name',
  `fs ${probe.small.nameFs} -> ${probe.tall.nameFs}`);
check(probe.tall.nameLines >= 2 || probe.tall.nameFs >= 9,
  'a long name wraps to two rows (or fits big on one)',
  `lines ${probe.tall.nameLines}, fs ${probe.tall.nameFs}`);
check(probe.tall.hasAddr, 'a tall cell earns the ADDRESS line too');
check(!probe.short.hasAddr, 'a genuinely SHORT cell does not pretend it has address room',
  `short cell h ${probe.short?.cellH}`);
check(probe.short.nameVisible && probe.short.nameFs >= 4.5,
  'even the short cell keeps the name readable', `fs ${probe.short?.nameFs}`);
check(probe.tall.numFs > 0 && probe.small.numFs > 0
  && probe.small.numFs <= 12.1,
  'the number stays modest so the name gets the room',
  `num ${probe.small.numFs} / ${probe.tall.numFs}`);

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
