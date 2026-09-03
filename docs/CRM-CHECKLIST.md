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
- ☐ Logo centred and larger; bell and gear on the right; print button gone; language inside the gear (approved 2026-09-03)
- ☐ Workspace chip row gone; every workspace's tasks in one list, each card tagged with its workspace (approved 2026-09-03)
- ☐ My Tasks opens on Today (approved 2026-09-03)
- ☐ Calendar opens Monthly and the month grid fills the phone (approved 2026-09-03)
- ☐ Building Map: full-screen project chooser when more than one map is allowed; straight in when one (approved 2026-09-03)
- ☐ Building Map: one bar — project name button (opens a sheet), A1·A2·A3 segmented control; day filters, hint and "0 yours" gone; scrollbars hidden (approved 2026-09-03)
- ☐ Building outline around the diagram, same silhouette for every building; bottom fades to show there is more (approved 2026-09-03)
- ☐ Task messages: renamed, grey panel wraps the composer, "Your message" with the dictation mic at its left, paperclip inline, big WhatsApp mic that becomes Send when there is text (approved 2026-09-03)
- ☐ "What did you do?" lists only the stages the worker may report; Ready to start never offered (approved 2026-09-03)
- ☑ Worker can add punch-list pins from the phone, with voice memo and files (2026-08-31)
- ☑ Close job needs 3 pictures unless the worker is marked photos-optional
- ☑ Multi-day tasks show every day; finishing early asks in the worker's language
- ☑ Notification bell with per-worker scope

## Permissions per worker (Settings → Workers)
- ☑ Level + fifteen switches; language; text size; photos optional; notification scope
- ☐ Building maps he may open (approved 2026-09-03)
- ☐ Stages he can report, per workspace (approved 2026-09-03)

## Stage reports (the "I did work here" flow)
- ☑ Yes → stage report task → closing screen; Not yet → half-done clock + note under an open report task
- ☐ Photos attach to the reported stage only; earlier stages cross off without being written to (approved 2026-09-03)
- ☐ "Not yet" moves the apartment to that stage when it is further along (approved 2026-09-03)
- ☐ A report on a stage already passed is a record, never a move backwards (approved 2026-09-03)

## Tasks and scheduling
- ☑ Multi-day tasks (all days on the task, Friday per stretch, non-consecutive stretches)
- ☑ Weekly notebook: drop a job on a person's day, day cards, move/copy/off asks, quick-assign box
- ☐ General jobs — a task for a workspace, not an apartment: "General job" checkbox + workspace select on every task form; notebook card reads "Wolfson"; phone card reads "Work at Wolfson" / עבודה בבניינים של וולפסון / Работа в Wolfson; "Is this part of…?" on a stage report; visits list on the task (revised 2026-09-03, awaiting "build it")
- ✎ General job: can the office close it with no visits? (recommended: yes)
- ✎ General job: ask "Is this part of…?" every time, or file silently? (recommended: ask, Yes preselected)

## Messages, voice and language
- ☑ Voice memo on every note (thread, stage notes, office notes, task attachments, board notes, pins)
- ☐ Every recording transcribed, whoever sent it, with the words under the player; transcript translated like any message (approved 2026-09-03; OpenAI `gpt-4o-transcribe`, needs `OPENAI_API_KEY`)
- ☐ Dictation into the message box in the worker's language (approved 2026-09-03)
- ☑ Search tile and header search take voice (browser speech recognition)

## Office side
- ☑ Task thread is one drawing shared with the phone; office writes from the apartment window
- ☑ Plan markup studio, versions, Drive filing, pins filed to Drive
- ☑ Address and phone read off the plan, draw-a-box override
- ☑ Zoho deals import wizard; Drive folder names fill family names

## Keys and services (Vercel environment)
- ☑ `GOOGLE_SERVICE_ACCOUNT_JSON`, `API_KEY` — Drive, sheets, plan filing
- ☑ `ANTHROPIC_API_KEY` — translation (optional; originals show without it) — *to be added*
- ☐ `OPENAI_API_KEY` — transcription (optional; recordings play without words) — *to be added*
- ☑ Firebase Firestore + Storage; optional Realtime Database URL for presence
- Reminder: at most 12 files under `/api` (Vercel Hobby) — a new route folds into an existing file
