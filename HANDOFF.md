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
  `claude/ui-widget-fixes-fosqdk`; both must end each round at the same commit.
- Three workspaces: Wolfson (buildings), Netiv (buildings), the Job Board
  (`general`, free canvas, ~1,650 jobs after the CRM import and the Drive sweep).

## How a round is run (the ritual)
1. Implement. 2. Playwright probes in `scratchpad/` (`node scratchpad/<name>.mjs`;
   dev server on 5173, a keyed one on 5174 with `VITE_DRIVE_API_KEY=testkey`;
   Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).
3. `npx tsc --noEmit -p .` and `npx vite build`. 4. The audits:
   `node scratchpad/loopaudit.mjs`, `backupaudit.mjs`, `navaudit.mjs`, `apilimit.mjs`.
5. A What's New entry (`src/data/whatsNew.tsx`, dates run AHEAD of the clock;
   newest is `2026-12-17` — the next entry must be a later date). 6. A CLAUDE.md
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

## Where things stand (2026-09-08)
Last commits, newest first (see `git log`):
- **This round**: the Windows Drive-folder helper rebuilt as ONE installer
  (`src/data/tzviairHelper.ts`, `DriveDesktopPath.tsx`, the settings card),
  Hebrew-safe PowerShell opener, paste-a-path detector (`parsePastedPath`,
  `drive_shared_name`); `Apartment.driveFolderName` kept and searched
  (header search, job list, search tile; sweep backfills); `HANDOFF.md`,
  `docs/artifacts/`. A background agent is writing `docs/research/SEARCH.md`
  (how to make the search better) — if it is absent, that research was lost
  and should be redone.
- Galaxy Tab S10 FE gallery + S Pen probe; the pen tray's Escape fixed.
- Active jobs widget rebuilt as approved (`src/data/activityTouches.ts`).
- Board speed after the import (stable audio handlers, group-window culling);
  Drive check every 10 minutes with a refresh link.
- Group totals list every group; group windows frame their content and take
  the board's gestures; Drive sweep reports seen/linked/new.

## What the owner last asked (his exact wants)
1. **A handoff file kept updated after every response** so any AI can continue
   with no lost context, and every artifact saved in the repo in order as
   versions, never overwritten — DONE this round (this file, `docs/artifacts/`).
2. **The Drive folder helper button** (Windows, Hebrew computers): sometimes
   downloaded a .reg, sometimes a .cmd; the .cmd said the path is not in G:
   although it is; pasting the copied path into Explorer opened nothing.
   Rebuilt this round (see above). **He said he will send two example file
   paths from a job** — when they arrive, check them against `parsePastedPath`
   and `composeLocalPath` (scratchpad/drivehelper-test.mjs has the cases) and
   confirm the Hebrew name of the "Shared drives" folder.
3. **Search**: a word that was only in a job's Drive folder TITLE did not find
   the job. Fixed by storing and indexing `driveFolderName`; he also asked for
   an agent to research how to make search better and to keep that as a
   reusable file → `docs/research/SEARCH.md`.

## Open threads / things to verify on production
- The Drive helper has NOT been run on a real Hebrew Windows yet — the office
  should: press Get the helper, double-click the one file, tick the box, press
  the folder button. If Windows SmartScreen objects: More info → Run anyway.
- The Active jobs widget's Drive rows depend on Vercel env `VITE_DRIVE_API_KEY`
  and the function `api/drive-files.js` (`maxDuration` 30 in vercel.json).
- Keys (Vercel only, never in the app): `OPENAI_API_KEY` (transcription,
  translation, the AI plan reader), optional `ANTHROPIC_API_KEY`,
  `GOOGLE_SERVICE_ACCOUNT_JSON`, `API_KEY` = `VITE_DRIVE_API_KEY`.
- Standing pre-existing red harnesses (not this round's): `boardsize.mjs`
  (left-edge auto-pan), `gapboard.mjs` (a group under the board's chrome),
  `stripsrow-probe` (2 checks), `mobdiagram.mjs` (stale assertion).
- Decided, not built: search ranking by Drive activity; the Add Job modal
  storing the folder title at submit (only paste/drawer/sweep store it now).

## The last reply the owner saw (so the next one continues it)
Summary of the previous assistant's final message: the Tab S10 FE page was
published with 80 clean screens and 21 pen checks; the pen tray's Escape bug
was fixed and pushed. Then the owner wrote the three asks above. The reply to
THAT (this round) says: the handoff file and artifacts folder exist and the
rule is in CLAUDE.md; the helper is one file now and why the old one failed
(second download blocked; ASCII-only decoding and OEM code page broke Hebrew
paths; ProgramData/HKCR needed admin); the folder title is now searched; the
search research file is in `docs/research/SEARCH.md`; and it asks him to send
the two example paths and to try the helper on one Hebrew PC.
