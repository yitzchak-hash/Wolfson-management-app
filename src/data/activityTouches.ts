/**
 * TOUCHES — every trace of a job being USED, from every source the app
 * already records, folded into "which jobs is the office working on".
 *
 * The approved plan (docs/plans/active-jobs/DESIGN.md, 2026-09-07, "all yes"):
 * opening a job counts (the history's hourly-throttled entries), so does
 * editing it, a task made or closed, a problem, a message or memo, a photo
 * from site, a plan marked up, a pin placed or resolved, a day planned in the
 * weekly notebook, and a file added, changed or REMOVED in the job's Drive
 * folder. Arranging the board never counts, and a job the sweep or the
 * import merely copied in is not activity by itself.
 *
 * Pure on purpose: no store, no clock, no DOM — `now` is passed in, so the
 * arithmetic is tested offline (scratchpad/activitytouches-test.mjs) and the
 * widget can memoise the fold on its inputs and never run it per frame.
 */
import type {
  Apartment, ActivityLog, ContractorAssignment, ContractorNote, ContractorPhoto,
  PlanAnnotation, PlanPin, CanvasElement, Contractor,
} from '../types';

export type TouchKind = 'opened' | 'edited' | 'task' | 'message' | 'photo' | 'plan' | 'notebook' | 'drive';
/** Which chip a touch answers to. */
export type TouchSide = 'office' | 'site' | 'drive' | 'notebook';
export type TouchFilter = 'all' | TouchSide;

export interface Touch {
  jobId: string;
  /** ISO timestamp. */
  at: string;
  who: string;
  kind: TouchKind;
  side: TouchSide;
  /** A short sentence without the name: "opened the job", "added proposal.docx". */
  what: string;
}

export interface DriveFolderTouch { at: string; name: string; who?: string; removed?: boolean; added?: boolean }

export interface TouchSources {
  jobs: Apartment[];
  logs?: ActivityLog[];
  assignments?: ContractorAssignment[];
  notes?: ContractorNote[];
  photos?: ContractorPhoto[];
  annotations?: PlanAnnotation[];
  pins?: PlanPin[];
  /** The board's elements — the weekly notebooks are read out of them. */
  elements?: CanvasElement[];
  contractors?: Contractor[];
  /** Job folder id → the newest Drive changes inside it (driveActivity.ts). */
  drive?: Record<string, { touches?: DriveFolderTouch[]; at?: string; name?: string; who?: string; removed?: boolean; added?: boolean }>;
}

export const KIND_SIDE: Record<TouchKind, TouchSide> = {
  opened: 'office', edited: 'office', task: 'office', message: 'office', photo: 'site',
  plan: 'office', notebook: 'notebook', drive: 'drive',
};

const dayMs = 86400000;

/** A job the sweep or the import COPIED IN and nobody has touched since. */
export function copiedIn(j: Apartment): boolean {
  return /^G-(auto|imp)-/.test(j.id) && !!j.contentUpdatedAt && j.contentUpdatedAt === j.createdAt;
}

function folderIdOf(link?: string | null): string | null {
  return link?.match(/folders\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

/** Every touch inside the window, unsorted. */
export function touchesOf(src: TouchSources, now: number, days: number): Touch[] {
  const cut = new Date(now - days * dayMs).toISOString();
  const jobIds = new Set(src.jobs.map(j => j.id));
  const out: Touch[] = [];
  const push = (jobId: string | undefined, at: string | undefined | null, who: string | undefined, kind: TouchKind, what: string, side?: TouchSide) => {
    if (!jobId || !at || at < cut || !jobIds.has(jobId)) return;
    out.push({ jobId, at, who: (who || '').trim() || 'Someone', kind, side: side ?? KIND_SIDE[kind], what });
  };
  const nameOf = (id?: string) => src.contractors?.find(c => c.id === id)?.name;

  for (const j of src.jobs) {
    if (!copiedIn(j)) push(j.id, j.contentUpdatedAt, j.updatedByName, 'edited', 'edited the job');
  }
  for (const l of src.logs ?? []) {
    if (l.actionType === 'opened') { push(l.apartmentId, l.createdAt, l.userName, 'opened', 'opened the job'); continue; }
    const what = l.fieldChanged === 'currentStageId' ? `stage → ${l.newValue || 'not started'}`
      : l.fieldChanged === 'generalNotes' ? 'added a note'
      : l.fieldChanged === 'problem' ? 'raised a problem'
      : l.fieldChanged === 'displayName' ? 'renamed the job'
      : l.actionType === 'contractor_assigned' ? 'assigned a task'
      : 'updated the job';
    push(l.apartmentId, l.createdAt, l.userName, l.fieldChanged === 'problem' ? 'task' : 'edited', what);
  }
  for (const a of src.assignments ?? []) {
    const worker = nameOf(a.contractorId);
    push(a.apartmentId, a.createdAt, a.createdByName, 'task', a.problem ? 'raised a problem' : 'made a task');
    if (a.problem?.closedAt) push(a.apartmentId, a.problem.closedAt, worker, 'task', 'closed the problem, waiting for approval', 'site');
    if (a.problem?.approvedAt) push(a.apartmentId, a.problem.approvedAt, a.problem.approvedBy, 'task', 'approved the fix');
    if (a.completedAt && !a.problem) push(a.apartmentId, a.completedAt, worker, 'task', 'closed the task', 'site');
  }
  for (const n of src.notes ?? []) {
    const site = n.authorType === 'contractor';
    const memo = /^audio\//.test(n.attachmentMimeType ?? '') || /\.(webm|m4a|mp3|ogg|wav)$/i.test(n.attachmentFilename ?? '');
    push(n.apartmentId, n.createdAt, n.authorName, 'message', memo ? (site ? 'voice memo from site' : 'sent a voice memo') : (site ? 'message from site' : 'sent a message'), site ? 'site' : 'office');
  }
  for (const p of src.photos ?? []) {
    const isVideo = p.fileType === 'video';
    push(p.apartmentId, p.uploadedAt, nameOf(p.contractorId), 'photo', isVideo ? 'video from site' : 'photo from site');
  }
  for (const m of src.annotations ?? []) push(m.apartmentId, m.createdAt, m.createdBy, 'plan', `marked up the plan (v${m.version})`);
  for (const pin of src.pins ?? []) {
    push(pin.apartmentId, pin.createdAt, pin.createdBy, 'plan', 'placed a punch-list pin');
    if (pin.resolvedAt) push(pin.apartmentId, pin.resolvedAt, pin.resolvedBy, 'plan', 'resolved a pin');
  }
  // The notebook: a square carries no clock, so its entries are dated by the
  // DAY they sit on (the approved rule) — a job planned for Tuesday was
  // planned, and Tuesday is the honest date the sheet has.
  for (const el of src.elements ?? []) {
    if (el.type !== 'widget' || el.widget !== 'rota' || (el.data as { role?: string } | undefined)?.role === 'projection') continue;
    const cells = ((el.data as { cells?: Record<string, { jobId?: string; projectId?: string; at?: string }[]> } | undefined)?.cells) ?? {};
    for (const [key, entries] of Object.entries(cells)) {
      const day = key.split('|')[1];
      if (!day || !Array.isArray(entries)) continue;
      // An entry written since the stamp exists says when it was planned. An
      // older one is dated by the day it sits on — and a day still AHEAD was
      // planned before now, so it is dated a day back rather than in the
      // future, or tomorrow's square would outrank everything that happened.
      const dayAt = Date.parse(`${day}T12:00:00.000Z`);
      const legacyAt = new Date(!Number.isFinite(dayAt) ? now : dayAt > now ? now - dayMs : dayAt).toISOString();
      for (const e of entries) {
        if (!e?.jobId || e.projectId) continue;
        push(e.jobId, e.at ?? legacyAt, personLabel(key.split('|')[0], src.contractors), 'notebook', `in the notebook on ${niceDay(day)}`);
      }
    }
  }
  if (src.drive) {
    for (const j of src.jobs) {
      const fid = folderIdOf(j.driveLink);
      const f = fid ? src.drive[fid] : undefined;
      if (!f) continue;
      const list = f.touches?.length ? f.touches : (f.at ? [{ at: f.at, name: f.name ?? '', who: f.who, removed: f.removed }] : []);
      for (const t of list) {
        const verb = t.removed ? 'removed' : t.added ? 'added' : 'changed';
        // With a name: "Moshe · Drive · added X". Without one, Drive itself
        // is the who: "Drive · added X" — never "Drive · Drive · X".
        push(j.id, t.at, t.who || 'Drive', 'drive', t.who ? `Drive · ${verb} ${t.name}` : `${verb} ${t.name}`);
      }
    }
  }
  return out;
}

function personLabel(personKey: string, contractors?: Contractor[]): string {
  const [kind, id] = [personKey.slice(0, 1), personKey.slice(2)];
  if (kind === 'c') return contractors?.find(c => c.id === id)?.name ?? 'a worker';
  if (kind === 'n') return id;
  return 'the office';
}

function niceDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export interface JobHeat {
  last: Touch;
  count: number;
  kinds: TouchKind[];
  /** Busiest-first score: every touch adds a point that fades over the window. */
  score: number;
}

/** Per job: the newest touch, how many, which kinds — and the decayed score. */
export function foldByJob(touches: Touch[], now: number, days: number, filter: TouchFilter = 'all'): Map<string, JobHeat> {
  const m = new Map<string, JobHeat>();
  const span = Math.max(1, days * dayMs);
  for (const t of touches) {
    if (filter !== 'all' && t.side !== filter) continue;
    const age = Math.max(0, now - Date.parse(t.at));
    const pt = Math.max(0.05, 1 - age / span);
    const cur = m.get(t.jobId);
    if (!cur) { m.set(t.jobId, { last: t, count: 1, kinds: [t.kind], score: pt }); continue; }
    cur.count++; cur.score += pt;
    if (!cur.kinds.includes(t.kind)) cur.kinds.push(t.kind);
    if (t.at > cur.last.at) cur.last = t;
  }
  return m;
}

export type TouchSort = 'newest' | 'busiest';

/** Job ids in the order the widget draws them. */
export function rankJobs(fold: Map<string, JobHeat>, sort: TouchSort): string[] {
  const ids = [...fold.keys()];
  if (sort === 'busiest') return ids.sort((a, b) => fold.get(b)!.score - fold.get(a)!.score || fold.get(b)!.last.at.localeCompare(fold.get(a)!.last.at));
  return ids.sort((a, b) => fold.get(b)!.last.at.localeCompare(fold.get(a)!.last.at));
}

/** Who is booked on each job THIS WEEK (Sunday to Saturday around `now`). */
export function bookedThisWeek(assignments: ContractorAssignment[], contractors: Contractor[], now: number): Map<string, { who: string; day: string }> {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const s = iso(start), e = iso(end);
  const out = new Map<string, { who: string; day: string }>();
  for (const a of assignments) {
    if (a.completedAt || !a.apartmentId) continue;
    const days = a.days?.length ? a.days : (a.dueDate ? [a.dueDate] : []);
    const hit = days.find(x => x >= s && x < e);
    if (!hit) continue;
    const who = contractors.find(c => c.id === a.contractorId)?.name;
    if (!who) continue;
    const cur = out.get(a.apartmentId);
    if (!cur || hit < cur.day) out.set(a.apartmentId, { who, day: hit });
  }
  return out;
}
