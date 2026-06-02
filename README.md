# Wolfson Management App

An internal project-management system for TzviAir's HVAC installation across W Residence (buildings A1, A2, A3). The app tracks apartment-level progress through configurable installation stages, contractor assignments, photo/file evidence, and engineering plans — all synced in real time via Firebase Firestore, with a public contractor portal that requires no login.

The entire admin UI and contractor portal are fully bilingual — switching between English and Hebrew (with RTL layout) is instant, with every string editable in Settings.

---

## Table of Contents

1. [What the App Does](#what-the-app-does)
2. [Who Uses It](#who-uses-it)
3. [Feature Overview](#feature-overview)
4. [Tech Stack](#tech-stack)
5. [Local Development Setup](#local-development-setup)
6. [Environment Variables](#environment-variables)
7. [Firebase Setup](#firebase-setup)
8. [Google Drive Backend Setup](#google-drive-backend-setup)
9. [Vercel Deployment](#vercel-deployment)
10. [Firebase Firestore Sync](#firebase-firestore-sync)
11. [Firebase Storage (Photo Uploads)](#firebase-storage-photo-uploads)
12. [Google Drive File Uploads](#google-drive-file-uploads)
13. [Contractor Portal](#contractor-portal)
14. [Data Model](#data-model)
15. [Settings](#settings)
16. [Backup and Restore](#backup-and-restore)
17. [Bilingual Support](#bilingual-support)
18. [localStorage Persistence](#localstorage-persistence)
19. [Security Notes](#security-notes)
20. [Directory Layout](#directory-layout)
21. [Future Development Notes](#future-development-notes)

---

## What the App Does

The Wolfson Management App is a purpose-built internal tool for tracking HVAC installation progress across a multi-building residential complex. Every apartment in buildings A1, A2, and A3 has a current installation stage, classification, notes, assigned contractors, and a photo/document record. Managers can see the entire project at a glance on a building diagram, drill into any apartment's detail, assign tasks to contractors, and export reports — all in Hebrew or English.

---

## Who Uses It

- **Project managers / admins** — log in with a PIN code, update apartment stages, assign tasks, review photos, export reports, and manage all settings. The entire admin interface is bilingual (Hebrew/English).
- **Contractors** — access a public, token-based portal (`/c/:token`) with no login required. Contractors see only their assigned apartments, upload photos and files, write notes, and mark tasks complete. The contractor portal is fully bilingual.

---

## Feature Overview

### Project Diagram (`/`)
Interactive building diagram for all three buildings. Each apartment cell is color-coded by its current stage and shows the stage name in the active language (Hebrew or English). Supports:
- Filter by building, stage, classification, or contractor
- Bulk-select and bulk-edit apartments (change stage or classification across multiple apartments at once)
- Compact view mode
- Click any apartment to open its detail drawer
- Shinui (Changes/שינוי) badge toggle
- Print building diagram

### Dashboard (`/dashboard`)
Summary cards showing total apartments, stage distribution, pending contractor tasks, overdue tasks, completion percentages by building, and a recent activity feed.

### Tasks Page (`/tasks`)
Full CRUD interface for contractor assignments:
- Create tasks with a description, contractor, apartment, due date, linked stage, optional file attachments, and priority (Urgent / Normal / Low)
- Inline edit any field, including attachments — hover any attached file to reveal the × remove button
- Mark tasks complete or incomplete
- Filter by contractor
- Sorted incomplete-first, then by due date
- Countdown badges: Overdue / Today / Tomorrow / Within 3 Days
- **Bulk task creation** — open a single modal to create the same task across many apartments at once, with Drive folder routing per apartment

### Analytics (`/analytics`)
Stage-by-stage breakdown by building. Shows how many apartments are in each stage, active contractors, tasks completed, and per-contractor done/total counts.

### Reports (`/reports`)
Tabular view of all apartment data. Column picker lets you choose which fields to show. Export to CSV with one click.

### Activity Log (`/activity`)
Global change log of all apartment updates. Tracked fields: `currentStageId`, `classification`, `generalNotes`, `displayName`. Each entry records the user, timestamp, field changed, previous value, and new value. Filter by user or building.

### Global Search (⌘K / Ctrl+K)
Keyboard-triggered search modal that searches across all apartment names, general notes, stage notes, task descriptions, and contractor notes in real time. Results show type badges (Apartment / Task / Stage Note / Contractor Note).

### Apartment Detail Drawer
Opens from any apartment cell. Five tabs:

| Tab | Content |
|-----|---------|
| **Details** | Stage selector, classification, general notes, Drive folder link, Engineering Plans PDF viewer (inline iframe), apartment merge/unmerge controls |
| **Tasks** | All contractor assignments for this apartment; mark complete inline; pending count badge; Add Task and Bulk Add Task buttons |
| **Stages** | Per-stage notes with file attachments, contractor assignment dropdown per stage, contractor notes read-only |
| **History** | Activity log scoped to this apartment; point-in-time restore |
| **Photos** | Google Drive photo gallery loaded from the apartment's Drive folder (requires `VITE_DRIVE_API_KEY`) |

### Settings (`/settings`)
Five tabs — see [Settings](#settings) section below.

### Contractor Portal (`/c/:token`)
Public, no-auth portal for contractors — see [Contractor Portal](#contractor-portal) section below.

### Login (`/login`)
PIN-code authentication. Each admin user has a numeric code stored in the users list.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build tool | Vite 8 |
| Styling | Tailwind CSS v3 (dark theme default, light theme toggle) |
| State | Zustand v5 (auto-persisted to localStorage) |
| Routing | React Router v6 (nested routes under `AppLayout`) |
| Cloud database | Firebase Firestore (optional — falls back to localStorage) |
| Cloud storage | Firebase Storage (contractor photos/files) |
| File uploads | Google Drive via Vercel serverless backend (service account, no OAuth) |
| Date utilities | date-fns |
| CSV export | file-saver |
| Icons | lucide-react |
| Hosting | Vercel |
| Serverless API | Vercel `/api` folder (Node.js ES modules) |

---

## Local Development Setup

### Prerequisites
- Node.js 18+
- npm

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/yitzchak-hash/wolfson-management-app.git
cd wolfson-management-app

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Fill in the values — see Environment Variables section below

# 4. Start the dev server
npm run dev
```

The app runs at `http://localhost:5173`. Firebase and Google Drive integration are optional — the app falls back to localStorage if environment variables are not set.

### Build for production

```bash
npm run build     # TypeScript check + Vite build → dist/
npm run preview   # Serve the dist/ folder locally
```

---

## Environment Variables

Copy `.env.example` to `.env.local` for local development. For Vercel, add these in the Vercel dashboard under Project → Settings → Environment Variables.

### Frontend variables (prefixed `VITE_`)

These are embedded in the browser bundle at build time.

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain (e.g. `your-project.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket (e.g. `your-project.appspot.com`) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_DRIVE_API_KEY` | Shared secret sent as `x-api-key` to `/api/drive-session` and `/api/folder`; must match the backend `API_KEY` value |

All `VITE_FIREBASE_*` variables are optional — if omitted, the app runs entirely on localStorage with no cloud sync. `VITE_DRIVE_API_KEY` is optional — if omitted, file uploads fall back to local base64 storage (50 MB cap).

### Backend-only variables (Vercel, not in the browser bundle)

| Variable | Description |
|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full Google service account credentials JSON (paste as a single line) |
| `API_KEY` | Shared secret for `/api` routes; must match `VITE_DRIVE_API_KEY` |
| `ALLOWED_ORIGIN` | Allowed CORS origin, e.g. `https://wolfson-management-app.vercel.app` |

---

## Firebase Setup

Firebase is optional but strongly recommended for multi-device sync and data durability.

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com).
2. Create a new project (the free Spark plan is sufficient for most usage).
3. Add a Web App (`</>` icon) and copy the SDK config values into your `.env.local`.
4. Enable **Firestore Database**: Build → Firestore Database → Start in test mode.
5. Enable **Firebase Storage**: Build → Storage → Start in test mode.
6. Apply the following Storage security rules so contractors can upload without Firebase Auth:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /contractorPhotos/{allPaths=**} {
      allow read, write;
    }
  }
}
```

> **Note**: Firestore security rules can remain in test mode for an internal app. Restrict to IP allowlists or authenticated admin SDKs for extra protection if needed.

---

## Google Drive Backend Setup

The Google Drive integration lets contractors upload photos, videos, and large files (500 MB+) directly to a designated Drive folder — with no bytes passing through Vercel.

### How it works

1. The browser calls `POST /api/drive-session` with the target folder ID, filename, and MIME type.
2. The Vercel function uses a **Google service account** (not OAuth) to create a Google Drive resumable upload session and returns the one-time upload URL to the browser.
3. The browser streams the file bytes directly to that URL via XHR PUT with progress events.
4. The file lands in Google Drive; only the `driveFileId` and `driveUrl` are stored in the app.

Vercel never handles the actual file bytes, so there are no Vercel payload limits and no bandwidth costs for large files.

### Setup steps

1. In Google Cloud Console, create a service account. Assign it **Contributor** (not Owner/Editor) on a specific Drive folder only — this allows uploading but not deleting or browsing other Drive content.
2. Generate and download a service account JSON key.
3. Share the target Drive folder with the service account email address (give it Editor access on that folder).
4. In Vercel, set `GOOGLE_SERVICE_ACCOUNT_JSON` to the full contents of the JSON key file (as a single line).
5. Set `API_KEY` to a random secret string in Vercel.
6. Set `VITE_DRIVE_API_KEY` to the same value in the frontend environment (both local `.env.local` and Vercel dashboard).
7. Set `ALLOWED_ORIGIN` to your deployed app URL.

### Vercel API routes

| Route | Purpose |
|-------|---------|
| `POST /api/drive-session` | Creates a resumable upload session; returns `{ uploadUrl }` |
| `POST /api/folder` | Finds or creates a Drive subfolder by name under a given parent folder ID |
| `POST /api/drive-upload` | Uploads a backup JSON file directly to Google Drive |
| `GET /api/health` | Health check endpoint |

---

## Vercel Deployment

The app auto-deploys on every push to the connected GitHub branch.

- **Static frontend**: Vite builds to `dist/`; Vercel serves it.
- **SPA routing**: `vercel.json` rewrites all non-`/api/` paths to `/index.html`, so React Router handles client-side navigation.
- **Serverless functions**: Every `.js` file in the `/api` folder is automatically deployed as a Vercel serverless function (Node.js ES modules).
- **Environment variables**: Set in Vercel dashboard → Project Settings → Environment Variables. Both `VITE_*` (frontend) and non-prefixed (backend-only) variables are configured here.

```json
{
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

---

## Firebase Firestore Sync

### Collections synced

| Collection | Notes |
|-----------|-------|
| `apartments` | All apartment records |
| `stageNotes` | Per-apartment, per-stage notes |
| `stages` | Stage definitions (name, Hebrew name, color, order) |
| `users` | Admin users |
| `activityLogs` | Global change history |
| `contractors` | Contractor records |
| `contractorAssignments` | Task assignments |
| `contractorNotes` | Notes on assignments (contractor and office) |
| `contractorPhotos` | Photo/file metadata only — binary `dataUrl` is stripped before writing |
| `officeNoteFiles` | Office attachment metadata only — binary `dataUrl` is stripped |
| `settings/app` | `autoBackup`, `backupFrequency`, `backupDriveFolderLink`, `contractorUiStrings` |

Binary fields (`dataUrl` on photos, office files, and task attachments) are never written to Firestore — they are stored in localStorage only and merged back into memory on read.

### Important: undefined fields and Firestore

When a field on an apartment or assignment is cleared (set to `undefined`), `fsSet` in `src/data/firebase.ts` automatically replaces `undefined` values with Firestore's `deleteField()` sentinel before writing. This ensures that clearing a field (e.g. unlinking apartments via `mergedWith: undefined`) actually removes it from the Firestore document rather than leaving the stale value behind. Without this, `merge: true` writes would silently preserve old values.

### Sync lifecycle

`startFirebaseSync()` is called on login and runs the following sequence:

1. Loads all 11 collections from Firestore in parallel.
2. If Firestore has data → merges binary fields from localStorage and sets in-memory state; seeds any missing apartments to Firestore.
3. If Firestore is empty → pushes the entire localStorage snapshot as a first-run seed.
4. Attaches real-time `onSnapshot` listeners on all collections.

### "Firebase wins" listener pattern

All real-time listeners apply a simple rule: **Firestore always wins**. When Firestore sends an update, the listener replaces the local record unconditionally. Local state is only kept for items not yet in Firestore. There is no `updatedAt` timestamp comparison — that approach silently blocked incoming updates on multi-device sessions and has been deliberately removed.

### Force push

`forcePushToFirestore()` is available in Settings → App → "Force Push Local → Cloud". Use this to recover from a state where local data is ahead of Firebase (e.g., after an import or bulk change made while offline).

### No custom Firestore cache

The app uses plain `getFirestore(app)` with no `persistentLocalCache` or `persistentMultipleTabManager`. The app's own localStorage (`persist()`) handles offline caching. Firestore's built-in IndexedDB cache was causing `onSnapshot` to deliver stale data instead of live server updates on mobile browsers.

---

## Firebase Storage (Photo Uploads)

All contractor photo and file uploads go to Firebase Storage:

- **Path pattern**: `contractorPhotos/{assignmentId}/{uid}.{ext}`
- **Upload**: `fsUploadFile(path, blob, onProgress)` in `src/data/firebase.ts` — resumable upload with progress callback.
- **Delete**: `fsDeleteFile(path)` — called on photo delete to free storage quota.
- **Quota tracking**: `fileSizeBytes` is stored on every `ContractorPhoto` and summed into `totalStorageBytes` in app state and the `settings/app` Firestore document.
- **Storage warning**: The admin Header shows an amber warning banner when total usage exceeds 80% of the 5 GB free Firebase Storage tier.
- **Cloud sync badge**: The admin Header shows a `CloudSyncBadge` that spins "Saving…" while any Firestore write is in flight and shows "Saved ✓" for 3 seconds after all writes complete.

Images are compressed client-side before upload: maximum 1200 px on the longest side, 72% JPEG quality.

### Upload priority (contractor portal)

1. **Firebase Storage** (primary — used when Firebase is configured)
2. **Google Drive backend** (fallback — used when `VITE_DRIVE_API_KEY` is set and the apartment has a `driveLink`)
3. **Local base64** (last resort — 50 MB cap per upload)

---

## Google Drive File Uploads

### Frontend helpers (`src/data/driveApi.ts`)

| Function | Description |
|----------|-------------|
| `isUploadBackendConfigured()` | Returns `true` if `VITE_DRIVE_API_KEY` is set |
| `extractFolderId(url)` | Extracts a folder ID from any Drive folder URL |
| `extractFileId(url)` | Extracts a file ID from any Drive file or doc URL |
| `drivePreviewUrl(fileId)` | Returns the embed URL for use in an iframe PDF viewer |
| `driveDownloadUrl(fileId)` | Returns a direct download link |
| `findOrCreateFolderViaBackend(parentId, name)` | Finds or creates a subfolder via `/api/folder` |
| `uploadFileViaBackend(folderId, file, onProgress)` | Streams a file to Drive via `/api/drive-session` + XHR PUT |
| `checkFolderHealth(driveLink, plansPdfLink, token)` | Read-only folder health check |

### How `driveOnly` photos are rendered

When a photo was uploaded to Google Drive (no local base64), `ContractorPhoto.dataUrl` is empty and `ContractorPhoto.driveUrl` is set. The `MediaItem` component detects this `driveOnly` state and renders a link-out to Drive instead of an inline image. A **blue badge** indicates Firebase Storage; a **green badge** indicates Google Drive storage.

---

## Contractor Portal

**URL pattern**: `/c/:token` — no authentication required.

Each contractor has a unique 24-character alphanumeric token (generated by `generateToken()`). The shareable link can be copied from Settings → Contractors. Revoke access by regenerating the token.

### Portal tabs

**My Tasks** — one card per assignment with:
- Task description, priority badge, and due date
- Countdown badges: Overdue / Today / Tomorrow / This Week
- Office notes (read-only, shown above contractor notes)
- Engineering Plans PDF embedded inline via iframe when `apartment.plansPdfLink` is set
- File/photo upload with real-time progress indicator
- Notes section (contractor can write notes)
- **Mark as Complete** button — disabled until at least one file has been uploaded

**Building Map** — building diagram highlighting the contractor's assigned apartments with a gold glow. Filter buttons: All / Overdue / Today / Tomorrow / This Week. Each highlighted cell shows a small schedule label at the bottom.

### Contractor categories

| Value | Label |
|-------|-------|
| `drywall` | Drywall contractor |
| `ac` | HVAC/AC contractor |
| `general` | General contractor |

### Internationalization

The contractor portal UI supports full text customization and RTL layout. All strings are editable in Settings → Language. Built-in presets: English and Hebrew.

---

## Data Model

### Buildings

Three buildings: **A1**, **A2**, **A3**.

### Apartments

Each building has apartments numbered 1–56 (plus optional basement slots 57+):
- Floors 2–14: 4 apartments per floor (numbers 1–52)
- Floor 15: 2 wide apartments (numbers 53–54)
- Floor 16: 2 wide apartments (numbers 55–56)
- **A1 is missing apartment 37** — replaced by a blank placeholder (`isUnnamed: true`)

Key apartment fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique ID |
| `buildingId` | `'A1' \| 'A2' \| 'A3'` | Building |
| `apartmentNumber` | `string` | Display number |
| `currentStageId` | `string \| null` | Active installation stage |
| `classification` | `'standard' \| 'shinui'` | `'shinui'` is displayed as "Changes" in English or "שינוי" in Hebrew; the internal value is always preserved |
| `generalNotes` | `string` | Free-form admin notes |
| `mergedWith` | `string?` | ID of partner apartment (bilateral buyer merge) |
| `driveLink` | `string?` | Google Drive folder URL for this apartment's files |
| `plansPdfLink` | `string?` | Google Drive link to the Engineering Plans PDF |
| `stageDates` | `Record<string, string>?` | ISO timestamp of when each stage was first set |
| `isUnnamed` | `boolean` | `true` for blank placeholder cells |

**Merged apartments**: When a buyer physically connects two units, both are linked via `mergedWith`. On every `updateApartment` call, `currentStageId`, `classification`, `driveLink`, and `plansPdfLink` are automatically synced to the partner apartment. Unlinking is done via `unmergeApartments(aptId, keepDataAptId, user)` — the losing side gets `currentStageId=null` and its drive links cleared. The `mergedWith` field is removed from both apartments in Firestore using `deleteField()`.

### Stages

Configurable installation stages, each with:
- `name` — English name
- `nameHe` — Hebrew name (optional; shown when admin UI is in Hebrew mode)
- `color` — hex color for the diagram
- `order` — display order
- `description` — free-text description
- `active` — whether the stage is in use

The helper `getStageName(stage, isRtl)` in `src/types/index.ts` returns `nameHe` when `isRtl` is true and a Hebrew name exists, otherwise returns `name`. This is used in the building diagram, stage legend, drawer, reports, and stage notes.

### Contractors

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique ID |
| `name` | `string` | Display name |
| `email` | `string` | Email address |
| `category` | `'drywall' \| 'ac' \| 'general'` | Work category |
| `token` | `string` | 24-char alphanumeric portal access token |
| `active` | `boolean` | Whether the contractor is active |

### Contractor Assignments (Tasks)

| Field | Type | Description |
|-------|------|-------------|
| `contractorId` | `string` | Linked contractor |
| `apartmentId` | `string` | Linked apartment |
| `taskDescription` | `string` | What needs to be done |
| `dueDate` | `string \| null` | ISO date (YYYY-MM-DD) |
| `stageId` | `string \| null` | Optional linked stage |
| `priority` | `'urgent' \| 'normal' \| 'low'` | Task priority (default `'normal'`) |
| `completedAt` | `string \| null` | ISO timestamp when marked complete; `null` = pending |
| `attachments` | `TaskAttachment[]?` | Files attached at task-creation time (base64 only, not stored in Firestore) |

### Contractor Photos

| Field | Type | Description |
|-------|------|-------------|
| `dataUrl` | `string` | Base64 fallback (empty when `storageUrl` or `driveUrl` is set) |
| `storageUrl` | `string?` | Firebase Storage download URL (primary store) |
| `storagePath` | `string?` | Firebase Storage path used for deletion |
| `driveFileId` | `string?` | Google Drive file ID (legacy/fallback) |
| `driveUrl` | `string?` | Google Drive web view link |
| `fileType` | `'image' \| 'video' \| 'file'` | Media type (default `'image'` for backward compat) |
| `fileSizeBytes` | `number?` | Original file size for quota tracking |

### Users (Admins)

| Field | Description |
|-------|-------------|
| `name` | Display name |
| `code` | Numeric PIN for login |
| `role` | Role label (e.g. "Manager", "Coordinator") |
| `active` | Whether the account is active |

### Activity Logs

Each log entry records: user ID and name, building and apartment, action type, field changed, previous value, new value, and timestamp. The global log is capped at 200 entries in normal saves and 50 in fallback saves.

---

## Settings

The Settings page (`/settings`) has five tabs:

### Stages
Add, edit, reorder, and delete installation stages. Each stage has:
- English name and optional Hebrew name (used when admin UI is in Hebrew mode)
- Description
- Color (color picker)
- Display order
- Active/inactive toggle

### Users
Manage admin users: create accounts, set names, PINs, and roles, activate or deactivate.

### Contractors
Create and manage contractor accounts. Copy the public portal link for any contractor. View and regenerate access tokens.

### App
- **Theme** — toggle between dark mode (default) and light mode
- **Auto-backup** — enable/disable automatic backups
- **Backup frequency** — `Every Activity` / `Daily` / `Weekly` / `Monthly`
- **Backup Drive folder** — set a Google Drive folder URL for automatic backup uploads
- **Backup history log** — view past backup entries (filename, size, trigger type, timestamp, Drive link)
- **Export data** — download a full JSON snapshot of all app data
- **Import data** — restore state from a previously exported JSON file
- **Force Push Local → Cloud** — push all in-memory state to Firestore (recovery tool)
- **Firebase connection test** — verify all Firebase environment variables are set correctly

### Language
Edit all UI strings for both the contractor portal **and** the admin interface. Changes apply immediately to all pages. Built-in presets:
- **Reset to English** — restores default English strings
- **Reset to Hebrew** — restores Hebrew strings with RTL layout enabled
- **RTL toggle** — controls text direction independently
- Every string visible anywhere in the app is listed and editable here, grouped by section

---

## Backup and Restore

### Export
Settings → App → Export Data downloads a full JSON snapshot of all app data including photo base64 data. The snapshot includes a version field for forward-compatibility checks.

### Import
Upload a previously exported JSON file to fully restore state. All current data is replaced by the imported snapshot.

### Auto-backup
When enabled, the app automatically creates snapshots at the configured frequency. Each backup is logged with filename, size (KB), trigger type (`manual` or `scheduled`), and timestamp.

### Drive backup
When a backup Drive folder URL is configured, backup JSON files are uploaded to Google Drive via the `/api/drive-upload` serverless function. This uses the same service account as photo uploads — no OAuth needed. `BackupLogEntry.driveUrl` links to the uploaded file on Drive.

---

## Bilingual Support

The app supports full Hebrew/English switching throughout. Every visible string in both the admin UI and the contractor portal can be changed without touching code.

### How it works

**Admin UI strings** are stored in the `MainUiStrings` interface in `src/types/index.ts`. The Zustand store exposes `mainUiStrings` which is either `DEFAULT_MAIN_UI_STRINGS` (English) or `HEBREW_MAIN_UI_STRINGS` (Hebrew), depending on the language setting. Every component reads strings via `const s = useStore(state => state.mainUiStrings)`.

**Contractor portal strings** are stored in the `ContractorUiStrings` interface and are fully user-editable via Settings → Language.

**Bilingual stage names**: Each stage has an optional `nameHe` field for its Hebrew name. The helper function `getStageName(stage, isRtl)` in `src/types/index.ts` automatically returns the Hebrew name when the UI is in Hebrew mode, falling back to the English name. This is used in the building diagram cells, stage legend, apartment detail drawer, reports, and stage notes. To set up Hebrew stage names, go to Settings → Stages and fill in the Hebrew name field for each stage, then click Save.

**RTL layout**: When Hebrew mode is active, `isRtl` is set to `true` in the store, which applies `dir="rtl"` throughout both the admin UI and contractor portal.

### Switching languages

Settings → Language → Reset to Hebrew (or Reset to English). The change is instant and applies to every page. The language setting persists in localStorage and Firestore (`settings/app`).

---

## localStorage Persistence

The Zustand store auto-persists to localStorage under the key `wolfson_app_data`. The save function uses a tiered strategy to handle browser quota limits:

1. **Normal save**: keeps photo records that have a Drive/Storage URL lean (`dataUrl: ''`). Activity logs capped at 200 entries; backup snapshots capped at 5.
2. **Fallback save** (triggered on `QuotaExceededError` / `NS_ERROR_DOM_QUOTA_REACHED`): strips ALL binary data (`dataUrl` on all photos, office files, and task attachments); truncates activity logs to 50 entries; drops all backup snapshots.

`DATA_VERSION` in `src/data/initialData.ts` is checked on startup. If the stored version differs from the current value, localStorage is wiped and reseeded with defaults. **Do not bump this value in production** — it wipes all user data. Use `forcePushToFirestore()` for production data recovery instead.

---

## Security Notes

### API key (`VITE_DRIVE_API_KEY` / `API_KEY`)
The shared secret between the frontend and the `/api` serverless functions is embedded in the public browser bundle. It **deters casual abuse** but is not a true secret. Real protection comes from:
- The Google service account being scoped to **Contributor-only** on a single Drive folder (upload, no delete, no access to other Drive content).
- The `ALLOWED_ORIGIN` CORS header restricting which origin can call the API routes.

### Firebase
No Firebase Authentication is used. Firestore and Storage rules should be reviewed and tightened for production. At minimum, Firebase Storage rules should allow public read/write only on the `contractorPhotos/**` path (as shown in the Firebase Setup section above).

### Contractor portal
Contractor portal URLs (`/c/:token`) use 24-character random alphanumeric tokens. Anyone with the URL can access that contractor's view. Treat portal links as sensitive — revoke access by regenerating the token in Settings → Contractors.

### Admin access
Admin login uses numeric PIN codes stored in the users list. There is no OAuth or JWT-based authentication. The app is designed for internal use on a trusted network.

### Service account credentials
The Google service account JSON key **must never** be committed to the repository. It must be stored only in Vercel environment variables. The `GOOGLE_SERVICE_ACCOUNT_JSON` env var is backend-only and never reaches the browser.

---

## Directory Layout

```
wolfson-management-app/
├── api/                          Vercel serverless functions
│   ├── drive-session.js          Creates Google Drive resumable upload sessions
│   ├── drive-upload.js           Uploads backup JSON to Google Drive
│   ├── folder.js                 Finds or creates Drive subfolders
│   ├── drive-files.js            Lists Drive files in a folder
│   ├── health.js                 Health check endpoint
│   └── share.js                  Drive file sharing helper
├── public/                       Static assets
├── src/
│   ├── types/
│   │   └── index.ts              All shared TypeScript interfaces, types,
│   │                             MainUiStrings, ContractorUiStrings, getStageName()
│   ├── data/
│   │   ├── store.ts              Zustand store — all state and actions
│   │   ├── initialData.ts        Default seed data and DATA_VERSION
│   │   ├── firebase.ts           Firestore + Storage helpers (fsSet uses deleteField())
│   │   └── driveApi.ts           Google Drive upload helpers (service account, no OAuth)
│   ├── pages/
│   │   ├── ProjectDiagramPage.tsx      Building diagram with filters and bulk edit
│   │   ├── DashboardPage.tsx           Summary cards and recent activity
│   │   ├── TasksPage.tsx               Contractor task management (/tasks)
│   │   ├── AnalyticsDashboard.tsx      Stage/building analytics
│   │   ├── ReportsPage.tsx             Table view and CSV export
│   │   ├── ActivityLogPage.tsx         Global change log
│   │   ├── SettingsPage.tsx            Stages/users/contractors/app/language
│   │   ├── ContractorPortal.tsx        Public /c/:token page
│   │   └── LoginPage.tsx               PIN login
│   └── components/
│       ├── layout/               AppLayout, Header (with CloudSyncBadge), Sidebar
│       ├── apartment/            ApartmentDetailDrawer (5 tabs), StageNotesSection,
│       │                         ActivitySection, QuickAddTaskPanel, BulkAddTaskModal
│       ├── diagram/              BuildingDiagram (compact mode, highlights, sub-labels,
│       │                         bilingual stage names via getStageName())
│       ├── dashboard/            Summary card components
│       ├── reports/              Table and export components
│       └── ui/                   Toast, Tooltip, GlobalSearch (⌘K), shared primitives
├── .env.example                  Environment variable template
├── vercel.json                   SPA rewrite rule
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## Future Development Notes

The app is feature-complete for its current use case. The following are known potential improvements for future consideration, ordered by operational impact:

### High priority if the project grows

- **Notification system for task completion** — when a contractor marks a task done, office staff currently have to manually check. An in-app unread badge on the sidebar Tasks icon and a "Needs Review" filter would be the minimum; email notifications via a Vercel function + SendGrid would be the complete solution.
- **More Task page filters** — filter by building, stage, due-date range, and overdue-only. Currently only contractor filter exists.
- **Dashboard overdue/pending task cards** — the dashboard shows stage progress but not the most urgent operational metric: overdue tasks.
- **Activity log records task events** — task creation, completion, and undo are not currently logged in the activity log.
- **Reports CSV includes task data** — currently only apartment-level fields are exported; assigned contractor and task status are not included.

### Medium priority

- **Task priority system** is already implemented (urgent/normal/low) — if more granularity is needed, priorities could be extended.
- **Multiple attachments per stage note** — currently only one file attachment per stage note is supported.
- **Apartment-level photo gallery** — Firebase Storage photos are currently only visible inside individual task cards; a combined gallery per apartment would help quality review.
- **Bulk task assignment from diagram** — the bulk-select mode could be extended to create one task per selected apartment simultaneously.

### Infrastructure improvements (if scaling to many users)

- **Enable Firestore offline persistence** — switching from `getFirestore(app)` to `initializeFirestore(app, { localCache: persistentLocalCache() })` would give offline write queuing for free, eliminating silent data loss when editing on a flaky connection.
- **Field-level merge writes** — instead of writing whole apartment documents, writing only changed fields would prevent two admins editing different fields of the same apartment from clobbering each other.
- **Role-based access control** — currently all admin users have identical permissions. A read-only viewer role would be the simplest first step.

---

## Repository

GitHub: `yitzchak-hash/wolfson-management-app`
Hosting: Vercel (auto-deploys on push to the connected branch)
