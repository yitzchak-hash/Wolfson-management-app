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

## Directory Layout
```
src/
  types/index.ts          — all shared TypeScript interfaces
  data/
    store.ts              — Zustand store (state + all actions)
    initialData.ts        — default seed data (bump DATA_VERSION to reset)
    firebase.ts           — optional Firestore helpers
  pages/                  — top-level route components
  components/
    layout/               — AppLayout, Header, Sidebar
    apartment/            — ApartmentDetailDrawer, StageNotesSection, ActivitySection
    diagram/              — BuildingDiagram, AptCell
    dashboard/            — summary cards
    reports/              — table/export
    settings/             — stage/user/contractor editors
    ui/                   — Toast, shared primitives
```

## Data Model Key Points
- **Building IDs**: `A1`, `A2`, `A3`
- **Apartment numbering per building**: 1-52 (floors 2-14, 4/floor), 53-54 (floor 15, 2 wide), 55-56 (floor 16, 2 wide), basement slots 57+ (unnamed by default)
- **A1 is missing apartment 37** (blank placeholder with `isUnnamed: true`)
- **No duplex apartments** — `isDuplexApt` field retained for data compat but always `false`
- **Classification**: `'standard'` or `'shinui'` (displayed as "Changes" in UI, internal value preserved)
- **mergedWith**: optional field on Apartment for buyer-merged units (bilateral link, managed via `mergeApartments()` action)
- **DATA_VERSION** in `initialData.ts` — bumping forces a localStorage reset (dev only; production data would need a migration)

## Contractor Portal
- Public URL: `/c/:token` — no auth required, token-based access
- Contractors have category: `'drywall' | 'ac' | 'general'`
- Each contractor has a unique random token; link is copyable from Settings > Contractors
- Assignments link contractor → apartment with task description, stage, due date
- Contractor can upload photos and add notes; office notes visible read-only
- **Completed button is disabled until at least one photo exists**
- Photo storage: compressed base64 in localStorage (max ~800px, 70% quality) — planned migration to Google Drive

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
- **Always update this CLAUDE.md** when new types, pages, or conventions are added

## Google Drive Integration (Planned)
- OAuth 2.0 client credentials stored in `.env` (not committed)
- Photos uploaded to a per-apartment Drive folder; `dataUrl` field in `ContractorPhoto` replaced with `driveFileId + driveUrl`
- Setup guide: see the Google Drive API Setup section in Settings once credentials are configured

## Firebase Setup (Optional)
- Copy `.env.example` to `.env.local` and add your Firebase config
- On first login the app pushes local seed data to Firestore
- Real-time listeners sync changes across browser tabs / devices
