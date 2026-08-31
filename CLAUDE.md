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

### STANDING RULE — ONE BRANCH. Commit straight to production.
**There is no branch called `main`.** The repo's default branch — the one Vercel
deploys to `wolfson-management-app.vercel.app` — is
**`claude/blissful-cray-spTFY`**. When the owner says "push to main", that is
the branch he means: work sitting anywhere else only ever produces a PREVIEW
build behind Vercel's sign-in.

**OWNER RULING (2026-08-27): work on that branch DIRECTLY.** No per-session
working branch, no fast-forward dance. The old two-branch habit put two rows
on the Vercel deployments page for every single commit — a Preview and a
Production — which is most of what made that page read as "a big mess", and
a branch that forks for a day inherits whatever platform limit was fixed
meanwhile (see the 12-function rule below: the Flip/iPad branch was red for
a day for exactly that reason). One branch, one row, one truth.

So every round: commit on `claude/blissful-cray-spTFY` and push it. Before
pushing, `git merge-base --is-ancestor origin/claude/blissful-cray-spTFY HEAD`
must succeed — if it does not, another session pushed; **merge, never force**.

**When another session DOES need its own branch** (a parallel round, a design
session), it merges PRODUCTION INTO ITSELF while it works and its branch is
merged back the moment its round lands. Judge such a branch by FILES, never
by commit count:
  `comm -13 <(git ls-tree -r --name-only origin/claude/blissful-cray-spTFY | sort) \
            <(git ls-tree -r --name-only origin/<branch> | sort)`
Old branches carry hundreds of commits whose SHAs differ because they were
squashed in — that is not lost work, and a commit count says nothing.

Audited 2026-08-27, everything folded into production and re-checked by that
file test: `claude/tzviair-platform` (205 commits) and
`claude/firebase-save-diagnostics-Px3rx` (57) hold **nothing** production
lacks except `api/health.js`, which was deliberately RETIRED to stay inside
Vercel's 12-function limit — merging either branch would put it back and turn
every deployment red again. Their one genuine document was rescued to
`docs/SYNC_REPORT.md` (a June 2026 report on how the platforms do sync).
`claude/jobs-notebook-drag-drop-hf5xlz`, `claude/skill-installation-h5hfp0`,
`claude/mobile-buildings-domain-il3khp` and `claude/tv-green-border-scaling-rknz7j`
are strict ancestors of production — dead weight, safe to delete.

## Deployment
- **Hosting**: Vercel (connected to GitHub repo, auto-deploys on push)
- **Serverless API**: `/api` folder at repo root — Vercel auto-deploys each `.js` file as a serverless function
- **Environment variables**: Set in Vercel dashboard (Firebase config, Google service account, API key)

## HARD LIMIT — at most 12 files in /api (Vercel Hobby)
Vercel's Hobby plan allows **12 serverless functions per deployment**, and
every `.js` file under `/api` is one. The 13th file turns EVERY deployment
red at the platform step — while local `tsc && vite build` stays green,
because the local build never touches `/api`. That is exactly how production
silently stopped updating for a day (2026-08-26: `photos-cover.js` was the
13th; the unused `health.js` gave up its slot, its report now lives at
`GET /api/geocode?health=1`). **Adding a route means folding it into an
existing one or retiring another first** — check with
`node scratchpad/apilimit.mjs`, and glance at the Vercel deployments page
after shipping: a red "Error" there with a green local build is this.

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

## Skills live in the repo, local Claude state does not
`.claude/skills/<name>/SKILL.md` is tracked and travels with the project — a
skill is shared working method, the same as anything else in here. Everything
else under `.claude/` (settings, permissions, per-machine state) stays ignored.

Git cannot re-include a file whose parent directory is excluded, so `.gitignore`
excludes the CONTENTS (`.claude/*`) and re-includes `!.claude/skills/`. Writing
it as `.claude/` would make the exception impossible.

Installed so far: **slow-plan** — planning any large piece of work one small
visual sitting at a time, a batch of starred questions per page, every answer a
permanently numbered locked pick, ending in a sealed master plan.

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

## The overview is a picture of the board, not a violet field
`FACES` in `MiniMap.tsx` — a painted miniature per widget id (tint plus at most
a dozen coloured cells): the building diagram reads as a grid of stage colours,
the planner as ruled rows, the calendar as a month, the map as pins on green.
**Deliberately painted, never rendered.** Twenty live widgets redrawing on
every pan is exactly the cost the overview exists to avoid, and the owner asked
for accurate-not-slow by name. Cells are only drawn once the mark is ≥15×12px.

Its two controls now sit in opposite corners — **expand top-left, move
bottom-right** — at 13px with a ring, because at 11px in the same corner they
read as absent.

**A panel's drag handlers must `stopPropagation` on MOVE and UP, not just
DOWN.** The overview treats a pointermove-with-button-down as "jump the view
there", so dragging its own handle flung the board across the world while the
press itself was correctly stopped.

## Building Progress writes only what fits
The cell is MEASURED (`ResizeObserver` on the grid) and the number appears at
≥16px, the family name at ≥27px, each sized from the cell. Fixed 7.5px/6px type
was fine on a dashboard card and turned the store's 250×165 preview into two
smudges stacked on each other — worse than the plain colour squares it replaced.

## The widget store's shelves are a menu
A persistent chip row under the search names every shelf with its count and
filters to one; `widget_store_shelf` remembers it per machine. Ten shelves down
one scrolling page meant nine names were off-screen and the scroll started at
the top again on every open.

---

# v2 — the viewer earns its place, and a sticky note is one note

## The plan viewer: two scales, never one
The owner's report was "blurry, and zooming refreshes all the layers every
three seconds". Both came from the same thing: every zoom step resized all
three canvases — which CLEARS them — and started a fresh pdf.js render of the
whole page. On a real A0 sheet that is a second of white per step.

- **`scale` is the LAYOUT scale and moves instantly**: the canvases keep the
  bitmap they have and are given a new CSS size, so the sheet grows under your
  hand for the cost of one style write.
- **`raster` follows 170ms after your hand stops** and is the only thing that
  triggers a render.
- The render happens **off-screen and is blitted in one `drawImage`**, so the
  plan never blinks. `drawnAt` remembers what is painted, which kills the
  duplicate render that fitting-on-open used to cause.
- The device ratio has a **floor of 2**, not "whatever the screen says" — an
  ordinary monitor reports 1, which drew the sheet at exactly the pixels it
  occupied and looked like a smear the moment you leaned in. The cap is an
  AREA (32 MP), because an A0 at 400%×3 is a canvas the browser refuses to
  allocate, and a refused canvas is a blank plan.

**The viewer's controls are Drive's controls**: a floating pill at the bottom
centre with the pager, −, the percentage (press to fit) and +. The top bar's
pager and zoom are hidden while `locked`, so there is one set, not two. Plans /
Layers / Download / Print stay in the top bar. The studio is untouched — it has
its own rail and two toolbars.

Harness: `scratchpad/planviewer.mjs` — makes a 3-page PDF with pdf-lib, serves
it on `/api/drive-fetch`, and asserts the backing canvas is ≥2× its CSS size,
that five fast zoom steps never leave the canvas blank, and that it re-sharpens
when the zoom settles.

## A sticky note is ONE sticky note
`sticky-pad` used to be a pad of many pages with a cork board hidden inside it,
while a separate `notes-board` widget gathered pages out of every pad — two
boards, one invisible until you found the button. Now:
- the widget is **one note** (renamed "Sticky note"); its folded corner calls
  `spawnStickyBeside`, putting a NEW note on the board;
- a one-time migration in `GeneralJobsPage` **splits every old multi-page pad**
  into one note per page, laid out beside the original. Nothing is discarded,
  and it converges — a Firestore echo of an old pad is split again;
- `notes-board` is the only board.

## The X asks before it destroys
`whatIsLost(el)` returns, in words, what a removal would take — the words on a
note, what is written on a sticky, everything in a widget's bag. `removeEl(id,
ask = true)` confirms with it. **The weekly planner is exempt**: its contents
are archived, not destroyed. A multi-select or a group removal asks ONCE for
the whole sweep (`ask: false` on the children) — a prompt per node on fifteen
nodes is a prompt nobody reads.

## The import must produce ordinary jobs
An imported job has to be indistinguishable from one typed by hand, and that
includes **its Drive folder being opened up**: saving a link by hand fires
`shareJobFolderSurfaces`, and the import skipped it, which would have left
several hundred jobs whose plans only opened for whoever was signed in.
`shareJobFolderSurfacesNow` is the awaitable twin; the import walks the linked
jobs in fives **with the progress bar on screen**, and a full-screen hold keeps
anyone from wandering off to the board halfway through. A flat job folder with
no subfolders now shares the job folder itself.

## The wallboard can say what it is
`ScreenReport` — the Info button on the wall's bar. Reports what the browser
thinks the window is, the device ratio, the real pixels, what `screen` says,
and draws a one-pixel grid as a sharpness test. A 4K panel reporting 1920×1080
at ratio 1 is the TV stretching the picture, which no change in this app can
sharpen; anything more is ours. Read it off the actual TV before touching the
wall's scaling.

---

# v2 — the board's chrome, and one notebook everybody watches

## The rail lives in a BAND
`BoardToolbar` takes `topGap` / `bottomGap`, measured in `GeneralJobsPage`
(`chromeGap`, a `useLayoutEffect` that only writes when the numbers change):
the floating header's real bottom — whose right-hand end carries **Add job**,
which the rail used to lie straight across — and whatever the overview is
currently taking. `alignItems: center`, so the rail floats in the middle of
what is left rather than starting at the top.

## The overview is a widget now
No more two-step bigger/smaller. A resize corner **top-left**, the move handle
**bottom-right** (opposite corners on purpose), `0` while sizing puts it back,
and the size lives in `board_overview_size` — localStorage, per machine, the
same rule as the tool rail's size and `board_default_zoom_<pid>`. When the
panel has been MOVED it is anchored top-left, so resizing also shifts the
stored position (`movePos` on `usePanelDrag`) to hold the far corner still.

## The store says what is already there
`WidgetStore` takes `placed: Map<widgetId, count>` — the board passes what is
on the ACTIVE named board, the dashboard passes its own widgets. Labelled,
**never disabled**: a second notebook or a third clock is a real thing to want.
"on the board" (grey) and "added" (green) are two different facts and are drawn
side by side, never one instead of the other.

## One notebook is MAIN, the rest are projections
`el.data.role: 'projection'` — absent means main.
- `PlannerHost` in `widgets.tsx` subscribes to `canvasElements` and renders the
  MAIN's element for a projection. It must be a real component: the projection
  has to redraw when a DIFFERENT element changes, which a plain render function
  in the registry cannot see.
- It renders the main's **identity**, not just its data — every link a planner
  makes (`inNotebook`, the schedule window, the take-off dialogs) points at a
  notebook by id, and a projection answering with its own id would quietly
  build a second set of them.
- `projection` is a separate prop from `readOnly` because a projection keeps
  ONE gesture: a click on a job still opens it (`openOnly` on the entry). That
  is the whole reason to put a copy on a second screen.
- The second planner placed on a board defaults to a projection; the pencil's
  **plannerRole** field moves the crown, demoting every other copy first, after
  a warning. Demote-then-crown, never the other way round — two mains for even
  a moment is a projection with nothing to point at.

## Two group bugs the wall showed
`binKeyOf(openBin)`, never `openBin.binKind` — the documented trap, and it
meant every group made by hand (or by the import) opened EMPTY on the TV. The
group window also has the app's forgiving search on top now, because a group
holding six hundred finished jobs is a scroll, not a list. And a group the
import creates wears the Archive slate rather than amber: it was the one yellow
thing on the board and read as a warning.

---

# v2 — the wall's real resolution, and a selected widget owns the wheel

## The wallboard lays out; it does not stretch a picture
The owner's own panel reported **2560 × 1248 at ratio 0.75** — a 1920 × 1080
screen with the browser's zoom at 75%, so the page is laid out 2560 wide and
squeezed into 1920 real pixels. On top of that the wall scaled its whole surface
with `transform: scale()`, which hands the browser a subtree drawn at its
NATURAL size and stretches the resulting bitmap: every letter and hairline is a
resampled copy of itself.

**`zoom`, not `transform: scale()`**, on both wall surfaces (the board and the
building diagram). `zoom` scales the LAYOUT, so text is laid out and rasterised
at the size it will actually appear. The sizing arithmetic is unchanged — a
percentage inside a zoomed box still resolves against the unzoomed containing
block, so `width: 100/scale%` lands on the frame either way — and the translate
stays a transform, inside the zoom, in board units.

`ScreenReport` now names the third state: a device ratio BELOW 1 is the
browser's own zoom set under 100%, which is the worst of the three and the
easiest to miss. It says so and gives the fix (Ctrl+0, then use the wall's own
− and +).

## A selected widget owns the wheel
`wheelScroller` only finds a scroller the pointer is actually ON. Press a
widget on its heading, or in the space beside its rows, and nothing scrollable
is under the pointer — so the wheel fell through and the board zoomed out from
under it. `innerScroller(node)` finds the scrolling part INSIDE a node, and the
board hands it the wheel whenever that node is in `selectedElIds` (read through
`pickedRef`, because the wheel listener is registered once). A selected widget
with nothing to scroll still lets the board zoom, so a clock or a photo does not
swallow the gesture.

Harness: `scratchpad/round13.mjs`. Its own trap, worth remembering: it wheeled
first and then clicked at the OLD coordinates — the zoom had moved everything,
the click landed on a job and opened the drawer, and the result read as
"selecting a widget does nothing". Re-measure after anything that moves the
board.

---

# v2 — running the CRM import for real

## The rehearsal (`scratchpad/runimport.mjs`)
Thirty-two checks driving the REAL wizard end to end on a throwaway profile:
seed a board (so the four built-in groups exist, which is what makes the file's
`Done`/`Trash`/`Archive`/`Ready to Start` match rather than create duplicates)
→ upload → read the preview → Apply → count what landed → take the whole batch
back out. The verified figures for the prepared file, from the CSV, the plan
JSON and the landed board alike:

| | |
|---|---|
| rows | 1,148, none skipped, 177 worth a look |
| Done | 546 · stage "Job completed" |
| Trash | 345 · no stage |
| Archive | 151 · no stage |
| Ready to Start | 87 · stage "Ready to start" |
| Currently in AC | 15 · stage "AC installation" |
| Currently in Geves | 4 · stage "Installation of Geves" |
| with a Drive folder | 1,008 · with a phone 459 |

**Read the card's own strings, never guess them.** The first version looked for
an "Apply" button and a "will be created" summary; the card says
`Import 1148 jobs` and `1148 will be imported`, so a working card was reported
as broken and all fifteen downstream checks failed with it.

## A progress bar must be given a frame to draw in
`paint()` in `ImportJobsCard` — `requestAnimationFrame` **raced against a 60ms
timeout**, awaited after every `setStep`. React flushes a state change on the
next microtask, but a PAINT needs a real frame, and with no Drive backend to
wait on (or a file with no links at all) the whole import ran to completion
inside one task: the overlay never appeared and the screen simply froze, which
is the exact failure the bar exists to prevent. The timeout is there because a
backgrounded tab is never given a frame and an import must not stall because
somebody switched away from it.

## Where the import has to be run, and why it is not here
**This container has no credentials** — only `.env.example`, no `.env.local`,
no `VITE_DRIVE_API_KEY`, no Firebase config. The import's second half opens
each job's **Engineered Plans** and **Photos** folders through the Drive
backend, so an import run anywhere without that key creates the records and
silently skips the sharing — several hundred jobs whose plans open only for
whoever happens to be signed in, which is the gap that was closed on purpose.
It therefore has to run in a browser that has the key: the deployed app.
Do NOT "solve" this by bundling the export into the repo — it is real family
names, phone numbers and Drive folder ids, and a Vite bundle is public.

The export and everything derived from it stay **gitignored**
(`scratchpad/*.csv`, `import-plan.json`, `import-approval.html`). The tools are
committed; their output never is.

---

# v2 — the wall's two different kinds of "fuzzy"

## SIZE and SHARPNESS are different faults with different remedies
The office reported the wall as fuzzy and unreadable. Its own numbers —
`2560 × 1248`, ratio `0.75`, real `1920 × 936`, screen `1920 × 1080`, board
scale `112%` — hold two independent problems, and fixing either one alone
leaves the complaint standing:

- **SIZE.** `112%` is `autoScale 1.6 × boost 0.7`: the wall's OWN zoom was
  turned down to 70%. Measured on that panel, the smallest text on the board
  was **8.4 real pixels tall**. Nothing can sharpen writing that small; it has
  to be bigger. This is the fault that made words unreadable.
- **SHARPNESS.** A device ratio below 1 is the browser laying the page out
  wider than the panel and squeezing it down, so a letter is drawn into three
  quarters of a real pixel.

## The frame lays out in REAL pixels
`dprFix` in `TvPresentationPage`: when `devicePixelRatio < 0.98`, the frame is
given an explicit size in **device** pixels and `zoom: 1/dpr`. One CSS pixel
inside the wall is then exactly one device pixel (asserted:
`frameZoom × dpr === 1.000`), so text is laid out and rasterised at the size it
is shown. An inline width beats the `h-screen w-screen` classes, so no
className changes.

**On the FRAME, never on the root.** Viewport units are not divided by zoom, so
a `w-screen` frame under a zoomed root lays out 2560 wide and is then zoomed
again — a third of the wall ran off the side. Screens already at 1:1 are
untouched; browser zoom on a desktop is somebody's deliberate choice.

**This buys sharpness, not size** — verified: smallest text is 12 real px on
the compensated 0.75 panel and 12 on a true 1920 screen. Do not present it as
making anything bigger.

## `autoScale` must watch the FRAME, not the window
It measured `frameRef.clientWidth` once on mount and thereafter only on a
window resize — but the frame ALSO changes size when the compensation above
kicks in, which fires no resize event. The scale stayed at the figure computed
for the uncompensated frame and the board was silently drawn a third larger
than the number it reported. Now a `ResizeObserver` attached through a
**callback ref** (`setFrame`), because the page has four frames and switching
view swaps the node out from under a plain effect.

## The report reads numbers back off the page
`ScreenReport` measures rather than assumes: it walks text leaves and reports
the smallest in real pixels via
`fontSize × (rect.height / offsetHeight) × dpr`. Confirmed by probe: under
`zoom`, Chrome keeps `getComputedStyle().fontSize` and `offsetHeight` in the
element's LOCAL space and scales only `getBoundingClientRect()` — so the ratio
is required and multiplying computed font-size by `dpr` alone is wrong.

It now shows **Wall zoom** and **Smallest text** on their own lines, says how
much screen the browser's toolbars are eating, and offers one press that raises
the wall's zoom to `READABLE_PX / smallest × boost` and goes full screen.
The old advice to press **Ctrl and 0 was removed as the primary remedy** — it
is useless to somebody standing in front of a TV with a remote.

Harness: `scratchpad/tvsharp.mjs` — the office's exact geometry, with
`window.screen` overridden to 1920×1080 because Playwright reports `screen` as
the viewport and the browser-bar condition cannot otherwise arise. Its own
trap: `button[title="About this screen"]` must be matched WHOLE — a loose
`/screen/` hits **Full screen** first, which sits earlier in the bar, so the
wall went full screen and a working report read as broken.

---

# v2 — a group is the board, and a deleted job leaves the notebook

## `binKeyOf`, never `el.binKind` — found in four more places
The documented trap, and it is what made the imported groups read as empty:
- the board's tile passed `binCount(el.binKind)`, so a group made by hand or by
  the import counted **0 jobs** however many were filed in it;
- the click-to-open path guarded on `el.binKind`, so those groups **could not be
  opened by clicking at all**;
- the wallboard did not draw them as groups and counted 0;
- `boardExport` left them out of the picture entirely.

**Double-click on a bin OPENS it.** `BoardItems`' `onDoubleClick` called
`H.elEdit` for every node, so the one gesture people reach for to look inside a
group offered to rename it instead. Renaming stays on the pencil (`BinSettings`).

## The group window draws the board's own tile
`TILE_W` / `TILE_H` / `tileSize` moved to **`BoardItems`**, with the tile.
`BinBoard` carried its own 190×116 pair, which is why a job looked like a
different kind of thing inside a group. It now renders `JobTile` with a real
`BoardHandlers` object — every job handler was a no-op before, so the lock, the
wallboard switch, the ungroup chip, the thumbs, the corner resize and the
right-click all arrive for free and can never drift again.

Rules this exposed, each a real fault:
- **A click SELECTS; two clicks open.** The group opened a job on ONE click, so
  double-clicking the group put the second click — and the `dblclick` after it —
  straight onto whichever tile had appeared under the pointer, throwing a job's
  drawer open at random every time somebody looked inside a group.
- **`settling()`**: for 400ms after the window is born, tiles ignore presses. A
  gesture that began before this window existed is not aimed at it.
- **`pickedRef`** is recorded in pointerDOWN, the same trap the board pays for:
  asking on pointerup always answers yes, so the first tap would open.

## Zoom and pan inside a group
Native scroll does the PANNING, a transform does the ZOOMING — one movement
system, because only one of them moves anything. `toLocal` divides by `zoom`
(forget it and tiles move at the wrong speed at any zoom but 100%). Ctrl/⌘+wheel
is bound by hand with `{ passive: false }`; middle-drag and space-drag write
`scrollLeft`/`scrollTop` directly. **Still missing inside a group**: the
overview map, lasso select and the drawing tools.

**Harness trap worth remembering** (`scratchpad/groupboard.mjs`): the board's own
header carries zoom buttons with the SAME titles and sits earlier in the
document, so a bare `button[title="Bigger"]` drove the board while the test read
the group. Scope every group-window query to `.bin-window-in`.

## A notebook entry is a reference, so a deleted job must be taken out of it
`src/data/plannerPurge.ts` — pure, written against the SHAPE of planner data so
the store never imports a component. Wired into `deleteApartment` and
`removeJobsByIdPrefix`, covering live `cells`, the `offKept` slots held for
somebody taken off, and `boardSettings.plannerArchive` (a removed notebook's
contents come back when a new one is placed, dead references included).
Only CHANGED notebooks are written, or every delete would touch every notebook
document on every device.

A one-time sweep in `GeneralJobsPage` clears the ones already there. **It waits
for the workspace to arrive** — the same settle-first idiom the bin seeding
uses — because "not in `apartments`" and "nothing has loaded yet" look identical
for the first second and one of them destroys a season's planning.

## The building name is pinned again, and lockable
It was `sticky top-0 z-10`, and a highlighted cell carries `z-10` too — cells
come later in the DOM, so the tie went to the cells and the name was painted
over as they scrolled past. `z-20` beats them and stays far below any dialog
(What's New is `z-[260]`).

**Both column components now share ONE `BuildingNameBar`.** They each carried a
copy, which is the trap this file already names: a fix applied to one is
invisible in the other, and that is exactly how Wolfson's bar spent months a
z-index behind Netiv's. A padlock on the bar switches pinning off per workspace
(`BoardSetting.stickyBuildingName`, absent = pinned).

## The plan viewer's Layers selector — broken by the viewer's own speed fix
`renderPage` skips a redraw when the page and the resolution are already on
screen (the guard that stopped fitting-on-open rendering twice). Switching a
layer is exactly that case, so `toggleLayer` changed the optional-content config
and drew nothing. It clears `drawnAt` first now: the guard is right for zooming
and wrong here, because what is drawn ON the page has changed even though the
page and its resolution have not.

`scratchpad/planlayers.mjs` builds a PDF with two real OCGs (the same pdf-lib
machinery `api/plan-annotate.js` uses) and counts the coloured pixels — verified
non-vacuous: with the fix reverted the red band stays at 95,130 px.

## The notebook asks what a drag meant
`PlannerDropDialog` — move it here / put a copy here / take it off. It used to
be decided silently by a modifier key: three different outcomes from one
gesture, so a hand that slipped while tidying the week took a job off the
planner with nothing said. Ctrl/⌘ still copies outright as a shortcut. Dropping
OUTSIDE the notebook asks too, and says plainly that nothing is deleted either
way.

## Anything that stands for a job drags onto a day
`src/data/plannerDrop.ts` — `placeJobsOnPlanner` (the board's own write, lifted
out) and `usePlannerDrag`, one hook so a list row and a diagram cell cannot end
up with two versions of the same gesture. `MiniJob` gets it, which covers
Running late, Due today, Job list, New this week and Find a job; Building
Progress cells get it through `ProgressCell`.

**`enabled` is load-bearing**: a notebook looks its entries up in ITS OWN
workspace, so another workspace's unit could only ever land as "(job removed)".
Building Progress passes false unless it is showing the workspace you are in.

Three traps this round paid for, all of them making a working thing look dead:

- **A drag ends in a `click`.** The row captures the pointer, so releasing over
  a square still dispatched a click back on the row — which opened the job's
  drawer every time somebody planned one. `justDragged` swallows it in the
  CAPTURE phase; React stops dispatching the rest of the path the moment
  propagation is stopped.
- **A React portal propagates up the REACT tree, not the DOM one.** These
  dialogs are portalled from inside a board node, so a press on a button
  reached the node's own `onPointerDown`, which captured the pointer: the
  button saw `pointerdown` and then nothing — no mouseup, no click. `Shell`
  now seals its pointer events. **Any modal rendered from inside a board node
  must do this.**
- **A component declared in a render body is a new TYPE every render.** The
  dialog's choice button was, so it remounted whenever the board ticked. Same
  trap as `BinSettings` and the drawer's plan pane.

**The weekly notebook's widget id is `rota`.** `week-planner` is a different
widget — seven free-text columns — and seeding that one draws a row of day
names with no people and no squares, which reads as a broken planner.


---

# v2 — drawing in a group, and spacing that lines itself up

## A group window is a board, so it draws
Pen, highlighter and eraser are MODES inside `BinBoard` exactly as on the main
board: while one is armed a press anywhere — empty surface or straight across a
tile — starts a stroke instead of a drag, pressing the armed tool again puts it
down, and Escape backs out one thing at a time (menu → tool → selection →
window). The colour/width strip is shown only WHILE a tool is held.

`src/data/boardInk.ts` is the geometry, lifted out of `GeneralJobsPage` rather
than written twice: `pointsBounds` · `fmtPoints` · `distToSegment` ·
`strokeRecord` · **`planErase`** (pure — says what a pass of the eraser would
change; the caller writes). The eraser alone carries three rules that were paid
for once already — a legacy stroke's stored box is a lie, a surviving run must
come back as a node (`data.own`), a run of one point draws nothing — and a
second copy would have fallen into all three again.
`src/components/board/EraserCursor.tsx` is shared for the same reason.

## A resize handle is not a button
**A straight stroke's box is one pixel tall, so its own edge handles sit on top
of the whole of its ink** and swallowed every press aimed at it: such a line
could not be drawn over and could not be rubbed out, anywhere. With a tool
armed, a press on a `[data-resize]` handle is INK — in `onElPointerDown`,
`onJobPointerDown`, `beginResize`, `onJobResizeDown` and the group's own
`startDrag`. A node's real buttons still take the press: you must be able to
open settings without putting the pen down.

## The group's world div is also its surface
`[data-bin-world]` is laid over `[data-bin-surface]` and is at least as big, so
a press on empty board lands on the WORLD div — and the "is this the empty
surface?" test never matched. The lasso and the right-click menu were
unreachable. Both divs carry `data-bin-surface` now.

## Snapping to the SPACE between things
`gapAxis` in `snapping.ts`, behind the existing `BoardSetting.smartGuides`
(relabelled **"Match sizes and spacing"**). Two things a hand means:
- **put it in the middle** — dropped between two neighbours, equal space either
  side;
- **the same gap again** — a gap that already exists in the row is offered as
  the gap to the next thing along, and the bar over the gap that SUPPLIED the
  number is drawn too, because one bar says "this is 40" and two say "this is
  the same as that".

Rules:
- Only boxes sharing a band on the cross axis count (`sameRow`/`sameCol`) — a
  gap between two things that do not overlap is not a gap anybody can see.
- **Per axis: alignment first, then spacing, then the grid.** Each axis decides
  for itself, which is what makes the ordinary case work — a third card takes
  its spacing from X and its alignment from Y.
- **A spacing bar's `axis` letter is the OPPOSITE of the axis it decided** (a
  horizontal bar is `axis: 'y'` — a y and a span of x). Sniffing the guide list
  to ask "is this axis taken?" therefore gets it backwards in a way that is
  very easy to write and very hard to see. Every such decision is now recorded
  in a plain boolean where it is made.
- **A resize is never offered the gap BEHIND it** (`mode: 'grow'`): the near
  edge is pinned, so only "the far edge sits a known gap short of the thing
  ahead" is a resize answer.

`Guide` gained `gap?: boolean` + `label?: string`, and
`src/components/board/SnapGuides.tsx` draws both kinds for the board AND the
group — a bar with end caps and its measurement, everything divided by the zoom
because a guide is a marker, not part of the drawing.

**Fixed on the way**: `snapResize` could never match a width and a height at
once. A width match pushes guides labelled `axis: 'y'`, which the height's own
`!guides.some(g => g.axis === 'y')` test then found and refused.

## The group snaps too
`BinBoard` runs the same `snapBox`/`snapResize` on its drags and both its
resize gestures, with its own `guides` state and `SnapGuides` inside the world
div. The whole selection moves by ONE offset — the snap is worked out for the
box the gesture is holding and everything else follows it, or an arrangement
tears apart. Its resize deltas are now divided by the zoom (they were raw
screen pixels, the documented trap).

## Harnesses
`gapsnap` (the arithmetic, offline, every number worked by hand) ·
`gapboard` (the wiring: bars on screen during the drag, gone on release, the
snapped position actually written, and the setting really turning it off) ·
`groupink` (drawing in a group, reading the STORE — "the eraser cut this in
two" and "the eraser deleted it" look identical on screen).

Traps these paid for, all of which made a working thing look broken:
- `/bg-white/` matches `hover:bg-white/15`, so a class-list regex calls every
  tool button lit. Measure the computed background.
- A press aimed at world coordinates that sit under the board's floating
  chrome — the rail on the left, the header on top, the overview bottom-right —
  hits the chrome. The floating header pushes the world down ~170px, so world
  y 700 renders past the bottom of a 900px window.
- Scenery has to be placed where it cannot ALIGN with the answer: a bin whose
  centre landed exactly on the target's right edge made edge snapping produce
  the right number for the wrong reason.
- Escape inside a group backs out one thing at a time, so one press leaves the
  window standing and it swallows every later click.

`board.mjs` and `lockselect.mjs` carried assertions that predated two shipped
decisions (the margin gutter pins `margin × zoom` inside the viewport on a
locked edge; the building name bar moved to z-20). Both updated.


---

# v2 — a gesture is a transaction

## The board gives space back, but never while your hand is on it
The size has always come from the LIVE content (`jobPos`/`elPos`), which is
what lets the board grow to meet a thing dragged outward. The cost was the
other direction: carrying a widget back in from the far corner shrank the world
a 400px step at a time UNDER THE POINTER, the pan re-clamped to the new edge,
and the whole board slid sideways while something was still being held.
Measured with the rule disabled: 3600 → 2400 → 1600 and the pan lurching 2000px
across in the middle of one drag.

**While a gesture is live the world may only GROW, and its size is a
HIGH-WATER MARK** — so a drag that goes out and comes back does not shrink
halfway through either. The moment the hand comes off, the true size is taken
and the space closes up, glided (`settling`, 280ms) rather than snapped,
because a board that teleports the instant you let go reads as a mistake.

`sizingGesture` is `drag || resize || jobResize || drawing` — panning and the
lasso move nothing, so they are not in it. The held size is a **ref read during
the same render that computes the size**; `Math.max` is idempotent, so a
repeated render cannot walk it upward.

**The same rule is in `BinBoard`**, where it matters by a different route: that
surface is a native SCROLLER, so one that shrinks under the pointer has its
scroll clamped by the browser and the content lurches.

`data-board-world` names the board's own surface. Anything measuring how big
the board IS must find it by that name — the tool rail is also a child of the
viewport, and an unnamed "first child" query reads 116px and reports a healthy
board as never shrinking.

Harness: `scratchpad/deexpand.mjs`, verified non-vacuous. Its own trap: the
board's **edge auto-pan** arms within 80px of the viewport edge and moves the
pan deliberately, so a drag that runs into that band reports a feature as the
fault. Stop clear of it.

## `registerRota` is keyed by the MOUNTED NOTEBOOK, never by the element id
A projection renders the MAIN notebook's element, so `el.id` is the same string
on two different nodes. Registering the drop probe under it meant the second to
mount silently replaced the first, and unmounting either deregistered both.
Both of the office's reports came from this one line: a job dragged onto the
main notebook was hit-tested against the projection's squares somewhere else on
the board and landed nowhere, and a card dragged between squares found no
target on release, so it offered to take the job OFF the notebook instead of
asking move-or-copy. It came and went depending on which notebook mounted last.

`RotaHit` now carries `probeId` (which mounted notebook answered) alongside
`elId` (which record to write), and the hover highlight compares `probeId` —
without it, dragging over one notebook lit the other.

**A notebook you cannot edit is not a drop target.** A projection, the
wallboard and the worker's portal all draw a notebook read-only, and none of
them registers a probe.

---

# v2 — the group drags, the reel plays, and only files that open show up

## A plain left-drag inside a group MOVES THE BOARD
The group had panning on the middle button and on space, and nothing on plain
left-drag — so the one gesture everybody arrives with from every map did
nothing, which is what "I still can't drag the canvas, just like I do with the
main canvas" was. It is the board's own default now; Ctrl still turns it into a
lasso, exactly as outside. `grabbing` is a scrap of STATE beside
`panning.current`, because a ref cannot repaint the cursor.

## Only files that open become chips
`isViewableFile` in `driveApi.ts` decides by the file's EXTENSION whenever it
has one, and only consults the mime for a file with none. **Drive's mime lies
about CAD**: a `.dwg` commonly arrives as `image/vnd.dwg`, which sailed
straight through the old `image/*` test and put chips in the plan row for
files that show nothing when pressed. The image list is what a BROWSER can
draw, not what counts as a picture — HEIC and TIFF are images and neither
renders in Chrome, so a chip for one opens onto nothing.

`VIEWABLE_EXTENSIONS` is exported and checked offline: a list of file types is
exactly the kind of thing that rots quietly.

## One bar over the sheet, and the viewer's controls at its left
`PlanAnnotator` takes `barInto?: HTMLElement | null`. Given a slot, its WHOLE
bar row is portalled into it and nothing is drawn in place — background and
padding dropped with it, because it is joining a bar rather than putting a
second one inside the first. The drawer offers that slot as the FIRST thing in
`planControls()`, so the file name, the pin, Plans, Layers, Download and Print
sit ahead of the folder picker and the chips.

Two slots now, and they are not the same thing: `barExtrasRef` is a slot the
ANNOTATOR offers so the punch-list pin can sit beside the file name;
`barInto` is a slot the DRAWER offers so the annotator's bar can move into the
drawer's own row.

`.no-bar` in `index.css` — a scroller that still scrolls but paints no
scrollbar. For a short row of chips inside a toolbar, where a grey trough is a
second piece of furniture saying what `.edge-fade` already says.

## The TikTok reel
Three separate faults, one of which was hiding the others:
- **Play played nothing.** The button toggled the auto-ADVANCE timer, so a reel
  could walk through a dozen links without one of them ever playing. The player
  is a third-party iframe with no transport reachable from outside, so the only
  lever is to RE-MOUNT it asking for autoplay — `playToken` in the frame's
  `key`. Pressing the button is itself the user gesture a browser wants before
  it will start a video. Play (this one) and Repeat (move on by itself) are now
  two buttons, because they were always two things.
- **`autoplay` is its own setting**, separate from `auto`, which only advances.
- **The frame is fitted 9:16 inside the node**, measured with a ResizeObserver
  and centred, so the video is as big as the box allows and the right shape.
  `fill` crops to the box instead.

**Not verified end to end**: this container has no internet, so the harness
stubs tiktok.com. Shape, settings and the autoplay parameter are asserted;
whether the video actually plays needs a real machine.

Harness: `scratchpad/round17.mjs`. Its own traps, both of which reported a
working thing as broken: the group's overview panel sits bottom-right, so a
press aimed at that corner hits the chrome (find empty surface with
`elementFromPoint` instead of guessing), and sixteen tiles lay out four across
at 928px — inside a 1080px window, so the surface had nothing to scroll and
the drag genuinely had nowhere to go.

---

# v2 — undo, and the backup audit that finally exists

## Undo has two weights, and only one of them asks
The owner's rule, in his words: placements on the board just undo; anything
sensitive — "moving stuff from the notebooks and entries inside stuff" — must
"prompt the user with a warning explaining exactly in English what's happening".
So `UndoEntry.weight` is `arrange | content`, and `UndoLayer` is the only thing
that reads it. An `arrange` step runs with a one-line toast; a `content` step
raises a modal quoting the entry's own `explain` sentence — written at the
moment the action happened, so it names the real job, person and day rather
than guessing from the board as it stands now.

`src/data/undo.ts` is the pure stack (`remember` · `popUndo` / `popRedo` ·
`undoKey`). Entries carry the exact `undo`/`redo` CLOSURES built when it
happened — no diffing of state after the fact, no replaying of actions, no
reconstructing an inverse: all three are ways of being subtly wrong about what
changed, and a wrong undo is worse than none.

**Session-only and per-workspace, never persisted.** A stack that survived a
reload would offer to undo something another device has since changed; the
entries are closures and cannot be serialised anyway. `setCurrentProject`
clears it, and every entry carries its `projectId` so a stale one can never
write into the wrong workspace's collections.

### `useBoardTrack()` — wrap the writes, not the fields
`track({weight, label, explain}, () => …writes…)` snapshots EVERY board record
before the body and again after, then keeps only the ones that differ. Nothing
is enumerated by the caller, which removes the whole class of bug where an
action grows a fourth thing it writes to and the undo quietly stops covering
it. It costs two maps of shallow copies **once per finished action** — a
mouse-up, a menu press — never per frame.

`applySide` restores only the fields that DIFFER between the two sides. Writing
the whole record back would silently revert anything a colleague changed in
between: an undo of "I moved a tile" must not also undo "somebody renamed the
job".

### `elPatch` is two things wearing one name
The node chrome's buttons (lock, wallboard) write board FURNITURE through it,
and every widget's `ctx.update` writes its own DATA through it. Only the first
goes on the stack — gated by `ARRANGE_FIELDS`. A widget that saves on every
keystroke would otherwise fill the stack with sixty entries for one typed word,
and the step somebody actually wanted would be sixty presses away. Note text
IS tracked, as `content`, because it commits on BLUR — once per edit.

### Undoing a delete must lift the tombstone
`fsUntombstone` (dotted field path + `deleteField()`; a nested map merge
removes nothing) and the store's `untombstone` / `restoreCanvasElements`.
Re-adding a record alone is not an undo: the tombstone stands, the next sync
takes it out again, and the thing blinks back and vanishes on every device.
**A JOB is never created or destroyed by an undo** — permanent deletion has its
own confirmation and its own tombstone, and the reversible version of throwing
a job away is the Trash group, which is an ordinary field change.

### Wired at
Board: both drags, both resizes, colour, z-order, lock, group/ungroup, node
placement, node removal, filing into a group, note text. Notebook: the X on a
card, take-it-off, move/copy between squares. Group window: its drag, both its
resizes, and taking a job back out. Keys work on every page (`UndoLayer` is in
`AppLayout`); `UndoButtons` sits in the board header because an iPad has no
Ctrl+Z, and both go through the SAME `runUndo` door so a press and a keystroke
can never behave differently on one entry.

### The history list
The clock icon beside the arrows opens `UndoButtons`' panel: every step, newest
first, the next one marked, and any `content` step marked "asks first" BEFORE
it is pressed. Pressing a step further down undoes the whole run back to it and
asks **once** — naming each content step's own sentence and counting the
arrange steps rather than listing "Moved 1 thing" ten times. It renders through
a **portal**: the board header is a flex item with `z-30`, which makes it a
stacking context, so no z-index on the panel could lift it above the board's
floating chrome — the workspace picker's disease, cured the same way, and the
outside-press close therefore checks BOTH refs.

`walk()` is the only thing that calls the store's steppers, and the buttons,
the list and the keys all reach it through `runUndo` / `runUndoTo` — a press
and a keystroke can never behave differently on one entry.

Harness: `scratchpad/undoredo.mjs` (31 checks). Two traps it paid for: reading
the button titles on an exhausted stack answers "Nothing to undo", which is
correct and tells you nothing; and seeding a planner `cell` without also
setting the job's `inNotebook` tests half the link and blames the app for the
other half.

## The backup audit is a real file now
`scratchpad/backupaudit.mjs`. CLAUDE.md has named it as a standing rule for
months and it had **never existed in the repo** — so the rule it enforces was
being kept by hand. It reads `AppState` itself and requires every data key to
be in persistNow + exportData (top level) + importData, or **excused with a
reason** in the file. Offline, static, no browser.

Two things it checks that the prose version could not: a key exported inside
`settings` is fine ONLY if the importer reads it from `data.settings` (exported
nested and read at the top level is the exact fault the rule was written
after), and an excuse naming a key that no longer exists is stale — a stale
excuse is how a real key later inherits somebody else's reason. Verified
non-vacuous by removing `canvasElements` from the export.

`undoState` is excused there, with the reason above.

## Sketching a toolbar with the app's OWN buttons
`scratchpad/planbar-sketch.html` — a drag-and-drop workbench for arranging the
plan viewer's bar. The controls in it are the REAL ones: `planbarcap.mjs`
captures the drawer's header and the compiled stylesheet out of the running
app, `planbaritems.mjs` splits that into twelve individual controls, and the
page is generated from the pair. The first version of this was hand-drawn and
the owner rightly said it was too far off to judge — a mockup of a toolbar is
not a toolbar.

Rules the workbench keeps, each of which was a real fault on the way:
- **The app's `html` and `body` rules are stripped** from the injected CSS.
  Everything else stays — the utility classes are what make the captured
  buttons look like the real ones — but those two repaint the workbench itself
  in the app's grey and font.
- **The chrome is deliberately a different material**: a paper-grey drafting
  table and a china-marker red, never the app's navy, so what is being
  arranged and what is doing the arranging can never be confused. Every mark
  the tool makes is red; no app control is ever recoloured.
- **The app's markup inside a part is `pointer-events: none`** — it is being
  arranged, not operated.
- **Pointer events, not HTML5 drag-and-drop**: this gets used with a finger on
  an iPad, where native dragging does not exist.
- **The delete × is always visible**, never hover-revealed (the standing
  touch rule), which means the bar needs a real `gap` — at 6px every × landed
  on its neighbour and the top row's was clipped by the bar's own edge.
- A sketch mark's label is SHORT and `overflow: hidden`. The first gap said
  "← everything after this goes right →" with `nowrap`, so a squeezed gap
  printed its words straight through the buttons beside it — the mark meant to
  describe the layout was the thing breaking it.
- The per-bar swatch and remove sit in a caption strip ABOVE the bar, in the
  table's colour. Floated over the bar's top edge they landed on the bar above.

Harness: `scratchpad/planbarsketch.mjs` — both colour schemes, the drag, the
caret, the ×, Ctrl+Z, the read-out and the draggable left edge.


---

# v2 — the plan's own two bars

## The plan's controls belong to the PANE, not the drawer's header
`planControls()` rendered inside the drawer's navy header, between the
worker-status chip and the X. That is what "it shouldn't go into the
contractor status area" was about, and no amount of reordering inside that
row could fix it: the controls for one sheet were laid across the full width
of the drawer, over a column about the job. They render at the top of
`planPane()` now, so they begin at the pane's own left edge — measured, not
assumed: bar left 591 against a drawer left of 30.

## Two bars, and how the annotator splits across them
`PlanAnnotator` takes `barInto2` alongside `barInto`. Given BOTH, it portals
its bar in two pieces — the file's name into the first, everything else (the
pin slot, the pager, Plans, Layers, Download, Print) into the second — and
moves its `flex-1` from after the name to **after Plans**, which is where the
owner drew the gap. Given only `barInto` it portals the whole row as before,
so the full-screen studio is untouched.

| | |
|---|---|
| BAR 1 `#1e3a5f` | plan name · gap · copy folder path · Mark up |
| BAR 2 `#2c4f78` | Pin · Plans · gap · Layers · Download · Print · full screen |

## Plans is the chooser, and the only one
The drawer's folder dropdown and its standing row of plan bubbles are gone,
along with Saved versions: `PlanPicker` already walks the job's folders AND
lists the Annotated Plans child, so all three were second doors to one room.
The drawer passes `plans`, `plansFolderId` and **`onPickPlan`**, which is what
carries the picked sheet back — and it keeps the chip row's rule exactly:
only a `kind === 'original'` sheet writes `plansPdfLink`, so opening a stamped
version or a side folder's drawing is looking, never choosing what the
contractor sees.

`pickedPlanName` exists because the bar read the name out of `planSet.plans`,
which holds only the main folder's sheets — a drawing chosen from a side
folder had no name and fell back to "Engineering Plans". The picker knew it
and had nowhere to put it.

Four pieces of dead state went with the picker, one of them a
`listPlanSubfoldersViaBackend` call on **every drawer open** whose result
nothing read any more.

## A harness owns ONE concern
`planlayers.mjs` carried its own copy of the bar-arrangement assertions and
went red on four of them the moment the two bars shipped — all four describing
the layout that had just been replaced. The arrangement belongs to
`scratchpad/planbars2.mjs` (17 checks, including that neither bar reaches into
the details column); `planlayers.mjs` is about layers again. A second copy of a
rule is a second place to forget to change it.


---

# v2 — a second notebook is a real notebook

## A projection is no longer read-only
`update={projecting ? () => {} : c.update}` — a projection's writes went to a
**stub**, the exact fault this file already names ("`WidgetCtx.update` was
`() => {}` … every interactive widget silently discarded every edit"), and
`ro = readOnly || projection` hid the X, the drag and the drop probe on top of
it. So a copy could be looked at and nothing else.

The owner's ruling reverses the earlier "a projection keeps ONE gesture"
decision: **a copy carries every control the original has, and the two stay in
step.** `projection` now says only WHERE the writes go, never whether they are
allowed:

- `update` for a projection is `updateMain`, which writes to **`main.id`**
  through the store. `c.update` cannot be used — `BoardNode` binds it to the
  node being rendered, which here is the copy, so it would write the main's
  data onto the projection and the two would drift apart.
- `ro = !!readOnly`. The wallboard and the portal are still read-only, and an
  **orphan** (a projection whose main is gone) is too: there is nothing to
  write to, and letting somebody plan a week into it is the one way this can
  still lose work.
- `registerRota` runs for a projection, so a job can be dropped on either one.
  `RotaHit.elId` is already the MAIN's id (`el={src}`), and `probeId` already
  distinguishes the two mounts — that is why the probe keying had to be fixed
  before this was possible.

## Two mains is the state that made all three reports one fault
A notebook placed or duplicated before projections existed is a **second
main**: its own copy of the people, the weeks and every card. The two look
identical and share nothing, so taking a card off one leaves it standing on the
other — which reads as "the X doesn't work", and is the same thing as "there is
no two-way sync".

A one-time reconcile in `GeneralJobsPage` heals it: the **richest** notebook
keeps the crown (losing planning is the outcome that must never happen), ties
go to the oldest, and every demoted one's contents are filed into
`plannerArchive` **before** demoting — the same place a removed notebook's
contents go, so a fresh notebook of that kind brings them back. Jobs whose
`inNotebook` pointed at a demoted one are re-pointed at the survivor. It waits
for `apartments` to arrive, the same settle-first idiom the purge sweep uses,
and it converges.

**Not reproduced:** the X failing on a SINGLE main notebook. It removes the
card in every arrangement the harness can build — with a projection present,
with an entry carrying no `id`, with two cards in one square. The two-mains
state is the only one that produces the reported behaviour.

Harness: `scratchpad/notebook2way.mjs` (12 checks). Two traps it paid for: a
job that is IN the notebook has no tile on the board to drag, and a tile seeded
at board y=1000 is below a 1000px window — both made the app look broken when
the drag simply started on nothing. And the standing one: patching localStorage
then reloading is overwritten by the app's own flush-on-unload, so the
two-mains case needed its own context with its own init script.


---

# v2 — a job lands anywhere, and the chrome is a wall the board respects

## Any list of jobs drags onto the BOARD, not only onto a notebook day
`registerBoardDrop` / `boardDropAt` in `rotaDrop.ts` — the same probe idea as
the rota cells, for the board's own empty surface. `GeneralJobsPage` registers
one probe (a ref re-assigned per render, registered once, the
`leaveNotebookRef` idiom): the point must be inside the viewport and
`document.elementFromPoint` must land on the viewport itself or the
`[data-board-world]` div — a release over a widget, a tile or the chrome
places nothing. The placer clears `inNotebook`/`boardBin`/`binnedAt`, writes
`canvasX/canvasY` (or `viewPos[activeBoardView]` on a named board) through
`settleDrop`, and tracks as an `arrange` undo step. `usePlannerDrag` asks the
rota registry FIRST — a notebook square is the more specific target — and the
board only when no cell answered. The drag now arms when either registry has a
member (`anyRota() || anyBoardDrop()`), so lists drag on boards with no
notebook at all. A job from ANOTHER workspace is refused silently: there is no
tile of it here.

## The tool rail is the right boundary, as the header is the top
`clampPanRef` measures `[data-board-toolrail]` (a data attribute on the rail's
wrap in `BoardToolbar`) and reserves its band on the x-axis: panning — or the
de-expand settle after a widget is carried in from the right — rests the
world's right edge against the rail's LEFT edge, never underneath it. Honoured
only while the rail is docked on the right half of the viewport (somebody who
parked it mid-screen chose that), capped at 35% of the width. The vertical
de-expand needed nothing: `deexpand.mjs` proves the board already gives the
bottom back.

## The plan viewer zooms to the mouse — the stage centres by AUTO MARGINS
Two faults, one screen:
- The zoom anchor was a fraction of the SCROLLER (`scrollLeft + cx /
  scrollWidth`). A fitted sheet is smaller than the stage and flex-centred, so
  that fraction measured blank padding and the first several steps zoomed to
  the middle — "it doesn't zoom to where the mouse is". `anchorZoomAt` records
  a fraction of the SHEET (the pdf canvas's rect), and the apply step in the
  layout effect re-measures the sheet at its new size and scrolls it back
  under the cursor. Wheel and pinch share it.
- The stage was `flex items-center justify-center`, and a flex-centred child
  that OVERFLOWS its scroller hangs out both sides with the left/top overhang
  unreachable — which clamped the scroll correction (the residual drift) and
  made a zoomed sheet's left edge unpannable. The stage keeps `flex` and the
  sheet wrapper (and the loading/error blocks) carry `m-auto`: identical
  centring while it fits, an ordinary scroll child once it does not. The
  planphone "centred stage" rule is a VISUAL rule and still holds.

**Move pans on empty sheet.** `stagePan` ref in `PlanAnnotator`: with the Move
tool held, a press that hits no mark and no handle drags the stage's scroll
(cursor `grab`); a press on a mark still moves the mark, and a motionless
click still just clears the pick. Cleared in onUp, onCancelDraw and
`cancelStroke` (the pinch path).

## The TikTok reel speaks the player's protocol
`/player/v1/<id>`, not the old `/embed/v2` page — TikTok's documented embedded
player answers postMessage (`{"x-tiktok-player": true, type: "play"|"pause"|
"mute"|"unMute"}`) and reports back (`onPlayerReady`, `onStateChange` with 1
playing · 2 paused · 0 ended). The bottom play button drives the video through
it once the frame has said ready; until then it falls back to the old
remount-with-autoplay. A sound button sits beside play; `muted` starts TRUE
because a browser only allows a SILENT autoplay — unmuted autoplay is refused
and the frame sits behind its centre play button, which was the owner's exact
report. The blind auto-advance timer runs ONLY while the player has not said
ready; a ready player advances on its own `ended`, so clips are never cut off
mid-video ("switching videos randomly"). `loop=1` except when the reel is
walking on by itself. The caption-strip crop (`chromeCrop`) is gone — the
player frame has no caption strip. NOT verified against tiktok.com end to end:
this container has no internet, so the protocol wiring needs one look on a
real machine.

Harnesses: `scratchpad/round19.mjs` (list→board drag, over-a-widget refusal,
rail clamp, TikTok controls) · `scratchpad/planzoom.mjs` (wheel anchor from
the FITTED view — an off-centre point, because a centre-anchored zoom passes
at 0.5/0.5 — and Move-mode panning in the studio).

---

# v2 — the header search looks everywhere

## It read the live store, so it saw one workspace
`GlobalSearch` destructured `apartments`, `contractorAssignments`, `stageNotes`
… straight off the store, which holds **only the open workspace**. So the
search beside the settings button found nothing outside whichever workspace you
happened to be standing in — the reported fault, and it was the whole design
rather than a bug in it.

The body is now `searchOne(pid, workspace, W)`, called once per workspace: the
open one from the live store, the rest from `loadProjectSnapshot(pid)`.

- **Snapshots load once, when the dialog OPENS** — not per keystroke. Each is a
  `JSON.parse` of a whole workspace, and three of those per letter typed
  stutters on a board of a thousand jobs.
- `loadProjectSnapshot` grew `assignments` / `stageNotes` / `contractorNotes` /
  `canvasElements` / `planAnnotations`. Same single parse, so the callers that
  only want the rooms pay nothing.
- **Workers and stages are searched ONCE, not per workspace** — they are global
  bare collections, and looping them would return the same worker three times.
  A stage carrying `projectId: 'general'` belongs to the Job Board; anything
  else is shown where you are.
- Per-category limits came down (5 → 3 or 4): five of everything from each of
  three workspaces is fifteen rows before the second category.
- The open workspace is searched **first**, so what is in front of you ranks
  above what is not.
- A footer says the unopened workspaces show what this machine last saw of
  them. Only the open one is live; without saying so, a job somebody knows
  exists is simply missing with no explanation.

## Every result carries its own workspace
`SearchResult.projectId`, and `goTo()` is the single door: it switches
workspace when the result is elsewhere, **then** hands over the intent —
`setCurrentProject` clears `pendingFocus` as part of arriving somewhere new, so
the other order throws the request away and the row appears to do nothing. The
page it lands on follows the RESULT's workspace (`/jobs` for the board,
`/project` for a building one), not the one you left.

## The crosshair works outside the Job Board
It was gated `result.onBoard && board` — `board` being "is the OPEN workspace
the Job Board" — so on Wolfson or Netiv the button simply was not drawn. It is
offered on every result that has a place now, and `ProjectDiagramPage` learned
what `reveal` means: clear the filters (the cell may be one of the hidden
ones), scroll to it, pick it out for four seconds, and **do not** open the
drawer. `AptCell` gained `data-apt-id` so the cell can be addressed at all.

## Recent searches
`search_recent` in localStorage, eight deep, newest first, never twice. Per
machine and never synced: what you searched for is about the hunt you were on
at this desk, not the office's data, so it stays out of the store, the export
and Firestore — and therefore out of the backup audit.

Harness: `scratchpad/gsearch.mjs` (16 checks) — seeded with a name that exists
in all three workspaces, so a result appearing at all proves the search crossed
a boundary rather than getting lucky.

**Note:** `scratchpad/mobdiagram.mjs` fails on a stale assertion (a sticky
per-building bar the phone now deliberately hides). Verified pre-existing —
it fails identically with these changes stashed.


---

# v2 — the desk under the paper, and a search that learns

## OWNER REVERSAL (2026-09-02): dead space is ALLOWED, on every side
The earlier ruling — "zooming out must never reveal room nobody asked for" —
is reversed by the owner, by name: he asked to SEE the grey dead space around
the board so a zoom out can stay centred on the mouse all the way down.
Consequences, all in `GeneralJobsPage`:
- `clampPanRef` is a MIN-VISIBILITY clamp only: at least ~160px of world stays
  on screen per axis; everything else — corner pins, `sideAllowed`, the header
  and rail reserves, the margin gutter — is gone from the clamp. The board's
  own size (grow/de-expand) is untouched.
- The zoom-out **walk-home is removed**: both directions hold the point under
  the pointer. The header zoom buttons hold their anchor (the line below the
  chrome) exactly.
- Framing gestures that leaned on the clamp to produce the settled corner ask
  for it explicitly: `homePan()` / `homePanRef` (opening normalisation, the
  100% button). The clamp can no longer answer "home".
- **The paper is drawn only over the WORLD's footprint** (screen-space pattern
  as before, but the layer is positioned at the pan and sized to the world,
  with the world's own transition so it never detaches during the settle
  glide or a search flight; the pattern anchors at pan {0,0} because the layer
  itself travels). The viewport behind it is the grey desk (`#d7dce3`), with a
  soft edge shadow so the board reads as a sheet on a desk.
- De-expand no longer yanks the pan at all (a shrunken world is simply valid
  where it is), which supersedes the previous round's rail reserve — the
  widget carried in from the right just stays under your hand.
- Harnesses updated to the new contract: `board.mjs` (cursor-anchored zoom out
  + dead-space-opens + min-visibility), `round11.mjs`, `round19.mjs`,
  `grouplock.mjs` (which also had to stop matching "any transformed child of
  the viewport" — the paper sheet is one now; find the world by
  `[data-board-world].parentElement`).

## The search ranks, and remembers what you pick
`GlobalSearch` again. The list used to be INSERTION order — workers and stages
pushed before any workspace's jobs — so "Concealed Units" (one letter off
"lev" at the 0.45 fuzzy threshold, "conceaLED") sat above the job literally
named "Lev". Now:
- `hunt` returns RANKED matches, tiers checked outright (Fuse cannot tell a
  real prefix from a one-letter fuzz): 0 starts-with · 5 word-starts-with ·
  100 contains · 200 fuzzy · 300 skeleton/translit. Small in-tier biases:
  kind (`KIND`: apartment first, stage last) and open-workspace-first.
- One stable sort over everything at the end.
- **Learning** (`search_picks` in localStorage, per machine like
  `search_recent`): every chosen result is remembered with count, recency and
  the queries that led to it. Picked before for the query being typed →
  straight to the top (−10000); picked before at all → a nudge. `notePick` in
  `goTo`, `pickBoost` at sort. Capped at 150 by recency.

## Cut, and a paste that lands in the middle of the screen
`boardClip` carries `mode: 'copy' | 'cut'`; `cutRef` (Ctrl+X, and Cut in both
context menus) fades the selection (`cutMark` state → `faded` prop on
JobTile/BoardNode, opacity .35) and nothing moves until the paste. Paste
(Ctrl+V, and the board-clipboard row in the canvas menu) measures the group's
bounds — live positions for a cut, the snapshot for a copy — and lands the
group CENTRED on the middle of the view through `settleDrop`, arrangement
kept. A cut MOVES the records (named-board aware: `viewPos` vs `canvasX`) and
pastes once; a copy duplicates, "(copy)" suffix as before. Escape stands a
pending cut down; so does any new copy or cut.

## Focus, everywhere; and full screen
`BoardHandlers.jobFocus`/`elFocus` — a crosshair button beside the lock on
every tile (right-[110px]) and on every node's action strip: the search
fly-to's own glide, centring the thing at the current zoom. Inside a group
window it is a `scrollIntoView({block:'center'})` on the node — the window is
a native scroller. A fullscreen toggle sits between the TV button and the
zoom group in the board header (`pageRootRef.requestFullscreen`, tracked via
`fullscreenchange` because Escape leaves without asking). A browser window
CANNOT span two monitors — fullscreen fills one screen; stretching the window
across both by hand is the only way, and that is the honest answer given.

## The window's first moment belongs to the gesture that opened it
`ApartmentDetailDrawer` ignores mousedown/click (capture, preventDefault) for
its first 400ms — the settle rule the group window already had. Found by
`touchpan.mjs`: on a touch screen the tap that opens the drawer dispatches a
compatibility click a beat later, at the same spot — INSIDE the new
full-screen window, where it focused whatever field lay under the finger, and
a focused field eats the first Escape (the guard blurs instead of closing).
"The window will not close" was a ghost click focusing the Zoho field.

## Widget chrome
- `.widget-scroll` (index.css): scrollbars invisible until the pointer is
  over the widget, thin and grey — replaced `scrollbar-thin` throughout the
  widget surfaces (Frame, tvWidgets, planner header, DashWidgets); the
  planner's `.planner-scroll` got the same manner. The standing bar along a
  widget's bottom read as broken chrome.
- `MiniJob` rows wear their stage as a background tint (`tint(stage.color,
  .12)`, the planner-card idiom) — a list reads as colour-coded work.

Harness: `scratchpad/round20.mjs` — search tiers + the learned pick, cut
fade / paste-to-centre / copy-to-centre, the focus glide, fullscreen on and
off. Its own trap: the paste-centre landed exactly on a seeded tile's spot,
burying it under the pasted pair — hover the FREE tile, or the harness blames
the app for its own geometry.


---

# v2 — THE FROZEN NOTEBOOK: the cloud merge could add but never remove

## Root cause, proven against a real Firestore
The months of "the X doesn't work", "drag-off doesn't take it off" and "no
two-way sync" were ONE bug, invisible to every localStorage harness:
`fsSet` wrote with `{ merge: true }`, and **Firestore's merge deep-merges
nested maps — it never removes keys**. The planner's squares are map keys
under `data.cells`, so removing the LAST card of a square deleted the key
locally, the merge write kept it on the server, and the next sync
resurrected it — on every device, forever. Add-only operations worked
(arrays are replaced, new keys merge in), which is why dropping jobs IN
worked and taking them OFF did not. The tombstone code already knew the rule
("a merge cannot remove keys" — whole-doc write); the generic writes did not.

**Fix**: `fsSet` and `fsBatchSet` write with
`{ mergeFields: Object.keys(payload).map(k => new FieldPath(k)) }` — each
top-level field in the payload REPLACES the server's field wholesale, fields
not in the payload stay untouched. That is what every caller means: audited —
every map writer (`boardSettings`, `contractorSheetLinks`, `savedReports`,
`customProjects`, …) sends the FULL map, and record writers send whole
records. `FieldPath` per key so a dotted key can never be read as a nested
path. Top-level `undefined` → `deleteField()` unchanged.

**Proof**: `scratchpad/mergeproof.mjs` runs the REAL Firestore emulator
(firebase-tools + Java, port 8085): seeds a two-square notebook, removes one
with `merge:true` (bug reproduced — the square survives), removes it with
`mergeFields` (gone), and checks unmentioned fields survive. Run it after any
change to fsSet's write options.

## Failures are visible now
`_notifySyncError` in firebase.ts: any catch on a write path flips the
header's CloudSyncBadge to a red **"Not saved to cloud"** for 10s instead of
letting the green "Saved ✓" lie. The silent catch is how a rejected write
masqueraded as saved for weeks.

## Defence in depth
`src/data/deepClean.ts` — `stripUndefinedDeep`, applied to every fsSet /
fsBatchSet payload below the top level (Firestore's
`ignoreUndefinedProperties` is already on in init; this survives that flag
ever being lost). And `placeOnPlanner` no longer writes `taskId: undefined`
into entries.

## A Building Progress square drags onto the board as a UNIT CARD
`unit-card` widget (`src/components/board/UnitCard.tsx`, registered in
`moreWidgets`, shelf "Other workspaces", preview `sample: 1`): the board twin
of the notebook's cross-workspace entry — a POINTER at `{projectId, aptId}`,
never a copy. Resolved live for the open workspace, from
`loadProjectSnapshot` otherwise; unresolvable says "open that workspace once
on this computer", the planner-card idiom. Clicking travels via
`ctx.openUnit`. The board's drop placer creates one for a foreign
`projectId` instead of the old silent refusal — which read as "dragging does
nothing at all".

## The drag shows a ghost
`usePlannerDrag` draws a small navy card under the hand (`opts.label` — the
job's name) — ONE singleton DOM node written imperatively per pointermove,
so it re-renders nothing. From a 30px progress square, the translucent
source was invisible and the whole gesture read as dead. Hidden on up and on
cancel.

Harness: `scratchpad/round21.mjs` (ghost mid-drag, unit card created and
drawn with the snapshot's stage, click travels and opens). Its trap: find
the created card by its OWN element id — a text match hits the Building
Progress widget first, which also says WOLFSON and Artzi.


---

# v2 — the notebook reads like a diary

## Weeks draw NEWEST FIRST — the drawing, never the data
`drawn = [...weeks].reverse()` in `PlannerWidget`. The run is still stored
oldest-first (`firstWeek` + `weekCount`), so nothing written moves and the
month arithmetic is untouched; only the render order flips. The TOP week's
plus is `addWeek('after')` (newer) and shows `hiddenBelow`'s eye; the BOTTOM
week's is `addWeek('before')` / `hiddenAbove` — the buttons follow the
direction the eye now reads the stack in. `shownMonth` seeds from the NEWEST
visible week; `readMonth`, Today and the month jumps all work off `weekRefs`
node offsets and needed nothing.

## Assigned tasks show themselves on the notebook — derived, never stored
`taskChips` in `PlannerWidget`: an OPEN assignment with a `dueDate` and a
`contractorId` whose person is on the sheet draws as a dashed chip in that
person's square on that day — the open workspace live from the `assignments`
prop, every other workspace from `loadProjectSnapshot` (workers are global,
so one person's row collects all of it). Rules:
- **Derived means the task is the record.** The chip moves by editing the
  task's date/worker where the task lives, and leaves when the task is done.
  Nothing is written into `cells`, so nothing can go stale or double-sync.
- **A task placed BY HAND is drawn once**: any planner entry carrying that
  `taskId` suppresses its chip, notebook-wide.
- Clicking a chip opens the job — switching workspace first for a foreign
  one (the settled switch-then-intent order).
- `data.showTasks` ('1' default) in the pencil turns the layer off.

## Removing the MAIN notebook can never lose the planning
In `removeEl`: a main `rota`/`week-planner` with a projection standing makes
the projection INHERIT — the main's full data (role stripped) is written onto
it, every job whose `inNotebook` pointed at the main is re-pointed, and
nothing is archived because nothing is going away. Only when NO projection
stands does the planner archive take the contents (as before, revived by the
next placed notebook). Both paths toast what happened to the data. The
undo entry needs nothing special — `useBoardTrack` diffs every record, so
Ctrl+Z restores the main, demotes the heir and re-points the jobs by itself.

Harness: `scratchpad/round22.mjs` (13 checks). Its trap: the node strip's
Remove X must be clicked via the DOM (`evaluate(b => b.click())`) — the
synthetic pointer sequence tangles with the node's pointer capture in a way
a real hand does not, and a force-click that lands on the svg path inside
the button never reaches React's onClick.

---

# v2 — the board settles down, the TV shows up, and other workspaces peek

## OWNER REFINEMENT (2026-09-04): the desk shows only where it was meant to
Supersedes the 2026-09-02 "dead space everywhere" ruling, per the owner's own
correction. `clampPanRef` in `GeneralJobsPage`: the TOP and LEFT pin again
(x ≤ `margin·z`, y ≤ header bottom + `margin·z`) — UNLESS that side's
expansion is unlocked in board settings (`sideAllowed`), which grants the
loose min-visibility bound instead. The grey desk therefore shows past the
board's right/bottom edges and on unlocked sides only; zooming out lands the
whole board against its corner; 100% comes home flush (`homePan`). The tool
rail reserve on the x-axis is back (`[data-board-toolrail]`, right-docked
only, capped 35%). Near a pinned side the cursor-anchored zoom simply gives
way to the wall. `board.mjs`, `round20.mjs` (focus glide is now "fully on
screen, as centred as the pins allow") and `deexpand.mjs` encode the new
contract — deexpand's group section must press 100% first, because a drag
that carried the view far right now STAYS there (a valid pan is not sprung
back), leaving the origin-side group off-screen.

## The board remembers where you left it
`board_view_<pid>_<viewId|main>` in localStorage (per machine): pan+zoom
saved debounced 400ms after rest, restored on arrival (zoom snapped to
`ZOOM_STEPS`, pan re-clamped), `homePanRef` only when nothing is stored.
Skipped on the phone board — it has its own fit-on-open.

## Arranging: nudge, union snap, a floor under z
- **Arrow keys nudge the selection** (`nudgeRef`): 1px, Shift 10px, every
  movable selected thing (locked filtered), named-board aware. The first
  keydown opens ONE undo entry; repeats ride inside it (`e.repeat` skips
  `track`), so holding a key is one step to undo.
- **`snapDragUnion`**: a multi-drag snaps the UNION box of everything
  carried — one `snapMoving` call, one delta for the whole selection — so
  guides appear for a group exactly as for one tile.
- **`arrange('back')` lifts instead of sinking**: negative z paints behind
  the world div and the node becomes unclickable (the owner's "IF I SENT TO
  BACK I CANT SELECT IT"). Send-to-back now floors at 0 and, when the floor
  is taken, bumps everything else up by the difference.

## Foreign units PEEK (`src/components/board/UnitPeek.tsx`)
The board's `widgetCtx.openUnit` no longer travels: a unit in another
workspace opens as a read-only modal over the board (snapshot data — name,
stage, address, phone, links, notes, open tasks), and closing it leaves you
standing on `/jobs`. The peek's own "Open in <workspace>" button does the
old switch-then-intent journey. Same-workspace ids still open the real
drawer. The z is 120/121 — above the board's floating chrome. Harnesses
round21/boardsize assert the peek, then travel through
`[data-peek-open-full]`.

## Missing workspace snapshots hydrate from the cloud
`ensureProjectSnapshot(pid)` in `store.ts`: when `${pid}_app_data` has no
apartments and Firebase is configured, the project-scoped collections are
fetched once per session (`fsGetAll` through `projectCollection`), scoped
(`scopeApartmentsToProject`), and written to the SAME localStorage key
`persist()` uses — so a cleared browser or a new computer stops showing
"not opened on this device yet" everywhere. Buildings are not a Firestore
collection: the built-ins come from `getDefaultBuildings`. `snapshotTick`
(state, session-only, excused in the backup audit) is bumped after a write;
every `loadProjectSnapshot` consumer (ProjectMini, BoardMini, UnitCard,
UnitPeek, the planner's foreign lookups and task chips, WorkspaceCard,
GlobalSearch) subscribes to it and re-reads. AppLayout and the TV page fire
the hydration for every non-current workspace on mount. A failed fetch may
retry; a snapshot WITH rooms is never touched — opening the workspace
properly overwrites all of it with live sync.

## The TV: fits by default, and the region is always the screen's shape
- **`TvPresentationPage`**: with no `tvView`, the wall now fits the board's
  CONTENT bounds (jobs via `viewPos`/`canvasX`, elements, padded) to the
  frame — the fixed top-left at autoScale showed NOTHING on a board whose
  tiles sit away from the origin, which was the production "nothing shows on
  the link". A saved region that no longer intersects any content is treated
  as unset for the same reason. Both region and fallback are centred in the
  frame.
- **`BoardRegionPicker`** draws an APRON: the desk-grey beyond the world,
  sized so a screen-shaped box can contain the whole board even when the
  board is another shape (`ax/ay` from the ratio) plus 6% slack. The box is
  HARD-LOCKED to `screenRatio` (resize drives width, height follows), the
  default region is "everything, in the screen's shape", clamps run against
  the apron, and the standing hint texts ("ON THE TV", the drag sentence,
  the fills-everything warning) are gone — "Show the whole board" remains.
- **The shape is chosen in settings and SAVED**: `TV_SHAPES` buttons above
  the picker write `setTvSetting('tvShape', …)` (same ids the TV page's own
  buttons use); changing shape reshapes an existing region around its
  top-left. `ratioOfShape(tv.tvShape)` feeds the picker.

## The wall dashboard arranges like the main one
`TvDashboard` dropped the arrow/± buttons for the home-screen gestures the
DashboardPage already has: a move handle top-left (carry a card over another
to take its slot — `placeOver` rewrites the order dense, per SHAPE through
`patchPlace`), a resize handle bottom-right snapping to whole columns and
40px rows, `0` during a resize resets. Cards register live rects in a ref
because the grid reflows mid-drag; drag deltas divide by the display
multiplier so stored sizes stay screen-independent.

## Printing a plan prints the PLAN
Ctrl/⌘+P while `PlanAnnotator` is mounted (studio, drawer pane, viewer) is
intercepted and routed to the composited print — the browser's own print
grabs the running app, which was "printing a plan prints the webpage". The
print popup also fires on its load event (with a 2.5s backstop) instead of a
fixed 500ms, so a big sheet's images have actually decoded before the
preview is captured.

## TikTok keeps your sound choice
`mutedRef` in `TikTokWidget`: each new frame's `onPlayerReady` re-asserts
`unMute` when sound was on — autoplay always starts muted by browser rule,
so advancing videos silently turned the sound off every time.

Harness: `scratchpad/round23.mjs` (20 checks: nudge, union guides + one-delta
landing, z-floor + clickability, view memory across reload, mic note-only,
peek open/close/travel, shape buttons saving, picker strings/lock/apron span,
wall content-fit). Its traps: the unit card must be clicked via
`button.w-full` (a bare `button` first-matches the node's action strip), and
a nudge moves the union's TOP tile to the anchor while the rest keep their
offsets — asserting both at the anchor blames the app for the harness's own
seed.

---

# v2 — the white TV found, the whole-board view, and widget polish

## THE WHITE TV: one custom group crashed the whole wall
The production "/tv shows nothing but white" was a CRASH, reproduced by
pulling the live board's own records from Firestore (public rules, REST API —
`scratchpad/tvhis.mjs` replays them against the built bundle):
`TvPresentationPage` read `BIN_META[el.binKind].label`, and a group made by
hand has no `binKind` — the documented trap, missed on this ONE line. The
first custom group threw, React unmounted the page, white screen — for weeks,
which is why every region/scale fix "didn't work". `binLabelOf(el)` fixes it,
and every node on the wall now renders inside **`WallGuard`** (an error
boundary): a record the renderer chokes on blanks its own card, never the
wall. A wall nobody stands next to must degrade, not vanish.
Also: a section box is TINTED on the wall (`withAlpha`, now exported from
BoardItems, honouring `boxOpacity`) — painted raw, the owner's big orange
section covered the entire TV as a solid slab.

## OWNER RE-CORRECTION (2026-09-05): desk LEFT and BOTTOM; TOP and RIGHT flush
Flips the previous round's left-pin. `clampPanRef`: RIGHT is flush
(`xMin = vp.w − w`, no grey strip right, the rail reserve is gone), TOP is
flush at the chrome (`yMax = hr`, no margin strip of desk — unless
`expand.top` unlocks it), LEFT and BOTTOM show desk with the VIS=160
min-visibility bite. The margins are PAPER inside the world (settleDrop's
gutter + the world extending a margin past far content), so a flush edge
still shows a margin. `homePan` is flush `{0, hr}`. **The clamp bails on an
unmeasured viewport** (`vp.w < 50`) — its bounds anchor to the RIGHT edge
now, and vp.w = 0 read every valid saved pan as out of range, which broke
the board's view-memory restore on arrival.

## Zoom out until the ENTIRE board shows
`fitZoomRef` (written each render from the live world size) + `zoomSteps()`:
when the whole-board fit is below 25%, the ladder extends down ~×0.8 a rung,
ending exactly on the fit. Small boards keep the old 25% floor. The BOTTOM
rung is the framed whole-board view, not just the right scale: `zoomAt` asks
the clamp for the far corner (`{x: −1e9, y: 1e9}` — right-flush, top-flush)
so nothing hangs off-screen. `commitZoomField`, the view-memory snap and
`zoomToFit`'s rung snap all go through `zoomSteps()`. Step lookup is
nearest-rung, not exact-or-100% — the dynamic low rungs move as the board
grows.

## Make-room: a little at a time, and the view holds still
`roomFor` returns a flat 300 world units (was a screenful — press once and
everything you were looking at was gone). The pan compensation the caller
already did now survives (it used to be swallowed by the old clamp), so the
widgets stay visually put and the board simply gains space. Press again for
more.

## Widget round (`scratchpad/round24.mjs`, 13 checks)
- **Search results FLOAT** (`ResultsOverlay` + `useSearchOpen` in
  `widgets.tsx`): both Find-a-job widgets portal their results to
  `document.body` — the widget body is overflow-clipped inside the scaled
  `WidgetSurface`, so no z-index can escape it (the tooltip's disease). The
  panel SEALS pointer events (portal-in-a-node trap) and preventDefaults its
  pointerdown so the input keeps focus through a result click; it re-measures
  its anchor on a slow tick; it draws at CSS size, readable at any board
  zoom. `readOnly` (shelf, wall) keeps the inline list — a portal has no
  business in a preview.
- **World clocks fill their box**: the list is measured and each row takes an
  equal share of the height, every size in the row derived from that share
  (`f = clamp(rowPx/24, 1, 2.8)`). WidgetSurface already scales with width;
  this is the taller-only growth it deliberately does not do.
- **Link tile wears the site's logo**: `SiteLogo` — Google's favicon service
  (`s2/favicons?domain=…&sz=64`), fallback to the link glyph on a bad host or
  a failed load, so never a broken-image square.
- **A resize that loses its release ends itself**: `onResizePointerMove` /
  `onJobResizeMove` (page and BinBoard) commit-and-stand-down on
  `e.buttons === 0` — a buttonless move means pointerup was missed
  (pointercancel, or the handle remounted and its capture died), and without
  the guard the gesture chased the bare mouse forever ("it sticks to the
  mouse and keeps resizing after I let go"). All three element handles also
  carry `onPointerCancel` now, as the job handle already did.

Harnesses: `round24.mjs` (widgets) · `round25.mjs` (wall tint, zoom-to-fit
ladder + framed bottom rung, gentle make-room) · `board.mjs`/`round20.mjs`
re-encode the flipped edge contract. `tvcrash.mjs` (every widget on /tv,
bisecting) and `tvwhite.mjs`/`tvhis.mjs`/`tvprod.mjs` are the white-TV
diagnosis tools — tvhis reads real records fetched to the /tmp scratchpad,
which never enters the repo.

---

# v2 — every TV, live in settings

## The live feed (`src/data/tvScreens.ts`)
The owner's "get back the live feed from the TV", made practical: every open
/tv page mints a PERMANENT id (`tv_screen_id`, localStorage — this panel is
always this panel) and heartbeats a doc into the global bare Firestore
collection **`tvScreens`** (on mount after first paint, on resize, every
45s): CSS viewport, dpr, REAL pixels, which workspace it is showing, the
scale in effect, and `measureSmallestText()` — the ScreenReport's own
real-pixel measurement, extracted. A pixel screenshot is deliberately not
attempted; the numbers plus the settings page's miniature of the chosen
region are the picture that matters. Presence only — it is NOT app data: not
in persist/export/import, and `forgetTvScreen` deletes a dead panel's doc.
Verified against production rules by REST probe: writes to the new
collection pass.

## Per-screen setup (`BoardSetting.tvScreens`, inside the __tv bag)
`Record<screenId, { name?, view?, scale? }>` — in the __tv bag so it
inherits persist/sync/export with NO new state key (the portalDomain
precedent). The TV resolves ITS OWN entry first (`mine?.view ?? tvView`,
`mine?.scale ?? tvScale`); the shared settings are the fallback for a panel
without one. Settings → TV renders `TvScreensPanel`: one card per reported
panel — editable name, live dot (heartbeat < 2min), real resolution +
`shapeNameOf()`, smallest-text readout with a red one-press "Make the words
readable" (scale = READABLE/smallest × the scale the panel reported), its
OWN BoardRegionPicker at the panel's REAL live ratio, its own display-size
slider, and Forget. The old shared section below is relabelled "(default)".
An open panel picks changes up through the settings/app listener within
seconds.

## The wall draws a section like the board does
The box was `backgroundColor: el.color` raw — the owner's orange section
covered the entire TV as a solid slab. It is `withAlpha(el.color,
boxOpacity ?? 0.45)` now (withAlpha exported from BoardItems), border one
step stronger, and the box's NAME renders on a tinted header BAR
(`rounded-t-xl`, +0.25 alpha) exactly as the board draws it, not as words
floating in the field.

Harness: `scratchpad/tvscreens.mjs` — the header bar on the wall, the minted
id surviving reload, the live-TVs section standing in settings with the
honest no-Firebase message. The heartbeat/settings round-trip needs real
Firestore and was verified by REST probe against production rules instead.

---

# v2 — the TV scaling disease, cured at the root

## The wall renders widgets through `WidgetSurface` now
THE scaling bug: `TvPresentationPage` called `renderWidget` RAW, with no
`WidgetSurface` (now exported from BoardItems) around it — so a widget the
office had stretched to double size on the board drew its 11px labels at
11px in a big empty card, and the region zoom then shrank those to a smudge.
No display-size boost could recover words that were small BEFORE the zoom,
which is why "make the words readable" couldn't. The surface scales each
widget's natural drawing to fill its own box first, the same as every other
screen. `tvcrash.mjs` re-run: every widget renders through it.

## The panel's size buttons write the panel's SAVED setting
`setBoost` wrote a `?scale=` URL param — local to the tab, dead on reload,
and OUTRANKING the per-screen setting, so after one press on the TV every
later change from the office silently did nothing on that panel. It now
writes `tvScreens[thisPanel].scale` (settings sees it live) and clears the
masking param; the param survives only as the no-Firebase fallback.

## Before → after, measured by the panel itself
`TvScreensPanel` keeps a `fixes` record per press: the button says what it
is about to do (90% → 140%), the polling tightens to 3s while a fix is
pending, and when a report NEWER than the press arrives the card shows the
words' real size before and after — green past `READABLE`, red with "raise
the size bar further" when one press wasn't enough. Dismissable. Pressing a
button that changed nothing visible was the owner's exact complaint.

Harness: `scratchpad/tvscreens.mjs` grew the WidgetSurface check — a widget
seeded at 2× natural width must draw `scale(2)` on the wall. Frame
UPPERCASES titles, so match the surface transform, not the title text.

---

# v2 — the corner settled, layouts tried on, redo that stays

## OWNER FINAL RULING (2026-09-07): the STARTING corner is TOP-LEFT
Supersedes both earlier flips — his words: "the left side and the top side
should be locked to the canvas as that's the starting corner". `clampPanRef`:
LEFT pinned flush (`xMax = 0`) and TOP pinned at the chrome (`yMax = hr`),
each loosened only by its `expand` unlock; the desk shows past the RIGHT and
BOTTOM edges with the VIS=160 bite. The zoom-out bottom rung frames the whole
board flush top-left (`{x: 1e9, y: 1e9}` through the clamp); `homePan` stays
`{0, hr}`. `board.mjs` / `round20.mjs` / `round25.mjs` encode this — round20's
focus glide is again "fully on screen, pinned corner holds".

## Layout history: preview first, ripple counted
- `src/data/layoutDiff.ts` — PURE: `layoutRipple(layout, apartments, els)`
  counts what Restore would actually do (jobs/nodes that move back, with up
  to three names; things added since that keep their spots; snapshot entries
  whose record is gone and stays gone) and `rippleSentence` says it in one
  line on each snapshot card. Same MOVED=2 threshold as nothing — plain
  arithmetic, no store, no clock.
- **Preview is a look, never a write**: `previewLayout` state; `jobPos` /
  `elPos` read the snapshot's positions through `previewMaps` (jobs only on
  the MAIN board — layouts are main-board positions), the world div goes
  `pointer-events: none` (presses fall through to the viewport, so pan and
  zoom still work — the view-only idiom), the keyboard is gated to Escape,
  and an amber banner offers "Restore this layout" / "Back to now".
- **Restore is tracked**: wrapped in `track({weight:'arrange'})`, so it is
  ONE undo step and Ctrl+Z puts everything back.

## Undo cannot eat the redo stack
`_undoWalking` (module flag in store.ts): raised around `entry.undo()` /
`entry.redo()` in the steppers; `rememberUndo` is a no-op while it is up. A
tracked write fired BY a restore in progress used to be recorded as a new
action, and a new action clears the future stack (the classic rule) — which
was the owner's "I undo five times and my redos disappear". The classic rule
itself stands: a genuinely new action after an undo still clears redo.

Harness: `scratchpad/round26.mjs` (13 checks): ripple sentence by name,
preview draws snapshot positions and writes nothing, banner Restore/Back,
restore as one undo step, redo surviving undo, and five undos → five redos.
Its trap: the "Layout history" button carries an icon, so `hasText` must not
anchor (`/^…$/` misses the composite text).

---

# v2 — the TV Size Plan, sealed and built

The full plan is `docs/plans/tv-scaling/MASTER-PLAN.md` — sealed 2026-09-08
through the slow-plan method, 10 locked picks, and **where any older TV-scaling
note disagrees with it, the plan wins**. Built as B1–B7 in one round.

## ONE number, applied ONCE
Resolution in `TvPresentationPage`:
`boost = min(3, mine?.scale ?? paramBoost ?? tvSettings.tvScale ?? 1)` —
the panel's own SAVED size first, the `?scale=` address-bar value as
BOOTSTRAP only, the shared slider as the newcomer's default. Ceiling 3.0 on
every control that sets the number (both sliders in settings, the panel's +,
the red buttons).

**`setBoost` always writes `tvScreens[screenId].scale`, Firebase or not** —
the store persists it locally either way, and the old no-Firebase branch that
wrote the URL param instead made the panel's own + button DEAD the moment the
panel had a saved size (the saved size outranks the param by design). It also
clears any masking `?scale=` from the address bar.

## TvDashboard takes NO scale prop
The display size is applied ONCE by the caller as layout zoom
(`zoom: scale; width/height: 100/scale%` — the board/diagram idiom, scroller
INSIDE the zoom). Every `Math.min(scale, cap)` that lived inside TvDashboard
is deleted — a wide panel STARTED at those caps, so the office's
90% → 160% press changed the label and froze the picture, which was the
whole "red button does nothing" report. Proven fixed at the owner's own
2560-wide geometry: 0.9 → 1.8 exactly doubles a drawn card.

Gesture handlers inside TvDashboard measure the zoom they are really drawn at
off their own node (`rect.height / offsetHeight`, the ScreenReport idiom) —
never handed a number as a prop, because a prop is a claim and this is a
measurement. Callers rewrapped: the wall (frame zoom), the settings preview
(0.7), the TV layout page (its mock-panel scale). The bar, the floating
chrome, and the wall's modals keep their own capped sizing on purpose
(sealed pick 9 — buttons size for the hand at the panel, content for the
eyes across the room).

## The wall answers, walks, and proves
- **The chip** (`data-size-note`): any boost change after first load flashes
  "Display size 90% → 160%" on the wall for 4.5s — rendered inside the shared
  `bar` JSX so every view carries it.
- **The walking red button** (both in `ScreenReport` on the TV and
  `TvScreensPanel` in settings): one press moves `scale × min(1.25, need)`,
  capped 3.0, labelled with exactly what it will do ("90% → 113%"). The
  settings button COMES BACK when a report newer than the last press still
  says too-small; the TV's report stays OPEN after a press so the re-measure
  is seen. Never a blind leap.
- **The test pattern** (`data-test-pattern`, the PX bar button): sample rows
  at 12/16/22/30 REAL pixels and a ruler of 100-real-px blocks, computed back
  through the frame's dpr-fix zoom and the device ratio; tap or 10s dismisses.

Harness: `scratchpad/tvsize.mjs` (12 checks) — proportionality at the
dead-button geometry, stale `?scale=` loses to the saved size, ceiling holds
under a held +, chip appears/says old → new/goes by itself, pattern draws and
dismisses. `tvcrash` and `tvscreens` stay green. tvsize's own trap: the
no-Firebase container is exactly where the old URL-param fallback bit, so a
"chip never appears" failure here means setBoost stopped writing the setting.

---

# v2 — the paper meets the top bar

## OWNER REFINEMENT (2026-08-24, the two-screenshots message)
The TOP pin is the VIEWPORT'S OWN TOP, not the chrome's bottom edge: the
board's paper runs all the way up to the white app bar, and the floating
buttons sit ON the paper. What keeps content out from under them is
`settleDrop`'s invisible keep-clear band (the chrome's measured bottom,
translated into world coordinates per view), never a strip of grey desk held
open above the board. In `clampPanRef`: `yMax = freeT ? loose : 0`; `hr`
survives only in the min-visibility bound (`yMin`), because a kept bite of
board hidden under the buttons is not a visible bite. `homePan` is `{0, 0}`,
and `zoomCentre` anchors at the viewport's own top-left again — the anchor
must always be the point the clamp allows, or the first press snaps the board
by exactly the disagreement. Note the consequence at home view: the chrome
line in WORLD coordinates is now ~90–170 units (it used to be ~0 because the
world started below the chrome), so `settleDrop` floors new content there —
old content placed at small world y sits under the buttons until dragged out.
`board.mjs` / `round20` / `round25` / `round11` / `deexpand` all hold under
the new contract without edits — they assert "no grey above/left", which the
higher pin only strengthens.

## A section box never sits above the content
`BoardItems` node z: `el.type === 'box' ? min(el.z ?? 1, 3) : max(el.z ??
(bin ? 4 : 5), 4)` — two BANDS. A box brought to the front used to paint over
every widget inside it, and because a box's body takes the pointer,
everything under it became unclickable: the owner's calculator trapped under
his section, clicks silently selecting the near-invisible box ("the
calculator doesn't respond, and the section became unselectable"). Boxes
still order against OTHER boxes; content sent-to-back still orders against
other content but floors at the band's bottom so it can never sink under a
box either. The wallboard already ignored stored z for boxes (`box ? 1 : 3`)
— this brings the board itself in line. Harness:
`scratchpad/boxtrap-probe.mjs` (6 checks — the front-ed box repro, clicks
reaching the calculator and its keys, the section still selecting on its own
surface). `grouplock.mjs`'s zoom-anchor check was re-encoded to the flush-top
contract on the way (anchor = viewport top, not the header's bottom line).

---

# v2 — search that plans, the notebook card, and the wheel setting

## A search result is draggable (the job rows)
`ResultRow` in `GlobalSearch.tsx` — module-level (the declared-in-render
trap), one `usePlannerDrag` per row: a job found in the search drags onto a
notebook square (plans it) or onto the open board (lands as a tile, and the
board placer's standing rule takes it OUT of its group). While the drag is
live the dialog stands aside: wrapper `pointer-events-none`, backdrop
`invisible`, panel `opacity-25` — the backdrop otherwise blocks the board
placer's own `elementFromPoint`, and the planner probes (rect math) would
work while the board drop silently never did. On a successful drop the
dialog closes and the pick is learned.

**`addInitScript` SERIALIZES its function** — a closure over a harness-side
variable dies silently and the seed never runs, leaving the app on defaults
while every assertion blames the feature. Pass data as the second ARG.

## The crosshair follows a job into its group
`BinBoard`'s scroll-to-highlight selector was still `[data-bin-job=…]` — an
attribute that DIED when the group window adopted the shared `JobTile`
(which carries `data-node-id`). The stale selector matched nothing, so
"show me this job in its group" opened the window at the top and stopped.
One selector fix; the pulse (`searchLit`) was already wired.

## The notebook card (owner's layout, 2026-08-24)
`PlannerCard`'s job branch: the NAME on top, bigger (`size + z(1.5)`, 800),
`break-words` and never `truncate` — a card whose whole point is saying
which job it is must not say "Wein…". The job's OPEN tasks render inside
the same card, one per row (first 3 + "+N more"), and the pending counter /
Drive / Zoho / plan links sit in a bottom-right row (the X hover-reveals at
the row's start). A dashed task CHIP whose job already has a card in the
same square is folded into that card — the owner's "separate tiles for
tasks and for the job".

## The wheel setting
`BoardSetting.wheelScrolls` (rides in `boardSettings` — no new state key):
when on, plain wheel PANS (x and y), Ctrl/⌘+wheel still zooms, Shift+wheel
still slides sideways. Read in the once-registered wheel listener through
`wheelScrollsRef`. The checkbox sits in board settings under
"Match sizes and spacing".

## Work below the buttons, paper up to the bar (the BLEED)
Second pass on the two-screenshots ruling — both screenshots at once: the
WORK pins at the chrome's bottom edge again (`yMax = hr`, `homePan {0,hr}`,
`zoomCentre` anchored at the header line), so zooming out can never park
widgets under the floating buttons; and the PAPER layer
(`data-board-paper`) bleeds up over the band the pan holds open
(`translate(pan.y − bleedT)`, `height + bleedT`, pattern offset by the same
`bleedT` so it stays continuous). `bleedT = 0` when the top is UNLOCKED in
board settings — that grey was asked for by name.

## The box band clamps BOTH ends
`min(max(z,0),3)`: the owner's second MANAGMENT section carries `z:-1` in
production (a send-to-back from before the z floor existed) — negative z
paints behind the world div and hit-tests to the world, which was the "one
section box is unselectable" report. Render-side clamp; no data migration.

Harness: `scratchpad/round27.mjs` (14 checks, two contexts). `board` /
`grouplock` / `round20` / `round22` / `notebook2way` / `boxtrap-probe` stay
green.

---

# v2 — new arrivals announce themselves, and the Drive link does the typing

## A new job lands centre-screen and GLOWS until first selected
- `tileCentreSpot(i)` in `GeneralJobsPage` rides the widgets' own
  `viewCentreSpot` (centre of the VIEW, nudged off anything already there —
  do not re-implement it, there was nearly a duplicate) and then
  `settleDrop`. Used by: Add Job (no right-click spot), and the group
  window's `onRestored` — `moveToBin(null)` restores the job's OLD position,
  which on a big board is off-screen and read as "it vanished", so the
  restore now moves it to the centre of the view (named-board aware).
- `freshJobs` (state, session-only) + `markFresh`: set by Add Job, the
  restore, and the board drop placer (a search-drag landing). `JobTile`
  takes `fresh?: boolean` → `.fresh-job` (index.css): an INFINITE soft
  pulse, unlike `.search-hit`'s two cycles — the glow IS the "this one is
  new" marker and only selection dismisses it (an effect watching
  `selectedJobIds`/`selectedJob` deletes seen ids). Reduced-motion gets a
  static ring.

## Add Job leads with the DRIVE LINK and fills the name from the folder
The modal's first field (autofocused) is the Drive link; the family name is
second. A debounced effect (450ms) on the link extracts the folder id,
reads the folder's own title through `getFolderNameViaBackend` (no key
guard — it just fails null when the backend is missing) and fills
`familyNameFromFolderName(title)` in, with a quiet "reading the folder
name…" note beside the label while it looks. `jobNameTyped` (a ref, set on
the name input's onChange, reset on every close path) is the rule that a
HAND-TYPED name is never overwritten — the same contract as the drawer's
auto-fill.

Harness: `scratchpad/round28.mjs` (11 checks) — Drive-first form, autofill,
typed-name survival, centre landing + glow + glow-dies-on-select for both
Add Job and the group take-out (whose seed parks the job at 3200,2400 so
"came back to its old spot" would fail loudly). Its lesson: the centre spot
NUDGES off occupants, so the take-out assertion is "fully on screen,
centre-ish", not a bullseye. round27 and grouplock stay green.

---

# v2 — the green frame IS what the TV sees

## One arithmetic for "what does the TV show" (`src/data/tvRegion.ts`)
The wall fits its region to the frame and THEN multiplies by the display
size — so at 160% the panel really shows a SMALLER slice than the saved
region, and at 70% a bigger one. The green frame everybody drags therefore
cannot be the stored region; it is the EFFECTIVE visible rectangle. That was
the owner's report by name: "the green border didn't change shape, size or
placement after scaling". `tvViewbox` (the wall's own scale+origin),
`tvVisibleRect` (region+shape+size → the frame) and `regionForVisible` (the
exact inverse, for writing a dragged frame back) live in `tvRegion.ts`, and
the wall, the settings pickers and the board overlay ALL go through it —
change one, change nothing, there is only one.
- **The wall's crop is CENTRED in both directions now.** A display size
  above 1 zooms into the MIDDLE of the region; it used to anchor at the
  region's top-left, which is why the box and the panel disagreed the moment
  the size slider moved.
- `BoardRegionPicker` takes `scale`: the green box is drawn from
  `tvVisibleRect` and gestures run ON that rectangle, with the stored region
  recovered only at commit — the round trip is exact (move the box at 200%
  and the saved region keeps its size to the pixel). Both settings pickers
  pass their scale (per-screen and default), so moving a TV's size slider
  visibly grows/shrinks its green box.

## The board's TV button is a menu of the real TVs (`TvFrameLayer.tsx`)
Clicking TV on the board header opens a small PORTALLED dropdown (the
workspace-picker idiom — the header is its own stacking context; outside-
press close checks both refs): every panel that has reported itself to
`tvScreens` (live dot, name from settings, real shape, own-slice vs
follows-default) plus "All TVs (default)", with an honest line when no
panel can report. Picking one lays that TV's green frame over the real
board — `TvFrameLayer`, drawn in the world layer so it pans and zooms with
the work:
- The frame is the EFFECTIVE view for THAT panel (its region ?? the shared
  one ?? the wall's content-fit fallback, its real ratio, its display
  size). The content-fit fallback reproduces the TV page's own rule number
  for number, so the frame is honest before any region exists — and the
  first drag of it mints one.
- **Drag aims, the corner resizes** (ratio-locked to the panel's shape);
  deltas divide by zoom (the documented trap); border/label/handle divide
  by zoom too — chrome is a marker, not part of the drawing. Commits write
  `tvScreens[id].view` (or `tvView` for the default) through `setTvSetting`,
  so an open panel follows within seconds via the settings listener.
- The old read-only "On the TV" shading and its `showTvRegion` state are
  gone; `data-show-tv` (button), `data-tv-menu`, `data-tv-frame` and
  `data-tv-frame-handle` are the hooks.

Harness: `scratchpad/tvframe.mjs` (21 checks) — the halving box at 200%,
the exact round trip, the menu, the frame's drag/resize/writes, and the
wall's centred crop. Its trap: the settings picker sits BELOW THE FOLD on
the TV tab, and a mouse press aimed off-screen lands on nothing — which
reads as "dragging saves nothing". `scrollIntoViewIfNeeded` first. round23,
tvsize and tvscreens stay green.

---

# v2 — the notebook reads like a calendar again, and multi-day tasks get a plan

## OWNER REVERSAL (2026-08-24, the secretary's ask): weeks draw OLDEST FIRST
Supersedes round 22's newest-first ruling. `drawn = weeks` in `PlannerWidget`
— a calendar reads downward. What keeps the CURRENT week on top instead:
- **The notebook OPENS scrolled to today's week** (or the newest week when
  the run ended earlier). A mount effect, RAF-deferred; the done-flag is set
  INSIDE the frame, not before it — StrictMode runs mount→cleanup→mount, and
  a guard set before the frame fires cancels the scroll and then refuses the
  retry.
- Worked weeks get put away with the eye and come back the same way; the
  TOP week's plus adds an OLDER week (`before`/`hiddenAbove`), the BOTTOM
  adds a NEWER one — flipped back with the order.
- `scrollToWeek` scrolls by `node.offsetTop - box.offsetTop`: the scroller is
  not positioned, so bare offsetTop measured against the widget and counted
  the header — every jump undershot by one header height. Offsets, not
  client rects, because the widget sits inside a scale transform.

## The week label row, per the owner
The month is BIG AND BOLD in the label cell ("AUG 22" at dateSize, month
black, number grey), the put-away/plus icons grew to z(14) and spread out on
their own line, and each week carries tiny always-visible up/down scrollers
(`data-week-up`/`data-week-down`) that scroll to the adjacent week — they
replaced the header's ‹ Today › cluster, which is REMOVED (with `jumpMonth`
and the dead `shift`). The month label chip in the widget header stays.

## The drop dialog: two immediate asks shipped, the rest awaits approval
`PlannerTaskDialog` lost its hard-coded explainer paragraph, and "Just put it
on the planner" is demoted to a small grey side button at the footer's LEFT
(`me-auto`) — the rare no-task case, no longer a peer of "Add the task".

**The full multi-day redesign is PROPOSED, not built**: current stage +
when-done stage, one merged what/notes box with paperclip + voice memo, start
day + how-many-days with a live day readout, one card per day ("day 1 of 3"),
non-consecutive days. Drawn with the app's real classes in
`scratchpad/planner-days-plan.template.html` (built html injects the dist
CSS via the snippet in that round's log; the planbar-sketch precedent — strip
the app's html/body rules, red Caveat handwriting for everything that is not
the app). Published as the "Tasks That Take Days" artifact.

**The owner's four answers (2026-08-24), drawn into version 2 and LOCKED:**
1. Saturday never counts. Friday is a PER-STRETCH checkbox that only appears
   when the picked days actually pass a Friday; default off. When Friday is
   in, the notebook strip grows a Friday column for that week.
2. **A task carries ALL of its days**, not one dueDate — the worker's
   schedule and every calendar show every day; "late" starts only after the
   LAST day. (The single-date model was his exact objection.)
3. Non-consecutive at CREATION: a checkbox adds a second stretch (own start
   day + own count, default 1) and the green line reads out both stretches
   merged. Dragging one card afterwards just moves that day, no question —
   the drop question survives only on a task's last remaining day.
4. Finishing early asks the WORKER, in his own language (`Contractor.lang`),
   big simple words, only AFTER photos + Close task: "still on your calendar
   for X — completely finished?" Yes crosses the remaining days off; done
   days wear a strike-through card as the record. Nothing is deleted.
Build to these exactly once he says "build it".

---

# v2 — multi-day tasks, BUILT (the owner said "build it")

## The model: a task carries ALL of its days
`ContractorAssignment.days?: string[]` — sorted ISO dates, absent on a
one-day task — and `stageWhenDone?: string | null`. **`dueDate` is kept
equal to the LAST day**, which is what lets every consumer written for the
single-date world (sorting, overdue, badges) stay correct unchanged: late
means every day has passed. The arithmetic is PURE in `src/data/taskDays.ts`
(`workingRun` · `stretchDays` · `nextWorkingDay` · `dayNumberOf` ·
`futureDaysOf` · `daysOf` · `moveTaskDay`/`removeTaskDay`/`addTaskDay`),
tested offline by `scratchpad/taskdays.mjs` (vite `ssrLoadModule`, 18
hand-worked checks). Saturday never counts; Friday is per-stretch and only
offered when `crossesFriday` says the run passed one.

## Store rules
- **`addContractorAssignment` keeps a caller-minted id** (defaults first,
  `...fields` last). It rewrote the id, so every planner card the drop
  dialog created pointed at a task that did not exist — no pill, no
  take-the-task-off ask, no strike-through, silently, since the dialog was
  born. Found by reading the live card's props off the React fiber.
- **Closing a task moves the job** to `stageWhenDone` — applied in
  `updateContractorAssignment` at the completion transition, whichever
  screen closes it; the portal has no signed-in user, so the stage write is
  attributed to the worker by name. Re-opening does NOT move it back.
- **A hand-typed `dueDate` beats a stale day list**: editing dueDate alone
  on a task with `days` (Tasks page, drawer) collapses it to that one day.

## The drop dialog (`PlannerTaskDialog`), as approved on the plan page
Current stage (shown) · when-done stage · who · ONE what-has-to-be-done box
with the paperclip and a `VoiceRecorderButton` in its corner (a memo becomes
an audio File on the same attachment path; pending audio renders as a
player — `PendingAudio`, module-level, object URL in an effect) · start day ·
how-many-days stepper · per-stretch "Include Friday?" · a Non-consecutive
switch that opens a second stretch (start = `nextWorkingDay` after the
first) · a green `[data-day-readout]` naming every day. Priority and the
separate Notes field are gone. `onDone(taskId, days)` → `placeOnPlanner`
writes ONE CARD PER DAY (same taskId) in one cells write.

## The notebook's day cards
- `PlannerCard` takes `day`; a multi-day card wears a `[data-day-pill]`
  ("day 2 of 3"); a card whose task is CLOSED draws dimmed with a rotated
  strike line and says "done" — or "finished early" when its day is after
  the completion date. The record, never a deletion.
- **A single day of a multi-day task moves/removes SILENTLY** (drag to a
  square, the X, a drag off the sheet) and the task's `days` are rewritten
  through the taskDays helpers so the worker's schedule follows the office's
  hand — the question cards survive only on a task's last remaining square.
  Ctrl-copy of a task card adds its landing day. Foreign entries
  (`projectId`) keep the ordinary asks — their task lives elsewhere.
- `taskChips` expand `daysOf(a)`, so an unplaced task shows on every day.

## The worker's portal
`daysOf`/`effectiveDue`: filters match ANY day, the badge counts to the NEXT
covered day (falls back to the last → Overdue), the card and detail sheet
list every day, the portal calendar plots every day. **Finishing early**:
closing a task with days ahead swaps the confirm for `[data-finish-early]` —
big words in the worker's own language (`finishEarly*` keys in
ContractorUiStrings, optional-with-fallbacks per the standing rule) naming
the days; Yes completes (days ahead struck as "finished early"), No cancels
the close and the task stays open. The office calendars (Tasks, Global,
Project) all expand days too.

Harness: `scratchpad/multiday.mjs` (20 checks, end to end on the container
clock: drop → form → three cells one taskId → pills → silent Thursday→Monday
move rewriting days → non-consecutive second stretch → portal any-day Today →
finish-early ask → stage moved → struck cards). Its traps: the harness must
seed enough WEEKS for every day it asserts (a day outside the run has no
cell and nothing to count), and the green readout is locale-formatted — 
assert the substance, not the commas.

Harness: `scratchpad/notebookflip.mjs` (6 checks — big AUG, cluster gone,
open-on-today at max scroll, scrollers scroll exactly, eye size). Its lesson:
the run's LAST week can never sit flush at the top of the scroller, so
"opened on the current week" is asserted as scrolled-to-max-and-visible, and
the exact-landing check uses an early week's up arrow. `round22.mjs`
re-encoded to oldest-first; `notebook2way` stays green.

---

# v2 — the Drive round: names that heal, folders that answer, the plan reads its own address

## A blank family name heals itself (the owner's "it's not pulling the name")
Two real causes, both fixed:
- `autoFillFamilyNameFromFolder` opened with `if (isGeneralProject) return;` —
  the Job Board was deliberately skipped back when its jobs were free-form.
  They are CLIENT FOLDERS now (owner, 2026-08-24), so the guard is gone:
  pasting a Drive link on a board job fills the name like everywhere else.
- The Add Job lookup can lose the race to the Add button (450ms debounce +
  API latency), creating the job nameless with nothing ever healing it. Two
  heals, both BLANK-ONLY (a typed name is never clobbered): the Add Job
  submit finishes the lookup after creation and fills the name in if it is
  still blank, and the drawer fills a blank name from the folder title on
  open (riding the folder-name fetch it already does).

## Drive discovery that survives the Leads tree
The office grew a second main folder ("Leads") beside "Potentials", and jobs
under it resolved their folder NAME but listed no children — no plans, no
Photos. Three defences, since the exact production cause cannot be reproduced
from this container:
- **`api/drive-files.js` resolves SHORTCUTS server-side**, so the whole
  client stays shortcut-blind: a folder id that is a shortcut lists its
  TARGET's children, and every shortcut CHILD is presented as its target
  (target id and mime, the shortcut's own name) — "Engineered Plans" matches
  whether it is the folder or a pointer to it.
- **Pagination**: `pageSize: '50'` with no follow-up silently truncated any
  folder past 50 files (a Photos folder's 51st picture just vanished). Now
  200/page, up to 5 pages.
- **An access error is no longer "no plans"**: `findPlanSetViaBackend`
  returns `problem: 'unreachable'` when the LISTING throws (it used to
  `catch { return [] }`), and the drawer's Drive-row hint says "Drive would
  not let the app read this folder — check it is shared with the service
  account" instead of "No plans in this folder yet". That sentence is what
  turns the next such report into a diagnosis.

## The plan reads its own address (`src/data/planAddress.ts`)
Entirely LOCAL — pdf.js (lazy, the planAspect idiom) reads page 1's TEXT
LAYER, no service, nothing to install. Lines are rebuilt from positioned
runs (a Hebrew line is joined right-to-left — the runs sit visually);
candidates score by a `כתובת`/address LABEL first (value on the same line or
the neighbour below), a street-word + digit pattern second, with a
title-block (bottom-third) bonus. The winner ships with a CUTOUT — the
region around the line rendered via the pdf.js crop trick (`transform:
[1,0,0,1,-left,-top]`, area-capped so a refused canvas cannot blank it) at
~1000px wide, genuinely readable.
`PlanAddressSuggest` sits under the drawer's Address field: auto-runs ONCE
per plan when the field is EMPTY, a quiet "Read the address from the plan"
button otherwise; the eye opens the cutout (z-140, above the drawer) and
only **Use** writes the field. A scan says "no text to read" honestly —
OCR (tesseract.js) is the known next step if scans matter. An auto-read
that finds nothing stays silent; only a pressed button gets a failure
sentence. Results cache per file id, in memory.

## Waze on the worker's address
`WazeIcon` + `wazeUrl(address)` in BrandIcons (drawn inline like Drive/Zoho);
the portal's task-sheet address ends with the icon —
`waze.com/ul?q=…&navigate=yes`, one press and the phone navigates.

Harness: `scratchpad/planaddr.mjs` (9 checks) — runs against a SECOND dev
server on 5174 started WITH `VITE_DRIVE_API_KEY` (the sharewire precedent;
the drawer's Drive block is rightly dead without a key), every backend route
stubbed with `page.route`, and the "plan" built by pdf-lib with the address
as real text in a drawn title block. Covers: heal-on-open, heal-after-quick-
Add, plans found, the read + label strip, the cutout's real size, Use
writing the field, the unreachable-folder sentence, and the Waze href.
The api shortcut/pagination logic itself cannot be exercised from here (the
dev server has no serverless runtime) — syntax-checked and code-reviewed;
watch the first Leads folder on production.

---

# v2 — the portal round (Close Job, the weekly calendar, the diagrams switch)

## Closing a job is a SCREEN, not a grey button
The task sheet's picture prompt ("press here to add pictures… required
before complete") and the old Mark-as-Complete button are both gone. An open
task shows one green **Close job** button (`data-close-job`, in the media
empty-state and in the sticky footer); pressing it opens the CLOSING SCREEN
(`data-closing-panel`) in the footer: the headline "Add at least 3 pictures
to close the job" (hidden for `photosOptional` workers), the add-pictures
button with a live `n/3` count pill (`data-close-count`, amber → green), the
note row (paperclip, voice memo, text, send), the final **Close job** press
(`data-close-now`, locked until the count is met) and a small Cancel back
link. The finish-early ask still sits on top of the final press when days
remain. `MIN_CLOSE_MEDIA = 3`; the old one-picture rule and the are-you-sure
step are gone — the closing screen IS the deliberate act. `closing` resets
whenever the selected task changes.

**The sheet re-resolves its task from the LIVE list**
(`contractorAssignments.find(x => x.id === selectedAssignment.id) ?? …`).
The state holds the object captured at open, so completing the task never
reached the open sheet — the closing screen stood over a finished job and
only closing and reopening the sheet showed the truth. Any sheet that
renders from a stored record object needs this re-resolve.

## The portal calendar is two big bubbles, Weekly first
`calMode` ('week' default) — two `data-cal-mode` pill buttons on top.
Monthly is the existing TaskCalendar grid; Weekly (`data-cal-week`) is a
day-LIST of the current week: seven cards with big date/weekday headers
(today ringed), each task a tappable row that opens its sheet, ‹ ›
arrows walking whole weeks and the tappable range label snapping back to
this week. Workers confused the month grid with the notebook — the list
reads like a schedule, not a board.

## All leads the filter row
`filterOptions` order is All · Yesterday · Today · Tomorrow · This Week.

## The planner sheet scrolls sideways instead of smushing
The portal's planner tab wraps `PlannerWidget` in an `overflow-x-auto` box
with a `minWidth: 640` inner div — at 390px the week keeps its shape and the
thumb pans it. The map tab's `BuildingDiagram` now takes `phone={usePhone()}`
so a phone gets the taller phone cells.

## The building-diagrams quick switch (Settings → Workers)
Each worker row carries `data-diagrams-toggle`: a pill showing the EFFECTIVE
state (`permsOf(c, workerLevels)` — level first, overrides on top) as
"building diagrams" (sky) or "own units only" (grey). One press writes BOTH
`seeDiagrams` and `seeAllApartments` through the standing override rule — an
override equal to the level's own answer is REMOVED, not stored. New
optional ContractorUiStrings: `closeJobBtn`, `addThreePictures`,
`weeklyLabel`, `monthlyLabel` (optional-with-fallback, the standing rule).

Harness: `scratchpad/portalround.mjs` (18 checks). Its traps: portal tabs
are PERMISSION-GATED, so the seed worker needs `perms: { seeSchedule: true,
seePlanner: true }` or Calendar/Planner simply are not drawn; the completion
celebration (z-220) swallows clicks until dismissed by a tap; the sheet
closes by a backdrop tap, not Escape; and the settings tab says "Workers"
(the words-only rename). `multiday.mjs` re-encoded to the new close steps
(`data-close-job` → `data-close-now`) and stays green.

---

# v2 — you stay where you are standing (peeks, the back button, the future week)

## A foreign job on the notebook PEEKS — nothing on the notebook travels
`PlannerWidget` takes `openUnit?` and both foreign click paths (a planner
CARD from another workspace, a dashed task CHIP whose task lives elsewhere)
go through it; only when the host offers none does the old
switch-then-intent travel remain as the fallback. `PlannerHost` passes
`c.openUnit`, so on the board a click opens `UnitPeek` over the board.
`DashboardPage.openUnit` now peeks too (it used to switch workspace and
navigate); the peek's own "Open in …" button does the real journey. The
portal passes `openUnit={() => {}}` and the wall ctx got `openUnit: () => {}`
— a stray tap must never switch the portal's or the TV's workspace.

## The browser back button restores the WORKSPACE, not just the route
Routes never carried the workspace, so Back walked the routes while leaving
you in whatever workspace you were in now. Every history entry is STAMPED
with the workspace it was viewed in (`location.state.ws`) and a pop restores
it. Two halves, and the split is load-bearing:
- **Stamp** — an effect in `AppLayout`: a new entry is stamped in place
  (replace), and a store switch that truly arrives with no navigation
  pushes one entry. Two traps paid for: navigate() is wrapped in
  startTransition, so the store's commit lands one render BEFORE the
  router's and pushing immediately minted a phantom entry (old route, new
  workspace); and React Router writes `window.history` synchronously at
  navigate() while a heavy workspace switch holds the transition past any
  timer — so the deferred push checks the REAL address before firing.
- **Restore** — `src/data/workspaceHistory.ts`, a popstate listener
  registered at MODULE LOAD (armed at the top of App.tsx). It cannot be an
  effect: the router's history subscription flushes its React update
  SYNCHRONOUSLY inside ITS popstate listener (useSyncExternalStore), so a
  later-registered listener runs after the popped route has already
  rendered — and the /jobs ↔ /project guards have bounced it. First in
  line, the store is switched before the router's own sync render.
- **ProjectDiagramPage's redirect guard moved below every hook** — it sat
  above three useCallbacks, which never bit while a switch always unmounted
  the page in the same commit; the synchronous restore switches the store
  WHILE it is mounted, and the early return crashed the whole app
  ("Rendered fewer hooks than expected"). The GeneralJobsPage rule, now on
  both pages: the guard sits after every hook.

## The add-a-week plus is always visible — and that is the future week
The notebook's per-week add/put-away icons were `opacity-0
group-hover/wk:opacity-100` — and the touch-screen reveal rule in index.css
only matched the UNNAMED `group-hover\:opacity-100` class, so on an iPad
the plus never appeared at all: the owner's "I can't add a week in the
future". The icons are always visible now (the scroll arrows beside them
already were — navigation is not a control to hunt for), and index.css
gained `[class*="group-hover/"][class*="opacity-100"]` under
`any-hover: none`, which catches every current and future NAMED reveal
(pin, art, cell…). Tooltips are unaffected — they render through a portal.
The bottom week's plus adds the week AFTER (the future); the top week's
adds the week before; a week put away in that direction still shows the eye.

Harness: `scratchpad/round29.mjs` (14 checks) — the foreign-card peek with
the workspace and route asserted unmoved, Back/Forward restoring workspace
AND route with the notebook really back on screen, and the always-visible
plus adding weekCount 2. **Harness date drift**: `multiday.mjs` and
`portalround.mjs` seed FIXED task dates and the portal's default filter is
Today, so both now press the All pill before reaching for a card, and
multiday derives its badge expectation (Today/Tomorrow) from the real
clock. A harness that assumes the container's date goes red at midnight.

---

# v2 — stage discipline (crossed-off stages, half done, and "I did work here")

## The model (`src/data/stageMarks.ts` + `Apartment.stageMarks`)
`stageMarks?: Record<stageId, 'done' | 'pending'>` rides in `apartments` (no
new store point) and SYNCS TO A MERGED PARTNER like currentStageId. The rule,
one sentence: a manual mark always wins; without one, every stage ordered
BEFORE the current stage derives as done (moving on is what closes a stage),
and the current stage stays open until the job moves past it or somebody
marks it. Pure helpers: `stageStateOf` · `pendingStages` (manual pendings
only — derived done is bookkeeping, not an alarm) · `cycleMark` (left press
open→done→open, pending→done; right press pending↔open; empty map collapses
to undefined so the field vanishes).

`ContractorAssignment.stageReport?: boolean` — the task IS a stage report.
The store's completion write (beside stageWhenDone) marks the report's stage
'done' on the apartment, whichever screen closes it; an OPEN report task is
the record behind a pending stage, the worker's what-is-left note under it.

## The stage picker (`src/components/apartment/StagePicker.tsx`)
The drawer's stage `<select>` is gone — an option cannot wear a checkbox, a
strikethrough or a right-click. Every stage row carries a box: derived/manual
done = green check + name struck through; right-click = half done, a glowing
orange clock (`.pending-glow` in index.css, reduced-motion safe); row press
still runs `handleStageChange` (keep-history / assign-task questions intact).
Marks save on the spot via `updateApartment`. The panel PORTALS at z-[140] —
the drawer body is an overflow scroller (the tooltip scissors). Its Escape
handler is capture+stopPropagation so the drawer under it stays open. Applies
to every workspace — the drawer is shared.

## The worker's flow (`ContractorPortal`, the map tab)
Tapping ANY apartment on the building map opens its sheet (`data-work-sheet`):
his tasks there one tap deeper, plus the big **I did work here** button
(`data-work-here`). Then one small screen at a time: What did you do? (the
workspace's stages as rows) → Did you finish this stage? →
- **Yes** creates a stage-report task and hands straight over to the standing
  3-picture closing screen. `arriveClosingRef` is load-bearing: the sheet's
  "a new selection starts OUTSIDE the closing screen" effect fires on the
  very selection this flow makes and would undo a plain `setClosing(true)`.
- **Not yet** asks what is left (`data-work-note`), files the note under an
  OPEN report task, and marks the stage pending — nothing is created until
  Send, so backing out leaves no records.
New optional ContractorUiStrings (fallback rule): `workHereBtn`,
`whatDidYouDo`, `didYouFinish`, `finishedYes`, `finishedNo`, `whatsLeft`,
`sendToOffice`, `halfDoneSaved`.

## Pending shows on BOTH (the owner's ruling)
The apartment's picker wears the clock — and the Header grows
`PendingStagesBell` (`data-pending-bell`): a glowing orange clock with a
count, drawn ONLY while something is pending, listing every half-done stage
in the workspace with the worker's note, portalled (the header is a stacking
context). A row opens the apartment through the channel its page already
watches while mounted: `pendingFocus` for the board, `pendingOpenAptId` for
the diagram — whose consuming effect now watches the VALUE, not just the
mount (asked-for-while-standing-here was silently ignored). New MainUiStrings
(both presets): `stagePendingLabel`, `stageMarkHint`, `stagePendingListTitle`,
`stagePendingEmpty`.

Harness: `scratchpad/stagereport.mjs` (22 checks) — derived cross-off, manual
done, right-click pending, the bell and its row opening the drawer, the
worker's no path (pending + open task + note) and yes path (closing screen →
stage done), and the office list carrying both with the note. Its manner: one
live page at a time — a background admin page's flush-on-unload overwrites
the worker's writes (the standing localStorage trap).

---

# v2 — the five-fix round (history of opens, centre zoom, edge pin, tile fit, Ctrl+A)

- **Opening a job is in its history.** The drawer's open effect writes an
  `actionType: 'opened'` activity entry (fieldChanged 'viewed'), throttled to
  one per person per job per HOUR, rendered as "opened" in the drawer's
  History tab and the global log ('◎'). `addActivityLog` skips the
  auto-backup snapshot for these — looking changes no data.
- **OWNER RULING (2026-08-25): the header zoom buttons anchor the MIDDLE of
  the view**, overriding the top-left-corner anchor. The corner anchor
  existed to avoid an anchor the clamp refuses (which snapped the board);
  that is handled by clamping INSIDE the same zoom step — near the pinned
  corner the zoom gives way to the wall, everywhere else it is a true centre
  zoom. The centre is measured below the floating chrome.
- **The ~7% edge rule in `zoomAt`**: a ctrl+wheel zoom aimed inside the outer
  7% of the board's own space, while that edge is on screen, anchors at the
  EDGE — it holds exactly where it is and the zoom opens inward, so a thing
  near the rim can never be pushed off past it. Per axis, all four sides;
  `worldSizeRef` is written each render beside `fitZoomRef` because zoomAt is
  a stable callback.
- **Job tile text auto-fits** through the diagram's own `emWidth` (now
  exported from BuildingDiagram): the stage badge's font is computed from the
  tile's real room (clamped [6.5, 10], rounded DOWN, 6% bold margin,
  whitespace-nowrap so it is ONE line, ellipsis only below the floor); the
  family name steps 14 → 12.5 when it measures wider than one row.
- **Ctrl/⌘+A inside a group window** selects every JOB on its visible list
  (a search narrows what "all" means), jobs only, preventDefault so the
  browser's select-all never fires. The main board has no Ctrl+A — only the
  group was asked for.
- Friday checkbox default STAYS OFF — re-confirmed by the owner against his
  earlier prompt text.

Harness: `scratchpad/fixes5.mjs` (11 checks). Its traps: a BUILT-IN bin opens
on a single CLICK (dblclick is the custom-group rename path); the board's
view memory restores the harness's own zoom on reload, parking the bins under
the floating header — press 100% before aiming at one. `grouplock.mjs` gained
the same come-home line before its rename section; its old zoom-anchor
assertion still holds at the home view because the clamp pins the top there.

---

# v2 — the group lands in one piece, and the Arrange plan

## A multi-selection SETTLES AS ONE RIGID PIECE
`settleGroupDelta` in GeneralJobsPage: both drag commits (job-led and
node-led) compute ONE settle correction — from the selection's
top-left-most member — and apply it to every member. `settleDrop` run per
member clamped each tile independently, so a spread selection released near
the chrome TORE on mouse-up, clamped members leaping to their own spots
("the second I pick up my mouse, it jumps there one by one"). The drag
itself was already live for every carried member (`jobPos`/`elPos` apply
`drag.dx/dy` to the whole carry). Harness: `scratchpad/groupsettle.mjs` —
mid-drag togetherness, exact relative offsets surviving a clamped drop
(jobs AND nodes), the settle floor. Its lesson: world y is measured below
the pinned chrome line, so the settle floor is the board MARGIN (28), not a
screen offset.

## The Arrange feature is PROPOSED, not built (owner's gate)
The owner asked for the mockup FIRST, with the app's real UI code, published
for approval before any live wiring: `scratchpad/arrange-plan.template.html`
(built by inlining the dist CSS, the planner-days precedent) — published as
the "The Arrange Feature" artifact. It carries the real tile/menu markup,
the right-click-anywhere "X selected" menu with an Arrange row, the hover
consolidation animation, LIVE Arrange and cut/paste-to-tidy-grid demos, and
the rules box. **The `arrangeGrid` function in the page is the exact
arithmetic to ship**: sort tallest-first, shelf-pack rows against
`targetW = sqrt(totalArea × 1.4)` with a 0.65-width overshoot tolerance
(without it nine equal tiles pack two per row), rows centred within the
widest, members centred within their row, block centred on the selection's
old centre (Arrange) or the paste point (paste), everything stays selected.
Verified shapes: 2→[2], 4→[2,2], 9→[3,3,3], mixed→[3,3,1]. Build it only
when the owner approves the page.

---

# v2 — Arrange, built as approved

## `src/data/arrangeGrid.ts` is the approved arithmetic — page and code together
The mockup page ("The Arrange Feature" artifact) carries the same function;
change one, change both. Tallest-first shelf pack, target √(area×1.4), a
0.65-width overshoot tolerance (without it nine equal tiles pack two per
row), rows centred within the widest, members centred within their row.
Verified shapes: 2→[2], 4→[2,2], 9→[3,3,3].

## On the board (`GeneralJobsPage`)
- **Right-click ANYWHERE with a selection** shows the SELECTION menu
  (`ctxMenu.kind: 'selection'`): "N SELECTED" header, Copy, Cut, Paste here,
  and Arrange with the hover consolidation animation (`ArrangeMenuRow` +
  `SelCountHeader`, module level — the declared-in-render trap; CSS
  `.arr-anim`/`.arr-tip` in index.css, reduced-motion safe). The empty-board
  menu appears only with nothing selected.
- **`arrangeRef`**: lays the selection into the grid centred on its own mean
  centre, corner through settleDrop, one `arrange` undo step, drawings
  re-lay their points, and the selection is KEPT (the approved rule). Left
  out: bins, arrows, locked things, attached clip art.
- **The job and element menus** gain the header + Arrange row when multiple
  are selected. The element menu's z-order section was relabelled ORDER so
  two things named Arrange cannot sit in one menu.
- **Paste lands as the TIDY BLOCK now** (supersedes "arrangement kept"):
  `pasteRef(at?)` lays the clip into arrangeGrid centred on the clicked spot
  (menu rows pass their world point) or the view centre (Ctrl+V). Cut-move
  and copy-duplicate both.

## In a group window (`BinBoard`)
The job menu gains Arrange (N) when multiple are selected — pairs with
Ctrl+A: grid onto the group's own surface via `binX`/`binY`, tracked, still
selected.

Harness: `scratchpad/arrange.mjs` (10 checks). Its lesson: the exact pack
SHAPE depends on the mix — assert the grid's INVARIANTS (compact bands, the
18px gaps, selection kept), not a guessed row layout; 4 tiles + 1 note
legitimately packs [2,2,1].

---

# v2 — Building Progress cells scale to fit

`ProgressCell` in DashWidgets is measured in BOTH dimensions now: cell width
from the columns as before, cell HEIGHT from the widget's real room divided
by the tallest building's rows, written into the grid as `gridAutoRows` — a
taller widget grows the apartments themselves, not just its frame. Inside
the cell everything sizes from the measured box, per name, via the diagram's
`emWidth`:
- the family name takes the LARGER of a one-line and a two-line fit (wrap
  costs ~5%, hence ×1.9 not ×2), capped by a ceiling that grows with the
  cell — a tall cell spends its height on a big wrapped name;
- the number steps ×0.82 smaller when a name shares the cell;
- a genuinely tall cell (≥34px + slack) earns the ADDRESS line, in the
  owner's stated order: address, number, name;
- floors at 4.5px — below that it is ink, not writing.

Harness: `scratchpad/progresscells.mjs` (10 checks). Its lesson: WidgetSurface
SCALES the widget's natural drawing, and computed font-size stays in LOCAL px
under a transform (the ScreenReport rule) — a probe must multiply by the
render scale or a visually-big name reads as 8px and the harness blames the
product. `boardsize.mjs` carries one PRE-EXISTING red (left-edge auto-pan),
verified identical with these changes stashed.

---

# v2 — the markup round, first half (the tabs await approval)

## The zoom-out floor is the fit
`fitScaleRef` in PlanAnnotator is written EVERY renderPage from the stage's
real size (not only when a fit was asked for — the buttons and the pinch
clamp against it and need it current after every resize, page turn and
rotation). Every zoom-out path — wheel, pinch, all three button clusters —
floors on it: once the whole sheet is visible with its margin, zooming out
buys nothing but blank stage. Zoom-in caps are untouched.

## Touch: unrounded pinch, gentler taps
- The pinch sets the scale UNROUNDED while the fingers are down and snaps to
  whole per-cents only on gesture end — per-frame rounding made the sheet
  grow in visible 1% ticks, each tick re-running the anchor scroll
  correction, which is the stutter that read as "pinch jumps".
- `zoomStep(dir, step, cap)` is the one door for every zoom button. On a
  touch screen (`any-hover: none`, the standing capability test — never "is
  this a tablet") a tap moves ×1.08 instead of a flat +0.15/+0.2, so taps
  are fine moves at any zoom.

## Full screen is real, and the fit button stopped lying
The button that wore the full-screen icon ran `setFitting(true)`. Now: the
fit button wears a SQUARE icon (`data-plan-fit`), and a REAL full-screen
button (`data-plan-fullscreen`, Maximize2/Minimize2) sits between zoom-in
and fit in all three clusters (viewer pill, markup header, phone ⋯ sheet) —
`rootRef.requestFullscreen()` on the annotator's own root, state follows
`fullscreenchange` so Esc is honest, and the same button is the visible way
out. In the drawer the pill lives INSIDE the root, so the exit control is
visible in full screen even though the drawer's portalled bars are not.

## The markup button size is a per-machine setting
`src/data/markupScale.ts` (`markup_ui_scale` in localStorage, clamp [1,2.2],
a window event so an open studio follows live) multiplies with the host's
`touchScale` prop into the studio's `ts`/`ui` factor. The control is five
preset buttons (Normal→Giant) on the **This computer** card in app settings
(`data-markup-scale`) — per-machine like `drive_desktop_root`, NEVER synced:
the touchscreen's giant buttons must not arrive on every desk.

## Tabs + preloading are PROPOSED, not built (the owner's gate)
The walkthrough is `scratchpad/plan-tabs-plan.template.html` (dist CSS
inlined, the drafting-table manner), published as the "Plan Tabs" artifact:
Chrome-style tabs between the plan's name and the zoom cluster, open-in-new-
tab on plan rows, sketches in their own tabs, + duplicates the current plan,
tabs persist per machine per job, X asks "Your work isn't saved. Save to
Google Drive?" only when marks are unsaved (Yes = the existing Annotated
Plans pipeline, unchanged), and background download of the folder's other
plans with per-plan progress — copies dropped on exit, tabs kept. Build only
when he approves the page. His 2026-08-26 refinements, drawn in: two upright
separator lines boxing the tab section off from the name and the zoom, and
the unsaved dot became a CLOUD on every tab — amber with an × while unsaved,
the Drive mark once saved, and the saved cloud is a LINK that opens the file
in Google Drive (the real build uses the app's own DriveIcon).

Harness: `scratchpad/markupfixes.mjs` (17 checks). Its lessons: under
`Emulation.setEmitTouchEventsForMouse` Playwright's own synthetic clicks
HANG — arm the touch profile after navigation and press buttons through the
DOM; and `setEmulatedMedia`'s feature overrides do not reach matchMedia in
this Chromium — `setTouchEmulationEnabled` is what genuinely flips
`any-hover: none`.

---

# v2 — plan tabs, built as approved

## The strip (`src/components/plans/PlanTabs.tsx`)
Chrome's manner, in the studio bar's middle boxed by TWO upright separator
lines (the owner's ask); on a phone and in the drawer pane — whose bars are
portalled slots with no middle — it sits on a slim navy row of its own.
Every tab wears a save-state cloud: **a big RED × while marks have not
reached Drive, a big GREEN ✓ otherwise** — icons only, the click-to-open-
Drive idea was dropped by his ruling. The × strokes its GROUP element, not
the lines (a harness matching `line[stroke]` finds nothing). The + lives
OUTSIDE the scroller so it can never be covered, and the picked tab is
`scrollIntoView`'d — with too many tabs the overflow hides the others,
never the one you are on (his exact report).

## The wrapper owns the tabs; the editor is remounted per tab
`PlanAnnotator` is now a wrapper around the renamed `PlanEditor` (same file):
tabs per machine per job (`plan_tabs_<apartmentId>`), the editor keyed
`tab.id:tab.fileId`, per-tab work carried through `initialWork` in and
`workRef` out (a ref the editor writes every render). Rules paid for:
- **A stash is made BEFORE any setState that changes the active tab, never
  inside an updater** (updaters must stay pure under StrictMode).
- **The editor reports `scale: null` while a fit is still owed** — a stash
  taken in StrictMode's mount/cleanup/mount window otherwise freezes the
  pre-fit 1.25 as the tab's remembered zoom and the studio opens unfitted
  (the phone studio did, at 1489px CSS on a 390px screen).
- **The session work map is scoped per SURFACE** (`pane` vs `studio`) and
  only the studio writes page/zoom into the shared tab meta — a zoom right
  for a 380px pane is wrong for a full-screen studio. The pane always fits
  on open (`initialWork.scale` stripped when `embedded`).
- Refresh recovery: a tab's `versionId` points at the autosaved
  planAnnotations record, so unsaved marks survive a reload the way they
  always did — per sketch.
- Closing a tab whose sketch has not reached Drive asks "Your work isn't
  saved. Save to Google Drive?" — Yes runs `stampPlanToDrive` with the same
  folder/naming/version rules as the Save button; No discards only the
  unsaved marks. No ask in the read-only pane, or when there is nowhere to
  send it (marks are autosaved locally and stand in the version list).
- Picker rules: an ORIGINAL replaces the current tab (and still goes through
  the host's `onPickPlan`, which is what writes `plansPdfLink`); an
  ANNOTATED sketch opens in its own tab; every row gains an
  `open in new tab` button (`PlanPicker.onOpenNewTab`) — the Row became a
  `div role=button` because a button inside a button is flattened.

## The cache (`src/data/planCache.ts`)
In-memory bytes per Drive file id; a background PUMP downloads the job's
other plans one at a time (the sheet being read is never slowed); tab
spinners and picker rows show `downloading… n%` / `ready` via
`usePlanDownload`. Reference-counted (`acquire`/`release`) because the pane
and the studio are open at once — the copies are dropped when the LAST
viewer closes; the tab list survives. Traps paid for:
- **pdf.js TRANSFERS its input buffer to the worker** — hand it the cached
  buffer and the cache is neutered on first use; every read hands out
  `slice(0)`.
- **The pump is restart-safe**: a running-flag chain that StrictMode's
  mount/cleanup/mount stranded at "running" over an abandoned loop fetched
  nothing, silently, forever.
- **A cache clear sweeps the progress map while a download is still in
  flight** — both `fetchPlanCached` and `prefetchPlans` re-mark inflight
  files, or the indicator vanishes and the row reads as never-started.

Harness: `scratchpad/plantabs.mjs` (23 checks, on the 5174 keyed server with
all Drive routes stubbed; one plan's route sleeps 8s so the indicators are
observable). Its trap: the drawer is itself `position:fixed`, so a studio
query scoped `.fixed …` finds the PANE's strip first — every studio
assertion goes through the LAST `[data-plan-tabs]`. `planaddr.mjs` gained
the standing All-pill fix (fixed seeded date vs the portal's Today filter).

---

# v2 — the TV frame is see-through

The board's green TV frame no longer takes the pointer on its body: tiles and
widgets under it are clicked, dragged and edited as if it were not there.
Only two things on it are live — a MOVE grip on the top-left corner
(`data-tv-frame-move`, the Move glyph) and the resize handle on the bottom-
right (`data-tv-frame-handle`), both sized ÷zoom like all frame chrome.
Pointer capture on the grips is what keeps a drag delivering to them while
every ancestor is `pointer-events-none` — the move/up handlers must sit ON
the grips, not on the frame body. The label moved right of the grip and says
"grip moves · corner resizes". `tvframe.mjs` asserts the click-through with
`elementFromPoint` at the frame's centre and drags by the grip.

---

# v2 — OWNER REVERSAL (2026-08-26): a foreign unit opens the FULL drawer

Supersedes the round-29 peek ruling, in his words: "The full pop up of the
apartment should show — take me to that workspace to show it." Tapping a
unit that belongs to another workspace — a Building Progress cell, a weekly-
notebook card or task chip, a unit card — now travels there and opens the
real ApartmentDetailDrawer in ONE tap: `openUnit` (board ctx and dashboard
ctx) does setCurrentProject → setPendingFocus({kind:'apartment'}) → navigate,
the settled switch-then-intent order; the diagram and the board both open
the drawer from that intent (goToHit's non-reveal path). `UnitPeek.tsx` is
DELETED with its state and `[data-unit-peek]`/`[data-peek-open-full]` hooks;
round21 / round23 / round29 / boardsize re-encode the new contract (round29
walks home through the header before its Back-button section). The portal
and the TV still pass a no-op openUnit — a stray tap there must never switch
workspace.

---

# v2 — the board goes fast, and colleagues appear on it

## VIEWPORT CULLING (the thousand-job board's performance story)
Panning the imported board measured **717ms A FRAME** — every tile mounted
whatever the view showed. Only what is in (or within CULL_PAD=350 of) the
view is mounted now; the KEEP rules hold the selection, everything a live
drag/resize carries, the edited node, the search hit, fresh jobs and the
dragged ghost mounted wherever they are. **WIDGETS and BINS are never
culled** — a widget unmounted mid-pan loses its own state (a planner's
scroll, the map's tiles, a notebook's drop probe), and there are dozens
against a thousand tiles. All board arithmetic reads DATA, not the DOM, so
only the rendering bill changed. Two more finds from the same profile:
`relativeTime` is MEMOISED in types/index.ts (its `toLocaleDateString` cost
~0.3ms per call, per visible tile, per frame), and MiniMap's marks moved to
their own memoised `MiniMarks` (the panel takes `pan` for its view
rectangle, so its own memo was useless during a pan and a thousand
miniature rects redrew per frame). Container numbers, dev server: pan
717→33ms median, tile drag p90 733→16.8ms, 56 of 1000 tiles mounted.
`scratchpad/boardperf.mjs` is the guard; its numbers are CPU-rendered and
pessimistic — the production build is faster still.

## LIVE PRESENCE (`src/data/presence.ts` + `PresenceLayer`)
Who else is on this board, their named cursor in their colour, and dashed
ghosts of tiles mid-drag under their hand. Rides Firebase's REALTIME
DATABASE (`VITE_FIREBASE_DATABASE_URL`), NOT Firestore — cursor traffic
would chew Firestore's per-write quota; RTDB is built for cheap ephemeral
streams. The module is lazy-imported only when the URL is set; with it
absent every function is a no-op and the board is exactly as before. Rows
die with the tab (`onDisconnect().remove()`), writes are throttled to ~8/s
trailing, a 10s heartbeat keeps a motionless colleague from fading, and
the layer drops peers 15s quiet on its own clock tick. The layer renders
INSIDE the world div (board coordinates need no conversion), is entirely
pointer-events-none, and chrome divides by zoom. Presence is scoped per
workspace AND per named board — cursors on different boards never cross.
The harness door: `window.__injectPresence` (DEV builds only) feeds the
real fan-out, because a websocket to firebaseio.com cannot be stubbed with
page.route — `scratchpad/presence.mjs`. End-to-end against a real RTDB
needs production; the owner's setup: create the Realtime Database in the
Firebase console (rules read/write true, same public posture as
Firestore), put its URL in Vercel as VITE_FIREBASE_DATABASE_URL.

Standing pre-existing reds, verified identical with this diff stashed:
`boardsize.mjs` left-edge auto-pan, `touchpan.mjs` pinch-zoom.

---

# v2 — the touch round: taps that mean it, numbers that open, and the reel grown up

## A finger tap must never start typing
The board's FINGER branches (tile and node pointerdown) exempted
`a,button,input,textarea,select` but not `[data-no-drag],[data-el-action]` —
the two attributes every widget control carries and the MOUSE path already
honoured — so on a touch screen a tap on a widget's own button was captured
as a pan and a caret appeared where nothing should type. Both selectors now
match the mouse path's. And tap-to-edit (second tap on a picked node) is
gated to `note | box | title` — the only kinds where "edit" means typing;
on a widget it now opens nothing, and a notebook card's tap opens its JOB.

## Travelling to another workspace buys a return ticket
`src/data/unitTravel.ts` — `rememberReturn(projectId, path, aptId)` /
`redeemReturn(aptId)` / `clearReturnTicket()`. `openUnit` (board ctx and
dashboard) remembers where you stood before switching; BOTH drawer close
paths (board and diagram) redeem it and take you straight back. The ticket
is only honoured for the SAME apartment it was written for — opening a
different unit over there means you stayed, and the ticket is torn up. A
deliberate workspace switch (the header picker) and the browser Back button
clear it too. Session-only, module-level, never persisted.

## Numbers open their lists on the wall too
`TvPresentationPage` provides a real `showList` in its widget ctx and draws
`WidgetListPopup` over the wall (rows open the wall's own job screen); the
overdue pill in the wall's bar is a button (`data-tv-overdue`) listing the
workspace's overdue jobs. The tv-month heat map counts `daysOf(a)` for OPEN
tasks — every day of a multi-day task — plus the weekly notebook's own cells
(entries WITHOUT a `taskId`, projections skipped), so a planned day is a
busy day. `WorldClocks` no longer blinks on the TV: its measure effect damps
(`>2px` height / `>8px` width change before writing state) and the row
factor is width-capped, which kills the resize→font→resize feedback loop
the wall's zoom amplified.

## The map picks what it shows
`job-map` gained `data.show`: `all` (default) · `addressed` (a job with no
address is left off instead of scattered) · `today` (only jobs someone is
booked on today — `daysOf` against the local date — with the CREW's names
on the pins and the job's name beneath).

## The TikTok reel
- **The frame's address is FROZEN per mount** (`src` useMemo on
  `videoId:playToken`, settings read through refs). `muted` and `loop` were
  interpolated into `src`, so the sound button and the Repeat toggle
  changed the URL and the browser RELOADED the frame — that was the
  restart. Everything mid-video travels over the player's postMessage
  protocol; the sound button never remounts at all.
- **Full screen on the reel's own root** (`data-tiktok-root`,
  requestFullscreen — the top layer escapes the board's transforms), with
  the TAP LADDER: the iframe eats every press, so a transparent overlay
  (`data-tiktok-tap`) above it is what a tap lands on. Chrome starts
  hidden; first tap brings the floating control pill back; each tap after
  toggles pause/play; 4s quiet puts the pill away and resets the ladder. A
  × (`data-tiktok-exit`) is ALWAYS visible — a touch screen has no Escape.
  **The overlay and the × carry `data-no-drag data-el-action` + their own
  stopPropagation** — without them the node underneath captured the pointer
  and the click retargeted away (the standing capture trap, paid again).
- **The big manager** (`TikTokManager`, module level, portalled, seals its
  pointer events): near-fullscreen popup where every link is a tile with
  the video's own preview picture (resolved through the existing
  `/api/tiktok` oEmbed route, chunked in threes), hide (the link stays,
  the reel skips it — `data.hidden`, an array beside `links`) and remove
  per tile, paste-to-add, play-jumps-the-reel, Escape closes.
- NOT verified against tiktok.com end to end — no internet here. The
  container's egress proxy serves an error page into the sandboxed player
  iframe whose own script throws a localStorage pageerror; `round30.mjs`
  filters exactly that message as third-party noise.

## The Google Photos album widget (`photos-album`)
`api/photos-cover.js` reads the share page's `og:image` on the server (not
key-guarded, URL-checked to photos hosts only — never a general fetcher);
`PhotosAlbumWidget` wears the cover with a drawn `PhotosIcon` mark
(BrandIcons, the Drive/Waze manner) and the album's title, links out, and
answers the two honest cases in words: NOT SHARED (no og:image / a
sign-in redirect → "open the album, press Share, Create link") and
unreachable (retry). The answer is cached on the node keyed by the link
(`data.cover.for`), so one machine's lookup serves every screen and
changing the link refetches. `data.sample` draws a canned cover on the
shelf — the store makes no network calls. Registered in all four places:
MORE_WIDGETS, WIDGET_FIELDS, WIDGET_PREVIEW, SHELF.

## Layout history grows a clock, and the panels lose their paragraphs
- `BoardSetting.autoLayout` (`'' | 'hourly' | 'daily'`) +
  `BoardLayout.auto` — the clock's snapshots rotate in their OWN slots
  (`LAYOUTS_AUTO_MAX` 8 in store.ts) so they can never push out an
  arrangement somebody saved on purpose, and ten deliberate saves never
  starve them. The ticker lives in GeneralJobsPage (positions only ever
  change there): checks on arrival and every 5 minutes; 'daily' takes one
  when the newest auto snapshot is from a previous day; a board where
  NOTHING moved since the last auto snapshot is skipped. Configured inside
  the Layout history panel (`data-auto-layout`); auto rows wear an `auto`
  tag. No new state key — both ride existing persisted keys.
- **`Hint`** (module level in GeneralJobsPage): every standing explainer
  paragraph in board settings and the layout panel became a hover ⓘ
  tooltip, the settings-Row idiom.
- **Make room is tracked**: `makeRoom`'s writes run inside
  `track({weight:'arrange'})`, so Ctrl+Z closes the room back up. The pan
  compensation stays view state — undoing visibly slides things back.
- **`.touch-show`** (index.css): display:none, `display:flex !important`
  under `any-hover: none`. The board's full-screen mode renders an
  always-visible exit button (`data-touch-exit-fullscreen`) through it —
  a touch screen has no Escape key, and a desktop keeps its single exit.

Harness: `scratchpad/round30.mjs` (32 checks). Regressions green: board,
undoredo, round26, round27. Standing pre-existing reds unchanged
(`boardsize.mjs` left-edge auto-pan, `touchpan.mjs` pinch-zoom).

## The tap-in board answers the wall
Two rules in `TapInBoard.tsx`, both paid for:
- **A punch is not a board edit.** The TV renders every widget `readOnly`,
  and honouring that here made the ONE widget built for the wall panel dead
  on it — "the tap-in widget isn't working". The tap guard is `sampleMode`
  (the shelf's canned people), never `c.readOnly`: the wall, a view-only
  named board, anywhere the board is drawn live, takes punches. The whole
  tile is one `<button>` — name, time, icon and the colour around them.
- **Tiles FILL the box in even rows.** They carried a fixed 46px height
  under WidgetSurface's scale, so changing "tiles across" or resizing the
  node left dead bands and rows that stopped lining up with the box. The
  grid is measured (damped, the WorldClocks rule), `gridAutoRows` gives
  every row an equal share (floor 44px, past which it scrolls), and the
  type scales from the tile height.
Harness: `scratchpad/tapin2.mjs` (8 checks, including a real punch from the
/tv page). Its lesson is the standing one: patching localStorage and
reloading is overwritten by the app's flush-on-unload — the one-column case
needs its own seeded context.

## OWNER RULING (2026-08-27): dragging ONE DAY of a multi-day task ASKS
Supersedes the earlier "a single day just moves silently" decision, in his
own three labels. `PlannerDayDialog` (PlannerDialogs.tsx) opens when a
day-card whose task has other squares is dropped on a different square:
- **Move this day** — the old silent path (moveEntry + moveTaskDay).
- **Add this day to the existing task** — origin card stays, the task grows
  (the Ctrl-drag shortcut still does this without the question).
- **New task on this day** — opens the standing `PlannerTaskDialog`,
  three-quarters filled in; its days place one card per day on the target
  person's row, the dragged card never moves, and the job-in-square rule
  holds (a job's card lists its tasks itself).
- A target day the task ALREADY covers asks its own plain question —
  **merge** (origin card off, task one day shorter) or a new task — because
  "move" there folds two days into one and "add" adds nothing.
The day-number pills are labels derived from calendar order, never
identities: day one dragged past day two simply renumbers. Dropping a card
back on its own square asks nothing. Foreign entries keep the ordinary
asks (their task lives in another workspace). Dragging a day OFF the sheet
still takes just that day, silently.

**The plannerAsk trap, paid for here**: `addContractorAssignment` queues
the store's "this job is on the planner and just got a dated task" question
whenever the job already has a card on any rota — and the new-task door
creates exactly such a task, so the `PlannerAskModal` stood invisibly over
the board and swallowed every later press (the standing unseen-backdrop
disease; in the harness it read as "the next drag does nothing at all").
The widget's onDone answers it as 'skip' for its own job before placing
the cards.

Harness: `scratchpad/multiday.mjs` re-encoded — sections 3/3a/3b/3c cover
all four doors, and the portal sections now DERIVE their date expectations
from the clock (badge wording, finish-early day names, finished-early
strike) instead of pinning them — the harness was red at midnight the
moment the container clock walked past its fixed seed dates.

---

# v2 — the widget dedupe (owner-approved, 2026-08-27, "all of it")

## 94 widgets → 74, and the TV family dissolves
The audit (the "One widget per job" artifact) found 38 widgets that were 17
wearing two or three coats — mostly TV-prefixed big-type copies from before
`WidgetSurface` reached the wall. All 17 merges built. The survivors and
their new pencil switches:
- **Coming up** (`due-today`): `window` today/tomorrow/week (absorbs
  `week-ahead`; the wall's `tv-tomorrow` went to On site today instead —
  it read the PLANNER, not the tasks, which the audit page had blurred).
- **On site today** (`team-today`): `source` typed/planner/both + `day`
  today/tomorrow (absorbs `tv-out-today`, `tv-tomorrow`; the planner body
  is tvWidgets' exported `WhoIsOut`).
- **Stages** (`stage-legend`): `look` legend/bars (absorbs `stage-funnel`,
  `tv-stage-spread`).
- **One stage** (`count-by-stage`): `show` number/ring (absorbs
  `progress-ring`, keeping the ring's reached-share semantics).
- **Latest photos** (`recent-photos`): `look` grid/one/wall (absorbs
  `tv-photo`, `tv-photo-wall` — bodies exported from tvWidgets).
- **Calendar** (`calendar-mini`): `shade` (absorbs `tv-month` as the
  exported `MonthHeat`).
- **Wall clock** (`clock`): `hebrew` + `holiday` switches (absorbs
  `tv-clock`; `WallClock` takes flags).
- **Workspace card** (`project-glance`): unset/`'this'` now draws the LIVE
  WorkspaceCard of the current workspace (the old unset state was a "pick a
  workspace" placeholder); any other id keeps the snapshot glance. Absorbs
  `tv-workspace`.
- **Workers' load** (`tv-load`): `show` all/one + contractor picker
  (absorbs `contractor-load`).
- **Finished** (`tv-done-today`): `period` today/week (absorbs
  `tv-week-done`).
- **Target** (`weekly-goal`): `asPct` percentage-slider mode (absorbs
  `progress-bar`).
- **Nobody's booked** (`nobody-booked`): `scope` stalled/never/both
  (absorbs `tv-waiting`).
- **On site without a plan** (`no-plan`): gained the folder/plan/neither
  counts strip (absorbs `tv-drive`).
- Straight retirements: `job-search` → `job-find` (two widgets literally
  both named "Find a job"), `tv-late` → `overdue-list`, `tv-new` →
  `recent-jobs`, `tv-feed` → `activity-feed`.
tvWidgets.tsx now registers only the two survivors and EXPORTS the wall
bodies the merged board widgets borrow — it imports only TYPES from
widgets.tsx, so there is still no runtime cycle.

## The alias system — nothing migrates, nothing breaks
`src/data/widgetAliases.ts` (pure, no imports — three registries need it and
two must not import each other): retired id → survivor + a `map` translating
the old data bag into the survivor's options. The MAPPED values go first and
the stored bag spreads over them, so a setting later changed through the
pencil always wins. At the bottom of widgets.tsx every retired id is pushed
into WIDGETS as a real entry (`retired: true`) spreading its survivor and
rendering through `aliasedEl(el)` — so WIDGET_BY_ID, WidgetSurface's natural
size, renderWidget and the wall needed ZERO call-site changes, and no
Firestore echo or old backup can ever produce "Unknown widget". Rules:
- **The store shelf filters `retired`** — nothing new is placed under an
  old name; SHELF/WIDGET_PREVIEW entries for retired ids are gone.
- **`WIDGET_FIELDS[retired] = WIDGET_FIELDS[survivor]`** (by reference — the
  type/outline push loops guard on keys, so a shared array is extended
  once), and NodeSettings READS values through `aliasedEl` while WRITING to
  the raw bag: an old "Tomorrow" card's pencil shows the Window select
  already on tomorrow.
- **TV_ALLOWED lists the survivors AND the retired ids** (hardcoded there —
  importing the alias table from tvWidgets would close a cycle).
- **Deleting an absorbed def means deleting it** — the stage-funnel def was
  folded into Stages but its original entry survived, so the shelf sold it
  next to its own alias. The dedupe harness's shelf check is what caught it.

Harness: `scratchpad/dedupe.mjs` (12 checks — eight retired ids drawing
their survivors with translated settings, a survivor's new switch, the
pencil-translation, and the shelf selling none of the twenty). Its traps are
the standing ones: Frame UPPERCASES titles (match case-insensitively), and
computed font-size stays LOCAL under WidgetSurface's transform — round24's
clock check now multiplies by the render scale, and its second clock grows
in BOTH dimensions (the blink fix width-capped the row factor). storefull:
84 cards, only the standing nobody-booked false positive. tvcrash green on
the built bundle.

---

# v2 — "how many days" on every task form

## One picker, every door (`src/components/tasks/TaskDaysPicker.tsx`)
The multi-day arithmetic shipped inside the notebook's drop dialog and stayed
there, so a task made any other way could only carry one date — which read to
the owner as a PER-STAGE gap ("Geves needs days like installation has"). The
real boundary was which FORM. `TaskDaysPicker` is the shared block — count
stepper, per-stretch Friday (offered only when the run crosses one), the
non-consecutive second stretch, the green day readout — rendered by the
drawer's Add Task (`QuickAddTaskPanel`), the Tasks page's add form and
`BulkAddTaskModal`, in every workspace and at every stage. It renders nothing
until a start date is picked (a dateless task stays what it was), and
`daysFields(start, days)` is the one write: >1 day → `{ dueDate: lastDay,
days }` (the model's standing invariant), else the plain single-date task.
Reset a host's picker by bumping its `key`. All the day rules stay in
`taskDays.ts` — the picker only drives them.

## The empty-id regression this round's harness caught
`addContractorAssignment` keeps a caller-minted id (fields-last, the planner
round's fix) — and QuickAddTaskPanel passed `id: ''` as a placeholder, which
WON the spread: every task made through the drawer's quick-add stored and
synced with NO id, so editing, completing or deleting it matched nothing.
Two-sided fix: the store re-mints on a falsy id (`if (!a.id)`), and the panel
mints a real id so the record it keeps for the share button IS the stored one.

Harness: `scratchpad/taskdaysforms.mjs` (11 checks) — the Tasks page form and
the drawer's quick-add each producing a task whose `days` array and
last-day `dueDate` land in localStorage, plus the every-task-has-an-id guard.
Dates derived from the real clock (next Monday), per the standing drift rule.

---

# v2 — the TzviAir Goals embed

## The goals board is a widget (`src/components/board/GoalsWidget.tsx`)
The separate goals app at `https://tzviair-goals.vercel.app` (repo
`yitzchak-hash/Tzviair-Goals` — reference only, never modified from here) is
embedded through its OWN `widget.js`: the script is loaded once
(module-level promise, cleared on error so retry works), `mount()` puts an
auto-resizing iframe into the node, `destroy()` runs on unmount. Registered
in all four places (MORE_WIDGETS id `goals` · WIDGET_FIELDS ·
WIDGET_PREVIEW `{sample:1}` · SHELF "Counts and progress") plus TV_ALLOWED.

Rules, each load-bearing:
- **This codebase never touches `/api/goals`** — its POST replaces the whole
  goals board with no auth, so a buggy host write could wipe real data. All
  reads/writes happen inside the iframe; `interactive` is the sanctioned
  lever, and it is forced OFF wherever `WidgetCtx.readOnly` is set (the
  wall).
- **view and interactive default by SURFACE**: a dashboard copy
  (`el.board === DASHBOARD_BOARD`) opens as the compact read-only summary,
  a board copy as the full interactive grid — both overridable in the
  pencil ('' = automatic). `lang` follows `mainUiStrings.isRtl` unless set.
- The iframe mounts `transparent, header:false` — Frame draws the title and
  paints the panel; the widget's own logo row would be a box in a box.
  `onState` counters draw a small badge line over the iframe.
- `data.sample` (the shelf) draws canned tiles — no network on the store.
- A failed script load shows an honest sentence with a working retry.

## Seeded once, deleted forever
Both surfaces seed one copy as a fixture (the bins' idiom): FIXED ids
(`CE-goals-board` on the Job Board main board via `viewCentreSpot`,
`CE-goals-dash` on the dashboard grid) so a Firestore echo overwrites, and
`isTombstoned()` (now exported from store.ts) so a deleted one stays
deleted. Two traps paid for here: **StrictMode runs a seeding effect twice
in ONE commit on the same pre-add state** — without a `useRef` tried-flag
the widget seeded twice under one fixed id; and the board's landed-signal is
"the seeded bins exist", because a still-loading board and an empty one look
identical.

## The Goals page and the five styles
`/goals` (`GoalsPage.tsx`) — the whole goals website as a full page: the
interactive tile grid through the SAME `widget.js` door, the goals site's
OWN header row on, live counters, an "open the site itself" link.
**OWNER RULING (2026-08-27): there is NO sidebar tab for it.** The page is
reached by clicking any host-drawn goals figure (ring/number/bar), and the
wall gets its own door: a **Goals button on the TV bar, right of Dashboard,
a small vertical line between the two** (`data-tv-goals`), opening
`TvGoalsBoard` — module-level in TvPresentationPage (the declared-in-render
trap), mounted `interactive: false` ALWAYS: the wall never edits.
`navGoals` stays in MainUiStrings for the TV bar label.

`data.style` on the widget — one widget, the look in the pencil (the dedupe
round's own idiom): `board` · `summary` (the two iframe views) · `ring` ·
`number` · `bar`. The host-drawn three still mount the widget HIDDEN,
because `onState` is the one sanctioned channel for the counters — drawing
from a direct `/api/goals` read is exactly what the contract forbids —
and clicking a drawn figure opens `/goals`. Absent style defaults by
surface (summary on the dashboard); legacy `data.view` is read the same
way and never written again.

Harness: `scratchpad/goalswidget.mjs` (20 checks) — tzviair-goals.vercel.app
is STUBBED (no internet here): a fake `widget.js` implementing the
documented mount() API that encodes its options into the iframe URL, which
is what lets the harness read back what WE asked for. Its own trap:
Playwright consults routes NEWEST-first, so the specific `/widget.js` route
must be registered AFTER the `/widget*` page route or scripts get HTML
("Unexpected token '<'"). Live end-to-end against the real goals app needs
production eyes-on. No CSP anywhere in this app, so no header changes.


---

# v2 — the crash screen, and the corner-drag hunt

## A crash says what broke (`src/components/ui/CrashScreen.tsx`)
The owner's report was "dragging to a corner makes the site crash" — and a
React render error unmounts the whole tree, so the only witness was a white
page. `CrashScreen` is an error boundary around the entire app (App.tsx):
it shows the error's own message, the head of its stack and the component
stack, with Reload and Copy-the-details buttons, bilingual reassurance that
nothing is lost. Deliberately store-free and dependency-free — the store may
be the thing that crashed. Every future "it crashed" report becomes an
exact sentence.

## The hunt itself (unreproduced — the tools are committed)
`scratchpad/cornerdrag.mjs` / `cornerdrag2.mjs` replay HIS real board
(fetched to /tmp, never the repo) and drag tiles, nodes, the TV frame's
grip and corner, dashboard cards and widget corner-resizes into every
viewport corner with edge-auto-pan dwell — no crash under dev or the
production bundle. Noted on the way: the TV dashboard's add-widget writes
`z: Date.now()` (the giant timestamp z values on his elements — harmless,
TvDashboard only sorts by z). If the crash recurs, the CrashScreen's copied
text is the next step.


---

# v2 — the dead-sidebar hunt (round 2) and NAV WATCH

The owner's refined report: the sidebar links REACT (address moves) but the
page does not change, on the Job Board workspace, on his machine only. Ruled
out by experiment against his real board: element coverage (elementFromPoint
sweeps), a standing invisible backdrop (interaction sweeps with cleanup),
and React Router v7 transition STARVATION — `scratchpad/navstarve.mjs`
injects presence-peer churn at up to 60Hz during a sidebar click and the
navigation still commits.

Two things shipped from the round:
- **The TV sidebar tab is Job Board-only** (`isGeneral` gate in
  `useNavItems`) — one wall, one door, per the owner.
- **NAV WATCH** (`AppLayout`): open the site with `?debugnav=1` and every
  in-app link click is watched — if 1.5s later the address has not moved, a
  red banner paints the facts (target, where the click landed, the history
  stamp, fullscreen state, recent page errors). Zero cost without the flag.
  `scratchpad/navwatch.mjs` proves silent-when-working, loud-when-blocked,
  absent-without-flag. The next report of dead buttons starts from that
  banner's photograph, not from a guess.
---

# v2 — the Flip and the iPad round

## The portal opens on the workspace his work is IN
The real fault the device audit surfaced: which workspace the portal opens
on is whatever `active_project` the browser last held — on a worker's phone,
a default nobody chose. A worker whose jobs live in Netiv or on the Job
Board opened onto Wolfson, saw "No tasks yet", and — without the
switchProject permission — had no way to reach his own work at all. Three
pieces in `ContractorPortal`:
- it hydrates the OTHER workspaces' snapshots on mount
  (`ensureProjectSnapshot`, the AppLayout idiom) — without them it cannot
  even know where his work is;
- `myProjects` subscribes to `snapshotTick` (the standing rule for every
  snapshot consumer), or a hydrated snapshot landing changes nothing;
- once per visit, when the open workspace holds NONE of his tasks and
  another holds some, it switches there (most open tasks wins) — decided on
  a 1600ms settle timer (the seeded-bins idiom: "he has nothing here" and
  "nothing has loaded yet" look identical at first, and data arriving
  restarts the clock). The guard trips the moment a workspace with his work
  is on screen, so his own later switch is never fought.
Harness: `scratchpad/portalswitch.mjs` — stands in the Job Board through the
real header dropdown, opens the worker's link, and the six Wolfson tasks
must appear by themselves.

## The sweep takes any shape now
`shots.mjs` accepts `H` beside `W` (defaults unchanged): the Galaxy Z Flip
unfolded is `W=344` (portrait) and `VIEW=landscape W=882 H=344`; an iPad is
`W=768 H=1024` / `VIEW=landscape W=1024 H=768`. All four measured clean —
344 is where `overflow-wrap` legitimately starts breaking the longest
family names mid-word, which is the correct last resort, not a fault.

## `scratchpad/ipadcheck.mjs` — the desktop layout driven by a finger
An iPad gets the DESKTOP layout, so the phone sweeps never covered it. The
harness arms genuine touch emulation (setTouchEmulationEnabled +
setEmitTouchEventsForMouse AFTER navigation — the markupfixes lesson) and
asserts: `any-hover: none` is live and hover-revealed controls are visible
at rest, a finger tap opens an apartment and gets the desktop modal, a
finger drag from a tile pans the board and leaves the job in place, a
finger can open a job, and at 768 portrait (exactly ON the md line) the
desktop sidebar shows with no phone bottom bar. Its own re-paid trap: tap
the MIDDLE of a tile — the top strip is buttons, always visible under
touch, so a press up there is a button press.

## Three harness rots fixed while auditing (each had made a check vacuous)
- `seed.mjs` dates are offsets from the REAL clock, never a fixed base — the
  pinned 2026-08-16 drifted past and the portal's Today filter showed
  nothing, so every tap at a task card timed out (the standing date-drift
  trap, now fixed at the seed instead of per-harness).
- The seed worker carries `perms: { seeDiagrams, seeAllApartments }` — the
  default contractor level has neither, so the portal's Building Map tab was
  never drawn and every map assertion silently measured the tasks list.
- `shots.mjs` drawer-tab taps match the Hebrew labels too, and portal-task
  presses the All pill first (unscoped — the filter row sits OUTSIDE
  `<main>`, and a `main`-scoped locator never matched).

## The Z Fold: three screens, one phone — nothing needed fixing
Audited 2026-08-27, all clean: the cover screen IS the Flip's size (344x882,
covered by that sweep); the classic Fold's inner screen (690x829) stays
UNDER the md line — the phone layout with room to breathe — and crosses it
when turned sideways (829x690, desktop); the newest Fold's inner screen
(820x910 / 910x820) is past md BOTH ways, so it is desktop even upright.
`scratchpad/foldswap.mjs` is the Fold's own test: the viewport changes size
under the RUNNING app (closed → open → sideways → closed), asserting the
chrome swaps live, an open drawer reshapes desktop-modal ↔ phone-sheet
mid-look, the portal survives an unfold, and no page errors fire. usePhone's
matchMedia listener is what makes this work — anything that caches "am I a
phone" at mount instead of subscribing will break on a Fold first.

## The drawer's plan pane fits the screen it is on (the Fold screenshot fix)
The pane was sized to the SHEET alone (`paneH × ratio`) beside a fixed 560px
fields column, so on anything narrower than a big monitor the row laid itself
out past the modal's clipped 96vw edge and the plan showed only its left
half — the owner's unfolded-Fold screenshot (2026-08-27). Three rules now:
- `planW` caps at what the screen LEAVES beside the fields
  (`96vw − 560`), and when that cap bites the modal gives back the height
  the sheet no longer needs (floor 640px) so the plan sits in a smaller
  square instead of floating in a tall empty pane.
- The pane carries `minWidth: 0` — a flex item refuses to shrink below its
  content's min-width by default, and canvases have one.
- **PlanAnnotator re-fits from a ResizeObserver on its own STAGE**, replacing
  the window-resize listener: the pane narrowing when the measured sheet
  ratio lands (or the cap bites) is a resize the window never sees, and an
  already-fitted sheet stayed wider than its pane. Damped 3px; the phone
  keyboard/address-bar rule (height changes alone never re-fit while
  compact) is preserved.
Harness: `scratchpad/folddrawer.mjs` — five widths from 1092 to 1920, the
sheet, the modal and the Download button must all fit. `scratchpad/gallery.mjs`
captures the drawer/diagram/board/portal at every device profile for the
owner's Device Gallery artifact. All four iPad Pro shapes (834x1194 /
1194x834 / 1024x1366 / 1366x1024) swept clean.

## The Device Gallery is a standing working method
`.claude/skills/device-gallery/SKILL.md` is the method: ONE artifact page of
real screenshots of the running app on every device (newest iPhone, newest
Galaxy, Flip, the Fold's three screens, every iPad, the office PC), captured
by `scratchpad/gallery.mjs`, republished to the SAME link on every UI round —
and the page takes the owner's pinned change notes (tap a spot, type or
dictate, Send to Claude saves them INTO the artifact via the `artifact`
capability). When the owner says to check his gallery notes, READ the
artifact and work the pins. `docs/DEVICE-GALLERY-PROMPT.md` is the portable
version for other projects. The newest-phone sweeps: iPhone 17 Pro is
`W=402 H=874`, Galaxy S25 Ultra `W=384 H=832` — both clean 2026-08-27.

---

# v2 — the plan download, asked in two questions

## What was broken
Download was two buttons and neither answered the real question. **PDF only
worked once somebody had SAVED a marked-up version to Drive** — it opened
`drive.google.com/uc?export=download&id=…` for `versions[0]`, so on an
ordinary plan (nobody had marked it up) it did nothing but toast an
apology: the owner's "download pdf doesn't work anywhere". **Pictures**
always burnt the drawings in with no way to say otherwise, and left the
snag PINS out of the file completely. Every word of the sheet was hardcoded
English, as was the many-pages `window.confirm`.

## The shape now
`Download` opens ONE sheet that walks two questions, in the order somebody
actually thinks in: **what goes in it** (with the markings / just the plan),
then **what kind of file** (PDF / pictures), then — only for a set past
`BULK_LIMIT` — how much of it. Every string comes from `MainUiStrings`
(`dlTitle` … `dlPagesThis`, both presets), so the sheet is Hebrew when the
app is.

`src/data/planExport.ts` is the mechanism, and all four answers are made
**in the browser from bytes it already has** (planCache) — no Drive, no
upload backend, nothing to save first, works on a train:

| | PDF | Pictures |
|---|---|---|
| clean | the ORIGINAL file, byte for byte | pages rendered plain → PNG |
| with markings | pages rendered with ink + pins → embedded in a PDF (pdf-lib) | the same, as PNG |

Rules worth keeping:
- **The clean PDF is never re-rendered** — it is the architect's own file,
  so it keeps its vector text and its own layers. The harness asserts the
  byte count matches the original exactly.
- **The marked PDF is FLATTENED, and that is deliberate.** The LAYERED
  vector one — markup on a switchable OCG — is `api/plan-annotate.js` and is
  what Save files into Annotated Plans. A download is "give me a file to
  send someone now"; it must not depend on the server being reachable.
- **Pins are drawn on the FIRST exported page only.** A `PlanPin` is
  anchored to the apartment, not to a page (that is how the overlay draws
  it), so repeating them on every page would invent snags that do not exist.
  `drawPins` reproduces the overlay's geometry — the point is at
  `xPct/yPct`, the numbered circle sits ABOVE it on a short stem — or an
  exported plan would mark a different spot from the one on screen.
- **`exportScale` caps the canvas** (long edge ~2400px, area 24 MP). An A0
  sheet at a naive scale asks for a hundred million pixels, the allocation is
  refused, and that shows up as a BLANK page rather than an error.
- **The filename is set on our own anchor, not through file-saver.** That
  library dispatches its own synthetic MouseEvent and the name never
  survived: every plan arrived called "download".
- **Several files from one press are spaced 350ms apart** — a browser drops
  a burst of automatic downloads silently.

## Print asks the same question, and means the same thing by it
`print(withMarkup, pages)` runs off the SAME sheet: pressing Print opens it
at the first question and, because paper IS the format, goes straight to the
paper once answered (no second question; the pages question still appears for
a set past `BULK_LIMIT`, and Back from it returns to `what` rather than to a
format step that was never shown). "With the markings" therefore means the
same on paper as in a file — the ink AND the pins — or the two exports would
disagree about what a marking is. `Ctrl/⌘+P` goes through the same door, so
the keyboard and the button can never print different things. The sheet's
header, its two toasts and the Print label all come from the strings object
now, and the interpolated plan name is run through `printEsc`.

## Escape backs out of the PLAN, not the apartment behind it
The annotator's keydown moved to the **capture** phase and stops the key
when it consumed it. The drawer hosting the plan pane has its own Escape on
window, registered first, so closing the download sheet used to close the
whole apartment in the same press.

Harness: `scratchpad/plandownload.mjs` (14 checks) — a real 2-page PDF via
pdf-lib on `/api/drive-fetch` (the planphone precedent), two seeded pins,
all four answers driven through the real sheet, the clean PDF's byte count
against the original, the marked picture proven heavier than the clean one
(the pins landed), and the sheet in Hebrew. Two traps it paid for: a
`waitForEvent('download')` armed AFTER the click misses the clean PDF, which
is handed over in a millisecond and reads as "no file arrived"; and
Playwright reports a blob download's `suggestedFilename()` as "download"
whatever the anchor says, so the honest measurement is the value assigned to
the `download` attribute.

---

# v2 — the job window round (days on a task, the worker on a stage, a nameless history entry)

## A history entry with no name crashed the whole tab
`ActivitySection` rendered `log.userName.charAt(0)` for the avatar. `fsSet`
turns an `undefined` value into a `deleteField()`, so an activity log written
with no `userName` — which is what `addContractorAssignment` produced for a
task created without a `createdByName` — came back from Firestore with the
field GONE, and the History tab threw `Cannot read properties of undefined
(reading 'charAt')`, taking the drawer down with it. Two-sided fix, and both
sides are the rule:
- **The writer always supplies a name**: `a.createdByName || currentUser?.name
  || 'Office'`. A log line nobody can attribute is not a log line.
- **The reader never trusts a stored optional**: `const who = log.userName ||
  s.unknownUser` (a real MainUiStrings key in both presets, not a hardcoded
  word). Any field that has ever been optional can arrive absent from an old
  record, and a render that assumes otherwise is one deleted field from a
  white screen.

## The task editor opens on the START day, never the due date
`dueDate` is pinned to the LAST day by the multi-day model, so seeding the
editor's date box from it shifted a three-day run three days forward the
moment somebody opened it to look. `startTaskEdit` seeds from
`daysOf(task)[0]`; `saveTaskEdit` writes `...daysFields(dueDate, days)`, which
re-pins the due date. Anything that EDITS a dated task reads the start; only
sorting, badges and "late" read `dueDate`.

## A saved day list reads back into the picker's boxes
`stretchesFromDays(days)` in `taskDays.ts` — pure, tested offline. The picker's
controls are "how many days, from here"; a task on disk is a list of dates, so
opening one for editing has to work out what to put in the boxes or the editor
shows "1 day" over a task covering three and saving throws two away. It takes
the longest working run that is a PREFIX of the list (no-Friday tried first,
since that is the default) and hands the remainder to the second stretch; a
list nobody could have built from two stretches reports `exact: false` and the
caller keeps the stored days until something is actually changed.
`TaskDaysPicker` gained `initialDays` and is reset by bumping its `key`.
The drawer's Tasks tab also shows a `data-task-days-chip` ("3 days") on the
card itself, so the day count is visible without opening the editor.

## Reading a stage's worker forgives; writing one does not
The drawer's stage notes said "assigned a worker: none" while somebody was
plainly working that stage — the lookup demanded an OPEN task carrying that
exact `stageId`, which a task created before the stage was picked never has.
Split in two:
- `getAssignment` (DISPLAY) falls back: open-on-this-stage → any-on-this-stage
  → an open task with no stage at all, and that last one only when the
  apartment's `currentStageId` IS this stage.
- `stagedAssignment` (WRITE, used by `handleContractorChange`) stays strict, so
  changing the worker on one stage can never silently re-point a task that
  belongs to another.
A forgiving read and a strict write are two different questions; one function
answering both is how a display fix becomes a data bug.

## The day dialog says what will happen, and nothing else
Per the owner: the renumbering explainer is gone (day numbers are labels
derived from calendar order — saying so out loud helps nobody mid-drag), and
both new-task choices read "A completely separate task on Friday 28 August" —
the real day, from `dayName()` in `PlannerWidget`, passed in as `toDay`.

Harness: `scratchpad/drawerround.mjs` (8 checks) — the dialog's wording and
named day, the days chip, the editor opening on the run's real start with the
right readout, the stage's worker showing, and a nameless log rendering
instead of crashing.

---

# v2 — the UI round (the 11 sealed decisions, built)

The specification is `docs/UI-BUILD-LIST.md` — eleven decisions the owner
approved one at a time (sealed 2026-08-30), fifteen numbered changes. The
design is sealed: do not "improve" these.

## Two thresholds, deliberately different
- **800px of screen decides where the PLAN sits** (`planWide` in the drawer,
  a subscribed `useMedia('(min-width: 800px)')`): above it the plan is a side
  pane beside the details, below it a Plan tab. `usePhone` no longer gates
  any of this — an upright iPad (768) gets the tab, a sideways Fold (829)
  the side pane.
- **900px decides the DIAGRAM** (`useNarrow()` in ProjectDiagramPage + the
  `diag` Tailwind screen): below it one building at a time behind big tabs,
  the Filters button, and the `StageBar`; at 900+ the desktop toolbar is
  untouched. On a sideways Fold both are true at once — plan beside details
  AND one building. That is correct, not a bug.
- `useMedia(query)` in `src/data/usePhone.ts` is the shared subscribed width
  test — never cache a matchMedia at mount (the Fold rule).

## New pieces
- **`src/components/diagram/StageBar.tsx`** — the whole project as one bar:
  a flex segment per stage sized by count, count written inside only when
  the measured segment can hold it, tap toggles the page's stage filter, a
  grey unpressable block keeps not-started units in the picture. Counts go
  through `isCountableApartment` and NOTHING else. It replaces (below 900)
  the stage bubbles and the bare-number strip; both survive untouched at
  900+.
- **`src/components/tasks/TaskThread.tsx`** — the task as a conversation,
  ONE drawing used by the worker's portal (THIS TASK section) and the
  office's drawer (under each task card, bubbles capped 640px). Office
  left/white with the author name in accent, worker right/blue. Files are
  press-to-download cards through `/api/drive-fetch` (never a
  drive.google.com link); photos expand to a portalled lightbox (the drawer
  panel carries a transform, so the lightbox must portal to body). The
  "Job closed · time" marker is DERIVED from `assignment.completedAt`,
  never stored; later messages render below it — the conversation stays
  open, and nothing in it is ever edited or deleted.
- **`ContractorNote.photoIds?: string[]`** — the round's ONLY new field:
  the closing comment's photos, riding `contractorNotes` (already in
  persist/export/import/sync, so the backup trio needed no new entry).

## The worker's flow now
- ONE Close job button (the sticky footer); the old empty-media green
  button is gone. A closed task shows a static "Job closed · time" in the
  footer instead of the button — the composer above stays live.
- **The closing screen is `fixed inset-0`** (`data-closing-panel`): navy
  header with back arrow + apartment name; the add-media button with its
  `data-close-count` pill; ONE comment box with the paperclip and
  microphone INSIDE it (the General-notes idiom); footer = Send and close
  (`data-close-now`). The finish-early ask renders INSIDE this surface.
  `handleConfirmComplete` also does `setClosing(false)` — without it a
  later Undo re-opens the surface. The picture rule names
  `MIN_CLOSE_MEDIA` via the `addPicturesRule` string ({n} placeholder) and
  follows `contractor.photosOptional` — an optional-photos worker sees no
  line, no counter, and is never locked out.
- `postClosingNote()` writes the ONE closing note (comment may be empty;
  with nothing at all to say no empty bubble is minted — the marker alone
  records the close). It runs on the final press AND on finish-early Yes.
- The portal's plan Download fetches bytes through `fetchPlanBytes`
  (`/api/drive-fetch`) and saves via `saveBytes` — sniffs pdf/png/jpg.
- Priority pills lost their boxes: a dot and the word, every priority.

## Traps this round paid for
- The plan tab strip renders ONLY when `!readOnly && !embedded` — that one
  condition is every preview (drawer pane, phone Plan tab, wallboard,
  portal). The picker's open-in-new-tab rows are gated the same way: no
  visible strip, no third door.
- `.fade-clip` (index.css, mirrored under RTL) fades text behind a box's
  edge — the Drive/Zoho pair never stacks and never pushes its column
  (LinkField's EMPTY state was the culprit: a bare text-node placeholder
  set the button's min-content width). The sweep's clip detector exempts
  `fade-clip` like `truncate`.
- `portalround.mjs` seeds its task dueDate from the REAL clock now — the
  fixed '2026-08-24' went red the week after it was written (the standing
  date-drift trap, again).
- `plantabs.mjs` re-encoded to decision 2 (pane strip gone, tabs live in
  the studio); its slow-plan stub is one-shot and long enough to survive
  the walk into the studio.

---

# v2 — the touchscreen round (pinch rebuilt, trash-not-delete, the TV bar behind one ⋯)

## The pinch is ABSOLUTE, anchored at the first-touch centre
`useTouchGestures` hands the consumer a GESTURE, not increments:
`onGestureStart(cx, cy)` (snapshot the zoom and pan, stand the single-finger
pan down), `onGesture(scale, dx, dy)` — scale and midpoint travel SINCE THE
START — and `onGestureEnd`. The board derives every frame from the snapshot:
the world point under the first-touch centre stays under it, the midpoint's
travel pans on top. The old version fed per-frame ratios anchored at a
drifting midpoint AND panned by the midpoint delta (double-counting), fought
the single-finger pointer pan finger one had already started, and called
setPan inside the setZoom updater — an impure updater that under a pinch
storm is a maximum-update-depth (#185) crash in waiting. That crash, the
dead sidebar and "buttons don't work" were one stale tab running the old
bundle through a deploy — reproduce reports against the CURRENT build with
`scratchpad/hisboard-crash.mjs` (his real board via `fetch-his.mjs` in the
/tmp scratchpad; real data never enters the repo) before hunting.
`touchpan.mjs` is ALL GREEN now and guards the pinch — its standing red was
the harness measuring `[data-board-world]`'s own transform, which is NONE:
the transform lives on the PARENT (the documented grouplock lesson, paid
again by the harness that documented it).

## Deleting a job on the board FILES IT INTO TRASH (owner, 2026-08-30)
`handleDeleteJobs` = `fileInBin(ids, 'trash')`: the menu row says "Move to
Trash", the Delete key does the same, there is NO confirm (a trip to Trash
is reversible) and the scary modal is gone. `deleteApartment` — the
permanent cascade — is reachable only from the Trash window's own "Delete
forever" and the drawer's danger zone. Never put a destroying delete back
on the board.

## Context menus clamp by their REAL size
The board menu's wrapper measures itself in a callback ref and clamps into
the viewport (`maxHeight: calc(100vh - 16px)`, overflow-y auto). The old
fixed 300px guess let the 600px job menu run off the bottom exactly when a
tile near the bottom edge was right-clicked.

## A finger DRAG over a widget button pans the board
`deferredPan` in GeneralJobsPage: a finger press on `a,button` inside the
viewport (not `data-no-drag`/`data-el-action`/text fields — those own their
gestures) is WATCHED, not captured. Past 10px of slop the board takes the
pointer mid-gesture (capture on the viewport, one click swallowed in the
capture phase); a clean tap never notices. Most of a widget's surface is
button rows, so without this a finger dragged across a widget went nowhere.
The pinch's onGestureStart clears the watch.

## The TV bar: views left, one ⋯ menu right (owner, 2026-08-30)
Workspace views + Dashboard + Goals stay on the LEFT; Full screen stays on
the bar; everything that sets the screen up — zoom −/%/+, button size, About
this screen, the PX test pattern, the arrange pen — lives behind `[data-tv-more]`,
a ⋯ button sitting just before the overdue pill. Its dropdown is
`[data-tv-more-menu]`; harnesses that press zoom/PX must open the menu first
(tvsize.mjs shows the manner).

## The TV diagram FITS, aspect intact
The building view no longer draws at `zoom: autoScale×boost` with columns
flexing to the panel (two buildings stretched into wide flat cells; the
picture sat tiny while the bar's buttons stayed normal). Columns get a fixed
620px width, the natural size is measured (ResizeObserver pair, damped), and
the zoom is `fit × boost` — at 100% the whole project fills the panel. The
scroller stays INSIDE the zoom (the sticky building-bar rule) and the sheet
centres by `m-auto` (the planzoom flex-overflow rule).

## The region picker draws the JOB BOARD wherever you stand
`TvSettings` reads the general workspace's jobs and elements from the live
store only when it IS the open workspace, else from `loadProjectSnapshot('general')`
(subscribed to `snapshotTick`). The live store holds only the open
workspace, so configuring the TV from Wolfson drew an empty white sheet
under the green frame.

## The month heat map is a ramp of the company blue
`MonthHeat` shades days by interpolating `#e3f2fb → #1e3a5f` as SOLID
computed colors, with a weekday-initials row and hairline empty days — the
old quarter-strength translucent amber over white read as dirty. Ink flips
white past half strength; today keeps the accent ring.

---

# v2 — the dead-buttons round (urgent navigation, and the TV opens the real job window)

## NAVIGATION IS URGENT AGAIN — the one cause behind every dead button
react-router v7 wraps EVERY navigation state update in `React.startTransition`
with no opt-out (v6 did not), and a transition render is restarted from
scratch by any urgent update. This app ticks — countdown widgets at 1s, wall
clocks, photo walls, presence cursors — so on a machine where rendering the
Job Board takes longer than the gap between ticks the router's render never
finishes: the URL moves (history is written synchronously) and the screen
does not. That is the office's "the sidebar buttons don't work, only refresh
works" AND the TV bar's dead buttons — on the TV every dead button went
through `setSearchParams` (a router transition) while the two that kept
working (full screen, the overdue pill) are plain component state, which is
the fingerprint to recognise this disease by.

**The fix**: the `router-urgent-nav` plugin in `vite.config.ts` resolves
`'react'` to `src/shims/react-inline-transition.js` ONLY for react-router's
own imports; the shim re-exports the real React with a `startTransition`
that runs its callback inline. Navigation is an ordinary urgent update again
— v6's behaviour, which this app shipped on for months. Rules that were paid
for:
- The shim is a **.js file with EXPLICIT per-name re-exports**, not
  `export * from 'react'`: `@types/react` is an `export =` module tsc
  refuses to star-export, and in dev Vite serves react as a CJS facade whose
  only ESM export is `default` — a star re-export delivers nothing and
  react-router dies on "React.createContext is not a function". The
  default/namespace pick (`ReactDefault.createContext ? ReactDefault :
  ReactStar`) handles dev and the built bundle alike.
- `optimizeDeps.exclude: ['react-router', 'react-router-dom']` or the
  prebundle resolves react past the plugin in dev — and then
  `include: ['react-router > cookie', 'react-router > set-cookie-parser']`
  or its CJS sub-deps lose their ESM interop and throw.
- No route here is lazy and none has a loader, so there is nothing for a
  transition to keep interactive during. If a lazy route is ever added, its
  Suspense fallback will flash on navigation — decide then, knowingly.

`scratchpad/urgentnav.mjs` is the guard. Its signature check: with the shim,
a sidebar click swaps the DOM **by the end of the click's own microtask
queue** (urgent; no timer can get in ahead of a microtask) — without it the
swap waits on the scheduler's macrotask and can be starved. Measured both
ways before encoding. It also drives a navigation under 10× CPU throttle
plus presence churn.

## OWNER RULING (2026-08-30): the TV opens the REAL job window
The wall-only job screen (plan two-thirds, photo carousel, "Back to board")
is DELETED — "a job screen I never want to see. I want to see exactly the
job drawer that I would see on a PC." Tapping a job anywhere on the wall —
a tile, a diagram cell, a group row, a widget list row, the overdue pill's
list — opens the real `ApartmentDetailDrawer` over the wall, edits included
(this supersedes "always read-only" for the job window, by his ruling).
Wiring rules:
- `openJobId` (an id, never the record — the standing live re-resolve rule);
  the drawer, `QuickAddTaskPanel` and `Toast` render as SIBLINGS of the
  frame, OUTSIDE the dpr `zoom` compensation — a fixed modal inside a zoomed
  subtree scales past a dpr<1 panel's height and its bottom is unreachable.
- Writes are attributed to the first active admin (`tvUser`) — the TV has no
  login, and a nameless log entry is the crash the drawerround already paid
  for.
- `wallCtx.openUnit` TRAVELS now (the 2026-08-26 reversal reaches the wall):
  a foreign unit sets the view param and a `pendingOpenRef` opens it when
  that workspace's apartments land. The old `openUnit: () => {}` stub is
  gone from the wall (the portal keeps its no-ops).
- The board view's widgets render through `renderWidget(el, wallCtx)` — they
  carried an inline ctx with `openJob: () => {}`, so every widget tap on the
  wall's board view did nothing.

## A READ-ONLY planner card still opens on a click
`PlannerCard`'s `openHandlers` were gated on `openOnly` (projections), so a
read-only planner — the TV wall, a view-only board — rendered its job cards
with NO handler at all: the owner's "I press an apartment inside the
notebook… nothing is clicking". Any job card now opens on click whenever the
drag handlers are not installed; hosts whose taps must stay inert (the
worker's portal) pass no-op `openJob`/`openUnit`, which is where that gate
belongs.

Harness: `scratchpad/tvdrawer.mjs` (tile→real drawer, old screen gone,
Escape, foreign notebook card switches the wall's view and opens the unit,
bar alive afterwards). `round29.mjs` re-encoded: closing a drawer opened by
cross-workspace travel redeems the RETURN TICKET by itself — its manual
walk-home through the header was asserting a journey the app no longer
needs (pre-existing rot, failed identically with this diff stashed).

## The pinch-time #185: a widget that measured itself in circles
The owner's crash mid-pinch on the live build — minified React #185, stack
landing in ProjectMini (the Building-progress miniature). The defect: its
`units` was a bare `.filter()` (a NEW array identity every render), so the
`byBuilding` memo re-made its array every render, and the measure effect
keyed on `[byBuilding]` re-ran on EVERY render and unconditionally wrote a
fresh `{w,h}` object into state — render → effect → setState → render,
forever, whenever the workspace snapshot behind the widget exists (with no
snapshot the empty branch renders and the grid never mounts, which is why
it hid). Passive effects yield between cycles, so it only SMOULDERED —
measured: an idle board with the widget burnt **854ms of script per second**
(a whole core, 69 style recalcs/s), which is also what made machines slow
enough for the router-transition starvation to bite; the two diseases fed
each other. A pinch is a storm of discrete touch events, React flushes
pending passive effects synchronously on each one, the cascade goes
synchronous, and the 50-update ceiling throws.

The fix is both halves of the standing measurement rule, and BOTH are
load-bearing: memoise the arrays feeding a measure effect's deps, AND damp
the write (`setCellBox(prev => unchanged ? prev : next)` — returning the
previous object lets React bail). Audited every `new ResizeObserver` in the
app: ProjectMini was the only site combining unstable effect deps with an
undamped fresh-object write.

Harness: `scratchpad/pinch185.mjs` — a real two-finger pinch storm through
CDP touch events over a board carrying the widget (with a Wolfson snapshot
seeded, or the loop never engages), then THE SMOULDER METER: CDP
Performance metrics while the page sits idle. The crash itself needs
production's scheduling and does not reproduce in dev — the idle churn is
the non-vacuous anchor (pre-fix 834ms/s script FAILS it; fixed 13ms/s
passes). When hunting any "app is mysteriously slow" report, run that meter
first.

## The three standing audits born of the dead-buttons day
Run after any change to a measuring component, and after ANY dependency
bump touching react / react-dom / react-router / vite:
- **`scratchpad/loopaudit.mjs`** — static, offline, instant. Rule 1: every
  setState reachable from a ResizeObserver callback that writes an OBJECT
  literal must be the damped functional form (`set(prev => unchanged ? prev
  : next)`); scalars self-damp via Object.is and pass. No excuse list for
  rule 1 — the damped form costs two lines, so every RO write in the app is
  now damped, uniformly. Rule 2: an effect that calls setState must not
  depend on an array rebuilt bare every render (the #185 recipe); findings
  are fixed or excused in the file with a reason, stale excuses fail.
  Its own traps, paid for: a named RO callback must be read INCLUDING its
  declaration text (a braceless arrow puts the setState before the first
  brace), and chains ending in `.length`/`.some(`/`.includes(` are scalars,
  not identity traps.
- **`scratchpad/navaudit.mjs`** — static, offline. Holds the urgent-nav fix
  against tomorrow's upgrade: the vite plugin is wired, the shim re-exports
  EVERY export of the INSTALLED react (compared live — a React upgrade that
  adds an export react-router needs would otherwise leave a silent hole),
  react-router still imports bare 'react' and still calls startTransition,
  and every react-router dependency is on the optimizeDeps include list
  (the `cookie` lesson).
- **`scratchpad/smoulder.mjs`** — runtime. Seeds one of every widget WITH
  real data behind them (a data-gated loop never engages on an empty seed —
  the ProjectMini lesson) plus a Wolfson snapshot, then measures idle CPU
  on thirteen screens via CDP Performance metrics. The verdict reads SCRIPT
  TIME first — a render loop's true signature (the real one burnt 830ms/s;
  healthy screens 0-90) — because style recalcs alone are a decorative
  infinite CSS pulse (the TV board idles at 60 recalc/s and 2ms/s script,
  harmlessly). Verified non-vacuous: the pre-fix DashWidgets fails it at
  783ms/s. When any "the app is mysteriously slow" report arrives, run
  this first.
Alongside them: every ResizeObserver write in the app (BinBoard's overview,
TvViewPage, TikTokWidget, MapWidget, TvDashboard's Card) now uses the damped
functional form, so the loopaudit's rule 1 holds with zero exceptions.

---

# v2 — the touchscreen-TV round (2026-08-31): the wall behaves like a place you work

## The TV's return ticket
`wallReturnRef` in TvPresentationPage — the wall's copy of `unitTravel`'s
rule: tapping a foreign unit (a Building Progress cell, a notebook card, a
unit card) sets the ticket BEFORE `setView`, and the job window's close
redeems it only when the job being closed is the one the travel opened —
back to the view the tap was made from ("when I click X to exit the job
workspace, it doesn't go back to the job board"). A view picked from the
bar goes through `pickView`, which tears the ticket up.

## The overdue pill works on every view
`wallListPopup` is shared JSX rendered in ALL FOUR view returns. It used to
live only in the board view's return, so on the diagram, dashboard and
goals screens the pill set state nothing drew — a dead button. Closing the
list (or the job window a row opens) changes no view.

## OWNER RULING (2026-08-31): the wall EDITS GOALS
Supersedes "the wall never edits" for the goals surface, same as the job
window before it: the TV is his touchscreen. `TvGoalsBoard` mounts
`interactive: true`, and `GoalsWidget`'s `interactive` is deliberately NOT
gated on `c.readOnly` — a goal edit is not a board edit, it goes to the
goals app (the tap-in punch rule). The goals VIEW lays out at a fixed
`GOALS_DESIGN_W` (1120) and is zoomed to fill the panel — a fluid width
would add columns instead of growing the tiles.

## The diagram view: the fit is the FLOOR, and the columns are FIXED
`diagZoom = fit × max(1, boost)` — a display size under 100% used to
multiply straight into the fit and shrink the whole project into a corner
of the panel. Below the fit there is nothing but blank wall (the plan
viewer's own rule). And `BuildingDiagram` gained `fixedColW`: the TV passes
`DIAG_COL_W` so every column is exactly that wide — the natural-size
arithmetic assumed it while the columns still FLEXED, which is what let
live boards draw unequal, stretched buildings.

## Widgets that grow their type, not just their box
- `CalcWidget` measures its own height (damped RO) and scales display and
  key fonts by `boxH/165` — WidgetSurface scales with WIDTH only, so a tall
  calculator kept 11px keys ("the numbers are way too small on our TV").
- `WhoIsOut` rows wrap and the list scrolls (`widget-scroll`) — `truncate`
  cut every job name on the wall's Tomorrow widget.
- `TapInBoard` type follows the SMALLER of tile height and width (height
  alone gave 37px names truncated to one letter on a two-person board), and
  never draws more columns than people. Tiles wear the company navy
  gradient when clocked in, the person's colour as a dot; punch messages
  carry real dates via `niceDay()` in timeClock.ts.
- Weather type bumped ~20% across the card.

## The map obeys the render scale
`localScale()` in MapWidget (rect ÷ clientWidth — the ScreenReport idiom):
wheel-zoom anchors and drag deltas divide by it. Raw `clientX - r.left`
was wrong at any WidgetSurface scale but 1, which is why the wheel did not
zoom to the mouse on a resized map.

## The plan pinch is ABSOLUTE (the board's fix, applied)
The pinch in PlanAnnotator snapshots ONE sheet fraction at touch-down and
derives every frame's scale and scroll from that snapshot: the sheet point
under the first-touch centre stays under the fingers (probe: 1px max
drift), the midpoint's travel is the pan, and an inline `applyAnchor` keeps
a CLAMPED pinch panning without waiting a render. The old per-frame
re-anchoring read rects a render stale and fought its own scroll writes —
the jump. A gesture ending on an already-tidy scale clears the anchor, or
the next button-zoom would jump to the pinch's midpoint.

## The plan reads its address AND phone, quietly
`planAddress.ts`: every Hebrew line is tried in both run orders and both
character orders (`fixVisual` keeps digit/Latin runs forwards), and the
variant matching the pattern is believed — the "reads the Hebrew very
gibberish" fix. Phone/fax lines can never be address candidates (the
"pulling it from the phone number" fix); a labelled Tel/נייד beats a bare
number; fax is refused. `PlanAddressSuggest` takes `kind: 'address' |
'phone'` and draws ONE quiet row under each field — "On the plan: <value>",
the eye (cutout), a small blue plus that writes it. No standing read
button, no failure sentences: a sheet that gave nothing shows nothing.
Both rows cost one read (cached + de-duplicated).

## The notebook keeps its record
- A COMPLETED task's chip stays on the notebook, struck through and
  dimmed, saying "done" — closing a task used to make the chip vanish,
  which read as the work being REMOVED ("if it's done, it's crossed off").
- `PlannerHost` resolves cards against jobs INCLUDING the binned ones —
  `c.jobs` excludes Done/Ready/Archive/Trash, right for counting widgets
  and exactly wrong here: a job filed into Done drew its card as
  "(job removed)". Nothing was removed; the lookup list was too narrow.

## TikTok
`volume_control=0` on the player address — its own volume control
navigated to tiktok.com instead of changing the sound. The widget's sound
button stays the one control; on a player that never said ready it falls
back to the remount-with-new-mute path (the play button's own fallback).
Still unverifiable end-to-end from this container (no internet).

Probes: `tvround-probe` (overdue on the diagram view, unit-card travel +
return ticket) · `widgetsround-probe` (calculator scale, tap-in, done
chip) · `planphone-probe` (phone row, fixVisual) · `planpinch-probe`
(CDP two-finger pinch, drift ≤ 1px) · `tvdiag-probe` (fit floor at
scale=0.7). planaddr, tvcrash (built bundle), loopaudit, navaudit,
backupaudit all green.

## The refresh button and the search tile (same day, owner's asks)
- **The TV bar has a refresh button** (`data-tv-refresh`, RefreshCw), left of
  the ⋯ menu: one press runs `window.location.reload()` — how a wall panel
  picks up a fresh deploy without hunting for browser chrome.
- **`search-tile`** (`SearchTileWidget.tsx`, shelf "Finding and following",
  natural 210×210, TV_ALLOWED): the walk-up-and-press search — the company
  mark, a huge magnifying glass, and a portalled window (`data-search-window`)
  with one big input. Three tiers, GlobalSearch's manner: substring, then
  Fuse fuzzy **over the NAME alone** (over the whole hay it matched task
  words against half the query — "coen" ≈ "condenser" — and buried the real
  Cohen), then skeleton/translit. Searches every workspace (snapshots +
  `snapshotTick`); Trash never appears, groups appear labeled; rows go
  through `openJob` / `openUnit`, so the same tile works on the board AND
  the wall. The window portals to body (fixed-inside-a-transform), SEALS its
  pointer events (portal-in-a-node), and closes on capture-phase Escape.
- **`src/data/voiceSearch.ts`** — `useSpeechToText(lang, onText)`: the
  browser's own speech recognition streaming interim words into a query.
  The search tile AND the header's GlobalSearch carry the mic
  (`data-search-mic`); a browser without the API never shows it.
Probes: `tvrefresh-probe` · `searchtile-probe` (fuzzy cross-workspace hit,
Escape ladder, travel + drawer).

## Notebook Strips, built as approved (owner: "approved!", 2026-08-31)
The drawing is the "Notebook Strips" artifact; the build matches it.
- **Empty rows squish** (`PlannerWidget`): per week and automatic — a worker
  with no entries AND no task chips that week draws as a thin named strip
  (cells `z(12)`, small grey name). `squished` is suspended while the rota
  hover sits anywhere on the row (`rowLit`), which with the cells'
  `min-height` transition IS the puff-open under a hovering drag; a drop
  fills the row so it expands by itself. Cell refs stay registered, so a
  strip takes drops exactly like a full row. Nothing is hidden — the name
  stays.
- **Strips mode** (`data.cardStyle: '' | 'strips'` on the rota, in
  `PlannerData` + the pencil's Cards select): `PlannerCard` takes `strip` —
  one slim line, the job's name with ONE task line under it (its own task,
  else the first open task, else the entry's words). Same drag handlers,
  same click-to-open, same closed-task strike; cells drop to `z(26)`.
  Per notebook.
- **The plan's phone reader refuses TzviAir's own number**: `OWN_NUMBERS`
  ('026288282') + `normalizePhoneDigits` (exported; +972/972/0 forms fold
  together) in planAddress.ts — the title block prints the office number
  beside the customer's, and the reader was offering the office back to
  itself. Every number ON a line is scanned (not just the first), and a
  mobile (05x) now outranks a landline by +15: the customer is the mobile.
Probes: `stripsrow-probe` (strip vs row heights, puff-open mid-drag by a
real card drag, drop fills + emptied row squishes, strips-mode heights) ·
`planphone-probe` grew the office-number decoy line and the normaliser
check. What's New carries the round (its dates run AHEAD of the wall clock —
a new entry must postdate the previous top one or the red dot never shows).

## The plan chooser tells the truth, and the + asks which file
- **The picker re-lists LIVE on open** (`PlanPicker`): the handed-over list
  keeps it instant, and the live listing lands over it as a UNION (fresh
  first — a version stamped seconds ago that Drive's listing has not caught
  up to survives from the handed list). `listPlansViaBackend`, never
  listMarkable, wherever a folder is listed — the folder's files PLUS its
  Annotated Plans child, kinds intact; the folder dropdown also appends the
  plans folder's own subfolders, because "Annotated Plans" lives one level
  deeper than the job-folder listing reaches and was the one folder the
  chooser could not open.
- **A save announces itself**: `PlanEditor.onSavedToDrive` fires on every
  successful `stampPlanToDrive` (Save, the idle push, the close-ask); the
  wrapper folds the new file into `mergedPlans`, so the picker shows the
  version saved ten seconds ago without reopening the drawer.
- **The + on the tab strip opens the FILE CHOOSER** (owner's ask) — every
  pick opens in a fresh tab; picking a file already open in another tab is
  a deliberate COPY, a clean sketch named "… · copy". Opening from + is
  looking, never choosing: it never writes `plansPdfLink`.
- **renderPage guards its blit**: the canvas can be unmounted while the
  render is awaited (tab churn), and drawing into null was a crash.
`plantabs.mjs` re-encoded to the new + contract (26 checks).
