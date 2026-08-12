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

/**
 * One run of the sentence.
 *
 * The line is built as pieces rather than one string so the job's name can be
 * drawn as something you can press. "Moved Artzi to Piping" is only half an
 * answer — the next thing anybody does is go and look at Artzi, and a feed
 * that names a job without letting you open it makes you go and find it by
 * hand. `jobId` is only set when the record still exists, so a link can never
 * lead nowhere.
 */
export interface ActivityPart {
  text: string;
  jobId?: string;
}

export interface ActivityLine {
  who: string;
  /** e.g. "moved Artzi, Avital to Piping" — the same sentence, flattened. */
  what: string;
  /** The same sentence in pieces, so the job's name can be a link. */
  parts: ActivityPart[];
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

  // Only a job that is still on the books gets a link. A deleted one keeps its
  // name in the sentence — the history is the point — but pressing it would
  // open an empty drawer, so it stays plain text.
  const exists = !!log.apartmentId && apartments.some(a => a.id === log.apartmentId);
  const job = (): ActivityPart => (
    exists ? { text: subject, jobId: log.apartmentId } : { text: subject }
  );

  let parts: ActivityPart[];
  if (log.fieldChanged === 'currentStageId') {
    parts = log.newValue && log.newValue !== 'Not started'
      ? [{ text: 'moved ' }, job(), { text: ` to ${log.newValue}` }]
      : [{ text: 'cleared the stage on ' }, job()];
  } else if (log.fieldChanged === 'task') {
    parts = [{ text: 'changed a task on ' }, job()];
  } else if (log.actionType === 'create') {
    parts = [{ text: 'added ' }, job()];
  } else if (log.actionType === 'delete') {
    parts = [{ text: 'deleted ' }, job()];
  } else if (log.newValue && log.newValue.length <= 28 && !isInternalId(log.newValue)) {
    parts = [{ text: `set the ${field} on ` }, job(), { text: ` to ${log.newValue}` }];
  } else {
    parts = [{ text: `updated the ${field} on ` }, job()];
  }

  const mins = Math.max(0, Math.round((now - new Date(log.createdAt).getTime()) / 60_000));
  const when = mins < 1 ? 'just now'
    : mins < 60 ? `${mins}m ago`
    : mins < 1440 ? `${Math.floor(mins / 60)}h ago`
    : `${Math.floor(mins / 1440)}d ago`;

  return {
    who: log.userName || 'Someone',
    what: parts.map(p => p.text).join(''),
    parts,
    when,
  };
}
