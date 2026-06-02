# Wolfson Management App — Developer Notes

## Project Overview
Internal project-management system for TzviAir's HVAC installation across W Residence (buildings A1, A2, A3).
Tracks apartment-level progress through installation stages, contractor assignments, and photo evidence.
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
    ProjectDiagramPage    — building diagram with filters + bulk edit
    DashboardPage         — summary cards
    TasksPage             — contractor task management (dedicated page, /tasks route)
    AnalyticsDashboard    — stage/building analytics
    ReportsPage           — CSV export
    ActivityLogPage       — global change log
    SettingsPage          — stages / users / contractors / app (theme, backup) / language
    ContractorPortal      — public /c/:token page (tasks + building map)
    LoginPage
  components/
    layout/               — AppLayout, Header, Sidebar
    apartment/            — ApartmentDetailDrawer (5 tabs: details/tasks/stages/history/photos),
                            StageNotesSection, ActivitySection, QuickAddTaskPanel, BulkAddTaskModal
    diagram/              — BuildingDiagram (supports compact, highlightedApartmentIds, aptSubLabels)
    dashboard/            — summary cards
    reports/              — table/export
    ui/                   — Toast, Tooltip, GlobalSearch (Cmd+K), shared primitives
```

## Data Model Key Points
- **Building IDs**: `A1`, `A2`, `A3`
- **Apartment numbering per building**: 1-52 (floors 2-14, 4/floor), 53-54 (floor 15, 2 wide), 55-56 (floor 16, 2 wide), basement slots 57+ (unnamed by default)
- **A1 is missing apartment 37** (blank placeholder with `isUnnamed: true`)
- **No duplex apartments** — `isDuplexApt` field retained for data compat but always `false`
- **Classification**: `'standard'` or `'shinui'` (displayed as "Changes"/"שינוי" in UI, internal value preserved)
- **mergedWith**: optional field on Apartment for buyer-merged units (bilateral link, managed via `mergeApartments()` action)
- **Merged apartment sync**: `currentStageId`, `classification`, `driveLink`, and `plansPdfLink` auto-sync to the partner on every `updateApartment` call
- **unmergeApartments(aptId, keepDataAptId, user)**: unlinking action; `keepDataAptId` is `aptId | partnerId | 'both'`; the loser gets `currentStageId=null`, `driveLink=undefined`, `plansPdfLink=undefined`
- **Critical**: When `fsSet` writes a field as `undefined`, the `deleteField()` sanitizer in `firebase.ts` ensures it is actually removed from Firestore. This is essential for `mergedWith` — without it, the stale value persists and the apartment stays linked even after unlinking.
- **driveLink**: Google Drive folder URL for the apartment; stored on Apartment, editable in drawer
- **plansPdfLink**: Google Drive file URL for the Engineering Plans PDF; shown as embedded iframe viewer + download in both admin drawer and contractor portal
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

## Contractor Portal
- Public URL: `/c/:token` — no auth required, token-based access
- Contractors have category: `'drywall' | 'ac' | 'general'`
- Each contractor has a unique random token; link is copyable from Settings > Contractors
- Assignments link contractor → apartment with task description, stage, due date, priority
- Two tabs: **My Tasks** (assignment cards with countdown badges) and **Building Map**
- Building map highlights assigned apartments with gold glow; filter buttons: All / Overdue / Today / Tomorrow / This Week
- Each highlighted cell shows a tiny schedule label (Today / Tomorrow / Overdue / date) at cell bottom
- Contractor can upload photos, videos, and files; office notes visible read-only
- **Completed button is disabled until at least one file exists**
- Engineering Plans PDF shown in task detail sheet when `apartment.plansPdfLink` is set
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

## ApartmentDetailDrawer
- 5 tabs: **details** / **tasks** / **stages** / **history** / **photos**
- **Tasks tab**: shows all `ContractorAssignment` records for that apartment; pending badge on tab button; mark complete inline; attachment thumbnails; Add Task / Bulk Add Task buttons open `QuickAddTaskPanel` / `BulkAddTaskModal`
- `getTaskDueBadge()` helper defined inside component (mirrors `getDueBadge()` logic)
- **Photos tab**: loads Drive folder contents via backend API when `driveLink` is set; lightbox viewer
- **Unmerge flow**: `unmergeTarget` state captures partner apartment at modal-open time (prevents modal disappearing due to Firebase re-renders). `handleConfirmUnmerge` calls `unmergeApartments` which sets `mergedWith: undefined` on both apartments — the `fsSet` sanitizer ensures this actually removes the field from Firestore.

## GlobalSearch
- Triggered by Cmd+K (Mac) or Ctrl+K (Windows/Linux)
- Searches: apartment `displayName`/`generalNotes`, stage notes text, task descriptions, contractor notes
- Result type badges: Apartment / Task / Stage Note / Contractor Note
- All data in Zustand state — no backend call needed
- Strings via `s.searchPlaceholder`, `s.searchTypeApartment`, `s.searchNoResults`, `s.searchStartTyping`

## Settings Page Tabs
- **Stages** — add/edit/reorder/delete stages with color picker, `nameHe` Hebrew name field, description
- **Users** — manage admin users (name, code, role)
- **Contractors** — manage contractors, copy portal link, see token, category (drywall/AC/general)
- **App** — theme toggle, backup frequency, backup history log, Drive backup folder, export/import, Firebase test panel, Force Push to Firestore
- **Language** — edit all `ContractorUiStrings` fields (grouped by section), Reset to English / Reset to Hebrew presets, RTL toggle; `MAIN_UI_FIELD_LABELS` lists all admin string keys for reference

## localStorage Persistence
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

`startFirebaseSync()` (called on login):
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
