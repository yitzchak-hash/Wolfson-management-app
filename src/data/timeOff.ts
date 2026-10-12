/**
 * Time off — the arithmetic, pure.
 *
 * Approved on "Calendar and Time Off" (owner, 2026-10-12: "all stars, build
 * it"). Time off belongs to the PERSON, never to one notebook: the notebook's
 * person keys (`c:<contractorId>` · `u:<userId>` · `n:<name>`) are the
 * identity, and one shared list (`BoardSetting.timeOff` in the app-wide
 * `__tv` bag — persisted, synced and backed up with no new state key) is read
 * by every notebook, the calendar, the task form, the wall and the phone.
 *
 * Whole days only (locked answer 12). `to` is the LAST day away, inclusive.
 * Nothing here moves a task: booked days are LISTED and the office decides
 * task by task (locked answer 9).
 */
import { nextWorkingDay, parseDay, dayIso } from './taskDays';

export type TimeOffKind = 'vacation' | 'sick' | 'reserve' | 'other';

export interface TimeOff {
  id: string;
  /** The notebook's person key: `c:<contractorId>`, `u:<userId>` or `n:<name>`. */
  person: string;
  /** First day away (ISO). */
  from: string;
  /** Last day away (ISO, inclusive). */
  to: string;
  kind: TimeOffKind;
  note?: string;
  /** Who set it, and when — shown on the band's title. */
  by?: string;
  at?: string;
}

export const TIME_OFF_KINDS: TimeOffKind[] = ['vacation', 'sick', 'reserve', 'other'];

/** Blue hatched for vacation, pink for sick (locked answer 8); reserve green, other grey. */
export const TIME_OFF_COLOR: Record<TimeOffKind, { ink: string; stripe: string; bg: string }> = {
  vacation: { ink: '#1d4ed8', stripe: '#bfdbfe', bg: '#eff6ff' },
  sick:     { ink: '#be185d', stripe: '#fbcfe8', bg: '#fdf2f8' },
  reserve:  { ink: '#3f6212', stripe: '#d9f99d', bg: '#f7fee7' },
  other:    { ink: '#475569', stripe: '#e2e8f0', bg: '#f8fafc' },
};

/** The hatched band's background — one rule so every screen draws the same stripes. */
export function hatchOf(kind: TimeOffKind): string {
  const c = TIME_OFF_COLOR[kind] ?? TIME_OFF_COLOR.other;
  return `repeating-linear-gradient(135deg, ${c.stripe} 0 6px, ${c.bg} 6px 12px)`;
}

const KIND_WORDS: Record<string, Record<TimeOffKind, string>> = {
  en: { vacation: 'Vacation', sick: 'Sick', reserve: 'Reserve duty', other: 'Away' },
  he: { vacation: 'חופשה', sick: 'מחלה', reserve: 'מילואים', other: 'לא זמין' },
  ru: { vacation: 'Отпуск', sick: 'Больничный', reserve: 'Резерв', other: 'Нет на работе' },
};

const LOCALE: Record<string, string> = { en: 'en-US', he: 'he-IL', ru: 'ru-RU' };

export function kindWord(kind: TimeOffKind, lang = 'en'): string {
  return (KIND_WORDS[lang] ?? KIND_WORDS.en)[kind] ?? KIND_WORDS.en.other;
}

/** "back", "until", "away" … in the reader's own language. */
export function timeOffWords(lang = 'en') {
  if (lang === 'he') return { back: 'חוזר', until: 'עד', away: 'לא בעבודה', kept: 'המשרד השאיר את זה', heAway: 'הוא לא בעבודה' };
  if (lang === 'ru') return { back: 'выходит', until: 'до', away: 'нет на работе', kept: 'офис оставил это', heAway: 'он не работает' };
  return { back: 'back', until: 'until', away: 'away', kept: 'the office kept this', heAway: "he's away" };
}

/** A short date in the reader's language: "Tue 13 Oct". */
export function shortDay(isoDay: string, lang = 'en'): string {
  const d = parseDay(isoDay);
  return d.toLocaleDateString(LOCALE[lang] ?? 'en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** A day `n` calendar days away, in local time. */
export function shiftDay(isoDay: string, n: number): string {
  const d = parseDay(isoDay);
  return dayIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** Is `day` inside the entry? (ISO strings compare as dates.) */
export function covers(t: TimeOff, day: string): boolean {
  return day >= t.from && day <= t.to;
}

/** The person's time off covering `day`, if any (the first by start). */
export function offOn(list: TimeOff[] | undefined, person: string, day: string): TimeOff | undefined {
  if (!list?.length) return undefined;
  return list.filter(t => t.person === person && covers(t, day)).sort((a, b) => a.from.localeCompare(b.from))[0];
}

/** Every entry of one person, oldest first. */
export function timeOffOf(list: TimeOff[] | undefined, person: string): TimeOff[] {
  return (list ?? []).filter(t => t.person === person).sort((a, b) => a.from.localeCompare(b.from));
}

/** The first working day after the time off ends — "back Sun 18". */
export function backDay(t: TimeOff): string {
  return nextWorkingDay(t.to);
}

/** Every calendar day of an entry, inclusive (whole days only). */
export function daysOfTimeOff(t: Pick<TimeOff, 'from' | 'to'>): string[] {
  const out: string[] = [];
  if (!t.from || !t.to || t.to < t.from) return out;
  let d = parseDay(t.from);
  let guard = 0;
  while (guard++ < 400) {
    const s = dayIso(d);
    if (s > t.to) break;
    out.push(s);
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return out;
}

/**
 * The first of `days` on which the person is away — what the task form's
 * "Gadi is on vacation on Tue 13 Oct (back Sun 18)" warning reads.
 */
export function awayOnAny(list: TimeOff[] | undefined, person: string, days: string[]): { day: string; off: TimeOff } | null {
  for (const day of [...days].sort()) {
    const off = offOn(list, person, day);
    if (off) return { day, off };
  }
  return null;
}

/** The warning sentence, in the reader's language. */
export function awaySentence(name: string, hit: { day: string; off: TimeOff }, lang = 'en'): string {
  const kind = kindWord(hit.off.kind, lang).toLowerCase();
  const day = shortDay(hit.day, lang);
  const back = shortDay(backDay(hit.off), lang);
  if (lang === 'he') return `${name} ב${kindWord(hit.off.kind, 'he')} ב־${day} (חוזר ${back}).`;
  if (lang === 'ru') return `${name}: ${kind} ${day} (выходит ${back}).`;
  const what = hit.off.kind === 'sick' ? 'off sick' : hit.off.kind === 'reserve' ? 'on reserve duty'
    : hit.off.kind === 'vacation' ? 'on vacation' : 'away';
  return `${name} is ${what} on ${day} (back ${back}).`;
}

/** One line for a band: "Vacation · back Sun 18" (or "· until Thu 15"). */
export function bandLine(t: TimeOff, lang = 'en', withUntil = false): string {
  const w = timeOffWords(lang);
  const parts = [kindWord(t.kind, lang)];
  if (withUntil && t.to !== t.from) parts.push(`${w.until} ${shortDay(t.to, lang)}`);
  parts.push(`${w.back} ${shortDay(backDay(t), lang)}`);
  return parts.join(' · ');
}

/**
 * Tasks booked on the days a person is away: OPEN tasks of that worker with
 * at least one day inside the range. Only a contractor key can carry tasks.
 */
export function bookedDuring<T extends { id: string; contractorId?: string | null; days?: string[]; dueDate: string | null; completedAt?: string | null }>(
  tasks: T[], person: string, from: string, to: string,
): T[] {
  if (!person.startsWith('c:') || !from || !to) return [];
  const cid = person.slice(2);
  return tasks.filter(a => {
    if (a.completedAt || a.contractorId !== cid) return false;
    const ds = a.days?.length ? a.days : (a.dueDate ? [a.dueDate] : []);
    return ds.some(d => d >= from && d <= to);
  });
}

/** Add or replace one entry (by id). */
export function upsertTimeOff(list: TimeOff[] | undefined, t: TimeOff): TimeOff[] {
  const rest = (list ?? []).filter(x => x.id !== t.id);
  return [...rest, t].sort((a, b) => a.from.localeCompare(b.from) || a.person.localeCompare(b.person));
}

export function removeTimeOff(list: TimeOff[] | undefined, id: string): TimeOff[] {
  return (list ?? []).filter(x => x.id !== id);
}

/**
 * "Off this day" from a right-click on a square: one day. When the day
 * touches an existing entry of the same kind it is joined onto it instead of
 * becoming a second, separate band.
 */
export function offThisDay(list: TimeOff[] | undefined, person: string, day: string, kind: TimeOffKind = 'vacation', by?: string): TimeOff[] {
  const cur = list ?? [];
  if (offOn(cur, person, day)) return cur;
  const prev = shiftDay(day, -1);
  const nextD = shiftDay(day, 1);
  const touch = cur.find(t => t.person === person && t.kind === kind && (t.to === prev || t.from === nextD));
  if (touch) {
    return upsertTimeOff(cur, { ...touch, from: day < touch.from ? day : touch.from, to: day > touch.to ? day : touch.to });
  }
  return upsertTimeOff(cur, {
    id: `TO-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    person, from: day, to: day, kind, by, at: new Date().toISOString(),
  });
}

/** Take one day back: shortens, splits, or removes the entry covering it. */
export function backOnThisDay(list: TimeOff[] | undefined, person: string, day: string): TimeOff[] {
  const cur = list ?? [];
  const t = offOn(cur, person, day);
  if (!t) return cur;
  const rest = cur.filter(x => x.id !== t.id);
  const prev = shiftDay(day, -1);
  const nextD = shiftDay(day, 1);
  const out = [...rest];
  if (t.from < day) out.push({ ...t, to: prev });
  if (t.to > day) out.push({ ...t, id: t.from < day ? `${t.id}-b` : t.id, from: nextD });
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

/** A person key's display name, against the notebook's own resolver rules. */
export function timeOffPersonKey(contractorId: string): string {
  return `c:${contractorId}`;
}
