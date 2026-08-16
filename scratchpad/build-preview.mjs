// Assembles the phone-preview artifact: three REAL captured pages inside
// phone frames. The captures are embedded as JSON and poured into iframe
// srcdoc at load — self-contained, no network, nothing wired.
import { readFileSync, writeFileSync } from 'fs';

const states = [
  ['cap-diagram', 'The buildings page', 'One building at a time. Tabs pick A1 / A2 / A3, search and Filters sit in one slim row, the diagram starts right away.'],
  ['cap-sheet', 'Filters open', 'Everything the desktop spreads across the top lives behind the Filters button: type, the stage legend, Changes badge, bulk update, print.'],
  ['cap-drawer', 'An apartment open', 'Tapping a cell opens the same window the office uses, sized to the phone.'],
];

const payload = {};
for (const [f] of states) {
  payload[f] = readFileSync(`scratchpad/${f}.html`, 'utf8');
}
const json = JSON.stringify(payload).replace(/<\//g, '<\\/');

const cards = states.map(([id, name, blurb]) => `
      <figure class="frame">
        <figcaption>
          <span class="frame-name">${name}</span>
          <span class="frame-blurb">${blurb}</span>
        </figcaption>
        <div class="bezel"><iframe data-cap="${id}" title="${name}"></iframe></div>
      </figure>`).join('\n');

const html = `<title>The Phone Diagram</title>
<style>
  :root {
    --bg: #eef1f5;
    --card: #ffffff;
    --ink: #17222f;
    --muted: #5b6b7d;
    --accent: #1e3a5f;
    --gold: #b8860b;
    --line: #d8dee6;
    --bezel: #10161d;
  }
  :root:not([data-theme="light"]) { }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0f1720; --card: #16212e; --ink: #e8edf3; --muted: #8fa0b3;
      --accent: #4aa8d8; --line: #24313f; --bezel: #000000;
    }
  }
  :root[data-theme="dark"] {
    --bg: #0f1720; --card: #16212e; --ink: #e8edf3; --muted: #8fa0b3;
    --accent: #4aa8d8; --line: #24313f; --bezel: #000000;
  }
  body {
    background: var(--bg); color: var(--ink);
    font: 15px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    margin: 0; padding: 28px 20px 64px;
  }
  header { max-width: 1360px; margin: 0 auto 26px; }
  .eyebrow {
    font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase;
    color: var(--gold); margin-bottom: 6px;
  }
  h1 { font-size: 26px; margin: 0 0 8px; text-wrap: balance; }
  header p { color: var(--muted); max-width: 62ch; margin: 0; }
  header strong { color: var(--ink); }
  .frames {
    display: flex; flex-wrap: wrap; gap: 28px; justify-content: center;
    max-width: 1360px; margin: 0 auto;
  }
  .frame { margin: 0; width: 406px; max-width: 100%; }
  figcaption { padding: 0 4px 10px; }
  .frame-name {
    display: block; font-weight: 800; font-size: 15px; color: var(--accent);
  }
  .frame-blurb { display: block; font-size: 12.5px; color: var(--muted); margin-top: 2px; }
  .bezel {
    background: var(--bezel); border-radius: 34px; padding: 8px;
    box-shadow: 0 18px 44px rgba(10, 20, 35, .28);
  }
  .bezel iframe {
    display: block; width: 390px; max-width: 100%; height: 760px;
    border: 0; border-radius: 27px; background: #ffffff;
  }
  .note {
    max-width: 1360px; margin: 30px auto 0; padding: 14px 16px;
    background: var(--card); border: 1px solid var(--line); border-radius: 14px;
    color: var(--muted); font-size: 13.5px;
  }
  .note strong { color: var(--ink); }
</style>
<header>
  <div class="eyebrow">TzviAir · Wolfson · phone</div>
  <h1>The buildings page on a phone</h1>
  <p>These are <strong>not drawings</strong> — each frame is the real page, captured from the running
  app with its exact markup and styling, then unwired. Scroll inside a frame; open this
  on your phone for full size. Say what to change and both this page and the app move together.</p>
</header>
<div class="frames">${cards}
</div>
<p class="note"><strong>Captured from the live code</strong> on August 16 with the standard
Wolfson data (168 units, no stages set). Buttons here are intentionally dead — the wired
version is on the site once deployed.</p>
<script>
  const CAPS = ${json};
  for (const f of document.querySelectorAll('iframe[data-cap]')) {
    f.srcdoc = CAPS[f.dataset.cap];
  }
</script>
`;

writeFileSync('scratchpad/phone-preview.html', html);
console.log(`phone-preview.html: ${(html.length / 1024 / 1024).toFixed(2)} MB`);
