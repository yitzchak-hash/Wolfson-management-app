# The Device Gallery method — a prompt for any project

Copy everything below the line into a new project's instructions (its
CLAUDE.md, or the first message of a session) whenever you want UI work to
run the way it runs on the Wolfson app. It tells the assistant exactly what
a Device Gallery is, when to show it, and how the pin-notes loop works.

---

## STANDING RULE — UI work always shows a Device Gallery

Whenever we are working on, changing, or discussing the UI — screens, views,
layout, colors, sizes, anything visual — you maintain ONE private web page
called the **Device Gallery** and show it to me as the preview. Never
describe a layout in words and never draw a mockup when the gallery can show
the real thing.

### What the Device Gallery is

- One page (a Claude artifact) I open on any of my devices.
- It shows **real screenshots of the real running app — the exact code on
  our working branch** — never mockups, never hand-drawn approximations.
  If the app cannot run, say so; do not fake a picture.
- One section per device, each screenshot inside a drawn device frame, with
  a one-line plain-language note per device about what layout it gets and
  why.
- It keeps ONE stable link forever: every update republishes the SAME
  artifact (same file path / same URL, same favicon). Never mint a second
  gallery link — I bookmark it once.

### The devices

Capture every profile below unless I say otherwise. Sizes are CSS viewport
pixels. When a new phone or tablet matters to me, I'll name it — add it as a
section and keep it from then on.

| Section | Size | Layout it gets |
|---|---|---|
| Newest iPhone | 402 × 874 | phone |
| Newest Galaxy | 384 × 832 | phone |
| Galaxy Z Flip (and the Fold's cover screen) | 344 × 882 | phone |
| Galaxy Z Fold, opened | 690 × 829 | phone (roomy) |
| Galaxy Z Fold, opened sideways | 829 × 690 | desktop |
| Newest Z Fold, big inner screen | 1129 × 847 | desktop |
| iPad upright | 768 × 1024 | desktop (exactly on the breakpoint) |
| iPad sideways | 1024 × 768 | desktop |
| iPad Pro 11″ upright | 834 × 1194 | desktop |
| iPad Pro 13″ sideways | 1366 × 1024 | desktop |
| The office computer | 1920 × 1080 | desktop |

### The screens

Per device, capture the few screens that matter — for this kind of app:
the main data screen, the detail window (opened, with a real document/plan
loaded in it, not empty), the board/canvas if there is one, and any
external-facing page (a worker/client page). Adapt the list to the project,
but keep it the SAME list on every update so sections stay comparable.

### How the screenshots are made (the part that keeps them honest)

- Drive the REAL app in a headless browser (Playwright + Chromium) at each
  device's exact viewport, touch enabled for touch devices.
- Seed REALISTIC data first — long names, long labels, real-looking dates
  relative to the actual clock. A layout only breaks on content longer than
  its box; an empty app passes every check and proves nothing.
- Where a screen needs a file the environment doesn't have (a PDF plan, an
  image), generate a stand-in file and serve it on the same route the app
  really calls — the app's own code path must run.
- Alongside the pictures, MEASURE: run an automated overflow/clipped-text
  audit at every size (nothing wider than the screen, no text cut off
  outside deliberate truncation). Screenshots show; the audit proves.
- Keep the capture script and the audit script in the repo, so any session
  can re-run them.

### The pin-notes loop (how I give feedback)

The gallery page itself takes my change notes:

1. On the page I press **“Note a change”**, then tap the exact spot on any
   screenshot I want changed. I type the note — or dictate it with the
   microphone button — and I can drop as many pins as I like.
2. I press **“Send to Claude”**. The page saves my pins into itself as a
   new version of the artifact (it declares the `artifact` capability and
   calls `publish` with the full regenerated document — pins live in a JSON
   block inside the page, each with device, screen, position in %, and my
   words).
3. In any chat, I say **“check my gallery notes”** (give the artifact link
   if that chat doesn't have it). You then READ the artifact, find the pin
   list, and treat each pin as a change request: the pin tells you which
   device, which screen, where on it, and what I said.
4. You make the changes in the code, re-run the capture and the audit,
   republish the gallery to the same link with fresh screenshots, and mark
   the pins done (keep them listed as “done” on the page for one round so I
   can check them off, then drop them).

Rules for you: read the pins BEFORE asking me what to change; never delete
a pin you haven't acted on; never publish a gallery whose screenshots are
older than the code being discussed.

### When to refresh it

- After every UI change, before telling me it's done.
- Whenever I ask “show me” / “how does it look” about anything visual.
- Only re-capture the devices a change can affect when time matters, but
  never let two sections show different versions of the app without saying
  so on the page.
