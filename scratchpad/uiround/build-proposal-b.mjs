import { writeFileSync } from 'fs';
import { img, HEAD } from './shared.mjs';
const OUT = '/tmp/claude-0/-home-user-Wolfson-management-app/38623ef8-73c0-5354-912b-cb672cfed81c/scratchpad/proposal-b-diagram.html';

const OPTS = [
  { k: '1', name: 'Just the Filters button', shot: 'b-opt1.png', chrome: 126, badge: 'Leanest',
    what: 'Everything except search collapses into one <strong>Filters</strong> button — the type filter, the stage bubbles, Changes, Bulk update, Print, clear. This is exactly what your phone already does; it simply starts working on tablets too.',
    pro: ['The most room for the actual work — nine floors on screen instead of six.',
          'Nothing new to learn: it is the same control your phone has had for months.',
          'The smallest change of the three, so the least that can go wrong.'],
    con: ['The stage colours are not on screen — you tap Filters to see what each colour means.'] },
  { k: '2', name: 'The stage bar', shot: 'b-opt2.png', chrome: 266, badge: 'Recommended',
    what: 'Same Filters button as option 1 — and the room that frees is spent on <strong>one bar showing the whole project</strong>. Each stage is a block sized by how many apartments are in it, so you see at a glance that Concealed Units and Registers are the big ones and only 12 are at Piping. Tap a block to filter to that stage.',
    pro: ['Replaces four rows of chrome with one that actually tells you something.',
          'The eight bubbles and the orphan row of numbers (“12 36 12 12…”) become one picture — today those numbers sit apart from their own labels.',
          'Same total height as the screen has today, but with names you can read.'],
    con: ['A brand-new control — the only option here that has to be built from scratch.',
          'A stage with very few apartments gets a narrow block.'] },
  { k: '3', name: 'One line that scrolls', shot: 'b-opt3.png', chrome: 218, badge: 'Most familiar',
    what: 'The bubbles stay bubbles and stay on screen — but on <strong>one line that slides sideways</strong>, each carrying its own count inside it. The separate row of numbers disappears because the numbers move into the bubbles where they belong.',
    pro: ['Closest to what the office already knows — nothing moves anywhere new.',
          'The counts finally sit next to the names they belong to.',
          'Saves two rows without hiding anything behind a button.'],
    con: ['Stages past the fourth are off-screen until you slide the row.',
          'Still the tallest chrome of the three options.'] },
];

const cards = OPTS.map(o => `
  <section>
    <span class="tag ${o.badge === 'Recommended' ? 'good' : 'wait'}">${o.badge}</span>
    <h2>Option ${o.k} — ${o.name}</h2>
    <p>${o.what}</p>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin:10px 0 0;font-size:13.5px;color:var(--muted)">
      <span><strong style="color:var(--ink)">${o.chrome}px</strong> of chrome before the first apartment</span>
      <span><strong style="color:var(--good)">311px</strong> apartment cells</span>
    </div>
    <img src="${img(o.shot)}" alt="Option ${o.k}" style="display:block;width:100%;border-radius:10px;border:1px solid var(--line);margin:14px 0 0;background:var(--shot-bg)">
    <div class="pair" style="margin-top:14px">
      <div class="pane">
        <div class="plabel aft"><span class="dot"></span>GOOD</div>
        <ul style="margin:0;padding-left:18px;color:var(--muted);font-size:14.5px">${o.pro.map(x => `<li style="margin:5px 0">${x}</li>`).join('')}</ul>
      </div>
      <div class="pane">
        <div class="plabel now"><span class="dot"></span>THE COST</div>
        <ul style="margin:0;padding-left:18px;color:var(--muted);font-size:14.5px">${o.con.map(x => `<li style="margin:5px 0">${x}</li>`).join('')}</ul>
      </div>
    </div>
  </section>`).join('');

const html = `${HEAD('Three Ways to Fix the Diagram')}
<div class="wrap">
  <div class="eyebrow">Proposal B · design only, nothing built yet</div>
  <h1>Three ways to fix the diagram on a tablet</h1>
  <p class="lede">Your two notes — the bubbles needing a rethink, and three buildings too smushed — turn out to be one screen fighting itself. Here is what it does today, three different ways out, and what each one costs. Every picture is the real app.</p>

  <section style="border-top:0;padding-top:0">
    <span class="tag pin">What it does today</span>
    <h2>Two thirds of the screen is spent before you see an apartment</h2>
    <div class="quote"><span class="who">Your notes</span>“bubbles ui part needs to be rethought for mobile from scratch” · “too smushed — maybe we should use a selector for 1 building at a time”</div>
    <img src="${img('b-now.png')}" alt="The diagram today on an upright iPad" style="display:block;width:100%;border-radius:10px;border:1px solid var(--line);margin:14px 0 0;background:var(--shot-bg)">
    <div class="card" style="margin-top:14px">
      <h3>Measured, not guessed</h3>
      <p>Four rows of chrome — building filter, type filter, tools, then the bubbles wrapping onto two lines, then a row of bare numbers — eat <strong>266 pixels</strong> before the first apartment. What is left gives each apartment a <strong>75-pixel</strong> cell, so every family name is one letter and a full stop: “G…”, “A…”, “K…”. The screen shows three buildings and tells you nothing about any of them.</p>
    </div>
  </section>

  <div class="rule">
    <h3>All three options do the same two things</h3>
    <p><strong>One building at a time</strong>, chosen with big A1 / A2 / A3 tabs — your idea, and it is what takes the cell from 75 pixels to <strong>311</strong>, wide enough for the whole family name and the whole stage name. <strong>And the row of bare numbers goes away</strong> in all three. Where they differ is what happens to the bubbles.</p>
    <div class="scroll"><table>
      <tr><th>&nbsp;</th><th>Chrome</th><th>Cell</th><th>The stage colours are…</th></tr>
      <tr><td>Today</td><td>266px</td><td style="color:#c0392b">75px</td><td>on screen, over two wrapped rows</td></tr>
      <tr><td><strong>Option 1</strong></td><td style="color:var(--good)">126px</td><td>311px</td><td>behind the Filters button</td></tr>
      <tr><td><strong>Option 2</strong></td><td>266px</td><td>311px</td><td>one bar, sized by how many are in each</td></tr>
      <tr><td><strong>Option 3</strong></td><td>218px</td><td>311px</td><td>on screen, one line, slides sideways</td></tr>
    </table></div>
  </div>

  ${cards}

  <div class="ask">
    <h3>Which one?</h3>
    <p style="color:var(--muted);margin-top:6px">My pick is <strong style="color:var(--ink)">option 2</strong>. It costs the same screen height you already spend today, and in exchange those pixels stop being decoration and start telling you where the project actually stands — which is the thing the eight bubbles and the loose row of numbers never did. Option 1 is the safe pick if you would rather have the extra room for apartments and do not need the colours on screen.</p>
    <ol>
      <li><strong>Say “option 1”, “option 2” or “option 3”</strong> — or mix them (“option 2 but keep the bubbles visible”).</li>
      <li><strong>Where should this start?</strong> I would apply it below <strong>900 pixels</strong> of screen width — every phone and upright tablet — and leave wide monitors showing all three buildings as they do now. Say if you want the line somewhere else, or want one building everywhere.</li>
    </ol>
  </div>
</div>`;
writeFileSync(OUT, html);
console.log('proposal B bytes:', html.length);
