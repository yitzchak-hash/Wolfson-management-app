# Wolfson Management App — Developer Notes

## Project Overview
Internal project-management system for TzviAir's HVAC installation. Manages three projects:
- **Wolfson** — W Residence, buildings A1/A2/A3, apartments numbered 1-56+ per building
- **Netiv Neve Shamir** — buildings B1/B2, 36 apartments each
- **General Jobs** — free-form canvas of draggable job tiles (no building diagram)

The entire admin UI and contractor portal are fully bilingual (English/Hebrew with RTL).

## Tech Stack
- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS v3** (dark theme default; light theme toggle stored in localStorage)
- **Zustand v5** for state (auto-persists to localStorage via `persist()`)
- **React Router v6** (nested routes under `AppLayout`)
- **Firebase Firestore** (optional — falls back to localStorage if not configured)
- **Firebase Storage** for contractor photo/file uploads
- **date-fns** for date formatting
- **file-saver** for CSV download
- **lucide-react** for icons

## Repository
`yitzchak-hash/wolfson-management-app` — development branch: `claude/blissful-cray-spTFY`

## Deployment
- **Hosting**: Vercel (connected to GitHub repo, auto-deploys on push)
- **Serverless API**: `/api` folder at repo root — Vercel auto-deploys each `.js` file as a serverless function
- **Environment variables**: Set in Vercel dashboard (Firebase config, Google service account, API key)

## Drive Upload Backend (Vercel API routes)
- `/api/drive-session.js` — creates a Google Drive resumable upload session via service account; returns a one-time `uploadUrl` so the browser uploads the file directly to Drive (no bytes pass through Vercel)
- `/api/folder.js` — finds or creates a Drive subfolder by name under a given parent folder ID
- Service account JSON stored as `GOOGLE_SERVICE_ACCOUNT_JSON` env var in Vercel
- Shared secret stored as `API_KEY` env var — sent as `x-api-key` header from the React app
- Upload flow: Browser → `/api/drive-session` (tiny JSON) → browser streams file directly to Google Drive
- Supports any file size including 500MB+ videos; Vercel never touches the file bytes
- The `backend/` folder in the repo is superseded by these API routes and can be ignored
- **Frontend integration** (`src/data/driveApi.ts`): `isUploadBackendConfigured()` (checks `VITE_DRIVE_API_KEY`), `findOrCreateFolderViaBackend(parentId, name)`, `uploadFileViaBackend(folderId, file, onProgress)` — uploads raw `File` via XHR PUT to the resumable session URL with progress events
- **ContractorPortal upload logic**: if backend configured AND apartment has `driveLink` → stream file to Drive (Photos subfolder), store only `driveFileId`/`driveUrl` + a small image thumbnail (videos/files keep no local bytes); otherwise fall back to local base64 with 50 MB cap
- **MediaItem** handles `driveOnly` files (empty `dataUrl`, has `driveUrl`) by linking out to Drive instead of rendering base64
- `VITE_DRIVE_API_KEY` must equal the backend's `API_KEY`; it lives in the public bundle (deters casual abuse, not a true secret — real protection is the Contributor-only service account)
- **SECURITY**: The service account JSON key must NEVER be committed to the repository. It lives in Vercel env vars only.

## Directory Layout
```
src/
  types/index.ts          — all shared TypeScript interfaces + MainUiStrings + ContractorUiStrings + getStageName()
  data/
    store.ts              — Zustand store (state + all actions)
    initialData.ts        — default seed data (bump DATA_VERSION to reset)
    firebase.ts           — Firestore helpers: fsSet, fsDelete, fsGetAll, fsListen, fsBatchSet
    driveApi.ts           — Google Drive upload helpers (backend-proxied, no OAuth)
  pages/
    ProjectDiagramPage    — building diagram with filters + bulk edit (building projects only)
    GeneralJobsPage       — free-form canvas for General Jobs project (/jobs route)
    DashboardPage         — summary cards (project-scoped)
    TasksPage             — contractor task management (dedicated page, /tasks route); list + month calendar toggle (project-scoped)
    GlobalCalendarPage    — /calendar route; month calendar of ALL workspaces' tasks combined, with project/contractor filters
    AnalyticsDashboard    — stage/building analytics (project-scoped)
    ReportsPage           — CSV export (project-scoped)
    ActivityLogPage       — global change log
    SettingsPage          — stages / users / contractors / app (theme, backup) / language
    ContractorPortal      — public /c/:token page (tasks + building map)
    LoginPage             — two-step: code entry → project picker
  components/
    layout/               — AppLayout, Header (project switcher + global calendar icon), Sidebar
    apartment/            — ApartmentDetailDrawer (5 tabs: details/tasks/stages/history/photos),
                            StageNotesSection, ActivitySection, QuickAddTaskPanel, BulkAddTaskModal
    diagram/              — BuildingDiagram (supports compact, highlightedApartmentIds, aptSubLabels)
    tasks/                — TaskCalendar (shared month-grid calendar; used by TasksPage + GlobalCalendarPage)
    dashboard/            — summary cards
    reports/              — table/export
    ui/                   — Toast, Tooltip, GlobalSearch (Cmd+K), shared primitives
```

## Multi-Project Architecture

### Three projects
| Project | `id` | Buildings | Storage key | Firestore prefix |
|---------|------|-----------|-------------|-----------------|
| Wolfson | `'wolfson'` | A1, A2, A3 | `wolfson_app_data` | bare (e.g. `apartments`) |
| Netiv Neve Shamir | `'netiv'` | B1, B2 | `netiv_app_data` | `netiv_` (e.g. `netiv_apartments`) |
| General Jobs | `'general'` | none (`[]`) | `general_app_data` | `general_` |

Active project persisted to `active_project` localStorage key.

### Global vs per-project data
**Global** (shared across all projects): `users`, `contractors`, `stages` (global ones, `projectId` undefined), `autoBackup`, `backupFrequency`, `backupDriveFolderLink`, `contractorUiStrings`, `mainUiStrings`, `lightTheme`

**Per-project**: `apartments`, `buildings`, `stageNotes`, `stageNoteVersions`, `generalNoteVersions`, `activityLogs`, `contractorAssignments`, `contractorNotes`, `contractorPhotos`, `officeNoteFiles`, `dashboardWidgetOrder`, `dashboardHiddenWidgets`, `canvasElements`

### Project switching (`setCurrentProject(id)`)
1. Saves current project data to localStorage
2. Cancels all Firestore listeners
3. Loads new project data from `${id}_app_data` (or fresh defaults)
4. Merges global settings on top
5. Restarts `startFirebaseSync()` for the new project's collections
6. `set({ currentProjectId: id, ...newProjectData, ...globalState })`

**Critical isolation rules** (enforced at all load points — startup AND `setCurrentProject`):
- General project `buildings` is always `[]` regardless of localStorage
- General project `apartments` is always filtered to `buildingId === 'G'` to prevent cross-project contamination

### Routing by project
- Header project logo click → `handlePickProject(id)` which calls `setCurrentProject(id)` AND `navigate('/jobs')` for General or `navigate('/project')` for building projects
- `ProjectDiagramPage`: renders `<Navigate to="/jobs" replace />` if `currentProjectId === 'general'`
- `GeneralJobsPage`: renders `<Navigate to="/project" replace />` if `currentProjectId !== 'general'`
- Sidebar shows Briefcase icon → `/jobs` for General; Building2 icon → `/project` for building projects

### Login flow
Two-step: a tile per saved **user** (active only, colored avatar via `personColor`) → tapping a tile asks for that user's 6-digit code → on success you land straight in the last-used workspace (`/jobs` for General, `/project` otherwise). The project logos are gone from login — the header switcher is where projects change. The code must belong to the picked tile: `login()` signs in whoever owns the code, so the page checks ownership BEFORE calling it, or typing someone else's code on your tile would sign you in as them. The auth hardening ordering (`loadUsersForLogin` → `authReady` gates everything, never fail open) is unchanged; tiles render from the same authoritative list.

### Project-specific stages
`Stage.projectId?: string` — `undefined` means global (shown in Wolfson + Netiv), `'general'` means General Jobs only. Settings → Stages shows only the current project's stages. `sortedStages` in every component must filter: `st.projectId === 'general' ? ... : !st.projectId`.

### Dashboard / Analytics / Reports project scoping
All three pages scope their local `apartments` variable:
```ts
const apartments = currentProjectId === 'general'
  ? allApartments.filter(a => a.buildingId === 'G' && !a.isUnnamed)
  : allApartments;
```
And stages:
```ts
const stages = allStages.filter(st => currentProjectId === 'general' ? st.projectId === 'general' : !st.projectId);
```

## Data Model Key Points

### Apartments (building projects)
- **Building IDs**: `A1`, `A2`, `A3` (Wolfson); `B1`, `B2` (Netiv)
- **Apartment numbering per building**: 1-52 (floors 2-14, 4/floor), 53-54 (floor 15, 2 wide), 55-56 (floor 16, 2 wide), basement slots 57+ (unnamed by default)
- **A1 is missing apartment 37** (blank placeholder with `isUnnamed: true`)
- **No duplex apartments** — `isDuplexApt` field retained for data compat but always `false`
- **Classification**: `'standard'` or `'shinui'` (displayed as "Changes"/"שינוי" in UI, internal value preserved)
- **mergedWith**: optional field on Apartment for buyer-merged units (bilateral link, managed via `mergeApartments()` action)
- **Merged apartment sync**: `currentStageId`, `classification`, `driveLink`, `plansPdfLink`, and `displayName` auto-sync to the partner on every `updateApartment` call. `displayName` is only propagated when it is a real name (not just the source apartment's own number), so a linked pair shares one family name while each unit keeps its own number.
- **unmergeApartments(aptId, keepDataAptId, user)**: unlinking action; `keepDataAptId` is `aptId | partnerId | 'both'`; the loser gets `currentStageId=null`, `driveLink=undefined`, `plansPdfLink=undefined`
- **driveLink**: Google Drive folder URL for the apartment; stored on Apartment, editable in drawer
- **plansPdfLink**: Google Drive file URL for the Engineering Plans PDF; shown as embedded iframe viewer + download in both admin drawer and contractor portal

### General Jobs (Apartment records with `buildingId === 'G'`)
General Jobs reuse the `Apartment` model with these extra fields:
- `zohoLink?: string` — Zoho CRM link shown on tile
- `address?: string` — job site address shown on tile
- `canvasX?: number`, `canvasY?: number` — free-canvas position (saved on drag)
- `tileColor?: string` — custom background color hex (e.g. `'#dbeafe'`)
- `isUnnamed: false` always for real jobs; `apartmentNumber: ''`
- Created with `buildingId: 'G'`, `floor: 0`, IDs prefixed `G-`
- **`deleteApartment(id)`** action exists in store for removing jobs

### CanvasElement (General Jobs canvas extras)
```ts
interface CanvasElement {
  id: string;     // prefixed 'CE-'
  type: 'note' | 'box';
  x: number; y: number;
  w: number; h: number;
  text: string;
  color: string;  // hex or rgba
}
```
Stored in `canvasElements: CanvasElement[]` per-project. Actions: `addCanvasElement`, `updateCanvasElement`, `deleteCanvasElement`. Persisted to localStorage only (not Firestore). Notes are fixed-size sticky notes; boxes are resizable section containers with a draggable bottom-right resize handle.

### ApartmentDetailDrawer — now a CENTRED MODAL
- No longer a right-hand drawer. It is centred at `min(1020px, 94vw) × min(860px, 90vh)`, roughly twice
  the usable width, and no longer squeezes the board or diagram behind it. Applies to every project.
- The `.drawer-panel` animation had to change with it: the old `slideIn` keyframes animated `transform`
  outright, which would have fought the inline `translate(-50%,-50%)` centring and thrown the modal
  off-screen. It now animates scale+opacity *around* that centre (`modalIn`).
- The class names `drawer-panel` / `drawer-overlay` are kept so existing CSS hooks still resolve.

## ApartmentDetailDrawer in General context
When `currentProjectId === 'general'`:
- Hides apartment number, classification toggle, Engineering Plans, Settings collapsible
- Shows Address, Zoho Link, Drive Folder fields with open-link buttons
- Label reads "Job" instead of building ID
- Stage picker filtered to `projectId === 'general'` stages only

### Other Apartment fields
- **DATA_VERSION** in `initialData.ts` — bumping forces a localStorage reset (dev only; production data would need a migration)
- **TaskAttachment**: `{ id, filename, mimeType, dataUrl }` — files attached to a task when creating it; `dataUrl` stripped before Firestore writes (stays in localStorage only)
- **Task priority**: `'urgent' | 'normal' | 'low'` on `ContractorAssignment` — shown as colored badges, urgent sorts first

## Bilingual System (Admin UI)

### MainUiStrings
The `MainUiStrings` interface in `src/types/index.ts` defines every user-facing string in the admin UI (~400+ keys). Two preset objects:
- `DEFAULT_MAIN_UI_STRINGS` — English values
- `HEBREW_MAIN_UI_STRINGS` — Hebrew values

The store exposes `mainUiStrings` which reflects whichever preset is active. Components read strings via:
```
const s = useStore(state => state.mainUiStrings);
```

### CRITICAL — `mergeFreshMainUi()` must be used everywhere mainUiStrings is loaded
`mainUiStrings` is persisted to localStorage and Firestore. When new keys are added to the code, old stored objects don't have them. **Always** load via:
```ts
function mergeFreshMainUi(ms: Partial<MainUiStrings> | null | undefined): MainUiStrings {
  const safe = ms ?? {};
  return { ...(safe.isRtl ? HEBREW_MAIN_UI_STRINGS : DEFAULT_MAIN_UI_STRINGS), ...safe };
}
```
This function is defined in `store.ts` and used in all three load points: startup initialization, Firebase initial sync, and the live `settings` Firestore listener. **Never** do `mainUiStrings: stored.mainUiStrings as MainUiStrings` — it will cause blank labels for any key added after the user's localStorage was last written.

### ContractorUiStrings
Contractor portal strings live in a separate `ContractorUiStrings` interface. These are user-editable via Settings → Language and stored in Firestore `settings/app`. Admin UI strings are preset-only.

### getStageName helper
```
getStageName(stage: Stage, isRtl: boolean): string
```
Returns `stage.nameHe` when RTL mode is active and `nameHe` is set; falls back to `stage.name`. Used in: BuildingDiagram cells, stage legend, ApartmentDetailDrawer, ReportsPage, StageNotesSection. Exported from `src/types/index.ts`.

### Stage Hebrew names
Each `Stage` has an optional `nameHe?: string` field. Set it via Settings → Stages (Hebrew name input per stage row, must click Save). The `getStageName()` helper uses it automatically everywhere.

### Module-level constants and s
Module-level constants cannot access the translation store. Any constant that outputs user-visible strings must be defined inside the component body (after `const s = useStore(...)`). This applies to: `getDueBadge`, `PRIORITY_CONFIG`, `CAT_LABELS`, `ALL_COLUMNS`, `TASK_SUB_COLS`.

### RTL
`settings.isRtl` controls text direction. `dir="rtl"` is applied to the root layout when true.

## Landscape is not a special case
`VIEW=landscape node scratchpad/shots.mjs` runs the identical sweep at 844x390. Note 844px is
PAST the `md` line, so a landscape phone gets the DESKTOP layout in a 390px-tall window — the
drawer becomes the desktop modal (93vh) with the plan side pane instead of the phone's Plan
tab, which is correct rather than a bug. Anything keyed to viewport HEIGHT is what to check:
`InkPicker` is ~450px tall and lost its Done button off the bottom until it was capped to
`calc(100dvh - 16px)` with `overflow-y:auto`.

## A finger must be able to draw
`scratchpad/pencil.mjs` drives `src/data/pencil.ts` through explicit timelines (the module
takes `now` as a parameter for exactly this reason). The rule that matters on a phone: palm
rejection only bites once a PEN has been seen, so with no stylus present every touch must
pass. Get that backwards and the markup studio is silently dead on a phone with nothing
thrown and nothing logged.

`planphone.mjs` also DRAWS with a raw touch sequence (CDP touch events, not tap — a stroke
is a press that MOVES) and reads the committed-ink canvas's pixels, so the palm rule and
touch-action are asserted end-to-end: 0 → ~1300 ink pixels from one finger stroke.

**End-to-end markup on a REAL Drive plan cannot be tested in this container** — there is no
`.env.local`, so the Drive backend is unconfigured and no PDF can load. Layout, touch-action
and the palm rule are covered; drawing on an actual sheet needs a real device.

## Resizing: one gesture, one box
`ResizeState` carries `ids` + `starts` + the BOX (`boxX/boxY/startW/startH`), and everything —
one node or a whole selection — scales about that box's top-left. A lone node's box IS its own
rect, so the single case falls out of the group case rather than being a second code path.

- **Shift locks the ratio**, driven by the LARGER of the two proportional changes so the box
  follows the direction the hand is really pulling. Read live off the event, not off
  pointerdown: people reach for shift halfway through a drag.
- **A multi-selection gets ONE handle** on the combined box, and each member's own corner
  handles are hidden (`inGroup`). Leaving them visible invites a drag that resizes one node
  and silently breaks the arrangement.
- Neighbour snapping is skipped for a group and while shift is held — there is no single edge
  to line up, and it would fight the locked ratio.
- **Job tiles are NOT resizable.** Tried and dropped by the owner; tiles keep the shared
  `TILE_W`/`TILE_H`. Do not reintroduce `Apartment.tileW/tileH`.

## Resizing tells you what it can do
While a resize is live a hint follows the corner: the live size, "Shift keeps the shape", and
"press 0 for the default size". Shown only DURING the gesture — a permanent legend is noise,
and a hint nobody sees while doing the thing is not a hint.

`0` puts every node in the gesture back to the size it SHIPS at (a widget's registry `w`/`h`,
otherwise `NODE_DEFAULT_SIZE`). It sets a **ref**, not state: `setResize(null)` has not flushed
by the time the pointer comes up a moment later, so pointerup still saw the old gesture and
committed the dragged size straight back over the reset.

The group handle is 30px with a white ring, a shadow and a corner bracket. At 22px flat blue
it was reported as missing — it was there, it just read as a speck.

## The widget shelf is audited by `scratchpad/storefull.mjs`
It tags every card with `data-widget-id` and reports previews drawing an empty state. Two
traps it fell into first, both of which made it report healthy cards as broken: the widget's
own BLURB lives inside the preview subtree and those blurbs use exactly the words an empty
state uses ("nobody wants", "so nothing is left implied", "if a day goes by empty"); and a
widget's own TITLE can too ("NOBODY'S BOOKED"). Strip the overlay before judging, and read the
number as a starting point rather than a verdict.

## One movable-panel implementation
`src/components/board/MovablePanel.tsx` — lifted out of GeneralJobsPage so the Keys panel
(which lives in BoardToolbar) and NodeSettings can use the SAME one. It clears `right` AND
`transform` when positioned: a panel docked by `translate(-50%,-50%)` centring would otherwise
jump by half its own size the instant left/top were set. `PANEL_POS` is module-level and
session-only on purpose — where a panel sits depends on the screen it was moved on.

## A pinned title is draggable, and stays pinned
It keeps its two-coordinate nature while dragged: sideways writes the BOARD `x` (divided by
zoom so it tracks the cursor), up-down writes the SCREEN `pinTop`. Anything else un-pins it
the moment you touch it. Committed once on pointer-up, never per frame.
`scratchpad/panels.mjs` asserts both — and then PANS the board and checks the title's y has
not moved, because "it can be dragged" and "it is still pinned" are two different claims.

## A job tile resizes like anything else
`Apartment.tileW/tileH`, absent meaning the shared default — so the field stays undefined on
almost every record instead of writing the same two numbers onto hundreds. They ride inside
`apartments`, which is ALREADY a persisted/exported/imported key, so the backup trio needs no
new entry; but they ARE in `updateApartment`'s `CANVAS_ONLY` set, because arranging the board
is not editing the job and must not bump `contentUpdatedAt`.

`tileSize(job)` is the single answer to "how big is this tile" and every place that needs a
job's BOX goes through it — snap targets, lasso hit-testing, world bounds, the minimap, the
fly-to, ghosts. `defaultPos`'s grid deliberately does NOT, or a board of resized tiles would
re-flow every time one changed. The gesture reuses the element resize state and handlers via
`resizeBox()`, so jobs and nodes can never drift apart on the next snapping change. Ghosts get
no handle: a ghost is the same record shown twice, and the size belongs to the job.

**`scratchpad/tileresize.mjs` also guards the harness's own trap**: `addInitScript` runs on
EVERY navigation, so seeding unconditionally overwrites what the app just saved and the
reload check fails, blaming the app. Seed only when the key is absent.

## Voice memos
Every note takes one: the worker portal thread, stage notes, the drawer's office notes, task
attachments (quick-add, the Tasks page, bulk add) and the board's own sticky notes and boxes
(which already carried `audioUrl`). An audio attachment RENDERS as a player everywhere —
stage notes, office files, the drawer's media viewer, the portal's pending chip, the task
chips. Getting the recorder in without the player is what made the feature read as broken:
you spoke into it and got back a grey download tile.

`src/data/voiceMemo.ts` is the mechanism (`useVoiceRecorder`, `squash`, `storeVoiceMemo`);
`src/components/ui/VoiceMemo.tsx` is only its face. A memo attaches as an ordinary audio FILE
on whatever attachment path the host already has — its own record field would mean a new key
in persist + export + import plus a second upload path to keep in step, for no behaviour a
file does not already have. Two traps already paid for: iOS Safari records mp4/aac and throws
on the webm Chrome prefers, so the container is negotiated (`pickMimeType`); and a memo stored
on Drive is a web VIEW link that an `<audio>` element can never play, so the player links out
instead of drawing a dead transport. The interaction is the familiar one on purpose — no third
party's artwork, icons or wording, and none should be added.

## The board snaps EVERYTHING, and the setting only means the grid
Neighbour snapping (edges and centres of every other node) is always on during a move or a
resize, for every node type; `snapToGrid` governs the grid alone. Guides are drawn live and
cleared on pointer-up. Thresholds are in SCREEN pixels divided by zoom — forget that and
things run away from the cursor at any zoom but 100%. EVERY finished stroke becomes its own
resizable node (`data.own`). The overlap rule was dropped: on a dense board — or at 25%,
where visually empty screen is crowded world — most scribbles silently stayed flat ink,
which read as "my drawing became nothing". The blocking problem that rule existed to avoid
is solved at the hit-test instead: a drawing node's container is `pointer-events-none` and
only a fat invisible hit-line over the ink catches the pointer, so a stroke across a tile
never stops the tile being clicked. The resize handles re-enable themselves with
`pointer-events-auto`.

## A drag carries the whole selection
`DragState.carryJobs`/`carryEls` — dragging any member of a mixed selection moves BOTH kinds.
They are separate maps because the kinds commit differently (`updateApartment` vs
`updateCanvasElement`, drawings re-laying their points). Grabbing a job used to move only the
jobs and leave the notes standing, which read as "I can't drag a group at all". Bins ride in
group RESIZE too — they are excluded from deletion as fixtures, and copying that idiom into
the group-handle filter had left a selection of bins with no handle at all.
`scratchpad/groupbugs.mjs` asserts all of it, including that a press at 25% zoom must land
INSIDE the shrunken world div — a small test board only covers the corner of the screen.

## Board tools toggle off
Pressing the tool you are already holding puts it DOWN and returns to Select (the board's
default, `useState<BoardTool>('select')`). Guarded so Select itself is a no-op — the board
must never end up with no tool. `handleToolPick` compares against `toolRef.current`, which is
assigned during render and is therefore current.

## Zooming out must never reveal room nobody asked for
`clampPanRef` used to allow a pan of `0..(viewport − world)` on each axis once the scaled
world was SMALLER than the viewport — a POSITIVE offset, i.e. blank space above and left of
the board's own origin. Zooming out therefore drifted the board off its corner and opened
emptiness over the planner whatever the expand toggles said. It now pins that axis to 0
unless `sideAllowed(expand, 'left'|'top')`, so the toggle means the same thing to zooming as
it does to dragging. `scratchpad/board.mjs` proves it by SHOVING the board down-right with a
middle-drag after zooming out — zooming alone leaves pan at 0 and would pass for the wrong
reason. Verified non-vacuous: the old clamp shoves to x=450 y=350.

## Board node types (v2)
`CanvasElement.type` is now `note | box | title | countdown | stopwatch | clipart | stroke`.
Default sizes differ per type (`NODE_DEFAULT_SIZE`) — not everything is the same size.

### Pinned titles — the coordinate rule
A pinned title keeps its **board X** (so it pans and zooms sideways with the column it labels) but holds
a **fixed screen Y**, and still **scales with zoom**. Getting small when zoomed far out is the intended
behaviour, per the owner's explicit ruling.
- Because its hit box is in VIEW space while tiles are in WORLD space, it renders in its own
  always-on-top layer (`PinnedTitleLayer`) **outside** the transformed world div. Put it inside and lasso
  selection — which works in world space — would select a title that is visually somewhere else.
- Sliding off-screen horizontally when panning far is accepted, also per explicit ruling.

### Strokes
Freehand drawing stores **one record per stroke** as a world-space polyline, never one per point — that
would flood both the store and Firestore. Rendered inside the world layer so it pans and zooms with
everything else.

### MiniMap
Bottom-right, and only shown once the board exceeds the viewport. Draws the world shrunk to fit with a
rectangle for the visible area; click or drag to jump. Deliberately built AFTER zoom/pan, since it needs
a viewport rect to draw — building it first would have meant building it twice.

## Job Board canvas — zoom & pan (v2)
- **Transform viewport, not native scroll.** A fixed frame (`viewportRef`) with `overflow-hidden`; the
  world div inside carries `translate(pan) scale(zoom)` with `transformOrigin: 0 0`. Mixing native
  scrolling with transform panning is the classic source of jitter and misplaced hit-testing — there is
  exactly one movement system here.
- **`toWorld(clientX, clientY)` is mandatory.** `getBoundingClientRect()` returns the SCALED rect once
  zoom is applied, so any handler using raw `clientX - rect.left` moves tiles at the wrong speed at any
  zoom but 100%. All six pointer handlers were converted; **zero** raw-coordinate sites remain.
- **Wheel is registered manually with `{ passive: false }`.** React's `onWheel` prop is passive in several
  browsers, where `preventDefault()` silently does nothing and the *browser* zooms instead of the board.
- Bindings: `Ctrl/⌘+wheel` zooms (cursor-anchored), plain wheel pans, `shift+wheel` pans sideways,
  **space-held or middle-mouse drag** pans. Ctrl+drag was deliberately NOT used for panning because
  `Ctrl+click` on a tile is already add-to-selection.
- Zoom is **discrete** (25/33/50/67/75/100/125/150/200/300%) — text renders far better and text editing
  behaves. Verified: a world point maps to the same world point at every zoom, and zooming keeps the
  point under the cursor fixed.

## General Jobs Page (`/jobs`)
- Only rendered when `currentProjectId === 'general'`
- Free-form canvas with dotted-grid background (22px grid)
- **Job tiles**: `TILE_W=215, TILE_H=132` — show job name, stage dot, stage badge, address, Zoho/Drive links, pending task count
- **Drag**: pointer events with `setPointerCapture`; short press = open drawer, move >4px = drag; delta-based multi-tile drag
- **Lasso select**: pointerdown on canvas background draws a selection rect; tiles/elements overlapping it get selected
- **Ctrl/Cmd+click**: toggles individual tiles in/out of selection
- **Right-click context menu**: Duplicate, Change Color, Delete (operates on all selected if multiple selected)
- **Color picker**: 9 tile colors, 8 note colors, 6 box colors shown as a swatch grid
- **Note button**: creates a `CanvasElement` type='note' (sticky note, 165×150, editable text, 8 color options)
- **Box button**: creates a `CanvasElement` type='box' (section box, 320×220, resizable via bottom-right handle, editable title)
- **Double-click** any note/box to edit text inline via `<textarea>`
- **Delete key**: removes selected tiles/elements; **Escape**: clears selection
- **Add Job modal**: collects name, address, Zoho link, Drive link (all optional)

## Contractor Portal
- Public URL: `/c/:token` — no auth required, token-based access
- Contractors have category: `'drywall' | 'ac' | 'general'`
- Each contractor has a unique random token; link is copyable from Settings > Contractors
- Assignments link contractor → apartment with task description, stage, due date, priority
- Two tabs: **My Tasks** (assignment cards with countdown badges) and **Building Map**
- Building map highlights assigned apartments with gold glow; filter buttons: All / Overdue / Today / Tomorrow / This Week
- Each highlighted cell shows a tiny schedule label (Today / Tomorrow / Overdue / date) at cell bottom
- Contractor can upload photos, videos, and files; per-task office notes (`ContractorNote` with `authorType === 'office'`) visible read-only
- **Apartment-level `generalNotes` are NEVER shown to the contractor** — only the task description and per-task notes. (The old "From Office" block that rendered `apt.generalNotes` was removed.)
- **Apartment `address`** (when set) is shown under the apartment title in the task detail sheet
- **Completed button is disabled until at least one file exists**
- Engineering Plans PDF shown in task detail sheet when `apartment.plansPdfLink` is set (the admin picks which PDF via the drawer's plan chips — see ApartmentDetailDrawer)
- **Upload priority**: Firebase Storage (primary) → Google Drive backend (fallback) → local base64 (last resort)
- Images compressed client-side (max 1200px, 72% JPEG blob) before upload to Firebase Storage
- `ContractorPhoto.fileType`: `'image' | 'video' | 'file'` (default `'image'` for backward compat)
- `ContractorPhoto.storageUrl`: Firebase Storage download URL — any device can load directly from this URL
- `ContractorPhoto.storagePath`: Firebase Storage path used for deletion
- `ContractorPhoto.fileSizeBytes`: tracked for quota accounting (`totalStorageBytes` in settings)
- `MediaItem` renders `storageUrl` as direct `<img>`/`<video>` src; blue badge = Firebase, green badge = Drive

## Backup / Restore
- **Export**: full JSON snapshot of all app data including photos (Settings > App > Backup)
- **Import**: upload JSON to fully restore state
- Version field in export for forward-compat checks
- **Backup frequency**: `'activity' | 'daily' | 'weekly' | 'monthly'` — controls how often auto-snapshots fire
- **Backup history log**: `BackupLogEntry[]` — each export logs filename, size, trigger type, timestamp
- **Drive backup**: `/api/drive-upload.js` + `/api/folder.js` — backup JSON uploaded to Google Drive via service account (no OAuth needed)
- `BackupLogEntry`: `{ id, createdAt, filename, sizeBytes, triggeredBy: 'manual'|'auto', driveUrl? }`

## Key Conventions
- **No DATA_VERSION bump** without explicit need — it wipes all user data
- All store mutations call `persist(get)` + `fsSet(...)`/`fsDelete(...)` for Firebase sync
- Binary fields (`dataUrl` on photos, office files, task attachments) are stripped before Firestore writes; merged back from localStorage on read
- **`fsSet` sanitizes `undefined` → `deleteField()`**: before every Firestore write, `undefined` values in the payload are replaced with `deleteField()` sentinels. This ensures optional fields that are cleared actually get removed from Firestore documents rather than being silently preserved by `merge: true`.
- App settings (backupFrequency, backupDriveFolderLink, contractorUiStrings, autoBackup) live in `settings/app` Firestore document
- Loggable fields (those that appear in activity log): `currentStageId`, `classification`, `generalNotes`, `displayName`
- **`isCountableApartment(apt)`** (`src/types/index.ts`): the single rule for "is this a real unit?" — `!isUnnamed && (apartmentNumber || displayName)`. Blank placeholder slots (basement/lobby/ground spaces nobody has named) are scaffolding and never count; naming one clears `isUnnamed` so it starts counting. Every total on the Dashboard, Project Diagram, Analytics, Reports and Tasks pages uses it, so they can never disagree. Expected countable totals: **Wolfson 168** (56 × 3), **Netiv 72** (36 × 2), plus any slots that have been named.
- **`scopeApartmentsToProject(projectId, apts, buildings)`** (`store.ts`): filters apartments to the current project's own building ids (General → `buildingId === 'G'`). Applied at **all four** entry points — startup, `setCurrentProject`, the initial Firestore merge, and the live `apartments` listener. This exists because renaming Netiv's buildings (N1/N2 → B1/B2) left the old records in Firestore and localStorage, so the project carried two full copies of itself and every count doubled (72 → 144). Orphans from any future rename are dropped automatically. `migrateNetivApartments()` additionally deletes stale unnamed slot records whose ids are not in `NETIV_SLOT_IDS`, since a leftover slot can occupy a real apartment's grid position and hide it.
- **`aptLabel(apt)`** (`src/types/index.ts`): the canonical apartment label. A family name NEVER replaces the apartment number — it is appended (`"37 — Artzi"`), and collapses to just the number when `displayName` is blank or equal to the number. Used in the contractor portal, tasks, calendars, reports and global search. The building diagram renders the same idea as two lines (number bold, family name beneath) rather than one string.
- **Merged cells in the diagram**: `mergedLabels` combines apartment NUMBERS only (`"37/38"`); the shared family name renders once on its own line, so a linked pair never shows its name twice.
- CSS colors: primary `#1e3a5f` (navy), accent `#4aa8d8` (blue), amber for Changes badge
- Always use Tailwind utility classes; only reach for inline `style` for dynamic/computed values
- Contractor token generation: `generateToken()` → 24-char alphanumeric random string
- `getDueBadge(dueDate)` is always defined inside the component body (not at module level) — uses `s.overdue/today/tomorrow/daysLabel`
- **Tooltip component** (`src/components/ui/Tooltip.tsx`): `<Tooltip text="…" side="top|bottom|left|right">`. Uses CSS `group/tip` hover pattern, `z-[200]`, renders nothing when `text` is empty. Applied to all icon-only buttons throughout the app.
- **Always update this CLAUDE.md** when new types, pages, or conventions are added
- **Plain language only in all responses** — no code blocks in conversation, talk naturally to the user

## Tasks Page
- Route: `/tasks` — requires auth, accessible via sidebar (ClipboardList icon, between Dashboard and Analytics)
- Full CRUD for contractor assignments: create, inline edit, mark complete/incomplete, delete
- Filter by contractor; sorted incomplete-first then by due date
- Countdown badges via `getDueBadge()` (inside component body) for overdue/today/tomorrow/within-3-days tasks
- Task creation supports file attachments (`TaskAttachment[]`) via Paperclip button in `QuickAddTaskPanel`
- Task edit form shows existing attachments via `editAttachments` state with hover-reveal × remove buttons
- **Bulk task creation**: `BulkAddTaskModal` lets you create the same task for many apartments at once with per-apartment Drive folder routing
- **List / Calendar toggle** (`view` state): the calendar option renders `TaskCalendar` (shared month-grid component) with the page's filtered tasks plotted on their due dates, colored by contractor category. Clicking an event switches back to list view and opens that task's inline editor. The Tasks page is project-scoped, so this is the per-workspace month view.

## Global Calendar (`/calendar`)
- `GlobalCalendarPage` — a month calendar of **all workspaces' tasks combined**. Opened via the calendar icon in the Header (right of the project switcher, after a divider).
- Cross-project data comes from `loadAllProjectsTaskData()` in `store.ts`, which reads each project's `${id}_app_data` localStorage (kept current by `persist()`); the active project's entry is overlaid with the freshest in-memory store data.
- Filters: project (All + each), contractor, show/hide completed. Clicking an event calls `setCurrentProject(projectId)` (if needed) then navigates to `/tasks`.
- **Limitation**: non-active projects show whatever was last cached locally on this device (only the active project syncs live with Firestore).

## TaskCalendar component (`src/components/tasks/TaskCalendar.tsx`)
- Shared month-grid calendar. Props: `events: CalendarEvent[]`, optional `weekdayLabels`, `todayLabel`.
- `CalendarEvent`: `{ id, date (yyyy-MM-dd), title, subtitle?, color, completed, onClick? }`.
- Renders day cells with colored event chips (accent = `color`); completed events are struck-through/dimmed. Month nav + "Today" button. Cells scroll internally when a day has many events.

## ApartmentDetailDrawer
- 5 tabs: **details** / **tasks** / **stages** / **history** / **photos**
- **No Save button on the details tab — everything saves itself.** Text fields (family name, address, Zoho, Drive link, general notes) save on `blur` via `autoSave()`. The stage picker saves on `change` via `handleStageChange()`, and the classification toggle via `handleClassificationChange()` (a targeted `{ classification }` write). The two decision modals are therefore triggered by the *change* itself, not by a save click: clearing the stage to "Not started" raises the keep-vs-clear stage-history modal, and setting a new stage raises the "assign a task?" modal. `doSaveBasic(clearHistory, explicitStageId?)` takes an explicit stage id because React has not flushed `setCurrentStageId` yet when called from the `<select>`'s `onChange`.
- **Tasks tab**: shows all `ContractorAssignment` records for that apartment; pending badge on tab button; mark complete inline; attachment thumbnails; Add Task / Bulk Add Task buttons open `QuickAddTaskPanel` / `BulkAddTaskModal`
- `getTaskDueBadge()` helper defined inside component (mirrors `getDueBadge()` logic)
- **Photos tab**: loads Drive folder contents via backend API when `driveLink` is set; lightbox viewer
- **Unmerge flow**: `unmergeTarget` state captures partner apartment at modal-open time (prevents modal disappearing due to Firebase re-renders). `handleConfirmUnmerge` calls `unmergeApartments` which sets `mergedWith: undefined` on both apartments — the `fsSet` sanitizer ensures this actually removes the field from Firestore.
- **Address field**: shown in ALL drawers (building projects get a dedicated Address input under the top row, above general notes; General Jobs shows it in its address/zoho/drive block). Saved via `autoSave` on blur; surfaced to contractors in the portal.
- **Engineering Plans plan chips**: when a Drive folder has multiple PDFs, the chips let the admin pick one. Clicking a chip now **persists `plansPdfLink` immediately** (`updateApartment(...)`), so the chosen plan is the one shown to the contractor — no separate Save needed.
- **General Jobs mode** (`isGeneralProject`): hides apt#, classification, Settings collapsible; shows address/zoho/drive fields; stage picker now includes global stages plus General-specific stages; Engineering Plans + task assignment work the same as building projects

## GlobalSearch
- Triggered by Cmd+K (Mac) or Ctrl+K (Windows/Linux)
- Searches: apartment `displayName`/`generalNotes`, stage notes text, task descriptions, contractor notes
- Result type badges: Apartment / Task / Stage Note / Contractor Note
- All data in Zustand state — no backend call needed
- Strings via `s.searchPlaceholder`, `s.searchTypeApartment`, `s.searchNoResults`, `s.searchStartTyping`

## Navigation & settings split (v2)
- **Home is the Job Board** — `/` redirects to `/jobs`, not `/project`.
- **Workspace identity colour**: `Project.color` (Wolfson `#b8860b`, Netiv `#0d9488`, Job Board `#7c3aed`).
  Rendered as a 4px rail down the left of the sidebar, the active sidebar item's fill, and the header
  chip. `projectColor(projects, id)` in `types/index.ts` is the accessor.
- **Two settings pages, one component.** `SettingsPage` takes `scope: 'project' | 'app'`:
  - `/settings` → **project** scope (sidebar gear): stages, buildings, contractor status sheet.
    A separate copy per workspace.
  - `/app-settings` → **app** scope (header gear): users, contractors, app (theme/backup/Firebase),
    language. Shared by everything, never changes with the workspace.
  - The contractor sheet card moved OUT of app settings into project settings — each workspace has its
    own contractor and its own sheet.
- **Calendars**: `/calendar` is the all-workspace one, reached from a labelled button beside search in the
  header. `/project-calendar` (`ProjectCalendarPage`) is scoped to the current workspace and lives in the
  sidebar under Dashboard.

## Settings Page Tabs
- **Stages** — add/edit/reorder/delete stages with color picker, `nameHe` Hebrew name field, description; filtered to current project (General sees only `projectId==='general'` stages, building projects see global stages)
- **Users** — manage admin users (name, code, role)
- **Contractors** — manage contractors, copy portal link, see token, category (drywall/AC/general)
- **App** — theme toggle, backup frequency, backup history log, Drive backup folder, export/import, Firebase test panel, Force Push to Firestore
- **Language** — edit all `ContractorUiStrings` fields (grouped by section), Reset to English / Reset to Hebrew presets, RTL toggle; `MAIN_UI_FIELD_LABELS` lists all admin string keys for reference

## Login / auth hardening
- `DEFAULT_USERS` in `initialData.ts` ships inside the public JS bundle, codes included. It exists **only** to bootstrap a brand-new deployment whose Firestore `users` collection is still empty.
- **Never authenticate against the seed when Firebase is configured.** On a browser with no localStorage the store falls back to `DEFAULT_USERS`, and because `startFirebaseSync()` only ran *after* a successful login, a seed code (`111111`, …) could log in to the live app. Fixed by `loadUsersForLogin()` + the `authReady` flag: `LoginPage` calls it on mount, the code inputs stay disabled until it resolves, and `login()` returns `null` outright while `isFirebaseConfigured && !authReady`. A failed fetch leaves `authReady` false — it must never fail open.
- Any change to the login flow must preserve this ordering: **real user list first, code check second.**

## Board bins & soft delete
- `Apartment.boardBin?: 'done'|'ready'|'archive'|'trash'` + `binnedAt`. Absent = on the main board.
- **Bins are organisational and fully independent of `currentStageId`** — a job can be at stage "Piping"
  and sit in Done. The two systems never interact.
- `moveToBin(id, bin|null)` only sets a field. **Nothing is ever destroyed or purged**, including Trash.
  `deleteApartment` remains the permanent cascading delete and is reachable only from the Trash window.
- `isCountableApartment()` returns false for a binned job, so board counts and dashboards exclude them
  while the record stays intact.
- `Apartment.contentUpdatedAt` is the "last edited" shown on tiles. `updateApartment` bumps it only when
  a non-canvas field changed (`canvasX/canvasY/tileColor/boardBin/binnedAt` are excluded), so tidying the
  board does not make every tile read "edited just now".

## localStorage Persistence
- **`persist(get)` is DEBOUNCED (250ms trailing).** It serialises the whole project, and is called from
  60+ mutations including some that once fired per pointermove. Any pending write is **flushed
  synchronously** on `pagehide`, `beforeunload` and `visibilitychange→hidden`, so closing the tab mid-edit
  cannot lose the last change. `persistNow()` is the undebounced worker; `flushPersist()` is exported.
- **`canvasElements` IS synced to Firestore** (`projectCollection(pid,'canvasElements')`) — added, updated,
  deleted, loaded, listened to, seeded on first run, and included in `forcePushToFirestore`. It was
  localStorage-only, which meant board notes and boxes existed on one device only.
- **Backup export/import covers `canvasElements` and `contractorSheetLinks`.** Both were missing, so a
  restore silently dropped board notes/boxes and the contractor sheet links. Import falls back to current
  state (not `[]`) for these, so restoring an OLDER backup cannot wipe them either.
- `persist(get)` in store: tiered save — first attempt keeps photos with Drive URL lean (`dataUrl: ''`); if quota still exceeded, strips ALL binary data and truncates logs
- `saveToStorage()` catches `QuotaExceededError` / `NS_ERROR_DOM_QUOTA_REACHED` and returns `false` so the fallback tier runs
- `activityLogs` capped at 200 in normal save, 50 in fallback; `backupSnapshots` capped at 5 / 0

## Google Drive Integration
- No client-side OAuth — uploads go through service account backend (`/api/drive-session.js`, `/api/folder.js`)
- `googleClientId` / `googleAccessToken` / `googleTokenExpiry` remain in Zustand for backward-compat but are not exposed in UI
- **Helpers in `src/data/driveApi.ts`**:
  - `isUploadBackendConfigured()` — checks `VITE_DRIVE_API_KEY`
  - `extractFolderId(url)` — pull folder ID from any Drive folder URL
  - `extractFileId(url)` — pull file ID from any Drive file/doc URL
  - `drivePreviewUrl(fileId)` → embed URL for iframe PDF viewer
  - `driveDownloadUrl(fileId)` → direct download link
  - `findOrCreateFolderViaBackend(parentId, name)` — finds/creates subfolder via `/api/folder`
  - `uploadFileViaBackend(folderId, file, onProgress)` — streams file to Drive via `/api/drive-session`
  - `checkFolderHealth(driveLink, plansPdfLink, token)` → `FolderHealth` — kept for read-only folder health checks
  - `getFolderNameViaBackend(folderId)` — reads a folder's own title via `/api/drive-files` with `metaOnly: true` (returns `{ folder }` instead of listing children); returns `null` on any failure
  - `familyNameFromFolderName(name)` — pure helper: returns everything before the first `" -"` (falls back to the whole title). `"Artzi, Avital - 1234 - notes"` → `"Artzi, Avital"`

### One-time bulk backfill (Settings → App → "Pull Family Names from Drive")
`DriveNameBackfill` in `SettingsPage.tsx` scans every apartment in the **current project** that has a `driveLink`, reads each folder title, and derives the family name. It is preview-first: nothing is written until the user picks an Apply button. Proposals are split into `fill` (current name is blank or equals the apartment number) and `replace` (would overwrite a real typed name, shown amber), so the safe subset can be applied on its own. Applying calls `updateApartment(id, { displayName }, user)` — only the family name is written, no other apartment field is touched. `displayName` *is* in `syncedFields`, so a merged partner receives the same name (intended: a linked pair is one home). Requests run in chunks of 5 to stay gentle on the Drive API. Hidden for General Jobs.

### Auto-fill family name from Drive folder
Apartment Drive folders are named `Family, First - <extra>`. When a **new** Drive folder link is saved in `ApartmentDetailDrawer` (either the input's `onBlur` or the Save button), `autoFillFamilyNameFromFolder()` fetches the folder title and writes the derived family name into `displayName` via `updateApartment`, then toasts it. It is skipped for General Jobs (`isGeneralProject`) and when the derived name is empty or unchanged. It only fires when the link actually changes, so a manually-typed name is never clobbered by an unrelated save.

## Firebase Storage (Photo / File Uploads)
- All contractor photo uploads go to Firebase Storage under `contractorPhotos/{assignmentId}/{uid}.{ext}`
- `fsUploadFile(path, blob, onProgress)` in `firebase.ts` — uses resumable upload with progress callback
- `fsDeleteFile(path)` in `firebase.ts` — called on photo delete to free storage
- `totalStorageBytes` tracked in state + `settings/app` Firestore doc; updated on every add/delete
- Admin **Header** shows an amber warning banner when storage exceeds 80% of the 5 GB free tier
- Admin **Header** shows a `CloudSyncBadge`: spins "Saving…" while any `fsSet`/`fsDelete`/`fsBatchSet` is in flight, turns green "Saved ✓" for 3 s after all writes complete, then hides. Uses `subscribeCloudSync()` from `firebase.ts` (no Zustand state needed). Hidden when Firebase is not configured.
- Firebase Storage security rules must allow public read + write on `contractorPhotos/**` (no Firebase Auth used)

## Firebase Sync (Full)
All collections are synced to Firestore in real time:
- `apartments`, `stageNotes`, `stages`, `users`, `activityLogs`
- `contractors`, `contractorAssignments`, `contractorNotes`
- `contractorPhotos` (metadata only — `dataUrl` stripped; merged from localStorage on read)
- `officeNoteFiles` (metadata only — `dataUrl` stripped)
- `settings/app` document: `autoBackup`, `backupFrequency`, `backupDriveFolderLink`, `contractorUiStrings`

**Per-project collections** are namespaced: Wolfson uses bare names (`apartments`), other projects use prefixed names (`netiv_apartments`, `general_apartments`). Helper: `projectCollection(projectId, base)` in `firebase.ts`.

**GLOBAL collections are ALWAYS bare, in every project**: `stages`, `users`, `contractors`, and the `settings/app` doc. These are shared across all three workspaces, so they must never be wrapped in `projectCollection()` — not in `fsGetAll`, not in `fsListen`, not in `fsBatchSet`/`fsSet`. Every mutation action (`addStage`, `addUser`, `addContractor`, `setAutoBackup`, …) already writes them bare; reading them through `col()` caused newly-added stages/users/contractors to be silently dropped on the next load in Netiv and General (written to `stages`, read back from `netiv_stages`). `hasFirebaseData` in `startFirebaseSync()` must therefore be computed from **project-scoped** signals only (`apartments`, `contractorAssignments`, `stageNotes`) — the global collections are non-empty as soon as any project has synced and would otherwise mask a brand-new project's first-run seed.

`startFirebaseSync()` (called on login and on project switch):
1. Loads all 11 collections in parallel
2. If data exists → merges binary fields from localStorage and sets state; seeds any missing apartments to Firestore
3. If empty → pushes entire localStorage snapshot as first-run seed
4. Attaches real-time listeners on all collections

**Listener pattern — Firebase always wins:** All real-time listeners use the simple "Firebase wins" pattern — no `updatedAt` timestamp comparison. When Firestore sends an update, the listener replaces the local version with the Firebase version unconditionally (local only kept for items not yet in Firestore). This is what makes cross-device sync reliable. Never reintroduce `updatedAt` tiebreakers in listeners — they caused apartments to silently block incoming updates.

`forcePushToFirestore()` action: pushes ALL current in-memory state to Firestore. Accessible via Settings → App → "Force Push Local → Cloud" button. Use this to recover from a state where local data is ahead of Firebase.

`fsDelete(collectionName, docId)` in `firebase.ts` — used by `deleteContractor`, `deleteContractorAssignment`, `deleteContractorPhoto`, `deleteOfficeNoteFile`, and cascade deletes.

**`fsSet` and `deleteField()`**: Every call to `fsSet` sanitizes the payload — any key whose value is `undefined` is replaced with Firestore's `deleteField()` sentinel before the write. This ensures that optional fields that are cleared (e.g. `mergedWith`, `driveLink`, `plansPdfLink`) are actually removed from the Firestore document, not silently preserved by `merge: true`.

**No custom Firestore cache**: Uses plain `getFirestore(app)` — no `persistentLocalCache` / `persistentMultipleTabManager`. The app's own localStorage (`persist()`) handles offline caching; Firestore's built-in IndexedDB cache was causing `onSnapshot` to misbehave on mobile browsers (listeners receiving stale cached data instead of server updates).

**Setup**: copy `.env.example` to `.env.local` and fill in `VITE_FIREBASE_*` vars (or set in Vercel dashboard)

---

# v2 — TzviAir Job Management Platform (branch `claude/tzviair-platform`)

Full decision record in `DECISIONS.md`. Plain-language summary for the office in `UPDATE-FOR-ESTHER.md`.

## Board architecture (`src/pages/GeneralJobsPage.tsx`)

### One movement system
The viewport is a fixed frame with native scrolling **off**; the world inside is `translate(pan) scale(zoom)`.
Mixing native scroll with transform pan is the classic source of jitter and misplaced clicks, so there is
exactly one system. **Every pointer handler must convert through `toWorld(clientX, clientY)`** —
`getBoundingClientRect()` returns the SCALED rect once zoom is applied, so raw deltas move tiles at the
wrong speed at any zoom but 100%.

### Hook order
`GeneralJobsPage`'s redirect guard sits **after every hook**, including the ones inside the wheel,
keyboard and touch effects. Returning earlier changes the hook count between renders whenever the
workspace switches while the page is mounted. Do not move it back up.

### Bins are CanvasElements
The four bins (`done` / `ready` / `archive` / `trash`) are ordinary `CanvasElement` records carrying a
`binKind`, so they move, resize and sync like any other node. They are seeded once with **fixed ids**
(`CE-bin-done`, …) so a later Firestore load overwrites rather than duplicates. They are excluded from
deletion in both the context menu and the Delete key — they are fixtures, not content.
**Bins are completely independent of stages**: a job can be at stage "Piping" and sit in Done.
Nothing in Trash is ever purged.

### Ghosts
`Apartment.ghosts: {x,y}[]` — extra board positions for the **same record**, not copies. Editing through
a ghost edits the job; dropping a ghost on a bin bins the job; removing a ghost removes only that
appearance. Store actions: `addGhost`, `moveGhost`, `removeGhost`.

### Drawing
Pen and highlighter are **modes**. While either is armed, a press on a tile starts a stroke rather than a
drag (`startStrokeAt`), and the canvas takes pointer capture so the stroke keeps receiving moves.
**One `CanvasElement` per stroke**, never one per point.

### Right-click paste
`src/data/pasteIntent.ts` classifies the clipboard; the menu offers exactly one matching action and never
a generic Paste. On a node it fills the field, asking first if that field already holds something. On empty
board a Drive or Zoho link offers to create a job, with the family name pulled from the Drive folder title.

### Board settings & layouts
`boardSettings: Record<projectId, BoardSetting>` in `settings/app`. The reserved key **`__tv`** holds the
wallboard defaults (`tvLang`, `tvScale`) — write it with `setTvSetting`, not `setBoardSetting`.
`boardLayouts: Record<projectId, BoardLayout[]>` stores **positions only**, capped at 10 per project;
restoring can never undo an edit or resurrect a deleted job.

## TV wallboard (`src/pages/TvPresentationPage.tsx`)
- **Always read-only. Not a setting, not a PIN.** Every edit happens from a PC on the normal link.
- It lives outside `AppLayout`, so it **must call `startFirebaseSync()` itself** — otherwise it shows
  only that browser's localStorage, which on a fresh TV browser is nothing.
- Switching project calls `setCurrentProject`, which is required because each project's records live in
  their own collections. That write is local to the TV's browser.
- **Display scale is `autoScale × boost`**, where `autoScale = max(1, viewportWidth / 1600)` and `boost`
  is the slider (default 1). The multiplier is what makes one setting work on every panel: a tile spans
  the same fraction of the screen on 1080p, 1440p and 4K. Verified in a harness — do not replace this
  with a fixed pixel number.
- Building projects render `BuildingDiagram`; only General renders the free canvas.

## Punch-list pins (`src/components/apartment/PlanPinOverlay.tsx`)
`PlanPin` stores **percentage** coordinates against the apartment. The PDF in Drive is never modified —
office and contractor draw the same overlay from the same data. The overlay is `pointer-events: none`
unless placing is armed, or the PDF could not be scrolled. The portal passes `readOnly`. There is no
flattened-PDF export (a browser cannot read a cross-origin PDF's pixels); there is a printable numbered
punch list instead.

## Backups — the rule that keeps being broken
Every data-bearing state key must appear in **all three** of:
1. the `payload` in `persistNow`
2. the `snapshot` in `exportData` — **at the top level**, next to `apartments`, NOT inside `settings`
3. the `set()` in `importData`, read as `data.<key> ?? state.<key>`

Two faults were found and fixed by auditing this: four board keys were exported inside `settings` while
the importer read them from the top level, and `buildings` / `dashboardWidgetOrder` /
`dashboardHiddenWidgets` were absent from export and import entirely. **When you add a state key, add it
to all three places and re-run the audit.**

## New store actions
`moveToBin` · `addGhost` / `moveGhost` / `removeGhost` · `setBoardSetting` / `setTvSetting` ·
`saveBoardLayout` / `restoreBoardLayout` / `deleteBoardLayout` · `addPlanPin` / `updatePlanPin` /
`deletePlanPin` · `loadUsersForLogin`

## New per-project Firestore collection
`planPins` — namespaced through `projectCollection(pid, 'planPins')` like every other per-project
collection. `stages`, `users`, `contractors` and `settings/app` remain **bare in every project**.


---

# v2 — later rounds

## Board node model

Every node type is draggable and **resizable** (minimums differ per type: clip art
24px, a title 80×28, a section box 120×80). The resize delta is divided by `zoom`,
or the corner runs away from the cursor at any zoom but 100% — the same trap the
tile drag once fell into.

`BoardItems.tsx` holds the two memoised repeated items (`JobTile`, `BoardNode`).
They take **value props** and one `handlers` object created once via a ref, or
memoisation is defeated and a drag re-renders the whole board. Measured on 200
jobs / 80 widgets / 800 tasks: 0.9ms median per drag frame.

**The node must carry `group`.** Its action buttons are `opacity-0
group-hover:opacity-100`; without the class they only appear when the pointer is
already exactly on an invisible button, which reads as "the buttons don't work".

## Attaching and connecting

`AttachLayer.tsx` draws two things whose positions are **derived, never stored**:

- **Attached clip art** (`attachedTo` + `attachAt` as fractions) has no position
  of its own — it has the host's plus an offset, which is why it travels when the
  host moves and cannot drift out of step.
- **Arrows** (`type: 'arrow'` + `fromId`/`toId`) have no position at all, only two
  ends. Recomputed from live host boxes every render.

`hostBoxes` in `GeneralJobsPage` is the map of everything attachable, built from
live positions **including a tile mid-drag**.

## Controls (settled)

Left-drag empty board **pans**. Ctrl/⌘+drag **lassoes**. Click a job opens it,
drag moves it. Space-drag and middle-drag still pan. Pen/highlighter are modes and
take a press on a tile as the start of a stroke. Zoom lives in the page header
(−, +, typeable %, 100%, Fit) — there is no second copy.

## Widgets

`src/data/widgets.tsx` — 47 entries in four groups. A widget is a `CanvasElement`
with `type: 'widget'`, a `widget` id and a free-form `data` bag, so it inherits
drag/resize/colour/TV/sync/backup for free. **Clip art is NOT a widget wrapper** —
placing an `art-*` store entry creates a real `type: 'clipart'` node, which is what
lets it attach.

`withSampleData(ctx)` fills in only the fields that are genuinely empty — the
BOARD-side semantics, unchanged. **The STORE no longer calls it on real data:
the shelf previews on `fullSampleCtx()`** (the same machinery over an empty
context), by the owner's explicit ruling — his sparse real workspace made half
the shelf preview its empty/all-clear state ("Due today · 0", a bare search
box), and "no one can understand how they will actually look when data is
full." A placed widget still reads the real data; only the shelf is fake.
Three rules the machinery must keep, each of which was broken and showed as a
preview that looked like a fault rather than a sample:
- **Sample rows are re-pointed at whatever is really there — but ONLY when the
  jobs/contractors are real.** When both sides are samples the tasks already
  point at exactly the jobs they were written for, and re-pointing by index
  scrambled the pin/note/photo chains that hang off those pairings.
- **The sample planner is built from the resolved jobs and people**, not from
  sample ids, for the same reason. `WidgetCtx.boardElements` exists so
  `Out today` / `Tomorrow` can read a planner on the shelf, where there is no
  board; they fall back to the store everywhere else.
- **Photos only stand in when jobs and tasks are samples too** — a real photo is
  found through its task to its job, so mixing gives pictures belonging to
  nothing and a photo wall that draws nothing.

## The widget shelf shows the widget, not a description of it
Cards are **340×240** and the scale cap is 2.4. The median widget is 235×165, so
the old 226×150 card scaled almost everything DOWN — you were shopping from
thumbnails of the thing rather than the thing. Four across a wide panel, not six.

Only the NAME is on a card at rest; the blurb and the Add button live in an
overlay that appears on hover. Seventy-three descriptions on screen at once is
not seventy-three times the help — it is a wall of grey text you read past to
reach the pictures.

`pickedForPreview` supplies the choice for the widgets that open with a picker
(`board-mini`, `project-glance`, `project-mini`). Only the shelf knows which
workspaces exist, and it prefers one this machine has a stored snapshot for — a
card reading "Nothing stored for Netiv on this machine" is honest on a board and
useless on a shelf. It now also passes `sample: true`: each of the three draws a
busy canned preview (footed "sample data") when the picked workspace has nothing
stored, and `BoardMini` **auto-fits its first view to the content** (`touched`
ref guards user pans) — the fixed 34%-at-origin view is what made the owner's
own board preview as an empty dotted field. The two Find-a-job widgets read
`data.sampleQuery` (seeded by `WIDGET_PREVIEW`) so their previews show RESULTS —
a preview cannot be typed into. `scratchpad/storefull.mjs` audits every card;
its one standing false positive is `nobody-booked`, whose healthy rows say
"no task".

**The store's shelves** (`SHELF` + `SHELF_ORDER` in `WidgetStore.tsx`): one
single-level, hand-assigned map by what a widget is FOR — Chasing the work ·
Catching problems · Counts and progress · Finding and following · People and
the week · Photos, map and weather · Clocks and timers · Your own lists and
tools · Other workspaces · Decoration and fun. The old Live/Planning/Reference/
Looks chips and the SUBGROUP map are gone (that was the code's taxonomy, not
the shopper's); `WidgetDef.category` remains on the type but nothing groups by
it. Unmapped ids fall to a MORE shelf; clip art is caught by its `art-` prefix.
**Add a widget → add it to SHELF** or it lands in More. A tiny
`Categories | One list` toggle in the header (persisted per machine,
`widget_store_layout`) switches between the shelves and one flat grid. The
bottom "From your other workspaces" cards render the real `project-glance`
preview per workspace (live when this machine has the snapshot, sample when
not) instead of a logo on a tinted box.

`todayIso()` in `tvWidgets.tsx` must use the planner's `iso()`. It was
`toISOString().slice(0,10)` — the UTC date — while the planner writes local
dates, so in Israel every night between midnight and 2 or 3am the wall asked for
yesterday's row and showed the wrong people.

## Project layout joins

`projectLayout.ts`. A join is a **mutual link by `uid`**, never by index —
inserting a floor or column shifts every index and would silently re-point a
positional link.

| | homes | numbers | counts | record |
|---|---|---|---|---|
| `duplex` | 1 over 2 floors | 1 | once | one, `isDuplexApt` |
| `connected` | 2 knocked together | 2 | twice | two, bilateral `mergedWith` |

`isDuplexUpper()` is the single test for "the half that is not its own home" and
gates counting, numbering and record generation. `joinRefusal()` returns the
reason a join cannot be made, so the UI can disable with an explanation.

There is **no `stairwell` kind**. An empty position is a `gap`.

## Settings

- `/settings` (project scope) wears the workspace colour; `/app-settings` is
  neutral. They looked identical, which made navigating between them read as
  nothing happening.
- App settings tabs: **Projects** (create a workspace with the builder), Users,
  Contractors, TV, App, Language.
- The Job Board's project settings show **only Stages** — it has no buildings and
  no contractor sheet.
- `customProjects` in `settings/app`; a new workspace writes its **own** storage
  key and Firestore collections. `getDefaultBuildings/Apartments` seed **only** the
  three built-ins — anything else starts empty, or a new project inherits
  Wolfson's 168 apartments.

## The TV region

`tvView` in `boardSettings.__tv`. It defaults to a **screen-shaped slice**, not the
whole board: a box that fills everything has nowhere to move, and every drag
clamps back to where it started.

## Data safety — unchanged and non-negotiable
Every data-bearing key in **persist + export (top level) + import**. Re-run
`backup-audit` and the live round-trip after adding one.

---

# v2 — plan markup & printing

## Marking up a plan (`src/components/plans/`)

**Entry points**: the drawer's Engineering Plans block now has **View plan**, **Mark up** (with a `vN`
badge) and the existing Download. `Mark up` opens `PlanAnnotator` full-screen at `z-[150]`; `View plan`
opens the same component with `readOnly`.

- `PlanAnnotator.tsx` — the studio. **Lazy-loaded** from `ApartmentDetailDrawer` (`React.lazy` +
  `Suspense`) because it carries pdf.js.
- `penInput.ts` — `PenStroke` (pressure → contact size → speed, in that order), `samplesOf()`
  (coalesced events), `simplify()` (RDP, width-aware).
- `annotTools.ts` — `TOOLS` presets, `INK_COLORS`, `HIGHLIGHT_COLORS`, recent-colour memory.
- `pdfCompat.ts` — **import before pdf.js.** Shims `Promise.withResolvers` / `Map.getOrInsertComputed`.

### Rules that must not be broken
- **pdfjs-dist is pinned to 5.4.149** (`--save-exact`). 5.7+ and 6.x call
  `Map.prototype.getOrInsertComputed`, which **Chrome 141 does not have** — the plan renders blank.
  Before bumping it, grep the build for engine methods newer than Chrome 119 and test in a real browser.
- Three stacked canvases, all the same pixel size: PDF / committed ink / live stroke. The DPR goes
  into the **viewport scale**, not the context transform — doing both renders at dpr² and clips.
- Coordinates are normalised 0..1 (x across, y **down**). Widths are against a **1000-unit reference
  page**. The server (`api/plan-annotate.js`) uses the identical convention — change one, change both.
- `touchAction: 'none'` on the live canvas, or the Samsung panel pans instead of drawing.
- Tool hotkeys must bail while `textDraft` is open. Guarding on `e.target` alone is not enough.

### Server routes
- `api/drive-fetch.js` — POST `{fileId}` → **pipes** the bytes back. Never buffer; a real plan exceeds
  the platform's buffered-response cap.
- `api/plan-annotate.js` — POST `{planFileId, parentFolderId, strokes, version, jobName}` →
  stamps and uploads to an **Annotated Plans** subfolder. Exports `stamp()` for testing.
  - The markup goes inside an **optional-content group** (`/OCProperties`, `BDC /OC /ocMarkup … EMC`).
    Existing CAD layers on the plan are joined, never replaced.
  - Each page gets `/Group << /S /Transparency /CS /DeviceRGB >>` — **without it the highlighter's
    Multiply silently falls back to Normal** and paints over the linework.
  - The OCG name uses `PDFHexString.fromText`, not `PDFString.of` — a literal string is PDFDocEncoded
    and mangles the em dash (and would mangle Hebrew).
  - Freehand emits a new `w` + `m` whenever the width moves, so pressure survives into the file.

### Data
- `AnnStroke`, `AnnTool`, `PlanAnnotation` in `types/index.ts`. `pts` is **flat** `[x,y,w, …]`.
- `planAnnotations` is a per-project Firestore collection via `projectCollection(pid,'planAnnotations')`,
  wired at all 11 store points exactly like `planPins`.
- Actions: `savePlanAnnotation` (upsert by id) · `updatePlanAnnotation` · `deletePlanAnnotation`.
- Contractor portal shows a link to the **latest** markup PDF when one exists — a plain Drive link, not
  the studio, so a phone on site does not download the whole PDF to render it.

## Printing (`src/data/printing.ts`)
`printSheet(title, bodyHtml, opts)` · `printTable(title, rows, columns, opts)` · `printImages` ·
`printDot` / `printPill` / `printEsc`. Options: `subtitle`, `landscape`, `rtl`, `css`, `delay`.
Returns `false` when the popup was blocked, so the caller can say so.

**Never call `window.print()` on the app.** It prints the running UI — dark chrome, sidebar, and a
table clipped to its scroll container. The one legitimate exception is `ProjectDiagramPage`, which has
a purpose-built `print:` layout.

Print buttons live on: the markup studio, the drawer (job sheet), Tasks, Reports, `TaskCalendar`
(so both calendars get it — pass `printTitle` and `rtl`), Dashboard, the Job Board export menu, and
the contractor portal header.

## Backup rule — now with teeth
Re-running the audit after adding `planAnnotations` found `projectColors` and `customProjects` were
**read by the importer and never written by the exporter** — restoring a backup deleted every
workspace made with the project builder. Fixed, along with `backupLogs`.

Deliberately excluded from a backup, and why: `currentUser` / `currentProjectId` (session),
`googleClientId` (dead OAuth field), `lastAutoBackupAt` / `lastDriveExportAt` (schedule, restoring
them would be wrong), `backupSnapshots` (in-session restore points — the export *is* the backup).

**Add a state key → add it to persist + export (top level) + import, then re-run the audit.**
The audit no longer carries a hand-written key list — it reads `AppState` itself and requires every
key to be either checked or **explicitly excused with a reason**. The old list made the check useless
in exactly the situation it exists for: forgetting backups also meant forgetting the list, so it passed.

---

# v2 — reports, and search that leads somewhere

## `pendingFocus` — "show me this", across a navigation
`FocusIntent` in `types/index.ts`; `pendingFocus` / `setPendingFocus` in the store. Session-only, never
persisted, so it stays out of backups.

Search could find nine kinds of thing and only knew how to show one. A stage went to `/settings` —
where a stage can be RENAMED but not seen — and so did a worker. A result now carries **what it is**,
not a route, and the arriving page acts on it: a stage becomes the diagram's stage filter (or the
board's stage view), a worker becomes the task list filtered to them, a group opens, a board node is
flown to via the board's own `goToHit` so there is only ever one flight path.

**A page consumes ONLY the kinds it can show.** Clearing the intent first and checking the kind
afterwards looks tidier and is wrong: the diagram is mounted when the search runs, so it swallowed the
worker intent on the way to `/tasks`, which then arrived with nothing to do and drew an unfiltered
list. Check the kind, then clear.

## Reports (`src/data/reportModel.ts` + `ReportsPage`)
A builder, not a table somebody wrote once. Four parts, the CRM shape: a **subject** (what one row IS),
**fields** including ones reached across a join, **rules**, and a **grouping** — the grouping is what
turns a list into an answer.

- Subjects: Jobs · Tasks · Workers · Stage notes · Changes. `jobFields()` is written once and
  re-pointed, so "Address" means the same thing and prints the same way from any of them.
- **All the arithmetic is pure** — no store, no clock, no DOM. `today` is passed IN; a report that
  computes "overdue" from `new Date()` cannot be tested and cannot be reproduced tomorrow. There is a
  refresh button and the page says what date it is answering for.
- Counting goes through `isCountableApartment` and `liveAssignments` and **nothing else**, or a report
  and the dashboard disagree about how many jobs there are — both looking authoritative.
- Operators follow the field's TYPE. An operator that cannot apply is worse than a missing one: it
  silently returns nothing and reads as an empty report.
- Totals are **opt-in** (`ReportField.sum`), not "is it a number". The stats strip cheerfully printed
  "total floor: 12" — arithmetic that is correct, says nothing, and looks like a finding.
- An unknown column key is DROPPED and an unknown rule is IGNORED. A saved report outlives the field
  list; a blank column after an upgrade reads as missing data, and a rule matching nothing reads as an
  empty workspace.
- `savedReports: Record<projectId, ReportDef[]>` lives in `settings/app` — a report is a QUESTION, and
  the answer differing per machine is worse than not saving it.
- Out as CSV, a real `.xlsx` (via `src/data/xlsx.ts`), or print. Chart is bars drawn as divs; no
  library, because axes and tooltips are the reason to reach for one and there are none here.

Harnesses: `report` (engine, hand-worked numbers) · `reportui` (the controls reach the engine) ·
`searchgo` (every result kind lands somewhere it can be seen).

---

# v2 — board settings, named boards, editor rebuild

## The two bugs that made half the board feel fake
1. **`WidgetCtx.update` was `() => {}`** on the main board AND in bin boards. The
   signature takes a patch with no element id, so one shared context cannot know
   which node to write to — it had been stubbed to keep the context stable for
   memoisation. Every interactive widget silently discarded every edit.
   **`BoardNode` binds it per element** (`boundCtx`), which keeps memoisation and
   needed no change to any widget's render function. Never un-bind it.
2. **The pencil called `startEdit`**, which only sets `editingEl` — and the
   `isWidget ? renderWidget(...)` branch wins the ternary before `isEditing` is
   reached, so the button did nothing on all 47 widgets, every bin, countdowns
   and voice memos. The pencil is now `H.elSettings` → `NodeSettings`.

## NodeSettings + widgetFields
`src/data/widgetFields.ts` declares, per widget id, what can be configured
(`WIDGET_FIELDS`), what the store preview should show (`WIDGET_PREVIEW`,
`WIDGET_PREVIEW_COLOR`) and the shared type controls (`TEXT_STYLE_FIELDS`).
`NodeSettings.tsx` renders a form from that. **Add a widget → add its fields
here**, or its pencil opens an empty panel.

`WidgetDef.data` is the seed a NEWLY PLACED widget starts with and must stay
empty; `WIDGET_PREVIEW` is what the store draws. Reusing `data` for previews is
what made half the shelf blank.

## Clip art attachment
`attachAnchor` (`tl|tm|tr|bl|br`) + `attachScale` (a fraction of the host's
WIDTH). Position and size are both DERIVED in `attachBox()` — that is what makes
art resize when its host does. `AnchorHints` shows the five landing spots during
a drag. The hit box is the art itself; a halo blocks the tile underneath.
Legacy `attachAt` is read through `anchorOf()` and never written.

## Bins
`binKeyOf(bin)`, never `bin.binKind` — a custom group has no `binKind` and both
drop handlers used to refuse it. A bin may carry `stageId`: filing a job there
also sets its stage. `BinBoard` draws with the main board's `BoardNode`, so a
group cannot drift from the board again.

## Named boards (`BoardView`)
Boards were never per-user — `canvasElements` is a project collection, so a
workspace had exactly one board. A `BoardView` is a second surface in the same
workspace: nodes carry `board: viewId`, jobs carry `viewPos[viewId]`, and the
main board stays `board: undefined` + `canvasX/canvasY` so nothing existing
moves. `boardViews` lives in `settings/app`; `activeBoardView` is LOCAL
(localStorage) so switching does not move everybody's screen. Deleting a view
returns its nodes to the main board.

## Toolbar
`BoardSetting.toolbar: ToolbarSetup` — order, hidden ids, and widget ids
promoted onto the rail. Edited in project settings. The rail is two columns so
it stops reaching into the minimap.

## Plan editor
- Company navy/accent, `.ink-slider` / `.ink-hue` in `index.css`, and
  `InkPicker.tsx` (in-app HSV picker with KEPT colours) — never the OS dialog.
- Tools: move, pen, pencil, marker, highlighter, **eraser directly under it**,
  line, arrow, box, circle, bubble, text, pan. The hand tool is "Pan"; "Move"
  is the tool that picks marks up.
- `hits()` tests each mark AS ITS SHAPE. The old eraser only compared stored
  points, so a line or box could only be erased at its corners.
- The arrow's shaft stops at the head's base — on screen and in
  `api/plan-annotate.js`, from one geometry. Change one, change both.
- Ctrl/⌘+wheel is registered with `{ passive: false }` or the browser zooms.
- Escape backs out one panel at a time. Nothing ever prompts save-or-discard.
- Saving files into **Annotated Plans INSIDE the Engineered Plans folder**,
  named "annotated version N — date time — who", with the author in the PDF
  metadata and the OCG layer name.
- The chip row and the editor's Plans list read `findPlanSetViaBackend`: the
  plans folder's own PDFs plus its Annotated Plans child, and **no other
  subfolder**.
- The TV can mark up a plan and only that; `askWho` locks it until somebody
  picks a name.

---

# v2 — the 116-item round

## The planner (`src/components/board/PlannerWidget.tsx`)
Formerly `RotaWidget.tsx`, now deleted. People down the left, **Sunday to Thursday** across, weeks
stacked, each week with its own dated header. A cell is a **LIST of entries**, each either a linked job
or free words — the paper sheet has both in the same cell ("Pardes 8 am", "Davidian??"), so neither can
be second-class. Companion files: `PlannerDialogs.tsx` (task / remove / take-off) and
`ScheduleWindow.tsx` (every planned job in one scrollable window).

Dropping a job on a cell **references** it; the job stays on the board and can be on two people's rows
at once. `src/data/rotaDrop.ts` is the bridge: each mounted planner registers a probe answering "is a
cell of mine under this SCREEN point?", because a client rect already has the board's pan and zoom in
it. The board drags in world coordinates and the planner is CSS grid — neither re-derives the other's
maths.

**The drop gesture needs Select mode.** The board's default tool is Pan (settled earlier), where a drag
from a tile moves the board.

`personColor(name, chosen?)` in `types/index.ts` gives everyone a stable colour derived from their name
unless one is set. `Contractor.color` / `User.color` are set by clicking the avatar in app settings.

### Taking somebody off
`takeOffPlanner(data, personId, from)` · `putBackOnPlanner(data, personId)` · `slotsFrom(...)` are pure
functions on `PlannerData`, driven from the people picker in `NodeSettings`. Nothing is destroyed:
slots from the cut-off onward move into `offKept` and come back exactly as they were.

- **From a date, they stay in `people`.** The dialog promises the rest of that week draws greyed, and
  the widget draws that from `offFrom` — which it only consults for somebody it is still being asked to
  render a row for. Removing them from the list makes the row vanish on the spot. Only "everything,
  back to the start" takes the row away.
- **The row list and the slots must move in ONE `updateCanvasElement`.** The generic field writer
  spreads the `data` captured by that render, so a second write with the people array puts the
  pre-take-off data straight back and the whole operation silently undoes itself.
- **Their freed jobs are gathered into a labelled section box, never filed into a bin.** A binned job
  drops out of `isCountableApartment()` and therefore out of every total in the app — far more than
  "came off a rota" should ever mean.

## Contractor links must not depend on where you are standing
`src/data/portalLink.ts` — `portalLink(token, domain)` · `bareDomain()` · `looksLikePreviewHost()`.

A contractor link was built from `window.location.origin`, so it carried whatever address the office
happened to be on when they pressed Copy. That is right on the live site and silently wrong on a
preview build: **production deploys from the repo's default branch (`claude/blissful-cray-spTFY`) to
`wolfson-management-app.vercel.app`; every other branch only ever produces PREVIEW deployments**, and a
preview sits behind Vercel's own sign-in. So a link copied while using the v2 branch asks the
contractor to log in to Vercel, and 404s once that build is superseded.

`BoardSetting.portalDomain` (in the reserved app-wide `__tv` bag, so it inherits persist/sync/backup
with no new state key) names the live address. Set it and a link is the same link whoever copies it.
Settings → Contractors shows the resolved link and warns when it is being copied off a preview host.

`looksLikePreviewHost()` requires a DIGIT in the hash segment — without it the pattern read
"management" in `wolfson-management-app.vercel.app` as a build hash and called the live site a preview.
`scratchpad/portal.mjs` imports the real helper rather than restating the rule; the first version of
that test carried its own copy of the regex and only the copy got fixed.

## Node action buttons live ABOVE the node, not in its corner
The settings / remove / TV strip on a board node floats above the top edge (`bottom: 100%`). It used to
sit in the node's top-right corner, on top of whatever the widget drew there — the planner's "Today"
and "next week" were covered by Settings and Remove, so reaching for next week deleted the planner.
The strip is still a child of the node, so the hover that reveals it survives the pointer moving onto
it. `scratchpad/overlap.mjs` walks every control on every node kind and asserts
`document.elementFromPoint` at its centre is the control itself — run it after touching node chrome.

## Plan drawing — the one-fill rule
`src/components/plans/paintStroke.ts` holds `paintStroke()`, lifted out of PlanAnnotator because it is
pure and therefore testable against real pixels.

A freehand stroke is **ONE path**: a quad per segment plus a disc per point, all subpaths of one path,
filled once with nonzero. Per-segment stroking caused both drawing faults — a segment shorter than its
own round cap renders as a dot (beading), and every `stroke()` is a separate composite (darkening at
any opacity below 1). Grouping into runs is NOT enough; a genuinely varying width still gives many fills.
**The discs must wind the same way as the quads** or nonzero cancels and the line comes out dashed.
`api/plan-annotate.js` emits identical geometry. Change one, change both.

Measured: highlighter darkness spread along a band 98 → 0, marker at 55% opacity 55 → 0, screen and
stamped PDF agreeing exactly.

Also: two erasers (`eraser` cuts a freehand stroke and keeps both halves; `eraser-object` takes the
whole mark), neither with colour or opacity. Flipping the Samsung pen switches to the highlighter —
`NibWatch` in `penInput.ts` LEARNS this panel's two contact sizes and refuses to answer until it has
seen both. The balloon IS the text box (`bubbleTextBox` + `fitText` are shared by screen and PDF so the
words cannot jump). The wheel always zooms, towards the pointer; two fingers pinch.

## Shared widgets
- `MiniJob` (`components/board/MiniJob.tsx`) — the one row used everywhere a job is listed: stage dot,
  name, open-task count, Drive light. Used by Running late, Due today, Job list, New this week, Find a job.
- `DashWidgets.tsx` — `ProjectMini`, `BoardMini`, `CalendarMini`. They live outside `widgets.tsx`
  because each needs another workspace's data or the router, and `WidgetCtx` is scoped to one
  workspace on purpose.
- `CanvasElement.outline` / `outlineWidth` — any node can wear an outline, drawn as its border so no
  size changes. "None" must stay reachable.

## The dashboard is a board
`DASHBOARD_BOARD = '__dashboard'`. Its widgets are ordinary `CanvasElement`s carrying that board id, so
they persist, sync, export and import with **no new store points**. Laid out on a 12-column grid
(`el.w / 100` = span), not a free canvas, because a dashboard must reflow.

## The counting rule, restated
`isCountableApartment()` is the single answer to "is this a real unit", and **nothing may add to it**.
Two places had invented their own and disagreed with the Dashboard:
- Analytics filtered `floor > 0 || !/^A\d/` — a Wolfson guess that broke the moment a ground-floor slot
  was named.
- The Tasks page filtered `floor > 0` and grouped by building, so on the Job Board (every job at floor 0,
  no buildings) its apartment picker was empty.

**Task totals must be scoped too.** `liveAssignments` = assignments whose apartment still counts.
Otherwise a job filed into Done or Trash leaves the unit count and keeps its tasks in the task count.

## Boards belong to people
`BoardView.ownerId` + `share: Record<userId, 'edit'|'view'>`. `boardAccess(v, userId, isAdmin)` is the
single answer; admin and owner always get `edit`. Legacy `userIds` is read as "these can edit, empty
means everyone" and is never written again. `share: {}` means **private**, not public.

A view-only board is enforced where a change can START — drag, keyboard, right-click, toolbar — not at
each action. A press behaves as in Pan mode: drag moves the board, a click opens the job.

## The wallboard
Views left, logo centred on a white plate, full screen + a corner X, zoom as −/+, and a pen that
unlocks **only the wallboard's own furniture** (never sticky — component state, so a reload is
read-only again). `BoardSetting.tvBoard` picks which board it shows, admin-only, and clears `tvView`
because a saved rectangle describes the old board. `tvDomain` gives the short link.

The job screen draws the plan through `<PlanAnnotator embedded readOnly>` — a Drive preview iframe
frames every sheet in a black surround that cannot be turned off.

## Panels must close on Escape
The widget store and the node settings did not. A full-screen backdrop you have not noticed swallows
every other click on the board.

---

# v2 — twenty-two more widgets, and the time clock

## Where widgets live now
`widgets.tsx` got long, so the registry is assembled from four files and pushed
together at the bottom of it (same trick as `TV_WIDGETS`, same reason — they
import `Frame` and the data helpers from it):

| file | what is in it |
|---|---|
| `widgets.tsx` | the original set, `WidgetCtx`, `Frame`/`Big`/`d`/`today`/`overdueOf`/`useTick`, sample data |
| `tvWidgets.tsx` | the wall set |
| `insightWidgets.tsx` | the nine that find what is NOT happening |
| `moreWidgets.tsx` | registrations for everything whose render is a real component |

Components sit in `src/components/board/`: `TimeWidgets`, `TactileWidgets`,
`DelightWidgets`, `TapInBoard`, `MapWidget`, `WeatherWidget`.

**Adding a widget is still three places**: the registry entry, `WIDGET_FIELDS`,
and `WIDGET_PREVIEW`. A card with no preview entry draws its own empty state,
which on a shelf is indistinguishable from broken.

## The nine that look for absence
`no-date` · `gone-quiet` · `nobody-booked` · `backlog-trend` · `open-snags` ·
`no-plan` · `floor-by-floor` · `duplicates` · `skipped-stage`.

Every other live widget counts what IS happening. These find what is not, which
is what goes wrong quietly because there is no list it appears on. Two rules
they must keep:
- **Task lists go through `liveAssignments(c)`**, not `c.assignments`. A job
  filed into Done or Trash leaves every unit total via `isCountableApartment`,
  and its tasks have to leave the chasing lists with it.
- **`skipped-stage` reads the change log, never the current stage.** A job at
  stage 5 tells you nothing about whether it passed through 3.

`WidgetCtx` grew `notes`, `planPins`, `employees` and `punches`, all optional —
a widget treats absent as "read the store", which is what makes the shelf able
to hand over samples.

## Sun and Shabbat (`src/data/sun.ts`)
NOAA's **full** solar-position method, not the short form. The short form is out
by up to three minutes, which is fine for a sun dial and not for candle
lighting — and the error is not evenly signed, so it can be late, which is the
direction that matters. Nightfall is the sun **8.5° down**, computed with the
same machinery at a different zenith, never a fixed offset from sunset.
Candles round DOWN to the minute and havdalah rounds UP: half a minute of
uncertainty must never fall on the side that says there is more time than there
is.

Checked against **Hebcal** — what the office would otherwise read off a printed
sheet — four cities, five dates across the year: everything within 64 seconds,
candle lighting and havdalah to the minute. Do not re-test this against
sunrise-sunset.org; it sits about two minutes off both Hebcal and Open-Meteo
and will fail correct code.

## The time clock (`src/data/timeClock.ts` + `TimeClockTab`)
`Employee` and `TimePunch` are **global**, like users and contractors —
somebody works for the company, not for a workspace. Bare Firestore
collections; `timeClock` settings live in `settings/app`.

**A shift is never stored.** It is derived by pairing an employee's punches, so
the totals can never disagree with the taps that made them.

`resolvePunch` is the whole feature and is pure:
- an open shift from an EARLIER day closes at that day's `dayEnd`, never at
  "now" — that would credit somebody with sleeping on site;
- a clock-out with no clock-in writes a start at `dayStart`, so the day is paid
  rather than lost;
- a second clock-in on one day is refused as the mistake it is.

Everything the app writes itself carries `auto: true`, and the month's report
shades it and says so. **The app never quietly invents hours.**

A day is corrected by being **rewritten whole** — every punch on it removed and
replaced — not patched, because a day with three clock-ins on it is exactly
what somebody is there to clean up.

## `src/data/xlsx.ts` — a real .xlsx, no dependency
A ZIP of XML, written by hand: one CRC32 table, stored (uncompressed) entries,
inline strings, one bold style. A CSV is not Excel — one sheet, no widths, no
header, and Excel's import guesser turning `08:30` into a time and a Hebrew
name into mojibake.

Two traps already paid for: the DOS date must be a **valid** date (all-zero
means month 0 day 0 and LibreOffice refuses the archive), and `styles.xml`
needs a named `Normal` cellStyle or readers warn. Verified by writing a file
and reading it back with openpyxl — Hebrew, ampersands and angle brackets all
survive.

## The map (`MapWidget` + `src/data/geocode.ts` + `api/geocode.js`)
A hand-written slippy map: a grid of 256px tiles addressed by z/x/y, plus
Mercator. No mapping library — the hard part would have been escaping the
board's drag system, not the maths.

- **Positions come from the `address` already typed on a job.** Nothing new to
  fill in. A job with no address still appears — scattered deterministically
  around the middle of the country with a **red exclamation**, named after
  whoever is assigned to it, so a missing address is visible as a gap.
- `scatterAround` is seeded from the record's id: a marker that moves every
  render reads as a fault.
- Geocoding goes through **`api/geocode.js`** because the geocoder demands an
  identifying User-Agent and a browser cannot set one. That route is
  deliberately NOT key-guarded — it holds no secret, and locking it would break
  the map on any deployment without the key. One request a second, queued.
- Results cache into the node's own `data.geo`, which syncs — so one machine
  doing the lookups spares the others.
- **`data-wheel-own`** is a new board opt-out meaning "hands off the wheel
  entirely". The older `data-wheel` means "I am a scroller" and is only
  honoured while there is somewhere left to scroll; the map has no overflow at
  all, so that test never matched and the board zoomed itself instead.
- Pointer capture goes on the MAP, never on `e.target` — capturing on the
  target meant a drag begun on a pin was delivered to that pin until release,
  counted as a click, and opened the job. Panning opened things at random.
- The wheel is bound **natively with `{ passive: false }`**. React registers
  wheel passively, so `preventDefault` in an `onWheel` prop does nothing but
  log a warning.

## Weather
The only widget that uses the internet, and it earns it: rain decides the week.
Open-Meteo, direct, no key and nothing to hide. `data.sample` lets the shelf
hand it a canned forecast — the store has no business making network calls, and
a card stuck on "loading…" previews nothing.

## Testing note for this container
The headless browser here **cannot reach the internet** — every request is
ERR_CONNECTION_RESET with or without the egress proxy, and the proxy logs no
relay attempt. Tiles, the geocoder and the forecast are all reachable with
curl from the same machine, so harnesses stub exactly those responses with
`page.route` and let everything else run for real.

---

# v2 — workers, levels, the phone, and the rest of the list

## Workers, not contractors — in words only
Every string a person reads says **worker**. The storage still says contractor:
`contractors`, `contractorAssignments`, the portal token, the Firestore
collections. Renaming that is a migration across every device and every backup
for no functional gain. **Do not "finish" the rename.**

## Levels (`src/data/workerLevels.ts`)
Fifteen switches; a `WorkerLevel` is a saved set of them. Three ship
(`lvl-contractor`, `lvl-technician`, `lvl-manager`), all editable, none
deletable. `permsOf(worker, levels)` is the single answer — level first, the
worker's own `perms` on top.

- Setting an override back to what the LEVEL says **removes** it rather than
  freezing the value. Otherwise a worker accumulates fifteen personal answers
  and silently stops following their level.
- Deleting a level moves everybody on it back to the starting one; a worker
  pointing at a level that does not exist would get no permissions at all,
  which is a portal that opens and shows nothing.
- `workerLevels` is GLOBAL and bare in Firestore, like users and contractors.

## The portal is now three portals
A tab the level does not allow is **not drawn**, never greyed. The planner is
`readOnly` and not as a setting. The map shows **one building at a time** with
the picker pinned. Both workspaces are reachable through `setCurrentProject`,
counted from each project's own stored snapshot because only the open one is
live. The portal **starts `startFirebaseSync()` itself** — it sits outside
AppLayout.

`Contractor.lang` is the worker's own language choice, settable from either end
and synced, so "I can't read the screen" is a phone call rather than a visit.

**A self-assigned task is dated TODAY, never left blank.** The portal's list is
filtered by date, so a dateless task lands outside every filter and disappears
the instant it is written.

## Per-shape wall dashboards (`src/data/dashRatios.ts`)
Six shapes; `CanvasElement.byRatio` holds a size and order per shape, with
`w`/`h`/`z` as the fallback so an un-arranged shape inherits from 16:9 rather
than opening blank — and the editor **says so**. The preview is fitted to both
the available width and a height cap: fixing the height and letting `max-width`
clamp gave a "16:9" preview measuring 1.47 across.

## Widget bodies scroll, they do not clip
`Frame` and the wall's `Card` are `overflow-auto`, not `overflow-hidden`.
Shrinking a node used to delete content silently. `WidgetSurface` draws at
`max(naturalW, w / k)` because the scale is clamped at a third and past that
point the natural width and the box stop agreeing.

## `data-wheel-own`
"Hands off the wheel entirely." The older `data-wheel` means "I am a scroller"
and is only honoured while there is somewhere left to scroll.

## The wallboard's sticky header
The scroller must be **inside** the `scale()`, not outside it. A sticky element
measures its offsets in its scrolling ancestor's space, so with the transform
in between `top: 0` meant zero in the SCALED space — measured 577px down at
1.6×.


## The plan screens on a phone (`scratchpad/planphone.mjs`)
The viewer with its pins and the markup studio sat outside every sweep for a
simple reason: both need a real PDF and the container has no Drive. The harness
**makes one with pdf-lib** and serves it on the route the app actually asks,
`/api/drive-fetch`, so pdf.js loads, a page renders and the tools arm for real.
Seed the plan on **A1-53 AND on every apartment the worker has a task on** — the
portal only draws its plan section when the job has one, so seeding a single
apartment tests the office and silently skips the worker.

Rules the studio's phone layout must keep:
- The **tool rail scrolls** sideways (eleven buttons whose order you learn); the
  **ink row wraps** (three controls of which the last is a slider — See-through
  was cut in half, and a handle you cannot see cannot be dragged).
- The stage is `items-center`. A landscape sheet fits to WIDTH on an upright
  phone — about 270px tall in a 1400px stage — and top-aligned it read as
  something failing to load.
- Turning the phone genuinely fixes that, so the empty space says so once,
  quietly, rather than being empty.
Drive it with `tap`, never `click`: the whole point of these two screens is a
finger on site.

## The phone sweep — five configurations, one harness
`scratchpad/shots.mjs` runs the whole app and audits it for overflow and
clipping. Switches, all env vars: `W=360` / `W=375` (a common Android, an SE —
thirty pixels less than the 390 everything was built against is where a row
that "just fits" stops fitting), `LANG_HE=1` (Hebrew, right-to-left),
`VIEW=landscape` (844x390). `seed.mjs` supplies REAL data — long family names,
long stage names, a worker with a token and six dated tasks — because a phone
layout only ever breaks on content longer than its box, and the bare seed has
none.

Two traps the detector already carries, both of which once made it report the
test's fault as the product's: a wide row inside its own `overflow-x` container
is CORRECT and is exempt — but only if that container itself fits on screen —
and an element carrying `truncate` is cut off on purpose. A third: a page that
did not render passes every check, so anything measuring a route must first
assert the route drew something.

**The portal reads the WORKER's language, not the office's** (`Contractor.lang`).
Seeding `isRtl` tests the admin app in Hebrew and the portal in English, which
is the one screen a Hebrew-speaking worker actually holds.

**Hardcoded English is the recurring bilingual fault.** `getDueBadge` in the
portal was a module-level function with "Overdue"/"Today"/"Tomorrow" in it — the
trap this file already names for `PRIORITY_CONFIG` and friends, and it survived
because a constant outside a component simply keeps whatever string it was
written with. The task list said "12 tasks · 3 done" the same way. When adding
a user-facing string, it comes from the strings object or it is a bug.
Adding a key to `ContractorUiStrings` makes it **optional with a fallback** —
those strings are user-edited and stored, and there is no `mergeFresh` for them,
so a required key renders blank on every object written before today.

**A phone on its side** is not a narrow screen, it is a SHORT one. At 844x390
the app lays out the desktop, correctly by width, and the sidebar plus filter
bar plus legend plus progress strip are together taller than the screen. The
`.short-scroll` rule (`max-height: 560px`) turns the page from a fixed frame
with an inner scroller into one ordinary scrolling page, so the chrome scrolls
away. Keyed on height, so a short desktop window behaves the same.

**`.edge-fade`** marks a horizontal scroller as scrollable: a control chopped in
half by a boundary reads as broken, not as "more this way". Mirrored under RTL.

## Phone
- **The buildings page is one building at a time on a phone.** `usePhone()` in
  `ProjectDiagramPage` (matchMedia at Tailwind's md line, the same line the sidebar/MobileNav
  swap on) resolves `selectedBuilding === 'all'` to the first building; big A1/A2/A3 tabs set
  the normal `selectedBuilding` state so a desktop window keeps its all-buildings view. The
  filter block collapses into ONE Filters button opening a bottom sheet (type, stage legend,
  Changes badge, bulk update, print, clear); the desktop bar is `hidden md:block`, the phone
  bar `md:hidden`. `BuildingDiagram` takes `phone?: boolean` — taller rows and larger type,
  threaded through getFloorRows/AptCell/both column components. Harness:
  `scratchpad/mobdiagram.mjs` — assert with `>> visible=true`, the hidden desktop bar still
  exists and counting it reports the test's fault as the product's.
- **Phone bar order is search → tabs, not tabs → search.** The tabs are a slim row
  (`py-1.5 text-sm`) carrying the unit count in grey at its end, and the separate stage-count
  strip is `hidden md:flex`, because that strip was a whole row saying "168".
- **Phone cells WRAP their text; they never truncate it.** A four-across row is ~77px wide and
  "— Not Started —" needs 92px, so `truncate` clipped the stage off every cell in the grid.
  The stage line and the family-name line drop `truncate` when `phone`, and `rowH` is 98 to
  clear the worst case (number + family name + a three-line stage + a task line). Desktop
  keeps truncation — it has the width, and wrapping there would ragged the grid.
- **A non-wrapping flex row is the phone bug in this codebase.** Four of them were found at
  390px: the drawer's Apt#/Family/Type/Stage row (labels printed ON TOP of each other), the
  drawer header (Drive/Print/Worker ran under the X and could not be tapped), the drawer's
  Drive/Zoho `1fr 1fr` grid (measured 585px inside a 390px screen), and the dashboard title
  row. All four fixed with `flex-wrap` + a `min-w` per child, NOT with a phone flag — the
  same markup then stays one line in the 1020px modal. `scratchpad/deskcheck.mjs` asserts
  that: all four drawer labels must share one `top`, and the Drive grid must stay two-column.
- **A page must be able to be narrower than its widest word.** `<main>` is a flex column,
  so every page root is a flex ITEM, and TWO flex rules gang up on a phone: a flex item
  defaults to `min-width:auto` (won't shrink below min-content), and `mx-auto` CANCELS the
  default stretch so the item is sized shrink-to-fit by its content. A page root written the
  usual way (`max-w-3xl mx-auto`) therefore laid itself out at **503px inside a 390px
  screen**. `main > * { min-width: 0 }` in `index.css` fixes the first for every page;
  the second needs `w-full` on the page root. Check both when a new page runs off the edge.
- **A phone harness on EMPTY data tests nothing.** The first version of `shots.mjs` ran on
  the bare seed — no family names, no stages — so every cell held a number and
  "— Not Started —", and it reported zero faults while the real board overlapped its own
  text. `scratchpad/seed.mjs` imports `buildDefaultApartments()` through Vite (the app
  persists only on MUTATION, so a fresh boot leaves nothing to read back) and fills in real
  names and the LONGEST stage names. It must also set `wolfson_app_version`, or the app
  treats the store as stale, resets, and drops the harness at the login page.
- **The cell number carries `flex-shrink-0`.** A cell is a fixed-height flex column, so once
  the family name wrapped to two lines the number was shrunk to 0px high and the name drew
  straight over it. Use `overflow-wrap: break-word`, never `word-break: break-word` — the
  latter splits eagerly and gave "Weinstei / n, Steven".
- **The sticky building header is `z-10`, not `z-30`.** A sticky element paints above page
  flow, and at z-30 the building name sat on top of the What's New window.
  `scratchpad/zorder.mjs` asserts with `elementFromPoint` across a grid of points that
  nothing outside a dialog paints over it — numbers alone did not settle it.
- **The drawer is FULL SCREEN on a phone** (`usePhone()` in `src/data/usePhone.ts`), with a
  **Plan tab** that opens the markup studio directly — a phone has no side pane, so the plan
  would otherwise be unreachable.
- **The phone diagram has NO left gutter.** The floor number rides the middle stairwell
  divider (`Stairwell` takes a `floorLabel`), because a 34px grey column on a 390px screen
  is 9% of the width spent on two digits, taken from the four cells that carry the meaning.
  Note there are TWO column components — `BuildingColumn` (Wolfson) and `NetivBuildingColumn`
  — and a change to one is invisible in the other; Wolfson renders `BuildingColumn`.
- **The phone stage name SHRINKS to one line; it never ellipsizes.** `fitStageFont` divides
  the cell's usable width by the string's measured em-width and clamps to [6, 8.5]px, falling
  back to wrapping only below the floor. `emWidth` MEASURES with a 2D canvas at `600 100px`
  of the body's own font family, memoised. It used to be a hand-tuned per-character table
  which undershot real text by ~8% ("Thermostats & Haffala" reckoned to fit 83px, actually
  90), so every long stage name chose a size too big and then had an ellipsis put through it
  — the one outcome the auto-fit exists to prevent. A table also has to be re-tuned per font
  and per script, and the Hebrew names had no entries at all. Round DOWN, never to nearest.
- **`scratchpad/stagefit.mjs` is the guard for that**, at 360/390/412px. `shots.mjs` cannot
  catch it: that harness exempts `truncate` elements as deliberate (right for a widget blurb,
  exactly wrong here), so it reported 0 clipped while 39 stage labels were ellipsized on
  screen. An exemption added to quieten one page WILL hide a regression on another.
- **The phone cell-geometry constants** (`PHONE_PAGE_PAD`, `PHONE_ROW_PAD`, `PHONE_HALF_GAP`,
  `PHONE_CELL_GAP`, `PHONE_STAIRWELL_W`, `PHONE_CELL_CHROME`) mirror specific Tailwind classes
  and are commented with which. Change a class on the phone path without the constant and the
  font is computed against the wrong width.
- **Named floors abbreviate on the phone pill**: the divider pill is 17px, so `shortFloorLabel`
  gives "L" for Lobby and "G" for Ground/Commercial while NUMBERS ("15", "-2") are never
  touched — they are what somebody counts down. The full name stays in `title`.
- **The phone hides the per-building navy header** in BOTH column components — the A1/A2/A3
  tabs above the diagram already say which building you are on, and desktop keeps it because
  several columns sit side by side there.
- **The drawer's plan pane is ONE function rendered in two places** — `planPane('side')` for
  the desktop side pane, `planPane('tab')` for the phone's Plan tab. It is a plain function,
  deliberately NOT a nested component: a component declared in a render body is a new type
  every render, which remounts the iframe and re-fetches the PDF from Drive on each change.
  The phone Plan tab must never jump straight into the markup studio — Mark up inside the
  pane is the only way in, exactly as on desktop.
- **Phone preview pages**: `scratchpad/mobcapture.mjs` captures real rendered pages
  (scripts stripped, images inlined) and `build-preview.mjs` wraps them in phone frames for
  an artifact the owner reviews before/after changes. `scratchpad/shots.mjs` is the measuring
  one — PNGs of 11 phone views plus a per-view count of elements past 390px and of text nodes
  whose `scrollWidth` exceeds their box. Both numbers must be 0 everywhere before shipping.

- **The sweep covers every routed screen** except `/tv`/`/tv-view` (wall panels) and
  `/login`. Board content inside `[data-board-viewport]` is exempt from the overflow check —
  a canvas extends past the screen BY DESIGN and you pan to it — but the chrome around it is
  measured in full. The `board` shot switches workspace through the REAL header dropdown
  (a localStorage patch is flushed over on unload) and then asserts the board actually
  mounted — a shot of the wrong page passes every check.

- **The phone board chrome**. The header tool strip scrolls sideways (`overflow-x-auto
  edge-fade max-w-[72vw]`) with **`[&>*]:flex-shrink-0` on every child** — in a scroller the
  CONTAINER gives, never the items. Without it the zoom group and the Board/Stages toggle
  (both `overflow-hidden`, so their automatic minimum is zero) were squeezed to 2px and read
  as not existing on a phone, while everything with a natural min-content survived — the
  exact kind of half-failure that passes an overflow audit. The zoom group keeps −/+/Fit on
  a phone and hides only the typeable % and 100%. The phone tools FAB sits **bottom-LEFT**
  (`left-3`, 12px + safe-area up): top-right sat on the Board/Stages toggle and bottom-right
  on the board overview, which owns that corner. On first open with content, the phone board
  runs `zoomToFit()` once (`phoneFitDone` ref).

- **`zoomToFit()` reserves the floating header and bypasses the pan clamp.** The header
  floats OVER the viewport, so fitting to the full height parked the first row of the board
  under the chrome; Fit measures `headerBarRef`'s bottom and fits into what is visible below
  it. It sets the pan RAW — the clamp pins the pan to the world's corner whenever the scaled
  world is smaller than the viewport (that rule exists so ZOOMING cannot open blank space)
  and would shove the fitted content straight back under the chrome. Fit is an explicit
  framing request; the very next drag or zoom goes through the clamp again.

`Sidebar` is `hidden md:flex` with a `MobileNav` in the column flow.
Twelve routes measured at 390×844: no overflow, nothing unreachable, no tap
target under 32px. The per-cell add-task "+" is `hidden sm:flex` — a 21px
target in the corner of a cell makes opening the apartment a coin flip, and a
task can be added from inside it.

## The harnesses
Scratchpad scripts driving real Chromium, run by hand — not CI. `mobile2` ·
`phone` · `portal` · `workers` · `clip` · `allwidgets` · `backup-audit` ·
`tapin` · `clock` · `sun` · `xlsxtest` · `ratio` · `notebook2` · `tiktok` ·
`tvsticky` · `insight` · `newwidgets` · `map` · `share` · `overlap`.

Two standing traps they have already fallen into, both worth remembering: a
detector that counts the app's own chrome (the node action strip, the filter
row, a map clipping its own tiles) reports the test's fault as the product's;
and a hand-written localStorage patch is overwritten by the app's own
flush-on-unload, so drive the real UI instead.

## Opening a drawing in AutoCAD (`src/data/drivePath.ts` + `api/drive-path.js`)

A **36px icon on the Drive row itself**, beside the pencil — `LinkField` gained
an `actions` slot for it. `DriveDesktopPath` takes `variant`: `icon` for that
row, `row` for a worded line in a menu (an unlabelled icon in a menu is
unreadable). It appears in three places: the drawer's Drive row, the tile
right-click menu, and the plan pane's header — where it targets
`planSet.plansFolderId`, because an architect opening a drawing wants the plans
folder, not the job folder.

**A page served over https cannot open File Explorer by itself.** A `file://`
link, a scripted navigation and `window.open` are all refused by the browser,
and refused SILENTLY: nothing throws and nothing moves, so a button that tried
would read as broken rather than as restricted. Verified in Chromium against all
three. Do not "fix" this by adding a `file://` link.

The path has two halves:
- **inside the drive** — the same on every machine, walked from the folder id
  by `api/drive-path.js` (parents chain, bounded at 20, server-cached). The
  shared drive's own root reports itself with the drive's id and must NOT
  become a segment, or you get `Shared drives/TzviAir/TzviAir/…`.
- **in front of it** — `G:` on Windows, or
  `/Users/<them>/Library/CloudStorage/GoogleDrive-<their email>` on a Mac.
  Different on every computer, so it lives in **localStorage only**
  (`drive_desktop_root`) and is deliberately kept OUT of the synced store.
  Syncing it would push one architect's path onto everybody else's machine,
  where it is wrong. There is a test asserting it has not leaked.

`Shared drives` / `My Drive` are inserted by `composeLocalPath`, not expected in
what the office typed — asking somebody to get one of two spellings right for no
reason is how a setting gets filled in wrongly.

## The one-click helper (`src/data/tzviairHelper.ts`)

Since the page may not open a folder, the MACHINE volunteers to: a registered
URL scheme, which is exactly how Slack and Zoom open their desktop apps from a
web page. `openUrl(path)` → `tzviair://open?path=…`.

`windowsInstaller(root)` returns a `.reg` plus the `.cmd` it points at;
`macInstaller(root)` returns a shell script that builds a tiny `.app` declaring
the scheme. Both bake the Drive root in and **refuse any path outside it** —
anything can address `tzviair://`, so a request is assumed hostile until
checked. Neither ever RUNS anything: `explorer.exe <folder>` and `open <folder>`
show a folder, they do not execute what is in it.

Whether this machine has it is `tzviair_helper_installed` in **localStorage
only**, alongside `drive_desktop_root` — both are per-machine and must never
reach the synced store. Without the helper the button copies the path, which
needs nothing installed and cannot fail quietly; that is the floor, not a
degraded mode.

`macInstaller` is built as a **line array joined with `\n`**, never a template
literal: `${` inside one is TypeScript interpolation, and the first version
silently turned half the shell script into JavaScript. It uses plain `$VAR` and
python3 for percent-decoding rather than any brace expansion.


---

# v2 — the iPad

## Palm rejection (`src/data/pencil.ts`)
**Once a pen has been seen, fingers are ignored for a moment.** Not "ignore the second contact" — that
only covers the pen touching down first, and a hand settles before the nib does about half the time, so
the palm claimed the stroke and the NIB was turned away as the second contact. A pen coming down also
**retrospectively disowns** a touch that began within `PALM_LOOKBACK`, which the simple version cannot
cover at all.

`PEN_WINDOW` 700ms · `PALM_LOOKBACK` 400ms. `notePointer(e, now)` takes `now` as a parameter, because a
palm rule tested against the wall clock is a rule tested once — `scratchpad/pencil.mjs` drives eight
explicit timelines. "Never" is `-Infinity`, **not 0**: 0 is also a valid timestamp, and with it the very
first finger on a fresh page was rejected as a palm. Real clocks are large enough that this never bit in
the app, which is exactly why it needed a test with its own timeline.

Wired into `PlanAnnotator` at pointerdown AND pointermove — a palm dragging across the glass must not
extend the pen's stroke either.

## A finger has no double-click
The board's only way of opening a job was a double-click, and two quick taps do not reliably reach the
page as one — iOS reserves the gesture for zooming. **On a tablet a job could not be opened at all.**

The touch rule is the iOS one: tap to pick it out, tap the picked one to open. Same for a board node
(second tap edits). `wasPicked` is a **ref recorded in pointerDOWN**, because the very next line picks
the job — asking on pointerup always answers yes, which opened on the first tap and left no gesture for
"I mean this one". Nothing about the mouse changes.

## Hover-only controls do not exist on a touch screen
17 of them, measured. `@media (any-hover: none)` in `index.css` shows every `group-hover:opacity-100`
outright. Keyed off what the device can DO, never off "is this an iPad" — a touchscreen laptop has the
same problem and an iPad with a trackpad does not. Safari's sticky `:hover` after a tap is why this
looked like it half-worked: you had to tap the thing to discover there was a button on it, and tapping
the thing did something else.

Consequence: a delete that was revealed by hovering is now always visible, so **anything destructive
newly exposed this way must confirm** (the saved-report delete does).

Also under that query: `-webkit-touch-callout` and the tap highlight off — a long press in this app
always means "open the menu for this", never "select this text". Plus `overscroll-behavior: none` so
the whole app does not rubber-band, `viewport-fit=cover`, and `env(safe-area-inset-bottom)` under the
mobile nav and the board overview. `maximum-scale` is deliberately NOT set: pinch-zooming the page is
somebody's accessibility setting, not a bug.

## Harness note
`scratchpad/ipad.mjs` runs two device profiles. Chromium's `Emulation.setEmitTouchEventsForMouse` with
`configuration: 'mobile'` genuinely reports `any-hover: none`, so the rule is live rather than
simulated. **Wait before measuring opacity** — several of these controls carry `transition-all`, and
reading in the same tick returns the value the transition is starting FROM, which reads as "these were
never hover-gated" and is the test measuring its own impatience.


---

# v2 — the 31-item round (the last big list)

## New rules that must not be broken
- **Every update adds a What's New entry** (`src/data/whatsNew.tsx`): one dated entry, newest
  first. The header sparkle wears a red dot until the newest date has been seen
  (`whats_new_seen` in localStorage). The slides act out gestures with CSS vignettes — drawn,
  never screenshotted, so they cannot rot.
- **Every widget answers its pencil.** `WIDGET_FIELDS` carries a runtime floor
  (`??= [title()]`) so a widget with no entry still opens a panel; the coverage check must be
  RUNTIME (import the module), the static grep cannot see the floor.
- **Every number opens its list.** `WidgetCtx.showList(title, jobIds)` — hosts draw
  `WidgetListPopup` (MiniJob rows). The store shelf has no host, so it renders plain numbers.
- **`settleDrop` on the board**: nothing lands under the floating header (its measured bottom,
  in world coordinates), and locked edges keep a 10px lip. The make-room ask needs a 350ms
  DWELL at the edge (`drag.edgeSince`) — a fling never asks.
- **Search forgives** (`src/data/translit.ts`): consonant-skeleton matching Hebrew↔English,
  wrong-keyboard-layout swap, threshold 0.45. Trash jobs never appear; Done/Ready/Archive
  appear labeled. The digraph folding runs AGAIN after the vowel strip (Cohen/כהן).
- **The planner asks** (`plannerAsk` in the store, `PlannerAskModal` in AppLayout): a dated
  task on a planner job offers ghost / move / just-save. Admin layout only — the portal never
  mounts it. Transient; excused in the backup audit.
- **Palm rule, capture rule**: a press on a BUTTON inside a pointer-captured surface must skip
  the capture (the map's corner buttons died because a captured release retargets the click to
  the common ancestor).

## New fields and settings
- `Contractor.photosOptional` (photos required unless set), `Contractor.textScale` (portal
  text size, synced like `lang`; the portal scales the ROOT font size so every rem follows).
- Worker permission 16: `assignOthers` — reveals the contractor picker in the portal's task
  form and unlocks the full unit list there.
- The plan pane is sheet-shaped AUTOMATICALLY: `src/data/planAspect.ts` measures page 1's
  real width÷height — Drive thumbnail as a plain `<img>` first (a few KB), full bytes +
  lazy pdf.js only if the thumbnail refuses — clamps to [0.45, 2.4] and caches per file id
  (`plan_aspect_cache`, this machine only). Landscape √2 stands in while measuring; a
  failure is never cached so the next open tries again. The manual portrait/landscape
  chips and `plan_pane_aspect` are gone. Board default zoom per machine
  (`board_default_zoom_<pid>`).
- `findPlanSetViaBackend` falls back to PDFs in the job folder ROOT when there is no
  Engineered Plans subfolder — Job Board folders are often flat.
- The map view is saved DEBOUNCED (800ms after rest), never per wheel tick; the previous
  zoom's tiles stay underneath while new ones fade in; `loadedTileUrls` is module-level.
- The dashboard edits like a home screen: move handle top-left (carry over a card to take its
  slot; order is dense z rewritten whole), resize bottom-right only, snapping to whole columns
  and 40px rows measured from the card's own rendered width.
- The widget store: finer shelves (`SUBGROUP` map), `RECENT` hand-kept list backing the
  Recently-added chip and Newest sort, size slider (`widget_store_scale`), `destLabel` prop
  so the dashboard's button says where the widget lands.
- Settings hints render as a ⓘ tooltip in the shared `Row` — never as inline explainer text.

---

# v2 — the CRM import

## Importing the Zoho deals export (`src/data/jobsImport.ts` + `ImportJobsCard`)
Job Board → project settings (gear) → "Import jobs from a CSV". Preview-first like the
Drive-names tool: choosing a file writes NOTHING; every row can be unticked; only Apply
creates anything. The card lives in `src/components/settings/ImportJobsCard.tsx` and renders
only for `currentProjectId === 'general'`.

- **The arithmetic is pure and offline-tested** (`jobsImport.ts`): the CSV walk (quoted
  fields, Zoho's preamble found by looking for the "Deal Name" header, never a line number),
  `familyFromDeal` (before the first comma; no comma → before the first " - ", same rule as
  Drive folder titles), `normalizePhone`, `STAGE_ROUTES`, and `planImport`. Tested against
  the real 1,148-row export in the container; the repo carries only a synthetic fixture with
  fake families (`scratchpad/importjobs.mjs` writes it at runtime).
- **The phone zero rule**: prepend `0` only when the number looks like an Israeli number that
  lost it — bare digits, not starting `0`/`1`/`+`, at most 9 digits. American and
  international numbers pass through untouched, formatting preserved.
- **Stage routing is the owner's 2026-08-17 mapping** (in `STAGE_ROUTES`): Job Completed /
  Collecting Remaining Balance / Collecting Extras → Done group with stage "Job completed";
  Hibernating / Collecting Deposit-Key → Ready to Start group, no stage; Being installed →
  open board, stage "AC installation"; Installation of Geves → its own "Currently in Geves"
  group + stage. Unlisted CRM stages (incl. Babysitting — "don't put in yet") are skipped
  with a per-reason count in the preview. Stages are matched by name among the workspace's
  OWN stages (`projectId === 'general'` — the board's tiles read only those) and created
  when missing; a named group is found by `binLabelOf` or created as a real bin node beside
  the seeded four.
- **The cross-workspace guard** (what the owner asked for by name): a deal whose Drive folder
  id is already some apartment's `driveLink` in ANY other workspace is skipped as that
  workspace's job. Built from each project's `${id}_app_data` snapshot — only the open
  workspace is live, and the card says so. A deal NAME mentioning Wolfson/Netiv is only a
  warning chip ("Wolfson, Tzvika" is a family), never an auto-skip.
- **Re-running the same file plans zero**: rows are deduped against existing jobs by Drive
  folder id, and for driveless rows by the full deal name against the first line of
  `generalNotes` (imports store the deal name there, plus `Account:` when it adds anything).
- **`importJobs(jobs)` store action**: one state set, one persist, one chunked `fsBatchSet` —
  never hundreds of `fsSet` rounds.
- **`fsBatchSet` chunks at 450**: Firestore rejects a batch past 500 writes, and the catch
  only warns — a 600-row import (or Force Push of a big board) would have looked saved and
  silently never reached the cloud.
- **`Apartment.phone`** — shown beside Address in the drawer (both project kinds, one merged
  block, `tel:` link), saved on blur via `autoSave`, rides in `apartments` so persist /
  export / import / Firestore need no new key.
- **Board open gesture reminder**: a single mouse click on a tile SELECTS; double-click
  opens (touch: tap picks, second tap opens). The harness first read select-only as a bug —
  it is the designed "I mean this one" gesture.
- **`applySeed` seeds `active_project` only when absent** (`scratchpad/seed.mjs`): the init
  script re-runs on every navigation, and the unconditional write yanked any harness that
  switched workspace through the real UI back to Wolfson on its next `goto()`. Harnesses
  that want a workspace outright still set it in their own later-registered init script.

---

# v2 — touch navigates, and the phone gets a list

## The finger rule on the board
**Touch NAVIGATES; it never arranges.** A finger press on a tile, node, ghost,
pinned title or resize handle starts a BOARD PAN (`panFromJob` / `panFromEl`,
the view-only idiom); a motionless tap still opens (job → drawer, group → its
window, node → picked); two fingers pinch (`useTouchGestures`, which predates
this). A STYLUS is deliberately not a finger (`isFingerTouch` excludes
`pen`) — the Samsung pen still arranges like a mouse. Armed pen/highlighter
tools still draw with a finger — arming a tool is deliberate.

Wiring rules, each of which was a real trap:
- The touch branches **stopPropagation** — the viewport also pans unclaimed
  finger presses, and two captures on one pointer meant pointerup never
  reached the tile, killing tap-to-open.
- Interactive children (`a,button,input,textarea,select`) are left alone at
  BOTH levels (node branch and viewport fallback) — capturing them retargets
  the click (the standing capture trap; the map's corner buttons died of it).
- `beginResize` bails on touch BEFORE its stopPropagation, so the press
  bubbles to the node and becomes a pan.

## The clamp knows about the floating header
`clampPanRef` runs its y-axis in the space BELOW the floating header's
measured bottom (`headerBarRef`): pinned means "world top at the chrome's
edge", and panning can never park content underneath it. In stage view the
header is in the flow and the headroom clamps to 0. `zoomToFit` therefore
goes THROUGH the clamp again (no raw pan) — and when the phone's 50% zoom
floor means content still cannot fit, Fit aligns the content's LEFT edge
rather than centring, so everything off-screen is in one known direction.
`board.mjs` asserts pinned-y equals the measured header bottom, not 0.

## The job list (`/list`, `JobListPage`)
Every job in the workspace as one searchable list — the phone's answer to the
board. Search uses the board's own forgiveness (`queryVariants`/`skeleton`),
sort cycles Recent activity → Name → Stage, chips filter by stage and (Job
Board only) by group. The same visibility rule as board search: **Trash never
appears; other groups appear, labeled** (the row's sub-line). Rows are
`MiniJob`; a row opens the ordinary `ApartmentDetailDrawer`. Reached from the
bottom bar — `MobileNav` splices it in as the second tab and shows FIVE
primary slots so Tasks keeps its place; `useNavItems` deliberately does NOT
carry it, so the desktop sidebar never shows it. `relativeTime` moved to
`types/index.ts` (tiles and list share one stamp).

Harness: `scratchpad/touchpan.mjs` — finger drags from tile and note pan and
leave stored positions unchanged, taps open the job and the group window,
pinch zooms. The sweep gained `list` / `list-search` shots.

## Plans are link-shared, by decision
The plan view is Google's preview iframe and the marked-up plan is a plain
Drive link — both served by drive.google.com, which knows nothing about the
app's login and turns away anyone outside the company Google account (cookie
prompts, a dead end on iPhone Safari). The owner chose sharing over proxying
(2026-08-17): **every plan the app shows becomes anyone-with-link readable.**
- `ensureDriveShared(fileId)` in `driveApi.ts` (files AND folders) — fire-and-forget, remembered in
  `shared_plan_ids` (localStorage, this machine) + an in-flight set, so a
  re-rendering portal does not hammer the route; a FAILED share is not
  recorded, so the next open retries.
- Wired where a plan is DISPLAYED, not only where it is picked — that is what
  heals every plan chosen before this existed: the drawer (current plan + its
  newest stamped version) and the portal task sheet (same pair). The same
  breadth now covers the rest of Drive: `listAllPhotosViaBackend` shares each
  job's **Photos FOLDER** on first open (inheritance covers every picture and
  future upload), the five Photos-subfolder creation sites share the folder at
  upload, and the four upload paths that never shared their output (planner
  attachments, `storeVoiceMemo`, the board's audio + Board Files) now do.
  The office uses a MIX of personal Google accounts, so this is what makes the
  app's Drive surfaces work for staff too — folder BROWSING in the Drive UI
  still needs their accounts added to the shared drive as members.
- `api/plan-annotate.js` shares each stamped PDF the moment it uploads it,
  non-fatally — the portal's lazy call is the retry.
- **`supportsAllDrives: true` in `api/share.js` is load-bearing**: the plans
  live on a shared drive, and without it permissions.create answers "file not
  found" and the share silently never happens.
- `scratchpad/sharewire.mjs` proves the wiring with a stubbed share route. It
  needs the app served with `VITE_DRIVE_API_KEY` set (the helper rightly does
  nothing without a key) — a second dev server on 5174, so the main one keeps
  key-less behaviour for every other harness.
- **"Share everything now"** (`SharePlansCard`, app settings → App, beside the
  Drive-names backfill): one press walks every Drive file the CURRENT
  workspace's records point at — plans, stamped annotations, contractor
  photos/files on Drive, stage-note and task attachments, contractor-note
  attachments, board voice memos — and shares the lot,
  chunked in fives, with a progress count and a failed-count that invites a
  retry. Exists because the lazy heal only fires on OPEN — right for the long
  tail, useless for "make everything work today". `shareFileToDrive` now
  returns a boolean for exactly this counting; its old callers ignore it.
- Verified against PRODUCTION on 2026-08-17: a real shared-drive file answered
  401 anonymously, the live /api/share call succeeded, and the same file then
  opened with no login — the mechanism works; what remains on any device is
  running the new bundle (an already-open tab keeps the old one).

---

# v2 — the owner's cleanup round (sharing automatic, wizard import, drawer polish)

## Sharing is AUTOMATIC and has no button
The "Share everything now" card, "Force Push Local → Cloud" and the bulk
Ready-To-Start box are all REMOVED from settings. Sharing happens by itself:
- `shareJobFolderSurfaces(driveLink)` (driveApi) fires when a Drive link is
  SAVED on a job — drawer link save, board Add Job, paste-created jobs. It
  shares exactly TWO subfolders when present: **Engineered Plans** (files and
  the Annotated Plans child inherit) and **Photos**. Nothing else in the job
  folder.
- The plans folder also shares itself at DISCOVERY (`findPlanSetViaBackend`),
  and the Photos folder on first Photos-tab open (`listAllPhotosViaBackend`)
  — that is what heals the backlog with no bulk button.
- Per-FILE shares remain only for files the app itself uploads outside those
  two folders (task/note attachments, voice memos, board files) — disclosed
  to the owner 2026-08-17.

## The import wizard (`jobsImport.ts` rewritten)
The Zoho stage-routing table is GONE. The card in Job Board project settings
is a three-step wizard: download `templateCsv()` (columns: Drive folder link,
Family name, Address, Phone, Zoho link, Stage, Group, General notes), fill,
upload. Blank family names are read from Drive folder titles
(`familyNameFromFolderName`, chunked fives) — the wizard has the service
account's permission, the sheet does not need retyping what Drive knows.
Stage and Group route from the file's own columns; unknown stages are created
(`projectId 'general'`), group labels match `binLabelOf` (built-ins included)
or create a real group. The cross-workspace Drive-folder guard and re-upload
dedup are unchanged. Import ids keep the `G-imp-<stamp>-` prefix, where the stamp is the BATCH:
the amber strip shows one row per import (date, count, and how many were
edited since), each with its own Remove — a STANDING per-import undo, not a
one-shot. `removeJobsByIdPrefix(prefix)` (store) deletes exactly that
batch's ids and fsDeletes them, so removal syncs to every device; anything
made by hand is never touched. "Edited since" reads
`contentUpdatedAt !== createdAt`, which the import sets equal on purpose.

## Drawer rules from this round
- **Anything the drawer opens must sit ABOVE z-[120]** (the drawer panel).
  The contractor-status panel and three decision modals rendered at z-70/90
  UNDER the drawer — visible as "the screen just goes gray". They are all
  z-[130] backdrop / z-[140] panel now.
- **Tooltip renders through a PORTAL** at fixed coordinates. The old in-place
  bubble was clipped by any overflow ancestor; no z-index can save a child
  from its parent's scissors.
- **Closing the drawer flushes edits.** Every close path runs `closeDrawer()`
  → autoSave when the basics differ from `basicSnapshot` (taken on open). A
  green "saved" tick shows beside the notes label after each real write.
- **The paperclip and microphone live INSIDE the General-notes box**,
  bottom-right; office files and memos list under the box, and a MEMO has the
  same trash delete a file has (`VoiceMemoPlayer onDelete`) — in the drawer,
  quick-add, Tasks add form, and the bulk modal (which also renders memos as
  players now, not grey chips).

## The plan pane draws itself
The drawer's pane no longer embeds Google's preview iframe — it renders
`<PlanAnnotator embedded readOnly>` (the TV's precedent), keyed by file id,
with `PlanPinOverlay` above it. The sheet fills the pane and needs no Google
login. The book icon is now a FOLDER PICKER over Engineered Plans:
`listPlanSubfoldersViaBackend` lists the tree one level deep, a picked
folder's markable files (`listFolderPlansViaBackend`) take the chip row, and
picking from a SUBFOLDER only views — `plansPdfLink` is written only from the
main folder's chips, so browsing Annotated Plans can never change what the
contractor sees. The portal keeps its iframe (link-shared files open it fine).

`scratchpad/planphone.mjs` measures the studio's committed ink as
`canvases[length-2]` — the pane below now contributes its own three
canvases, so `canvases[1]` reads the WRONG stack and reports no ink.

---

# v2 — Select, the eraser's own tile, locks, and the menu that stays on top

## The workspace menu is a PORTAL
The header is a flex item with `z-30`, which makes it a stacking context — so
no z-index ON the menu could lift it above the board's floating chrome
(z-40/z-50) or any sticky page content: the same disease the drawer tooltips
had, cured the same way. `WorkspacePicker` renders its menu through
`createPortal(document.body)` at `z-[100]`, positioned from the button's rect
measured at open (edge-to-edge under the header on a phone; right-anchored
under RTL). The outside-press close checks BOTH refs (`wrapRef` + `menuRef`) —
with a portal, `wrapRef.contains` alone closes the menu on its own rows.

**`BuildingColumn`'s sticky building bar is `z-10`** — Netiv's column got that
fix (What's New round) and Wolfson's never did: the documented two-component
trap, found because the menu hid behind "the names of the buildings".

## Select is a tile again — but only as a MIRROR
The board still has exactly one control scheme; `select` is the default value
of `tool` and always was. The tile exists so the default is VISIBLE and
returnable: picking pen/highlighter/eraser lights that tile instead, pressing
Select puts the armed mode down. The page passes
`active={eraser.on ? 'eraser' : tool}` — the eraser is separate state
(`eraser.on`), never a value of `tool`, and `handleToolPick('eraser')` toggles
it BEFORE the put-the-eraser-down line that every other pick runs.

## The eraser
- Its own tile (rub out / whole-mark kinds and width live in ITS right-click
  panel, `penOpts.tool === 'eraser'`); the pen panel lost its eraser section
  AND its hard-coded explainer paragraph, per the owner.
- `EraserCursor` — a fixed, pointer-events-none circle following the pointer at
  `width × zoom` (the width is WORLD units; `eraseAt` halves it in world
  space). Positioned imperatively from its own window listener so pointermove
  never re-renders the board; hidden outside the viewport.
- **Legacy flat-ink strokes are promoted on load**: a stroke with `points` but
  no `data.own` (drawn before every stroke became a node) gets `data.own` +
  its box rewritten from `pointsBounds(strokePoints(el))`. Its STORED box can
  be a lie (0,0,10×10), which is why the eraser's cheap box rejection never
  let a press near the ink — `eraseAt` now trusts `el.x/y/w/h` only when
  `data.own`, and box-checks legacy strokes from their real points. The
  partial-cut re-add always writes `own: true`, so erasing legacy ink cannot
  breed more of it. A stroke with <2 points is deleted (invisible junk).

## Locks
`Apartment.boardLocked` + `CanvasElement.locked` — both optional, absent =
unlocked, cleared with `undefined` (not `false`) so the field vanishes from
records. `boardLocked` is in `updateApartment`'s CANVAS_ONLY set (locking is
arranging, not editing) — that set also gained `viewPos`, `ghosts`,
`stageOrder`, `showOnTv`, all board furniture that was wrongly bumping
`contentUpdatedAt`.

The rule everywhere: **a press on a locked thing pans the board** (the
view-only idiom), so a motionless click still opens/picks it via the existing
pan-up path. Locked members are FILTERED OUT of group drags (both carry maps),
group resizes (`beginResize`), and the Delete-key sweep (explicit deletes — the
strip X, the menu — still work). Resize handles are not rendered on a locked
node; ghosts of a locked job pan too; `BinBoard.startDrag` honours both locks.
The toggle lives in the node action strip (beside TV), on the tile top row
(left of TV, hover-revealed until ON, amber when ON), and in both context
menus ("Lock in place" / "Unlock", multi-select aware). A locked node wears a
small amber lock badge at rest — without it a thing that will not move reads
as broken. Clip art has no strip, so its lock is menu-only; the badge shows.

## The plan pane exists from the first frame
`planPaneOn = planWanted && (detectedPdfId || (fetchingPdf && driveLink))` —
with a Drive link but no saved plan, the pane used to appear only when
`findAllPlansPdfsViaBackend` returned (~2s), shoving the layout mid-read. The
no-file branch of `planPane()` now renders a spinner ("Finding the plan in
Drive…") inside the pane's own frame, for the side pane and the phone tab
alike; a folder with no plans folds the pane away once, honestly.

Harness: `scratchpad/lockselect.mjs` (32 checks) — Select/pen/eraser tile
states, the outline circle's size, the eraser panel, the pen panel's removed
text, legacy-stroke promotion + whole-mark erase, note/tile lock (drag, resize
handles, Delete key, unlock, click-opens), and `elementFromPoint` over every
dropdown row with the board AND with Wolfson's sticky building bars beneath.
Close the eraser's options via its BACKDROP in tests — Escape also puts the
armed eraser down (by design) and reads as a failed toggle.

---

# v2 — invisible groups, the notebook's memory, and a corner that holds

## Invisible groups
`Apartment.boardGroup` / `CanvasElement.boardGroup` — a shared STRING, not a
container record, so a grouped tile is still an ordinary tile in every count,
report, export and backup, and ungrouping one thing is clearing one field.
Nothing is drawn around a group AT REST (the owner asked for grouping you feel,
not see) — but the moment ANY member is selected the whole group draws a dashed
indigo box (`groupOutlines`, `data-group-outline`), because a thing that
silently drags its neighbours is otherwise a surprise. The box is the union of
every member's LIVE rect, read through `jobPos`/`elPos`, so it travels with a
drag instead of being left behind; its border and padding are divided by zoom
(a marker, not part of the drawing) and it is indigo rather than the selection
blue, so "these travel together" and "this is what you have hold of" stay two
different statements. A chip beside the lock is the per-item sign, and pressing
that chip takes **only that one thing** out. Right-click offers `Group these N` (needs
two) and `Ungroup`.

- `withGroupJobs` / `withGroupEls` expand a drag's id list to the whole group,
  and each drag path also gathers the OTHER kind through `groupsMoving` — a
  group can hold tiles and nodes together.
- A group left with one member **dissolves**: one thing is not a group, and a
  lone marked member would silently adopt whatever joined it next.
- `boardGroup` is in `updateApartment`'s CANVAS_ONLY set — grouping is
  arranging, not editing, so it must not bump `contentUpdatedAt`.
- Bins and arrows are refused membership: a fixture and a thing with no
  position of its own cannot travel as members.

## The notebook's data outlives the notebook
`BoardSetting.plannerArchive` (inside `boardSettings`, so it inherits persist /
sync / export / import with **no new state key**). Every delete path goes
through **`removeEl(id)`**, never `deleteCanvasElement` directly: it archives a
`rota` / `week-planner` node's data first, releases every job whose
`inNotebook` pointed at it, and only then deletes. Placing a fresh planner of
the same kind revives the newest archived contents and says so.

Two faults this fixes, both of which lost work in silence: removing the widget
took the season's planning with it, and the jobs it was holding were left
`inNotebook` — not on the board, not in any notebook, gone as far as anyone
looking could tell.

## A locked edge never asks
The "Make room above?" modal is gone, with `askRoom` and both dwell checks —
the owner's ruling: if it is locked, it is locked. `makeRoom` survives as two
deliberate buttons in board settings.

## The zoom corner
`clampPanRef` is now ONE continuous range per axis instead of a
taller-than-viewport branch and a smaller-than-viewport branch that disagreed
about where the top belongs (one put the world under the floating chrome, the
other pinned it to the chrome's edge). Crossing between them at a zoom step is
what shoved the board down on the first press of minus. The rule now: the top
may never sit below the chrome's edge, and never above the point where the
world's own bottom reaches the viewport's.

Two supports: `zoomCentre` anchors at the **header's measured bottom**, not the
viewport's top — the point the clamp actually allows — and the board
normalises its opening pan through the clamp once on arrival (asking for the
far top-left, so it lands ON the pinned corner rather than at the bottom of the
allowed range).

## The group rename box
`BinSettings` moved to MODULE level. Declared inside `NodeSettings`' render
body it was a new component TYPE every render, so the first store echo
remounted it, reset the field and dropped focus — the owner's "it doesn't let
me type, it disappears after a second". Same declared-in-render trap as the
plan pane. `BoardItems` also gained `isBin && !isEditing`, or a double-clicked
group set the editor state and nothing ever drew it.

## The weekly notebook's week controls
The PUT AWAY strip, its eye chips, "show them all" and both full-width
AddWeekRow bars are **gone**. Adding, restoring and putting away a week are
three tiny icons at the end of each week's own label (first week carries
add-before, last carries add-after; a week put away in that direction turns the
plus into an eye). Month rules are `textSize + 2` — they are the landmark the
eye scans for.

Harness: `scratchpad/grouplock.mjs` (23 checks). **Grab the MIDDLE of a tile in
a harness** — the top strip is buttons now, and a press up there is a button
press, which reads as "dragging does nothing".

---

# v2 — the board's own size, margins, and things that resize together

## The board is only as big as its content, and it has margins
`maxX/maxY` come from the content alone (they always did) — what was missing is
that the PAN was left where it was, so the room a widget opened stayed on
screen after the widget moved back in. The board re-clamps whenever its own
size changes, so the space disappears the moment it is given back.

`BoardSetting.margin` (default `BOARD_MARGIN`, 28) is a gutter kept clear on all
four sides, like the margins on a page: `settleDrop` refuses to place anything
inside it and the world adds it beyond the far content edge. It exists because
the weekly planner sat flush against the chrome.

**Edge auto-pan travels in all four directions.** It used to refuse up and left
unless that side was unlocked — a rule borrowed from GROWING the board, which
is a different thing. Panning back toward the origin creates no space and the
clamp stops it at the world's edge anyway; refusing it meant carrying something
to the left edge and watching the board sit still.

## A job tile resizes like everything else
`Apartment.tileW/tileH`, absent meaning the shared default — so the field stays
undefined on almost every record. They ride inside `apartments` (already
persisted/exported/imported/synced, no new key) and are in `updateApartment`'s
CANVAS_ONLY set, because sizing a tile is arranging, not editing.

**`tileSize(job)` is the single answer to "how big is this tile"** and every
place that needs a job's BOX goes through it — snap targets, lasso hit-testing,
world bounds, the group outline, host boxes, Fit. `defaultPos`'s grid
deliberately does NOT, or a board of resized tiles would re-flow every time one
changed. The gesture is its own small state (`jobResize`) because the commit is
`updateApartment` rather than `updateCanvasElement`, but it lines up through the
SAME `snapResize` and shows the same hint, so the two can never feel different.
Ghosts get no handle: a ghost is the same record shown twice.

The tile also lost its duplicate Drive icon (the header light AND the bottom
link were both drawn), and every resize hint now ends "press 0 to reset".

## Guides can match SIZES, not just edges
`snapResize(..., matchSize)` snaps the dragged corner to a neighbour's WIDTH or
HEIGHT when no edge has already decided that axis, and draws its guide along
the matched dimension of BOTH boxes — two lines of the same length say "these
are now the same width" in a way a single edge line cannot. Two boxes of equal
size that are not in a line share no edge, so edge snapping alone can never
find it. Settings: `BoardSetting.smartGuides`, on unless switched off.

## Building Progress is a real diagram
Each cell carries its number and family name (`readableOn()` picks black or
white ink from the fill's luma) and each cell is a BUTTON that switches
workspace and opens that unit — `WidgetCtx.openUnit(projectId, apartmentId)`,
provided by the dashboard and the board. The outer control had to become a div:
a button inside a button is invalid markup that browsers flatten.

**Two ordering rules this exposed, both now documented in code:**
- `setCurrentProject` CLEARS `pendingFocus` as part of arriving somewhere new,
  so the intent is handed over AFTER the switch, never before.
- **A page consumes an intent only when it can actually show it — workspace as
  well as kind.** The board stayed mounted for one commit carrying the new
  workspace's id and swallowed the apartment intent, so the unit never opened;
  it now ignores any intent while `currentProjectId !== 'general'`. The diagram
  likewise waits for its own apartments to arrive rather than consuming an
  intent it cannot yet resolve.

## The map says what it cannot place
Pins are proper teardrops at 26×34 (an 11px dot read as a speck), red with a
`!` for a job with no address, and hovering one shows a card with the address,
the stage, the open-task count, who is booked, and up to three photos back from
site (photo → assignment → apartment, built once per render, not per hover).
The no-address badge is legible now and still flies to those pins.

Harnesses: `scratchpad/tilesize.mjs` (tile resize, hint, 0-reset, one Drive
icon, margin) and `scratchpad/boardsize.mjs` (board shrinks back, edge-pan both
ways, Building Progress cells and click-through).

---

# v2 — deleted stays deleted, and the wheel goes where you point

## Tombstones — the third state a Firestore snapshot cannot express
**A missing doc means two different things** — "not uploaded yet" and "deleted
somewhere else" — and the app treated both as the first. The apartments
listener KEEPS any local record the snapshot lacks, and `startFirebaseSync`
then pushes every such record back up as "missing". So a job deleted on the
office PC came straight back the moment the TV or a phone synced: the owner's
"deleting previous imports doesn't actually delete, they keep coming back".

`fsTombstone` / `fsGetTombstones` / `fsListenTombstones` in `firebase.ts` — ONE
document per workspace (`projectCollection(pid,'tombstones')/deleted`) holding
`{ ids: { [id]: when } }`. Merged, so two devices deleting at once cannot
clobber each other; pruned to the newest 4000 once it passes 6000, with a
WHOLE-doc write because a merge cannot remove keys. Ids become MAP KEYS, so
they must never contain `.` or `/` or start with `__` — everything this app
mints is safe.

`_tombstones` in `store.ts` is module-level and **deliberately not state**: it
is a mechanism, not the office's data, so it stays out of persist / export /
import and out of the backup audit. It is written by `deleteApartment`,
`removeJobsByIdPrefix` and `deleteCanvasElement`, read at load (local records
are dropped before anything is seeded), consulted by BOTH missing-seeders and
BOTH listeners, and cleared on workspace switch.

## The wheel belongs to whatever is under the pointer
`wheelScroller(target, dx, dy, stopAt)` walks up from the target looking for an
ancestor that genuinely scrolls in the direction asked for. The old rule needed
an opt-in `data-wheel` marker, which meant every widget drawn through `Frame` —
and `Frame` is `overflow-auto`, so most of them — silently lost its wheel to
the board's zoom. `data-wheel` and `.board-rail` still count as markers, and
`data-wheel-own` still means "hands off entirely" (the map). At the end of a
list's travel the wheel goes back to being the board's, so one flick keeps
zooming.

**A harness that wheels at a node's centre must first assert the point is
really on it** (`el.contains(document.elementFromPoint(...))`). The first
version placed its widgets at board x=1400 in a 1300px window, so every wheel
went nowhere and "the board did not zoom" passed for the wrong reason.

## Zooming out walks home
Zooming IN holds the point under the pointer — settled, unchanged. Zooming OUT
pulls the pan part of the way toward the corner the clamp allows (`{x:0,
y:1e6}` put through `clampPanRef`), by `t = clamp((1 − next/prev) × 2.5, 0, 1)`
— derived from the step so it stays in proportion if the zoom ladder changes.
A few steps out and you are back on the view you get when you arrive, instead
of hanging over the middle of the board.

## Margins are a gutter, not a rule about where things may go
`clampPanRef` pins `margin × zoom` INSIDE the viewport on a locked edge. The
right and bottom got their margin from the world's size; the left and top were
pinned to the origin, so changing the setting did nothing there. Now all four
edges show the same clear strip whether or not the edge is locked.

## Every theme travels
`surfaceAtZoom` only offset the pattern by the pan for the DOTS and GRID
themes. Cork, kraft, steel, linen, manila and chalk were nailed to the screen
while the work slid across them — "the widgets move above the board and the
board doesn't come with them". A tile-less surface now gets the same pan offset
(one `background-position` value; CSS cycles a shorter list over every layer)
and its `background-size` scaled by the same power-of-two step, one factor for
every layer so the texture keeps its proportions.

## The overview draws the board's SHAPE
`MiniMap`'s panel is a fixed box and the board is fitted inside it, so a tall
board used only a strip of the width — and with the leftover painted the same
white as the board it read as though dragging the planner DOWN had also grown
the board to the RIGHT. The panel is grey now with the board's own rectangle
painted white on top. It also has the shared grip.

## `usePanelDrag` — one drag, three panels
Lifted out of `MovablePanel` so the tool rail and the overview move exactly the
way the popovers do. **`0` while the gesture is live puts the panel back on its
dock**, the same key that resets a size, and the hint says so. Checked against
a REF and cleared there: the keydown and the pointerup can land in the same
tick, and a state read would commit the dragged position straight back over the
reset — the trap the tile resize already paid for.

## Enter saves, once, globally
`useEnterCommits()` in `App.tsx`: Enter on a single-line `<input>` BLURS it,
which runs the save the field already has (this app commits on blur nearly
everywhere). Rather than a key handler on a hundred inputs and a miss on the
hundred-and-first. Left alone: a textarea, a field inside a real `<form>`,
anything that already handled the key (`defaultPrevented`), and fields marked
`data-enter-own` — the repeat-add boxes (add-stage, the time clock) where Enter
means "add another" and the focus must stay put.

## Words grow with the box
`nodeGrowth(type, w, h)` in `BoardItems` — the SMALLER of `w/defaultW` and
`h/defaultH`, so stretching one side alone can never push the words out. Notes,
headings and section-box titles carried a FIXED font size while every widget
already scaled through `WidgetSurface`. A section box grows more gently
(`0.85..1.8`) because it can be enormous. `TEXT_STYLE_FIELDS`' floor is 4, not
8 — on a widget that number is a multiplier against 14, not a font size.

Harness: `scratchpad/round11.mjs` (16 checks).

## Importing the CRM's own export
`scratchpad/planzoho.mjs` converts a Zoho deals export into the app's OWN
import template, applying the owner's routing table, and `buildapproval.mjs`
turns the plan into a page he approves BEFORE anything is written. Neither
touches the app or the cloud.

**The export and everything derived from it are gitignored** — real family
names, phone numbers and Drive links. The tools are committed; their output
never is.
