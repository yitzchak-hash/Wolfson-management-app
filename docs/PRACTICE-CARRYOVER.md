# Updates to carry into Wolfson Practice

**Wolfson Practice** is the branch `claude/practice` (its own practice database, used to work on the CRM link). It is
NEVER touched from the regular work chat (owner, 2026-11-04). That chat keeps doing the normal updates on the preview
branch and lists each one here, so they can all be brought across to Practice in one go when the day's round goes live.

Practice was cut at production `4ff0b5d` (2026-11-03, "the apartment labels lie above the plan's lines"), so every
change after that commit belongs in this list.

## Waiting to be brought across
| Date | What changed (plain words) | Where in the code | Commit |
|------|----------------------------|-------------------|--------|
| 2026-11-04 | Share opens the phone's share menu on the FIRST tap (the PDF is made ready while the plan is on screen) | `src/data/sharePlan.ts`, the drawer's warm-up | see git log after 4ff0b5d |
| 2026-11-04 | A Share button in the plan's black zoom bar, beside the plan (inline and full screen) | `PlanAnnotator.tsx` (`onShare` prop), `ApartmentDetailDrawer.tsx` | ″ |
| 2026-11-04 | The page count "1 / 2" stays on one line in a narrow plan panel | `PlanAnnotator.tsx` (zoom bar) | ″ |
| 2026-11-04 | Board · Building on a phone held upright (the stage filter bar steps aside in Building) | `ProjectDiagramPage.tsx` | ″ |

## Already brought across
(nothing yet)
