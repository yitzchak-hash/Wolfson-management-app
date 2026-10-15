# Undo audit — 2026-10-15

The owner, from a screen recording: "Any action I do, I want to see an undo. If I move
something from here to there, undo. If I add a task, undo. If I delete something, undo."
On screen he added a task through the notebook's "+", pressed the X on its tile, chose
**Remove both** — and the undo arrow stayed grey.

**Why it was grey.** The notebook already wrapped its bar gestures in `track()`, but the
tracker (`useBoardTrack`) only snapshotted jobs and board nodes. A task's days live on the
TASK (`contractorAssignments`), so every bar move, resize and X recorded a change of nothing
and put nothing on the stack. Task create / complete / delete were never tracked anywhere.

**What changed.** One door — `trackUndo(opts, body)` in `store.ts` — snapshots every kind of
record the office changes (jobs, board nodes, tasks, task messages, photos, stage notes,
office files, the per-workspace settings bags, and tasks written into another workspace),
and the content actions record themselves (`SELF_RECORDING` in `store.ts`), worded from what
changed (`undoWords.ts`). `useBoardTrack` is now that door in a hook.

| Action | Where | Undoable before | Undoable after |
|---|---|---|---|
| **Weekly notebook** | | | |
| "+" on a square → new task(s) (one per worker / stretch) | PlannerDialogs `make()` | No | **Yes** — one step for all of them |
| Drag a task bar to another day / worker | PlannerWidget `dropBarTo` | No (tracked, saw nothing) | **Yes** |
| Pull a bar's edge (more / fewer days) | PlannerWidget `resizeBarTo` | No | **Yes** |
| X on a bar (that stretch's days off) | PlannerWidget `removeBar` | No | **Yes** |
| X on the last stretch → "Keep the task" (dateless) | PlannerWidget `resolveBarAsk` | No | **Yes** |
| X on the last stretch → **"Remove both"** (deletes the task) | PlannerWidget `resolveBarAsk` | No | **Yes** — task, its messages and photos |
| Take a card off (PlannerRemoveDialog, card ± its task) | GeneralJobsPage | Card only | **Yes** — card and task as one step |
| Parked card X / move / copy / take off | PlannerWidget (`track`) | Yes | Yes |
| "Already has work here" → Pick another day | store `answerPlannerAsk` | No | **Yes** |
| Quick-assign box → task | PlannerTaskDialog | No | **Yes** |
| Time off (name menu, square menu, the form, tasks handed over) | `saveTimeOff`, TimeOffDialog | No | **Yes** — form + hand-overs as one step |
| Bundle popup | TaskBundle | — (opens only) | — |
| The one-time card fold (automated) | PlannerWidget effect | — | Never recorded (`withoutUndo`) |
| **Calendar page** | | | |
| Drag a task to another day | CalendarPage `writeDays` | No | **Yes** |
| "+" on a day → new task | PlannerTaskDialog | No | **Yes** |
| A single day's ask (move / add / merge / new) | CalendarPage | No | **Yes** |
| **Apartment window** | | | |
| Add a task (quick add, one or two stretches) | QuickAddTaskPanel | No | **Yes** — one step |
| Bulk add tasks | BulkAddTaskModal | No | **Yes** — one step |
| Edit a task (incl. a finished task's stages, its photos' stages, the ticks) | Drawer `saveTaskEdit` | No | **Yes** — one step |
| Mark complete / incomplete (and the stages it ticks off) | Drawer, QuickAddTaskPanel | No | **Yes** |
| Delete a task (with its messages and photos) | DeleteTaskDialog | No | **Yes** |
| Move a task to the right apartment | store `moveTaskToApartment` | No | **Yes** |
| "Not finished today" (office) | Drawer | No | **Yes** — task days, marks, message as one step |
| Remove a task attachment | Drawer | No | **Yes** |
| Stage board: tap / right-click / not needed / put back | StagePicker → `setApartmentMarks` | No | **Yes** |
| Whole-flat marker (Ready to start / Job completed) | Drawer `onMarker` | No | **Yes** |
| Family name / address / phone / Drive / Zoho (save on blur) | Drawer `autoSave`, `doSaveBasic` | No | **Yes** |
| Type (standard / Changes), tipus | Drawer | No | **Yes** |
| General notes: add a bullet / remove one | store `appendApartmentNote` / `removeApartmentNote` | No | **Yes** |
| Office files / memos on the notes: attach / remove | store `addOfficeNoteFile` / `deleteOfficeNoteFile` | No | **Yes** |
| Stage notes: add a bullet / office-only switch | store `appendStageNoteEntry` / `setStageNoteEntryVisibility` | No | **Yes** |
| Worker on a stage | StageNotesSection | No | **Yes** |
| Message to the worker: send / delete | store `addContractorNote` / `deleteContractorNote` | No | **Yes** |
| Report a problem (one or many apartments) | ProblemForm | No | **Yes** — one step |
| Approve / send back a problem | ProblemBand | No | **Yes** |
| **Tasks page** | | | |
| Add / edit / complete / delete / move a task | TasksPage | No | **Yes** |
| A task in another workspace (All workspaces) | store `*InProject` | No | **Yes** — written back into that workspace |
| **Buildings diagram** | | | |
| Bulk bar (stage, tipus, add / remove a stage) | ProjectDiagramPage | No | **Yes** — one step |
| Name a blank square | ProjectDiagramPage | No | **Yes** |
| **Job Board** | | | |
| Drag, resize, colour, z-order, lock, group, file into a group, add / remove a node, note text | GeneralJobsPage (`track`) | Yes | Yes |
| Pin board: pin, move, take off, write | PinBoardWidget | Yes | Yes |
| Group window: drag, resize, take out, menu | BinBoard | Yes | Yes |

## Not undoable, and why

| What | Why |
|---|---|
| Creating a job, deleting a job forever | The standing rule: an undo never creates or destroys a JOB. Trash is the reversible delete, and filing into Trash undoes. |
| Typing inside a widget (every keystroke) | By design — sixty entries for one word. Note text commits on blur and IS tracked. |
| Settings pages (stages list, users, workers, levels, projects), the Layout studio, the time clock | Not part of this round; the Layout studio has its own before/after save. |
| Photo uploads (`addContractorPhoto`) and voice-memo transcripts | Uploads, not a person's change; a file in Google Drive cannot be un-uploaded. |
| The worker's portal | No undo there by design; the worker's writes are never on the office's stack. |
| History lines and pushes already sent | An undo puts the record back; it does not rewrite the history or un-ring a phone. |
| Plan markups and pins | They have their own versions and Drive filing. |

Proof: `scratchpad/undoall-probe.mjs` (the owner's exact case and the rest of the list).
