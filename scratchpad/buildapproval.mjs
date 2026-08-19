/**
 * Build the approval page from scratchpad/import-plan.json.
 *   node scratchpad/buildapproval.mjs
 * Writes scratchpad/import-approval.html — the page the owner reads and rules on.
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'scratchpad');
const plan = JSON.parse(fs.readFileSync(path.join(OUT, 'import-plan.json'), 'utf8'));

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = v => Number(v).toLocaleString('en-US');

const routeRows = plan.counts.byRoute.slice().sort((a, b) => b.n - a.n);
const unroutedRows = plan.counts.byUnrouted.slice().sort((a, b) => b[1] - a[1]);
const refusedRows = plan.counts.byRefused.slice().sort((a, b) => b[1] - a[1]);

const byGroup = new Map();
for (const p of plan.planned) {
  const k = p.group || 'Straight onto the board';
  byGroup.set(k, (byGroup.get(k) ?? 0) + 1);
}
const notRows = plan.unrouted.filter(r => r.crmStage === 'Not');
const notWithDrive = notRows.filter(r => r.drive).length;
const notWithPhone = notRows.filter(r => r.phone).length;

const noDrive = plan.planned.filter(p => !p.folderId).length;
const withPhone = plan.planned.filter(p => p.phone).length;
const clashRows = plan.planned.filter(p => p.warnings.some(w => w.includes('surname'))).length;
const dupFolder = plan.planned.filter(p => p.warnings.some(w => w.startsWith('same Drive folder'))).length;
const mentionsOther = plan.planned.filter(p => p.warnings.some(w => w.includes('another workspace'))).length;
const toDone = plan.planned.filter(p => p.group === 'Done').length;
const toReady = plan.planned.filter(p => p.group === 'Ready to Start').length;
const toBoard = plan.planned.filter(p => p.group === '').length;

// ── rows ────────────────────────────────────────────────────────────────────
function plannedRow(p, i) {
  const flags = [];
  if (!p.folderId) flags.push('<span class="flag warn" title="no Drive folder in the export">no Drive</span>');
  if (p.warnings.some(w => w.startsWith('same Drive folder'))) flags.push('<span class="flag warn" title="another row points at the same Drive folder">shared folder</span>');
  if (p.warnings.some(w => w.includes('another workspace'))) flags.push('<span class="flag hot" title="the name mentions Wolfson or Netiv">other site?</span>');
  if (p.warnings.some(w => w.includes('surname'))) flags.push('<span class="flag" title="another job carries the same surname">shared name</span>');
  const dest = p.group === '' ? 'Board' : p.group;
  const cls = chipClass(p.group);
  return `<tr data-stage="${esc(p.crmStage)}" data-q="${esc((p.deal + ' ' + p.account + ' ' + p.phone).toLowerCase())}">
<td class="num">${i + 1}</td>
<td class="name"><b class="sur">${esc(p.family)}</b><b class="full">${esc(p.fullName)}</b>${p.kind ? `<em>${esc(p.kind)}</em>` : ''}</td>
<td><span class="chip ${cls}">${esc(dest)}</span></td>
<td class="st">${p.stage ? esc(p.stage) : '<span class="muted">none</span>'}</td>
<td class="mono">${p.phone ? esc(p.phone) : '<span class="muted">—</span>'}</td>
<td class="dr">${p.folderId ? `<a href="${esc(p.driveUrl)}" target="_blank" rel="noopener">open</a>` : '<span class="muted">—</span>'}</td>
<td class="crm">${esc(p.crmStage)}</td>
<td class="fl">${flags.join('')}</td>
</tr>`;
}

function plainRow(r, i, withReason) {
  return `<tr data-stage="${esc(r.crmStage)}" data-q="${esc(String(r.label).toLowerCase())}">
<td class="num">${i + 1}</td>
<td class="name"><b class="full">${esc(r.label)}</b></td>
<td class="crm">${esc(r.crmStage)}</td>
<td class="dr">${r.drive ? `<a href="${esc(r.drive)}" target="_blank" rel="noopener">open</a>` : '<span class="muted">—</span>'}</td>
${withReason ? `<td class="why">${esc(r.reason)}</td>` : ''}
</tr>`;
}

/** One colour per destination, so a column of 800 rows reads at a glance. */
function chipClass(group) {
  if (group === 'Done') return 'done';
  if (group === 'Ready to Start') return 'ready';
  if (group === 'Archive') return 'arch';
  if (group === 'Trash') return 'trash';
  if (group.startsWith('Currently')) return 'live';
  return 'board';
}

const chips = list => list.map(s => `<button type="button" class="tchip" data-stage="${esc(s)}">${esc(s)}</button>`).join('');
const plannedStages = [...new Set(plan.planned.map(p => p.crmStage))];

// ── page ────────────────────────────────────────────────────────────────────
const css = `
*{box-sizing:border-box}
:root{
  --ground:#f3f5f8; --panel:#fff; --panel-2:#e9eef4; --line:#d6dee7; --line-soft:#e5eaf1;
  --ink:#16212e; --ink-2:#4c5c70; --ink-3:#7d8b9c;
  --navy:#1e3a5f; --accent:#2f88bd;
  --good:#16705c; --good-bg:#e0f0ea; --amber:#a4650f; --amber-bg:#f9ecd7; --hot:#a8382d; --hot-bg:#f8e4e1;
  --shadow:0 1px 2px rgba(22,33,46,.05), 0 14px 30px -20px rgba(22,33,46,.35);
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --ground:#0d151d; --panel:#14202b; --panel-2:#1c2937; --line:#2a3846; --line-soft:#22303d;
    --ink:#e7eef5; --ink-2:#a8b7c7; --ink-3:#78899a;
    --navy:#9dc0e2; --accent:#5aade0;
    --good:#4dc0a1; --good-bg:#12332c; --amber:#dda44f; --amber-bg:#33280f; --hot:#e88274; --hot-bg:#361c19;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 16px 34px -22px rgba(0,0,0,.9);
  }
}
:root[data-theme="dark"]{
  --ground:#0d151d; --panel:#14202b; --panel-2:#1c2937; --line:#2a3846; --line-soft:#22303d;
  --ink:#e7eef5; --ink-2:#a8b7c7; --ink-3:#78899a;
  --navy:#9dc0e2; --accent:#5aade0;
  --good:#4dc0a1; --good-bg:#12332c; --amber:#dda44f; --amber-bg:#33280f; --hot:#e88274; --hot-bg:#361c19;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 16px 34px -22px rgba(0,0,0,.9);
}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:"Public Sans", ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
  font-size:15px; line-height:1.55; -webkit-text-size-adjust:100%;
}
.wrap{max-width:1160px; margin:0 auto; padding:0 20px 96px}
h1,h2,h3{font-family:"Archivo", ui-sans-serif, system-ui, sans-serif; text-wrap:balance; margin:0}
a{color:var(--accent)}
.muted{color:var(--ink-3)}
.mono{font-family:"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace; font-size:.86em; font-variant-numeric:tabular-nums}

/* masthead */
header.mast{padding:56px 0 30px; border-bottom:2px solid var(--navy)}
.eyebrow{font-family:"IBM Plex Mono",ui-monospace,monospace; font-size:11px; letter-spacing:.16em;
  text-transform:uppercase; color:var(--accent); margin:0 0 14px}
header.mast h1{font-size:clamp(34px,6vw,56px); font-weight:700; letter-spacing:-.02em; line-height:1.04}
header.mast p.sub{margin:14px 0 0; max-width:62ch; color:var(--ink-2); font-size:17px}
.meta{margin-top:22px; display:flex; flex-wrap:wrap; gap:8px 22px; font-size:12.5px; color:var(--ink-3);
  font-family:"IBM Plex Mono",ui-monospace,monospace}

/* the four outcomes */
.strip{display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:14px; margin:30px 0 12px}
.stat{background:var(--panel); border:1px solid var(--line); border-radius:4px; padding:18px 18px 16px;
  box-shadow:var(--shadow); position:relative; overflow:hidden}
.stat::before{content:""; position:absolute; inset:0 auto 0 0; width:4px; background:var(--ink-3)}
.stat.go::before{background:var(--good)} .stat.ask::before{background:var(--amber)} .stat.no::before{background:var(--ink-3)}
.stat b{display:block; font-family:"Archivo",sans-serif; font-size:40px; font-weight:700; line-height:1;
  letter-spacing:-.02em; font-variant-numeric:tabular-nums}
.stat.go b{color:var(--good)} .stat.ask b{color:var(--amber)}
.stat span{display:block; margin-top:8px; font-size:13.5px; color:var(--ink-2)}

section{margin-top:52px}
section > h2{font-size:26px; font-weight:600; letter-spacing:-.01em}
section > p.lede{margin:10px 0 0; color:var(--ink-2); max-width:66ch}

/* tables */
.tablewrap{margin-top:18px; background:var(--panel); border:1px solid var(--line); border-radius:4px;
  box-shadow:var(--shadow); overflow-x:auto}
table{border-collapse:collapse; width:100%; font-size:13.5px}
th{font-family:"Archivo",sans-serif; font-size:10.5px; letter-spacing:.1em; text-transform:uppercase;
  color:var(--ink-3); text-align:left; font-weight:600; padding:11px 12px; border-bottom:1px solid var(--line);
  background:var(--panel); position:sticky; top:0; z-index:2; white-space:nowrap}
td{padding:9px 12px; border-bottom:1px solid var(--line-soft); vertical-align:top}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover{background:var(--panel-2)}
td.num{color:var(--ink-3); font-family:"IBM Plex Mono",monospace; font-size:11.5px; text-align:right; width:52px;
  font-variant-numeric:tabular-nums}
td.name{min-width:190px}
td.name b{display:block; font-weight:600; font-size:14px}
td.name em{display:block; font-style:normal; color:var(--ink-3); font-size:12px; margin-top:1px}
td.crm{color:var(--ink-2); font-size:12.5px; white-space:nowrap}
td.st{font-size:12.5px; white-space:nowrap}
td.dr a{text-decoration:none; border-bottom:1px solid currentColor; font-size:12.5px}
td.why{color:var(--ink-2); font-size:12.5px}
td.fl{white-space:nowrap}
tr[hidden]{display:none}

/* name toggle */
body[data-names="sur"] .full{display:none}
body[data-names="full"] .sur{display:none}

.chip{display:inline-block; padding:2px 9px; border-radius:2px; font-size:11px; font-weight:600;
  font-family:"Archivo",sans-serif; letter-spacing:.02em; white-space:nowrap; border:1px solid transparent}
.chip.done{background:var(--good-bg); color:var(--good); border-color:color-mix(in srgb, var(--good) 30%, transparent)}
.chip.ready{background:var(--amber-bg); color:var(--amber); border-color:color-mix(in srgb, var(--amber) 30%, transparent)}
.chip.board{background:var(--panel-2); color:var(--navy); border-color:var(--line)}
.chip.live{background:#e4effa; color:#1e3a5f; border-color:#bcd6ef}
.chip.arch{background:var(--panel-2); color:var(--ink-2); border-color:var(--line)}
.chip.trash{background:var(--hot-bg); color:var(--hot); border-color:transparent}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .chip.live{background:#17293a; color:#9dc0e2; border-color:#2a3846}}
:root[data-theme="dark"] .chip.live{background:#17293a; color:#9dc0e2; border-color:#2a3846}
.flag{display:inline-block; margin-right:5px; padding:1px 6px; border-radius:2px; font-size:10.5px;
  background:var(--panel-2); color:var(--ink-2); border:1px solid var(--line); white-space:nowrap}
.flag.warn{background:var(--amber-bg); color:var(--amber); border-color:transparent}
.flag.hot{background:var(--hot-bg); color:var(--hot); border-color:transparent}

/* routing table */
.route td.n{font-family:"Archivo",sans-serif; font-weight:700; font-size:17px; text-align:right; width:70px;
  font-variant-numeric:tabular-nums}
.route tr.off td{color:var(--ink-3)}
.route tr.ask td.n{color:var(--amber)}
.route td.arrow{color:var(--ink-3); width:26px; text-align:center}

/* questions */
.qs{display:grid; gap:14px; margin-top:20px}
.q{background:var(--panel); border:1px solid var(--line); border-left:4px solid var(--amber); border-radius:4px;
  padding:18px 20px; box-shadow:var(--shadow)}
.q h3{font-size:16.5px; font-weight:600; margin-bottom:6px}
.q p{margin:0; color:var(--ink-2); font-size:14px}
.q p + p{margin-top:8px}
.q .opt{margin-top:10px; padding-left:16px; border-left:2px solid var(--line); font-size:13.5px; color:var(--ink-2)}
.q.ok{border-left-color:var(--good)}

/* controls */
.controls{display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-top:18px}
.controls input[type=search]{flex:1 1 240px; min-width:0; padding:9px 12px; border-radius:3px;
  border:1px solid var(--line); background:var(--panel); color:var(--ink); font:inherit; font-size:14px}
.controls input[type=search]:focus-visible, .tchip:focus-visible, .seg button:focus-visible{
  outline:2px solid var(--accent); outline-offset:2px}
.tchip{padding:6px 11px; border-radius:2px; border:1px solid var(--line); background:var(--panel);
  color:var(--ink-2); font:inherit; font-size:12.5px; cursor:pointer}
.tchip[aria-pressed="true"]{background:var(--navy); border-color:var(--navy); color:var(--ground)}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .tchip[aria-pressed="true"]{color:#0d151d}}
:root[data-theme="dark"] .tchip[aria-pressed="true"]{color:#0d151d}
.seg{display:inline-flex; border:1px solid var(--line); border-radius:3px; overflow:hidden}
.seg button{padding:7px 12px; border:0; background:var(--panel); color:var(--ink-2); font:inherit; font-size:12.5px; cursor:pointer}
.seg button + button{border-left:1px solid var(--line)}
.seg button[aria-pressed="true"]{background:var(--accent); color:#fff}
.count{font-family:"IBM Plex Mono",monospace; font-size:12px; color:var(--ink-3)}

.note{margin-top:14px; font-size:13.5px; color:var(--ink-2); padding-left:16px; border-left:2px solid var(--line)}
footer{margin-top:64px; padding-top:22px; border-top:1px solid var(--line); color:var(--ink-3); font-size:13px}
@media (prefers-reduced-motion:no-preference){ .stat{transition:transform .15s ease} }
@media (max-width:640px){
  .wrap{padding:0 14px 72px}
  header.mast{padding-top:36px}
  td.crm, th.crm{display:none}
}
`;

const body = `
<div class="wrap">
<header class="mast">
  <p class="eyebrow">For approval · before anything is written</p>
  <h1>The past year, sorted onto the board</h1>
  <p class="sub">Every one of the ${n(plan.rowsRead)} deals in the CRM export, put through the routing you
     gave me on 22 August. Nothing has been created yet. One stage still needs a word from you; everything
     else is ready to run.</p>
  <div class="meta">
    <span>Source: ${esc(plan.source)}</span>
    <span>${n(plan.rowsRead)} rows read</span>
    <span>Second pass · 22 Aug 2026</span>
  </div>
</header>

<div class="strip">
  <div class="stat go"><b>${n(plan.counts.planned)}</b><span>jobs I will create</span></div>
  <div class="stat ask"><b>${n(plan.counts.unrouted)}</b><span>waiting on one word from you</span></div>
  <div class="stat no"><b>${n(plan.counts.refused)}</b><span>left out, as you said</span></div>
  <div class="stat no"><b>${n(plan.counts.problems)}</b><span>rows I could not read</span></div>
</div>

<section>
  <h2>Where each CRM stage lands</h2>
  <p class="lede">The first block is your instructions, applied. The second is stages that appear in the export
     but were not in your list — I have left them out rather than guess.</p>
  <div class="tablewrap">
    <table class="route">
      <thead><tr><th>Jobs</th><th>CRM stage</th><th></th><th>Group on the board</th><th>Stage it gets</th></tr></thead>
      <tbody>
        ${routeRows.map(r => `<tr>
          <td class="n">${n(r.n)}</td>
          <td>${esc(r.crmStage)}</td>
          <td class="arrow">→</td>
          <td><span class="chip ${chipClass(r.group)}">${r.group === '' ? 'Straight onto the board' : esc(r.group)}</span></td>
          <td class="st">${r.stage ? esc(r.stage) : '<span class="muted">left with no stage</span>'}</td>
        </tr>`).join('')}
        ${refusedRows.map(([s, c]) => `<tr class="off">
          <td class="n">${n(c)}</td><td>${esc(s)}</td><td class="arrow">✕</td>
          <td colspan="2"><span class="muted">left out — you said so</span></td></tr>`).join('')}
        ${unroutedRows.map(([s, c]) => `<tr class="ask off">
          <td class="n">${n(c)}</td><td>${esc(s)}</td><td class="arrow">?</td>
          <td colspan="2"><span class="muted">no rule yet — tell me and it goes in</span></td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  <p class="note">
    Where the ${n(plan.counts.planned)} land:
    ${[...byGroup.entries()].sort((a, b) => b[1] - a[1])
      .map(([g, c]) => `<strong>${n(c)}</strong> in ${esc(g)}`).join(' · ')}.
    A job in a group still exists in full — its Drive folder, its phone, its notes.
    It just stays out of the daily board and the live counts.
    <br><br>
    <strong>Two groups do not exist yet and will be created:</strong> Currently in AC and
    Currently in Geves, beside the four the board ships with.
  </p>
</section>

<section>
  <h2>What I need from you before I run it</h2>
  <div class="qs">

    <div class="q">
      <h3>One stage left: the ${n(notRows.length)} deals the export calls “Not”</h3>
      <p>Every other stage you named is now routed. This is the only one still without a rule, and it is
         the biggest single group in the file. <strong>${n(notWithDrive)} of them have a Drive folder</strong> and
         <strong>${n(notWithPhone)} have a phone number</strong>, and the job types read like live work rather than
         junk: 81 VRF, 15 VRF System, 13 Undecided, 10 Central, 9 Central Replacement — and 102 with no
         job type written at all.</p>
      <p>You started to say Trash and then changed to Archive, so I have not guessed. Tell me which and
         they go in with the rest.</p>
      <p class="opt">Or, if you meant them to stay out entirely, say that instead — but they look too much
         like real customers for me to assume it.</p>
    </div>

    <div class="q ok">
      <h3>The 49 you told me to skip are still skipped</h3>
      <p>Babysitting (23), Creating Proposal (13), Collecting Information (10) and Closed Lost (3) do not
         come in, exactly as you said the first time.</p>
      <p class="opt">If “everything left out should go into Archive” was meant to include these four as
         well, say so and I will bring them in too.</p>
    </div>

    <div class="q">
      <h3>Tile names: “Wolff” or “Wolff, Zvi”?</h3>
      <p>You said the family name is what comes before the comma, so that is what I have used.
         But <strong>${n(clashRows)} of the ${n(plan.counts.planned)} jobs</strong> share a surname with another job —
         three tiles all reading “Wolff”, and no way to tell them apart on the board.</p>
      <p class="opt">Use the toggle above the big table to see both versions. Whichever you pick, the full deal
         name is saved in the job’s notes either way, so nothing is lost.</p>
    </div>

    <div class="q ok">
      <h3>506 finished jobs go into the Done group, not onto the board</h3>
      <p>“Job Completed”, “Collecting Remaining Balance” and “Collecting Extras” all get the
         <em>Job completed</em> stage and are filed in <em>Done</em> — the same rule as last time.
         They keep everything: Drive folder, phone, notes. They just do not crowd the board or count
         towards your live totals.</p>
      <p class="opt">If you would rather they sat on the open board, say so and I will move them.</p>
    </div>

    <div class="q">
      <h3>The export has no address and no Zoho link</h3>
      <p>There is no address column at all, and no link back to the CRM record — only the deal name, the
         account, the Drive folder, two phone columns and the stage. So every job arrives with a blank
         address, which means the map widget will show them as “no address”.</p>
      <p class="opt">If you can export the deals again with the address field and the record URL included,
         I will fill both in. Otherwise the addresses have to be typed as jobs come up.</p>
    </div>

    <div class="q">
      <h3>Things I have flagged but not stopped for</h3>
      <p><strong>${n(noDrive)}</strong> deals have no Drive folder. They still become jobs — you just cannot open
         a folder from the tile until a link is added.</p>
      <p><strong>${n(dupFolder)}</strong> point at a Drive folder another row already used, and
         <strong>${n(mentionsOther)}</strong> have Wolfson or Netiv in the name. Both are marked in the table.</p>
      <p><strong>${n(withPhone)}</strong> of the ${n(plan.counts.planned)} carry a phone number; the missing zero has been
         put back on the Israeli ones and left alone on anything American or international.</p>
      <p class="opt">Two more guards run at the moment of import, on your machine, where the live data is:
         any deal whose Drive folder already belongs to a Wolfson or Netiv apartment is dropped, and anything
         already on the Job Board is not duplicated. So the final count may come in a little under ${n(plan.counts.planned)}.</p>
    </div>

    <div class="q ok">
      <h3>They arrive as ordinary jobs, plans and photos open</h3>
      <p>Each imported job now has its Engineered Plans and Photos folders opened up in Drive, exactly as
         if you had pasted the link in by hand — so a worker on site can see the sheet without signing in.
         That runs during the import, behind a bar that counts through it and holds the screen until it
         has finished.</p>
    </div>

    <div class="q ok">
      <h3>If it goes wrong, it comes straight back out</h3>
      <p>The whole import lands as one batch with its own line in the Job Board’s settings — one press
         removes exactly these jobs and nothing else, whenever you like, not just on the day.</p>
    </div>

  </div>
</section>

<section>
  <h2>The ${n(plan.counts.planned)} jobs I will create</h2>
  <p class="lede">Every row that lands, exactly as it will land.</p>
  <div class="controls">
    <input type="search" id="q1" placeholder="Search a name, an account, a phone number…" aria-label="Search the jobs to be created">
    <div class="seg" role="group" aria-label="How tile names read">
      <button type="button" data-names="sur" aria-pressed="true">Wolff</button>
      <button type="button" data-names="full" aria-pressed="false">Wolff, Zvi</button>
    </div>
    <span class="count" id="c1"></span>
  </div>
  <div class="controls" id="chips1">${chips(plannedStages)}</div>
  <div class="tablewrap">
    <table id="t1">
      <thead><tr><th>#</th><th>Name on the tile</th><th>Goes to</th><th>Stage</th><th>Phone</th><th>Drive</th><th class="crm">From CRM stage</th><th>Notes</th></tr></thead>
      <tbody>${plan.planned.map(plannedRow).join('')}</tbody>
    </table>
  </div>
</section>

<section>
  <h2>The ${n(plan.counts.unrouted)} still called “Not”</h2>
  <p class="lede">The only stage without a rule. Nothing here is being imported yet — say Archive or Trash
     and every one of them moves up into the list above.</p>
  <div class="controls">
    <input type="search" id="q2" placeholder="Search these…" aria-label="Search the deals awaiting a ruling">
    <span class="count" id="c2"></span>
  </div>
  <div class="controls" id="chips2">${chips(unroutedRows.map(r => r[0]))}</div>
  <div class="tablewrap">
    <table id="t2">
      <thead><tr><th>#</th><th>Deal</th><th>CRM stage</th><th>Drive</th></tr></thead>
      <tbody>${plan.unrouted.map((r, i) => plainRow(r, i, false)).join('')}</tbody>
    </table>
  </div>
</section>

<section>
  <h2>The ${n(plan.counts.refused)} you told me to leave out</h2>
  <p class="lede">Here so you can see what “skip” actually covered.</p>
  <div class="tablewrap">
    <table id="t3">
      <thead><tr><th>#</th><th>Deal</th><th>CRM stage</th><th>Drive</th><th>Why</th></tr></thead>
      <tbody>${plan.refused.map((r, i) => plainRow(r, i, true)).join('')}</tbody>
    </table>
  </div>
</section>

<footer>
  Prepared from ${esc(plan.source)} — ${n(plan.rowsRead)} rows. Nothing in this page has been written to the
  app. Reply with your rulings and I will run the import.
</footer>
</div>

<script>
(function(){
  document.body.dataset.names = 'sur';
  document.querySelectorAll('.seg button').forEach(function(b){
    b.addEventListener('click', function(){
      document.querySelectorAll('.seg button').forEach(function(o){ o.setAttribute('aria-pressed', String(o === b)); });
      document.body.dataset.names = b.dataset.names;
    });
  });
  function wire(inputId, chipsId, tableId, countId){
    var input = document.getElementById(inputId);
    var chipBox = document.getElementById(chipsId);
    var rows = Array.prototype.slice.call(document.querySelectorAll('#' + tableId + ' tbody tr'));
    var out = document.getElementById(countId);
    var active = null;
    function apply(){
      var q = (input && input.value || '').trim().toLowerCase();
      var shown = 0;
      rows.forEach(function(r){
        var ok = (!q || r.dataset.q.indexOf(q) !== -1) && (!active || r.dataset.stage === active);
        r.hidden = !ok;
        if (ok) shown++;
      });
      if (out) out.textContent = shown === rows.length ? rows.length + ' rows' : shown + ' of ' + rows.length + ' rows';
    }
    if (input) input.addEventListener('input', apply);
    if (chipBox) chipBox.addEventListener('click', function(e){
      var b = e.target.closest('.tchip'); if (!b) return;
      active = (active === b.dataset.stage) ? null : b.dataset.stage;
      chipBox.querySelectorAll('.tchip').forEach(function(o){
        o.setAttribute('aria-pressed', String(o.dataset.stage === active));
      });
      apply();
    });
    apply();
  }
  wire('q1','chips1','t1','c1');
  wire('q2','chips2','t2','c2');
})();
</script>
`;

const html = `<title>Past Year Import</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Public+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${css}</style>
${body}`;

fs.writeFileSync(path.join(OUT, 'import-approval.html'), html);
console.log('wrote import-approval.html —', (html.length / 1024).toFixed(0), 'KB');
