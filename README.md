# Wolfson Management App

Internal project-management system for TzviAir's HVAC installation across W Residence (buildings A1, A2, A3). Tracks apartment-level progress through installation stages, contractor assignments, photo evidence, and engineering plans.

## Tech Stack

- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS v3** — light/dark theme toggle persisted in localStorage
- **Zustand v5** — state management with localStorage persistence
- **React Router v6** — nested routes under `AppLayout`
- **Firebase Firestore** — optional real-time sync (falls back to localStorage)
- **date-fns** — date formatting
- **lucide-react** — icons

## Getting Started

```bash
npm install
npm run dev
```

For Firebase + Google Drive, copy `.env.example` to `.env.local` and add your credentials.

## Project Structure

```
src/
  types/index.ts          — shared TypeScript interfaces
  data/
    store.ts              — Zustand store (all state + actions)
    initialData.ts        — seed data (bump DATA_VERSION to reset)
    firebase.ts           — optional Firestore helpers
    driveApi.ts           — Google Drive API v3 helpers
  pages/
    ProjectDiagramPage    — main building diagram view
    TasksPage             — contractor task management
    DashboardPage         — summary metrics
    AnalyticsPage         — progress charts
    ContractorPortal      — public /c/:token contractor view
    SettingsPage          — stages, users, contractors, app config
  components/
    layout/               — AppLayout, Header, Sidebar
    apartment/            — ApartmentDetailDrawer, QuickAddTaskPanel, StageNotesSection, ActivitySection
    diagram/              — BuildingDiagram, AptCell, StageLegend
    dashboard/            — summary cards
    reports/              — table + CSV export
    ui/                   — Toast, shared primitives
```

## Key Features

### Building Diagram
Visual floor-plan grid for all three buildings (A1, A2, A3). Each apartment cell shows:
- Stage color and name
- Pending task summary (contractor name + count)
- Next stage hint
- **"+" button** to open a quick-add task panel without leaving the diagram
- Changes (shinui) badge

### Apartment Detail Drawer
Right-side drawer with 4 tabs:
- **Details** — stage, classification, Drive link, plans PDF
- **Tasks** — all active/completed assignments for that apartment; mark complete inline; pending badge
- **Stages** — per-stage notes
- **History** — activity log for that apartment

### Contractor Portal
Public URL at `/c/:token` — no login required. Contractors can:
- View their assigned apartments on a building map with schedule labels (Today/Tomorrow/Overdue)
- Filter assignments by timeframe
- Upload photos/videos/files, add notes, mark tasks complete (requires at least one uploaded file)
- View engineering plans PDF (from Google Drive)
- Task attachments: contractors see files attached by admin at task-creation time

### Tasks
Dedicated `/tasks` page for assigning, editing, and completing contractor tasks. Supports due dates with countdown badges (Overdue / Today / Tomorrow / N days). Task creation supports file attachments (images, PDFs, docs).

### Stage Management
Configurable stages with custom colors and sort order. Bulk-update apartments to a new stage from the diagram view.

### Apartment Features
- Merge two apartments into one unit (bilateral link, synced stage/classification/drive)
- Disconnect merged apartments with a data-ownership choice
- Classification: `standard` or `shinui` (displayed as "Changes")
- Google Drive link — main folder + auto-detected engineering plans PDF
- Drive health report (checks folder structure)

### Backup / Restore
Full JSON export/import from Settings → App → Backup. Supports scheduled backups (every activity / daily / weekly / monthly) with a history log. Backups can be uploaded automatically to Google Drive.

### Settings
- **Stages / Users / Contractors** — full CRUD
- **App** — theme, backup schedule, backup history, Drive backup folder
- **Language** — edit all text shown in the contractor portal (supports Hebrew RTL)

## Firebase Setup

This app uses Firebase Firestore as its primary database. All collections sync in real time across browser tabs and devices.

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com).
2. Enable **Firestore Database**.
3. Copy `.env.example` to `.env.local` and fill in the `VITE_FIREBASE_*` values.
4. In production, add those same values to the **Vercel environment variables** dashboard.

On first login after Firebase is configured, the app automatically pushes all local data to Firestore.

## Google Drive Setup (File Uploads)

File uploads go through a service-account backend — no OAuth popup required.

1. Create a Google Cloud project and enable the **Google Drive API**.
2. Create a **Service Account** and give it Contributor access to your Drive folder.
3. Download the service account JSON and paste it as `GOOGLE_SERVICE_ACCOUNT_JSON` in Vercel.
4. Add `API_KEY` (any random secret) to Vercel and set `VITE_DRIVE_API_KEY` to the same value.
5. Paste the target Drive folder URL into each apartment's Drive link field.

The `/api/drive-session.js` endpoint creates a resumable upload URL; the browser streams the file directly to Drive so Vercel never handles the bytes.

## Data Model Notes

- **Building IDs**: `A1`, `A2`, `A3`
- **Apartment numbering**: 1–52 (floors 2–14, 4/floor), 53–54 (floor 15), 55–56 (floor 16), 57+ (basement)
- A1 is missing apartment 37 (`isUnnamed: true` placeholder)
- Bumping `DATA_VERSION` in `initialData.ts` wipes localStorage (dev only)
- Binary data (`dataUrl` on photos, files, task attachments) is stored in localStorage only — Firestore stores metadata only to stay under the 1 MB document limit
