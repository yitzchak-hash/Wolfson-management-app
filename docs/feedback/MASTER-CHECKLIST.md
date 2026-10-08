# Master checklist — every ask, from the recordings and from chat

One line per single ask (voice-typed paragraphs are split). Status: **Done** (with proof — a commit,
a harness, or a data write that was read back) · **Partly** · **Not done** · **Later** (only when the
owner said later) · **Waiting** (needs his answer). Re-read before every reply.

## From the recordings

### Video 1 — Recording 2026-10-05 161656 ([feedback doc](2026-10-05-161656.md))
| # | Time | Ask | Status | Proof |
|---|------|-----|--------|-------|
| V1-1 | 0:24 | Notebook bars show where the job is — building, floor, address | Done | PlannerWidget TaskBar: building chip + floor/address line |
| V1-2 | 0:55 | Mark done without a cross that hides the words | Done | green ✓ done tag on bars and cards, no strike, no dimming |
| V1-3 | 1:03 | Propose a different look for the notebook bars | Done | plan page "Igor's Monday, Redrawn"; he chose A (every task its own bar — what is live), 2026-10-06 |
| V1-4 | 1:12 | The Job Board's Activity = every workspace's activity | Done | activityCenter.ts · activitycenter.mjs 58/58 |
| V1-5 | 2:13 | Activity is too hard to read — present a plan | Done | plain sentences + folding (10-05), and the day story he said yes to (10-06): dayStory.ts · daystory-test 18/18 · daystory-probe 27/27; flags declined |
| V1-6 | 2:57 | Group repeated rows ("Igor uploaded 4 photos") | Done | foldActivity · activitywords-test 83/83 |
| V1-7 | 3:13 | No jargon like "updated stage note task" | Done | activityWords.ts on every surface (page, History tab, LIVE ticker, dashboard card, widget, report) |
| V1-8 | 3:58 | Pictures open in a picture viewer that slides left/right, not as a plan | Done | PlanBrowser → MediaViewer with the folder's pictures and films |
| V1-9 | 4:43 | The log speaks the set model — no "changed stage X → Y" | Done | `stage_marks` lines name which stages moved; old records read "next up" |
| V1-10 | 4:52 | Untick Registers; tick Wall Units + Outdoor Units; leave Thermostats open | Done | production data, read back 2026-10-05 |
| V1-11 | 5:00 | Move Igor's work A1 9/10/11/12 → A3 9/10/11/12 with the pictures — data only | Done | 4 tasks, 15 photos, 8 messages moved; read back; 13 history lines added (Office, 14:00) |
| V1-12 | 5:55 | A site film takes forever to start | Done | /api/drive-fetch streams with Range; scratchpad/drivestream test 11/11 |
| V1-13 | 6:33 | The 22-Sep film on A1 12 belongs to A3 12 | Done | moved with its task |
| V1-14 | 6:42 | A way to fix a wrong apartment in future + a worker permission to move his own mistake | Done | Move task (window + Tasks page), `moveOwnWork` permission · movetask 65/65, taskmove-test 35/35 |
| V1-15 | 7:09 | "On the plan" address/phone: show the box it came from; never invent; empty when not on the plan | Done | planhonest 38/38 · planread-test 39/39 |
| V1-16 | 7:33 | Registers didn't happen; he did Wall Units, Fans, Concealed Units, Piping | Done | same data write as V1-10 |
| V1-17 | 7:46 | Add a Drilling stage | Done | `s-drilling` moved right after Sold/Start (order 2) and ticked done on the 38 flats with Piping done; Piping ⇒ Drilling from now on (impliedone-test 8/8) — 2026-10-06 |

Seen, not said (video 1): LIVE ticker field names (**Done** — activityWords) · code-word chips on
Activity rows (**Done**) · squares counted 13 stages vs 9 (**Done** — stageMarks `ownStage`) · window
"Floor 4" vs diagram 3 (**Done**) · task delete took its 8 messages/photos silently (**Done** — the delete
dialog names them and offers Move) · A1 floor 10's empty fifth square (**Done** 10-06 — the A1-BLANK-37
placeholder deleted and tombstoned) · A3 12 Access Panels ticked by Igor before drywall (**Done** 10-06 —
un-ticked, one history line) · A1 12 still has the moved report's stages done (**Done** — he said leave it)
· A3 9/10/11 read "Registers" = next to do (Waiting — the "Next:" cue, asked again in plain words; note
Esther unticked Wall/Outdoor there herself on 10-06, so they now read "Wall Units") · the "Skipped a stage"
widget only reads old "X → Y" records (**Done** 10-06 — retired).

### Video 2 — Recording 2026-10-08 115349 ([feedback doc](2026-10-08-115349.md))
| # | Time | Ask | Status | Proof |
|---|------|-----|--------|-------|
| V2-1 | 0:18 | Anything done after Sold/Start ticks Sold/Start off | Done | `isStartStage` rule · impliedone-test · 11 live units backfilled, read back |
| V2-2 | 0:51 | A unit shows the last stage done, not the next | Done | `lastDoneHeadline` · stagescope-test, bubbles-probe · 60 live units re-derived |
| V2-3 | 0:33 | No "still to do / done" headings — one line with tiny arrows | Done | StagePicker `data-stage-flow` |
| V2-4 | 1:09 | A done task must look done | Done | green card + "Done · day · time · who" · drawer-r48 53/53 |
| V2-5 | 1:36 | Sold/Start shouldn't need a click once work happened | Done | same as V2-1 |
| V2-6 | 1:46 | No repeated "new from the site" block — a NEW badge in place | Done | drawer-r48 |
| V2-7 | 2:16 | Many small tasks fold into one popup with the building picture | Done | TaskBundle · notebook-r48 64/64 |
| V2-8 | 2:46 | Job Board duplicate stages | Done (his) | he hid them himself |
| V2-9 | 3:16 | Settings → Stages saves by itself | Done | board-r48 65/65 |
| V2-10 | 3:42 | An import opens its jobs as tiles | Done | ImportBatchWindow · board-r48 |
| V2-11 | 4:00 | Show the person and what he did on a bar — give me previews | Waiting | "Notebook Card Options" A–D, awaiting his pick |
| V2-12 | 4:48 | Live photos widget empty | Done | cause: its "Only these jobs" held 3,520 Job Board ids; field removed, stored list ignored · board-r48, sitephotos-probe 25/25 |
| V2-13 | 5:18 | The board's 75% should be 100% | Done | boardZoom.ts · board.mjs, board-r48 |
| V2-14 | 5:32 | Calendars: see what was and wasn't done | Done | TaskCalendar folding · notebook-r48 |
| V2-15 | 5:46 | Tasks page: what's filtered, where are his done tasks | Done | scope switch + filter chips + Done divider · notebook-r48 |
| V2-16 | 6:28 | "Upgrade this whole thing" | Partly | this round's bundles / calendars / Tasks page / Who did what; more on his word |
| V2-17 | 6:44 | Right-click on a bar opened the remove ask and the browser menu | Done | notebook-r48 |
| V2-18 | 6:52 | "On the plan" garbage under Address | Done | title-block only, label's own column · planhonest, planread-test |
| V2-19 | 7:01 | The address from the right side, AI on Opus 5.5 high | Done | api/geocode planRead (needs the Anthropic key in Vercel) |
| V2-20 | 7:06 | The box picker read "Floor" | Done | `LABEL_ONLY` |
| V2-21 | 7:28 | Zoho and Drive collapsible | Done | LinkSection · drawer-r48 |
| V2-22 | 7:40 | Status says "no plan" beside a plan | Done | `folderIssues` · drawer-r48 |
| V2-23 | 8:10 | Worker list: today, past due, future, then done | Done | portalOrder.ts · portalorder-test 14/14, portal-r48 51/51 |
| V2-24 | 9:04 | No Job Board on the building map | Done | portal-r48 |
| V2-25 | 9:24 | Worker calendar shows his jobs without "+22" | Done | portal-r48 |
| V2-26 | 10:00 | Smaller messages, "Send a note or message to the office" | Done | portal-r48 |
| V2-27 | 10:10 | Mark up out of the plans header | Done | portal-r48 |
| V2-28 | 10:16 | The plan clean and fitted, small Mark up and Download on it | Done | portal-r48 |
| V2-29 | 10:36 | "Task:" on one line | Done | portal-r48 |
| V2-30 | 10:42 | Date, address and Waze on one line | Done | portal-r48 |
| V2-31 | 11:14 | No Sold/Start for the worker | Done | portal-r48 |
| V2-32 | 11:44 | Map lights only open work | Done | portal-r48 |
| V2-33 | 12:18 | "What are you doing here today?" | Done | portal-r48 (three languages) |
| V2-34 | 12:26 | "Are you sure" naming his picks | Done | portal-r48 |
| V2-35 | 13:36 | A "who did what" widget with links and pictures | Done | workdone-test 25/25, whodidwhat-probe 37/37 |

Seen, not said (video 2): a fresh worker phone could crash when his record arrived late (**Done** — the
"link not found" check sits below every hook) · a task due today showed as late from midnight (**Done** —
`isLate`) · films in Live from site drew as broken pictures (**Done** — a playable film draws its own frame).

## From chat

| # | Date | Ask | Status | Proof |
|---|------|-----|--------|-------|
| C-1 | 2026-09-22 | Editing a task shows the stage bubbles like the apartment's task editor | Done | 6b41e4c · taskbubbles-probe 16/16 |
| C-2 | 2026-09-22 | Add Task on a job opened from the calendar exits to the Job Board | Done | c51b630 · addtaskticket-probe 9/9 |
| C-3 | 2026-09-23 | Chrome (and the computer) freezes while scrolling the Job Board | Done | 9472a3e — Active jobs draws 40 rows (+ "Show 40 more"); activecap-probe 4/4, 13,231 → 959 elements |
| C-4 | 2026-09-23 | End every reply with a bold one-line "needed / not needed" with emojis | Done | standing rule (CLAUDE.md) |
| C-5 | 2026-09-23 | "Live from site" looks like two duplicate widgets | Partly | one widget in code (1bcb41b); the extra copies on his board are his to delete |
| C-6 | 2026-09-23 | A worker's upload shows on the TV within seconds | Done | 1bcb41b · sitephotos-probe 25/25 |
| C-7 | 2026-09-23 | Touchable on the TV — opens big | Done | 1bcb41b |
| C-8 | 2026-09-23 | A film plays with play / sound / full screen | Done | 1bcb41b (and V1-12 streaming) |
| C-9 | 2026-09-23 | A photo opens the same way; thumbnails show | Done | 1bcb41b |
| C-10 | 2026-09-23 | Standing orders 1–5 (never wait; don't call it verified; numbered done/not done/decision list + link; no qa-fix-loop / mission-board; just do his direct asks) | Done | HANDOFF.md |
| C-11 | 2026-09-23 | Keep BRIEF / ROADMAP / DECISIONS and read them before every task | Done | 228284c |
| C-12 | 2026-09-23 | A big slice gets a "Plan for review" first | Standing | — |
| C-13 | 2026-10-05 | Work by screen recording: ledger, every video twice-transcribed, every second read | Done | this folder |
| C-14 | 2026-10-05 | Keep this master checklist of every ask | Done | this file |
| C-15 | 2026-10-05 | Non-code deliverables are pasted into the chat | Standing | — |
| C-16 | 2026-10-05 | Never ask for passwords, keys or tokens in chat — say where to click | Standing | — |
| C-17 | 2026-10-05 | Recordings of another project: mark "not this app", report, never build | Standing | none so far |
| C-18 | 2026-10-05 | While watching, look for asks from earlier videos still not done | Standing | video 1 is the first in the folder |
| C-19 | 2026-10-06 | Busy notebook day: A (every task its own bar) | Done | nothing to build — the live look |
| C-20 | 2026-10-06 | Build the day story | Done | see V1-5 |
| C-21 | 2026-10-06 | No automatic suspicious-entry flags | Done | daystory-probe asserts none |
| C-22 | 2026-10-06 | Drilling right after Sold/Start, before Piping; tick Drilling done wherever Piping is done | Done | see V1-17 |
| C-23 | 2026-10-06 | A1 12: leave it ticked | Done | untouched |
| C-24 | 2026-10-06 | A3 12: untick Access Panels | Done | production, read back; "Office · un-ticked Access Panels" |
| C-25 | 2026-10-06 | Question 5 (the "Next:" cue) — "I don't understand" | Waiting | re-asked in plain words |
| C-26 | 2026-10-06 | Remove A1 floor 10's empty square | Done | see seen-not-said |
| C-27 | 2026-10-06 | Retire the "Skipped a stage" widget | Done | retired; no board had a copy |
| C-28 | 2026-10-08 | A worker moves his own mistaken apartment; the old apartment goes back to how it was before he touched it that day | Done | `marksBefore` · taskmove-test (8 revert checks), movetask, portal-r48 |
