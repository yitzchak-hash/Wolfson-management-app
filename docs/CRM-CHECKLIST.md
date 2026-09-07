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
- ☑ Weekly notebook: drop a job on a person's day, day cards, move/copy/off asks, quick-assign box
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
