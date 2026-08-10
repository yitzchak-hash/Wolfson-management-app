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
  | 'job' | 'contractor' | 'stage';

export interface WidgetField {
  key: string;
  label: string;
  kind: WidgetFieldKind;
  scope?: 'data' | 'element';        // default 'data'
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
export const TEXT_STYLE_FIELDS: WidgetField[] = [
  {
    key: 'fontSize', label: 'Text size', kind: 'number', scope: 'element', min: 8, max: 96,
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
  'week-ahead': [title()],
  'recent-photos': [title(), limit('How many photos')],
  'job-shortcut': [
    { key: 'jobId', label: 'Which job', kind: 'job', allowNone: 'Not chosen yet' },
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
  ],
  'recent-jobs': [
    title(),
    { key: 'days', label: 'Added in the last… (days)', kind: 'number', min: 1, max: 90 },
  ],
  'job-search': [title()],

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
  if (NO_TYPE_CONTROLS.has(id)) continue;
  if (fields.some(f => f.key === 'fontSize')) continue;      // already has them
  fields.push(...TEXT_STYLE_FIELDS);
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
];

export const ART_FIELDS: WidgetField[] = [
  { key: 'size', label: 'Size', kind: 'number', scope: 'element', min: 24, max: 320,
    hint: 'Or drag the corner. Attached art scales with whatever it is stuck to.' },
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

export const WIDGET_PREVIEW: Record<string, Record<string, unknown>> = {
  kpi: { metric: 'overdue', title: 'Running late' },
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
  photo: { fit: 'cover', url: SAMPLE_PHOTO },
  clock: { mode: 'both' },
  'job-list': {},
  // The preview's own job and stage ids, matching the sample rows in widgets.tsx.
  'job-shortcut': { jobId: 'j1' },
  'count-by-stage': { stageId: 'x2' },
  'progress-ring': { stageId: 'x2' },
  'contractor-load': { contractorId: 'k2' },
  kpi2: {},
  'recent-jobs': { days: 7 },
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

function iso(daysFromNow: number) {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}
function isoT(hoursFromNow: number) {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString().slice(0, 16);
}
