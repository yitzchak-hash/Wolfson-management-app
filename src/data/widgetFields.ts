/**
 * What the pen icon opens, per widget.
 *
 * Every widget node had a pencil button that called the generic text editor —
 * which no widget renders — so pressing it did nothing at all, on all 47 of
 * them. This is the missing half: a description of what each widget can
 * actually be configured with, rendered by `NodeSettings` into a real form.
 *
 * Kept as a map keyed by widget id rather than a field on `WidgetDef` so the
 * registry stays readable and a widget's settings can be changed without
 * touching its render function.
 *
 * Two scopes:
 *  - `data`    — a key inside the element's free-form `data` bag
 *  - `element` — a key on the CanvasElement itself (text, colour, type styling)
 */

export type WidgetFieldKind =
  | 'text' | 'longtext' | 'number' | 'percent'
  | 'select' | 'colour' | 'url' | 'image' | 'datetime'
  | 'job' | 'jobs' | 'contractor' | 'stage' | 'people' | 'project';

export interface WidgetField {
  key: string;
  label: string;
  kind: WidgetFieldKind;
  scope?: 'data' | 'element';        // default 'data'
  /**
   * Which collapsible section this belongs to.
   *
   * Optional, and absent means "always visible, at the top" — which is right
   * for a widget with three settings. It exists for the ones that grew past
   * about eight, where a flat list is a wall you have to read all of to find
   * the one line you came for. The planner had nineteen.
   */
  group?: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  min?: number;
  max?: number;
  /** '' is offered as a real choice — "all stages", "no job pinned". */
  allowNone?: string;
}

const title = (label = 'Heading'): WidgetField =>
  ({ key: 'title', label, kind: 'text', placeholder: 'Leave blank for the default' });

const limit = (label = 'How many to show'): WidgetField =>
  ({ key: 'limit', label, kind: 'number', min: 1, max: 50, hint: 'Blank shows as many as fit.' });

/**
 * Every text-bearing node gets the same type controls the heading already had.
 * "Any text should have text control" — so this block is shared rather than
 * re-declared, and a note, a box and a banner all offer the same choices.
 */
/**
 * The outline anything can wear.
 *
 * Grouping things on a wallboard usually means moving them, which fights every
 * other reason they are where they are. An outline groups them where they
 * stand. It goes on every node type — a widget, a note, a heading, a group —
 * so the same gesture works whatever you are looking at.
 */
export const OUTLINE_FIELDS: WidgetField[] = [
  {
    key: 'outline', label: 'Outline colour', kind: 'colour', scope: 'element',
    hint: 'Leave blank for none. Use the same colour on several nodes to tie them together.',
  },
  {
    key: 'outlineWidth', label: 'Outline thickness', kind: 'number', scope: 'element', min: 1, max: 12,
  },
];

export const TEXT_STYLE_FIELDS: WidgetField[] = [
  {
    /**
     * The floor is 4, not 8.
     *
     * On a widget this number is not a font size at all — it is a multiplier
     * against 14 that scales the whole drawing, so 8 was a hard stop at just
     * over half size on a thing somebody was deliberately shrinking to fit a
     * corner of the board. Text that small is unreadable as prose and perfectly
     * useful as a dense list you zoom into.
     */
    key: 'fontSize', label: 'Text size', kind: 'number', scope: 'element', min: 4, max: 96,
    hint: 'On a widget this scales everything in it. Leave blank to follow the node’s width.',
  },
  {
    key: 'fontWeight', label: 'Weight', kind: 'select', scope: 'element',
    options: [
      { value: '400', label: 'Normal' },
      { value: '600', label: 'Medium' },
      { value: '800', label: 'Bold' },
      { value: '900', label: 'Heavy' },
    ],
  },
  {
    key: 'align', label: 'Alignment', kind: 'select', scope: 'element',
    options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Centre' },
      { value: 'right', label: 'Right' },
    ],
  },
];

export const WIDGET_FIELDS: Record<string, WidgetField[]> = {
  // ── Live ───────────────────────────────────────────────────────────────
  kpi: [
    title('Label'),
    {
      key: 'metric', label: 'Which figure', kind: 'select',
      options: [
        { value: 'openTasks', label: 'Open tasks' },
        { value: 'overdue', label: 'Overdue tasks' },
        { value: 'jobs', label: 'Jobs on the board' },
        { value: 'dueToday', label: 'Due today' },
      ],
    },
  ],
  'stage-legend': [title()],
  'overdue-list': [title(), limit()],
  'contractor-load': [
    { key: 'contractorId', label: 'Contractor', kind: 'contractor', allowNone: 'The first one' },
  ],
  'project-mini': [
    {
      key: 'projectId', label: 'Which workspace', kind: 'project',
      hint: 'Wolfson or Netiv — the ones with buildings. Place one per workspace '
        + 'and the whole company fits on one screen.',
    },
    {
      key: 'buildingId', label: 'Which building', kind: 'text',
      placeholder: 'Blank shows every building',
      hint: 'A1, A2, A3, B1 or B2 — one diagram instead of all of them side by side.',
    },
  ],
  'project-glance': [
    title(),
    {
      key: 'projectId', label: 'Which workspace', kind: 'project',
      hint: 'The summary follows it live when it is the one you are in, and '
        + 'from its last stored snapshot otherwise.',
    },
  ],
  'board-mini': [
    title(),
    // The board itself is chosen on the widget — a picker sitting on the thing
    // is easier to find than one behind a pencil, and it has to be answered
    // before anything renders anyway.
  ],
  'calendar-mini': [title()],
  'week-ahead': [title()],
  'recent-photos': [
    title(),
    limit('How many photos'),
    {
      key: 'jobIds', label: 'Only these jobs', kind: 'jobs',
      hint: 'Leave empty for every job in this workspace. Search and tick as many as you like.',
    },
  ],
  'activity-feed': [title(), limit('How many entries')],
  'progress-ring': [
    { key: 'stageId', label: 'Reached which stage', kind: 'stage', allowNone: 'Anything started' },
  ],
  'bin-counter': [title()],
  'contractor-links': [title()],
  'stage-funnel': [title()],
  'due-today': [title()],
  'job-list': [
    { key: 'stageId', label: 'Only this stage', kind: 'stage', allowNone: 'Every job' },
    limit('How many jobs'),
  ],
  'photo-review': [title()],
  'count-by-stage': [
    { key: 'stageId', label: 'Which stage', kind: 'stage', allowNone: 'The first one' },
    {
      key: 'jobIds', label: 'Only these jobs', kind: 'jobs',
      hint: 'Leave empty to count every job in this workspace.',
    },
  ],
  'recent-jobs': [
    title(),
    { key: 'days', label: 'Added in the last… (days)', kind: 'number', min: 1, max: 90 },
  ],
  'job-search': [title()],

  // ── The ones that look for what is NOT happening ───────────────────────
  'no-date': [title(), limit()],
  'gone-quiet': [
    title(),
    {
      key: 'days', label: 'Quiet for at least… (days)', kind: 'number', min: 1, max: 60,
      hint: 'Counted from the day the task was handed out.',
    },
  ],
  'nobody-booked': [title(), limit()],
  'backlog-trend': [
    title(),
    { key: 'weeks', label: 'How many weeks', kind: 'number', min: 3, max: 16 },
  ],
  'open-snags': [title(), limit()],
  'no-plan': [title(), limit()],
  'floor-by-floor': [
    title(),
    {
      key: 'buildingId', label: 'Which building', kind: 'text', allowNone: 'All of them',
      placeholder: 'A1, A2, B1…',
      hint: 'Leave blank to stack every building together.',
    },
  ],
  duplicates: [title(), limit()],
  'skipped-stage': [title(), limit()],

  // ── Time, tactile and the cheerful ones ────────────────────────────────
  'world-clocks': [
    title(),
    {
      key: 'cities', label: 'Cities', kind: 'text',
      hint: 'Comma-separated: il, ny, la, tor, lon, ant, par, ber, mil, ist, mos, '
        + 'dub, mum, bkk, sha, hk, tok, syd, jnb, sao. Any IANA zone name works too.',
      placeholder: 'il, ny, lon, sha',
    },
    { key: 'workStart', label: 'Their day starts at', kind: 'number', min: 0, max: 23 },
    { key: 'workEnd', label: 'Their day ends at', kind: 'number', min: 1, max: 24 },
  ],
  'shabbat-clock': [
    title(),
    {
      key: 'placeId', label: 'Where', kind: 'select',
      options: [
        { value: 'jerusalem', label: 'Jerusalem' },
        { value: 'haifa', label: 'Haifa' },
        { value: 'telaviv', label: 'Tel Aviv' },
        { value: 'beersheva', label: "Be'er Sheva" },
        { value: 'netanya', label: 'Netanya' },
        { value: 'modiin', label: "Modi'in" },
        { value: 'ashdod', label: 'Ashdod' },
        { value: 'bneibrak', label: 'Bnei Brak' },
        { value: 'kiryatgat', label: 'Kiryat Gat' },
        { value: 'beitshemesh', label: 'Beit Shemesh' },
      ],
    },
    {
      key: 'candleMinutes', label: 'Candles, minutes before sunset', kind: 'number', min: 0, max: 90,
      hint: 'Jerusalem keeps 40 and Haifa 30 by custom; the rest of the country is 20. '
        + 'Leave blank to follow the city.',
    },
    {
      key: 'vanBuffer', label: 'Last van leaves, minutes before candles', kind: 'number', min: 0, max: 480,
      hint: 'The number the office actually argues about on a Friday.',
    },
  ],
  'before-after': [
    title(),
    { key: 'jobId', label: 'Which job', kind: 'job', allowNone: 'Whichever has the most photos' },
    { key: 'beforeUrl', label: 'Before picture', kind: 'image' },
    { key: 'afterUrl', label: 'After picture', kind: 'image' },
  ],
  'split-flap': [
    title(),
    {
      key: 'source', label: 'What it shows', kind: 'select',
      options: [
        { value: 'text', label: 'Words I type' },
        { value: 'openTasks', label: 'Open tasks' },
        { value: 'overdue', label: 'Overdue tasks' },
        { value: 'jobs', label: 'Jobs on the board' },
        { value: 'dueToday', label: 'Due today' },
      ],
    },
    { key: 'text', label: 'The words', kind: 'text', hint: 'Up to 24 characters. Letters, digits and . , : - / only.' },
    { key: 'size', label: 'Flap size', kind: 'number', min: 10, max: 90 },
  ],
  'crew-race': [
    title(),
    { key: 'days', label: 'Counting the last… (days)', kind: 'number', min: 1, max: 90 },
    {
      key: 'target', label: 'Finish line', kind: 'number', min: 0, max: 500,
      hint: 'Leave at nought and the leader is the finish line.',
    },
  ],
  'streak-flame': [title()],
  'spin-wheel': [
    title(),
    {
      key: 'names', label: 'Names on the wheel', kind: 'text',
      hint: 'Comma-separated. Leave blank to use your contractors.',
    },
  ],
  'bubble-wrap': [
    title(),
    { key: 'cols', label: 'Across', kind: 'number', min: 4, max: 20 },
    { key: 'rows', label: 'Down', kind: 'number', min: 3, max: 20 },
  ],
  celebrate: [title(), { key: 'label', label: 'What the button says', kind: 'text' }],
  'tap-in': [
    title(),
    {
      key: 'cols', label: 'Tiles across', kind: 'number', min: 1, max: 6,
      hint: 'Three suits a portrait wall panel; six suits a wide one.',
    },
  ],
  'job-map': [
    title(),
    {
      key: 'tiles', label: 'Map tiles', kind: 'url',
      placeholder: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      hint: 'Leave blank for OpenStreetMap. Point it at a paid tile provider here if the '
        + 'office ever outgrows the free one — the address needs {z}, {x} and {y} in it.',
    },
  ],
  weather: [
    title(),
    {
      key: 'placeId', label: 'Where', kind: 'select',
      options: [
        { value: 'jerusalem', label: 'Jerusalem' },
        { value: 'haifa', label: 'Haifa' },
        { value: 'telaviv', label: 'Tel Aviv' },
        { value: 'beersheva', label: "Be'er Sheva" },
        { value: 'netanya', label: 'Netanya' },
        { value: 'modiin', label: "Modi'in" },
        { value: 'ashdod', label: 'Ashdod' },
        { value: 'bneibrak', label: 'Bnei Brak' },
        { value: 'kiryatgat', label: 'Kiryat Gat' },
        { value: 'beitshemesh', label: 'Beit Shemesh' },
      ],
    },
  ],
  tiktok: [
    title(),
    {
      key: 'links', label: 'The links', kind: 'longtext',
      placeholder: 'https://www.tiktok.com/@someone/video/1234567890123456789',
      hint: 'Paste as many as you like — one per line, all in a row, or straight out of a '
        + 'spreadsheet. Anything that is not a link is ignored, and duplicates are dropped.',
    },
    {
      key: 'shuffle', label: 'Order', kind: 'select',
      options: [{ value: '', label: 'The order I pasted them' }, { value: '1', label: 'Shuffled' }],
    },
    {
      key: 'auto', label: 'Move on by itself', kind: 'select',
      options: [{ value: '1', label: 'Yes' }, { value: '', label: 'Only when I press next' }],
    },
    { key: 'seconds', label: 'Seconds on each', kind: 'number', min: 5, max: 600 },
  ],
  'btu-hp': [
    title(),
    {
      key: 'unit', label: 'What you type in', kind: 'select',
      options: [
        { value: 'btu', label: 'BTU/hr' },
        { value: 'hpTrade', label: 'HP (unit size)' },
        { value: 'hpMech', label: 'HP (mechanical)' },
        { value: 'ton', label: 'Tons' },
        { value: 'kw', label: 'kW' },
      ],
    },
    { key: 'value', label: 'Value', kind: 'text' },
  ],

  // ── Planning ───────────────────────────────────────────────────────────
  checklist: [title()],
  tally: [
    title('Label'),
    { key: 'n', label: 'Count', kind: 'number', min: 0 },
    { key: 'step', label: 'Each tap adds', kind: 'number', min: 1, max: 100 },
  ],
  'progress-bar': [
    title('Label'),
    { key: 'pct', label: 'How far along', kind: 'percent' },
  ],
  table: [title()],
  'order-list': [title()],
  'week-planner': [title(), {
    key: 'startsMonday', label: 'Week starts on', kind: 'select',
    options: [{ value: 'mon', label: 'Monday' }, { value: 'sun', label: 'Sunday' }],
  }],
  rota: [
    title(),
    {
      key: 'people', label: 'Who is on it', kind: 'people', group: 'People and days',
      hint: 'Contractors and office staff. Drag the handles to reorder the rows; '
        + 'each person keeps their own colour. Taking somebody off asks from when.',
    },
    {
      key: 'span', label: 'Days across', kind: 'select', group: 'People and days',
      options: [
        { value: '5', label: 'Sunday to Thursday' },
        { value: '6', label: 'Sunday to Friday' },
        { value: '7', label: 'The whole week' },
      ],
    },
    {
      key: 'weekStart', label: 'Week starts on', kind: 'select', group: 'People and days',
      options: [{ value: '0', label: 'Sunday' }, { value: '1', label: 'Monday' }],
    },
    {
      /**
       * Explicit '1'/'0', never ''.
       *
       * The old Hide value was the empty string, which is also what an
       * untouched select reads as — so the panel showed "Hide" while the
       * default actually showed them, and the toggle read as broken. The
       * default option now comes first so an untouched select DISPLAYS the
       * truth.
       */
      key: 'hebrew', label: 'Hebrew date', kind: 'select', group: 'Dates and holidays',
      options: [{ value: '0', label: 'Hide it' }, { value: '1', label: 'Show it' }],
      hint: 'Under the English date in every day header.',
    },
    {
      key: 'holJewish', label: 'Jewish holidays', kind: 'select', group: 'Dates and holidays',
      options: [{ value: '1', label: 'Show them' }, { value: '0', label: 'Hide them' }],
    },
    {
      key: 'holIsraeli', label: 'Israeli national days', kind: 'select', group: 'Dates and holidays',
      options: [{ value: '1', label: 'Show them' }, { value: '0', label: 'Hide them' }],
    },
    {
      key: 'holSecular', label: 'English / secular holidays', kind: 'select', group: 'Dates and holidays',
      options: [{ value: '', label: 'Hide them' }, { value: '1', label: 'Show them' }],
    },
    {
      key: 'divOn', label: 'Divider between trades', kind: 'select', group: 'Category dividers',
      options: [{ value: 'show', label: 'Show it' }, { value: 'hide', label: 'Hide it' }],
      hint: 'A subtle labeled line between drywall, AC, general and office rows.',
    },
    { key: 'divThick', label: 'Line thickness', kind: 'number', group: 'Category dividers', min: 1, max: 6 },
    { key: 'divColor', label: 'Line colour', kind: 'colour', group: 'Category dividers' },
    { key: 'divTextSize', label: 'Label size', kind: 'number', group: 'Category dividers', min: 6, max: 14 },
    {
      key: 'divWeight', label: 'Label weight', kind: 'select', group: 'Category dividers',
      options: [{ value: '400', label: 'Light' }, { value: '600', label: 'Medium' }, { value: '800', label: 'Bold' }],
    },
    { key: 'divTextColor', label: 'Label colour', kind: 'colour', group: 'Category dividers' },
    {
      key: 'askOnDrop', label: 'Ask when a job is dropped in', kind: 'select', group: 'Behaviour',
      options: [{ value: '1', label: 'Offer to make a task' }, { value: '', label: 'Just place it' }],
      hint: 'The stage is the only thing to choose — the day, date and person are already known.',
    },
    // ── Type ──────────────────────────────────────────────────────────
    /**
     * One dial over the whole sheet, and it comes FIRST in this group.
     *
     * The five sizes under it tune one thing each; this is the one somebody
     * reaches for when the notebook is on a wall panel and all of it is too
     * small, and it keeps the sizes in proportion rather than needing five
     * changed in step. Range matches the widget's own clamp (0.5–3), or the
     * panel would offer a number the sheet then quietly ignores.
     */
    { key: 'scale', label: 'Whole sheet size', kind: 'number', min: 0.5, max: 3, group: 'Type',
      hint: '1 is normal. 2 is twice the size — type, squares and the name column together.' },
    { key: 'dateSize', label: 'Date size', kind: 'number', min: 7, max: 34, group: 'Type',
      hint: 'The day number. It is the thing people scan for, so it starts bigger '
        + 'than the weekday under it.' },
    { key: 'dayNameSize', label: 'Weekday size', kind: 'number', min: 7, max: 28, group: 'Type' },
    { key: 'nameSize', label: "People's names", kind: 'number', min: 7, max: 30, group: 'Type' },
    { key: 'textSize', label: 'Everything else', kind: 'number', min: 7, max: 26, group: 'Type',
      hint: 'The cards in the squares, and the header.' },
    { key: 'bold', label: 'Bold text', kind: 'select', group: 'Type',
      options: [{ value: '', label: 'Normal' }, { value: '1', label: 'Bold' }] },

    // ── Colours ───────────────────────────────────────────────────────
    { key: 'dayBg', label: 'Behind a working day', kind: 'colour', group: 'Colours' },
    { key: 'offBg', label: 'Behind a day off', kind: 'colour', group: 'Colours',
      hint: 'Holidays and anything marked as no work.' },
    { key: 'todayBg', label: 'Behind today', kind: 'colour', group: 'Colours' },
    { key: 'cellBg', label: 'The squares', kind: 'colour', group: 'Colours',
      hint: 'The empty space people write in.' },
    { key: 'rowScale', label: 'Row height', kind: 'number', min: 0.6, max: 3, group: 'Colours',
      hint: '1 is normal. 1.5 gives half again as much room in every square.' },

    { key: 'start', label: 'Anchored on', kind: 'datetime', group: 'Behaviour',
      hint: 'The week or month the view opens at. The arrows move it too.' },
  ],
  milestones: [title()],
  calculator: [title('Label')],
  converter: [title('Label')],
  'weekly-goal': [
    title('Label'),
    { key: 'target', label: 'Target', kind: 'number', min: 0 },
    { key: 'done', label: 'Done so far', kind: 'number', min: 0 },
  ],
  'team-today': [title()],
  timeline: [title()],
  'multi-timer': [title()],
  'w-countdown': [
    { key: 'text', label: 'Label', kind: 'text', scope: 'element', placeholder: 'Countdown' },
    { key: 'targetAt', label: 'Counting down to', kind: 'datetime', scope: 'element' },
  ],
  'w-stopwatch': [
    { key: 'text', label: 'Label', kind: 'text', scope: 'element', placeholder: 'Stopwatch' },
  ],

  // ── Shortcuts ──────────────────────────────────────────────────────────
  contact: [
    { key: 'name', label: 'Name', kind: 'text', placeholder: 'Who' },
    { key: 'role', label: 'Role', kind: 'text', placeholder: 'Crane firm, super, inspector…' },
    { key: 'phone', label: 'Phone', kind: 'text', placeholder: '+972…' },
  ],
  link: [
    { key: 'label', label: 'Label', kind: 'text', placeholder: 'Open' },
    { key: 'url', label: 'Address', kind: 'url', placeholder: 'https://…' },
  ],
  address: [
    { key: 'text', label: 'Address', kind: 'longtext', placeholder: 'Street, city' },
  ],
  'lined-note': [title(), ...TEXT_STYLE_FIELDS],
  handover: [title()],

  // ── Look & feel ────────────────────────────────────────────────────────
  'w-title': [
    { key: 'text', label: 'Heading', kind: 'text', scope: 'element', placeholder: 'This week' },
    ...TEXT_STYLE_FIELDS,
  ],
  clock: [
    title('Label'),
    {
      key: 'mode', label: 'Show', kind: 'select',
      options: [
        { value: 'both', label: 'Time and date' },
        { value: 'time', label: 'Time only' },
        { value: 'date', label: 'Date only' },
      ],
    },
  ],
  banner: [
    { key: 'text', label: 'Wording', kind: 'text', placeholder: 'THIS WEEK' },
    ...TEXT_STYLE_FIELDS,
  ],
  'notes-board': [
    title(),
    {
      key: 'columns', label: 'Notes across', kind: 'number', min: 1, max: 6,
      hint: 'Blank fits as many as the width allows, so widening the board shows more '
        + 'per row rather than bigger notes.',
    },
  ],
  divider: [
    { key: 'text', label: 'Word on the line', kind: 'text', placeholder: 'Leave blank for a plain rule' },
  ],
  quote: [
    { key: 'text', label: 'Message', kind: 'longtext' },
    { key: 'by', label: 'Who said it', kind: 'text', placeholder: 'Optional' },
  ],
  legend: [title('Heading')],
  photo: [
    { key: 'url', label: 'Picture', kind: 'image', hint: 'Paste a link, or upload from this device.' },
    { key: 'caption', label: 'Caption', kind: 'text', placeholder: 'Optional' },
    {
      key: 'fit', label: 'How it fills the space', kind: 'select',
      options: [{ value: 'cover', label: 'Fill and crop' }, { value: 'contain', label: 'Fit it all in' }],
    },
  ],
};

/**
 * Every widget the store sells must answer its pencil with SOMETHING.
 *
 * A missing entry opened an empty settings panel, which reads as "the pencil
 * is broken" — the same fault as the old startEdit bug wearing new clothes.
 * The wall set and the few utility widgets take a title at minimum; anything
 * needing more gets a real entry above. `??=` so a proper entry added later
 * silently wins over this floor.
 */
for (const id of [
  'job-find', 'sticky-pad', 'add-bin',
  'tv-workspace', 'tv-out-today', 'tv-late', 'tv-week-done', 'tv-tomorrow',
  'tv-stage-spread', 'tv-month', 'tv-photo', 'tv-photo-wall', 'tv-feed',
  'tv-load', 'tv-waiting', 'tv-drive', 'tv-new', 'tv-done-today', 'tv-clock',
]) {
  WIDGET_FIELDS[id] ??= [title()];
}


/**
 * The type controls belong on anything that shows words.
 *
 * "Any text should have text control" — so rather than remembering to add the
 * block to each new widget and forgetting on most of them, every widget in the
 * registry gets it unless it is explicitly opted out. Clip art has no text of
 * its own; the calculator and converter are keypads whose type is part of the
 * control.
 */
const NO_TYPE_CONTROLS = new Set(['calculator', 'converter', 'clock', 'photo', 'add-bin']);

for (const [id, fields] of Object.entries(WIDGET_FIELDS)) {
  if (!NO_TYPE_CONTROLS.has(id) && !fields.some(f => f.key === 'fontSize')) {
    fields.push(...TEXT_STYLE_FIELDS);
  }
  // The outline goes on EVERYTHING, including the keypads that opt out of the
  // type controls — an outline is not text.
  if (!fields.some(f => f.key === 'outline')) fields.push(...OUTLINE_FIELDS);
}

/**
 * Clip art shares one set of settings — it is all the same kind of thing.
 */
/** A section box: transparency, and the type controls. No style presets. */
export const BOX_FIELDS: WidgetField[] = [
  { key: 'text', label: 'Section name', kind: 'text', scope: 'element',
    placeholder: 'Leave blank for no header' },
  { key: 'boxOpacity', label: 'See-through', kind: 'percent', scope: 'element' },
  ...TEXT_STYLE_FIELDS,
  ...OUTLINE_FIELDS,
];

export const ART_FIELDS: WidgetField[] = [
  { key: 'size', label: 'Size', kind: 'number', scope: 'element', min: 24, max: 320,
    hint: 'Or drag the corner. Attached art scales with whatever it is stuck to.' },
  ...OUTLINE_FIELDS,
];

/**
 * Believable content for the store previews, kept SEPARATE from `WidgetDef.data`.
 *
 * `data` is the seed a newly placed widget starts with, and it is right for that
 * to be empty — a checklist you place should be yours to fill, not pre-loaded
 * with someone else's rows. But the store was reusing that same seed to draw its
 * preview, which is why half the shelf showed blank boxes and the week planner
 * showed an empty week. These values are used by the store and nowhere else.
 */
/** A stand-in site photo, inline so the store needs no network. */
const SAMPLE_PHOTO =
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">
       <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0%" stop-color="#bfdbfe"/><stop offset="100%" stop-color="#e0f2fe"/>
       </linearGradient></defs>
       <rect width="320" height="240" fill="url(#s)"/>
       <rect x="0" y="170" width="320" height="70" fill="#cbd5e1"/>
       <rect x="34" y="66" width="70" height="104" fill="#94a3b8"/>
       <rect x="116" y="40" width="86" height="130" fill="#64748b"/>
       <rect x="214" y="84" width="66" height="86" fill="#94a3b8"/>
       <g fill="#e2e8f0">
         <rect x="46" y="80" width="16" height="16"/><rect x="76" y="80" width="16" height="16"/>
         <rect x="46" y="110" width="16" height="16"/><rect x="76" y="110" width="16" height="16"/>
         <rect x="130" y="56" width="18" height="18"/><rect x="162" y="56" width="18" height="18"/>
         <rect x="130" y="92" width="18" height="18"/><rect x="162" y="92" width="18" height="18"/>
       </g>
       <rect x="226" y="62" width="42" height="24" rx="3" fill="#1e3a5f"/>
       <circle cx="247" cy="74" r="8" fill="#93c5fd"/>
     </svg>`);

/**
 * Sample rota cells against THIS week's real dates.
 *
 * The keys are person-and-date, so a preview written with made-up dates would
 * land in cells the grid never draws and the store would show an empty rota —
 * exactly the "blank shelf" problem WIDGET_PREVIEW exists to solve.
 */
function rotaSampleCells(): Record<string, { id: string; text: string }[]> {
  const sunday = new Date();
  sunday.setDate(sunday.getDate() - sunday.getDay());
  const day = (n: number) => {
    const d = new Date(sunday.getTime());
    d.setDate(d.getDate() + n);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
  };
  const rows: [string, number, string][] = [
    ['n:Daniel', 0, 'Dadush'],
    ['n:Yaakov', 0, 'Pardes 8 am'],
    ['n:Yaakov', 1, 'Friedman'],
    ['n:Igor', 0, 'Goodhardt — Kiryat Gat'],
    ['n:Igor', 2, 'Goodhardt'],
    ['n:Max', 1, 'Friedman'],
    ['n:Max', 3, 'Davidian??'],
  ];
  const out: Record<string, { id: string; text: string }[]> = {};
  rows.forEach(([who, d, text], i) => {
    const k = `${who}|${day(d)}`;
    (out[k] ??= []).push({ id: `p${i}`, text });
  });
  return out;
}

/**
 * Cards that draw from their OWN data bag rather than from the sample world.
 * Without an entry here they render the empty state they ship with, which on a
 * shelf reads as a broken widget rather than an unconfigured one.
 */
export const WIDGET_PREVIEW: Record<string, Record<string, unknown>> = {
  kpi: { metric: 'overdue', title: 'Running late' },
  // A search box previewed empty forever — the preview cannot be typed into,
  // so it seeds a query and shows RESULTS, which is what the widget looks
  // like in use. 'cohen' matches the sample board's Cohen, Miriam.
  'job-find': { sampleQuery: 'cohen' },
  'job-search': { sampleQuery: 'cohen' },
  divider: { text: 'this week' },
  quote: { text: 'Ladders get tied off. Every time.', by: 'Site rules' },
  legend: {
    rows: [
      { c: '#dc2626', t: 'Waiting on the customer' },
      { c: '#d97706', t: 'Materials on order' },
      { c: '#16a34a', t: 'Ready for the crew' },
    ],
  },
  // The store draws it with names and a couple of filled cells, because an
  // empty grid of boxes tells you nothing about what a rota is for.
  rota: {
    title: 'This week',
    people: ['n:Daniel', 'n:Yaakov', 'n:Igor', 'n:Max'],
    weeks: 1, span: 5,
    cells: rotaSampleCells(),
  },
  checklist: {
    title: 'Before handover',
    items: [
      { t: 'Commission the units', done: true },
      { t: 'Balance the airflow', done: true },
      { t: 'Label the panel', done: false },
      { t: 'Hand over the manuals', done: false },
    ],
  },
  tally: { title: 'Units delivered', n: 14, step: 1 },
  'progress-bar': { title: 'First fix', pct: 65 },
  table: {
    title: 'Deliveries',
    rows: [['Item', 'Due'], ['Condensers ×4', 'Tue'], ['Grilles', 'Thu'], ['Thermostats', 'Fri']],
  },
  'order-list': {
    title: 'On order',
    items: [
      { t: 'Condenser 5t', s: 2 },
      { t: 'Line set 3/8"', s: 1 },
      { t: 'Ceiling grilles ×12', s: 0 },
    ],
  },
  'week-planner': {
    cols: ['Artzi — first fix', 'Cohen — ducts', 'Levi — survey', 'Mizrahi — start-up',
           'Peretz — grilles', '', 'Shapiro — snagging'],
  },
  milestones: {
    items: [
      { t: 'Ducts complete', on: iso(6) },
      { t: 'Commissioning', on: iso(19) },
      { t: 'Handover', on: iso(34) },
    ],
  },
  'weekly-goal': { title: 'Jobs closed this week', target: 12, done: 8 },
  'team-today': {
    rows: [
      { who: 'Avi', where: 'Wolfson A1 — floors 8-10' },
      { who: 'Moshe', where: 'Netiv B2 — riser' },
      { who: 'Yoni', where: 'Workshop' },
    ],
  },
  timeline: {
    items: [
      { t: 'Start', on: iso(-21) },
      { t: 'First fix', on: iso(-4) },
      { t: 'Commission', on: iso(12) },
      { t: 'Handover', on: iso(30) },
    ],
  },
  'multi-timer': {
    items: [
      { t: 'Crane booked', on: isoT(30) },
      { t: 'Delivery window', on: isoT(74) },
    ],
  },
  contact: { name: 'Dov Halperin', role: 'Crane firm', phone: '+972 52 555 0142' },
  link: { label: 'Supplier price list', url: 'https://example.com/prices' },
  address: { text: '14 Ben Gurion, Tel Aviv' },
  'lined-note': {
    text: 'Riser is boxed in on 9 — check access before\nthe wall units go up.\n\nCall the super for the roof key.',
  },
  handover: {
    done: 'Floors 8-10 first fix finished.',
    next: 'Grilles on 11, then commissioning.',
    watch: 'Lift booked 07:00-09:00 only.',
  },
  converter: { kind: 'btu', v: '36000' },
  banner: { text: 'THIS WEEK' },
  /**
   * Notes for the shelf, in the six colours, with a tick-box and a bold line
   * so both markers show. The board gathers the real pads when the machine has
   * any and only falls back to these — an empty cork board on a card is
   * indistinguishable from a widget that does not work.
   */
  'notes-board': {
    notes: [
      { id: 'sn1', text: '☐ Chase the crane firm for Tuesday', colour: 'yellow' },
      { id: 'sn2', text: 'Riser on 9 is boxed in — check\naccess before the wall units go up', colour: 'blue' },
      { id: 'sn3', text: '**Grilles** land Thursday', colour: 'pink' },
      { id: 'sn4', text: '☑ Panel labelled', colour: 'green' },
      { id: 'sn5', text: 'Lift booked 07:00–09:00 only', colour: 'orange' },
      { id: 'sn6', text: 'Super has the roof key', colour: 'purple' },
    ],
  },
  photo: { fit: 'cover', url: SAMPLE_PHOTO },
  clock: { mode: 'both' },
  'job-list': {},
  // The preview's own job and stage ids, matching the sample rows in widgets.tsx.
  'count-by-stage': { stageId: 'x2' },
  'progress-ring': { stageId: 'x2' },
  'contractor-load': { contractorId: 'k2' },
  kpi2: {},
  'recent-jobs': { days: 7 },
  // The store draws these against the sample jobs and tasks, so a card shows
  // the shape of the answer rather than an empty "nothing outstanding" — which
  // on a shelf is indistinguishable from a widget that does not work.
  'gone-quiet': { days: 0 },
  'backlog-trend': { weeks: 8 },
  'floor-by-floor': {},
  'no-date': {},
  'nobody-booked': {},
  'open-snags': {},
  'no-plan': {},
  duplicates: {},
  'skipped-stage': {},
  'world-clocks': { cities: ['il', 'ny', 'lon', 'sha'] },
  'shabbat-clock': { placeId: 'telaviv', vanBuffer: 90 },
  'split-flap': { source: 'text', text: 'TZVIAIR', size: 20 },
  'crew-race': { days: 30 },
  // Half a sheet already popped, so a shopper can see both states at once.
  'bubble-wrap': { cols: 10, rows: 6, popped: [1, 2, 5, 9, 11, 14, 20, 21, 22, 30, 33, 41, 44, 47, 52] },
  // Names, or the wheel draws an empty disc and a Spin button that does nothing.
  'spin-wheel': { names: 'Moshe\nAvi\nChaim\nSara\nYitzchak' },
  'streak-flame': {},
  celebrate: {},
  'btu-hp': { unit: 'btu', value: '24000' },
  'tap-in': { cols: 3 },
  /**
   * A pre-filled geocode cache, so the card draws placed pins instantly.
   *
   * Without it the shelf fires a real lookup for every sample address — slow,
   * rate-limited, and pointless — and until it answers, every job is drawn
   * loose in the middle of the country with a warning on it, which is the
   * widget's fault state, not its picture. These coordinates match the sample
   * addresses in widgets.tsx.
   */
  // Three real, long-standing TikTok links, so the card plays rather than
  // showing its own paste box — which is what a shopper would otherwise see.
  tiktok: {
    links: [
      'https://www.tiktok.com/@scout2015/video/6718335390845095173',
      'https://www.tiktok.com/@tiktok/video/6807491984882765062',
      'https://www.tiktok.com/@nasa/video/7016132198837275910',
    ].join('\n'),
    seconds: 20,
  },
  'job-map': {
    geo: {
      '14 Ben Gurion': { lat: 32.0853, lon: 34.7818 },
      '3 Herzl': { lat: 32.0648, lon: 34.7726 },
      '88 Dizengoff': { lat: 32.0785, lon: 34.7745 },
      '5 Rothschild': { lat: 32.0632, lon: 34.7702 },
      '21 Allenby': { lat: 32.0684, lon: 34.7690 },
      '9 Bialik': { lat: 32.0705, lon: 34.7742 },
      '2 Weizmann': { lat: 32.0870, lon: 34.7938 },
    },
    view: { center: { lat: 32.0740, lon: 34.7790 }, zoom: 13 },
  },
  // A real forecast, captured once. The shelf has no business making a network
  // call, and a card sitting on "loading…" previews nothing.
  weather: {
    placeId: 'telaviv',
    sample: {
      now: { temp: 32, code: 0, wind: 10, humidity: 56 },
      days: [
        { date: sampleDay(0), code: 2, hi: 34, lo: 25, rain: 0 },
        { date: sampleDay(1), code: 45, hi: 32, lo: 25, rain: 0 },
        { date: sampleDay(2), code: 2, hi: 33, lo: 25, rain: 10 },
        { date: sampleDay(3), code: 3, hi: 33, lo: 25, rain: 35 },
        { date: sampleDay(4), code: 61, hi: 29, lo: 23, rain: 70 },
      ],
      at: 0,
    },
  },
  'before-after': {},
};

/**
 * Some widgets are invisible on white.
 *
 * A banner draws its own background from the node's colour, and the preview
 * node is white — so the store showed a white ribbon with white lettering on a
 * white card, which is to say nothing at all.
 */
export const WIDGET_PREVIEW_COLOR: Record<string, string> = {
  banner: '#1e3a5f',
  'w-title': '#0f172a',
};

/** A local yyyy-mm-dd, for the sample forecast's day labels. */
function sampleDay(n: number) {
  const d = new Date(Date.now() + n * 86_400_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function iso(daysFromNow: number) {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}
function isoT(hoursFromNow: number) {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString().slice(0, 16);
}
