# HANDOFF — where this project stands, for whoever picks it up next

**Read this first.** If you are an AI (or a person) opening this repository
with the instruction "look through this repo and continue", this file is the
state of play: what was just done, what the owner last asked, what is pending,
and how a round is run. CLAUDE.md is the long memory (every rule and every
trap, by round); this file is the short one. **It is rewritten at the end of
every round, before the push** — so the last entry here IS the last thing the
previous assistant said to the owner, and your first reply should pick up
exactly there.

## Who and what
- Owner: TzviAir (info@tzviair.com), an HVAC installer in Israel. Speaks in
  voice-typed messages; wants plain language back, no code in chat.
- App: the TzviAir job board / CRM — React 19 + TS + Vite, Zustand, Firestore,
  Vercel. Production branch `claude/blissful-cray-spTFY` deploys to
  wolfson-management-app.vercel.app. This session also pushes
  `claude/ui-widget-fixes-fosqdk`; both must end each round at the
  same commit.
- Three workspaces: Wolfson (buildings), Netiv (buildings), the Job Board
  (`general`, free canvas, ~1,650 jobs after the CRM import and the Drive sweep).

## How a round is run (the ritual)
1. Implement. 2. Playwright probes in `scratchpad/` (`node scratchpad/<name>.mjs`;
   dev server on 5173, a keyed one on 5174 with `VITE_DRIVE_API_KEY=testkey`;
   Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).
3. `npx tsc --noEmit -p .` and `npx vite build`. 4. The audits:
   `node scratchpad/loopaudit.mjs`, `backupaudit.mjs`, `navaudit.mjs`, `apilimit.mjs`.
5. A What's New entry (`src/data/whatsNew.tsx`, dates run AHEAD of the clock;
   newest is `2027-01-13` — the next entry must be a later date (an older
   entry lower down also wears `2026-12-20`; the marker compares only the TOP
   entry's date, so never reuse a date that appears anywhere in the file)). 6. A CLAUDE.md
   round record. 7. A line in `docs/CRM-CHECKLIST.md`. 8. Rewrite THIS file.
9. Commit (footer: the `Co-Authored-By:` + `Claude-Session:` lines given in
   the session's own attribution reminder), push the working branch, then
   `git merge-base --is-ancestor origin/claude/blissful-cray-spTFY HEAD` and
   push production. Never force-push. Never commit real office data (the CRM
   export, fetched Firestore records) — they live in /tmp.
10. Reply in plain language: what was found, what was done, what to check.

Design work is gated: a plan page (an artifact, see `docs/artifacts/INDEX.md`)
with starred recommendations is published first; the owner says "approved" /
"all yes" / answers by number; then it is built. Never build a redesign
unasked.

## Where things stand (2026-09-22 — THE SET MODEL is built; the crash he saw is fixed)
Last commits, newest first (see `git log`):
- **2026-09-22, later — his production crash.** He pasted the CrashScreen
  text: `Cannot read properties of undefined (reading 'charAt')` in a page's
  `.map`. Cause: an activity-log entry stored without a `userName` (fsSet
  drops an undefined field), and the Dashboard's activity card and the
  Activity log page still read `log.userName.charAt(0)` unguarded (the
  drawerround had fixed only `ActivitySection`). Fixed at both ends: the
  readers fall back to "Someone" (`s.unknownUser`), the Settings avatars to
  '?', and `addActivityLog` always writes a name (current user, else
  'Office'). tsc, build, four audits green. No probe — the fix is a guard.
  **NEXT: he reloads production and confirms the Dashboard / Activity log
  open; then his first look at the set model (below).**
- **2026-09-22 — "Bubbles, Not Stages", BUILT** ("all the stars on 15 and 16,
  build it"). An apartment carries a SET of work stages with a state each
  (to do · booked · happening now · half done · problem · done · not needed);
  on screen the word stays STAGE. `src/data/stageMarks.ts` is the model
  (`stageSetOf` / `stageStateOf` / `liveStateOf` / `headlineStageId` /
  `applyMarks` the one writer / `progressOf` / `migrateToBubbles` /
  `seedStageKinds`); `currentStageId` survives as the DERIVED headline so
  every old reader keeps working; `updateApartment` translates a hand-set
  headline into marks (`normaliseStageWrite`). Built: the apartment
  window's stage board (StagePicker rewritten: groups, tap / right-click /
  × / put back / + add a stage incl. a CUSTOM one for this apartment
  alone), the cell's and the tile's strip + fraction, Settings → Stages
  work/marker + on-every-apartment + custom badge/widen, tipus sets on the
  Tipusim card, ONE multi-stage task picker on every form (`stageIds`),
  closing ticks them all, the worker's "What are you doing here? select one
  or multiple" start (marks doing) and the did-you-finish → which-didn't
  → three-pictures-per-finished-stage close (`ContractorPhoto.stageId`;
  unfinished → half done, office clears), the bulk bar's add/remove a stage,
  report fields, analytics' work-finished-per-stage, search `needs:`/`doing:`
  /`done:`, the printed tick list, and the one-time migration from
  AppLayout. Probe `bubbles-probe.mjs` 44/44; `stagereport.mjs` retired.
  tsc, build, four audits green. See CLAUDE.md "THE SET MODEL".
  **NEXT: his first look at production** — watch the migration land on the
  live workspaces (every cell should keep its colour; fractions appear), the
  worker's new start/close on a real phone, and the regressions noted below.
- **2026-09-17, fourth pass — his six asks about the buildings layout, plus
  the notes.** (1) A FLOOR can be renamed from its right-click menu, and the
  four POSITIONS across a building can be named — both show on the buildings
  page (`BoardSetting.buildingLayout`, riding boardSettings, no new state
  key). (2) His "it's not letting me merge": a floor with one apartment and
  three empty squares needed every square picked first — **Merge the whole
  row into one** is now one press in the cell, empty and floor menus. And the
  merge that silently cleared the other apartments' numbers and names now
  ASKS, naming each. (3) A square can carry a NAME and no number (the pool,
  the gym on minus one to minus four): "Name this square…" on an empty
  position. (4) Save leads with a BEFORE and AFTER picture — every building
  drawn twice, new / changed / gone squares ringed; the written list folds
  behind its own button. (5) Floors can be ADDED above or below any row and
  REMOVED when empty (never one that still holds an apartment; a floor added
  between two others is the half step and wears the name you give it).
  (6) NOTES stopped duplicating the task messages: a stage note is what the
  WORKER reads on site — it shows in his own language on the task sheet and
  on the map's work sheet before "I'm going to work here", and each line says
  "the worker sees this" with one press to keep it in the office
  (`StageNoteEntry.officeOnly`). `layoutround-probe.mjs` (33 checks, three
  contexts); re-encoded `builder2-probe` (the merge asks now; the change list
  is folded); portalround, stagereport, round40, tsc, build and the four
  audits green.
  **THEN the STAGES planning session (2026-09-17, three versions of one
  page, NOTHING BUILT)**: the "Bubbles, Not Stages" artifact
  (https://claude.ai/artifact/Ba8sosR7hLfmHFm51KaTqd, source
  `scratchpad/bubbles.html` in the session scratchpad; dated copies v2 and
  v3 in `docs/artifacts/`). The idea: each apartment carries its own SET of
  stages with a state each (to do · booked · doing · problem · done · not
  needed) instead of standing at one point on a line; on screen the word
  stays "stages". LOCKED by his two rounds of answers (1–14): keep the word
  stages; segmented strip + one headline word (now, else next in order);
  the tipus is the starting set; suggested order never enforced; a stage can
  be switched off and stops counting — OFFICE ONLY; a task gets ONE picker
  in the settings order, may cover several stages, closing ticks them all
  off and the headline auto-advances (the from→to pair goes); six states;
  Job Board too; everything at once; THREE PICTURES PER FINISHED STAGE,
  separately (his ruling against my star); work/marker switch per line;
  unfinished stages become half done and only the office clears them; the
  phone says "select one or multiple", the "Something else" button is gone.
  STILL OPEN: 15 (which doors add a stage — tipus · apartment window · bulk
  bar · a line's on-every-apartment switch) and 16 (where a quick custom
  stage lives — my star: in the workspace list flagged custom · used on N,
  hidden elsewhere until widened). **NEXT: his answers to 15 and 16, then
  "build it" → the five-round build order at the bottom of the page.**
- **2026-09-17, third pass — six asks off two screenshots.** (0) **STOP
  refreshing the Device Gallery** — "I keep updating the device gallery,
  wasting my credits". The skill now runs ON REQUEST ONLY; its description was
  narrowed so a UI change does not trigger it. (1) A film, a picture or a file
  now OPENS: one `MediaViewer` with full screen, an info panel, Download and
  Open in Drive, wired into the thread's bubbles, the drawer and the Drive
  browser (whose videos were dead grey badges). A `.dwg` that Drive calls
  `image/vnd.dwg` drew as a broken picture — `mediaKindOf` decides by the NAME
  now. (2) Task messages fold away with a count, remembered per machine.
  (3) Crossing the CURRENT stage off moves the job to the next stage by itself.
  (4) The Russian he saw on his PC: "I'm going to work here" stored its task
  description in the worker's language — it is English now, and the worker
  still reads it translated. (5) The drawer's chip says Contractor status.
  `round46-probe.mjs` (21 checks); drawerround, stagereport, portalround,
  round40, tsc, build and the four audits green.
- **2026-09-17, second pass — his photo of the tablet in the studio.** His
  words: "I like the design and layout. I just think the scaling is really
  off. The plan is tiny and it needs to be bigger." **So the tablet-studio
  REDESIGN is off** — the eight starred questions on "The Studio on the
  Tablet" are not to be built; only the scaling was wrong. Reproduced by
  giving the harness a PORTRAIT A1 sheet (my earlier captures used a
  landscape one, which filled the stage and misrepresented the real thing):
  420px of sheet in a 1090px stage, blue either side, 37% — his photo
  exactly. The fit was fitting the whole page to the HEIGHT. Now, on a desk
  or tablet only, a sheet whose shape badly disagrees with the screen's
  opens as big as it can while keeping 60% of the page on screen — 420 →
  700px, top-aligned; the Fit control still shows every millimetre; a
  landscape sheet and the phone are untouched. Also his second ask: stage
  names in Russian (`Stage.nameRu` + `stageNameIn`), a Russian box under the
  Hebrew one in project settings, and the portal names every stage in the
  worker's own language (nine sites that all read the OFFICE's RTL flag
  before, so a Russian worker saw English). `round45-probe.mjs` (12 checks);
  planviewer, planzoom, planjump, tvzoom, markup2, planphone, round44,
  portalround, round38, round43, tsc, build, four audits green.
  **He should check on the tablet**: open an upright plan in the studio and
  see it fill the width; press the square Fit button to see the whole sheet.
- **2026-09-17 — his four asks.** (1) "Why don't I see the permission asked
  on my computer": the ask only appeared on the first worker-message card;
  now a bell PILL in the header asks up front, once per machine (a floating
  card was tried and covered the drawer's plan bar on the tablet). (2) The
  self-task form: no "what stage is it on" — it says "Now: <stage>" and asks
  "What will you be doing here?" with stage pills. (3) The markup studio on
  the Galaxy Tab S10 FE: NOT built — measured and drawn as the plan page
  "The Studio on the Tablet" (https://claude.ai/artifact/RTFMFTjLBj2d7Esu9dKLaP)
  with eight starred questions; waiting for his numbers, then a day of
  building. (4) A general job: no Close job on its sheet; "Choose the
  apartment you are working in" leads to that project's building(s) with a
  hunt banner, "I'm going to work here" files the visit under the general
  job and opens the real task (pictures on close go there); without the
  workHere permission a pop-up says so. `round44-probe.mjs` (21 checks);
  round43, stagereport, portalround, tsc, build, four audits green.
- **2026-09-16, seventh pass — his ~15-item list, all built.** (1) `workHere`
  is its own permission apart from `selfAssign`; `selfAssignProjects` limits
  "a job for myself" per workspace (Settings → Workers chip). (2) "I'm going
  to work here" asks NO stage at the start (the unit's own stage); the close
  asks which stages he did (several) + finished? yes/no → done / half done
  (`stagesWorked`/`stagesFinished` on the task, read by the store's
  completion rule). (3) An ordinary task's close asks no stage — it goes to
  `stageWhenDone`. (4) Plans: nobody starred → the newest-activity sheet is
  shown with a RED star + a red "!" bubble between Layers and Plans, NEVER
  written (the drawer's two `pdfs[0]` writes removed); the portal shows the
  same guess. (5) The OFFICE rings: `OfficeAlerts` in AppLayout — chime,
  card, desktop notification when hidden; pressing it switches workspace,
  opens the job on its Tasks tab with the task lit (`taskFocus.ts`); the
  portal bell holds office messages and opens the task. (6) Board: Equal
  size row, selection header says "N groups · N jobs · N notes" (his "27
  selected and arrange doesn't work" — Arrange now takes groups along too),
  Focus in every node menu, calendar widget month arrows, right-drag PANS
  (Ctrl+drag lassoes), a unit card deletes without the ask. (7) Hebrew
  workspace names everywhere (`Project.nameHe`/`shortNameHe`). (8) The
  add-a-job dialog names the job's current stage in colour above the
  labelled from → to pair; stages are the picked job's workspace's; the
  All-buildings pill was already there. (9) The self-task form's WHERE is a
  search over every allowed job. NOT a bug: the Planner tab is gated by
  `seePlanner`, which only the Manager level (or a personal override)
  grants — his worker must be on that level. `round43-probe.mjs` (41 checks,
  six contexts); re-encoded `round32-probe` (right-drag pan) and
  `stagereport.mjs` (start-no-ask + close asks, incl. the not-yet path);
  arrange, planbrowser, portalround, foreigndrop, multiday, round42,
  notebookbars, touchpan, round20, gsearch, tsc, build, four audits green.
- **2026-09-16, sixth pass — his video of the zoom still jumping.** The
  border-box observer fix did NOT hold on his Windows PC (production carried
  it — the deployed PlanAnnotator chunk is byte-identical to the local
  build). Reading the video frame by frame showed two zoom ladders (fit 1.24
  vs fit 1.22 = the same stage minus a 17px scrollbar), i.e. the stage was
  still being re-fitted mid-wheel. The rule itself was wrong: a measurement
  must never throw away a zoom somebody chose. Now `atFitRef` gates the
  stage observer (re-fit only a sheet standing at the fit), full screen
  in/out re-fits explicitly, and the fit reads the border box so scrollbars
  cannot make two fits. `planjump-probe.mjs` (10 checks, classic scrollbars
  on) — non-vacuous: old code snaps 156% → 30% on a pane reshape. planviewer,
  planzoom, planpinch, planphone, markupfixes, tvzoom, tsc, build, four
  audits green. He must RELOAD the tab (an open tab keeps the old chunk)
  and try the wheel again in the job window and in full screen.
- **2026-09-16, fifth pass — his five issues.** (1) plan wheel zoom "jumps
  in and out very fast": the stage's ResizeObserver read the client box and
  a Windows scrollbar appearing re-fitted the sheet — border box now; not
  reproducible headless (scrollbars hidden), fix by construction. (2) a
  recording in a task did not look unsent: "Not sent yet — press Send" line
  + amber pulsing arrow. (3) WORKER NOTIFICATIONS: in-app chime + banner +
  tap-to-open for a new task / office message (live), and WEB PUSH when the
  app is closed — `public/sw.js`, `pushClient.ts`, `pushNotify.ts`, the
  `push` branch in api/geocode.js (web-push dependency added), `pushSubs`
  collection. **He must add VAPID keys in Vercel** (`npx web-push
  generate-vapid-keys` → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VITE_VAPID_PUBLIC_KEY`, optional `VAPID_SUBJECT`) and redeploy; until then
  only the in-app half works and no banner is drawn. iPhone: install to Home
  Screen first. (4) delete a message you sent: trash on own bubbles, inline
  confirm, both hosts. (5) portal My tasks opens on ALL. Probes:
  `round42-probe.mjs` (32, needs a 5175 server with VITE_VAPID_PUBLIC_KEY),
  `push-test.mjs` (5, offline). Regressions + audits green.
- **2026-09-16, fourth pass — his four-part report.** (a) "she sees the task,
  I don't; the contractor doesn't see it that same second": the other
  workspaces were a one-time localStorage copy — `startForeignSync` in the
  store now keeps every other workspace's apartments / tasks / threads LIVE
  from AppLayout, the portal and the TV (see the last CLAUDE.md section).
  Cannot be probed here (no Firebase) — verified by reading; he must confirm
  on production. (b) "it shows me all the stages": the notebook dialog now
  lists ONLY the job's own workspace's stages (`stages` prop removed).
  (c) "I can't drag [Building Progress apartments] into the notebook like a
  regular job": a progress square, a unit card or a list row dropped on a
  square opens the SAME task dialog, the task made in the unit's workspace,
  drawn as a bar; no pointer card. (d) the portal's "React error" on
  refresh: NOT identified — ask him for the crash screen's copied text.
  `foreigndrop-probe.mjs` (20) green; notebookbars, genbld, round21,
  portalswitch, multiday, tsc, build, four audits green.
- **2026-09-16, third pass — "Which building should have an all option +
  multiple select"** (his screenshot of the notebook's add-a-job dialog on
  the Wolfson which-building step). DONE: an All pill, tick-several building
  pills and a Done button; `general.buildingIds` on the task with the legacy
  single `buildingId` kept when one is ticked; one label helper for the
  dialog, the bar and the Tasks row; the bar's doubled workspace name fixed.
  `genbld-probe.mjs` (12) green; notebookbars, multiday, tsc, build, audits
  green. Pre-existing red noted: `round39-probe.mjs` (stale "I did work
  here" stage-filter assertion from before yesterday's flow change).
  Not done (not asked): the Tasks page's own general-job form still has a
  single "Any building" dropdown — offer it if he wants the same there.
- **2026-09-16, first pass — the worker's map chooser wears the project
  LOGOS.** His ask, in order: (1) FIRST, then commit and push to main: the
  two big project buttons under Building Map should carry the projects'
  logos, big, in the middle — "some of them don't read the little name in
  English"; the logos are the header's own `logoPath` pictures. DONE: each
  button is the logo centred (≤78% wide, ≤150px tall) with the name at 17px
  underneath; `scratchpad/maplogos-probe.mjs` (15) green; tsc, build, four
  audits green; pushed to both branches as a8c4d1e, as he asked ("first…
  then commit and push to main"). (2) THEN: the bare domain "is blank…
  there's no home page"; the home page should be the Job Board. DONE (second
  commit of the day): `Home` at the index route switches the workspace to
  `general` and only then goes to `/jobs`; the login landing agrees for a
  bounce from `/`; `*` still funnels through `/`. `homepage-probe.mjs` (9)
  green; urgentnav, round29, navwatch, portalswitch, gapsnap, pencil green.
  **Not reproduced**: here the root drew the Wolfson diagram, never a blank —
  tell him so, and that a still-blank page after this deploy needs the
  CrashScreen's copied text.
- **2026-09-15, sixth pass — the owner's first look at the build, four
  reports, all fixed** (the last CLAUDE.md section is the record).
  (1) "My job on -0.5 vanished / A2 and A3 show no basement": the row model
  drew basement rows only from loaded records — now every tower's basements
  are part of its SHAPE (A1 -0.5, all -1..-4), a real unit on the old Ground
  row still shows, the column fallback for slots 57+ no longer stacks them
  on one square, and two records on one square step aside instead of one
  hiding the other. (2) "Why not all three buildings at once / squares I
  press are not selectable or mergeable": the studio draws every building
  side by side, and an EMPTY square is selectable and merges by becoming a
  blank record. (3) "An old thing on Oct 6 sitting under stuff I cannot
  select to delete": a bar for a task in ANOTHER workspace was untouchable —
  the store gained cross-workspace task writers and every bar drags/resizes/
  comes off; a bar's height is now the exact lane height so it never lies
  over the next square's card. (4) The worker's flow, in his words: the map
  button is "I'm going to work here" → the stage it is at → an OPEN task for
  today (on his calendar + the office notebook); at the end of the day he
  closes the task and the closing screen asks "what stage is it at now?",
  takes the pictures, and the unit moves there. The finished / not-yet /
  what-is-left steps are GONE. Probes green: builder2-probe (+section 13),
  notebookbars, multiday, stagereport (re-encoded to the new flow) plus the
  regressions. **Tell him plainly**: the "I did work here" question is gone
  by his design — a stage is now marked half-done only by the office
  (right-click in the stage picker); and one thing I could not verify
  without his data: the Oct 6 item was diagnosed from the code (a foreign
  task's bar), so if it is still stuck after this deploy the next step is a
  screenshot with the bar's hover title.
- **2026-09-15, fifth pass — "build it" arrived and ALL SIX SCENES ARE BUILT**
  (scenes 1 and 2 by two sub-agents in worktrees, merged; 3–6 in the main
  session; the full record is the last CLAUDE.md section). What the owner
  will see: (1) project settings → Buildings opens a full-screen layout
  studio with the real units (number, family, stage colour), right-click for
  rename / blank number / move a floor (asks keep-number or renumber) / merge
  selected cells across a row into ONE unit drawn merged on the project
  page, Building Progress and the worker's map / row height
  normal·tall·short; the floors match the project page (the Ground/Commercial
  row is gone; note TWO rows now wear "1" — floor 1 and "1 · Lobby", flag
  it to him). (2) The drawer's plan pane browses the job's Drive folder like
  Drive when no plan is chosen (breadcrumb, folder + picture tiles with
  thumbnails; .dwg wears a badge and no controls); the arrow previews with
  "Back to <folder>"; the STAR on any viewable file in any folder — markups
  included — is the worker's plan; the Plans chooser is the same tiles with
  the same star; a browse button on bar 2 when a plans folder exists. (3+6)
  The notebook draws every task as ONE bar across its days (Google
  Calendar); old per-day cards folded into their tasks by themselves; drag
  moves the whole task keeping the working-day pattern, the edge resizes,
  the X takes a stretch off (the last one asks keep-dateless / delete); a
  closed task is struck "done" / "finished early"; a square's HOVER plus
  opens the add-a-job dialog (job search across workspaces, general job =
  workspace → building, who = search adding a row, MessageBox, the stage
  pair, the day picker); the free-words card cannot be created any more;
  the "already has work" ask fires only on the same job + same day with
  Add anyway / Pick another day. (4+5) Every task form picks the stage the
  task is ON ("not reached yet" for a future stage — and picking a stage
  NEVER moves the job any more) and the when-done stage; task rows read
  "on → to"; a non-consecutive second stretch may carry different stages
  (one task or two, asked, default two). Probes green: notebookbars-probe
  (36), multiday (re-encoded to bars), builder2-probe (54),
  planbrowser-probe (44), taskdaysforms, round34-probe, notebook2way,
  plantabs, portalround, progresscells, stagefit, deskcheck, drawerround.
  Standing reds, verified pre-existing: round22 (the seeded Goals fixture
  intercepts the week plus), planaddr (a sandboxed-frame localStorage page
  error), mobdiagram (stale assertion). **Behaviour changes to tell him
  plainly**: dropping a tile on a square now CREATES A TASK (the tile stays
  on the board; "Just put it on the planner" parks a card without a task);
  a task's days are edited by moving/resizing the bar or in the job
  window, and the notebook follows because it draws the task itself; the
  notebook no longer holds free-text notes. What needs his eyes on
  production: the fold of his real cards (runs once per notebook on first
  open), the Buildings studio on Wolfson's real 168 units, the browser on a
  real Drive folder (thumbnails need the service account).
- **2026-09-15, fourth pass — VERSION 4: his screenshot arrived and is read
  into scene 6** (copy `docs/artifacts/2026-09-15-buildings-plans-notebook-plus-v4.html`):
  Yaakov's row, week of 4 Oct — Sun 4 + Mon 5 DASHED "Streter, D… ·
  Installation" (derived task chips, a task nobody placed) beside Tue 6 SOLID
  green (a stored card): the two-records-two-looks fault exactly. Coverage
  is now all ✓. **Still awaiting the words "build it".**
- **2026-09-15, third pass — VERSION 3: ALL TEN STARS ANSWERED AND LOCKED.**
  The owner's answers, now on the page (copy
  `docs/artifacts/2026-09-15-buildings-plans-notebook-plus-v3.html`):
  1 keep the number (renumber second) · 2 a merged row is one unit AND LOOKS
  merged — one wide cell across the row in the builder, the project page,
  Building Progress and the worker's map · 3 anything starred is the main
  plan, markups included · 4 the free-words card is DROPPED, every square
  entry is a job (existing notes stay readable until removed) · 5 all rows
  the same height PLUS a per-floor row height in the builder's right-click
  menu (normal/tall/short) · 6 any worker — picking one not on the sheet adds
  their row first · 7 one source of truth (tasks drawn from tasks, no stored
  per-day cards, one-time fold of existing cards) · 8 the ask fires on same
  job + same day only · 9 one task when both stretches share the stages, ASK
  when they differ · 10 the FROM stage = any stage, "not reached yet" hint.
  The page also carries a coverage table checking every ask from his two
  messages — all ✓ except his screenshots, which have STILL not arrived.
  **He has not yet said "build it"** — the page ends asking for the
  screenshots and those words. The next assistant builds scenes 1–6 exactly
  as drawn, in one round, the moment he says so (or, if he answers with more
  changes, folds them into version 4 first).
- **2026-09-15, second pass — VERSION 2 of the plan page, still nothing built.**
  The owner approved version 1 ("everything looks good") and added remarks,
  all drawn into the SAME artifact (version 2; dated copy
  `docs/artifacts/2026-09-15-buildings-plans-notebook-plus-v2.html`). What
  version 2 adds: a unit may have a name and NO number; the builder's
  controls also in a right-click menu; a preview arrow on every plan tile
  with "Back to <folder>" and "Make this the main plan"; the notebook plus
  only on HOVER; the add-a-job dialog's general job = pick workspace THEN
  building, who = a search, what = the MessageBox, days = the standard
  TaskDaysPicker, stage = from → when-done; **Add task EVERYWHERE picks the
  FROM stage (any stage, even unreached) and the TO stage**, and every task
  row reads "Installation → Drywall" (new field `ContractorAssignment.fromStageId`
  proposed); non-consecutive stretches get a "different stages" switch and an
  "one task or two?" ask; **the notebook gets ONE kind of square — a bar
  spanning its days (Google Calendar), drawn FROM THE TASK**, and the
  notebook stores no per-day task cards any more (only free-words notes and
  job-without-task placements; a one-time fold of existing cards into their
  tasks); **the "already in the planner" ask fires ONLY on an overlap** (same
  job, same day) and names who is there. The page explains, from the code,
  the three things he hit: `addContractorAssignment` raises `plannerAsk`
  whenever the job has ANY card on any rota (never checks the day);
  `saveTaskEdit` in the drawer rewrites the task's days but never touches the
  notebook's `cells`, so the four per-day cards stayed after he unchecked
  non-consecutive; and the two square kinds are stored entries (one card per
  day, `data-day-pill`) versus derived dashed `taskChips` (a dated task nobody
  placed). **His screenshots did NOT arrive** (words only) — the page says so
  and asks for them again. New stars 7–10 on the page: one source of truth
  (rec. yes), overlap rule same-job-same-day (rec.), two tasks when stages
  differ (rec.), FROM stage = any stage with a "not reached yet" hint (rec.).
  Stars 1–6 taken as recommended by his "everything looks good".
- **2026-09-15 — a plan page only, nothing built**: the owner asked for
  urgent changes in three places and for before/after previews in ONE
  artifact before anything is built. Published "Buildings, Plans and the
  Notebook Plus" (https://claude.ai/artifact/Y8ujqL3CjhocFFGn5C5W9B; copy in
  `docs/artifacts/2026-09-15-buildings-plans-notebook-plus.html`; template
  `scratchpad/settings-plans-notebook-plan.template.html`, built with
  `scratchpad/build-plan-page.mjs`). It ends in six starred questions. **Build
  only when he answers the stars and says "build it".** What it proposes:
  (1) project settings → Buildings opens full screen and draws the diagram's
  own cells (number + family + stage colour); move a cell to another floor
  with an ask about the number; select several cells and merge them into one
  square spanning the row (the lobby is one job); the builder's floors become
  the project page's floors exactly (Roof, 15/14 wide, 13…2, "1 · Lobby",
  -0.5, -1, -2 — the empty Ground / Commercial row dropped); every row the
  same height so lobby text is never cut off. (2) The drawer's plan pane
  browses the job's Drive folder like Drive — breadcrumb, folder tiles, plan
  tiles with Drive thumbnails — whenever there is no Engineered Plans folder
  (behind a browse button when there is); a star on every plan tile in every
  folder, and in the Plans chooser, writes `plansPdfLink` = the contractor's
  plan and what the drawer reopens on. (3) The notebook: pressing a day
  square shows a big plus; the plus opens the standing drop dialog with a
  job-search step in front (every workspace, apartment or general job), who,
  what (MessageBox), days, when-done stage; the free-words entry survives
  only behind "Just a note instead". Facts for the build: builder =
  `src/components/settings/ProjectBuilder.tsx` (CELL_W 54 / CELL_H 40,
  number-only cells) + `src/data/projectLayout.ts` (joinSlots / unjoinSlot /
  proposeNumbering); diagram rows in `BuildingDiagram.tsx` `getFloorRows`
  (lobby/ground rows 44px vs 68 normal — the cut-off); the free-words entry
  is `PlannerWidget.tsx` ~line 1638 (`setCell(key, [...entries, {id, text:''}])`);
  `PlanPicker.tsx` props `{driveLink, plansFolderId, plans, current, onPick,
  onOpenNewTab, onClose}`; thumbnails via `driveThumbUrl` (photoSrc.ts).
  This session's branch was merged with production (six commits from another
  session: the search rebuild, the Hebrew drive name, the portal manifest,
  the tablet round) — read those entries below as well.
- **This round — the tablet list** (eight asks in one voice message): new
  workers see the buildings by default (Contractor level +seeDiagrams
  +seeAllApartments); a worker with `markUpPlans` gets Mark up on the portal
  plan (the full studio); on the board a finger SCROLLS a widget's list
  instead of panning, and a finger never drags a job row (the "jumpy"); the
  pen's side button erases while held; touch-sized ink sliders; the green
  version connector draws on an upright tablet (bottom rail); and the pins
  ride the SHEET (`PlanEditor.sheetOverlay`) in the office pane and the
  worker's preview — the portal's expanded preview now draws the sheet itself
  instead of Google's iframe. Probe `round41-probe.mjs` (22). What's New
  `2026-12-22`. NOT understood / not built: "the job widgets can be messed
  around on an iPad" — asked him what he meant.
- **This round — the Chrome shortcut** (owner: "Okay, it works" for the
  helper, then: saving a Chrome shortcut to a worker's link "takes me back to
  the main workspace page"). Cause: Chrome's Add-to-Home-screen / Install /
  Create-shortcut never saves the page you are on — it launches the site
  manifest's `start_url`, which is `/`. Fix: `src/data/portalManifest.ts` —
  while `/c/<token>` is mounted the page's manifest link points at a blob
  manifest whose `start_url`, `scope` and `id` are the worker's own absolute
  link, named `TzviAir · <worker>` (the tab title follows); the office
  manifest returns on unmount. Every worker's portal is its own app. Probe
  `portalmanifest-probe.mjs` (8). What's New `2026-12-21`.
- **This round — the helper's "still error"**: his screenshot showed the
  path the app built was `G:\Shared drives\Potentials\…` — the shared drive's
  own name ("TA Zoho Docs") missing, because the server names it through
  `drives.get`, which Google refuses to a non-member service account. Fixed
  three ways: the server tries the drive's root file for the name; the client
  never skips the segment (server name → the name a pasted path taught this
  machine → the default "TA Zoho Docs"); the Windows and Mac openers search
  the drive folders one level down before saying "not on this computer".
  `drivehelper-test.mjs` +6. The copy of the helper already on his PC works
  with the corrected path; a re-download gets the deeper search too.
- **This round — the search rebuild** (owner: "go ahead and build the search
  rebuild"): `docs/research/SEARCH.md` items #2–#10 are BUILT. One MiniSearch
  index per workspace (`src/data/searchIndex.ts`) read by all six search
  boxes — header, search tile, job list, the board's and the TV's group
  windows, Find-a-job. A job is found by its name, the Drive folder title
  (split into family / first / number / city), address, phone with or without
  dashes, tipus, unit tokens, a pasted Drive/Zoho link, a task's words, a
  message, a memo's transcription, a punch-list pin, a file name. One Hebrew
  normaliser + sound key (`hebrewNormalize.ts`; `translit.ts` and
  `hebrewSearch.ts` delegate). Tiers a whole tier apart (starts-with first,
  sounds-like last). "Found in …" line under header rows and tile rows.
  Filter words `stage:` `group:` `worker:` `ws:` `is:problem` `is:pending`
  (Hebrew twins), a hint under the list. Learned picks per workspace, 30-day
  fade, "Forget what I picked before" on the empty box. `fuse.js` removed.
  Probes: `hebnorm-test`, `searchindex-test`, `searchperf` (3,736 docs index
  in ~215ms; worst keystroke 22ms), `gsearch` (+6). What's New `2026-12-19`.
- Earlier today: the owner's real Explorer path (`G:\תיקיות אחסון שיתופי\TA
  Zoho Docs\Potentials\…`) confirmed the Hebrew "Shared drives" name and the
  drive name; a Hebrew browser composes the copied path with it by itself
  (`defaultSharedName`). Before that: the Drive folder title stored by every
  door and searched everywhere (SEARCH.md #1); HANDOFF.md + `docs/artifacts/`;
  the one-file Hebrew-safe Windows helper.

## What the owner last asked (his exact wants)
0. **(2026-09-17, the stages session — PAGE ONLY, awaiting 15/16 + "build
   it")** "under what are you doing here, I want to write select one or
   multiple. You don't need the only three… What does something else do?
   Closing the job my way I kind of like. I like that they have to take
   pictures for each stage. I just want to know the scope of adding a
   feature where we can add a custom bubble really quick… for that specific
   apartment… Regarding question three, you're starting; question four,
   either the start or the workspace, we should be able to add by multiple
   things. We have to see how that would work. Question seven: we don't
   need this job stage now and after anymore. We need one which is just the
   bubbles and we should still keep an order… it will just move to the next
   one on the order automatically. And a task can cover several stages at
   once. Question 11: I want three pictures for each stage you finish,
   separately. Starting with 12. Only the office can switch off a stage for
   an apartment. And whatever he says he didn't finish is half done. The
   only unlock is the office as well." — ALL folded into Version 3.
-3. **(2026-09-17, the buildings list — ALL BUILT, see above)** "In the
   building layout editor I need to be able to rename a floor upon
   right-clicking… where is the names of the four squares as well." "If I
   already have an apartment on minus 2 and now I want to merge that for the
   whole row — it's not letting me merge, and even if it does let me merge, it
   just…" "Not all positions have necessarily numbers. In minus 1, 2, 3 and 4
   there's a pool, a gym, there's no numbers there." "When I click save and I
   see these changes will be written, I wanted a total before and after —
   three buildings on one side, three on the other, and I see highlights of
   what changed." "I need an ability to add and remove floors." "Right now the
   notes and tasks are kind of redundant. The task messages are the notes. So
   the notes should have a different function: I put notes there, then when we
   get to that stage or task, the contractor will see it on the site."
   **AND THE OPEN ONE:** "Now, finish this and we have a planning session to
   do regarding the stages." — the stages planning session is the next thing.
-2. **(2026-09-17)** "why don't I see the permissions asked on my computer
   from Google Chrome to allow notifications" — DONE (header pill). "When a
   worker assigns a job for himself, it asks him what stage is it on. I want
   to skip that… it should ask him What will you be doing here? and then
   show the stages" — DONE. "On a Galaxy S10 tablet the markup studio looks
   really bad… rethink the whole UX UI flow for the tablet" — PLAN PAGE
   published, awaiting his answers 1–8. "When we assign a general job… he
   shouldn't be able to close the job… it should take him to all the
   buildings or the specific building… ask which apartment… if he doesn't
   have the permission a pop-up should say that" — DONE.
-1. **(2026-09-16, the second list — BUILT, see above)** separate permissions
   for "add a job for myself" vs "I'm going to do work here"; no "what stage"
   at the start, "what stages did you do" + "did you finish all of them?" at
   the close, else half finished; an ordinary job's close must not ask the
   stage; plans everywhere auto-pick the latest Drive activity with a red "!"
   bubble; notifications both ways with the portal bell holding everything
   and a click opening the item step by step; Equal size + "27 selected and
   arrange doesn't work"; unit cards are ghosts (delete without the warning);
   calendar widget month arrows; Focus on a widget's right-click; the
   add-a-job dialog's stage pair clearer + per-workspace stages; general job
   → all buildings (already there); right-drag = pan; self-task per project
   with a search over all jobs like the PC; a Planner tab he never permitted
   (answer: the Manager level grants it); Hebrew workspace names.
0. **(2026-09-15, OPEN — awaiting his stars)** "There's a few fixes we need to
   do really urgently": in Wolfson project settings → Buildings he cannot see
   the actual apartments with their saved info ("at least I can see what I'm
   touching and when I'm moving"); add moving an apartment a floor with the
   numbering handled; merge several apartments across a whole row into one
   square (the lobby is one job); the lobby row is thinner and its text is
   cut off; project settings may take the entire screen; the builder's floors
   must match the project page (Lobby/Ground, then -0.5, -1, -2; the empty
   Ground / Commercial floor is unnecessary). Pasting a Drive link with no
   Engineered Plans folder: the plan selector should browse like Google Drive
   (clickable folders, thumbnails) where the plan preview is; a star next to
   any plan in any folder = the main plan the contractor sees, and the
   apartment reopens on it. The notebook: clicking a day should show a big
   plus that prompts for the job (building project or apartment), who, and
   details, and create the task — the "three dots" free-text entry is broken.
   He wants "previews of all these behavior changes in an artifact, before and
   afters" — done; nothing built yet.
1. **A handoff file kept updated after every response** — DONE (this file,
   `docs/artifacts/`, the rule in CLAUDE.md).
2. **The Drive folder helper button** (Windows, Hebrew computers) — rebuilt
   and CONFIRMED WORKING by the owner ("Okay, it works", 2026-09-08) after the
   drive-name fix.
4. **A Chrome shortcut to a worker's link** must open that link — DONE
   (see above).
5. **The tablet list** (2026-09-08, voice message) — all built except the one
   sentence nobody could parse: "the job widgets can be messed around on an
   iPad". Waiting on his answer (moved by accident? cannot be moved?). He should re-make the shortcut from the worker's page
   AFTER the deploy; a shortcut made before it still points at the old
   manifest's home.
3. **Search** — the folder-title fault fixed at the root, and now the full
   rebuild he asked for after the research ("go ahead and build the search
   rebuild") is built and pushed.

## Open threads / things to verify on production
- **The Studio on the Tablet**: waiting for his numbers on the eight
  questions (page link above). Build to them exactly; the captures come
  from `scratchpad/tabstudio-cap.mjs`, the pen probe from `tabs10-pen.mjs`.
- **The header bell pill**: on each office PC press it once and Allow.
- **Desktop alerts on the office PCs** (2026-09-16): the first worker message
  after this deploy shows a card with "Allow desktop alerts" — press it once
  per computer so a hidden tab can notify. Works without VAPID keys (it is
  the in-app half); the phone-closed half still needs the keys below.
- **Check the worker who sees the Planner tab**: Settings → Workers → his
  level. Only Manager grants "See the planner"; move him to Technician or
  Contractor (or switch the one permission off on him) and the tab is gone.
- **The plan zoom on his Windows PC** (2026-09-16): reload the tab first.
  If it STILL snaps, the next step is a `?debugzoom=1`-style readout of what
  fires `setFitting(true)` — the trigger on Windows was never seen from here
  (Chromium/Linux holds the border box); the fix removes the consequence,
  not the (unknown) trigger.
- The portal's React error on refresh: still waiting for the crash screen's
  "Copy the details" text.
- **Try the new search on the real board**: type a first name that only
  lives in a folder title, a phone number without dashes, a Hebrew spelling
  of an English family, `group:done <name>`, `is:problem`. The row should say
  where it matched. If anything ranks wrong, `scratchpad/searchindex-test.mjs`
  is where a worked example goes first.
- The sweep's backfill of folder titles runs on its two-hourly timer (needs
  `VITE_DRIVE_API_KEY`); until it has run, jobs linked before 2026-09-08
  carry no title and are found by name/address/phone only.
- **Re-make the worker shortcut after the deploy** (Chrome menu → Add to Home
  screen / Install / Create shortcut, from the worker's `/c/…` page). The icon
  should carry the worker's name and open his page. If a shortcut STILL lands
  on the office home, the phone's Chrome may have the office app installed
  with scope `/` — uninstall that one first, then re-add from the portal.
- Keys (Vercel only, never in the app): `OPENAI_API_KEY` (transcription,
  translation, the AI plan reader), optional `ANTHROPIC_API_KEY`,
  `GOOGLE_SERVICE_ACCOUNT_JSON`, `API_KEY` = `VITE_DRIVE_API_KEY`.
- Standing pre-existing red harnesses (not this round's): `boardsize.mjs`
  (left-edge auto-pan), `gapboard.mjs` (a group under the board's chrome),
  `stripsrow-probe` (2 checks), `mobdiagram.mjs` (stale assertion),
  `round28.mjs` group-window section (dblclick on the Done bin times out;
  its Add Job section passes); `storefull.mjs`'s one standing false
  positive (`nobody-booked`).
- Decided, not built: search ranking by Drive activity (CRM-CHECKLIST).
- Container notes: `npm ci` then `npm install --no-save playwright@1.54.1`
  (also `@pdf-lib/fontkit` if a plan-reader probe needs it — installing one
  ad-hoc package prunes the other, install both together). Dev servers:
  `npx vite --port 5173` and `VITE_DRIVE_API_KEY=test npx vite --port 5174`.

## The last reply the owner saw (so the next one continues it)
**Newest (2026-09-22, the build)**: the reply reported the whole set model
built in one round per the page's five-round order — what each screen does
now, that the word stays "stage", that the migration is automatic and keeps
every cell's colour, the four doors, the worker's new start and close, and
what to check first on production. Bottom line + bullets (KEEP THAT FORMAT).

**Newest (2026-09-17, the stages session, Version 3)**: the reply said the
page was updated with every one of his second-round answers — the phone
says "select one or multiple" and "Something else" is gone (it meant work
not on the apartment's list; with office-only adding it has no place on the
phone), the close now takes three pictures per finished stage on separate
named screens and never for one he didn't finish, one task picker in order
with several stages and an auto-advancing headline, office-only off-switch,
half-done cleared by the office only — and answered the custom-stage scope
(a three-field "+ add a stage" in the apartment window; underneath it lives
in the workspace list flagged custom · used on 1, hidden elsewhere until
widened; under half a round, rides round 2). Two questions left: 15 (the
doors) and 16 (where a custom stage lives). Bottom line + bullets.

**Newest (2026-09-17)**: the reply explained why the Chrome ask never
showed (it rode the first worker message) and that a bell pill in the
header now asks; that the self-task form says the current stage and asks
what he will be doing; that a general job's sheet leads to the building(s)
with a banner and files each "I'm going to work here" as a visit under it,
with a pop-up when the permission is off; and that the tablet studio was
measured and drawn as a plan page with eight starred questions rather than
built — asking for his numbers. Bottom line + bullets (KEEP THAT FORMAT).

**Newest (2026-09-16, seventh pass)**: the reply walked his list item by
item — the split permissions and the per-workspace self-task; the start
that asks nothing and the close that asks which stages + finished?; the
ordinary task's close asking nothing; the newest plan shown in red with the
"!" bubble and never written; the office ringing (card top-right, one-time
"Allow desktop alerts" press, click opens the task lit) and the portal bell;
Equal size, honest counts, Arrange with groups, Focus, calendar arrows,
right-drag pan, unit-card delete; Hebrew names; the clearer dialog — and
told him the Planner tab comes from the worker's Manager level, not a bug.
Reminded him VAPID keys are still needed for phone-closed push. It ended
with a Bottom line + bullets (KEEP THAT FORMAT on every reply).

**Newest (2026-09-16, sixth pass)**: the reply said his video was read frame
by frame, that the previous fix WAS on production but the sheet was still
being re-fitted while he wheeled (two ladders, 124 and 122, a scrollbar's
width apart), that the viewer now never throws away a zoom he chose (only a
fitted sheet follows its frame; full screen still fits), and asked him to
reload the tab and try the wheel again in the job window and in full screen.
It ended with a Bottom line + bullets, the format he asked for on 2026-09-16
("maybe at the end of each prompt, give me like the bottom line and like
bullet points") — KEEP THAT FORMAT on every reply.

**Newest (2026-09-16, fifth pass)**: the reply walked his five issues — the
scrollbar cause of the jumping zoom; the "press Send" line; the ringing
(in-app now, phone-closed once he adds the VAPID keys in Vercel, with the
exact three variable names and the iPhone Home-Screen rule); delete on own
messages; All as the default — and asked him to add the keys and try a
task on a worker's phone.

**Newest (2026-09-16, fourth pass)**: the reply explained the one cause
behind "she sees it, I don't" (other workspaces were a copy made on the last
visit, never refreshed), said they are followed live now from every screen,
that the notebook dialog lists only the job's own stages, that a Building
Progress square / unit card / list row now drops on the notebook exactly like
a tile (dialog, task in its own workspace, bar), and asked him — for the
portal's React error on refresh — to press "Copy the details" on the crash
screen and paste the text, since that fault was not found from the code.

**Newest (2026-09-15, fourth pass)**: the reply read his screenshot (two
dashed chips from a task, one solid stored card, same job, same worker),
folded it into scene 6, and said the only outstanding thing is "build it".

Earlier: **Newest (2026-09-15, third pass)**: the reply said version 3 is at the
same link with all ten answers locked and a coverage table, that every ask
from his two messages is accounted for, and that only two things are
outstanding: his screenshots (still not received) and the words "build it".

Earlier: **Newest (2026-09-15, second pass)**: the reply said version 2 is at the
same link, that no screenshots arrived, listed what was added from his
remarks, explained the three faults (the day-blind ask; the drawer's task
edit not touching the notebook's stored cards; stored cards vs derived
chips), proposed one source of truth + spanning bars + the overlap-only ask,
and asked him to answer stars 7–10, resend the screenshots, and say "build
it". The next assistant's job: read his answers and BUILD the whole page in
one round (scenes 1–6), probes and all — the biggest piece is scene 6 (the
notebook drawing tasks from tasks, with the one-time card fold).

Earlier: **Newest (2026-09-15)**: the reply gave him the link to "Buildings, Plans and
the Notebook Plus", said each scene is a before beside an after with numbered
notes, listed the six starred questions (move-a-floor keeps its number?; a
merged row is one unit?; a marked-up version can take the star?; keep the
free-words card behind "Just a note instead"?; every row the same height?;
only people on the sheet in the notebook dialog?) with the recommended
answer on each, and asked him to answer the stars and say "build it". The
next assistant's job: read his answers, then build exactly what the page
shows with those answers, one round, probes and all.

Earlier replies follow.
He sent eight tablet asks in one message. This round's reply says, item by
item: workers now start with the buildings shown; a worker allowed to mark up
sees Mark up on his plan; a finger scrolls a widget's list and the jumpiness
was a job row being dragged by the finger, which no longer happens; the pen's
side button erases while held; the sliders are finger-sized; the green line
draws in portrait; and the pins now sit on the plan itself in both the office
window and the worker's phone (the phone draws the sheet the office's way
instead of Google's frame). It asks what he meant by "the job widgets can be
messed around on an iPad" — moved by accident, or cannot be moved at all —
before touching the finger rule. Everything is on production.
