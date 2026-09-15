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
  `claude/handoff-documentation-aei1ev`; both must end each round at the
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
   newest is `2026-12-22` — the next entry must be a later date (an older
   entry lower down also wears `2026-12-20`; the marker compares only the TOP
   entry's date, so never reuse a date that appears anywhere in the file)). 6. A CLAUDE.md
   round record. 7. A line in `docs/CRM-CHECKLIST.md`. 8. Rewrite THIS file.
9. Commit (footer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
   + `Claude-Session: <session url>`), push the working branch, then
   `git merge-base --is-ancestor origin/claude/blissful-cray-spTFY HEAD` and
   push production. Never force-push. Never commit real office data (the CRM
   export, fetched Firestore records) — they live in /tmp.
10. Reply in plain language: what was found, what was done, what to check.

Design work is gated: a plan page (an artifact, see `docs/artifacts/INDEX.md`)
with starred recommendations is published first; the owner says "approved" /
"all yes" / answers by number; then it is built. Never build a redesign
unasked.

## Where things stand (2026-09-08, seventh round of the day)
Last commits, newest first (see `git log`):
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
**Newest (2026-09-15, third pass)**: the reply said version 3 is at the
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
