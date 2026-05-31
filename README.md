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

### Contractor Portal
Public URL at `/c/:token` — no login required. Contractors can:
- View their assigned apartments on a building map with schedule labels (Today/Tomorrow/Overdue)
- Filter assignments by timeframe
- Upload photos (compressed base64), add notes, mark tasks complete
- View engineering plans PDF (from Google Drive)

### Tasks
Dedicated `/tasks` page for assigning, editing, and completing contractor tasks. Supports due dates with countdown badges (Overdue / Today / Tomorrow / N days).

### Stage Management
Configurable stages with custom colors and sort order. Bulk-update apartments to a new stage from the diagram view.

### Apartment Features
- Merge two apartments into one unit (bilateral link, synced stage/classification/drive)
- Disconnect merged apartments with a data-ownership choice
- Classification: `standard` or `shinui` (displayed as "Changes")
- Google Drive link — main folder + auto-detected engineering plans PDF
- Drive health report (checks folder structure)

### Backup / Restore
Full JSON export/import from Settings → App → Backup. Includes all photos.

## Google Drive Setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project.
2. Enable the **Google Drive API**.
3. Create an **OAuth 2.0 Client ID** (Web application). Add your app's origin to Authorized JavaScript origins.
4. Paste the Client ID into Settings → App → Google Drive.
5. Click **Connect** to authorize read access.

## Data Model Notes

- **Building IDs**: `A1`, `A2`, `A3`
- **Apartment numbering**: 1–52 (floors 2–14, 4/floor), 53–54 (floor 15), 55–56 (floor 16), 57+ (basement)
- A1 is missing apartment 37 (`isUnnamed: true` placeholder)
- Bumping `DATA_VERSION` in `initialData.ts` wipes localStorage (dev only)
