// Wraps the captured bars in an approval page.
//
// The captured markup and the app's own compiled stylesheet go in untouched —
// the page's own styling is namespaced under `.doc` so it cannot reach into
// the specimens and quietly make them look better than they are.
import { readFileSync, writeFileSync } from 'fs';

const cap = JSON.parse(readFileSync('scratchpad/planbar-capture.json', 'utf8'));
const OUT = process.argv[2] ?? 'scratchpad/planbars2.html';

const page = `<title>Plan Viewer Bars</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;600&display=swap">

<style>
/* ── The app's own compiled stylesheet, lifted from the running app ────── */
${cap.css}
</style>

<style>
/* ── This page's chrome. Everything is under .doc so it cannot leak into
      the specimens above, which must stay exactly as the app draws them. ── */
.doc {
  --ink: #131a24; --soft: #57616f; --faint: #8b95a3;
  --paper: #f4f6f9; --card: #fff; --rule: #dde3eb;
  --accent: #4aa8d8; --amber: #b45309; --amber-bg: #fdf5e6;
  --green: #15803d; --green-bg: #eefaf1;
  font-family: "IBM Plex Sans", system-ui, sans-serif;
  color: var(--ink); background: var(--paper);
  font-size: 15px; line-height: 1.6;
  margin: 0; padding: 44px 22px 90px;
  min-height: 100vh;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .doc {
    --ink: #e8edf3; --soft: #a3aebc; --faint: #6f7c8c;
    --paper: #10151c; --card: #171e28; --rule: #29323f;
    --amber: #f0b055; --amber-bg: #2a2114; --green: #6ee7a0; --green-bg: #12241a;
  }
}
:root[data-theme="dark"] .doc {
  --ink: #e8edf3; --soft: #a3aebc; --faint: #6f7c8c;
  --paper: #10151c; --card: #171e28; --rule: #29323f;
  --amber: #f0b055; --amber-bg: #2a2114; --green: #6ee7a0; --green-bg: #12241a;
}
body { margin: 0; background: #f4f6f9; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) body { background: #10151c; } }
:root[data-theme="dark"] body { background: #10151c; }

.doc .inner { max-width: 1180px; margin: 0 auto; display: flex; flex-direction: column; gap: 40px; }
.doc .eyebrow { font-family: "IBM Plex Mono", monospace; font-size: 11px; font-weight: 600;
  letter-spacing: .13em; text-transform: uppercase; color: var(--faint); }
.doc h1 { font-family: "IBM Plex Sans Condensed", sans-serif; font-weight: 700;
  font-size: clamp(29px, 5vw, 42px); line-height: 1.08; letter-spacing: -.015em; margin: 8px 0 10px;
  text-wrap: balance; }
.doc h2 { font-family: "IBM Plex Sans Condensed", sans-serif; font-weight: 600; font-size: 21px;
  margin: 0 0 4px; padding-bottom: 8px; border-bottom: 1px solid var(--rule); }
.doc p { margin: 0; max-width: 68ch; color: var(--soft); }
.doc p.lede { color: var(--soft); }
.doc section { display: flex; flex-direction: column; gap: 14px; }

.doc .spec { background: var(--card); border: 1px solid var(--rule); border-radius: 11px; overflow: hidden; }
.doc .spechead { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  padding: 12px 16px; border-bottom: 1px solid var(--rule); }
.doc .tag { font-family: "IBM Plex Mono", monospace; font-size: 10.5px; font-weight: 600;
  letter-spacing: .1em; text-transform: uppercase; padding: 3px 7px; border-radius: 4px; }
.doc .tag.now { background: var(--amber-bg); color: var(--amber); }
.doc .tag.next { background: var(--green-bg); color: var(--green); }
.doc .spechead .what { font-weight: 600; font-size: 14px; color: var(--ink); }
.doc .spechead .note { color: var(--faint); font-size: 13px; }

/* The specimen frame: the real bar, on the real navy, at real width. */
.doc .frame { overflow-x: auto; padding: 18px 16px 20px; }
.doc .frame > .live { min-width: 1020px; border-radius: 8px; overflow: hidden;
  border: 1px solid rgba(0,0,0,.16); }
.doc .frame .sheetstub { background: #fbfbfb; height: 74px; display: flex; align-items: center;
  justify-content: center; font-family: "IBM Plex Mono", monospace; font-size: 10.5px;
  letter-spacing: .1em; text-transform: uppercase; color: #b4bcc6; }

.doc table.key { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.doc table.key th { text-align: left; font-family: "IBM Plex Mono", monospace; font-size: 10.5px;
  font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--faint);
  padding: 0 10px 7px 0; border-bottom: 1px solid var(--rule); }
.doc table.key td { padding: 8px 10px 8px 0; border-bottom: 1px solid var(--rule); vertical-align: top;
  color: var(--soft); }
.doc table.key td.n { width: 30px; font-family: "IBM Plex Mono", monospace; font-weight: 600;
  color: var(--accent); }
.doc table.key td.name { font-weight: 600; color: var(--ink); white-space: nowrap; }
.doc .keywrap { padding: 4px 16px 18px; overflow-x: auto; }

.doc .callout { display: flex; gap: 12px; padding: 14px 16px; border-radius: 9px;
  background: var(--card); border: 1px solid var(--rule); border-left: 3px solid var(--accent); }
.doc .callout.warn { border-left-color: var(--amber); }
.doc .callout .hd { font-family: "IBM Plex Sans Condensed", sans-serif; font-weight: 600;
  font-size: 14.5px; color: var(--ink); display: block; margin-bottom: 3px; }
.doc .callout p { font-size: 13.5px; }
.doc ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 7px; }
.doc li { color: var(--soft); max-width: 66ch; }
.doc li strong { color: var(--ink); font-weight: 600; }
.doc footer { border-top: 1px solid var(--rule); padding-top: 16px; color: var(--faint); font-size: 13px; }
@media (prefers-reduced-motion: reduce) { .doc * { animation: none !important; transition: none !important; } }
</style>

<div class="doc"><div class="inner">

  <header>
    <div class="eyebrow">Approval before build · captured from the running app</div>
    <h1>The plan viewer’s two bars</h1>
    <p class="lede">
      Both bars below are the app’s <strong>real DOM and real stylesheet</strong>, lifted out of the
      drawer with a real plan open — not a drawing of them. The proposal moves the same elements
      into the arrangement you described, so every button keeps its own size, colour and icon.
    </p>
  </header>

  <section>
    <h2>1 · What is there now</h2>
    <p>One row, with the folder picker sitting after the file name instead of at the left.</p>
    <div class="spec">
      <div class="spechead">
        <span class="tag now">Today</span>
        <span class="what">One bar</span>
        <span class="note">captured live · scroll sideways if your window is narrow</span>
      </div>
      <div class="frame"><div class="live">
        ${cap.now}
        <div class="sheetstub">the plan</div>
      </div></div>
    </div>
  </section>

  <section>
    <h2>2 · What you asked for</h2>
    <p>
      Two bars. The top one is about <strong>which sheet you are looking at</strong>; the one under it
      is about <strong>the sheet itself</strong>. The dashed line marks where the plan section begins —
      nothing to its right may cross back into Worker&nbsp;status.
    </p>
    <div class="spec">
      <div class="spechead">
        <span class="tag next">Proposed</span>
        <span class="what">Top bar: choosing the sheet — second bar: the sheet</span>
        <span class="note">the same elements, moved</span>
      </div>
      <div class="frame"><div class="live">
        ${cap.proposed}
        <div class="sheetstub">the plan</div>
      </div></div>
      <div class="keywrap">
        <table class="key">
          <thead><tr><th></th><th>Control</th><th>Where it goes and why</th></tr></thead>
          <tbody>
            <tr><td class="n">1</td><td class="name">Folder selector</td><td>All the way left — its left edge is the left edge of the plan section, never crossing into Worker&nbsp;status.</td></tr>
            <tr><td class="n">2</td><td class="name">Plan bubbles</td><td>Straight after the folder selector. Scrolls sideways with no scrollbar drawn.</td></tr>
            <tr><td class="n">3</td><td class="name">Mark&nbsp;up</td><td><strong>You did not say where this goes.</strong> I have it heading the right-hand group, as the way into the studio. Move it if you would rather.</td></tr>
            <tr><td class="n">4</td><td class="name">Copy job folder path</td><td>Unchanged — you said it is good as it is.</td></tr>
            <tr><td class="n">5</td><td class="name">Print</td><td>Moves up beside the folder path.</td></tr>
            <tr><td class="n">6</td><td class="name">Download</td><td>Beside Print, same group.</td></tr>
            <tr><td class="n">7</td><td class="name">Full screen</td><td>Stays exactly where it is now, at the right.</td></tr>
            <tr><td class="n">8</td><td class="name">Layers</td><td>Second bar. Off the top bar entirely.</td></tr>
            <tr><td class="n">9</td><td class="name">Pin</td><td>Second bar, beside Layers — still nothing sits on top of the sheet.</td></tr>
            <tr><td class="n">10</td><td class="name">Plan name</td><td>Second bar. It is a label, not a control, so it stops competing with the buttons.</td></tr>
            <tr><td class="n">11</td><td class="name">Saved versions</td><td>Second bar, right-hand end.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="callout warn">
      <span><span class="hd">The “Plans” button is gone</span>
      <p>Your reason, and it is right: the folder selector plus the bubbles already <em>are</em> the plan chooser. A button opening a second way to pick the same thing is a second answer to a question already on screen.</p></span>
    </div>
  </section>

  <section>
    <h2>3 · The two things I am unsure of</h2>
    <ul>
      <li><strong>Mark&nbsp;up.</strong> Top bar as drawn, or down on the second bar with Layers and Pin?</li>
      <li><strong>The second bar’s colour.</strong> Drawn as a lighter navy so the two read as a pair. White with dark text would separate “choosing” from “reading” more sharply. Your call.</li>
    </ul>
  </section>

  <footer>Nothing is built yet. Approve, or mark the corrections, and it goes in.</footer>

</div></div>
`;

writeFileSync(OUT, page);
console.log(`${OUT}  ${(page.length / 1024).toFixed(0)} KB`);
