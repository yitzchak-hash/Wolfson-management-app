// Drive the REAL import wizard with the prepared file, end to end, before the
// owner touches it: seed a board → upload → plan → apply → count what landed
// where → take the whole batch back out again.
//
// A rehearsal on a throwaway browser profile. It proves the handoff works —
// the columns parse, the groups and stages come out as promised, the jobs look
// like ordinary jobs, and the batch is removable — without going anywhere near
// the company's cloud.
//
// Selector note, paid for once: every string here is READ from
// ImportJobsCard.tsx, not guessed. The first version looked for an "Apply"
// button and a "will be created" summary; the card says "Import 1148 jobs" and
// "1148 will be imported", so the harness reported a working card as broken.
import { chromium } from 'playwright';

const APP = 'http://localhost:5173';
const CSV = 'scratchpad/tzviair-import.csv';
let fails = 0;
const check = (ok, l, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${l}${extra ? ' — ' + extra : ''}`); if (!ok) fails++; };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 960 } });
await ctx.addInitScript(() => {
  localStorage.setItem('active_project', 'general');
  localStorage.setItem('general_app_version', '3');
  localStorage.setItem('whats_new_seen', '2099-01-01');
  if (localStorage.getItem('general_app_data')) return;
  localStorage.setItem('general_app_data', JSON.stringify({
    currentUser: { id: 'U-test', name: 'Esther', code: '999999', role: 'admin', active: true, createdAt: '2026-01-01' },
    // Two of the four stages the file names already exist; the other two have
    // to be created by Apply, which is the half that has never been rehearsed.
    stages: [
      { id: 'g-ac', name: 'AC installation', color: '#0ea5e9', order: 1, active: true,
        projectId: 'general', description: '', createdAt: '', updatedAt: '' },
      { id: 'g-done', name: 'Job completed', color: '#16a34a', order: 2, active: true,
        projectId: 'general', description: '', createdAt: '', updatedAt: '' },
    ],
    apartments: [],
    canvasElements: [],
  }));
});
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });

// The board seeds its four built-in groups on first visit. Going straight to
// settings would have the import CREATE "Done"/"Trash"/… as new groups beside
// them, which is not what happens on his board.
await page.goto(`${APP}/jobs`);
await page.waitForTimeout(4200);
const seeded = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  return (d.canvasElements ?? []).filter(e => e.type === 'bin' && e.binKind).map(e => e.binKind).sort();
});
check(seeded.length === 4, 'the board seeded its four built-in groups', seeded.join(', '));

await page.goto(`${APP}/settings`);
await page.waitForTimeout(2600);

const input = await page.$('input[type="file"][accept*="csv"]');
check(!!input, 'the import card is on the Job Board’s settings page');
if (!input) { console.log('\nCANNOT CONTINUE'); await b.close(); process.exit(1); }

await input.setInputFiles(CSV);
await page.waitForFunction(() => /\d[\d,]*\s+will be imported/.test(document.body.innerText),
  null, { timeout: 90_000 }).catch(() => {});
await page.waitForTimeout(1200);

const preview = await page.evaluate(() => {
  const t = document.body.innerText;
  const n = t.match(/([\d,]+)\s+will be imported/i);
  const sk = t.match(/([\d,]+)\s+skipped/i);
  const warn = t.match(/([\d,]+)\s+worth a look/i);
  const makes = t.match(/Apply will also create([^.]*)\./i);
  return {
    taking: n ? Number(n[1].replace(/,/g, '')) : null,
    skipped: sk ? Number(sk[1].replace(/,/g, '')) : 0,
    warned: warn ? Number(warn[1].replace(/,/g, '')) : 0,
    makes: makes ? makes[1].replace(/\s+/g, ' ').trim() : '',
  };
});
console.log('       preview:', JSON.stringify(preview));
check(preview.taking === 1148, 'the preview counts every row', `${preview.taking} of 1148`);
check(/Ready to start/i.test(preview.makes) && /Installation of Geves/i.test(preview.makes),
  'it says which stages it will have to create', preview.makes);
check(/Currently in AC/i.test(preview.makes) && /Currently in Geves/i.test(preview.makes),
  'and which groups', preview.makes);

// Nothing is written until Apply.
const beforeApply = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('general_app_data') ?? '{}').apartments?.length ?? 0);
check(beforeApply === 0, 'the preview wrote nothing', `${beforeApply} jobs on the board`);

const applyBtn = await page.$('button:has-text("Import 1148 jobs")');
check(!!applyBtn, 'the Import button offers the whole file');
if (applyBtn) {
  await applyBtn.click();
  const barSeen = await page.waitForSelector('text=Please leave this open until it finishes',
    { timeout: 10_000 }).then(() => true).catch(() => false);
  check(barSeen, 'the progress bar appears and holds the screen');
  // And it must COUNT. A bar that appears but never moves is the same silence
  // in a nicer shape — this is what fails when the work runs inside one task
  // and the browser is never given a frame to draw in.
  const counted = await page.waitForFunction(() => {
    const m = document.body.innerText.match(/(\d[\d,]*) of (\d[\d,]*)/);
    return !!m && Number(m[1].replace(/,/g, '')) > 0;
  }, null, { timeout: 90_000 }).then(() => true).catch(() => false);
  check(counted, 'and counts through the work rather than sitting still');
  await page.waitForFunction(() => /jobs imported/.test(document.body.innerText),
    null, { timeout: 240_000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

const landed = await page.evaluate(() => {
  const LABEL = { ready: 'Ready to Start', done: 'Done', archive: 'Archive', trash: 'Trash' };
  const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
  const jobs = (d.apartments ?? []).filter(a => a.buildingId === 'G');
  const stages = new Map((d.stages ?? []).map(s => [s.id, s.name]));
  // binKeyOf: binKind ?? id. binLabelOf: text || the built-in's label.
  const bins = new Map((d.canvasElements ?? []).filter(e => e.type === 'bin')
    .map(e => [e.binKind ?? e.id, (e.text || '').trim() || LABEL[e.binKind] || 'Group']));
  const byGroup = {}, byStage = {};
  for (const j of jobs) {
    const g = j.boardBin ? (bins.get(j.boardBin) ?? `?${j.boardBin}`) : 'Open board';
    byGroup[g] = (byGroup[g] ?? 0) + 1;
    const s = j.currentStageId ? (stages.get(j.currentStageId) ?? '?') : 'none';
    byStage[s] = (byStage[s] ?? 0) + 1;
  }
  const one = jobs.find(j => j.driveLink && j.phone);
  return {
    total: jobs.length,
    withDrive: jobs.filter(j => j.driveLink).length,
    withPhone: jobs.filter(j => j.phone).length,
    named: jobs.filter(j => j.displayName && j.displayName.trim()).length,
    placed: jobs.filter(j => typeof j.canvasX === 'number' && typeof j.canvasY === 'number').length,
    counted: jobs.filter(j => !j.isUnnamed && (j.apartmentNumber || j.displayName)).length,
    binNodes: (d.canvasElements ?? []).filter(e => e.type === 'bin').length,
    byGroup, byStage,
    batches: [...new Set(jobs.map(j => (j.id.match(/^G-imp-(\d+)-/) ?? [])[1]).filter(Boolean))],
    one: one && { name: one.displayName, phone: one.phone, notes: (one.notes ?? one.generalNotes ?? '').slice(0, 44) },
  };
});
console.log('\n       landed:', JSON.stringify(landed, null, 2));

check(landed.total === 1148, 'every row became a job', `${landed.total} of 1148`);
check(landed.batches.length === 1, 'they are ONE batch, removable in one press', `${landed.batches.length} batch(es)`);
check(landed.named === 1148, 'every one carries a family name', `${landed.named} named`);
check(landed.counted === 1148, 'every one is a countable unit', `${landed.counted}`);
check(landed.placed === 1148, 'every one has a place on the board', `${landed.placed}`);
check(landed.binNodes === 6, 'six groups on the board — the four built-ins plus two new', `${landed.binNodes}`);
check((landed.byGroup['Done'] ?? 0) === 546, 'Done holds 546', String(landed.byGroup['Done']));
check((landed.byGroup['Ready to Start'] ?? 0) === 87, 'Ready to Start holds 87', String(landed.byGroup['Ready to Start']));
check((landed.byGroup['Archive'] ?? 0) === 151, 'Archive holds 151', String(landed.byGroup['Archive']));
check((landed.byGroup['Trash'] ?? 0) === 345, 'Trash holds 345', String(landed.byGroup['Trash']));
check((landed.byGroup['Currently in AC'] ?? 0) === 15, 'Currently in AC holds 15', String(landed.byGroup['Currently in AC']));
check((landed.byGroup['Currently in Geves'] ?? 0) === 4, 'Currently in Geves holds 4', String(landed.byGroup['Currently in Geves']));
check((landed.byGroup['Open board'] ?? 0) === 0, 'nothing was left loose on the open board', String(landed.byGroup['Open board'] ?? 0));
check((landed.byStage['Job completed'] ?? 0) === 546, 'every Done job carries "Job completed"', String(landed.byStage['Job completed']));
check((landed.byStage['Ready to start'] ?? 0) === 87, 'every Ready job carries "Ready to start"', String(landed.byStage['Ready to start']));
check((landed.byStage['AC installation'] ?? 0) === 15, 'the AC jobs carry "AC installation"', String(landed.byStage['AC installation']));
check((landed.byStage['Installation of Geves'] ?? 0) === 4, 'the Geves jobs carry "Installation of Geves"', String(landed.byStage['Installation of Geves']));
check((landed.byStage['none'] ?? 0) === 496, 'Archive and Trash carry no stage', String(landed.byStage['none']));
check(landed.withPhone === 459, 'the phone numbers came through', `${landed.withPhone}`);
check(landed.withDrive === 1008, 'the Drive links came through', `${landed.withDrive}`);

await page.screenshot({ path: 'scratchpad/runimport.png' });

// ── The whole batch comes back out with one press ──────────────────────────
{
  const strip = await page.evaluate(() => /Import from/.test(document.body.innerText));
  check(strip, 'the import shows in the standing per-import strip');
  const remove = await page.$('button:has-text("Remove this import")');
  check(!!remove, 'it offers a Remove for that batch');
  if (remove) {
    await remove.click();
    await page.waitForTimeout(400);
    const yes = await page.$('button:has-text("Yes, remove 1148")');
    check(!!yes, 'removal asks first, naming the count');
    if (yes) {
      await yes.click();
      await page.waitForTimeout(2500);
      const left = await page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('general_app_data') ?? '{}');
        return {
          jobs: (d.apartments ?? []).filter(a => a.buildingId === 'G').length,
          bins: (d.canvasElements ?? []).filter(e => e.type === 'bin').length,
        };
      });
      check(left.jobs === 0, 'one press takes the whole import back out', `${left.jobs} left`);
      check(left.bins === 6, 'and leaves the groups standing', `${left.bins} groups`);
    }
  }
}

console.log(fails === 0 ? '\nALL PASS — the file is ready for the real board' : `\n${fails} FAILED`);
await b.close();
process.exit(fails ? 1 : 0);
