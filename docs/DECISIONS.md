# DECISIONS — what Yitzchak decided, and why

_Read before every task; add a line the day a decision is made, newest
first. Each entry: date · the decision · his reason (his words where we
have them). The v2 rebuild's original design record is the root
`DECISIONS.md`; the rules and traps behind each decision are in `CLAUDE.md`
by round. (Standing order 6, 2026-09-23.)_

## 2026-10-08 (the second screen recording, and chat)
- **Sold/Start follows the work**: "once anything is done after Sold/Start,
  Sold/Start gets marked off". Any stage ticked done or started after it ticks
  Sold/Start done (`isStartStage` in `stageMarks.ts`). Applied to the live
  data: 11 units.
- **A building unit shows its LAST stage done**: "it doesn't move to that
  stage — it just shows the last stage that was done". The square's colour
  and the window's stage field read the last stage finished. Something
  happening now or half done still wins, and with everything done it reads
  the closing marker. The Job Board keeps "next to do". 60 live units were
  re-derived.
- **The stage panel is one line in order with tiny arrows**, with no "still
  to do" or "done" headings. Done is a tick, never a strike-through.
- **The plan reader is AI-first**: "it should be AI, using Opus 5.5 on high
  thinking", reading the title block on the right side of the sheet. The
  server runs Opus 5.5 at high effort and sends the enlarged title block
  beside the page. When no Anthropic key is set, the OpenAI key stands in.
- **A worker can move work HE started to the right apartment himself**, and
  "the apartment that he changed from should automatically go back to the
  previous state it was in before he touched it. That day." The start
  remembers the apartment's stages, and a move puts them back exactly. A
  stage another task also explains, or one the office changed by hand since,
  is left alone.
- **Notebook bars: four looks drawn (A–D) for him to pick**. Nothing in the
  app changes until he picks.
- Also built from the recording: a new "Who did what" widget; Settings →
  Stages saves itself; the board's 100% is today's 75%; a right-click on a
  notebook bar does nothing; the Zoho and Drive rows fold away. The rest of
  the list is in `docs/feedback/2026-10-08-115349.md`.

## 2026-10-06
- **A busy notebook day stays "every task its own bar"** (answer A) — nothing
  to build; the bars already say where.
- **Build the day story** — one card per person per day on the Activity page,
  one line per visit. **No automatic "suspicious" flags** ("no"): the story
  states what happened and judges nothing.
- **Drilling goes right after Sold/Start, before Piping** — "you drill before
  you pipe". **"Take Drilling done whenever Piping is done"**: ticked on every
  flat where Piping was already done (38 in Wolfson, a quiet list migration
  with no history lines), and from now on a fresh Piping tick ticks Drilling
  too (`IMPLIED_DONE` in `stageMarks.ts`) — unless Drilling was set to "not
  needed" or unticked by hand afterwards.
- **A1 12 stays ticked** as it is. **A3 12: Access Panels un-ticked** (one
  history line, "Office").
- **The empty fifth square on A1 floor 10 is removed** (the old `A1-BLANK-37`
  placeholder, deleted and tombstoned).
- **The "Skipped a stage" widget is retired** — under the set model stages
  are ticked in any order. No board carried a copy; one placed later draws a
  quiet "retired" note.
- Asked again in plain words: the "Next:" cue on the squares (question 5 —
  he did not follow the first wording).
- Taken without asking (standing order 1), listed for him: Esther's
  2026-10-06 untick of Wall Units / Outdoor Units on A3 9, 10, 11 was left
  standing (she did it by hand, one tick at a time); the deleted-records list
  fix; the header fitting at every width (the "?" and the alerts pill leave
  the phone header; the Calendar button shows its word from 1024px).

## 2026-10-05
- **Work from screen recordings.** A Drive folder of his recordings; every
  video gets two transcriptions, the screen read every second, a feedback doc,
  and a line per ask in the master checklist; "check the folder" works the new
  ones oldest first. Never ask for passwords or keys in the chat — say where
  to click. A recording of another project is reported, never built.
- **Pictures open in a picture viewer that slides, never as a plan** —
  "it should be a picture viewer where I can slide left and right".
- **Done on the notebook is a tag, never a cross** — "why can't we just mark it
  as done without a cross that removes all the information?"
- **The Job Board's Activity is the activity centre for every workspace**, and
  repeats fold — "this should be consolidated into 'Igor uploaded four photos'".
- **A task can be moved to the right apartment, and a worker can be given the
  permission to move his own mistake.**
- **The plan reader shows nothing it cannot point at** — "if there's no phone
  number and there's no address, it should be empty".
- **Igor's day moved from A1 9–12 to A3 9–12, data only** — "don't touch the
  code when you move the data".
- **A Drilling stage** — added after Thermostats; where it belongs is asked.
- The Active-jobs row cap was built under "fix everything" (standing order 1:
  never wait) — the freeze diagnosis of 09-23 had been waiting on a go.

## 2026-09-23
- **This chat is the builder; tasks come from the Mission Board manager**
  who tests in his real Chrome. Never wait on him here; never call anything
  verified; every report ends with a numbered done/not-done/needs-decision
  list and the deploy link; big slices post a "Plan for review" first.
- **Keep BRIEF / ROADMAP / DECISIONS in the repo** and read them before
  every task — so a cold session knows what the app is for.
- **Every reply ends with a bold emoji one-liner** saying whether he must do
  anything.
- **"Live from site" reads every workspace and is tappable on the TV** —
  "nothing shows up there the second it comes in… it needs to be touchable".
- The freeze diagnosis (Active-jobs rows) was ANSWERED, not fixed — he asked
  why, not for a change.

## 2026-09-22
- **Firebase on Blaze** (pay-as-you-go) after production ran out of free
  reads; a budget alert and a capped card in place of a kill switch.
- **Remove the cross-workspace record copies from Firestore** ("remove
  them") and **split Wolfson's combined stages** into separate bubbles with
  a grey→yellow→orange→green ramp ("go on the split").
- **A late close lands on the closing day** — "if he closes it on Sunday,
  add it to the day it was closed and mark it off as closed".
- **Every task EDITOR shows the stage bubbles**, not a dropdown — "look how
  bad it is".
- **The Set model ("Bubbles, Not Stages")**: an apartment carries a set of
  stages with a state each; on screen the word stays STAGE. Sixteen locked
  answers on the plan page, then "build it".

## 2026-09-17
- **The Device Gallery is on request only** — "I keep updating the device
  gallery, wasting my credits".
- **Notes are the instructions the worker sees on site; messages are the
  conversation** — "the task messages ARE the notes… the notes should have
  a different function".
- **A general job leads the worker to the buildings**; the office asks for
  notification permission up front in the header.

## 2026-09-16
- **The bare domain is the Job Board.** **A general job names several
  buildings or all.** **The other workspaces stay live** (foreign sync) —
  "she sees it, I don't".
- **Workers get push notifications with a sound** "just like a WhatsApp
  message"; messages can be taken back by their author.
- **The portal opens on ALL**, not Today.
- **A chosen plan zoom is never thrown away by a re-fit** (his video).

## 2026-09-15
- **The worker STARTS the day ("I'm going to work here"); the close decides
  the finish.** Supersedes "I did work here".
- Buildings, Plans and the Notebook Plus — ten stars locked, then "build it".

## 2026-09-08 · 09-07
- **Active jobs rethought** from every trace of use ("all yes" on the
  design); **Drive activity checked every ten minutes**.
- **Intake folders are swept every two hours** into "New Jobs Came In".
- **The starting corner of the board is top-left** — final ruling after
  three flips ("the left side and the top side should be locked to the
  canvas as that's the starting corner").

## 2026-09-03 → 09-06
- Problems (red), Tipus, notes as bullets, one message box, Russian, and
  translation with Show original — approved on their plan page.
- The Worker's Phone redesign — approved with corrections, then "build it".
- One key: transcription and translation on `OPENAI_API_KEY` alone.

## 2026-09-01 · 09-02
- **Save LOCKS a markup version**; the next mark starts the next one.
- **The zoom is set free**: minus shrinks the sheet below the fit; a touch
  tap moves ×1.25.
- **Workers WRITE the punch list too** (pins with memos and files).
- **The wall edits goals**; the TV's corner X is gone; the tap-in board is
  a traffic light (green in / red out).
- Dead space around the board allowed (09-02), then refined (09-04, 09-05),
  then settled at top-left (09-07).

## 2026-08-30 · 08-31
- **The TV opens the REAL job window** — "a job screen I never want to
  see. I want to see exactly the job drawer that I would see on a PC".
- **Deleting a job on the board files it into Trash**, no confirm.
- The TV bar: views left, one ⋯ menu right.

## 2026-08-27 · 08-24 · 08-17
- **One production branch, worked directly** (08-27) — no per-session
  branches.
- **Widget dedupe, all 17 merges** ("all of it").
- **Dragging one day of a multi-day task ASKS** (move / add / new task).
- **Weeks draw oldest first** (the secretary's ask) and the notebook opens
  on today's week; **a task carries ALL its days**; Saturday never counts;
  Friday is per-stretch, default off; finishing early asks the worker.
- **Plans are link-shared** rather than proxied (08-17): every plan the app
  shows becomes anyone-with-link readable.
- The Zoho stage routing table for the import (08-17).
