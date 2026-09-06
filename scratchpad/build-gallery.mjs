// Builds the Device Gallery page from the captured screenshots:
//   node scratchpad/build-gallery.mjs            → session scratchpad/device-gallery.html
// The page keeps the artifact's own manner (the loader lets it republish
// itself with the owner's pins): body markup once inside #page-src, pins in
// #pin-data, the loader script last. Style, loader and pins live beside this
// script; the pins are carried forward — never dropped — with `done` and a
// note of what was done.
import fs from 'node:fs';

const OUT = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad/device-gallery.html';
const style = fs.readFileSync('scratchpad/gallery-style.css', 'utf8');
const loader = fs.readFileSync('scratchpad/gallery-loader.js', 'utf8');
const pins = JSON.parse(fs.readFileSync('scratchpad/gallery-pins.json', 'utf8'));
const FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Figtree:wght@400;500;600;700&display=swap';

const PROFILES = [
  ['iphone', 'iPhone 17 Pro', 'The newest iPhone. Phone layout: one building at a time, full-screen windows, the plan in its own tab.', 'ph', 210],
  ['galaxy', 'Galaxy S25 Ultra', 'The newest Galaxy. Same phone layout — a touch narrower than the iPhone, everything still fits.', 'ph', 205],
  ['flip', 'Galaxy Z Flip · and the Fold’s cover screen', 'The narrowest screen the app runs on. Names wrap instead of getting chopped.', 'ph', 190],
  ['fold-open', 'Galaxy Z Fold · opened up', 'The big square inner screen. Still the phone layout — big comfortable cells, the plan in its own tab.', 'ph crease-v', 330],
  ['fold-side', 'Galaxy Z Fold · opened, sideways', 'Wide enough for the desktop layout: sidebar, three buildings, the PC-style apartment window with the plan beside the details.', 'pad crease-h', 430],
  ['fold-big', 'The newest Z Fold', 'Your screenshot’s screen. The apartment window opens PC-style and sizes itself so the WHOLE plan fits — nothing cut off.', 'pad crease-v', 470],
  ['ipad-port', 'iPad · upright', 'Exactly on the line where desktop begins: sidebar, full diagram, desktop apartment window.', 'pad', 330],
  ['ipad-land', 'iPad · sideways', 'The classic iPad-on-a-desk view. Everything the office PC shows, driven by finger.', 'pad', 430],
  ['ipadpro11', 'iPad Pro 11″ · upright', 'Taller and a little wider — same desktop layout, more rows on screen.', 'pad', 340],
  ['ipadpro13', 'iPad Pro 13″ · sideways', 'The biggest tablet: effectively the office PC in your hands.', 'pad', 470],
  ['pc', 'The office computer', 'A full 1920×1080 monitor — the reference view everything else is compared against.', 'pad pc', 640],
];

// The screens, in the order they are read — your seven screenshots first.
const SCREENS = [
  ['notes', 'Notes tab · worker bubble beside CURRENT, a memo as a note'],
  ['details-memo', 'Details · a memo just recorded in General Notes'],
  ['task-memo', 'New task · a memo recorded as the description'],
  ['problem', 'Report a problem · with a memo'],
  ['worker-task', 'Worker’s phone · the problem and its messages'],
  ['closing', 'Worker’s phone · closing the job'],
  ['calendar', 'Worker’s phone · the month'],
  ['drawer', 'The apartment window'],
  ['diagram', 'The building diagram'],
  ['board', 'The Job Board'],
  ['portal', 'The worker’s page'],
];

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const img = (tag, name) => {
  for (const ext of ['jpg', 'png']) {
    const p = `scratchpad/gal-${tag}-${name}.${ext}`;
    if (fs.existsSync(p)) return `data:image/${ext === 'jpg' ? 'jpeg' : 'png'};base64,${fs.readFileSync(p).toString('base64')}`;
  }
  return null;
};

let body = `
  <div class="eyebrow">TzviAir · Wolfson Management App</div>
  <h1>Every device, finalized</h1>
  <p class="lede">The seven screens from your screenshots — the notes tab, a memo in the details, a memo on a new task, the problem form, the worker’s problem thread, the closing screen and the month — plus the apartment window, the diagram, the board and the worker’s page, captured on every screen the company carries. Real screenshots of the real app, from the branch that goes live. Memos are recorded through a real microphone in the harness, so the waveforms are genuine; the words under them need the transcription key on the server.</p>
  <div class="fixcard">
    <span class="pill">How to ask for a change</span>
    <p><strong>Press “Note a change” at the bottom, tap the exact spot</strong> on any picture, then type your change — or press the microphone and say it. Add as many notes as you like, then press <strong>Send to Claude</strong>. After that, tell Claude in any chat: <em>“check my gallery notes”</em> — it reads your pins straight off this page and makes the changes.</p>
  </div>`;

let count = 0, missing = [];
for (const [tag, dev, blurb, cls, w] of PROFILES) {
  const figs = SCREENS.map(([name, caption]) => {
    const src = img(tag, name);
    if (!src) { missing.push(`${tag}/${name}`); return ''; }
    count++;
    return `<figure><div class="dev ${cls}"><span class="shotwrap" data-shot="${tag}/${name}" data-dev="${esc(dev)}" data-scr="${esc(caption)}"><img style="width:${w}px" src="${src}" alt="${esc(caption)} — ${esc(dev)}"></span></div><figcaption>${esc(caption)}</figcaption></figure>`;
  }).join('');
  body += `\n  <section><h2>${esc(dev)}</h2><p>${esc(blurb)}</p><div class="shots">${figs}</div></section>`;
}

const SC = '<' + '/script>';
const pinJson = JSON.stringify(pins).replace(/</g, '\\u003c');
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
console.log('built', OUT, (doc.length / 1e6).toFixed(1), 'MB,', count, 'pictures', missing.length ? `— missing: ${missing.join(', ')}` : '');
