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
    date: '2026-11-22',
    title: 'Zoom from the keyboard, and a pinch with no seam',
    items: [
      {
        title: 'The = and − keys zoom the plan',
        body: 'With a plan open, = or + zooms in, − zooms out and 0 fits the '
          + 'whole sheet — with or without Ctrl, so the browser can no '
          + 'longer steal the shortcut and zoom the whole app instead. '
          + 'Works in the job window\'s plan pane and in the markup studio.',
        demo: 'zoom',
      },
      {
        title: 'Letting go of a pinch is seamless now',
        body: 'The last little jump when you lifted your fingers is gone — '
          + 'the zoom now lands at exactly the size your fingers left it, '
          + 'in the same instant, with no blink.',
        demo: 'tap',
      },
      {
        title: 'A button that did nothing is gone',
        body: 'The "Saved versions" button on the studio bar was left over '
          + 'from an old panel and no longer did anything — your saved '
          + 'versions are the v1, v2 tabs on the toolbar, where they '
          + 'always were.',
        demo: 'sparkle',
      },
    ],
  },
  {
    date: '2026-11-15',
    title: 'Real pens, neat shapes, and a zoom that obeys',
    items: [
      {
        title: 'The pens look like the real thing',
        body: 'Open the drawer and each pen is drawn as itself: a Crayola-'
          + 'style crayon in its paper wrapper, a Sharpie-style marker with '
          + 'its colour-coded end, a wooden brush with real bristles, a gold '
          + 'fountain nib, a yellow pencil with its pink eraser.',
        demo: 'tap',
      },
      {
        title: 'Neat shapes — draw a square, get a square',
        body: 'With the new Neat-shapes switch on the top bar, a drawn box '
          + 'straightens itself, a circle rounds itself, and lines, '
          + 'triangles, stars and hearts all snap clean — in the same pen '
          + 'and colour you drew them with. Switch it off and every stroke '
          + 'stays exactly as your hand made it. Line, arrow, box and '
          + 'circle also folded into one Shapes button with its own little '
          + 'flyout.',
        demo: 'sparkle',
      },
      {
        title: 'The drawer got its missing controls',
        body: 'The size slider\'s blue bar follows the handle now and shows '
          + 'the same number as the Width up top; a see-through slider '
          + 'fades from nothing to your ink over a checkerboard, the '
          + 'Samsung way; and a rainbow chip opens the full colour picker '
          + 'right from the drawer.',
        demo: 'tap',
      },
      {
        title: 'Zoom out past the edge, pinch like glass',
        body: 'Minus now shrinks the plan into the page around it instead '
          + 'of stopping at the fit, a finger tap on plus moves a real '
          + 'step, and the pinch is silk — the sheet rides your fingers '
          + 'exactly and sharpens the moment you let go.',
        demo: 'zoom',
      },
      {
        title: 'TikTok sound and full-screen buttons',
        body: 'A volume slider sits beside the sound button (TikTok only '
          + 'lets a page switch sound on or off — the screen\'s own volume '
          + 'sets the loudness), and in full screen the controls and the '
          + 'exit button grow to match the screen.',
        demo: 'tap',
      },
      {
        title: 'The wall clock keeps Israel time',
        body: 'A TV that thinks it is in another country was showing the '
          + 'wrong hour. The clock is now pinned to Israel time whatever '
          + 'the panel believes — switchable to the device\'s own time in '
          + 'its settings.',
        demo: 'sparkle',
      },
    ],
  },
  {
    date: '2026-11-08',
    title: 'A full pen drawer, and the plan reader sharpens up',
    items: [
      {
        title: 'Nine pens in a frosted drawer',
        body: 'Press the pen tile and a frosted-glass drawer slides up with '
          + 'the whole set drawn as real pens: ballpoint, fountain, '
          + 'calligraphy, pencil, crayon, marker, water brush and two '
          + 'highlighters — all in one row, no separate shelves. Pick one '
          + 'and it lifts into your hand while a scribble redraws itself '
          + 'in that pen\'s own stroke, so you see what it writes like '
          + 'before touching the plan. Size slider and colours live right '
          + 'in the drawer.',
        demo: 'tap',
      },
      {
        title: 'Every pen keeps its character everywhere',
        body: 'The fountain pen swells with speed, the calligraphy nib is '
          + 'thick one way and thin the other, the crayon is broad and '
          + 'grainy, the soft highlighter is a wide pale wash. What you '
          + 'draw looks the same on screen, in the saved Drive PDF and on '
          + 'paper — one stroke, one look.',
        demo: 'sparkle',
      },
      {
        title: 'The plan reader stopped guessing',
        body: 'The little "On the plan" row under Address no longer offers '
          + 'unit labels like "building 2 apartment 5" as a street '
          + 'address, and pressing the eye now opens a small box cropped '
          + 'tight around the exact words it read — not a strip of the '
          + 'whole sheet.',
        demo: 'zoom',
      },
    ],
  },
  {
    date: '2026-11-01',
    title: 'The punch list files itself, and the studio tidies up',
    items: [
      {
        title: 'Pins go to Drive on their own',
        body: 'Add or change pins on a plan — from the preview, no studio '
          + 'needed — and a minute after you stop, a "punch list" PDF files '
          + 'itself into Annotated Plans → Pins: one file per apartment, '
          + 'brought up to date each time, with a tiny Drive flash on the '
          + 'plan when it lands. No buttons, no questions.',
        demo: 'pin',
      },
      {
        title: 'v1.0, v1.1, v1.2 — the name counts the updates',
        body: 'Every time a version\'s one Drive file is brought up to date, '
          + 'its name ticks up — "annotated version 1.3" says at a glance '
          + 'how many pushes it took. The version tabs in the studio show '
          + 'the same number.',
        demo: 'sparkle',
      },
      {
        title: 'A scribble from the version to the plan',
        body: 'The version you are looking at draws a playful green '
          + 'scribble from its tab to the sheet — no stiff right angles, '
          + 'and every version has its own squiggle. Save or switch and '
          + 'the line doodles its way to the new one. A version\'s green '
          + 'Drive dot now greys honestly when its file was deleted in '
          + 'Drive, and clicking through old versions no longer creates '
          + 'anything — looking is looking.',
        demo: 'zoom',
      },
      {
        title: 'The training board got fixed up',
        body: 'The Learn-the-board lesson no longer has the real board\'s '
          + 'buttons poking through it (and its X closes again). The '
          + 'instructions are now a bouncy card floating over the practice '
          + 'board, with a little face for every gesture and a "Nailed '
          + 'it!" when you pull one off.',
        demo: 'sparkle',
      },
      {
        title: 'One pen, a real pen tray',
        body: 'Pen, pencil, marker and highlighter are one tile on the '
          + 'rail. Press the pen you are holding and the tray opens — four '
          + 'drawn pens, the one in your hand lifted; pick another and it '
          + 'rises in its place, the Samsung Notes way. The eraser keeps '
          + 'its own button.',
        demo: 'tap',
      },
      {
        title: 'The plan chooser loads politely',
        body: 'Opening it shows the plans folder\'s own files first — '
          + 'markups live under Annotated Plans in the folder list, one '
          + 'press away. Folders, subfolders and files now show loading '
          + 'rows while they arrive instead of jumping in.',
        demo: 'list',
      },
    ],
  },
  {
    date: '2026-10-25',
    title: 'The markup knows exactly what Drive has',
    items: [
      {
        title: 'One file per version — never a pile of copies',
        body: 'While you draw, the markup is kept on the computer instantly '
          + 'and pushed to Drive a few seconds after you pause — and every '
          + 'push brings the open version\'s ONE file up to date instead '
          + 'of filing another copy. A morning of colouring is one tidy '
          + 'PDF per locked version in Annotated Plans, not twelve '
          + 'near-identical ones — and the computer dying mid-scribble '
          + 'loses nothing.',
        demo: 'sparkle',
      },
      {
        title: 'Save LOCKS the version',
        body: 'Press Save v1 and version 1 is sealed in Drive as it stands — '
          + 'your very next mark starts version 2 by itself, in its own '
          + 'file, and so on. The button wears the Drive mark so it is '
          + 'clear where it files, and it answers every press in words: '
          + 'filed and locked, updated and locked, or "already locked — '
          + 'nothing new". The little countdown to the automatic save now '
          + 'sits beside the arrow instead of on top of it.',
        demo: 'tap',
      },
      {
        title: 'The pins travel into the PDF',
        body: 'Every markup filed in Drive now carries the punch-list pins — '
          + 'red numbered circles for open items, grey for done — exactly '
          + 'where they sit on screen. Pins placed from the plan preview '
          + 'are saved with the job the moment they are placed, on every '
          + 'device; a press of Save files them into a PDF even with no '
          + 'drawing on the sheet.',
        demo: 'pin',
      },
      {
        title: 'The plan chooser opens subfolders',
        body: 'The folder list in the Plans chooser now shows every folder '
          + 'AND the folders inside them, indented underneath — Annotated '
          + 'Plans, superseded issues, a photos subfolder — all one press '
          + 'away.',
        demo: 'tap',
      },
      {
        title: 'The plan zoom tells you when it is at the edge',
        body: 'When the whole sheet is already in view, the − button greys '
          + 'out and says so instead of sitting there doing nothing — which '
          + 'on the TV read as the zoom being broken. + always zooms in.',
        demo: 'tap',
      },
    ],
  },
  {
    date: '2026-10-18',
    title: 'Files fly to the TV, and refresh behaves',
    items: [
      {
        title: 'The File Tray',
        body: 'A new widget from the store: drag a file onto it at the desk — '
          + 'or press it to browse — and seconds later it is on the TV and '
          + 'every other screen, glowing "new", with a download button. A '
          + 'PDF opens a preview right over everything with a Mark up '
          + 'button on top; pictures preview too. Files go to a File Tray '
          + 'folder in Drive.',
        demo: 'drag',
      },
      {
        title: 'New widgets land in front of you',
        body: 'Adding a widget from the store now always puts it in the '
          + 'middle of what you are looking at, on top of everything, and '
          + 'already selected — no more pressing Add and hunting the board '
          + 'for where it went.',
        demo: 'sparkle',
      },
      {
        title: 'The tap-in board is a traffic light',
        body: 'Clocked in is GREEN with a running counter showing how long '
          + 'they have been on the clock; clocked out is red. One glance '
          + 'down the corridor says who is here.',
        demo: 'tap',
      },
      {
        title: 'Refresh without leaving full screen',
        body: 'The TV\'s refresh button now refreshes the data in place — '
          + 'full screen stays. It only really reloads when a new version '
          + 'of the app is waiting, and then one tap anywhere puts full '
          + 'screen straight back.',
        demo: 'tap',
      },
    ],
  },
  {
    date: '2026-10-11',
    title: 'The worker\'s portal wakes up',
    items: [
      {
        title: 'A bell for the workers',
        body: 'The portal has a little notification bell: overdue, today, '
          + 'tomorrow and newly-assigned work — across every workspace, each '
          + 'one tap from its task. In Settings → Workers you decide per '
          + 'worker what his bell shows: everything, today + tomorrow, today '
          + 'only, or no bell at all for the ones a stream of updates would '
          + 'only confuse.',
        demo: 'sparkle',
      },
      {
        title: 'His work finds him',
        body: 'A worker whose next job lives in another workspace — or on '
          + 'another day — used to open onto an empty list. The portal now '
          + 'follows his OPEN work: it lands on the workspace that has some, '
          + 'and when today is quiet the list shows everything instead of '
          + 'hiding tomorrow behind the Today pill.',
        demo: 'tap',
      },
      {
        title: 'The map says whose building it is',
        body: 'The building map names the project and the building out loud, '
          + 'so a worker on two sites never has to guess what he is looking '
          + 'at. The project bubbles for switching are still there for '
          + 'workers allowed to switch.',
        demo: 'pin',
      },
      {
        title: 'Plans read their Hebrew properly',
        body: 'The "On the plan" address reader was tripped up by some '
          + 'consultant sheets and offered gibberish. It now reads those '
          + 'title blocks correctly — and every plan is re-read with the '
          + 'smarter eyes the next time you open it.',
        demo: 'zoom',
      },
      {
        title: 'Notebook polish',
        body: 'Card text is centred in the weekly notebook, and a multi-day '
          + 'task\'s card in the job window now says its real range — '
          + '"Sep 1–2 · 2 days" — instead of two chips that read like the '
          + 'same thing twice.',
        demo: 'list',
      },
    ],
  },
  {
    date: '2026-10-04',
    title: 'The board teaches itself, and planning jumps the queue',
    items: [
      {
        title: 'A training session — press the ? in the header',
        body: 'A little practice board walks you through every gesture, one '
          + 'step at a time — click, drag, open, pan, zoom, the lasso, the '
          + 'right-click menu — and checks you really did each one. At the '
          + 'end it prints a TzviAir control sheet in the size you pick: '
          + 'sticky note, A5 or A4.',
        demo: 'sparkle',
      },
      {
        title: 'Drop a job at the top of the screen to plan it',
        body: 'While you drag a job, a drop box appears at the top. Let go '
          + 'there and it asks who and which day — any day, weeks ahead — '
          + 'then opens the usual task form, exactly as if you had dropped '
          + 'it on that square of the notebook. No more dragging across '
          + 'months of planner.',
        demo: 'drag',
      },
      {
        title: 'Two new mouse moves',
        body: 'Drag with the RIGHT button held to select a box-full — the '
          + 'same as Ctrl+drag. Hold the right button and scroll to zoom. '
          + 'A plain right-click still opens the menu, and nothing else '
          + 'changed.',
        demo: 'zoom',
      },
      {
        title: 'Pins on the plan — now with a voice',
        body: 'Workers can drop pins on the plan straight from their phone — '
          + 'press Pin, tap the spot. And every pin, office and worker alike, '
          + 'now takes a voice note and file attachments: the little clip and '
          + 'microphone at the bottom right of the pin. Say what to change '
          + 'and where, instead of typing it. A worker can only remove pins '
          + 'they placed themselves.',
        demo: 'pin',
      },
      {
        title: 'Type your own default zoom',
        body: 'Board settings now take a typed number for the zoom the '
          + 'board opens at on this computer — 87%, 140%, whatever suits '
          + 'your screen — instead of a fixed list of steps.',
        demo: 'tap',
      },
    ],
  },
  {
    date: '2026-09-27',
    title: 'A real timeline, search in four coats, and tiles that behave',
    items: [
      {
        title: 'The Timeline widget grew up',
        body: 'Rebuilt the way the professional planners draw one: every '
          + 'dated task is a bar across its own days in its stage\'s colour, '
          + 'single days are diamonds, a red line marks today, weekends are '
          + 'shaded, and crowded days fold into a "+N" you can press to see '
          + 'the list. Settings offer two weeks, a month or a quarter, and '
          + 'grouping by worker.',
        demo: 'list',
      },
      {
        title: 'The Search tile picks its outfit',
        body: 'The big search button was plain — now its settings offer four '
          + 'looks: deep navy with the glowing ring, a clean light card, the '
          + 'company sky-blue, or a minimal giant glass. Pick per tile.',
        demo: 'sparkle',
      },
      {
        title: 'Unit cards drag like tiles',
        body: 'A unit card pulled out of a building diagram used to open the '
          + 'moment you touched it. Now one click selects it so you can drag '
          + 'it around, and a double-click (or a second tap) is what travels '
          + 'to the apartment — the same manners as every job tile.',
        demo: 'drag',
      },
      {
        title: 'Strips wear their stage',
        body: 'In the notebook\'s Strips mode every slim card now carries a '
          + 'small dot in its job\'s stage colour, left of the name — one '
          + 'glance says where each job stands.',
        demo: 'pin',
      },
    ],
  },
  {
    date: '2026-09-20',
    title: 'The notebook loses its empty space, and search grows a voice',
    items: [
      {
        title: 'Quiet workers squish down to a strip',
        body: 'A worker with nothing planned that week no longer costs a full '
          + 'row of the notebook — just a thin strip with their name. Drag a '
          + 'card over the strip and it puffs open under your hand; drop, '
          + 'and it is a full row again. Automatic, per week.',
        demo: 'drag',
      },
      {
        title: 'Strips: the notebook, half the height',
        body: 'A new Cards choice in the notebook\'s settings — Tiles as '
          + 'today, or Strips: every card one slim line, the job\'s name '
          + 'with its task right under it. Weeks come out about half the '
          + 'height, so months sit close together on one screen.',
        demo: 'list',
      },
      {
        title: 'One big Search button — and you can talk to it',
        body: 'A new Search widget for the board and the wall: press the big '
          + 'magnifying glass and a window pops up that forgives mistakes — '
          + 'Hebrew for English, near misses, the wrong keyboard. Press the '
          + 'microphone and just say the name. The header search got the '
          + 'microphone too.',
        demo: 'tap',
      },
      {
        title: 'The plan reader knows our own number',
        body: 'The phone read off a plan now skips the office\'s own number '
          + 'and prefers the customer\'s mobile — and a screen that had been '
          + 'open across a new update reloads itself instead of showing an '
          + 'error.',
        demo: 'sparkle',
      },
    ],
  },
  {
    date: '2026-09-19',
    title: 'The job window: days on tasks, the worker on the stage',
    items: [
      {
        title: 'A task that takes days says so, and can be changed',
        body: 'The Tasks tab in a job window now shows "3 days" on a task '
          + 'that takes three, and opening it to edit gives you the same day '
          + 'picker every other task form has — already set to the days it '
          + 'has. Editing one used to quietly collapse it back to a single '
          + 'day.',
        demo: 'tap',
      },
      {
        title: 'The stage shows who is actually on it',
        body: 'A stage said "none" whenever the worker\'s task did not have '
          + 'that stage filled in — which is most of the time, since the '
          + 'stage box is optional. The stage the job is at now names the '
          + 'worker who is on the job, and a finished task no longer hides a '
          + 'live one.',
        demo: 'list',
      },
      {
        title: 'History does not break any more',
        body: 'Opening History on a job could show the error screen. One old '
          + 'entry had lost the name of who did it, and that was enough to '
          + 'take the whole tab down. It copes now, and new entries always '
          + 'carry a name.',
        demo: 'sparkle',
      },
    ],
  },
  {
    date: '2026-09-18',
    title: 'Downloading a plan asks what you want in it',
    items: [
      {
        title: 'Two questions, then the file',
        body: 'Press Download on a plan and it asks what should be in it — '
          + 'with the markings (the snag pins and everything drawn on the '
          + 'sheet) or just the clean plan — and only then whether you want '
          + 'a PDF or pictures. The file is named after the job and the plan '
          + 'instead of arriving called "download".',
        demo: 'tap',
      },
      {
        title: 'And it works on every plan now',
        body: 'The PDF button used to need somebody to have saved a marked-up '
          + 'version to Drive first, so on an ordinary plan it simply did '
          + 'nothing — that is fixed. All four answers are made right in the '
          + 'browser, so a download works with no internet and without saving '
          + 'anything first. Asking for the clean PDF hands back the '
          + 'architect\'s original file untouched.',
        demo: 'list',
      },
      {
        title: 'Print asks the same question',
        body: 'Print now asks the same thing before it builds the sheet — '
          + 'with the markings, or just the plan — and "with the markings" '
          + 'means the same on paper as in a file: the drawings AND the snag '
          + 'pins. It used to print the drawings only, and never the pins.',
        demo: 'sparkle',
      },
    ],
  },
  {
    date: '2026-09-17',
    title: 'The goals board, on the board',
    items: [
      {
        title: 'Our goals, live on the Job Board and the dashboard',
        body: 'The shared TzviAir goals board now stands on the Job Board as '
          + 'a widget — the full tiles with their running timers, and start '
          + 'and finish work right from it. The dashboard carries a compact '
          + 'read-only summary card with the progress bar and live counters. '
          + 'Both update by themselves every few seconds.',
        demo: 'sparkle',
      },
      {
        title: 'An ordinary widget, like any other',
        body: 'Move it, resize it, put it on the TV wall (read-only there), '
          + 'add more copies from the widget store, or remove it — removing '
          + 'sticks, on every device. The pencil picks the view, the '
          + 'language, and how many tiles to show.',
        demo: 'drag',
      },
      {
        title: 'Goals on the TV, and five widget styles',
        body: 'The TV wall\'s top bar has a Goals button right beside '
          + 'Dashboard — press it and the whole goals board fills the wall, '
          + 'timers running, read-only. And the widget comes in five styles '
          + 'from the pencil: the tile grid, the summary strip, a progress '
          + 'ring, a big number, and a slim progress bar — clicking a drawn '
          + 'one opens the full goals page.',
        demo: 'tap',
      },
      {
        title: 'One TV, one button',
        body: 'The TV tab in the left bar shows only on the Job Board now — '
          + 'the wall is one shared screen whichever workspace you are in, '
          + 'so Wolfson and Netiv no longer carry a second and third button '
          + 'that opened the same thing.',
        demo: 'tap',
      },
      {
        title: 'A crash now says what broke',
        body: 'If a screen ever crashes, instead of going blank it shows '
          + 'exactly what went wrong, with a Reload button and a copy button '
          + 'so the error\'s own words can be sent straight to whoever is '
          + 'fixing it. Nothing is lost — the data is always saved.',
        demo: 'sparkle',
      },
    ],
  },
  {
    date: '2026-09-16',
    title: 'A task can take days — from every form, in every workspace',
    items: [
      {
        title: '"How many days" on every task form',
        body: 'The day stepper that lived only in the weekly notebook\'s drop '
          + 'dialog is now on the drawer\'s Add Task, the Tasks page\'s form '
          + 'and the bulk modal — so a Geves job on the Job Board (or any '
          + 'stage, anywhere) can be given its three days right where the '
          + 'task is made. Same rules as the notebook: Saturday never counts, '
          + 'Friday is offered only when the days pass one, and a '
          + 'non-consecutive switch adds a second stretch. The green line '
          + 'reads out exactly which days before you save.',
        demo: 'tap',
      },
      {
        title: 'And the days go everywhere the task goes',
        body: 'A task made this way shows on every one of its days in the '
          + 'worker\'s portal, on all the calendars, and on the weekly '
          + 'notebook\'s squares for whoever it is assigned to.',
        demo: 'list',
      },
    ],
  },
  {
    date: '2026-09-15',
    title: 'The widget store, tidied: one widget per job',
    items: [
      {
        title: 'Twenty fewer widgets, nothing lost',
        body: 'Thirty-eight of the store\'s widgets were seventeen widgets '
          + 'wearing two or three coats — most of them big-type TV copies from '
          + 'before the wall learned to scale. They are merged now: everything '
          + 'an absorbed widget could show survives as a switch in the '
          + 'surviving widget\'s pencil, and every widget already placed on '
          + 'any board keeps working exactly as it was.',
        demo: 'sparkle',
      },
      {
        title: 'One widget, one switch',
        body: 'Due today, Tomorrow and Week ahead became one “Coming up” with '
          + 'the window in its pencil. The three stage pictures became '
          + '“Stages” (legend or bars) and “One stage” (number or ring). The '
          + 'three photo widgets became one “Latest photos” with three looks. '
          + 'The clock gained Hebrew-date and next-holiday switches, the '
          + 'Calendar gained load shading, and “On site today” can now read '
          + 'the weekly notebook live.',
        demo: 'tap',
      },
      {
        title: 'One "Find a job", the forgiving one',
        body: 'There were two widgets with the identical name. The one that '
          + 'finds Hebrew names typed in English — and forgives a spelling '
          + 'that is nearly right — is the one that stays.',
        demo: 'list',
      },
    ],
  },
  {
    date: '2026-09-14',
    title: 'A calmer touch screen, numbers that open, and the reel grows up',
    items: [
      {
        title: 'Dragging a day of a multi-day task asks what you meant',
        body: 'Move a day-card of a task that covers several days and the '
          + 'notebook asks: move this day, add this day to the existing task, '
          + 'or a new task on this day. The “day 1 of 3” numbers follow the '
          + 'calendar and renumber themselves, and dropping onto a day the '
          + 'task already covers asks its own plain question.',
        demo: 'drag',
      },
      {
        title: 'The tap-in board works on the TV wall',
        body: 'Pressing a name on the wall panel now really clocks them in or '
          + 'out — the wall being read-only no longer silences it, because a '
          + 'punch goes to the time clock, not the board. The name tiles also '
          + 'fill the widget in even rows: a taller widget means bigger '
          + 'buttons, and every pixel of a tile presses as one button.',
        demo: 'tap',
      },
      {
        title: 'Touching a widget no longer starts typing',
        body: 'On the touch screen, tapping a widget or a calendar card used '
          + 'to drop a text cursor into it. A tap now does what it should: a '
          + 'job card opens the job, a widget just responds. Only notes, '
          + 'boxes and titles still open for typing on a second tap.',
        demo: 'tap',
      },
      {
        title: 'Press a number, see its list',
        body: 'A widget saying “2 overdue” now opens the two jobs when you '
          + 'press it — on the office board and on the TV wall alike. The '
          + 'monthly heat map also reads the weekly notebook now, so a '
          + 'planned day is a busy day.',
        demo: 'list',
      },
      {
        title: 'The TikTok reel: full screen, and a real settings room',
        body: 'A full-screen button on the reel; in full screen a tap brings '
          + 'the controls back, then pauses and resumes, and a × is always '
          + 'there to leave. The sound button no longer restarts the video. '
          + 'The sliders button opens a big manager where every link is a '
          + 'tile with the video\'s own picture — hide or remove each one.',
        demo: 'zoom',
      },
      {
        title: 'A Google Photos album on the board',
        body: 'Paste a shared album link and the widget wears the album\'s '
          + 'own cover with the Photos mark — press it and the album opens. '
          + 'An album that isn\'t shared says so, with what to press in '
          + 'Google Photos.',
        demo: 'sparkle',
      },
      {
        title: 'The map chooses what it shows',
        body: 'The map widget\'s pencil now offers: every job, only jobs with '
          + 'an address, or just today\'s work — with the crew\'s names on '
          + 'the pins.',
        demo: 'pin',
      },
      {
        title: 'Visiting another workspace brings you back',
        body: 'Opening an apartment from another workspace — a Building '
          + 'Progress square, a notebook card — takes you there, opens the '
          + 'full window, and brings you back to where you were standing the '
          + 'moment you close it.',
        demo: 'drag',
      },
      {
        title: 'The board photographs itself',
        body: 'Layout history can now take snapshots by itself — every hour, '
          + 'or once a day — in its own slots, so they never push out one '
          + 'you saved on purpose. “Room above” and “Room on the left” can '
          + 'be undone with Ctrl+Z, and the settings explainers moved into '
          + 'little ⓘ bubbles.',
        demo: 'sparkle',
      },
    ],
  },
  {
    date: '2026-09-13',
    title: 'New jobs announce themselves, and the Drive link does the typing',
    items: [
      {
        title: 'A new job lands in front of you, glowing',
        body: 'Adding a job — or taking one out of a group — places it in the '
          + 'middle of what you are looking at, nudged aside if something is '
          + 'already there. It glows softly until the first time you select '
          + 'it, so a new arrival can never be lost on a big board.',
        demo: 'sparkle',
      },
      {
        title: 'Paste the Drive link first — the name fills itself in',
        body: 'The Add Job form now starts with the Google Drive folder link. '
          + 'Paste it and the family name is read off the folder\'s own title '
          + 'and filled in automatically. A name you type yourself is never '
          + 'overwritten.',
        demo: 'tap',
      },
    ],
  },
  {
    date: '2026-09-12',
    title: 'Search that plans, a calendar card you can read, and a calmer wheel',
    items: [
      {
        title: 'Drag a job straight out of the search',
        body: 'Find a job with the search, then drag its row onto a day in the '
          + 'weekly notebook to plan it — or onto the open board, where it '
          + 'lands as a tile and comes OUT of whatever group was holding it. '
          + 'The search dims out of the way while you drag.',
        demo: 'drag',
      },
      {
        title: 'The crosshair follows a job into its group',
        body: 'Pressing the little crosshair on a search result now works for '
          + 'a job filed in a group too: the group opens with that job '
          + 'scrolled into view and pulsing.',
        demo: 'pin',
      },
      {
        title: 'The notebook card, rebuilt',
        body: 'A job on the calendar shows its WHOLE name on top, bigger — no '
          + 'more three dots. Its open tasks are listed inside the same card, '
          + 'one per row, instead of separate tiles for the job and its '
          + 'tasks; the counter and the Drive, Zoho and plan buttons sit '
          + 'bottom-right.',
        demo: 'list',
      },
      {
        title: 'Scrolling can just scroll',
        body: 'New in board settings: "Scrolling moves the board, not the '
          + 'zoom". Turn it on and the wheel moves the page up and down like '
          + 'any other page — zooming is the − and + buttons on top '
          + '(Ctrl+wheel still zooms).',
        demo: 'zoom',
      },
      {
        title: 'Zooming out keeps the work below the buttons',
        body: 'The board\'s paper still runs up to the top bar, but zooming '
          + 'out now frames the widgets and tiles BELOW the floating buttons '
          + 'instead of hiding them underneath. And a section box that was '
          + 'once sent to the back before locks existed is clickable again.',
        demo: 'tap',
      },
    ],
  },
  {
    date: '2026-09-11',
    title: 'A section can no longer trap what sits inside it',
    items: [
      {
        title: 'Sections stay under the work',
        body: 'A section box is furniture: it now always draws UNDERNEATH '
          + 'widgets, tiles and groups, even one that was brought to the '
          + 'front. A calculator inside a section used to become unclickable '
          + '— every press landed on the see-through section instead. Now a '
          + 'click on the thing hits the thing, and a click on the section’s '
          + 'own open surface still selects the section.',
        demo: 'tap',
      },
    ],
  },
  {
    date: '2026-09-10',
    title: 'The paper meets the top bar',
    items: [
      {
        title: 'No more grey strip above the board',
        body: 'The board’s paper now runs all the way up to the white bar — '
          + 'the floating buttons sit on the paper, not on a band of grey desk '
          + 'held open above it. An invisible margin at the top keeps tiles '
          + 'and widgets from ever landing underneath the buttons, so the '
          + 'space is protected without being visible.',
        demo: 'zoom',
      },
    ],
  },
  {
    date: '2026-09-09',
    title: 'The TV size dial finally moves the picture',
    items: [
      {
        title: 'One number, honestly applied',
        body: 'Each TV has one display size, and 160% now means everything on '
          + 'that panel is genuinely 1.6 times bigger — cards, graphs, words. '
          + 'The hidden ceilings that froze a wide panel at one size are gone, '
          + 'so the dial moves the picture at every setting, and it goes up '
          + 'to 300%. A saved size always beats an old address-bar setting.',
        demo: 'zoom',
      },
      {
        title: 'The TV answers you',
        body: 'Change a panel’s size — from settings, or with its own + and − '
          + '— and the wall itself flashes “Display size 90% → 160%” for a few '
          + 'seconds. A press made across the building is visible from across '
          + 'the room.',
        demo: 'sparkle',
      },
      {
        title: 'The red button walks you to readable',
        body: '“Make the words readable” now takes a measured step — at most a '
          + 'quarter bigger per press — waits for the TV to re-measure itself, '
          + 'and offers the next step until the words clear the line. Each '
          + 'press says exactly what it is about to do: 90% → 113%.',
        demo: 'tap',
      },
      {
        title: 'A test pattern on the glass',
        body: 'The PX button on the wall’s bar draws sample sentences at known '
          + 'real pixel sizes and a ruler of 100-pixel blocks, so you can stand '
          + 'in front of the panel and decide with your own eyes. It goes away '
          + 'by itself.',
        demo: 'pin',
      },
    ],
  },
  {
    date: '2026-09-08',
    title: 'The corner settled, layouts you can try on, and redo that stays',
    items: [
      {
        title: 'The board’s corner is the top-left, full stop',
        body: 'The starting corner — top-left, where the canvas begins — is '
          + 'locked to the screen. Zoom all the way out and the whole board '
          + 'lands against it, with the grey desk showing past the right and '
          + 'bottom edges only. 100% comes home flush.',
        demo: 'zoom',
      },
      {
        title: 'Try a layout on before restoring it',
        body: 'Every snapshot in Layout history now has a Preview: the board '
          + 'draws exactly as it was then — pan and zoom around it, nothing is '
          + 'written — with a banner offering Restore or Back to now. And each '
          + 'snapshot says plainly what restoring would do: how many things '
          + 'move back (with names), what was added since and keeps its spot, '
          + 'and what it remembers that no longer exists. Restoring is one '
          + 'undo step.',
        demo: 'list',
      },
      {
        title: 'Undo no longer eats your redos',
        body: 'Undo five times and all five redos are still there — the redo '
          + 'trail only clears when you genuinely do something NEW after an '
          + 'undo. Anything the undo itself touches along the way can no '
          + 'longer wipe it.',
        demo: 'tap',
      },
    ],
  },
  {
    date: '2026-09-07',
    title: 'The TV scaling disease, cured at the root',
    items: [
      {
        title: 'Widgets on the wall finally scale like the board',
        body: 'The wall was drawing every widget at its factory size inside '
          + 'whatever box you gave it — stretch a widget to double size on the '
          + 'board and the TV showed small print floating in a big empty card, '
          + 'then zoomed THAT down to fit the region. No size button could '
          + 'rescue words that started small. Widgets now scale their contents '
          + 'to their boxes on the wall exactly as they do on the board, which '
          + 'is most of why the TV text was unreadable.',
        demo: 'sparkle',
      },
      {
        title: 'The size buttons on the TV stick — and settings sees them',
        body: 'The TV’s own − / + and "make the words readable" used to change '
          + 'a private setting that died with the tab AND silently blocked every '
          + 'later change from the office. They now write the panel’s own saved '
          + 'size — the same one its card in settings shows — so pressing a '
          + 'button on either end is visible on both, live.',
        demo: 'tap',
      },
      {
        title: 'Before and after, in the TV’s own measurements',
        body: 'Press "Make the words readable" on a TV’s card and it tells you '
          + 'what it is doing — 90% → 140% — then the panel re-measures itself '
          + 'and the card shows the words’ real size before and after, green '
          + 'when they cleared the readable line, red with advice when they '
          + 'have not. No more pressing a button and seeing nothing change.',
        demo: 'list',
      },
    ],
  },
  {
    date: '2026-09-06',
    title: 'Every TV, live in settings — each with its own view and size',
    items: [
      {
        title: 'Your TVs report themselves',
        body: 'Open the TV link on any panel and it appears in Settings → TV '
          + 'under "Your TVs, live" — with its real resolution, its real shape, '
          + 'whether it is showing right now, and how big the smallest words on '
          + 'it actually are. No more guessing an aspect ratio from across the '
          + 'building.',
        demo: 'sparkle',
      },
      {
        title: 'Each TV gets its own setup',
        body: 'Name each panel, drag its own green box over the board to choose '
          + 'what THAT panel shows, and set its own display size — two TVs can '
          + 'show two different slices at two different sizes. The box is drawn '
          + 'at the panel’s real shape, so what you frame is what it fills. '
          + 'Changes reach an open panel within seconds.',
        demo: 'drag',
      },
      {
        title: 'One press to make the words readable',
        body: 'When a panel reports its text is too small to read from across a '
          + 'room, its card shows a red button that raises that panel’s size by '
          + 'exactly the amount it measured it needs.',
        demo: 'tap',
      },
      {
        title: 'The section box looks right on the wall',
        body: 'A section draws on the TV the way it draws on the board — a '
          + 'light tint with its name on a header bar — instead of a solid slab '
          + 'of colour over everything.',
        demo: 'pin',
      },
    ],
  },
  {
    date: '2026-09-06',
    title: 'The white TV found, the whole board in one view, and sharper widgets',
    items: [
      {
        title: 'The white TV screen — found and fixed',
        body: 'One hand-made group on the board crashed the whole wall page, '
          + 'which is why the TV link showed nothing but white. Fixed — and the '
          + 'wall now has a safety net, so a record it cannot draw blanks only '
          + 'its own card, never the screen. Your big section box also draws '
          + 'tinted on the wall now instead of as a solid slab over everything.',
        demo: 'sparkle',
      },
      {
        title: 'Zoom out and see EVERYTHING',
        body: 'The zoom keeps stepping down past 25% until the entire board is '
          + 'on screen — flush to the top and right, with the grey desk showing '
          + 'on the left and below. 100% still comes back flush with no grey on '
          + 'the pinned sides, and the margins around your work are part of the '
          + 'board again.',
        demo: 'zoom',
      },
      {
        title: 'Room above, a little at a time',
        body: 'The Room above / Room on the left buttons add a modest slice of '
          + 'board space per press instead of a whole screenful — and nothing '
          + 'on screen moves while they do it. Press again for more.',
        demo: 'tap',
      },
      {
        title: 'Search results float over the board',
        body: 'Type in a Find-a-job widget and the results drop down OVER the '
          + 'neighbouring widgets, full size and readable at any zoom, instead '
          + 'of being squeezed inside the widget’s own box. Click a result to '
          + 'open it; Escape puts it away.',
        demo: 'list',
      },
      {
        title: 'Clocks that fill their box, links that show their site',
        body: 'Make the world clocks bigger and the type grows with it, always '
          + 'fitting. A link tile now wears the website’s own logo. And '
          + 'resizing a widget can no longer stick to the mouse and keep '
          + 'resizing after you let go.',
        demo: 'drag',
      },
    ],
  },
  {
    date: '2026-09-05',
    title: 'The board behaves, the TV shows up, and other workspaces peek',
    items: [
      {
        title: 'The grey desk knows its place — and the board remembers yours',
        body: 'Grey space shows only past the board’s right and bottom edges (and '
          + 'on a side you have unlocked); the top and left pin to the corner '
          + 'again, so 100% comes back flush and zooming out lands the whole '
          + 'board on screen. And the board now reopens exactly where you left '
          + 'it — same spot, same zoom.',
        demo: 'zoom',
      },
      {
        title: 'Arranging got hands',
        body: 'Arrow keys nudge whatever is selected (hold Shift for bigger '
          + 'steps). Dragging several things at once draws the same alignment '
          + 'guides a single drag gets. And “Send to back” can no longer push a '
          + 'note somewhere unclickable.',
        demo: 'drag',
      },
      {
        title: 'A unit from another workspace opens WITHOUT leaving the board',
        body: 'Click a square in Building Progress or a unit card and a small '
          + 'window shows the unit — stage, address, phone, links, notes, open '
          + 'tasks — right on the job board. Close it and you are still on the '
          + 'board. “Open in …” is there for when you really do want to travel.',
        demo: 'tap',
      },
      {
        title: 'The TV works out of the box',
        body: 'The wall now fits the whole board to the screen when no region is '
          + 'chosen — a fresh TV never opens on blank space again. In settings, '
          + 'the “What the TV shows” box has aspect-ratio buttons that SAVE your '
          + 'panel’s shape, and the box is locked to that shape — it can even '
          + 'reach past the board’s edges so the whole board fits any screen.',
        demo: 'pin',
      },
      {
        title: 'The wall dashboard arranges like everything else',
        body: 'Pick a card up by its corner handle and carry it where you want; '
          + 'resize from the bottom-right, snapping to the grid. The arrow '
          + 'buttons are gone.',
        demo: 'drag',
      },
      {
        title: 'Small fixes with big tempers',
        body: 'The TikTok widget keeps your sound choice when it moves to the '
          + 'next video. Ctrl+P while a plan is open prints THE PLAN — the sheet '
          + 'with its markup — never the webpage. The section box lost the voice '
          + 'memo mic it never should have had. And on a new computer (or after '
          + 'clearing the browser), the other workspaces’ widgets fill '
          + 'themselves from the cloud instead of saying “not opened on this '
          + 'device yet”.',
        demo: 'sparkle',
      },
    ],
  },
  {
    date: '2026-09-04',
    title: 'The notebook reads like a diary, and tasks walk onto it',
    items: [
      {
        title: 'Newest week on top',
        body: 'The week being worked sits at the top when the notebook opens; '
          + 'history stacks away below it. The little plus at the top adds the '
          + 'NEXT week; the one at the bottom adds an earlier one. Nothing '
          + 'already written moved.',
        demo: 'list',
      },
      {
        title: 'Assigned tasks show themselves',
        body: 'Give a worker a task with a due date — in any workspace — and it '
          + 'appears in that worker’s square on that day, drawn dashed so you can '
          + 'tell it from a card you placed. Change the task’s date or worker and '
          + 'the chip follows; finish the task and it leaves. A task you already '
          + 'placed by hand is never shown twice. Turn it off in the pencil if '
          + 'you want a quiet sheet.',
        demo: 'tap',
      },
      {
        title: 'Removing the main notebook cannot lose the planning',
        body: 'Remove the main while a second copy stands and the copy inherits '
          + 'everything — every week, every card, every job filed in it — and '
          + 'becomes the main. Remove the last one and the planning is filed '
          + 'away, coming back with the next notebook you place. The only way to '
          + 'delete what is written is to delete it card by card.',
        demo: 'sparkle',
      },
    ],
  },
  {
    date: '2026-09-03',
    title: 'The notebook finally lets go — the cloud bug is found',
    items: [
      {
        title: 'Taking a job off the notebook STICKS now',
        body: 'Found it: the cloud save could add to a notebook but never truly '
          + 'remove from it, so every X and every drag-off looked done and came '
          + 'back on the next sync — on every device. That is fixed at the root, '
          + 'and proven against a real database. If a save ever fails now, the '
          + 'header says "Not saved to cloud" in red instead of pretending.',
        demo: 'sparkle',
      },
      {
        title: 'Drag a unit out of Building Progress onto the board',
        body: 'A square from another workspace’s diagram now lands on the board '
          + 'as a UNIT CARD — the workspace, the unit, its stage and address. The '
          + 'unit itself stays where it lives; clicking the card travels there and '
          + 'opens it.',
        demo: 'drag',
      },
      {
        title: 'You can see what you are dragging',
        body: 'Dragging a job out of any list or square now shows a little card '
          + 'under your hand with the job’s name, so the drag reads as a drag '
          + 'instead of nothing happening until you let go.',
        demo: 'tap',
      },
    ],
  },
  {
    date: '2026-09-03',
    title: 'The board breathes, the search learns',
    items: [
      {
        title: 'Zooming out stays under your mouse',
        body: 'The board now shows the grey desk around its edge, so zooming out '
          + 'holds the point under the cursor all the way down instead of hitting '
          + 'the corner and sliding away. The board still grows and shrinks with '
          + 'what is on it, exactly as before.',
        demo: 'zoom',
      },
      {
        title: 'Search results in the right order — and it remembers',
        body: 'A name that starts with what you typed comes first, then names that '
          + 'contain it, and only then the maybe-you-meant guesses — a stage can '
          + 'no longer sit above the job actually called that. And when you pick a '
          + 'result, the search remembers: type the same few letters again and '
          + 'your pick is the first answer, the way Drive does it.',
        demo: 'list',
      },
      {
        title: 'Cut, and paste to the middle of the screen',
        body: 'Select things and press Ctrl+X — they fade, waiting. Paste (Ctrl+V '
          + 'or right-click) carries them to the middle of what you are looking '
          + 'at, keeping their arrangement. Copy does the same but duplicates. '
          + 'One thing or a whole lasso-full.',
        demo: 'drag',
      },
      {
        title: 'A focus button on everything, and full screen',
        body: 'Every tile and widget has a crosshair button beside its lock: press '
          + 'it and the board glides that thing to the centre of the screen. And a '
          + 'full-screen button sits beside the zoom controls, for a wall of work '
          + 'with no browser chrome. Job rows in widgets now wear their stage '
          + 'colour, and widget scrollbars only appear under the pointer.',
        demo: 'tap',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'Drag a job anywhere, and the plan follows your hand',
    items: [
      {
        title: 'Any list of jobs drags onto the board',
        body: 'A job in "New this week", the Job list, "Running late" or a progress '
          + 'square can be dragged straight onto the board — let go over empty board '
          + 'and its tile lands right there, out of whatever notebook or group was '
          + 'holding it. The same rows still drag onto a notebook day, exactly as before.',
        demo: 'drag',
      },
      {
        title: 'The plan zooms to your mouse, and Move drags the view',
        body: 'Zooming a plan now goes to the point under the mouse, from the very '
          + 'first step. And with the Move tool held, dragging on empty sheet slides '
          + 'the plan around — no need to switch to Pan and back.',
        demo: 'zoom',
      },
      {
        title: 'The board settles clear of the toolbar',
        body: 'Carrying a widget in from the far right used to end with the board '
          + 'sliding its edge — and your widget — underneath the tool rail. The board '
          + 'now rests its edge against the rail instead, so what you just put down '
          + 'stays in view.',
        demo: 'sparkle',
      },
      {
        title: 'The TikTok reel really plays, and has a sound button',
        body: 'The play button at the bottom starts and pauses the video itself, a '
          + 'sound button right beside it turns the volume on and off, and the reel '
          + 'only moves on when a video finishes — not on a timer that cut them off '
          + 'mid-clip. Videos start silent because browsers insist; one press of the '
          + 'sound button fixes that.',
        demo: 'tap',
      },
    ],
  },
  {
    date: '2026-09-02',
    title: 'The search at the top looks everywhere',
    items: [
      {
        title: 'Every workspace, not just the one you are in',
        body: 'The search beside the settings button only ever looked in whichever '
          + 'workspace was open. It now searches Wolfson, Netiv and the Job Board '
          + 'together, and every row says which one it came from and which building. '
          + 'Choosing a result takes you there \u2014 it switches workspace for you.',
        demo: 'list',
      },
      {
        title: 'What you looked for last',
        body: 'Open the search with nothing typed and it shows your recent searches. '
          + 'Press one to run it again. Kept on this computer only.',
        demo: 'tap',
      },
      {
        title: 'Show me where it is',
        body: 'The crosshair beside a result used to appear only on the Job Board. It is '
          + 'on every result that has a place now \u2014 press it on a Wolfson unit and '
          + 'the diagram scrolls to that apartment and picks it out, without opening it.',
        demo: 'pin',
      },
    ],
  },
  {
    date: '2026-09-01',
    title: 'A second weekly notebook is a real notebook',
    items: [
      {
        title: 'Every control, on both of them',
        body: 'A second notebook used to be a picture of the first — no X on its cards, '
          + 'nothing could be dropped on it, nothing dragged. It now has everything the '
          + 'first one has: drag a card between days, drop a job on it, the X, and the '
          + 'same move-or-copy question. Whichever one you work on, both change.',
        demo: 'drag',
      },
      {
        title: 'If you had two that were not talking, they are one now',
        body: 'A notebook added before this existed kept its own separate copy of the '
          + 'week. The two looked the same and shared nothing, so taking a card off one '
          + 'left it standing on the other. The app now joins them on its own, keeping '
          + 'whichever holds more, and files the other one\u2019s week away rather than '
          + 'dropping it \u2014 nothing is lost.',
        demo: 'sparkle',
      },
    ],
  },
  {
    date: '2026-08-31',
    title: 'The plan gets its own two bars, over the plan',
    items: [
      {
        title: 'The plan\u2019s buttons no longer sit across the job',
        body: 'They used to run along the top of the whole drawer, over the family name '
          + 'and the worker-status button \u2014 controls for the sheet laid across a '
          + 'column that has nothing to do with it. They now start at the plan\u2019s own '
          + 'left edge and stay there.',
        demo: 'tap',
      },
      {
        title: 'Two rows: what the sheet is, and what you can do to it',
        body: 'Top row: the plan\u2019s name, then the folder path and Mark up at the right. '
          + 'Row underneath: Pin and Plans on the left, then Layers, Download, Print and '
          + 'full screen at the right.',
        demo: 'list',
      },
      {
        title: 'Plans is the only chooser now',
        body: 'Press Plans and it switches which sheet you are looking at \u2014 the main '
          + 'folder, any folder beside it, and the saved markup versions, all in one place. '
          + 'The separate folder dropdown, the row of sheet bubbles and the Saved-versions '
          + 'button are gone, because Plans reaches all three.',
        demo: 'sparkle',
      },
    ],
  },
  {
    date: '2026-08-30',
    title: 'Undo and redo — and a warning before anything that matters',
    items: [
      {
        title: 'A list of what is about to be undone',
        body: 'The clock icon beside the arrows opens the list of everything you can '
          + 'take back, newest first. The one Ctrl+Z would take is marked "next", and any '
          + 'step that will stop and ask says so before you press it. Press a step further '
          + 'down and it undoes everything back to there, asking once for the lot.',
        demo: 'list',
      },
      {
        title: 'Ctrl+Z takes it back',
        body: 'Moved a tile you did not mean to move? Ctrl+Z (⌘Z on a Mac) puts it back '
          + 'exactly where it was, and Ctrl+Shift+Z puts it forward again. It covers '
          + 'moving, resizing, colours, locks, grouping, and anything you have just '
          + 'placed on the board. There are arrows in the board bar too, for the iPad.',
        demo: 'drag',
      },
      {
        title: 'Anything sensitive asks you first',
        body: 'Taking something back that puts real content in or out — a card on the '
          + 'weekly notebook, a widget you removed, a job filed into a group — stops and '
          + 'tells you in plain words exactly what it is about to do, naming the job, the '
          + 'person and the day. Then you say yes or leave it. Nothing is ever deleted by '
          + 'an undo, and Redo puts it straight back.',
        demo: 'tap',
      },
      {
        title: 'A removed widget really does come back',
        body: 'Removing a note or a widget used to be final. Now it comes back with its '
          + 'words, its settings and anything it was holding — including the jobs a '
          + 'notebook had in it. Typing in a box keeps its own undo, so Ctrl+Z inside a '
          + 'field still just fixes the word you are typing.',
        demo: 'sparkle',
      },
    ],
  },
  {
    date: '2026-08-29',
    title: 'Groups drag like the board, and the plan bar is one row',
    items: [
      {
        title: 'Drag the canvas inside a group',
        body: 'A plain drag on empty space inside a group now moves the board around, '
          + 'exactly as it does outside. Hold Ctrl to draw a selection box instead. The '
          + 'board also stops shuffling itself while you are still holding something — it '
          + 'closes up any empty edge once you let go, not during.',
        demo: 'drag',
      },
      {
        title: 'Only files you can actually open show up as plans',
        body: 'DWGs and other drawing files no longer appear as chips over the plan — '
          + 'Drive was labelling them as pictures and they opened onto nothing. Photos '
          + 'of a riser or a panel do show up and can be marked up like any sheet.',
        demo: 'list',
      },
      {
        title: 'One bar over the plan',
        body: 'The file name, the pin, Plans, Layers, Download and Print have moved up '
          + 'into the blue bar, to the left of the folder picker — so there is one row '
          + 'over the sheet instead of two, and no scrollbar under the file chips.',
        demo: 'tap',
      },
      {
        title: 'The TikTok reel plays, and fits its box',
        body: 'Press play and the video starts. There is a separate button for walking '
          + 'through the reel by itself, and a setting for starting on its own. The video '
          + 'is now drawn the right shape for whatever size you have made the widget, '
          + 'instead of being stretched across it.',
        demo: 'zoom',
      },
    ],
  },
  {
    date: '2026-08-28',
    title: 'Drawing inside a group, and spacing that lines itself up',
    items: [
      {
        title: 'The pen, the highlighter and the eraser work inside a group',
        body: 'A group window is a board, so it draws like one. Pick the pen, the '
          + 'highlighter or the eraser at the top of the window and a strip appears with '
          + 'its colours and its thickness; press the same button again — or Escape — to '
          + 'put it down. Drawing over a job tile draws over it, exactly as on the board.',
        demo: 'tap',
      },
      {
        title: 'A straight line can be rubbed out again',
        body: 'A perfectly straight stroke could not be erased anywhere in the app: its own '
          + 'resize handles sat on top of every pixel of it and swallowed the press. It '
          + 'erases and draws over now, on the board and inside a group.',
        demo: 'sparkle',
      },
      {
        title: 'Things space themselves as well as line up',
        body: 'Drop something between two others and it lands with equal space either side. '
          + 'Put it at the end of a row and it takes the same gap the row already uses. Each '
          + 'space is shown with a little bar and the number, so you can see why it went '
          + 'where it did — and the same happens while you resize.',
        demo: 'drag',
      },
      {
        title: 'A group lines things up too',
        body: 'Dragging and resizing inside a group now snaps to its neighbours and shows '
          + 'the same lines, and its overview map, lasso select and sort control are all '
          + 'the board’s own.',
        demo: 'zoom',
      },
    ],
  },
  {
    date: '2026-08-27',
    title: 'Groups open properly, and jobs can be planned from anywhere',
    items: [
      {
        title: 'Your own groups open, and count',
        body: 'A group you made yourself — or one the import made — showed 0 jobs however '
          + 'many were in it, would not open when you clicked it, and offered to rename '
          + 'itself when you double-clicked. All three are fixed, and the same group now '
          + 'shows properly on the wallboard too.',
        demo: 'tap',
      },
      {
        title: 'Inside a group is the same board as outside it',
        body: 'Jobs in a group are drawn as the same tiles you see on the board, with the '
          + 'same right-click menu, the same lock, the same Drive and plan links. The group '
          + 'window zooms and can be dragged around, like the board.',
        demo: 'drag',
      },
      {
        title: 'Drag a job onto a day from any list',
        body: 'Any job shown in a widget — Running late, Due today, New this week, the job '
          + 'list, and the squares in Building Progress — can be dragged straight onto a day '
          + 'in the weekly notebook. You no longer have to find it on the board first.',
        demo: 'drag',
      },
      {
        title: 'The notebook asks what you meant',
        body: 'Dragging a job from one day to another now asks whether to move it, leave a '
          + 'copy on both days, or take it off the notebook — instead of guessing from '
          + 'whether you were holding a key. Dropping one outside the notebook asks too.',
        demo: 'list',
      },
      {
        title: 'Deleted jobs leave the notebook with them',
        body: 'Squares that said "(job removed)" are cleared, and deleting a job from now on '
          + 'takes it out of every notebook as it goes.',
        demo: 'sparkle',
      },
      {
        title: 'The building name stays on top',
        body: 'Scrolling down a building no longer slides the apartments over its name. '
          + 'There is a small padlock on the name if you would rather have the extra row of '
          + 'screen — press it and the name scrolls away with everything else.',
        demo: 'pin',
      },
      {
        title: 'And the plan Layers button works',
        body: 'Switching one of a drawing’s own layers off really removes it from the sheet '
          + 'now. It was changing the setting and redrawing nothing.',
        demo: 'zoom',
      },
    ],
  },
  {
    date: '2026-08-26',
    title: 'The wallboard can tell you why it looks bad',
    items: [
      {
        title: 'It now says how big the writing really is',
        body: 'The ⓘ button on the wall reports the words’ true height in screen pixels — '
          + 'anything under about fourteen cannot be read from across a room. It also shows '
          + 'the wall’s own zoom on its own line, because turning that down is the easiest '
          + 'way to make everything unreadable without realising that is what happened.',
        demo: 'sparkle',
      },
      {
        title: 'And one button puts it right',
        body: 'If the writing is too small the report offers a single press that sets the '
          + 'wall’s zoom to whatever makes it readable and goes full screen. No keyboard, no '
          + 'browser settings — it can all be done from in front of the screen.',
        demo: 'tap',
      },
      {
        title: 'The wall draws in the screen’s own pixels',
        body: 'When a browser is laying the page out wider than the panel can show, the wall '
          + 'now lays itself out in the panel’s real pixels instead, so every letter is drawn '
          + 'at the size it actually appears rather than being shrunk into a fraction of a '
          + 'pixel. Screens already drawing normally are left exactly as they were.',
        demo: 'zoom',
      },
    ],
  },
  {
    date: '2026-08-25',
    title: 'The year’s jobs arrive on the board',
    items: [
      {
        title: '1,148 jobs from the CRM, already in their groups',
        body: 'Every job from the past year comes in with its family name, address, phone, '
          + 'Drive folder and Zoho link, filed into Done, Ready to Start, Archive, Trash, '
          + 'Currently in AC or Currently in Geves — and carrying the right stage. Nothing '
          + 'you made by hand is touched.',
        demo: 'list',
      },
      {
        title: 'And the whole import comes back out with one press',
        body: 'Job Board settings keeps a line for every import — the date, how many jobs, '
          + 'and how many have been edited since. Remove it and exactly those jobs go, on '
          + 'every device. Anything typed by hand is never touched.',
        demo: 'tap',
      },
      {
        title: 'The bar tells you how far it has got',
        body: 'While an import runs, the screen is held with a bar that names what it is '
          + 'doing and counts through it — creating the jobs, then opening each one’s plans '
          + 'and photos in Drive. It used to be able to finish so fast that the bar never '
          + 'drew at all, which looked like nothing happening.',
        demo: 'sparkle',
      },
    ],
  },
  {
    date: '2026-08-24',
    title: 'A sharper wall, and widgets that scroll when you pick them',
    items: [
      {
        title: 'The wallboard draws at the screen’s real size',
        body: 'It used to draw the board at its normal size and then stretch the picture '
          + 'to fill the panel, which is what made the TV look soft. Now everything is '
          + 'laid out at the size it will appear, so text and lines are as sharp as the '
          + 'screen allows.',
        demo: 'zoom',
      },
      {
        title: 'And it can tell you if the fuzziness is not ours',
        body: 'The ⓘ button on the wall bar reads the screen. If the browser’s own zoom '
          + 'is under 100% — which squeezes the whole page into fewer pixels — it now '
          + 'says so and tells you to put it back to 100% and use the wallboard’s own '
          + 'minus and plus instead.',
        demo: 'sparkle',
      },
      {
        title: 'Click a widget and the wheel is its',
        body: 'Scrolling a list inside a widget used to work only if you were pointing '
          + 'exactly at the list. Select the widget and the wheel scrolls it wherever you '
          + 'point — on its heading, beside the rows, anywhere on it.',
        demo: 'tap',
      },
    ],
  },
  {
    date: '2026-08-23',
    title: 'One notebook everybody can watch',
    items: [
      {
        title: 'A second weekly notebook shows the first one',
        body: 'Put another notebook on a board and it arrives as a projection: the same '
          + 'week, live, that cannot be written into by mistake — but a job in a square '
          + 'still opens. The pencil says which copy is the main one, and changing that '
          + 'warns you first.',
        demo: 'list',
      },
      {
        title: 'The store says what you already have',
        body: 'A widget already on the board is labelled as such. You can still add '
          + 'another — that is the point of the label rather than a locked button.',
        demo: 'tap',
      },
      {
        title: 'The toolbar stopped covering Add job',
        body: 'It now sits centred in the space between the header and the board '
          + 'overview, out of the way of everything.',
        demo: 'drag',
      },
      {
        title: 'The overview sizes to whatever you want',
        body: 'Drag its top-left corner to any size instead of choosing between two, '
          + 'move it by the handle in the opposite corner, and press 0 while doing '
          + 'either to put it back.',
        demo: 'drag',
      },
      {
        title: 'Groups on the wall',
        body: 'Opening a group on the TV now shows what is in it — groups you made '
          + 'yourself came up empty — and has a search box on top, which matters when a '
          + 'group holds hundreds of finished jobs.',
        demo: 'list',
      },
    ],
  },
  {
    date: '2026-08-22',
    title: 'Plans that stay sharp, and a sticky note that is one sticky note',
    items: [
      {
        title: 'The plan viewer no longer blinks',
        body: 'Zooming used to redraw the whole sheet every step, so a big drawing '
          + 'flashed white while you were still zooming. Now the sheet grows straight '
          + 'away and is redrawn sharp a moment after you stop — and it is drawn at '
          + 'twice the screen resolution, so leaning in shows line work rather than a '
          + 'grey smear.',
        demo: 'zoom',
      },
      {
        title: 'The plan controls sit where Drive puts them',
        body: 'Page number and zoom are on a floating bar along the bottom of the sheet, '
          + 'not in a strip above it, and there is only one of each now.',
        demo: 'tap',
      },
      {
        title: 'A sticky note is one sticky note',
        body: 'It used to be a pad hiding a stack of pages and a second cork board '
          + 'inside it. Every page you had written is now its own note on the board, '
          + 'and folding the corner puts a fresh one beside it. The Notes board is the '
          + 'one board.',
        demo: 'drag',
      },
      {
        title: 'The X asks first',
        body: 'Removing anything that holds work — a note, a list, a widget you have '
          + 'filled in — now says what you would lose before it goes. The weekly '
          + 'planner stays silent because its contents are kept either way.',
        demo: 'tap',
      },
      {
        title: 'The wallboard can tell you about the screen',
        body: 'A new button on the wall bar reports what the TV is really drawing at, '
          + 'with a sharpness test — so a fuzzy panel can be diagnosed instead of '
          + 'guessed at.',
        demo: 'sparkle',
      },
    ],
  },
  {
    date: '2026-08-21',
    title: 'Deleted stays deleted, Enter saves, and the wheel goes where you point it',
    items: [
      {
        title: 'Anything you delete now stays deleted',
        body: 'Removing an import — or a single job — used to come back a day later, '
          + 'because another machine still had its own copy and quietly put it back on '
          + 'the next sync. Every deletion is now remembered for the whole company, so '
          + 'the phone, the TV and the office all agree it is gone.',
        demo: 'list',
      },
      {
        title: 'Enter saves',
        body: 'Finish typing in any box, press Enter, and it saves — a name, an '
          + 'address, a link, a group name. It used to only save when you clicked away, '
          + 'which left you wondering whether it had taken.',
        demo: 'tap',
      },
      {
        title: 'The wheel scrolls what you are pointing at',
        body: 'Hover any widget with a list in it and the wheel scrolls that list '
          + 'instead of zooming the whole board. Reach the end of the list and the wheel '
          + 'goes back to the board, so one flick still works.',
        demo: 'zoom',
      },
      {
        title: 'Zoom out and you come back to the corner',
        body: 'Zooming in still holds the spot under your pointer. Zooming back out now '
          + 'walks the view home to the top-left, so you end up looking at the board the '
          + 'way you do when you arrive rather than floating over the middle of it.',
        demo: 'zoom',
      },
      {
        title: 'Widgets feel stuck to the board',
        body: 'On every theme — cork, kraft, steel, chalk — the surface now travels and '
          + 'scales with your work instead of staying nailed to the screen while the '
          + 'widgets slide over it.',
        demo: 'drag',
      },
      {
        title: 'Words grow with the box',
        body: 'Drag a sticky note, a heading or a section box bigger and its writing '
          + 'grows with it. The text-size setting also goes smaller than it used to, for '
          + 'a dense list you want tucked in a corner.',
        demo: 'drag',
      },
      {
        title: 'The board overview shows the board’s real shape',
        body: 'The little map bottom-right now draws the board at its true proportions '
          + 'with grey around it, so a board that grew downwards no longer looks as '
          + 'though it grew sideways too. It has a grip to move it, and pressing 0 while '
          + 'moving it — or the toolbar — puts it back where it started.',
        demo: 'drag',
      },
      {
        title: 'Margins mean all four sides',
        body: 'The margin setting now keeps its gutter on the locked edges as well, '
          + 'which is the whole point of a margin.',
        demo: 'zoom',
      },
    ],
  },
  {
    date: '2026-08-20',
    title: 'Tiles that resize, a board with margins, and a map worth pointing at',
    items: [
      {
        title: 'Job tiles resize from the corner',
        body: 'Every tile now has the same corner handle a note has — drag it to make a '
          + 'job bigger or smaller, hold Shift to keep its shape, and press 0 while '
          + 'dragging to put it back to the normal size. The little label beside your '
          + 'hand says so while you drag.',
        demo: 'drag',
      },
      {
        title: 'Resize to match what is next to it',
        body: 'Drag a corner near the size of something nearby and it lands on exactly '
          + 'that size, with a line along both to show the match — so two notes can be '
          + 'made the same width without measuring. Switch it off in board settings if '
          + 'you would rather it did not.',
        demo: 'drag',
      },
      {
        title: 'The board gives space back',
        body: 'Push something out to the far corner and the board grows; bring it back '
          + 'and the empty space goes away at once instead of leaving you scrolling '
          + 'through nothing. There is also a margin setting now — a gutter kept clear '
          + 'on all four sides, like the margins on a page, so nothing sits jammed '
          + 'against the edge.',
        demo: 'zoom',
      },
      {
        title: 'Carry something to the edge and the board follows',
        body: 'Dragging a job, a widget or a whole selection against any edge of the '
          + 'screen scrolls the board that way — including back to the left and up, '
          + 'which used to just stop.',
        demo: 'drag',
      },
      {
        title: 'Building Progress reads like the real diagram',
        body: 'Each apartment shows its number and family name instead of a bare '
          + 'colour, and clicking one takes you straight into that apartment in its own '
          + 'workspace.',
        demo: 'tap',
      },
      {
        title: 'The map has proper pins',
        body: 'Big red map pins instead of dots, and hovering one shows the job: its '
          + 'address, its stage, how many tasks are open, who is booked, and the last '
          + 'photos back from site. Jobs with no address are counted plainly at the '
          + 'bottom — press it to fly to them.',
        demo: 'pin',
      },
    ],
  },
  {
    date: '2026-08-19',
    title: 'Groups you feel, a notebook that never forgets, and a corner that holds',
    items: [
      {
        title: 'Group things together, invisibly',
        body: 'Pick a few jobs or notes, right-click, and choose Group. Nothing is '
          + 'drawn around them while you work — but click any one of them and a dashed '
          + 'outline shows the whole group, so you always know what will travel '
          + 'together. Drag any member and they all move. A small blue chip appears '
          + 'beside the lock; press it on one thing and only that thing leaves.',
        demo: 'drag',
      },
      {
        title: 'The weekly notebook can never lose your planning',
        body: 'Taking the notebook off the board used to take the season with it. Now '
          + 'its contents are kept safe, the jobs that were on it come back to the '
          + 'board, and adding a notebook again brings everything that was in the last '
          + 'one straight back.',
        demo: 'list',
      },
      {
        title: 'More room in the notebook',
        body: 'The wide "put away" bar and the two add-a-week strips are gone. Each '
          + 'week now has three tiny icons beside its date — add a week before, add one '
          + 'after, and put this one away — so the weeks themselves get the space. '
          + 'Month names are bigger too.',
        demo: 'zoom',
      },
      {
        title: 'Zooming out holds the corner',
        body: 'Pressing minus keeps the top-left exactly where it is and opens the new '
          + 'room down and to the right, instead of dropping the whole board down the '
          + 'screen.',
        demo: 'zoom',
      },
      {
        title: 'A locked edge stays locked, quietly',
        body: 'Pushing something against the top or left no longer asks whether to make '
          + 'room. If you do want more space that way, there are two buttons in board '
          + 'settings.',
        demo: 'tap',
      },
      {
        title: 'Renaming a group works',
        body: 'The name box used to empty itself and lose focus about a second after you '
          + 'started typing. It stays put now. The lock is just the amber button — the '
          + 'little corner badge is gone.',
        demo: 'tap',
      },
    ],
  },
  {
    date: '2026-08-18',
    title: 'Select, a proper eraser, locks, and menus that stay on top',
    items: [
      {
        title: 'Select is back on the toolbar',
        body: 'One tile at the top of the rail is the default: drag and drop, click to '
          + 'open, everything as usual. Pick up the pen or the eraser and Select goes '
          + 'out; press Select and whatever you were holding is put down. Nothing '
          + 'about the mouse changed — it is simply a visible way back.',
        demo: 'tap',
      },
      {
        title: 'The eraser is its own tool',
        body: 'Its own tile beside the pen — no more hunting inside the pen’s '
          + 'panel. Right-click it for size and kind (rub out a piece, or take the '
          + 'whole mark), and while it is armed a circle follows your pointer showing '
          + 'exactly how much the next press will take.',
        demo: 'tap',
      },
      {
        title: 'Old scribbles finally answer',
        body: 'Drawings made long ago could refuse the eraser and refuse to be '
          + 'selected — they were ink with no thing behind it. Every old drawing is '
          + 'now quietly upgraded the first time the board opens, so it moves, '
          + 'resizes, erases and deletes like everything else.',
        demo: 'drag',
      },
      {
        title: 'Lock anything in place',
        body: 'A little lock sits beside the TV button on every tile and note. '
          + 'Locked, it cannot be dragged, resized or swept up with a group — '
          + 'dragging it moves the board instead, and a click still opens it. '
          + 'The lock shows amber so a pinned thing says why it will not move.',
        demo: 'pin',
      },
      {
        title: 'The plan section shows up instantly',
        body: 'Open a job with a Drive folder and the plan pane is there from the '
          + 'first moment with a spinner while the sheet is found — no more layout '
          + 'jumping two seconds later.',
        demo: 'zoom',
      },
      {
        title: 'The workspace menu stays on top',
        body: 'The dropdown in the header used to slide behind board buttons and '
          + 'the building names. It now paints above everything, on every page.',
        demo: 'tap',
      },
      {
        title: 'The widget store shows every widget full',
        body: 'Every card now previews on a busy example board — three tasks due '
          + 'today, late jobs, fresh photos, a filled planner — so you see exactly '
          + 'what a widget looks like in real use, not an empty box. The moment you '
          + 'place one it reads your real data.',
        demo: 'sparkle',
      },
      {
        title: 'Store shelves that make sense',
        body: 'Widgets are grouped by what they are FOR — Chasing the work, '
          + 'Catching problems, Counts and progress, People and the week, and so '
          + 'on. A small switch at the top flips between the shelves and one flat '
          + 'list of everything.',
        demo: 'list',
      },
    ],
  },
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
      {
        title: 'A finger moves the board, never the work',
        body: 'On a phone or tablet, dragging with a finger pans the board and two '
          + 'fingers pinch to zoom — tiles and notes stay exactly where they were. A tap '
          + 'still opens a job or a group. Arranging the board is done with a mouse or '
          + 'the pen, so nothing gets shoved around by accident on site.',
        demo: 'drag',
      },
      {
        title: 'The List tab',
        body: 'A new tab in the phone’s bottom bar shows every job as one list: '
          + 'search at the top (it forgives spelling and Hebrew/English mix-ups), sorted '
          + 'by what happened last — or by name or stage — with stage and group filters. '
          + 'Tap a row and the job opens.',
        demo: 'list',
      },
      {
        title: 'Plans and photos open for everyone, automatically',
        body: 'Anything the app shows from Drive used to demand a Google sign-in — and '
          + 'the office itself uses different Google accounts. Now the moment a Drive '
          + 'link is saved on a job, its Engineered Plans and Photos folders are shared '
          + 'by link on their own, and anything older heals itself the first time it is '
          + 'opened. Nothing to press, nothing to remember.',
        demo: 'tap',
      },
      {
        title: 'The import wizard',
        body: 'Job Board → settings → Import jobs: download the template, fill a row per '
          + 'job, upload it back. Leave the family name blank and it is read from the '
          + 'Drive folder\u2019s own title; Stage and Group come from your columns. A '
          + 'previous import can be removed with one press without touching anything '
          + 'made by hand.',
        demo: 'list',
      },
      {
        title: 'Notes that say they saved',
        body: 'A green tick appears the moment your general notes are written, closing '
          + 'the window can no longer lose an unsaved edit, and the paperclip and '
          + 'microphone now sit inside the notes box itself. Every voice memo can be '
          + 'played inline and deleted with its own little trash can — everywhere notes '
          + 'live.',
        demo: 'tap',
      },
      {
        title: 'The plan fills its pane',
        body: 'The plan is drawn by the app itself now — edge to edge, no grey frame, '
          + 'no Google login. The book icon above it became a folder picker: choose the '
          + 'main Engineered Plans folder or any folder inside it, and only that '
          + 'folder\u2019s sheets show as bubbles, so sixteen marked-up versions no '
          + 'longer flood the bar.',
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
