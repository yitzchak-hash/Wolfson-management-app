# Wolfson Management App — Developer Notes

## Project Overview
Internal project-management system for TzviAir's HVAC installation across W Residence (buildings A1, A2, A3).
Tracks apartment-level progress through installation stages, contractor assignments, and photo evidence.

## Tech Stack
- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS v3** (dark theme default; light theme toggle stored in localStorage)
- **Zustand v5** for state (auto-persists to localStorage via `persist()`)
- **React Router v6** (nested routes under `AppLayout`)
- **Firebase Firestore** (optional — falls back to localStorage if not configured)
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

## Directory Layout
```
src/
  types/index.ts          — all shared TypeScript interfaces
  data/
    store.ts              — Zustand store (state + all actions)
    initialData.ts        — default seed data (bump DATA_VERSION to reset)
    firebase.ts           — optional Firestore helpers
    driveApi.ts           — Google Drive API helpers (OAuth, folder listing, health check)
  pages/
    ProjectDiagramPage    — building diagram with filters + bulk edit
    DashboardPage         — summary cards
    TasksPage             — contractor task management (dedicated page, /tasks route)
    AnalyticsDashboard    — stage/building analytics
    ReportsPage           — CSV export
    ActivityLogPage       — global change log
    SettingsPage          — stages / users / contractors / app (theme, Drive, backup)
    ContractorPortal      — public /c/:token page (tasks + building map)
    LoginPage
  components/
    layout/               — AppLayout, Header, Sidebar
    apartment/            — ApartmentDetailDrawer, StageNotesSection, ActivitySection
    diagram/              — BuildingDiagram (supports compact, highlightedApartmentIds, aptSubLabels)
    dashboard/            — summary cards
    reports/              — table/export
    ui/                   — Toast, shared primitives
```

## Data Model Key Points
- **Building IDs**: `A1`, `A2`, `A3`
- **Apartment numbering per building**: 1-52 (floors 2-14, 4/floor), 53-54 (floor 15, 2 wide), 55-56 (floor 16, 2 wide), basement slots 57+ (unnamed by default)
- **A1 is missing apartment 37** (blank placeholder with `isUnnamed: true`)
- **No duplex apartments** — `isDuplexApt` field retained for data compat but always `false`
- **Classification**: `'standard'` or `'shinui'` (displayed as "Changes" in UI, internal value preserved)
- **mergedWith**: optional field on Apartment for buyer-merged units (bilateral link, managed via `mergeApartments()` action)
- **Merged apartment sync**: `currentStageId`, `classification`, `driveLink`, and `plansPdfLink` auto-sync to the partner on every `updateApartment` call
- **unmergeApartments(aptId, keepDataAptId, user)**: unlinking action; `keepDataAptId` is `aptId | partnerId | 'both'`; the loser gets `currentStageId=null`, `driveLink=undefined`, `plansPdfLink=undefined`
- **driveLink**: Google Drive folder URL for the apartment; stored on Apartment, editable in drawer
- **plansPdfLink**: Google Drive file URL for the Engineering Plans PDF; shown as embedded iframe viewer + download in both admin drawer and contractor portal
- **DATA_VERSION** in `initialData.ts` — bumping forces a localStorage reset (dev only; production data would need a migration)

## Contractor Portal
- Public URL: `/c/:token` — no auth required, token-based access
- Contractors have category: `'drywall' | 'ac' | 'general'`
- Each contractor has a unique random token; link is copyable from Settings > Contractors
- Assignments link contractor → apartment with task description, stage, due date
- Two tabs: **My Tasks** (assignment cards with countdown badges) and **Building Map**
- Building map highlights assigned apartments with gold glow; filter buttons: All / Overdue / Today / Tomorrow / This Week
- Each highlighted cell shows a tiny schedule label (Today / Tomorrow / Overdue / date) at cell bottom
- Contractor can upload photos, videos, and files; office notes visible read-only
- **Completed button is disabled until at least one file exists**
- Engineering Plans PDF shown in task detail sheet when `apartment.plansPdfLink` is set
- File storage: images compressed (max 1200px, 72% JPEG), videos/files stored as raw base64 (max 50 MB)
- `ContractorPhoto.fileType`: `'image' | 'video' | 'file'` (default `'image'` for backward compat)

## Backup / Restore
- **Export**: full JSON snapshot of all app data including photos (Settings > App > Backup)
- **Import**: upload JSON to fully restore state
- Version field in export for forward-compat checks

## Key Conventions
- **No DATA_VERSION bump** without explicit need — it wipes all user data
- All store mutations call `persist(get)` + `fsSet(...)` for Firebase sync
- Loggable fields (those that appear in activity log): `currentStageId`, `classification`, `generalNotes`, `displayName`
- CSS colors: primary `#1e3a5f` (navy), accent `#4aa8d8` (blue), amber for Changes badge
- Always use Tailwind utility classes; only reach for inline `style` for dynamic/computed values
- Contractor token generation: `generateToken()` → 24-char alphanumeric random string
- `getDueBadge(dueDate)` → `{ text, cls }` — shared countdown badge logic (copy used in TasksPage and ContractorPortal)
- **Always update this CLAUDE.md** when new types, pages, or conventions are added

## Tasks Page
- Route: `/tasks` — requires auth, accessible via sidebar (ClipboardList icon, between Dashboard and Analytics)
- Full CRUD for contractor assignments: create, inline edit, mark complete/incomplete, delete
- Filter by contractor; sorted incomplete-first then by due date
- Countdown badges via `getDueBadge()` for overdue/today/tomorrow/within-3-days tasks

## Google Drive Integration
- **Client ID**: stored in Zustand as `googleClientId` (persisted to localStorage); entered in Settings → App
- **Access token**: stored as `googleAccessToken` + `googleTokenExpiry` in Zustand (session-only, not persisted)
- **OAuth flow**: `requestGoogleToken(clientId)` in `driveApi.ts` loads Google Identity Services (GIS) dynamically and opens consent popup
- **Scope**: `https://www.googleapis.com/auth/drive.readonly`
- **Helpers in `src/data/driveApi.ts`**:
  - `extractFolderId(url)` — pull folder ID from any Drive folder URL
  - `extractFileId(url)` — pull file ID from any Drive file/doc URL
  - `drivePreviewUrl(fileId)` → embed URL for iframe PDF viewer
  - `driveDownloadUrl(fileId)` → direct download link
  - `checkFolderHealth(driveLink, plansPdfLink, token)` → `FolderHealth` with subfolder/PDF presence
  - `findPlansPdf(driveLink, token)` → finds PDF inside "Engineered Plans" subfolder
- **Setup**: Google Cloud Console → New Project → Enable Drive API → OAuth 2.0 Client ID (Web application, origin = app URL)

## Firebase Setup (Optional)
- Copy `.env.example` to `.env.local` and add your Firebase config
- On first login the app pushes local seed data to Firestore
- Real-time listeners sync changes across browser tabs / devices
