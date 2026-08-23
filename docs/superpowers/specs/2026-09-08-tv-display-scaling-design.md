# TV display scaling — one honest pipeline
*Design agreed with the owner, 2026-09-08. Answers locked: true zoom · all views · on-TV confirmation · step-by-step red button.*

## The problem, proven
At the owner's panel geometry (2560 CSS px wide → base autoScale 1.6), raising the
per-screen size from 90% to 160% moved a dashboard card by ~11% and then nothing:
the dashboard's own drawing code multiplies each element by `Math.min(scale, cap)`
with caps of 1.5 (widget contents), 1.6 (card heights), 1.9 (grid font). A wide
panel STARTS above the caps, so the % readout climbs while the picture stands
still. Second fault: a TV tab whose URL carries an old `?scale=` outranks the
saved per-screen setting forever. Third, structural: board, diagram and dashboard
each scale by different local arithmetic — every fix so far patched one spot.

## The design

### 1. One number, applied once
`effectiveScale = autoScale × savedBoost`, where `savedBoost` resolves:
`tvScreens[thisScreen].scale` → shared `tvScale` → 1. The `?scale=` URL param is
demoted to bootstrap-only: it is used ONLY when no saved value exists (or Firebase
is unconfigured); a saved value always wins, so a stale tab can never mask the
office again.

The number is applied ONCE per view, at the view's content root, as CSS
`zoom: effectiveScale` with `width: 100/scale%` (and height where the view needs
it) — the same layout-zoom technique the board view and the dprFix already use,
which keeps text laid out sharp rather than stretched. The top bar keeps its own
`tvTouchScale` and stays outside the content zoom.

### 2. Every `Math.min(scale, …)` inside the views is deleted
TvDashboard cards render at their stored heights, fonts at natural px, and
`WidgetSurface`'s inner scale is `box / natural` with no scale term — everything
inherits the root zoom exactly once. TRUE ZOOM: at 160% everything is genuinely
1.6× and fewer cards fit per row (the grid reflows); that is what "bigger" means.
The board view keeps `regionFit × boost` (region semantics are correct today);
the diagram view keeps its root zoom and loses the capped font multipliers that
would otherwise double-scale inside it. The settings-page dashboard preview
passes its shrink as a wrapper zoom, not as per-element multipliers.

### 3. The TV says what just happened
When the panel's SAVED size changes (from settings or its own buttons — not on
first load), the wall shows a small overlay for ~4 seconds: "Display size
90% → 160%". Changing a TV from the office is visible from across the room.

### 4. The red button walks, it does not leap (owner's choice)
Each press raises that screen's saved size by one bounded step toward the
measured need (multiply by the needed ratio, capped at ×1.25 per press, ceiling
3.0). The TV re-measures on its next heartbeat (settings polls at 3s while a fix
is pending); the card shows measured before → after and, if the words are still
short of readable, the button stays and says so ("Still 11px — press again").
Converges in 2–3 presses, never overshoots. The on-TV report button gets the
same step semantics, writing the same saved value.

## Testing
- The failed probe becomes the assertion: dashboard at a 2560-wide frame,
  saved 0.9 vs 1.8 → card height and grid font must grow proportionally.
- Param precedence: tab with `?scale=0.9` + saved 1.6 → the TV renders 1.6.
- The overlay appears on a remote change and fades.
- `tvcrash` (every widget on the wall) and `tvscreens` stay green.

## Out of scope
No new state keys (per-screen sizes already live in `tvScreens` in the __tv
bag); no changes to region picking; no closed-loop auto-sizing — the office
keeps its hand on the dial.
