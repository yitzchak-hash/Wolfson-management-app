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

## Already brought across
(nothing yet)
