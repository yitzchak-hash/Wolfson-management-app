import {
  Apartment, Building, Contractor, ContractorAssignment, Stage, StageNote, ActivityLog, ContractorPhoto, CustomButton,
  aptLabel, isCountableApartment, getStageName,
} from '../types';
import { progressOf, StageState } from './stageMarks';
import { describeLog } from './activityWords';
import { crewOf, acCompanyOf, isCompanyButton, isInspectedButton } from './aptCrew';
import { waitingInspection, doneWordOf, workingVisits } from './stageHow';

/**
 * Reports, as a thing you BUILD rather than a table somebody wrote once.
 *
 * The old page could answer exactly one question — "list the apartments, with
 * these columns" — and every other question came back as "export it and open
 * it in Excel". That is not a report, it is a dump with a column picker.
 *
 * The model here is the one a CRM uses, and it has four moving parts:
 *
 *  · a SUBJECT, which decides what one row IS. "One row per task" and "one row
 *    per job" are different reports and can never be the same table.
 *  · FIELDS, including ones reached across a join. A task's row can print the
 *    job's address and the worker's category, because a task knows both.
 *  · RULES, which narrow it, and
 *  · a GROUPING, which is what turns a list into an answer: "open tasks by
 *    worker" is one field and one filter away from "every task", but only one
 *    of them tells you anything.
 *
 * All of it is PURE. Nothing here reads the store, calls a clock or touches the
 * DOM: `run()` takes the data and the definition and returns rows. That is what
 * makes it testable, and a report is exactly the kind of thing that is wrong
 * quietly — a filter that silently drops binned jobs looks like a report with
 * fewer rows, not like a fault.
 */

export type FieldType = 'text' | 'number' | 'date' | 'bool';

/** Everything a report can be built from, handed in rather than reached for. */
export interface ReportData {
  apartments: Apartment[];
  assignments: ContractorAssignment[];
  contractors: Contractor[];
  stages: Stage[];
  buildings: Building[];
  stageNotes: StageNote[];
  activity: ActivityLog[];
  /** The pictures workers sent — the Problems subject counts and prints them. */
  photos?: ContractorPhoto[];
  /** The set model's tipus sets, so a job's fraction counts the stages IT carries. */
  tipusStages?: Record<string, string[]>;
  /** The workspace's own information buttons ("Wall Yes/No") — each becomes a column of its own. */
  customButtons?: CustomButton[];
  isRtl: boolean;
  /**
   * Today, as yyyy-MM-dd. Passed in, never read from a clock in here — a report
   * that computes "overdue" from `new Date()` cannot be tested and cannot be
   * reproduced tomorrow.
   */
  today: string;
}

export type Cell = string | number | null;

export interface ReportField {
  key: string;
  label: string;
  type: FieldType;
  /** Which heading it sits under in the picker — usually the joined record. */
  group: string;
  get: (row: any, d: ReportData) => Cell;
  /** Offered as a dropdown in the filter row when the values are a known set. */
  choices?: (d: ReportData) => { value: string; label: string }[];
  /**
   * Whether a total of this column means anything.
   *
   * Opt-in, because "is it a number" is not the same question. The stats strip
   * happily printed "total floor: 12" across four apartments — arithmetic that
   * is correct and says nothing, which is worse than a missing figure because
   * it looks like a finding.
   */
  sum?: boolean;
}

export type SubjectId = 'jobs' | 'tasks' | 'workers' | 'notes' | 'activity' | 'problems' | 'work';

export interface ReportSubject {
  id: SubjectId;
  label: string;
  /** "3 jobs", "3 tasks" — the word under the count. */
  noun: string;
  nounPlural: string;
  blurb: string;
  rows: (d: ReportData) => any[];
  fields: ReportField[];
  /**
   * Columns that come from the workspace's OWN lists — one per stage, one per custom button (owner, 2026-11-17:
   * "every time I add something new, it should go into here as well"). Read with `fieldsOf`, never `fields` alone.
   */
  more?: (d: ReportData) => ReportField[];
}

/** Every column a subject has for this workspace right now: the fixed ones plus its stages and buttons. */
export function fieldsOf(subject: ReportSubject, d: ReportData): ReportField[] {
  return subject.more ? [...subject.fields, ...subject.more(d)] : subject.fields;
}

export type Op =
  | 'is' | 'isnot' | 'has' | 'hasnot'
  | 'empty' | 'notempty'
  | 'gt' | 'lt' | 'between'
  | 'before' | 'after';

export interface Rule {
  field: string;
  op: Op;
  value: string;
  value2?: string;
}

export interface ReportDef {
  id: string;
  name: string;
  subject: SubjectId;
  columns: string[];
  rules: Rule[];
  /** Every rule, or any of them. */
  match: 'all' | 'any';
  groupBy?: string;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
  show: 'table' | 'summary' | 'chart';
  /** For summary and chart: count the rows, or total a numeric field. */
  metric?: string;
  updatedAt?: string;
  updatedBy?: string;
  /**
   * Which of the green tiles at the top of the reports page holds it, 0..19 (owner, 2026-11-17: "add like 20 green
   * little tiles … when I click on the tile, a window opens up with an AI chat … it will create the report and save
   * it on that green tile"). Absent → a report saved the old way, listed only in "Saved reports".
   */
  tile?: number;
  /** The conversation that made it, so reopening the tile carries on where it left off (kept short). */
  chat?: { role: 'user' | 'ai'; text: string }[];
}

// ── small shared helpers ─────────────────────────────────────────────────────

const dateOnly = (v: string | null | undefined): string => (v ?? '').slice(0, 10);

/**
 * "Is this job real?", asked exactly once in the whole app.
 *
 * Reports must use `isCountableApartment` and nothing else, or a report and the
 * dashboard disagree about how many jobs there are — which is the fault that is
 * hardest to argue about, because both numbers look authoritative.
 */
const liveJobs = (d: ReportData): Apartment[] => d.apartments.filter(isCountableApartment);

/**
 * A task counts while its job counts.
 *
 * A job filed into Done or Trash leaves every unit total; its tasks have to
 * leave with it, or the task count keeps chasing work on a job nobody considers
 * open any more.
 */
function liveAssignments(d: ReportData): ContractorAssignment[] {
  const ok = new Set(liveJobs(d).map(j => j.id));
  // A general job has no apartment and counts under its workspace.
  return d.assignments.filter(a => ok.has(a.apartmentId) || !!a.general);
}

const jobOf = (d: ReportData, id: string) => d.apartments.find(a => a.id === id);
const stageOf = (d: ReportData, id: string | null | undefined) =>
  id ? d.stages.find(s => s.id === id) : undefined;
const workerOf = (d: ReportData, id: string) => d.contractors.find(c => c.id === id);

const stageText = (d: ReportData, id: string | null | undefined): string => {
  const st = stageOf(d, id);
  return st ? getStageName(st, d.isRtl) : '';
};

/** Whole days between two yyyy-MM-dd dates, without touching a clock. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

const stageChoices = (d: ReportData) =>
  d.stages.filter(s => s.active).map(s => ({ value: s.id, label: getStageName(s, d.isRtl) }));

// ── the fields shared by anything that can reach a job ────────────────────────

/**
 * A job's columns, reusable from any subject that can find one.
 *
 * Written once and re-pointed, because "the address" must mean the same thing
 * and print the same way whether the row is a job, a task on that job or a note
 * against it. Two copies drift, and a report is where that shows up as two
 * different answers to the same question.
 */
const progressCache = new WeakMap<ReportData, { sorted: Stage[]; byApt: Map<string, ReturnType<typeof progressOf>> }>();
function sortedStagesOf(d: ReportData): Stage[] {
  let c = progressCache.get(d);
  if (!c) { c = { sorted: [...d.stages].sort((a, b) => a.order - b.order), byApt: new Map() }; progressCache.set(d, c); }
  return c.sorted;
}
/** Worked out once per apartment per report run — a stage column per stage would otherwise redo it every cell. */
function progressFor(j: Apartment, d: ReportData) {
  const sorted = sortedStagesOf(d);
  const c = progressCache.get(d)!;
  let p = c.byApt.get(j.id);
  if (!p) { p = progressOf(j, sorted, { tipusStages: d.tipusStages }, d.assignments); c.byApt.set(j.id, p); }
  return p;
}

/** The word the apartment window shows on a stage's row: Done (or its own word, "Sent"), Waiting, To do … */
const STATE_WORD: Record<StageState, string> = {
  done: 'Done', doing: 'Working', pending: 'Part of it', booked: 'Booked', problem: 'Problem', off: 'Not in this flat', todo: 'To do',
};
function stageWordOn(j: Apartment, st: Stage, d: ReportData): string {
  const row = progressFor(j, d).rows.find(r => r.stage.id === st.id);
  if (!row) return STATE_WORD.off;
  // Always starts with "Done", so "contains Done" finds every finished stage whatever its own word is.
  if (row.state === 'done') return doneLabel(st);
  const waiting = waitingInspection(j, sortedStagesOf(d), { tipusStages: d.tipusStages });
  if (waiting?.id === st.id) return 'Waiting';
  return STATE_WORD[row.state];
}

function doneLabel(st: Stage): string {
  const own = (doneWordOf(st, false) || '').trim();
  return own && own.toLowerCase() !== 'done' ? `Done (${own})` : 'Done';
}

const ANSWER_WORD: Record<string, string> = { yes: 'Yes', no: 'No', unknown: "Don't know" };

/**
 * THE APARTMENT WINDOW'S OWN LISTS AS COLUMNS (owner, 2026-11-17: "make sure that those items I have in the report
 * screen as well … every time I add something new, it should go into here as well"): for every stage of the
 * workspace its status, who finished it and when; for every custom button ("Wall Yes/No") its answer. Built from the
 * workspace's lists each time, so a stage or button added tomorrow is a column tomorrow with nothing to change here.
 */
function jobMore(prefix: string, group: string, pick: (row: any, d: ReportData) => Apartment | undefined) {
  return (d: ReportData): ReportField[] => {
    const at = (get: (j: Apartment) => Cell) => (row: any, dd: ReportData) => { const j = pick(row, dd); return j ? get(j) : null; };
    const out: ReportField[] = [];
    (d.customButtons ?? []).filter(cb => !isCompanyButton(cb) && !isInspectedButton(cb)).forEach(cb => {
      out.push({
        key: `${prefix}btn.${cb.id}`, label: cb.name, type: 'text', group: `${group} — buttons`,
        get: at(j => ANSWER_WORD[j.customAnswers?.[cb.id] ?? ''] ?? ''),
        choices: () => ['Yes', 'No', "Don't know"].map(v => ({ value: v, label: v })),
      });
    });
    sortedStagesOf(d).forEach(st => {
      const name = getStageName(st, d.isRtl);
      const g = `${group} — stages`;
      out.push({
        key: `${prefix}st.${st.id}`, label: `${name}`, type: 'text', group: g,
        get: (row, dd) => { const j = pick(row, dd); return j ? stageWordOn(j, st, dd) : null; },
        choices: () => [...new Set([doneLabel(st), 'Waiting', 'Working', 'Part of it', 'Booked',
          'Problem', 'To do', 'Not in this flat'])].map(v => ({ value: v, label: v })),
      });
      out.push({
        key: `${prefix}stBy.${st.id}`, label: `${name} — done by`, type: 'text', group: g,
        get: at(j => (progressFor(j, d).rows.find(r => r.stage.id === st.id)?.state === 'done' ? j.stageDone?.[st.id]?.by ?? '' : '')),
      });
      out.push({
        key: `${prefix}stAt.${st.id}`, label: `${name} — done on`, type: 'date', group: g,
        get: at(j => (progressFor(j, d).rows.find(r => r.stage.id === st.id)?.state === 'done'
          ? dateOnly(j.stageDone?.[st.id]?.at ?? j.stageDates?.[st.id] ?? '') : '')),
      });
    });
    return out;
  };
}

function jobFields(prefix: string, group: string, pick: (row: any, d: ReportData) => Apartment | undefined): ReportField[] {
  const f = (key: string, label: string, type: FieldType,
    get: (j: Apartment, d: ReportData) => Cell,
    choices?: ReportField['choices']): ReportField => ({
    key: `${prefix}${key}`, label, type, group, choices,
    get: (row, d) => { const j = pick(row, d); return j ? get(j, d) : null; },
  });

  return [
    f('name', 'Job', 'text', j => aptLabel(j) || j.displayName || ''),
    f('aptNo', 'Apartment number', 'text', j => j.apartmentNumber ?? ''),
    f('family', 'Family name', 'text', j => (j.isUnnamed ? '' : j.displayName ?? '')),
    f('tipus', 'Tipus', 'text', j => j.tipus ?? '',
      d => [...new Set(d.apartments.map(a => a.tipus).filter((t): t is string => !!t))].sort()
        .map(t => ({ value: t, label: t }))),
    f('building', 'Building', 'text', j => j.buildingId),
    f('floor', 'Floor', 'number', j => j.floor),
    f('stage', 'Stage', 'text', (j, d) => stageText(d, j.currentStageId),
      d => stageChoices(d)),
    // The set model: the fraction, and the stages done / still to do by name.
    f('progress', 'Stages done of', 'text', (j, d) => { const p = progressFor(j, d); return p.total ? `${p.done}/${p.total}` : ''; }),
    f('doneCount', 'Stages done', 'number', (j, d) => progressFor(j, d).done),
    f('stagesDone', 'Done stages', 'text', (j, d) => progressFor(j, d).rows.filter(r => r.state === 'done').map(r => r.stage.name).join(', ')),
    f('stagesLeft', 'Stages still to do', 'text', (j, d) => progressFor(j, d).rows.filter(r => r.state !== 'done').map(r => r.stage.name).join(', ')),
    // The contractor on the job (Yaakov / Daniel / Igor), typed or read off who finished Installation.
    f('crew', 'Contractor', 'text', (j, d) => crewOf(j, d.stages).name,
      d => [...new Set(liveJobs(d).map(j => crewOf(j, d.stages).name).filter(Boolean))].sort()
        .map(n => ({ value: n, label: n }))),
    // Everyone who ever worked on it — finished tasks and site visits too, unlike "Workers on it" (open tasks).
    f('workedBy', 'Worked on by (ever)', 'text', (j, d) => [...workSpans(d, j)].map(s => s.worker).join(', ')),
    f('workStart', 'Work started', 'date', (j, d) => {
      const all = [...workSpans(d, j)].flatMap(s => s.starts).sort();
      return all[0] ?? '';
    }),
    f('workEnd', 'Work finished', 'date', (j, d) => {
      const spans = [...workSpans(d, j)];
      if (!spans.length || spans.some(s => s.open)) return '';
      return spans.flatMap(s => s.ends).sort().pop() ?? '';
    }),
    f('class', 'Standard / Upgraded', 'text', j => (j.classification === 'shinui' ? 'Upgraded' : 'Standard'),
      () => [{ value: 'Standard', label: 'Standard' }, { value: 'Upgraded', label: 'Upgraded' }]),
    f('acCompany', 'AC company', 'text', (j, d) => acCompanyOf(j, d.customButtons ?? []),
      d => [...new Set(liveJobs(d).map(j => acCompanyOf(j, d.customButtons ?? [])).filter(Boolean))].sort()
        .map(n => ({ value: n, label: n }))),
    f('waitingFor', 'Waiting for inspection', 'text', (j, d) =>
      { const w = waitingInspection(j, sortedStagesOf(d), { tipusStages: d.tipusStages }); return w ? getStageName(w, d.isRtl) : ''; }),
    f('workingNow', 'Working here now', 'text', j => workingVisits(j).map(v => v.byName).join(', ')),
    f('inspections', 'Inspections done', 'number', j => (j.inspections ?? []).length),
    f('address', 'Address', 'text', j => j.address ?? ''),
    f('notes', 'Notes', 'text', j => j.generalNotes ?? ''),
    f('drive', 'Has a Drive folder', 'bool', j => (j.driveLink ? 'Yes' : 'No')),
    f('plans', 'Has plans', 'bool', j => (j.plansPdfLink ? 'Yes' : 'No')),
    f('planApproved', 'Plan approved', 'bool', j => (j.plansPdfLink && !j.planApprovalPending ? 'Yes' : 'No')),
    f('updated', 'Last edited', 'date', j => dateOnly(j.contentUpdatedAt ?? j.updatedAt)),
    f('updatedBy', 'Edited by', 'text', j => j.updatedByName ?? ''),
    f('created', 'Created', 'date', j => dateOnly(j.createdAt)),
  ];
}

// ── subjects ─────────────────────────────────────────────────────────────────

const JOBS: ReportSubject = {
  id: 'jobs',
  label: 'Jobs',
  noun: 'job', nounPlural: 'jobs',
  blurb: 'One row per job, with its stage, its folder and how its tasks are going.',
  rows: d => liveJobs(d),
  fields: [
    ...jobFields('', 'The job', (row: Apartment) => row),
    {
      key: 'openTasks', sum: true, label: 'Open tasks', type: 'number', group: 'Its tasks',
      get: (j: Apartment, d) => d.assignments.filter(a => a.apartmentId === j.id && !a.completedAt).length,
    },
    {
      key: 'doneTasks', sum: true, label: 'Finished tasks', type: 'number', group: 'Its tasks',
      get: (j: Apartment, d) => d.assignments.filter(a => a.apartmentId === j.id && a.completedAt).length,
    },
    {
      key: 'overdueTasks', sum: true, label: 'Overdue tasks', type: 'number', group: 'Its tasks',
      get: (j: Apartment, d) => d.assignments.filter(a =>
        a.apartmentId === j.id && !a.completedAt && a.dueDate && a.dueDate < d.today).length,
    },
    {
      key: 'nextDue', label: 'Next due', type: 'date', group: 'Its tasks',
      get: (j: Apartment, d) => {
        const dates = d.assignments
          .filter(a => a.apartmentId === j.id && !a.completedAt && a.dueDate)
          .map(a => a.dueDate!)
          .sort();
        return dates[0] ?? '';
      },
    },
    {
      key: 'workers', label: 'Workers on it', type: 'text', group: 'Its tasks',
      get: (j: Apartment, d) => {
        const names = new Set(d.assignments
          .filter(a => a.apartmentId === j.id && !a.completedAt)
          .map(a => workerOf(d, a.contractorId)?.name)
          .filter(Boolean) as string[]);
        return [...names].join(', ');
      },
    },
    {
      key: 'openProblems', sum: true, label: 'Open problems', type: 'number', group: 'Its tasks',
      get: (j: Apartment, d) => d.assignments.filter(a => a.apartmentId === j.id && !!a.problem && !a.completedAt).length,
    },
  ],
  more: jobMore('', 'The job', (row: Apartment) => row),
};

const TASKS: ReportSubject = {
  id: 'tasks',
  label: 'Tasks',
  noun: 'task', nounPlural: 'tasks',
  blurb: 'One row per task, and it can print the job it is on and who it is for.',
  rows: d => liveAssignments(d),
  fields: [
    {
      key: 'task', label: 'Task', type: 'text', group: 'The task',
      get: (t: ContractorAssignment) => t.taskDescription,
    },
    {
      key: 'status', label: 'Status', type: 'text', group: 'The task',
      get: (t: ContractorAssignment) => (t.completedAt ? 'Finished' : 'Open'),
      choices: () => [{ value: 'Open', label: 'Open' }, { value: 'Finished', label: 'Finished' }],
    },
    {
      key: 'due', label: 'Due', type: 'date', group: 'The task',
      get: (t: ContractorAssignment) => t.dueDate ?? '',
    },
    {
      /**
       * Positive means late. Negative would mean "days early", which nobody
       * asks for, so an unfinished task with no due date reads as 0 rather
       * than as a large negative number sorting to the top.
       */
      key: 'daysLate', sum: true, label: 'Days late', type: 'number', group: 'The task',
      get: (t: ContractorAssignment, d) => {
        if (!t.dueDate) return 0;
        const end = t.completedAt ? dateOnly(t.completedAt) : d.today;
        return Math.max(0, daysBetween(t.dueDate, end));
      },
    },
    {
      key: 'priority', label: 'Priority', type: 'text', group: 'The task',
      get: (t: ContractorAssignment) => t.priority ?? 'normal',
      choices: () => ['urgent', 'normal', 'low'].map(v => ({ value: v, label: v })),
    },
    {
      key: 'taskStage', label: 'Stage', type: 'text', group: 'The task',
      get: (t: ContractorAssignment, d) => stageText(d, t.stageId),
      choices: d => stageChoices(d),
    },
    {
      key: 'completed', label: 'Finished on', type: 'date', group: 'The task',
      get: (t: ContractorAssignment) => dateOnly(t.completedAt),
    },
    {
      key: 'created', label: 'Given out', type: 'date', group: 'The task',
      get: (t: ContractorAssignment) => dateOnly(t.createdAt),
    },
    {
      key: 'files', sum: true, label: 'Files attached', type: 'number', group: 'The task',
      get: (t: ContractorAssignment) => t.attachments?.length ?? 0,
    },
    {
      key: 'worker', label: 'Worker', type: 'text', group: 'The worker',
      get: (t: ContractorAssignment, d) => workerOf(d, t.contractorId)?.name ?? '',
      choices: d => d.contractors.filter(c => c.active).map(c => ({ value: c.name, label: c.name })),
    },
    {
      key: 'workerTrade', label: 'Trade', type: 'text', group: 'The worker',
      get: (t: ContractorAssignment, d) => workerOf(d, t.contractorId)?.category ?? '',
      choices: () => ['drywall', 'ac', 'general'].map(v => ({ value: v, label: v })),
    },
    ...jobFields('job.', 'The job', (t: ContractorAssignment, d) => jobOf(d, t.apartmentId)),
  ],
  more: jobMore('job.', 'The job', (t: ContractorAssignment, d) => jobOf(d, t.apartmentId)),
};

/**
 * PROBLEMS (owner, 2026-09-06): one row per problem raised — the morning's
 * list when grouped by worker or by status. Pictures ride the row as a count
 * here; the page prints the thumbnails when asked ("with pictures").
 */
export const problemStatusText = (t: ContractorAssignment): string => {
  const st = t.problem?.status ?? 'open';
  if (t.completedAt || st === 'solved') return 'Solved';
  return st === 'waiting' ? 'Waiting for approval' : st === 'returned' ? 'Sent back' : 'Open';
};
export const problemPhotos = (d: ReportData, t: ContractorAssignment): ContractorPhoto[] =>
  (d.photos ?? []).filter(p => p.assignmentId === t.id && (p.fileType ?? 'image') === 'image');

const PROBLEMS: ReportSubject = {
  id: 'problems',
  label: 'Problems',
  noun: 'problem', nounPlural: 'problems',
  blurb: 'One row per problem raised on an apartment: who fixes it, the deadline, where it stands, and the pictures sent back.',
  rows: d => liveAssignments(d).filter(t => !!t.problem),
  fields: [
    {
      key: 'what', label: 'Problem', type: 'text', group: 'The problem',
      get: (t: ContractorAssignment) => t.taskDescription,
    },
    {
      key: 'status', label: 'Status', type: 'text', group: 'The problem',
      get: (t: ContractorAssignment) => problemStatusText(t),
      choices: () => ['Open', 'Waiting for approval', 'Sent back', 'Solved'].map(v => ({ value: v, label: v })),
    },
    {
      key: 'raised', label: 'Raised', type: 'date', group: 'The problem',
      get: (t: ContractorAssignment) => dateOnly(t.createdAt),
    },
    {
      key: 'raisedBy', label: 'Raised by', type: 'text', group: 'The problem',
      get: (t: ContractorAssignment) => t.createdByName ?? '',
    },
    {
      key: 'deadline', label: 'Deadline', type: 'date', group: 'The problem',
      get: (t: ContractorAssignment) => t.dueDate ?? '',
    },
    {
      key: 'daysLate', sum: true, label: 'Days late', type: 'number', group: 'The problem',
      get: (t: ContractorAssignment, d) => {
        if (!t.dueDate) return 0;
        const end = t.problem?.closedAt ? dateOnly(t.problem.closedAt) : t.completedAt ? dateOnly(t.completedAt) : d.today;
        return Math.max(0, daysBetween(t.dueDate, end));
      },
    },
    {
      key: 'closed', label: 'Closed by the worker', type: 'date', group: 'The problem',
      get: (t: ContractorAssignment) => dateOnly(t.problem?.closedAt ?? null),
    },
    {
      key: 'approved', label: 'Approved', type: 'date', group: 'The problem',
      get: (t: ContractorAssignment) => dateOnly(t.problem?.approvedAt ?? null),
    },
    {
      key: 'approvedBy', label: 'Approved by', type: 'text', group: 'The problem',
      get: (t: ContractorAssignment) => t.problem?.approvedBy ?? '',
    },
    {
      key: 'photosRequired', label: 'Pictures required', type: 'bool', group: 'The problem',
      get: (t: ContractorAssignment) => (t.problem?.photosRequired ? 'Yes' : 'No'),
    },
    {
      key: 'pictures', sum: true, label: 'Pictures sent', type: 'number', group: 'The problem',
      get: (t: ContractorAssignment, d) => problemPhotos(d, t).length,
    },
    {
      key: 'worker', label: 'Worker', type: 'text', group: 'The worker',
      get: (t: ContractorAssignment, d) => workerOf(d, t.contractorId)?.name ?? '',
      choices: d => d.contractors.filter(c => c.active).map(c => ({ value: c.name, label: c.name })),
    },
    ...jobFields('job.', 'The job', (t: ContractorAssignment, d) => jobOf(d, t.apartmentId)),
  ],
  more: jobMore('job.', 'The job', (t: ContractorAssignment, d) => jobOf(d, t.apartmentId)),
};

/**
 * WHO WORKED WHERE, AND FROM WHEN TO WHEN (owner, 2026-11-17, first AI tile: "a final report of all the jobs that
 * Igor did — show me the building, apartments and the dates he started and finished … I don't need every separate
 * thing he did in this apartment").
 *
 * One span per worker per apartment, gathered from everything that says a person worked there: his tasks (the first
 * working day, else the due day, else the day it was given out → the day it was finished), his site visits
 * ("I'm working here" → "I'm done here"), the stages finished in his name, and the job's Contractor (Yaakov / Daniel /
 * Igor), which carries no dates of its own. A span is OPEN while any task of his there is unfinished or he is still
 * "working here" — then it has no finish date, because it has not finished.
 */
export interface WorkSpan {
  id: string;
  aptId: string;
  worker: string;
  starts: string[];
  ends: string[];
  tasks: number;
  openTasks: number;
  open: boolean;
}

const spanCache = new WeakMap<ReportData, Map<string, WorkSpan[]>>();

function allWorkSpans(d: ReportData): Map<string, WorkSpan[]> {
  const hit = spanCache.get(d);
  if (hit) return hit;
  const live = new Set(liveJobs(d).map(j => j.id));
  const spans = new Map<string, WorkSpan>();
  const span = (aptId: string, worker: string): WorkSpan | null => {
    const name = worker.trim();
    if (!name || !live.has(aptId)) return null;
    const key = `${aptId}|${name.toLowerCase()}`;
    let s = spans.get(key);
    if (!s) { s = { id: key, aptId, worker: name, starts: [], ends: [], tasks: 0, openTasks: 0, open: false }; spans.set(key, s); }
    return s;
  };
  d.assignments.forEach(t => {
    const s = span(t.apartmentId, workerOf(d, t.contractorId)?.name ?? '');
    if (!s) return;
    s.tasks++;
    const start = dateOnly(t.days?.[0] ?? t.dueDate ?? t.createdAt);
    if (start) s.starts.push(start);
    if (t.completedAt) s.ends.push(dateOnly(t.completedAt));
    else { s.openTasks++; s.open = true; }
  });
  d.apartments.forEach(j => {
    (j.siteVisits ?? []).forEach(v => {
      const s = span(j.id, v.byName ?? '');
      if (!s) return;
      if (v.startedAt) s.starts.push(dateOnly(v.startedAt));
      if (v.endedAt) s.ends.push(dateOnly(v.endedAt));
      if (v.status === 'working') s.open = true;
    });
    Object.values(j.stageDone ?? {}).forEach(sd => {
      const s = span(j.id, sd?.by ?? '');
      if (!s || !sd.at) return;
      s.starts.push(dateOnly(sd.at));
      s.ends.push(dateOnly(sd.at));
    });
    // The job's Contractor, unless he is already here under his full name ("Igor" and "Igor Petrov" are one man).
    const crew = live.has(j.id) ? crewOf(j, d.stages).name.trim().toLowerCase() : '';
    if (crew && ![...spans.values()].some(s => s.aptId === j.id
      && (s.worker.toLowerCase().startsWith(crew) || crew.startsWith(s.worker.toLowerCase())))) {
      span(j.id, crewOf(j, d.stages).name);
    }
  });
  const byApt = new Map<string, WorkSpan[]>();
  spans.forEach(s => {
    s.starts.sort(); s.ends.sort();
    const list = byApt.get(s.aptId) ?? [];
    list.push(s);
    byApt.set(s.aptId, list);
  });
  spanCache.set(d, byApt);
  return byApt;
}

const workSpans = (d: ReportData, j: Apartment): WorkSpan[] => allWorkSpans(d).get(j.id) ?? [];

const spanStart = (s: WorkSpan) => s.starts[0] ?? '';
const spanEnd = (s: WorkSpan) => (s.open ? '' : s.ends[s.ends.length - 1] ?? '');

const WORK: ReportSubject = {
  id: 'work',
  label: 'Who worked where',
  noun: 'apartment worked', nounPlural: 'apartments worked',
  blurb: 'One row per worker per apartment: the day he started there and the day he finished — not every separate task.',
  rows: d => [...allWorkSpans(d).values()].flat(),
  fields: [
    {
      key: 'worker', label: 'Worker', type: 'text', group: 'The work',
      get: (s: WorkSpan) => s.worker,
      choices: d => [...new Set([...allWorkSpans(d).values()].flat().map(s => s.worker))].sort()
        .map(n => ({ value: n, label: n })),
    },
    { key: 'started', label: 'Started', type: 'date', group: 'The work', get: (s: WorkSpan) => spanStart(s) },
    { key: 'finished', label: 'Finished', type: 'date', group: 'The work', get: (s: WorkSpan) => spanEnd(s) },
    {
      key: 'workStatus', label: 'Status', type: 'text', group: 'The work',
      get: (s: WorkSpan) => (s.open ? 'Still working' : s.ends.length ? 'Finished' : 'No dates'),
      choices: () => ['Finished', 'Still working', 'No dates'].map(v => ({ value: v, label: v })),
    },
    {
      key: 'workDays', sum: true, label: 'Days from start to finish', type: 'number', group: 'The work',
      get: (s: WorkSpan) => (spanStart(s) && spanEnd(s) ? daysBetween(spanStart(s), spanEnd(s)) + 1 : null),
    },
    { key: 'workTasks', sum: true, label: 'His tasks there', type: 'number', group: 'The work', get: (s: WorkSpan) => s.tasks },
    { key: 'workOpen', sum: true, label: 'His open tasks there', type: 'number', group: 'The work', get: (s: WorkSpan) => s.openTasks },
    ...jobFields('job.', 'The job', (s: WorkSpan, d) => jobOf(d, s.aptId)),
  ],
  more: jobMore('job.', 'The job', (s: WorkSpan, d) => jobOf(d, s.aptId)),
};

const WORKERS: ReportSubject = {
  id: 'workers',
  label: 'Workers',
  noun: 'worker', nounPlural: 'workers',
  blurb: 'One row per worker, with their workload and how much of it is late.',
  rows: d => d.contractors,
  fields: [
    { key: 'name', label: 'Name', type: 'text', group: 'The worker', get: (c: Contractor) => c.name },
    { key: 'trade', label: 'Trade', type: 'text', group: 'The worker', get: (c: Contractor) => c.category,
      choices: () => ['drywall', 'ac', 'general'].map(v => ({ value: v, label: v })) },
    { key: 'email', label: 'Email', type: 'text', group: 'The worker', get: (c: Contractor) => c.email ?? '' },
    { key: 'active', label: 'Still working', type: 'bool', group: 'The worker',
      get: (c: Contractor) => (c.active ? 'Yes' : 'No') },
    { key: 'lang', label: 'Their language', type: 'text', group: 'The worker',
      get: (c: Contractor) => (c.lang === 'he' ? 'Hebrew' : c.lang === 'ru' ? 'Russian' : 'English') },
    {
      key: 'open', sum: true, label: 'Open tasks', type: 'number', group: 'Their work',
      get: (c: Contractor, d) => liveAssignments(d).filter(a => a.contractorId === c.id && !a.completedAt).length,
    },
    {
      key: 'done', sum: true, label: 'Finished tasks', type: 'number', group: 'Their work',
      get: (c: Contractor, d) => liveAssignments(d).filter(a => a.contractorId === c.id && a.completedAt).length,
    },
    {
      key: 'overdue', sum: true, label: 'Overdue', type: 'number', group: 'Their work',
      get: (c: Contractor, d) => liveAssignments(d).filter(a =>
        a.contractorId === c.id && !a.completedAt && a.dueDate && a.dueDate < d.today).length,
    },
    {
      key: 'jobs', sum: true, label: 'Jobs they are on', type: 'number', group: 'Their work',
      get: (c: Contractor, d) => new Set(liveAssignments(d)
        .filter(a => a.contractorId === c.id && !a.completedAt)
        .map(a => a.apartmentId)).size,
    },
    {
      key: 'lastFinished', label: 'Last finished', type: 'date', group: 'Their work',
      get: (c: Contractor, d) => {
        const dates = liveAssignments(d)
          .filter(a => a.contractorId === c.id && a.completedAt)
          .map(a => dateOnly(a.completedAt)).sort();
        return dates[dates.length - 1] ?? '';
      },
    },
  ],
};

const NOTES: ReportSubject = {
  id: 'notes',
  label: 'Stage notes',
  noun: 'note', nounPlural: 'notes',
  blurb: 'One row per stage note, with the job and stage it was written against.',
  rows: d => {
    const ok = new Set(liveJobs(d).map(j => j.id));
    return d.stageNotes.filter(n => ok.has(n.apartmentId) && (n.noteText ?? '').trim());
  },
  fields: [
    { key: 'text', label: 'Note', type: 'text', group: 'The note', get: (n: StageNote) => n.noteText },
    { key: 'stage', label: 'Stage', type: 'text', group: 'The note',
      get: (n: StageNote, d) => stageText(d, n.stageId), choices: d => stageChoices(d) },
    { key: 'updated', label: 'Written', type: 'date', group: 'The note',
      get: (n: StageNote) => dateOnly(n.updatedAt) },
    { key: 'by', label: 'Written by', type: 'text', group: 'The note',
      get: (n: StageNote) => n.updatedByName ?? '' },
    { key: 'files', sum: true, label: 'Files attached', type: 'number', group: 'The note',
      get: (n: StageNote) => n.attachments?.length ?? (n.attachmentFilename ? 1 : 0) },
    ...jobFields('job.', 'The job', (n: StageNote, d) => jobOf(d, n.apartmentId)),
  ],
  more: jobMore('job.', 'The job', (n: StageNote, d) => jobOf(d, n.apartmentId)),
};

const ACTIVITY: ReportSubject = {
  id: 'activity',
  label: 'Changes',
  noun: 'change', nounPlural: 'changes',
  blurb: 'One row per recorded change — who altered what, and what it was before.',
  rows: d => d.activity,
  fields: [
    { key: 'when', label: 'When', type: 'date', group: 'The change',
      get: (l: ActivityLog) => dateOnly(l.createdAt) },
    { key: 'who', label: 'Who', type: 'text', group: 'The change', get: (l: ActivityLog) => l.userName },
    // The log's own words ("uploaded a photo", "marked Registers done"),
    // never the stored field name ("photo_uploaded", "viewed").
    { key: 'what', label: 'What changed', type: 'text', group: 'The change',
      get: (l: ActivityLog, d) => describeLog(l, { lang: d.isRtl ? 'he' : 'en', stages: d.stages }).text },
    { key: 'from', label: 'From', type: 'text', group: 'The change', get: (l: ActivityLog) => l.previousValue },
    { key: 'to', label: 'To', type: 'text', group: 'The change', get: (l: ActivityLog) => l.newValue },
    ...jobFields('job.', 'The job', (l: ActivityLog, d) => jobOf(d, l.apartmentId)),
  ],
  more: jobMore('job.', 'The job', (l: ActivityLog, d) => jobOf(d, l.apartmentId)),
};

export const SUBJECTS: ReportSubject[] = [JOBS, TASKS, PROBLEMS, WORK, WORKERS, NOTES, ACTIVITY];

export const subjectOf = (id: SubjectId): ReportSubject =>
  SUBJECTS.find(s => s.id === id) ?? JOBS;

export const fieldOf = (subject: SubjectId, key: string): ReportField | undefined =>
  subjectOf(subject).fields.find(f => f.key === key);

// ── running one ──────────────────────────────────────────────────────────────

/** Which operators make sense against which kind of field. */
export const OPS_FOR: Record<FieldType, { op: Op; label: string }[]> = {
  text: [
    { op: 'has', label: 'contains' }, { op: 'hasnot', label: 'does not contain' },
    { op: 'is', label: 'is' }, { op: 'isnot', label: 'is not' },
    { op: 'empty', label: 'is empty' }, { op: 'notempty', label: 'is not empty' },
  ],
  bool: [{ op: 'is', label: 'is' }],
  number: [
    { op: 'is', label: 'is' }, { op: 'gt', label: 'is more than' },
    { op: 'lt', label: 'is less than' }, { op: 'between', label: 'is between' },
  ],
  date: [
    { op: 'is', label: 'is' }, { op: 'before', label: 'is before' },
    { op: 'after', label: 'is after' }, { op: 'between', label: 'is between' },
    { op: 'empty', label: 'is not set' }, { op: 'notempty', label: 'is set' },
  ],
};

export function passesRule(cell: Cell, rule: Rule, type: FieldType): boolean {
  const raw = cell ?? '';
  const text = String(raw).toLowerCase();
  const want = (rule.value ?? '').toLowerCase();

  switch (rule.op) {
    case 'empty':    return text.trim() === '';
    case 'notempty': return text.trim() !== '';
    case 'has':      return text.includes(want);
    case 'hasnot':   return !text.includes(want);
    case 'is':       return text === want;
    case 'isnot':    return text !== want;
    case 'before':   return !!text && text < want;
    case 'after':    return !!text && text > want;
    case 'gt':       return Number(raw) > Number(rule.value);
    case 'lt':       return Number(raw) < Number(rule.value);
    case 'between':
      if (type === 'number') {
        return Number(raw) >= Number(rule.value) && Number(raw) <= Number(rule.value2 ?? rule.value);
      }
      return !!text && text >= want && text <= (rule.value2 ?? rule.value).toLowerCase();
    default: return true;
  }
}

export interface ReportRow {
  id: string;
  /** The record itself, so a row can still be clicked through to. */
  raw: any;
  cells: Cell[];
}

export interface ReportGroup {
  key: string;
  rows: ReportRow[];
  /** Row count, or the total of the chosen numeric field. */
  value: number;
}

export interface ReportResult {
  columns: ReportField[];
  rows: ReportRow[];
  groups: ReportGroup[];
  /** How many rows the subject had before the rules narrowed it. */
  total: number;
  /** The measure name shown under a chart bar or beside a group heading. */
  metricLabel: string;
}

/**
 * A definition plus the data gives rows. No clock, no store, no DOM.
 *
 * An unrecognised column key is dropped rather than printed as a blank column —
 * a saved report outlives the field list, and a report that grows an empty
 * column after an upgrade looks like missing data rather than a renamed field.
 */
export function runReport(def: ReportDef, d: ReportData): ReportResult {
  const subject = subjectOf(def.subject);
  const byKey = new Map(fieldsOf(subject, d).map(f => [f.key, f]));
  const columns = def.columns.map(k => byKey.get(k)).filter(Boolean) as ReportField[];

  const all = subject.rows(d);

  const kept = all.filter(row => {
    if (!def.rules.length) return true;
    const checks = def.rules.map(r => {
      const f = byKey.get(r.field);
      if (!f) return true;
      return passesRule(f.get(row, d), r, f.type);
    });
    return def.match === 'any' ? checks.some(Boolean) : checks.every(Boolean);
  });

  const sortField = def.sortBy ? byKey.get(def.sortBy) : undefined;
  const sorted = sortField
    ? [...kept].sort((a, b) => {
      const av = sortField.get(a, d), bv = sortField.get(b, d);
      const n = sortField.type === 'number'
        ? Number(av ?? 0) - Number(bv ?? 0)
        : String(av ?? '').localeCompare(String(bv ?? ''));
      return def.sortDir === 'desc' ? -n : n;
    })
    : kept;

  const rows: ReportRow[] = sorted.map((raw, i) => ({
    id: raw.id ?? String(i),
    raw,
    cells: columns.map(c => c.get(raw, d)),
  }));

  // ── grouping ──
  const metricField = def.metric && def.metric !== 'count' ? byKey.get(def.metric) : undefined;
  const metricLabel = metricField ? `total ${metricField.label.toLowerCase()}` : subject.nounPlural;

  let groups: ReportGroup[] = [];
  if (def.groupBy) {
    const gf = byKey.get(def.groupBy);
    if (gf) {
      const buckets = new Map<string, ReportRow[]>();
      sorted.forEach((raw, i) => {
        // Blank is a real answer and must be visible — "no stage" is usually
        // the group somebody is looking for.
        const key = String(gf.get(raw, d) ?? '').trim() || '(not set)';
        const list = buckets.get(key) ?? [];
        list.push(rows[i]);
        buckets.set(key, list);
      });
      groups = [...buckets.entries()].map(([key, list]) => ({
        key,
        rows: list,
        value: metricField
          ? list.reduce((sum, r) => sum + Number(metricField.get(r.raw, d) ?? 0), 0)
          : list.length,
      })).sort((a, b) => b.value - a.value);
    }
  }

  return { columns, rows, groups, total: all.length, metricLabel };
}

/** A blank report, so "New report" opens something that already works. */
export function newReport(subject: SubjectId = 'jobs'): ReportDef {
  const s = subjectOf(subject);
  return {
    id: `R-${Math.random().toString(36).slice(2, 10)}`,
    name: `${s.label} report`,
    subject,
    columns: s.fields.slice(0, 5).map(f => f.key),
    rules: [],
    match: 'all',
    sortDir: 'asc',
    show: 'table',
    metric: 'count',
  };
}
