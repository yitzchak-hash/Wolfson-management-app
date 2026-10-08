// Notebook look A (owner, 2026-10-08: "One, I want to do A" — "a small board
// tile"). A task on the weekly notebook is drawn as the Job Board's own tile,
// made small: a white card framed in the stage's colour, the unit's whole
// name, the stage as a one-line pill, "then X", the office's words, the set's
// strip and a pin line saying where. A tile is as tall as its words, so a lane
// is as tall as the tallest tile in it — and every square a tile passes keeps
// that room, so it never lies over the next thing in a square.
// Plus the three extras: a bare Job Board name borrows the client from its
// Drive folder, a report the app wrote itself shows no words of its own, and
// a bundle across two buildings names both.
// Dates are offsets from the real clock (the standing drift rule). No real
// client family names.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const sun = new Date(); sun.setDate(sun.getDate() - sun.getDay());
const dayOf = n => { const d = new Date(sun); d.setDate(d.getDate() + n); return iso(d); };
const SUN = dayOf(0), MON = dayOf(1), TUE = dayOf(2), WED = dayOf(3), THU = dayOf(4);

const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
await ctx.addInitScript(([SUN, MON, TUE, WED, THU]) => {
  if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  localStorage.setItem('board_default_zoom_general', '1');
  const stages = [
    { id: 'W-dr', name: 'Drilling', color: '#0891b2', order: 1, active: true },
    { id: 'W-pi', name: 'Piping', color: '#9ca3af', order: 2, active: true },
    { id: 'W-wa', name: 'Wall Units', color: '#f59e0b', order: 3, active: true },
    { id: 'S-inst', name: 'Installation', color: '#0ea5e9', order: 1, active: true, projectId: 'general' },
    { id: 'S-geves', name: 'Installation of Geves', color: '#a16207', order: 2, active: true, projectId: 'general' },
  ];
  const contractors = [
    { id: 'C-ig', name: 'Igor', category: 'ac', token: 'tok-ig', active: true, createdAt: '2026-01-01' },
    { id: 'C-mo', name: 'Moshe', category: 'ac', token: 'tok-mo', active: true, createdAt: '2026-01-01' },
  ];
  const currentUser = { id: 'U-t', name: 'A', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
  const wapt = (bld, n, name) => ({
    id: `${bld}-${n}`, buildingId: bld, floor: 2 + Math.floor((n - 1) / 4), colPosition: ((n - 1) % 4) + 1,
    apartmentNumber: String(n), displayName: name, isUnnamed: false, isDuplexApt: false,
    classification: 'standard', generalNotes: '', currentStageId: 'W-dr', stageDates: {},
    createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
  });
  const t = (id, apt, who, day, done, extra = {}) => ({
    id, apartmentId: apt, buildingId: apt.split('-')[0], contractorId: who,
    taskDescription: 'Drill the sleeves', stageId: 'W-dr', dueDate: day,
    completedAt: done ? `${day}T${done}:00.000Z` : null,
    createdAt: '2026-01-01', createdBy: 'U', createdByName: 'Office', ...extra,
  });
  if (!localStorage.getItem('wolfson_app_data')) {
    localStorage.setItem('wolfson_app_data', JSON.stringify({
      currentUser, contractors, stages,
      buildings: [{ id: 'A2', name: 'A2' }, { id: 'A3', name: 'A3' }],
      apartments: [
        wapt('A2', 9, 'Alpha'), wapt('A2', 10, 'Bravo'), wapt('A2', 13, 'Charlie'),
        wapt('A3', 21, 'Delta'), wapt('A3', 22, 'Echo'), wapt('A3', 14, 'Foxtrot'),
        wapt('A3', 5, 'Golf'), wapt('A3', 6, 'Hotel-Indigo-Juliet-Kilo'), wapt('A3', 23, ''),
      ],
      contractorAssignments: [
        // Monday: five singles across TWO buildings — one bundle naming both.
        t('T-b1', 'A2-9', 'C-ig', MON, '07:10'),
        t('T-b2', 'A2-10', 'C-ig', MON, '08:10'),
        t('T-b3', 'A2-13', 'C-ig', MON, null, { stageId: 'W-pi' }),
        t('T-b4', 'A3-21', 'C-ig', MON, '09:10'),
        t('T-b5', 'A3-22', 'C-ig', MON, '10:10', { stageId: 'W-pi' }),
        // Thursday: a report the APP wrote, and a unit nobody named yet.
        t('T-rep', 'A3-14', 'C-ig', THU, null, { stageReport: true, taskDescription: 'Drilling — working here today' }),
        t('T-noname', 'A3-23', 'C-ig', THU, null, { taskDescription: 'Check the sleeves' }),
        // Moshe: R (Mon–Tue) takes lane 0, S (Tue–Wed) lane 1. On Wednesday
        // lane 0 is EMPTY while S passes over lane 1 — the square must keep
        // both lanes' room or S lies over Wednesday's parked card.
        t('T-R', 'A3-5', 'C-mo', TUE, null, { days: [MON, TUE], stageId: 'W-wa',
          taskDescription: 'Hang the wall units in the living room and both bedrooms, then test every one of them' }),
        t('T-S', 'A3-6', 'C-mo', WED, null, { days: [TUE, WED], stageId: 'W-pi' }),
      ],
    }));
  }
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser, stages, contractors,
    contractorAssignments: [{
      id: 'T-vrf', apartmentId: 'G-vrf', buildingId: 'G', contractorId: 'C-ig',
      taskDescription: 'Hang the six indoor units', stageId: 'S-inst', stageWhenDone: 'S-geves',
      dueDate: THU, completedAt: null, createdAt: '2026-01-01', createdBy: 'U', createdByName: 'Office',
    }],
    apartments: [{
      id: 'G-vrf', buildingId: 'G', floor: 0, apartmentNumber: '', displayName: 'VRF job', isUnnamed: false,
      driveFolderName: 'Rimonim, Ofira - 4411 - roof', address: '7 Kalanit St',
      isDuplexApt: false, classification: 'standard', generalNotes: '', currentStageId: 'S-inst', stageDates: {},
      canvasX: 60, canvasY: 1400, createdAt: '2026-01-01', updatedAt: '2026-01-01', updatedBy: 'U', updatedByName: 'U',
    }],
    canvasElements: [
      { id: 'CE-rota', type: 'widget', widget: 'rota', x: 160, y: 120, w: 1100, h: 760, text: '', color: '#ffffff',
        data: { people: ['c:C-ig', 'c:C-mo'], firstWeek: SUN, weekCount: 1, span: 5,
          cells: { [`c:C-mo|${WED}`]: [{ id: 'E-park', jobId: 'G-vrf' }] } } },
      { id: 'CE-goals-board', type: 'widget', widget: 'goals', x: 40, y: 1900, w: 300, h: 200, text: '', color: '#ffffff', data: {} },
    ],
  }));
}, [SUN, MON, TUE, WED, THU]);

const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
await page.goto(`${APP}/jobs`);
await page.waitForSelector('[data-task-bar]', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1200);

const tile = id => page.evaluate(id => {
  const el = document.querySelector(`[data-task-bar="${id}"]`);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const lab = el.querySelector('[data-bar-label]');
  return {
    look: el.getAttribute('data-bar-look'), bg: cs.backgroundColor, frame: cs.borderTopColor,
    label: lab?.textContent ?? '', clipped: lab ? lab.scrollWidth > lab.clientWidth + 1 : null,
    pills: [...el.querySelectorAll('[data-bar-stage]')].map(p => ({
      id: p.getAttribute('data-bar-stage'), text: p.textContent, ws: getComputedStyle(p).whiteSpace,
      fs: parseFloat(getComputedStyle(p).fontSize), cut: p.scrollWidth > p.clientWidth + 1,
    })),
    then: el.querySelector('[data-bar-then]')?.textContent ?? '',
    desc: el.querySelector('[data-bar-desc]')?.textContent ?? null,
    text: el.textContent,
    h: el.getBoundingClientRect().height,
  };
}, id);

// ── 1 · the tile itself ─────────────────────────────────────────────────────
{
  const r = await tile('T-noname');
  check(r?.look === 'tile', '1 · a task draws as the tile look', r?.look);
  check(r?.bg === 'rgb(255, 255, 255)' && r?.frame === 'rgb(8, 145, 178)', '1 · a white card framed in its stage’s colour (Drilling)', `${r?.bg} · ${r?.frame}`);
  check(r?.pills.length === 1 && r.pills[0].text === 'Drilling' && r.pills[0].ws === 'nowrap' && r.pills[0].fs >= 6.5,
    '1 · the stage is one pill on one line, never below 6.5', JSON.stringify(r?.pills));
  check(/23/.test(r?.label ?? '') && /no name yet/.test(r?.label ?? ''), '1 · a unit with no family says so quietly', r?.label);
  check(r?.desc === 'Check the sleeves', "1 · the office's own words are on the tile", r?.desc);
  check(/A3/.test(r?.text ?? '') && /Floor 6/.test(r?.text ?? '') && /Wolfson/.test(r?.text ?? ''), '1 · the pin line says where: Wolfson · A3 · Floor 6 (as the diagram prints it)', r?.text);
}

// ── 2 · a report the app wrote shows no words of its own ────────────────────
{
  const r = await tile('T-rep');
  check(!!r && r.desc === null && !/working here today/.test(r.text), '2 · "Drilling — working here today" is not repeated on the tile', r?.text);
  check(r?.pills[0]?.text === 'Drilling', '2 · the pill already says what it is', JSON.stringify(r?.pills));
}

// ── 3 · a bare Job Board name borrows the client from its Drive folder ──────
{
  const r = await tile('T-vrf');
  check(r?.label === 'Rimonim, Ofira · VRF job', '3 · "VRF job" reads "Rimonim, Ofira · VRF job"', r?.label);
  check(r?.then === 'then Installation of Geves', '3 · and "then Installation of Geves" under the pill', r?.then);
  check(r?.pills[0]?.text === 'Installation', '3 · the pill is the stage it is ON', JSON.stringify(r?.pills));
  check(/7 Kalanit St/.test(r?.text ?? '') && !/Wolfson/.test(r?.text ?? ''), '3 · its pin line is the address', r?.text);
}

// ── 4 · every unit name whole, every pill whole ─────────────────────────────
{
  const all = await page.evaluate(() => [...document.querySelectorAll('[data-task-bar]')].map(el => {
    const lab = el.querySelector('[data-bar-label]');
    return { id: el.getAttribute('data-task-bar'), clipped: lab ? lab.scrollWidth > lab.clientWidth + 1 : true,
      pillCut: [...el.querySelectorAll('[data-bar-stage]')].some(p => p.scrollWidth > p.clientWidth + 1) };
  }));
  check(all.length >= 5 && all.every(x => !x.clipped), '4 · no unit name is cut on any tile', JSON.stringify(all.filter(x => x.clipped)));
  check(all.every(x => !x.pillCut), '4 · no stage pill is cut — the type shrank to fit', JSON.stringify(all.filter(x => x.pillCut)));
}

// ── 5 · each square stacks its own tiles; a long tile lies over clear room ──
{
  const lay = await page.evaluate(([WED, THU]) => {
    const rect = el => el.getBoundingClientRect();
    const tiles = [...document.querySelectorAll('[data-task-bar],[data-task-bundle]')].map(el => ({ id: el.getAttribute('data-task-bar') ?? 'bundle', r: rect(el) }));
    const R = tiles.find(t => t.id === 'T-R'), S = tiles.find(t => t.id === 'T-S');
    const cellOf = (p, d) => [...document.querySelectorAll(`[data-cell-person="${p}"]`)].find(c => c.getAttribute('data-cell-day') === d);
    const park = cellOf('c:C-mo', WED)?.querySelector('.planner-card');
    // Any card in any square starts below every tile drawn across that square.
    const under = [];
    for (const card of document.querySelectorAll('[data-cell-day] .planner-card')) {
      const c = rect(card);
      for (const t of tiles) {
        if (t.r.left < c.right - 1 && c.left < t.r.right - 1 && t.r.top < c.bottom - 0.5 && c.top < t.r.bottom - 0.5) under.push(t.id);
      }
    }
    // No two tiles cover each other.
    const clash = [];
    tiles.forEach((a, i) => tiles.forEach((b2, j) => {
      if (j > i && a.r.left < b2.r.right - 1 && b2.r.left < a.r.right - 1 && a.r.top < b2.r.bottom - 0.5 && b2.r.top < a.r.bottom - 0.5) clash.push(`${a.id}/${b2.id}`);
    }));
    const thu = cellOf('c:C-ig', THU);
    const t23 = tiles.find(t => t.id === 'T-noname'), t14 = tiles.find(t => t.id === 'T-rep');
    return {
      rH: R?.r.height ?? 0, sBottom: S?.r.bottom ?? 0, parkTop: park ? rect(park).top : null,
      under, clash,
      firstGap: t23 && thu ? Math.round(t23.r.top - rect(thu).top) : null,
      nextGap: t23 && t14 ? Math.round(t14.r.top - t23.r.bottom) : null,
    };
  }, [WED, THU]);
  check(lay.rH > 60, '5 · a tile with long words grows to hold them', `${Math.round(lay.rH)}px`);
  check(lay.parkTop !== null && lay.parkTop >= lay.sBottom - 0.5, '5 · the tile from Tuesday never lies over Wednesday’s card', `card ${lay.parkTop} vs tile bottom ${lay.sBottom}`);
  check(!lay.under.length, '5 · no card anywhere sits under a tile', JSON.stringify(lay.under));
  check(!lay.clash.length, '5 · no two tiles cover each other', JSON.stringify(lay.clash));
  check(lay.firstGap !== null && lay.firstGap <= 6, "5 · Thursday's first tile sits at the top of its square — no hole as tall as Monday's bundle", `${lay.firstGap}px`);
  check(lay.nextGap !== null && lay.nextGap >= 0 && lay.nextGap <= 6, '5 · and the next tile sits right under it', `${lay.nextGap}px`);
}

// ── 6 · the bundle names both buildings, its stages and "See all" ───────────
{
  const bun = await page.evaluate(() => {
    const el = document.querySelector('[data-task-bundle]');
    if (!el) return null;
    return {
      text: el.textContent, n: el.getAttribute('data-task-bundle'),
      stages: [...el.querySelectorAll('[data-bundle-stage]')].map(p => p.textContent),
      seeAll: el.querySelector('[data-bundle-see-all]')?.textContent ?? '',
      shareW: el.querySelector('[data-bundle-share]')?.style.width ?? '',
    };
  });
  check(bun?.n === '5', '6 · Monday’s five singles are one bundle', bun?.n);
  check(/A2/.test(bun?.text ?? '') && /A3/.test(bun?.text ?? ''), '6 · it names BOTH buildings', bun?.text);
  check(/A2 · Floors 3–4/.test(bun?.text ?? '') && /A3 · Floor 6/.test(bun?.text ?? ''), '6 · each with its own floors', bun?.text);
  check(bun?.stages.join('|') === 'Drilling 3|Piping 2', '6 · a pill per stage with its count', bun?.stages.join('|'));
  check(/See all 5/.test(bun?.seeAll ?? ''), '6 · and "See all 5 ›"', bun?.seeAll);
  check(bun?.shareW === '80%', '6 · the done share is 4 of 5', bun?.shareW);
}

// ── 7 · nothing smoulders: tiles measure once and rest ──────────────────────
{
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  await page.mouse.move(5, 500);
  await page.waitForTimeout(800);
  const a = await m();
  await page.waitForTimeout(3000);
  const z = await m();
  const scriptPerSec = (z.ScriptDuration - a.ScriptDuration) / 3 * 1000;
  check(scriptPerSec < 120, '7 · idle with the notebook on screen: no measuring loop', `${Math.round(scriptPerSec)}ms of script per second`);
}

await page.screenshot({ path: 'scratchpad/notebooktile.png' });
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
