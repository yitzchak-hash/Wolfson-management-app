import { writeFileSync } from 'fs';
import { img, HEAD } from './shared.mjs';
const OUT = '/tmp/claude-0/-home-user-Wolfson-management-app/38623ef8-73c0-5354-912b-cb672cfed81c/scratchpad/proposal-d-chat.html';

const html = `${HEAD('The Task as a Conversation')}
<div class="wrap">
  <div class="eyebrow">Proposal D · design only, nothing built yet</div>
  <h1>The task as a conversation</h1>
  <p class="lede">The office's notes and the worker's replies become one chat on the task — the same conversation on his phone and on your computer. And you asked what I think the closing comment should do. My answer is in here, drawn rather than argued.</p>

  <div class="quote" style="margin-bottom:26px"><span class="who">Your words</span>“More of a WhatsApp chat style over there. The notes in the office come in like a WhatsApp chat, and my note becomes like a reply message. The little image in the message should show a little preview, and upon clicking, expand with an option to download. A file upon clicking should download and open on the phone. This is how it should be in the tasks in the main thing as well, from the computer.”</div>

  <section style="border-top:0;padding-top:0">
    <h2>On the worker’s phone</h2>
    <p>The office speaks from the left in white; the worker answers from the right in blue. A file is a card you press to open; a photo shows as a preview you press to expand, with download on the expanded view. The box at the bottom is the same one that is there now — paperclip, microphone, type, send.</p>
    <div class="pair">
      <div class="pane">
        <div class="plabel now"><span class="dot"></span>MID-JOB</div>
        <img src="${img('chat-phone.png')}" alt="The task thread mid-job">
        <p class="cap">Two messages from the office — one carrying the engineer’s drawing — and the worker’s reply. The conversation is the task’s record.</p>
      </div>
      <div class="pane">
        <div class="plabel aft"><span class="dot"></span>AFTER CLOSING</div>
        <img src="${img('chat-closed.png')}" alt="The thread after the job is closed">
        <p class="cap">The closing comment and the photos arrive as the <strong>last message</strong>, and a green marker closes the conversation: <strong>Job closed · 15:47</strong>.</p>
      </div>
    </div>
  </section>

  <section>
    <h2>The same conversation on your computer</h2>
    <p>Not a second design — the same thread, in the apartment window’s Tasks tab, sized for a monitor. Bubbles stop at a readable width instead of running the whole way across, and the photo and the file card behave exactly as they do on the phone.</p>
    <img src="${img('chat-desk.png')}" alt="The same thread at computer width" style="display:block;width:100%;border-radius:10px;border:1px solid var(--line);margin:14px 0 0;background:var(--shot-bg)">
    <p class="cap">Shown on its own here so you can judge the thread itself — in the app it sits under the task in the Tasks tab.</p>
  </section>

  <section>
    <div class="rule">
      <h3>You asked what I think the closing comment should do</h3>
      <p><strong>It should be the last message in this conversation.</strong> Not a separate field, not a note filed somewhere else — the worker writes what he did, the photos come with it, and the whole thing lands in the thread as his final message, followed by <strong>Job closed · 15:47</strong>.</p>
      <p style="margin-top:12px">Why that and not something else:</p>
      <ul style="margin:8px 0 0;padding-left:20px;color:var(--muted)">
        <li style="margin:6px 0"><strong>One place to look.</strong> If the closing comment lived apart from the thread, every task would have two histories and you would have to check both. This way the last message IS the sign-off.</li>
        <li style="margin:6px 0"><strong>The photos land where they mean something.</strong> Attached to the sentence explaining them, at the moment the work finished — instead of a pile of pictures with no words next to them.</li>
        <li style="margin:6px 0"><strong>It reads like the thing it is.</strong> Somebody scrolling the task six months later sees the instruction, the drawing, the reply, the finished work and the closing stamp, in order, the way they actually happened.</li>
        <li style="margin:6px 0"><strong>Nothing new to learn.</strong> The worker is already typing in that box all day; closing is the same action with pictures attached.</li>
      </ul>
      <p style="margin-top:14px"><strong>Two small rules that come with it:</strong> if he leaves the comment empty, the photos still post and the marker still lands — the comment is never compulsory, only the pictures are (and only where his permission says so). And the closing message <strong>cannot be edited or deleted afterwards</strong>; it is a record, so a correction is a new message, not a rewrite of the old one.</p>
    </div>
  </section>

  <div class="ask">
    <h3>What I need from you</h3>
    <ol>
      <li><strong>The chat, as drawn</strong> — on the phone and on the computer.</li>
      <li><strong>The closing comment as the last message</strong> — yes, or you had something else in mind.</li>
      <li><strong>The no-edit rule</strong> on the closing message — reasonable, or too strict?</li>
    </ol>
    <p style="margin-top:12px;color:var(--muted)">Say “yes to D” and Areas C and D lock together — then I write the build list.</p>
  </div>
</div>`;
writeFileSync(OUT, html);
console.log('proposal D bytes:', html.length);
