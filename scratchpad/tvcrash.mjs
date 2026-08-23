// Seed ONE OF EVERY WIDGET on the general board, open the BUILT bundle's /tv,
// and catch whichever widget crashes the page white. No error boundary wraps
// the wall, so one bad widget takes the whole page with it.
import { chromium } from 'playwright';

const IDS = `activity-feed add-bin address backlog-trend banner before-after bin-counter board-mini btu-hp bubble-wrap calculator calendar-mini celebrate checklist clock contact contractor-links contractor-load converter count-by-stage crew-race divider due-today duplicates floor-by-floor gone-quiet handover job-find job-list job-map job-search kpi legend lined-note link milestones multi-timer no-date no-plan nobody-booked notes-board open-snags order-list overdue-list photo photo-review progress-bar progress-ring project-glance project-mini quote recent-jobs recent-photos rota shabbat-clock skipped-stage spin-wheel split-flap stage-funnel stage-legend sticky-pad streak-flame table tally tap-in team-today tiktok timeline tv-clock tv-done-today tv-drive tv-feed tv-late tv-load tv-month tv-new tv-out-today tv-photo tv-photo-wall tv-stage-spread tv-tomorrow tv-waiting tv-week-done tv-workspace unit-card w-countdown w-stopwatch w-title weather week-ahead week-planner weekly-goal world-clocks`.trim().split(/\s+/);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function probe(name, ids) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(list => {
    localStorage.setItem('active_project', 'general');
    localStorage.setItem('general_app_version', '3');
    const els = list.map((w, i) => ({
      id: `CE-${w}`, type: 'widget', widget: w,
      x: 40 + (i % 10) * 260, y: 40 + Math.floor(i / 10) * 220,
      w: 240, h: 180, text: '', color: '#ffffff', data: {},
    }));
    localStorage.setItem('general_app_data', JSON.stringify({
      apartments: [{
        id: 'G-1', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'Job',
        isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: '',
        currentStageId: null, stageDates: {}, canvasX: 60, canvasY: 3000,
        createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
      }],
      canvasElements: els,
      contractors: [], contractorAssignments: [], stages: [],
    }));
  }, ids);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.slice(0, 300)));
  await page.goto('http://localhost:4173/tv');
  await page.waitForTimeout(3000);
  const alive = await page.evaluate(() => (document.body.innerText || '').includes('Job Board'));
  console.log(`${alive ? 'ALIVE' : 'WHITE'}  ${name}${errs.length ? ' — ' + errs[0] : ''}`);
  await ctx.close();
  return { alive, errs };
}

const all = await probe('ALL WIDGETS', IDS);
if (!all.alive || all.errs.length) {
  // Bisect: halves until the culprit names itself.
  let pool = IDS;
  while (pool.length > 1) {
    const half = pool.slice(0, Math.ceil(pool.length / 2));
    const r = await probe(`[${half.length}] ${half[0]}…`, half);
    pool = (!r.alive || r.errs.length) ? half : pool.slice(half.length);
  }
  console.log('CULPRIT:', pool[0]);
}
await b.close();
