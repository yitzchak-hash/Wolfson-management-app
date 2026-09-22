# CRM feature checklist

The standing list of what the app has to support, kept as a checklist so a
feature is never decided in a chat and then lost. **One line per feature.**
When something is decided, it goes on here as ☐ with where it was decided;
when it ships, it becomes ☑ with the date. A line that says "planned" is a
promise the app has not kept yet. Add to it in the same commit as the
decision or the code.

Legend: ☑ shipped · ☐ decided, not built · ◐ built in part · ✎ needs the owner's word

## The worker's phone (portal)
- ☑ Three languages: English, Hebrew, Russian — set from the office or the worker's own gear (2026-09-03)
- ☑ Messages and task text read in the worker's language, Show original one tap away (2026-09-03; needs `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`)
- ☑ Logo centred and larger; bell and gear on the right; print button gone; language inside the gear (2026-09-03)
- ☑ Workspace chip row gone; every workspace's tasks in one list, each card tagged with its workspace (2026-09-03)
- ☑ My Tasks opens on Today; an empty Today offers every day in one press (2026-09-03)
- ☑ Calendar opens Monthly and the month grid fills the phone (2026-09-03)
- ☑ Building Map: full-screen project chooser when more than one map is allowed; straight in when one (2026-09-03)
- ☑ Building Map: one bar — project name button (opens a sheet), A1·A2·A3 segmented control (All on a wide screen); day filters, hint and "0 yours" gone; scrollbars hidden (2026-09-03)
- ☑ Building outline around the diagram, same silhouette for every building; bottom fades to show there is more (2026-09-03)
- ☑ Task messages: renamed, grey panel wraps the composer (office and phone), "Your message" with the dictation mic at its left, paperclip inline, big mic that becomes Send when there is text (2026-09-03)
- ☑ "What did you do?" lists only the stages the worker may report; Ready to start never offered (2026-09-03)
- ☑ Worker can add punch-list pins from the phone, with voice memo and files (2026-08-31)
- ☑ Close job needs 3 pictures unless the worker is marked photos-optional
- ☑ Multi-day tasks show every day; finishing early asks in the worker's language
- ☑ Notification bell with per-worker scope

## Permissions per worker (Settings → Workers)
- ☑ Level + fifteen switches; language; text size; photos optional; notification scope
- ☑ Building maps he may open (2026-09-03)
- ☑ Stages he can report, per workspace (2026-09-03)

## Stage reports (the "I did work here" flow)
- ☑ Yes → stage report task → closing screen; Not yet → half-done clock + note under an open report task
- ☑ Photos attach to the reported stage only; earlier stages cross off without being written to; a finished report moves the apartment forward, never back (2026-09-03)
- ☑ "Not yet" moves the apartment to that stage when it is further along (2026-09-03)
- ☑ A report on a stage already passed is a record, never a move backwards (2026-09-03)

## Tasks and scheduling
- ☑ Multi-day tasks (all days on the task, Friday per stretch, non-consecutive stretches)
- ☑ Weekly notebook: drop a job on a person's day, move/copy/off asks, quick-assign box
- ☑ The notebook draws every task as ONE bar across its days (from the task, no stored day cards; old cards folded once); drag moves the task (working-day pattern kept), the edge resizes, the X takes a stretch off; closed = struck "done" / "finished early" (2026-09-15)
- ☑ Hover plus on a square → add-a-job dialog: job search across workspaces, general job = workspace → building, who = search (several; a new worker gets a row), MessageBox, stage on → when-done, the day picker; free-words squares no longer creatable (2026-09-15)
- ☑ "Already has work" ask only on the same job + same day, with Add anyway / Pick another day (2026-09-15)
- ☑ Every task form picks the stage the task is ON (any stage, "not reached yet") and the when-done stage; a task never moves the job; task rows read "on → to"; a non-consecutive second stretch can carry different stages (one task or two, asked) (2026-09-15)
- ☑ Plan pane browses the job's Drive folder (breadcrumb, folder + picture tiles, thumbnails, preview arrow + Back); the star on any file in any folder = the worker's plan; the Plans chooser is the same tiles + star (2026-09-15)
- ☑ Project settings → Buildings is a full-screen layout studio with real cells: rename, blank number, move a floor (keep number / renumber), merge across a row into one unit drawn merged everywhere, row height normal/tall/short, floors = the project page's (2026-09-15)
- ☑ Every Wolfson basement row (A1 -0.5, all towers -1..-4) is always drawn; a real unit on the old Ground row still shows; two records on one square step aside instead of hiding (2026-09-15)
- ☑ The layout studio shows all buildings side by side; empty squares are selectable and merge by becoming a blank record (2026-09-15)
- ☑ A notebook bar for a task in another workspace can be dragged, resized and taken off (cross-workspace task writes); a bar never covers the next square's card (2026-09-15)
- ☑ Worker's map: "I'm going to work here" → the stage it is at → an OPEN task for today; the CLOSE asks "what stage is it at now?" and moves the unit there (2026-09-15; replaces "I did work here" with its finished / not-yet steps)
- ☑ Worker's map chooser: each project button is the project's LOGO, big and centred, the name small underneath (2026-09-16)
- ☑ General jobs — a task for a workspace, not an apartment: "General job" checkbox + workspace select on the Tasks page; notebook card reads "Wolfson"; phone card reads "Work at Wolfson" / עבודה בבניינים של וולפסון / Работа в Wolfson; "Is this part of…?" on a stage report (Yes preselected); visits list on the task (2026-09-03)
- ☑ General job closes like any task, with or without visits (starred answer taken, 2026-09-03)
- ☑ "Is this part of…?" asks every time a general job is running, Yes first (starred answer taken, 2026-09-03)

## Problems on an apartment (built 2026-09-06)
- ☑ "Report a problem" under the stage list → worker, deadline (3 working days default), the message box with memo + pictures, "pictures required to close?" (2026-09-06)
- ☑ The apartment turns RED with a big "!" on the diagram, the board tile, the TV and Building Progress; the stage line reads "PROBLEM · was X"; the real stage is never touched (2026-09-06)
- ☑ Worker: problem cards red and first on every day's filter, deadline printed, "N days late", red banner past the deadline, bell item; Close problem → Waiting for approval (rose); the office's Send-back note on the card (2026-09-06)
- ☑ Office: the band under the window title — Approve (admin users only) / Send back with a note; approved → green "Problem solved" with the pictures, kept 30 days; the header bell lists open + waiting problems (2026-09-06)
- ☑ "I did work here" on a red apartment offers "Is this the fix for…?" first (2026-09-06)
- ☑ Bulk update: Report a problem on every picked apartment, one editable line each (2026-09-06)
- ☑ Reports: a Problems subject (apartment, tipus, worker, what, raised, deadline, status, closed, approved by, days late, pictures); "with pictures" prints thumbnails, Excel carries the links (2026-09-06)

## Tipus (built 2026-09-06)
- ☑ Per-workspace list in project settings; dropdown between number and family name; "47 — A2" everywhere the number prints (desktop cell; small line under the number on the phone cell); bulk update sets it; a Tipus filter on the diagram; a Tipus field in reports (2026-09-06)

## The message box and the notes tab (built 2026-09-06)
- ☑ One message box — paperclip · dictation mic at the left · big memo mic / Send — on: general notes, stage notes, task descriptions (quick-add, Tasks page add + edit, bulk add, notebook drop card), the pin note, the problem form, the closing comment, both task-thread composers (2026-09-06)
- ☑ Every recording shows its words under the player, in the screen's language, with Show original — task attachments, office files, board notes, pending memos included (2026-09-06)
- ☑ Notes tab: passed stages crossed off and folded with a count, the current open, later grey; bullets with a small grey sign-off; a worker's memo is a bullet with its words; "Add notes for X" + the box at the bottom; Send puts the note above (2026-09-06)
- ◐ Board sticky notes and boxes keep their inline editor; their memo player shows the words (2026-09-06)
- ☑ The memo player draws a real waveform from the audio, a drag-to-scrub knob and the true length; the words and the sign-off sit inside the card (2026-09-06)
- ☑ The message box grows with the words, the clip and the big mic sit on its bottom line, a grey "sending the recording…" bubble stands while a memo uploads (2026-09-06)
- ☑ A memo or a picture in a thread never prints its filename as the message (2026-09-06)
- ☑ Active jobs widget counts Drive activity: hourly `recent` query (files changed in 30 days with ancestor folders) pinned to the job folder above each file; per-machine cache (2026-09-07)
- ☑ Automatic jobs from Drive: watched intake folders (Job Board project settings), a sweep every 2 hours from the open app and Check now, deterministic ids per folder, tombstones honoured, jobs filed into “New Jobs Came In”, surfaces shared (2026-09-07)
- ☑ AI plan reader on the same OpenAI key (or Anthropic): address, phone, family read from the page image; the draw-a-box picker sends the crop (2026-09-07)
- ☑ Draw-a-box picker: whole sheet fitted, reads only what is inside the box, no trailing punctuation (2026-09-07)
- ☑ Group totals widget lists EVERY group on the board — the four built-ins and every one made by hand or by the Drive sweep — with the same numbers on the board, the dashboard and the TV; a number opens its list (2026-09-07)
- ☑ Group window controls = the board's: the surface frames its content (empty bands close on every side once the hand is off), zoom to the pointer, right-drag lasso, right-button + wheel zoom, arrow-key nudge, the overview draws the group's own positions (2026-09-07)
- ☑ Drive sweep reports its arithmetic per watched folder (folders seen · already jobs · new); the folder listing ceiling raised 1,000 → 5,000 (2026-09-07)
- ☑ Active jobs widget lists every job except Trash (group name on the row); a job copied in by the sweep/import is not activity by itself; the hourly Drive check sends the known job folders, resolves parents breadth-first in parallel under a time budget, and answers partial instead of timing out (2026-09-07)
- ☑ Board speed after the import: stable audio handlers keep every widget memoised through a pan (script 820 → 133 ms/s on the production bundle); the group window culls tiles outside its view (500-job group: 1.1 s → 0.4 s to open, 28 tiles mounted) (2026-09-07)
- ☑ Drive activity noticed within minutes: every 10 minutes, on tab focus, and a refresh link on the Active jobs widget saying when Drive was last checked (2026-09-07)
- ☑ Active jobs, rethought and built as approved (all seven stars): every trace of use — opened, edited, task, message/memo, photo, plan/pin, notebook day, Drive added/changed/removed with who — folded per job; newest first with heat (count + kind squares), Busiest switch, Office/Site/Drive/Notebook chips remembered per widget, 7/30/90 window, booked-this-week tag; every job but Trash, group named (2026-09-07)
- ☑ Galaxy Tab S10 FE checked: four sizes captured (DPR 2 and 1.5, both ways round), 80 screens with no overflow or clipping, the S Pen draws, a palm behind the nib is turned away, the pen arranges the board while a finger pans; the pen tray's Escape no longer closes the studio and the job window (2026-09-08)
- ☑ The Drive folder helper for Windows is ONE file (install-tzviair-helper.cmd): registers per user with no administrator, writes a PowerShell opener that decodes Hebrew paths and finds the localised "Shared drives" folder by itself; the settings panel takes a pasted Explorer path to learn the root and that folder's name; the copied path uses it (2026-09-08)
- ☑ The Drive folder's TITLE is kept on the job (driveFolderName) by EVERY door — pasted link, the drawer, Add Job (at submit, raced or not), the import wizard, the Drive sweep (which also backfills it onto every linked job it lists, in any workspace) — and searched by the header search, the job list, the search tile, Find-a-job, the board's group window and the TV's group window (2026-09-08)
- ☑ The Drive folder helper's copied path defaults to the Hebrew "Shared drives" name (תיקיות אחסון שיתופי, confirmed from the office's own Explorer path, shared drive "TA Zoho Docs") on a Hebrew browser; a pasted path still wins per machine (2026-09-08)
- ☑ HANDOFF.md at the repo root says exactly where the work stands, updated at the end of every round; docs/artifacts keeps every published page as a dated copy plus an index (2026-09-08)
- ☑ The Drive-folder path always carries the shared drive's own name (server: drives.get then the root file; client: the pasted path's name, else "TA Zoho Docs"); the Windows and Mac openers search the drive folders one level down before saying "not on this computer" (2026-09-08)
- ☑ A Chrome shortcut / home-screen icon made from a worker's `/c/<token>` page opens THAT link: the portal swaps the page's manifest for one naming his link as `start_url`, `scope` and `id` (his name on the icon); the office manifest returns when the portal unmounts (2026-09-08)
- ☑ Punch-list pins ride the SHEET (the annotator's `sheetOverlay` slot) in the office pane and the worker's preview; the worker's expanded preview draws the sheet itself (no Drive iframe) (2026-09-08)
- ☑ A worker whose level allows `markUpPlans` gets a Mark up button on the portal plan → the full studio (2026-09-08)
- ☑ New workers start with the building diagrams and every unit (the Contractor level ships with `seeDiagrams` + `seeAllApartments`) (2026-09-08)
- ☑ Board on touch: a finger scrolls a widget's list by hand; a finger never starts a job-row planner drag; the board pans only where nothing scrolls (2026-09-08)
- ☑ Studio: the pen's side button / eraser end rubs out at the eraser's width while held; touch-sized ink and see-through sliders; the version connector draws from the bottom rail on an upright tablet (2026-09-08)
- ☑ ONE search index for every search box (header, tile, job list, board + TV group windows, Find-a-job): folder title split into family/first/number/city, address, phone digits, tipus, unit tokens, pasted Drive/Zoho links, tasks, messages, memo transcripts, pins, files; Hebrew↔English by one sound rule; tiers (starts-with first, sounds-like last); "found in …" under a row; filter words stage:/group:/worker:/ws:/is:problem/is:pending; learned picks per workspace with a "forget" control (2026-09-08)
- ☐ Search ranks by Drive activity — the header search does NOT read Drive activity today; only the Active jobs widget does (decided 2026-09-07: not built until asked)
- ☑ Photo widgets (Latest photos grid/one/wall, the TV's) draw Drive photos through the thumbnail address, never the view link; videos excluded (2026-09-06)
- ☑ A video in a thread is a still with a play button and a full-screen corner (plays in place; Drive-only videos fetched on first press); media grids show a frame under the play button (2026-09-06)
- ☑ Drawer plan pane: a plain click/tap on the sheet opens full screen like the corner button; a drag does not (2026-09-06)
- ☑ Worker's phone in Russian all the way: inline words, dates and day names (date-fns ru/he locales), the notebook's day names, the calendar's month title and weekday row (2026-09-06)
- ☑ Widget: Active jobs — every job with activity in the last N days (default 30), newest first, what and how long ago; count opens the list (2026-09-06)
- ☑ Notes tab: the worker is a small bubble beside CURRENT; "Add notes for X" is the grey placeholder (2026-09-06)
- ☑ Worker's month: Saturday is a slim grey column (2026-09-06)
- ☑ General notes drawn the notes-tab way: bullets with a sign-off, memos and files as note cards in the same list, one Send-mode box at the bottom, hover trash per line; `generalNotes` stays the flat text for search/reports/print (2026-09-06)
- ☑ The problem form's "what is wrong" IS the task thread — sent lines, memos and pictures as bubbles with the composer inside the panel; the first line is the task, the rest its first office messages (2026-09-06)
- ☐ Transcription AND translation run on `OPENAI_API_KEY` alone in Vercel (owner's ask, 2026-09-06); `ANTHROPIC_API_KEY` is optional and used first for translating when present — until the OpenAI key is set, recordings play without words

## Messages, voice and language
- ☑ Voice memo on every note (thread, stage notes, office notes, task attachments, board notes, pins)
- ☑ Every recording transcribed, whoever sent it, with the words under the player; transcript translated like any message (2026-09-03; OpenAI `gpt-4o-transcribe`, needs `OPENAI_API_KEY`)
- ☑ Dictation into the message box in the worker's language (2026-09-03)
- ☑ Search tile and header search take voice (browser speech recognition)

## Office side
- ☑ Notebook add-a-job: a general job's which-building step offers All and ticks several buildings at once; the task carries the set and every label reads it (2026-09-16)
- ☑ The bare domain is the Job Board: `/` switches to the board workspace before drawing; login from the bare address lands there; typed addresses still go where they say (2026-09-16)
- ☑ Task thread is one drawing shared with the phone; office writes from the apartment window
- ☑ Plan markup studio, versions, Drive filing, pins filed to Drive
- ☑ Address and phone read off the plan, draw-a-box override
- ☑ Zoho deals import wizard; Drive folder names fill family names

## Keys and services (Vercel environment)
- ☑ `GOOGLE_SERVICE_ACCOUNT_JSON`, `API_KEY` — Drive, sheets, plan filing
- ☑ `OPENAI_API_KEY` — transcription AND translation (optional; recordings play without words and originals show without it) — *to be added in Vercel*
- ☑ `ANTHROPIC_API_KEY` — optional; when present it does the translating instead (2026-09-06)
- ☑ Firebase Firestore + Storage; optional Realtime Database URL for presence
- Reminder: at most 12 files under `/api` (Vercel Hobby) — a new route folds into an existing file
- ☑ Other workspaces' tasks, units and threads followed LIVE from every screen (portal, board, TV); a foreign unit dropped on the notebook opens the task dialog with its own workspace's stages (2026-09-16)
- ☑ The worker's phone rings: in-app chime + banner on a new task / office message (live), web push through `/sw.js` + `pushSubs` + the `push` branch of /api/geocode when VAPID keys are set (2026-09-16)
- ☑ Delete a message you sent in a task's conversation (office its own, worker his own) (2026-09-16)
- ☑ Message box says "Not sent yet — press Send" while a recording/file waits (2026-09-16)
- ☑ Portal My tasks opens on ALL (2026-09-16)
- ☑ Plan zoom: a zoom you chose survives the stage changing shape (scrollbar, pane narrowing, window nudge); only a fitted sheet re-fits; full screen in/out always fits; the fit is one number scrollbars or not (2026-09-16)
- ☐ `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (+ `VITE_VAPID_PUBLIC_KEY`) — *to be added in Vercel* to turn push on
- ☑ The OFFICE rings: a worker's message or a closed job → chime + card + desktop notification (`OfficeAlerts` in AppLayout), pressing it opens the job on its Tasks tab with the task lit; the portal bell holds office messages too (2026-09-16)
- ☑ "I'm going to work here" is its own permission (`workHere`), asks no stage at the start; the close asks which stages (several) + finished? yes/no → done / half done; an ordinary task never asks a stage at close (2026-09-16)
- ☑ "A job for myself" limited per workspace (`Contractor.selfAssignProjects`, Settings → Workers); the form's WHERE is a search over every allowed job (2026-09-16)
- ☑ Plans: nobody starred → newest-activity sheet shown with a RED star + red "!" bubble between Layers and Plans, never written; the portal shows the same guess (2026-09-16)
- ☑ Board: right-drag PANS (Ctrl+drag lassoes); Arrange includes groups; Equal size row; the selection header says "N groups · N jobs · N notes"; Focus in every node menu; calendar widget month arrows; a unit card deletes without an ask (2026-09-16)
- ☑ Hebrew workspace names (`Project.nameHe`/`shortNameHe`, `projectName()`/`projectShortName()`) in the header, the portal, the notebook dialogs, the TV bar, the calendars (2026-09-16)
- ☑ Add-a-job dialog: the job's current stage named in colour above the labelled from → to pair (2026-09-16)
- ☑ Office desktop-alert permission asked UP FRONT by a header pill (`OfficeAlertsAsk`, once per machine) (2026-09-17)
- ☑ Worker's self-task form: "Now: <stage>" read-only + "What will you be doing here?" stage pills; no stage dropdown (2026-09-17)
- ☑ A general job's task sheet has no Close job: "Choose the apartment you are working in" → that project's building(s) + a hunt banner → "I'm going to work here" files the visit under the general job; no-permission pop-up (2026-09-17)
- ☑ The plan opens BIG on a tablet: an upright sheet on a sideways screen no longer fits to the height — it opens as big as it can while keeping 60% of the page on screen (420 → 700px on the Tab S10 FE); the Fit control still shows the whole page; the phone untouched (2026-09-17)
- ☑ Stage names in Russian (`Stage.nameRu`, `stageNameIn`), typed in project settings; the worker's portal names every stage in his own language (2026-09-17)
- ☒ The markup studio tablet REDESIGN — owner's ruling 2026-09-17: the design and layout are approved as they are; only the scaling was wrong, and that is fixed. The eight starred questions on "The Studio on the Tablet" are not to be built.
- ☑ One media viewer for every file — pictures, films, memos, documents — with full screen, an info panel, Download and Open in Drive; the Drive browser's videos and files are no longer dead tiles (2026-09-17)
- ☑ A file's kind is decided by its NAME (`mediaKindOf`): a `.dwg` that Drive calls `image/vnd.dwg` no longer draws as a broken picture (2026-09-17)
- ☑ Task messages fold away, with a count, remembered per machine (2026-09-17)
- ☑ Crossing the CURRENT stage off moves the job to the next stage automatically (`advanceOnDone`) (2026-09-17)
- ☑ A task the worker starts is stored in English; the worker still reads it in his own language (2026-09-17)
- ☑ The drawer's chip says "Contractor status" (2026-09-17)
- ☒ The Device Gallery is refreshed ON REQUEST ONLY — owner's ruling 2026-09-17, it costs him credits; a UI change no longer triggers a capture run
- ☑ A floor can be RENAMED from the layout studio's right-click menu, and the name shows on the buildings page (`BoardSetting.buildingLayout.floorNames`) (2026-09-17)
- ☑ The four POSITIONS across a building can be named, drawn once as a heading under the roof (2026-09-17)
- ☑ Floors can be ADDED above or below any row and REMOVED when empty; a floor holding an apartment is never removed (2026-09-17)
- ☑ "Merge the whole row into one" is one press — his minus-two case, one apartment and three empty squares (2026-09-17)
- ☑ A merge that would clear another apartment's number and name ASKS first, naming each one (2026-09-17)
- ☑ A square can carry a NAME and no number (the pool, the gym): "Name this square…" on an empty position (2026-09-17)
- ☑ Save shows a BEFORE and AFTER picture of every building with new / changed / gone squares ringed; the written list folds behind its own button (2026-09-17)
- ☑ Notes stopped duplicating the task messages: a stage note is what the WORKER reads on site when that stage comes up, in his own language, on the task sheet and on the map's work sheet; each line says who sees it and can be kept in the office (`StageNoteEntry.officeOnly`) (2026-09-17)
- ☑ THE SET MODEL (owner's "Bubbles, Not Stages" plan, 16 locked answers, "build it" 2026-09-22): an apartment carries a SET of work stages with a state each — to do · booked · doing · half done · problem · done · not needed — instead of standing at one point on a line; on screen the word stays STAGE (2026-09-22)
- ☑ Ready to start / Job completed are MARKERS (`Stage.kind`), never work; a work/marker switch on every line in Settings → Stages; kinds seeded once by name (2026-09-22)
- ☑ The apartment window's stage board: grouped bubbles, tap walks a stage on, right-click half done, × not needed (office only), "+ add a stage" from the list or a CUSTOM one for this apartment alone (`Stage.custom` + `onApartments`, hidden elsewhere until widened) (2026-09-22)
- ☑ The headline (`currentStageId`) is DERIVED: happening now, else half done, else next to do; all done → the closing marker; re-written by `applyMarks` on every change; a hand-set headline is translated into marks (2026-09-22)
- ☑ The buildings page cell and the job tile draw the segmented strip and the fraction (2026-09-22)
- ☑ One task picker, the apartment's own stages, one or several (`ContractorAssignment.stageIds`); closing ticks them all done; the from→to pair is gone from every form (2026-09-22)
- ☑ The worker's start asks "What are you doing here? select one or multiple" (marks DOING); the close asks did-you-finish-everything → which-didn't-you-finish → three pictures PER finished stage (`ContractorPhoto.stageId`); unfinished → half done, cleared by the office only (2026-09-22)
- ☑ The four doors: tipus sets (`BoardSetting.tipusStages`), the window's + add, the bulk bar's add/remove a stage, a line's "on every apartment" switch (2026-09-22)
- ☑ Reports: Stages done of / Done stages / Stages still to do; Analytics: work finished per stage; search: needs: doing: done:; the printed job sheet's tick list (2026-09-22)
- ☑ One-time migration (`migrateStageSets`, settle-first from AppLayout): passed → done, the current stage → to do, `bubbles: true`; idempotent (2026-09-22)
- ☑ A history entry with no name never crashes a page: every reader of `ActivityLog.userName` falls back to “Someone”, and `addActivityLog` always writes a name (2026-09-22)
- ☑ Tasks page: the apartment name and the words on a task row open the apartment window on that task (`data-open-task`, the taskFocus hand-over) (2026-09-22)
- ☑ A task closed AFTER its last day gains the closing day (`closeDayFields` in taskDays.ts, on both close paths) — drawn crossed off on the day it happened (2026-09-22)
- ☑ Cloud reads are capped: activity log and note versions load the newest 500 (`fsGetAllRecent`/`fsListenRecent`); a refused listener shows "Cloud not answering" in the header (2026-09-22)
- ✎ Wolfson stages split into separate bubbles on a grey→yellow→orange→green ramp — previewed inline, awaiting the owner's go and the four live names (2026-09-22)
