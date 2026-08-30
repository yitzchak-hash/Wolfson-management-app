import { writeFileSync } from 'fs';
import { img, HEAD } from './shared.mjs';
import { BUILD, TRAPS } from './buildlist.mjs';
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
  {
    n: 6, title: 'One Close job button, and the task screen shows what the office sent',
    body: `The big green button in the middle of the worker&rsquo;s screen goes &mdash; there is one Close job, at the end. <strong>Urgent</strong> loses its box and is just a red dot and the word. The <strong>Download</strong> button on the plan gets repaired. The <strong>Add File</strong> button leaves the office&rsquo;s block (the worker&rsquo;s paperclip lives in the message box and on the closing screen).`,
    pics: [['c-now.png', 'Before — two Close job buttons and an empty section'],
           ['c-prop1.png', 'After — one button, and the office&rsquo;s material in its place']],
  },
  {
    n: 7, title: 'Closing a job is a screen of its own',
    body: `Pressing Close job opens its own screen instead of dropping a panel under the task. Two things on it: <strong>Tap to add photos, videos, or files</strong> at the top, and <strong>one comment box with the paperclip and the microphone inside it</strong>. No separate file section &mdash; the button at the top already takes files. Then <strong>Send and close the job</strong>. The line about pictures is <strong>not fixed text</strong>: it follows each worker&rsquo;s own permission, so a worker marked photos-optional sees no demand, no counter, and is never locked out.`,
    pics: [['c-now2.png', 'Before — the closing panel stacked under everything, two of each control'],
           ['c-prop2.png', 'After — two things and a button']],
  },
  {
    n: 8, title: 'The task&rsquo;s notes become a conversation, the same on the phone and the computer',
    body: `The office speaks from the left in white, the worker answers from the right in blue. A file is a card you press to <strong>open and download</strong>; a photo shows as a <strong>preview you press to expand</strong>, with download on the expanded view. One drawing of it, used in the worker&rsquo;s portal and in the apartment window&rsquo;s Tasks tab &mdash; on a monitor the bubbles stop at a readable width rather than running the whole way across.`,
    owner: 'More of a WhatsApp chat style over there — the notes in the office come in like a WhatsApp chat, and my note becomes like a reply message… This is how it should be in the tasks in the main thing as well, from the computer.',
    pics: [['chat-phone.png', 'On the worker&rsquo;s phone'],
           ['chat-desk.png', 'The same conversation at computer width']],
  },
  {
    n: 9, title: 'The closing comment is the last message in that conversation',
    body: `What the worker writes on the closing screen lands <strong>in the thread</strong>, with his photos attached to it, followed by a green <strong>Job closed &middot; 15:47</strong> marker. Not a separate field filed somewhere else &mdash; one history per task, in the order things actually happened. If he leaves the comment empty the photos still post and the marker still lands; the comment is never compulsory.`,
    pics: [['chat-closed.png', 'The closing comment and its photos, arriving as the last message']],
  },
  {
    n: 10, title: 'The conversation carries on after the job is closed',
    body: `Closing is a <strong>milestone in the thread, not the end of it</strong>. Both sides can keep writing afterwards &mdash; the office can ask about an old job weeks later and the worker can answer, right there where the whole story already is. And because the conversation stays open, <strong>nothing in it is ever edited or deleted</strong>: a correction is simply a new message. That is what makes the thread a record you can trust when you go back through the history of a job.`,
    owner: 'For comfortability, allow the conversation to go on even after a job was closed. If I go back and look at the history of my jobs…',
    pics: [['chat-after.png', 'The green marker is a milestone — the talking carries on beneath it']],
  },
  {
    n: 11, title: 'A closed job says so — it does not keep offering the button',
    body: `Once a task is closed, the green <strong>Close job</strong> button at the bottom is replaced by a plain <strong>Job closed</strong> state. The message box above it stays live, because the conversation carries on (decision 10) &mdash; it is only the button that goes.`,
    owner: 'If job was closed, it shouldn’t leave a Close job on the bottom. It should say job closed.',
    pics: [],
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
  { key: 'D', title: 'The task as a conversation', state: 'done',
    link: 'https://claude.ai/code/artifact/7113a269-5687-4d55-94d0-1a472bdd2ba9',
    blurb: 'The office’s notes and the worker’s replies as one WhatsApp-style chat on the task — the same on his phone and on your computer — with the closing comment as its last message.',
    pins: [] },
  { key: 'C', title: 'How the worker closes a job', state: 'done',
    link: 'https://claude.ai/code/artifact/2cd1d84f-e771-497f-b626-5ee7c8b8e688',
    blurb: 'Two Close job buttons on one screen, and closing a job becoming its own clean screen instead of a panel inside the task.',
    pins: [] },
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
    <p><strong>10 decisions locked · every area settled.</strong> Nothing is left open. Say “we’re done” and the build list gets written at the bottom of this page for the building session.</p>
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

  <section id="build">
    <h2 style="font-size:24px">Build list</h2>
    <p style="color:var(--muted);margin:0 0 6px">Written for the building session, from the eleven decisions above. Fifteen numbered changes, each naming the file it touches. Nothing here is guesswork &mdash; every line comes from something approved on this page.</p>
    <div class="card" style="border-left:4px solid var(--blue)">
      <h3>Before starting</h3>
      <p><strong>No <code>src/</code> file was changed during this round</strong> &mdash; it was design only. The pictures above are the real app with its own markup rearranged, so what was approved is reachable with the components that already exist.</p>
      <p style="margin-top:8px">Two thresholds, and they are deliberately different: <strong>800px</strong> decides where the plan sits, <strong>900px</strong> decides the diagram. On a sideways Fold (829px) the plan is beside the details <em>and</em> the diagram shows one building. That is correct, not a mistake.</p>
    </div>
    ${BUILD.map(part => `
      <h3 style="font-family:Archivo;font-size:17px;margin:26px 0 4px">${part.part}</h3>
      <p style="color:var(--muted);font-size:13.5px;margin:0 0 12px">From ${part.from}</p>
      ${part.items.map(it => `
        <div class="card">
          <h3>${it.n}. ${it.t}</h3>
          <p style="margin:6px 0 0">${it.f.map(f => `<code style="background:var(--paper);border:1px solid var(--line);border-radius:5px;padding:1px 6px;font-size:12.5px">${f}</code>`).join(' ')}</p>
          <p style="margin-top:9px">${it.d}</p>
        </div>`).join('')}
    `).join('')}

    <div class="card" style="border-left:4px solid var(--pin);margin-top:26px">
      <h3>Rules this build must not break</h3>
      <ul style="margin:10px 0 0;padding-left:20px;color:var(--muted)">
        ${TRAPS.map(t => `<li style="margin:7px 0">${t}</li>`).join('')}
      </ul>
    </div>

    <div class="card">
      <h3>How to check it</h3>
      <p>The harnesses that cover this ground already exist and should all stay green: <code>folddrawer</code> (the plan pane fits at five widths), <code>deskcheck</code> (the drawer&rsquo;s desktop row stays one line), <code>plantabs</code>, <code>planviewer</code>, <code>planzoom</code>, <code>planphone</code>, <code>portalround</code>, <code>multiday</code>, <code>stagereport</code>, <code>foldswap</code>, <code>ipadcheck</code>. Re-run <code>scratchpad/shots.mjs</code> at 344, 390, 402, 768&times;1024 and 1024&times;768 &mdash; overflow and clipped must both be 0 &mdash; and <code>node scratchpad/backupaudit.mjs</code> after item 15.</p>
    </div>
  </section>
</div>`;
writeFileSync(OUT, html);
console.log('decisions bytes:', html.length);
