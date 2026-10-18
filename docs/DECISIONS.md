# DECISIONS — what Yitzchak decided, and why

_Read before every task; add a line the day a decision is made, newest
first. Each entry: date · the decision · his reason (his words where we
have them). The v2 rebuild's original design record is the root
`DECISIONS.md`; the rules and traps behind each decision are in `CLAUDE.md`
by round. (Standing order 6, 2026-09-23.)_

## 2026-10-15 (recordings 14:13–14:19)
- The worker's wrong-apartment control is a small icon beside the place name that asks Yes/No
  before the move window — never a big button ("I don't want him to have the ability to, like, this").
- The closing screen asks one question, "Anything the office should know?" — no "comment" heading.
- A notebook task bar dragged to another day or person asks first ("move the task you gave Yaakov on
  Sunday to there — yes or no"). What a drop on ANOTHER TRADE should do is his to decide (plan page D).
- A notebook person can be hidden (kept on the list, not drawn).
- The worker's weekly calendar runs newest day first; a single done task is green like the folded done rows.
- Active jobs: no "tiles across" — the tiles fill the widget's width and a Tile size slider zooms them;
  the kind marks are icons; a task moved on the notebook is notebook activity.

## 2026-10-15 (photo metadata)
- Every photo uploaded to Google Drive is the ORIGINAL file, untouched — the TzviAir Photos app reads
  location and date from it. A shrunk copy is only the app's own preview / base64 fallback, and it
  carries the original's EXIF (GPS, date taken, make, model). HEIC goes up as it is.
- The shrunk copy's Orientation is written as 1: the browser already turns the pixels upright when it
  draws them, so copying 6/8 would turn the copy a second time. The original keeps its own value.

## 2026-10-15 (recording 10:11 — add existing, search in layers)
- Add Job has a second tab, **Add existing**: picking a job adds another tile of the SAME record
  (a ghost) mid-screen — never a copy. A job in a group, notebook or pin board keeps its place and
  gains the board tile too. Another workspace's unit lands as a unit card. Trash is never offered.
- The header search shows results in layers, in his order: jobs, then tasks, then notes / messages /
  files, then things on the board, then workers and stages.
- Search with AI runs Opus 5.5 with adaptive thinking at low effort (the newest model refuses
  "thinking disabled"); a failed ask now says so with a retry.

## 2026-10-12 (recording 14:40 — plans and search)
- The plan preview keeps two bars: back-to-folder (and a thin line) leads the first bar, the
  main-plan star sits before Mark up.
- Hover arrows walk the folder's sheets; the folder's sheets prefetch while one is open; the plan
  cache drops them when the last viewer closes.
- The viewer's raster cap is 16 MP and it waits 280ms after zooming before redrawing.
- Search tries a Hebrew query spelled in Latin letters.

## 2026-10-12 (recording 14:17 — declutter)
- Notebook tiles: a building unit is "3/14 — family" (building digits / apartment). The floor, the
  address and the building chip are OFF the tile (supersedes 2026-10-05 "the building leads as a chip"
  and the floor/address pin line). The busy-day tile drops its building lines (supersedes 2026-10-11
  "A2 · N apartments"); all done = the done tile's green, the count said once.
- The strip's done segments run orange → green along the bar instead of each stage's colour.
- The task's own words show on hover only, as a card under the tile.
- Calendar: a size up; the worker leads each tile in his colour. "Too subtle — leave it."

## 2026-10-12 (the group window's menu)
- Inside a group a job is filed straight into another group or into Trash
  from the right-click menu — the same rules as the board (content undo step,
  a group with a stage sets it, Trash is filing). Ctrl/Shift-click picks
  several, as on the board. "Delete forever" in Trash now asks first.

## 2026-10-12 ("all stars, build it" — Calendar and Time Off)
Every starred answer on the plan page, built the same day:
1. The calendar is a **month grid of small tiles** (look A) with a multi-day
   task as **one bar**; done is green with a tick.
2. The **+ on a day opens the notebook's own task form**, on that day.
3. **Drag a tile to another day** moves the task by the notebook's rules (the
   whole task keeps its working-day pattern; one day of a task that has others
   asks move / add / new).
4. A **busy day folds into one bundle tile** (4+ single-day tasks of one
   worker in one workspace), as on the notebook.
5. The tile's **frame is the stage colour; the small tag is the workspace's**.
6. **One calendar**: the header and the sidebar open the same page, with
   This workspace / All workspaces inside it.
7. Time off is set by **pressing the worker's name on the notebook → Time
   off…**, and **right-clicking a square → Off this day**.
8. Kinds **Vacation, Sick, Reserve duty, Other** + a note; vacation blue
   stripes, sick pink.
9. Tasks already booked on those days are **listed with Move it to someone
   else / Keep it on him — nothing moves by itself**; a kept task wears
   "he's away".
10. Booking somebody away **warns and asks** (Pick someone else / Add anyway);
    he is greyed in Who with his kind of time off.
11. **His phone shows the band** in his language (Отпуск).
12. **Whole days only.** 13. **The office sets it**; no requests from the
    phone. 14. **Anyone with a notebook row** can have time off.
Time off belongs to the person and lives in one shared list.

## 2026-10-13 (the pin board, and "I'm adding it now")
- **The pin board** is a widget, not a new kind of board: a cork /
  whiteboard / chalkboard with a handwritten title (Caveat, Amatic SC for
  Hebrew). A pinned job is HELD the notebook's way (`inNotebook` = the board's
  id), so its tile leaves the main board and comes back when it is unpinned or
  the board is removed; one job is never in two places. A job from another
  workspace is pinned as a pointer and stays put over there. A job already in
  a notebook keeps the notebook as its holder.
- **Pinned cards move inside the cork and carry off it** — to the board, to
  another pin board, or to a notebook day (released from the pin first, so a
  cancelled task dialog leaves the job on the board, never nowhere).
- **The AI search fallback is built** on his Anthropic key: only the typed
  words are sent; the AI returns other spellings and each runs through the
  app's own index. One press per question, never automatic.

## 2026-10-12 (his three answers)
- **Active jobs draws small board tiles** ("a"): a white card in the stage's
  colour, the name wrapping, who did what and when, the booked worker, the
  heat squares. Two across by default; the pencil has Tiles across (1–4) and
  a "One line each" look that keeps the old rows. Stretching the widget makes
  the tiles bigger, not more of them.
- **The calendar gets a plan first** ("yes, draw the plan"), and **time off
  for a worker, set from the notebook**, is drawn into the same plan: "Calendar
  and Time Off", fourteen starred questions. Nothing built until he answers.
- **A2 9's Registers ticked back** ("tick it back") — production, one Office
  history line.

## 2026-10-12 (the four recordings of 11 Oct)
- **A finished task is read by what was REPORTED**, not by what it was made
  for: a task made for Concealed Units + Fans that Igor closed as Registers
  is Registers on the card, in the notes, in the edit form and on the
  notebook. Four such tasks exist in production; the display changed, the
  records did not.
- **Editing a finished task's stages moves its pictures and its ticks** to
  the new stage ("so that the pictures also move with that, to that bubble").
- **A new task starts on the next stage still to do**, never on one already
  finished ("why do we need the 'on Drilling'?").
- **Drive and Zoho sections open folded** ("by default these should be
  closed"); **general notes newest on top**, in a roomier box with a faint
  line between notes.
- **Plain words everywhere**: the done card leads with the worker and says
  what he finished and how many photos he sent; the Tasks page says who is
  doing what; the busy-day popup says "Finished Drilling · doing Piping…";
  stages are bubbles, never arrows.
- **The guessed plan asks calmly** — "Is this the right plan? Yes · Choose
  another" — and Yes records who approved it ("Plan approved by …").
- **The calendar shows every workspace** and a "+" on each day adds a task;
  the full notebook-style redesign gets a plan page first.
- **The app's own Drive account is not activity** in Active jobs.

## 2026-10-12 ("build it" — a job that is not finished in a day)
- **"Not finished today" sits beside Close job** on the worker's phone. It asks
  three things in his language: what he finished today (only when the task has
  more than one stage — those are crossed off, the rest go half done), what is
  left (the message box, with the mic and files), and when he is coming back —
  Tomorrow (the next working day, so Thursday says Sunday), Pick a day, or
  I don't know yet. The job stays open; the day he worked and the come-back day
  are added to the task, and the office gets it as a message in the task, which
  rings like any worker message. Pictures are not asked for.
- **"I don't know yet"** leaves the job on today with an amber "needs a new
  day" tag on the notebook tile and the cards; dragging the tile to a later day
  is the answer and the tag goes by itself.
- **The morning question**: a job whose last day has passed and nobody said
  anything about asks at the top of his list — "Did you finish A3 12
  yesterday?" — Yes opens the closing screen, No opens the three questions.
  At most three at a time.
- **The office has the same button** ("Not finished") on each open task card
  in the apartment window, for when the worker phones it in; it messages the
  worker.

## 2026-10-08 (his answers to the five questions)
- **The notebook bar is look A, "a small board tile"** ("One, I want to do A").
  Every task on the weekly notebook is the Job Board's own tile made small: a
  white card framed in its stage's colour (green when done, with the ✓ done
  tag), the unit's whole name, the stage as one pale pill whose type shrinks
  to fit, "then X" when the task moves the job on, the office's own words,
  the stage strip with its fraction, and a pin line saying where. A tile is
  as tall as its words; each square stacks its own tiles, and a tile spanning
  days sits under the lowest of its squares so it never covers anything. A
  busy day's bundle is the same look: the count big, the workspace and every
  building with its floors, a pill per stage with its count, the done share,
  "See all N ›". Strips mode keeps its one slim line.
  Taken without asking (standing order 1): a Job Board job whose name is only
  "VRF job" borrows the client from its Drive folder ("Rimonim · VRF job");
  a report the worker started himself does not repeat the app's own words
  ("Drilling — working here today"); a unit with no family says "no name yet".
- **Igor's open Sold/Start reports are closed as mistakes** (answer a). Six
  duplicate starts on A3 24, A2 23, A2 16 and A2 15 were closed with
  "(duplicate start — closed by the office)" and one history line each; their
  stage ticks were already right and were not touched. And a second "I'm going
  to work here" on the same apartment the same day now reopens the report he
  already started instead of making another.
- **The "Next:" cue is settled** by the last-done headline (answer a) —
  nothing more to build.
- **The plan reader stays on the existing OpenAI key with a stronger model and
  reasoning** — no Anthropic key. It asks the strongest model first
  (gpt-6.1-sol, then gpt-6-sol, then gpt-5.5) at high reasoning effort, steps
  down by itself when OpenAI refuses a model, and always ends on gpt-4o so a
  reading still comes back. `PLAN_READ_MODEL_OPENAI` in Vercel overrides the
  list.
- **The stronger shared app key: leave it** (answer 5).

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
- **2026-10-18 · "More Than the Task Said", all stars, plus three of his own:** (1) "Part of
  it" needs ONE picture by default, with a setting (Settings → Workers) to turn it off; (2)
  where three pictures are asked, one picture and one video are enough; (3) work that wasn't
  on the list waits for an office answer — it GLOWS on the notebook for whoever answers that
  kind of question, a per-person setting in Settings → Users (absent = everybody answers — no role in the office says "admin"), and
  pressing it asks in plain English: "<worker> did work that wasn't on the list. This is what
  he wrote: …" → it was one of the stages / make it a task of its own / keep it as a note.
  The first closing question names the task's own stages ("Did you finish doing Fans and
  Concealed Units?"); "Not on this list…" is the first bubble of "Is it one of these?".

