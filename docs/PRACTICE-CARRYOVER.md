# Updates to carry into Wolfson Practice

**Wolfson Practice** is the branch `claude/practice` (its own practice database, used to work on the CRM link). It is
NEVER touched from the regular work chat (owner, 2026-11-04). That chat keeps doing the normal updates on the preview
branch and lists each one here, so they can all be brought across to Practice in one go when the day's round goes live.

**This chat has NO access to Practice** (owner, 2026-11-05): it never reads or changes the Practice branch, its
database or its preview. This list is only a note of what changed here, for whoever works on Practice.

Practice was cut at production `4ff0b5d` (2026-11-03, "the apartment labels lie above the plan's lines"), so every
change after that commit belongs in this list.

## Waiting to be brought across
| Date | What changed (plain words) | Where in the code | Commit |
|------|----------------------------|-------------------|--------|
| 2026-11-04 | Share opens the phone's share menu on the FIRST tap (the PDF is made ready while the plan is on screen) | `src/data/sharePlan.ts`, the drawer's warm-up | 5e8d7f9 (all four rows) |
| 2026-11-04 | A Share button in the plan's black zoom bar, beside the plan (inline and full screen) | `PlanAnnotator.tsx` (`onShare` prop), `ApartmentDetailDrawer.tsx` | ″ |
| 2026-11-04 | The page count "1 / 2" stays on one line in a narrow plan panel | `PlanAnnotator.tsx` (zoom bar) | ″ |
| 2026-11-04 | Board · Building on a phone held upright (the stage filter bar steps aside in Building) | `ProjectDiagramPage.tsx` | ″ |

| 2026-11-05 | The Building view opens first, on every device (Bulk Update and a search's "show me where" bring the board up) | `ProjectDiagramPage.tsx` | (this round) |
| 2026-11-05 | A still tap on the plan in the phone's Plan tab opens it full screen | `ApartmentDetailDrawer.tsx` (`data-plan-tap-full`) | ″ |
| 2026-11-05 | The worker's Share has its PDF ready before the tap (iPhone / Samsung) | `ContractorPortal.tsx` | ″ |
| 2026-11-05 | The top bar never overlaps on a 344–420 wide phone (the name gives way; What's New steps aside under 400) | `Header.tsx` | ″ |
| 2026-11-05 | Building view: the two cards never overlap on a phone; the floor is drawn big on an upright tablet | `buildingView.css` | ″ |

| 2026-11-05 | The phone's bottom bar has no List tab (the address /list still opens, nothing links to it) | `Sidebar.tsx` (MobileNav) | ″ |

| 2026-11-08 | Dictation: keeps listening, adds to the words, the live line, Stop and Send (every message box and the searches) | `src/data/dictation.ts`, `LiveWave.tsx`, `MessageBox.tsx`, `voiceSearch.ts`, the two searches | ″ |
| 2026-11-08 | Uploads are seen: "Uploading…" with a bar in the box, a corner card elsewhere; paperclip handlers wait for their uploads | `uploadTracker.ts`, `UploadToasts.tsx`, `driveApi.ts` (window event), ProblemForm, StageNotes, drawer, PlanPin, TasksPage | ″ |
| 2026-11-08 | The plan's zoom bar fits a 360-wide phone (Share shows its icon only under 420) | `PlanAnnotator.tsx` | ″ |

| 2026-11-08 | Sign out asks "Sign out?" first (the header's exit icon — the only sign-out in the app) | `Header.tsx` (`data-sign-out-ask`) | ″ |

| 2026-11-08 | Tzvi's inspections: an Inspection button on the Stages (his user only), photo / video / gallery to Drive › Photos › Inspections, a green "Inspected by Tzvi ✓" row after the last finished stage, expandable | `types` (`Inspection`, `Apartment.inspections`), `StageSection.tsx`, `ApartmentDetailDrawer.tsx` | ″ |
| 2026-11-08 | Inspection opens a camera inside the app (many shots, video, gallery, then Done); uploads within 30 min fold into the same inspection (`Inspection.lastAt`) | `InspectionCamera.tsx`, `ApartmentDetailDrawer.tsx`, `types` | ″ |
| 2026-11-08 | Vibration: a tick on a floor change, a tap on the shutter (`haptic()`) | `src/data/haptics.ts`, `BuildingView.tsx`, `InspectionCamera.tsx` | ″ |
| 2026-11-08 | Vibration everywhere he chose: apartment opens (tick), stage done / task closed (success — the task one in the store's `updateContractorAssignment`), a message sent (tap), an error toast (warn); hold a flat on the building = buzz + lit, not opened | `ApartmentDetailDrawer.tsx`, `StageSection.tsx`, `store.ts`, `MessageBox.tsx`, `Toast.tsx`, `BuildingView.tsx` (`holdOf` / `heldClick`) | ″ |
| 2026-11-08 | iPhone ticks: every buzz also fires INSIDE the tap (apartment open from board/building, floor rail press, the lift of a floor swipe and of a hold); `haptic()` skips a same-kind repeat within 150 ms, `hapticOnLift()` is iPhone-only; no iPhone callout on the building | `haptics.ts`, `BuildingView.tsx`, `buildingView.css`, `ProjectDiagramPage.tsx` | ″ |
| 2026-11-09 | Scan reading (OCR of a scan's title block) switched OFF before go-live by the owner ("leave 3 out"): `SCAN_READING_ON = false` in planOcr.ts gates the title-block read and the box read; its What's New line removed | `planOcr.ts`, `planAddress.ts`, `whatsNew.tsx` | ″ |
| 2026-11-09 | Inspection video by the phone's own camera (input capture, full quality and sound) instead of MediaRecorder; the viewer waits for a press to play (sound), switches to Drive's player only when ours refuses the film (no 8 s switch); a job with no Drive folder saves to the general folder › "Jobs without a Drive folder" (inspections, stage notes, problem form, job notes, office thread, task files), a film with no folder anywhere is refused out loud; Netiv: B2 left, B1 right | `InspectionCamera.tsx`, `MediaViewer.tsx`, `src/data/jobFolder.ts`, `ApartmentDetailDrawer.tsx`, `StageNotesSection.tsx`, `ProblemForm.tsx`, `BuildingDiagram.tsx`, `ProjectDiagramPage.tsx` | ″ |
| 2026-11-09 | A Drive video that our player refuses or that has not started in 8 s opens in Drive's own player (iPhone web recordings are "length unknown" MP4s); the in-app camera records video at 720p, ~3 Mbit/s; a picture kept in the record (no Drive folder) is shrunk to 1280 px first | `MediaViewer.tsx` (`data-viewer-drive-player`), `InspectionCamera.tsx`, `ApartmentDetailDrawer.tsx` | ″ |
| 2026-11-08 | Netiv building view: a BuildingPlan per project (Wolfson's unchanged, Netiv's traced off the AC engineer's B2 sheets — ground, typical 2–7, 7, 8; floors 1 and 10 estimated, B1 drawn as B2); duplexes on two floors; cards in middle spots for 5–6 flats; All = B1 + B2; short floor names on the rail and plate | `buildingPlan.ts`, `netivPlan.ts`, `BuildingView.tsx`, `BuildingTrio.tsx`, `buildingView.css`, `ProjectDiagramPage.tsx`, `public/building/netiv-*.png` | ″ |
| 2026-11-08 | Netiv board wears the Wolfson tile and tall floors (B1/B2, apartment 1 on the ground row too); a tile's "stages done" line sits just above its strip | `BuildingDiagram.tsx`, `floorRows.ts` | ″ |
| 2026-11-08 | Building view fits a short screen: no 560px floor (380), the plate capped by the stage height (container query, 100cqh), smaller corner cards under 470px; the unit counts stack beside Print under 1280px | `buildingView.css`, `ProjectDiagramPage.tsx` (`data-quick-stats`) | ″ |
| 2026-11-08 | Photos tab: Select → pick → Delete, Tzvi's user only; Drive files to Drive's trash (`api/drive-upload.js` mode `trash-files`, no new function), their site records removed | `ApartmentDetailDrawer.tsx` (`data-photos-select*`), `src/data/driveTrash.ts`, `api/drive-upload.js` | ″ |
| 2026-11-08 | Photos tab: pictures and videos only; "Show all files" switch | `ApartmentDetailDrawer.tsx` (`data-photos-all-files`) | ″ |
| 2026-11-08 | Sideways Fold: the plan pane takes at least half the window; the side pane opens on the whole sheet | `ApartmentDetailDrawer.tsx` (`fieldsW`), `PlanAnnotator.tsx` (embedded fit) | ″ |
| 2026-11-09 | Worker portal: the day chips (All … This Week) wrap inside the screen instead of scrolling past its edge — one line when they fit, else 3 + 2 | `src/components/portal/DayFilterChips.tsx` (new), `ContractorPortal.tsx`, `whatsNew.tsx` | branch `claude/portal-week-fit` |
| 2026-11-09 | The tablet studio ("The Studio on the Tablet", every star): a touch screen ≥600px on both sides gets one 56px bar (‹ · name · v · undo/redo · Save · ⋯), 56px tiles, upright a docked ink tray under the sheet, sideways an ink pill + side tray, the pen tray docked (never over the plan), zoom/pager in the floating pill, Neat shapes behind ⋯, full bleed on a Pan tap, pen draws / finger moves once a pen is seen; Settings → This computer: Drawing hand, Finger draws too | `PlanAnnotator.tsx` (`tablet`), `src/data/tabletStudio.ts` (new), `deviceOnly.ts`, `SettingsPage.tsx` | (this round) |
| 2026-11-09 | Scanned and photographed plans read their own title block by OCR (tesseract.js, lazy): address, phone, floor and scale, each with its box and cutout; a picture plan can be read too | `src/data/planOcr.ts` (new), `planAddress.ts`, `PlanAddressSuggest.tsx`, `package.json` | ″ |
| 2026-11-09 | Job search: among equally good matches, the job whose Drive folder moved most recently comes first; "Drive · 2h ago" in the header search | `searchIndex.ts`, `driveActivity.ts`, `GlobalSearch.tsx`, `SearchTileWidget.tsx`, `ImportBatchWindow.tsx`, `types` | ″ |
| 2026-11-09 | One upload card for a whole batch ("Uploading n of N", one bar over all the bytes); the Inspection button stays usable while a batch goes up (batches fold into one inspection, the save reads the record fresh); "Phone camera" in the inspection camera (the phone's own photo camera, one per trip, into the strip); the Photos tab shows inspection files off the record at once (no-Drive-folder jobs too) | `uploadTracker.ts`, `driveApi.ts`, `UploadToasts.tsx`, `ApartmentDetailDrawer.tsx`, `StageSection.tsx`, `InspectionCamera.tsx` | ″ |
| 2026-11-09 | Stage colour picker: ten numbered colours on top (1 white = not sold … 10 maroon) | `SettingsPage.tsx` (`STAGE_LADDER`, `ColorPickerWithPresets ladder`) | ″ |
| 2026-11-09 | Sound audit fixes: `api/drive-fetch.js` maxDuration 60 → 300 (a long film was cut mid-stream and fell to Drive's player); Drive's player iframe no longer allowed to autoplay (it would start muted); a VideoTile's play press opens the viewer when it has one (iPhone refused the play after await + rAF) | `vercel.json`, `MediaViewer.tsx`, `VideoTile.tsx` | ″ |
| 2026-11-09 | Installation (stage named Installation / התקנה) is one tap: done, and the job window closes (an error toast if the record did not take it); the Contractor selector (Yaakov · Daniel · Igor, `Apartment.crew`) beside Tipus | `stageMarks.ts` (`isOneTapStage`, `tapMark`), `StageSection.tsx`, `StagePicker.tsx`, `ApartmentDetailDrawer.tsx`, `types` | ″ |

## Already brought across
(nothing yet)
