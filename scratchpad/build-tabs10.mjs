// The Galaxy Tab S10 FE page: every captured screen in a tablet frame, both
// orientations, at both device ratios the tablet might report; the overflow
// audit and the pen probe results underneath. One artifact, images inlined.
import fs from 'node:fs';
const OUT = '/tmp/claude-0/-home-user-Wolfson-management-app/b8d14d64-4aa3-5544-895c-576d1b3eced3/scratchpad/tabs10-gallery.html';
const SHOTS = fs.existsSync('/tmp/shots-tabs10.log') ? fs.readFileSync('/tmp/shots-tabs10.log', 'utf8') : '';
const PEN = fs.existsSync('/tmp/tabs10-pen.log') ? fs.readFileSync('/tmp/tabs10-pen.log', 'utf8') : '';
const img = f => fs.existsSync(f) ? `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}` : null;
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const PROFILES = [
  ['tabs10-land', 'Sideways · 1152×720', 'The way it sits on a desk or in a stand. Desktop layout: sidebar, three buildings, the PC-style apartment window with the plan beside the details.', 1152, 720],
  ['tabs10-port', 'Upright · 720×1152', 'Held like a clipboard. 720 is BELOW the desktop line, so this is the phone layout — one building at a time, big cells, the plan in its own tab.', 720, 1152],
  ['tabs10-land15', 'Sideways · if the tablet reports 1229×768', 'Only if Android reports a device ratio of 1.5 instead of 2. Same desktop layout, a little more room.', 1229, 768],
  ['tabs10-port15', 'Upright · if the tablet reports 768×1229', 'Only if the ratio is 1.5: 768 is exactly the desktop line, so upright would get the sidebar and the desktop apartment window.', 768, 1229],
];
const SCREENS = [
  ['drawer', 'The apartment window'], ['notes', 'Notes tab'], ['details-memo', 'Details · a memo in General Notes'],
  ['task-memo', 'New task · a memo as the description'], ['problem', 'Report a problem'], ['diagram', 'The buildings'],
  ['board', 'The Job Board'], ['portal', 'Worker’s portal · the task list'], ['worker-task', 'Worker’s portal · a task'], ['closing', 'Worker’s portal · closing the job'], ['calendar', 'Worker’s portal · the month'],
  ['studio', 'The markup studio'], ['studio-ink', 'The markup studio · S Pen strokes, a palm turned away, a finger stroke'], ['board-pen', 'The board after a pen drag'],
];
const penShots = { 'tabs10-land': 'landscape', 'tabs10-port': 'portrait' };

const parseSweep = () => {
  const blocks = SHOTS.split(/^=== /m).filter(Boolean).map(b => {
    const [head, ...rest] = b.split('\n');
    const rows = rest.filter(l => /^(OK|FAIL)/.test(l)).map(l => {
      const m = l.match(/^(OK|FAIL)\s+(\S+)\s+overflow=(\d+) clipped=(\d+)/); return m ? { ok: m[1] === 'OK', name: m[2], overflow: +m[3], clipped: +m[4] } : null;
    }).filter(Boolean);
    return { head: head.trim(), rows, notes: rest.filter(l => /^\s+[>~]/.test(l)) };
  });
  return blocks;
};
const sweep = parseSweep();
const penLines = PEN.split('\n').filter(l => /^(PASS|FAIL|──)/.test(l));

let cards = '';
for (const [tag, name, blurb, W, H] of PROFILES) {
  const shots = SCREENS.map(([s, label]) => {
    const f = (s === 'studio' || s === 'studio-ink' || s === 'board-pen')
      ? (penShots[tag] ? `scratchpad/gal-tabs10-${penShots[tag]}-${s}.jpg` : null)
      : `scratchpad/gal-${tag}-${s}.jpg`;
    const src = f ? img(f) : null;
    if (!src) return '';
    return `<figure class="shot ${W > H ? 'land' : 'port'}"><div class="tab" style="aspect-ratio:${W}/${H}"><img src="${src}" alt="${esc(label)}" loading="lazy"></div><figcaption>${esc(label)}</figcaption></figure>`;
  }).join('');
  cards += `<section class="profile"><h2>${esc(name)}</h2><p class="blurb">${esc(blurb)}</p><div class="shots">${shots}</div></section>`;
}
const sweepHtml = sweep.map(b => {
  const bad = b.rows.filter(r => !r.ok);
  return `<div class="card ${bad.length ? 'warn' : 'good'}"><h3>${esc(b.head)}</h3><p class="small">${b.rows.length} screens measured · ${bad.length === 0 ? 'nothing runs off the edge, nothing is cut off' : `${bad.length} with something to look at`}</p>${bad.length ? `<ul class="small">${bad.map(r => `<li>${esc(r.name)} — overflow ${r.overflow}, clipped ${r.clipped}</li>`).join('')}${b.notes.slice(0, 8).map(n => `<li class="mono">${esc(n.trim())}</li>`).join('')}</ul>` : ''}</div>`;
}).join('');
const penHtml = penLines.map(l => l.startsWith('──') ? `<h3>${esc(l.replace(/─/g, '').trim())}</h3>` : `<div class="${l.startsWith('PASS') ? 'ok' : 'bad'}">${esc(l)}</div>`).join('');

const html = `<title>Galaxy Tab S10 FE Gallery</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Figtree:wght@400;500;600;700&display=swap">
<style>
:root{--ink:#14213d;--navy:#1e3a5f;--accent:#4aa8d8;--paper:#f4f5f7;--card:#fff;--line:#dfe3ea;--muted:#6b7280;--good:#16a34a;--warn:#d97706}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--ink:#e8ecf3;--navy:#9cc7e6;--paper:#161a22;--card:#1f2530;--line:#343b48;--muted:#98a2b3}}
:root[data-theme="dark"]{--ink:#e8ecf3;--navy:#9cc7e6;--paper:#161a22;--card:#1f2530;--line:#343b48;--muted:#98a2b3}
body{background:var(--paper);color:var(--ink);font-family:Figtree,system-ui,sans-serif;font-size:15px;line-height:1.5}
.wrap{max-width:1180px;margin:0 auto;padding:36px 20px 80px}
h1{font-family:Archivo,system-ui,sans-serif;font-weight:800;font-size:40px;line-height:1.05;margin:0 0 6px;text-wrap:balance}
h2{font-family:Archivo,system-ui,sans-serif;font-weight:700;font-size:24px;margin:44px 0 4px}
h3{font-size:15px;margin:14px 0 6px}
.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:700}
.lede{font-size:17px;max-width:70ch}
.blurb{color:var(--muted);max-width:70ch;margin:0 0 14px}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:22px 18px}
.shot{margin:0}
.shot.land{grid-column:span 2}
@media (max-width:700px){.shot.land{grid-column:span 1}}
.tab{background:#0b0f18;border-radius:22px;padding:12px;box-shadow:0 14px 34px rgba(15,23,42,.28), inset 0 0 0 2px #2a3140}
.tab img{display:block;width:100%;height:100%;object-fit:cover;border-radius:12px;background:#fff}
figcaption{font-size:12.5px;color:var(--muted);margin-top:8px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:760px){.grid{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.card.good{border-left:5px solid var(--good)}.card.warn{border-left:5px solid var(--warn)}
.small{font-size:13px;color:var(--muted)}.mono{font-family:ui-monospace,monospace;font-size:12px}
.ok{color:var(--good);font-family:ui-monospace,monospace;font-size:12.5px}.bad{color:#dc2626;font-family:ui-monospace,monospace;font-size:12.5px}
.note{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:14px 0}
</style>
<div class="wrap">
<div class="eyebrow">TzviAir · device check · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
<h1>Galaxy Tab S10 FE</h1>
<p class="lede">Real screenshots of the app running at the tablet's size, both ways round, with the overflow audit and the S Pen checks underneath. Nothing here is a mock-up.</p>
<div class="note"><b>One thing to confirm on the real tablet.</b> A 10.9″ screen of 2304×1440 pixels usually reports a device ratio of 2, which makes the page 720 pixels wide upright — and 720 is <b>below the line where the desktop layout begins (768)</b>, so upright you get the phone layout and sideways the desktop one. If this tablet reports a ratio of 1.5 instead, upright is 768 wide and gets the desktop layout. Both are shown below. To tell which: hold it upright and open the app — a sidebar down the left means 1.5; a bar along the bottom means 2.</div>
${cards}
<h2>The overflow audit</h2>
<p class="blurb">Every routed screen, measured for anything running off the edge or any text cut off by its box, at all four sizes.</p>
<div class="grid">${sweepHtml || '<div class="card"><p class="small">The sweep has not finished yet.</p></div>'}</div>
<h2>The S Pen</h2>
<p class="blurb">Driven with a pen pointer and a finger pointer on the real markup studio and the real board: the pen draws and commits ink, a palm landing right behind the nib is turned away, a finger draws again once the pen is gone, the tablet is not allowed to pan under a stroke, every tool button is on screen, and on the board the pen arranges a tile while a finger pans.</p>
<div class="card">${penHtml || '<p class="small">The pen probe has not run yet.</p>'}</div>
</div>`;
fs.writeFileSync(OUT, html);
console.log('wrote', OUT, Math.round(fs.statSync(OUT).size / 1024), 'KB');
