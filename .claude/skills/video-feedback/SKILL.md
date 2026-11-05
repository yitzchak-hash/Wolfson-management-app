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

## 0. Why this is strict (owner, 2026-11-05)
His words: "I tend to blabber and talk very fast and mention details very
subtly that are very important to me." On 2026-11-04 two videos were turned into
about 90 rows, many rows swallowed several details, only the "clear" ones were
handed out, and he found "a ton of details" missing. Everything below exists so
that never happens again. **A detail that is said once, fast, in passing, is
still an ask.**

## 2. Listen three times, then hunt
- **Pass 1:** faster-whisper `medium.en` with word timestamps over the whole file.
- **Pass 2:** `large-v3-turbo`, one minute at a time, on volume-evened audio
  (ffmpeg `dynaudnorm` + `loudnorm`).
- **Pass 3, for his fast talk:** the audio slowed to 0.85x (ffmpeg `atempo`) and
  transcribed again; a louder pass over every quiet stretch.
- Merge the three. Wherever they disagree, cut those seconds out and listen
  again; mark what is still unsure with [brackets] and ask him.
- Keep the video, audio and screenshots in the session scratchpad, never the
  repo (his screen shows real client names).

## 2b. The detail hunt (the step that was missing)
Go through the merged transcript word by word and make a row for EVERY one of
these, even inside a sentence about something else:
- each thing, place, colour, size, word, order, default, number or example he names;
- every "also", "and then", "plus", "maybe", "should", "always", "never",
  "I like", "I don't like", "like in X" (another app), "for example";
- every complaint ("this is horrible", "I don't know what this is", "why do we have both");
- every comparison ("like Monday", "like Zoho does", "like the other screen");
- every promise of more ("continue thinking about the examples", "things like that"):
  that is an ask to extend the idea, write the extension as rows;
- everything he SHOWS without saying: a press that did nothing, a second try,
  hesitating, scrolling to look for something, going back, a slow load, an error,
  a jump on screen.

## 2c. The second pair of ears
After the rows are written, a SEPARATE agent (fresh, high effort) gets only the
video, the transcripts and the row list, and its one job is to find what the
rows missed. Every find becomes a row. Repeat until a pass finds nothing.

## 2d. The minute check
For every minute of the video, count the rows that came from it. A minute where
he talks and there are no rows, or fewer rows than ideas, is re-listened.

## 3. Number every sentence
Write `docs/feedback/<date>-<time>.md`. Split the transcript into sentences
and give each a number: S1, S2, S3…. Label each one:
- **ASK** — he wants something changed
- **CONTEXT** — explaining or showing, no change
- **NONE** — explicitly no change ("that's just how the plan is")

## 3b. When was it recorded? (owner, 2026-11-04)
A video can be older than the work. Read the date and time at the bottom of his
screen (the Windows clock) at the start and end of the video, and write them at
the top of the feedback doc.
- Compare each ASK with what was done since that time: the git log, HANDOFF.md,
  supabase/APPLIED.md, the work list. If he says "there are no 50 jobs inside"
  and the 50 jobs went in after the recording, that ask is **DONE AFTER THE
  VIDEO**: do not build it again.
- Then check what was done against what he asked in the video, word by word.
  Every difference (built another way, half built, a detail he named that is
  missing) becomes its own row with **DIFFERENT FROM YOUR ASK** and the fix.
- No clock on screen: use the file's own created time and say so.

## 4. Look at the screen where it matters
For every sentence that says **this, that, here, these, bigger, smaller, this
one, over there**, take the frame at that second and write what the mouse is
on. The words mean nothing without the pointer. If it is still unclear, do not
guess — put it under "What I need from you".

Also note anything wrong that is on screen but never said (an error, a stuck
tooltip, a wrong number).

## 5. One detail per row
Build the asks table: `# · time · his exact words · the one detail · goes to · status`.
**Never** two details in one row: no "and", no semicolons. "Make it bigger with
a plus and new words" is three rows. His exact words are quoted in every row,
never a summary of them.

## 5b. Every row has a home (owner, 2026-11-05)
Each row says where it goes: a named card (and the card quotes the row number and
his words), a question to him (asked the SAME day, with a starred pick), "done
after the video", or "not doing, because ..." with his OK. **No row is left
without a home.** When work is handed to other sessions, the card carries the
full rows, never a shorter retelling.

## 6. Tell him the count first
Before building, the reply says **"I heard N details"** and gives him the full
list as a page he can scan (one line per row with its time), so he can catch a
miss in seconds and point at it.

## 7. Build, then check BOTH ways
- Every row built and checked in the running app, by LOOKING at it: a screenshot
  next to what he asked (his words, and his approved design when there is one).
  "The test passes" is not "it looks right".
- Every ASK sentence points to a row. A sentence with no row is a miss.
- Before saying "done", go down the rows one by one: built (where), half built
  (what is missing), not built. Report the numbers, never just "done".
- The reply's numbered list matches the table exactly, same numbers.

## 8. Record
- Add the video to `docs/feedback/LEDGER.md` (name · Drive id · length ·
  status · its doc).
- Commit, push production, report in the reply format from CLAUDE.md, and
  list which videos he should drag into Processed.
