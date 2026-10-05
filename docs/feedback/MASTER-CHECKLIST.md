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
| V1-3 | 1:03 | Propose a different look for the notebook bars | Waiting | proposal page (options + recommendation) |
| V1-4 | 1:12 | The Job Board's Activity = every workspace's activity | In progress | — |
| V1-5 | 2:13 | Activity is too hard to read — present a plan | Partly | plain sentences + grouping built; the bigger plan is waiting |
| V1-6 | 2:57 | Group repeated rows ("Igor uploaded 4 photos") | In progress | — |
| V1-7 | 3:13 | No jargon like "updated stage note task" | In progress | — |
| V1-8 | 3:58 | Pictures open in a picture viewer that slides left/right, not as a plan | Done | PlanBrowser → MediaViewer with the folder's pictures and films |
| V1-9 | 4:43 | The log speaks the set model — no "changed stage X → Y" | In progress | — |
| V1-10 | 4:52 | Untick Registers; tick Wall Units + Outdoor Units; leave Thermostats open | Done | production data, read back 2026-10-05 |
| V1-11 | 5:00 | Move Igor's work A1 9/10/11/12 → A3 9/10/11/12 with the pictures — data only | Done | 4 tasks, 15 photos, 8 messages moved; read back |
| V1-12 | 5:55 | A site film takes forever to start | Done | /api/drive-fetch streams with Range; scratchpad/drivestream test 11/11 |
| V1-13 | 6:33 | The 22-Sep film on A1 12 belongs to A3 12 | Done | moved with its task |
| V1-14 | 6:42 | A way to fix a wrong apartment in future + a worker permission to move his own mistake | In progress | — |
| V1-15 | 7:09 | "On the plan" address/phone: show the box it came from; never invent; empty when not on the plan | In progress | — |
| V1-16 | 7:33 | Registers didn't happen; he did Wall Units, Fans, Concealed Units, Piping | Done | same data write as V1-10 |
| V1-17 | 7:46 | Add a Drilling stage | Done | stage `s-drilling` in production, after Thermostats — position asked |

Seen, not said (video 1): LIVE ticker field names (in progress) · code-word chips on Activity rows (in
progress) · squares counted 13 stages vs 9 (**Done** — stageMarks `ownStage`) · window "Floor 4" vs
diagram 3 (**Done**) · task delete took its 8 messages/photos silently (in progress — asks first now) ·
A1 floor 10's empty fifth square (Waiting) · A3 12 Access Panels ticked by Igor before drywall
(Waiting) · A1 12 still has the moved report's stages done (Waiting) · A3 9/10/11 read "Registers" =
next to do (Waiting).

## From chat

| # | Date | Ask | Status | Proof |
|---|------|-----|--------|-------|
| C-1 | 2026-09-22 | Editing a task shows the stage bubbles like the apartment's task editor | Done | 6b41e4c · taskbubbles-probe 16/16 |
| C-2 | 2026-09-22 | Add Task on a job opened from the calendar exits to the Job Board | Done | c51b630 · addtaskticket-probe 9/9 |
| C-3 | 2026-09-23 | Chrome (and the computer) freezes while scrolling the Job Board | Partly | e70ef25 diagnosis; the fix (cap the Active-jobs rows) waits for "go" |
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
