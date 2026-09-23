# BRIEF — what this app is

_Read before every task. Update when the answer changes. (Standing order 6, 2026-09-23.)_

## What it is
The TzviAir Job Management Platform: the internal job board and CRM of
TzviAir, an air-conditioning (HVAC) installer in Israel. One web app,
bilingual English/Hebrew (Russian for workers), deployed on Vercel at
https://wolfson-management-app.vercel.app, data in Firebase (Firestore for
records, Storage and Google Drive for files).

## Who it is for
- **The office** (Yitzchak the owner, Esther the secretary, the managers) on
  PCs and two Galaxy Tab S10 FE tablets: the Job Board, the two building
  workspaces, tasks, the weekly notebook, plans, reports, settings.
- **The workers** (installers, contractors) on their phones: the portal at
  `/c/<token>` — their tasks, the building map, the plan, messages with the
  office, pictures at close.
- **The wall**: a touchscreen TV in the office at `/tv`, always on, showing
  the board and its widgets, the buildings, the dashboard and the goals.

## The three workspaces
- **Wolfson** (W Residence, towers A1/A2/A3, 168 apartments + named slots).
- **Netiv Neve Shamir** (B1/B2, 72 apartments).
- **The Job Board** (`general`): every other client as a free tile on a
  canvas — ~3,500 jobs, most filed in groups (Done, Trash, Archive, Ready,
  New Jobs Came In), fed by the CRM import and the Drive sweep.

## The one job it must do well
**Everyone sees the same truth of every job the second it changes, and the
next action is one tap away.** A worker's picture, a closed stage, a task
moved on the notebook — on the office PCs, the phones and the wall within
seconds, with the plan, the messages and the history one tap from the job.
Everything else (widgets, themes, drawing tools) serves that.

## The rules that never move
- **No data loss, ever.** Nothing is purged; deletes are tombstoned;
  every state key is in persist + export + import (the backup audit).
- One production branch (`claude/blissful-cray-spTFY`); at most 12 files
  under `/api` (Vercel Hobby); secrets only in Vercel env vars.
- Stored records are written in ENGLISH; the reader's language is a
  rendering decision (`Translated`).
- The wall is a place people work (it opens the real job window and edits
  goals); the worker's portal never switches workspace on a stray tap.
- `isCountableApartment` is the one counting rule; `binKeyOf` the one group
  rule; `photoSrcOf` the one photo-address rule; `mediaKindOf` the one
  file-kind rule.

## Where the long memory is
`CLAUDE.md` (every rule and trap, by round), `HANDOFF.md` (where the work
stands), `docs/CRM-CHECKLIST.md` (every shipped feature, one line each),
`docs/ROADMAP.md` (what is next), `docs/DECISIONS.md` (what Yitzchak
decided and why).
