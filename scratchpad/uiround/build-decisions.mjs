import { writeFileSync } from 'fs';
import { img, HEAD } from './shared.mjs';
const OUT = '/tmp/claude-0/-home-user-Wolfson-management-app/38623ef8-73c0-5354-912b-cb672cfed81c/scratchpad/ui-decisions.html';
const PROPOSAL_A = 'https://claude.ai/code/artifact/01c73e8b-9bad-4e38-aa15-ba884f12e601';

/** LOCKED — approved by the owner, 27 Aug. Never edited except by him. */
const LOCKED = [
  {
    n: 1, title: 'The plan sits beside the details on a wide screen, and becomes a tab on a narrow one',
    body: `The dividing line is <strong>800 pixels of screen width</strong>. Wider than that — the sideways Fold, the sideways iPad, every PC — the plan sits beside the details, and the details column gives way so the plan gets real room. Narrower — every phone, the opened Fold held upright, the upright iPad — the plan becomes its own tab next to Details. Turning a tablet from upright to sideways moves it from one to the other by itself, while the window stays open.`,
    pics: [['prop-a-829-now.png', 'Fold sideways before — plan at 17%'],
           ['prop-a-829-proposed.png', 'After — the details give way, plan at 30%']],
  },
  {
    n: 2, title: 'The plan’s tab row never appears on a preview — anywhere, on any device',
    body: `The <strong>“Plan ✕ +”</strong> row is gone from every preview: iPhone, Galaxy, the Flip, the Fold opened upright and sideways, every iPad, and every PC. No exceptions. It stays exactly as it is inside <strong>Mark up</strong>, where opening several plans at once is the whole point. On a phone this also removes the second row of tabs sitting under the app’s own Details / Plan / Tasks row.`,
    owner: 'not on iPhone, not on fold open upright, not on iPad open upright, not on open sideways. All previews on PC, everything, everything, everything, no tabs. Only in the markup.',
    pics: [['ref-phonetabs-now.png', 'Phone before — two tab rows stacked'],
           ['ref-phonetabs-gone.png', 'After — one tab row, the plan starts higher']],
  },
  {
    n: 3, title: 'Drive and Zoho stay side by side, and their text hides behind the field’s edge',
    body: `The two link boxes stay <strong>side by side at every width</strong> — they never stack. What gives instead is the writing inside them: the long address runs to the end of its box and slips away behind the edge, so a box can never grow past its own column and collide with its neighbour.`,
    owner: 'Do the drive and zoho link side by side, but make the text like go behind the field at the end. Kind of like hide behind or whatever.',
    pics: [['ref-links-now.png', 'Before — the two addresses print on top of each other'],
           ['ref-links-fixed.png', 'After — side by side, each fading out at its own edge']],
  },
  {
    n: 4, title: 'Below 900 pixels the diagram shows one building at a time',
    body: `Big <strong>A1 / A2 / A3</strong> tabs pick the building — the control your phone already uses, raised to tablets. Above 900 pixels nothing changes: wide monitors keep showing all three buildings side by side. This one decision is what takes an apartment cell from <strong>75 pixels wide to 311</strong>, which is the difference between a name reading &ldquo;G&hellip;&rdquo; and reading &ldquo;Goldstein, Menachem &middot; Concealed Units Installed&rdquo;.`,
    owner: 'option 2, apply it below 900',
    pics: [['b-now.png', 'Today at iPad width — three buildings, no readable names'],
           ['b-opt2.png', 'Approved — one building, every name readable']],
  },
  {
    n: 5, title: 'The stage bubbles become one stage bar, and the loose row of numbers goes away',
    body: `Below 900 pixels the top of the diagram becomes: <strong>search plus one Filters button</strong> (the type filter, Changes, Bulk update, Print and clear all live inside it, as they already do on the phone), the building tabs, and then <strong>one bar showing the whole project</strong> — each stage a block sized by how many apartments are in it, tap a block to filter to that stage. The eight wrapping bubbles and the separate row of bare numbers are both replaced by that bar, so the counts finally sit inside the thing they count. Above 900 pixels the toolbar stays exactly as it is today.`,
    pics: [['b-opt2.png', 'The approved layout — the bar reads as the project’s state at a glance']],
  },
];

const AREAS = [
  { key: 'A', title: 'The plan in the apartment window', state: 'done', link: PROPOSAL_A,
    blurb: 'Where the plan sits on each screen, and the row of tabs above it.',
    pins: [] },
  { key: 'B', title: 'The building diagram on a tablet', state: 'done',
    link: 'https://claude.ai/code/artifact/3226a721-b537-4fdb-ad7f-4b38ce4e8151',
    blurb: 'The row of coloured stage bubbles, and three buildings squeezed side by side on a screen that is not wide enough for them.',
    pins: [] },
  { key: 'C', title: 'How the worker closes a job', state: 'open',
    link: 'https://claude.ai/code/artifact/2cd1d84f-e771-497f-b626-5ee7c8b8e688',
    blurb: 'Two Close job buttons on one screen, and closing a job becoming its own clean screen instead of a panel inside the task.',
    pins: [
      { n: 2, crop: 'pincrop-2.png', where: 'Fold, opened sideways · the worker’s page',
        text: 'There are two close job buttons, and notes. Remove the big Close job button under files and photos — there should be one close button at the end. The worker should be able to add general notes while he works, and a voice recording, and see the plan. So: the information on top, then the plan, then the task, then any files and photos the office attached, and the option to add a note. Then Close job should take him to a completely new screen — a new pop-up: add the images, add a comment, a file, a recording, pictures, that whole thing, and then send. That way it is a lot cleaner.' },
    ] },
];

const lockedHtml = LOCKED.map(d => `
  <div class="card" style="border-left:4px solid var(--good)">
    <span class="tag good">Locked · decision ${d.n}</span>
    <h2 style="margin-top:10px">${d.n}. ${d.title}</h2>
    <p>${d.body}</p>
    ${d.owner ? `<div class="quote"><span class="who">Your words</span>${d.owner}</div>` : ''}
    <div class="pair">
      ${d.pics.map(([f, cap]) => img(f) ? `<div class="pane"><img src="${img(f)}" alt="${cap}"><p class="cap">${cap}</p></div>` : '').join('')}
    </div>
  </div>`).join('');

const stateTag = s => s === 'done' ? '<span class="tag good">Settled</span>'
  : s === 'open' ? '<span class="tag pin">Drawn — waiting for you</span>'
  : '<span class="tag wait">Queued</span>';

const areasHtml = AREAS.map(a => `
  <div class="card">
    ${stateTag(a.state)}
    <h2 style="margin-top:10px">Area ${a.key} — ${a.title}</h2>
    <p>${a.blurb}</p>
    ${a.state === 'done' ? `<p style="margin-top:8px"><strong>Approved.</strong> Locked above. <a href="${a.link}" style="color:var(--blue);font-weight:700">The proposal that got us there →</a></p>` : ''}
    ${a.state === 'open' ? `<p style="margin-top:8px"><a href="${a.link}" style="color:var(--blue);font-weight:700">Open Proposal ${a.key} →</a></p>` : ''}
    ${a.pins.map(p => `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line)">
        <h3>Your note ${p.n} · <span style="font-weight:400;color:var(--muted);font-size:13px">${p.where}</span></h3>
        <div class="quote"><span class="who">In your words</span>${p.text}</div>
        ${img(p.crop) ? `<img class="crop" src="${img(p.crop)}" alt="Where note ${p.n} was pinned">` : ''}
      </div>`).join('')}
  </div>`).join('');

const html = `${HEAD('UI Decisions')}
<div class="wrap">
  <div class="eyebrow">TzviAir · Wolfson Management App</div>
  <h1>UI Decisions</h1>
  <p class="lede">The running record of this design round. Everything you approve is locked here — numbered, in plain words, with a picture from the real app. Nothing is being built yet; the finished build list goes to the building session at the end.</p>

  <div class="card" style="border-left:4px solid var(--good)">
    <span class="tag good">Where things stand</span>
    <p><strong>5 decisions locked · Areas A and B settled.</strong> Area C — the worker’s Close job flow — is drawn and waiting for you. It is the last one.</p>
  </div>

  <section>
    <h2 style="font-size:24px">Locked decisions</h2>
    <p style="color:var(--muted);margin:0 0 16px">These are settled. They only change if you say so.</p>
    ${lockedHtml}
  </section>

  <section>
    <h2 style="font-size:24px">The agenda</h2>
    <p style="color:var(--muted);margin:0 0 16px">Your six notes from the device gallery, sorted into three areas.</p>
    ${areasHtml}
  </section>

  <section>
    <h2 style="font-size:24px">Build list</h2>
    <div class="empty">
      <div class="big">Written when you say “we’re done”</div>
      One numbered line per change, naming the exact file it touches, so the building session can work straight from it with nothing left to ask.
    </div>
  </section>
</div>`;
writeFileSync(OUT, html);
console.log('decisions bytes:', html.length);
