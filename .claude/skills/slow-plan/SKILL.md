---
name: slow-plan
description: >-
  Walk the user through planning ANY piece of work — a project, a product, a
  business move, a trip, an event, a big decision — slowly, visually, one small
  sitting at a time, the way an overthinking or ADHD brain actually works best.
  Each sitting is ONE beautiful bright HTML page holding the growing plan plus
  ONE small batch of questions with starred recommendations; every answer
  becomes a numbered locked pick; the end is a sealed master plan file. Use
  this whenever the user wants to plan something with you, says "slow plan",
  "plan this with me", "walk me through it", "I don't know where to start",
  feels overwhelmed by a big new task, or is opening a genuinely new area of
  work — even if they don't say the word "plan". If the work is big and fuzzy
  and the user is about to be buried in decisions, reach for this.
---

# The Slow Plan — visual, one sitting at a time

## Why this exists

This method was built with, and for, a person who told us plainly: "my brain
is ADHD, I'm an overthinker, I have a hard time holding so much information at
the same time." The insight that makes it work: **the page holds the plan so
the person's head doesn't have to.** Every sitting they see the whole picture
so far, freshly drawn, and are asked only a handful of questions. They never
scroll back, never re-read walls of chat, never carry state between sessions
in their head. Honor that insight in every choice you make — when in doubt,
put it on the page and take it out of their working memory.

## The shape: sittings

Planning happens in **sittings**. One sitting = one visual HTML page = one
small batch of questions = one exchange. Never two batches on one page; never
two sittings in one reply. The user answers in a normal chat message; the next
sitting opens with their answers locked in and the picture redrawn.

**Sitting 0** is special: listen to everything the user brain-dumps, then
present the MAP — the subject in plain words, a proposed list of sittings
(topics in a sensible order, usually 4–8), and the first question batch. The
user can reorder or add sittings; the map is theirs.

**The final sitting** seals the plan (see "The seal" below).

The user decides when planning is done — never you. If they keep opening new
questions, keep planning. If they say "done planning", seal it.

## The page

Every sitting's page shares one design family so the series feels like one
document growing, not seven documents. Keep it bright, warm, and generous —
this page is the plan's home, treat it with the care of a product page.

Every page carries, in order:

1. **The journey strip** — sitting N, what's sealed, what's ahead. One glance
   answers "where am I?".
2. **The picture so far** — the whole plan as it stands, drawn visually
   (tiles, org boxes, flow rows — whatever fits the subject), with the picks
   already locked shown as settled facts, not questions. This section GROWS
   every sitting; nothing sealed ever disappears from it.
3. **This sitting's topic** — what we're deciding today and why it matters,
   in a few plain sentences a non-expert follows.
4. **The question batch** — the heart (rules below).

**Anything visual is BUILT, not described** (owner rule, 2026-09-01: "if
something is visual, make the UI in the HTML with the real UI code — build
it"). When a sitting decides how a screen, control, or layout will look or
behave, the page carries the thing itself — real HTML/CSS/SVG in the
product's own design language, reusing the product's real UI code where it
exists (the captured-controls precedent), interactive where that is cheap.
Words about a screen are not a screen.

Publish the page where the user can open it (an artifact link when available;
otherwise a saved HTML file, told plainly where). Keep all sittings' pages
together in one planning folder so the series survives.

## The question batch

- **5–9 questions, most important first.** Fewer when the topic is heavy.
  If you have more, they wait for the next sitting — the limit IS the method.
- **Number picks permanently across the whole plan** (if sitting 1 ended at
  pick 9, sitting 2 starts at pick 10). These numbers become the plan's
  vocabulary — "pick 27" should mean one thing forever.
- Each question: a plain-words question, **2–4 lettered options**, and a
  **⭐ starred recommendation with a one-line WHY**. The star matters: an
  overthinker given four naked options will orbit them for an hour; a starred
  default with a reason lets them either nod or push back, both fast.
- **Answers come as plain chat** ("1A 2B, 3 — let's discuss") — or on the
  page itself when the interactive mode below is available. Never use popup
  question pickers or chat-side forms; they break the flow and some users
  can't use them at all. (The plan page's own tappable options are not a
  popup — they ARE the page.)
- A garbled or unclear answer gets gently re-asked, never guessed. An answer
  that's really a new question becomes a follow-up: finish follow-ups before
  opening the next sitting's topic.

## The interactive page (answer on the page itself)

When the artifact runtime's `artifact` capability is available (the page can
publish new versions of itself — load the `artifact-capabilities` skill to
check and wire it), build each sitting's page so the user can answer WITHOUT
typing in chat:

- **Tappable options.** Each question's lettered options are buttons; tapping
  one selects it (visibly — the starred one still wears its ⭐).
- **"Add context" per question** — a small collapsed text box under each
  question, with a **microphone button** for dictation via the browser's own
  speech recognition (`SpeechRecognition`/`webkitSpeechRecognition`),
  continuous mode. **The artifact sandbox usually refuses microphone
  access** (learned the hard way: the button did nothing) — so the mic
  button must handle failure honestly: on error, on an end with no words, or
  after ~2.5s of silence from the engine, show an inline tip pointing at the
  OS keyboard's own dictation (the 🎤 on a phone keyboard, Win+H on Windows,
  the mic key on Mac), which types into the box regardless of page
  permissions. Never leave a mic button that silently does nothing.
- **One Save button** at the bottom. Saving embeds the answers as JSON in a
  `<script type="application/json" id="plan-state">` block, bakes any typed
  context into the document, and calls `artifact.publish()` with the whole
  regenerated document — never a serialized live DOM. After a successful
  save the page tells the user plainly: "saved — now tell Claude 'saved' in
  chat and we continue."
- **Claude's side of the loop**: remote sessions get no republish
  notification, so when the user says "saved", RE-READ the artifact (Artifact
  tool, `action: "read"`), parse the `#plan-state` JSON, restate every answer
  as a numbered locked pick in the next sitting's page, and carry any typed
  context into the plan. A pick locked from the page is exactly as locked as
  one typed in chat.
- Chat answers stay valid at all times — the page is the preferred door, not
  the only one. If the capability is unavailable (`claude.use("artifact")`
  resolves null), the Save bar says so and points the user back to chat.

## Locked picks

Every answer becomes a **numbered locked pick**, restated in plain words on
the next page. Locked means locked: a pick is never silently changed. When a
later decision genuinely supersedes an earlier one, say so out loud, record
"pick N supersedes pick M", and keep the old pick visible as history — work
never goes in the garbage, including decisions.

## Research before recommending

When a question touches real-world practice — tools, prices, how other people
have solved this — check real sources before starring a recommendation, and
say in one line what you checked ("looked at how X and Y handle this"). A
star earned by research is worth trusting; a star from vibes teaches the user
to stop trusting stars. For pure taste questions, say plainly that it's taste.

## The seal

When the user calls planning done, the final sitting produces:

1. **The master plan file** — one document (e.g. `MASTER-PLAN.md`, or the
   format the project uses) holding every numbered pick, the architecture or
   shape that emerged, the action order, and **the supersession rule written
   in**: "where any older note disagrees with this file, this file wins;
   older records are kept as history, never rewritten."
2. **A home page** — one last HTML page presenting the sealed plan whole,
   linking every sitting.
3. **The action order** — the plan turned into build/do steps, dependency
   first (foundations before features), each step with a short permanent ID
   ("B1 · the data model") the user can say back to you later.

## Between sittings: the chat rhythm

The page holds the details; the chat holds the rhythm. Keep replies short and
warm, jargon-free (or jargon explained in the same breath). End every
planning reply with a tiny status the user can absorb at a glance:

```
📍 Sitting 3 of 6 · 17 picks locked · this batch: money questions · next: the schedule
```

One more thing carried over from the method's first user, worth keeping for
everyone: never mark a planning area "done" because you consider it settled.
Done is the user's word.
