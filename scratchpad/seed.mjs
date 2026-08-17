// Realistic data for the phone harnesses.
//
// The previous round's harness ran on the bare seed: no family names, no
// stages. Every cell held a number and "— Not Started —", so the audit came
// back clean while the owner's real board overlapped its own text. A phone
// test on empty data tests nothing — the whole failure mode is content that
// is LONGER than the box.
//
// The app seeds localStorage itself on first boot, so we let it, read what it
// wrote, patch names/stages in, and hand the patched blob to the next context.
// It must be read from a page that is then CLOSED before patching: the app
// flushes persist() on unload, which would put the unpatched data straight
// back over ours.

const FAMILIES = [
  'Rottenstreich, Yosef', 'Topper, Avraham', 'Weinstein, Steven', 'Aharonov, Moshe',
  'Nahon, Yitzchak', 'Cohen, David', 'Wolfson, Tzvi', 'Vizgen, Chaim',
  'Wolfson, Ranaana', 'Topper, Aaron', 'Ben-Shimon, Eliyahu', 'Friedman, Sara',
  'Mizrachi, Avi', 'Goldstein, Menachem', 'Abergel, Shlomo', 'Katz, Devorah',
];
// Deliberately weighted to the LONGEST stage names — those are the ones that
// break a 77px cell, and a test that only picks short ones proves nothing.
const STAGES = ['s2', 's7', 's6', 's1', 's2', 's7', 's3', 's4', 's5', 's2', 's6', 's7'];

export async function realisticWolfson(browser, { hebrew = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/');
  // The app persists only on MUTATION, so a fresh boot leaves nothing to read
  // back. Import its own generator through Vite instead — the apartments then
  // come from the same source the app itself uses, not a copy that can drift.
  const apts = await page.evaluate(async () => {
    const m = await import('/src/data/initialData.ts');
    return m.buildDefaultApartments();
  });
  await ctx.close();

  const data = { apartments: apts };
  let n = 0;
  data.apartments = (data.apartments ?? []).map(a => {
    if (a.isUnnamed || !a.apartmentNumber) return a;
    n++;
    // Leave a scattering untouched so the "no name, not started" cell is still
    // represented — it is the one the previous harness tested exclusively.
    if (n % 7 === 0) return a;
    return {
      ...a,
      displayName: FAMILIES[n % FAMILIES.length],
      currentStageId: STAGES[n % STAGES.length],
    };
  });
  data.currentUser = { id: 'U-test', name: 'Architect Avi', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' };

  /**
   * A worker with a token, and work to look at.
   *
   * The portal is the screen that actually lives on a phone all day, and it
   * was the one view never seeded — so it could not be audited at all. Tasks
   * are spread across overdue / today / later on purpose: the countdown badges
   * and the date filters are the part of that page most likely to overflow.
   */
  const day = off => {
    const d = new Date('2026-08-16T12:00:00Z');
    d.setDate(d.getDate() + off);
    return d.toISOString().slice(0, 10);
  };
  // `lang` matters: the portal reads the WORKER's language, never the
  // office's. Without it a Hebrew sweep tests the admin app in Hebrew and the
  // portal in English, which is the one screen a Hebrew-speaking worker
  // actually holds.
  data.contractors = [{
    id: 'C-test', name: 'Moshe Aharonov', category: 'ac', token: PORTAL_TOKEN,
    active: true, createdAt: '2026-01-01', phone: '050-1234567',
    lang: hebrew ? 'he' : undefined,
  }];
  const named = data.apartments.filter(a => a.displayName && !a.isUnnamed).slice(0, 6);
  data.contractorAssignments = named.map((a, i) => ({
    id: `A-${i}`,
    contractorId: 'C-test',
    apartmentId: a.id,
    buildingId: a.buildingId,
    taskDescription: [
      'Install the concealed unit and run the drain to the riser',
      'Fit registers in both bedrooms',
      'Second-fix thermostats, check haffala',
      'Outdoor unit on the roof bracket',
      'Snag list from the architect walk-through',
      'Pressure test the piping',
    ][i % 6],
    stageId: a.currentStageId ?? null,
    dueDate: day([-3, 0, 1, 4, 9, -1][i % 6]),
    priority: ['urgent', 'normal', 'low', 'normal', 'normal', 'urgent'][i % 6],
    completedAt: i === 5 ? '2026-08-15T09:00:00Z' : null,
    createdAt: '2026-08-01T09:00:00Z',
  }));

  return JSON.stringify(data);
}

/** The worker whose portal the harnesses open. */
export const PORTAL_TOKEN = 'HarnessWorkerToken00001';

/** Apply the patched blob to a context before the app boots. */
export async function applySeed(ctx, blob, { whatsNewSeen = true, hebrew = false } = {}) {
  await ctx.addInitScript(([b, seen, heb]) => {
    // Only when absent — this script re-runs on EVERY navigation (the standing
    // trap), and an unconditional write here yanked any harness that switched
    // workspace through the real UI straight back to Wolfson on its next
    // goto(). Harnesses that want a workspace outright still set it in their
    // own init script, which runs after this one.
    if (!localStorage.getItem('active_project')) localStorage.setItem('active_project', 'wolfson');
    // Without the version key the app treats the store as stale, resets, and
    // drops you at the login page — which reads as "the harness is broken".
    localStorage.setItem('wolfson_app_version', '3');
    // Hebrew is a WHOLE-STORE flag, not a page setting: mainUiStrings carries
    // isRtl and every component reads its labels from it. Patching the blob is
    // the only way to have the app boot right-to-left rather than flipping it
    // after the layout has already been measured.
    const data = JSON.parse(b);
    if (heb) data.mainUiStrings = { isRtl: true };
    localStorage.setItem('wolfson_app_data', JSON.stringify(data));
    if (seen) localStorage.setItem('whats_new_seen', '2026-08-16');
    else localStorage.removeItem('whats_new_seen');
  }, [blob, whatsNewSeen, hebrew]);
}
