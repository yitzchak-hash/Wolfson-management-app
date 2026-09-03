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
- ☑ Messages and task text read in the worker's language, Show original one tap away (2026-09-03; needs `ANTHROPIC_API_KEY`)
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

## Decided 2026-09-03, plan page pending (build only on "build it")
- ☐ A PROBLEM on an apartment: "Report a problem" in the stage picker → assign a worker, notes with the dictation mic + paperclip + big memo mic (transcribed), pictures, "photos required to close?" — the apartment turns red with a big exclamation, its stage reads Problem while the real stage is kept underneath; bulk update can raise problems on many units; a deadline instead of a day, shown every day until closed and urgent past it; worker closes → "waiting for approval" (softer red); the office approves → "Problem solved" with its pictures, the apartment returns to its stage; a problem report in Reports, with pictures
- ☐ Tipus (טיפוס) — an apartment TYPE from a per-project list (A1, A2, B1, C3…), optional, shown as "47 — A2" beside the number and before the family name; set in the drawer and in bulk update
- ☐ Voice memos everywhere show the recording AND the words under it, in the screen's language — every note, task and input field takes the WhatsApp-style box
- ☐ Apartment notes: done stages crossed off, the current stage open, "Add notes for this stage", saved notes as bullet points above the box (the box at the bottom); the worker/date sign-off small and quiet

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
- ☑ `ANTHROPIC_API_KEY` — translation (optional; originals show without it) — *to be added*
- ☑ `OPENAI_API_KEY` — transcription (optional; recordings play without words) — *to be added in Vercel*
- ☑ Firebase Firestore + Storage; optional Realtime Database URL for presence
- Reminder: at most 12 files under `/api` (Vercel Hobby) — a new route folds into an existing file
