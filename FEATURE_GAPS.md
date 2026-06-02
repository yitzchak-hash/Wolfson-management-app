# Wolfson Management App — Feature Gap Analysis

**Date:** June 2, 2026  
**Project:** TzviAir HVAC Installation — W Residence (Buildings A1, A2, A3)  
**Prepared for:** Internal use / Product planning

---

## 1. Executive Summary

The Wolfson Management App is a purpose-built construction project management system tracking HVAC installation across ~168 residential apartments spread across three buildings (A1, A2, A3). Its primary user base splits into two groups: **office admins** (authenticated) who manage progress and assign work, and **field contractors** (token-based, public) who receive tasks and upload photo evidence.

The app is genuinely functional and production-ready for its core loop: set a stage on an apartment, assign a contractor task, contractor uploads photos, office confirms completion. The Firebase + Google Drive integration provides real cloud sync and media storage. The Building Diagram is a standout feature — a true visual floor plan that instantly communicates project status.

However, several workflows common in construction project management are either absent, incomplete, or require too many manual steps. This report documents those gaps, ranked by operational impact.

---

## 2. Current Features (by Module)

### 2.1 Project Diagram (`/project`)
- Visual building floor plan for A1, A2, A3 (correct floor/column layout including basement)
- Color-coded apartment cells by current installation stage
- Filters: by building, stage, classification (Standard / Changes), and apartment search
- "Changes" (shinui) badge overlay toggle
- Bulk-select mode with batch stage assignment
- Apartment sub-labels showing contractor name and pending task count in each cell
- "Next stage" label shown in cell
- Completed-task green indicator
- Click any apartment to open ApartmentDetailDrawer

### 2.2 Apartment Detail Drawer
- 4 tabs: Details, Tasks, Stages, History
- **Details tab:** family name, current stage dropdown, classification toggle, general notes, Drive folder link, Engineering Plans PDF link, apartment merge/unlink
- **Tasks tab:** all contractor assignments for this apartment; inline complete/uncomplete; pending count badge; Add Task button opening QuickAddTaskPanel
- **Stages tab:** per-stage notes with file attachment, contractor assignment dropdown per stage, contractor notes read-only display, stage-reached timestamps
- **History tab:** activity log entries for this apartment
- Auto-suggest "assign task" after stage change
- PDF viewer (embedded iframe) for Engineering Plans
- Drive photo gallery tab (lists all files in Drive folder via backend API, with lightbox)

### 2.3 Dashboard (`/dashboard`)
- Summary cards: Total Units, Not Started, Changes units, With Notes
- Stage breakdown bar chart (count + percentage per stage)
- Building-level progress bars (A1/A2/A3 started vs. total)
- Overall percentages: started, Changes count, Not Started
- Recent activity feed (last 10 entries)

### 2.4 Tasks (`/tasks`)
- Global task list across all apartments and contractors
- Filter by contractor
- Inline edit (description, due date, stage, completed state)
- Due-date countdown badges (Overdue / Today / Tomorrow / N days)
- File attachments on new tasks
- Create task form with contractor + apartment + stage + due date + attachments

### 2.5 Analytics (`/analytics`)
- Top stat cards: Total Apartments, Work Started, Active Contractors, Tasks Completed
- Progress by building (bar chart)
- Apartments per stage (bar chart)
- Contractor task summary (pending / completed / overdue counts + per-contractor done/total)
- Recent activity feed (last 15 entries)

### 2.6 Reports (`/reports`)
- Filterable table: building, classification, stage, apartment search, include-not-started toggle
- Column picker: building, apartment, floor, stage, classification, notes, last-updated, updated-by
- Optional per-stage notes columns
- CSV export and browser print

### 2.7 Activity Log (`/activity`)
- Chronological change log
- Filter by user or building
- Tracks: stage changes, classification changes, note updates, display name changes

### 2.8 Contractor Portal (`/c/:token`)
- Token-based public URL per contractor
- Two tabs: My Tasks list + Building Map
- Task detail sheet: task description, office note, engineering plans PDF, file/photo upload, contractor notes
- Upload hierarchy: Firebase Storage → Google Drive → base64 fallback
- Completed button (requires at least one file upload)
- Undo-complete within session
- Building map with gold-highlighted assigned apartments and schedule badges
- Map filter: All / Overdue / Today / Tomorrow / This Week
- Bilingual (Hebrew/English) with RTL support

### 2.9 Settings
- **Stages:** add, edit (name, color), reorder, activate/deactivate, delete
- **Users:** add, edit (name, role, code), activate/deactivate
- **Contractors:** add, edit, delete; copy portal link; category (drywall/AC/general)
- **App:** theme toggle (dark/light), auto-backup toggle, backup frequency, backup history log, Drive backup folder, export JSON, import JSON, Force Push to Firestore
- **Language:** full bilingual string editor for contractor portal UI with Reset to English/Hebrew presets, RTL toggle

### 2.10 Infrastructure
- Firebase Firestore real-time sync ("Firebase always wins" pattern)
- Firebase Storage for contractor photos
- Google Drive via service-account backend (photos + backups)
- localStorage tiered persistence (survives quota errors)
- Apartment merge/unlink with data sync to partner
- Stage date stamping (first time each stage is reached)

---

## 3. Feature Gaps

---

### HIGH PRIORITY — Day-to-day blockers or near-complete features

---

#### H1. No Notification / Alert System for Task Completion
**What is missing:** When a contractor marks a task complete, no signal reaches the office beyond the fact that a `completedAt` timestamp is now set. Office staff must actively navigate to Tasks or open the apartment drawer to discover completed work. There is no unread badge on the sidebar, no email alert, no in-app notification panel.

**Why it matters:** The completion event is the single most important handoff in the workflow. If the office misses it, the project stalls — the apartment's stage is not advanced, the next contractor is not scheduled, and the contractor may be kept waiting. On a 168-unit project with multiple crews, this could mean dozens of completions going unnoticed each day.

**Complexity:** Medium. An in-app "unreviewed completions" badge on the sidebar Tasks icon, plus a dedicated "Needs Review" filtered view in TasksPage, could be implemented in a day. Email alerts would require a serverless function (Vercel) + an email provider (e.g., SendGrid).

---

#### H2. Task Page Cannot Filter by Building, Stage, or Due-Date Range
**What is missing:** The Tasks page offers only a single contractor filter. There is no filter by building (A1/A2/A3), no filter by stage, no filter to show only overdue tasks or tasks due this week, and no sort control. The task list can grow to hundreds of entries across 168 apartments.

**Why it matters:** A project manager's daily workflow is "show me all overdue tasks" or "show me all A2 tasks due this week." Without these filters the Tasks page becomes unusable at scale; users must visually scan every row.

**Complexity:** Easy. The filter state is already a pattern well established in ReportsPage and ProjectDiagramPage. Adding building, stage, overdue/this-week date filters to TasksPage is a UI-only change — no store changes needed.

---

#### H3. Dashboard Does Not Show Task / Overdue Status
**What is missing:** The Dashboard summary cards show Total Units, Not Started, Changes, and With Notes. There is no card or widget for overdue tasks, pending tasks, or tasks completed today. The "recent activity" feed only shows stage/note changes, not task completions.

**Why it matters:** For a project manager opening the app each morning, the first screen should answer "what needs my attention right now?" Without overdue task counts, this dashboard requires a second navigation to Tasks. Two pages are essentially showing overlapping stage-progress data (Dashboard and Analytics) while the most operationally urgent metric — overdue work — is absent from both.

**Complexity:** Easy. The data is all in `contractorAssignments`. Three additional summary cards and a "Needs Attention" section with overdue/today tasks would complete the morning briefing view.

---

#### H4. Activity Log Does Not Record Task Events
**What is missing:** The activity log tracks apartment field changes (stage, classification, notes, display name) but does not record contractor assignment creation, completion, or deletion events. Contractor notes added via the portal also do not appear.

**Why it matters:** For audit and accountability purposes, knowing *when* a contractor was assigned, when they marked work done, and what notes they left is as important as knowing when a stage was set. If a dispute arises about whether work was completed before a deadline, the current log provides no evidence.

**Complexity:** Easy. `addActivityLog()` is already called inside store actions. Adding calls inside `addContractorAssignment`, `updateContractorAssignment` (on completion), and `addContractorNote` is mechanical.

---

#### H5. No Email Field on Contractors Is Actually Used
**What is missing:** The `Contractor` type includes an `email` field and the Settings UI allows entering it, but the email is never used anywhere — no invitation email when a contractor is added, no alert when they complete a task, no way to send the portal link via email from within the app.

**Why it matters:** The portal link sharing flow today requires manually copying a URL and pasting it into a messaging app or email client. For onboarding a new contractor this is an extra step that could cause errors (wrong link sent, link not sent at all). Email is already in the data model — it just needs to drive an action.

**Complexity:** Medium. Sending the portal link via email requires a Vercel serverless function + email provider. An easier first step is a "Copy link + instructions" button that pre-fills a mailto: URL with the portal link and a greeting template.

---

#### H6. QuickAddTaskPanel Requires a Drive Folder Before Creating a Task
**What is missing:** In `QuickAddTaskPanel`, the Add button is disabled (`disabled={!apartment.driveLink}`) unless the apartment has a Google Drive folder link set. This means office staff cannot create a task for any apartment that has not yet been linked to Drive. There is no fallback.

**Why it matters:** In the early stages of a project, many apartments may not have Drive folders set up yet (especially basements or units not yet reached). Blocking task creation entirely is a hard stop that forces a multi-step detour (open Details tab, set Drive link, come back, create task).

**Complexity:** Easy. The Drive folder is only needed if Drive upload is desired. The guard should be relaxed: allow task creation without a Drive folder, and only show the Drive warning when the attachment upload is attempted. The actual `addContractorAssignment` call does not require a Drive link.

---

#### H7. No "Stage History" — Only the Current Stage Is Tracked
**What is missing:** Each apartment stores only its `currentStageId` and `stageDates` (a map of stage → first-reached timestamp). There is no record of the full stage progression path: which stages were set, in what order, and by whom. Reverting a stage loses the previous stage date from the map because `stageDates` only records first-touch.

**Why it matters:** On a construction project, stages sometimes go backwards (rework required, failed inspection). The current model cannot distinguish an apartment that went A→B→C from one that went A→B→A→B→C. Without a proper stage history, the activity log entry for "stage changed" is the only record — and that is capped at 200 entries total.

**Complexity:** Medium. Adding a `stageHistory: { stageId, setAt, setBy }[]` array to the Apartment type, populated on each `updateApartment` call, would solve this without breaking anything. Display could be a timeline in the History tab.

---

#### H8. Reports Export Does Not Include Task Data
**What is missing:** The ReportsPage CSV export contains apartment-level data (stage, notes, classification) and per-stage notes. It does not include contractor assignments, their completion status, due dates, or the contractors assigned to each apartment.

**Why it matters:** Project stakeholders or clients asking for a progress report need to see not just which stage an apartment is in but which contractor is responsible and whether the work order is open or closed. The current CSV requires manual cross-referencing with the Tasks list.

**Complexity:** Easy-Medium. Adding optional columns for "Assigned Contractor(s)", "Open Tasks", "Completed Tasks", and "Next Due Date" to the column picker in ReportsPage would complete this. The data is already in the Zustand store.

---

### MEDIUM PRIORITY — Quality-of-life and useful additions

---

#### M1. No Deadline / Target-Completion Date Per Apartment
**What is missing:** Individual contractor tasks have due dates, but there is no higher-level target date for when a given apartment should reach a final stage. There is no field like "target completion date" or "handover date" on the Apartment model.

**Why it matters:** Building projects have floor-by-floor or block-by-block target dates driven by the client's occupancy schedule. Without this, the app cannot answer "which apartments are behind schedule at the apartment level?" rather than the task level. Stage-level timing can be inferred from `stageDates`, but there is no target to compare against.

**Complexity:** Medium. Adding `targetCompletionDate?: string` to the Apartment type and exposing it in the Details tab is straightforward. The harder part is aggregating these into a "schedule health" widget on the Dashboard.

---

#### M2. Contractor Portal Has No "Mark As Incomplete" History Visible to Office
**What is missing:** A contractor can undo a completion (the "Undo" button exists in the portal), but this action does not create an activity log entry, does not notify the office, and is invisible in the admin view. From the office's perspective, a completion that was undone looks the same as a task that was never completed.

**Why it matters:** If a contractor accidentally marks work done, undoes it, and then the office has already advanced the apartment stage based on the false completion, the project record is corrupted. Audit trails for undo events are important.

**Complexity:** Easy. Call `addActivityLog` inside `updateContractorAssignment` when `completedAt` is set back to null.

---

#### M3. Stage Notes Support Only One Attachment Per Stage
**What is missing:** `StageNote` has a single attachment (one file: `attachmentFilename`, `attachmentDataUrl`, `attachmentDriveFileId`). If a manager wants to attach two PDFs to a stage note (e.g., a drawing and an inspection report), only the second one survives.

**Why it matters:** In practice, stage documentation often includes multiple files: a materials spec, a site photo, an inspection certificate. The one-attachment limit creates a workaround where users must ZIP files or create multiple stage notes with dummy text to work around the constraint.

**Complexity:** Medium. The `StageNote` type would need `attachments?: StageNoteAttachment[]` replacing the single fields. Firebase and the UI would need updating. Backward compatibility with existing single-attachment data can be maintained during migration.

---

#### M4. No Global Search
**What is missing:** There is an apartment search field on the Project Diagram page and a separate one on Reports. There is no global search that spans apartment names, contractor notes, stage notes, and task descriptions simultaneously.

**Why it matters:** On a 168-unit project, a manager who remembers "there was a note about the elevator shaft" has no way to find it without browsing apartment by apartment.

**Complexity:** Medium. A keyboard-shortcut-triggered search modal (Cmd/Ctrl+K) that fuzzy-searches across apartment displayNames, generalNotes, stageNotes.noteText, and task descriptions would cover the most common lookups. All data is in Zustand state so no backend call is needed.

---

#### M5. Analytics Page Has No Time-Based Charts
**What is missing:** The Analytics page shows current snapshot data (how many apartments are at each stage right now) but has no historical charts. There is no "stages completed per week" trend, no velocity chart, no burndown chart showing rate of progress over time.

**Why it matters:** Trend data is essential for forecasting completion. Knowing that 4 apartments per week are reaching the final stage lets the PM predict when the project ends. The `stageDates` timestamps and `activityLogs` contain enough data to build a weekly progress chart.

**Complexity:** Hard (if using a chart library like Recharts or Chart.js). Medium if built with pure SVG/canvas bars. The data aggregation from `activityLogs` filtered by `fieldChanged === 'currentStageId'` and grouped by week is straightforward.

---

#### M6. Contractor Category Has Only Three Fixed Options
**What is missing:** Contractor categories are hardcoded as `'drywall' | 'ac' | 'general'`. There is no way to add a new category (e.g., 'plumbing', 'electrical', 'tiles') without a code change.

**Why it matters:** HVAC installation often involves sub-trades beyond drywall, AC, and general work. As the project evolves or if the app is used for other projects, the hardcoded categories will become a limitation.

**Complexity:** Medium. Storing categories as a configurable array in Settings (alongside Stages) rather than a TypeScript union type requires a data model change and Settings UI update.

---

#### M7. Task Priority / Urgency Field Is Missing
**What is missing:** All contractor tasks are equal in priority. There is no `priority` field ('urgent' / 'normal' / 'low') on `ContractorAssignment`. The only scheduling signal is the due date.

**Why it matters:** Sometimes a task is urgent (blocked by another crew, safety issue) but does not have an imminent due date. Priority flags let managers communicate urgency without manipulating dates.

**Complexity:** Easy. Adding an optional `priority?: 'urgent' | 'normal' | 'low'` field to `ContractorAssignment`, a selector in task creation, a colored badge in task cards, and sorting urgent tasks to the top of the contractor portal list would deliver this feature end-to-end.

---

#### M8. No Way to Duplicate / Template Tasks Across Multiple Apartments
**What is missing:** When the same work needs to be assigned to many apartments simultaneously (e.g., "run electrical conduit" for all apartments on floor 5 of building A2), the manager must create tasks one by one. Bulk task creation does not exist.

**Why it matters:** For uniform floor-by-floor work, bulk assignment is a major time saver. The Bulk Edit mode on the Project Diagram page can already set stages across multiple apartments — the same UX pattern could enable bulk task assignment.

**Complexity:** Medium. The bulk-select mode in ProjectDiagramPage already has the multi-apartment selection infrastructure. Adding a "Assign Task" button in bulk mode that opens a simplified task creation form (contractor + description + due date) and creates one `ContractorAssignment` per selected apartment would deliver this.

---

#### M9. Stage Notes Are Not Versioned — Edits Overwrite Silently
**What is missing:** `upsertStageNote` replaces the existing note text entirely. There is no version history, no "previous text" stored, and the `updatedAt`/`updatedBy` fields only reflect the latest save. If a manager accidentally overwrites an important note, it is unrecoverable unless a full backup is available.

**Why it matters:** Notes accumulate valuable information over the life of a stage. Accidentally overwriting a note that took 30 minutes to write is a real risk when multiple users share one login code or when a manager edits from memory.

**Complexity:** Medium. Storing `revisions: { text, updatedAt, updatedBy }[]` on `StageNote` and showing a "history" expander in the StageNotesSection would provide full versioning. A lighter approach is appending new text rather than replacing, with a timestamp per paragraph.

---

#### M10. ContractorPortal Does Not Support Multiple Contractors Sharing a Task
**What is missing:** A `ContractorAssignment` is linked to exactly one contractor. If two crews (e.g., AC + Drywall) need to coordinate on the same apartment at the same stage, two separate assignments must be created. The building map and task list show no cross-reference between these linked tasks.

**Why it matters:** In HVAC installation, AC rough-in and drywall closure are sequential dependencies. A drywall contractor often needs to see whether the AC team has completed their part before starting. Currently there is no dependency linking — the drywall contractor's portal shows only their own tasks with no visibility into the upstream AC task status.

**Complexity:** Hard. A dependency model (`dependsOn?: string[]` on `ContractorAssignment`) plus a status indicator in the contractor portal for upstream tasks would be the complete solution.

---

#### M11. No Photo Gallery at the Apartment Level (Admin View)
**What is missing:** The admin drawer has a "Photos" tab that loads files from the Google Drive folder, but it only works if Drive is configured and the apartment has a `driveLink`. Firebase Storage photos (uploaded by contractors) are only visible inside the individual task's contractor notes in the Stages tab — there is no combined gallery of all photos across all tasks for a given apartment.

**Why it matters:** A manager doing a quality review wants to see all photos for apartment A1-25 in one place, regardless of which task they were uploaded against. Currently they must open each assignment card individually.

**Complexity:** Medium. The `contractorPhotos` collection is already keyed by `apartmentId`. A dedicated gallery grid in the ApartmentDetailDrawer (or a tab) filtering `contractorPhotos` by `apartmentId` would deliver this without any data model changes.

---

#### M12. Login Is PIN-Only With No Role-Based Access
**What is missing:** All admin users share the same role system but there is no difference in access — every logged-in user can do everything. The `User.role` field exists but is purely decorative. There is no concept of a read-only viewer, a building-specific manager, or a superadmin who can manage users.

**Why it matters:** As the team grows (Wolfson site managers, subcontract supervisors, auditors), different people need different levels of access. An auditor should not be able to delete stages; a building A1 manager should not accidentally move A3 apartments. Without RBAC, onboarding more users means giving everyone full control.

**Complexity:** Hard for full RBAC. A simpler first step: two roles, `admin` (current behavior) and `viewer` (read-only, no mutations), with a role-toggle in User Settings. This reduces the risk while keeping implementation simple.

---

### LOW PRIORITY — Nice-to-have enhancements

---

#### L1. No Mobile App / Progressive Web App (PWA) Manifest
**What is missing:** The app has no `manifest.json` and no service worker. It cannot be installed to the home screen on iOS/Android as a PWA.

**Why it matters:** Contractors and site managers primarily use phones. A home-screen icon and offline capability would significantly improve the field experience. The contractor portal is already mobile-optimized in its UI.

**Complexity:** Easy (for basic PWA manifest and icon). Medium (for offline service worker with caching strategy).

---

#### L2. Stage Descriptions Are Stored But Never Displayed
**What is missing:** The `Stage` type includes a `description` field, and the Settings Stage editor has no input for it. The description is stored in the data but never shown anywhere in the UI.

**Why it matters:** New team members or contractors unfamiliar with the stage names benefit from a plain-language description of what "Stage 4 - Rough-in" means vs. "Stage 7 - Closure."

**Complexity:** Easy. Add a textarea for description in the StageSettings form and a tooltip on stage badges in the diagram and drawer.

---

#### L3. BuildingDiagram Renders Floor Labels in Hebrew
**What is missing:** `BuildingDiagram.tsx` hardcodes Hebrew labels for the roof row (`'גג'`) and the ground floor row (`'קרקע'`). The rest of the UI is fully internationalizable through `ContractorUiStrings`, but the diagram floor labels bypass this.

**Why it matters:** If the app is adapted for an English-language team or demoed to a client, the Hebrew labels on the diagram look inconsistent — especially since the rest of the admin UI is in English.

**Complexity:** Easy. These two string literals could be added to `ContractorUiStrings` or a new `AdminUiStrings` settings object.

---

#### L4. Backup Snapshots Are Limited to Apartment State Only
**What is missing:** `BackupSnapshot` stores apartment states, stage notes, and contractor assignments, but does not snapshot contractor photos metadata, contractor notes, or the stages/users/contractors definitions themselves. A restore from snapshot would leave the photo gallery intact but with potentially mismatched assignment IDs.

**Why it matters:** The partial snapshot creates a false sense of safety. A full restore needs all collections to be consistent.

**Complexity:** Medium. Expanding `BackupSnapshot` to include the full state (matching what `exportData()` already exports) would make snapshots and full exports equivalent.

---

#### L5. No Print View for the Building Diagram
**What is missing:** The Reports page has a `window.print()` button for the table. The Building Diagram has no print or PDF export. Site meetings often require printed floor plans with color-coded stages.

**Why it matters:** Physical printouts remain common on construction sites for team briefings.

**Complexity:** Medium. The `BuildingDiagram` already supports a `compact` mode which reduces cell heights. A print-optimized CSS `@media print` stylesheet that renders all three buildings side by side on a single landscape page would suffice.

---

#### L6. Activity Log Has No Date-Range Filter
**What is missing:** The Activity Log page can only filter by user or building. It has no date-range filter, no filter by action type (stage change vs. note change vs. rename), and no "last N days" quick filter.

**Why it matters:** The log is capped at 200 entries in normal operation. On an active project that cap fills quickly, making older entries unreachable. Date-range filtering lets managers review "what happened last week" without scrolling.

**Complexity:** Easy. Date range pickers + an action-type dropdown filter are pure UI additions.

---

#### L7. No Contractor Performance Metrics
**What is missing:** The Analytics page shows per-contractor done/total counts but does not show average time to complete tasks, percentage of tasks completed on-time vs. late, or a trend over time.

**Why it matters:** Understanding whether a contractor consistently completes work late or on-time is critical for future scheduling decisions and contract renewal.

**Complexity:** Hard. Requires time-to-completion calculations, historical data (which requires the stage history improvements from H7), and chart visualizations.

---

#### L8. Merge/Unlink UI Has No Validation Against Cross-Building Merges
**What is missing:** The apartment merge dropdown in ApartmentDetailDrawer allows selecting any apartment in the same building. There is no guard against merging an apartment with one that is already merged with a third apartment (creating a three-way merge chain), which the data model does not support.

**Why it matters:** A three-way merge would create orphaned `mergedWith` references and break the sync logic silently.

**Complexity:** Easy. Filter the merge dropdown to exclude apartments that already have a `mergedWith` value (unless it's the current apartment's partner).

---

## 4. Recommended Implementation Order

This order prioritizes operational impact and development speed. Changes that require no data model or backend changes come first.

### Phase 1 — Immediate (1–2 days each)

1. **H6 — Remove Drive folder requirement for task creation** — Fixes a hard workflow block; pure UI change.
2. **H2 — Task page filters (building, stage, overdue)** — Most-used daily filter; pure UI change.
3. **H3 — Dashboard task/overdue summary cards** — Completes the morning briefing view; read-only data display.
4. **L6 — Activity log date-range and action-type filters** — Pure UI; no model change.
5. **L2 — Stage description field in settings and tooltips** — Trivial UI; improves onboarding.

### Phase 2 — Short-term (2–4 days each)

6. **H1 — In-app unreviewed completions badge + "Needs Review" filter** — High operational value; no backend needed for in-app badge.
7. **H4 — Activity log records task events** — Important audit trail; store action changes only.
8. **H8 — Reports CSV includes task data columns** — Common stakeholder request; UI + data mapping.
9. **M7 — Task priority field** — Small model change, high UX value.
10. **M11 — Apartment-level photo gallery (Firebase photos)** — No model change; filter `contractorPhotos` by `apartmentId`.

### Phase 3 — Medium-term (1–2 weeks)

11. **H5 — Contractor portal link via mailto / email service** — Reduces onboarding friction.
12. **H7 — Stage history array on Apartment** — Data model + store change; enables Phase 4 analytics.
13. **M4 — Global search modal (Cmd+K)** — Requires in-memory search across all collections.
14. **M8 — Bulk task assignment from diagram** — Extends existing bulk-select infrastructure.
15. **M3 — Multiple attachments per stage note** — Type change + UI update; Firebase backward-compatible.
16. **M1 — Target completion date per apartment** — New field; small UI addition.

### Phase 4 — Long-term (weeks)

17. **M5 — Analytics time-based charts** (depends on H7 stage history)
18. **M12 — Role-based access control (admin/viewer)** (security prerequisite for wider rollout)
19. **M10 — Task dependency linking** (complex; requires UX design work)
20. **L1 — PWA manifest + service worker** (improves contractor portal mobile experience)
21. **M2 / M9 — Undo-complete audit trail + stage note versioning** (data integrity improvements)

---

*End of report.*
