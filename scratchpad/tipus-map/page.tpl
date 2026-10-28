<title>Wolfson Tipus Map</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=Inter:wght@400;600;700&family=Caveat:wght@600&display=swap">
<style>
/* Layout: the three Wolfson buildings side by side as the board draws them, each flat coloured by its tipus; my findings in red beside them. */
:root {
  --table: #e6e8eb; --sheet: #fff; --ink: #111827; --muted: #5b6472; --navy: #1e3a5f; --marker: #c8312b;
  --A: #2f6fb3; --B: #2a9d6f; --C1: #d08a12; --C2: #a2479c; --head: #1e3a5f;
  --display: 'Archivo', 'Segoe UI', sans-serif; --body: 'Inter', 'Segoe UI', Arial, sans-serif; --hand: 'Caveat', 'Segoe Print', cursive;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --table: #1b1f25; --muted: #aeb6c2; --marker: #ff6b5e; --head: #e9edf2; color-scheme: dark } }
:root[data-theme="dark"] { --table: #1b1f25; --muted: #aeb6c2; --marker: #ff6b5e; --head: #e9edf2; color-scheme: dark }
body { background: var(--table); color: var(--ink); font-family: var(--body); }
.wrap { max-width: 1180px; margin: 0 auto; padding-block: 28px 64px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.eyebrow { font: 700 11px/1 var(--body); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
h1 { font: 800 clamp(28px, 4vw, 40px)/1.1 var(--display); color: var(--head); margin: 0 0 8px; text-wrap: balance; }
h2 { font: 600 22px var(--display); color: var(--head); margin: 0 0 12px; }
.lede { color: var(--muted); max-width: 66ch; font-size: 15px; line-height: 1.55; margin: 0; }
section { margin-top: 36px; }
.sheet { background: var(--sheet); border: 1px solid #cfd4da; border-radius: 6px; padding: 16px; color: #111827; min-width: 0; }
.rule { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 320px); gap: 18px; align-items: start; }
@media (max-width: 860px) { .rule { grid-template-columns: 1fr; } }
.note { font: 600 21px/1.2 var(--hand); color: var(--marker); }
.note ol { margin: 0; padding-left: 22px; } .note li { margin-bottom: 8px; }
.note small { display: block; font: 12px var(--body); opacity: .85; }
.legend { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; font-size: 13px; font-weight: 600; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 14px; height: 14px; border-radius: 3px; display: inline-block; }
.blds { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; overflow-x: auto; }
@media (max-width: 760px) { .blds { grid-template-columns: minmax(260px, 1fr); } }
.bld { border: 1px solid #dfe3e8; border-radius: 6px; overflow: hidden; min-width: 0; }
.bh { background: var(--navy); color: #fff; text-align: center; font: 700 14px var(--body); padding: 7px; }
.frow { display: grid; grid-template-columns: 34px repeat(4, minmax(0, 1fr)); gap: 3px; padding: 2px 4px; }
.fl { font-size: 10px; color: #6b7280; display: flex; align-items: center; justify-content: center; }
.c { border-radius: 4px; color: #fff; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 5px 2px; font-size: 12px; position: relative; }
.c b { font-weight: 700; } .c span { font-weight: 800; font-size: 11px; opacity: .95; }
.tA { background: var(--A); } .tB { background: var(--B); } .tC1 { background: var(--C1); } .tC2 { background: var(--C2); }
.c.proven { outline: 3px solid var(--marker); outline-offset: -3px; }
.c.proven::after { content: '✓'; position: absolute; top: 1px; right: 3px; font-size: 10px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
td, th { text-align: left; padding: 7px 8px; border-bottom: 1px solid #eef0f3; vertical-align: top; }
th { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: #6b7280; }
.tw { overflow-x: auto; }
.q { background: var(--sheet); border: 1px solid #cfd4da; border-left: 4px solid var(--marker); border-radius: 6px; padding: 14px 16px; color: #111827; margin-bottom: 10px; }
.q h3 { margin: 0 0 6px; font: 700 15px var(--body); }
.q ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 5px; font-size: 14px; }
.q li.star::before { content: '★ '; color: var(--marker); } .q li:not(.star)::before { content: '○ '; color: #9ca3af; }
</style>

<div class="wrap">
  <div class="eyebrow">Question 1 from the recording · what I found</div>
  <h1>Wolfson Tipus Map</h1>
  <p class="lede">Every Wolfson flat coloured by its tipus, worked out from our own files in Drive. The red-ringed flats are the
    ones I checked against a real plan or file name. Everything else follows the same rule.</p>

  <section>
    <h2>The rule</h2>
    <div class="rule">
      <div class="sheet">
        <div class="legend"><span><i style="background:var(--A)"></i>A</span><span><i style="background:var(--B)"></i>B</span><span><i style="background:var(--C1)"></i>C1</span><span><i style="background:var(--C2)"></i>C2</span><span><i style="background:#fff;outline:3px solid var(--marker);outline-offset:-3px"></i>checked against a file</span></div>
        <div class="blds">{{BUILDINGS}}</div>
      </div>
      <div class="note"><ol>
        <li>Floors 1–13: four flats a floor, in number order A · B · C1 · C2.<small>Flat 45 = A, 30 = B, 43 and 47 = C1, 40 = C2.</small></li>
        <li>Floor 14: 53 = A, 54 = B.</li>
        <li>The duplexes on 15–16: 55 = A, 56 = B.</li>
        <li>The same in all three buildings: 39 flats of each A, B, C1, C2, exactly as our price quote counts them.</li>
        <li>A joined flat keeps both: 38/39 is B + C1.</li>
      </ol></div>
    </div>
  </section>

  <section>
    <h2>Where it comes from</h2>
    <div class="sheet tw"><table>
      <thead><tr><th>File in Drive</th><th>What it says</th><th>Flat</th></tr></thead>
      <tbody>
        <tr><td>W Residence Mini Merkazi (our quote, 21 Apr 2025)</td><td>טיפוס A, B, C1, C2 — 39 of each; floor 14 A and B; floors 15/16 A and B</td><td>the whole project</td></tr>
        <tr><td>Weinstein.pdf</td><td>"טיפוס A"</td><td>Building 1 · 45 · first on floor 12</td></tr>
        <tr><td>"2_30 Nahon … טיפוס B"</td><td>B</td><td>Building 2 · 30 · second on floor 8</td></tr>
        <tr><td>"Zoom Meeting … 1_43 - C1"</td><td>C1</td><td>Building 1 · 43 · third on floor 11</td></tr>
        <tr><td>"Zoom meeting … Building 3_47 - C1"</td><td>C1</td><td>Building 3 · 47 · third on floor 12</td></tr>
        <tr><td>Redlich.pdf</td><td>"C2 טיפוס"</td><td>Building 1 · 40 · fourth on floor 10</td></tr>
        <tr><td>"דירה מחוברת לפי היועץ טיפוס BC1"</td><td>a joined B + C1</td><td>Building 1 · 38/39</td></tr>
        <tr><td>Berger's plan (in the recording)</td><td>"טיפוס A", floor 14</td><td>Building 2 · 53</td></tr>
        <tr><td>Ostern's plan (in the recording)</td><td>duplex, "דירה B", floor 15</td><td>Building 2 · 56</td></tr>
      </tbody></table></div>
  </section>

  <section>
    <h2>Two things for you</h2>
    <div class="q"><h3>1. Is the rule right?</h3>
      <ul><li class="star">Yes. Fill every Wolfson flat with its tipus and set Wolfson's list to A · B · C1 · C2. Any flat can still be changed by hand</li>
        <li>Some flats are different. Tell me which</li></ul></div>
    <div class="q"><h3>2. The big joined flat in Building 3 (21–24, "Gold")</h3>
      <p style="margin:0 0 8px;font-size:14px;color:#374151">Its plan is named "A-C1 GOLD … A-C2", and 22 and 23 still have their own folders.</p>
      <ul><li class="star">Leave its tipus empty for now, and you tell me</li><li>Mark it A + C2</li></ul></div>
  </section>
</div>
