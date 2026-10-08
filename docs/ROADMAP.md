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
- ☑ The Vercel keys: push (server pair + the public key in the bundle), the
  AI key, the service account and the API key all report set (checked on the
  live site, 2026-10-05).
- ☑ 2026-10-05 (the first screen recording): notebook bars say where and
  done is a green tag; pictures slide in a viewer; Drive films stream;
  squares count their own stages; the activity log in plain words with the
  Job Board as the centre; move a task to the right apartment; the plan
  reader shows its source; Active jobs draws 40 rows (the Chrome freeze).
- ☑ 2026-10-06 (his answers): the day story on the Activity page (one card
  per person per day, no flags); Drilling after Sold/Start and ticked
  wherever Piping is done (and from now on with it); A3 12 Access Panels
  off; the A1 floor-10 placeholder gone; "Skipped a stage" retired; the
  deleted-records list keeps every delete again; the header fits at every
  width.
- ☑ 2026-10-08 (the second screen recording): Sold/Start follows the work;
  a building unit shows its last stage done; the stage panel is one ordered
  line with arrows; the plan reader runs on Opus 5.5 at high effort and reads
  the title block; a worker moves his own mistaken work and the old
  apartment goes back to how it was that morning; the "Who did what"
  widget; the worker's phone, notebook, calendars, Tasks page, window and
  board fixes (see `docs/feedback/2026-10-08-115349.md`).

## Next (in order)
- ☐ Watch on production: the foreign photo listener (no Firebase in the
  container), the plan pane's Windows scrollbar re-fit, the Leads folder
  discovery, TikTok's player protocol end to end.
- ☐ Watch on production: the plan reader on real office sheets — the chain is
  live (health lists `planModels`; a made-up title block read right by
  gpt-6.1-sol in 12s on 2026-10-08).
- ✎ The tablet studio layout (the "Studio on the Tablet" plan page: one
  bar, 56px rail, docked tray) — build on Yitzchak's numbers.
- ✎ OCR for scanned plans (tesseract) when scans matter.
- ✎ Search ranking by Drive activity (decided not to build until asked).

## Standing pre-existing reds in the harnesses (not features)
`planphone.mjs` stale locator · `round39-probe` asserts the deleted "I did
work here" filter · `boardsize.mjs` left-edge auto-pan · `gapboard.mjs` ·
`round22.mjs` (Goals fixture intercepts the week plus) · `notebookflip.mjs`
(2: it asserts an August month label and a 12px eye) · `round27.mjs` search-to-notebook drag · `round23.mjs` unit-card
timeout · `round33.mjs` (a `data-map-project` hook removed 09-03) ·
`round40-probe` "a passed stage is crossed off" (Ready to start is a marker
under the set model). `round28.mjs` is green again (10-08).
