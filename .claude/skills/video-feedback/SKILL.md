---
name: video-feedback
description: Work through the owner's screen recordings of the app — find new videos in his Drive folder, turn every sentence into a numbered checklist so no ask is missed, build the fixes, and report. Use when he says "new video", "check the folder", or shares a recording.
---

# Working from the owner's screen recordings

He records his screen and talks through what to fix. The goal is that **no ask
is ever missed**. The method is built around that.

## 1. Find the video
- His Drive folder has two subfolders: **Not processed** and **Processed**.
  New videos are at the top level or in Not processed.
- `docs/feedback/LEDGER.md` lists every video already worked. Anything not in
  it is new. Work the oldest first.
- You cannot move his files in Drive. When done, tell him which ones to drag
  into Processed.

## 2. Listen once, well
- One transcription pass with faster-whisper large-v3.
- Re-listen with the volume raised ONLY over stretches that came out unclear.
- Keep the video, audio and screenshots in the session scratchpad, never the
  repo (his screen shows real client names).

## 3. Number every sentence
Write `docs/feedback/<date>-<time>.md`. Split the transcript into sentences
and give each a number: S1, S2, S3…. Label each one:
- **ASK** — he wants something changed
- **CONTEXT** — explaining or showing, no change
- **NONE** — explicitly no change ("that's just how the plan is")

## 4. Look at the screen where it matters
For every sentence that says **this, that, here, these, bigger, smaller, this
one, over there**, take the frame at that second and write what the mouse is
on. The words mean nothing without the pointer. If it is still unclear, do not
guess — put it under "What I need from you".

Also note anything wrong that is on screen but never said (an error, a stuck
tooltip, a wrong number).

## 5. One change per row
Build the asks table: `# · sentences (S7, S8) · the one change · status`.
**Never** two changes in one row — no "and", no semicolons. A "make it bigger
with a plus and new words" is three rows.

## 6. Tell him the count first
Before building, the reply (or the first message) says: **"I heard N asks"**
with the numbered list. He can catch a miss in seconds.

## 7. Build, then check BOTH ways
- Every row built and checked in the running app.
- Every ASK sentence points to a row. A sentence with no row is a miss.
- The reply's numbered list matches the table exactly, same numbers.

## 8. Record
- Add the video to `docs/feedback/LEDGER.md` (name · Drive id · length ·
  status · its doc).
- Commit, push production, report in the reply format from CLAUDE.md, and
  list which videos he should drag into Processed.
