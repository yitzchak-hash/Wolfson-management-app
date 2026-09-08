# Active jobs, rethought — design for approval (2026-09-07)

Owner's brief: "it should show the last jobs that were actually being used —
whether on the job board, whether in the Drive, whether someone's dealing
with the job. Done in a very smart way."

The plan page: the "Active Jobs, Rethought" artifact. This file is the same
plan in words. **Approved 2026-09-07 ("all yes") and built the same day** — `src/data/activityTouches.ts`, the widget in `insightWidgets.tsx`, `scratchpad/activitytouches-test.mjs`.

## The question the widget answers
Which jobs is the office actually working on right now? Every trace of use
counts, wherever it happens. Arranging the board never counts (tidying is
not working), and a job the sweep or the import merely copied in is not
activity by itself — its folder's real changes are.

## A touch
`{ jobId, at, who, kind, what }`. Kinds and their sources, all already
recorded by the app:

| kind | source | who |
|---|---|---|
| opened | history entries `actionType: 'opened'` (one per person per job per hour) | the person |
| edited | `contentUpdatedAt`, history field changes, stage moves, notes | the editor |
| task | task created / closed; problem raised / closed / approved | office or worker |
| message | task-thread messages, voice memos | the author |
| photo | pictures from site | the worker |
| plan | markup saved (planAnnotations), pin placed / resolved (planPins) | the author |
| notebook | a job placed or moved in a weekly notebook square | the planner (from the notebook's own record) |
| drive | a file added, changed or **removed** inside the job's Drive folder | the Google account that changed it |

## Ranking — approach A (recommended)
Last touch first. The newest touch decides the order, so the job somebody
just used is always on top. Heat is still visible: the touch count inside
the window and one small square per kind present. A "Busiest" switch in
the sort menu ranks by count with a decay instead.

Rejected: B (busiest first — the file added a minute ago can sit under
three busier jobs, the exact case the owner tested); C (a day-by-day feed —
answers "what happened", not "which jobs").

## The row
Stage colour dot · name · group chip (when in a group) — then the last
touch as "who · what · when" — then, right-aligned, the kind squares and
"N touches". Optional chip when a worker is booked on the job this week
("Yossi · Tue"), so a job in hand reads as in hand.

Chips under the title: All · Office · Site · Drive · Notebook. Sort:
Newest / Busiest. Window: 7 · 30 · 90 days in the pencil (default 30).
The number opens the list; a row opens the job; the "Drive · 3 min ago ↻"
footer stays.

## Decisions to lock (★ = recommendation)
1. ★ Opening a job counts (hourly-throttled) — or only changes count.
2. ★ Drive removals count, with who removed — or only added/changed.
3. ★ Last touch first + Busiest switch — or busiest always.
4. ★ Every job in the workspace, groups labelled, Trash never — or open board only.
5. ★ Filter chips remembered per widget — or one list.
6. ★ 30-day default with 7/30/90 — or fixed 30.
7. ★ "Booked this week" chip — or leave it out.

## Mechanics
- `src/data/activityTouches.ts` — PURE: `touchesOf(sources, window) →
  Touch[]` and `foldByJob(touches) → Map<jobId, {last, count, kinds}>`.
  Tested offline with hand-worked fixtures. No store, no clock — `now` is
  passed in.
- The widget memoises the fold on the source arrays, so it runs when data
  changes, never per frame (the board's memo rule).
- Drive: `api/drive-files.js` `recent` adds `lastModifyingUser(displayName)`
  to the listed fields and a second, small query for `trashed = true` files
  modified in the window (their `modifiedTime` is the removal). The client
  keeps `{at, name, who, removed}` per job folder.
- Notebook touches come from planner entries' own timestamps where they
  exist; entries without one are dated by the week they sit in.
- Nothing new is stored. No new state key; the backup audit is untouched.

## Not in scope
Cross-workspace rows (a workspace's widget shows that workspace), search
ranking by activity (a separate decision), a notification when a job
becomes active.
