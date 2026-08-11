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
Two-step: user enters their code → on success, project picker shows all three project logos → clicking a logo calls `setCurrentProject(id)` and navigates to the correct page.

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

`withSampleData(ctx)` fills in only the fields that are genuinely empty, so store
previews show something on a new board and your own data as soon as there is any.

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
