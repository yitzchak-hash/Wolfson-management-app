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

export async function realisticWolfson(browser) {
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
  return JSON.stringify(data);
}

/** Apply the patched blob to a context before the app boots. */
export async function applySeed(ctx, blob, { whatsNewSeen = true } = {}) {
  await ctx.addInitScript(([b, seen]) => {
    localStorage.setItem('active_project', 'wolfson');
    // Without the version key the app treats the store as stale, resets, and
    // drops you at the login page — which reads as "the harness is broken".
    localStorage.setItem('wolfson_app_version', '3');
    localStorage.setItem('wolfson_app_data', b);
    if (seen) localStorage.setItem('whats_new_seen', '2026-08-16');
    else localStorage.removeItem('whats_new_seen');
  }, [blob, whatsNewSeen]);
}
