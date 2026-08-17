// Assembles the phone preview: every screen as a pixel-exact render inside a
// phone frame you can scroll.
//
// Images rather than live iframes, and the reason is measured: a captured page
// carries a 110KB inline stylesheet, and an iframe holding one lays out
// correctly — right rects, right colours — and then never paints, while a
// trivial srcdoc beside it paints fine. So the frames would have shipped
// white. A long render always draws, is exactly what the phone shows, and in a
// fixed-height frame with overflow-y:auto it scrolls the same way. The
// editable HTML of each screen ships beside this page.
import { readFileSync, writeFileSync, statSync } from 'fs';

const SCREENS = [
  ['diagram', 'The buildings', 'One building behind small tabs, the count in grey beside them. Every apartment shows its number, the family and the full stage name — nothing is cut off. Scroll the frame.'],
  ['filters', 'Filters', 'Everything the desktop spreads across the top, behind one button: type, the stage legend, the Changes badge, bulk update and print.'],
  ['apartment', 'An apartment', 'Who it is on the first line, what you do with it on the second — the buttons no longer run under the close X, and the fields stack instead of colliding.'],
  ['dashboard', 'Dashboard', 'The figures two to a row, then progress by stage. Every number opens the list behind it.'],
  ['tasks', 'Tasks', 'One row of controls that scrolls and fades at its edge, with Add Task pinned outside so the main action can never scroll away.'],
  ['calendar', 'Calendar', 'The month starts at the top — the old page title was saying what the lit-up tab already says.'],
  ['reports', 'Reports', 'The whole builder: what a row is, which columns, the rules. Out as CSV, Excel or print.'],
  ['activity', 'Activity', 'Who changed what, filtered by person, building, kind and date.'],
  ['settings', 'Project settings', 'Stages, buildings and the worker sheet, one column at full width.'],
  ['portal', 'The worker portal', 'What a worker holds on site: his tasks by date, the job, the stage, whether he is late. His name and count now fit the bar instead of running off it.'],
];

/** The same app for a Hebrew office and a Hebrew worker. */
const HEBREW = [
  ['diagram-he', 'הבניינים', 'Everything mirrors: the tabs run right to left, the search sits on the right, the bottom bar flips. The apartment numbers and family names stay where the eye expects them.'],
  ['portal-he', 'פורטל העובד', 'The portal follows the WORKER’s language, not the office’s — and the countdown badges now translate with it, which they never did.'],
  ['tasks-he', 'משימות', 'The task list, mirrored, with the controls in the same order a Hebrew reader scans them.'],
];

const b64 = f => readFileSync(`scratchpad/pv-${f}.png`).toString('base64');

const card = ([id, name, blurb]) => `
      <figure class="screen">
        <figcaption>
          <span class="screen-name">${name}</span>
          <span class="screen-note">${blurb}</span>
        </figcaption>
        <div class="bezel">
          <div class="glass">
            <img src="data:image/png;base64,${b64(id)}" alt="${name} on a phone">
          </div>
        </div>
      </figure>`;
const cards = SCREENS.map(card).join('\n');
const hebrewCards = HEBREW.map(card).join('\n');

const html = `<title>TzviAir on a Phone</title>
<style>
  :root {
    --bg: #eceff4;
    --panel: #ffffff;
    --ink: #16202b;
    --muted: #5d6b7c;
    --navy: #1e3a5f;
    --gold: #b8860b;
    --line: #d6dce4;
    --bezel: #0d1219;
    --shadow: rgba(12, 22, 38, .25);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0e161f; --panel: #16212e; --ink: #e9eef4; --muted: #93a3b5;
      --navy: #7cc0e6; --gold: #d9a521; --line: #243141; --bezel: #000000;
      --shadow: rgba(0, 0, 0, .55);
    }
  }
  :root[data-theme="dark"] {
    --bg: #0e161f; --panel: #16212e; --ink: #e9eef4; --muted: #93a3b5;
    --navy: #7cc0e6; --gold: #d9a521; --line: #243141; --bezel: #000000;
    --shadow: rgba(0, 0, 0, .55);
  }

  body {
    margin: 0; padding: 30px 20px 70px;
    background: var(--bg); color: var(--ink);
    font: 15px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .wrap { max-width: 1400px; margin: 0 auto; }
  .eyebrow {
    font-size: 11px; font-weight: 800; letter-spacing: .15em;
    text-transform: uppercase; color: var(--gold); margin-bottom: 7px;
  }
  h1 { font-size: 27px; line-height: 1.2; margin: 0 0 10px; text-wrap: balance; }
  .lede { color: var(--muted); max-width: 66ch; margin: 0; }
  .lede strong { color: var(--ink); }

  .screens {
    display: flex; flex-wrap: wrap; gap: 32px 26px;
    justify-content: center; margin-top: 32px;
  }
  .screen { margin: 0; width: 408px; max-width: 100%; }
  figcaption { padding: 0 4px 10px; min-height: 66px; }
  .screen-name { display: block; font-weight: 800; font-size: 15.5px; color: var(--navy); }
  .screen-note { display: block; font-size: 12.5px; color: var(--muted); margin-top: 3px; }

  .bezel {
    background: var(--bezel); border-radius: 36px; padding: 9px;
    box-shadow: 0 20px 46px var(--shadow);
  }
  /* The frame is one phone tall and scrolls, so a long page reads the way it
     does in the hand rather than as a squashed strip. */
  .glass {
    height: 770px; border-radius: 28px; overflow-y: auto; overflow-x: hidden;
    background: #fff; -webkit-overflow-scrolling: touch;
  }
  .glass img { display: block; width: 100%; height: auto; }

  .note {
    margin-top: 36px; padding: 15px 17px; font-size: 13.5px; color: var(--muted);
    background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
  }
  .note strong { color: var(--ink); }
  .section {
    font-size: 20px; margin: 54px 0 6px; padding-top: 26px;
    border-top: 1px solid var(--line);
  }
</style>
<div class="wrap">
  <header>
    <div class="eyebrow">TzviAir · Wolfson · 390 × 844</div>
    <h1>The whole app on a phone</h1>
    <p class="lede">Each frame is the <strong>real page</strong> rendered at phone size from the running
    app — not a drawing of it, and not a resized desktop screenshot. <strong>Scroll inside a frame</strong>
    to walk down the page. Tell me what to change on any of them and the app moves with it.</p>
  </header>

  <div class="screens">${cards}
  </div>

  <h2 class="section">In Hebrew</h2>
  <p class="lede">The office and the worker each read the app in their own language, and the whole
  layout mirrors — <strong>right to left</strong>, not merely translated.</p>
  <div class="screens">${hebrewCards}
  </div>

  <p class="note"><strong>Rendered on a full workspace</strong> — 168 apartments with real family names
  and stages set, because a phone layout only ever breaks on content longer than its box. The buildings
  page, the filter sheet and an open apartment are the three that changed most this round.</p>
</div>
`;

writeFileSync('scratchpad/phone-preview.html', html);
console.log(`phone-preview.html  ${(statSync('scratchpad/phone-preview.html').size / 1024 / 1024).toFixed(2)} MB`);
