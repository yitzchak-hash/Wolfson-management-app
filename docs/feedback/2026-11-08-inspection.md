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
