# 2026-11-08 — overlaps, the mic, uploads, the inspection idea (chat)

| # | His words | The one change | Status |
|---|-----------|----------------|--------|
| 1 | "On the Z Fold, a bunch of buttons overlapped too. Also on the iPhone with the plan view" | Swept 7 phone shapes × 9 screens for buttons on top of each other / past the edge: the plan's zoom bar ran off a 360–373 wide screen (Share) — fixed. Nothing else found; his own screenshots asked for anything still seen | Fixed / asked |
| 2 | "a button … for Tzvi … press inspection … picture or video … 'inspected by Tzvi' with a check … after drilling … expandable … multiple" | A proposal, not built (he asked for one) | Proposed |
| 3 | the mic "is not live … I don't see a line" | The live line in every message box and both searches | Built |
| 4 | "in all places in the line intake" | One dictation (`dictation.ts`) for every box | Built |
| 5 | "added to our design language artifact" | TzviAir Design Language → MessageBox: rules + a working example | Done |
| 6 | "it doesn't actually work" | It stopped at the first pause and replaced the typed words: now keeps listening and adds | Built |
| 7 | "a send button to send it or a stop to stop it, just like ChatGPT" | Stop (keeps the words) and Send (sends them) while listening | Built |
| 8 | "when we upload a picture … we don't see like uploading with the progress" | "Uploading…" with a bar from the moment of the press; a corner card for other uploads; four boxes were saying "done" before their upload ended | Built |

Harnesses: `overlaps.mjs` (7 phones × 9 screens) · `dictate.mjs` 10 · `uploadbar.mjs` 2 (dev server with VITE_DRIVE_API_KEY set) ·
`v22fold.mjs` 14 · `shareplan.mjs` 13 · `v14board.mjs` 44.
