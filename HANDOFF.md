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

## Where things stand (2026-09-08, second round of the day)
Last commits, newest first (see `git log`):
- **This round** (opened by the owner typing only "HANDOFF.md" — read it and
  continue): the Drive folder title finished as the search research's item
  #1. The previous handoff CLAIMED the sweep backfilled `driveFolderName`;
  it did not (the store action had no caller). Now: Add Job writes the title
  at submit (and the raced heal writes it after), the import wizard reads the
  title for every linked row, the Drive sweep writes it on minted jobs AND
  backfills it onto every linked job it lists in any workspace, and
  Find-a-job + the TV group window read it. Probe:
  `scratchpad/foldertitle-probe.mjs` (10), `autojobs-probe.mjs` (+2).
  What's New `2026-12-18`. Nothing else changed.
- Search research (`docs/research/SEARCH.md`): item #1 done; #2–#10 (one
  shared MiniSearch index, the unindexed fields — tipus, attachment names,
  memo transcripts, pins — one Hebrew normaliser, ranking, "why it matched")
  are NOT built and are a real project (L + several M). Read that file
  before touching search.
- Previous round: `HANDOFF.md` + `docs/artifacts/`; the Windows Drive-folder
  helper as ONE Hebrew-safe installer (`src/data/tzviairHelper.ts`,
  `parsePastedPath`, `drive_shared_name`); `Apartment.driveFolderName`
  introduced and searched by the header search, job list, search tile,
  board group window.
- Before that: Galaxy Tab S10 FE gallery + S Pen probe; Active jobs rebuilt
  as approved; board speed after the import; group totals / group windows;
  the Drive sweep reporting seen/linked/new.

## What the owner last asked (his exact wants)
1. **A handoff file kept updated after every response** — DONE (this file,
   `docs/artifacts/`, the rule in CLAUDE.md).
2. **The Drive folder helper button** (Windows, Hebrew computers) — rebuilt
   last round; NOT yet tried on a real Hebrew Windows. **He said he will send
   two example file paths from a job** — STILL WAITING. When they arrive,
   check them against `parsePastedPath` and `composeLocalPath`
   (`scratchpad/drivehelper-test.mjs` has the cases) and confirm the Hebrew
   name of the "Shared drives" folder.
3. **Search**: a word only in a job's Drive folder TITLE did not find the
   job — fixed last round at the header search; this round every door stores
   the title and every search site reads it. The research file is
   `docs/research/SEARCH.md`.

## Open threads / things to verify on production
- The sweep's backfill runs on its two-hourly timer (or the card's Run now)
  and needs `VITE_DRIVE_API_KEY`; after the first sweep on production the
  linked jobs should carry `driveFolderName` — check one in the drawer's
  Drive row (it shows the folder's title) or search a first name.
- The Drive helper: the office should press Get the helper, double-click the
  one file, tick the box, press the folder button. SmartScreen: More info →
  Run anyway.
- The Active jobs widget's Drive rows depend on Vercel env
  `VITE_DRIVE_API_KEY` and `api/drive-files.js` (`maxDuration` 30).
- Keys (Vercel only, never in the app): `OPENAI_API_KEY` (transcription,
  translation, the AI plan reader), optional `ANTHROPIC_API_KEY`,
  `GOOGLE_SERVICE_ACCOUNT_JSON`, `API_KEY` = `VITE_DRIVE_API_KEY`.
- Standing pre-existing red harnesses (not this round's): `boardsize.mjs`
  (left-edge auto-pan), `gapboard.mjs` (a group under the board's chrome),
  `stripsrow-probe` (2 checks), `mobdiagram.mjs` (stale assertion),
  `round28.mjs` group-window section (dblclick on the Done bin times out;
  its Add Job section passes).
- Decided, not built: search ranking by Drive activity; SEARCH.md #2–#10.
- Container notes: `npm ci` then `npm install --no-save playwright@1.54.1`
  (also `@pdf-lib/fontkit` if a plan-reader probe needs it — installing one
  ad-hoc package prunes the other, install both together).

## The last reply the owner saw (so the next one continues it)
The previous reply (the helper round) asked him to send the two example
paths and to try the helper on one Hebrew PC. He answered with just
"HANDOFF.md". This round's reply says: read the handoff, everything was
pushed and production matched; the one loose end found was that the folder
title was NOT being backfilled despite the handoff saying so, and now every
door stores it and every search reads it — a first name or folder number
finds the job in Find-a-job and on the TV's group windows too; the linked
jobs fill in by themselves on the next Drive check; still waiting on the two
paths and the helper try-out; the bigger search rebuild (one index, more
fields, Hebrew, ranking) is written up and waits for his word.
