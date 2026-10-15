/**
 * The words an undo step says about itself, worked out from what CHANGED.
 *
 * `trackUndo` (store.ts) snapshots every kind of record before and after an
 * action; when the caller gave no words of its own, this turns the difference
 * into the history line ("Deleted a task at A1 12") and the sentence the undo
 * question quotes ("Brings back the task “Install units” at A1 12 (Moshe,
 * Tue 14 Oct), with its 2 photos and 1 message.").
 *
 * Pure: no store, no clock — the caller hands in the records and the names.
 * Always English, the language of every stored record and of the undo
 * question's own sentences.
 */

import type {
  Apartment, CanvasElement, ContractorAssignment, ContractorNote, ContractorPhoto,
  StageNote, OfficeNoteFile, BoardSetting, Contractor, User, Stage,
} from '../types';
import { aptLabel } from '../types';
import { daysOf } from './taskDays';
import { stageChangesOf } from './stageMarks';
import type { SetContext } from './stageMarks';
import type { TrackOpts } from './undo';

type Pair<T> = [T | null, T | null];

export interface UndoDiff {
  jobs: Pair<Apartment>[];
  els: Pair<CanvasElement>[];
  /** Tasks of the open workspace AND of others, each with its workspace id. */
  tasks: Array<{ pid: string; before: ContractorAssignment | null; after: ContractorAssignment | null }>;
  notes: Pair<ContractorNote>[];
  photos: Pair<ContractorPhoto>[];
  stageNotes: Pair<StageNote>[];
  officeFiles: Pair<OfficeNoteFile>[];
  settings: Array<{ key: string; before: BoardSetting | null; after: BoardSetting | null }>;
}

export interface UndoWorld {
  projectId: string;
  /** An apartment by id, in the given workspace (live or its snapshot). */
  aptOf: (id: string, pid: string) => Apartment | undefined;
  contractors: Contractor[];
  users: User[];
  /** The open workspace's stages, in order. */
  sortedStages: Stage[];
  ctx?: SetContext;
  workspaceName: (pid: string) => string;
}

/** Fields the store stamps on every write — never a change anybody made. */
export const BOOKKEEPING = new Set(['updatedAt', 'updatedBy', 'updatedByName', 'contentUpdatedAt']);

const short = (s: string | undefined, n = 48) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function dayWord(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function daysText(t: { days?: string[]; dueDate: string | null }): string {
  const ds = daysOf(t);
  if (!ds.length) return 'no date';
  if (ds.length === 1) return dayWord(ds[0]);
  return `${ds.length} days from ${dayWord(ds[0])}`;
}

function placeOf(apartmentId: string | undefined, pid: string, w: UndoWorld, general?: boolean): string {
  if (!apartmentId) return general ? `a general job in ${w.workspaceName(pid)}` : 'no apartment';
  const apt = w.aptOf(apartmentId, pid);
  const where = pid !== w.projectId ? ` in ${w.workspaceName(pid)}` : '';
  if (!apt) return `an apartment${where}`;
  return (aptLabel(apt) !== '?' ? (aptLabel(apt) || apt.displayName || apt.id) : (apt.displayName || apt.id)) + where;
}

const workerOf = (id: string | undefined, w: UndoWorld) =>
  (id && w.contractors.find(c => c.id === id)?.name) || 'nobody';

function taskLine(t: ContractorAssignment, pid: string, w: UndoWorld): string {
  const what = short(t.taskDescription) || 'the task';
  return `“${what}” at ${placeOf(t.apartmentId, pid, w, !!t.general)} (${workerOf(t.contractorId, w)}, ${daysText(t)})`;
}

const FIELD_WORDS: Record<string, string> = {
  displayName: 'family name', address: 'address', phone: 'phone', driveLink: 'Drive link',
  zohoLink: 'Zoho link', plansPdfLink: 'plan', classification: 'type', tipus: 'tipus',
  noteEntries: 'notes', generalNotes: 'notes', canvasX: 'position', canvasY: 'position',
  boardBin: 'group', tileColor: 'colour', currentStageId: 'stage', stageMarks: 'stages',
};
const STAGE_KEYS = new Set(['stageMarks', 'currentStageId', 'bubbles']);

const STATE_WORD: Record<string, string> = {
  done: 'done', todo: 'to do', doing: 'happening now', pending: 'half done', off: 'not needed',
  booked: 'booked', problem: 'a problem',
};

function changedKeys<T extends object>(a: T, b: T): string[] {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (BOOKKEEPING.has(k)) continue;
    const x = (a as Record<string, unknown>)[k];
    const y = (b as Record<string, unknown>)[k];
    if (x === y) continue;
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push(k);
  }
  return out;
}

/** "Piping back to done, Fans back to to do" — what the undo will do to the stages. */
function stagesBack(before: Apartment, after: Apartment, w: UndoWorld): string {
  const ch = stageChangesOf(after, before, w.sortedStages, w.ctx);
  if (!ch.length) return '';
  const words = ch.slice(0, 4).map(c => `${c.name} back to ${STATE_WORD[c.to] ?? c.to}`);
  return words.join(', ') + (ch.length > 4 ? ` and ${ch.length - 4} more` : '');
}

function describeJob(b: Apartment, a: Apartment, w: UndoWorld): TrackOpts {
  const place = placeOf(a.id, w.projectId, w);
  const keys = changedKeys(b, a);
  if (keys.some(k => STAGE_KEYS.has(k))) {
    const back = stagesBack(b, a, w);
    return {
      weight: 'content', label: `Changed the stages of ${place}`,
      explain: `Puts the stages of ${place} back as they were${back ? `: ${back}` : ''}.`,
    };
  }
  if (keys.includes('noteEntries')) {
    const was = b.noteEntries ?? [];
    const now = a.noteEntries ?? [];
    if (now.length > was.length) {
      const added = now.find(e => !was.some(x => x.id === e.id));
      return {
        weight: 'content', label: `Added a note to ${place}`,
        explain: `Takes the note “${short(added?.text)}” off ${place} again.`,
      };
    }
    const gone = was.find(e => !now.some(x => x.id === e.id));
    return {
      weight: 'content', label: `Removed a note from ${place}`,
      explain: `Puts the note “${short(gone?.text)}” back on ${place}.`,
    };
  }
  const words = [...new Set(keys.map(k => FIELD_WORDS[k] ?? k))];
  return {
    weight: 'content', label: `Edited ${place}`,
    explain: `Puts the ${words.slice(0, 4).join(', ')} of ${place} back to what ${words.length === 1 ? 'it was' : 'they were'}.`,
  };
}

function describeTask(
  t: UndoDiff['tasks'][number], d: UndoDiff, w: UndoWorld,
): TrackOpts {
  const { pid, before: b, after: a } = t;
  const rec = (a ?? b)!;
  const place = placeOf(rec.apartmentId, pid, w, !!rec.general);
  if (!b && a) {
    return {
      weight: 'content', label: `Added a task at ${place}`,
      explain: `Takes away the new task ${taskLine(a, pid, w)}.`,
    };
  }
  if (b && !a) {
    const photos = d.photos.filter(([x, y]) => x && !y && x.assignmentId === b.id).length;
    const msgs = d.notes.filter(([x, y]) => x && !y && x.assignmentId === b.id).length;
    const extra = [photos ? plural(photos, 'photo') : '', msgs ? plural(msgs, 'message') : ''].filter(Boolean);
    return {
      weight: 'content', label: `Deleted a task at ${place}`,
      explain: `Brings back the task ${taskLine(b, pid, w)}${extra.length ? `, with its ${extra.join(' and ')}` : ''}.`,
    };
  }
  const before = b!; const after = a!;
  const marks = d.jobs.some(([x]) => x?.id === before.apartmentId) ? `, and puts the stages of ${place} back as they were` : '';
  if (!before.completedAt && after.completedAt) {
    return {
      weight: 'content', label: `Marked a task done at ${place}`,
      explain: `Opens the task ${taskLine(before, pid, w)} again${marks}.`,
    };
  }
  if (before.completedAt && !after.completedAt) {
    return {
      weight: 'content', label: `Re-opened a task at ${place}`,
      explain: `Marks the task ${taskLine(before, pid, w)} done again${marks}.`,
    };
  }
  if (before.apartmentId !== after.apartmentId) {
    const to = placeOf(after.apartmentId, pid, w);
    const from = placeOf(before.apartmentId, pid, w);
    return {
      weight: 'content', label: `Moved a task to ${to}`,
      explain: `Takes the task “${short(before.taskDescription)}” back to ${from}, with its photos and messages${d.jobs.length ? ', and puts the stages of both apartments back as they were' : ''}.`,
    };
  }
  const keys = changedKeys(before, after);
  const daysMoved = keys.includes('days') || keys.includes('dueDate');
  const workerMoved = keys.includes('contractorId');
  if (daysMoved || workerMoved) {
    const label = daysMoved
      ? `Moved a task at ${place} to ${daysText(after)}`
      : `Gave a task at ${place} to ${workerOf(after.contractorId, w)}`;
    const parts = [daysMoved ? `back on ${daysText(before)}` : '', workerMoved ? `back with ${workerOf(before.contractorId, w)}` : '']
      .filter(Boolean);
    return {
      weight: 'content', label,
      explain: `Puts the task “${short(before.taskDescription)}” at ${place} ${parts.join(' and ')}.`,
    };
  }
  return {
    weight: 'content', label: `Edited a task at ${place}`,
    explain: `Puts the task ${taskLine(before, pid, w)} back the way it was before the edit${marks}.`,
  };
}

function personName(key: string, w: UndoWorld): string {
  if (key.startsWith('c:')) return w.contractors.find(c => c.id === key.slice(2))?.name ?? 'somebody';
  if (key.startsWith('u:')) return w.users.find(u => u.id === key.slice(2))?.name ?? 'somebody';
  return key.startsWith('n:') ? key.slice(2) : key;
}

/** The words for an action nobody gave words to. Never empty. */
export function describeUndo(d: UndoDiff, w: UndoWorld): TrackOpts {
  // Tasks first — they are what a person was looking at when they acted.
  if (d.tasks.length === 1) return describeTask(d.tasks[0], d, w);
  if (d.tasks.length > 1) {
    const added = d.tasks.filter(t => !t.before && t.after);
    const removed = d.tasks.filter(t => t.before && !t.after);
    const lines = d.tasks.slice(0, 3).map(t => taskLine((t.after ?? t.before)!, t.pid, w));
    const more = d.tasks.length > 3 ? ` and ${d.tasks.length - 3} more` : '';
    if (added.length === d.tasks.length) {
      return { weight: 'content', label: `Added ${plural(added.length, 'task')}`, explain: `Takes away the new tasks ${lines.join('; ')}${more}.` };
    }
    if (removed.length === d.tasks.length) {
      return { weight: 'content', label: `Deleted ${plural(removed.length, 'task')}`, explain: `Brings back the tasks ${lines.join('; ')}${more}.` };
    }
    return { weight: 'content', label: `Changed ${plural(d.tasks.length, 'task')}`, explain: `Puts the tasks ${lines.join('; ')}${more} back the way they were.` };
  }

  if (d.jobs.length === 1 && d.jobs[0][0] && d.jobs[0][1]) return describeJob(d.jobs[0][0], d.jobs[0][1], w);
  if (d.jobs.length > 1) {
    const places = d.jobs.slice(0, 4).map(([b, a]) => placeOf((a ?? b)!.id, w.projectId, w));
    return {
      weight: 'content', label: `Changed ${plural(d.jobs.length, 'apartment')}`,
      explain: `Puts ${places.join(', ')}${d.jobs.length > 4 ? ` and ${d.jobs.length - 4} more` : ''} back the way they were.`,
    };
  }

  if (d.notes.length) {
    const [b, a] = d.notes[0];
    const n = (a ?? b)!;
    const text = short(n.text) || n.attachmentFilename || 'a file';
    if (!b) return { weight: 'content', label: 'Sent a message', explain: `Takes back the message “${text}”.` };
    if (!a) return { weight: 'content', label: 'Deleted a message', explain: `Brings back the message “${text}”.` };
    return { weight: 'content', label: 'Edited a message', explain: `Puts the message “${text}” back the way it was.` };
  }
  if (d.photos.length) {
    const gone = d.photos.filter(([b, a]) => b && !a).length;
    return gone
      ? { weight: 'content', label: `Deleted ${plural(gone, 'photo')}`, explain: `Brings back ${plural(gone, 'photo')}.` }
      : { weight: 'content', label: 'Changed photos', explain: 'Puts the photos back the way they were.' };
  }
  if (d.officeFiles.length) {
    const [b, a] = d.officeFiles[0];
    const f = (a ?? b)!;
    const place = placeOf(f.apartmentId, w.projectId, w);
    if (!b) return { weight: 'content', label: `Attached a file to ${place}`, explain: `Takes the file “${short(f.filename)}” off ${place} again. The copy in Google Drive stays.` };
    if (!a) return { weight: 'content', label: `Removed a file from ${place}`, explain: `Puts the file “${short(f.filename)}” back on ${place}.` };
  }
  if (d.stageNotes.length) {
    const [b, a] = d.stageNotes[0];
    const n = (a ?? b)!;
    const place = placeOf(n.apartmentId, w.projectId, w);
    const stage = w.sortedStages.find(s => s.id === n.stageId)?.name ?? 'a stage';
    return {
      weight: 'content', label: `Changed the ${stage} notes of ${place}`,
      explain: `Puts the ${stage} notes of ${place} back the way they were.`,
    };
  }
  if (d.settings.length) {
    const s = d.settings.find(x => JSON.stringify(x.before?.timeOff ?? []) !== JSON.stringify(x.after?.timeOff ?? []));
    if (s) {
      const was = s.before?.timeOff ?? [];
      const now = s.after?.timeOff ?? [];
      const sig = (t: { id: string; from: string; to: string; kind: string }) => `${t.id}|${t.from}|${t.to}|${t.kind}`;
      const touched = [...was.filter(x => !now.some(y => sig(y) === sig(x))), ...now.filter(x => !was.some(y => sig(y) === sig(x)))];
      const who = [...new Set(touched.map(t => personName(t.person, w)))];
      return {
        weight: 'content', label: `Changed time off${who.length ? ` for ${who.join(', ')}` : ''}`,
        explain: `Puts ${who.length ? `${who.join(' and ')}'s` : 'the'} time off back the way it was.`,
      };
    }
    return { weight: 'content', label: 'Changed a setting', explain: 'Puts the setting back the way it was.' };
  }
  if (d.els.length) {
    return { weight: 'content', label: `Changed ${plural(d.els.length, 'thing')} on the board`, explain: 'Puts the board back the way it was.' };
  }
  return { weight: 'content', label: 'Changed something', explain: 'Puts it back the way it was.' };
}
