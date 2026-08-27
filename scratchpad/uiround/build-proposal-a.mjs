import { writeFileSync } from 'fs';
import { img, HEAD } from './shared.mjs';
const OUT = '/tmp/claude-0/-home-user-Wolfson-management-app/38623ef8-73c0-5354-912b-cb672cfed81c/scratchpad/proposal-a-plan.html';

const html = `${HEAD('The Plan Beside the Details')}
<div class="wrap">
  <div class="eyebrow">Proposal A · design only, nothing built yet</div>
  <h1>The plan beside the details</h1>
  <p class="lede">Three of your six notes are about the same thing: where the plan sits in the apartment window, and the row of tabs above it. Here is what happens now on each screen, and what I propose instead — every picture below is the real app, not a drawing.</p>

  <section style="border-top:0;padding-top:0">
    <span class="tag pin">Your note 5</span>
    <h2>On an upright iPad the plan is a sliver</h2>
    <div class="quote"><span class="who">You pinned</span>“on the ipad upright and in general also plan should be a tab — in horizontal it should be side by side”</div>
    <div class="pair">
      <div class="pane">
        <div class="plabel now"><span class="dot"></span>NOW</div>
        <img src="${img('prop-a-768-now.png')}" alt="iPad upright today: a squeezed plan pane">
        <p class="cap">The plan gets a 290-pixel strip. The sheet draws at 12% — unreadable — and its own buttons run off the edge.</p>
      </div>
      <div class="pane">
        <div class="plabel aft"><span class="dot"></span>PROPOSED</div>
        <img src="${img('prop-a-768-proposed.png')}" alt="iPad upright proposed: a Plan tab">
        <p class="cap">No side pane. <strong>Plan becomes a tab</strong>, next to Details — exactly like the phone already does. One tap and the plan has the whole window.</p>
      </div>
    </div>
  </section>

  <section>
    <span class="tag pin">Your note 1</span>
    <h2>On the Fold sideways it should sit beside, like the PC</h2>
    <div class="quote"><span class="who">You pinned</span>“plan should fit side by side just like on pc”</div>
    <div class="pair">
      <div class="pane">
        <div class="plabel now"><span class="dot"></span>NOW</div>
        <img src="${img('prop-a-829-now.png')}" alt="Fold sideways today: narrow plan pane">
        <p class="cap">It <em>is</em> side by side — but the details column is locked to 560 pixels, so the plan is left with a strip and draws at 17%.</p>
      </div>
      <div class="pane">
        <div class="plabel aft"><span class="dot"></span>PROPOSED</div>
        <img src="${img('prop-a-829-proposed.png')}" alt="Fold sideways proposed: details narrower, plan bigger">
        <p class="cap">The details column gives way instead of the plan. Same screen, the sheet nearly doubles — 17% to 30% — and reads like the PC.</p>
      </div>
    </div>
    <div class="card">
      <h3>One thing I noticed while doing it</h3>
      <p>Squeezing the details column makes the <strong>Drive and Zoho boxes overlap</strong> (you can see them collide in the proposed picture). So the proposal includes: below about 480 pixels of column, those two boxes stack one above the other instead of sitting side by side. Same fix the phone already uses.</p>
    </div>
  </section>

  <section>
    <span class="tag pin">Your note 6</span>
    <h2>The tab row does not belong on the preview</h2>
    <div class="quote"><span class="who">You pinned</span>“in general tabs should only be in the markup screens not on the initial preview”</div>
    <div class="pair">
      <div class="pane">
        <div class="plabel now"><span class="dot"></span>NOW</div>
        <img src="${img('prop-a-pc-now.png')}" alt="PC today: three navy bars including the Plan tab strip">
        <p class="cap">Three navy bars stacked: the plan's name, its buttons, and a <strong>“Plan ✕ +”</strong> tab row — a row for opening several plans at once, on a screen where you are only looking at one.</p>
      </div>
      <div class="pane">
        <div class="plabel aft"><span class="dot"></span>PROPOSED</div>
        <img src="${img('prop-a-pc-proposed.png')}" alt="PC proposed: tab strip gone, plan starts higher">
        <p class="cap">The tab row is gone from the preview. Two bars, and the sheet starts 40 pixels higher. The tabs stay exactly as they are inside <strong>Mark up</strong>, where opening several plans is the point.</p>
      </div>
    </div>
  </section>

  <section>
    <div class="rule">
      <h3>The single rule this all comes down to</h3>
      <p><strong>The plan sits beside the details when the window is wide enough to be worth it, and becomes a tab when it is not</strong> — and the choice is made from the real width, so no device needs its own rule. The dividing line I propose is <strong>800 pixels of screen width</strong>:</p>
      <div class="scroll"><table>
        <tr><th>Screen</th><th>Width</th><th>The plan is…</th></tr>
        <tr><td>Phone (any)</td><td>up to 500</td><td>a tab <span style="color:var(--muted);font-weight:400">(already is)</span></td></tr>
        <tr><td>Fold, opened upright</td><td>690</td><td>a tab</td></tr>
        <tr><td>iPad upright</td><td>768</td><td>a tab <span style="color:var(--muted);font-weight:400">(changes)</span></td></tr>
        <tr><td>Fold, opened sideways</td><td>829</td><td>beside the details</td></tr>
        <tr><td>iPad sideways</td><td>1024</td><td>beside the details</td></tr>
        <tr><td>Office PC</td><td>1920</td><td>beside the details <span style="color:var(--muted);font-weight:400">(unchanged)</span></td></tr>
      </table></div>
      <p style="margin-top:12px">Turning an iPad from upright to sideways moves the plan from a tab to beside the details, by itself, while the window stays open.</p>
    </div>
  </section>

  <div class="ask">
    <h3>What I need from you</h3>
    <ol>
      <li><strong>The 800 line</strong> — say yes, or name a different width. Everything above hangs on this one number.</li>
      <li><strong>The tab row leaving the preview</strong> — yes, or keep it.</li>
      <li><strong>Drive and Zoho stacking</strong> on a narrow details column — yes, or leave them side by side and let them squeeze.</li>
    </ol>
    <p style="margin-top:12px;color:var(--muted)">Say “yes to A” and all three lock together, or answer them one at a time. Nothing is built during this round.</p>
  </div>
</div>`;
writeFileSync(OUT, html);
console.log('proposal A bytes:', html.length);
