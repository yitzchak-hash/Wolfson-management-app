/**
 * THE ACTIVITY LOG IN PLAIN WORDS (owner, 2026-10-05).
 *
 * His three complaints, reading a worker's day: the rows were not "clear
 * enough — I have to read so much to understand what the hell happened";
 * five rows of "uploaded file: 1791204142497409322422886791595.jpg" should
 * have been ONE row, "Igor uploaded 5 photos"; and "Igor updated stage note
 * task" meant nothing at all. The ticker in the header said "updated the
 * viewed", "set the completedAt to 2026-1…", "updated the photo_uploaded" —
 * field names and timestamps wearing the shape of a sentence.
 *
 * So this module is the ONE place a log record becomes words, and every
 * surface that lists history reads it: the Activity page, the apartment
 * window's History tab, the header's LIVE ticker, the dashboard card and the
 * "What changed" widget. It never prints a field name, a type code, an ISO
 * timestamp or a camera's file name as the sentence; a document's name may
 * ride along as the small secondary line, nothing more.
 *
 * Two jobs:
 *  - `describeGroup` / `describeLog` turn records — old ones included, every
 *    shape the app has ever written — into "who · what · (detail)" in the
 *    reader's language (English, or Hebrew when the office reads right to
 *    left). Hebrew uses the masculine past, as the app's other Hebrew lines
 *    do.
 *  - `foldActivity` CONSOLIDATES: consecutive entries by the same person,
 *    on the same apartment, of the same kind, within half an hour of each
 *    other become one row ("uploaded 5 photos · 09:12–09:40"), which keeps
 *    every entry so the row can be opened up. Consecutive within that
 *    person's own stream — somebody else's line in between does not split
 *    a run, his own different action does.
 *
 * Pure on purpose — no store, no DOM, no clock — so the arithmetic is tested
 * offline (`scratchpad/activitywords-test.mjs`) with numbers worked by hand.
 * The words are a small local table rather than sixty MainUiStrings keys,
 * the Tutorial's precedent: preset-only, both languages, and nothing a user
 * edits.
 */
import type { ActivityLog, ActivityMarkChange, Apartment, Stage } from '../types';
import { aptLabel } from '../types';
import { mediaKindOf } from './mediaKind';

export type ActivityLang = 'en' | 'he';

/** What one record is ABOUT — the unit of consolidation. */
export type ActivityKind =
  | 'opened'          // somebody looked at it
  | 'upload'          // pictures, films and files from site
  | 'message'         // a message in a task's conversation
  | 'note'            // a note added (a stage's notes or the general notes)
  | 'note_removed'
  | 'note_edit'
  | 'task_new'
  | 'work_started'    // the worker's "I'm going to work here"
  | 'task_closed'
  | 'task_reopened'
  | 'task_deleted'
  | 'task_moved_out'  // a task taken off this apartment to another (the move)
  | 'task_moved_in'   // ...and the line on the apartment it reached
  | 'stages'          // the set model: which stages changed state
  | 'next_up'         // an OLD record of the headline moving "X → Y"
  | 'problem'
  | 'problem_closed'
  | 'problem_approved'
  | 'renamed'
  | 'type'
  | 'added'
  | 'deleted'
  | 'edited';

/** The page's "What" filter — a handful of families a person thinks in. */
export type ActivityFamily = 'stages' | 'tasks' | 'photos' | 'notes' | 'problems' | 'opened' | 'other';

export const ACTIVITY_FAMILIES: ActivityFamily[] = ['stages', 'tasks', 'photos', 'notes', 'problems', 'opened', 'other'];

/** A record that knows which workspace it came from — the Job Board's centre merges them. */
export type ScopedLog = ActivityLog & { ws?: string };

/** One drawn sentence. `text` follows `who`: "**Igor** uploaded 5 photos". */
export interface ActivitySentence {
  kind: ActivityKind;
  who: string;
  text: string;
  /** A small secondary line — a note's words, a task's description, a document's name. */
  detail?: string;
}

/** A consolidated row: one or more records, newest first. */
export interface ActivityGroup<T extends ScopedLog = ScopedLog> {
  /** The newest record's id — stable, so it keys React and the open/closed state. */
  id: string;
  kind: ActivityKind;
  logs: T[];
  newest: string;
  oldest: string;
}

/** Half an hour: further apart than this and two uploads are two visits. */
export const FOLD_GAP_MS = 30 * 60_000;

// ─── The words ─────────────────────────────────────────────────────────────

type StageVerb = 'done' | 'doing' | 'pending' | 'untick' | 'stop' | 'unpend' | 'added' | 'back' | 'off' | 'removed' | 'same';
const VERB_ORDER: StageVerb[] = ['done', 'doing', 'pending', 'untick', 'stop', 'unpend', 'added', 'back', 'off', 'removed', 'same'];

interface Words {
  someone: string;
  aJob: string;
  anApartment: string;
  list: (xs: string[]) => string;
  /** Between two stage phrases in one sentence. */
  sep: string;
  photo: (n: number) => string;
  video: (n: number) => string;
  memo: (n: number) => string;
  file: (n: number) => string;
  message: (n: number) => string;
  note: (n: number) => string;
  opened: (job: boolean) => string;
  openedTimes: (n: number) => string;
  uploaded: (things: string) => string;
  sent: (things: string) => string;
  added: (things: string) => string;
  removed: (things: string) => string;
  editedNotes: string;
  onStage: (text: string, stage: string) => string;
  createdTasks: (n: number) => string;
  startedWork: string;
  closedTasks: (n: number) => string;
  reopenedTasks: (n: number) => string;
  deletedTasks: (n: number) => string;
  /** A moved task: "Igor's task", "a task", "3 tasks". */
  taskOf: (worker: string) => string;
  aTask: string;
  tasksN: (n: number) => string;
  movedOut: (what: string, to: string) => string;
  /** Appended when the apartment a task left was put back as it stood before. */
  putBack: string;
  movedIn: (what: string, from: string) => string;
  stage: Record<StageVerb, (l: string) => string>;
  stagesCount: (n: number) => string;
  stagesTouched: string;
  marker: (name: string, job: boolean) => string;
  nextUp: (to: string) => string;
  nextUpWas: (to: string, from: string) => string;
  backToStart: (from: string) => string;
  problems: (n: number) => string;
  problemsClosed: (n: number) => string;
  approved: (n: number) => string;
  renamed: (name: string) => string;
  clearedName: string;
  typeIs: (t: string) => string;
  typeWords: Record<string, string>;
  edited: (what: string) => string;
  editedN: (n: number) => string;
  thing: (job: boolean) => string;
  fields: Record<string, string>;
  addedRecord: (job: boolean) => string;
  deletedRecord: (job: boolean) => string;
}

const listEn = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? '')
  : xs.length === 2 ? `${xs[0]} and ${xs[1]}`
  : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const listHe = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? '')
  : `${xs.slice(0, -1).join(', ')} ו־${xs[xs.length - 1]}`;

const EN: Words = {
  someone: 'Someone',
  aJob: 'a job',
  anApartment: 'an apartment',
  list: listEn,
  sep: ', ',
  photo: n => n === 1 ? 'a photo' : `${n} photos`,
  video: n => n === 1 ? 'a video' : `${n} videos`,
  memo: n => n === 1 ? 'a voice memo' : `${n} voice memos`,
  file: n => n === 1 ? 'a file' : `${n} files`,
  message: n => n === 1 ? 'a message' : `${n} messages`,
  note: n => n === 1 ? 'a note' : `${n} notes`,
  opened: job => job ? 'opened the job' : 'opened the apartment',
  openedTimes: n => `opened it ${n} times`,
  uploaded: t => `uploaded ${t}`,
  sent: t => `sent ${t}`,
  added: t => `added ${t}`,
  removed: t => `removed ${t}`,
  editedNotes: 'edited the notes',
  onStage: (t, st) => `${t} — ${st}`,
  createdTasks: n => n === 1 ? 'created a task' : `created ${n} tasks`,
  startedWork: 'started work here',
  closedTasks: n => n === 1 ? 'closed the task' : `closed ${n} tasks`,
  reopenedTasks: n => n === 1 ? 'reopened the task' : `reopened ${n} tasks`,
  deletedTasks: n => n === 1 ? 'deleted a task' : `deleted ${n} tasks`,
  taskOf: w => `${w}'s task`,
  aTask: 'a task',
  tasksN: n => `${n} tasks`,
  movedOut: (what, to) => `moved ${what} to ${to}`,
  putBack: 'its stages put back as they were before',
  movedIn: (what, from) => `moved ${what} here from ${from}`,
  stage: {
    done: l => `marked ${l} done`,
    doing: l => `started ${l}`,
    pending: l => `set ${l} half done`,
    untick: l => `un-ticked ${l}`,
    stop: l => `stopped ${l}`,
    unpend: l => `cleared half done on ${l}`,
    added: l => `added ${l}`,
    back: l => `put ${l} back`,
    off: l => `marked ${l} not needed`,
    removed: l => `took ${l} off`,
    same: l => `changed ${l} and put it back`,
  },
  stagesCount: n => `${n} stages`,
  stagesTouched: 'updated the stages',
  marker: (name, job) => job ? `set the job to ${name}` : `set the whole flat to ${name}`,
  nextUp: to => `— next up: ${to}`,
  nextUpWas: (to, from) => `— next up: ${to} (was ${from})`,
  backToStart: from => from ? `— back to not started (was ${from})` : '— back to not started',
  problems: n => n === 1 ? 'reported a problem' : `reported ${n} problems`,
  problemsClosed: n => n === 1 ? 'fixed the problem — waiting for approval' : `fixed ${n} problems — waiting for approval`,
  approved: n => n === 1 ? 'approved the fix' : `approved ${n} fixes`,
  renamed: name => `renamed it to “${name}”`,
  clearedName: 'cleared the name',
  typeIs: t => `marked it as ${t}`,
  typeWords: { shinui: 'Changes', standard: 'Standard' },
  edited: what => `edited ${what}`,
  editedN: n => `made ${n} changes`,
  thing: job => job ? 'the job' : 'the apartment',
  fields: {
    address: 'the address', driveLink: 'the Drive folder', plansPdfLink: 'the plan',
    zohoLink: 'the Zoho link', phone: 'the phone number', tipus: 'the tipus',
    boardBin: 'the group', classification: 'the type', displayName: 'the name',
  },
  addedRecord: job => job ? 'added the job' : 'added the apartment',
  deletedRecord: job => job ? 'deleted the job' : 'deleted the apartment',
};

const HE: Words = {
  someone: 'מישהו',
  aJob: 'עבודה',
  anApartment: 'דירה',
  list: listHe,
  sep: ' · ',
  photo: n => n === 1 ? 'תמונה' : `${n} תמונות`,
  video: n => n === 1 ? 'סרטון' : `${n} סרטונים`,
  memo: n => n === 1 ? 'הודעה קולית' : `${n} הודעות קוליות`,
  file: n => n === 1 ? 'קובץ' : `${n} קבצים`,
  message: n => n === 1 ? 'הודעה' : `${n} הודעות`,
  note: n => n === 1 ? 'הערה' : `${n} הערות`,
  opened: job => job ? 'פתח את העבודה' : 'פתח את הדירה',
  openedTimes: n => `פתח אותה ${n} פעמים`,
  uploaded: t => `העלה ${t}`,
  sent: t => `שלח ${t}`,
  added: t => `הוסיף ${t}`,
  removed: t => `מחק ${t}`,
  editedNotes: 'ערך את ההערות',
  onStage: (t, st) => `${t} — ${st}`,
  createdTasks: n => n === 1 ? 'יצר משימה' : `יצר ${n} משימות`,
  startedWork: 'התחיל לעבוד כאן',
  closedTasks: n => n === 1 ? 'סגר את המשימה' : `סגר ${n} משימות`,
  reopenedTasks: n => n === 1 ? 'פתח מחדש את המשימה' : `פתח מחדש ${n} משימות`,
  deletedTasks: n => n === 1 ? 'מחק משימה' : `מחק ${n} משימות`,
  taskOf: w => `את המשימה של ${w}`,
  aTask: 'משימה',
  tasksN: n => `${n} משימות`,
  movedOut: (what, to) => `העביר ${what} ל־${to}`,
  putBack: 'השלבים חזרו למצבם הקודם',
  movedIn: (what, from) => `העביר ${what} לכאן מ־${from}`,
  stage: {
    done: l => `סימן כגמור: ${l}`,
    doing: l => `התחיל: ${l}`,
    pending: l => `סימן כחצי גמור: ${l}`,
    untick: l => `ביטל סימון: ${l}`,
    stop: l => `עצר: ${l}`,
    unpend: l => `ביטל חצי גמור: ${l}`,
    added: l => `הוסיף שלב: ${l}`,
    back: l => `החזיר: ${l}`,
    off: l => `סימן כלא נדרש: ${l}`,
    removed: l => `הסיר: ${l}`,
    same: l => `שינה והחזיר: ${l}`,
  },
  stagesCount: n => `${n} שלבים`,
  stagesTouched: 'עדכן את השלבים',
  marker: (name, job) => job ? `קבע את העבודה כ־${name}` : `קבע את כל הדירה כ־${name}`,
  nextUp: to => `— הבא בתור: ${to}`,
  nextUpWas: (to, from) => `— הבא בתור: ${to} (היה ${from})`,
  backToStart: from => from ? `— חזר ללא התחיל (היה ${from})` : '— חזר ללא התחיל',
  problems: n => n === 1 ? 'דיווח על בעיה' : `דיווח על ${n} בעיות`,
  problemsClosed: n => n === 1 ? 'תיקן את הבעיה — ממתין לאישור' : `תיקן ${n} בעיות — ממתין לאישור`,
  approved: n => n === 1 ? 'אישר את התיקון' : `אישר ${n} תיקונים`,
  renamed: name => `שינה את השם ל„${name}”`,
  clearedName: 'מחק את השם',
  typeIs: t => `סימן כ־${t}`,
  typeWords: { shinui: 'שינוי', standard: 'רגיל' },
  edited: what => `ערך ${what}`,
  editedN: n => `ביצע ${n} שינויים`,
  thing: job => job ? 'את העבודה' : 'את הדירה',
  fields: {
    address: 'את הכתובת', driveLink: 'את תיקיית הדרייב', plansPdfLink: 'את התוכנית',
    zohoLink: 'את קישור הזוהו', phone: 'את מספר הטלפון', tipus: 'את הטיפוס',
    boardBin: 'את הקבוצה', classification: 'את הסוג', displayName: 'את השם',
  },
  addedRecord: job => job ? 'הוסיף את העבודה' : 'הוסיף את הדירה',
  deletedRecord: job => job ? 'מחק את העבודה' : 'מחק את הדירה',
};

const WORDS: Record<ActivityLang, Words> = { en: EN, he: HE };

/**
 * The Activity screens' own chrome, in both languages. Kept beside the
 * sentences because they are read together and change together.
 */
export const ACTIVITY_UI = {
  en: {
    everyWorkspace: 'Every workspace',
    centerHint: 'Everything that happened, in every workspace, newest first.',
    workspace: 'Workspace',
    what: 'What',
    who: 'Who',
    everyone: 'Everyone',
    families: {
      stages: 'Stages', tasks: 'Tasks', photos: 'Photos & files', notes: 'Notes & messages',
      problems: 'Problems', opened: 'Opened', other: 'Other',
    } as Record<ActivityFamily, string>,
    today: 'Today',
    yesterday: 'Yesterday',
    showAll: (n: number) => `Show all ${n}`,
    hide: 'Hide',
    showMore: 'Show more',
    refresh: 'Get the latest from the other workspaces',
    fetching: 'Getting the other workspaces…',
    asOf: (t: string) => `Other workspaces as of ${t}`,
    localOnly: 'The other workspaces show what this computer last saw of them.',
    openApartment: 'Open the apartment window',
    openJob: 'Open the job',
    opensIn: (ws: string) => `Opens in ${ws}`,
    nothingToday: 'nothing yet today',
    openLog: 'open the full log',
    rows: (n: number) => n === 1 ? '1 row' : `${n} rows`,
    ago: (mins: number) => mins < 1 ? 'just now'
      : mins < 60 ? `${mins}m ago`
      : mins < 1440 ? `${Math.floor(mins / 60)}h ago`
      : `${Math.floor(mins / 1440)}d ago`,
  },
  he: {
    everyWorkspace: 'כל סביבות העבודה',
    centerHint: 'כל מה שקרה, בכל סביבות העבודה, החדש ביותר למעלה.',
    workspace: 'סביבת עבודה',
    what: 'מה',
    who: 'מי',
    everyone: 'כולם',
    families: {
      stages: 'שלבים', tasks: 'משימות', photos: 'תמונות וקבצים', notes: 'הערות והודעות',
      problems: 'בעיות', opened: 'נפתח', other: 'אחר',
    } as Record<ActivityFamily, string>,
    today: 'היום',
    yesterday: 'אתמול',
    showAll: (n: number) => `הצג את כל ה־${n}`,
    hide: 'הסתר',
    showMore: 'הצג עוד',
    refresh: 'משוך את העדכונים מסביבות העבודה האחרות',
    fetching: 'מושך את סביבות העבודה האחרות…',
    asOf: (t: string) => `סביבות העבודה האחרות נכון ל־${t}`,
    localOnly: 'סביבות העבודה האחרות מוצגות כפי שהמחשב הזה ראה אותן לאחרונה.',
    openApartment: 'פתח את חלון הדירה',
    openJob: 'פתח את העבודה',
    opensIn: (ws: string) => `נפתח ב־${ws}`,
    nothingToday: 'עוד לא קרה כלום היום',
    openLog: 'פתח את היומן המלא',
    rows: (n: number) => n === 1 ? 'שורה אחת' : `${n} שורות`,
    ago: (mins: number) => mins < 1 ? 'עכשיו'
      : mins < 60 ? `לפני ${mins} דק׳`
      : mins < 1440 ? `לפני ${Math.floor(mins / 60)} שע׳`
      : `לפני ${Math.floor(mins / 1440)} ימים`,
  },
};

// ─── Reading a record ──────────────────────────────────────────────────────

/** True when a string is an internal record id rather than something a person typed. */
export function isInternalId(v: string): boolean {
  return /^(G|CE|PIN|BL|PR)-/.test(v) || /^[a-z]?\d{9,}/.test(v);
}

/** A stored timestamp — never a sentence's words. */
const isIsoish = (v: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:/.test(v);

/** "Registers — working here today" and its two older spellings, in the worker's language. */
const WORK_START = /^(?:(.+?)\s+—\s+)?(working here today|עובד כאן היום|работаю здесь сегодня)\s*$/i;

/** A voice memo's own file name, as the app names them. */
const MEMO_NAME = /(^|\/)(voice-)?memo-\d+\.(webm|m4a|mp4|ogg|wav)$/i;

/** One bare file name — no spaces around a dotted extension — rather than words. */
const looksLikeFileName = (v: string) => /^[^\s\\/]{1,120}\.[A-Za-z0-9]{2,5}$/.test(v.trim());

type Thing = 'photo' | 'video' | 'memo' | 'file';
function thingOf(name: string): Thing {
  if (MEMO_NAME.test(name)) return 'memo';
  if (/\.(heic|heif|tiff?)$/i.test(name)) return 'photo';
  const k = mediaKindOf(name);
  return k === 'image' ? 'photo' : k === 'video' ? 'video' : k === 'audio' ? 'memo' : 'file';
}

const lines = (v: string) => v.split('\n').map(x => x.trim()).filter(Boolean);

/** A general-notes record: was a line added, taken away, or the text rewritten? */
function notesChange(log: ActivityLog): 'note' | 'note_removed' | 'note_edit' {
  const prev = lines(log.previousValue ?? '');
  const next = lines(log.newValue ?? '');
  if (!next.length) return prev.length ? 'note_removed' : 'note_edit';
  if (!prev.length) return 'note';
  const prevSet = new Set(prev);
  // Old records carried the WHOLE text on both sides: a removal leaves fewer
  // lines, every one of which was already there.
  if (next.length < prev.length && next.every(x => prevSet.has(x))) return 'note_removed';
  // An append logged only the line it added — nothing in common with before.
  if (!next.some(x => prevSet.has(x))) return 'note';
  return 'note_edit';
}

/** What a record is about. Every shape the app has ever written has an answer. */
export function kindOf(log: ActivityLog): ActivityKind {
  const field = log.fieldChanged ?? '';
  switch (log.actionType) {
    case 'opened': return 'opened';
    case 'contractor_upload': return 'upload';
    case 'contractor_note': return field === 'problem_closed' ? 'problem_closed' : 'message';
    case 'contractor_complete': return field === 'problem_approved' ? 'problem_approved' : 'task_closed';
    case 'contractor_assigned': return field === 'problem' ? 'problem' : 'task_new';
    case 'task_created':
      return field === 'work_started' || WORK_START.test(log.newValue ?? '') ? 'work_started' : 'task_new';
    case 'task_completed': return 'task_closed';
    case 'task_uncompleted': return 'task_reopened';
    case 'task_deleted': return 'task_deleted';
    case 'task_moved_out': return 'task_moved_out';
    case 'task_moved_in': return 'task_moved_in';
    case 'note': return 'note';
    case 'stage_marks': return 'stages';
    case 'create': return 'added';
    case 'delete': return 'deleted';
    default: break;
  }
  switch (field) {
    case 'currentStageId': return 'next_up';
    case 'generalNotes': return notesChange(log);
    case 'displayName': return 'renamed';
    case 'classification': return 'type';
    case 'stageMarks': return 'stages';
    default: return 'edited';
  }
}

/** Which of the page's "What" chips a kind falls under. */
export function familyOf(kind: ActivityKind): ActivityFamily {
  switch (kind) {
    case 'stages': case 'next_up': case 'work_started': return 'stages';
    case 'task_new': case 'task_closed': case 'task_reopened': case 'task_deleted':
    case 'task_moved_out': case 'task_moved_in': return 'tasks';
    case 'upload': return 'photos';
    case 'message': case 'note': case 'note_removed': case 'note_edit': return 'notes';
    case 'problem': case 'problem_closed': case 'problem_approved': return 'problems';
    case 'opened': return 'opened';
    default: return 'other';
  }
}

/** Who did it — never blank (a nameless record is one `.charAt` from a crash). */
function whoOf(log: ActivityLog, W: Words): string {
  return (log.userName ?? '').trim() || W.someone;
}

/** The job is a free-form Job Board job rather than an apartment in a building. */
const isJob = (log: ActivityLog) => (log.buildingId ?? '') === 'G';

/**
 * The best human name for where a record happened: the live record's own
 * label when it still exists, else what the record stored (refusing an
 * internal id, which printed as "Apt G-mf91xka"), else "an apartment".
 */
export function placeName(log: ActivityLog, apt: Pick<Apartment, 'apartmentNumber' | 'displayName' | 'tipus'> | undefined, lang: ActivityLang = 'en'): string {
  if (apt) {
    const l = aptLabel(apt);
    if (l && l !== '?') return l;
  }
  const stored = (log.apartmentNumber ?? '').trim();
  if (stored && !isInternalId(stored)) return stored;
  const W = WORDS[lang];
  return isJob(log) ? W.aJob : W.anApartment;
}

export interface WordsContext {
  lang: ActivityLang;
  /** Every stage the app knows — names a stage in the reader's language. */
  stages?: Stage[];
}

/** A stage's name in the reader's language, by id first and stored name second. */
export function stageWord(id: string | undefined, stored: string | undefined, ctx: WordsContext): string {
  const list = ctx.stages ?? [];
  const st = (id ? list.find(s => s.id === id) : undefined)
    ?? (stored ? list.find(s => s.name === stored) : undefined);
  if (st) return ctx.lang === 'he' && st.nameHe ? st.nameHe : st.name;
  return (stored ?? '').trim();
}

const isNotStarted = (v: string | undefined) => !v || /^not started$/i.test(v.trim());

/** Stages named in a start-of-work task's own words: "Registers + Access Panels — working here today". */
export function workStages(desc: string, ctx: WordsContext): string[] {
  const m = WORK_START.exec(desc ?? '');
  if (!m || !m[1]) return [];
  return m[1].split(/\s+\+\s+/).map(n => stageWord(undefined, n, ctx)).filter(Boolean);
}

/** A task's description as a detail line — a start-of-work task reads as its stages. */
function taskDetail(desc: string | undefined, ctx: WordsContext): string | undefined {
  const d = (desc ?? '').trim();
  if (!d || isIsoish(d)) return undefined;
  const m = WORK_START.exec(d);
  if (m) return m[1] ? workStages(d, ctx).join(' + ') || undefined : undefined;
  return d;
}

/** "photos and a video" — what an upload or a message carried. */
function thingsPhrase(counts: Record<Thing, number>, W: Words): string {
  const parts: string[] = [];
  if (counts.photo) parts.push(W.photo(counts.photo));
  if (counts.video) parts.push(W.video(counts.video));
  if (counts.memo) parts.push(W.memo(counts.memo));
  if (counts.file) parts.push(W.file(counts.file));
  return W.list(parts);
}

const zero = (): Record<Thing, number> => ({ photo: 0, video: 0, memo: 0, file: 0 });

/** Up to three names, then "+N". */
function few(xs: string[]): string | undefined {
  const uniq = [...new Set(xs.filter(Boolean))];
  if (!uniq.length) return undefined;
  return uniq.length <= 3 ? uniq.join(', ') : `${uniq.slice(0, 3).join(', ')} +${uniq.length - 3}`;
}

const verbOf = (from: string, to: string): StageVerb => {
  if (from === to) return 'same';
  if (to === 'done') return 'done';
  if (to === 'doing') return 'doing';
  if (to === 'pending') return 'pending';
  if (to === 'off') return 'off';
  if (to === 'todo') {
    if (from === 'done') return 'untick';
    if (from === 'doing') return 'stop';
    if (from === 'pending') return 'unpend';
    if (from === 'off') return 'back';
    return 'added';
  }
  return 'removed';
};

/** The stage changes of one or more records, merged into one sentence. */
function stagePhrase(changes: ActivityMarkChange[], ctx: WordsContext, W: Words): { text: string; detail?: string } {
  const order = new Map((ctx.stages ?? []).map((s, i) => [s.id, i]));
  const sorted = [...changes].sort((a, b) => (order.get(a.id) ?? 1e6) - (order.get(b.id) ?? 1e6));
  const byVerb = new Map<StageVerb, string[]>();
  for (const c of sorted) {
    const v = verbOf(c.from, c.to);
    const name = stageWord(c.id, c.name, ctx) || c.name;
    byVerb.set(v, [...(byVerb.get(v) ?? []), name]);
  }
  const phrases: string[] = [];
  const details: string[] = [];
  for (const v of VERB_ORDER) {
    const names = byVerb.get(v);
    if (!names?.length) continue;
    // A long list ("Job completed" ticks every stage) is a count in the
    // sentence and the names underneath — never a paragraph.
    if (names.length > 3) {
      phrases.push(W.stage[v](W.stagesCount(names.length)));
      details.push(names.join(', '));
    } else {
      phrases.push(W.stage[v](W.list(names)));
    }
  }
  return { text: phrases.join(W.sep) || W.stagesTouched, detail: details.join(' · ') || undefined };
}

// ─── The sentence ──────────────────────────────────────────────────────────

/** One record in words. */
export function describeLog(log: ActivityLog, ctx: WordsContext): ActivitySentence {
  return describeGroup([log], ctx);
}

/**
 * A consolidated row in words: `logs` are newest first and share a kind, a
 * person and a place (`foldActivity` guarantees it). One record is simply a
 * group of one, so a single row and a folded one can never word the same
 * thing two different ways.
 */
export function describeGroup(logs: ActivityLog[], ctx: WordsContext): ActivitySentence {
  const W = WORDS[ctx.lang] ?? EN;
  const newest = logs[0];
  const oldest = logs[logs.length - 1];
  const n = logs.length;
  const kind = kindOf(newest);
  const who = whoOf(newest, W);
  const job = isJob(newest);
  const out = (text: string, detail?: string): ActivitySentence => ({ kind, who, text, detail: detail?.trim() || undefined });

  switch (kind) {
    case 'opened':
      return out(n === 1 ? W.opened(job) : W.openedTimes(n));

    case 'upload': {
      const counts = zero();
      const docs: string[] = [];
      for (const l of logs) {
        const name = (l.newValue ?? '').trim();
        const t = name ? thingOf(name) : 'file';
        counts[t]++;
        if (t === 'file' && name && !isIsoish(name)) docs.push(name);
      }
      // A camera's file name says nothing; a document's name is worth a small line.
      return out(W.uploaded(thingsPhrase(counts, W)), few(docs));
    }

    case 'message': {
      const counts = zero();
      let texts = 0;
      let lastText = '';
      for (const l of logs) {
        const v = (l.newValue ?? '').trim();
        const many = /^(\d+) file\(s\)$/.exec(v);
        if (many) { counts.file += Number(many[1]) || 1; continue; }
        if (l.fieldChanged === 'note_files') {
          const names = v.split(/,\s*/).filter(Boolean);
          if (!names.length) counts.file++;
          names.forEach(x => counts[thingOf(x)]++);
          continue;
        }
        if (!v || isIsoish(v)) { texts++; continue; }
        texts++;
        if (!lastText) lastText = v;
      }
      const parts = [texts ? W.message(texts) : '', thingsPhrase(counts, W)].filter(Boolean);
      return out(W.sent(W.list(parts) || W.message(1)), lastText);
    }

    case 'note': {
      const counts = zero();
      let notes = 0;
      let lastText = '';
      for (const l of logs) {
        const v = (l.newValue ?? '').trim();
        if (l.fieldChanged === 'stageNoteFile' || (v && looksLikeFileName(v))) {
          counts[thingOf(v)]++;
          continue;
        }
        notes++;
        if (!lastText) {
          // Older stage-note records carried the whole note before and after;
          // the line that was added is what is worth reading.
          const prev = (l.previousValue ?? '').trim();
          lastText = prev && v.startsWith(prev) ? v.slice(prev.length).trim() : v;
        }
      }
      const things = [notes ? W.note(notes) : '', thingsPhrase(counts, W)].filter(Boolean);
      let text = W.added(W.list(things) || W.note(1));
      // A stage's notes say which stage — once, when every record agrees.
      const stageIds = new Set(logs.map(l => (l.actionType === 'note' ? l.stageId ?? '' : '')));
      const only = stageIds.size === 1 ? [...stageIds][0] : '';
      if (only) {
        const st = stageWord(only, undefined, ctx);
        if (st) text = W.onStage(text, st);
      }
      return out(text, lastText);
    }

    case 'note_removed': {
      const removed: string[] = [];
      for (const l of logs) {
        const next = new Set(lines(l.newValue ?? ''));
        removed.push(...lines(l.previousValue ?? '').filter(x => !next.has(x)));
      }
      return out(W.removed(W.note(Math.max(n, 1))), removed[0]);
    }

    case 'note_edit':
      return out(W.editedNotes, lines(newest.newValue ?? '')[0]);

    case 'task_new':
      return out(W.createdTasks(n), few(logs.map(l => taskDetail(l.newValue, ctx) ?? '')));

    case 'work_started': {
      const names: string[] = [];
      for (const l of [...logs].reverse()) names.push(...workStages(l.newValue ?? '', ctx));
      if (!names.length) {
        for (const l of logs) { const st = stageWord(l.stageId, undefined, ctx); if (st) names.push(st); }
      }
      const uniq = [...new Set(names)];
      return out(uniq.length ? `${W.startedWork} — ${W.list(uniq)}` : W.startedWork);
    }

    case 'task_closed':
      return out(W.closedTasks(n), few(logs.map(l => taskDetail(l.newValue, ctx) ?? '')));

    case 'task_reopened':
      return out(W.reopenedTasks(n), few(logs.map(l => taskDetail(l.previousValue, ctx) ?? '')));

    case 'task_deleted':
      return out(W.deletedTasks(n), few(logs.map(l => taskDetail(l.previousValue, ctx) ?? '')));

    case 'task_moved_out':
    case 'task_moved_in': {
      // The move writes the two PLACES as previousValue → newValue and the
      // task's own words in taskText; whose task it was rides in workerName.
      const workers = [...new Set(logs.map(l => (l.workerName ?? '').trim()))];
      const what = n === 1 ? (workers[0] ? W.taskOf(workers[0]) : W.aTask) : W.tasksN(n);
      const places = [...new Set(logs.map(l => (kind === 'task_moved_in' ? l.previousValue : l.newValue) ?? '')
        .map(x => x.trim()).filter(x => x && !isInternalId(x)))];
      const place = W.list(places) || W.anApartment;
      const put = kind === 'task_moved_out' && logs.some(l => l.restoredBefore) ? W.putBack : '';
      const detail = few(logs.map(l => taskDetail(l.taskText, ctx) ?? ''));
      return out(kind === 'task_moved_in' ? W.movedIn(what, place) : W.movedOut(what, place),
        [detail, put].filter(Boolean).join(' · ') || undefined);
    }

    case 'stages': {
      // Merge the net change per stage, oldest record first: "started" then
      // "done" inside one half hour is simply "marked done".
      const net = new Map<string, ActivityMarkChange>();
      for (const l of [...logs].reverse()) {
        for (const c of l.marks ?? []) {
          const prev = net.get(c.id);
          if (prev) prev.to = c.to;
          else net.set(c.id, { ...c });
        }
      }
      const marker = logs.find(l => l.marker)?.marker;
      const phrase = net.size ? stagePhrase([...net.values()], ctx, W) : null;
      if (marker) {
        const name = stageWord(undefined, marker, ctx) || marker;
        const detail = phrase ? [phrase.text, phrase.detail].filter(Boolean).join(' · ') : undefined;
        return out(W.marker(name, job), detail);
      }
      if (phrase) return out(phrase.text, phrase.detail);
      return out(W.stagesTouched);
    }

    case 'next_up': {
      // The OLD headline record. Under the set model nothing "changes stage"
      // — so it is worded as what it was: the next thing up.
      const to = isNotStarted(newest.newValue) ? '' : stageWord(newest.stageId || undefined, newest.newValue, ctx);
      const from = isNotStarted(oldest.previousValue) ? '' : stageWord(undefined, oldest.previousValue, ctx);
      if (!to) return out(W.backToStart(from));
      return out(from && from !== to ? W.nextUpWas(to, from) : W.nextUp(to));
    }

    case 'problem':
      return out(W.problems(n), few(logs.map(l => taskDetail(l.newValue, ctx) ?? '')));

    case 'problem_closed':
      return out(W.problemsClosed(n));

    case 'problem_approved':
      return out(W.approved(n), few(logs.map(l => taskDetail(l.newValue, ctx) ?? '')));

    case 'renamed': {
      const name = (newest.newValue ?? '').trim();
      return out(name && !isInternalId(name) ? W.renamed(name) : W.clearedName);
    }

    case 'type': {
      const v = (newest.newValue ?? '').trim();
      return out(W.typeIs(W.typeWords[v] ?? v));
    }

    case 'added':
      return out(W.addedRecord(job));

    case 'deleted':
      return out(W.deletedRecord(job));

    case 'edited':
    default: {
      if (n > 1) {
        const fields = new Set(logs.map(l => l.fieldChanged ?? ''));
        if (fields.size > 1) return out(W.editedN(n));
      }
      const what = W.fields[newest.fieldChanged ?? ''] ?? W.thing(job);
      return out(W.edited(what));
    }
  }
}

// ─── Consolidation ─────────────────────────────────────────────────────────

/** The same person — by id when the record has one, else by name. */
const personOf = (l: ActivityLog) => (l.userId || l.userName || '').trim();

/**
 * Fold consecutive records into rows.
 *
 * `logs` must already be in the order they are DRAWN (newest first, after
 * any filter). "Consecutive" is judged inside each person's own STREAM on
 * one apartment in one workspace: the next record of that stream joins the
 * row when it is the same kind and no more than `gapMs` from the record
 * before it. So a message between two batches of Igor's photos keeps them
 * two rows — his story stays in the order it happened — while Esther adding
 * a note in Netiv in the middle of his uploads does NOT split them. In the
 * Job Board's centre, where every workspace interleaves, strict list
 * neighbours would break every run in two. A row sits where its newest
 * record does, and wears its time range.
 */
export function foldActivity<T extends ScopedLog>(logs: T[], gapMs: number = FOLD_GAP_MS): ActivityGroup<T>[] {
  const out: ActivityGroup<T>[] = [];
  const open = new Map<string, { group: ActivityGroup<T>; time: number }>();
  for (const l of logs) {
    const kind = kindOf(l);
    const stream = `${l.ws ?? ''}|${personOf(l)}|${l.apartmentId ?? ''}`;
    const t = Date.parse(l.createdAt);
    const cur = open.get(stream);
    if (cur && cur.group.kind === kind && Number.isFinite(t) && Number.isFinite(cur.time) && Math.abs(cur.time - t) <= gapMs) {
      cur.group.logs.push(l);
      if (l.createdAt < cur.group.oldest) cur.group.oldest = l.createdAt;
      if (l.createdAt > cur.group.newest) cur.group.newest = l.createdAt;
      cur.time = t;
      continue;
    }
    const group: ActivityGroup<T> = { id: l.id, kind, logs: [l], newest: l.createdAt, oldest: l.createdAt };
    out.push(group);
    open.set(stream, { group, time: t });
  }
  return out;
}

/** Newest first, by the moment it happened — what every list draws. */
export function newestFirst<T extends ActivityLog>(logs: T[]): T[] {
  return [...logs].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/**
 * The English verb phrase for one record — "marked Registers done" — for the
 * record's own `newValue` (an export, an older tab) and a backup's label.
 */
export function plainSummary(log: ActivityLog, stages?: Stage[]): string {
  return describeLog(log, { lang: 'en', stages }).text;
}
