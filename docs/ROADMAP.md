# ROADMAP — the slices, in order

_Read before every task; tick a slice when it ships; add one when Yitzchak
asks for it. ☑ done · ☐ next · ✎ awaiting Yitzchak's word. (Standing order
6, 2026-09-23.) The full one-line-per-feature list is `docs/CRM-CHECKLIST.md`._

## Shipped (the shape of the app today)
- ☑ Three workspaces, one login, workspace colours, home = the Job Board.
- ☑ The Job Board canvas: tiles, groups (bins), widgets (74 after the
  dedupe), notes, drawing, undo/redo, layouts, named boards, culling for
  a 3,500-job board, live presence, the TV frame.
- ☑ The weekly notebook: bars drawn FROM the tasks, multi-day tasks,
  drop/quick-assign doors, strips, projections, foreign workspaces live.
- ☑ Stages as a SET per apartment ("bubbles"): marks, headline, per-stage
  pictures at close, the Wolfson stage split, custom stages, tipus sets.
- ☑ Plans: Drive browser, star = the contractor's plan, viewer with pins,
  the markup studio (nine pens, shapes, versions sealed to Drive), the
  tabs, download/print, the address/phone reader (local + AI).
- ☑ Tasks and threads: one MessageBox everywhere, voice memos with
  waveform + transcript, translation, problems (red), site notes.
- ☑ The worker's phone: every workspace's tasks, calendar, map by logo,
  "I'm going to work here", closing screen with 3 pictures per stage,
  push notifications, Russian.
- ☑ The wall: real job window, goals editable, per-panel size/region,
  refresh that keeps full screen, the File Tray, the tap-in board.
- ☑ Drive: sweep of intake folders → new jobs every 2h, folder titles as
  names, activity feed, the desktop-folder helper, auto sharing.
- ☑ The read diet: one listener per collection, delta foreign sync,
  cleanup of cross-workspace records; project on Blaze.
- ☑ 2026-09-23: "Live from site" — every workspace's photos and films,
  live, tappable on the TV.

## Next (in order)
- ☐ **Cap the Active-jobs widget's drawn rows** (~40 that fit the box +
  "show all N" into the list popup). Cause of the Chrome freezes: three
  copies × ~1,200 rows ≈ 77,000 DOM nodes repainted on every scroll
  (measured 2026-09-23). Awaiting the manager's go.
- ☐ Set the Vercel keys still missing: `VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY` / `VITE_VAPID_PUBLIC_KEY` (push), confirm
  `OPENAI_API_KEY` (transcription, translation, plan reading).
- ☐ Watch on production: the foreign photo listener (no Firebase in the
  container), the plan pane's Windows scrollbar re-fit, the Leads folder
  discovery, TikTok's player protocol end to end.
- ✎ The tablet studio layout (the "Studio on the Tablet" plan page: one
  bar, 56px rail, docked tray) — build on Yitzchak's numbers.
- ✎ OCR for scanned plans (tesseract) when scans matter.
- ✎ Search ranking by Drive activity (decided not to build until asked).

## Standing pre-existing reds in the harnesses (not features)
`planphone.mjs` stale locator · `round39-probe` asserts the deleted "I did
work here" filter · `boardsize.mjs` left-edge auto-pan · `gapboard.mjs` ·
`round22.mjs` (Goals fixture intercepts the week plus) · `stripsrow-probe`
(2) · `round28.mjs` group-window section.
