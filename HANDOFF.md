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
