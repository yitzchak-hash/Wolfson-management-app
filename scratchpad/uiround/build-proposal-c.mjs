import { writeFileSync } from 'fs';
import { img, HEAD } from './shared.mjs';
const OUT = '/tmp/claude-0/-home-user-Wolfson-management-app/38623ef8-73c0-5354-912b-cb672cfed81c/scratchpad/proposal-c-closejob.html';

const html = `${HEAD('Closing a Job, Cleanly')}
<div class="wrap">
  <div class="eyebrow">Proposal C · design only, nothing built yet</div>
  <h1>Closing a job, cleanly</h1>
  <p class="lede">Your longest note, built. The worker's screen loses its second Close job button and its second note box; closing becomes a screen of its own where the pictures, the comment, the recording and the file all live together, ending in one Send. Every picture is the real app on a real phone.</p>

  <div class="quote" style="margin-bottom:26px"><span class="who">Your note</span>“There are two close job buttons, and notes. Remove the big Close job button under files and photos — there should be one close button at the end. The worker should be able to add general notes while he works, and a voice recording, and see the plan… Then Close job should take him to a completely new screen — a new pop-up: add the images, add a comment, a file, a recording, pictures, that whole thing, and then send. That way it is a lot cleaner.”</div>

  <section style="border-top:0;padding-top:0">
    <h2>1 · The task screen</h2>
    <p>Today a giant green <strong>Close job</strong> button sits in the middle of the screen where the office's files should be — and there is a second one in the footer. The proposal removes the middle one, so there is exactly one way to close a job and it is at the end, where you asked for it.</p>
    <div class="pair">
      <div class="pane">
        <div class="plabel now"><span class="dot"></span>NOW</div>
        <img src="${img('c-now.png')}" alt="The task screen today">
        <p class="cap">Two Close job buttons. The big one is standing in the files section's place.</p>
      </div>
      <div class="pane">
        <div class="plabel aft"><span class="dot"></span>PROPOSED</div>
        <img src="${img('c-prop1.png')}" alt="The task screen proposed">
        <p class="cap">One Close job, at the end. The files section says whose files they are — <strong>From the office</strong> — and the note box says what it is for: a note while you work, with the paperclip and the microphone beside it.</p>
      </div>
    </div>
    <div class="card">
      <h3>Two things to tell me</h3>
      <p><strong>The order.</strong> Your note said “the information on top, plan, task, whatever, and then plan, whatever the way it works” — so I have left the app's current order: <strong>information → task → plan → the office's files → note</strong>. Say the word if you want the plan above the task instead.</p>
      <p style="margin-top:10px"><strong>The grey plan box</strong> in these pictures is empty because this test machine has no Google Drive — on a real phone that is the plan itself. Nothing to fix there.</p>
    </div>
  </section>

  <section>
    <h2>2 · Closing the job</h2>
    <p>Today pressing Close job drops a panel <strong>underneath the whole task screen</strong> — so the worker ends up looking at the task, the plan, the files, a note box, and then <em>a second</em> add-photos button, <em>a second</em> note box and a disabled Close job. Two of everything on one screen.</p>
    <div class="pair">
      <div class="pane">
        <div class="plabel now"><span class="dot"></span>NOW</div>
        <img src="${img('c-now2.png')}" alt="The closing panel today">
        <p class="cap">The closing panel stacks under everything else. Note the two “Add a note…” boxes and the two add-photo buttons.</p>
      </div>
      <div class="pane">
        <div class="plabel aft"><span class="dot"></span>PROPOSED</div>
        <img src="${img('c-prop2.png')}" alt="The proposed closing screen">
        <p class="cap">A screen of its own. Pictures with the 3-picture counter, a comment with the paperclip and microphone, a file — then one green <strong>Send and close the job</strong>. The arrow at the top backs out without losing anything.</p>
      </div>
    </div>
    <div class="card">
      <h3>What stays exactly as it is</h3>
      <p>The <strong>three-picture rule</strong> is unchanged — Send stays locked until three are in, and workers you have marked “photos optional” skip it as they do today. The <strong>finish-early question</strong> — “this job is still on your calendar for Sunday, are you completely finished?” — still appears on the final press when a task has days left, in the worker's own language.</p>
    </div>
  </section>

  <div class="ask">
    <h3>What I need from you</h3>
    <ol>
      <li><strong>The whole shape</strong> — yes, or tell me what to change.</li>
      <li><strong>The order on the task screen</strong> — leave it as task-then-plan, or put the plan first?</li>
      <li><strong>“Send and close the job”</strong> — is that the right wording for the final green button, or would you rather it just said “Close job”?</li>
    </ol>
    <p style="margin-top:12px;color:var(--muted)">Say “yes to C” and it locks as drawn. This is the last area — after it, the build list gets written.</p>
  </div>
</div>`;
writeFileSync(OUT, html);
console.log('proposal C bytes:', html.length);
