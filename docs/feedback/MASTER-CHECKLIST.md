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
| V2-11 | 4:00 | Show the person and what he did on a bar — give me previews | Done | his pick: A, the small board tile · notebooktile-probe (25), notebooklabel, notebookbars, notebook-r48, multiday |
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

### Video 3 — Screen Recording 2026-10-11 115320 ([feedback doc](2026-10-11-115320.md))
| # | Time | Ask | Status | Proof |
|---|------|-----|--------|-------|
| V3-1 | 0:00 | Busy-day popup rows: the stage bubbles, ticked or not | Done | TaskBundle `data-bundle-stage[data-state]` · round49-probe |
| V3-2 | 0:12 | Up to three even thumbnails under the bubbles | Done | `data-bundle-row-photos` · round49-probe |
| V3-3 | 0:25 | A "+" when there are more, not the words | Done | `data-bundle-thumb-more`; "working here today" no longer shown · round49-probe |

### Video 4 — Screen Recording 2026-10-11 115854 ([feedback doc](2026-10-11-115854.md))
| # | Time | Ask | Status | Proof |
|---|------|-----|--------|-------|
| V4-1 | 0:04 | "15 out of 4 days" | Done | day count on its own line, address isolated · round49-probe |
| V4-2 | 0:17 | Stage pills cut off | Done | pills wrap · round49-probe |
| V4-3 | 0:25 | "A2 · N apartments", Wolfson on top | Done | `data-bundle-bld` · round49-probe, notebooktile-probe |
| V4-4 | 0:54 | Two rows always in Active jobs | Done | the app's service account is not activity · activitytouches-test |
| V4-5 | 1:00 | "More tiles, not tiles" | Done | his answer (a): Active jobs rows are small board tiles, 2 across by default, "One line each" in the pencil keeps the old rows · activejobs-probe |
| V4-6 | 1:09 | General notes newest on top | Done | round49-probe, round40-probe |
| V4-7 | 1:15 | "Why two dates?" | Answered | a typed date + the sign-off |
| V4-8 | 1:23 | Drive / Zoho folded by default | Done | LinkSection · drawer-r48 |
| V4-9 | 1:29 | "What is this building thing?" | Answered | the Drive folder's own title |
| V4-10 | 1:39 | Bigger notes box, a line between notes | Done | `data-general-notes-box` · round49-probe |
| V4-11 | 2:18 | Done card: worker on top, one plain sentence | Done | `data-task-done-who` / `-sentence` · drawer-r48, round49-probe |
| V4-12 | 3:13 | Changing a finished task's stage carries its pictures and ticks | Done | `saveTaskEdit` · round49-probe |
| V4-13 | 3:57 | Notes / edit form / card disagree about what a task was | Done | `recordStageIds` everywhere · round49-probe |

### Video 5 — Screen Recording 2026-10-11 120334 ([feedback doc](2026-10-11-120334.md))
| # | Time | Ask | Status | Proof |
|---|------|-----|--------|-------|
| V5-1 | 0:18 | The calendar shows every workspace | Done | `data-calendar-scope` · round49-probe |
| V5-2 | 0:12 | Click a day to add | Done | `data-cal-add` → Tasks add form on that date · round49-probe |
| V5-3 | 0:08 | A notebook-like calendar | Done | built on his "all stars" (2026-10-12): `CalendarPage` · timeoff-probe (44) |
| V5-4 | 0:33 | Tasks page: bubbles, not arrows | Done | StagePairPill · round49-probe |
| V5-5 | 0:48 | Tasks page in plain English | Done | `data-task-plain` · round49-probe |
| V5-6 | 0:54 | Calm "Is this the right plan? Yes" → "Plan approved by …" | Done | `data-plan-auto-yes`, `data-plan-approved` (read live) · round43-probe |
| V5-7 | 1:16 | The studio for the plan sketcher | Withdrawn | "forget that last thing" |
| V5-8 | 1:44 | "Why this and this?" (Pin, Layers) | Done | Layers hidden on a plan with none · round43-probe; Pin explained |

### Video 6 — Screen Recording 2026-10-11 120729 ([feedback doc](2026-10-11-120729.md))
| # | Time | Ask | Status | Proof |
|---|------|-----|--------|-------|
| V6-1 | 0:26 | A new task starts on the next stage to do, not a finished one | Done | `nextStageToDo` · multiday, round49-probe |
| V6-2 | 1:23 | "Finished Drilling · doing Piping, Concealed Units, Fans" | Done | `data-bundle-row-plain` · round49-probe |

### Video 7 — Recording 2026-10-12 141731 ([feedback doc](2026-10-12-141731.md))
| # | Time | Ask | Status | Proof |
|---|------|-----|--------|-------|
| V7-1 | 0:05 | Busy-day tile: no apartment counts / building lines | Done | round50-probe; notebooktile, round49 re-encoded |
| V7-2 | 0:32 | Don't say the count twice | Done | "✓ done", "See all ›" · round50-probe |
| V7-3 | 0:36 | All done = green, like a done tile | Done | round50-probe |
| V7-4 | 0:44 | The strip runs orange → green towards finished | Done | `towardDone` · round50-probe |
| V7-5 | 1:15 | The worker's name in the middle of its row | Done | round50-probe |
| V7-6 | 1:23 | A finished tile without "N days" | Done | round50-probe |
| V7-7 | 1:25 | No address on notebook tiles | Done | notebooktile-probe, round49-probe |
| V7-8 | 1:45 | "3/14" instead of "A3 · Floor 4" | Done | notebooklabel-probe, notebooktile-probe |
| V7-9 | 2:12 | The task's words on hover only | Done | round50-probe |
| V7-10 | 3:03 | Calendar text a size up | Done | round50-probe |
| V7-11 | 3:15 | Calendar: which worker, at a glance | Done | `data-cal-worker` · round50-probe |
| V7-12 | 2:55 | Calendar "too subtle — leave it" | Answered | left as he said |

Seen, not said (video 7): a right-click on a worker's name opened the board's menu (**Done** — it opens
his own menu) · the Tasks page read "G · Apt <name>" for a Job Board job (**Done**).

### Video 8 — Recording 2026-10-12 144059 ([feedback doc](2026-10-12-144059.md))
| # | Time | Ask | Status | Proof |
|---|------|-----|--------|-------|
| V8-1 | 0:32 | "אא" finds the "AA …" job | Done | `spellHebrew` · searchindex-test |
| V8-2 | 0:38 | AI search as a fallback (Opus 5.5) | Done | built 2026-10-13 on his word ("I'm adding it now"); live once ANTHROPIC_API_KEY is in Vercel · searchai-test (10) · searchaiui-probe (10) |
| V8-3 | 1:39 | Two bars over a previewed plan, not three | Done | planarrows-probe |
| V8-4 | 1:53 | A React error after a double-click | Answered | not reproduced (planarrows-probe); copy the details next time |
| V8-5 | 2:30 | The plan freezes / jumps while zooming | Done (lessened) | 16 MP cap, 280ms settle |
| V8-6 | 2:51 | Arrows on hover to walk the folder's plans | Done | `data-plan-prev/next` · planarrows-probe |
| V8-7 | 2:55 | Keep the folder's plans ready, drop them when closed | Done | `prefetchPlans` from the preview |

Seen, not said (videos 3–6): the busy-day tile counted only each task's first stage (**Done**) · a voice
memo drawn as a grey file card in the Photos tab, and counted as a photo (**Done**) · thread pictures
read "tap to open" while loading (left as a loading state) · four closed tasks in production whose
report and stages differ (A3 12, A3 17, A2 9, A2 27 — the display now reads the report; no data was
rewritten).

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
| C-25 | 2026-10-06 | Question 5 (the "Next:" cue) — "I don't understand" | Done | 2026-10-08: settled by the last-done headline (answer a) |
| C-26 | 2026-10-06 | Remove A1 floor 10's empty square | Done | see seen-not-said |
| C-27 | 2026-10-06 | Retire the "Skipped a stage" widget | Done | retired; no board had a copy |
| C-28 | 2026-10-08 | A worker moves his own mistaken apartment; the old apartment goes back to how it was before he touched it that day | Done | `marksBefore` · taskmove-test (8 revert checks), movetask, portal-r48 |
| C-29 | 2026-10-08 | Notebook card: "I want A" — the small board tile | Done | see V2-11 |
| C-30 | 2026-10-08 | Igor's open Sold/Start reports: close them as mistakes | Done | six closed in production, read back; a second start the same day now reopens the first (ContractorPortal `startWork`) |
| C-31 | 2026-10-08 | "Next:" cue: settled by the last-done headline | Done | nothing to build |
| C-32 | 2026-10-08 | Plan reader: the existing key, a stronger model and reasoning | Done | gpt-6.1-sol → gpt-6-sol → gpt-5.5 at high effort, gpt-4o floor · planread-test |
| C-33 | 2026-10-08 | The stronger shared app key: leave it | Done | nothing changed |
| C-34 | 2026-10-12 | A worker who did not finish a one-day job can say so ("I didn't finish today" next to Close job) — built on all the starred answers | Done | notfinished-test (24) · notfinished-probe (30) |
| C-35 | 2026-10-12 | Answer 1: "a" — Active jobs as small tiles | Done | see V4-5 |
| C-36 | 2026-10-12 | Answer 2: yes, draw the calendar plan | Done | "Calendar and Time Off" artifact |
| C-37 | 2026-10-12 | Answer 3: tick Registers back on A2 9 | Done | production, read back (done, headline Registers); one "Office" history line |
| C-38 | 2026-10-12 | A way to mark a worker on vacation from the notebook, seen on the notebook — add it to the plan | Done | built on "all stars": name → Time off…, right-click → Off this day, the band · timeoff-test (18) · timeoff-probe (44) |
| C-39 | 2026-10-12 | "all stars, build it" — every starred answer on Calendar and Time Off | Done | timeoff-probe (44); notebook-r48 and round49 re-encoded to the one calendar |
| C-40 | 2026-10-12 | "in the groups … multiple select or right click the job and the whole full menu is not coming up … move stuff to trash or to different folders" | Done | Ctrl/Shift-click in the group; job menu with Move to (every group), Move to Trash, Put back, Lock, Wallboard; groupmenu-probe (22) |
| C-41 | 2026-10-13 | "a board where I can pin jobs on … in a handwriting type of way … drag jobs on there … drag wherever she wants stuff from there to there" | Done | Pin board widget; pinboard-probe (25) |
| C-42 | 2026-10-13 | "Regarding number one, yeah, I'm adding it now" (the AI search) | Done | built; works the moment the key is in Vercel |
