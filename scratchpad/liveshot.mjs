// A screenshot of the apartment drawer from the LIVE build.
//
// Two things this has to work around, both real and neither hidden:
//   · the headless browser in this container cannot reach the internet — every
//     request is ERR_CONNECTION_RESET (the project notes already name this) —
//     so the deployed bundle is MIRRORED with curl and served locally. The
//     JavaScript and CSS are byte-for-byte what wolfson-management-app.vercel.app
//     is serving right now.
//   · with Firebase unreachable, `login()` deliberately refuses rather than
//     failing open (the auth hardening rule). So the session is seeded straight
//     into localStorage instead, which is what the app does after a real login.
//
// The data is therefore seeded, not the office's own records. Everything about
// the DRAWER — its layout, its tabs, its controls — is the live build's.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { extname, join } from 'path';

const ROOT = '/tmp/live';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

// A static server with SPA fallback, so /project serves index.html.
const srv = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  let file = join(ROOT, path === '/' ? 'index.html' : path);
  if (!existsSync(file) || path === '/') file = join(ROOT, 'index.html');
  if (!existsSync(file)) file = join(ROOT, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise(r => srv.listen(4599, r));
const APP = 'http://localhost:4599';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2 });

// Nothing outbound can succeed here anyway; failing fast beats a 30s hang.
await ctx.route('**://*.googleapis.com/**', r => r.abort());
await ctx.route('**://*.google.com/**', r => r.abort());
await ctx.route('**://*.firebaseio.com/**', r => r.abort());

const FAMILIES = ['Rottenstreich, Yosef', 'Topper, Avraham', 'Weinstein, Steven',
  'Aharonov, Moshe', 'Nahon, Yitzchak', 'Cohen, David'];
// `active: true` matters: the drawer's stage picker filters on it and the
// diagram does not, so leaving it off gave a cell reading "Thermostats & …"
// beside a picker reading "Not Started" — the seed's fault, not the app's.
const STAGES = [
  { id: 's1', name: 'Sleeves & Openings', color: '#64748b', order: 1, active: true },
  { id: 's2', name: 'Piping & Drainage', color: '#0ea5e9', order: 2, active: true },
  { id: 's3', name: 'AC installation', color: '#8b5cf6', order: 3, active: true },
  { id: 's4', name: 'Thermostats & Haffala', color: '#f59e0b', order: 4, active: true },
  { id: 's5', name: 'Job completed', color: '#10b981', order: 5, active: true },
];

await ctx.addInitScript(([fams, stages]) => {
  localStorage.setItem('active_project', 'wolfson');
  localStorage.setItem('wolfson_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('wolfson_app_data')) return;

  const apts = [];
  for (const bld of ['A1', 'A2', 'A3']) {
    for (let n = 1; n <= 56; n++) {
      const floor = n <= 52 ? 2 + Math.floor((n - 1) / 4) : n <= 54 ? 15 : 16;
      apts.push({
        id: `${bld}-${n}`, buildingId: bld, floor, apartmentNumber: String(n),
        displayName: n % 3 === 0 ? fams[n % fams.length] : '',
        isUnnamed: bld === 'A1' && n === 37,
        isDuplexApt: false,
        classification: n % 7 === 0 ? 'shinui' : 'standard',
        currentStageId: stages[n % stages.length].id,
        stageDates: {},
        address: 'W Residence, Wolfson',
        driveLink: n % 3 === 0 ? 'https://drive.google.com/drive/folders/EXAMPLE' : undefined,
        generalNotes: n % 3 === 0
          ? 'Owner asked for the bedroom unit to be moved to the far wall. Waiting on the electrician before the thermostat run.'
          : '',
        createdAt: '2026-01-01', updatedAt: '2026-08-18',
        contentUpdatedAt: '2026-08-18',
        updatedBy: 'U-1', updatedByName: 'Esther',
      });
    }
  }
  localStorage.setItem('wolfson_app_data', JSON.stringify({
    // What the app itself writes after a real login. Seeded because with
    // Firebase unreachable `login()` correctly refuses rather than failing open.
    currentUser: { id: 'U-1', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    users: [{ id: 'U-1', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' }],
    stages,
    apartments: apts,
    buildings: [
      { id: 'A1', name: 'A1', projectId: 'wolfson' },
      { id: 'A2', name: 'A2', projectId: 'wolfson' },
      { id: 'A3', name: 'A3', projectId: 'wolfson' },
    ],
    contractors: [
      { id: 'C-1', name: 'Moshe Levi', category: 'ac', token: 'tok1', active: true, createdAt: '2026-01-01' },
    ],
    contractorAssignments: [
      { id: 'T-1', apartmentId: 'A1-33', contractorId: 'C-1', description: 'Hang the two indoor units in the bedrooms',
        stageId: 's3', dueDate: '2026-08-21', priority: 'urgent', completed: false, createdAt: '2026-08-18' },
      { id: 'T-2', apartmentId: 'A1-33', contractorId: 'C-1', description: 'Pressure test the gas lines',
        stageId: 's2', dueDate: '2026-08-24', priority: 'normal', completed: true, createdAt: '2026-08-15' },
    ],
  }));
}, [FAMILIES, STAGES]);

const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
await page.goto(`${APP}/project`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4500);

// The diagram's cells carry no id attribute — the other plan harnesses find
// one by its text, and so does this. Assert the route DREW before measuring:
// a page that rendered nothing passes every check.
const where = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('div')]
    .filter(d => d.className.includes('cursor-pointer') && d.className.includes('rounded-md')
      && /^\d{1,2}/.test((d.textContent ?? '').trim()));
  return {
    path: location.pathname,
    cells: cells.length,
    title: (document.querySelector('h1')?.textContent ?? '').trim(),
    body: (document.body.innerText ?? '').replace(/\s+/g, ' ').slice(0, 240),
  };
});
console.log('landed:', JSON.stringify(where));
if (where.cells === 0) {
  console.log('no apartment cells — the page did not draw; a shot here would prove nothing');
  await page.screenshot({ path: 'scratchpad/live-fail.png' });
  await b.close(); srv.close(); process.exit(1);
}

// A unit with a family name AND tasks, so the drawer has something in it.
// Apartment 33 in A1: it has a family name, notes and two tasks on it.
const opened = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('div')]
    .filter(d => d.className.includes('cursor-pointer') && d.className.includes('rounded-md'));
  const cell = cells.find(d => (d.textContent ?? '').trim().startsWith('33'));
  if (!cell) return false;
  cell.click();
  return true;
});
console.log('clicked a cell:', opened);
await page.waitForTimeout(3000);

const drawer = await page.evaluate(() => {
  const d = document.querySelector('.drawer-panel');
  if (!d) return null;
  const r = d.getBoundingClientRect();
  return {
    w: Math.round(r.width), h: Math.round(r.height),
    tabs: [...d.querySelectorAll('button')].map(b => (b.textContent ?? '').trim())
      .filter(t => /^(Details|Tasks|Stages|History|Photos|Plan)/i.test(t)),
  };
});
console.log('drawer:', JSON.stringify(drawer));
if (!drawer) {
  await page.screenshot({ path: 'scratchpad/live-fail.png' });
  console.log('the drawer did not open');
  await b.close(); srv.close(); process.exit(1);
}

// The diagram cell says "Thermostats & …" and the drawer's picker says
// "Not Started". One of them is wrong, or the seed is missing a field the
// drawer needs — worth knowing before the shot is handed over.
const stage = await page.evaluate(() => {
  const sel = document.querySelector('.drawer-panel select');
  const d = JSON.parse(localStorage.getItem('wolfson_app_data') ?? '{}');
  const apt = (d.apartments ?? []).find(a => a.id === 'A1-33');
  return {
    value: sel?.value ?? null,
    options: [...(sel?.options ?? [])].map(o => `${o.value}:${o.textContent}`),
    aptStage: apt?.currentStageId ?? null,
    stagesInStore: (d.stages ?? []).map(x => x.id),
  };
});
console.log('stage picker:', JSON.stringify(stage));

await page.screenshot({ path: 'scratchpad/live-drawer.png' });

// And the Tasks tab, since that is where the drawer has the most to show.
await page.evaluate(() => [...document.querySelectorAll('.drawer-panel button')]
  .find(b => /^Tasks/i.test((b.textContent ?? '').trim()))?.click());
await page.waitForTimeout(1200);
await page.screenshot({ path: 'scratchpad/live-drawer-tasks.png' });

console.log('shots written');
await b.close();
srv.close();
