import { ActivityLog, Apartment } from '../types';

/**
 * Turns an activity log row into a sentence a person can read.
 *
 * The raw row is not fit to show: `fieldChanged` holds a code name like
 * `currentStageId`, and `apartmentNumber` falls back to the record's internal
 * id, so an unnamed job produced a line of gibberish digits. Everything here
 * exists to make sure neither ever reaches the screen.
 */

const FIELD_LABEL: Record<string, string> = {
  currentStageId: 'stage',
  classification: 'type',
  generalNotes: 'notes',
  displayName: 'name',
  address: 'address',
  driveLink: 'Drive folder',
  plansPdfLink: 'plan',
  zohoLink: 'Zoho link',
  boardBin: 'filing',
  task: 'task',
  stageNote: 'stage note',
};

/** True when a string is an internal record id rather than something typed. */
function isInternalId(v: string): boolean {
  return /^(G|CE|PIN|BL)-/.test(v) || /^[a-z]?\d{9,}/.test(v);
}

/** The best human name for whatever the row is about. */
export function activitySubject(log: ActivityLog, apartments: Apartment[]): string {
  const apt = apartments.find(a => a.id === log.apartmentId);
  const fromRecord = apt?.displayName || apt?.apartmentNumber;
  if (fromRecord) return fromRecord;
  const stored = log.apartmentNumber ?? '';
  if (stored && !isInternalId(stored)) return stored;
  return 'a job';
}

export interface ActivityLine {
  who: string;
  /** e.g. "moved Artzi, Avital to Piping" */
  what: string;
  /** "just now", "12m ago", "3h ago" */
  when: string;
}

export function describeActivity(
  log: ActivityLog,
  apartments: Apartment[],
  now = Date.now(),
): ActivityLine {
  const subject = activitySubject(log, apartments);
  const field = FIELD_LABEL[log.fieldChanged] ?? log.fieldChanged ?? 'something';

  let what: string;
  if (log.fieldChanged === 'currentStageId') {
    what = log.newValue && log.newValue !== 'Not started'
      ? `moved ${subject} to ${log.newValue}`
      : `cleared the stage on ${subject}`;
  } else if (log.fieldChanged === 'task') {
    what = `changed a task on ${subject}`;
  } else if (log.actionType === 'create') {
    what = `added ${subject}`;
  } else if (log.actionType === 'delete') {
    what = `deleted ${subject}`;
  } else if (log.newValue && log.newValue.length <= 28 && !isInternalId(log.newValue)) {
    what = `set the ${field} on ${subject} to ${log.newValue}`;
  } else {
    what = `updated the ${field} on ${subject}`;
  }

  const mins = Math.max(0, Math.round((now - new Date(log.createdAt).getTime()) / 60_000));
  const when = mins < 1 ? 'just now'
    : mins < 60 ? `${mins}m ago`
    : mins < 1440 ? `${Math.floor(mins / 60)}h ago`
    : `${Math.floor(mins / 1440)}d ago`;

  return { who: log.userName || 'Someone', what, when };
}
