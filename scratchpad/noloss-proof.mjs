// THE CLOUD NEVER LOSES DATA — proof for "save only what changed" (2026-10-29).
//
// Two real incidents, replayed against a REAL Firestore (the emulator) with the
// real app in a real browser:
//   1. A BRAND-NEW BROWSER (2026-10-29 09:35): a logged-in browser with no
//      local data opens Wolfson, then the Job Board. Its starter copy must
//      never reach the cloud: every tick, stage, board setting and pin stays.
//   2. A STALE COMPUTER (2026-10-28 10:31): a computer loads the Job Board,
//      goes offline (asleep), the office keeps working elsewhere (pins added,
//      ticks set, settings changed, a note edited), then the stale computer
//      makes its own edits and comes back. Both sides' work must survive.
//
// Needs: the emulator on 8085 (firebase emulators:start --only firestore
// --project demo-patch). Stage ids avoid s1/s4/s7: those trigger the app's own
// one-time stage split (an intended upgrade, already applied in production). and a dev server on 5176 started with the six
// VITE_FIREBASE_* fakes (project id demo-patch) + VITE_FIRESTORE_EMULATOR=127.0.0.1:8085.
// Run: NODE_PATH=/opt/node-tools/node_modules node scratchpad/noloss-proof.mjs
import { createRequire } from 'module';
// Playwright is the machine's own install (NODE_PATH), not a project dependency.
const { chromium } = createRequire(import.meta.url)('playwright');
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, getDocs, collection, writeBatch, updateDoc } from 'firebase/firestore';

const PROJECT = 'demo-patch';
const app = initializeApp({ projectId: PROJECT, apiKey: 'demo', appId: 'demo' });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8085);

let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = v => JSON.stringify(v);

// ── the cloud as the office has it ──────────────────────────────────────────
const USER = { id: 'U', name: 'Office', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };
const STAGES = [
  { id: 'w1', name: 'Piping', color: '#6366f1', order: 1, active: true, kind: 'work' },
  { id: 'w2', name: 'Units', color: '#10b981', order: 2, active: true, kind: 'work' },
  { id: 'w3', name: 'Finish', color: '#f59e0b', order: 3, active: false, kind: 'work' },
  { id: 'g1', name: 'Measure', color: '#64748b', order: 1, active: true, kind: 'work', projectId: 'general' },
  { id: 'g2', name: 'Install', color: '#0ea5e9', order: 2, active: true, kind: 'work', projectId: 'general' },
];
const flat = i => ({
  id: `A1-${i}`, buildingId: 'A1', floor: 1 + Math.floor(i / 4), apartmentNumber: String(i), displayName: `Family ${i}`,
  isUnnamed: false, isDuplexApt: false, classification: 'standard', generalNotes: `note ${i}`, tipus: 'T1',
  currentStageId: 'w2', stageMarks: { w1: 'done', w2: 'doing' }, stageDates: { w1: '2026-10-01' }, bubbles: true,
  createdAt: '2026-01-01', updatedAt: '2026-10-20T08:00:00.000Z', updatedBy: 'U', updatedByName: 'Office',
});
const job = i => ({
  id: `G-${i}`, buildingId: 'G', floor: 0, apartmentNumber: '', displayName: `Job ${i}`, isUnnamed: false, isDuplexApt: false,
  classification: 'standard', generalNotes: '', currentStageId: 'g1', stageMarks: { g1: 'doing' }, stageDates: {}, bubbles: true,
  canvasX: 100 + i * 240, canvasY: 400, createdAt: '2026-01-01', updatedAt: '2026-10-20T08:00:00.000Z', updatedBy: 'U', updatedByName: 'Office',
  ...(i <= 4 ? { inNotebook: 'CE-pins' } : {}),
});
const pin = i => ({ id: `PN-${i}`, jobId: `G-${i}`, x: 0.1 * i, y: 0.3, rot: 1, at: '2026-10-20T08:00:00.000Z' });
const PINBOARD = { id: 'CE-pins', type: 'widget', widget: 'pin-board', x: 100, y: 100, w: 420, h: 300, z: 3,
  data: { title: 'Waiting For Geves', look: 'cork', pins: [1, 2, 3, 4].map(pin) } };
const NOTE = { id: 'CE-note', type: 'note', x: 700, y: 100, w: 200, h: 160, z: 4, text: 'Call the supplier', color: 'yellow' };
const SETTINGS = {
  autoBackup: false,
  boardSettings: {
    wolfson: { buildingLayout: { A1: { col: 0 } }, customButtons: [{ id: 'cb1', label: 'Zoho' }], stickyBuildingName: true },
    general: { viewMode: 'board', plannerArchive: { 'CE-old': { cells: { mon: ['G-9'] } } }, themeId: 'cork' },
    netiv: { stickyBuildingName: true },
    __tv: { timeOff: [{ id: 'to1', who: 'Tzvi', from: '2026-11-01' }], tvScreens: { lobby: { w: 1920 } } },
  },
};

async function seed() {
  await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  const b = writeBatch(db);
  for (const s of STAGES) b.set(doc(db, 'stages', s.id), s);
  b.set(doc(db, 'users', USER.id), USER);
  for (let i = 1; i <= 24; i++) b.set(doc(db, 'apartments', `A1-${i}`), flat(i));
  for (let i = 1; i <= 8; i++) b.set(doc(db, 'general_apartments', `G-${i}`), job(i));
  b.set(doc(db, 'general_canvasElements', PINBOARD.id), PINBOARD);
  b.set(doc(db, 'general_canvasElements', NOTE.id), NOTE);
  b.set(doc(db, 'settings', 'app'), SETTINGS);
  // A workspace's sync decides "the cloud answered" on its jobs, tasks and
  // stage notes — the real ones all have some.
  for (const c of ['', 'general_']) {
    b.set(doc(db, `${c}contractorAssignments`, `T-${c}1`), { id: `T-${c}1`, apartmentId: c ? 'G-1' : 'A1-1', buildingId: c ? 'G' : 'A1',
      contractorId: 'C-1', taskDescription: 'Check', stageId: null, dueDate: '2026-11-02', priority: 'normal', createdAt: '2026-10-01', createdBy: 'U', createdByName: 'Office', completedAt: null });
    b.set(doc(db, `${c}stageNotes`, `N-${c}1`), { id: `N-${c}1`, apartmentId: c ? 'G-1' : 'A1-1', stageId: c ? 'g1' : 'w1', noteText: 'ok',
      updatedAt: '2026-10-01', updatedBy: 'U', updatedByName: 'Office' });
  }
  await b.commit();
}
const read = async (c, id) => { const s = await getDoc(doc(db, c, id)); return s.exists() ? s.data() : null; };
async function readAll() {
  const out = {};
  for (const c of ['stages', 'apartments', 'general_apartments', 'general_canvasElements', 'settings', 'contractorAssignments', 'general_contractorAssignments', 'stageNotes', 'general_stageNotes']) {
    const snap = await getDocs(collection(db, c));
    for (const d of snap.docs) out[`${c}/${d.id}`] = d.data();
  }
  return out;
}
/**
 * Every value that was in `before` is still in `after`, unchanged — except at
 * paths listed in `allowed` (the changes a scenario made on purpose). New
 * fields (a tipus filled, an _updatedAt) are fine; a lost or altered one is not.
 */
function lost(before, after, allowed = []) {
  const bad = [];
  const walk = (a, b, p) => {
    if (allowed.some(x => p === x || p.startsWith(x + '.'))) return;
    if (p.endsWith('._updatedAt') || p.endsWith('.updatedAt') || p.endsWith('.updatedBy') || p.endsWith('.updatedByName')) return;
    if (a && typeof a === 'object' && !Array.isArray(a)) {
      if (!b || typeof b !== 'object' || Array.isArray(b)) { bad.push(`${p}: ${J(a).slice(0, 80)} → ${J(b)}`); return; }
      for (const k of Object.keys(a)) walk(a[k], b[k], `${p}.${k}`);
      return;
    }
    if (J(a) !== J(b)) bad.push(`${p}: ${J(a).slice(0, 80)} → ${J(b)?.slice?.(0, 80) ?? J(b)}`);
  };
  for (const k of Object.keys(before)) walk(before[k], after[k], k);
  return bad;
}

const browser = await chromium.launch();
/** A browser that is logged in and has NOTHING else (a brand-new browser). */
const freshBrowser = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(user => {
    if (sessionStorage.getItem('booted')) return;
    sessionStorage.setItem('booted', '1');
    for (const k of ['wolfson', 'general', 'netiv']) localStorage.setItem(`${k}_app_version`, '3');
    localStorage.setItem('whats_new_seen', '2099-01-01');
    if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
    for (const k of ['wolfson', 'general']) {
      if (!localStorage.getItem(`${k}_app_data`)) localStorage.setItem(`${k}_app_data`, JSON.stringify({ currentUser: user }));
    }
  }, USER);
  return ctx;
};
const errs = [];
let scene = '';
const open = async (ctx, path) => {
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`[${scene}] ${e.message.slice(0, 100)}${process.env.DEBUG ? ' ' + (e.stack || '').split('\n').slice(9, 40).join(' / ') : ''}`));
  await page.goto(`http://localhost:5176${path}`);
  return page;
};
const synced = (page, pid) => page.waitForFunction(p => window.__store?.getState().cloudSyncedProject === p, pid, { timeout: 30000 });
const switchTo = async (page, pid) => {
  await page.evaluate(p => window.__store.getState().setCurrentProject(p), pid);
  await synced(page, pid);
};

// ════ 1 · A BRAND-NEW BROWSER ════════════════════════════════════════════════
scene = 'new browser';
await seed();
const before1 = await readAll();
{
  const ctx = await freshBrowser();
  const page = await open(ctx, '/project');
  if (process.env.DEBUG) await page.evaluate(() => {
    const st = window.__store.getState(); window.__calls = {};
    for (const k of Object.keys(st)) if (typeof st[k] === 'function' && /^(update|set[A-Z]|add|move|bulk|migrate|fill|split|save|restore|place|archive|delete|apply)/.test(k) && k !== 'setState') {
      const f = st[k]; window.__store.setState({ [k]: (...a) => { const c = window.__calls[k] ??= { n: 0, stack: '' }; c.n++; if (c.n === 30) c.stack = new Error().stack.split('\n').slice(2, 7).join(' / '); return f(...a); } });
    }
  });
  await synced(page, 'wolfson');
  await sleep(6000);            // the on-open repairs (1.6 s after the last change) have run
  await switchTo(page, 'general');
  await sleep(6000);            // and the Job Board's own (pin board re-adds, sweeps)
  await switchTo(page, 'wolfson');
  await sleep(4000);
  if (process.env.DEBUG) for (const [k, v] of Object.entries(await page.evaluate(() => window.__calls)).sort((a, b) => b[1].n - a[1].n).slice(0, 6)) console.log('  calls', k, v.n, v.stack.slice(0, 600));
  await ctx.close();
}
const after1 = await readAll();
const lost1 = lost(before1, after1);
check(lost1.length === 0, 'brand-new browser: nothing in the cloud was lost or changed', lost1.slice(0, 6).join(' | '));
check(J(after1['general_canvasElements/CE-pins']?.data?.pins?.map(p => p.id)) === J(['PN-1', 'PN-2', 'PN-3', 'PN-4']), 'brand-new browser: the pin board kept its 4 pins');
check(Object.keys(after1['settings/app']?.boardSettings ?? {}).sort().join() === '__tv,general,netiv,wolfson', 'brand-new browser: every workspace\'s board settings are still there');
check(Object.keys(after1).length >= Object.keys(before1).length, 'brand-new browser: no record disappeared');

// ════ 2 · A STALE COMPUTER ═══════════════════════════════════════════════════
scene = 'stale';
await seed();
{
  const ctx = await freshBrowser();
  const page = await open(ctx, '/general');
  await page.evaluate(() => window.__store.getState().setCurrentProject('general'));
  await synced(page, 'general');
  await sleep(3000);
  // Asleep: no line to the cloud.
  await ctx.setOffline(true);
  await sleep(500);

  // Meanwhile, the office works on another computer.
  const pinsNow = (await read('general_canvasElements', 'CE-pins')).data.pins;
  await updateDoc(doc(db, 'general_canvasElements', 'CE-pins'), { 'data.pins': [...pinsNow, pin(5), pin(6)] });
  await updateDoc(doc(db, 'general_apartments', 'G-1'), { 'stageMarks.g2': 'done', generalNotes: 'measured, ready' });
  await updateDoc(doc(db, 'settings', 'app'), { 'boardSettings.wolfson.customButtons': [{ id: 'cb1', label: 'Zoho' }, { id: 'cb2', label: 'Drive' }] });
  await updateDoc(doc(db, 'general_canvasElements', 'CE-note'), { text: 'Call the supplier — done, see Tzvi' });
  // a workspace this computer has never seen gets its first setting
  await updateDoc(doc(db, 'settings', 'app'), { 'boardSettings.lev.color': 'teal' });
  const between = await readAll();

  // The stale computer, still on its old copy, does its own work.
  await page.evaluate(() => {
    const st = window.__store.getState();
    const u = st.currentUser;
    const board = st.canvasElements.find(e => e.id === 'CE-pins');
    // a pin added on its (old) board
    st.updateCanvasElement('CE-pins', { data: { ...board.data, pins: [...board.data.pins, { id: 'PN-7', jobId: 'G-7', x: 0.7, y: 0.6, rot: 0, at: new Date().toISOString() }] } });
    // the note widget moved (not edited)
    st.updateCanvasElement('CE-note', { x: 760, y: 140 });
    // a different job's stage ticked
    st.updateApartment('G-2', { stageMarks: { g1: 'done', g2: 'doing' } }, u);
    // the same job someone else just edited: a different field
    st.updateApartment('G-1', { canvasX: 999 }, u);
    // one board setting of this workspace
    st.setBoardSetting('viewMode', 'list');
    // and this computer sets one in that same workspace, without knowing it exists
    st.setBoardSettingFor('lev', 'stickyBuildingName', true);
  });
  await sleep(1500);
  await ctx.setOffline(false);   // wakes up
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await sleep(9000);             // queued writes flush; the pin merge retries once reachable
  await ctx.close();

  const after2 = await readAll();
  // What the stale computer changed on purpose:
  const mine = [
    'general_canvasElements/CE-pins.data.pins', 'general_canvasElements/CE-note.x', 'general_canvasElements/CE-note.y',
    'general_apartments/G-2.stageMarks', 'general_apartments/G-2.currentStageId', 'general_apartments/G-2.stageDates', 'general_apartments/G-2.contentUpdatedAt',
    'general_apartments/G-1.canvasX', 'settings/app.boardSettings.general.viewMode', 'settings/app.boardSettings.lev.stickyBuildingName',
  ];
  const lost2 = lost(between, after2, mine);
  check(lost2.length === 0, 'stale computer: none of the office\'s newer work was overwritten', lost2.slice(0, 6).join(' | '));
  const pins = after2['general_canvasElements/CE-pins']?.data?.pins?.map(p => p.id) ?? [];
  check(J([...pins].sort()) === J(['PN-1', 'PN-2', 'PN-3', 'PN-4', 'PN-5', 'PN-6', 'PN-7']), 'stale computer: the pin board holds both sides\' pins', J(pins));
  check(after2['general_apartments/G-1']?.stageMarks?.g2 === 'done' && after2['general_apartments/G-1']?.generalNotes === 'measured, ready',
    'stale computer: the tick and note set elsewhere on G-1 survived');
  check(after2['general_apartments/G-1']?.canvasX === 999, 'stale computer: its own move of G-1 arrived');
  check(after2['general_apartments/G-2']?.stageMarks?.g1 === 'done', 'stale computer: its own tick on G-2 arrived');
  check(after2['general_canvasElements/CE-note']?.text === 'Call the supplier — done, see Tzvi' && after2['general_canvasElements/CE-note']?.x === 760,
    'stale computer: the note keeps the newer text AND its own move');
  check(J(after2['settings/app']?.boardSettings?.wolfson?.customButtons?.map(b => b.id)) === J(['cb1', 'cb2']), 'stale computer: Wolfson\'s new button (set elsewhere) survived');
  check(after2['settings/app']?.boardSettings?.general?.viewMode === 'list', 'stale computer: its own board setting arrived');
  check(J(after2['settings/app']?.boardSettings?.__tv) === J(SETTINGS.boardSettings.__tv), 'stale computer: the TV settings were not touched');
  check(after2['settings/app']?.boardSettings?.lev?.color === 'teal' && after2['settings/app']?.boardSettings?.lev?.stickyBuildingName === true,
    'stale computer: a workspace it never saw keeps the cloud\'s setting AND gets its own');
}

// ════ 3 · NOTHING CHANGED → NOTHING WRITTEN ══════════════════════════════════
scene = 'no-op';
await seed();
{
  const ctx = await freshBrowser();
  const page = await open(ctx, '/general');
  await page.evaluate(() => window.__store.getState().setCurrentProject('general'));
  await synced(page, 'general');
  await sleep(3000);
  const t0 = (await getDoc(doc(db, 'general_canvasElements', 'CE-note'))).data()._updatedAt ?? null;
  await page.evaluate(() => {
    const st = window.__store.getState();
    const el = st.canvasElements.find(e => e.id === 'CE-note');
    st.updateCanvasElement('CE-note', { x: el.x, y: el.y, text: el.text });   // the same values
  });
  await sleep(1500);
  const t1 = (await getDoc(doc(db, 'general_canvasElements', 'CE-note'))).data()._updatedAt ?? null;
  check(J(t0) === J(t1), 'an edit that changes nothing writes nothing');
  await ctx.close();
}

// ════ 4 · TAKING THINGS OFF STILL TAKES THEM OFF (the frozen notebook) ═════
// "Only what changed" must include removals: a square emptied, a card taken
// off a day, must go from the cloud — not come back on the next sync.
scene = 'removals';
await seed();
await setDoc(doc(db, 'general_canvasElements', 'CE-book'), { id: 'CE-book', type: 'widget', widget: 'rota', x: 0, y: 700, w: 600, h: 300, z: 5,
  data: { cells: { 'n:Moshe|2026-11-02': [{ id: 'e1', jobId: 'G-1' }, { id: 'e2', jobId: 'G-2' }], 'n:Avi|2026-11-03': [{ id: 'e3', jobId: 'G-3' }] } } });
{
  const ctx = await freshBrowser();
  const page = await open(ctx, '/general');
  await page.evaluate(() => window.__store.getState().setCurrentProject('general'));
  await synced(page, 'general');
  await sleep(3000);
  await page.evaluate(() => {
    const st = window.__store.getState();
    const el = st.canvasElements.find(e => e.id === 'CE-book');
    const cells = { ...el.data.cells };
    delete cells['n:Avi|2026-11-03'];                                       // a whole square emptied
    cells['n:Moshe|2026-11-02'] = cells['n:Moshe|2026-11-02'].filter(e => e.id !== 'e2');   // one card off a day
    st.updateCanvasElement('CE-book', { data: { ...el.data, cells } });
  });
  await sleep(3000);
  await ctx.close();
  const book = (await read('general_canvasElements', 'CE-book')).data.cells;
  check(!('n:Avi|2026-11-03' in book), 'an emptied notebook square is gone from the cloud');
  check(J(book['n:Moshe|2026-11-02']?.map(e => e.id)) === J(['e1']), 'a card taken off a day is gone, the other card stays', J(book['n:Moshe|2026-11-02']));
}

// ════ 5 · A NEW COMPUTER SEES EVERYTHING ══════════════════════════════════
// Owner, 2026-10-29: "nothing lives on the computer … even if we open up new
// computers". Computer A makes choices; a brand-new computer B, same person,
// must show all of them.
scene = 'new computer';
await seed();
{
  const ctxA = await freshBrowser();
  const a = await open(ctxA, '/general');
  await a.evaluate(() => window.__store.getState().setCurrentProject('general'));
  await synced(a, 'general');
  await sleep(2500);
  await a.evaluate(() => {
    const st = window.__store.getState();
    st.updateCanvasElement('CE-note', { x: 1234, y: 567 });               // a widget moved
    st.updateApartment('G-3', { canvasX: 4321, canvasY: 765 }, st.currentUser);   // a job moved
    st.saveBoardLayout('Before the move', false);                       // an arrangement saved
    st.setDashboardLayout(['activity', 'apt-stats'], ['task-stats']);   // dashboard arranged
    st.setLightTheme(false);                                            // dark theme
    st.setActiveBoardView('');                                          // (main board)
  });
  // personal choices made through the screens' own storage calls
  await a.evaluate(async () => {
    const p = await import('/src/data/prefs.ts');
    p.prefSet('calendar_scope', 'here');
    p.prefSet('board_view_general_main', JSON.stringify({ x: 11, y: 22, z: 0.5 }));
    p.prefSet('plan_ink_saved', JSON.stringify(['#ff0000']), 'office');
  });
  await sleep(4500);   // personal choices go up 1.5 s after they settle
  await ctxA.close();

  const ctxB = await freshBrowser();      // nothing on this computer but the sign-in
  const b = await open(ctxB, '/general');
  await b.evaluate(() => window.__store.getState().setCurrentProject('general'));
  await synced(b, 'general');
  await sleep(3500);
  const seen = await b.evaluate(async () => {
    const st = window.__store.getState();
    const p = await import('/src/data/prefs.ts');
    return {
      note: st.canvasElements.find(e => e.id === 'CE-note'),
      job: st.apartments.find(a => a.id === 'G-3'),
      layouts: (st.boardLayouts.general ?? []).map(l => l.label),
      dash: st.boardSettings.general?.dashboardWidgetOrder,
      hidden: st.boardSettings.general?.dashboardHiddenWidgets,
      light: st.lightTheme,
      cal: p.prefGet('calendar_scope'),
      view: p.prefGet('board_view_general_main'),
      ink: p.prefGet('plan_ink_saved', 'office'),
    };
  });
  await ctxB.close();
  check(seen.note?.x === 1234 && seen.note?.y === 567, 'new computer: the moved widget is where it was put');
  check(seen.job?.canvasX === 4321 && seen.job?.canvasY === 765, 'new computer: the moved job is where it was put');
  check(J(seen.layouts) === J(['Before the move']), 'new computer: the saved board arrangement is there', J(seen.layouts));
  check(J(seen.dash) === J(['activity', 'apt-stats']) && J(seen.hidden) === J(['task-stats']), 'new computer: the dashboard is arranged the same');
  check(seen.light === false, 'new computer: the person\'s dark theme came with them');
  check(seen.cal === 'here', 'new computer: a screen\'s choice (calendar scope) came with them');
  check(seen.view === J({ x: 11, y: 22, z: 0.5 }), 'new computer: the board\'s zoom and place came with them');
  check(seen.ink === J(['#ff0000']), 'new computer: the office\'s saved markup colours are there');
}

// ════ 6 · THE UNDO LIST SURVIVES A RELOAD AND A NEW COMPUTER ══════════════
scene = 'undo';
await seed();
{
  const ctx = await freshBrowser();
  const a = await open(ctx, '/general');
  await a.evaluate(() => window.__store.getState().setCurrentProject('general'));
  await synced(a, 'general');
  await sleep(2500);
  await a.evaluate(async () => {
    const { trackUndo } = await import('/src/data/store.ts');
    const st = window.__store.getState();
    trackUndo({ weight: 'arrange', label: 'Moved Job 5' }, () => st.updateApartment('G-5', { canvasX: 5555, canvasY: 55 }, st.currentUser));
  });
  await sleep(2500);
  await a.reload();
  await synced(a, 'general');
  await sleep(2500);
  const after = await a.evaluate(() => window.__store.getState().undoState.past.map(e => e.label));
  check(after.includes('Moved Job 5'), 'after a reload the undo list still has the step', JSON.stringify(after));
  await a.evaluate(() => window.__store.getState().stepUndo());
  await sleep(2500);
  const back = (await read('general_apartments', 'G-5'));
  check(back.canvasX === job(5).canvasX && back.canvasY === job(5).canvasY, 'undo after the reload puts the job back (in the cloud)', `${back.canvasX},${back.canvasY}`);
  await a.reload();
  await synced(a, 'general');
  await sleep(2500);
  const fut = await a.evaluate(() => window.__store.getState().undoState.future.map(e => e.label));
  check(fut.includes('Moved Job 5'), 'and the redo survives another reload', JSON.stringify(fut));
  await a.evaluate(() => window.__store.getState().stepRedo());
  await sleep(2500);
  check((await read('general_apartments', 'G-5')).canvasX === 5555, 'redo moves it again');
  await ctx.close();

  const ctxB = await freshBrowser();
  const b = await open(ctxB, '/general');
  await b.evaluate(() => window.__store.getState().setCurrentProject('general'));
  await synced(b, 'general');
  await sleep(3000);
  const onB = await b.evaluate(() => window.__store.getState().undoState.past.map(e => e.label));
  check(onB.includes('Moved Job 5'), 'a new computer, same person, has the same undo list', JSON.stringify(onB));
  await ctxB.close();
}

await browser.close();
if (errs.length) console.log('page errors:', [...new Set(errs)].slice(0, 5));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
