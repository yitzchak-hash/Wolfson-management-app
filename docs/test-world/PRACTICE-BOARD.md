# The test world on the PRACTICE job board

`world.json` (beside this file) loaded into the practice board (`wolfson-practice`), session #170, 2026-11-10.
The live board never has it: the button exists only in the practice build, and the code refuses any Firestore
project but `wolfson-practice` (or the local emulator under that name).

## How it is run

Practice app → Settings (the gear, app settings) → **Backups** → at the bottom, **Test world (practice only)**
(folded). Two buttons:

- **Load test world.** With the tick on (default), it first clears what the practice seed made up, keeping a
  copy of every record it deletes or changes in `testWorldSaved`. Then it writes the world, every record marked
  `testWorld: true`, and adds two workspaces. The page reloads when it's done.
- **Remove test world.** Deletes every `testWorld: true` record, plus anything people made on test records while
  testing (a task on a test flat, a note, a photo, activity), takes the two workspaces out of the settings, puts
  back every saved copy exactly, then deletes the copies. The page reloads.

Code: `src/data/testWorld.ts` (world.json → records, and what to clear), `src/data/testWorldRun.ts` (reads and
writes, practice only), `src/components/settings/TestWorldCard.tsx` (the card).

## What goes in

| world.json | on the board |
|---|---|
| `projects` (10 towers, 101 units) | two workspaces, **Towers 1-5** (`tw-towers-a`) and **Towers 6-10** (`tw-towers-b`), a building per tower (`P01`…`P10`), flats floor by floor. A sold flat shows the buyer's family name and made-up phone |
| won project job (10015-10019) | its job number on every flat of the tower, the stage on every flat, tasks for the whole building |
| won upgrade (10025-10029) | its job number on its own flat, marked Upgraded (shinui), its own stage and tasks |
| private / renovation / maintenance / planning jobs (14) | tiles on the Job Board with job number, customer, address (+ flat, floor), phone, stage |
| `board.tasks` | tasks on the calendar / weekly notebook / worker's phone, for the same person; `in_progress` = two days; `done` = finished |
| `board.tasks[].problem` | a problem task (open, or solved if the task is done) with the worker's message and the office's answer |
| `board.workers` sub-* | the 4 subcontractors as workers of their own ("(test)" in the name), one task each on their jobs |
| `deals[].photos` | 2 per job, drawn placeholders ("TEST PHOTO · job number · caption"); the world's Drive ids are fake |
| Job completed | an inspection after the last stage, with a placeholder picture |

Board stages: Quote sent → Ready to start (buildings) / Quote sent (Job Board); Piping → Piping; Units installed →
Wall Units (buildings) / Units installed (Job Board); Job completed → Job completed.

**Staff slots** are the people the practice board already has, by role: tech1-tech4 = the four oldest active AC
workers (Sergei Volkov, Dmitri Orlov, Alexei Petrov, Igor Kuznetsov on the seeded practice board); office = the
Coordinator, owner/admin = the Admin, sales/site = the Project Managers. The board has no phone field on a worker,
so no worker phones are written.

**The CRM's customer id** is not written (the CRM gives its own ids when it seeds); "Open in CRM" goes by job number.

## What the clear touches

Only what the practice seed (`scripts/practice/world.ts`) made: its Job Board jobs (`G-prac-…`), tasks,
messages, stage notes, plan pins and markups, activity, stage suggestions, time punches; the made-up names, phones,
stages, notes and job numbers on Wolfson / Netiv / Heights flats (the flats stay, empty); the notebook's squares.
Workers, users, stages, settings, widgets and everything people made are kept. Anything with a phone or email
outside the made-up ranges (`050-000-…`, `@practice.invalid`, `@test.tzviair.local`) is **kept and listed** on the
card.

## Proof (local Firestore emulator, 2026-11-10)

The emulator was filled with the practice seed (`FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node
scripts/practice-seed.mjs`, the same seed the practice database was made from) plus one record given a
real-looking phone. Then the practice app (dev server, `--mode emulator`, `.env.emulator.local` not committed)
was opened, a fingerprint of every collection taken, the card pressed: Load, then Remove.

- Load: 254 records written; 2,585 old practice records saved and cleared; the real-looking one kept and listed.
- Checked at 1440 and 390: the Job Board (14 jobs, numbers, stages, problem flags), the weekly notebook, the
  calendar (81 tasks), Tasks, both tower workspaces, a flat drawer (job number from CRM, problem banner, tasks,
  photos, inspection on a finished upgrade), the TV tabs, the worker's portal (in his language, problems first).
- Remove: every data collection identical to the fingerprint before the load. Different only: the Job Board's
  deletion list (keeps the test ids, so other devices drop their copies; on purpose) and two things the app itself
  saves when opened (the TV's screen size, a person's preferences).

**Not proven:** it has not run against the real practice database (no practice credentials in that session).

**Found, not fixed (the TV, not the test world):** on the TV, a building workspace wider than the screen is drawn
shifted right and down. Wolfson does it too at 1440 (cut off on the right); the five-tower workspaces end up off
the screen entirely. The TV's own code (`TvPresentationPage.tsx`, the building FIT block), for a separate round.
