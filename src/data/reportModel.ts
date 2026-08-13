import {
  Apartment, Building, Contractor, ContractorAssignment, Stage, StageNote, ActivityLog,
  aptLabel, isCountableApartment, getStageName,
} from '../types';

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

export type SubjectId = 'jobs' | 'tasks' | 'workers' | 'notes' | 'activity';

export interface ReportSubject {
  id: SubjectId;
  label: string;
  /** "3 jobs", "3 tasks" — the word under the count. */
  noun: string;
  nounPlural: string;
  blurb: string;
  rows: (d: ReportData) => any[];
  fields: ReportField[];
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
  return d.assignments.filter(a => ok.has(a.apartmentId));
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
function jobFields(prefix: string, group: string, pick: (row: any, d: ReportData) => Apartment | undefined): ReportField[] {
  const f = (key: string, label: string, type: FieldType,
    get: (j: Apartment, d: ReportData) => Cell,
    choices?: ReportField['choices']): ReportField => ({
    key: `${prefix}${key}`, label, type, group, choices,
    get: (row, d) => { const j = pick(row, d); return j ? get(j, d) : null; },
  });

  return [
    f('name', 'Job', 'text', j => aptLabel(j) || j.displayName || ''),
    f('building', 'Building', 'text', j => j.buildingId),
    f('floor', 'Floor', 'number', j => j.floor),
    f('stage', 'Stage', 'text', (j, d) => stageText(d, j.currentStageId),
      d => stageChoices(d)),
    f('class', 'Type', 'text', j => (j.classification === 'shinui' ? 'Changes' : 'Standard'),
      () => [{ value: 'Standard', label: 'Standard' }, { value: 'Changes', label: 'Changes' }]),
    f('address', 'Address', 'text', j => j.address ?? ''),
    f('notes', 'Notes', 'text', j => j.generalNotes ?? ''),
    f('drive', 'Has a Drive folder', 'bool', j => (j.driveLink ? 'Yes' : 'No')),
    f('plans', 'Has plans', 'bool', j => (j.plansPdfLink ? 'Yes' : 'No')),
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
  ],
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
      get: (c: Contractor) => (c.lang === 'he' ? 'Hebrew' : 'English') },
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
    { key: 'what', label: 'What changed', type: 'text', group: 'The change',
      get: (l: ActivityLog) => l.fieldChanged },
    { key: 'from', label: 'From', type: 'text', group: 'The change', get: (l: ActivityLog) => l.previousValue },
    { key: 'to', label: 'To', type: 'text', group: 'The change', get: (l: ActivityLog) => l.newValue },
    ...jobFields('job.', 'The job', (l: ActivityLog, d) => jobOf(d, l.apartmentId)),
  ],
};

export const SUBJECTS: ReportSubject[] = [JOBS, TASKS, WORKERS, NOTES, ACTIVITY];

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
  const byKey = new Map(subject.fields.map(f => [f.key, f]));
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
