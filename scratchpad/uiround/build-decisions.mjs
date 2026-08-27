import { writeFileSync } from 'fs';
import { img, HEAD } from './shared.mjs';
const OUT = '/tmp/claude-0/-home-user-Wolfson-management-app/38623ef8-73c0-5354-912b-cb672cfed81c/scratchpad/ui-decisions.html';
const PROPOSAL_A = 'https://claude.ai/code/artifact/01c73e8b-9bad-4e38-aa15-ba884f12e601';

const AREAS = [
  {
    key: 'A', title: 'The plan in the apartment window',
    state: 'ready', link: PROPOSAL_A,
    blurb: 'Where the plan sits on each screen — beside the details or as its own tab — and the row of tabs above it.',
    pins: [
      { n: 1, crop: 'pincrop-1.png', where: 'Fold, opened sideways · apartment window',
        text: 'plan should fit side by side just like on pc' },
      { n: 5, crop: 'pincrop-5.png', where: 'iPad upright · apartment window',
        text: 'on the ipad upright and in general also plan should be a tab. in horizontal it should be side by side' },
      { n: 6, crop: 'pincrop-6.png', where: 'Office computer · apartment window',
        text: 'in general tabs should only be in the markup screens not on the initial preview' },
    ],
  },
  {
    key: 'B', title: 'The building diagram on a tablet',
    state: 'next',
    blurb: 'The row of coloured stage bubbles, and three buildings squeezed side by side on a screen that is not wide enough for them.',
    pins: [
      { n: 3, crop: 'pincrop-3.png', where: 'iPad upright · building diagram',
        text: 'bubbles ui part needs to be rethought for mobile from scratch' },
      { n: 4, crop: 'pincrop-4.png', where: 'iPad upright · building diagram',
        text: 'too smushed — maybe we should use a selector for 1 building at a time' },
    ],
  },
  {
    key: 'C', title: 'How the worker closes a job',
    state: 'queued',
    blurb: 'Two Close job buttons on one screen, and closing a job becoming its own clean screen instead of a panel inside the task.',
    pins: [
      { n: 2, crop: 'pincrop-2.png', where: 'Fold, opened sideways · the worker’s page',
        text: 'There are two close job buttons, and notes. Remove the big Close job button under files and photos — there should be one close button at the end. The worker should be able to add general notes while he works, and a voice recording, and see the plan. So: the information on top, then the plan, then the task, then any files and photos the office attached, and the option to add a note. Then Close job should take him to a completely new screen — a new pop-up: add the images, add a comment, a file, a recording, pictures, that whole thing, and then send. That way it is a lot cleaner.' },
    ],
  },
];

const stateTag = s => s === 'ready' ? '<span class="tag pin">Proposal ready — look at it</span>'
  : s === 'next' ? '<span class="tag wait">Next up</span>'
  : '<span class="tag wait">Queued</span>';

const areasHtml = AREAS.map(a => `
  <section>
    ${stateTag(a.state)}
    <h2>Area ${a.key} — ${a.title}</h2>
    <p style="color:var(--muted);margin:4px 0 0">${a.blurb}</p>
    ${a.link ? `<p style="margin:12px 0 0"><a href="${a.link}" style="color:var(--blue);font-weight:700">Open Proposal ${a.key} →</a></p>` : ''}
    ${a.pins.map(p => `
      <div class="card" style="margin-top:14px">
        <h3>Your note ${p.n}</h3>
        <p style="font-size:13px;margin:2px 0 0">${p.where}</p>
        <div class="quote"><span class="who">In your words</span>${p.text}</div>
        ${img(p.crop) ? `<img class="crop" src="${img(p.crop)}" alt="Where note ${p.n} was pinned">` : ''}
      </div>`).join('')}
  </section>`).join('');

const html = `${HEAD('UI Decisions')}
<div class="wrap">
  <div class="eyebrow">TzviAir · Wolfson Management App</div>
  <h1>UI Decisions</h1>
  <p class="lede">The running record of this design round. Your six notes from the device gallery are carried over below, sorted into three areas. Each area gets a proposal page built from the real app; whatever you approve gets locked here as a numbered decision, and the finished list is handed to the building session at the end.</p>

  <div class="card" style="border-left:4px solid var(--good)">
    <span class="tag good">Where things stand</span>
    <p><strong>Six notes in, nothing locked yet.</strong> Area A has a proposal waiting for you now. B and C come after — one at a time, so nothing gets decided in a rush.</p>
  </div>

  <h2 style="margin-top:34px">The agenda — your six notes</h2>
  ${areasHtml}

  <section>
    <h2>Locked decisions</h2>
    <div class="empty">
      <div class="big">Nothing locked yet</div>
      Approve something in Proposal A and it appears here — numbered, in plain words, with its picture.
    </div>
  </section>

  <section>
    <h2>Build list</h2>
    <div class="empty">
      <div class="big">Written when you say “we’re done”</div>
      One numbered line per change, naming the exact file it touches, so the building session can work straight from it.
    </div>
  </section>
</div>`;
writeFileSync(OUT, html);
console.log('decisions bytes:', html.length);
