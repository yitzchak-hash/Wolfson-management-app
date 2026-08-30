import { writeFileSync } from 'fs';
import { img, HEAD } from './shared.mjs';
const OUT = '/tmp/claude-0/-home-user-Wolfson-management-app/38623ef8-73c0-5354-912b-cb672cfed81c/scratchpad/proposal-c-closejob.html';

const html = `${HEAD('Closing a Job, Cleanly')}
<div class="wrap">
  <div class="eyebrow">Proposal C · version 2 · design only</div>
  <h1>Closing a job, cleanly</h1>
  <p class="lede">Rebuilt with every change you asked for. The task screen keeps one Close job button and finally shows what the office sent; closing is a screen of its own with two things on it and nothing repeated. Every picture is the real app on a real phone.</p>

  <div class="card" style="border-left:4px solid var(--pin)">
    <span class="tag pin">What changed since version 1</span>
    <p><strong>Task screen:</strong> the office's notes and files now appear together under the task &middot; the Urgent badge loses its box &middot; the Download button on the plan gets fixed.<br>
    <strong>Closing screen:</strong> the picture button is the app's own &ldquo;Tap to add photos, videos, or files&rdquo; &middot; the separate File section is cut as repetitive &middot; the microphone and paperclip move inside the typing box &middot; the 3-picture line follows each worker's permission instead of being fixed text.</p>
  </div>

  <section style="border-top:0;padding-top:0">
    <h2>1 &middot; The task screen</h2>
    <div class="quote"><span class="who">Your words</span>&ldquo;If the office adds a file, it should show up under task as well as the note that the office would add &mdash; that&rsquo;s where it needs to show up. And Urgent doesn&rsquo;t need a box around it. And the Download button should work.&rdquo;</div>
    <div class="pair">
      <div class="pane">
        <div class="plabel now"><span class="dot"></span>NOW</div>
        <img src="${img('c-now.png')}" alt="The task screen today">
        <p class="cap">Two Close job buttons, and a &ldquo;Files &amp; Photos&rdquo; section showing nothing while the office&rsquo;s notes sit somewhere else entirely.</p>
      </div>
      <div class="pane">
        <div class="plabel aft"><span class="dot"></span>PROPOSED</div>
        <img src="${img('c-prop1.png')}" alt="The task screen proposed">
        <p class="cap"><strong>From the office</strong> holds what the office sent &mdash; the note about the riser and the engineer&rsquo;s drain detail, file and all. Urgent is just a red dot and the word. One Close job, at the end. The worker&rsquo;s own box is labelled <strong>Your note</strong>, with the paperclip and microphone beside it.</p>
      </div>
    </div>
    <div class="card">
      <h3>Three things worth saying plainly</h3>
      <p><strong>The Add File button is gone from that section.</strong> It sat inside the office&rsquo;s block, which read as though the worker were adding to the office&rsquo;s files &mdash; and everything he uploads now happens either through the paperclip in Your note or on the closing screen. Say if you want it back.</p>
      <p style="margin-top:10px"><strong>Download.</strong> Making it work is a repair, not a layout change, so there is nothing to show in a picture &mdash; it is on the build list as its own line.</p>
      <p style="margin-top:10px"><strong>The grey plan box</strong> is empty only because this test machine has no Google Drive. On a real phone that is the plan.</p>
    </div>
  </section>

  <section>
    <h2>2 &middot; Closing the job</h2>
    <div class="quote"><span class="who">Your words</span>&ldquo;On the top we should have tap to add pictures, videos, or files. And then a comment. A file under that is repetitive, unnecessary&hellip; The talking should go in the typing section, as well as the paper clip, and that&rsquo;s it. Send and close the job.&rdquo;</div>
    <div class="pair">
      <div class="pane">
        <div class="plabel now"><span class="dot"></span>NOW</div>
        <img src="${img('c-now2.png')}" alt="The closing panel today">
        <p class="cap">The closing panel drops <em>underneath</em> the whole task screen &mdash; two &ldquo;Add a note&hellip;&rdquo; boxes and two add-photo buttons on one screen.</p>
      </div>
      <div class="pane">
        <div class="plabel aft"><span class="dot"></span>PROPOSED</div>
        <img src="${img('c-prop2.png')}" alt="The proposed closing screen">
        <p class="cap">Two things and a button. Pictures at the top with the counter, one comment box with the paperclip and microphone <strong>inside</strong> it, then <strong>Send and close the job</strong>. The arrow backs out without losing anything.</p>
      </div>
    </div>
    <div class="card">
      <h3>The line under PICTURES is no longer fixed text</h3>
      <p>It reads from the worker&rsquo;s own permission. A worker who must supply photos sees <strong>&ldquo;At least 3 before the job can be closed&rdquo;</strong> and the counter; a worker you have marked <strong>photos optional</strong> sees no demand and no counter, and Send is never locked. Same screen, two honest states &mdash; and if you change the number later, the sentence follows it.</p>
    </div>
    <div class="card">
      <h3>What stays exactly as it is</h3>
      <p>The <strong>finish-early question</strong> &mdash; &ldquo;this job is still on your calendar for Sunday, are you completely finished?&rdquo; &mdash; still appears on the final press when a task has days left, in the worker&rsquo;s own language.</p>
    </div>
  </section>

  <div class="ask">
    <h3>Last look</h3>
    <ol>
      <li><strong>Both screens as drawn</strong> &mdash; yes, or one more change.</li>
      <li><strong>The order on the task screen</strong> &mdash; still information &rarr; task &rarr; plan &rarr; from the office &rarr; your note. Say if you want the plan above the task.</li>
      <li><strong>Add File</strong> &mdash; happy for it to stay gone from the office&rsquo;s section?</li>
    </ol>
    <p style="margin-top:12px;color:var(--muted)">Say &ldquo;yes to C&rdquo; and it locks. That is the last area &mdash; then I write the build list.</p>
  </div>
</div>`;
writeFileSync(OUT, html);
console.log('proposal C bytes:', html.length);
