# UI build list — the round sealed 2026-08-30

Eleven decisions the owner approved, and the fifteen changes that build them.
The pictures live in the **UI Decisions** artifact:
https://claude.ai/code/artifact/18d71433-a44e-4268-b63b-29f8bc03fe99

**Nothing in `src/` was changed while these were decided** — the round was
design only. Every proposal was built by rearranging the app's own live markup,
so what was approved is reachable with the components that already exist.

**Two thresholds, deliberately different.** 800px decides where the plan sits;
900px decides the diagram. On a sideways Fold (829px) the plan is beside the
details AND the diagram shows one building. That is correct, not a mistake.

---

## The eleven decisions

**1. The plan sits beside the details on a wide screen, a tab on a narrow one**  
The line is 800px of SCREEN width. Above it (sideways Fold 829, sideways iPad 1024, every PC) the plan sits beside the details and the details column gives way. Below it (every phone, Fold upright 690, iPad upright 768) the plan is its own tab next to Details. Turning a tablet moves it from one to the other with the window still open.

**2. The plan’s tab row never appears on a preview — any device, anywhere**  
The “Plan ✕ +” strip is gone from every preview: iPhone, Galaxy, Flip, Fold upright and sideways, every iPad, every PC. No exceptions. It stays exactly as it is inside Mark up. On a phone this also removes the second row of tabs sitting under the app’s own Details / Plan / Tasks row.

**3. Drive and Zoho stay side by side; their text hides behind the field’s edge**  
The two link boxes stay side by side at every width — they never stack. The long address runs to the end of its box and slips away behind the edge, so a box can never grow past its own column and collide with its neighbour.

**4. Below 900px the diagram shows one building at a time**  
Big A1 / A2 / A3 tabs pick the building. Above 900px nothing changes — wide monitors keep all three side by side. This is what takes an apartment cell from 75px wide to 311px, the difference between “G…” and “Goldstein, Menachem · Concealed Units Installed”.

**5. The stage bubbles become one stage bar; the loose row of numbers goes**  
Below 900px the top of the diagram is: search + one Filters button (type filter, Changes, Bulk update, Print, clear all live inside it), the building tabs, then one bar showing the whole project — each stage a block sized by how many apartments are in it, tap a block to filter. The eight wrapping bubbles and the separate row of bare numbers are both replaced by that bar. Above 900px the toolbar is untouched.

**6. One Close job button, and the task screen shows what the office sent**  
The big green button in the middle of the worker’s screen goes — there is one Close job, at the end. Urgent loses its box (a red dot and the word). The Download button on the plan is repaired. Add File leaves the office’s block.

**7. Closing a job is a screen of its own**  
Two things on it: “Tap to add photos, videos, or files” at the top, and one comment box with the paperclip and the microphone INSIDE it. No separate file section. Then “Send and close the job”. The line about pictures is not fixed text — it follows each worker’s own permission, so a photos-optional worker sees no demand, no counter, and is never locked out.

**8. The task’s notes become a conversation, the same on phone and computer**  
Office speaks from the left in white, the worker answers from the right in blue. A file is a card you press to open and download; a photo is a preview you press to expand, with download there. One drawing of it, used in the worker’s portal and in the apartment window’s Tasks tab.

**9. The closing comment is the last message in that conversation**  
What the worker writes on the closing screen lands in the thread with his photos attached, followed by a green “Job closed · 15:47” marker. One history per task. An empty comment still posts the photos and still closes the job.

**10. The conversation carries on after the job is closed**  
Closing is a milestone in the thread, not the end of it. Both sides keep writing underneath the marker. And because the conversation stays open, nothing in it is ever edited or deleted — a correction is simply a new message.

**11. A closed job says so — it does not keep offering the button**  
Once a task is closed the green Close job button is replaced by a plain “Job closed” state. The message box above it stays live, because the conversation carries on. Only the button goes.

---

## The build list

### The apartment window
*From decisions 1–3*

#### 1. The plan sits beside the details above 800px and becomes a tab below it

`src/components/apartment/ApartmentDetailDrawer.tsx`

Add a subscribed width test at `(min-width: 800px)` built the way `src/data/usePhone.ts` is — a matchMedia listener, never a value cached at mount, because a Fold changes width while the window is open. `planSideOn` requires that test AND `planPaneOn`. Below 800 there is no side pane and the **Plan tab** is shown — that tab already exists via `planPane('tab')` but is gated on `isPhone`; gate it on the new test instead. The existing `planW` / `modalH` screen cap stays for the side case. Standing rule preserved: the Plan tab never jumps into the markup studio — *Mark up* inside the pane is the only way in.

#### 2. The plan’s tab strip appears only in the markup studio

`src/components/plans/PlanAnnotator.tsx` · `src/components/plans/PlanTabs.tsx`

Render `PlanTabsStrip` only when the annotator is neither `readOnly` nor `embedded`. That one condition covers every preview the owner named — the drawer side pane, the phone Plan tab, the wallboard and the worker’s portal — and leaves the strip exactly as it is in the full-screen studio. Keep the tab state itself (`loadTabState` / `saveTabState`, `plan_tabs_<apartmentId>`); a preview simply does not draw the strip, and its `+` and per-tab close do not exist there.

#### 3. Drive and Zoho stay side by side; the text hides behind the field’s edge

`src/components/ui/LinkField.tsx` · `src/components/apartment/ApartmentDetailDrawer.tsx`

The cause is in `LinkField`’s EMPTY state (the dashed add-a-link button): it renders `<Link2/> {placeholder}` as a bare text node in a flex row with no `min-w-0`, so the long URL sets the button’s min-content width and pushes it past its grid column into its neighbour. Wrap the placeholder in a span with `min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left`, and give the button `min-w-0 overflow-hidden`. Fade rather than ellipsis: `mask-image: linear-gradient(to right, #000 calc(100% - 22px), transparent)` plus the `-webkit-` twin, mirrored under RTL. In the drawer, add `min-w-0` to each grid CELL as well — a grid item floors at its content’s min-width otherwise. **The grid keeps `grid-cols-1 md:grid-cols-2`**; it must never collapse to one column at any width (explicit owner decision — they never stack).

### The building diagram
*From decisions 4–5*

#### 4. Below 900px the diagram shows one building at a time

`src/pages/ProjectDiagramPage.tsx`

The page already has `usePhone()` at `(max-width: 767px)`. Add a second subscribed test — call it `useNarrow()` at `(max-width: 899px)` — and drive the one-building resolution from it: `phoneBuilding` currently gates on `isPhone`, so gate it on `isNarrow`. The A1 / A2 / A3 tab row (today inside the `md:hidden` bar) shows up to 899px. Above 900 nothing changes at all. **Keep `BuildingDiagram`’s `phone` prop on the real phone test** — taller rows and bigger type is a different question from how many buildings are on screen.

#### 5. Below 900px: the Filters button, and one stage bar in place of the bubbles

`src/pages/ProjectDiagramPage.tsx` · `src/components/diagram/StageBar.tsx (new)`

Below 900 show the existing `md:hidden` bar (search + Filters + building tabs) and hide the desktop bar and the stage-count strip. Those three are keyed to `md` today (`md:hidden` / `hidden md:block` / `hidden md:flex`); move them to a custom Tailwind screen at 900 rather than to inline `display` driven by React, so the CSS keeps working while React is deciding.

   New `StageBar`: one row, one flex segment per stage with `flex: <count>` and the stage’s own colour, the count written inside a segment wide enough to hold it. Pressing a segment toggles that stage in the page’s existing `activeStageIds`. A line above it reads the total; the stage names with colour dots wrap beneath. **The separate row of bare numbers is deleted** — the counts now live in the bar. Counts come through `isCountableApartment` and nothing else, so the bar can never disagree with the dashboard. The Filters sheet keeps everything it holds today.

### The worker’s task screen
*From decisions 6 and 11*

#### 6. One Close job button

`src/pages/ContractorPortal.tsx`

Remove the `data-close-job` button rendered in the empty-media branch (the large green one under Files & Photos). The sticky footer button becomes the only way to close a job.

#### 7. Urgent loses its box

`src/pages/ContractorPortal.tsx`

The priority pill is a leaf whose text is “🔴 Urgent” carrying `bg-red-50 border border-red-200`. Drop the background, the border and the horizontal padding; keep the emoji dot and the word. Do the same for the other priorities so they stay consistent.

#### 8. The Download button on the plan works

`src/components/plans/PlanAnnotator.tsx`

Download must fetch the plan’s bytes through the app’s own `/api/drive-fetch` route (which pipes rather than buffers) and hand the file to the device — **not** a link to drive.google.com, which turns away a worker who is not signed into Google. Verify on a real phone: this is the one item on the list that cannot be proven in the test container, which has no Drive.

#### 9. A closed task says “Job closed” instead of offering the button

`src/pages/ContractorPortal.tsx`

When `assignment.completedAt` is set the sticky footer shows a static, non-pressable **Job closed · <time>** in the green family. The message box above it stays live — decision 10 keeps the conversation open.

### Closing a job
*From decision 7*

#### 10. Closing becomes a screen of its own

`src/pages/ContractorPortal.tsx`

Replace the `data-closing-panel` footer panel with a full surface (`fixed inset-0`) carrying its own navy header — a back arrow and the apartment name. Two sections only: the existing add-media button with its counter at the top, then one comment box. The footer holds **Send and close the job**. **No separate File section** — the add-media button already takes files. The paperclip and microphone sit *inside* the comment box at its bottom-right, the same idiom the drawer’s General Notes box uses. `arriveClosingRef` still applies (it is what stops the sheet’s “a new selection starts outside the closing screen” effect from undoing `setClosing(true)`), and the finish-early ask still fires on the final press when a task has days left.

#### 11. The picture rule follows each worker’s permission

`src/pages/ContractorPortal.tsx` · `src/types/index.ts`

The line under PICTURES is a string, shown only when `!contractor?.photosOptional`, and it names `MIN_CLOSE_MEDIA` rather than a literal 3 — change the constant and the sentence follows. A photos-optional worker sees no line, no counter, and Send is never locked. **Add the key to `ContractorUiStrings` as optional with a fallback** — those strings are user-edited and stored with no `mergeFresh`, so a required key renders blank on every object written before today.

### The task as a conversation
*From decisions 8, 9 and 10*

#### 12. New shared component: the thread

`src/components/tasks/TaskThread.tsx (new)`

**One drawing, used in both places** — the owner asked for one conversation on the phone and the computer, and two components would drift. Props: the assignment, its notes, its photos, who is viewing, and `readOnly`.

   Office messages left, white, 5px top-left corner, author name in accent. Worker messages right, `#e3f2fb`, 5px top-right corner. A file is a card — type badge, filename, size, “tap to open” — and pressing it downloads and opens through the same `/api/drive-fetch` route as item 8. A photo is a preview capped near 230px that expands to a lightbox with a Download. Timestamps bottom-right.

   **The “Job closed · <time>” marker is DERIVED from `assignment.completedAt`** — never stored as a record. Messages whose `createdAt` is later than `completedAt` render below it, which is what keeps the conversation open (decision 10). Nothing in the thread can be edited or deleted.

#### 13. The thread in the worker’s portal

`src/pages/ContractorPortal.tsx`

Replace the FILES & PHOTOS block and the two separate note lists (`selOfficeNotes` / `selContractorNotes`) with one `<TaskThread>` headed **THIS TASK**. The composer beneath it is the existing paperclip + microphone + input + send row. The office’s Add File button leaves this section (owner’s decision — the worker’s paperclip is in the composer and on the closing screen).

#### 14. The same thread in the office’s drawer

`src/components/apartment/ApartmentDetailDrawer.tsx`

Inside the Tasks tab (`activeTab === 'tasks'`), render the same `<TaskThread>` under each task card with the office’s identity. Cap the bubbles near 640px on a monitor so they do not run the whole width of the window.

#### 15. The closing comment lands in the thread

`src/pages/ContractorPortal.tsx` · `src/data/store.ts` · `src/types/index.ts`

Add `photoIds?: string[]` to `ContractorNote`. **It rides inside `contractorNotes`, which is already persisted, exported, imported and synced — so the backup trio needs no new entry and the audit stays green.** Sending the closing screen writes ONE contractor note carrying the comment (which may be empty) and the ids of the photos taken on that screen, then completes the assignment. An empty comment still posts the photos and still closes the job.

---

## Rules this build must not break

- Every new user-facing string comes from the strings object or it is a bug — and a new `ContractorUiStrings` key is optional with a fallback, because those objects are user-edited and stored with no merge-fresh.
- Width tests are subscribed matchMedia listeners, never values cached at mount. A Fold changes width while a window is open, and anything that caches breaks on it first.
- Counts go through `isCountableApartment` and `liveAssignments` and nothing else — two places inventing their own totals is a fault this codebase has already paid for twice.
- `photoIds` is the only new field in the whole list, and it rides an existing collection. If anything else gains a state key, it goes into persist + export (top level) + import, and the backup audit is re-run.
- The thread must not be built twice. One component, two hosts — the office’s copy and the worker’s copy drifting apart is exactly what the owner asked to avoid.
- Nothing here changes the wallboard or the printed sheets. If a change starts reaching into `TvPresentationPage` or `printing.ts`, stop — it has gone further than what was approved.
- Do not add a file under `/api`. The Hobby plan allows twelve serverless functions and the folder is full; the plan download in item 8 uses the existing `/api/drive-fetch`.

---

## How to check it

These harnesses cover this ground and must all stay green:
`folddrawer` · `deskcheck` · `plantabs` · `planviewer` · `planzoom` ·
`planphone` · `portalround` · `multiday` · `stagereport` · `foldswap` ·
`ipadcheck` (run as `node scratchpad/<name>.mjs` with the dev server up;
`plantabs` and `planaddr` need the keyed server on 5174 —
`VITE_DRIVE_API_KEY=testkey npx vite --port 5174`).

Re-run the sweep at 344, 390, 402, 768x1024 and 1024x768
(`W=344 node scratchpad/shots.mjs`, `VIEW=landscape W=1024 H=768 …`) —
**overflow and clipped must both be 0** at every size.

Run `node scratchpad/backupaudit.mjs` after item 15, and `npx tsc --noEmit`
throughout.

**Item 8 (the Download button) cannot be proven in the container** — it has no
Drive credentials. It needs one look on a real phone.
