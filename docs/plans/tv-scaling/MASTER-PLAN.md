# The TV Size Plan — SEALED · 2026-09-08

Where any older note disagrees with this file, this file wins; older records
are kept as history, never rewritten.

Sittings: [sitting-1.html](./sitting-1.html) (the engine and its dials) ·
[the seal](./seal.html). Diagnosis and design detail:
[../../superpowers/specs/2026-09-08-tv-display-scaling-design.md](../../superpowers/specs/2026-09-08-tv-display-scaling-design.md).

## Every pick, locked

1. **True zoom.** 160% means everything on that TV is genuinely 1.6× — cards,
   graphs, words. Fewer cards fit per row and the grid reflows.
2. **One pipeline, all views.** Board, building diagram and dashboard all ride
   the same single number, applied once at the view's content root as layout
   zoom. Every hidden `min(scale, cap)` multiplier inside the views is removed.
3. **The TV answers you.** When a panel's saved size changes (from the office
   or its own buttons), the wall briefly shows "Display size 90% → 160%".
4. **The red button walks.** Steps with a re-measure between presses, never a
   blind leap.
5. **The dial wins over a chosen slice.** On a panel showing a region, turning
   the size up grows the picture past the slice's edges (the slice is the
   framing at 100%).
6. **The shared size is the newcomer's default.** A panel with no saved size
   of its own starts from the shared slider; the first per-panel change takes
   over.
7. **The ceiling is 300%**, everywhere the number can be set.
8. **One press ≤ +25%** of the current size, toward the measured need.
9. **The top bar keeps its own dial** (`tvTouchScale`); the size dial moves
   only the content below it.
10. **A test pattern button on the wall**: one press draws rulers and sample
    words at known real pixel sizes for a few seconds.

Also sealed from the diagnosis: a `?scale=` in a TV tab's address is
bootstrap-only — a saved per-panel size always beats it.

## The action order

- **B1 · The one number** — resolution `saved per-panel → URL bootstrap →
  shared default → 1`; ceiling 3.0 on every control.
- **B2 · Root zoom per view** — dashboard content wrapped in
  `zoom: scale / width,height: 100/scale%` (the board/diagram idiom); all
  in-view `Math.min(scale, …)` multipliers deleted (TvDashboard heights,
  fonts, widget inner scale); the bar and floating chrome keep their own
  sizing; the settings preview and the TV layout page wrap their dashboards
  in their own zoom instead of passing a scale.
- **B3 · The confirmation overlay** — the wall watches its effective size and
  shows the old → new chip for ~4 s on any change after first load.
- **B4 · The walking red button** — settings card and on-TV report button
  both step `scale × min(1.25, needed ratio)` capped at 3.0, write the saved
  per-panel size, and keep offering (with the measured "still Npx") until
  the words clear the readable line.
- **B5 · The test pattern** — a wall-bar button drawing a ruler and sample
  text rows at known REAL pixel sizes (dpr-corrected), self-dismissing.
- **B6 · Proof** — `scratchpad/tvsize.mjs`: sizes grow proportionally
  (0.9 → 1.8 doubles a card, the exact probe that exposed the dead button),
  stale URL param loses to the saved size, the overlay appears, the ceiling
  holds; `tvcrash` and `tvscreens` stay green.
- **B7 · The record** — What's New entry, CLAUDE.md section, this folder
  committed.
