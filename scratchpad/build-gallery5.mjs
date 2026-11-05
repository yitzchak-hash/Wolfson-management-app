// Builds the Device Gallery page from gallery5.mjs's pictures (round of 2026-11-05). Same page manner as
// build-gallery.mjs — the body once inside #page-src, the pins in #pin-data, the loader last — so the page can
// still republish itself with the owner's pin notes. Every old pin was marked done the round before, so they are
// dropped now (the skill's rule: one round to check them).
// node scratchpad/build-gallery5.mjs   → the session scratchpad's device-gallery.html
import fs from 'node:fs';

const DIR = '/tmp/claude-0/-home-user/5aa05b05-0399-5fa1-9ab2-84b21f667c30/scratchpad/gal5';
const OUT = '/tmp/claude-0/-home-user/5aa05b05-0399-5fa1-9ab2-84b21f667c30/scratchpad/device-gallery.html';
const style = fs.readFileSync('scratchpad/gallery-style.css', 'utf8');
const loader = fs.readFileSync('scratchpad/gallery-loader.js', 'utf8');
const audit = JSON.parse(fs.readFileSync(`${DIR}/gal5-audit.json`, 'utf8'));
const FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Figtree:wght@400;500;600;700&display=swap';

const PROFILES = [
  ['iphone17pm', 'iPhone 17 Pro Max', 'Held upright. One building at a time, the Building view first, the plan in its own tab — tap it for full screen.', 'ph', 220],
  ['galaxy-s', 'Galaxy S24 · S25 · S26', 'All three are the same width (360). The narrowest everyday phone the office carries.', 'ph', 200],
  ['fold-cover', 'Galaxy Z Fold · folded (the cover screen)', 'The long narrow outside screen.', 'ph', 200],
  ['fold-open', 'Galaxy Z Fold · opened, upright', 'The big square inner screen, held upright — the phone layout, with Board · Building beside the tabs.', 'ph crease-v', 330],
  ['fold-side', 'Galaxy Z Fold · opened, on its side', 'Wide enough for the computer layout: the plan beside the details.', 'pad crease-h', 420],
  ['ipad-port', 'iPad · upright', 'One building at a time, drawn big.', 'pad', 330],
  ['ipad-land', 'iPad · sideways', 'The computer layout, driven by finger: all three buildings side by side.', 'pad', 470],
  ['tab-s10', 'Galaxy Tab S10 FE · upright', 'The Android tablet.', 'pad', 300],
  ['laptop', 'A laptop (1440 × 900)', 'The smaller computer screen.', 'pad pc', 560],
  ['pc', 'The office computer (1920 × 1080)', 'The full monitor — the reference view.', 'pad pc', 640],
];
const SCREENS = [
  ['building', 'Building view — what opens first now'],
  ['board', 'The board — one press away'],
  ['apartment', 'The apartment window'],
  ['plan', 'The plan — Share in its black zoom bar'],
  ['worker', 'The worker’s phone — the plan with Share'],
];
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const b64 = p => `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}`;

let faults = 0;
for (const d of Object.values(audit)) for (const [k, v] of Object.entries(d)) if (k !== '__errors') faults += v.overflow + v.clipped + (v.pageWiderThanScreen ? 1 : 0);

let body = `
  <div class="eyebrow">TzviAir · Wolfson Management App · 5 November</div>
  <h1>Every device, today</h1>
  <p class="lede">Real screenshots of the app as it stands on the preview, on every device you named: the iPhone 17 Pro Max, the Galaxy S24 · S25 · S26, the Fold three ways, the iPad, the Galaxy Tab, a laptop and the office computer. Five screens each — the Building view, the board, the apartment window, the plan with its Share, and the worker’s phone.</p>
  <div class="fixcard">
    <span class="pill">What this round found and fixed</span>
    <p><strong>On the Galaxy S (360 wide) and the iPhone 17 Pro:</strong> the top bar’s buttons sat on top of each other (the What’s New sparkle on the Calendar button). Fixed — the workspace name gives way first, and What’s New steps aside under 400.</p>
    <p><strong>On the iPhone 17 Pro Max:</strong> the two apartment cards over the Building view overlapped. Fixed — they now sit side by side with a gap.</p>
    <p><strong>On an upright iPad and the opened Fold:</strong> the building was drawn small in a sea of grey. Fixed — it fills the screen now.</p>
    <p><strong>Your asks today:</strong> the Building view opens first everywhere; upright phones show one building, never All; a tap on the plan opens it full screen; Share opens the phone’s menu on the first tap and sits in the plan’s zoom bar.</p>
    <p><strong>Checked on every picture:</strong> ${faults === 0 ? 'nothing runs past the screen’s edge and no words are cut off — 0 problems on all 50 pictures.' : `${faults} problems found by the automatic check.`}</p>
    <p><strong>Honest about Share on the iPhone:</strong> these pictures are taken in Chrome’s engine; the iPhone’s own share menu can only be proven on a real iPhone. The fix is the one that worked for the Fold — the PDF is ready before you tap.</p>
  </div>
  <div class="fixcard">
    <span class="pill">How to ask for a change</span>
    <p><strong>Press “Note a change” at the bottom, tap the exact spot</strong> on any picture, then type your change — or press the microphone and say it. Add as many notes as you like, then press <strong>Send to Claude</strong>. Then tell Claude: <em>“check my gallery notes”</em>.</p>
  </div>`;

let count = 0; const missing = [];
for (const [tag, dev, blurb, cls, w] of PROFILES) {
  const figs = SCREENS.map(([name, caption]) => {
    const p = `${DIR}/${tag}-${name}.jpg`;
    if (!fs.existsSync(p)) { missing.push(`${tag}/${name}`); return ''; }
    count++;
    return `<figure><div class="dev ${cls}"><span class="shotwrap" data-shot="${tag}/${name}" data-dev="${esc(dev)}" data-scr="${esc(caption)}"><img loading="lazy" style="width:${w}px" src="${b64(p)}" alt="${esc(caption)} — ${esc(dev)}"></span></div><figcaption>${esc(caption)}</figcaption></figure>`;
  }).join('');
  body += `\n  <section><h2>${esc(dev)}</h2><p>${esc(blurb)}</p><div class="shots">${figs}</div></section>`;
}

const SC = '<' + '/script>';
const pinJson = JSON.stringify({ pins: [] });
const doc = '<!doctype html>\n<html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<title>Device Gallery</title>'
  + `<link id="gallery-fonts" rel="stylesheet" href="${FONTS}">`
  + `<style id="gallery-style">${style}</style>`
  + '</head><body>'
  + '<div class="wrap" id="app"></div>'
  + `<script type="text/x-page" id="page-src">${body}\n${SC}`
  + `<script type="application/json" id="pin-data">${pinJson}${SC}`
  + `<script id="gallery-loader">${loader}${SC}`
  + '</body></html>';
fs.writeFileSync(OUT, doc);
console.log('built', OUT, (doc.length / 1e6).toFixed(1), 'MB,', count, 'pictures, audit problems', faults, missing.length ? `— missing: ${missing.join(', ')}` : '');
