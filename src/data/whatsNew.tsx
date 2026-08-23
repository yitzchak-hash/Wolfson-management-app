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
