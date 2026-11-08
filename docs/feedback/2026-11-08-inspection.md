# 2026-11-08 — Tzvi's inspections (his "plan approved")

The approved plan, as built:
- **Where:** a navy "Inspection" button at the top of the apartment's Stages list. Only Tzvi's user sees it (a name
  starting Tzvi / Zvi / צבי).
- **Press:** Take a photo · Take a video · From the gallery (the phone's camera opens for the first two).
- **Saved:** to the apartment's Drive under Photos › Inspections; one `Inspection` on the apartment record
  (`Apartment.inspections`, so it is in the cloud and the full backup with the apartment).
- **Shown:** a green row "Inspected by Tzvi ✓ · <day>" right after the stage that was last finished when it was taken
  (before every stage when none was); a press opens it to the pictures and videos (they open in the viewer).
- **Several:** each inspection is its own row, in the order taken.

Harness: `scratchpad/inspection.mjs` 9 (dev server with VITE_DRIVE_API_KEY set) · `shareplan` 13 · `v14board` 44 ·
`v22fold` 14.

## Round 2 (the same day)
- **Camera inside the app**: Inspection opens a full-screen camera (`InspectionCamera.tsx`): many photos, video, flip, gallery; a strip of shots with × each; nothing is sent until Done. Where the browser refuses the camera, the phone's own camera opens.
- **Folding**: pictures added by the same person within 30 minutes of the last ones join that inspection (`Inspection.lastAt`).
- **Vibration** (`src/data/haptics.ts`): a tick on a floor change, a tap on the shutter, a success buzz on Done. Android vibrates; an iPhone gives only a light tick (Safari has no vibration call).
- **Sideways Fold**: the plan pane takes at least half the window; the side pane opens on the whole sheet (PlanAnnotator `embedded`).
- **Photos tab**: pictures and videos only; "Show all files (N)" brings the rest.

Harnesses: `inspection.mjs` 13 · `photosall.mjs` 4 · `overlaps.mjs` fold-side 0 · v22fold 14 · shareplan 13 · dictate 10 · signout 8 · v14board 44.

## Round 3 — Select and delete (Tzvi only)
- A **Select** button in the Photos tab, only for Tzvi's user. Tap tiles to pick (a tap no longer opens the viewer), Select all, **Delete** asks first.
- Drive files go to **Drive's trash** (30 days to restore) through `api/drive-upload.js` mode `trash-files` (a folder id is refused); their site records go with them; a site photo kept only in the app loses its record. A file Drive refuses stays and is counted in the message. Inspection rows drop the deleted files.

Harness: `photosdelete.mjs` 10.

## Round 4 — vibration in all six places he chose ("all")
- Apartment opens: tick · stage marked done: success · task closed (any screen — in the store): success · message sent (any send box, typed or dictated): tap · an error toast: warning · hold a flat on the building (450 ms, a finger): tap, the flat lights up with its partner, and it does NOT open (the lift's click is swallowed).

Harness: `haptics.mjs` 9 (navigator.vibrate recorded; a real CDP touch hold).

## Round 5 — iPhone ticks (his "a")
- iOS ticks only inside the finger's own event. Every buzz now also fires in the tap itself: board/building apartment open (`handleAptClick`), the floor rail (`go`), the lift of a floor swipe and of a hold (`hapticOnLift`, iPhone-only). `haptic()` skips the same kind within 150 ms so Android buzzes once. The building has no iPhone copy/look-up bubble (`-webkit-touch-callout: none`).
- Still dropped on an iPhone: the warning buzz after a failure that arrives later (a download that fails), and the apartment tick when opened from a search or a link (the drawer's own tick comes after the tap).

Harness: `haptics-ios.mjs` 7 (iPhone device, no vibrate, each tick recorded with the event being handled) · `haptics.mjs` 9.
