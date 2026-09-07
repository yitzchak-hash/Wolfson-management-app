# The artifact-page prompt

The standing instruction that makes Claude present its work as ONE designed,
published page instead of a wall of chat text. Written for this project first
(the plan pages, the Device Gallery, the "Tasks That Take Days" and "The
Arrange Feature" pages), and kept portable so it can be pasted into any other
project's CLAUDE.md or into the first message of a session.

Paste everything between the rules.

---

Whenever you have something for me to LOOK AT or DECIDE ON — a plan, a
proposal, a design, a comparison, a report, a walkthrough of what you built,
screenshots of the app — publish it as an artifact page, and hand me the link.
Chat text is for the two-sentence summary; the page is the deliverable.

How the page is made:

1. Real content, never placeholders. If the page shows the app, show the REAL
   app: capture it running (Playwright screenshots with seeded, realistic data),
   or embed the real markup and stylesheet. When you need to draw an idea that
   does not exist yet, build it out of the app's own real components and styles,
   so what I am approving is what I will get.
2. Before writing any HTML, decide the design in three lines: a palette of four
   to six named colours drawn from the subject itself; two typefaces with real
   roles (a display face used sparingly, a body face for reading, both from
   Google Fonts with a fallback stack); and a one-sentence layout idea. Then
   build exactly that. No purple gradients, no cream-and-serif default, no emoji
   as section markers, no everything-centred, no rounded cards with accent
   rails. If a choice would look the same on any other project, change it.
3. When the page mixes MY product with YOUR notes about it, keep them two
   different materials: the product in its own colours, the notes in one
   deliberately different one (a drafting-table grey with a china-marker red,
   a yellow sticky, a pencil annotation) so I can never confuse what exists
   with what is being proposed.
4. Structure carries information. Number steps only when order matters. Put a
   short eyebrow label over sections. Give every decision a box. Keep running
   text about 65 characters wide. Wide tables and code scroll inside their own
   box; the page never scrolls sideways.
5. Light and dark both work. Define the colours as tokens on the root, restate
   them under the dark media query and under an explicit dark attribute, and
   never leave a colour defined only inside one of those blocks.
6. The page has a real name (a short noun phrase, like a product), a one-line
   description for the gallery card, and a favicon emoji. Keep the same file
   path and the same link on every update — one link forever, never a second
   copy of the same page. Stay under 16 MB including embedded images
   (re-encode screenshots as JPEG until it fits).

When the page exists to get a DECISION from me:

- Ask in small batches on the page itself — a handful of questions per sitting,
  never a wall. For each one give your recommendation, starred, in one line.
- Every answer I give becomes a numbered, locked pick written back onto the
  page, so the page grows into the master plan and nothing decided is lost.
- Build only when I say "build it". The page is the gate: if I have not
  approved it, nothing is coded.

When the page shows the app on devices:

- Real screenshots on every device the company carries (phones, foldables,
  tablets, the office monitor), each in a device frame, captured from the
  branch that goes live, refreshed after every UI change.
- Let me pin notes onto the screenshots — tap a spot, type or dictate, send —
  and when I say "check my notes", read the pins off the page, make the
  changes, recapture, and republish to the same link with each pin marked done
  and a one-line note of what was done.

Always finish with: the link, two sentences on what is on the page, and what I
need to do next (look, decide, or nothing).

---
