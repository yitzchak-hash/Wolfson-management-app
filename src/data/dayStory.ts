import { format } from 'date-fns';
import {
  ActivityKind, ActivityLang, ScopedLog, WordsContext, kindOf, stageWord, workStages,
} from './activityWords';

/**
 * THE DAY STORY — one card per person per day (owner, 2026-10-06: "yes").
 *
 * The Activity page lists every change as its own row, newest first, which
 * is right for "what just happened" and hopeless for "what did Igor do on
 * Monday": twenty apartments' pictures, starts, ticks and closes interleave
 * into a hundred rows. The story reads the same records back as the day
 * they describe — per person, per local day, one line per VISIT to an
 * apartment: when it started and ended, the stages started, ticked done or
 * left half done, the pictures, when the task closed. Apartments somebody
 * only opened are not visits; they fold into one "also looked at" line.
 *
 * Pure — no store, no clock: the records in, the cards out. The page names
 * the places, draws "now <stage>" from the live apartment, and finds the
 * thumbnails. Suspicious-entry flags were offered and declined ("no") —
 * the story states what happened and judges nothing.
 */

/** A gap this long between two records on the same apartment starts a new visit. */
export const VISIT_GAP_MS = 2 * 60 * 60 * 1000;

export interface DayVisit {
  /** `ws|aptId|first` — unique per visit. */
  key: string;
  ws: string;
  aptId: string;
  buildingId: string;
  /** Oldest and newest record, ISO. */
  first: string;
  last: string;
  /** Stage words, already in the reader's language, each listed once. */
  started: string[];
  done: string[];
  half: string[];
  unticked: string[];
  /** Old one-stage records ("Sold/Start → Piping"), as written. */
  moves: string[];
  photos: number;
  messages: number;
  notes: number;
  tasksNew: number;
  /** Newest close on this visit, ISO. */
  closedAt?: string;
  problems: number;
  problemsFixed: number;
  movedTo: string[];
  movedFrom: string[];
  /** Everything else that changed — renamed, retyped, a task deleted… */
  other: number;
  /** Nothing but "opened" records. */
  onlyLooked: boolean;
  logs: ScopedLog[];
}

export interface DayCard {
  /** `personKey|yyyy-MM-dd`. */
  key: string;
  personKey: string;
  person: string;
  /** Local calendar day, yyyy-MM-dd. */
  day: string;
  /** Newest record of the day, ISO — what the cards sort by. */
  newest: string;
  /** Visits where something happened, earliest first — the day reads forward. */
  visits: DayVisit[];
  /** Places only opened, earliest first. */
  looked: DayVisit[];
  /** Every workspace the day touched, in the order first met. */
  workspaces: string[];
  /** Distinct places worked (not merely opened). */
  places: number;
  /** Distinct places where a task was closed. */
  closed: number;
}

/** Who a record belongs to, by NAME — the page's own rule (a worker and a user can be one person). */
export function personKeyOf(l: ScopedLog): string {
  return ((l.userName || '').trim().toLowerCase() || (l.userId || '').trim());
}

const localDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : format(d, 'yyyy-MM-dd');
};

const addOnce = (list: string[], v: string | undefined) => {
  const x = (v ?? '').trim();
  if (x && !list.includes(x)) list.push(x);
};

function blankVisit(l: ScopedLog, ws: string): DayVisit {
  return {
    key: `${ws}|${l.apartmentId}|${l.createdAt}`, ws, aptId: l.apartmentId, buildingId: l.buildingId ?? '',
    first: l.createdAt, last: l.createdAt,
    started: [], done: [], half: [], unticked: [], moves: [],
    photos: 0, messages: 0, notes: 0, tasksNew: 0, problems: 0, problemsFixed: 0,
    movedTo: [], movedFrom: [], other: 0, onlyLooked: true, logs: [],
  };
}

/** Lay one record onto its visit. */
function absorb(v: DayVisit, l: ScopedLog, kind: ActivityKind, ctx: WordsContext) {
  v.logs.push(l);
  if (l.createdAt < v.first) v.first = l.createdAt;
  if (l.createdAt > v.last) v.last = l.createdAt;
  if (kind !== 'opened') v.onlyLooked = false;
  switch (kind) {
    case 'opened': break;
    case 'upload': v.photos++; break;
    case 'message': v.messages++; break;
    case 'note': v.notes++; break;
    case 'task_new': v.tasksNew++; break;
    case 'work_started': {
      const named = workStages(l.newValue ?? '', ctx);
      if (named.length) named.forEach(n => addOnce(v.started, n));
      else addOnce(v.started, stageWord(l.stageId, undefined, ctx));
      break;
    }
    case 'task_closed':
      if (!v.closedAt || l.createdAt > v.closedAt) v.closedAt = l.createdAt;
      break;
    case 'stages':
      for (const m of l.marks ?? []) {
        const w = stageWord(m.id, m.name, ctx);
        if (m.to === 'done') addOnce(v.done, w);
        else if (m.to === 'pending') addOnce(v.half, w);
        else if (m.from === 'done' || m.from === 'pending') addOnce(v.unticked, w);
        else v.other++;
      }
      if (!(l.marks ?? []).length) v.other++;
      break;
    case 'next_up': {
      const from = (l.previousValue ?? '').trim();
      const to = (l.newValue ?? '').trim();
      addOnce(v.moves, from && !/^not started$/i.test(from) ? `${stageWord(undefined, from, ctx)} → ${stageWord(l.stageId, to, ctx)}` : stageWord(l.stageId, to, ctx));
      break;
    }
    case 'problem': v.problems++; break;
    case 'problem_closed': case 'problem_approved': v.problemsFixed++; break;
    case 'task_moved_out': addOnce(v.movedTo, l.newValue); break;
    case 'task_moved_in': addOnce(v.movedFrom, l.previousValue); break;
    default: v.other++;
  }
}

/**
 * The cards, newest day first; within a day, whoever was busiest last.
 * `logs` may arrive in any order. Records with no apartment (a setting, a
 * board change) are left to the full log — a day story is about places.
 */
export function dayStories(logs: ScopedLog[], ctx: WordsContext & { currentWs?: string }, gapMs: number = VISIT_GAP_MS): DayCard[] {
  const asc = logs.filter(l => l && l.apartmentId && l.createdAt).slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const cards = new Map<string, DayCard>();
  // The open visit per card per place, so a gap can close it.
  const openVisit = new Map<string, DayVisit>();
  for (const l of asc) {
    const pk = personKeyOf(l);
    const day = localDay(l.createdAt);
    if (!pk || !day) continue;
    const ck = `${pk}|${day}`;
    const ws = l.ws ?? ctx.currentWs ?? '';
    let card = cards.get(ck);
    if (!card) {
      card = {
        key: ck, personKey: pk, person: (l.userName || '').trim() || (l.userId || '').trim(), day,
        newest: l.createdAt, visits: [], looked: [], workspaces: [], places: 0, closed: 0,
      };
      cards.set(ck, card);
    }
    if (l.createdAt > card.newest) card.newest = l.createdAt;
    if (!card.workspaces.includes(ws)) card.workspaces.push(ws);
    const vk = `${ck}|${ws}|${l.apartmentId}`;
    let v = openVisit.get(vk);
    if (!v || Date.parse(l.createdAt) - Date.parse(v.last) > gapMs) {
      v = blankVisit(l, ws);
      openVisit.set(vk, v);
      card.visits.push(v);
    }
    absorb(v, l, kindOf(l), ctx);
  }
  const out = [...cards.values()];
  for (const c of out) {
    const all = c.visits;
    c.visits = all.filter(v => !v.onlyLooked);
    // A place both worked and opened that day is a worked place; a look on it
    // is not a second line.
    const worked = new Set(c.visits.map(v => `${v.ws}|${v.aptId}`));
    const lookedSeen = new Set<string>();
    c.looked = all.filter(v => {
      if (!v.onlyLooked) return false;
      const k = `${v.ws}|${v.aptId}`;
      if (worked.has(k) || lookedSeen.has(k)) return false;
      lookedSeen.add(k);
      return true;
    });
    c.places = worked.size;
    c.closed = new Set(c.visits.filter(v => v.closedAt).map(v => `${v.ws}|${v.aptId}`)).size;
  }
  return out.sort((a, b) => b.day.localeCompare(a.day) || b.newest.localeCompare(a.newest));
}

// ─── Words ─────────────────────────────────────────────────────────────────

const list = (xs: string[], and: string) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`;
/** Hebrew joins the last with a bare ו prefixed to the word: "צנרת ומפוחים". */
const listHe = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ו${xs[xs.length - 1]}`;

export const DAY_WORDS = {
  en: {
    dayView: 'Day by day',
    allView: 'Every change',
    started: (s: string[]) => `started ${list(s, '+')}`,
    done: (s: string[]) => `${list(s, 'and')} done`,
    half: (s: string[]) => `${list(s, 'and')} half done`,
    unticked: (s: string[]) => `un-ticked ${list(s, 'and')}`,
    photos: (n: number) => n === 1 ? '1 photo' : `${n} photos`,
    messages: (n: number) => n === 1 ? '1 message' : `${n} messages`,
    notes: (n: number) => n === 1 ? '1 note' : `${n} notes`,
    tasksNew: (n: number) => n === 1 ? '1 new task' : `${n} new tasks`,
    problems: (n: number) => n === 1 ? 'reported a problem' : `reported ${n} problems`,
    problemsFixed: (n: number) => n === 1 ? 'a problem fixed' : `${n} problems fixed`,
    movedTo: (p: string) => `task moved to ${p}`,
    movedFrom: (p: string) => `task moved here from ${p}`,
    closed: (t: string) => `closed ${t}`,
    other: (n: number) => n === 1 ? '1 other change' : `${n} other changes`,
    now: 'now',
    places: (n: number, kind: 'apt' | 'job' | 'mix') =>
      `${n} ${kind === 'apt' ? (n === 1 ? 'apartment' : 'apartments') : kind === 'job' ? (n === 1 ? 'job' : 'jobs') : (n === 1 ? 'place' : 'places')}`,
    closedN: (n: number) => `${n} closed`,
    alsoLooked: (n: number) => `Also looked at ${n === 1 ? '1 more' : `${n} more`}:`,
    onlyLooked: (n: number) => `Looked at ${n === 1 ? '1 place' : `${n} places`}:`,
    showMoreDays: 'Show more days',
    openPhotos: (n: number) => n === 1 ? 'Open the photo' : `Open the ${n} photos`,
  },
  he: {
    dayView: 'יום אחר יום',
    allView: 'כל שינוי',
    started: (s: string[]) => `התחיל ${list(s, '+')}`,
    done: (s: string[]) => `${listHe(s)} ${s.length > 1 ? 'בוצעו' : 'בוצע'}`,
    half: (s: string[]) => `${listHe(s)} — חצי`,
    unticked: (s: string[]) => `ביטל סימון ${listHe(s)}`,
    photos: (n: number) => n === 1 ? 'תמונה אחת' : `${n} תמונות`,
    messages: (n: number) => n === 1 ? 'הודעה אחת' : `${n} הודעות`,
    notes: (n: number) => n === 1 ? 'הערה אחת' : `${n} הערות`,
    tasksNew: (n: number) => n === 1 ? 'משימה חדשה' : `${n} משימות חדשות`,
    problems: (n: number) => n === 1 ? 'דיווח על בעיה' : `דיווח על ${n} בעיות`,
    problemsFixed: (n: number) => n === 1 ? 'בעיה טופלה' : `${n} בעיות טופלו`,
    movedTo: (p: string) => `המשימה הועברה ל־${p}`,
    movedFrom: (p: string) => `המשימה הועברה לכאן מ־${p}`,
    closed: (t: string) => `נסגר ${t}`,
    other: (n: number) => n === 1 ? 'שינוי נוסף' : `${n} שינויים נוספים`,
    now: 'עכשיו',
    places: (n: number, kind: 'apt' | 'job' | 'mix') =>
      `${n} ${kind === 'apt' ? (n === 1 ? 'דירה' : 'דירות') : kind === 'job' ? (n === 1 ? 'עבודה' : 'עבודות') : (n === 1 ? 'מקום' : 'מקומות')}`,
    closedN: (n: number) => n === 1 ? 'אחד נסגר' : `${n} נסגרו`,
    alsoLooked: (n: number) => `הסתכל גם על ${n === 1 ? 'עוד אחד' : `עוד ${n}`}:`,
    onlyLooked: (n: number) => `הסתכל על ${n === 1 ? 'מקום אחד' : `${n} מקומות`}:`,
    showMoreDays: 'הצג עוד ימים',
    openPhotos: (n: number) => n === 1 ? 'פתח את התמונה' : `פתח את ${n} התמונות`,
  },
};

/** The visit's line as fragments, in the order a person tells it. */
export function visitFragments(v: DayVisit, lang: ActivityLang, clock: (iso: string) => string): string[] {
  const W = DAY_WORDS[lang];
  const out: string[] = [];
  if (v.started.length) out.push(W.started(v.started));
  out.push(...v.moves);
  if (v.done.length) out.push(W.done(v.done));
  if (v.half.length) out.push(W.half(v.half));
  if (v.unticked.length) out.push(W.unticked(v.unticked));
  if (v.problems) out.push(W.problems(v.problems));
  if (v.problemsFixed) out.push(W.problemsFixed(v.problemsFixed));
  if (v.tasksNew) out.push(W.tasksNew(v.tasksNew));
  if (v.photos) out.push(W.photos(v.photos));
  if (v.messages) out.push(W.messages(v.messages));
  if (v.notes) out.push(W.notes(v.notes));
  for (const p of v.movedTo) out.push(W.movedTo(p));
  for (const p of v.movedFrom) out.push(W.movedFrom(p));
  if (v.other) out.push(W.other(v.other));
  if (v.closedAt) out.push(W.closed(clock(v.closedAt)));
  return out;
}

/** Apartments, jobs, or both — what the header counts. */
export function placeKind(card: DayCard): 'apt' | 'job' | 'mix' {
  const jobs = card.visits.filter(v => v.buildingId === 'G').length;
  if (jobs === 0) return 'apt';
  return jobs === card.visits.length ? 'job' : 'mix';
}
