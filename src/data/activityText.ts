import { ActivityLog, Apartment, Stage } from '../types';
import { ActivityLang, ACTIVITY_UI, describeGroup, placeName } from './activityWords';

/**
 * A log row as a line for the small surfaces — the header's LIVE ticker, the
 * dashboard card and the "What changed" widget — in pieces, so the job's name
 * can be drawn as something you can press.
 *
 * The words themselves come from `activityWords`, the one place a record
 * becomes a sentence; this only adds the place and the age. It used to word
 * the records itself, and printed what the owner read off his header on
 * 2026-10-05: "updated the viewed", "set the completedAt to 2026-1…",
 * "updated the photo_uploaded" — field names wearing a sentence's clothes.
 */

/** The best human name for whatever the row is about (never an internal id). */
export function activitySubject(log: ActivityLog, apartments: Apartment[], lang: ActivityLang = 'en'): string {
  const apt = log.apartmentId ? apartments.find(a => a.id === log.apartmentId) : undefined;
  return placeName(log, apt, lang);
}

/**
 * One run of the sentence. `jobId` is only set when the record still exists,
 * so a link can never lead nowhere: a deleted job keeps its name in the line —
 * the history is the point — but stays plain text.
 */
export interface ActivityPart {
  text: string;
  jobId?: string;
}

export interface ActivityLine {
  who: string;
  /** e.g. "uploaded 5 photos · 9 — Levi" — the same sentence, flattened. */
  what: string;
  /** The same sentence in pieces, so the job's name can be a link. */
  parts: ActivityPart[];
  /** "just now", "12m ago", "3h ago" */
  when: string;
}

/**
 * A record — or a consolidated run of them, newest first — as a line.
 * Pass the reader's language and the stage list to have stages named in it.
 */
export function describeActivity(
  logOrRun: ActivityLog | ActivityLog[],
  apartments: Apartment[],
  now = Date.now(),
  opts: { lang?: ActivityLang; stages?: Stage[] } = {},
): ActivityLine {
  const logs = Array.isArray(logOrRun) ? logOrRun : [logOrRun];
  const log = logs[0];
  const lang = opts.lang ?? 'en';
  const words = describeGroup(logs, { lang, stages: opts.stages });

  const parts: ActivityPart[] = [{ text: words.text }];
  if (log.apartmentId) {
    const apt = apartments.find(a => a.id === log.apartmentId);
    const name = placeName(log, apt, lang);
    parts.push({ text: ' · ' }, apt ? { text: name, jobId: log.apartmentId } : { text: name });
  }

  const mins = Math.max(0, Math.round((now - new Date(log.createdAt).getTime()) / 60_000));
  return {
    who: words.who,
    what: parts.map(p => p.text).join(''),
    parts,
    when: ACTIVITY_UI[lang].ago(mins),
  };
}
