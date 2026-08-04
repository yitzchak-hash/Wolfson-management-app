# TzviAir Job Management Platform — decision record

Every decision taken for the v2 rebuild, so nothing is re-litigated or forgotten.
Branch: `claude/tzviair-platform`. **Merge to main only at the very end.**

---

## 0. Non-negotiables

- **No data loss. Ever.** Every migration is additive-first, backed up before it runs, and reversible.
- **Backups keep working** through every change — verified after each phase, not assumed.
- All work on `claude/tzviair-platform`; main untouched until the end.

---

## 1. Naming & branding

| | |
|---|---|
| Name | **TzviAir Job Management Platform** |
| Applies to | browser tab title, login screen, print header, PWA manifest |
| Favicon | TzviAir logo (currently the default Vite icon — why Google shows a generic tab icon) |
| Vercel domain | rename, keep the old one redirecting so existing links survive |
| GitHub repo name | leave as-is (cosmetic; renaming breaks clones for no benefit) |

---

## 2. Navigation — **Option A**

- Colour identity per workspace: left rail, workspace chip in the header, sidebar accents.
- Project picker sits **on top** (header chip), as mocked.
- **No separate "Project" section header** in the sidebar — *Project Settings is simply another tab*
  in the same list as Dashboard, Calendar, Tasks, etc.
- **Home = the Job Board.** Not a project tile with a briefcase; the app's front door.
- **Calendar**: large button beside search (global). Per-project calendar is a sidebar tab under Dashboard.
- **Two settings, separated**:
  - **App settings** (top bar, beside search / night toggle): users, contractors, language, theme,
    backup, Firebase.
  - **Project settings** (sidebar tab): stages, **contractor status sheet link**, buildings/floors,
    project name + colour + logo, which contractors work here.

## 2.1 Per-project separation (the architectural fix)

- **Every stage belongs to exactly one project.** Today `projectId: undefined` means "shared by Wolfson
  AND Netiv" — they have never had their own stages. Existing shared stages get **copied** into both so
  nothing is lost.
- Fixes the reported bug: the drawer's filter
  `(!s.projectId || (isGeneral && s.projectId === 'general'))` shows General its own stages *plus* the
  shared ones. That is the mixing.
- Dashboard / Analytics / Reports / Tasks / Activity remain per-project and become reachable only from
  inside a project.

---

## 3. Project builder

Base design as mocked, **plus**:

- **Drag apartments** left/right and up/down within the grid; numbering re-flows automatically through
  the numbering rules.
- **Edit building names** inline.
- **Edit floor numbers/labels** manually.
- **AI import round-trip**:
  1. Button produces a **prompt** to copy.
  2. User pastes it into ChatGPT/Claude together with plans or diagrams.
  3. The AI returns **JSON**.
  4. User imports the JSON → app shows a **preview of the buildings**.
  5. Either *"looks right, done"* or *"import into the builder"* for small edits.

Numbering rules (unchanged): duplexes count once; hand-typed numbers are pinned; auto-number shows a
diff before applying; deleting a unit with history offers Archive instead.

---

## 4. Job Board

### Tiles
- Stage colour = **thicker border** (thicker than the mockup), never a full fill.
- Icons: real **Google Drive** icon, real **Zoho** icon, **architectural-plan** icon for plans.
- **Nicer icons throughout** — no plain emoji.
- **Hover tooltips on everything**, and **short** — always short.
- Last-edited on every job (using a content timestamp that ignores position-only moves).
- Photo-background tiles (optional 8) — yes.

### Bins — Done · Archive · Trash · Ready to Start
- They are **nodes on the board**: movable and **resizable**, not fixed docked bars, not reveal-on-drag.
- **Completely independent of stages.** A job can be at stage "Piping" and sit in Done. No interaction
  between the two systems.
- **Trash sits forever** — no auto-purge.
- Clicking a bin opens **a window on top of the main board** showing that collection, with
  **Restore / Move back to board**. Simpler chrome than the main board; viewing without restoring is fine.

### Toolbar
- Floating, movable, default right.
- **Text labels under each icon.**

### Board settings
- A settings panel for the board. First entry: **Show controls** → a small panel appears **top-right,
  above the toolbar**, listing mouse/keyboard controls in small type. **The toolbar auto-resizes** to fit.
- More settings to be proposed.

### Canvas mechanics
- Ctrl+wheel zooms the board (browser zoom suppressed).
- Pan, lasso, multi-select — exact bindings to be resolved technically without dropping anything.
- **Pinned titles exactly as specified**: locked vertically, free horizontally, scale with zoom.
  4px tall at 30% zoom is acceptable. Sliding off-screen horizontally is acceptable.
  *Owner's ruling: implement as described; solve the technical side.*
- Must work with the **Samsung interactive display and its two pens**.

### Right-click paste (idea A — approved, paste not drag)
Context-aware, driven by clipboard contents. Plain "Paste" stays disabled; only the matching action lights up.

**On a node:**
| Clipboard | Action | Behaviour |
|---|---|---|
| Drive URL | Paste as Drive link | if one exists → ask to replace; if not → fill in |
| Zoho URL | Paste as Zoho link | same |
| 2-digit number | Paste as apartment number | same |
| Short text | Paste as family name | same |

**On empty board:** Drive or Zoho link → *"Create new job with this link?"* → confirm → job created,
name derived from the Drive folder automatically.

### Ghost nodes
- Right-click a job → **Create ghost**. The ghost is **the same job**, not a copy — one record, shown in
  two places, so an edit in either is the same edit.
- Rendered **more transparent** than the real node, and freely draggable to anywhere on the board.
- A job may have several ghosts. Deleting a ghost removes only that appearance; the job itself is untouched.
- Purpose: let one job live in two contexts at once (e.g. under "This week" *and* under "Brooklyn")
  without duplicating data.

### Node store
- Not all nodes are the same size.
- **Countdown node** and **stopwatch node** — two separate nodes.
- **Voice memo** as an option attachable to a node.
- Right-click a node → **thumbs-up** reaction.
- Clip-art, bulletin board, whiteboard, paper document nodes.
- Freehand marker/pen drawing.

---

## 5. Job modal
- Replaces the drawer everywhere (Job Board, Wolfson, Netiv, future projects).
- **Bigger** — occupies the middle of the screen properly.

---

## 6. Calendar
- Much larger, full-bleed.
- **Jobs render as full nodes**, identical to the board — stage badge, Drive/Zoho/plans buttons,
  last-edited, everything.
- One job on a day → it fills the day cell. Several → they resize to fit, and **the week grows
  vertically** to accommodate.
- Filters kept; "Show completed" restyled as a modern switch.

---

## 7. Feature decisions (from the ranked 30)

| # | Feature | Decision |
|---|---|---|
| 23 | Stage board (Kanban) | **Yes** — main board + stage board. Dragging across stages **changes the stage**. Within a stage, sort vertically by **last modified**, newest on top |
| 24 | Mobile mode | **Yes — but after this whole list, on its own branch** |
| 25 | TV wallboard | **Yes, big one.** Link from **app settings**; open on a TV, press fullscreen. Also a **presentation mode** and a **literal job-board mode** on the TV. *Five totally different mockups requested, one as close to the job board as possible* |
| 26 | Comments/@mentions | **Skip** — general notes + its history already serve as comments |
| 27 | Read-only share link | **Skip** |
| 28 | Live change pulse + ticker | **Yes** |
| 29 | Performance foundations | **Yes** |
| 30 | Multiple boards | **Skip for now** |

## 7.1 Optional ten

| # | Feature | Decision |
|---|---|---|
| 1 | Connector arrows | Skip |
| 2 | Board themes | **Yes — five totally different, high quality** |
| 3 | Presentation mode | Skip as a board feature (exists on the TV instead) |
| 4 | Export board to PDF/PNG | **Yes, definitely** |
| 5 | Countdown element | As a **countdown node** and a separate **stopwatch node** |
| 6 | Voice memo | **Yes**, attachable to a node |
| 7 | Stickers/reactions | Skip, except **thumbs-up on right-click** |
| 8 | Photo-background tiles | **Yes** |
| 9 | Board layout history | **Yes — must show a snapshot preview before restoring** |
| 10 | Completion animation | **Yes** |

## 7.2 Business-specific ideas

| | Idea | Decision |
|---|---|---|
| A | Drive link → job created | **Yes**, via right-click paste (see §4) |
| B | Drive folder health badge | **Yes, but inside the job only** — never on the tile |
| C | Equipment counts / selection totals | Not now |
| D | Long-lead equipment countdown | Not now |
| E | Warranty clock | Not now |
| F | Contractor load at assign-time | **Yes, very subtle** — small numeric badge, short tooltip on hover |
| G | Photo review queue | **Yes, but no notifications** — lives inside the job, in the relevant tab |
| H | Punch-list pins on the plan PDF | **Yes** — open question answered below |
| I | Handover packet | Not now |
| J | Zoho round-trip | **No** — Zoho stays a plain hyperlink |
| K | Weather badge | Not now |

### H — how pins survive a download
The PDF file itself is never modified. Pins are stored as coordinates against the plan and drawn as an
**overlay** by both the office viewer and the contractor portal, so both see identical markup and the
original plan stays clean. For a contractor who wants it on paper, a separate **"Export annotated plan"**
produces a flattened copy with the pins burned in. Live use = overlay; download = flattened export.

---

## 8. Deliverables at the end
1. A short paragraph listing **every** change made.
2. A **short, non-technical update for Esther** (secretary) in plain language.
