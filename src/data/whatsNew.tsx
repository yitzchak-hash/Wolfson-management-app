import React from 'react';

/**
 * The app's own changelog, told as a walkthrough.
 *
 * Every update adds ONE entry here, dated, newest first — the convention is
 * in CLAUDE.md next to the backup rule, because a what's-new that stops being
 * written is worse than none: it tells the office the app stopped moving.
 *
 * An item's `demo` picks one of a few small animated vignettes drawn by the
 * presenter — a tile sliding into a slot, a finger pressing, a pin dropping —
 * because SEEING the gesture is the difference between a changelog and a
 * lesson. No screenshots: they rot the moment the UI moves on.
 */

export type WhatsNewDemo = 'drag' | 'tap' | 'pin' | 'zoom' | 'list' | 'sparkle';

export interface WhatsNewItem {
  title: string;
  body: string;
  demo?: WhatsNewDemo;
}

export interface WhatsNewEntry {
  /** yyyy-MM-dd — the day the update went live. */
  date: string;
  title: string;
  items: WhatsNewItem[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    date: '2026-08-17',
    title: 'The CRM comes aboard, selections behave, the board fits a phone',
    items: [
      {
        title: 'Bring the whole CRM year onto the board',
        body: 'Job Board → settings → "Import jobs from a CSV". Feed it the deals export and '
          + 'every deal becomes a job — family name from the deal name, Drive link and phone '
          + 'attached, filed into Done, Ready to Start or its own group by its CRM stage. '
          + 'You see the full plan first and untick anything; a deal whose Drive folder '
          + 'belongs to Wolfson or Netiv is kept out automatically, and running the same '
          + 'file twice cannot create doubles.',
        demo: 'list',
      },
      {
        title: 'Jobs have a phone number now',
        body: 'A Phone field sits beside the address in every job and apartment, with a '
          + 'call button — one tap dials from a phone. Imported jobs bring their number '
          + 'from the CRM, with the missing Israeli zero put back.',
        demo: 'tap',
      },
      {
        title: 'A selection moves as one thing',
        body: 'Lasso jobs, notes and drawings together and drag ANY of them — the whole '
          + 'selection travels and lands together. The Done / Ready / Archive / Trash '
          + 'groups join a group resize too, so arranging a corner of the board is one '
          + 'gesture, not four.',
        demo: 'drag',
      },
      {
        title: 'Every scribble is a note now',
        body: 'Anything you draw on the board becomes its own piece the moment you lift '
          + 'the pen — move it, resize it, delete it like any note. It used to only '
          + 'happen when the drawing touched nothing else, which read as drawings '
          + 'randomly refusing to behave.',
        demo: 'tap',
      },
      {
        title: 'The board on a phone',
        body: 'Open the Job Board on a phone and it fits itself to the screen below the '
          + 'buttons. Zoom − / + and Fit are in the top strip (slide it sideways for '
          + 'the rest), and the round tools button sits bottom-left, clear of the little '
          + 'overview map.',
        demo: 'zoom',
      },
    ],
  },
  {
    date: '2026-08-16',
    title: 'The August round',
    items: [
      {
        title: 'Search forgives',
        body: 'Misspell a name, type Hebrew for an English one, or forget the keyboard '
          + 'language — search finds it anyway. And every result now OPENS the thing it '
          + 'found: a stage filters the diagram, a worker opens their task list.',
        demo: 'list',
      },
      {
        title: 'Punch-list pins are back',
        body: 'Open a job, press Pin above the plan, click the spot, type the note. '
          + 'Numbered pins your workers see read-only on the same plan; tick them off as '
          + 'they are fixed, and print the list.',
        demo: 'pin',
      },
      {
        title: 'The dashboard arranges like a home screen',
        body: 'Carry a widget by the handle at its top-left corner — whatever you hold it '
          + 'over moves out of the way. Resize from the bottom-right corner only; sizes '
          + 'snap to the grid so everything lines up.',
        demo: 'drag',
      },
      {
        title: 'Every number opens its list',
        body: 'Total units, Not started, the figures on board widgets — click any of '
          + 'them and the jobs behind the number appear, and a row opens the job.',
        demo: 'tap',
      },
      {
        title: 'Finishing a task celebrates, then reports',
        body: 'When a worker marks work done, a small celebration pops with a ready '
          + 'WhatsApp message for the office: the job, the photos with their links, the '
          + 'time. One press copies it.',
        demo: 'sparkle',
      },
      {
        title: 'The planner asks before it changes',
        body: 'Save a dated task for a job already on the planner and it asks: ghost it '
          + 'onto the new day, move it there, or leave the planner alone. Rows now group '
          + 'by trade with subtle divider lines you can style.',
        demo: 'list',
      },
      {
        title: 'The map moves like a map',
        body: 'Zoom is smooth, the picture never flashes white, and the location button '
          + 'jumps to where you are standing.',
        demo: 'zoom',
      },
      {
        title: 'Plans fill their pane, by themselves',
        body: 'The pane measures the sheet and takes its shape — portrait, landscape or '
          + 'odd, no chips to press, no black bars. The folder Status check is back on '
          + 'the Drive row, with a refresh at the end.',
        demo: 'tap',
      },
      {
        title: 'Sign in with your face on the door',
        body: 'The login shows a tile for each person. Tap yours, type your code, and '
          + 'you are back in the workspace you left — the project logos have moved to '
          + 'the switcher in the header.',
        demo: 'tap',
      },
      {
        title: 'The phone view, properly',
        body: 'The buildings page shows one building at a time, with search and Filters on '
          + 'top and slim A1 / A2 / A3 tabs carrying the unit count. Every cell shows its '
          + 'number, family name and stage in full — the name used to cover the number. An '
          + 'apartment opens FULL SCREEN with all its tabs, including a new Plan tab that '
          + 'opens the markup tools. Settings, Reports and Tasks fit the screen too.',
        demo: 'tap',
      },
      {
        title: 'The phone, again — and this time the small print',
        body: 'A stage name now SHRINKS until it fits on one line instead of wrapping or '
          + 'being cut short, the floor number moved onto the divider so apartments use the '
          + 'whole width, and the second building name over each diagram is gone — the tabs '
          + 'already say which one you are on. The dashboard puts its figures two to a row '
          + 'instead of one giant tile each, and the workspace picker in the header is a '
          + 'proper dropdown that will hold as many workspaces as you make.',
        demo: 'tap',
      },
      {
        title: 'Voice memos, wherever a note takes a file',
        body: 'Press the microphone beside the paperclip and talk. You get a running timer '
          + 'while you record, a bin if you change your mind, and once sent it plays back '
          + 'with a bar you can tap to skip through and a 1x / 1.5x / 2x button. Works from '
          + 'a worker\u2019s phone.',
        demo: 'tap',
      },
      {
        title: 'The board lines things up, and puts tools down',
        body: 'Drag or resize ANYTHING and guide lines show what it is lining up with — '
          + 'notes, drawings, widgets, not just jobs. Press the pen a second time to put it '
          + 'down. Hold something against an edge and the board grows. A finished drawing '
          + 'becomes its own note you can move and resize, there is an eraser under the pen, '
          + 'and the panels can be dragged out of the way by the corner.',
        demo: 'drag',
      },
      {
        title: 'A week you can hide, and a planner you can size',
        body: 'Hide a week on the schedule and nothing in it is lost — bring the week back '
          + 'and every job is where you left it. The planner also has a size setting now.',
        demo: 'list',
      },
      {
        title: 'Resizing, with manners',
        body: 'Hold Shift while resizing anything and it keeps its shape. Select several '
          + 'things and one handle on the corner resizes the whole arrangement together. '
          + 'And while you drag, a little label shows the size — press 0 to snap back to '
          + 'the default.',
        demo: 'drag',
      },
      {
        title: 'Talk into anything',
        body: 'The microphone is now beside the paperclip on every note — the worker portal, '
          + 'stage notes, office notes, tasks, bulk tasks and the board\u2019s own sticky '
          + 'notes. And a memo now PLAYS wherever it appears instead of arriving as a file to '
          + 'download.',
        demo: 'tap',
      },
      {
        title: 'Closing a pin says who closed it',
        body: 'In a pin\'s note, Save keeps the bubble open, and Mark as done is its own '
          + 'button that records the name — so a pin the architect closes says so. '
          + 'Reopen undoes a mistake; deleting now asks first.',
        demo: 'pin',
      },
    ],
  },
  {
    date: '2026-08-01',
    title: 'The TzviAir platform',
    items: [
      {
        title: 'One app, three workspaces',
        body: 'Wolfson and Netiv as building diagrams, the Job Board as a free canvas of '
          + 'tiles, groups, widgets and drawings — with the dashboard, tasks, reports, '
          + 'calendars and the TV wallboard all reading the same records.',
        demo: 'drag',
      },
      {
        title: 'Workers have their own portal',
        body: 'Every worker gets a link: their tasks, the building map, photos back to '
          + 'the office, all in their own language and text size. What each worker can '
          + 'see and do is a level you set in settings.',
        demo: 'tap',
      },
      {
        title: 'Reports you build',
        body: 'Pick what a row is — jobs, tasks, workers — choose columns across joined '
          + 'records, filter, group, chart, save. Out as CSV, Excel or print.',
        demo: 'list',
      },
    ],
  },
];

/** The newest date in the log — the seen-marker compares against this. */
export const WHATS_NEW_LATEST = WHATS_NEW[0]?.date ?? '';

const SEEN_KEY = 'whats_new_seen';
export const whatsNewSeen = (): boolean =>
  localStorage.getItem(SEEN_KEY) === WHATS_NEW_LATEST;
export const markWhatsNewSeen = (): void =>
  localStorage.setItem(SEEN_KEY, WHATS_NEW_LATEST);
